/**
 * Trap system: triggers trap effects when creeps walk within range.
 *
 * Traps are towers with isTrap=true. They don't fire projectiles — instead,
 * each sim tick they check for creeps within their trigger radius and apply
 * effects directly. A cooldown (derived from atkSpeed) gates re-triggering.
 *
 * For traps, ComboStats fields map as:
 *  - range → trigger radius (tiles)
 *  - atkSpeed → triggers per second (cooldown = SIM_HZ / atkSpeed)
 *  - dmgMin/dmgMax → direct damage on trigger
 *  - effects → trap-specific effects (trap_slow, trap_dot, trap_explode, etc.)
 *  - targeting → ground / air / all
 */

import { TILE, FINE_TILE, SIM_HZ } from '../game/constants';
import { Game } from '../game/Game';
import { COMBO_BY_NAME, comboStatsAtTier } from '../data/combos';
import type { CreepState, TowerState } from '../game/State';
import type { EffectKind } from '../data/gems';

export class Traps {
  constructor(private game: Game) {}

  step(): void {
    const state = this.game.state;
    if (state.phase !== 'wave') return;
    const tick = state.tick;

    for (const trap of state.towers) {
      if (!trap.isTrap) continue;
      const stats = trapStats(trap);
      if (!stats) continue;

      const cooldownTicks = Math.max(1, Math.round(SIM_HZ / stats.atkSpeed));
      if (tick - (trap.lastTriggerTick ?? 0) < cooldownTicks) continue;

      // Trigger area is the exact 2x2 fine-cell footprint the rune occupies.
      const left = trap.x * FINE_TILE;
      const top = trap.y * FINE_TILE;
      const right = (trap.x + 2) * FINE_TILE;
      const bottom = (trap.y + 2) * FINE_TILE;

      let triggered = false;
      for (const c of state.creeps) {
        if (!c.alive) continue;
        if (!canTrigger(stats.targeting, c)) continue;
        if (c.px < left || c.px > right || c.py < top || c.py > bottom) continue;

        this.applyTrap(trap, c, stats);
        triggered = true;
      }

      if (triggered) {
        trap.lastTriggerTick = tick;
        this.game.bus.emit('rune:trigger', { id: trap.id, effect: trap.comboKey! });
      }
    }
  }

  private applyTrap(trap: TowerState, creep: CreepState, stats: TrapResolvedStats): void {
    if (!creep.alive) return;
    const tick = this.game.state.tick;

    // Direct damage
    if (stats.dmgMax > 0) {
      const dmg = randInt(this.game.rng, stats.dmgMin, stats.dmgMax);
      creep.hp -= dmg;
      trap.kills += creep.hp <= 0 ? 1 : 0;
      this.game.bus.emit('tower:hit', { id: trap.id, targetId: creep.id, damage: dmg });
      if (creep.hp <= 0) {
        creep.alive = false;
        const state = this.game.state;
        state.gold += creep.bounty;
        state.totalKills++;
        state.waveStats.killedThisWave++;
        this.game.bus.emit('creep:die', { id: creep.id, bounty: creep.bounty });
        this.game.bus.emit('gold:change', { gold: state.gold });
        return;
      }
    }

    // Trap effects
    for (const e of stats.effects) {
      this.applyEffect(creep, e, tick, stats);
    }
  }

  private applyEffect(c: CreepState, e: EffectKind, tick: number, stats: TrapResolvedStats): void {
    if (!c.alive) return;
    switch (e.kind) {
      case 'trap_slow': {
        const expires = tick + Math.round(e.duration * SIM_HZ);
        const factor = e.factor + (1 - e.factor) * c.slowResist;
        if (!c.slow || c.slow.expiresAt < expires || c.slow.factor > factor) {
          c.slow = { factor, expiresAt: expires };
        }
        break;
      }
      case 'trap_dot': {
        const expires = tick + Math.round(e.duration * SIM_HZ);
        if (!c.poison || c.poison.dps < e.dps) {
          c.poison = { dps: e.dps, expiresAt: expires, nextTick: tick + SIM_HZ };
        } else {
          c.poison.expiresAt = expires;
        }
        break;
      }
      case 'trap_explode': {
        const state = this.game.state;
        const r2 = (e.radius * TILE) * (e.radius * TILE);
        for (const other of state.creeps) {
          if (!other.alive || other.id === c.id) continue;
          if (!canTrigger(stats.targeting, other)) continue;
          const dx = other.px - c.px;
          const dy = other.py - c.py;
          if (dx * dx + dy * dy > r2) continue;
          const splashDmg = Math.round(randInt(this.game.rng, stats.dmgMin, stats.dmgMax) * e.falloff);
          other.hp -= splashDmg;
          if (other.hp <= 0) {
            other.alive = false;
            state.gold += other.bounty;
            state.totalKills++;
            state.waveStats.killedThisWave++;
            this.game.bus.emit('creep:die', { id: other.id, bounty: other.bounty });
            this.game.bus.emit('gold:change', { gold: state.gold });
          }
        }
        break;
      }
      case 'trap_root': {
        const expires = tick + Math.round(e.duration * SIM_HZ);
        if (!c.stun || c.stun.expiresAt < expires) {
          c.stun = { expiresAt: expires };
        }
        break;
      }
      case 'trap_knockback': {
        c.pathPos = Math.max(0, c.pathPos - e.distance);
        break;
      }
      default:
        break;
    }
  }
}

interface TrapResolvedStats {
  dmgMin: number;
  dmgMax: number;
  range: number;
  atkSpeed: number;
  effects: EffectKind[];
  targeting: 'all' | 'ground' | 'air';
}

function trapStats(t: TowerState): TrapResolvedStats | null {
  if (!t.comboKey) return null;
  const combo = COMBO_BY_NAME.get(t.comboKey);
  if (!combo) return null;
  const s = comboStatsAtTier(combo, t.upgradeTier ?? 0);
  return {
    dmgMin: s.dmgMin,
    dmgMax: s.dmgMax,
    range: s.range,
    atkSpeed: s.atkSpeed,
    effects: s.effects,
    targeting: s.targeting,
  };
}

function canTrigger(targeting: 'all' | 'ground' | 'air', creep: CreepState): boolean {
  if (targeting === 'all') return true;
  const isAir = !!creep.flags?.air;
  return targeting === 'air' ? isAir : !isAir;
}

function randInt(rng: { next(): number }, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng.next() * (max - min + 1));
}
