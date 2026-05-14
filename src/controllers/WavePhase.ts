/**
 * Wave-phase logic. Spawns creeps along the path, advances them each tick,
 * applies leak / death, ends the wave when all creeps are dead or leaked.
 */

import { Game } from '../game/Game';
import { CreepState } from '../game/State';
import { CREEP_ARCHETYPES } from '../data/creeps';
import { WAVES, type WaveDef, waveTotalCount, groupForSpawn } from '../data/waves';
import { FINE_TILE, GRID_SCALE, SIM_DT, SIM_HZ, TILE } from '../game/constants';

const HEALER_INTERVAL = 5 * SIM_HZ;
const HEALER_RADIUS_PX = 3 * TILE;
const HEALER_BUFF_DURATION = 2 * SIM_HZ;
const HEALER_HEAL_PCT = 0.00075;

const WIZARD_COOLDOWN = 12 * SIM_HZ;
const WIZARD_RADIUS_PX = 3 * TILE;
const WIZARD_TELEPORT_TILES = 8;

const TUNNELER_COOLDOWN = 12 * SIM_HZ;
const TUNNELER_BURROW_DURATION = 3.5 * SIM_HZ;

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
    const def = this.waveDef()!;
    this.game.state.waveStats = {
      spawnedThisWave: 0,
      killedThisWave: 0,
      leakedThisWave: 0,
      totalToSpawn: waveTotalCount(def),
    };
  }

  constructor(private game: Game) {}

  private waveDef(): WaveDef | undefined {
    return this.game.state.debugWaveDef ?? WAVES[this.wave - 1];
  }

  step(): void {
    const state = this.game.state;
    if (state.phase !== 'wave') return;
    const def = this.waveDef();
    if (!def) return;

    this.elapsed += SIM_DT;
    this.spawnTimer += SIM_DT;

    const total = waveTotalCount(def);

    // Spawn creeps according to interval.
    if (this.spawnedSoFar < total && this.spawnTimer >= def.interval) {
      this.spawnTimer = 0;
      this.spawnCreep();
    } else if (this.spawnedSoFar < total && this.spawnedSoFar === 0) {
      // Spawn the first one immediately.
      this.spawnCreep();
    }

    // Advance creeps.
    for (const c of state.creeps) {
      if (!c.alive) continue;
      this.advanceCreep(c);
      if (state.phase !== 'wave') return;
    }

    // Creep abilities.
    for (const c of state.creeps) {
      if (!c.alive) continue;
      this.tickAbility(c);
    }

    // Prune dead creeps; if all dead AND all spawned, end the wave.
    let write = 0;
    for (let i = 0; i < state.creeps.length; i++) {
      if (state.creeps[i].alive || this.recentlyDied(state.creeps[i])) {
        state.creeps[write++] = state.creeps[i];
      }
    }
    state.creeps.length = write;
    if (this.spawnedSoFar >= total && state.creeps.every((c) => !c.alive)) {
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
    const def = this.waveDef()!;
    const group = groupForSpawn(def, this.spawnedSoFar);
    const arch = CREEP_ARCHETYPES[group.kind];
    const isAir = !!arch.flags.air;
    const route = this.routeFor(isAir);
    if (route.length === 0) return;
    const start = route[0];
    const id = this.game.nextId();
    const hp = Math.round(group.hp * arch.hpMult);
    const creep: CreepState = {
      id,
      kind: arch.kind,
      pathPos: 0,
      px: start.x * FINE_TILE + FINE_TILE / 2,
      py: start.y * FINE_TILE + FINE_TILE / 2,
      hp,
      maxHp: hp,
      speed: arch.speed,
      bounty: Math.round(group.bounty * arch.bountyMult),
      color: arch.color,
      alive: true,
      armorReduction: 0,
      armor: group.armor ?? arch.defaultArmor ?? 0,
      slowResist: group.slowResist,
      flags: arch.flags,
      vulnerability: 0,
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
    if (c.proxSlowFactor !== undefined) {
      speed *= c.proxSlowFactor;
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

    // Clear expired buffs/states
    if (c.burrowed && c.burrowed.expiresAt <= this.game.state.tick) c.burrowed = undefined;
    if (c.healBuff && c.healBuff.expiresAt <= this.game.state.tick) c.healBuff = undefined;
    if (c.armorDebuff && c.armorDebuff.expiresAt <= this.game.state.tick) c.armorDebuff = undefined;

    // Heal buff ticks
    if (c.healBuff) {
      c.hp = Math.min(c.maxHp, c.hp + c.healBuff.hpPerTick);
    }

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
    const waveNum = state.wave;
    const baseCost = c.flags?.boss ? 6 : 1;
    const cost = baseCost + Math.floor(waveNum / 10);
    state.lives = Math.max(0, state.lives - cost);
    state.waveStats.leakedThisWave++;
    this.game.bus.emit('creep:leak', { id: c.id });
    this.game.bus.emit('lives:change', { lives: state.lives });
    if (state.lives <= 0) {
      this.endWave();
    }
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
    this.game.handleCreepDeath(c);
  }

  private tickAbility(c: CreepState): void {
    const tick = this.game.state.tick;
    if (c.stun && c.stun.expiresAt > tick) return;
    if (c.abilityCooldown && tick < c.abilityCooldown) return;

    switch (c.kind) {
      case 'healer':
        this.healerAbility(c, tick);
        break;
      case 'wizard':
        this.wizardAbility(c, tick);
        break;
      case 'tunneler':
        this.tunnelerAbility(c, tick);
        break;
    }
  }

  private healerAbility(c: CreepState, tick: number): void {
    c.abilityCooldown = tick + HEALER_INTERVAL;
    const state = this.game.state;
    const r2 = HEALER_RADIUS_PX * HEALER_RADIUS_PX;
    for (const other of state.creeps) {
      if (!other.alive || other.id === c.id) continue;
      const dx = other.px - c.px;
      const dy = other.py - c.py;
      if (dx * dx + dy * dy > r2) continue;
      const hpPerTick = Math.max(1, Math.round(other.maxHp * HEALER_HEAL_PCT));
      if (!other.healBuff || other.healBuff.expiresAt < tick + HEALER_BUFF_DURATION) {
        other.healBuff = { hpPerTick, expiresAt: tick + HEALER_BUFF_DURATION };
      }
    }
  }

  private wizardAbility(c: CreepState, tick: number): void {
    c.abilityCooldown = tick + WIZARD_COOLDOWN;
    const state = this.game.state;
    const r2 = WIZARD_RADIUS_PX * WIZARD_RADIUS_PX;
    const wpPositions = this.waypointPositions();
    for (const other of state.creeps) {
      if (!other.alive || other.id === c.id) continue;
      if (other.flags?.air) continue;
      const dx = other.px - c.px;
      const dy = other.py - c.py;
      if (dx * dx + dy * dy > r2) continue;
      const nextWp = wpPositions.find((wp) => wp > other.pathPos);
      if (nextWp === undefined) continue;
      const maxAdvance = nextWp - other.pathPos;
      const advance = Math.min(WIZARD_TELEPORT_TILES, maxAdvance);
      other.pathPos += advance;
    }
  }

  private tunnelerAbility(c: CreepState, tick: number): void {
    if (c.burrowed && c.burrowed.expiresAt > tick) return;
    c.abilityCooldown = tick + TUNNELER_COOLDOWN;
    c.burrowed = { expiresAt: tick + TUNNELER_BURROW_DURATION };
  }

  private waypointPositions(): number[] {
    const segs = this.game.state.routeSegments;
    const positions: number[] = [];
    let cumLen = 0;
    for (let i = 0; i < segs.length; i++) {
      cumLen += segs[i].length - (i > 0 ? 1 : 0);
      positions.push(cumLen - 1);
    }
    return positions;
  }

  private endWave(): void {
    const state = this.game.state;
    const def = this.waveDef()!;
    const lifeLost = this.livesAtStart - state.lives;
    if (state.waveStats.leakedThisWave === 0) {
      state.gold += def.bonus;
      this.goldEarned += def.bonus;
    }
    this.game.bus.emit('gold:change', { gold: state.gold });
    this.game.endWave(lifeLost, this.goldEarned);
  }
}
