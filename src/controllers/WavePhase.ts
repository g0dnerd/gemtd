/**
 * Wave-phase logic. Spawns creeps along the path, advances them each tick,
 * applies leak / death, ends the wave when all creeps are dead or leaked.
 */

import { Game } from '../game/Game';
import { CreepState } from '../game/State';
import { CREEP_ARCHETYPES } from '../data/creeps';
import { WAVES } from '../data/waves';
import { FINE_TILE, GRID_SCALE, SIM_DT } from '../game/constants';

export class WavePhase {
  private wave = 0;
  private spawnedSoFar = 0;
  private spawnTimer = 0;
  /** seconds since wave start */
  private elapsed = 0;
  private goldEarned = 0;
  private livesAtStart = 0;

  onEnter(wave: number): void {
    this.wave = wave;
    this.spawnedSoFar = 0;
    this.spawnTimer = 0;
    this.elapsed = 0;
    this.goldEarned = 0;
    this.livesAtStart = this.game.state.lives;
    const def = WAVES[wave - 1];
    this.game.state.waveStats = {
      spawnedThisWave: 0,
      killedThisWave: 0,
      leakedThisWave: 0,
      totalToSpawn: def.count,
    };
  }

  constructor(private game: Game) {}

  step(): void {
    const state = this.game.state;
    if (state.phase !== 'wave') return;
    const def = WAVES[this.wave - 1];
    if (!def) return;

    this.elapsed += SIM_DT;
    this.spawnTimer += SIM_DT;

    // Spawn creeps according to interval.
    if (this.spawnedSoFar < def.count && this.spawnTimer >= def.interval) {
      this.spawnTimer = 0;
      this.spawnCreep();
    } else if (this.spawnedSoFar < def.count && this.spawnedSoFar === 0) {
      // Spawn the first one immediately.
      this.spawnCreep();
    }

    // Advance creeps.
    for (const c of state.creeps) {
      if (!c.alive) continue;
      this.advanceCreep(c);
    }

    // Prune dead creeps; if all dead AND all spawned, end the wave.
    state.creeps = state.creeps.filter((c) => c.alive || this.recentlyDied(c));
    if (this.spawnedSoFar >= def.count && state.creeps.every((c) => !c.alive)) {
      this.endWave();
    }
  }

  private recentlyDied(_c: CreepState): boolean {
    // Could keep dying corpses for fadeout — for now, just drop them.
    return false;
  }

  private routeFor(isAir: boolean): Array<{ x: number; y: number }> {
    return isAir ? this.game.state.airRoute : this.game.state.flatRoute;
  }

  private spawnCreep(): void {
    const def = WAVES[this.wave - 1];
    const arch = CREEP_ARCHETYPES[def.kind];
    const isAir = !!arch.flags.air;
    const route = this.routeFor(isAir);
    if (route.length === 0) return;
    const start = route[0];
    const id = this.game.nextId();
    const hp = Math.round(def.hp * arch.hpMult);
    const creep: CreepState = {
      id,
      kind: arch.kind,
      pathPos: 0,
      px: start.x * FINE_TILE + FINE_TILE / 2,
      py: start.y * FINE_TILE + FINE_TILE / 2,
      hp,
      maxHp: hp,
      speed: arch.speed,
      bounty: Math.round(def.bounty * arch.bountyMult),
      color: arch.color,
      alive: true,
      armorReduction: 0,
      slowResist: def.slowResist,
      flags: arch.flags,
    };
    this.game.state.creeps.push(creep);
    this.spawnedSoFar++;
    this.game.state.waveStats.spawnedThisWave++;
    this.game.bus.emit('creep:spawn', { id });
  }

  private advanceCreep(c: CreepState): void {
    if (c.stun && c.stun.expiresAt > this.game.state.tick) return;
    let speed = c.speed;
    if (c.slow && c.slow.expiresAt > this.game.state.tick) {
      speed *= c.slow.factor;
    }
    const isAir = !!c.flags?.air;
    const route = this.routeFor(isAir);
    if (route.length === 0) return;
    c.pathPos += speed * GRID_SCALE * SIM_DT;
    if (c.pathPos >= route.length - 1) {
      c.alive = false;
      this.leak(c);
      return;
    }
    const i = Math.floor(c.pathPos);
    const tA = route[i];
    const tB = route[i + 1] ?? tA;
    const frac = c.pathPos - i;
    c.px = (tA.x + (tB.x - tA.x) * frac) * FINE_TILE + FINE_TILE / 2;
    c.py = (tA.y + (tB.y - tA.y) * frac) * FINE_TILE + FINE_TILE / 2;

    // Poison ticks
    if (c.poison && c.poison.expiresAt > this.game.state.tick) {
      if (this.game.state.tick >= c.poison.nextTick) {
        c.hp -= c.poison.dps;
        c.poison.nextTick = this.game.state.tick + 60; // 1s @ 60Hz
      }
    }
    if (c.hp <= 0) {
      this.kill(c);
    }
  }

  private leak(c: CreepState): void {
    const state = this.game.state;
    const cost = c.flags?.boss ? 8 : 1;
    state.lives = Math.max(0, state.lives - cost);
    state.waveStats.leakedThisWave++;
    this.game.bus.emit('creep:leak', { id: c.id });
    this.game.bus.emit('lives:change', { lives: state.lives });
  }

  private kill(c: CreepState): void {
    const state = this.game.state;
    c.alive = false;
    state.gold += c.bounty;
    state.totalKills++;
    state.waveStats.killedThisWave++;
    this.goldEarned += c.bounty;
    this.game.bus.emit('creep:die', { id: c.id, bounty: c.bounty });
    this.game.bus.emit('gold:change', { gold: state.gold });
  }

  private endWave(): void {
    const state = this.game.state;
    const def = WAVES[this.wave - 1];
    const lifeLost = this.livesAtStart - state.lives;
    state.gold += def.bonus;
    this.goldEarned += def.bonus;
    this.game.bus.emit('gold:change', { gold: state.gold });
    this.game.endWave(lifeLost, this.goldEarned);
  }
}
