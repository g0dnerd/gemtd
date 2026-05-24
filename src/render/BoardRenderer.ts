/**
 * Renders the static board: walls, grass, path, start/end markers.
 * Towers / rocks / creeps / projectiles are drawn on separate layers.
 *
 * Visual direction: Variant B "Cobblestone Keep" — cobblestone path tiling,
 * brick-seamed walls, sparse-decorated grass, carved-waystone checkpoints, a
 * cave-mouth spawn marker, and a crystal-shrine end marker.
 */

import { Container, Graphics, Text } from "pixi.js";
import { CELL, THEME } from "./theme";
import { GRID_H, GRID_W, Cell, START, END, WAYPOINTS, CHECKPOINT_ZONES } from "../data/map";
import { FINE_TILE } from "../game/constants";

export interface BoardLayers {
  root: Container;
  ground: Container;
  pathOverlay: Container;
  checkpoints: Container;
  blueprint: Container;
  cursorGrid: Container;
  ghostCell: Container;
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
  root.label = "board-root";

  const ground = new Container();
  ground.label = "ground";
  const pathOverlay = new Container();
  pathOverlay.label = "pathOverlay";
  const checkpoints = new Container();
  checkpoints.label = "checkpoints";
  const blueprint = new Container();
  blueprint.label = "blueprint";
  const cursorGrid = new Container();
  cursorGrid.label = "cursorGrid";
  const ghostCell = new Container();
  ghostCell.label = "ghostCell";
  const rocks = new Container();
  rocks.label = "rocks";
  const towers = new Container();
  towers.label = "towers";
  const preview = new Container();
  preview.label = "preview";
  const creeps = new Container();
  creeps.label = "creeps";
  const projectiles = new Container();
  projectiles.label = "projectiles";
  const fx = new Container();
  fx.label = "fx";
  const ui = new Container();
  ui.label = "ui";

  root.addChild(
    ground,
    pathOverlay,
    checkpoints,
    blueprint,
    cursorGrid,
    ghostCell,
    rocks,
    towers,
    preview,
    creeps,
    projectiles,
    fx,
    ui,
  );
  return {
    root,
    ground,
    pathOverlay,
    checkpoints,
    blueprint,
    cursorGrid,
    ghostCell,
    rocks,
    towers,
    preview,
    creeps,
    projectiles,
    fx,
    ui,
  };
}

/** Draws a single beveled cell at (cx, cy) in pixels with given colors. */
export function drawCell(
  g: Graphics,
  cx: number,
  cy: number,
  fill: number,
  hi: number,
  lo: number,
  size = FINE_TILE,
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
      const cx = x * FINE_TILE;
      const cy = y * FINE_TILE;
      switch (cell) {
        case Cell.Grass:
          drawGrassCell(g, cx, cy, x, y);
          break;
        case Cell.Path:
          drawCobbleCell(g, cx, cy, x, y);
          break;
        case Cell.Wall:
          drawWallCell(g, cx, cy, x, y);
          break;
        case Cell.Tower:
        case Cell.Rock:
          drawGrassCell(g, cx, cy, x, y);
          break;
      }
    }
  }
  layer.addChild(g);

  drawDarkPortal(layer, START.x * FINE_TILE, START.y * FINE_TILE);
  drawVictoryBeacon(layer, END.x * FINE_TILE, END.y * FINE_TILE);
}

/** Grass tile — verdant meadow with 3 alternating bases + scattered decorations. */
function drawGrassCell(g: Graphics, cx: number, cy: number, x: number, y: number): void {
  const bases = [CELL.grass, CELL.grassAlt1, CELL.grassAlt2];
  g.rect(cx, cy, FINE_TILE, FINE_TILE).fill(bases[((x * 13 + y * 37) % 3 + 3) % 3]);

  const n = ((x * 31 + y * 53 + (x ^ y) * 7) % 41 + 41) % 41;
  if (n < 5) {
    const ox = [3, 8, 5, 10, 2][n], oy = [4, 3, 8, 2, 10][n];
    g.rect(cx + ox, cy + oy, 2, 3).fill(CELL.grassBlade);
    g.rect(cx + ox + 3, cy + oy + 1, 2, 2).fill(CELL.grassBlade);
  }
  if (n === 7 || n === 24) {
    const fx = n === 7 ? 10 : 5, fy = n === 7 ? 10 : 4;
    g.rect(cx + fx, cy + fy, 2, 2).fill(CELL.grassFlowerYellow);
  }
  if (n === 14) {
    g.rect(cx + 12, cy + 6, 2, 2).fill(CELL.grassFlowerWhite);
  }
  if (n === 20 || n === 35) {
    g.rect(cx + 2, cy + (n === 20 ? 11 : 5), 4, 1).fill(CELL.grassStripe);
  }
  if (n === 30) {
    g.rect(cx + 8, cy + 13, 3, 2).fill(CELL.grassPebble);
  }
  if (n === 38) {
    g.rect(cx + 1, cy + 14, 2, 2).fill(CELL.grassTuft);
  }
}

/** Cobblestone tile — one stone per fine cell with mortar gaps. */
function drawCobbleCell(g: Graphics, cx: number, cy: number, x: number, y: number): void {
  const even = ((x + y) & 1) === 0;
  const base = even ? CELL.path : CELL.pathStoneAlt;
  // Body
  g.rect(cx, cy, FINE_TILE, FINE_TILE).fill(base);
  // 2px highlight on top and left
  g.rect(cx, cy, FINE_TILE, 2).fill(CELL.pathHi);
  g.rect(cx, cy, 2, FINE_TILE).fill(CELL.pathHi);
  // 2px shadow on bottom and right
  g.rect(cx, cy + FINE_TILE - 2, FINE_TILE, 2).fill(CELL.pathLo);
  g.rect(cx + FINE_TILE - 2, cy, 2, FINE_TILE).fill(CELL.pathLo);
  // 1px mortar gap on top + left edges (right/bottom mortar comes from
  // adjacent cells' shadow lines).
  g.rect(cx, cy, FINE_TILE, 1).fill(CELL.pathMortar);
  g.rect(cx, cy, 1, FINE_TILE).fill(CELL.pathMortar);
}

/** Stone-wall tile — bevel + brick seams. */
function drawWallCell(g: Graphics, cx: number, cy: number, x: number, y: number): void {
  const even = ((x + y) & 1) === 0;
  const base = even ? THEME.borderDark : CELL.wallBrickAlt;
  g.rect(cx, cy, FINE_TILE, FINE_TILE).fill(base);
  // Inset 1px highlight (top/left) and shadow (bottom/right).
  g.rect(cx, cy, FINE_TILE, 1).fill(THEME.panel2);
  g.rect(cx, cy, 1, FINE_TILE).fill(THEME.panel2);
  g.rect(cx, cy + FINE_TILE - 1, FINE_TILE, 1).fill(0x000000);
  g.rect(cx + FINE_TILE - 1, cy, 1, FINE_TILE).fill(0x000000);
  // Brick seams: a horizontal mortar line every other row, with the
  // vertical mortar shifted on alternate rows so the bricks read as offset.
  if (y % 2 === 0) {
    g.rect(cx, cy + 6, FINE_TILE, 1).fill(CELL.wallSeam);
    g.rect(cx + 8, cy, 1, FINE_TILE).fill(CELL.wallSeam);
  } else {
    g.rect(cx, cy + 12, FINE_TILE, 1).fill(CELL.wallSeam);
    // Offset vertical seam by 2 cells so bricks alternate.
    if ((x + 1) % 2 === 0) {
      g.rect(cx + 8, cy, 1, FINE_TILE).fill(CELL.wallSeam);
    }
  }
}

function drawDarkPortal(layer: Container, ox: number, oy: number): void {
  const g = new Graphics();
  g.rect(ox + 2, oy + 2, 36, 36).fill(0x3a2818);
  g.rect(ox + 4, oy + 4, 32, 32).fill(0x5a4030);
  g.rect(ox + 10, oy + 6, 20, 28).fill(0x0a0510);
  g.rect(ox + 8, oy + 8, 24, 24).fill(0x0a0510);
  g.rect(ox + 6, oy + 10, 28, 20).fill(0x0a0510);
  g.rect(ox + 12, oy + 10, 4, 2).fill(0x4a1838);
  g.rect(ox + 24, oy + 28, 4, 2).fill(0x4a1838);
  g.rect(ox + 10, oy + 20, 2, 4).fill(0x4a1838);
  g.rect(ox + 28, oy + 16, 2, 4).fill(0x4a1838);
  g.rect(ox + 14, oy + 12, 2, 2).fill(0xd04848);
  g.rect(ox + 22, oy + 26, 2, 2).fill(0xd04848);
  g.rect(ox + 10, oy + 18, 2, 2).fill(0xd04848);
  g.rect(ox + 26, oy + 20, 2, 2).fill(0xd04848);
  g.rect(ox + 16, oy + 14, 2, 2).fill(0xf06868);
  g.rect(ox + 24, oy + 24, 2, 2).fill(0xf06868);
  g.rect(ox + 16, oy + 16, 8, 8).fill(0x1a0818);
  g.rect(ox + 18, oy + 18, 4, 4).fill(0xd04848);
  g.rect(ox + 19, oy + 19, 2, 2).fill(0xf06868);
  g.rect(ox + 4, oy + 4, 2, 4).fill(0x802020);
  g.rect(ox + 34, oy + 4, 2, 4).fill(0x802020);
  g.rect(ox + 4, oy + 32, 2, 4).fill(0x802020);
  g.rect(ox + 34, oy + 32, 2, 4).fill(0x802020);
  layer.addChild(g);
}

function drawVictoryBeacon(layer: Container, ox: number, oy: number): void {
  const g = new Graphics();
  const cx = ox + 20, cy = oy + 16;
  for (let i = 3; i >= 0; i--) {
    g.circle(cx, cy, 8 + i * 5).fill({ color: 0xf0c038, alpha: 0.06 + i * 0.02 });
  }
  g.rect(ox + 6, oy + 30, 28, 8).fill(0x5a4a6a);
  g.rect(ox + 6, oy + 30, 28, 2).fill(0x7c66a4);
  g.rect(ox + 4, oy + 36, 32, 4).fill(0x1a1428);
  g.rect(ox + 17, oy + 4, 6, 26).fill(0xf0c038);
  g.rect(ox + 17, oy + 4, 2, 26).fill(0xffe068);
  g.rect(ox + 21, oy + 4, 2, 26).fill(0x886820);
  g.rect(ox + 18, oy + 2, 4, 2).fill(0xffe068);
  g.rect(ox + 19, oy + 0, 2, 2).fill(0xffffff);
  g.rect(ox + 14, oy + 10, 2, 2).fill(0xffe068);
  g.rect(ox + 25, oy + 14, 2, 2).fill(0xffe068);
  g.rect(ox + 12, oy + 20, 2, 2).fill(0xffe068);
  g.rect(ox + 27, oy + 8, 2, 2).fill(0xffe068);
  g.rect(ox + 10, oy + 6, 1, 1).fill(0xf0c038);
  g.rect(ox + 28, oy + 18, 1, 1).fill(0xf0c038);
  g.rect(ox + 13, oy + 14, 1, 1).fill(0xf0c038);
  g.rect(ox + 26, oy + 24, 1, 1).fill(0xf0c038);
  layer.addChild(g);
}

function makeMonoLabel(s: string, size: number, color: number): Text {
  return new Text({
    text: s,
    style: {
      fontFamily: "Press Start 2P",
      fontSize: size,
      fill: color,
    },
  });
}

/**
 * Render checkpoint markers as carved waystones — flush stone tablets with
 * engraved numbers that sit entirely within the cell, avoiding occlusion
 * by towers or rocks placed above.
 */
export function renderCheckpoints(layer: Container): void {
  layer.removeChildren();
  const wps = WAYPOINTS.slice(1, WAYPOINTS.length - 1);
  wps.forEach((wp, idx) => {
    const cpIdx = idx + 1;
    const ox = wp.x * FINE_TILE;
    const oy = wp.y * FINE_TILE;
    const g = new Graphics();

    // Draw blocked-zone overlay on surrounding cells.
    const zone = CHECKPOINT_ZONES.get(cpIdx);
    if (zone) {
      for (const cell of zone) {
        if (cell.x === wp.x && cell.y === wp.y) continue;
        const zx = cell.x * FINE_TILE;
        const zy = cell.y * FINE_TILE;
        g.rect(zx, zy, FINE_TILE, FINE_TILE).fill({ color: 0xd04848, alpha: 0.18 });
        g.rect(zx, zy, FINE_TILE, 1).fill({ color: 0xd04848, alpha: 0.25 });
        g.rect(zx, zy, 1, FINE_TILE).fill({ color: 0xd04848, alpha: 0.25 });
        g.rect(zx, zy + FINE_TILE - 1, FINE_TILE, 1).fill({ color: 0x802020, alpha: 0.3 });
        g.rect(zx + FINE_TILE - 1, zy, 1, FINE_TILE).fill({ color: 0x802020, alpha: 0.3 });
      }
    }

    // Stone body with bevelled edges.
    g.rect(ox + 3, oy + 3, 12, 12).fill(0x7a6a5a);
    g.rect(ox + 3, oy + 3, 12, 2).fill(0xa8988a);
    g.rect(ox + 3, oy + 3, 2, 12).fill(0xa8988a);
    g.rect(ox + 3, oy + 13, 12, 2).fill(0x3a2a20);
    g.rect(ox + 13, oy + 3, 2, 12).fill(0x3a2a20);

    // Dark inset recess for the numeral.
    g.rect(ox + 5, oy + 5, 8, 8).fill(0x1a1428);

    layer.addChild(g);

    // Engraved numeral (accent color, no shadow needed on dark inset).
    const num = makeMonoLabel(String(cpIdx), 7, 0xf0a040);
    num.x = ox + 9 - Math.round(num.width / 2);
    num.y = oy + 5;
    layer.addChild(num);
  });
}

/**
 * V5 path overlay: quiet corridor wash + directional chevron breadcrumbs.
 * During wave phase, alphas are halved so the overlay doesn't compete with creeps.
 */
export function renderPathTrace(
  layer: Container,
  segments: Array<Array<{ x: number; y: number }>>,
  phase?: string,
): void {
  layer.removeChildren();

  const isWave = phase === "wave";
  const washAlpha = isWave ? 0.14 : 0.28;
  const chevronAlpha = isWave ? 0.42 : 0.85;

  // Build flat list of pixel-center waypoints from all segments.
  const pts: { x: number; y: number }[] = [];
  for (const seg of segments) {
    for (let i = 0; i < seg.length; i++) {
      const px = seg[i].x * FINE_TILE + FINE_TILE / 2;
      const py = seg[i].y * FINE_TILE + FINE_TILE / 2;
      if (pts.length > 0 && pts[pts.length - 1].x === px && pts[pts.length - 1].y === py) continue;
      pts.push({ x: px, y: py });
    }
  }
  if (pts.length < 2) return;

  // Layer A: corridor wash
  const wash = new Graphics();
  wash.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) wash.lineTo(pts[i].x, pts[i].y);
  wash.stroke({ width: FINE_TILE, color: THEME.info, alpha: washAlpha, cap: "butt", join: "miter" });
  layer.addChild(wash);

  // Precompute cumulative arc-length + segment info for chevron placement.
  const cumLen: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cumLen.push(cumLen[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const totalLen = cumLen[cumLen.length - 1];

  // Layer B: directional chevrons every 30 px along the route.
  const SPACING = 30;
  const SKIP_EDGE = 12;
  const chevG = new Graphics();
  let segIdx = 0;

  for (let d = SPACING; d < totalLen; d += SPACING) {
    if (d < SKIP_EDGE || d > totalLen - SKIP_EDGE) continue;

    while (segIdx < pts.length - 2 && cumLen[segIdx + 1] < d) segIdx++;
    const segStart = cumLen[segIdx];
    const segEnd = cumLen[segIdx + 1];
    const frac = (d - segStart) / (segEnd - segStart);
    const cx = pts[segIdx].x + (pts[segIdx + 1].x - pts[segIdx].x) * frac;
    const cy = pts[segIdx].y + (pts[segIdx + 1].y - pts[segIdx].y) * frac;
    const angle = Math.atan2(pts[segIdx + 1].y - pts[segIdx].y, pts[segIdx + 1].x - pts[segIdx].x);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Chevron local coords: (0,0), (7,4), (0,8) centered at tip → subtract (0,4)
    const triLocal = [
      { x: 0, y: -4 },
      { x: 7, y: 0 },
      { x: 0, y: 4 },
    ];

    // Drop-shadow: same polygon offset +1,+1
    const shadowPts: number[] = [];
    const litPts: number[] = [];
    for (const p of triLocal) {
      shadowPts.push(cx + p.x * cos - p.y * sin + 1, cy + p.x * sin + p.y * cos + 1);
      litPts.push(cx + p.x * cos - p.y * sin, cy + p.x * sin + p.y * cos);
    }
    chevG.poly(shadowPts).fill({ color: THEME.borderDark, alpha: 1 });
    chevG.poly(litPts).fill({ color: THEME.info, alpha: chevronAlpha });
  }
  layer.addChild(chevG);
}
