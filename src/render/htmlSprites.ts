/**
 * Render the 8x8 pixel sprites as HTML elements (using the box-shadow trick
 * from the design's sprites.jsx). Used for HUD icons (heart, coin, gem chips).
 */

import { GEM_PALETTE, GemType, Quality } from './theme';
import { GEM_SPRITE, COIN_SPRITE, HEART_SPRITE, OUTLINE_COLOR, PixelGrid } from './sprites';
import { TIER_GRIDS, SPECIAL_SPRITES } from './spriteData';

export interface PaletteCss {
  light: string;
  mid: string;
  dark: string;
  outline?: string;
  sparkle?: string;
  extra?: string;
}

/** Build an HTMLDivElement that draws the given grid via a single huge box-shadow. */
export function htmlSprite(grid: PixelGrid, palette: PaletteCss, size: number, glow = false): HTMLDivElement {
  const px = Math.max(1, Math.floor(size / grid.length));
  const root = document.createElement('div');
  root.className = 'px-sprite';
  root.style.width = `${grid[0]!.length * px}px`;
  root.style.height = `${grid.length * px}px`;
  root.style.setProperty('--px-sprite-px', `${px}px`);
  if (glow) {
    root.style.filter = `drop-shadow(0 0 ${px * 2}px ${palette.mid})`;
  }
  const inner = document.createElement('div');
  const colors: Record<number, string | undefined> = {
    1: palette.light,
    2: palette.mid,
    3: palette.dark,
    4: palette.outline ?? OUTLINE_COLOR,
    5: palette.sparkle,
    6: palette.extra,
  };
  const shadows: string[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x];
      if (!c) continue;
      const color = colors[c];
      if (!color) continue;
      shadows.push(`${x * px}px ${y * px}px 0 0 ${color}`);
    }
  }
  inner.style.boxShadow = shadows.join(',');
  root.appendChild(inner);
  return root;
}

export function htmlGem(type: GemType, size = 24, glow = false): HTMLDivElement {
  return htmlSprite(GEM_SPRITE, GEM_PALETTE[type].css, size, glow);
}

/** Tier-aware gem icon: T1 chipped → T5 marquise, with the gem's palette. */
export function htmlGemTier(type: GemType, quality: Quality, size = 24, glow = false): HTMLDivElement {
  return htmlSprite(TIER_GRIDS[quality], GEM_PALETTE[type].css, size, glow);
}

const hex6 = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

const SPECIAL_CSS_PALETTES: Record<string, PaletteCss> = Object.fromEntries(
  Object.entries(SPECIAL_SPRITES).map(([key, spec]) => [
    key,
    {
      light: hex6(spec.palette.light),
      mid: hex6(spec.palette.mid),
      dark: hex6(spec.palette.dark),
      sparkle: hex6(spec.palette.sparkle),
    },
  ]),
);

/** Special-combo silhouette + per-special palette (e.g. Star Ruby, Bloodstone). */
export function htmlSpecial(comboKey: string, size = 24, glow = false): HTMLDivElement {
  const spec = SPECIAL_SPRITES[comboKey];
  const palette = SPECIAL_CSS_PALETTES[comboKey];
  if (!spec || !palette) {
    return htmlGem('diamond', size, glow);
  }
  return htmlSprite(spec.grid, palette, size, glow);
}

export function htmlHeart(size = 14): HTMLDivElement {
  return htmlSprite(HEART_SPRITE, { light: '#ff8898', mid: '#e8384c', dark: '#8c1820' }, size);
}

export function htmlCoin(size = 14): HTMLDivElement {
  return htmlSprite(COIN_SPRITE, { light: '#ffe068', mid: '#f0c038', dark: '#886820' }, size);
}
