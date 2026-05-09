/**
 * Serializable game state. Game.ts owns one of these and mutates it in place;
 * UI reads from it on each frame. Keeping it JSON-clean means mid-run save
 * is a cheap follow-on if we ever change our mind.
 */

import { Cell } from '../data/map';
import type { CreepKind } from '../data/creeps';
import type { GemType, Quality } from '../render/theme';

export type Phase = 'title' | 'build' | 'wave' | 'gameover' | 'victory';

/** Number of gems drawn at the start of each build phase (canonical: 5). */
export const DRAW_COUNT = 5;

export interface TowerState {
  id: number;
  x: number;
  y: number;
  gem: GemType;
  quality: Quality;
  /** When > 0, this is a multi-gem special tower keyed in combos.ts. */
  comboKey?: string;
  /** Current upgrade tier for combo towers (0 = base, 1+ = upgraded). */
  upgradeTier?: number;
  /** Last fire tick — used to gate attack speed. */
  lastFireTick: number;
  /** Count of kills for fun stats. */
  kills: number;
}

export interface RockState {
  x: number;
  y: number;
  /** Footprint anchor id — all 4 cells of one 2×2 rock share the same id. */
  id: number;
  /** Wave whose build phase this rock was placed in. Used to gate removal. */
  placedAtBuildOfWave: number;
}

export interface CreepState {
  id: number;
  /** Archetype — drives sprite selection. */
  kind: CreepKind;
  /** Fractional position along the flattened route, in tiles. */
  pathPos: number;
  /** Cached pixel position for rendering — populated each tick. */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  speed: number;
  bounty: number;
  /** Visual color hint for non-gem creeps. */
  color: GemType;
  /** 0–1. Fraction of slow effect negated (0 = full slow, 1 = immune). */
  slowResist: number;
  /** Active status effects. */
  slow?: { factor: number; expiresAt: number };
  poison?: { dps: number; expiresAt: number; nextTick: number };
  stun?: { expiresAt: number };
  /** Proximity-aura armor reduction applied this tick (reset each step). */
  armorReduction: number;
  /** Boss / armored / air flags. */
  flags?: { boss?: boolean; armored?: boolean; air?: boolean };
  alive: boolean;
}

export interface ProjectileState {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  targetId: number;
  /** 0..1 progress along flight. */
  t: number;
  speed: number;
  damage: number;
  ownerTowerId: number;
  /** Color hint, defaults to tower's gem color. */
  color: GemType;
  alive: boolean;
}

export interface DrawOffer {
  gem: GemType;
  quality: Quality;
  cost: number;
}

/** A single slot in the wave-start 5-draw. */
export interface DrawSlot {
  /** 0..DRAW_COUNT-1 — stable for this build phase. */
  slotId: number;
  gem: GemType;
  quality: Quality;
  /** id of the placed tower, or null while still in hand. */
  placedTowerId: number | null;
}

export interface BuildAction {
  /** Reverses an action — used by undo. */
  undo: () => void;
  description: string;
}

export interface State {
  phase: Phase;
  wave: number;
  lives: number;
  gold: number;
  totalKills: number;
  /** 1 / 2 / 4. */
  speed: number;
  /** Tile grid. Mutated when towers are placed/sold. */
  grid: Cell[][];
  towers: TowerState[];
  rocks: RockState[];
  creeps: CreepState[];
  projectiles: ProjectileState[];
  /** Cached creep route. Re-computed when grid changes. */
  routeSegments: Array<Array<{ x: number; y: number }>>;
  flatRoute: Array<{ x: number; y: number }>;
  /** Straight-line waypoint-to-waypoint route for air creeps (ignores maze). */
  airRoute: Array<{ x: number; y: number }>;
  /** 5-gem random draw for the current build phase (empty outside build). */
  draws: DrawSlot[];
  /** slotId currently selected for placement (defaults to lowest unplaced). */
  activeDrawSlot: number | null;
  /** Tower id from the current build phase the player marked as the keep; the others rock at wave start. */
  designatedKeepTowerId: number | null;
  /** Persistent chance-tier (0..8). Affects quality distribution of new draws. */
  chanceTier: number;
  /** Undo stack for the current build phase. */
  undoStack: BuildAction[];
  selectedTowerId: number | null;
  /** Currently selected rock anchor id (mutually exclusive with selectedTowerId). */
  selectedRockId: number | null;
  /** Lifetime count of rocks the player has demolished — drives removal cost scaling. */
  rocksRemoved: number;
  /** Total simulation ticks since game start. */
  tick: number;
  /** Number of waves remaining; computed on init. */
  totalWaves: number;
  /** Most recent in-wave events (for HUD: spawn count remaining etc.). */
  waveStats: {
    spawnedThisWave: number;
    killedThisWave: number;
    leakedThisWave: number;
    totalToSpawn: number;
  };
}

/** The currently-active draw slot (lowest unplaced, or whatever activeDrawSlot points at). null if none. */
export function activeDraw(state: State): DrawSlot | null {
  if (state.activeDrawSlot === null) return null;
  const s = state.draws.find((d) => d.slotId === state.activeDrawSlot);
  return s && s.placedTowerId === null ? s : null;
}

/** True if every draw slot has been placed (gates wave start). */
export function allDrawsPlaced(state: State): boolean {
  return state.draws.length > 0 && state.draws.every((d) => d.placedTowerId !== null);
}

/** Lowest-slotId unplaced draw, or null. Used to auto-advance after a place. */
export function nextUnplacedSlot(state: State): number | null {
  const remaining = state.draws.filter((d) => d.placedTowerId === null);
  if (remaining.length === 0) return null;
  return Math.min(...remaining.map((d) => d.slotId));
}

export function emptyState(grid: Cell[][], totalWaves: number): State {
  return {
    phase: 'title',
    wave: 0,
    lives: 0,
    gold: 0,
    totalKills: 0,
    speed: 1,
    grid,
    towers: [],
    rocks: [],
    creeps: [],
    projectiles: [],
    routeSegments: [],
    flatRoute: [],
    airRoute: [],
    draws: [],
    activeDrawSlot: null,
    designatedKeepTowerId: null,
    chanceTier: 0,
    undoStack: [],
    selectedTowerId: null,
    selectedRockId: null,
    rocksRemoved: 0,
    tick: 0,
    totalWaves,
    waveStats: { spawnedThisWave: 0, killedThisWave: 0, leakedThisWave: 0, totalToSpawn: 0 },
  };
}
