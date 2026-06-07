/**
 * Rock sprite — the bone-and-sinew material used for permanent maze blockers
 * (former non-kept gem towers).
 *
 * `buildRock(seed)` returns a 32x32 `grid` (slot values 0..7 → palette
 * colours via drawPixelGrid) plus the `palette` to rasterise it with, and a
 * separate low-alpha `shadow` grid: a footprint-projected ground-contact
 * shadow whose shape is derived from the rock's own base silhouette (not a
 * generic ellipse stamped under every rock — see castShadow below). The
 * shadow is rasterised on its own and drawn as a sprite *under* the rock at
 * reduced alpha so it reads over grass/path/terrain.
 *
 * Per-position micro-variation: pass a per-rock seed and the silhouette
 * chamfers + edge jitter + sparkle/vein placement shift deterministically,
 * so a field of rocks looks natural rather than tiled-identical.
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
      if (
        (!above || x < above[0] || x > above[1]) &&
        grid[y][x] &&
        grid[y][x] !== 4
      ) {
        if (grid[y + 1]?.[x] && grid[y + 1][x] !== 4) grid[y + 1][x] = slot;
      }
    }
  }
}

/**
 * Build a cast-shadow grid from the rock's own base silhouette. The bottom
 * rows of the silhouette (the footprint band) are projected down-right —
 * toward the cast direction of the top-left key light — expanded by 1px for
 * foot bleed, then ringed with a checkerboard penumbra. Because the shadow
 * inherits the rock's outline, no two rocks share a shadow shape: variation
 * comes for free from silhouette variation rather than from an identical
 * ellipse stamped under each rock. A per-rock dither phase keeps neighbouring
 * penumbras from aligning into a visible pattern.
 */
function castShadow(sil: Sil, rnd: () => number): PixelGrid {
  const g = make();
  let baseY = 0;
  for (let y = 0; y < SIZE; y++) if (sil[y]) baseY = Math.max(baseY, y);

  const footStart = Math.max(0, baseY - 8);
  const offY = 1 + Math.floor(rnd() * 2); // 1..2 rows down
  const offX = 2 + Math.floor(rnd() * 2); // 2..3 cols right

  // Project the footprint band, dilated by 1px horizontally for foot bleed.
  for (let y = footStart; y <= baseY; y++) {
    const r = sil[y];
    if (!r) continue;
    const ty = Math.min(SIZE - 1, y + offY);
    for (let x = r[0] - 1; x <= r[1] + 1; x++) {
      const tx = x + offX;
      if (tx >= 0 && tx < SIZE) g[ty][tx] = 1;
    }
  }
  // Extend the base row one more cell so the shadow has a tail under the rock.
  const baseRow = sil[baseY];
  if (baseRow) {
    const tailY = Math.min(SIZE - 1, baseY + offY + 1);
    for (let x = baseRow[0]; x <= baseRow[1] + 1; x++) {
      const tx = x + offX;
      if (tx >= 0 && tx < SIZE) g[tailY][tx] = 1;
    }
  }
  // Dithered penumbra: a 1-cell halo around the solid core, checkerboard-keyed
  // with a per-rock phase so neighbouring rocks' penumbras don't align.
  const pen = make();
  const phase = Math.floor(rnd() * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (g[y][x]) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < SIZE && nx >= 0 && nx < SIZE && g[ny][nx]) {
            touch = true;
            break;
          }
        }
      }
      if (touch && ((x + y + phase) & 1) === 0) pen[y][x] = 1;
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (pen[y][x]) g[y][x] = 1;
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
// Bone-and-sinew boulder. Calcified intrusions in the Caul tissue, filling
// the 2x2 footprint with a squarer, slightly-broken crown (not a clean dome)
// and a planted wide base. Dried-blood crevices and a single rust capillary
// streak break up the rim and side faces.
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

/** Build one bone-and-sinew rock for the given per-position seed. */
export function buildRock(seed: number): RockBuild {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const sil = rounded(rnd);
  jitterEdges(sil, rnd, 2);
  const g = make();
  shade(g, sil, 0.34, 0.5);
  topHighlight(g, sil, 1);
  outline(g, sil);
  // Rim pass: bone-tip cling on the lit faces, occasional dark capillary creases.
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
  // Scattered bright bone specks + the occasional rust capillary streak.
  for (let i = 0; i < 14; i++) {
    const y = 3 + Math.floor(rnd() * 12);
    const r = sil[y];
    if (!r) continue;
    const x = r[0] + Math.floor(rnd() * (r[1] - r[0] + 1));
    if (g[y][x] && g[y][x] !== 4) g[y][x] = rnd() < 0.5 ? 5 : 7;
  }
  return {
    grid: g,
    palette: ROCK_PAL.boneSinew,
    shadow: castShadow(sil, rnd),
    shadowAlpha: 0.34,
  };
}

/** Palette used to rasterise the rock cast-shadow grid. */
export function rockShadowPalette(): SpriteColors {
  return SHADOW_PAL(ROCK_PAL.boneSinew.shadow);
}
