/**
 * Rasterize a pixel-art grid into a PIXI texture.
 * The output texture is `grid.width * pxScale` square, drawn as solid color rects.
 */

import { Graphics, RenderTexture, Renderer, Texture, Sprite, Container, BlurFilter } from 'pixi.js';
import { PixelGrid, OUTLINE_COLOR } from './sprites';

export interface SpriteColors {
  /** Hex color strings (no '#'). Index 1 = light, 2 = mid, 3 = dark, 4 = outline. */
  light: number;
  mid: number;
  dark: number;
  outline?: number;
}

const HEX_OUTLINE = parseInt(OUTLINE_COLOR.slice(1), 16);

/** Draw a pixel grid into a Graphics object as solid colored rects. */
export function drawPixelGrid(
  g: Graphics,
  grid: PixelGrid,
  colors: SpriteColors,
  pxScale: number,
  ox = 0,
  oy = 0,
): void {
  const palette: Record<number, number> = {
    1: colors.light,
    2: colors.mid,
    3: colors.dark,
    4: colors.outline ?? HEX_OUTLINE,
  };
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (!c) continue;
      const color = palette[c];
      if (color === undefined) continue;
      g.rect(ox + x * pxScale, oy + y * pxScale, pxScale, pxScale).fill(color);
    }
  }
}

/** Build a one-shot Graphics object containing the rasterized grid. */
export function pixelGraphics(
  grid: PixelGrid,
  colors: SpriteColors,
  pxScale: number,
): Graphics {
  const g = new Graphics();
  drawPixelGrid(g, grid, colors, pxScale);
  return g;
}

/**
 * Rasterize to a reusable texture. Useful when many sprites share the same look
 * (e.g. all chipped rubies on the board).
 */
export function rasterizeToTexture(
  renderer: Renderer,
  grid: PixelGrid,
  colors: SpriteColors,
  pxScale: number,
  withGlow = 0,
): Texture {
  const w = grid[0]!.length * pxScale;
  const h = grid.length * pxScale;

  const padding = withGlow > 0 ? Math.ceil(pxScale * 4) : 0;
  const rt = RenderTexture.create({ width: w + padding * 2, height: h + padding * 2 });

  const container = new Container();
  if (withGlow > 0) {
    const glowSprite = pixelGraphics(grid, colors, pxScale);
    glowSprite.position.set(padding, padding);
    const blur = new BlurFilter({ strength: Math.max(2, pxScale), quality: 2 });
    glowSprite.filters = [blur];
    glowSprite.alpha = withGlow;
    container.addChild(glowSprite);
  }

  const g = pixelGraphics(grid, colors, pxScale);
  g.position.set(padding, padding);
  container.addChild(g);

  renderer.render({ container, target: rt });
  container.destroy({ children: true });

  return rt;
}

export function spriteFromTexture(tex: Texture): Sprite {
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  return s;
}
