/**
 * Serializable game state. Game.ts owns one of these and mutates it in place;
 * UI reads from it on each frame. Keeping it JSON-clean means mid-run save
 * is a cheap follow-on if we ever change our mind.
 */

import { Cell } from "../data/map";
import type { CreepKind } from "../data/creeps";
import type { WaveDef } from "../data/waves";
import type { GemType, Quality } from "../render/theme";

export interface CreepPayload {
  kind: CreepKind;
  count: number;
  hp: number;
  speed: number;
  bounty: number;
  color: GemType;
  armor: number;
  slowResist: number;
  stunResist: number;
  poisonResist: number;
  flags: { boss?: boolean; armored?: boolean; air?: boolean };
  payload?: CreepPayload[];
}

export type Phase = "title" | "build" | "wave" | "gameover" | "victory";

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
  /** Cumulative damage dealt (post-armor). */
  totalDamage: number;
  /** Damage dealt during the current wave only (reset at wave start). */
  waveDamage: number;
  /** Wave number when this tower was placed. */
  placedWave: number;
  /** Beam state — tracks current beam target and ramp stacks. */
  beam?: { targetId: number; stacks: number };
  /** Trap towers don't block pathing and trigger on creep proximity instead of firing projectiles. */
  isTrap?: boolean;
  /** Tick when the trap last triggered — gates re-arm cooldown. */
  lastTriggerTick?: number;
  /** Attack counter for periodic_nova. */
  attackCount?: number;
  /** Focus crit tracking — current target and accumulated stacks. */
  focusTarget?: { creepId: number; stacks: number };
  /** Per-creep burn exposure ticks for prox_burn_ramp. */
  burnExposure?: Record<number, number>;
  /** Timer tick for periodic_freeze. */
  lastFreezeTick?: number;
  /** Creep IDs in burn aura last tick — for linger_burn exit detection. */
  burnAuraCreepIds?: number[];
  /** Tick when aura silence expires (mycoid spore pulse). */
  silencedUntil?: number;
  /** Eruption pressure stacks — persists between waves. */
  pressureStacks?: number;
  /** Momentum stacks for Pyrite-style towers (resets when idle). */
  momentumStacks?: number;
  /** Ametrine adaptive tower: current firing mode. */
  ametrineMode?: "focus" | "scatter";
  /** Tick when ametrineMode last flipped — gates mode-switch cooldown. */
  lastModeSwitchTick?: number;
  /**
   * Support-assist accumulators (telemetry-only; never affect damage dealt).
   * Cumulative over the run; the collector snapshots per-wave deltas.
   * - dmgAuraAssist  — extra damage this tower's `aura_dmg` enabled on buffed towers.
   * - vulnAssist     — extra damage this tower's `vulnerability_aura`/`frostbite` enabled.
   * - armorShredAssist — extra damage this tower's armor reduction (any of the 4 mechanisms) enabled.
   * - atkSpeedAssist — extra damage this tower's `aura_atkspeed` enabled (more shots).
   * - bonusGoldGenerated — gold awarded by this tower's `bonus_gold` rolls.
   * Optional so existing tower-construction sites need no change; read as `?? 0`.
   */
  dmgAuraAssist?: number;
  vulnAssist?: number;
  armorShredAssist?: number;
  atkSpeedAssist?: number;
  bonusGoldGenerated?: number;
}

export interface RockState {
  x: number;
  y: number;
  /** Footprint anchor id — all 4 cells of one 2x2 rock share the same id. */
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
  armor: number;
  speed: number;
  bounty: number;
  /** Visual color hint for non-gem creeps. */
  color: GemType;
  /** 0–1. Fraction of slow effect negated (0 = full slow, 1 = immune). */
  slowResist: number;
  /** 0–1. Fraction of stun duration negated (0 = full stun, 1 = immune). */
  stunResist: number;
  /** 0–1. Fraction of poison damage negated (0 = full damage, 1 = immune). */
  poisonResist: number;
  /** Active status effects. */
  slow?: { factor: number; expiresAt: number };
  poison?: {
    dps: number;
    expiresAt: number;
    nextTick: number;
    ownerId: number;
  };
  stun?: { expiresAt: number };
  /** Proximity-aura armor reduction applied this tick (reset each step). */
  armorReduction: number;
  /**
   * Per-source prox armor-reduce contributions this tick (towerId → armor pts).
   * `armorReduction` is the applied (max) value; this map is for assist attribution
   * only. Reset each tick alongside `armorReduction`. JSON-clean (plain Record).
   */
  armorReductionSources?: Record<number, number>;
  /** On-hit armor debuff (duration-tracked, separate from proximity armorReduction). */
  armorDebuff?: { value: number; expiresAt: number; ownerId: number };
  /** Proximity slow applied this tick (reset each step, like armorReduction). */
  proxSlowFactor?: number;
  /** Boss / armored / air flags. */
  flags?: { boss?: boolean; armored?: boolean; air?: boolean };
  alive: boolean;
  /** Heal-over-time buff from a nearby healer creep. */
  healBuff?: { hpPerTick: number; expiresAt: number };
  /** Tunneler burrow state — untargetable while active. */
  burrowed?: { expiresAt: number };
  /** Tick when this creep's special ability can next fire. */
  abilityCooldown?: number;
  /** Vulnerability multiplier from auras/frostbite — reset each tick. */
  vulnerability: number;
  /**
   * Per-source vulnerability contributions this tick (towerId → vuln pct), summing to
   * `vulnerability`. Assist attribution only; reset each tick. JSON-clean (plain Record).
   */
  vulnSources?: Record<number, number>;
  /** Sim tick when this creep was spawned (for ticks-to-kill telemetry). */
  spawnTick?: number;
  /** Accumulated armor decay from Uranium radiation (persistent). */
  radiationArmor?: number;
  /**
   * Per-source accumulated radiation armor (towerId → armor pts). Persists like
   * `radiationArmor` (NOT reset per tick); their sum tracks `radiationArmor` (modulo
   * the per-source cap). Assist attribution only. JSON-clean (plain Record).
   */
  radiationArmorSources?: Record<number, number>;
  /** Lingering burn after leaving a burn aura. */
  lingerBurn?: { dps: number; ticksLeft: number; ownerId: number };
  /** Stacking armor shred from Paraiba hits. */
  armorStacks?: {
    count: number;
    armorPer: number;
    decayTicks: number;
    lastDecayTick: number;
    ownerId: number;
  };
  /** Poison spread params — stored when stun_poison applies. */
  poisonSpread?: { count: number; radius: number };
  /** Afterburn DoT from eruption (short/intense, distinct from poison). */
  afterburn?: {
    dps: number;
    expiresAt: number;
    nextTick: number;
    ownerId: number;
  };
  /** Chrysalid awakened state — high resistances + speed boost. */
  chrysalidAwakened?: boolean;
  /** Chrysalid dodge counter — ignores every Nth hit when awakened. */
  chrysalidHitCounter?: number;
  /** Gestation enraged state — at 50% HP, begins periodic tower-silence pulse. */
  gestationEnraged?: boolean;
  /** Creeps to spawn when this container dies. */
  payload?: CreepPayload[];
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
  /** Set when the projectile was a critical hit — triggers crit_splash on impact. */
  wasCrit?: boolean;
  /** Set when this is the Nth demote shot — grounds air targets on impact. */
  isDemoteShot?: boolean;
  /** Splash at landing position, no direct hit tracking (mortar). */
  isGroundTarget?: boolean;
  /** Parabolic arc height in pixels for rendering. */
  arcHeight?: number;
  /** Number of additional targets this projectile can pierce through. */
  pierceCount?: number;
  /** Whether this projectile should trigger kill_explode on kill. */
  killExplode?: { radius: number; falloff: number };
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
  /** Tile grid. Mutated when towers are placed. */
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
  /** Tower id that was kept this round; persists through wave phase for deferred downgrade. */
  keptTowerIdThisRound: number | null;
  /** Persistent chance-tier (0..8). Affects quality distribution of new draws. */
  chanceTier: number;
  /** Undo stack for the current build phase. */
  undoStack: BuildAction[];
  selectedTowerId: number | null;
  /** Currently selected rock anchor id (mutually exclusive with selectedTowerId). */
  selectedRockId: number | null;
  /** Currently selected creep id (mutually exclusive with tower/rock). */
  selectedCreepId: number | null;
  /** Lifetime count of rocks the player has demolished. */
  rocksRemoved: number;
  /** Whether the one-per-round downgrade has been used this round. */
  downgradeUsedThisRound: boolean;
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
  /** Creep kinds the player has already seen in the threat panel this run. */
  seenCreepKinds: CreepKind[];
  /** Per-wave record of which special kinds were new when that wave first appeared in the threat panel. */
  newKindsByWave: Record<number, CreepKind[]>;
  /** Endless mode — procedurally generate waves past 50. */
  endless: boolean;
  /** Override wave definition for debug mode. */
  debugWaveDef?: WaveDef;
  /** Gem weakness rotation — shuffled blocks of 7 gem types (excludes opal). */
  gemWeaknesses: GemType[];
}

/** The currently-active draw slot (lowest unplaced, or whatever activeDrawSlot points at). null if none. */
export function activeDraw(state: State): DrawSlot | null {
  if (state.activeDrawSlot === null) return null;
  const s = state.draws.find((d) => d.slotId === state.activeDrawSlot);
  return s && s.placedTowerId === null ? s : null;
}

/** True if every draw slot has been placed (gates wave start). */
export function allDrawsPlaced(state: State): boolean {
  return (
    state.draws.length > 0 && state.draws.every((d) => d.placedTowerId !== null)
  );
}

/** Lowest-slotId unplaced draw, or null. Used to auto-advance after a place. */
export function nextUnplacedSlot(state: State): number | null {
  const remaining = state.draws.filter((d) => d.placedTowerId === null);
  if (remaining.length === 0) return null;
  return Math.min(...remaining.map((d) => d.slotId));
}

export function emptyState(grid: Cell[][], totalWaves: number): State {
  return {
    phase: "title",
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
    keptTowerIdThisRound: null,
    chanceTier: 0,
    undoStack: [],
    selectedTowerId: null,
    selectedRockId: null,
    selectedCreepId: null,
    rocksRemoved: 0,
    downgradeUsedThisRound: false,
    tick: 0,
    totalWaves,
    waveStats: {
      spawnedThisWave: 0,
      killedThisWave: 0,
      leakedThisWave: 0,
      totalToSpawn: 0,
    },
    seenCreepKinds: [],
    newKindsByWave: {},
    endless: false,
    gemWeaknesses: [],
  };
}

export function creepDeathMetrics(
  c: CreepState,
  state: State,
): { pathProgress: number; ticksAlive: number } {
  const route = c.flags?.air ? state.airRoute : state.flatRoute;
  return {
    pathProgress:
      route.length > 1 ? Math.min(1, c.pathPos / (route.length - 1)) : 0,
    ticksAlive: state.tick - (c.spawnTick ?? state.tick),
  };
}
