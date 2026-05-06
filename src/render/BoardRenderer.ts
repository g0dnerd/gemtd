/**
 * Renders the static board: walls, grass, path, start/end markers.
 * Towers / rocks / creeps / projectiles are drawn on separate layers.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { CELL, THEME } from './theme';
import { GRID_H, GRID_W, Cell, START, END, WAYPOINTS } from '../data/map';
import { TILE } from '../game/constants';

export interface BoardLayers {
  root: Container;
  ground: Container;
  pathOverlay: Container;
  checkpoints: Container;
  rocks: Container;
  towers: Container;
  preview: Container;
  creeps: Container;
  projectiles: Container;
  fx: Container;
  ui: Container;
}

export function makeBoardLayers(): BoardLayers {
  const root = new Container();
  root.label = 'board-root';

  const ground = new Container();
  ground.label = 'ground';
  const pathOverlay = new Container();
  pathOverlay.label = 'pathOverlay';
  const checkpoints = new Container();
  checkpoints.label = 'checkpoints';
  const rocks = new Container();
  rocks.label = 'rocks';
  const towers = new Container();
  towers.label = 'towers';
  const preview = new Container();
  preview.label = 'preview';
  const creeps = new Container();
  creeps.label = 'creeps';
  const projectiles = new Container();
  projectiles.label = 'projectiles';
  const fx = new Container();
  fx.label = 'fx';
  const ui = new Container();
  ui.label = 'ui';

  root.addChild(ground, pathOverlay, checkpoints, rocks, towers, preview, creeps, projectiles, fx, ui);
  return { root, ground, pathOverlay, checkpoints, rocks, towers, preview, creeps, projectiles, fx, ui };
}

/** Draws a single beveled cell at (cx, cy) in pixels with given colors. */
export function drawCell(
  g: Graphics,
  cx: number,
  cy: number,
  fill: number,
  hi: number,
  lo: number,
  size = TILE,
): void {
  // Body
  g.rect(cx, cy, size, size).fill(fill);
  // Top/left highlight (1px)
  g.rect(cx, cy, size, 1).fill(hi);
  g.rect(cx, cy, 1, size).fill(hi);
  // Bottom/right shadow
  g.rect(cx, cy + size - 1, size, 1).fill(lo);
  g.rect(cx + size - 1, cy, 1, size).fill(lo);
}

/** Render the static ground layer once for the given grid state. */
export function renderGround(layer: Container, grid: Cell[][]): void {
  layer.removeChildren();
  const g = new Graphics();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const cell = grid[y][x];
      const cx = x * TILE;
      const cy = y * TILE;
      switch (cell) {
        case Cell.Grass:
          drawCell(g, cx, cy, CELL.grass, CELL.grassHi, CELL.grassLo);
          break;
        case Cell.Path:
          drawCell(g, cx, cy, CELL.path, CELL.pathHi, CELL.pathLo);
          break;
        case Cell.Wall:
          drawCell(g, cx, cy, THEME.borderDark, THEME.panel2, 0x000000);
          break;
        case Cell.Tower:
        case Cell.Rock:
          drawCell(g, cx, cy, CELL.grass, CELL.grassHi, CELL.grassLo);
          break;
      }
    }
  }
  layer.addChild(g);

  // Start / End markers on top of ground.
  const sx = START.x * TILE;
  const sy = START.y * TILE;
  drawCell(g, sx + 2, sy + 2, CELL.start, CELL.startHi, CELL.startLo, TILE - 4);
  const sLabel = makeMonoLabel('S', 9, 0xffffff);
  sLabel.x = sx + Math.round(TILE / 2 - sLabel.width / 2);
  sLabel.y = sy + Math.round(TILE / 2 - sLabel.height / 2);
  layer.addChild(sLabel);

  const ex = END.x * TILE;
  const ey = END.y * TILE;
  drawCell(g, ex + 2, ey + 2, CELL.end, CELL.endHi, CELL.endLo, TILE - 4);
  const eLabel = makeMonoLabel('E', 9, 0x0a0510);
  eLabel.x = ex + Math.round(TILE / 2 - eLabel.width / 2);
  eLabel.y = ey + Math.round(TILE / 2 - eLabel.height / 2);
  layer.addChild(eLabel);
}

function makeMonoLabel(s: string, size: number, color: number): Text {
  return new Text({
    text: s,
    style: {
      fontFamily: 'Press Start 2P',
      fontSize: size,
      fill: color,
    },
  });
}

/**
 * Render checkpoint markers on the mid-board waypoints (everything between
 * Start and End). Creeps are routed through these tiles, so the player needs
 * to see them to plan a maze. Drawn as a diamond ring with a numeric label.
 */
export function renderCheckpoints(layer: Container): void {
  layer.removeChildren();
  const wps = WAYPOINTS.slice(1, WAYPOINTS.length - 1);
  wps.forEach((wp, idx) => {
    const cx = wp.x * TILE + TILE / 2;
    const cy = wp.y * TILE + TILE / 2;
    const g = new Graphics();
    const half = TILE / 2 - 2;
    // Outer dark diamond (silhouette)
    g.moveTo(cx, cy - half - 1)
      .lineTo(cx + half + 1, cy)
      .lineTo(cx, cy + half + 1)
      .lineTo(cx - half - 1, cy)
      .closePath()
      .fill({ color: 0x000000, alpha: 0.55 });
    // Inner accent diamond
    g.moveTo(cx, cy - half)
      .lineTo(cx + half, cy)
      .lineTo(cx, cy + half)
      .lineTo(cx - half, cy)
      .closePath()
      .stroke({ color: THEME.accent, width: 2, alpha: 0.95, pixelLine: true });
    // Center dot
    g.rect(cx - 2, cy - 2, 4, 4).fill({ color: THEME.accent, alpha: 0.9 });
    layer.addChild(g);

    const label = makeMonoLabel(String(idx + 1), 7, THEME.accent);
    label.x = Math.round(cx - label.width / 2);
    label.y = Math.round(cy - label.height / 2 + half - 4);
    layer.addChild(label);
  });
}

/**
 * Re-render the path overlay: faint dotted line through current creep route.
 * Also used to show the "active" path for visual confirmation.
 */
export function renderPathTrace(
  layer: Container,
  segments: Array<Array<{ x: number; y: number }>>,
): void {
  layer.removeChildren();
  const g = new Graphics();
  for (const seg of segments) {
    for (let i = 0; i < seg.length - 1; i++) {
      const a = seg[i];
      const b = seg[i + 1];
      const ax = a.x * TILE + TILE / 2;
      const ay = a.y * TILE + TILE / 2;
      const bx = b.x * TILE + TILE / 2;
      const by = b.y * TILE + TILE / 2;
      g.moveTo(ax, ay).lineTo(bx, by);
    }
  }
  g.stroke({ width: 1, color: THEME.accent, alpha: 0.4, pixelLine: true });
  layer.addChild(g);
}
