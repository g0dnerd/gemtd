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

/* =====================================================================
 * Soft-horror "Caul" ground. A continuous warped value-noise field that
 * breaks the 18px tile grid, plus a worn "ideal path" road baked into the
 * tissue under the rocks. Replaces the old verdant grass. The ground layer
 * is static (baked once in renderGround, not per frame), so the per-3px-block
 * sampling here is a one-time cost; 3px blocks keep the pixel-art crunch
 * without any cell-aligned tiling.
 * ===================================================================== */
const GROUND_BLOCK = 3;

/** Integer hash -> [0,1). Math.imul + unsigned shifts span the full range. */
function hashNoise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hashNoise(xi, yi), b = hashNoise(xi + 1, yi);
  const c = hashNoise(xi, yi + 1), d = hashNoise(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x: number, y: number): number {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) {
    s += amp * valueNoise(x * f, y * f);
    f *= 2;
    amp *= 0.5;
  }
  return s; // ~0..1
}

const GROUND_STOPS = [CELL.ground0, CELL.ground1, CELL.ground2, CELL.ground3];
/** Caul ground colour for an absolute board pixel. */
function groundColor(px: number, py: number): number {
  const nx = px / 27, ny = py / 27;
  const w = (fbm(nx + 11.3, ny + 4.1) - 0.5) * 2.4;
  const n = fbm(nx + w, ny - w * 0.7);
  const vn = fbm(nx * 1.6 + 30, ny * 1.6 + 7);
  if (Math.abs(vn - 0.5) < 0.011) return CELL.groundVein; // sparse blood capillary
  const idx = n < 0.46 ? 0 : n < 0.58 ? 1 : n < 0.70 ? 2 : 3;
  if (idx === 3 && hashNoise((px / 3) | 0, (py / 3) | 0) > 0.945) return CELL.groundSheen;
  return GROUND_STOPS[idx];
}

/* --- Worn "ideal path" road: the straight line air units fly through the
 * waypoints, worn into the tissue (not a UI overlay). --- */
const ROAD_HALF = FINE_TILE * 0.72; // trodden-core half-width
const ROAD_FEATHER = FINE_TILE * 1.55; // total fade reach
const ROAD_PTS: Array<[number, number]> = (() => {
  // Endpoints sit at waypoint height (row centre), matching the interior
  // waypoints, so the road runs flat along its entry/exit rows.
  const pts: Array<[number, number]> = [[START.x * FINE_TILE + 20, (START.y + 0.5) * FINE_TILE]];
  for (let i = 1; i < WAYPOINTS.length - 1; i++) {
    pts.push([(WAYPOINTS[i].x + 0.5) * FINE_TILE, (WAYPOINTS[i].y + 0.5) * FINE_TILE]);
  }
  pts.push([END.x * FINE_TILE + 20, (END.y + 0.5) * FINE_TILE]);
  return pts;
})();
function distToRoad(x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < ROAD_PTS.length; i++) {
    const [ax, ay] = ROAD_PTS[i - 1];
    const [bx, by] = ROAD_PTS[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (ax + t * dx), ey = y - (ay + t * dy);
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
/** Blend the worn road channel into a ground colour at an absolute pixel.
 * Soft-edged and noise-jittered so it reads as organic terrain, never a
 * clean stroke: lifted callus core, sunken darker rim just outside it. */
function applyRoad(col: number, x: number, y: number): number {
  const j = (fbm(x * 0.045 + 11.3, y * 0.045 + 4.1) - 0.5) * FINE_TILE * 1.4;
  const d = distToRoad(x, y) + j;
  if (d > ROAD_FEATHER) return col;
  const wear = 1 - smoothstep(0, ROAD_FEATHER, d);
  let out = mixColor(col, CELL.groundRoadCore, wear * 0.7);
  const rim = 1 - Math.min(1, Math.abs(d - ROAD_HALF) / (FINE_TILE * 0.55));
  if (d > ROAD_HALF * 0.55) out = mixColor(out, CELL.groundRoadLip, Math.max(0, rim) * 0.3);
  if (d < ROAD_HALF * 0.35) out = mixColor(out, CELL.groundRoadCore, 0.16);
  return out;
}

/** Ground tile — the Caul field sampled per 3px block, with the worn ideal-
 * path road baked in. Identical-colour blocks in a row are merged into one
 * rect to keep the baked geometry small. */
function drawGrassCell(g: Graphics, cx: number, cy: number, _x: number, _y: number): void {
  for (let by = 0; by < FINE_TILE; by += GROUND_BLOCK) {
    let runStart = 0;
    let runCol = -1;
    for (let bx = 0; bx <= FINE_TILE; bx += GROUND_BLOCK) {
      const col =
        bx < FINE_TILE
          ? applyRoad(
              groundColor(cx + bx + 1, cy + by + 1),
              cx + bx + GROUND_BLOCK / 2,
              cy + by + GROUND_BLOCK / 2,
            )
          : -1;
      if (col !== runCol) {
        if (runCol >= 0) {
          g.rect(cx + runStart, cy + by, bx - runStart, GROUND_BLOCK).fill(runCol);
        }
        runStart = bx;
        runCol = col;
      }
    }
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
