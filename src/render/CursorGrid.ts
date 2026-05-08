import { Container, Graphics } from "pixi.js";
import { FINE_TILE } from "../game/constants";
import { GRID_W, GRID_H, Cell } from "../data/map";
import { THEME } from "./theme";

const HALO_RADIUS = 56;
const GRID_ALPHA = 0.12;
const GHOST_FILL_ALPHA = 0.18;

let gridGfx: Graphics | null = null;
let ghostGfx: Graphics | null = null;

export function renderCursorGrid(
  gridLayer: Container,
  ghostLayer: Container,
  hoverPixel: { x: number; y: number } | null,
  hoverTile: { x: number; y: number } | null,
  haloAlpha: number,
  phase: string,
  grid: Cell[][],
): void {
  if (!gridGfx) {
    gridGfx = new Graphics();
    gridLayer.addChild(gridGfx);
  }
  if (!ghostGfx) {
    ghostGfx = new Graphics();
    ghostLayer.addChild(ghostGfx);
  }
  gridGfx.clear();
  ghostGfx.clear();

  if (phase !== "build") return;
  if (!hoverPixel || haloAlpha <= 0.001) return;

  const cx = hoverPixel.x;
  const cy = hoverPixel.y;

  // Determine the bounding box of cells whose edges could fall inside the halo.
  const minCellX = Math.max(0, Math.floor((cx - HALO_RADIUS) / FINE_TILE));
  const maxCellX = Math.min(GRID_W, Math.ceil((cx + HALO_RADIUS) / FINE_TILE));
  const minCellY = Math.max(0, Math.floor((cy - HALO_RADIUS) / FINE_TILE));
  const maxCellY = Math.min(GRID_H, Math.ceil((cy + HALO_RADIUS) / FINE_TILE));

  // Draw vertical grid lines within halo.
  for (let gx = minCellX; gx <= maxCellX; gx++) {
    const lineX = gx * FINE_TILE;
    // Clip the vertical line to the halo circle.
    for (let gy = minCellY; gy < maxCellY; gy++) {
      const segTop = gy * FINE_TILE;
      const segBot = segTop + FINE_TILE;
      const segMidY = (segTop + segBot) / 2;
      const dist = Math.hypot(lineX - cx, segMidY - cy);
      if (dist > HALO_RADIUS) continue;
      const falloff = radialFalloff(dist);
      const alpha = GRID_ALPHA * falloff * haloAlpha;
      if (alpha < 0.003) continue;
      gridGfx.moveTo(lineX, segTop).lineTo(lineX, segBot);
      gridGfx.stroke({ width: 1, color: THEME.ink, alpha, pixelLine: true });
    }
  }

  // Draw horizontal grid lines within halo.
  for (let gy = minCellY; gy <= maxCellY; gy++) {
    const lineY = gy * FINE_TILE;
    for (let gx = minCellX; gx < maxCellX; gx++) {
      const segLeft = gx * FINE_TILE;
      const segRight = segLeft + FINE_TILE;
      const segMidX = (segLeft + segRight) / 2;
      const dist = Math.hypot(segMidX - cx, lineY - cy);
      if (dist > HALO_RADIUS) continue;
      const falloff = radialFalloff(dist);
      const alpha = GRID_ALPHA * falloff * haloAlpha;
      if (alpha < 0.003) continue;
      gridGfx.moveTo(segLeft, lineY).lineTo(segRight, lineY);
      gridGfx.stroke({ width: 1, color: THEME.ink, alpha, pixelLine: true });
    }
  }

  // Ghost cell — snapped to the fine cell under the cursor.
  if (hoverTile) {
    const tx = hoverTile.x;
    const ty = hoverTile.y;
    if (tx >= 0 && ty >= 0 && tx < GRID_W && ty < GRID_H) {
      const valid = canPlaceAt(grid, tx, ty);
      const color = valid ? THEME.accent : THEME.bad;
      const px = tx * FINE_TILE;
      const py = ty * FINE_TILE;

      // 18% alpha fill
      ghostGfx.rect(px, py, FINE_TILE, FINE_TILE).fill({ color, alpha: GHOST_FILL_ALPHA * haloAlpha });
      // 1px outline
      ghostGfx.rect(px, py, FINE_TILE, 1).fill({ color, alpha: haloAlpha });
      ghostGfx.rect(px, py + FINE_TILE - 1, FINE_TILE, 1).fill({ color, alpha: haloAlpha });
      ghostGfx.rect(px, py, 1, FINE_TILE).fill({ color, alpha: haloAlpha });
      ghostGfx.rect(px + FINE_TILE - 1, py, 1, FINE_TILE).fill({ color, alpha: haloAlpha });
    }
  }
}

// Full opacity at center -> 60% at 60% of radius -> 0% at 100%.
function radialFalloff(dist: number): number {
  const t = dist / HALO_RADIUS;
  if (t <= 0.6) return 1.0;
  // Ease out from 1.0 at t=0.6 to 0.0 at t=1.0
  const u = (t - 0.6) / 0.4;
  return 1.0 - u * u;
}

function canPlaceAt(grid: Cell[][], x: number, y: number): boolean {
  return grid[y]?.[x] === Cell.Grass;
}

let uniformGfx: Graphics | null = null;
let uniformDrawn = false;

export function renderUniformGrid(gridLayer: Container, phase: string): void {
  if (!uniformGfx) {
    uniformGfx = new Graphics();
    gridLayer.addChild(uniformGfx);
  }
  if (phase !== "build") {
    uniformGfx.visible = false;
    return;
  }
  uniformGfx.visible = true;
  if (uniformDrawn) return;
  uniformGfx.clear();
  const w = GRID_W * FINE_TILE;
  const h = GRID_H * FINE_TILE;
  for (let gx = 0; gx <= GRID_W; gx++) {
    uniformGfx.moveTo(gx * FINE_TILE, 0).lineTo(gx * FINE_TILE, h);
  }
  for (let gy = 0; gy <= GRID_H; gy++) {
    uniformGfx.moveTo(0, gy * FINE_TILE).lineTo(w, gy * FINE_TILE);
  }
  uniformGfx.stroke({ width: 1, color: THEME.ink, alpha: GRID_ALPHA, pixelLine: true });
  uniformDrawn = true;
}
