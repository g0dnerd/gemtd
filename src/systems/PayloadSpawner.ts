import type { CreepState, State } from '../game/State';
import type { EventBus } from '../events/EventBus';
import { nearestPathPos } from './Pathfinding';
import { FINE_TILE } from '../game/constants';

export interface PendingSpawn {
  creep: CreepState;
  spawnAt: number;
}

const STAGGER_TICKS = 10;

export function spawnContainerPayload(
  dead: CreepState,
  state: State,
  bus: EventBus,
  nextId: () => number,
  pending: PendingSpawn[],
): void {
  if (!dead.payload) return;
  let delay = 0;
  for (const p of dead.payload) {
    const isAir = !!p.flags?.air;
    const route = isAir ? state.airRoute : state.flatRoute;
    if (route.length === 0) continue;
    let pathPos = dead.pathPos;
    if (!!dead.flags?.air !== isAir) {
      pathPos = nearestPathPos(dead.px, dead.py, route, FINE_TILE);
    }
    pathPos = Math.min(pathPos, route.length - 2);
    for (let i = 0; i < p.count; i++) {
      const id = nextId();
      const creep: CreepState = {
        id,
        kind: p.kind,
        pathPos,
        px: dead.px,
        py: dead.py,
        hp: p.hp,
        maxHp: p.hp,
        speed: p.speed,
        bounty: p.bounty,
        color: p.color,
        armor: p.armor,
        slowResist: p.slowResist,
        stunResist: p.stunResist,
        poisonResist: p.poisonResist,
        flags: { ...p.flags },
        alive: true,
        armorReduction: 0,
        vulnerability: 0,
        payload: p.payload,
        spawnTick: state.tick + delay,
      };
      if (delay === 0) {
        state.creeps.push(creep);
        state.waveStats.spawnedThisWave++;
        state.waveStats.totalToSpawn++;
        bus.emit('creep:spawn', { id, kind: p.kind, maxHp: p.hp });
      } else {
        pending.push({ creep, spawnAt: state.tick + delay });
        state.waveStats.totalToSpawn++;
      }
      delay += STAGGER_TICKS;
    }
  }
}

export function drainPendingSpawns(
  state: State,
  bus: EventBus,
  pending: PendingSpawn[],
): void {
  const tick = state.tick;
  let i = 0;
  while (i < pending.length) {
    const entry = pending[i];
    if (entry.spawnAt <= tick) {
      entry.creep.spawnTick = tick;
      state.creeps.push(entry.creep);
      state.waveStats.spawnedThisWave++;
      bus.emit('creep:spawn', { id: entry.creep.id, kind: entry.creep.kind, maxHp: entry.creep.maxHp });
      pending[i] = pending[pending.length - 1];
      pending.pop();
    } else {
      i++;
    }
  }
}
