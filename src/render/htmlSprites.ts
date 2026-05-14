/**
 * Render the 8x8 pixel sprites as HTML elements (using the box-shadow trick
 * from the design's sprites.jsx). Used for HUD icons (heart, coin, gem chips).
 */

import { GEM_PALETTE, GemType, Quality, THEME } from './theme';
import { GEM_SPRITE, COIN_SPRITE, HEART_SPRITE, OUTLINE_COLOR, PixelGrid, SPRITE_BY_KIND } from './sprites';
import { TIER_GRIDS, SPECIAL_SPRITES, SPECIAL_TIER_GRIDS, SPECIAL_TIER_PALETTES, applyOpalFlecks, OPAL_FLECK_CSS } from './spriteData';
import type { CreepKind } from '../data/creeps';

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
  if (type !== 'opal') {
    return htmlSprite(TIER_GRIDS[quality], GEM_PALETTE[type].css, size, glow);
  }
  const grid = applyOpalFlecks(TIER_GRIDS[quality], quality);
  const palette = GEM_PALETTE[type].css;
  const px = Math.max(1, Math.floor(size / grid.length));
  const root = document.createElement('div');
  root.className = 'px-sprite';
  root.style.width = `${grid[0].length * px}px`;
  root.style.height = `${grid.length * px}px`;
  root.style.position = 'relative';
  root.style.setProperty('--px-sprite-px', `${px}px`);
  if (glow) {
    root.style.filter = `drop-shadow(0 0 ${px * 2}px ${palette.mid})`;
  }
  const colors: Record<number, string | undefined> = {
    1: palette.light,
    2: palette.mid,
    3: palette.dark,
    4: OUTLINE_COLOR,
  };
  const shadows: string[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x];
      if (!c || c === 5) continue;
      const color = colors[c];
      if (!color) continue;
      shadows.push(`${x * px}px ${y * px}px 0 0 ${color}`);
    }
  }
  const inner = document.createElement('div');
  inner.style.boxShadow = shadows.join(',');
  root.appendChild(inner);
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== 5) continue;
      const span = document.createElement('span');
      span.className = 'opal-fleck';
      span.style.position = 'absolute';
      span.style.left = `${x * px}px`;
      span.style.top = `${y * px}px`;
      span.style.width = `${px}px`;
      span.style.height = `${px}px`;
      span.style.background = OPAL_FLECK_CSS;
      span.style.animationDelay = `${(x + y) * 0.12}s`;
      root.appendChild(span);
    }
  }
  return root;
}

const hex6 = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Special-combo silhouette + per-special palette (e.g. Star Ruby, Bloodstone). */
export function htmlSpecial(comboKey: string, size = 24, glow = false, upgradeTier = 0): HTMLDivElement {
  const spec = SPECIAL_SPRITES[comboKey];
  if (!spec) {
    return htmlGem('diamond', size, glow);
  }
  const effectiveTier = Math.min(upgradeTier + 1, 3) as 2 | 3;
  const tierGrids = SPECIAL_TIER_GRIDS[comboKey];
  const grid = (effectiveTier > 1 && tierGrids?.[effectiveTier]) || spec.grid;
  const tierPalette = effectiveTier > 1
    ? SPECIAL_TIER_PALETTES[comboKey]?.[effectiveTier]
    : undefined;
  const pal = tierPalette ?? spec.palette;
  const cssPal: PaletteCss = {
    light: hex6(pal.light),
    mid: hex6(pal.mid),
    dark: hex6(pal.dark),
    sparkle: hex6(pal.sparkle),
  };
  return htmlSprite(grid, cssPal, size, glow);
}

export function htmlHeart(size = 14): HTMLDivElement {
  return htmlSprite(HEART_SPRITE, { light: '#ff8898', mid: '#e8384c', dark: '#8c1820' }, size);
}

export function htmlCoin(size = 14): HTMLDivElement {
  return htmlSprite(COIN_SPRITE, { light: '#ffe068', mid: '#f0c038', dark: '#886820' }, size);
}

export function htmlCreep(kind: CreepKind, color: GemType, size = 36, glow = false): HTMLDivElement {
  const palette = GEM_PALETTE[color];
  const css: PaletteCss = {
    light: palette.css.light,
    mid: palette.css.mid,
    dark: palette.css.dark,
    outline: OUTLINE_COLOR,
    sparkle: hex6(THEME.ink),
    extra: hex6(THEME.bad),
  };
  return htmlSprite(SPRITE_BY_KIND[kind], css, size, glow);
}
