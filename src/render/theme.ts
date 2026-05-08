/**
 * Theme tokens — Cozy Twilight palette.
 * Values mirror src/styles/pixel.css; kept here so PIXI Graphics can use them.
 */

export const THEME = {
  bg: 0x2a2238,
  panel: 0x3d3252,
  panel2: 0x524470,
  ink: 0xf4e4c1,
  inkDim: 0xb8a584,
  borderDark: 0x1a1428,
  accent: 0xf0a040,
  good: 0x58c850,
  bad: 0xd04848,
  info: 0x78a8f8,
} as const;

export const CELL = {
  grass: 0x3a5840,
  grassHi: 0x4c7050,
  grassLo: 0x284028,
  path: 0x6b5230,
  pathHi: 0x8a6c44,
  pathLo: 0x4a3820,
  rock: 0x5a4a3a,
  rockHi: 0x7a6a5a,
  rockLo: 0x2a1a10,
  start: 0xd04848,
  startHi: 0xf06868,
  startLo: 0x802020,
  end: 0xf0c038,
  endHi: 0xffe068,
  endLo: 0x886820,
  // Variant B "Cobblestone Keep" tokens.
  wallSeam: 0x0a0510,
  wallBrickAlt: 0x241830,
  pathStone: 0x9a7c54,
  pathStoneAlt: 0x7a5e38,
  pathMortar: 0x3a2818,
  grassClover: 0x88e878,
  grassTuft: 0x5a8a60,
  crystalLight: 0xc8e0ff,
  crystalCore: 0x78a8f8,
  crystalDeep: 0x3868c8,
} as const;

export type GemType = 'ruby' | 'sapphire' | 'emerald' | 'topaz' | 'amethyst' | 'opal' | 'diamond' | 'aquamarine';

export const GEM_TYPES: GemType[] = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'opal', 'diamond', 'aquamarine'];

export interface GemPaletteEntry {
  name: string;
  light: number;
  mid: number;
  dark: number;
  /** CSS-friendly version, for HTML icons. */
  css: { name: string; light: string; mid: string; dark: string };
}

export const GEM_PALETTE: Record<GemType, GemPaletteEntry> = {
  ruby: {
    name: 'Ruby',
    light: 0xff6878, mid: 0xe8384c, dark: 0x8c1820,
    css: { name: 'Ruby', light: '#ff6878', mid: '#e8384c', dark: '#8c1820' },
  },
  sapphire: {
    name: 'Sapphire',
    light: 0x78a8f8, mid: 0x3878e8, dark: 0x1c3878,
    css: { name: 'Sapphire', light: '#78a8f8', mid: '#3878e8', dark: '#1c3878' },
  },
  emerald: {
    name: 'Emerald',
    light: 0x78e898, mid: 0x38c860, dark: 0x186830,
    css: { name: 'Emerald', light: '#78e898', mid: '#38c860', dark: '#186830' },
  },
  topaz: {
    name: 'Topaz',
    light: 0xffe068, mid: 0xf0c038, dark: 0x886820,
    css: { name: 'Topaz', light: '#ffe068', mid: '#f0c038', dark: '#886820' },
  },
  amethyst: {
    name: 'Amethyst',
    light: 0xd090f0, mid: 0xa050e0, dark: 0x582878,
    css: { name: 'Amethyst', light: '#d090f0', mid: '#a050e0', dark: '#582878' },
  },
  opal: {
    name: 'Opal',
    light: 0xfff8f8, mid: 0xf0d8d8, dark: 0xa07878,
    css: { name: 'Opal', light: '#fff8f8', mid: '#f0d8d8', dark: '#a07878' },
  },
  diamond: {
    name: 'Diamond',
    light: 0xffffff, mid: 0xd8f0f8, dark: 0x6890a8,
    css: { name: 'Diamond', light: '#ffffff', mid: '#d8f0f8', dark: '#6890a8' },
  },
  aquamarine: {
    name: 'Aquamarine',
    light: 0xb8f4ee, mid: 0x7fe6e1, dark: 0x2c8a86,
    css: { name: 'Aquamarine', light: '#b8f4ee', mid: '#7fe6e1', dark: '#2c8a86' },
  },
};

/** Quality tiers — SC2 GemTD canonical names; UI displays them as L1..L5. */
export type Quality = 1 | 2 | 3 | 4 | 5;

export const QUALITY_NAMES: Record<Quality, string> = {
  1: 'Chipped',
  2: 'Flawed',
  3: 'Normal',
  4: 'Flawless',
  5: 'Perfect',
};

export const TIER_COLORS: Record<Quality, string> = {
  1: '#8c7a5e',
  2: '#b8a584',
  3: '#f4e4c1',
  4: '#f0a040',
  5: '#58c850',
};

/** Visual tweak: gem render size scales up with quality. */
export const QUALITY_SCALE: Record<Quality, number> = {
  1: 1.0,
  2: 1.1,
  3: 1.2,
  4: 1.3,
  5: 1.45,
};

/** Glow strength per quality (0..1). */
export const QUALITY_GLOW: Record<Quality, number> = {
  1: 0.0,
  2: 0.15,
  3: 0.35,
  4: 0.6,
  5: 0.9,
};
