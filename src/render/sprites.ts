/**
 * 8x8 pixel-art sprites, ported from the design handoff (sprites.jsx).
 *
 * Convention for pixel grid values:
 *   0 = transparent
 *   1 = light
 *   2 = mid
 *   3 = dark
 *   4 = outline (#0a0510)
 */

export type PixelGrid = readonly (readonly number[])[];

export const SPRITE_SIZE = 8;
export const OUTLINE_COLOR = '#0a0510';

/** Faceted gem shape — top-left lit, bottom-right shadowed. */
export const GEM_SPRITE: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 1, 2, 2, 4, 0],
  [4, 1, 1, 2, 2, 2, 3, 4],
  [4, 1, 2, 2, 2, 3, 3, 4],
  [4, 2, 2, 2, 3, 3, 3, 4],
  [4, 2, 2, 3, 3, 3, 3, 4],
  [0, 4, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 0, 0],
];

/** Basic creep shape. */
export const CREEP_SPRITE: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 0, 0],
  [0, 4, 2, 2, 2, 2, 4, 0],
  [4, 2, 1, 2, 2, 1, 2, 4],
  [4, 2, 4, 2, 2, 4, 2, 4],
  [4, 2, 2, 2, 2, 2, 2, 4],
  [4, 2, 2, 4, 4, 2, 2, 4],
  [0, 4, 2, 2, 2, 2, 4, 0],
  [0, 0, 4, 0, 0, 4, 0, 0],
];

/** Heart for the lives chip. */
export const HEART_SPRITE: PixelGrid = [
  [0, 4, 4, 0, 0, 4, 4, 0],
  [4, 2, 1, 4, 4, 2, 1, 4],
  [4, 2, 2, 2, 2, 2, 1, 4],
  [4, 2, 2, 2, 2, 2, 2, 4],
  [0, 4, 2, 2, 2, 2, 4, 0],
  [0, 0, 4, 2, 2, 4, 0, 0],
  [0, 0, 0, 4, 4, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

/** Coin for the gold chip. */
export const COIN_SPRITE: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 2, 2, 2, 4, 0],
  [4, 1, 2, 4, 4, 2, 2, 4],
  [4, 2, 2, 4, 2, 2, 2, 4],
  [4, 2, 2, 4, 2, 2, 2, 4],
  [4, 2, 2, 4, 4, 2, 2, 4],
  [0, 4, 2, 2, 2, 2, 4, 0],
  [0, 0, 4, 4, 4, 4, 0, 0],
];

/** Rock — placed when a tower is sold; blocks pathing. */
export const ROCK_SPRITE: PixelGrid = [
  [0, 0, 4, 4, 4, 4, 0, 0],
  [0, 4, 1, 2, 2, 2, 3, 4],
  [4, 1, 2, 2, 2, 3, 3, 4],
  [4, 2, 2, 4, 2, 2, 3, 4],
  [4, 2, 4, 2, 2, 2, 3, 4],
  [4, 2, 2, 2, 4, 2, 3, 4],
  [0, 4, 3, 3, 3, 3, 4, 0],
  [0, 0, 4, 4, 4, 4, 0, 0],
];

export const ROCK_PALETTE = {
  light: '#a09080',
  mid: '#7a6a5a',
  dark: '#4a3a2a',
};

/** Stone tower base, drawn as a rectangle separately (not a sprite grid). */
export const TOWER_BASE = {
  fill: 0x7a6a5a,
  highlight: 0x9a8a7a,
  shadow: 0x4a3a2a,
  outline: 0x2a1a10,
};
