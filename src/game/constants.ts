/**
 * Tunables for the whole game. Keeping these in one place makes the
 * balance pass mechanical.
 */

export const TILE = 36;          // pixels per tile (rendered)
export const SIM_HZ = 60;        // simulation tick frequency
export const SIM_DT = 1 / SIM_HZ;

/** Starting resources. Gold is intentionally tight — chance-tier upgrades are paid out of wave bounties. */
export const START_LIVES = 50;
export const START_GOLD = 10;

/** Speed multipliers exposed in the HUD. */
export const SPEEDS = [1, 2, 4] as const;
export type SpeedMultiplier = (typeof SPEEDS)[number];

/**
 * Random-draw odds per chance-tier level. Rows are L0..L8; columns are
 * Chipped, Flawed, Normal, Flawless, Perfect. Sourced from chance_tiers.md.
 */
export const CHANCE_TIER_WEIGHTS: readonly (readonly number[])[] = [
  [1.00, 0.00, 0.00, 0.00, 0.00], // L0
  [0.70, 0.30, 0.00, 0.00, 0.00], // L1
  [0.60, 0.30, 0.10, 0.00, 0.00], // L2
  [0.50, 0.30, 0.20, 0.00, 0.00], // L3
  [0.40, 0.30, 0.20, 0.10, 0.00], // L4
  [0.30, 0.30, 0.30, 0.10, 0.00], // L5
  [0.20, 0.30, 0.30, 0.20, 0.00], // L6
  [0.10, 0.30, 0.30, 0.30, 0.00], // L7
  [0.00, 0.30, 0.30, 0.30, 0.10], // L8
];

/** Cost in gold to upgrade chance tier from index N to N+1 (length 8). */
export const CHANCE_TIER_UPGRADE_COST: readonly number[] = [20, 50, 80, 110, 140, 170, 200, 230];

export const MAX_CHANCE_TIER = CHANCE_TIER_WEIGHTS.length - 1;

/** Per-quality base gold cost (sell refund rounds down). */
export const QUALITY_BASE_COST: Record<number, number> = {
  1: 12,
  2: 60,
  3: 250,
  4: 1000,
  5: 4000,
};
