/**
 * Combat system: tower targeting, projectile flight, on-hit damage and effects.
 *
 * Towers fire whenever they have a target in range and their cooldown is up.
 * Projectiles travel at a fixed pixel speed; on impact they apply the tower's
 * damage range and effect strategies to the target (and surrounding creeps
 * for splash, neighbors for chain, etc.).
 */

import { TILE, FINE_TILE, GRID_SCALE, SIM_DT, SIM_HZ } from '../game/constants';
import { Game } from '../game/Game';
import { RNG } from '../game/rng';
import { gemStats } from '../data/gems';
import { COMBO_BY_NAME, comboStatsAtTier } from '../data/combos';
import type { CreepState, ProjectileState, TowerState } from '../game/State';
import type { EffectKind } from '../data/gems';

const PROJECTILE_PX_PER_SEC = 480;

export function armorDamageMultiplier(armor: number): number {
  if (armor >= 0) return 1 / (1 + armor * 0.06);
  const neg = Math.min(-armor, 10);
  return 2 - Math.pow(0.94, neg);
}

export class Combat {
  constructor(private game: Game) {}

  step(): void {
    const state = this.game.state;
    const tick = state.tick;

    // Reset and recompute proximity auras each tick.
    if (state.phase === 'wave') {
      for (const c of state.creeps) if (c.alive) {
        c.armorReduction = 0;
        c.proxSlowFactor = undefined;
      }
      this.applyProximityAuras(state.towers, state.creeps);
    }

    // Towers fire (only during waves). Traps are handled by the Traps system.
    if (state.phase === 'wave') {
      const auras = computeAuraMults(state.towers);
      for (const t of state.towers) {
        if (t.isTrap) continue;
        const stats = effectiveStats(t);
        // Passive burn towers don't fire projectiles.
        if (stats.effects.some((e) => e.kind === 'prox_burn')) continue;
        const atkMult = auras.atkSpeed.get(t.id) ?? 0;
        const effectiveAtkSpeed = stats.atkSpeed * (1 + atkMult);
        const cooldownTicks = Math.max(1, Math.round(SIM_HZ / effectiveAtkSpeed));
        if (tick - t.lastFireTick < cooldownTicks) continue;
        const beamEffect = stats.effects.find((e): e is Extract<EffectKind, { kind: 'beam_ramp' }> => e.kind === 'beam_ramp');
        const multiEffect = stats.effects.find((e): e is Extract<EffectKind, { kind: 'multi_target' }> => e.kind === 'multi_target');
        if (multiEffect) {
          const targets = pickTargets(t, stats.range, state.creeps, stats.targeting, tick, multiEffect.count);
          if (targets.length === 0) continue;
          t.lastFireTick = tick;
          const dmgMult = auras.dmg.get(t.id) ?? 0;
          for (const tgt of targets) this.fire(t, tgt, stats, dmgMult);
        } else {
          const target = pickTarget(t, stats.range, state.creeps, stats.targeting, tick);
          if (!target) {
            if (beamEffect) t.beam = undefined;
            continue;
          }
          t.lastFireTick = tick;
          const dmgMult = auras.dmg.get(t.id) ?? 0;
          if (beamEffect) {
            this.beamHit(t, target, stats, beamEffect, dmgMult);
          } else {
            this.fire(t, target, stats, dmgMult);
          }
        }
      }
    }

    // Project projectiles.
    for (const p of state.projectiles) {
      if (!p.alive) continue;
      const dx = p.toX - p.fromX;
      const dy = p.toY - p.fromY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = (PROJECTILE_PX_PER_SEC / Math.max(1, dist)) * SIM_DT;
      p.t += dt;
      if (p.t >= 1) {
        p.alive = false;
        this.impact(p);
      }
    }
    let write = 0;
    for (let i = 0; i < state.projectiles.length; i++) {
      if (state.projectiles[i].alive) state.projectiles[write++] = state.projectiles[i];
    }
    state.projectiles.length = write;
  }

  private beamHit(
    tower: TowerState,
    target: CreepState,
    stats: ResolvedStats,
    beam: Extract<EffectKind, { kind: 'beam_ramp' }>,
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
    this.game.bus.emit('tower:fire', { id: tower.id, targetId: target.id });
  }

  private fire(tower: TowerState, target: CreepState, stats: ResolvedStats, dmgAuraMult = 0): void {
    const state = this.game.state;
    const fromX = (tower.x + 1) * FINE_TILE;
    const fromY = (tower.y + 1) * FINE_TILE;
    const baseDmg = randInt(this.game.rng, stats.dmgMin, stats.dmgMax);
    let dmg = Math.round(baseDmg * (1 + dmgAuraMult));
    for (const e of stats.effects) {
      if (e.kind === 'crit' && this.game.rng.next() < e.chance) {
        dmg = Math.round(dmg * e.multiplier);
      }
      if (e.kind === 'air_bonus' && target.flags?.air) {
        dmg = Math.round(dmg * e.multiplier);
      }
    }
    const proj: ProjectileState = {
      id: this.game.nextId(),
      fromX, fromY,
      toX: target.px, toY: target.py,
      targetId: target.id,
      t: 0,
      speed: PROJECTILE_PX_PER_SEC,
      damage: dmg,
      ownerTowerId: tower.id,
      color: stats.visualGem,
      alive: true,
    };
    state.projectiles.push(proj);
    this.game.bus.emit('tower:fire', { id: tower.id, targetId: target.id });
  }

  private impact(p: ProjectileState): void {
    const state = this.game.state;
    const owner = state.towers.find((t) => t.id === p.ownerTowerId);
    if (!owner) return;
    const stats = effectiveStats(owner);
    const target = state.creeps.find((c) => c.id === p.targetId && c.alive);

    // Direct hit (skip burrowed targets — projectile misses)
    if (target && !isBurrowed(target, state.tick)) {
      this.applyDamage(target, p.damage, owner);
      this.applyEffects(target, stats.effects, owner);
    }

    // Splash
    const tick = state.tick;
    for (const e of stats.effects) {
      if (e.kind === 'splash') {
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
          }
        }
      } else if (e.kind === 'chain' && target) {
        // Chain hops to nearest creeps within range.
        let last = target;
        let dmg = p.damage;
        const hit = new Set<number>([target.id]);
        for (let i = 0; i < e.bounces; i++) {
          dmg = Math.round(dmg * e.falloff);
          const next = nearest(state.creeps, last.px, last.py, hit, stats.range * TILE, tick);
          if (!next) break;
          this.applyDamage(next, dmg, owner);
          this.applyEffects(next, stats.effects.filter((ee) => ee.kind !== 'chain'), owner);
          hit.add(next.id);
          last = next;
        }
      }
    }
  }

  private applyDamage(c: CreepState, dmg: number, owner: TowerState): void {
    if (!c.alive) return;
    let effectiveArmor = c.armor - c.armorReduction;
    if (c.armorDebuff && c.armorDebuff.expiresAt > this.game.state.tick) {
      effectiveArmor -= c.armorDebuff.value;
    }
    effectiveArmor = Math.max(effectiveArmor, -10);
    if (effectiveArmor !== 0) {
      dmg = Math.round(dmg * armorDamageMultiplier(effectiveArmor));
    }
    c.hp -= dmg;
    this.game.bus.emit('tower:hit', { id: owner.id, targetId: c.id, damage: dmg });
    if (c.hp <= 0) {
      c.alive = false;
      owner.kills++;
      const state = this.game.state;
      state.gold += c.bounty;
      // Bonus gold check
      const ownerStats = effectiveStats(owner);
      for (const e of ownerStats.effects) {
        if (e.kind === 'bonus_gold' && this.game.rng.next() < e.chance) {
          state.gold += c.bounty;
        }
      }
      state.totalKills++;
      state.waveStats.killedThisWave++;
      this.game.bus.emit('creep:die', { id: c.id, bounty: c.bounty });
      this.game.bus.emit('gold:change', { gold: state.gold });
    }
  }

  private applyEffects(c: CreepState, effects: EffectKind[], _owner: TowerState): void {
    if (!c.alive) return;
    const tick = this.game.state.tick;
    for (const e of effects) {
      switch (e.kind) {
        case 'slow': {
          const chance = e.chance ?? 1.0;
          if (this.game.rng.next() > chance) break;
          const expires = tick + Math.round(e.duration * SIM_HZ);
          const factor = e.factor + (1 - e.factor) * c.slowResist;
          if (!c.slow || c.slow.expiresAt < expires || c.slow.factor > factor) {
            c.slow = { factor, expiresAt: expires };
          }
          break;
        }
        case 'poison': {
          const expires = tick + Math.round(e.duration * SIM_HZ);
          if (!c.poison || c.poison.dps < e.dps) {
            c.poison = { dps: e.dps, expiresAt: expires, nextTick: tick + SIM_HZ };
          } else {
            c.poison.expiresAt = expires;
          }
          break;
        }
        case 'stun': {
          if (this.game.rng.next() > e.chance) break;
          const expires = tick + Math.round(e.duration * SIM_HZ);
          if (!c.stun || c.stun.expiresAt < expires) {
            c.stun = { expiresAt: expires };
          }
          break;
        }
        case 'armor_reduce': {
          const expires = tick + Math.round(e.duration * SIM_HZ);
          if (!c.armorDebuff || c.armorDebuff.value < e.value) {
            c.armorDebuff = { value: e.value, expiresAt: expires };
          } else if (c.armorDebuff.value === e.value) {
            c.armorDebuff.expiresAt = Math.max(c.armorDebuff.expiresAt, expires);
          }
          break;
        }
        // splash/chain handled in impact()
        default:
          break;
      }
    }
  }

  private applyProximityAuras(towers: TowerState[], creeps: CreepState[]): void {
    for (const src of towers) {
      const stats = effectiveStats(src);
      const tx = (src.x + 1) * FINE_TILE;
      const ty = (src.y + 1) * FINE_TILE;
      for (const e of stats.effects) {
        if (e.kind === 'prox_armor_reduce') {
          const r2 = (e.radius * TILE) ** 2;
          for (const c of creeps) {
            if (!c.alive || !canTargetProx(e.targets, c)) continue;
            const dx = c.px - tx, dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            c.armorReduction = Math.max(c.armorReduction, e.value);
          }
        } else if (e.kind === 'prox_burn') {
          const r2 = (e.radius * TILE) ** 2;
          const dmgPerTick = e.dps / SIM_HZ;
          for (const c of creeps) {
            if (!c.alive) continue;
            const dx = c.px - tx, dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            this.applyDamage(c, Math.max(1, Math.round(dmgPerTick)), src);
          }
        } else if (e.kind === 'prox_slow') {
          const r2 = (e.radius * TILE) ** 2;
          for (const c of creeps) {
            if (!c.alive) continue;
            const dx = c.px - tx, dy = c.py - ty;
            if (dx * dx + dy * dy > r2) continue;
            const factor = e.factor + (1 - e.factor) * c.slowResist;
            c.proxSlowFactor = Math.min(c.proxSlowFactor ?? 1, factor);
          }
        }
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
  visualGem: TowerState['gem'];
  targeting: 'all' | 'ground' | 'air';
}

export function towerLevel(t: TowerState): number {
  return Math.floor(t.kills / 10);
}

function effectiveStats(t: TowerState): ResolvedStats {
  const lvl = towerLevel(t);
  const mult = 1 + lvl * 0.05;
  if (t.comboKey) {
    const combo = COMBO_BY_NAME.get(t.comboKey);
    if (combo) {
      const s = comboStatsAtTier(combo, t.upgradeTier ?? 0);
      return {
        dmgMin: Math.round(s.dmgMin * mult),
        dmgMax: Math.round(s.dmgMax * mult),
        range: s.range,
        atkSpeed: Math.round(s.atkSpeed * mult * 100) / 100,
        effects: s.effects,
        visualGem: combo.visualGem,
        targeting: s.targeting,
      };
    }
  }
  const s = gemStats(t.gem, t.quality);
  return {
    dmgMin: Math.round(s.dmgMin * mult),
    dmgMax: Math.round(s.dmgMax * mult),
    range: s.range,
    atkSpeed: Math.round(s.atkSpeed * mult * 100) / 100,
    effects: s.effects,
    visualGem: t.gem,
    targeting: s.targeting,
  };
}

interface AuraMults {
  atkSpeed: Map<number, number>;
  dmg: Map<number, number>;
}

function computeAuraMults(towers: TowerState[]): AuraMults {
  const atkSpeed = new Map<number, number>();
  const dmg = new Map<number, number>();
  for (const src of towers) {
    if (src.isTrap) continue;
    const stats = effectiveStats(src);
    for (const e of stats.effects) {
      if (e.kind !== 'aura_atkspeed' && e.kind !== 'aura_dmg') continue;
      const radiusFine = e.radius * GRID_SCALE;
      const r2 = radiusFine * radiusFine;
      const map = e.kind === 'aura_atkspeed' ? atkSpeed : dmg;
      for (const tgt of towers) {
        if (tgt.id === src.id || tgt.isTrap) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        if (dx * dx + dy * dy > r2) continue;
        map.set(tgt.id, (map.get(tgt.id) ?? 0) + e.pct);
      }
    }
  }
  return { atkSpeed, dmg };
}

function canTargetProx(targets: 'ground' | 'air' | 'all', creep: CreepState): boolean {
  if (targets === 'all') return true;
  const isAir = !!creep.flags?.air;
  return targets === 'air' ? isAir : !isAir;
}

function canTarget(targeting: 'all' | 'ground' | 'air', creep: CreepState): boolean {
  if (targeting === 'all') return true;
  const isAir = !!creep.flags?.air;
  return targeting === 'air' ? isAir : !isAir;
}

function isBurrowed(c: CreepState, tick: number): boolean {
  return !!c.burrowed && c.burrowed.expiresAt > tick;
}

function pickTarget(t: TowerState, rangeTiles: number, creeps: CreepState[], targeting: 'all' | 'ground' | 'air', tick: number): CreepState | null {
  const r2 = (rangeTiles * TILE) * (rangeTiles * TILE);
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
    if (!best || c.pathPos > best.pathPos) best = c;
  }
  return best;
}

function pickTargets(t: TowerState, rangeTiles: number, creeps: CreepState[], targeting: 'all' | 'ground' | 'air', tick: number, count: number): CreepState[] {
  const r2 = (rangeTiles * TILE) ** 2;
  const tx = (t.x + 1) * FINE_TILE;
  const ty = (t.y + 1) * FINE_TILE;
  const inRange: CreepState[] = [];
  for (const c of creeps) {
    if (!c.alive || isBurrowed(c, tick) || !canTarget(targeting, c)) continue;
    const dx = c.px - tx, dy = c.py - ty;
    if (dx * dx + dy * dy <= r2) inRange.push(c);
  }
  inRange.sort((a, b) => b.pathPos - a.pathPos);
  return inRange.slice(0, count);
}

function nearest(creeps: CreepState[], x: number, y: number, exclude: Set<number>, maxDist: number, tick: number): CreepState | null {
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
