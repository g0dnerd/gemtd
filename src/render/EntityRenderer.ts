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
import { FINE_TILE, SIM_HZ, TILE } from "../game/constants";
import { GEM_PALETTE, RUNE, THEME } from "./theme";
import { TowerSpriteCache, makeTowerSprite } from "./TowerRenderer";
import { OPAL_FRAME_COUNT } from "./spriteData";
import { gemStats } from "../data/gems";
import { COMBO_BY_NAME, comboStatsAtTier } from "../data/combos";
import { SPRITE_BY_KIND } from "./sprites";
import { drawPixelGrid } from "./pixelTexture";
import { GRID_W, GRID_H } from "../data/map";
import { SPECIAL_FX } from "./spriteData";
import { pickRockVariant } from "./RockSprites";
import { APEX_STARGEM } from "./theme";
import { generateRuneTexture, runeEffectFromComboKey } from "./RuneSprites";

interface PerEntity {
  obj: Container;
  lastHpRatio?: number;
  rockBorder?: Graphics;
}

interface StargemFx {
  ground: Graphics;
  outerHalo: Graphics;
  innerHalo: Graphics;
  rayBurst: Container;
  crownSparks: Graphics[];
  orbitals: Container[];
  pinpricks: Graphics[];
  shootingStars: Graphics[];
  spriteWrap: Container;
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
  /** Last rendered opal frame index. */
  opalFrame?: number;
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

const towerObjs = new Map<number, TowerEntry>();
const rockObjs = new Map<number, PerEntity>();
const creepObjs = new Map<number, PerEntity>();
const projectileObjs = new Map<number, PerEntity>();

const runeTextureCache = new Map<string, Texture>();

export function renderTowers(layer: Container, towers: TowerState[], cache: TowerSpriteCache, tick: number): void {
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
        obj.addChild(towerSprite);
        if (t.gem === "opal" && !t.comboKey) {
          opalFrames = cache.opalFrameTextures(t.quality);
        }
      }
      layer.addChild(obj);
      entry = { obj, comboKey: t.comboKey, gem: t.gem, quality: t.quality, upgradeTier: tier, fx, stargemFx: sgfx, opalFrames };
      towerObjs.set(t.id, entry);
    }
    // Tower anchor (t.x, t.y) is the top-left fine cell of its 2×2 footprint,
    // so the visual centre sits on the corner shared by the 4 cells.
    entry.obj.x = (t.x + 1) * FINE_TILE;
    entry.obj.y = (t.y + 1) * FINE_TILE;
    if (entry.stargemFx) animateStargemFx(entry.stargemFx, tick);
    else if (entry.fx) animateTowerFx(entry.fx, tick);
    if (entry.opalFrames) {
      const frame = Math.floor(tick / 27) % OPAL_FRAME_COUNT;
      if (frame !== entry.opalFrame) {
        entry.opalFrame = frame;
        const towerContainer = entry.obj.children[entry.obj.children.length - 1] as Container;
        const sprite = towerContainer.children[0] as Sprite;
        sprite.texture = entry.opalFrames[frame];
      }
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
  for (let i = 0; i < segs; i++) {
    if (i % 2 === 1) continue;
    const a0 = i * dashArc;
    const a1 = a0 + dashArc * 0.6;
    g.arc(0, 0, radius, a0, a1).stroke({
      width: 1.5,
      color,
      alpha: 0.6,
      pixelLine: true,
    });
  }
}

function animateTowerFx(fx: TowerFx, tick: number): void {
  const t = tick / SIM_HZ;
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

  // 9. Shooting stars (2 diagonal streaks)
  const shootingStars: Graphics[] = [];
  for (let i = 0; i < 2; i++) {
    const ss = new Graphics();
    ss.rect(0, 0, 16, 1.5).fill({ color: 0xffffff, alpha: 0.85 });
    ss.rect(0, 0, 10, 1.5).fill({ color: APEX_STARGEM.accent, alpha: 0.6 });
    ss.rotation = (20 * Math.PI) / 180;
    ss.alpha = 0;
    parent.addChild(ss);
    shootingStars.push(ss);
  }

  return { ground, outerHalo, innerHalo, rayBurst, crownSparks, orbitals, pinpricks, shootingStars, spriteWrap };
}

const ORBITAL_PERIODS = [1.6, 2.4, 3.4, 5.0];
const ORBITAL_DELAYS = [0, -0.4, -1.2, -2.0];
const PIN_DELAYS = [0, 0.6, 1.2, 1.8];

function animateStargemFx(fx: StargemFx, tick: number): void {
  const t = tick / SIM_HZ;

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

  // Shooting stars (2): 3.4s cycle, offset 1.7s
  const half = TILE / 2;
  for (let i = 0; i < 2; i++) {
    const st = ((t - i * 1.7) % 3.4 + 3.4) % 3.4;
    const p = st / 3.4;
    if (p < 0.1) {
      fx.shootingStars[i].alpha = p / 0.1;
      fx.shootingStars[i].x = -half + (p / 0.4) * half * 3.2;
      fx.shootingStars[i].y = -half + (p / 0.4) * half * 1.6;
    } else if (p < 0.4) {
      fx.shootingStars[i].alpha = 1;
      fx.shootingStars[i].x = -half + (p / 0.4) * half * 3.2;
      fx.shootingStars[i].y = -half + (p / 0.4) * half * 1.6;
    } else if (p < 0.45) {
      fx.shootingStars[i].alpha = 1 - (p - 0.4) / 0.05;
    } else {
      fx.shootingStars[i].alpha = 0;
    }
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
        border.rect(0, 0, 2 * FINE_TILE, 2 * FINE_TILE)
          .stroke({ color: 0xd8f0f8, width: 2, alignment: 0.5 });
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

export function renderCreeps(layer: Container, creeps: CreepState[]): void {
  const seen = new Set<number>();
  for (const c of creeps) {
    if (!c.alive) continue;
    seen.add(c.id);
    let entry = creepObjs.get(c.id);
    if (!entry) {
      const palette = GEM_PALETTE[c.color];
      const sprite = SPRITE_BY_KIND[c.kind];
      const g = new Graphics();
      const px = 3;
      const colors = {
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

      // HP bar — bumped up to clear the taller 12×12 sprite (36px tall).
      const hpBg = new Graphics();
      hpBg.rect(-10, -22, 20, 3).fill(0x000000);
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
    // Update HP bar only when ratio changes
    const ratio = Math.max(0, Math.min(1, c.hp / c.maxHp));
    if (ratio !== entry.lastHpRatio) {
      entry.lastHpRatio = ratio;
      const inner = entry.obj.children[0] as Container;
      const hpBar = inner.children.find((ch) => (ch as Graphics).label === "hp") as Graphics | undefined;
      if (hpBar) {
        hpBar.clear();
        hpBar.rect(-10, -22, 20 * ratio, 3).fill(THEME.good);
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

function drawDashedCircle(g: Graphics, cx: number, cy: number, r: number, color: number, alpha = 0.7): void {
  // Approximate a dashed circle by drawing N dashes of fixed arc length.
  const segs = Math.max(16, Math.floor((2 * Math.PI * r) / 8));
  const dashArc = (Math.PI * 2) / segs;
  for (let i = 0; i < segs; i++) {
    if (i % 2 === 1) continue;
    const a0 = i * dashArc;
    const a1 = a0 + dashArc * 0.6;
    g.arc(cx, cy, r, a0, a1).stroke({ width: 1.5, color, alpha, pixelLine: true });
  }
}

