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
  // Soft-horror "Caul" ground — a near-black liver membrane that replaces the
  // old verdant grass. Four value stops (dark -> light) drive a warped value-
  // noise field; vein/sheen are sparse feature colours. Rendered per 3px block
  // by drawGrassCell so the field breaks the 18px tile grid (no cell tiling).
  ground0: 0x1b1518,
  ground1: 0x221a1d,
  ground2: 0x281e22,
  ground3: 0x2e242a,
  groundVein: 0x3a2228,
  groundSheen: 0x352b32,
  // Worn "ideal path" road baked into the tissue under the rocks: a lifted
  // desaturated core with a sunken darker rim just outside it.
  groundRoadCore: 0x473b3d,
  groundRoadLip: 0x130d10,
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
  crystalLight: 0xc8e0ff,
  crystalCore: 0x78a8f8,
  crystalDeep: 0x3868c8,
} as const;

export type GemType = 'ruby' | 'sapphire' | 'emerald' | 'topaz' | 'amethyst' | 'opal' | 'diamond' | 'aquamarine' | 'garnet' | 'spinel' | 'peridot';

export const GEM_TYPES: GemType[] = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'opal', 'diamond', 'aquamarine', 'garnet', 'spinel', 'peridot'];

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
    light: 0x5a6878, mid: 0x1e2632, dark: 0x06080e,
    css: { name: 'Opal', light: '#5a6878', mid: '#1e2632', dark: '#06080e' },
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
  garnet: {
    name: 'Garnet',
    light: 0xd06848, mid: 0x8a2830, dark: 0x381010,
    css: { name: 'Garnet', light: '#d06848', mid: '#8a2830', dark: '#381010' },
  },
  spinel: {
    name: 'Spinel',
    light: 0xf080c0, mid: 0xc03888, dark: 0x601840,
    css: { name: 'Spinel', light: '#f080c0', mid: '#c03888', dark: '#601840' },
  },
  peridot: {
    name: 'Peridot',
    light: 0xd8f060, mid: 0xa8c828, dark: 0x445818,
    css: { name: 'Peridot', light: '#d8f060', mid: '#a8c828', dark: '#445818' },
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

export const APEX_STARGEM = {
  c1: 0xcfd8ff,
  c2: 0x6478b8,
  c3: 0x0d1132,
  outline: 0x0a0510,
  spark: 0xffffff,
  accent: 0xffe066,
  aura: 0x7c8cff,
} as const;

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

/**
 * Rock palette for permanent maze blockers — the mossy-boulder material:
 * greened granite, damp and overgrown. `light/mid/dark` map to grid slots
 * 1/2/3; `sparkle/extra/accent` map to 5/6/7 for moss flecks and tufts.
 * `shadow` is the colour of the cast contact shadow rendered as a separate
 * low-alpha sprite under the rock.
 */
export const ROCK_PAL = {
  mossBoulder: {
    light: 0x8c9482, mid: 0x5c6452, dark: 0x2a2e26, outline: 0x0a0f0a,
    sparkle: 0x9ad06a, extra: 0x4a7a38, accent: 0xc8e08a,
    shadow: 0x0a1206,
  },
} as const;

export type RuneEffect = 'holding' | 'damage' | 'teleport' | 'slow';

export const RUNE = {
  outline: 0x0a0510,
  stoneLight: 0xcdb78a,
  stoneMid: 0x8a6e44,
  stoneDark: 0x3a2a1a,

  holding:  { glow: 0xffc54a, glyph: 0xfff0a8, glyphDeep: 0xa06818, trigger: 0xffe890 },
  damage:   { glow: 0xff4838, glyph: 0xffd0a8, glyphDeep: 0x7a1010, trigger: 0xffb070 },
  teleport: { glow: 0xb048f0, glyph: 0xe8b8ff, glyphDeep: 0x48107a, trigger: 0xd890ff },
  slow:     { glow: 0x48d0f0, glyph: 0xd0f4ff, glyphDeep: 0x104878, trigger: 0xa8eaff },
} as const;
