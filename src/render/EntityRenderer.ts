/**
 * Per-frame rendering of dynamic entities (towers, rocks, creeps, projectiles)
 * and the hover/range previews.
 *
 * We render each entity as a long-lived display object keyed by id. On each
 * frame we sync the display objects' positions to state and prune any whose
 * source entity has been removed.
 */

import { Container, Graphics } from 'pixi.js';
import type { CreepState, ProjectileState, RockState, State, TowerState } from '../game/State';
import { activeDraw } from '../game/State';
import { FINE_TILE, TILE } from '../game/constants';
import { CELL, GEM_PALETTE, THEME } from './theme';
import { TowerSpriteCache, makeTowerSprite } from './TowerRenderer';
import { gemStats } from '../data/gems';
import { COMBOS } from '../data/combos';
import { CREEP_SPRITE } from './sprites';
import { drawPixelGrid } from './pixelTexture';
import { GRID_W, GRID_H } from '../data/map';

interface PerEntity {
  obj: Container;
}

const towerObjs = new Map<number, PerEntity>();
const rockObjs = new Map<string, PerEntity>();
const creepObjs = new Map<number, PerEntity>();
const projectileObjs = new Map<number, PerEntity>();

export function renderTowers(layer: Container, towers: TowerState[], cache: TowerSpriteCache): void {
  const seen = new Set<number>();
  for (const t of towers) {
    seen.add(t.id);
    let entry = towerObjs.get(t.id);
    if (!entry) {
      const obj = makeTowerSprite(t.gem, t.quality, cache);
      layer.addChild(obj);
      entry = { obj };
      towerObjs.set(t.id, entry);
    }
    // Tower anchor (t.x, t.y) is the top-left fine cell of its 2×2 footprint,
    // so the visual centre sits on the corner shared by the 4 cells.
    entry.obj.x = (t.x + 1) * FINE_TILE;
    entry.obj.y = (t.y + 1) * FINE_TILE;
  }
  for (const [id, entry] of towerObjs) {
    if (!seen.has(id)) {
      entry.obj.destroy({ children: true });
      towerObjs.delete(id);
    }
  }
}

export function renderRocks(layer: Container, rocks: RockState[]): void {
  const seen = new Set<string>();
  for (const r of rocks) {
    const key = `${r.x},${r.y}`;
    seen.add(key);
    let entry = rockObjs.get(key);
    if (!entry) {
      // Generate a rock sprite each time (cheap, infrequent).
      const obj = new Container();
      const g = new Graphics();
      // Solid stone tile with bevels.
      const sz = FINE_TILE - 2;
      const ox = -sz / 2;
      const oy = -sz / 2;
      g.rect(ox, oy, sz, sz).fill(CELL.rockHi);
      g.rect(ox + 2, oy + 2, sz - 4, sz - 4).fill(CELL.rock);
      g.rect(ox, oy + sz - 1, sz, 1).fill(CELL.rockLo);
      g.rect(ox + sz - 1, oy, 1, sz).fill(CELL.rockLo);
      // outline
      g.rect(ox - 1, oy - 1, sz + 2, 1).fill(0x000000);
      g.rect(ox - 1, oy + sz, sz + 2, 1).fill(0x000000);
      g.rect(ox - 1, oy - 1, 1, sz + 2).fill(0x000000);
      g.rect(ox + sz, oy - 1, 1, sz + 2).fill(0x000000);
      obj.addChild(g);
      obj.x = r.x * FINE_TILE + FINE_TILE / 2;
      obj.y = r.y * FINE_TILE + FINE_TILE / 2;
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
      const g = new Graphics();
      const px = 3;
      const colors = {
        light: palette.light,
        mid: palette.mid,
        dark: palette.dark,
        outline: 0x0a0510,
      };
      drawPixelGrid(g, CREEP_SPRITE, colors, px, -CREEP_SPRITE[0].length * px / 2, -CREEP_SPRITE.length * px / 2);

      // HP bar
      const hpBg = new Graphics();
      hpBg.rect(-10, -16, 20, 3).fill(0x000000);
      g.addChild(hpBg);
      const hpBar = new Graphics();
      hpBar.label = 'hp';
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
    const hpBar = inner.children.find((ch) => (ch as Graphics).label === 'hp') as Graphics | undefined;
    if (hpBar) {
      hpBar.clear();
      const ratio = Math.max(0, Math.min(1, c.hp / c.maxHp));
      hpBar.rect(-10, -16, 20 * ratio, 3).fill(THEME.good);
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
  if (state.phase !== 'build') return;
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
  if (state.phase === 'build' && hover) {
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
    if (combo) return combo.stats.range;
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
