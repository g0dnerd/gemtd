/**
 * Tower sprite cache. Each (gem, quality) pair is rasterized to a texture
 * once and reused for all tower instances.
 */

import { Container, Graphics, Renderer, Sprite, Texture } from 'pixi.js';
import { GEM_PALETTE, GemType, Quality, QUALITY_GLOW, QUALITY_SCALE } from './theme';
import { GEM_SPRITE, ROCK_SPRITE, ROCK_PALETTE, TOWER_BASE } from './sprites';
import { rasterizeToTexture } from './pixelTexture';
import { TILE } from '../game/constants';
import type { EventBus } from '../events/EventBus';

const TOWER_SCALE = 3; // pixels per sprite-pixel

export class TowerSpriteCache {
  private gemTextures = new Map<string, Texture>();
  private rockTexture: Texture | null = null;

  // bus param kept for future audio/event hooks; not used yet.
  constructor(private renderer: Renderer, _bus: EventBus) {}

  gemTexture(gem: GemType, quality: Quality): Texture {
    const key = `${gem}:${quality}`;
    let tex = this.gemTextures.get(key);
    if (!tex) {
      const palette = GEM_PALETTE[gem];
      tex = rasterizeToTexture(
        this.renderer,
        GEM_SPRITE,
        { light: palette.light, mid: palette.mid, dark: palette.dark },
        TOWER_SCALE,
        QUALITY_GLOW[quality],
      );
      this.gemTextures.set(key, tex);
    }
    return tex;
  }

  rock(): Texture {
    if (!this.rockTexture) {
      this.rockTexture = rasterizeToTexture(
        this.renderer,
        ROCK_SPRITE,
        {
          light: parseInt(ROCK_PALETTE.light.slice(1), 16),
          mid: parseInt(ROCK_PALETTE.mid.slice(1), 16),
          dark: parseInt(ROCK_PALETTE.dark.slice(1), 16),
        },
        TOWER_SCALE,
      );
    }
    return this.rockTexture;
  }
}

/** Build a tower sprite (stone base + gem on top). */
export function makeTowerSprite(gem: GemType, quality: Quality, cache: TowerSpriteCache): Container {
  const root = new Container();
  // Stone base — rect with bevels. The tower occupies a 2×2 fine-cell region
  // (= 1 coarse tile), so all measurements are in TILE units centred on (0,0).
  const base = new Graphics();
  const bw = TILE - 6;
  const bh = Math.floor(TILE * 0.55);
  const bx = -bw / 2;
  const by = TILE / 2 - bh - 1;
  base.rect(bx, by, bw, bh).fill(TOWER_BASE.fill);
  base.rect(bx, by, bw, 1).fill(TOWER_BASE.highlight);
  base.rect(bx, by, 1, bh).fill(TOWER_BASE.highlight);
  base.rect(bx, by + bh - 1, bw, 1).fill(TOWER_BASE.shadow);
  base.rect(bx + bw - 1, by, 1, bh).fill(TOWER_BASE.shadow);
  // outline
  base.rect(bx - 1, by - 1, bw + 2, 1).fill(TOWER_BASE.outline);
  base.rect(bx - 1, by + bh, bw + 2, 1).fill(TOWER_BASE.outline);
  base.rect(bx - 1, by - 1, 1, bh + 2).fill(TOWER_BASE.outline);
  base.rect(bx + bw, by - 1, 1, bh + 2).fill(TOWER_BASE.outline);
  root.addChild(base);

  // Gem on top
  const tex = cache.gemTexture(gem, quality);
  const gemSprite = new Sprite(tex);
  gemSprite.anchor.set(0.5);
  gemSprite.scale.set(QUALITY_SCALE[quality]);
  gemSprite.y = -TILE / 2 + Math.floor(TILE * 0.4);
  root.addChild(gemSprite);

  return root;
}

export function makeRockSprite(cache: TowerSpriteCache): Container {
  const root = new Container();
  const tex = cache.rock();
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  root.addChild(s);
  return root;
}
