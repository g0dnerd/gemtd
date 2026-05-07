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
import { gemStats } from '../data/gems';
import { COMBOS } from '../data/combos';
import type { CreepState, ProjectileState, TowerState } from '../game/State';
import type { EffectKind } from '../data/gems';

const PROJECTILE_PX_PER_SEC = 480;

export class Combat {
  constructor(private game: Game) {}

  step(): void {
    const state = this.game.state;
    const tick = state.tick;

    // Towers fire (only during waves).
    if (state.phase === 'wave') {
      const auraMult = computeAuraMults(state.towers);
      for (const t of state.towers) {
        const stats = effectiveStats(t);
        const mult = auraMult.get(t.id) ?? 0;
        const effectiveAtkSpeed = stats.atkSpeed * (1 + mult);
        const cooldownTicks = Math.max(1, Math.round(SIM_HZ / effectiveAtkSpeed));
        if (tick - t.lastFireTick < cooldownTicks) continue;
        const target = pickTarget(t, stats.range, state.creeps, stats.targeting);
        if (!target) continue;
        t.lastFireTick = tick;
        this.fire(t, target, stats);
      }
    }

    // Project projectiles.
    for (const p of state.projectiles) {
      if (!p.alive) continue;
      const dx = p.toX - p.fromX;
      const dy = p.toY - p.fromY;
      const dist = Math.hypot(dx, dy);
      const dt = (PROJECTILE_PX_PER_SEC / Math.max(1, dist)) * SIM_DT;
      p.t += dt;
      if (p.t >= 1) {
        p.alive = false;
        this.impact(p);
      }
    }
    state.projectiles = state.projectiles.filter((p) => p.alive);
  }

  private fire(tower: TowerState, target: CreepState, stats: ResolvedStats): void {
    const state = this.game.state;
    // Towers are 2×2 on the fine grid; the firing point is the centre of that footprint.
    const fromX = (tower.x + 1) * FINE_TILE;
    const fromY = (tower.y + 1) * FINE_TILE;
    const baseDmg = randInt(stats.dmgMin, stats.dmgMax);
    let dmg = baseDmg;
    for (const e of stats.effects) {
      if (e.kind === 'crit' && Math.random() < e.chance) {
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

    // Direct hit
    if (target) {
      this.applyDamage(target, p.damage, owner);
      this.applyEffects(target, stats.effects, owner);
    }

    // Splash
    for (const e of stats.effects) {
      if (e.kind === 'splash') {
        for (const c of state.creeps) {
          if (!c.alive) continue;
          if (c === target) continue;
          const dx = c.px - p.toX;
          const dy = c.py - p.toY;
          const dist = Math.hypot(dx, dy);
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
          const next = nearest(state.creeps, last.px, last.py, hit, stats.range * TILE);
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
    if (c.flags?.armored) dmg = Math.round(dmg * 0.7);
    c.hp -= dmg;
    this.game.bus.emit('tower:hit', { id: owner.id, targetId: c.id, damage: dmg });
    if (c.hp <= 0) {
      c.alive = false;
      owner.kills++;
      const state = this.game.state;
      state.gold += c.bounty;
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
          if (Math.random() > chance) break;
          const expires = tick + Math.round(e.duration * SIM_HZ);
          if (!c.slow || c.slow.expiresAt < expires || c.slow.factor > e.factor) {
            c.slow = { factor: e.factor, expiresAt: expires };
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
          if (Math.random() > e.chance) break;
          const expires = tick + Math.round(e.duration * SIM_HZ);
          if (!c.stun || c.stun.expiresAt < expires) {
            c.stun = { expiresAt: expires };
          }
          break;
        }
        // splash/chain handled in impact()
        default:
          break;
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

function effectiveStats(t: TowerState): ResolvedStats {
  if (t.comboKey) {
    const combo = COMBOS.find((c) => c.key === t.comboKey);
    if (combo) {
      return {
        dmgMin: combo.stats.dmgMin,
        dmgMax: combo.stats.dmgMax,
        range: combo.stats.range,
        atkSpeed: combo.stats.atkSpeed,
        effects: combo.stats.effects,
        visualGem: combo.visualGem,
        targeting: combo.stats.targeting,
      };
    }
  }
  const s = gemStats(t.gem, t.quality);
  return {
    dmgMin: s.dmgMin,
    dmgMax: s.dmgMax,
    range: s.range,
    atkSpeed: s.atkSpeed,
    effects: s.effects,
    visualGem: t.gem,
    targeting: s.targeting,
  };
}

function computeAuraMults(towers: TowerState[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const src of towers) {
    const stats = effectiveStats(src);
    for (const e of stats.effects) {
      if (e.kind !== 'aura_atkspeed') continue;
      // Tower coords live on the fine grid; aura radius is in coarse tiles.
      const radiusFine = e.radius * GRID_SCALE;
      const r2 = radiusFine * radiusFine;
      for (const tgt of towers) {
        if (tgt.id === src.id) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        if (dx * dx + dy * dy > r2) continue;
        out.set(tgt.id, (out.get(tgt.id) ?? 0) + e.pct);
      }
    }
  }
  return out;
}

function canTarget(targeting: 'all' | 'ground' | 'air', creep: CreepState): boolean {
  if (targeting === 'all') return true;
  const isAir = !!creep.flags?.air;
  return targeting === 'air' ? isAir : !isAir;
}

function pickTarget(t: TowerState, rangeTiles: number, creeps: CreepState[], targeting: 'all' | 'ground' | 'air'): CreepState | null {
  const r2 = (rangeTiles * TILE) * (rangeTiles * TILE);
  const tx = (t.x + 1) * FINE_TILE;
  const ty = (t.y + 1) * FINE_TILE;
  let best: CreepState | null = null;
  for (const c of creeps) {
    if (!c.alive) continue;
    if (!canTarget(targeting, c)) continue;
    const dx = c.px - tx;
    const dy = c.py - ty;
    if (dx * dx + dy * dy > r2) continue;
    if (!best || c.pathPos > best.pathPos) best = c;
  }
  return best;
}

function nearest(creeps: CreepState[], x: number, y: number, exclude: Set<number>, maxDist: number): CreepState | null {
  let best: CreepState | null = null;
  let bestD = Infinity;
  for (const c of creeps) {
    if (!c.alive) continue;
    if (exclude.has(c.id)) continue;
    const dx = c.px - x;
    const dy = c.py - y;
    const d = Math.hypot(dx, dy);
    if (d > maxDist) continue;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function randInt(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}
