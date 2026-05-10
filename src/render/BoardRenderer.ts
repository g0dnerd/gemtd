/**
 * Renders the static board: walls, grass, path, start/end markers.
 * Towers / rocks / creeps / projectiles are drawn on separate layers.
 *
 * Visual direction: Variant B "Cobblestone Keep" — cobblestone path tiling,
 * brick-seamed walls, sparse-decorated grass, banner-flag checkpoints, a
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

  // Start (cave mouth) and End (crystal shrine) markers, drawn on top of the
  // path corridor at the 2×2 anchor cells.
  drawCaveSpawn(layer, START.x * FINE_TILE, START.y * FINE_TILE);
  drawCrystalShrine(layer, END.x * FINE_TILE, END.y * FINE_TILE);
}

/** Grass tile — flat fill with sparse decoration noise (no bevel grid). */
function drawGrassCell(g: Graphics, cx: number, cy: number, x: number, y: number): void {
  g.rect(cx, cy, FINE_TILE, FINE_TILE).fill(CELL.grass);
  const n = (x * 23 + y * 41) % 29;
  if (n === 0) {
    g.rect(cx + 5, cy + 5, 2, 2).fill(CELL.grassTuft);
    g.rect(cx + 7, cy + 6, 2, 2).fill(CELL.grassTuft);
    g.rect(cx + 6, cy + 8, 2, 2).fill(CELL.grassTuft);
  } else if (n === 11) {
    g.rect(cx + 10, cy + 10, 2, 2).fill(CELL.grassClover);
  } else if (n === 20) {
    g.rect(cx + 3, cy + 11, 3, 1).fill(CELL.grassHi);
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

/**
 * Cave-mouth spawn marker.
 * Origin (ox, oy) is the top-left pixel of the 2×2 spawn region.
 * Coordinates are taken verbatim from the design handoff.
 */
function drawCaveSpawn(layer: Container, ox: number, oy: number): void {
  const g = new Graphics();
  // Rocky frame
  g.rect(ox + 0, oy + 4, 40, 36).fill(0x3a2818);
  // Inner rock
  g.rect(ox + 2, oy + 6, 36, 32).fill(0x5a4030);
  // Cave void
  g.rect(ox + 4, oy + 8, 32, 28).fill(0x1a1428);
  // Pure black opening
  g.rect(ox + 6, oy + 8, 28, 2).fill(0x0a0510);
  g.rect(ox + 5, oy + 10, 30, 22).fill(0x0a0510);
  // Stalactites
  g.rect(ox + 8, oy + 8, 2, 2).fill(0x5a4030);
  g.rect(ox + 28, oy + 8, 2, 2).fill(0x5a4030);
  // Skull
  g.rect(ox + 15, oy + 2, 8, 6).fill(0xf4e4c1);
  g.rect(ox + 16, oy + 3, 2, 2).fill(0x0a0510);
  g.rect(ox + 20, oy + 3, 2, 2).fill(0x0a0510);
  g.rect(ox + 17, oy + 6, 1, 2).fill(0x0a0510);
  g.rect(ox + 19, oy + 6, 1, 2).fill(0x0a0510);
  // Glowing red eyes inside the cave
  g.rect(ox + 15, oy + 18, 2, 2).fill(0xd04848);
  g.rect(ox + 21, oy + 18, 2, 2).fill(0xd04848);
  // S badge — 12×10 chip with bevel + outline
  drawBadge(g, ox + 13, oy + 24, 12, 10, 0xd04848, 0xf06868, 0x802020);
  layer.addChild(g);

  const sLabel = makeMonoLabel("S", 7, 0xf4e4c1);
  sLabel.x = ox + 13 + Math.round((12 - sLabel.width) / 2);
  sLabel.y = oy + 24 + Math.round((10 - sLabel.height) / 2);
  layer.addChild(sLabel);
}

/**
 * Crystal-shrine end marker.
 * Origin (ox, oy) is the top-left pixel of the 2×2 end region.
 */
function drawCrystalShrine(layer: Container, ox: number, oy: number): void {
  const g = new Graphics();
  // Halo — a few alpha-blended concentric circles centered on the crystal.
  const cxh = ox + 18;
  const cyh = oy + 16;
  for (let i = 4; i >= 1; i--) {
    g.circle(cxh, cyh, 6 + i * 4).fill({ color: 0x78a8f8, alpha: 0.1 });
  }
  // Pedestal
  g.rect(ox + 4, oy + 26, 36, 14).fill(0x5a4a6a);
  g.rect(ox + 4, oy + 26, 36, 2).fill(0x7c66a4);
  g.rect(ox + 2, oy + 36, 40, 4).fill(0x1a1428);
  // Crystal shaft
  g.rect(ox + 14, oy + 2, 10, 18).fill(CELL.crystalCore);
  g.rect(ox + 14, oy + 2, 3, 18).fill(CELL.crystalLight);
  g.rect(ox + 14, oy + 2, 1, 18).fill(0xffffff);
  g.rect(ox + 22, oy + 2, 2, 18).fill(CELL.crystalDeep);
  // Crystal tip
  g.rect(ox + 16, oy + 0, 6, 2).fill(CELL.crystalCore);
  g.rect(ox + 18, oy - 2, 2, 2).fill(0xffffff);
  // E badge
  drawBadge(g, ox + 14, oy + 30, 12, 10, 0xf0c038, 0xffe068, 0x886820);
  layer.addChild(g);

  const eLabel = makeMonoLabel("E", 7, 0x1a1428);
  eLabel.x = ox + 14 + Math.round((12 - eLabel.width) / 2);
  eLabel.y = oy + 30 + Math.round((10 - eLabel.height) / 2);
  layer.addChild(eLabel);
}

/** Beveled badge chip (used by S/E + flag numerals). 1px outer outline. */
function drawBadge(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  hi: number,
  lo: number,
): void {
  // 1px outer outline
  g.rect(x - 1, y - 1, w + 2, h + 2).fill(0x1a1428);
  // body + bevel
  g.rect(x, y, w, h).fill(fill);
  g.rect(x, y, w, 1).fill(hi);
  g.rect(x, y, 1, h).fill(hi);
  g.rect(x, y + h - 1, w, 1).fill(lo);
  g.rect(x + w - 1, y, 1, h).fill(lo);
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
 * Render checkpoint markers as numbered red banners on poles. Each banner
 * sits at the waypoint's fine cell, with the cloth extending up-and-right
 * so it doesn't overlap surrounding tower placements.
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

    // Soft warm glow under the banner.
    for (let i = 3; i >= 1; i--) {
      g.ellipse(ox + 17, oy + 15, 10 + i * 3, 5 + i * 2).fill({
        color: 0xf0a040,
        alpha: 0.06,
      });
    }

    // Pole + soft side light.
    g.rect(ox + 9, oy - 18, 2, 29).fill(0x1a1428);
    g.rect(ox + 8, oy - 18, 1, 29).fill(0xb8a584);
    // Pennant ornament on top.
    g.rect(ox + 8, oy - 20, 4, 2).fill(0xf0a040);

    // Flag body + stripes.
    g.rect(ox + 11, oy - 17, 16, 12).fill(0xd04848);
    g.rect(ox + 11, oy - 17, 16, 2).fill(0xf06868);
    g.rect(ox + 11, oy - 7, 16, 2).fill(0x802020);

    // Swallowtail cutouts — punch them with grass color so the banner reads
    // as notched even on top of grass tiles next to the path.
    g.rect(ox + 23, oy - 15, 4, 2).fill(CELL.grass);
    g.rect(ox + 25, oy - 13, 2, 2).fill(CELL.grass);
    g.rect(ox + 23, oy - 11, 4, 2).fill(CELL.grass);

    layer.addChild(g);

    // Numeral with 1px shadow.
    const numStr = String(idx + 1);
    const shadow = makeMonoLabel(numStr, 8, 0x1a1428);
    shadow.x = ox + 17 - Math.round(shadow.width / 2) + 1;
    shadow.y = oy - 16 + 1;
    layer.addChild(shadow);
    const num = makeMonoLabel(numStr, 8, 0xf4e4c1);
    num.x = ox + 17 - Math.round(num.width / 2);
    num.y = oy - 16;
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
