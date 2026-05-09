import type { PixelGrid } from "./sprites";
import type { SpriteColors } from "./pixelTexture";
import { ROCK_PAL } from "./theme";

const SIZE = 32;

type Sil = ([number, number] | null)[];

function make(): number[][] {
  const g: number[][] = [];
  for (let y = 0; y < SIZE; y++) g[y] = new Array<number>(SIZE).fill(0);
  return g;
}

function silFromRows(rows: ([number, number] | null)[]): Sil {
  return rows.map(r => (r ? [r[0], r[1]] : null));
}

function chip(sil: Sil, chips: [string, number, number][]): void {
  for (const [side, y, depth] of chips) {
    if (!sil[y]) continue;
    if (side === "L") sil[y]![0] = Math.min(sil[y]![1], sil[y]![0] + depth);
    else sil[y]![1] = Math.max(sil[y]![0], sil[y]![1] - depth);
  }
}

function shadeDiagonal(
  grid: number[][],
  sil: Sil,
  opts: { tHi?: number; tLo?: number } = {},
): void {
  const tHi = opts.tHi ?? 0.3;
  const tLo = opts.tLo ?? 0.62;
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

function bottomShadow(grid: number[][], sil: Sil, depth = 2): void {
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    for (let x = r[0]; x <= r[1]; x++) {
      const below = sil[y + 1];
      const empty = !below || x < below[0] || x > below[1];
      if (empty) {
        for (let d = 0; d < depth; d++) {
          if (grid[y - d]?.[x] && grid[y - d][x] !== 0) grid[y - d][x] = 3;
        }
      }
    }
  }
}

function topHighlight(grid: number[][], sil: Sil, depth = 1): void {
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    for (let x = r[0]; x <= r[1]; x++) {
      const above = sil[y - 1];
      const empty = !above || x < above[0] || x > above[1];
      if (empty) {
        for (let d = 0; d < depth; d++) {
          if (grid[y + d]?.[x]) grid[y + d][x] = 1;
        }
      }
    }
  }
}

function leftHighlight(grid: number[][], sil: Sil, depth = 1): void {
  for (let y = 0; y < SIZE; y++) {
    const r = sil[y];
    if (!r) continue;
    for (let d = 0; d < depth; d++) {
      const x = r[0] + d;
      if (x <= r[1] && grid[y][x]) grid[y][x] = 1;
    }
  }
}

// -- 1. Megalith Slab -------------------------------------------------------

function vMegalith(): { grid: PixelGrid; palette: SpriteColors } {
  const rows: ([number, number] | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    let xL = 0,
      xR = 31;
    if (y === 0) {
      xL = 4;
      xR = 27;
    } else if (y === 1) {
      xL = 2;
      xR = 29;
    } else if (y === 2) {
      xL = 1;
      xR = 30;
    } else if (y === 3) {
      xL = 0;
      xR = 31;
    } else if (y === 31) {
      xL = 1;
      xR = 30;
    } else if (y === 30) {
      xL = 0;
      xR = 31;
    }
    rows.push([xL, xR]);
  }
  const sil = silFromRows(rows);
  chip(sil, [
    ["L", 8, 1],
    ["L", 9, 2],
    ["L", 10, 1],
    ["R", 5, 1],
    ["R", 14, 1],
    ["R", 15, 1],
    ["R", 16, 2],
    ["R", 17, 1],
    ["L", 22, 1],
    ["L", 23, 2],
    ["L", 24, 1],
    ["R", 26, 1],
    ["R", 27, 2],
    ["R", 28, 1],
  ]);
  const g = make();
  shadeDiagonal(g, sil, { tHi: 0.32, tLo: 0.58 });
  topHighlight(g, sil, 1);
  leftHighlight(g, sil, 1);
  bottomShadow(g, sil, 2);
  for (const ly of [13, 19, 25]) {
    const r = sil[ly];
    if (!r) continue;
    for (let x = r[0] + 3; x <= r[1] - 3; x += 3) {
      if (g[ly][x] === 2) g[ly][x] = 3;
    }
  }
  return { grid: g, palette: { ...ROCK_PAL.warmStone } };
}

// -- 2. Jagged Outcrop -------------------------------------------------------

function vJaggedOutcrop(): { grid: PixelGrid; palette: SpriteColors } {
  const topY = [
    7, 5, 3, 2, 4, 5, 6, 7, 5, 3, 1, 0, 2, 4, 6, 7, 6, 5, 3, 2, 4, 5, 5, 6,
    7, 6, 4, 3, 2, 4, 6, 8,
  ];
  const sil: Sil = new Array<[number, number] | null>(SIZE).fill(null);
  for (let y = 0; y < SIZE; y++) {
    let xL = -1,
      xR = -1;
    for (let x = 0; x < SIZE; x++) {
      if (topY[x] <= y) {
        if (xL < 0) xL = x;
        xR = x;
      }
    }
    if (xL >= 0) {
      if (y >= 26) sil[y] = [0, 31];
      else sil[y] = [xL, xR];
    }
  }
  if (sil[31]) sil[31] = [1, 30];
  chip(sil, [
    ["L", 14, 1],
    ["L", 15, 1],
    ["L", 22, 2],
    ["R", 18, 1],
    ["R", 19, 2],
  ]);
  const g = make();
  shadeDiagonal(g, sil, { tHi: 0.28, tLo: 0.6 });
  topHighlight(g, sil, 1);
  bottomShadow(g, sil, 2);
  return { grid: g, palette: { ...ROCK_PAL.stone } };
}

// -- 3. Stepped Megalith (not in shipping mix) -------------------------------

function vStepped(): { grid: PixelGrid; palette: SpriteColors } {
  const rows: ([number, number] | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    if (y < 2) rows.push(null);
    else if (y < 9) rows.push([9, 22]);
    else if (y < 17) rows.push([4, 27]);
    else if (y < 24) rows.push([1, 30]);
    else rows.push([0, 31]);
  }
  const sil = silFromRows(rows);
  chip(sil, [
    ["L", 2, 1],
    ["R", 2, 1],
    ["R", 8, 1],
    ["L", 9, 1],
    ["R", 16, 1],
    ["L", 17, 1],
    ["R", 23, 2],
    ["R", 31, 1],
  ]);
  const g = make();
  shadeDiagonal(g, sil, { tHi: 0.3, tLo: 0.58 });
  topHighlight(g, sil, 1);
  bottomShadow(g, sil, 2);
  for (const stepY of [8, 16, 23]) {
    const above = sil[stepY],
      below = sil[stepY + 1];
    if (above && below) {
      for (let x = below[0]; x <= below[1]; x++) {
        if (x < above[0] || x > above[1]) {
          if (g[stepY + 1]?.[x]) g[stepY + 1][x] = 3;
        }
      }
    }
  }
  return { grid: g, palette: { ...ROCK_PAL.coolStone } };
}

// -- 4. Fractured Slab (not in shipping mix) ---------------------------------

function vFractured(): { grid: PixelGrid; palette: SpriteColors } {
  const rows: ([number, number] | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    let xL = 0,
      xR = 31;
    if (y === 0) {
      xL = 3;
      xR = 28;
    } else if (y === 1) {
      xL = 1;
      xR = 30;
    } else if (y === 31) {
      xL = 2;
      xR = 29;
    } else if (y === 30) {
      xL = 0;
      xR = 31;
    }
    rows.push([xL, xR]);
  }
  const sil = silFromRows(rows);
  chip(sil, [
    ["L", 4, 1],
    ["L", 11, 1],
    ["R", 7, 1],
    ["R", 22, 2],
    ["L", 26, 1],
  ]);
  const g = make();
  shadeDiagonal(g, sil, { tHi: 0.3, tLo: 0.62 });
  topHighlight(g, sil, 1);
  leftHighlight(g, sil, 1);
  bottomShadow(g, sil, 2);
  const horiz: [number, number][] = [
    [2, 15], [3, 15], [4, 16], [5, 16], [6, 17], [7, 17], [8, 16], [9, 16],
    [10, 17], [11, 17], [12, 18], [13, 18], [14, 17], [15, 17],
    [16, 16], [17, 16], [18, 17], [19, 17], [20, 18], [21, 18], [22, 17],
    [23, 17], [24, 16], [25, 16], [26, 17], [27, 17], [28, 16], [29, 16],
  ];
  for (const [x, y] of horiz) if (g[y]?.[x]) g[y][x] = 4;
  const vert: [number, number][] = [
    [12, 4], [12, 5], [13, 6], [13, 7], [14, 8], [14, 9], [13, 10], [13, 11],
    [14, 12], [14, 13], [15, 14],
    [16, 18], [16, 19], [15, 20], [15, 21], [16, 22], [17, 23], [17, 24],
    [16, 25], [16, 26], [17, 27], [17, 28],
  ];
  for (const [x, y] of vert) if (g[y]?.[x]) g[y][x] = 4;
  const minor: [number, number][] = [
    [6, 9], [7, 10], [24, 8], [25, 9], [8, 24], [9, 25], [26, 24], [27, 25],
  ];
  for (const [x, y] of minor) if (g[y]?.[x] === 2) g[y][x] = 3;
  return { grid: g, palette: { ...ROCK_PAL.stone } };
}

// -- 5. Stacked Blocks -------------------------------------------------------

function vStackedBlocks(): { grid: PixelGrid; palette: SpriteColors } {
  const rows: ([number, number] | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    if (y < 10) rows.push([5, 30]);
    else if (y < 20) rows.push([1, 28]);
    else rows.push([0, 31]);
  }
  const sil = silFromRows(rows);
  chip(sil, [
    ["L", 0, 2],
    ["R", 0, 2],
    ["L", 9, 1],
    ["R", 9, 1],
    ["L", 10, 1],
    ["R", 19, 1],
    ["R", 20, 1],
    ["L", 31, 1],
    ["R", 31, 1],
  ]);
  const g = make();
  shadeDiagonal(g, sil, { tHi: 0.32, tLo: 0.55 });
  const blockSils = [
    silFromRows(rows.map((r, y) => (y < 10 ? r : null))),
    silFromRows(rows.map((r, y) => (y >= 10 && y < 20 ? r : null))),
    silFromRows(rows.map((r, y) => (y >= 20 ? r : null))),
  ];
  for (const s of blockSils) {
    topHighlight(g, s, 1);
    leftHighlight(g, s, 1);
    bottomShadow(g, s, 1);
  }
  for (const seamY of [9, 19]) {
    const above = sil[seamY],
      below = sil[seamY + 1];
    if (above && below) {
      for (let x = below[0]; x <= below[1]; x++) {
        if (x < above[0] || x > above[1]) {
          if (g[seamY + 1]?.[x]) g[seamY + 1][x] = 3;
        }
      }
    }
  }
  return { grid: g, palette: { ...ROCK_PAL.warmStone } };
}

// -- 6. Crystal Megalith (not in shipping mix) -------------------------------

function vCrystalMegalith(): { grid: PixelGrid; palette: SpriteColors } {
  const rows: ([number, number] | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    if (y < 8) rows.push(null);
    else if (y === 8) rows.push([3, 28]);
    else if (y === 9) rows.push([2, 30]);
    else if (y === 10) rows.push([1, 31]);
    else if (y === 31) rows.push([2, 29]);
    else if (y === 30) rows.push([0, 31]);
    else rows.push([0, 31]);
  }
  const sil = silFromRows(rows);
  chip(sil, [
    ["L", 17, 1],
    ["R", 14, 1],
    ["L", 24, 2],
    ["R", 22, 1],
  ]);
  const g = make();
  shadeDiagonal(g, sil, { tHi: 0.3, tLo: 0.58 });
  topHighlight(g, sil, 1);
  leftHighlight(g, sil, 1);
  bottomShadow(g, sil, 2);
  const shardA: [number, number][] = [
    [15, 1], [16, 1], [15, 2], [16, 2], [14, 3], [15, 3], [16, 3], [17, 3],
    [13, 4], [14, 4], [15, 4], [16, 4], [17, 4], [18, 4],
    [12, 5], [13, 5], [14, 5], [15, 5], [16, 5], [17, 5], [18, 5], [19, 5],
    [12, 6], [13, 6], [14, 6], [15, 6], [16, 6], [17, 6], [18, 6], [19, 6],
    [11, 7], [12, 7], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [18, 7],
    [19, 7], [20, 7],
  ];
  const shardB: [number, number][] = [
    [6, 4], [6, 5], [5, 6], [6, 6], [7, 6], [5, 7], [6, 7], [7, 7], [8, 7],
  ];
  const shardC: [number, number][] = [
    [25, 3], [26, 4], [25, 4], [26, 5], [24, 5], [25, 5], [26, 5], [27, 5],
    [24, 6], [25, 6], [26, 6], [27, 6],
    [23, 7], [24, 7], [25, 7], [26, 7], [27, 7], [28, 7],
  ];
  for (const [x, y] of [...shardA, ...shardB, ...shardC]) {
    if (y >= 0 && y < SIZE && x >= 0 && x < SIZE) g[y][x] = 5;
  }
  const facets: [number, number][] = [
    [17, 4], [18, 5], [19, 5], [18, 6], [19, 6], [19, 7], [20, 7],
    [17, 3], [16, 4],
    [7, 6], [7, 7], [8, 7],
    [27, 5], [27, 6], [28, 7], [26, 5], [26, 6],
  ];
  for (const [x, y] of facets) if (g[y]?.[x] === 5) g[y][x] = 6;
  return {
    grid: g,
    palette: { ...ROCK_PAL.coolStone, ...ROCK_PAL.crystal },
  };
}

// -- 7. Mossy Block ----------------------------------------------------------

function vMossyBlock(): { grid: PixelGrid; palette: SpriteColors } {
  const rows: ([number, number] | null)[] = [];
  for (let y = 0; y < SIZE; y++) {
    let xL = 0,
      xR = 31;
    if (y === 0) {
      xL = 5;
      xR = 26;
    } else if (y === 1) {
      xL = 2;
      xR = 29;
    } else if (y === 2) {
      xL = 1;
      xR = 30;
    } else if (y === 31) {
      xL = 2;
      xR = 29;
    } else if (y === 30) {
      xL = 0;
      xR = 31;
    }
    rows.push([xL, xR]);
  }
  const sil = silFromRows(rows);
  chip(sil, [
    ["L", 6, 1],
    ["L", 14, 1],
    ["R", 9, 1],
    ["R", 18, 2],
    ["L", 25, 1],
  ]);
  const g = make();
  shadeDiagonal(g, sil, { tHi: 0.32, tLo: 0.55 });
  topHighlight(g, sil, 1);
  leftHighlight(g, sil, 1);
  bottomShadow(g, sil, 2);
  const moss: [number, number][] = [
    [2, 2], [3, 2], [4, 3], [5, 3], [7, 2], [8, 3], [10, 2], [11, 3], [12, 2],
    [14, 3], [15, 3], [16, 2], [17, 3], [18, 2],
    [20, 3], [21, 2], [22, 3], [24, 2], [25, 3], [26, 2], [28, 3], [29, 3],
    [3, 4], [4, 4], [7, 4], [8, 4], [11, 4], [12, 4],
    [15, 4], [16, 4], [17, 4], [20, 4], [21, 4], [24, 4], [25, 4], [28, 4],
    [5, 5], [6, 5], [12, 5], [16, 5], [20, 5], [25, 5],
    [5, 6], [16, 6],
    [5, 7],
    [12, 6], [20, 6],
    [16, 7],
    [3, 9], [3, 10], [28, 9], [1, 12], [30, 11],
  ];
  for (const [x, y] of moss) if (g[y]?.[x]) g[y][x] = 5;
  const deep: [number, number][] = [
    [4, 3], [8, 3], [15, 3], [21, 3], [26, 3],
    [4, 4], [16, 4], [25, 4],
    [5, 6], [16, 6], [20, 6],
  ];
  for (const [x, y] of deep) if (g[y]?.[x]) g[y][x] = 6;
  return { grid: g, palette: { ...ROCK_PAL.warmStone, ...ROCK_PAL.moss } };
}

// -- 8. Chunky Cluster (not in shipping mix) ---------------------------------

function vChunkyCluster(): { grid: PixelGrid; palette: SpriteColors } {
  const left = silFromRows(
    Array.from({ length: SIZE }, (_, y): [number, number] | null => {
      if (y < 4) return null;
      if (y < 6) return [2, 9];
      if (y < 14) return [0, 12];
      if (y < 24) return [0, 14];
      return [0, 13];
    }),
  );
  const mid = silFromRows(
    Array.from({ length: SIZE }, (_, y): [number, number] | null => {
      if (y < 12) return null;
      if (y < 16) return [10, 20];
      if (y < 26) return [8, 22];
      return [6, 24];
    }),
  );
  const right = silFromRows(
    Array.from({ length: SIZE }, (_, y): [number, number] | null => {
      if (y < 8) return null;
      if (y < 11) return [22, 28];
      if (y < 20) return [19, 31];
      if (y < 30) return [17, 31];
      return [16, 30];
    }),
  );
  const sil: Sil = new Array<[number, number] | null>(SIZE).fill(null);
  for (let y = 0; y < SIZE; y++) {
    const cands = [left[y], mid[y], right[y]].filter(
      (c): c is [number, number] => c !== null,
    );
    if (!cands.length) continue;
    let xL = 31,
      xR = 0;
    for (const c of cands) {
      xL = Math.min(xL, c[0]);
      xR = Math.max(xR, c[1]);
    }
    sil[y] = [xL, xR];
  }
  const g = make();
  shadeDiagonal(g, sil, { tHi: 0.3, tLo: 0.58 });
  topHighlight(g, sil, 1);
  leftHighlight(g, sil, 1);
  bottomShadow(g, sil, 2);
  for (const s of [left, mid, right]) {
    topHighlight(g, s, 1);
    bottomShadow(g, s, 1);
  }
  for (let y = 12; y <= 24; y++) {
    const lr = left[y]?.[1];
    const mr = mid[y]?.[0];
    if (lr != null && mr != null && Math.abs(lr - mr) <= 2) {
      const x = Math.min(lr, mr);
      if (g[y]?.[x] && g[y][x] !== 0) g[y][x] = 3;
    }
    const mR = mid[y]?.[1];
    const rL = right[y]?.[0];
    if (mR != null && rL != null && Math.abs(mR - rL) <= 2) {
      const x = Math.min(mR, rL);
      if (g[y]?.[x] && g[y][x] !== 0) g[y][x] = 3;
    }
  }
  return { grid: g, palette: { ...ROCK_PAL.paleStone } };
}

// -- Variant registry --------------------------------------------------------

const BUILDERS = {
  megalith: vMegalith,
  jagged: vJaggedOutcrop,
  stepped: vStepped,
  fractured: vFractured,
  stacked: vStackedBlocks,
  crystal: vCrystalMegalith,
  mossyblk: vMossyBlock,
  chunky: vChunkyCluster,
};

export type RockVariantId = "megalith" | "stacked" | "jagged" | "mossyblk";

export function buildRockVariant(
  id: RockVariantId,
): { grid: PixelGrid; palette: SpriteColors } {
  return BUILDERS[id]();
}

// -- Weighted picker ---------------------------------------------------------

const MIX: readonly { id: RockVariantId; weight: number }[] = [
  { id: "megalith", weight: 6 },
  { id: "stacked", weight: 3 },
  { id: "jagged", weight: 2 },
  { id: "mossyblk", weight: 2 },
];
const TOTAL = 13;

export function pickRockVariant(towerId: number): RockVariantId {
  let h = (towerId * 73856093) ^ ((towerId >> 5) * 19349663);
  h = ((h % TOTAL) + TOTAL) % TOTAL;
  let acc = 0;
  for (const m of MIX) {
    acc += m.weight;
    if (h < acc) return m.id;
  }
  return MIX[0].id;
}
