/**
 * Pixel grids for tier silhouettes (T1..T5), 10 special-combo silhouettes, and
 * the 4 rock variants. Ported byte-for-byte from the design handoff
 * (gem-sprites.jsx).
 *
 * Cell value convention:
 *   0 = transparent
 *   1 = palette.light
 *   2 = palette.mid
 *   3 = palette.dark
 *   4 = OUTLINE (#0a0510)
 *   5 = palette.sparkle (specials, mossy/crystal rocks)
 *   6 = palette.extra (crystal rock only)
 */

import type { PixelGrid } from "./sprites";
import type { GemType, Quality } from "./theme";

// ===== Opal iridescent fleck overlay =====================================

const OPAL_FLECKS: Record<Quality, [number, number][]> = {
  1: [[4, 8], [4, 4]],
  2: [[3, 3], [5, 4], [6, 2]],
  3: [[2, 2], [4, 4], [5, 3], [3, 5]],
  4: [[3, 1], [4, 2], [2, 4], [5, 4]],
  5: [[4, 1], [3, 3], [5, 5], [2, 6], [6, 3]],
};

export function applyOpalFlecks(grid: PixelGrid, q: Quality): number[][] {
  const next = grid.map(row => row.slice());
  for (const [x, y] of OPAL_FLECKS[q]) {
    const cell = next[y]?.[x];
    if (cell !== undefined && cell !== 0 && cell !== 4) next[y][x] = 5;
  }
  return next;
}

export const OPAL_FLECK_COLOR = 0x7cf0c8;
export const OPAL_FLECK_CSS = '#7cf0c8';
export const OPAL_FRAME_COUNT = 8;

export function opalFleckHue(frame: number): number {
  const h = ((165 + frame * 45) % 360) / 360;
  const s = 0.8;
  const l = 0.7;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

// ===== Tier silhouettes (10×10) =========================================

/** T1 Chipped — three broken pieces. */
export const TIER_SHARD: PixelGrid = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 4, 4, 0, 0, 0, 0, 0],
  [0, 0, 4, 2, 3, 4, 0, 4, 4, 0],
  [0, 4, 2, 3, 3, 4, 4, 2, 3, 4],
  [0, 4, 3, 3, 4, 0, 4, 3, 3, 4],
  [0, 0, 4, 4, 0, 0, 0, 4, 4, 0],
  [0, 4, 4, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 3, 4, 0, 0, 0, 0, 0, 0],
  [0, 4, 4, 0, 0, 0, 0, 0, 0, 0],
];

/** T2 Flawed — squat round gem with dim, small reflections. */
export const TIER_CUT: PixelGrid = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
  [0, 0, 4, 2, 1, 2, 2, 4, 0, 0],
  [0, 4, 2, 1, 2, 2, 2, 3, 4, 0],
  [4, 2, 2, 2, 2, 2, 3, 3, 2, 4],
  [4, 2, 2, 2, 2, 3, 3, 3, 3, 4],
  [0, 4, 2, 2, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 2, 3, 3, 3, 4, 0, 0],
  [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

/** T3 Normal — emerald cut. */
export const TIER_GEM: PixelGrid = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 1, 1, 2, 2, 2, 4, 0],
  [4, 1, 1, 4, 4, 4, 4, 2, 3, 4],
  [4, 1, 4, 1, 1, 2, 2, 4, 3, 4],
  [4, 2, 4, 1, 2, 2, 3, 4, 3, 4],
  [4, 2, 2, 4, 4, 4, 4, 3, 3, 4],
  [0, 4, 2, 2, 2, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

/** T4 Flawless — classic round brilliant. */
export const TIER_BRILLIANT: PixelGrid = [
  [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
  [0, 4, 4, 1, 1, 2, 2, 4, 4, 0],
  [4, 1, 4, 1, 1, 2, 2, 4, 3, 4],
  [4, 1, 1, 4, 4, 4, 4, 3, 3, 4],
  [0, 4, 1, 1, 2, 2, 2, 3, 4, 0],
  [0, 0, 4, 1, 2, 2, 3, 4, 0, 0],
  [0, 0, 0, 4, 2, 3, 3, 4, 0, 0],
  [0, 0, 0, 0, 4, 2, 3, 4, 0, 0],
  [0, 0, 0, 0, 0, 4, 3, 4, 0, 0],
  [0, 0, 0, 0, 0, 0, 4, 0, 0, 0],
];

/** T5 Perfect — heroic marquise cut. */
export const TIER_CROWN: PixelGrid = [
  [0, 0, 0, 0, 4, 4, 0, 0, 0, 0],
  [0, 0, 0, 4, 1, 2, 4, 0, 0, 0],
  [0, 0, 4, 1, 1, 2, 2, 4, 0, 0],
  [0, 4, 1, 1, 4, 4, 2, 3, 4, 0],
  [4, 1, 1, 4, 1, 2, 4, 3, 3, 4],
  [4, 1, 4, 1, 2, 2, 3, 4, 3, 4],
  [0, 4, 1, 1, 2, 2, 3, 3, 4, 0],
  [0, 0, 4, 1, 4, 4, 3, 4, 0, 0],
  [0, 0, 0, 4, 1, 3, 4, 0, 0, 0],
  [0, 0, 0, 0, 4, 4, 0, 0, 0, 0],
];

export const TIER_GRIDS: Record<1 | 2 | 3 | 4 | 5, PixelGrid> = {
  1: TIER_SHARD,
  2: TIER_CUT,
  3: TIER_GEM,
  4: TIER_BRILLIANT,
  5: TIER_CROWN,
};

// ===== Special silhouettes (8×8) =========================================

const STAR_RUBY: PixelGrid = [
  [0, 0, 0, 4, 4, 0, 0, 0],
  [0, 0, 4, 1, 2, 4, 0, 0],
  [4, 4, 2, 1, 2, 3, 4, 4],
  [4, 1, 1, 5, 2, 2, 3, 4],
  [4, 2, 2, 5, 2, 3, 3, 4],
  [4, 4, 2, 3, 3, 3, 4, 4],
  [0, 0, 4, 3, 3, 4, 0, 0],
  [0, 0, 0, 4, 4, 0, 0, 0],
];

const SILVER: PixelGrid = [
  [0, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 1, 1, 2, 2, 2, 4],
  [4, 1, 2, 2, 2, 2, 3, 4],
  [4, 2, 2, 5, 5, 2, 3, 4],
  [4, 2, 2, 5, 5, 2, 3, 4],
  [4, 2, 2, 2, 2, 3, 3, 4],
  [4, 3, 3, 3, 3, 3, 3, 4],
  [0, 4, 4, 4, 4, 4, 4, 0],
];

const MALACHITE: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 1, 2, 2, 4, 0],
  [4, 3, 3, 3, 3, 3, 3, 4],
  [4, 1, 2, 2, 2, 2, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 4],
  [4, 2, 2, 2, 2, 2, 2, 4],
  [0, 4, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 0, 0],
];

const JADE: PixelGrid = [
  [4, 4, 4, 4, 4, 4, 4, 4],
  [4, 1, 1, 2, 2, 2, 2, 4],
  [4, 1, 4, 4, 4, 4, 2, 4],
  [4, 2, 4, 3, 3, 4, 2, 4],
  [4, 2, 4, 3, 3, 4, 2, 4],
  [4, 2, 4, 4, 4, 4, 3, 4],
  [4, 2, 2, 2, 3, 3, 3, 4],
  [4, 4, 4, 4, 4, 4, 4, 4],
];

const GOLD: PixelGrid = [
  [0, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 2, 2, 2, 2, 2, 4],
  [4, 2, 2, 5, 5, 2, 3, 4],
  [0, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 2, 5, 5, 2, 2, 4],
  [4, 2, 2, 2, 2, 2, 3, 4],
  [4, 2, 3, 3, 3, 3, 3, 4],
  [0, 4, 4, 4, 4, 4, 4, 0],
];

const DARK_EMERALD: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 0, 0],
  [0, 4, 3, 3, 3, 3, 4, 0],
  [4, 3, 1, 5, 5, 2, 3, 4],
  [4, 3, 2, 4, 4, 3, 3, 4],
  [4, 3, 2, 5, 4, 3, 3, 4],
  [4, 3, 3, 2, 2, 3, 3, 4],
  [0, 4, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 0, 0],
];

const PINK_DIAMOND: PixelGrid = [
  [0, 4, 4, 0, 0, 4, 4, 0],
  [4, 1, 1, 4, 4, 1, 2, 4],
  [4, 1, 1, 1, 2, 2, 2, 4],
  [4, 2, 1, 2, 2, 2, 3, 4],
  [0, 4, 2, 2, 2, 3, 4, 0],
  [0, 0, 4, 2, 3, 4, 0, 0],
  [0, 0, 0, 4, 4, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const BLACK_OPAL: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 0, 0],
  [0, 4, 3, 3, 3, 3, 4, 0],
  [4, 3, 3, 1, 2, 3, 3, 4],
  [4, 3, 1, 1, 5, 2, 3, 4],
  [4, 3, 2, 5, 2, 2, 3, 4],
  [4, 3, 3, 2, 2, 3, 3, 4],
  [0, 4, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 0, 0],
];

const URANIUM: PixelGrid = [
  [0, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 1, 5, 5, 2, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 4],
  [4, 2, 5, 2, 2, 5, 2, 4],
  [4, 2, 2, 5, 5, 2, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 4],
  [4, 2, 2, 2, 2, 2, 2, 4],
  [0, 4, 4, 4, 4, 4, 4, 0],
];

const BLOODSTONE: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 5, 2, 2, 4, 0],
  [4, 1, 5, 2, 2, 3, 2, 4],
  [4, 2, 2, 4, 2, 3, 3, 4],
  [4, 2, 2, 2, 4, 3, 3, 4],
  [4, 2, 3, 2, 2, 4, 3, 4],
  [0, 4, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 0, 0],
];

export interface SpecialPalette {
  light: number;
  mid: number;
  dark: number;
  sparkle: number;
}

export interface SpecialSpriteSpec {
  grid: PixelGrid;
  palette: SpecialPalette;
  /** Visual gem hint kept for projectile tinting. */
  visualGem: GemType;
}

const hex = (s: string): number => parseInt(s.slice(1), 16);

// ===== Special T2/T3 evolution sprites ====================================
// Only evolution-strategy specials get new grids; ornament/multiplied reuse T1.

const PINK_HEART_WINGED: PixelGrid = [
  [0, 0, 4, 4, 0, 0, 0, 0, 4, 4, 0, 0],
  [0, 4, 1, 1, 4, 4, 4, 4, 1, 2, 4, 0],
  [4, 1, 4, 4, 1, 1, 2, 1, 2, 2, 2, 4],
  [4, 4, 1, 1, 1, 1, 2, 2, 2, 2, 3, 4],
  [0, 4, 4, 2, 1, 2, 2, 2, 2, 3, 4, 0],
  [0, 0, 4, 4, 2, 2, 2, 3, 3, 4, 0, 0],
  [0, 0, 0, 4, 4, 2, 3, 3, 4, 0, 0, 0],
  [0, 0, 0, 0, 4, 4, 3, 4, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const PINK_HEART_APEX: PixelGrid = [
  [0, 0, 0, 0, 4, 5, 5, 4, 0, 0, 0, 0],
  [0, 0, 4, 4, 1, 1, 1, 2, 4, 4, 0, 0],
  [0, 4, 1, 1, 1, 1, 2, 2, 2, 2, 4, 0],
  [4, 1, 1, 1, 5, 4, 4, 5, 2, 2, 2, 4],
  [4, 4, 1, 1, 1, 5, 5, 1, 2, 2, 3, 4],
  [0, 4, 4, 1, 2, 5, 5, 2, 2, 3, 4, 4],
  [4, 4, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4],
  [4, 4, 4, 2, 1, 2, 2, 3, 3, 3, 4, 4],
  [0, 4, 4, 4, 2, 2, 3, 3, 3, 4, 4, 0],
  [0, 0, 4, 4, 4, 3, 3, 3, 4, 4, 0, 0],
  [0, 0, 0, 4, 4, 4, 3, 4, 4, 0, 0, 0],
  [0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0],
];

const BLOOD_CRACKED: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 5, 2, 2, 5, 2, 4, 0],
  [4, 1, 5, 5, 2, 5, 2, 3, 2, 4],
  [4, 2, 5, 2, 5, 5, 3, 5, 3, 4],
  [4, 2, 2, 5, 2, 3, 5, 5, 3, 4],
  [4, 2, 5, 5, 5, 3, 5, 3, 3, 4],
  [4, 2, 3, 5, 2, 5, 3, 5, 3, 4],
  [4, 3, 3, 5, 5, 3, 3, 5, 3, 4],
  [0, 4, 3, 5, 3, 3, 3, 5, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
];

const BLOOD_APEX: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 5, 2, 2, 2, 5, 2, 2, 4, 0],
  [4, 1, 5, 2, 2, 5, 5, 2, 2, 5, 2, 4],
  [4, 5, 2, 5, 1, 1, 5, 2, 2, 5, 3, 4],
  [4, 2, 5, 1, 5, 5, 1, 5, 2, 3, 3, 4],
  [4, 2, 2, 5, 1, 5, 1, 5, 3, 3, 5, 4],
  [4, 2, 5, 2, 5, 5, 5, 3, 5, 3, 3, 4],
  [4, 5, 2, 5, 5, 2, 3, 3, 3, 5, 3, 4],
  [4, 5, 5, 2, 5, 3, 3, 3, 3, 3, 3, 4],
  [4, 3, 5, 3, 3, 3, 3, 3, 3, 5, 3, 4],
  [0, 4, 3, 5, 3, 3, 3, 3, 5, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0],
];

const URANIUM_LEAKING: PixelGrid = [
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 1, 5, 5, 5, 2, 2, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 3, 3, 4],
  [4, 2, 5, 5, 2, 2, 5, 5, 2, 4],
  [4, 2, 2, 5, 5, 5, 5, 2, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 3, 3, 4],
  [4, 2, 5, 2, 2, 2, 2, 5, 2, 4],
  [4, 5, 2, 2, 5, 2, 2, 2, 5, 4],
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 0],
  [0, 0, 5, 0, 0, 5, 0, 5, 0, 0],
];

const URANIUM_APEX: PixelGrid = [
  [0, 0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 4, 5, 5, 4, 0, 0, 0, 0, 0],
  [0, 0, 4, 5, 1, 5, 5, 4, 0, 0, 0, 0],
  [0, 4, 5, 5, 5, 5, 5, 5, 4, 0, 0, 0],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 1, 5, 5, 5, 5, 2, 2, 2, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4],
  [4, 2, 5, 5, 2, 2, 5, 5, 2, 5, 2, 4],
  [4, 2, 2, 5, 5, 5, 5, 2, 2, 5, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [0, 5, 0, 5, 0, 0, 5, 0, 5, 0, 5, 0],
];

const DARK_EM_RUNE: PixelGrid = [
  [0, 0, 0, 4, 4, 4, 0, 0, 0, 0],
  [0, 0, 4, 3, 3, 3, 4, 0, 0, 0],
  [0, 4, 3, 5, 5, 5, 3, 4, 0, 0],
  [4, 3, 1, 5, 4, 5, 2, 3, 4, 0],
  [4, 3, 5, 4, 5, 4, 5, 3, 4, 0],
  [4, 3, 1, 5, 4, 5, 2, 3, 4, 0],
  [4, 3, 5, 5, 5, 5, 5, 3, 4, 0],
  [4, 3, 2, 2, 3, 3, 3, 3, 4, 0],
  [0, 4, 3, 3, 3, 3, 3, 4, 0, 0],
  [0, 0, 4, 4, 4, 4, 4, 0, 0, 0],
];

const DARK_EM_APEX: PixelGrid = [
  [0, 4, 4, 4, 0, 4, 4, 0, 4, 4, 4, 0],
  [4, 3, 3, 3, 4, 5, 5, 4, 3, 3, 3, 4],
  [4, 3, 5, 3, 4, 5, 5, 4, 3, 5, 3, 4],
  [4, 3, 1, 3, 4, 5, 1, 4, 3, 5, 3, 4],
  [4, 3, 5, 3, 4, 4, 4, 4, 3, 5, 3, 4],
  [4, 3, 1, 3, 5, 5, 5, 5, 3, 1, 3, 4],
  [4, 3, 5, 3, 4, 4, 4, 4, 3, 5, 3, 4],
  [4, 3, 2, 3, 4, 5, 5, 4, 3, 2, 3, 4],
  [4, 3, 3, 3, 4, 5, 5, 4, 3, 3, 3, 4],
  [4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4],
  [0, 4, 4, 4, 0, 4, 4, 0, 4, 4, 4, 0],
  [0, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0],
];

const BLACK_OPAL_BINARY: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 4, 3, 3, 3, 3, 3, 3, 4, 0],
  [4, 3, 1, 2, 3, 3, 5, 3, 3, 4],
  [4, 3, 1, 1, 5, 3, 5, 5, 3, 4],
  [4, 3, 2, 5, 2, 5, 5, 2, 3, 4],
  [4, 3, 3, 2, 5, 2, 5, 3, 3, 4],
  [4, 3, 3, 3, 5, 5, 3, 3, 3, 4],
  [4, 3, 5, 3, 3, 3, 3, 5, 3, 4],
  [0, 4, 3, 3, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
];

const BLACK_OPAL_APEX: PixelGrid = [
  [0, 0, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0],
  [0, 4, 4, 3, 3, 3, 3, 3, 3, 4, 4, 0],
  [4, 5, 4, 1, 2, 3, 3, 5, 3, 4, 5, 4],
  [4, 5, 3, 1, 5, 5, 3, 5, 3, 3, 5, 4],
  [4, 4, 3, 2, 5, 1, 5, 5, 2, 3, 4, 4],
  [5, 5, 3, 3, 5, 5, 1, 5, 3, 3, 5, 5],
  [5, 5, 3, 3, 3, 5, 5, 5, 5, 3, 5, 5],
  [4, 4, 3, 3, 5, 3, 3, 5, 3, 3, 4, 4],
  [4, 5, 3, 5, 3, 3, 3, 3, 5, 3, 5, 4],
  [4, 5, 4, 3, 3, 3, 3, 3, 3, 4, 5, 4],
  [0, 4, 4, 3, 3, 3, 3, 3, 3, 4, 4, 0],
  [0, 0, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0],
];

// STAR RUBY — T2: bigger 6-point star with sparkle halo
const STAR_RUBY_REFINED: PixelGrid = [
  [0, 0, 0, 0, 4, 4, 0, 0, 0, 0],
  [0, 5, 0, 4, 1, 2, 4, 0, 5, 0],
  [0, 0, 4, 4, 1, 2, 3, 4, 0, 0],
  [0, 4, 1, 1, 5, 5, 2, 3, 4, 0],
  [4, 4, 1, 5, 5, 2, 5, 2, 3, 4],
  [4, 4, 2, 5, 5, 2, 5, 3, 3, 4],
  [0, 4, 2, 2, 5, 5, 3, 3, 4, 0],
  [0, 0, 4, 4, 3, 3, 3, 4, 0, 0],
  [0, 5, 0, 4, 3, 3, 4, 0, 5, 0],
  [0, 0, 0, 0, 4, 4, 0, 0, 0, 0],
];

// STAR RUBY — T3: 8-point star / sun with rays + sparkle halo
const STAR_RUBY_APEX: PixelGrid = [
  [0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0],
  [5, 0, 0, 0, 4, 1, 2, 4, 0, 0, 0, 5],
  [0, 5, 0, 4, 1, 1, 2, 2, 4, 0, 5, 0],
  [0, 0, 4, 4, 5, 1, 2, 5, 4, 4, 0, 0],
  [0, 4, 1, 5, 5, 5, 5, 5, 2, 3, 4, 0],
  [4, 4, 1, 5, 1, 5, 5, 2, 2, 3, 3, 4],
  [4, 4, 1, 5, 5, 2, 5, 5, 3, 3, 3, 4],
  [0, 4, 2, 5, 5, 5, 5, 5, 2, 3, 4, 0],
  [0, 0, 4, 4, 5, 2, 3, 5, 4, 4, 0, 0],
  [0, 5, 0, 4, 3, 3, 3, 3, 4, 0, 5, 0],
  [5, 0, 0, 0, 4, 3, 3, 4, 0, 0, 0, 5],
  [0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0],
];

// SILVER — T2: 2 ingots stacked
const SILVER_REFINED: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 1, 1, 2, 2, 3, 4, 0],
  [0, 4, 1, 2, 5, 5, 2, 3, 4, 0],
  [0, 4, 2, 2, 5, 5, 3, 3, 4, 0],
  [0, 4, 2, 2, 2, 2, 3, 3, 4, 0],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [4, 1, 1, 1, 2, 2, 2, 2, 3, 4],
  [4, 1, 2, 5, 5, 5, 2, 2, 3, 4],
  [4, 2, 2, 2, 2, 3, 3, 3, 3, 4],
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 0],
];

// SILVER — T3: pyramid pile of 3 ingots
const SILVER_APEX: PixelGrid = [
  [0, 0, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0],
  [0, 0, 4, 1, 1, 2, 2, 2, 3, 4, 0, 0],
  [0, 0, 4, 1, 5, 5, 5, 2, 3, 4, 0, 0],
  [0, 0, 4, 2, 2, 2, 2, 3, 3, 4, 0, 0],
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 1, 1, 2, 2, 4, 1, 1, 2, 3, 4],
  [4, 1, 5, 2, 2, 3, 4, 1, 5, 2, 3, 4],
  [4, 2, 2, 2, 3, 3, 4, 2, 2, 3, 3, 4],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [4, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 4],
  [4, 2, 5, 5, 5, 5, 2, 2, 3, 3, 3, 4],
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0],
];

// MALACHITE — T2: bigger banded oval
const MALACHITE_REFINED: PixelGrid = [
  [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
  [0, 4, 4, 1, 1, 2, 2, 4, 4, 0],
  [4, 4, 3, 3, 3, 3, 3, 3, 4, 4],
  [4, 1, 1, 5, 5, 5, 2, 2, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 3, 3, 4],
  [4, 1, 2, 5, 5, 5, 2, 2, 2, 4],
  [4, 3, 3, 3, 3, 3, 3, 3, 3, 4],
  [0, 4, 4, 2, 2, 3, 3, 4, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 0, 0, 0, 4, 4, 0, 0, 0, 0],
];

// MALACHITE — T3: long banded oval with sparkle halo at corners
const MALACHITE_APEX: PixelGrid = [
  [0, 0, 0, 0, 4, 4, 4, 4, 0, 0, 0, 0],
  [0, 5, 0, 4, 1, 1, 2, 2, 4, 0, 5, 0],
  [0, 0, 4, 4, 3, 3, 3, 3, 4, 4, 0, 0],
  [0, 4, 4, 3, 3, 3, 3, 3, 3, 4, 4, 0],
  [5, 4, 1, 1, 5, 5, 5, 5, 2, 2, 4, 5],
  [4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4],
  [4, 4, 1, 2, 5, 5, 5, 5, 2, 2, 3, 4],
  [5, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 5],
  [0, 4, 4, 2, 2, 2, 2, 3, 3, 4, 4, 0],
  [0, 0, 4, 4, 3, 3, 3, 3, 4, 4, 0, 0],
  [0, 5, 0, 4, 4, 4, 4, 4, 4, 0, 5, 0],
  [0, 0, 0, 0, 4, 4, 4, 4, 0, 0, 0, 0],
];

// JADE — T2: bigger ring with engraved sigil
const JADE_REFINED: PixelGrid = [
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [4, 1, 1, 1, 2, 2, 2, 2, 2, 4],
  [4, 1, 4, 4, 4, 4, 4, 4, 2, 4],
  [4, 1, 4, 5, 3, 3, 5, 4, 2, 4],
  [4, 1, 4, 3, 3, 3, 3, 4, 2, 4],
  [4, 2, 4, 3, 3, 3, 3, 4, 2, 4],
  [4, 2, 4, 5, 3, 3, 5, 4, 3, 4],
  [4, 2, 4, 4, 4, 4, 4, 4, 3, 4],
  [4, 2, 2, 3, 3, 3, 3, 3, 3, 4],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
];

// JADE — T3: double ring — outer carved frame, inner ring
const JADE_APEX: PixelGrid = [
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [4, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 4],
  [4, 1, 4, 4, 4, 4, 4, 4, 4, 4, 2, 4],
  [4, 1, 4, 5, 1, 2, 2, 2, 5, 4, 2, 4],
  [4, 1, 4, 1, 4, 4, 4, 4, 3, 4, 2, 4],
  [4, 1, 4, 1, 4, 3, 3, 4, 3, 4, 2, 4],
  [4, 2, 4, 2, 4, 3, 3, 4, 3, 4, 3, 4],
  [4, 2, 4, 2, 4, 4, 4, 4, 3, 4, 3, 4],
  [4, 2, 4, 5, 2, 3, 3, 3, 5, 4, 3, 4],
  [4, 2, 4, 4, 4, 4, 4, 4, 4, 4, 3, 4],
  [4, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
];

// GOLD — T2: 2 ingots stacked
const GOLD_REFINED: PixelGrid = [
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 1, 2, 2, 2, 2, 2, 3, 4],
  [4, 1, 2, 5, 5, 5, 2, 2, 3, 4],
  [4, 2, 2, 2, 2, 2, 3, 3, 3, 4],
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 0],
  [4, 1, 1, 2, 5, 5, 2, 2, 3, 4],
  [4, 1, 2, 5, 5, 2, 2, 3, 3, 4],
  [4, 2, 2, 2, 2, 2, 3, 3, 3, 4],
  [4, 2, 3, 3, 3, 3, 3, 3, 3, 4],
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 0],
];

// GOLD — T3: chest base with two ingots + spilled coins
const GOLD_APEX: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0],
  [0, 4, 1, 2, 5, 5, 2, 3, 4, 0, 4, 4],
  [0, 4, 1, 5, 5, 2, 3, 3, 4, 4, 1, 4],
  [0, 4, 2, 2, 2, 3, 3, 3, 4, 1, 5, 4],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 4],
  [4, 1, 2, 5, 2, 2, 2, 2, 3, 3, 3, 4],
  [4, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [4, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 4],
  [4, 2, 5, 5, 2, 2, 2, 2, 2, 3, 3, 4],
  [4, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4],
  [0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0],
];

// ===== New specials: Red Crystal, Paraiba Tourmaline, Yellow Sapphire =====

const RED_CRYSTAL_T1: PixelGrid = [
  [0, 0, 0, 4, 4, 0, 0, 0],
  [0, 0, 4, 1, 2, 4, 0, 0],
  [0, 0, 4, 1, 2, 4, 0, 0],
  [0, 4, 1, 5, 2, 3, 4, 0],
  [0, 4, 1, 5, 2, 3, 4, 0],
  [4, 1, 1, 5, 2, 2, 3, 4],
  [4, 1, 2, 5, 2, 3, 3, 4],
  [4, 2, 2, 2, 3, 3, 3, 4],
  [0, 4, 2, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 0, 0],
];

const RED_CRYSTAL_T2: PixelGrid = [
  [0, 0, 0, 0, 4, 4, 0, 0, 0, 0],
  [0, 0, 0, 4, 1, 2, 4, 0, 0, 0],
  [0, 0, 4, 1, 5, 2, 3, 4, 0, 0],
  [0, 4, 1, 5, 2, 2, 3, 3, 4, 0],
  [4, 1, 1, 4, 4, 4, 4, 2, 3, 4],
  [4, 1, 5, 1, 2, 5, 2, 2, 3, 4],
  [4, 1, 5, 4, 4, 4, 4, 3, 3, 4],
  [4, 2, 5, 1, 2, 2, 5, 3, 3, 4],
  [4, 2, 2, 4, 4, 4, 4, 3, 3, 4],
  [0, 4, 2, 2, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 2, 3, 3, 3, 4, 0, 0],
  [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
];

const RED_CRYSTAL_T3: PixelGrid = [
  [0, 0, 4, 4, 0, 0, 4, 4, 0, 4, 4, 0],
  [0, 4, 1, 2, 4, 4, 1, 2, 4, 1, 2, 4],
  [0, 4, 1, 2, 4, 4, 1, 2, 4, 5, 2, 4],
  [4, 1, 5, 2, 3, 4, 5, 2, 3, 5, 2, 3],
  [4, 1, 5, 2, 3, 4, 2, 2, 3, 2, 2, 3],
  [4, 1, 5, 2, 2, 4, 2, 5, 3, 2, 3, 3],
  [4, 1, 1, 5, 2, 2, 2, 2, 3, 2, 3, 3],
  [4, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4],
  [0, 4, 2, 2, 3, 3, 3, 3, 3, 3, 4, 0],
  [0, 4, 2, 3, 3, 3, 3, 3, 3, 3, 4, 0],
  [0, 4, 2, 3, 3, 3, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0],
];

const PARAIBA_T1: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 1, 5, 5, 2, 2, 4, 0],
  [4, 1, 5, 4, 4, 4, 4, 2, 3, 4],
  [4, 1, 4, 1, 5, 5, 2, 4, 3, 4],
  [4, 5, 4, 1, 2, 2, 3, 4, 3, 4],
  [4, 2, 4, 5, 2, 2, 3, 4, 3, 4],
  [4, 2, 4, 5, 2, 3, 3, 4, 3, 4],
  [4, 2, 4, 4, 4, 4, 4, 4, 3, 4],
  [0, 4, 2, 2, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
];

const PARAIBA_T2: PixelGrid = [
  [0, 0, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0],
  [0, 4, 4, 1, 1, 5, 5, 2, 2, 4, 4, 0],
  [0, 4, 1, 1, 5, 5, 2, 2, 2, 3, 3, 4],
  [4, 1, 1, 4, 4, 4, 4, 4, 4, 2, 3, 4],
  [4, 1, 5, 4, 1, 5, 5, 2, 4, 3, 3, 4],
  [4, 1, 4, 5, 1, 2, 2, 2, 4, 3, 3, 4],
  [4, 5, 4, 5, 2, 2, 3, 3, 4, 3, 3, 4],
  [4, 5, 4, 1, 2, 3, 3, 3, 4, 3, 3, 4],
  [4, 2, 4, 4, 4, 4, 4, 4, 4, 3, 3, 4],
  [4, 2, 2, 5, 2, 3, 3, 3, 3, 3, 3, 4],
  [0, 4, 2, 2, 3, 3, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0],
];

const YELLOW_SAPPH_T1: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 1, 1, 2, 2, 2, 4, 0],
  [4, 1, 1, 5, 5, 5, 2, 2, 3, 4],
  [4, 1, 5, 5, 2, 2, 2, 3, 3, 4],
  [4, 1, 5, 2, 2, 2, 3, 3, 3, 4],
  [4, 2, 2, 2, 2, 3, 3, 3, 3, 4],
  [4, 2, 2, 2, 3, 3, 3, 3, 3, 4],
  [4, 2, 3, 3, 3, 3, 3, 3, 3, 4],
  [0, 4, 3, 3, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 4, 4, 0, 0],
];

const YELLOW_SAPPH_T2: PixelGrid = [
  [0, 0, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0],
  [0, 4, 4, 1, 1, 2, 2, 2, 2, 4, 4, 0],
  [0, 4, 1, 1, 2, 5, 5, 2, 2, 3, 3, 4],
  [4, 1, 5, 2, 2, 5, 5, 2, 2, 5, 3, 4],
  [4, 1, 2, 5, 2, 5, 5, 2, 5, 2, 3, 4],
  [4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4],
  [4, 2, 5, 5, 5, 5, 5, 5, 5, 5, 3, 4],
  [4, 2, 5, 2, 5, 5, 5, 5, 2, 5, 3, 4],
  [4, 2, 2, 5, 2, 5, 5, 2, 5, 2, 3, 4],
  [0, 4, 2, 2, 5, 5, 5, 5, 3, 3, 4, 0],
  [0, 4, 4, 2, 2, 3, 3, 3, 3, 4, 4, 0],
  [0, 0, 0, 4, 4, 4, 4, 4, 4, 0, 0, 0],
];

export type SpecialTier = 1 | 2 | 3;

/** Per-tier grids for all specials. T1 is the base grid in SPECIAL_SPRITES. */
export const SPECIAL_TIER_GRIDS: Partial<Record<string, Partial<Record<2 | 3, PixelGrid>>>> = {
  pink_diamond: { 2: PINK_HEART_WINGED, 3: PINK_HEART_APEX },
  bloodstone:   { 2: BLOOD_CRACKED,     3: BLOOD_APEX },
  uranium:      { 2: URANIUM_LEAKING,   3: URANIUM_APEX },
  dark_emerald: { 2: DARK_EM_RUNE,      3: DARK_EM_APEX },
  black_opal:   { 2: BLACK_OPAL_BINARY, 3: BLACK_OPAL_APEX },
  star_ruby:    { 2: STAR_RUBY_REFINED,  3: STAR_RUBY_APEX },
  silver:       { 2: SILVER_REFINED,     3: SILVER_APEX },
  malachite:    { 2: MALACHITE_REFINED,  3: MALACHITE_APEX },
  jade:         { 2: JADE_REFINED,       3: JADE_APEX },
  gold:         { 2: GOLD_REFINED,       3: GOLD_APEX },
  red_crystal:        { 2: RED_CRYSTAL_T2,    3: RED_CRYSTAL_T3 },
  paraiba_tourmaline: { 2: PARAIBA_T2 },
  yellow_sapphire:    { 2: YELLOW_SAPPH_T2 },
};

const STARGEM: PixelGrid = [
  [0, 0, 0, 0, 4, 4, 4, 4, 0, 0, 0, 0],
  [0, 0, 4, 4, 1, 1, 1, 1, 4, 4, 0, 0],
  [0, 4, 1, 1, 3, 3, 5, 3, 3, 2, 4, 0],
  [4, 1, 1, 3, 3, 5, 3, 3, 3, 3, 2, 4],
  [4, 1, 3, 5, 3, 3, 3, 3, 5, 3, 2, 4],
  [4, 1, 3, 3, 3, 3, 3, 5, 3, 3, 2, 4],
  [4, 2, 3, 3, 5, 3, 3, 3, 3, 3, 2, 4],
  [4, 2, 3, 3, 3, 3, 3, 3, 3, 5, 3, 4],
  [4, 2, 3, 5, 3, 3, 5, 3, 3, 3, 3, 4],
  [0, 4, 2, 3, 3, 3, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 2, 2, 3, 3, 3, 4, 0, 0],
  [0, 0, 0, 0, 4, 4, 4, 4, 4, 0, 0, 0],
];

// ===== Rune (trap) tablet sprites ============================================
// 14x14 stone tablet with 8x8 glyphs. Palette: 1=stoneLight 2=stoneMid 3=stoneDark 4=outline 5=glyph
const RUNE_TABLET: PixelGrid = [
  [0,4,4,4,4,4,4,4,4,4,4,4,4,0],
  [4,3,1,1,2,2,2,2,2,2,1,1,3,4],
  [4,1,2,2,2,2,2,2,2,2,2,2,1,4],
  [4,1,2,3,3,3,3,3,3,3,3,2,1,4],
  [4,2,2,3,2,2,2,2,2,2,3,2,2,4],
  [4,2,2,3,2,0,0,0,0,2,3,2,2,4],
  [4,2,2,3,2,0,0,0,0,2,3,2,2,4],
  [4,2,2,3,2,0,0,0,0,2,3,2,2,4],
  [4,2,2,3,2,0,0,0,0,2,3,2,2,4],
  [4,2,2,3,2,2,2,2,2,2,3,2,2,4],
  [4,1,2,3,3,3,3,3,3,3,3,2,1,4],
  [4,1,2,2,2,2,2,2,2,2,2,2,1,4],
  [4,3,1,1,2,2,2,2,2,2,1,1,3,4],
  [0,4,4,4,4,4,4,4,4,4,4,4,4,0],
];

const RUNE_GLYPHS: Record<string, readonly (readonly number[])[]> = {
  holding: [
    [0,0,0,1,1,0,0,0],
    [0,1,1,1,1,1,1,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,1,1,1,1,1,1,0],
    [0,0,0,1,1,0,0,0],
  ],
  damage: [
    [0,0,0,0,1,1,1,0],
    [0,0,0,1,1,1,0,0],
    [0,0,1,1,1,0,0,0],
    [0,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,0],
    [0,0,0,1,1,1,0,0],
    [0,0,1,1,1,0,0,0],
    [0,1,1,0,0,0,0,0],
  ],
  teleport: [
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [1,0,0,1,1,1,0,1],
    [1,0,1,0,0,1,0,1],
    [1,0,1,1,0,1,0,1],
    [1,0,0,0,0,1,0,0],
    [0,1,0,0,0,0,0,0],
    [0,0,1,1,1,1,1,0],
  ],
  slow: [
    [0,0,0,1,1,0,0,0],
    [1,0,1,1,1,1,0,1],
    [0,1,0,1,1,0,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,0,1,1,0,1,0],
    [1,0,1,1,1,1,0,1],
    [0,0,0,1,1,0,0,0],
  ],
};

function buildRuneGrid(glyphKey: string): PixelGrid {
  const base = RUNE_TABLET.map(row => [...row]);
  const glyph = RUNE_GLYPHS[glyphKey];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (glyph[y][x]) {
        base[3 + y][3 + x] = 5;
      }
    }
  }
  return base;
}

const RUNE_HOLDING_GRID = buildRuneGrid('holding');
const RUNE_DAMAGE_GRID = buildRuneGrid('damage');
const RUNE_TELEPORT_GRID = buildRuneGrid('teleport');
const RUNE_SLOW_GRID = buildRuneGrid('slow');

export const SPECIAL_SPRITES: Record<string, SpecialSpriteSpec> = {
  star_ruby: {
    grid: STAR_RUBY,
    palette: { light: hex("#ff9090"), mid: hex("#e8384c"), dark: hex("#5c0810"), sparkle: hex("#ffe8a0") },
    visualGem: "ruby",
  },
  silver: {
    grid: SILVER,
    palette: { light: hex("#ffffff"), mid: hex("#c8d8e0"), dark: hex("#5070a0"), sparkle: hex("#ffffff") },
    visualGem: "diamond",
  },
  malachite: {
    grid: MALACHITE,
    palette: { light: hex("#a8f0a0"), mid: hex("#38c860"), dark: hex("#0c4818"), sparkle: hex("#fff8d8") },
    visualGem: "emerald",
  },
  jade: {
    grid: JADE,
    palette: { light: hex("#c8f0d8"), mid: hex("#58c898"), dark: hex("#1c5848"), sparkle: hex("#ffffff") },
    visualGem: "emerald",
  },
  gold: {
    grid: GOLD,
    palette: { light: hex("#fff0a0"), mid: hex("#f0c038"), dark: hex("#80501c"), sparkle: hex("#ffffff") },
    visualGem: "topaz",
  },
  dark_emerald: {
    grid: DARK_EMERALD,
    palette: { light: hex("#88e8a0"), mid: hex("#1c8838"), dark: hex("#08200c"), sparkle: hex("#a0ffd8") },
    visualGem: "emerald",
  },
  pink_diamond: {
    grid: PINK_DIAMOND,
    palette: { light: hex("#ffd8e8"), mid: hex("#f088c0"), dark: hex("#882048"), sparkle: hex("#ffffff") },
    visualGem: "ruby",
  },
  black_opal: {
    grid: BLACK_OPAL,
    palette: { light: hex("#a8c8f0"), mid: hex("#3848a8"), dark: hex("#0c0820"), sparkle: hex("#f0a8ff") },
    visualGem: "opal",
  },
  uranium: {
    grid: URANIUM,
    palette: { light: hex("#d8ffa0"), mid: hex("#88d048"), dark: hex("#284820"), sparkle: hex("#ffffa0") },
    visualGem: "topaz",
  },
  bloodstone: {
    grid: BLOODSTONE,
    palette: { light: hex("#ff8068"), mid: hex("#c8202c"), dark: hex("#380808"), sparkle: hex("#ffe060") },
    visualGem: "ruby",
  },
  stargem: {
    grid: STARGEM,
    palette: { light: hex("#cfd8ff"), mid: hex("#6478b8"), dark: hex("#0d1132"), sparkle: hex("#ffffff") },
    visualGem: "diamond",
  },
  red_crystal: {
    grid: RED_CRYSTAL_T1,
    palette: { light: hex("#ff8898"), mid: hex("#e02858"), dark: hex("#601830"), sparkle: hex("#ffd0e0") },
    visualGem: "amethyst",
  },
  paraiba_tourmaline: {
    grid: PARAIBA_T1,
    palette: { light: hex("#a8ffe8"), mid: hex("#00d8c8"), dark: hex("#0a4858"), sparkle: hex("#ffffff") },
    visualGem: "aquamarine",
  },
  yellow_sapphire: {
    grid: YELLOW_SAPPH_T1,
    palette: { light: hex("#ffe890"), mid: hex("#f0b830"), dark: hex("#805018"), sparkle: hex("#ffffff") },
    visualGem: "sapphire",
  },
  rune_holding: {
    grid: RUNE_HOLDING_GRID,
    palette: { light: hex("#cdb78a"), mid: hex("#8a6e44"), dark: hex("#3a2a1a"), sparkle: hex("#fff0a8") },
    visualGem: "topaz",
  },
  rune_damage: {
    grid: RUNE_DAMAGE_GRID,
    palette: { light: hex("#cdb78a"), mid: hex("#8a6e44"), dark: hex("#3a2a1a"), sparkle: hex("#ffd0a8") },
    visualGem: "diamond",
  },
  rune_teleport: {
    grid: RUNE_TELEPORT_GRID,
    palette: { light: hex("#cdb78a"), mid: hex("#8a6e44"), dark: hex("#3a2a1a"), sparkle: hex("#e8b8ff") },
    visualGem: "aquamarine",
  },
  rune_slow: {
    grid: RUNE_SLOW_GRID,
    palette: { light: hex("#cdb78a"), mid: hex("#8a6e44"), dark: hex("#3a2a1a"), sparkle: hex("#d0f4ff") },
    visualGem: "sapphire",
  },
};

/** Per-tier palette overrides (only needed when a tier changes palette). */
export const SPECIAL_TIER_PALETTES: Partial<Record<string, Partial<Record<2 | 3, SpecialPalette>>>> = {
  red_crystal: {
    3: { light: hex("#ffd8e8"), mid: hex("#f078a8"), dark: hex("#883858"), sparkle: hex("#ffffff") },
  },
};

// ===== Special FX descriptors ============================================

export interface SpecialFx {
  /** Halo glow color (RGB number). */
  glow: number;
  /** Peak halo opacity (0..1). */
  halo: number;
  /** Pulse period, seconds. */
  pulse: number;
  /** If set, draw a single sparkle pixel orbiting the tower. */
  orbit: boolean;
  /** If set, draw a dashed ring just outside the tile. */
  aura: boolean;
  /** Tile-tinted ground color (RGB number) or null. */
  ground: number | null;
}

export const SPECIAL_FX: Record<string, SpecialFx> = {
  bloodstone:   { glow: hex("#ff5040"), halo: 0.7,  pulse: 2.4, orbit: false, aura: false, ground: hex("#681818") },
  pink_diamond: { glow: hex("#ff80c0"), halo: 0.55, pulse: 1.8, orbit: true,  aura: false, ground: null },
  uranium:      { glow: hex("#c0ff60"), halo: 0.85, pulse: 1.2, orbit: false, aura: true,  ground: hex("#446618") },
  black_opal:   { glow: hex("#a0a0ff"), halo: 0.6,  pulse: 3.0, orbit: true,  aura: true,  ground: null },
  jade:         { glow: hex("#80e8b0"), halo: 0.35, pulse: 3.0, orbit: false, aura: false, ground: null },
  malachite:    { glow: hex("#a0e878"), halo: 0.4,  pulse: 2.4, orbit: false, aura: false, ground: null },
  star_ruby:    { glow: hex("#ffa040"), halo: 0.55, pulse: 2.0, orbit: false, aura: false, ground: hex("#5c1010") },
  gold:         { glow: hex("#ffd840"), halo: 0.6,  pulse: 2.4, orbit: false, aura: false, ground: null },
  silver:       { glow: hex("#e0e8f0"), halo: 0.4,  pulse: 2.4, orbit: false, aura: false, ground: null },
  dark_emerald:       { glow: hex("#28e0a0"), halo: 0.5,  pulse: 1.6, orbit: false, aura: false, ground: hex("#082018") },
  red_crystal:        { glow: hex("#ff5478"), halo: 0.55, pulse: 2.2, orbit: true,  aura: false, ground: null },
  paraiba_tourmaline: { glow: hex("#3cf0e0"), halo: 0.7,  pulse: 1.8, orbit: false, aura: false, ground: hex("#0a4858") },
  yellow_sapphire:    { glow: hex("#ffd048"), halo: 0.7,  pulse: 1.9, orbit: false, aura: false, ground: null },
};

// ===== Rocks (16×16, tile-filling) =======================================

export const ROCK_BOULDER: PixelGrid = [
  [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2],
  [2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  [3, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
];

export const ROCK_MOSSY: PixelGrid = [
  [5, 5, 1, 2, 5, 5, 2, 2, 5, 5, 2, 2, 2, 2, 3, 3],
  [5, 1, 5, 2, 2, 2, 2, 5, 5, 2, 2, 2, 2, 3, 3, 3],
  [1, 5, 5, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2],
  [2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  [3, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
];

export const ROCK_CRACKED: PixelGrid = [
  [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 2, 3, 3, 3],
  [2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 4, 3, 3, 3, 3, 2],
  [2, 2, 1, 2, 2, 2, 2, 2, 2, 4, 3, 3, 3, 3, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 4, 4, 2, 2, 3, 3, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 4, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 4, 3, 2, 2, 2, 2, 2, 2, 3, 3],
  [2, 2, 2, 2, 2, 4, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [2, 2, 2, 2, 4, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 4, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3],
  [2, 2, 4, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  [3, 4, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
];

export const ROCK_CRYSTAL: PixelGrid = [
  [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2],
  [2, 2, 1, 2, 2, 2, 2, 5, 5, 2, 2, 3, 3, 3, 2, 2],
  [2, 2, 2, 2, 2, 2, 5, 5, 6, 2, 2, 2, 3, 3, 2, 2],
  [2, 2, 2, 2, 2, 2, 5, 6, 6, 5, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 5, 6, 5, 2, 2, 2, 2, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 5, 5, 2, 2, 2, 2, 2, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  [3, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
];

export type RockKind = "boulder" | "mossy" | "cracked" | "crystal";

export interface RockPalette {
  light: number;
  mid: number;
  dark: number;
  sparkle?: number;
  extra?: number;
}

export const ROCK_GRIDS: Record<RockKind, PixelGrid> = {
  boulder: ROCK_BOULDER,
  mossy: ROCK_MOSSY,
  cracked: ROCK_CRACKED,
  crystal: ROCK_CRYSTAL,
};

export const ROCK_PALETTES: Record<RockKind, RockPalette> = {
  boulder: { light: hex("#a09080"), mid: hex("#7a6a5a"), dark: hex("#3a2a20") },
  mossy: {
    light: hex("#a09080"), mid: hex("#7a6a5a"), dark: hex("#3a2a20"),
    sparkle: hex("#5c8848"), extra: hex("#3a6028"),
  },
  cracked: { light: hex("#a89888"), mid: hex("#807060"), dark: hex("#3a2a20") },
  crystal: {
    light: hex("#a09080"), mid: hex("#7a6a5a"), dark: hex("#3a2a20"),
    sparkle: hex("#a8e8f0"), extra: hex("#3878e8"),
  },
};

/** Deterministic per-tile rock variant — same coords always render the same. */
export function pickRock(x: number, y: number): RockKind {
  const h = (x * 73856093) ^ (y * 19349663);
  const m = ((h % 12) + 12) % 12;
  if (m < 6) return "boulder";
  if (m < 9) return "mossy";
  if (m < 11) return "cracked";
  return "crystal";
}
