/**
 * Combat system: tower targeting, projectile flight, on-hit damage and effects.
 *
 * Towers fire whenever they have a target in range and their cooldown is up.
 * Projectiles travel at a fixed pixel speed; on impact they apply the tower's
 * damage range and effect strategies to the target (and surrounding creeps
 * for splash, neighbors for chain, etc.).
 */

import { TILE, FINE_TILE, GRID_SCALE, SIM_DT, SIM_HZ } from "../game/constants";
import { nearestPathPos } from "./Pathfinding";
import { Game } from "../game/Game";
import { RNG } from "../game/rng";
import { gemStats } from "../data/gems";
import { COMBO_BY_NAME, comboStatsAtTier } from "../data/combos";
import {
  creepDeathMetrics,
  type CreepState,
  type ProjectileState,
  type TowerState,
} from "../game/State";
import type { EffectKind } from "../data/gems";

const PROJECTILE_PX_PER_SEC = 480;

/** Pivot speed for Golden Beryl's speed_damage_aura. Per-tick damage scales
 *  with speed² normalised at this value (≈ the run-wide average creep speed),
 *  so the aura rewards fast creeps and penalises slow ones while keeping the
 *  population-weighted total roughly unchanged (time-in-aura ∝ 1/speed, which
 *  would otherwise cancel a single power of speed). */
const SPEED_DMG_PIVOT = 1.7;

export function armorDamageMultiplier(armor: number): number {
  if (armor >= 0) return 1 / (1 + armor * 0.06);
  const neg = Math.min(-armor, 10);
  return 2 - Math.pow(0.94, neg);
}

export class Combat {
  /** Current-tick aura mults + source lists, set before the fire loop so
   *  fire-time assist attribution (dmg-aura, atk-speed) can reach the sources. */
  private auras: AuraMults | null = null;
  /** Per-tick id→entity indexes, rebuilt at the top of step(). Kept off State
   *  (State stays JSON-clean) and replace the O(N) towers/creeps Array.find
   *  lookups the DoT/projectile/assist paths used to do every tick. */
  private readonly towersById = new Map<number, TowerState>();
  private readonly creepsById = new Map<number, CreepState>();

  constructor(private game: Game) {}

  /** Tower lookup by id — O(1) via the per-tick index, with an array fallback
   *  for callers that reach the assist/credit paths outside step() (unit tests,
   *  and any future direct caller) where the index hasn't been built this tick. */
  private towerById(id: number): TowerState | undefined {
    return (
      this.towersById.get(id) ??
      this.game.state.towers.find((t) => t.id === id)
    );
  }

  step(): void {
    const state = this.game.state;
    const tick = state.tick;

    // Rebuild id→entity indexes once per tick (towers/creeps are stable within a
    // step) so the lookups below are O(1) instead of Array.find over all entities.
    this.towersById.clear();
    for (const t of state.towers) this.towersById.set(t.id, t);
    this.creepsById.clear();
    for (const c of state.creeps) this.creepsById.set(c.id, c);

    // Reset and recompute proximity auras each tick.
    if (state.phase === "wave") {
      for (const c of state.creeps)
        if (c.alive) {
          c.armorReduction = 0;
          c.proxSlowFactor = undefined;
          c.vulnerability = 0;
          c.armorReductionSources = undefined;
          c.vulnSources = undefined;
        }
      const inBurnAura = this.applyProximityAuras(state.towers, state.creeps);

      // Linger burn + armor stack decay processing (after proximity auras)
      for (const c of state.creeps) {
        if (!c.alive) continue;
        if (
          c.lingerBurn &&
          c.lingerBurn.ticksLeft > 0 &&
          !inBurnAura.has(c.id)
        ) {
          const owner = this.towersById.get(c.lingerBurn!.ownerId);
          if (owner) {
            const dmg = Math.max(1, Math.round(c.lingerBurn.dps / SIM_HZ));
            this.applyDamage(c, dmg, owner);
          }
          c.lingerBurn.ticksLeft--;
          if (c.lingerBurn.ticksLeft <= 0) c.lingerBurn = undefined;
        }
        if (c.afterburn && c.afterburn.expiresAt > tick) {
          if (tick >= c.afterburn.nextTick) {
            const owner = this.towersById.get(c.afterburn!.ownerId);
            if (owner) {
              this.applyDamage(
                c,
                Math.max(1, Math.round(c.afterburn.dps)),
                owner,
              );
            }
            c.afterburn.nextTick = tick + SIM_HZ;
          }
        } else if (c.afterburn) {
          c.afterburn = undefined;
        }
        if (c.poison && c.poison.expiresAt > tick) {
          if (tick >= c.poison.nextTick) {
            const poisonDmg = Math.max(
              1,
              Math.round(c.poison.dps * (1 - c.poisonResist)),
            );
            const owner = this.towersById.get(c.poison!.ownerId);
            if (!owner) {
              c.poison = undefined;
            } else {
              this.applyDamage(c, poisonDmg, owner);
              c.poison.nextTick = tick + SIM_HZ;
            }
          }
        }
        if (c.armorStacks && c.armorStacks.count > 0) {
          if (tick - c.armorStacks.lastDecayTick >= c.armorStacks.decayTicks) {
            c.armorStacks.count--;
            c.armorStacks.lastDecayTick = tick;
            if (c.armorStacks.count <= 0) c.armorStacks = undefined;
          }
        }
      }
    }

    // Towers fire (only during waves). Traps are handled by the Traps system.
    if (state.phase === "wave") {
      const auras = computeAuraMults(state.towers, tick);
      this.auras = auras;
      for (const t of state.towers) {
        if (t.isTrap) continue;
        const stats = effectiveStats(t);
        // Passive burn towers don't fire projectiles.
        if (
          stats.effects.some(
            (e) =>
              e.kind === "prox_burn" ||
              e.kind === "prox_burn_ramp" ||
              e.kind === "speed_damage_aura",
          )
        )
          continue;
        const atkMult = auras.atkSpeed.get(t.id) ?? 0;
        // Momentum: scale attack speed with stacks
        const momentumEffect = stats.effects.find(
          (e): e is Extract<EffectKind, { kind: "momentum" }> =>
            e.kind === "momentum",
        );
        let effectiveAtkSpeed = stats.atkSpeed * (1 + atkMult);
        if (momentumEffect && t.momentumStacks) {
          const frac = t.momentumStacks / momentumEffect.maxStacks;
          effectiveAtkSpeed *= 1 + (momentumEffect.rampSpeed - 1) * frac;
        }
        const cooldownTicks = Math.max(
          1,
          Math.round(SIM_HZ / effectiveAtkSpeed),
        );
        if (tick - t.lastFireTick < cooldownTicks) continue;
        const beamEffect = stats.effects.find(
          (e): e is Extract<EffectKind, { kind: "beam_ramp" }> =>
            e.kind === "beam_ramp",
        );
        const multiEffect = stats.effects.find(
          (e): e is Extract<EffectKind, { kind: "multi_target" }> =>
            e.kind === "multi_target",
        );
        const demoteEffect = stats.effects.find(
          (e): e is Extract<EffectKind, { kind: "demote_air" }> =>
            e.kind === "demote_air",
        );
        const adaptiveEffect = stats.effects.find(
          (e): e is Extract<EffectKind, { kind: "adaptive_mode" }> =>
            e.kind === "adaptive_mode",
        );
        if (adaptiveEffect) {
          const inRange = pickTargets(
            t,
            stats.range,
            state.creeps,
            stats.targeting,
            tick,
            Infinity,
          );
          if (inRange.length === 0) continue;
          const prevFireTickA = t.lastFireTick;
          t.lastFireTick = tick;
          const dmgMult = auras.dmg.get(t.id) ?? 0;
          const desiredMode: "focus" | "scatter" =
            inRange.length >= adaptiveEffect.threshold ? "scatter" : "focus";
          const cooldownTicks = adaptiveEffect.modeCooldown
            ? Math.round(SIM_HZ * adaptiveEffect.modeCooldown)
            : 0;
          const canSwitch =
            !t.ametrineMode ||
            cooldownTicks <= 0 ||
            tick - (t.lastModeSwitchTick ?? -cooldownTicks) >= cooldownTicks;
          const mode =
            desiredMode !== t.ametrineMode && !canSwitch
              ? t.ametrineMode!
              : desiredMode;
          if (mode !== t.ametrineMode) {
            t.ametrineMode = mode;
            t.lastModeSwitchTick = tick;
          }
          if (mode === "scatter") {
            const targets = inRange.slice(0, adaptiveEffect.scatterCount);
            for (const tgt of targets)
              this.fire(
                t,
                tgt,
                stats,
                dmgMult,
                false,
                adaptiveEffect.scatterDmgMult,
                prevFireTickA,
              );
          } else {
            this.fire(t, inRange[0], stats, dmgMult, false, 1, prevFireTickA);
          }
        } else if (multiEffect) {
          const targets = pickTargets(
            t,
            stats.range,
            state.creeps,
            stats.targeting,
            tick,
            multiEffect.count,
          );
          if (targets.length === 0) continue;
          const prevFireTickM = t.lastFireTick;
          t.lastFireTick = tick;
          const dmgMult = auras.dmg.get(t.id) ?? 0;
          for (const tgt of targets)
            this.fire(t, tgt, stats, dmgMult, false, 1, prevFireTickM);
        } else {
          const target = pickTarget(
            t,
            stats.range,
            state.creeps,
            stats.targeting,
            tick,
            stats.targetPriority,
          );
          if (!target) {
            if (beamEffect) t.beam = undefined;
            // Momentum: reset stacks after grace period (2x base cooldown)
            if (momentumEffect && t.momentumStacks) {
              const baseCooldown = Math.round(SIM_HZ / stats.atkSpeed);
              if (tick - t.lastFireTick > baseCooldown * 2)
                t.momentumStacks = 0;
            }
            continue;
          }
          const prevFireTick = t.lastFireTick;
          t.lastFireTick = tick;
          const dmgMult = auras.dmg.get(t.id) ?? 0;

          const novaEffect = stats.effects.find(
            (e): e is Extract<EffectKind, { kind: "periodic_nova" }> =>
              e.kind === "periodic_nova",
          );
          if (novaEffect) {
            t.attackCount = (t.attackCount ?? 0) + 1;
            if (t.attackCount % novaEffect.everyN === 0) {
              const allTargets = pickTargets(
                t,
                stats.range,
                state.creeps,
                stats.targeting,
                tick,
                Infinity,
              );
              for (const tgt of allTargets)
                this.fire(t, tgt, stats, dmgMult, false, 0.5, prevFireTick);
              this.game.bus.emit("vfx:nova", {
                x: (t.x + 1) * FINE_TILE,
                y: (t.y + 1) * FINE_TILE,
                rangePx: stats.range * TILE,
              });
            } else {
              this.fire(t, target, stats, dmgMult, false, 1, prevFireTick);
            }
          } else if (demoteEffect) {
            t.attackCount = (t.attackCount ?? 0) + 1;
            this.fire(
              t,
              target,
              stats,
              dmgMult,
              t.attackCount % demoteEffect.everyN === 0,
              1,
              prevFireTick,
            );
          } else if (beamEffect) {
            this.beamHit(t, target, stats, beamEffect, dmgMult);
            const hasOnHitEffects = stats.effects.some(
              (e) =>
                e.kind === "slow" || e.kind === "poison" || e.kind === "stun",
            );
            if (hasOnHitEffects)
              this.fire(t, target, stats, dmgMult, false, 1, prevFireTick);
          } else {
            this.fire(t, target, stats, dmgMult, false, 1, prevFireTick);
          }
          // Momentum: increment stacks after firing
          if (momentumEffect) {
            t.momentumStacks = Math.min(
              (t.momentumStacks ?? 0) + 1,
              momentumEffect.maxStacks,
            );
          }
          this.checkEruption(t, stats);
        }
      }
    }

    // Project projectiles.
    for (const p of state.projectiles) {
      if (!p.alive) continue;
      const dx = p.toX - p.fromX;
      const dy = p.toY - p.fromY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = (p.speed / Math.max(1, dist)) * SIM_DT;
      p.t += dt;
      if (p.t >= 1) {
        p.alive = false;
        this.impact(p);
      }
    }
    let write = 0;
    for (let i = 0; i < state.projectiles.length; i++) {
      if (state.projectiles[i].alive)
        state.projectiles[write++] = state.projectiles[i];
    }
    state.projectiles.length = write;
  }

  private beamHit(
    tower: TowerState,
    target: CreepState,
    stats: ResolvedStats,
    beam: Extract<EffectKind, { kind: "beam_ramp" }>,
    dmgAuraMult: number,
  ): void {
    if (tower.beam && tower.beam.targetId === target.id) {
      tower.beam.stacks = Math.min(tower.beam.stacks + 1, beam.maxStacks);
    } else {
      tower.beam = { targetId: target.id, stacks: 0 };
    }
    const baseDmg = randInt(this.game.rng, stats.dmgMin, stats.dmgMax);
    const rampMult = 1 + tower.beam.stacks * beam.rampPerHit;
    const dmg = Math.round(baseDmg * rampMult * (1 + dmgAuraMult));
    this.applyDamage(target, dmg, tower);
    this.creditFireAssist(tower, dmg, dmgAuraMult);
    this.rollBonusGold(tower, target, stats);
    this.game.bus.emit("tower:fire", { id: tower.id, targetId: target.id });
  }

  private checkEruption(tower: TowerState, stats: ResolvedStats): void {
    const eruption = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "eruption" }> =>
        e.kind === "eruption",
    );
    if (!eruption) return;
    tower.pressureStacks = (tower.pressureStacks ?? 0) + 1;
    if (tower.pressureStacks < eruption.threshold) return;
    tower.pressureStacks = 0;

    const state = this.game.state;
    const tick = state.tick;
    const tx = (tower.x + 1) * FINE_TILE;
    const ty = (tower.y + 1) * FINE_TILE;
    const maxDist = eruption.radius * TILE;
    const maxDist2 = maxDist * maxDist;

    for (const c of state.creeps) {
      if (!c.alive || isBurrowed(c, tick)) continue;
      const dx = c.px - tx,
        dy = c.py - ty;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > maxDist2) continue;
      const dist = Math.sqrt(dist2);
      const t = dist / maxDist;
      const dmgMult = 1 - (1 - eruption.falloff) * t;
      const dmg = Math.round(eruption.damage * dmgMult);
      this.applyDamage(c, dmg, tower);
      if (eruption.afterburnDps && eruption.afterburnDuration) {
        const expiresAt =
          tick + Math.round(eruption.afterburnDuration * SIM_HZ);
        if (!c.afterburn || c.afterburn.dps <= eruption.afterburnDps) {
          c.afterburn = {
            dps: eruption.afterburnDps,
            expiresAt,
            nextTick: tick + SIM_HZ,
            ownerId: tower.id,
          };
        } else {
          c.afterburn.expiresAt = expiresAt;
        }
      }
    }
    this.game.bus.emit("vfx:eruption", { x: tx, y: ty, radiusPx: maxDist });
  }

  private fire(
    tower: TowerState,
    target: CreepState,
    stats: ResolvedStats,
    dmgAuraMult = 0,
    demoteShot = false,
    baseDmgMult = 1,
    prevFireTick = 0,
  ): void {
    const state = this.game.state;
    const fromX = (tower.x + 1) * FINE_TILE;
    const fromY = (tower.y + 1) * FINE_TILE;
    const baseDmg = randInt(this.game.rng, stats.dmgMin, stats.dmgMax);
    let dmg = Math.round(baseDmg * baseDmgMult * (1 + dmgAuraMult));

    // Distance scaling: damage multiplier based on distance to target
    const distScale = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "distance_scaling" }> =>
        e.kind === "distance_scaling",
    );
    if (distScale) {
      const dx = target.px - fromX,
        dy = target.py - fromY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = stats.range * TILE;
      const t = Math.min(1, dist / maxDist);
      dmg = Math.round(
        dmg * (distScale.minMult + (distScale.maxMult - distScale.minMult) * t),
      );
    }

    // Charge burst: scale damage based on idle time since last fire
    const chargeBurst = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "charge_burst" }> =>
        e.kind === "charge_burst",
    );
    if (chargeBurst && prevFireTick > 0) {
      const idleTicks = state.tick - prevFireTick;
      const chargeFraction = Math.min(
        1,
        idleTicks / (chargeBurst.chargeSeconds * SIM_HZ),
      );
      const chargeMult = 1 + (chargeBurst.maxMultiplier - 1) * chargeFraction;
      dmg = Math.round(dmg * chargeMult);
    }

    // Momentum: scale damage with current stacks
    const momentumEffect = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "momentum" }> =>
        e.kind === "momentum",
    );
    if (momentumEffect && momentumEffect.rampDmg && tower.momentumStacks) {
      const frac = tower.momentumStacks / momentumEffect.maxStacks;
      dmg = Math.round(dmg * (1 + (momentumEffect.rampDmg - 1) * frac));
    }

    // Focus crit: track target and accumulate bonus crit chance
    const focusCrit = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "focus_crit" }> =>
        e.kind === "focus_crit",
    );
    if (focusCrit) {
      if (tower.focusTarget && tower.focusTarget.creepId === target.id) {
        const maxStacks = Math.round(focusCrit.maxBonus / focusCrit.pctPerHit);
        tower.focusTarget.stacks = Math.min(
          tower.focusTarget.stacks + 1,
          maxStacks,
        );
      } else {
        tower.focusTarget = { creepId: target.id, stacks: 0 };
      }
    }

    let wasCrit = false;
    for (const e of stats.effects) {
      if (e.kind === "crit") {
        let chance = e.chance;
        if (focusCrit && tower.focusTarget) {
          chance += tower.focusTarget.stacks * focusCrit.pctPerHit;
        }
        if (this.game.rng.next() < chance) {
          dmg = Math.round(dmg * e.multiplier);
          wasCrit = true;
        }
      }
      if (e.kind === "air_bonus" && target.flags?.air) {
        dmg = Math.round(dmg * e.multiplier);
      }
    }

    // Execute: bonus damage below HP threshold (after crit)
    const execute = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "execute" }> =>
        e.kind === "execute",
    );
    if (execute && target.hp / target.maxHp < execute.hpThreshold) {
      dmg = Math.round(dmg * (1 + execute.dmgBonus));
    }

    // Stun bonus: extra damage to stunned creeps
    const stunBonus = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "stun_bonus_dmg" }> =>
        e.kind === "stun_bonus_dmg",
    );
    if (stunBonus && target.stun && target.stun.expiresAt > state.tick) {
      dmg = Math.round(dmg * stunBonus.multiplier);
    }

    const speed = stats.projectileSpeed ?? PROJECTILE_PX_PER_SEC;
    const toX = target.px;
    const toY = target.py;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const pierceEffect = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "pierce" }> => e.kind === "pierce",
    );
    const killExplodeEffect = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "kill_explode" }> =>
        e.kind === "kill_explode",
    );

    const proj: ProjectileState = {
      id: this.game.nextId(),
      fromX,
      fromY,
      toX,
      toY,
      targetId: target.id,
      t: 0,
      speed,
      damage: dmg,
      ownerTowerId: tower.id,
      color: stats.visualGem,
      alive: true,
      wasCrit: wasCrit || undefined,
      isDemoteShot: demoteShot || undefined,
      isGroundTarget: stats.groundTarget || undefined,
      arcHeight: stats.groundTarget ? Math.max(20, dist * 0.3) : undefined,
      pierceCount: pierceEffect?.count,
      killExplode: killExplodeEffect
        ? {
            radius: killExplodeEffect.radius,
            falloff: killExplodeEffect.falloff,
          }
        : undefined,
    };
    this.creditFireAssist(tower, dmg, dmgAuraMult);
    state.projectiles.push(proj);
    this.game.bus.emit("tower:fire", { id: tower.id, targetId: target.id });
  }

  private impact(p: ProjectileState): void {
    const state = this.game.state;
    const owner = this.towersById.get(p.ownerTowerId);
    if (!owner) return;
    const stats = effectiveStats(owner);
    const tc = this.creepsById.get(p.targetId);
    const target = tc && tc.alive ? tc : undefined;
    const tick = state.tick;

    // Ground-target (mortar): splash at landing position, no direct hit
    if (p.isGroundTarget) {
      const splashEffect = stats.effects.find(
        (e): e is Extract<EffectKind, { kind: "splash" }> =>
          e.kind === "splash",
      );
      const radius = splashEffect ? splashEffect.radius * TILE : 1.5 * TILE;
      const falloff = splashEffect?.falloff ?? 0.5;
      const r2 = radius * radius;
      for (const c of state.creeps) {
        if (!c.alive || isBurrowed(c, tick)) continue;
        if (!canTarget(stats.targeting, c)) continue;
        const dx = c.px - p.toX;
        const dy = c.py - p.toY;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;
        const dist = Math.sqrt(dist2);
        const t = dist / radius;
        const dmgMult = 1 - (1 - falloff) * t;
        const dmg = Math.round(p.damage * dmgMult);
        this.applyDamage(c, dmg, owner);
      }
      this.game.bus.emit("vfx:groundImpact", {
        x: p.toX,
        y: p.toY,
        radiusPx: radius,
      });
      return;
    }

    // Direct hit (skip burrowed targets — projectile misses)
    if (target && !isBurrowed(target, tick)) {
      const hpBefore = target.hp;
      this.applyDamage(target, p.damage, owner);
      this.applyEffects(target, stats.effects, owner);
      this.rollBonusGold(owner, target, stats);
      if (p.isDemoteShot && target.flags?.air) {
        target.flags.air = false;
        owner.attackCount = 0;
        const route = state.flatRoute;
        if (route.length > 0) {
          target.pathPos = Math.min(
            nearestPathPos(target.px, target.py, route, FINE_TILE),
            route.length - 2,
          );
        }
        this.game.bus.emit("creep:demoted", { id: target.id });
      }
      // Kill explosion: AoE at death position when target dies from this hit
      if (p.killExplode && hpBefore > 0 && !target.alive) {
        const r = p.killExplode.radius * TILE;
        const r2 = r * r;
        for (const c of state.creeps) {
          if (!c.alive || c === target || isBurrowed(c, tick)) continue;
          if (!canTarget(stats.targeting, c)) continue;
          const ddx = c.px - target.px,
            ddy = c.py - target.py;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > r2) continue;
          const dist = Math.sqrt(d2);
          const dmgMult = 1 - (1 - p.killExplode.falloff) * (dist / r);
          this.applyDamage(c, Math.round(p.damage * dmgMult), owner);
        }
        this.game.bus.emit("vfx:killExplode", {
          x: target.px,
          y: target.py,
          radiusPx: r,
        });
      }
      // Pierce: continue to next creep in line behind the target
      if (p.pierceCount && p.pierceCount > 0) {
        const fromX = (owner.x + 1) * FINE_TILE;
        const fromY = (owner.y + 1) * FINE_TILE;
        const dirX = target.px - fromX;
        const dirY = target.py - fromY;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
        if (dirLen > 0) {
          const nx = dirX / dirLen,
            ny = dirY / dirLen;
          let bestCreep: CreepState | null = null;
          let bestDot = 0;
          for (const c of state.creeps) {
            if (!c.alive || c === target || isBurrowed(c, tick)) continue;
            if (!canTarget(stats.targeting, c)) continue;
            const cx = c.px - target.px,
              cy = c.py - target.py;
            const dot = cx * nx + cy * ny;
            if (dot <= 0) continue;
            const perpDist = Math.abs(cx * ny - cy * nx);
            if (perpDist > TILE * 1.5) continue;
            if (!bestCreep || dot < bestDot) {
              bestCreep = c;
              bestDot = dot;
            }
          }
          if (bestCreep) {
            const pierceProj: ProjectileState = {
              id: this.game.nextId(),
              fromX: target.px,
              fromY: target.py,
              toX: bestCreep.px,
              toY: bestCreep.py,
              targetId: bestCreep.id,
              t: 0,
              speed: p.speed,
              damage: p.damage,
              ownerTowerId: owner.id,
              color: p.color,
              alive: true,
              pierceCount: p.pierceCount - 1,
              killExplode: p.killExplode,
            };
            state.projectiles.push(pierceProj);
            this.game.bus.emit("vfx:pierce", {
              x: target.px,
              y: target.py,
              dirX: nx,
              dirY: ny,
            });
          }
        }
      }
    }

    // Splash — collect targets for freeze_chance / stacking_armor_reduce
    const splashTargets: CreepState[] = [];
    for (const e of stats.effects) {
      if (e.kind === "splash") {
        if (e.chance != null && this.game.rng.next() >= e.chance) continue;
        for (const c of state.creeps) {
          if (!c.alive) continue;
          if (c === target) continue;
          if (isBurrowed(c, tick)) continue;
          const dx = c.px - p.toX;
          const dy = c.py - p.toY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= e.radius * TILE) {
            const fall = e.falloff ?? 0.5;
            const splashDmg = Math.round(p.damage * fall);
            this.applyDamage(c, splashDmg, owner);
            splashTargets.push(c);
          }
        }
      } else if (e.kind === "chain" && target) {
        let last = target;
        let dmg = p.damage;
        const hit = new Set<number>([target.id]);
        const chainPoints = [{ x: target.px, y: target.py, id: target.id }];
        for (let i = 0; i < e.bounces; i++) {
          dmg = Math.round(dmg * e.falloff);
          const next = nearest(
            state.creeps,
            last.px,
            last.py,
            hit,
            stats.range * TILE,
            tick,
          );
          if (!next) break;
          this.applyDamage(next, dmg, owner);
          this.applyEffects(
            next,
            stats.effects.filter((ee) => ee.kind !== "chain"),
            owner,
          );
          hit.add(next.id);
          chainPoints.push({ x: next.px, y: next.py, id: next.id });
          last = next;
        }
        if (chainPoints.length > 1) {
          this.game.bus.emit("vfx:chainPulse", { points: chainPoints });
        }
      } else if (e.kind === "amplifying_chain" && target) {
        let last = target;
        let dmg = p.damage;
        const hit = new Set<number>([target.id]);
        const chainPoints = [{ x: target.px, y: target.py, id: target.id }];
        for (let i = 0; i < e.bounces; i++) {
          dmg = Math.round(dmg * (1 + e.ampPerBounce));
          const next = nearest(
            state.creeps,
            last.px,
            last.py,
            hit,
            stats.range * TILE,
            tick,
          );
          if (!next) break;
          this.applyDamage(next, dmg, owner);
          this.applyEffects(
            next,
            stats.effects.filter((ee) => ee.kind !== "amplifying_chain"),
            owner,
          );
          hit.add(next.id);
          chainPoints.push({ x: next.px, y: next.py, id: next.id });
          last = next;
        }
        if (chainPoints.length > 1) {
          this.game.bus.emit("vfx:chainPulse", { points: chainPoints });
        }
      }
    }

    // Crit splash: on crit, deal splash damage around impact (no on-hit effects)
    if (p.wasCrit) {
      const critSplash = stats.effects.find(
        (e): e is Extract<EffectKind, { kind: "crit_splash" }> =>
          e.kind === "crit_splash",
      );
      if (critSplash) {
        for (const c of state.creeps) {
          if (!c.alive || c === target || isBurrowed(c, tick)) continue;
          const dx = c.px - p.toX;
          const dy = c.py - p.toY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= critSplash.radius * TILE) {
            const splashDmg = Math.round(p.damage * critSplash.falloff);
            this.applyDamage(c, splashDmg, owner);
          }
        }
        this.game.bus.emit("vfx:critSplash", {
          x: p.toX,
          y: p.toY,
          radiusPx: critSplash.radius * TILE,
        });
      }
    }

    // Freeze chance on splash targets
    const freezeChance = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "freeze_chance" }> =>
        e.kind === "freeze_chance",
    );
    if (freezeChance && splashTargets.length > 0) {
      for (const c of splashTargets) {
        if (!c.alive) continue;
        if (this.game.rng.next() < freezeChance.chance) {
          const expires =
            tick +
            Math.max(
              1,
              Math.round(freezeChance.duration * SIM_HZ * (1 - c.stunResist)),
            );
          if (!c.stun || c.stun.expiresAt < expires) {
            c.stun = { expiresAt: expires };
            this.game.bus.emit("vfx:freezeProc", { x: c.px, y: c.py });
          }
        }
      }
    }

    // Stacking armor reduce on primary + splash targets
    const stackEffect = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "stacking_armor_reduce" }> =>
        e.kind === "stacking_armor_reduce",
    );
    if (stackEffect) {
      const allHit =
        target && target.alive ? [target, ...splashTargets] : splashTargets;
      for (const c of allHit) {
        if (!c.alive) continue;
        if (c.armorStacks) {
          if (c.armorStacks.count < stackEffect.maxStacks) {
            c.armorStacks.count++;
            c.armorStacks.lastDecayTick = tick;
          }
        } else {
          c.armorStacks = {
            count: 1,
            armorPer: stackEffect.perHit,
            decayTicks: Math.round(stackEffect.decayInterval * SIM_HZ),
            lastDecayTick: tick,
            ownerId: owner.id,
          };
        }
      }
    }
  }

  applyDamage(
    c: CreepState,
    dmg: number,
    owner: TowerState,
    ignoreArmor = false,
  ): void {
    if (!c.alive) return;
    if (c.chrysalidAwakened) {
      c.chrysalidHitCounter = (c.chrysalidHitCounter ?? 0) + 1;
      if (c.chrysalidHitCounter >= 10) {
        c.chrysalidHitCounter = 0;
        return;
      }
    }
    if (!ignoreArmor && c.flags?.air) {
      const ownerEffects = effectiveStats(owner).effects;
      for (const e of ownerEffects) {
        if (e.kind === "true_vs_air") {
          ignoreArmor = true;
          break;
        }
      }
    }
    const incoming = dmg;
    let armorMultFull = 1;
    let armorMultBase = 1;
    if (!ignoreArmor) {
      let effectiveArmor = c.armor - c.armorReduction;
      if (c.armorDebuff && c.armorDebuff.expiresAt > this.game.state.tick) {
        effectiveArmor -= c.armorDebuff.value;
      }
      if (c.radiationArmor) effectiveArmor -= c.radiationArmor;
      if (c.armorStacks)
        effectiveArmor -= c.armorStacks.count * c.armorStacks.armorPer;
      effectiveArmor = Math.max(effectiveArmor, -10);
      armorMultFull = armorDamageMultiplier(effectiveArmor);
      armorMultBase = armorDamageMultiplier(c.armor);
      if (effectiveArmor !== 0) {
        dmg = Math.round(dmg * armorMultFull);
      }
    }
    if (c.vulnerability > 0) {
      dmg = Math.round(dmg * (1 + c.vulnerability));
    }
    // Support-assist attribution (telemetry only; the dmg dealt below is unchanged).
    this.creditDamageAmpAssist(c, incoming, armorMultBase, armorMultFull);
    const state = this.game.state;
    const weakness = state.gemWeaknesses[state.wave - 1];
    if (weakness) {
      const towerGem = owner.comboKey
        ? COMBO_BY_NAME.get(owner.comboKey)?.visualGem
        : owner.gem;
      if (towerGem === weakness) {
        dmg = Math.round(dmg * 1.5);
      }
    }
    owner.totalDamage += dmg;
    owner.waveDamage += dmg;
    c.hp -= dmg;
    this.game.bus.emit("tower:hit", {
      id: owner.id,
      targetId: c.id,
      damage: dmg,
    });
    if (c.hp <= 0) {
      c.alive = false;
      owner.kills++;
      const state = this.game.state;
      state.gold += c.bounty;
      state.totalKills++;
      state.waveStats.killedThisWave++;
      const { pathProgress, ticksAlive } = creepDeathMetrics(c, state);
      this.game.bus.emit("creep:die", {
        id: c.id,
        kind: c.kind,
        bounty: c.bounty,
        pathProgress,
        ticksAlive,
      });
      this.game.bus.emit("gold:change", { gold: state.gold });
      this.game.handleCreepDeath(c);
    }
  }

  /**
   * Decompose the damage amplification from support effects (armor shred + vulnerability)
   * into per-channel credit and attribute it to the source towers. Telemetry only —
   * `incoming` is the pre-amp damage, the realized dmg is applied by the caller.
   *
   * `final − baseline` is the total assisted damage; we split it between the armor and
   * vuln channels using marginal credits (remove one channel, keep the other) then
   * normalize so the two sum exactly to `final − baseline` (removes the multiplicative
   * interaction double-count). This is an attribution approximation, documented as such.
   */
  private creditDamageAmpAssist(
    c: CreepState,
    incoming: number,
    armorMultBase: number,
    armorMultFull: number,
  ): void {
    const vulnFactor = c.vulnerability > 0 ? 1 + c.vulnerability : 1;
    if (armorMultFull === armorMultBase && vulnFactor === 1) return; // no support amp
    const totalAssist =
      incoming * armorMultFull * vulnFactor - incoming * armorMultBase;
    if (totalAssist <= 0) return;
    const armorRaw = incoming * vulnFactor * (armorMultFull - armorMultBase);
    const vulnRaw = incoming * armorMultFull * (vulnFactor - 1);
    const sumRaw = armorRaw + vulnRaw;
    if (sumRaw <= 0) return;
    const norm = totalAssist / sumRaw;
    if (armorRaw > 0) this.creditArmorShred(c, armorRaw * norm);
    if (vulnRaw > 0) this.creditVuln(c, vulnRaw * norm);
  }

  /** Split armor-shred assist across the four armor-reduction mechanisms' sources,
   *  proportional to each contributor's armor points actually removed. */
  private creditArmorShred(c: CreepState, amount: number): void {
    if (amount <= 0) return;
    const tick = this.game.state.tick;
    const contrib: Array<{ id: number; pts: number }> = [];
    // Proximity reduce: applied value is the max; distribute that max across the
    // recorded sources proportional to their stated value.
    if (c.armorReductionSources && c.armorReduction > 0) {
      const vals = Object.entries(c.armorReductionSources);
      const vsum = vals.reduce((s, [, v]) => s + v, 0) || 1;
      for (const [id, v] of vals)
        contrib.push({ id: +id, pts: c.armorReduction * (v / vsum) });
    }
    if (
      c.armorDebuff &&
      c.armorDebuff.expiresAt > tick &&
      c.armorDebuff.value > 0
    ) {
      contrib.push({ id: c.armorDebuff.ownerId, pts: c.armorDebuff.value });
    }
    // Radiation: applied total is capped; distribute it proportional to per-source accrual.
    if (c.radiationArmorSources && c.radiationArmor) {
      const vals = Object.entries(c.radiationArmorSources);
      const vsum = vals.reduce((s, [, v]) => s + v, 0) || 1;
      for (const [id, v] of vals)
        contrib.push({ id: +id, pts: c.radiationArmor * (v / vsum) });
    }
    if (c.armorStacks && c.armorStacks.count > 0) {
      contrib.push({
        id: c.armorStacks.ownerId,
        pts: c.armorStacks.count * c.armorStacks.armorPer,
      });
    }
    const sum = contrib.reduce((s, x) => s + x.pts, 0);
    if (sum <= 0) return;
    for (const { id, pts } of contrib) {
      const t = this.towerById(id);
      if (t)
        t.armorShredAssist = (t.armorShredAssist ?? 0) + amount * (pts / sum);
    }
  }

  /** Split vulnerability assist across the vuln sources, proportional to their pct. */
  private creditVuln(c: CreepState, amount: number): void {
    if (amount <= 0 || !c.vulnSources) return;
    const vals = Object.entries(c.vulnSources);
    const sum = vals.reduce((s, [, v]) => s + v, 0);
    if (sum <= 0) return;
    for (const [id, v] of vals) {
      const t = this.towerById(+id);
      if (t) t.vulnAssist = (t.vulnAssist ?? 0) + amount * (v / sum);
    }
  }

  /**
   * At fire time, credit the dmg-aura and atk-speed-aura sources that buffed this
   * tower for the share of this shot's damage they enabled, using the
   * proportional-of-realized-damage formula `D * mult/(1+mult)`. Split across multiple
   * sources proportional to their pct. Telemetry only. `dmg` is the shot's pre-armor
   * damage (an approximation — keeps the source list in scope and the math simple).
   */
  private creditFireAssist(
    tower: TowerState,
    dmg: number,
    dmgAuraMult: number,
  ): void {
    if (!this.auras || dmg <= 0) return;
    if (dmgAuraMult > 0) {
      const sources = this.auras.dmgSources.get(tower.id);
      if (sources && sources.length) {
        const total = dmg * (dmgAuraMult / (1 + dmgAuraMult));
        const sumPct = sources.reduce((s, x) => s + x.pct, 0) || 1;
        for (const { src, pct } of sources) {
          const t = this.towerById(src);
          if (t)
            t.dmgAuraAssist = (t.dmgAuraAssist ?? 0) + total * (pct / sumPct);
        }
      }
    }
    const atkMult = this.auras.atkSpeed.get(tower.id) ?? 0;
    if (atkMult > 0) {
      const sources = this.auras.atkSpeedSources.get(tower.id);
      if (sources && sources.length) {
        const total = dmg * (atkMult / (1 + atkMult));
        const sumPct = sources.reduce((s, x) => s + x.pct, 0) || 1;
        for (const { src, pct } of sources) {
          const t = this.towerById(src);
          if (t)
            t.atkSpeedAssist = (t.atkSpeedAssist ?? 0) + total * (pct / sumPct);
        }
      }
    }
  }

  private rollBonusGold(
    owner: TowerState,
    target: CreepState,
    stats: ResolvedStats,
  ): void {
    const bg = stats.effects.find(
      (e): e is Extract<EffectKind, { kind: "bonus_gold" }> =>
        e.kind === "bonus_gold",
    );
    if (!bg || this.game.rng.next() >= bg.chance) return;
    const awarded = Math.min(target.bounty * bg.multiplier, 10);
    this.game.state.gold += awarded;
    owner.bonusGoldGenerated = (owner.bonusGoldGenerated ?? 0) + awarded;
    const tx = (owner.x + 1) * FINE_TILE;
    const ty = (owner.y + 1) * FINE_TILE;
    this.game.bus.emit("vfx:bonusGold", { x: tx, y: ty });
    this.game.bus.emit("gold:change", { gold: this.game.state.gold });
  }

  private applyEffects(
    c: CreepState,
    effects: EffectKind[],
    owner: TowerState,
  ): void {
    if (!c.alive) return;
    const tick = this.game.state.tick;
    for (const e of effects) {
      switch (e.kind) {
        case "slow": {
          const chance = e.chance ?? 1.0;
          if (this.game.rng.next() > chance) break;
          const expires = tick + Math.round(e.duration * SIM_HZ);
          const factor = e.factor + (1 - e.factor) * c.slowResist;
          if (!c.slow || c.slow.expiresAt < expires || c.slow.factor > factor) {
            c.slow = { factor, expiresAt: expires };
          }
          break;
        }
        case "poison": {
          const expires = tick + Math.round(e.duration * SIM_HZ);
          if (!c.poison || c.poison.dps < e.dps) {
            c.poison = {
              dps: e.dps,
              expiresAt: expires,
              nextTick: tick + SIM_HZ,
              ownerId: owner.id,
            };
          } else {
            c.poison.expiresAt = expires;
          }
          const deathSpread = effects.find(
            (ee): ee is Extract<EffectKind, { kind: "death_spread" }> =>
              ee.kind === "death_spread",
          );
          if (deathSpread) {
            c.poisonSpread = {
              count: deathSpread.count,
              radius: deathSpread.radius,
            };
          }
          break;
        }
        case "stun": {
          if (this.game.rng.next() > e.chance) break;
          const expires =
            tick +
            Math.max(1, Math.round(e.duration * SIM_HZ * (1 - c.stunResist)));
          if (!c.stun || c.stun.expiresAt < expires) {
            c.stun = { expiresAt: expires };
          }
          // Stun poison: if stun fires, apply poison and mark as spreadable
          const stunPoison = effects.find(
            (ee): ee is Extract<EffectKind, { kind: "stun_poison" }> =>
              ee.kind === "stun_poison",
          );
          if (stunPoison) {
            const poisonExpires =
              tick + Math.round(stunPoison.duration * SIM_HZ);
            if (!c.poison || c.poison.dps < stunPoison.dps) {
              c.poison = {
                dps: stunPoison.dps,
                expiresAt: poisonExpires,
                nextTick: tick + SIM_HZ,
                ownerId: owner.id,
              };
            } else {
              c.poison.expiresAt = poisonExpires;
            }
            const deathSpread = effects.find(
              (ee): ee is Extract<EffectKind, { kind: "death_spread" }> =>
                ee.kind === "death_spread",
            );
            if (deathSpread) {
              c.poisonSpread = {
                count: deathSpread.count,
                radius: deathSpread.radius,
              };
            }
          }
          break;
        }
        case "armor_reduce": {
          const expires = tick + Math.round(e.duration * SIM_HZ);
          if (!c.armorDebuff || c.armorDebuff.value < e.value) {
            c.armorDebuff = {
              value: e.value,
              expiresAt: expires,
              ownerId: owner.id,
            };
          } else if (c.armorDebuff.value === e.value) {
            c.armorDebuff.expiresAt = Math.max(
              c.armorDebuff.expiresAt,
              expires,
            );
            c.armorDebuff.ownerId = owner.id;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private applyProximityAuras(
    towers: TowerState[],
    creeps: CreepState[],
  ): Set<number> {
    const tick = this.game.state.tick;
    const inBurnAura = new Set<number>();

    for (const src of towers) {
      if (src.silencedUntil && src.silencedUntil > tick) continue;
      const stats = effectiveStats(src);
      const tx = (src.x + 1) * FINE_TILE;
      const ty = (src.y + 1) * FINE_TILE;

      // Track which creeps are in burn aura this tick (for linger_burn exit detection)
      const hasLingerBurn = stats.effects.some((e) => e.kind === "linger_burn");
      const hasBurn = stats.effects.some(
        (e) => e.kind === "prox_burn" || e.kind === "prox_burn_ramp",
      );
      const prevBurnCreepIds = src.burnAuraCreepIds;
      let currentBurnCreepIds: number[] | undefined;
      if (hasLingerBurn && hasBurn) {
        currentBurnCreepIds = [];
      }

      for (const e of stats.effects) {
        if (e.kind === "prox_armor_reduce") {
          const r2 = (e.radius * TILE) ** 2;
          for (const c of creeps) {
            if (!c.alive || !canTargetProx(e.targets, c)) continue;
            const dx = c.px - tx,
              dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            c.armorReduction = Math.max(c.armorReduction, e.value);
            (c.armorReductionSources ??= {})[src.id] = e.value;
          }
        } else if (e.kind === "prox_burn") {
          const r2 = (e.radius * TILE) ** 2;
          const dmgPerTick = e.dps / SIM_HZ;
          for (const c of creeps) {
            if (!c.alive) continue;
            const dx = c.px - tx,
              dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            this.applyDamage(c, Math.max(1, Math.round(dmgPerTick)), src);
            inBurnAura.add(c.id);
            if (currentBurnCreepIds) currentBurnCreepIds.push(c.id);
          }
        } else if (e.kind === "prox_burn_ramp") {
          const r2 = (e.radius * TILE) ** 2;
          if (!src.burnExposure) src.burnExposure = {};
          const hasArmorPierce = stats.effects.some(
            (ee) => ee.kind === "armor_pierce_burn",
          );
          const newExposure: Record<number, number> = {};
          for (const c of creeps) {
            if (!c.alive) continue;
            const dx = c.px - tx,
              dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            const prev = src.burnExposure[c.id] ?? 0;
            const exposure = prev + 1;
            newExposure[c.id] = exposure;
            const rampMult =
              1 + Math.min((exposure / SIM_HZ) * e.rampPct, e.rampCap);
            const dmg = Math.max(1, Math.round((e.dps * rampMult) / SIM_HZ));
            this.applyDamage(c, dmg, src, hasArmorPierce);
            inBurnAura.add(c.id);
            if (currentBurnCreepIds) currentBurnCreepIds.push(c.id);
          }
          src.burnExposure = newExposure;
        } else if (e.kind === "speed_damage_aura") {
          const r2 = (e.radius * TILE) ** 2;
          for (const c of creeps) {
            if (!c.alive) continue;
            const dx = c.px - tx,
              dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            const dmg = Math.max(
              1,
              Math.round(
                (e.dps * c.speed * c.speed) / SPEED_DMG_PIVOT / SIM_HZ,
              ),
            );
            this.applyDamage(c, dmg, src);
          }
        } else if (e.kind === "prox_slow") {
          const r2 = (e.radius * TILE) ** 2;
          for (const c of creeps) {
            if (!c.alive) continue;
            const dx = c.px - tx,
              dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            const factor = e.factor + (1 - e.factor) * c.slowResist;
            c.proxSlowFactor = Math.min(c.proxSlowFactor ?? 1, factor);
          }
        } else if (e.kind === "vulnerability_aura") {
          const r2 = (e.radius * TILE) ** 2;
          for (const c of creeps) {
            if (!c.alive) continue;
            const dx = c.px - tx,
              dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            c.vulnerability += e.pct;
            (c.vulnSources ??= {})[src.id] =
              (c.vulnSources[src.id] ?? 0) + e.pct;
          }
        } else if (e.kind === "armor_decay_aura") {
          const r2 = (e.radius * TILE) ** 2;
          for (const c of creeps) {
            if (!c.alive) continue;
            const dx = c.px - tx,
              dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            c.radiationArmor = Math.min(
              (c.radiationArmor ?? 0) + e.armorPerSec / SIM_HZ,
              e.maxReduction,
            );
            (c.radiationArmorSources ??= {})[src.id] = Math.min(
              (c.radiationArmorSources[src.id] ?? 0) + e.armorPerSec / SIM_HZ,
              e.maxReduction,
            );
          }
        } else if (e.kind === "periodic_freeze") {
          const intervalTicks = Math.round(e.interval * SIM_HZ);
          if (tick - (src.lastFreezeTick ?? 0) >= intervalTicks) {
            src.lastFreezeTick = tick;
            const r2 = (stats.range * TILE) ** 2;
            for (const c of creeps) {
              if (!c.alive) continue;
              const dx = c.px - tx,
                dy = c.py - ty;
              if (dx * dx + dy * dy > r2) continue;
              const stunDuration = Math.max(
                1,
                Math.round(e.duration * SIM_HZ * (1 - c.stunResist)),
              );
              const expires = tick + stunDuration;
              if (!c.stun || c.stun.expiresAt < expires) {
                c.stun = { expiresAt: expires };
              }
            }
            this.game.bus.emit("vfx:periodicFreeze", {
              x: tx,
              y: ty,
              rangePx: stats.range * TILE,
            });
          }
        }
      }

      // Linger burn: detect creeps that left the burn aura
      if (hasLingerBurn && currentBurnCreepIds && prevBurnCreepIds) {
        const currentSet = new Set(currentBurnCreepIds);
        const lingerEffect = stats.effects.find(
          (ee): ee is Extract<EffectKind, { kind: "linger_burn" }> =>
            ee.kind === "linger_burn",
        )!;
        const burnEffect = stats.effects.find(
          (ee) => ee.kind === "prox_burn" || ee.kind === "prox_burn_ramp",
        );
        if (burnEffect) {
          const burnDps = burnEffect.dps;
          for (const id of prevBurnCreepIds) {
            if (currentSet.has(id)) continue;
            const c = creeps.find((cc) => cc.id === id && cc.alive);
            if (!c) continue;
            c.lingerBurn = {
              dps: burnDps,
              ticksLeft: Math.round(lingerEffect.duration * SIM_HZ),
              ownerId: src.id,
            };
          }
        }
      }
      src.burnAuraCreepIds = currentBurnCreepIds;
    }

    // Second pass: frostbite (needs final proxSlowFactor)
    for (const src of towers) {
      const stats = effectiveStats(src);
      const tx = (src.x + 1) * FINE_TILE;
      const ty = (src.y + 1) * FINE_TILE;
      for (const e of stats.effects) {
        if (e.kind !== "frostbite") continue;
        const r2 = (stats.range * TILE) ** 2;
        for (const c of creeps) {
          if (!c.alive) continue;
          const dx = c.px - tx,
            dy = c.py - ty;
          if (dx * dx + dy * dy > r2) continue;
          const slowFactor =
            c.slow && c.slow.expiresAt > tick ? c.slow.factor : 1;
          const proxFactor = c.proxSlowFactor ?? 1;
          if (slowFactor * proxFactor <= e.speedThreshold) {
            c.vulnerability += e.dmgBonus;
            (c.vulnSources ??= {})[src.id] =
              (c.vulnSources[src.id] ?? 0) + e.dmgBonus;
          }
        }
      }
    }
    return inBurnAura;
  }

  handleDeathEffects(dead: CreepState): void {
    const state = this.game.state;

    // Death nova: scan towers for the effect
    for (const t of state.towers) {
      const stats = effectiveStats(t);
      const deathNova = stats.effects.find(
        (e): e is Extract<EffectKind, { kind: "death_nova" }> =>
          e.kind === "death_nova",
      );
      if (!deathNova) continue;
      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE;
      const rangePx = stats.range * TILE;
      const dx = dead.px - tx,
        dy = dead.py - ty;
      if (dx * dx + dy * dy > rangePx * rangePx) continue;
      const novaDmg = Math.round(dead.maxHp * deathNova.hpPct);
      const novaR2 = (deathNova.radius * TILE) ** 2;
      for (const c of state.creeps) {
        if (!c.alive) continue;
        const cdx = c.px - dead.px,
          cdy = c.py - dead.py;
        if (cdx * cdx + cdy * cdy > novaR2) continue;
        this.applyDamage(c, novaDmg, t);
      }
      this.game.bus.emit("vfx:deathNova", {
        x: dead.px,
        y: dead.py,
        radiusPx: deathNova.radius * TILE,
      });
    }

    // Death spread (plague): if creep had spreadable poison
    if (dead.poisonSpread && dead.poison) {
      const { count, radius } = dead.poisonSpread;
      const r2 = (radius * TILE) ** 2;
      const candidates: { creep: CreepState; dist2: number }[] = [];
      for (const c of state.creeps) {
        if (!c.alive) continue;
        const dx = c.px - dead.px,
          dy = c.py - dead.py;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) candidates.push({ creep: c, dist2: d2 });
      }
      candidates.sort((a, b) => a.dist2 - b.dist2);
      const tick = state.tick;
      const spreadCount = Math.min(count, candidates.length);
      for (let i = 0; i < spreadCount; i++) {
        const c = candidates[i].creep;
        c.poison = {
          dps: dead.poison.dps,
          expiresAt: tick + 3 * SIM_HZ,
          nextTick: tick + SIM_HZ,
          ownerId: dead.poison.ownerId,
        };
      }
      if (spreadCount > 0) {
        this.game.bus.emit("vfx:deathSpread", {
          fromX: dead.px,
          fromY: dead.py,
          targets: candidates
            .slice(0, spreadCount)
            .map(({ creep: sc }) => ({ x: sc.px, y: sc.py })),
        });
      }
    }
  }
}

interface ResolvedStats {
  dmgMin: number;
  dmgMax: number;
  range: number;
  atkSpeed: number;
  effects: EffectKind[];
  visualGem: TowerState["gem"];
  targeting: "all" | "ground" | "air";
  targetPriority?: "furthest" | "highest_hp";
  projectileSpeed?: number;
  groundTarget?: boolean;
}

export function towerLevel(t: TowerState): number {
  return Math.floor(t.kills / 10);
}

function scaleBurnEffects(effects: EffectKind[], mult: number): EffectKind[] {
  if (mult === 1) return effects;
  return effects.map((e) => {
    if (e.kind === "prox_burn") return { ...e, dps: Math.round(e.dps * mult) };
    if (e.kind === "prox_burn_ramp")
      return { ...e, dps: Math.round(e.dps * mult) };
    if (e.kind === "speed_damage_aura")
      return { ...e, dps: Math.round(e.dps * mult) };
    return e;
  });
}

/**
 * Resolved stats are a pure function of (comboKey|gem, quality, upgradeTier,
 * towerLevel), so they are memoized — this used to allocate a fresh object plus
 * (via gemStats/scaleBurnEffects) one or two effect arrays on every call, and is
 * invoked ~4× per tower per tick (two aura passes, aura-mults, fire) plus per
 * projectile/death. The cached object is shared and read-only to all callers.
 */
const effectiveStatsCache = new Map<string, ResolvedStats>();

function effectiveStats(t: TowerState): ResolvedStats {
  const lvl = towerLevel(t);
  const cacheKey = `${t.comboKey ?? ""}:${t.gem}:${t.quality}:${t.upgradeTier ?? 0}:${lvl}`;
  const cached = effectiveStatsCache.get(cacheKey);
  if (cached) return cached;
  const mult = 1 + (0.05 * lvl) / (1 + 0.06 * lvl);
  if (t.comboKey) {
    const combo = COMBO_BY_NAME.get(t.comboKey);
    if (combo) {
      const s = comboStatsAtTier(combo, t.upgradeTier ?? 0);
      const result: ResolvedStats = {
        dmgMin: Math.round(s.dmgMin * mult),
        dmgMax: Math.round(s.dmgMax * mult),
        range: s.range,
        atkSpeed: Math.round(s.atkSpeed * mult * 100) / 100,
        effects: scaleBurnEffects(s.effects, mult),
        visualGem: combo.visualGem,
        targeting: s.targeting,
      };
      effectiveStatsCache.set(cacheKey, result);
      return result;
    }
  }
  const s = gemStats(t.gem, t.quality);
  const result: ResolvedStats = {
    dmgMin: Math.round(s.dmgMin * mult),
    dmgMax: Math.round(s.dmgMax * mult),
    range: s.range,
    atkSpeed: Math.round(s.atkSpeed * mult * 100) / 100,
    effects: scaleBurnEffects(s.effects, mult),
    visualGem: t.gem,
    targeting: s.targeting,
    targetPriority: s.targetPriority,
    projectileSpeed: s.projectileSpeed,
    groundTarget: s.groundTarget,
  };
  effectiveStatsCache.set(cacheKey, result);
  return result;
}

/** A single aura contribution to a buffed tower: which source, and at what pct. */
interface AuraSource {
  src: number;
  pct: number;
}

interface AuraMults {
  atkSpeed: Map<number, number>;
  dmg: Map<number, number>;
  /** Per buffed-tower list of contributing atk-speed-aura sources (for assist credit). */
  atkSpeedSources: Map<number, AuraSource[]>;
  /** Per buffed-tower list of contributing dmg-aura sources (for assist credit). */
  dmgSources: Map<number, AuraSource[]>;
}

function computeAuraMults(towers: TowerState[], tick: number): AuraMults {
  const atkSpeed = new Map<number, number>();
  const dmg = new Map<number, number>();
  const atkSpeedSources = new Map<number, AuraSource[]>();
  const dmgSources = new Map<number, AuraSource[]>();
  for (const src of towers) {
    if (src.isTrap) continue;
    if (src.silencedUntil && src.silencedUntil > tick) continue;
    const stats = effectiveStats(src);
    for (const e of stats.effects) {
      if (e.kind !== "aura_atkspeed" && e.kind !== "aura_dmg") continue;
      const radiusFine = e.radius * GRID_SCALE;
      const r2 = radiusFine * radiusFine;
      const map = e.kind === "aura_atkspeed" ? atkSpeed : dmg;
      const srcMap = e.kind === "aura_atkspeed" ? atkSpeedSources : dmgSources;
      for (const tgt of towers) {
        if (tgt.id === src.id || tgt.isTrap) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        if (dx * dx + dy * dy > r2) continue;
        map.set(tgt.id, 1 - (1 - (map.get(tgt.id) ?? 0)) * (1 - e.pct));
        const list = srcMap.get(tgt.id);
        if (list) list.push({ src: src.id, pct: e.pct });
        else srcMap.set(tgt.id, [{ src: src.id, pct: e.pct }]);
      }
    }
  }
  return { atkSpeed, dmg, atkSpeedSources, dmgSources };
}

function canTargetProx(
  targets: "ground" | "air" | "all",
  creep: CreepState,
): boolean {
  if (targets === "all") return true;
  const isAir = !!creep.flags?.air;
  return targets === "air" ? isAir : !isAir;
}

function canTarget(
  targeting: "all" | "ground" | "air",
  creep: CreepState,
): boolean {
  if (targeting === "all") return true;
  const isAir = !!creep.flags?.air;
  return targeting === "air" ? isAir : !isAir;
}

function isBurrowed(c: CreepState, tick: number): boolean {
  return !!c.burrowed && c.burrowed.expiresAt > tick;
}

function pickTarget(
  t: TowerState,
  rangeTiles: number,
  creeps: CreepState[],
  targeting: "all" | "ground" | "air",
  tick: number,
  priority?: "furthest" | "highest_hp",
): CreepState | null {
  const r2 = rangeTiles * TILE * (rangeTiles * TILE);
  const tx = (t.x + 1) * FINE_TILE;
  const ty = (t.y + 1) * FINE_TILE;
  let best: CreepState | null = null;
  for (const c of creeps) {
    if (!c.alive) continue;
    if (isBurrowed(c, tick)) continue;
    if (!canTarget(targeting, c)) continue;
    const dx = c.px - tx;
    const dy = c.py - ty;
    if (dx * dx + dy * dy > r2) continue;
    if (!best) {
      best = c;
      continue;
    }
    if (priority === "highest_hp" ? c.hp > best.hp : c.pathPos > best.pathPos)
      best = c;
  }
  return best;
}

function pickTargets(
  t: TowerState,
  rangeTiles: number,
  creeps: CreepState[],
  targeting: "all" | "ground" | "air",
  tick: number,
  count: number,
): CreepState[] {
  const r2 = (rangeTiles * TILE) ** 2;
  const tx = (t.x + 1) * FINE_TILE;
  const ty = (t.y + 1) * FINE_TILE;
  const inRange: CreepState[] = [];
  for (const c of creeps) {
    if (!c.alive || isBurrowed(c, tick) || !canTarget(targeting, c)) continue;
    const dx = c.px - tx,
      dy = c.py - ty;
    if (dx * dx + dy * dy <= r2) inRange.push(c);
  }
  inRange.sort((a, b) => b.pathPos - a.pathPos);
  return inRange.slice(0, count);
}

function nearest(
  creeps: CreepState[],
  x: number,
  y: number,
  exclude: Set<number>,
  maxDist: number,
  tick: number,
): CreepState | null {
  let best: CreepState | null = null;
  let bestD2 = maxDist * maxDist;
  for (const c of creeps) {
    if (!c.alive) continue;
    if (exclude.has(c.id)) continue;
    if (isBurrowed(c, tick)) continue;
    const dx = c.px - x;
    const dy = c.py - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestD2) continue;
    bestD2 = d2;
    best = c;
  }
  return best;
}

function randInt(rng: RNG, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng.next() * (max - min + 1));
}
