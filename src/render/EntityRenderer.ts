/**
 * Per-frame rendering of dynamic entities (towers, rocks, creeps, projectiles)
 * and the hover/range previews.
 *
 * We render each entity as a long-lived display object keyed by id. On each
 * frame we sync the display objects' positions to state and prune any whose
 * source entity has been removed.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { CreepState, ProjectileState, RockState, State, TowerState } from "../game/State";
import { activeDraw } from "../game/State";
import { FINE_TILE, TILE } from "../game/constants";
import { GEM_PALETTE, type GemType, RUNE, THEME } from "./theme";
import { TowerSpriteCache, makeTowerSprite } from "./TowerRenderer";
import { OPAL_FRAME_COUNT, SPECIAL_SPRITES, SPECIAL_TIER_GRIDS } from "./spriteData";
import { gemStats } from "../data/gems";
import { COMBO_BY_NAME, comboStatsAtTier } from "../data/combos";
import { SPRITE_BY_KIND, SPRITE_CHRYSALID_AWAKE, SPRITE_GESTATION_ENRAGED } from "./sprites";
import { drawPixelGrid } from "./pixelTexture";
import { GRID_W, GRID_H } from "../data/map";
import { SPECIAL_FX } from "./spriteData";
import { rasterizeToTexture } from "./pixelTexture";
import { pickRockVariant } from "./RockSprites";
import { APEX_STARGEM } from "./theme";
import { generateRuneTexture, runeEffectFromComboKey } from "./RuneSprites";

interface PerEntity {
  obj: Container;
  lastHpRatio?: number;
  rockBorder?: Graphics;
  chrysalidAwakened?: boolean;
  gestationEnraged?: boolean;
}

interface StargemFx {
  ground: Graphics;
  outerHalo: Graphics;
  innerHalo: Graphics;
  rayBurst: Container;
  crownSparks: Graphics[];
  orbitals: Container[];
  pinpricks: Graphics[];
  spriteWrap: Container;
}

interface RedCrystalFx {
  beams: Graphics[];
  ripple?: Graphics;
  tier: number;
  color: number;
}

interface MalachiteFx {
  dots: Graphics[];
  trails?: Graphics[];
  tier: number;
  color: number;
}

interface ParaibaFx {
  arcs: Graphics[];
  tier: number;
}

interface TowerEntry {
  obj: Container;
  /** Cached comboKey so we can rebuild the sprite if a tower is upgraded. */
  comboKey: string | undefined;
  gem: string;
  quality: number;
  upgradeTier: number;
  /** FX layer (halo/aura/orbit/ground), only set for special towers. */
  fx?: TowerFx;
  /** Dedicated FX layer for the Stargem apex tower. */
  stargemFx?: StargemFx;
  /** Pre-cached 8-frame textures for opal shimmer animation. */
  opalFrames?: Texture[];
  /** The Sprite inside the tower container whose texture is swapped for opal animation. */
  opalSprite?: Sprite;
  /** Last rendered opal frame index. */
  opalFrame?: number;
  /** Wrapper for jade combo sprite bobbing animation. */
  jadeBobWrap?: Container;
  /** Wrapper for bloodstone magma bob animation. */
  bloodstoneBobWrap?: Container;
  /** Ember-hot overlay sprite for bloodstone T2+ tint flash. */
  bloodstoneEmberSprite?: Sprite;
  /** Wrapper for silver gleam sweep + bob animation. */
  silverBobWrap?: Container;
  /** Moving gleam bar for silver idle animation. */
  /** Bright frost overlay sprite for Silver Knight shatter pulse. */
  silverFrostSprite?: Sprite;
  ysBobWrap?: Container;
  ysFrostSprite?: Sprite;
  /** Red Crystal "sky watcher pulse" — upward beam(s) + optional ripple ring. */
  redCrystalFx?: RedCrystalFx;
  /** Malachite "split focus" — orbiting target dots / ring. */
  malachiteFx?: MalachiteFx;
  /** Wrapper for uranium throb bob animation. */
  uraniumBobWrap?: Container;
  /** Irradiated overlay sprite for uranium throb tint pulse. */
  uraniumIrradiatedSprite?: Sprite;
  /** Wrapper for black opal dark shimmer bob animation. */
  blackOpalBobWrap?: Container;
  /** Iridescent tint overlay sprite for black opal shimmer. */
  blackOpalShimmerSprite?: Sprite;
  /** Wrapper for star ruby corona pulse animation. */
  starRubyBobWrap?: Container;
  /** Hot corona overlay sprite for star ruby pulse tint. */
  starRubyCoronaSprite?: Sprite;
  paraibaBobWrap?: Container;
  paraibaFx?: ParaibaFx;
  selBracket?: Graphics;
  hoverBracket?: Graphics;
}

interface TowerFx {
  halo: Graphics;
  ground?: Graphics;
  aura?: Graphics;
  orbit?: Graphics;
  haloPeak: number;
  haloPulse: number;
  glow: number;
}

const GESTATION_COLORS_CALM = {
  light: 0xe8dcd0,
  mid: 0xb89878,
  dark: 0x1a0810,
  outline: 0x0a0510,
  sparkle: 0xc83040,
  extra: 0xe8a8a0,
  accent: 0xd8c898,
};

const GESTATION_COLORS_ENRAGED = {
  light: 0xf8f0e0,
  mid: 0xa88060,
  dark: 0x1a0408,
  outline: 0x0a0510,
  sparkle: 0xe82030,
  extra: 0xf0605a,
  accent: 0xf0e0b0,
};

const BLOODSTONE_EMBER_PALETTE = {
  light: 0xffb868,
  mid: 0xff4020,
  dark: 0x881010,
  sparkle: 0xffff90,
};

const SILVER_FROST_PALETTE = {
  light: 0xffffff,
  mid: 0xe0f0ff,
  dark: 0xa0c8e8,
  sparkle: 0xffffff,
};

const YS_FROST_PALETTE = {
  light: 0xfffff0,
  mid: 0xffe890,
  dark: 0xf0b830,
  sparkle: 0xffffff,
};

const towerObjs = new Map<number, TowerEntry>();
const rockObjs = new Map<number, PerEntity>();
const creepObjs = new Map<number, PerEntity>();
const projectileObjs = new Map<number, PerEntity>();

const runeTextureCache = new Map<string, Texture>();

export function renderTowers(layer: Container, towers: TowerState[], cache: TowerSpriteCache, selectedTowerId: number | null = null, hoveredTowerId: number | null = null): void {
  const now = performance.now();
  const seen = new Set<number>();
  for (const t of towers) {
    seen.add(t.id);
    const tier = t.upgradeTier ?? 0;
    let entry = towerObjs.get(t.id);
    if (!entry || entry.comboKey !== t.comboKey || entry.quality !== t.quality || entry.upgradeTier !== tier) {
      if (entry) {
        entry.obj.destroy({ children: true });
        towerObjs.delete(t.id);
      }
      const obj = new Container();
      let fx: TowerFx | undefined;
      let sgfx: StargemFx | undefined;
      let opalFrames: Texture[] | undefined;
      let jadeBobWrap: Container | undefined;
      let redCrystalFx: RedCrystalFx | undefined;
      let malachiteFx: MalachiteFx | undefined;
      let bloodstoneBobWrap: Container | undefined;
      let bloodstoneEmberSprite: Sprite | undefined;
      let silverBobWrap: Container | undefined;
      let silverFrostSprite: Sprite | undefined;
      let ysBobWrap: Container | undefined;
      let ysFrostSprite: Sprite | undefined;
      let uraniumBobWrap: Container | undefined;
      let uraniumIrradiatedSprite: Sprite | undefined;
      let blackOpalBobWrap: Container | undefined;
      let blackOpalShimmerSprite: Sprite | undefined;
      let starRubyBobWrap: Container | undefined;
      let starRubyCoronaSprite: Sprite | undefined;
      let paraibaBobWrap: Container | undefined;
      let paraibaFx: ParaibaFx | undefined;

      // Rune (trap) rendering — flat stone tablet with glyph + glow halo
      const runeEffect = t.isTrap && t.comboKey ? runeEffectFromComboKey(t.comboKey) : null;
      if (runeEffect) {
        let tex = runeTextureCache.get(runeEffect);
        if (!tex) {
          tex = generateRuneTexture(cache.renderer, runeEffect);
          runeTextureCache.set(runeEffect, tex);
        }
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5, 0.5);
        const runeScale = 24 / 14;
        sprite.scale.set(runeScale);
        obj.addChild(sprite);
        // Idle glow halo
        const palette = RUNE[runeEffect];
        const halo = new Graphics();
        const r = FINE_TILE * 0.9;
        for (let i = 5; i > 0; i--) {
          halo.circle(0, 0, r * (i / 5)).fill({ color: palette.glow, alpha: 0.08 });
        }
        obj.addChild(halo);
        fx = { halo, haloPeak: 0.7, haloPulse: 2.4, glow: palette.glow };
      } else if (t.comboKey === "stargem") {
        sgfx = makeStargemFx(obj);
        const towerSprite = makeTowerSprite(t.gem, t.quality, cache, t.comboKey, tier);
        sgfx.spriteWrap.addChild(towerSprite);
      } else {
        if (t.comboKey && SPECIAL_FX[t.comboKey]) {
          fx = makeSpecialFx(obj, t.comboKey);
        }
        const towerSprite = makeTowerSprite(t.gem, t.quality, cache, t.comboKey, tier);
        if (t.comboKey === 'jade') {
          const wrap = new Container();
          wrap.addChild(towerSprite);
          obj.addChild(wrap);
          jadeBobWrap = wrap;
        } else if (t.comboKey === 'bloodstone') {
          const wrap = new Container();
          wrap.addChild(towerSprite);
          if (tier >= 1) {
            const spec = SPECIAL_SPRITES['bloodstone'];
            const tierGrids = SPECIAL_TIER_GRIDS['bloodstone'];
            const effectiveTier = Math.min(tier + 1, 3) as 2 | 3;
            const grid = (effectiveTier > 1 && tierGrids?.[effectiveTier]) || spec.grid;
            const emberTex = rasterizeToTexture(cache.renderer, grid, BLOODSTONE_EMBER_PALETTE, 3);
            const es = new Sprite(emberTex);
            es.anchor.set(0.5, 0.5);
            es.alpha = 0;
            wrap.addChild(es);
            bloodstoneEmberSprite = es;
          }
          obj.addChild(wrap);
          bloodstoneBobWrap = wrap;
        } else if (t.comboKey === 'silver') {
          const wrap = new Container();
          wrap.addChild(towerSprite);
          const sSpec = SPECIAL_SPRITES['silver'];
          const sTierGrids = SPECIAL_TIER_GRIDS['silver'];
          const sEff = Math.min(tier + 1, 3) as 2 | 3;
          const sGrid = (sEff > 1 && sTierGrids?.[sEff]) || sSpec.grid;
          if (tier >= 2) {
            const frostTex = rasterizeToTexture(cache.renderer, sGrid, SILVER_FROST_PALETTE, 3);
            const fs = new Sprite(frostTex);
            fs.anchor.set(0.5, 0.5);
            fs.alpha = 0;
            fs.blendMode = 'add';
            wrap.addChild(fs);
            silverFrostSprite = fs;
          }
          obj.addChild(wrap);
          silverBobWrap = wrap;
        } else if (t.comboKey === 'yellow_sapphire') {
          const wrap = new Container();
          wrap.addChild(towerSprite);
          if (tier >= 1) {
            const ysSpec = SPECIAL_SPRITES['yellow_sapphire'];
            const ysTierGrids = SPECIAL_TIER_GRIDS['yellow_sapphire'];
            const ysEff = Math.min(tier + 1, 3) as 2 | 3;
            const ysGrid = (ysEff > 1 && ysTierGrids?.[ysEff]) || ysSpec.grid;
            const frostTex = rasterizeToTexture(cache.renderer, ysGrid, YS_FROST_PALETTE, 3);
            const fs = new Sprite(frostTex);
            fs.anchor.set(0.5, 0.5);
            fs.alpha = 0;
            fs.blendMode = 'add';
            wrap.addChild(fs);
            ysFrostSprite = fs;
          }
          obj.addChild(wrap);
          ysBobWrap = wrap;
        } else if (t.comboKey === 'uranium') {
          const wrap = new Container();
          wrap.addChild(towerSprite);
          const uSpec = SPECIAL_SPRITES['uranium'];
          const uTierGrids = SPECIAL_TIER_GRIDS['uranium'];
          const uEff = Math.min(tier + 1, 3) as 2 | 3;
          const uGrid = (uEff > 1 && uTierGrids?.[uEff]) || uSpec.grid;
          const irradTex = rasterizeToTexture(cache.renderer, uGrid, URANIUM_IRRADIATED_PALETTE, 3);
          const is = new Sprite(irradTex);
          is.anchor.set(0.5, 0.5);
          is.alpha = 0;
          is.blendMode = 'add';
          wrap.addChild(is);
          uraniumIrradiatedSprite = is;
          obj.addChild(wrap);
          uraniumBobWrap = wrap;
        } else if (t.comboKey === 'black_opal') {
          const wrap = new Container();
          wrap.addChild(towerSprite);
          const boSpec = SPECIAL_SPRITES['black_opal'];
          const boTierGrids = SPECIAL_TIER_GRIDS['black_opal'];
          const boEff = Math.min(tier + 1, 3) as 2 | 3;
          const boGrid = (boEff > 1 && boTierGrids?.[boEff]) || boSpec.grid;
          const shimmerTex = rasterizeToTexture(cache.renderer, boGrid, BLACK_OPAL_SHIMMER_PALETTE, 3);
          const ss = new Sprite(shimmerTex);
          ss.anchor.set(0.5, 0.5);
          ss.alpha = 0;
          ss.blendMode = 'add';
          wrap.addChild(ss);
          blackOpalShimmerSprite = ss;
          obj.addChild(wrap);
          blackOpalBobWrap = wrap;
        } else if (t.comboKey === 'star_ruby') {
          const wrap = new Container();
          wrap.addChild(towerSprite);
          if (tier >= 1) {
            const srSpec = SPECIAL_SPRITES['star_ruby'];
            const srTierGrids = SPECIAL_TIER_GRIDS['star_ruby'];
            const srEff = Math.min(tier + 1, 3) as 2 | 3;
            const srGrid = (srEff > 1 && srTierGrids?.[srEff]) || srSpec.grid;
            const coronaTex = rasterizeToTexture(cache.renderer, srGrid, STAR_RUBY_CORONA_PALETTE, 3);
            const cs = new Sprite(coronaTex);
            cs.anchor.set(0.5, 0.5);
            cs.alpha = 0;
            cs.blendMode = 'add';
            wrap.addChild(cs);
            starRubyCoronaSprite = cs;
          }
          obj.addChild(wrap);
          starRubyBobWrap = wrap;
        } else if (t.comboKey === 'paraiba_tourmaline') {
          const wrap = new Container();
          wrap.addChild(towerSprite);
          paraibaFx = makeParaibaArcFx(wrap, tier);
          obj.addChild(wrap);
          paraibaBobWrap = wrap;
        } else {
          obj.addChild(towerSprite);
        }
        if (t.gem === "opal" && !t.comboKey) {
          opalFrames = cache.opalFrameTextures(t.quality);
        }
        if (t.comboKey === 'red_crystal') {
          redCrystalFx = makeRedCrystalFx(obj, tier);
        }
        if (t.comboKey === 'malachite') {
          malachiteFx = makeMalachiteFx(obj, tier);
        }
      }
      layer.addChild(obj);
      const opalSprite = opalFrames ? (obj.children[obj.children.length - 1] as Container).children[0] as Sprite : undefined;
      entry = { obj, comboKey: t.comboKey, gem: t.gem, quality: t.quality, upgradeTier: tier, fx, stargemFx: sgfx, opalFrames, opalSprite, jadeBobWrap, bloodstoneBobWrap, bloodstoneEmberSprite, silverBobWrap, silverFrostSprite, ysBobWrap, ysFrostSprite, redCrystalFx, malachiteFx, uraniumBobWrap, uraniumIrradiatedSprite, blackOpalBobWrap, blackOpalShimmerSprite, starRubyBobWrap, starRubyCoronaSprite, paraibaBobWrap, paraibaFx };
      towerObjs.set(t.id, entry);
    }
    entry.obj.x = (t.x + 1) * FINE_TILE;
    entry.obj.y = (t.y + 1) * FINE_TILE;
    if (entry.stargemFx) animateStargemFx(entry.stargemFx, now);
    else if (entry.uraniumBobWrap) animateUraniumThrobFx(entry, now);
    else if (entry.bloodstoneBobWrap) animateBloodstoneFx(entry, now);
    else if (entry.silverBobWrap) animateSilverFx(entry, now);
    else if (entry.ysBobWrap) animateYellowSapphireFx(entry, now);
    else if (entry.blackOpalBobWrap) animateBlackOpalFx(entry, now);
    else if (entry.starRubyBobWrap) animateStarRubyFx(entry, now);
    else if (entry.paraibaBobWrap) animateParaibaArcFx(entry, now);
    else if (entry.fx) animateTowerFx(entry.fx, now);
    if (entry.opalFrames && entry.opalSprite) {
      const frame = Math.floor(now / 225) % OPAL_FRAME_COUNT;
      if (frame !== entry.opalFrame) {
        entry.opalFrame = frame;
        entry.opalSprite.texture = entry.opalFrames[frame];
      }
    }
    if (entry.jadeBobWrap) {
      const sec = now / 1000;
      const tier = entry.upgradeTier;
      const amp = 1.5 + tier * 0.5;
      const period = 2.0 - tier * 0.4;
      entry.jadeBobWrap.y = -amp * (1 - Math.cos((2 * Math.PI * sec) / period)) / 2;
    }
    if (entry.redCrystalFx) animateRedCrystalFx(entry.redCrystalFx, now);
    if (entry.malachiteFx) animateMalachiteFx(entry.malachiteFx, now);
    const isSelected = t.id === selectedTowerId;
    if (isSelected && !entry.selBracket) {
      const palette = GEM_PALETTE[t.gem as GemType];
      entry.selBracket = new Graphics();
      drawCornerBrackets(entry.selBracket, 2 * FINE_TILE, palette.light);
      entry.obj.addChild(entry.selBracket);
    } else if (!isSelected && entry.selBracket) {
      entry.selBracket.destroy();
      entry.selBracket = undefined;
    }
    if (entry.selBracket) {
      entry.selBracket.alpha = 1;
    }
    const isHovered = !isSelected && t.id === hoveredTowerId;
    if (isHovered && !entry.hoverBracket) {
      const palette = GEM_PALETTE[t.gem as GemType];
      entry.hoverBracket = new Graphics();
      drawCornerBrackets(entry.hoverBracket, 2 * FINE_TILE, palette.light);
      entry.hoverBracket.alpha = 0.45;
      entry.obj.addChild(entry.hoverBracket);
    } else if (!isHovered && entry.hoverBracket) {
      entry.hoverBracket.destroy();
      entry.hoverBracket = undefined;
    }
  }
  for (const [id, entry] of towerObjs) {
    if (!seen.has(id)) {
      entry.obj.destroy({ children: true });
      towerObjs.delete(id);
    }
  }
}

/** Build the per-special FX layer (halo + optional ground tint, aura, orbit). */
function makeSpecialFx(parent: Container, comboKey: string): TowerFx {
  const fxCfg = SPECIAL_FX[comboKey];
  const ground = fxCfg.ground !== null ? new Graphics() : undefined;
  if (ground) {
    // 1×1 coarse tile, centred on tower anchor (which sits on the 2×2 corner).
    const half = TILE / 2;
    ground.rect(-half + 1, -half + 1, TILE - 2, TILE - 2).fill(fxCfg.ground!);
    ground.alpha = 0.45;
    parent.addChild(ground);
  }

  const halo = new Graphics();
  // Soft radial glow approximated by stacking concentric translucent circles.
  const r = TILE * 0.9;
  for (let i = 6; i > 0; i--) {
    const t = i / 6;
    halo.circle(0, 0, r * t).fill({ color: fxCfg.glow, alpha: 0.12 });
  }
  parent.addChild(halo);

  let aura: Graphics | undefined;
  if (fxCfg.aura) {
    aura = new Graphics();
    drawDashedRing(aura, TILE * 0.62, fxCfg.glow);
    parent.addChild(aura);
  }

  let orbit: Graphics | undefined;
  if (fxCfg.orbit) {
    orbit = new Graphics();
    orbit.rect(-2, -2, 4, 4).fill(fxCfg.glow);
    parent.addChild(orbit);
  }

  return {
    halo,
    ground,
    aura,
    orbit,
    haloPeak: fxCfg.halo,
    haloPulse: fxCfg.pulse,
    glow: fxCfg.glow,
  };
}

function drawDashedRing(g: Graphics, radius: number, color: number): void {
  const segs = 24;
  const dashArc = (Math.PI * 2) / segs;
  const steps = 6;
  for (let i = 0; i < segs; i++) {
    if (i % 2 === 1) continue;
    const a0 = i * dashArc;
    const a1 = a0 + dashArc * 0.6;
    g.moveTo(Math.cos(a0) * radius, Math.sin(a0) * radius);
    for (let s = 1; s <= steps; s++) {
      const a = a0 + (a1 - a0) * (s / steps);
      g.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
  }
  g.stroke({ width: 1.5, color, alpha: 0.6 });
}

function animateTowerFx(fx: TowerFx, now: number): void {
  const t = now / 500;
  const phase = (Math.sin((t / fx.haloPulse) * Math.PI * 2) + 1) / 2;
  // Halo: pulse between 40% and 100% of peak alpha.
  fx.halo.alpha = fx.haloPeak * (0.4 + 0.6 * phase);

  if (fx.aura) {
    // Slow rotation, 6 s per turn.
    fx.aura.rotation = (t / 6) * Math.PI * 2;
    fx.aura.alpha = 0.55;
  }
  if (fx.orbit) {
    // 4 s loop around the tower at ~radius TILE*0.55.
    const ang = (t / 4) * Math.PI * 2;
    const r = TILE * 0.55;
    fx.orbit.x = Math.cos(ang) * r;
    fx.orbit.y = Math.sin(ang) * r * 0.9;
  }
}

// ===== Bloodstone — Magma Bob ================================================

function animateBloodstoneFx(entry: TowerEntry, now: number): void {
  const sec = now / 1000;
  const tier = entry.upgradeTier;
  const period = tier >= 1 ? 2.0 : 2.75;
  const amp = tier >= 1 ? 4 : 3;

  const raw = Math.sin((2 * Math.PI * sec) / period);
  const shaped = tier >= 1
    ? (raw > 0 ? Math.pow(raw, 0.6) : -Math.pow(-raw, 2.5))
    : (raw > 0 ? Math.pow(raw, 0.8) : -Math.pow(-raw, 1.8));

  entry.bloodstoneBobWrap!.y = -shaped * amp;

  if (entry.fx) {
    const bobPhase = (shaped + 1) / 2;
    entry.fx.halo.alpha = entry.fx.haloPeak * (0.3 + 0.5 * bobPhase);
  }

  if (entry.bloodstoneEmberSprite) {
    entry.bloodstoneEmberSprite.alpha = Math.max(0, Math.pow(Math.max(0, shaped), 3));
  }
}

// ===== Silver — Ice Gleam Sweep ==============================================

function animateSilverFx(entry: TowerEntry, now: number): void {
  const sec = now / 1000;
  const tier = entry.upgradeTier;

  let haloAlpha = 0.3;

  // Bob for Frosted Silver + Silver Knight (tier >= 1)
  if (tier >= 1) {
    const bobPeriod = 2.5;
    const bobAmp = 2;
    entry.silverBobWrap!.y = -bobAmp * Math.sin((2 * Math.PI * sec) / bobPeriod);
  }

  // Frost shatter pulse for Silver Knight (tier >= 2)
  if (tier >= 2 && entry.silverFrostSprite) {
    const shatterPeriod = 4.0;
    const sc = (sec % shatterPeriod) / shatterPeriod;

    let freeze = 0;
    let scale = 1;
    let flare = 0;

    if (sc >= 0.60 && sc < 0.70) {
      const p = (sc - 0.60) / 0.10;
      freeze = p * p;
    } else if (sc >= 0.70 && sc < 0.78) {
      freeze = 1;
    } else if (sc >= 0.78 && sc < 0.88) {
      const p = (sc - 0.78) / 0.10;
      freeze = 1 - p * p;
      scale = 1 + 0.12 * Math.sin(p * Math.PI);
      flare = (1 - p) * 0.6;
    }

    entry.silverFrostSprite.alpha = freeze * 0.5;
    entry.silverBobWrap!.scale.set(scale);
    haloAlpha = Math.min(1, haloAlpha + flare);
  }

  if (entry.fx) {
    entry.fx.halo.alpha = entry.fx.haloPeak * haloAlpha;
  }
}

// ===== Yellow Sapphire — Frost Pulse + Drift Float ==========================

function animateYellowSapphireFx(entry: TowerEntry, now: number): void {
  const sec = now / 1000;
  const tier = entry.upgradeTier;

  let haloAlpha = 0.3;

  if (tier >= 1) {
    // T2+: compound figure-8 horizontal drift + vertical bob (snowflake-in-wind)
    const fig8Period = 5.0;
    const bobPeriod = 2.5;
    const driftAmp = 1.5;
    const bobAmp = 2.0;
    const fig8Phase = (2 * Math.PI * sec) / fig8Period;
    entry.ysBobWrap!.x = driftAmp * Math.sin(fig8Phase);
    entry.ysBobWrap!.y = -(driftAmp * 0.5 * Math.sin(2 * fig8Phase) + bobAmp * Math.sin((2 * Math.PI * sec) / bobPeriod));

    haloAlpha = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(fig8Phase));
  } else {
    // T1: rhythmic scale pulse (3s cold exhale)
    const pulsePeriod = 3.0;
    const phase = (sec % pulsePeriod) / pulsePeriod;
    const pulse = Math.sin(phase * Math.PI * 2);
    const scale = 1 + 0.04 * (0.5 + 0.5 * pulse);
    entry.ysBobWrap!.scale.set(scale);

    haloAlpha = 0.3 + 0.4 * (0.5 + 0.5 * pulse);
  }

  // Frost overlay brightens at T2+
  if (tier >= 1 && entry.ysFrostSprite) {
    const flashPeriod = 3.5;
    const fp = (sec % flashPeriod) / flashPeriod;
    const flash = Math.pow(Math.max(0, Math.sin(fp * Math.PI * 2)), 3);
    entry.ysFrostSprite.alpha = flash * 0.35;
  }

  if (entry.fx) {
    entry.fx.halo.alpha = entry.fx.haloPeak * haloAlpha;
  }
}

// ===== Uranium — Radioactive Throb ============================================

const URANIUM_THROB_PERIOD = 2.8;

const URANIUM_IRRADIATED_PALETTE = {
  light: 0xf0ffc0,
  mid: 0xc0ff60,
  dark: 0x407828,
  sparkle: 0xffffe0,
};

const BLACK_OPAL_SHIMMER_PALETTE = {
  light: 0xffffff,
  mid: 0xc0c8ff,
  dark: 0x5060b0,
  sparkle: 0xffffff,
};

function animateUraniumThrobFx(entry: TowerEntry, now: number): void {
  const sec = now / 1000;
  const raw = (sec % URANIUM_THROB_PERIOD) / URANIUM_THROB_PERIOD;

  let throb: number;
  if (raw < 0.3) {
    throb = Math.pow(raw / 0.3, 0.5);
  } else {
    throb = 1 - Math.pow((raw - 0.3) / 0.7, 2);
  }

  const tier = entry.upgradeTier;
  const tintAlpha = throb * (tier >= 1 ? 0.5 : 0.35);
  entry.uraniumIrradiatedSprite!.alpha = tintAlpha;

  entry.uraniumBobWrap!.scale.set(1 + throb * 0.04);

  if (entry.fx) {
    entry.fx.halo.alpha = entry.fx.haloPeak * (0.2 + 0.8 * throb);
  }
}

// ===== Black Opal — Dark Shimmer =============================================

const SHIMMER_STOPS: [number, number, number][] = [
  [0x30, 0x48, 0xe0],  // deep blue
  [0x80, 0x30, 0xc0],  // violet
  [0x20, 0xa0, 0x68],  // green
];

function animateBlackOpalFx(entry: TowerEntry, now: number): void {
  const sec = now / 1000;

  const bobPeriod = 3.5;
  const bobAmp = 1.5;
  entry.blackOpalBobWrap!.y = -bobAmp * Math.sin((2 * Math.PI * sec) / bobPeriod);

  if (entry.blackOpalShimmerSprite) {
    const shimmerPeriod = 4.0;
    const phase = (sec % shimmerPeriod) / shimmerPeriod;

    const idx = phase * 3;
    const i = Math.floor(idx) % 3;
    const frac = idx - Math.floor(idx);
    const next = (i + 1) % 3;
    const r = Math.round(SHIMMER_STOPS[i][0] + (SHIMMER_STOPS[next][0] - SHIMMER_STOPS[i][0]) * frac);
    const g = Math.round(SHIMMER_STOPS[i][1] + (SHIMMER_STOPS[next][1] - SHIMMER_STOPS[i][1]) * frac);
    const b = Math.round(SHIMMER_STOPS[i][2] + (SHIMMER_STOPS[next][2] - SHIMMER_STOPS[i][2]) * frac);
    entry.blackOpalShimmerSprite.tint = (r << 16) | (g << 8) | b;

    const pulseRaw = Math.sin(phase * Math.PI * 6);
    entry.blackOpalShimmerSprite.alpha = 0.15 + 0.2 * (0.5 + 0.5 * pulseRaw);
  }

  if (entry.fx) {
    const haloPulse = (Math.sin((sec / 3.0) * Math.PI * 2) + 1) / 2;
    entry.fx.halo.alpha = entry.fx.haloPeak * (0.3 + 0.7 * haloPulse);
  }
}

// ===== Star Ruby — Corona Pulse =============================================

const STAR_RUBY_CORONA_PALETTE = {
  light: 0xfff0c0,
  mid: 0xff6040,
  dark: 0xe8384c,
  sparkle: 0xffffe0,
};

function animateStarRubyFx(entry: TowerEntry, now: number): void {
  const sec = now / 1000;
  const tier = entry.upgradeTier;

  let haloAlpha = 0.3;

  if (tier >= 2) {
    const strobePeriod = 1.4;
    const strobePhase = (sec % strobePeriod) / strobePeriod;
    const strobeIntensity = Math.pow(Math.max(0, 1 - strobePhase * 2.0), 2);
    const breathe = (Math.sin(sec * 1.2) + 1) / 2;
    const scale = 1.0 + strobeIntensity * 0.05 + breathe * 0.03;
    entry.starRubyBobWrap!.scale.set(scale);

    if (entry.starRubyCoronaSprite) {
      entry.starRubyCoronaSprite.alpha = strobeIntensity * 0.35 + breathe * 0.12;
    }

    haloAlpha = 0.25 + strobeIntensity * 0.3 + breathe * 0.1;
  } else if (tier >= 1) {
    const breathePeriod = 2.0;
    const breathePhase = (Math.sin((2 * Math.PI * sec) / breathePeriod) + 1) / 2;
    const breatheEased = Math.pow(breathePhase, 1.3);
    const scale = 1.0 + breatheEased * 0.08;
    entry.starRubyBobWrap!.scale.set(scale);

    const brightCycle = (Math.sin(sec * 2.2) + 1) / 2;
    if (entry.starRubyCoronaSprite) {
      entry.starRubyCoronaSprite.alpha = breatheEased * 0.2 + brightCycle * 0.08;
    }

    haloAlpha = 0.2 + breatheEased * 0.3;
  } else {
    const breathePeriod = 2.5;
    const breathePhase = (Math.sin((2 * Math.PI * sec) / breathePeriod) + 1) / 2;
    const breatheEased = Math.pow(breathePhase, 1.5);
    const scale = 1.0 + breatheEased * 0.06;
    entry.starRubyBobWrap!.scale.set(scale);

    haloAlpha = 0.15 + breatheEased * 0.2;
  }

  if (entry.fx) {
    entry.fx.halo.alpha = entry.fx.haloPeak * haloAlpha;
  }
}

// ===== Paraiba Tourmaline — Heavy Arc ========================================

const PARAIBA_TIPS_T0 = [
  { x: -7.5, y: -15 },
  { x: 4.5, y: -15 },
];
const PARAIBA_TIPS_T1 = [
  { x: -13.5, y: -18 },
  { x: 4.5, y: -18 },
  { x: 12, y: -12 },
];

function makeParaibaArcFx(parent: Container, tier: number): ParaibaFx {
  const arcCount = tier >= 1 ? 2 : 1;
  const arcs: Graphics[] = [];
  for (let i = 0; i < arcCount; i++) {
    const arc = new Graphics();
    parent.addChild(arc);
    arcs.push(arc);
  }
  return { arcs, tier };
}

function paraibaJaggedLine(x1: number, y1: number, x2: number, y2: number, seed: number): { x: number; y: number }[] {
  const pts = [{ x: x1, y: y1 }];
  const segments = 5;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const mx = x1 + dx * t;
    const my = y1 + dy * t;
    const bulge = Math.sin(t * Math.PI);
    const jitter = Math.sin(seed * 7.1 + i * 4.7) * 6 * bulge;
    pts.push({ x: mx + perpX * jitter, y: my + perpY * jitter });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

function animateParaibaArcFx(entry: TowerEntry, now: number): void {
  const sec = now / 1000;
  const tier = entry.upgradeTier;

  const bobPeriod = 2.5 - tier * 0.5;
  const bobAmp = 1.5 + tier * 1.0;
  entry.paraibaBobWrap!.y = -bobAmp * (1 - Math.cos((2 * Math.PI * sec) / bobPeriod)) / 2;

  const fx = entry.paraibaFx!;
  const cyclePeriod = tier >= 1 ? 5.0 : 7.0;
  const tips = tier >= 1 ? PARAIBA_TIPS_T1 : PARAIBA_TIPS_T0;
  const arcPairs = tier >= 1 ? [[0, 1], [1, 2]] : [[0, 1]];

  let maxArcAlpha = 0;

  for (let a = 0; a < fx.arcs.length; a++) {
    const arc = fx.arcs[a];
    arc.clear();

    const phase = ((sec / cyclePeriod) + a * 0.5) % 1;

    let arcAlpha: number;
    if (phase < 0.10) {
      arcAlpha = (phase / 0.10) * 0.85;
    } else if (phase < 0.25) {
      arcAlpha = 0.85;
    } else if (phase < 0.35) {
      arcAlpha = 0.85 * (1 - (phase - 0.25) / 0.10);
    } else {
      arcAlpha = 0;
    }

    maxArcAlpha = Math.max(maxArcAlpha, arcAlpha);

    if (arcAlpha > 0.05) {
      const [i1, i2] = arcPairs[a];
      const tip1 = tips[i1];
      const tip2 = tips[i2];

      const seed = Math.floor(sec * 1.2) + a * 50;
      const pts = paraibaJaggedLine(tip1.x, tip1.y, tip2.x, tip2.y, seed);

      arc.moveTo(pts[0].x, pts[0].y);
      for (let p = 1; p < pts.length; p++) arc.lineTo(pts[p].x, pts[p].y);
      arc.stroke({ width: 4, color: 0x00d8c8, alpha: arcAlpha * 0.25 });

      arc.moveTo(pts[0].x, pts[0].y);
      for (let p = 1; p < pts.length; p++) arc.lineTo(pts[p].x, pts[p].y);
      arc.stroke({ width: 2, color: 0xa8ffe8, alpha: arcAlpha });

      arc.circle(tip1.x, tip1.y, 1.5).fill({ color: 0xffffff, alpha: arcAlpha * 0.85 });
      arc.circle(tip2.x, tip2.y, 1.5).fill({ color: 0xffffff, alpha: arcAlpha * 0.85 });
    }
  }

  if (entry.fx) {
    const basePulse = (Math.sin((sec / 1.8) * Math.PI * 2) + 1) / 2;
    entry.fx.halo.alpha = entry.fx.haloPeak * (0.3 + 0.4 * basePulse + 0.3 * maxArcAlpha);
  }
}

// ===== Red Crystal — Sky Watcher Pulse ======================================

const RC_COLOR = 0xff5478;

function makeRedCrystalFx(parent: Container, tier: number): RedCrystalFx {
  const beamCount = tier >= 1 ? 2 : 1;
  const beams: Graphics[] = [];
  for (let i = 0; i < beamCount; i++) {
    const beam = new Graphics();
    parent.addChild(beam);
    beams.push(beam);
  }
  let ripple: Graphics | undefined;
  if (tier >= 2) {
    ripple = new Graphics();
    parent.addChild(ripple);
  }
  return { beams, ripple, tier, color: RC_COLOR };
}

function animateRedCrystalFx(fx: RedCrystalFx, now: number): void {
  const sec = now / 1000;
  const period = 2.2;
  const phase = (sec % period) / period;

  const beamH = FINE_TILE * 0.8;
  const beamW = 1.5;
  const xSpread = fx.tier >= 1 ? 3 : 0;

  for (let i = 0; i < fx.beams.length; i++) {
    const beam = fx.beams[i];
    beam.clear();
    const offset = fx.beams.length === 1 ? 0 : (i === 0 ? -xSpread : xSpread);
    const stagger = i * 0.3;
    const p = ((phase + stagger) % 1);
    const rise = p * beamH * 1.5;
    const alpha = p < 0.5
      ? 0.3 + 0.5 * (p / 0.5)
      : 0.8 * (1 - (p - 0.5) / 0.5);
    if (alpha > 0.01) {
      const segH = beamH * (1 - p * 0.6);
      beam.rect(offset - beamW / 2, -rise - segH, beamW, segH)
        .fill({ color: fx.color, alpha });
      beam.circle(offset, -rise - segH, beamW)
        .fill({ color: 0xffffff, alpha: alpha * 0.7 });
    }
  }

  if (fx.ripple) {
    fx.ripple.clear();
    const ripplePeriod = 3.0;
    const rp = (sec % ripplePeriod) / ripplePeriod;
    const maxR = TILE * 0.7;
    const r = rp * maxR;
    const alpha = 0.5 * (1 - rp);
    if (alpha > 0.01) {
      fx.ripple.circle(0, 0, r)
        .stroke({ width: 1.5, color: fx.color, alpha });
    }
  }
}

// ===== Malachite — Split Focus ==============================================

const ML_COLOR = 0xa0e878;

function makeMalachiteFx(parent: Container, tier: number): MalachiteFx {
  const dots: Graphics[] = [];
  let trails: Graphics[] | undefined;

  if (tier >= 1) {
    trails = [];
    for (let i = 0; i < 3; i++) {
      const trail = new Graphics();
      parent.addChild(trail);
      trails.push(trail);
    }
  }

  for (let i = 0; i < 3; i++) {
    const dot = new Graphics();
    parent.addChild(dot);
    dots.push(dot);
  }

  return { dots, trails, tier, color: ML_COLOR };
}

function animateMalachiteFx(fx: MalachiteFx, now: number): void {
  const sec = now / 1000;
  const orbitPeriod = 3.5;
  const baseAng = (sec / orbitPeriod) * Math.PI * 2;
  const r = TILE * 0.5;
  const dotSize = 1.5 + fx.tier * 0.5;

  for (let i = 0; i < 3; i++) {
    const ang = baseAng + (i / 3) * Math.PI * 2;
    const dx = Math.cos(ang) * r;
    const dy = Math.sin(ang) * r * 0.85;

    if (fx.trails && fx.trails[i]) {
      const trail = fx.trails[i];
      trail.clear();
      for (let s = 1; s <= 3; s++) {
        const trailAng = ang - (s * 0.12);
        const tx = Math.cos(trailAng) * r;
        const ty = Math.sin(trailAng) * r * 0.85;
        trail.circle(tx, ty, dotSize * 0.6)
          .fill({ color: fx.color, alpha: 0.15 / s });
      }
    }

    const dot = fx.dots[i];
    dot.clear();
    dot.circle(dx, dy, dotSize)
      .fill({ color: fx.color, alpha: 0.7 + fx.tier * 0.1 });
    dot.circle(dx, dy, dotSize * 0.5)
      .fill({ color: 0xffffff, alpha: 0.5 });
  }
}

// ===== Stargem Supernova FX ================================================

function makeStargemFx(parent: Container): StargemFx {
  const half = TILE / 2;

  // 1. Ground tint
  const ground = new Graphics();
  ground.rect(-half + 1, -half + 1, TILE - 2, TILE - 2).fill(APEX_STARGEM.aura);
  ground.alpha = 0.28;
  ground.blendMode = "screen";
  parent.addChild(ground);

  // 2. Constellation pinpricks (4 corner dots)
  const inset = 0.12;
  const corners = [
    { x: -half * (1 - inset), y: -half * (1 - inset) },
    { x: half * (1 - inset), y: -half * (1 - inset) },
    { x: -half * (1 - inset), y: half * (1 - inset) },
    { x: half * (1 - inset), y: half * (1 - inset) },
  ];
  const pinpricks: Graphics[] = [];
  for (const pos of corners) {
    const p = new Graphics();
    p.circle(pos.x, pos.y, 1).fill(0xffffff);
    parent.addChild(p);
    pinpricks.push(p);
  }

  // 3. Ray burst (8 spokes)
  const rayBurst = new Container();
  const rayGfx = new Graphics();
  const innerR = TILE * 0.22;
  const outerR = TILE * 0.72;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const hw = Math.PI * 2 * 0.02;
    rayGfx.poly([
      Math.cos(a) * innerR, Math.sin(a) * innerR,
      Math.cos(a - hw) * outerR, Math.sin(a - hw) * outerR,
      Math.cos(a + hw) * outerR, Math.sin(a + hw) * outerR,
    ]).fill({ color: APEX_STARGEM.accent, alpha: 0.7 });
  }
  rayBurst.addChild(rayGfx);
  parent.addChild(rayBurst);

  // 4. Outer halo
  const outerHalo = new Graphics();
  const haloR = TILE * 0.9;
  for (let i = 6; i > 0; i--) {
    outerHalo.circle(0, 0, haloR * (i / 6)).fill({ color: APEX_STARGEM.aura, alpha: 0.14 });
  }
  parent.addChild(outerHalo);

  // 5. Inner halo core
  const innerHalo = new Graphics();
  const coreR = TILE * 0.4;
  for (let i = 4; i > 0; i--) {
    const c = i > 2 ? APEX_STARGEM.c1 : APEX_STARGEM.aura;
    innerHalo.circle(0, 0, coreR * (i / 4)).fill({ color: c, alpha: 0.18 });
  }
  parent.addChild(innerHalo);

  // 6. Sprite wrap (bobs vertically)
  const spriteWrap = new Container();
  parent.addChild(spriteWrap);

  // 7. Crown sparks (8 around sprite)
  const crownSparks: Graphics[] = [];
  const sparkR = TILE * 0.36;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const s = new Graphics();
    s.circle(0, 0, 2.5).fill({ color: APEX_STARGEM.accent, alpha: 0.5 });
    s.circle(0, 0, 1).fill(0xffffff);
    s.x = Math.cos(angle) * sparkR;
    s.y = Math.sin(angle) * sparkR;
    parent.addChild(s);
    crownSparks.push(s);
  }

  // 8. Orbitals (4 dots on rotating tracks)
  const orbDefs = [
    { color: 0xffffff, r: 1.05, size: 1.5 },
    { color: APEX_STARGEM.accent, r: 1.20, size: 1.8 },
    { color: APEX_STARGEM.c1, r: 1.35, size: 1.2 },
    { color: 0xffffff, r: 1.50, size: 0.9 },
  ];
  const orbitals: Container[] = [];
  for (const def of orbDefs) {
    const orb = new Container();
    const dot = new Graphics();
    dot.circle(0, 0, def.size + 0.5).fill({ color: def.color, alpha: 0.35 });
    dot.circle(0, 0, def.size).fill(def.color);
    dot.y = -(half * 0.6 * def.r);
    orb.addChild(dot);
    parent.addChild(orb);
    orbitals.push(orb);
  }

  return { ground, outerHalo, innerHalo, rayBurst, crownSparks, orbitals, pinpricks, spriteWrap };
}

const ORBITAL_PERIODS = [1.6, 2.4, 3.4, 5.0];
const ORBITAL_DELAYS = [0, -0.4, -1.2, -2.0];
const PIN_DELAYS = [0, 0.6, 1.2, 1.8];

function animateStargemFx(fx: StargemFx, now: number): void {
  const t = now / 500;

  // Sprite bob: 0 → -3 → 0 over 2.4s
  fx.spriteWrap.y = -1.5 * (1 - Math.cos((2 * Math.PI * t) / 2.4));

  // Outer halo: pulse 2.4s (opacity 0.55–1.0, scale 1.0–1.06)
  const op = (Math.sin((t / 2.4) * Math.PI * 2) + 1) / 2;
  fx.outerHalo.alpha = 0.85 * (0.55 + 0.45 * op);
  fx.outerHalo.scale.set(1 + 0.06 * op);

  // Inner halo: fast pulse 1.0s
  const ip = (Math.sin((t / 1.0) * Math.PI * 2) + 1) / 2;
  fx.innerHalo.alpha = 0.55 + 0.45 * ip;
  fx.innerHalo.scale.set(1 + 0.06 * ip);

  // Ray burst: spin 14s + pulse 2.2s
  fx.rayBurst.rotation = (t / 14) * Math.PI * 2;
  const rp = (Math.sin((t / 2.2) * Math.PI * 2) + 1) / 2;
  fx.rayBurst.alpha = 0.7 * (0.55 + 0.45 * rp);

  // Crown sparks (8): twinkle 1.6s, 0.18s stagger chase
  for (let i = 0; i < 8; i++) {
    const sp = (Math.sin(((t - i * 0.18) / 1.6) * Math.PI * 2) + 1) / 2;
    fx.crownSparks[i].alpha = 0.2 + 0.8 * sp;
    fx.crownSparks[i].scale.set(0.7 + 0.4 * sp);
  }

  // Orbitals (4): different speeds and phase delays
  for (let i = 0; i < 4; i++) {
    fx.orbitals[i].rotation = ((t - ORBITAL_DELAYS[i]) / ORBITAL_PERIODS[i]) * Math.PI * 2;
  }

  // Constellation pinpricks: twinkle 2.4s, staggered
  for (let i = 0; i < 4; i++) {
    const pp = (Math.sin(((t - PIN_DELAYS[i]) / 2.4) * Math.PI * 2) + 1) / 2;
    fx.pinpricks[i].alpha = 0.2 + 0.8 * pp;
    fx.pinpricks[i].scale.set(0.7 + 0.4 * pp);
  }

}

export function renderRocks(layer: Container, rocks: RockState[], cache: TowerSpriteCache, selectedRockId: number | null = null): void {
  const groups = new Map<number, { x: number; y: number }>();
  for (const r of rocks) {
    const g = groups.get(r.id);
    if (!g) {
      groups.set(r.id, { x: r.x, y: r.y });
    } else {
      g.x = Math.min(g.x, r.x);
      g.y = Math.min(g.y, r.y);
    }
  }
  const seen = new Set<number>();
  for (const [id, pos] of groups) {
    seen.add(id);
    let entry = rockObjs.get(id);
    if (!entry) {
      const variantId = pickRockVariant(id, pos.x, pos.y);
      const tex = cache.combinedRock(variantId);
      const sprite = new Sprite(tex);
      sprite.anchor.set(0, 0);
      sprite.width = 2 * FINE_TILE;
      sprite.height = 2 * FINE_TILE;
      const obj = new Container();
      obj.addChild(sprite);
      obj.x = pos.x * FINE_TILE;
      obj.y = pos.y * FINE_TILE;
      layer.addChild(obj);
      const border = new Graphics();
      obj.addChild(border);
      entry = { obj, rockBorder: border };
      rockObjs.set(id, entry);
    }
    const selected = id === selectedRockId;
    const border = entry.rockBorder;
    if (border) {
      border.clear();
      if (selected) {
        border.x = FINE_TILE;
        border.y = FINE_TILE;
        drawCornerBrackets(border, 2 * FINE_TILE, THEME.inkDim);
      }
    }
  }
  for (const [id, entry] of rockObjs) {
    if (!seen.has(id)) {
      entry.obj.destroy({ children: true });
      rockObjs.delete(id);
    }
  }
}

export function renderCreeps(layer: Container, creeps: CreepState[], selectedCreepId: number | null = null): void {
  const seen = new Set<number>();
  for (const c of creeps) {
    if (!c.alive) continue;
    seen.add(c.id);
    let entry = creepObjs.get(c.id);
    if (!entry) {
      const palette = GEM_PALETTE[c.color];
      const sprite = SPRITE_BY_KIND[c.kind];
      const g = new Graphics();
      const px = c.kind === 'gestation' ? 2 : 3;
      const colors = c.kind === 'gestation' ? GESTATION_COLORS_CALM : {
        light: palette.light,
        mid: palette.mid,
        dark: palette.dark,
        outline: 0x0a0510,
        sparkle: THEME.ink,
        extra: THEME.bad,
        accent: THEME.accent,
      };
      drawPixelGrid(
        g,
        sprite,
        colors,
        px,
        -sprite[0].length * px / 2,
        -sprite.length * px / 2,
      );

      const hpBarY = -(sprite.length * px / 2 + 4);
      const isLarge = c.kind === 'gestation';
      const hpW = isLarge ? 30 : 20;
      const hpH = isLarge ? 4 : 3;
      const hpBg = new Graphics();
      hpBg.rect(-hpW / 2, hpBarY, hpW, hpH).fill(0x000000);
      g.addChild(hpBg);
      const hpBar = new Graphics();
      hpBar.label = "hp";
      g.addChild(hpBar);

      const obj = new Container();
      obj.addChild(g);
      layer.addChild(obj);
      entry = { obj };
      creepObjs.set(c.id, entry);
    }
    entry.obj.x = c.px;
    entry.obj.y = c.py;
    entry.obj.alpha = c.burrowed ? 0.3 : 1;
    // Chrysalid sprite swap on awakening
    if (c.chrysalidAwakened && !entry.chrysalidAwakened) {
      entry.chrysalidAwakened = true;
      const palette = GEM_PALETTE[c.color];
      const g = entry.obj.children[0] as Graphics;
      g.clear();
      const px = 3;
      drawPixelGrid(
        g,
        SPRITE_CHRYSALID_AWAKE,
        {
          light: palette.light,
          mid: palette.mid,
          dark: palette.dark,
          outline: 0x0a0510,
          sparkle: THEME.ink,
          extra: THEME.bad,
          accent: THEME.accent,
        },
        px,
        -SPRITE_CHRYSALID_AWAKE[0].length * px / 2,
        -SPRITE_CHRYSALID_AWAKE.length * px / 2,
      );
      entry.lastHpRatio = undefined;
    }
    // Gestation sprite swap on enrage
    if (c.gestationEnraged && !entry.gestationEnraged) {
      entry.gestationEnraged = true;
      const g = entry.obj.children[0] as Graphics;
      g.clear();
      const px = 2;
      drawPixelGrid(
        g,
        SPRITE_GESTATION_ENRAGED,
        GESTATION_COLORS_ENRAGED,
        px,
        -SPRITE_GESTATION_ENRAGED[0].length * px / 2,
        -SPRITE_GESTATION_ENRAGED.length * px / 2,
      );
      entry.lastHpRatio = undefined;
    }
    // Selection ring
    const isSelected = c.id === selectedCreepId;
    let ring = entry.obj.children.find((ch) => ch.label === "sel") as Graphics | undefined;
    if (isSelected && !ring) {
      ring = new Graphics();
      ring.label = "sel";
      ring.circle(0, 0, 20).stroke({ width: 2, color: THEME.ink, alpha: 0.8 });
      entry.obj.addChildAt(ring, 0);
    } else if (!isSelected && ring) {
      ring.destroy();
    }
    // Update HP bar only when ratio changes
    const ratio = Math.max(0, Math.min(1, c.hp / c.maxHp));
    if (ratio !== entry.lastHpRatio) {
      entry.lastHpRatio = ratio;
      const inner = entry.obj.children.find((ch) => ch.label !== "sel") as Container;
      const hpBar = inner.children.find((ch) => (ch as Graphics).label === "hp") as Graphics | undefined;
      if (hpBar) {
        hpBar.clear();
        const sprite = SPRITE_BY_KIND[c.kind];
        const px = c.kind === 'gestation' ? 2 : 3;
        const hpBarY = -(sprite.length * px / 2 + 4);
        const isLarge = c.kind === 'gestation';
        const hpW = isLarge ? 30 : 20;
        const hpH = isLarge ? 4 : 3;
        hpBar.rect(-hpW / 2, hpBarY, hpW * ratio, hpH).fill(THEME.good);
      }
    }
  }
  for (const [id, entry] of creepObjs) {
    if (!seen.has(id)) {
      entry.obj.destroy({ children: true });
      creepObjs.delete(id);
    }
  }
}

export function renderProjectiles(layer: Container, projectiles: ProjectileState[]): void {
  const seen = new Set<number>();
  for (const p of projectiles) {
    if (!p.alive) continue;
    seen.add(p.id);
    let entry = projectileObjs.get(p.id);
    if (!entry) {
      const obj = new Container();
      const g = new Graphics();
      const palette = GEM_PALETTE[p.color];
      g.circle(0, 0, 4).fill(palette.light);
      g.circle(0, 0, 2).fill(palette.mid);
      obj.addChild(g);
      layer.addChild(obj);
      entry = { obj };
      projectileObjs.set(p.id, entry);
    }
    const x = p.fromX + (p.toX - p.fromX) * p.t;
    const y = p.fromY + (p.toY - p.fromY) * p.t;
    entry.obj.x = x;
    entry.obj.y = y;
  }
  for (const [id, entry] of projectileObjs) {
    if (!seen.has(id)) {
      entry.obj.destroy({ children: true });
      projectileObjs.delete(id);
    }
  }
}

let beamGfx: Graphics | null = null;
export function renderBeams(layer: Container, towers: TowerState[], creeps: CreepState[]): void {
  if (!beamGfx) {
    beamGfx = new Graphics();
    layer.addChild(beamGfx);
  }
  beamGfx.clear();
  for (const t of towers) {
    if (!t.beam) continue;
    const target = creeps.find((c) => c.id === t.beam!.targetId && c.alive);
    if (!target) continue;
    const fromX = (t.x + 1) * FINE_TILE;
    const fromY = (t.y + 1) * FINE_TILE;
    const palette = GEM_PALETTE[t.gem];
    const stacks = t.beam.stacks;
    const core = 2.5 + stacks * 0.14;
    const alpha = 0.55 + Math.min(stacks * 0.018, 0.4);
    beamGfx.moveTo(fromX, fromY).lineTo(target.px, target.py)
      .stroke({ width: core + 4, color: palette.dark, alpha: alpha * 0.25 });
    beamGfx.moveTo(fromX, fromY).lineTo(target.px, target.py)
      .stroke({ width: core + 1.5, color: palette.mid, alpha: alpha * 0.6 });
    beamGfx.moveTo(fromX, fromY).lineTo(target.px, target.py)
      .stroke({ width: core, color: palette.light, alpha });
  }
}

let hoverGfx: Graphics | null = null;
let lastHoverKey = "";
export function renderHover(
  layer: Container,
  state: State,
  hover: { x: number; y: number } | null,
): void {
  if (!hoverGfx) {
    hoverGfx = new Graphics();
    layer.addChild(hoverGfx);
  }
  const key = hover && state.phase === "build"
    ? `${hover.x},${hover.y},${canPlaceFootprint(state, hover.x, hover.y) ? 1 : 0}`
    : "";
  if (key === lastHoverKey) return;
  lastHoverKey = key;
  hoverGfx.clear();
  if (!key) return;

  // Hover anchor is the top-left of a 2×2 placement footprint.
  const cx = hover!.x * FINE_TILE;
  const cy = hover!.y * FINE_TILE;
  const sz = FINE_TILE * 2;
  const buildable = canPlaceFootprint(state, hover!.x, hover!.y);
  const color = buildable ? THEME.accent : THEME.bad;
  hoverGfx.rect(cx, cy, sz, 1).fill(color);
  hoverGfx.rect(cx, cy + sz - 1, sz, 1).fill(color);
  hoverGfx.rect(cx, cy, 1, sz).fill(color);
  hoverGfx.rect(cx + sz - 1, cy, 1, sz).fill(color);
}

function canPlaceFootprint(state: State, ax: number, ay: number): boolean {
  if (ax < 0 || ay < 0 || ax + 1 >= GRID_W || ay + 1 >= GRID_H) return false;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      if (state.grid[ay + dy][ax + dx] !== 0) return false;
    }
  }
  return true;
}

let rangeGfx: Graphics | null = null;
let lastRangeKey = "";
export function renderRangePreview(
  layer: Container,
  state: State,
  hover: { x: number; y: number } | null,
  selectedTowerId: number | null,
): void {
  if (!rangeGfx) {
    rangeGfx = new Graphics();
    layer.addChild(rangeGfx);
  }

  let selPart = "";
  if (selectedTowerId !== null) {
    const t = state.towers.find((tt) => tt.id === selectedTowerId);
    if (t && !t.isTrap) selPart = `${t.id},${t.x},${t.y},${t.upgradeTier ?? 0}`;
  }
  let hoverPart = "";
  if (state.phase === "build" && hover) {
    const draw = activeDraw(state);
    if (draw && canPlaceFootprint(state, hover.x, hover.y)) {
      hoverPart = `${hover.x},${hover.y},${draw.gem},${draw.quality}`;
    }
  }
  const key = `${selPart}|${hoverPart}`;
  if (key === lastRangeKey) return;
  lastRangeKey = key;
  rangeGfx.clear();

  if (selectedTowerId !== null) {
    const t = state.towers.find((tt) => tt.id === selectedTowerId);
    if (t && !t.isTrap) {
      const range = towerRange(t);
      drawDashedCircle(
        rangeGfx,
        (t.x + 1) * FINE_TILE,
        (t.y + 1) * FINE_TILE,
        range * TILE,
        0xd8f0f8,
        0.7,
      );
    }
  }

  if (state.phase === "build" && hover) {
    const draw = activeDraw(state);
    if (draw && canPlaceFootprint(state, hover.x, hover.y)) {
      const stats = gemStats(draw.gem, draw.quality);
      drawDashedCircle(
        rangeGfx,
        (hover.x + 1) * FINE_TILE,
        (hover.y + 1) * FINE_TILE,
        stats.range * TILE,
        THEME.accent,
        0.5,
      );
    }
  }
}

function towerRange(t: TowerState): number {
  if (t.comboKey) {
    const combo = COMBO_BY_NAME.get(t.comboKey);
    if (combo) return comboStatsAtTier(combo, t.upgradeTier ?? 0).range;
  }
  return gemStats(t.gem, t.quality).range;
}

function drawCornerBrackets(g: Graphics, size: number, color: number): void {
  const arm = Math.round(size * 0.3);
  const half = size / 2;
  const w = 2;
  // top-left
  g.rect(-half, -half, arm, w).fill(color);
  g.rect(-half, -half, w, arm).fill(color);
  // top-right
  g.rect(half - arm, -half, arm, w).fill(color);
  g.rect(half - w, -half, w, arm).fill(color);
  // bottom-left
  g.rect(-half, half - w, arm, w).fill(color);
  g.rect(-half, half - arm, w, arm).fill(color);
  // bottom-right
  g.rect(half - arm, half - w, arm, w).fill(color);
  g.rect(half - w, half - arm, w, arm).fill(color);
}

function drawDashedCircle(g: Graphics, cx: number, cy: number, r: number, color: number, alpha = 0.7): void {
  const segs = Math.max(16, Math.floor((2 * Math.PI * r) / 8));
  const dashArc = (Math.PI * 2) / segs;
  const steps = 6;
  for (let i = 0; i < segs; i++) {
    if (i % 2 === 1) continue;
    const a0 = i * dashArc;
    const a1 = a0 + dashArc * 0.6;
    g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    for (let s = 1; s <= steps; s++) {
      const a = a0 + (a1 - a0) * (s / steps);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  g.stroke({ width: 1.5, color, alpha });
}

