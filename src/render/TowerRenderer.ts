/**
 * Tower sprite cache. Each (gem, quality, comboKey) tuple is rasterized to a
 * texture once and reused for all tower instances. For combo specials, the
 * special silhouette + special palette is used; otherwise the per-tier
 * silhouette + gem palette is used.
 */

import { Container, Graphics, Renderer, Sprite, Texture } from "pixi.js";
import { GEM_PALETTE, GemType, Quality } from "./theme";
import { TOWER_BASE } from "./sprites";
import { rasterizeToTexture } from "./pixelTexture";
import {
  TIER_GRIDS,
  SPECIAL_SPRITES,
  SPECIAL_TIER_GRIDS,
  ROCK_GRIDS,
  ROCK_PALETTES,
  RockKind,
} from "./spriteData";
import type { EventBus } from "../events/EventBus";

const TOWER_SCALE = 3; // pixels per sprite-pixel

export class TowerSpriteCache {
  private gemTextures = new Map<string, Texture>();
  private rockTextures = new Map<RockKind, Texture>();

  // bus param kept for future audio/event hooks; not used yet.
  constructor(private renderer: Renderer, _bus: EventBus) {}

  gemTexture(gem: GemType, quality: Quality, comboKey?: string, upgradeTier = 0): Texture {
    const key = `${gem}:${quality}:${comboKey ?? "base"}:${upgradeTier}`;
    let tex = this.gemTextures.get(key);
    if (tex) return tex;

    if (comboKey && SPECIAL_SPRITES[comboKey]) {
      const spec = SPECIAL_SPRITES[comboKey];
      const tierGrids = SPECIAL_TIER_GRIDS[comboKey];
      const effectiveTier = Math.min(upgradeTier + 1, 3) as 2 | 3;
      const grid = (effectiveTier > 1 && tierGrids?.[effectiveTier]) || spec.grid;
      tex = rasterizeToTexture(
        this.renderer,
        grid,
        {
          light: spec.palette.light,
          mid: spec.palette.mid,
          dark: spec.palette.dark,
          sparkle: spec.palette.sparkle,
        },
        TOWER_SCALE,
      );
    } else {
      const palette = GEM_PALETTE[gem];
      const grid = TIER_GRIDS[quality];
      tex = rasterizeToTexture(
        this.renderer,
        grid,
        { light: palette.light, mid: palette.mid, dark: palette.dark },
        TOWER_SCALE,
      );
    }

    this.gemTextures.set(key, tex);
    return tex;
  }

  rock(kind: RockKind): Texture {
    let tex = this.rockTextures.get(kind);
    if (tex) return tex;
    const grid = ROCK_GRIDS[kind];
    const pal = ROCK_PALETTES[kind];
    tex = rasterizeToTexture(
      this.renderer,
      grid,
      {
        light: pal.light,
        mid: pal.mid,
        dark: pal.dark,
        sparkle: pal.sparkle,
        extra: pal.extra,
      },
      1,
    );
    this.rockTextures.set(kind, tex);
    return tex;
  }
}

/** Build a tower sprite — gem centered on the tile, with an optional T4/T5 socket. */
export function makeTowerSprite(
  gem: GemType,
  quality: Quality,
  cache: TowerSpriteCache,
  comboKey?: string,
  upgradeTier = 0,
): Container {
  const root = new Container();

  const tex = cache.gemTexture(gem, quality, comboKey, upgradeTier);
  const gemSprite = new Sprite(tex);
  gemSprite.anchor.set(0.5, 0.5);
  gemSprite.x = 0;
  gemSprite.y = 0;

  // Socket (T4 / T5 base gems only): a 12×2 colored ring just under the gem.
  if (!comboKey && (quality === 4 || quality === 5)) {
    const socketW = 12 * TOWER_SCALE;
    const socketH = 2 * TOWER_SCALE;
    const sx = -socketW / 2;
    const sy = gemSprite.height / 2 - socketH;
    const palette = GEM_PALETTE[gem];
    const socket = new Graphics();
    socket.rect(sx - 1, sy - 1, socketW + 2, socketH + 2).fill(TOWER_BASE.outline);
    socket.rect(sx, sy, socketW, socketH).fill(palette.mid);
    socket.rect(sx, sy, socketW, 1).fill(palette.light);
    root.addChild(socket);
  }

  root.addChild(gemSprite);
  return root;
}

export function makeRockSprite(cache: TowerSpriteCache, kind: RockKind): Sprite {
  const tex = cache.rock(kind);
  const s = new Sprite(tex);
  s.anchor.set(0, 0);
  return s;
}
