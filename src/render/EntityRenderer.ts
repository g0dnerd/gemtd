/**
 * Per-frame rendering of dynamic entities (towers, rocks, creeps, projectiles)
 * and the hover/range previews.
 *
 * We render each entity as a long-lived display object keyed by id. On each
 * frame we sync the display objects' positions to state and prune any whose
 * source entity has been removed.
 */

import { Container, Graphics } from "pixi.js";
import type { CreepState, ProjectileState, RockState, State, TowerState } from "../game/State";
import { activeDraw } from "../game/State";
import { FINE_TILE, SIM_HZ, TILE } from "../game/constants";
import { GEM_PALETTE, THEME } from "./theme";
import { TowerSpriteCache, makeTowerSprite, makeRockSprite } from "./TowerRenderer";
import { gemStats } from "../data/gems";
import { COMBOS, comboStatsAtTier } from "../data/combos";
import { SPRITE_BY_KIND } from "./sprites";
import { drawPixelGrid } from "./pixelTexture";
import { GRID_W, GRID_H } from "../data/map";
import { SPECIAL_FX, pickRock } from "./spriteData";

interface PerEntity {
  obj: Container;
}

interface TowerEntry {
  obj: Container;
  /** Cached comboKey so we can rebuild the sprite if a tower is upgraded. */
  comboKey: string | undefined;
  quality: number;
  upgradeTier: number;
  /** FX layer (halo/aura/orbit/ground), only set for special towers. */
  fx?: TowerFx;
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
const rockObjs = new Map<string, PerEntity>();
const creepObjs = new Map<number, PerEntity>();
const projectileObjs = new Map<number, PerEntity>();

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
      if (t.comboKey && SPECIAL_FX[t.comboKey]) {
        fx = makeSpecialFx(obj, t.comboKey);
      }
      const towerSprite = makeTowerSprite(t.gem, t.quality, cache, t.comboKey, tier);
      obj.addChild(towerSprite);
      layer.addChild(obj);
      entry = { obj, comboKey: t.comboKey, quality: t.quality, upgradeTier: tier, fx };
      towerObjs.set(t.id, entry);
    }
    // Tower anchor (t.x, t.y) is the top-left fine cell of its 2×2 footprint,
    // so the visual centre sits on the corner shared by the 4 cells.
    entry.obj.x = (t.x + 1) * FINE_TILE;
    entry.obj.y = (t.y + 1) * FINE_TILE;
    if (entry.fx) animateTowerFx(entry.fx, tick);
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

export function renderRocks(layer: Container, rocks: RockState[], cache: TowerSpriteCache): void {
  const seen = new Set<string>();
  for (const r of rocks) {
    const key = `${r.x},${r.y}`;
    seen.add(key);
    let entry = rockObjs.get(key);
    if (!entry) {
      const kind = pickRock(r.x, r.y);
      const obj = new Container();
      const sprite = makeRockSprite(cache, kind);
      sprite.width = FINE_TILE;
      sprite.height = FINE_TILE;
      obj.addChild(sprite);
      // Crystal rocks get a soft inner glow on top.
      if (kind === "crystal") {
        const glow = new Graphics();
        const cx = (8 / 16) * FINE_TILE;
        const cy = (5 / 16) * FINE_TILE;
        const gr = (3 / 16) * FINE_TILE;
        for (let i = 4; i > 0; i--) {
          glow.circle(cx, cy, gr * (i / 4)).fill({ color: 0xa8e8f0, alpha: 0.12 });
        }
        glow.blendMode = "screen";
        obj.addChild(glow);
      }
      obj.x = r.x * FINE_TILE;
      obj.y = r.y * FINE_TILE;
      layer.addChild(obj);
      entry = { obj };
      rockObjs.set(key, entry);
    }
  }
  for (const [key, entry] of rockObjs) {
    if (!seen.has(key)) {
      entry.obj.destroy({ children: true });
      rockObjs.delete(key);
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
    // Update HP bar
    const inner = entry.obj.children[0] as Container;
    const hpBar = inner.children.find((ch) => (ch as Graphics).label === "hp") as Graphics | undefined;
    if (hpBar) {
      hpBar.clear();
      const ratio = Math.max(0, Math.min(1, c.hp / c.maxHp));
      hpBar.rect(-10, -22, 20 * ratio, 3).fill(THEME.good);
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

let hoverGfx: Graphics | null = null;
export function renderHover(
  layer: Container,
  state: State,
  hover: { x: number; y: number } | null,
): void {
  if (!hoverGfx) {
    hoverGfx = new Graphics();
    layer.addChild(hoverGfx);
  }
  hoverGfx.clear();
  if (!hover) return;
  if (state.phase !== "build") return;
  if (hover.x < 0 || hover.y < 0 || hover.x >= GRID_W || hover.y >= GRID_H) return;

  // Hover anchor is the top-left of a 2×2 placement footprint.
  const cx = hover.x * FINE_TILE;
  const cy = hover.y * FINE_TILE;
  const sz = FINE_TILE * 2;
  const buildable = canPlaceFootprint(state, hover.x, hover.y);
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
  rangeGfx.clear();

  // Selected tower range
  if (selectedTowerId !== null) {
    const t = state.towers.find((tt) => tt.id === selectedTowerId);
    if (t) {
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

  // Build preview range — show on hover when there's an active draw and the
  // 2×2 footprint anchored at the cursor would be a legal placement.
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
    const combo = COMBOS.find((c) => c.key === t.comboKey);
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

