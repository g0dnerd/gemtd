/**
 * Render the 8x8 pixel sprites as HTML elements (using the box-shadow trick
 * from the design's sprites.jsx). Used for HUD icons (heart, coin, gem chips).
 */

import { GEM_PALETTE, GemType } from './theme';
import { GEM_SPRITE, COIN_SPRITE, HEART_SPRITE, OUTLINE_COLOR, PixelGrid } from './sprites';

export interface PaletteCss {
  light: string;
  mid: string;
  dark: string;
  outline?: string;
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
  const colors = ['transparent', palette.light, palette.mid, palette.dark, palette.outline ?? OUTLINE_COLOR];
  const shadows: string[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x];
      if (!c) continue;
      shadows.push(`${x * px}px ${y * px}px 0 0 ${colors[c]}`);
    }
  }
  inner.style.boxShadow = shadows.join(',');
  root.appendChild(inner);
  return root;
}

export function htmlGem(type: GemType, size = 24, glow = false): HTMLDivElement {
  return htmlSprite(GEM_SPRITE, GEM_PALETTE[type].css, size, glow);
}

export function htmlHeart(size = 14): HTMLDivElement {
  return htmlSprite(HEART_SPRITE, { light: '#ff8898', mid: '#e8384c', dark: '#8c1820' }, size);
}

export function htmlCoin(size = 14): HTMLDivElement {
  return htmlSprite(COIN_SPRITE, { light: '#ffe068', mid: '#f0c038', dark: '#886820' }, size);
}
