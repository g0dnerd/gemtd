/**
 * Tunables for the whole game. Keeping these in one place makes the
 * balance pass mechanical.
 */

/**
 * Pixel size of one *coarse* tile — kept as the canonical unit for game
 * balance (tower ranges, creep speeds, splash radii are all expressed in
 * coarse tiles). Visual cells are drawn at {@link FINE_TILE}.
 */
export const TILE = 36;

/**
 * The placement grid runs at 2× resolution: each coarse tile is 2×2 fine
 * cells, each fine cell is FINE_TILE px on a side. Towers, rocks, and
 * pathfinding all live on the fine grid; creep movement and ranges still
 * use TILE for game-balance numbers.
 */
export const GRID_SCALE = 2;
export const FINE_TILE = TILE / GRID_SCALE;

export const SIM_HZ = 60; // simulation tick frequency
export const SIM_DT = 1 / SIM_HZ;

/** Starting resources. Gold is intentionally tight — chance-tier upgrades are paid out of wave bounties. */
export const START_LIVES = 50;
export const START_GOLD = 10;

/** Speed multipliers exposed in the HUD. */
export const SPEEDS = [1, 2, 4, 8] as const;
export type SpeedMultiplier = (typeof SPEEDS)[number];

/**
 * Random-draw odds per chance-tier level. Rows are L0..L8; columns are
 * Chipped, Flawed, Normal, Flawless, Perfect. Sourced from chance_tiers.md.
 */
export const CHANCE_TIER_WEIGHTS: readonly (readonly number[])[] = [
  [1.0, 0.0, 0.0, 0.0, 0.0], // L0
  [0.7, 0.3, 0.0, 0.0, 0.0], // L1
  [0.6, 0.3, 0.1, 0.0, 0.0], // L2
  [0.5, 0.3, 0.2, 0.0, 0.0], // L3
  [0.4, 0.3, 0.2, 0.1, 0.0], // L4
  [0.3, 0.3, 0.3, 0.1, 0.0], // L5
  [0.2, 0.3, 0.3, 0.2, 0.0], // L6
  [0.1, 0.3, 0.3, 0.3, 0.0], // L7
  [0.0, 0.3, 0.3, 0.3, 0.1], // L8
];

/** Cost in gold to upgrade chance tier from index N to N+1 (length 8). */
export const CHANCE_TIER_UPGRADE_COST: readonly number[] = [
  30, 75, 120, 160, 210, 260, 300, 350,
];

export const MAX_CHANCE_TIER = CHANCE_TIER_WEIGHTS.length - 1;

/** Per-quality base gold cost. */
export const QUALITY_BASE_COST: Record<number, number> = {
  1: 12,
  2: 60,
  3: 250,
  4: 1000,
  5: 4000,
};
