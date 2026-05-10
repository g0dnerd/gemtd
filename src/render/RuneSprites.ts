/**
 * Rune sprite data and texture generation.
 *
 * Direction A: Engraved Stone Tablet — a 14x14 pixel stone paver with a
 * carved recess containing a glowing glyph.
 */

import { Graphics, Texture, type Renderer } from 'pixi.js';
import { RUNE, type RuneEffect } from './theme';

// 14x14 tablet base. 0=transparent, 1=stoneLight, 2=stoneMid, 3=stoneDark, 4=outline
const TABLET_BASE: number[][] = [
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

const GLYPHS: Record<RuneEffect, number[][]> = {
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

function tabletColor(code: number): number | null {
  switch (code) {
    case 1: return RUNE.stoneLight;
    case 2: return RUNE.stoneMid;
    case 3: return RUNE.stoneDark;
    case 4: return RUNE.outline;
    default: return null;
  }
}

export function generateRuneTexture(renderer: Renderer, effect: RuneEffect): Texture {
  const g = new Graphics();
  const palette = RUNE[effect];

  // Draw tablet base
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 14; x++) {
      const code = TABLET_BASE[y][x];
      const color = tabletColor(code);
      if (color !== null) {
        g.rect(x, y, 1, 1).fill(color);
      }
    }
  }

  // Recess fill — glow color at low opacity over the 4x4 center
  g.rect(5, 5, 4, 4).fill({ color: palette.glow, alpha: 0.22 });

  // Glyph etched shadow (offset +1, +1 in glyphDeep)
  const glyph = GLYPHS[effect];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (glyph[y][x]) {
        g.rect(3 + x + 1, 3 + y + 1, 1, 1).fill(palette.glyphDeep);
      }
    }
  }

  // Glyph main pass
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (glyph[y][x]) {
        g.rect(3 + x, 3 + y, 1, 1).fill(palette.glyph);
      }
    }
  }

  return renderer.generateTexture({ target: g, resolution: 1 });
}

export function runeEffectFromComboKey(key: string): RuneEffect | null {
  switch (key) {
    case 'rune_holding': return 'holding';
    case 'rune_damage': return 'damage';
    case 'rune_teleport': return 'teleport';
    case 'rune_slow': return 'slow';
    default: return null;
  }
}
