/**
 * Rock sprite — the mossy-boulder material used for permanent maze blockers
 * (former non-kept gem towers).
 *
 * `buildMossRock(seed)` returns a 32×32 `grid` (slot values 0..7 → palette
 * colours via drawPixelGrid) plus the `palette` to rasterise it with, and a
 * separate low-alpha `shadow` grid: a sculpted ground-contact shadow with real
 * form (wider at the base, fading outward through a dithered penumbra) — NOT a
 * uniform offset blob. The shadow is rasterised on its own and drawn as a
 * sprite *under* the rock at reduced alpha so it reads over grass/path/terrain.
 *
 * Per-position micro-variation: pass a per-rock seed and the silhouette
 * chamfers + edge jitter + moss placement shift deterministically, so a field
 * of rocks looks natural rather than tiled-identical.
 */

import type { PixelGrid } from "./sprites";
import type { SpriteColors } from "./pixelTexture";
import { ROCK_PAL } from "./theme";

const SIZE = 32;

export interface RockBuild {
  grid: PixelGrid;
  palette: SpriteColors;
  /** Separate grid for the cast shadow; rasterise + draw under the rock at alpha. */
  shadow: PixelGrid;
  /** Suggested alpha for the cast-shadow sprite. */
  shadowAlpha: number;
}

type Row = [number, number] | null;
type Sil = Row[];

function make(): number[][] {
  const g: number[][] = [];
  for (let y = 0; y < SIZE; y++) g[y] = new Array<number>(SIZE).fill(0);
  return g;
}

/** Small deterministic PRNG so each rock instance varies but stays stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function silFromRows(rows: Row[]): Sil {
  return rows.map((r) => (r ? [r[0], r[1]] : null));
}

/** Randomly nibble the silhouette edges so no two rocks share an outline. */
function jitterEdges(sil: Sil, rnd: () => number, amount = 1): void {
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    if (rnd() < 0.35) r[0] = Math.min(r[1], r[0] + (rnd() < 0.5 ? amount : 0));
    if (rnd() < 0.35) r[1] = Math.max(r[0], r[1] - (rnd() < 0.5 ? amount : 0));
  }
}

/**
 * Diagonal light model. Light comes from the top-left; t increases toward the
 * bottom-right. Three bands → light / mid / dark, with an outline ring.
 */
function shade(grid: number[][], sil: Sil, tHi = 0.3, tLo = 0.62): void {
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    for (let x = r[0]; x <= r[1]; x++) {
      const t = (x + 1.4 * y) / SIZE;
      if (t < tHi) grid[y][x] = 1;
      else if (t > tHi + tLo) grid[y][x] = 3;
      else grid[y][x] = 2;
    }
  }
}

/** 1px outline ring around the silhouette (slot 4). */
function outline(grid: number[][], sil: Sil): void {
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    for (let x = r[0]; x <= r[1]; x++) {
      const edge =
        x === r[0] ||
        x === r[1] ||
        !sil[y - 1] ||
        x < sil[y - 1]![0] ||
        x > sil[y - 1]![1] ||
        !sil[y + 1] ||
        x < sil[y + 1]![0] ||
        x > sil[y + 1]![1];
      if (edge) grid[y][x] = 4;
    }
  }
}

function topHighlight(grid: number[][], sil: Sil, slot = 1): void {
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    for (let x = r[0] + 1; x <= r[1] - 1; x++) {
      const above = sil[y - 1];
      if ((!above || x < above[0] || x > above[1]) && grid[y][x] && grid[y][x] !== 4) {
        if (grid[y + 1]?.[x] && grid[y + 1][x] !== 4) grid[y + 1][x] = slot;
      }
    }
  }
}

/**
 * Build a cast-shadow grid with real form: a flattened ellipse hugging the
 * rock's base, wider than the rock and offset down-right to match the top-left
 * key light. The single shadow colour is rendered at one sprite alpha, so the
 * *softness* of the rim has to come from coverage, not tone: the core is solid,
 * and the outer penumbra is dithered (checkerboard) so its edge fades into the
 * terrain instead of stopping at a hard ellipse line. This is what makes it
 * read as a grounded contact shadow rather than a uniform offset blob.
 */
function castShadow(sil: Sil, rnd: () => number): PixelGrid {
  const g = make();
  // Find the rock's footprint extents and its base row.
  let baseY = 0;
  let minX = SIZE,
    maxX = 0;
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    baseY = Math.max(baseY, y);
    minX = Math.min(minX, r[0]);
    maxX = Math.max(maxX, r[1]);
  }
  const cx = (minX + maxX) / 2 + 2; // shift toward light's cast direction
  const halfW = (maxX - minX) / 2 + 3;
  const cy = Math.min(SIZE - 2, baseY - 1);
  const halfH = 4.2 + rnd() * 1.2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (x - cx) / halfW;
      const dy = (y - cy) / halfH;
      const d = dx * dx + dy * dy;
      if (d <= 1.0) g[y][x] = 1; // dense, fully-covered core
      else if (d <= 1.45 && ((x + y) & 1) === 0) g[y][x] = 1; // dithered penumbra
    }
  }
  return g;
}

const SHADOW_PAL = (color: number): SpriteColors => ({
  light: color,
  mid: color,
  dark: color,
});

// ===========================================================================
// Mossy boulder. Chunky greened granite that fills its 2×2 footprint, top
// crusted with moss + tufts. Squarer, slightly-broken crown (not a clean dome)
// with a planted wide base.
// ===========================================================================

function rounded(rnd: () => number): Sil {
  const rows: Row[] = [];
  const cx = 16 + (rnd() - 0.5) * 1.5;
  const halfMax = 14; // near-full footprint half-width (cx±14 → ~2..30)
  const topY = 2 + Math.floor(rnd() * 2); // 2..3
  const baseY = 30;
  // Asymmetric corner chamfers: small bevels up top, base stays planted.
  // Independent per-corner cuts keep the block from reading as a clean square.
  const tlCut = 3 + Math.floor(rnd() * 3); // top-left  3..5 (squarer crown)
  const trCut = 3 + Math.floor(rnd() * 3); // top-right 3..5
  const blCut = 1 + Math.floor(rnd() * 2); // bottom-left  1..2
  const brCut = 1 + Math.floor(rnd() * 2); // bottom-right 1..2
  for (let y = 0; y < SIZE; y++) {
    if (y < topY || y > baseY) {
      rows.push(null);
      continue;
    }
    const dTop = y - topY;
    const dBot = baseY - y;
    // Each side recedes only near its corners; holds full width through the middle.
    let leftCut = Math.max(0, tlCut - dTop, blCut - dBot);
    let rightCut = Math.max(0, trCut - dTop, brCut - dBot);
    // Ragged bite on the top corners so the crown breaks up instead of
    // reading as a clean bevel curve.
    if (dTop < 5) {
      if (rnd() < 0.45) leftCut += 1;
      if (rnd() < 0.45) rightCut += 1;
    }
    let xL = Math.round(cx - (halfMax - leftCut));
    let xR = Math.round(cx + (halfMax - rightCut));
    xL = Math.max(1, xL);
    xR = Math.min(30, xR);
    rows.push([xL, xR]);
  }
  return silFromRows(rows);
}

/** Build one mossy-boulder rock for the given per-position seed. */
export function buildMossRock(seed: number): RockBuild {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const sil = rounded(rnd);
  jitterEdges(sil, rnd, 2);
  const g = make();
  shade(g, sil, 0.34, 0.5);
  topHighlight(g, sil, 1);
  outline(g, sil);
  // Moss cap: cling to the top rim + a few side dabs.
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    for (let x = r[0]; x <= r[1]; x++) {
      const above = sil[y - 1];
      const nearTop = !above || x < above[0] || x > above[1] || y < 8;
      if (nearTop && g[y][x] === 1 && rnd() < 0.55) g[y][x] = 5;
      else if (nearTop && g[y][x] && g[y][x] !== 4 && rnd() < 0.25) g[y][x] = 6;
    }
  }
  // Bright moss specks + a couple of hanging strands.
  for (let i = 0; i < 14; i++) {
    const y = 3 + Math.floor(rnd() * 12);
    const r = sil[y];
    if (!r) continue;
    const x = r[0] + Math.floor(rnd() * (r[1] - r[0] + 1));
    if (g[y][x] && g[y][x] !== 4) g[y][x] = rnd() < 0.5 ? 5 : 7;
  }
  return {
    grid: g,
    palette: ROCK_PAL.mossBoulder,
    shadow: castShadow(sil, rnd),
    shadowAlpha: 0.34,
  };
}

/** Palette used to rasterise the mossy-boulder cast-shadow grid. */
export function mossShadowPalette(): SpriteColors {
  return SHADOW_PAL(ROCK_PAL.mossBoulder.shadow);
}
