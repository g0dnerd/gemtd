/**
 * Rasterize a pixel-art grid into a PIXI texture.
 * The output texture is `grid.width * pxScale` square, drawn as solid color rects.
 */

import {
  Graphics,
  RenderTexture,
  Renderer,
  Texture,
  Sprite,
  Container,
  BlurFilter,
} from "pixi.js";
import { PixelGrid, OUTLINE_COLOR } from "./sprites";

export interface SpriteColors {
  /**
   * Pixel-grid value → color slot:
   *   1 = light, 2 = mid, 3 = dark (gem-tinted)
   *   4 = outline      (defaults to OUTLINE_COLOR)
   *   5 = sparkle/ink  (also used for eye whites / armor highlights)
   *   6 = extra/bad    (boss red glow eyes)
   *   7 = accent       (boss crown / warm metal trims)
   */
  light: number;
  mid: number;
  dark: number;
  outline?: number;
  sparkle?: number;
  extra?: number;
  accent?: number;
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
  const palette: Record<number, number | undefined> = {
    1: colors.light,
    2: colors.mid,
    3: colors.dark,
    4: colors.outline ?? HEX_OUTLINE,
    5: colors.sparkle,
    6: colors.extra,
    7: colors.accent,
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
  const rt = RenderTexture.create({
    width: w + padding * 2,
    height: h + padding * 2,
  });

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

/**
 * Render a smooth (antialiased) ring stroke to a reusable white texture.
 *
 * The global renderer runs `antialias: false` to keep pixel sprites crisp, which
 * leaves thin curved strokes (e.g. a charge ring) badly staircased. We dodge that
 * by supersampling: draw the ring `ss`x larger, then display the sprite at 1/ss —
 * the linear downscale on the texture's own sampler smooths the curve, independent
 * of MSAA support. Texture is white so callers can `sprite.tint` it any color.
 *
 * Returned texture is `(radius + pad) * 2` CSS px square at unit scale; the caller
 * sets the sprite anchor to 0.5 and `scale = 1 / ss` (exposed as `tex.__ss`-free —
 * callers know ss). Keep one per (radius,width) and cache it.
 */
export function generateRingTexture(
  renderer: Renderer,
  radius: number,
  strokeWidth: number,
  ss = 4,
  pad = 6,
): { tex: Texture; scale: number } {
  const dim = (radius + pad) * 2;
  const rt = RenderTexture.create({
    width: dim * ss,
    height: dim * ss,
    antialias: true,
  });
  const g = new Graphics();
  const c = (dim * ss) / 2;
  g.circle(c, c, radius * ss).stroke({
    width: strokeWidth * ss,
    color: 0xffffff,
    alpha: 1,
  });
  renderer.render({ container: g, target: rt });
  g.destroy();
  return { tex: rt, scale: 1 / ss };
}
