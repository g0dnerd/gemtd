/**
 * Map layout for GemTD.
 *
 * Inspired by the canonical SC2 GemTD: a roughly square build area with the
 * creep path defined as an ordered set of waypoints. Players "maze" by placing
 * towers between waypoints; A* re-routes around them as long as connectivity
 * remains intact.
 *
 * Grid is the *fine* placement grid at 2× the canonical (coarse) tile
 * resolution — 42 wide × 34 tall fine cells. Each tower / rock occupies one
 * fine cell. The board's outer wall ring and the start/end corridors are
 * 2 fine cells thick to preserve the original visual proportions.
 */

export const GRID_W = 42;
export const GRID_H = 42;

export const enum Cell {
  /** Buildable open ground. */
  Grass = 0,
  /** Permanent path / spawn / end — never buildable, always walkable. */
  Path = 1,
  /** Outside the play area. */
  Wall = 2,
  /** Tile occupied by a tower (blocks movement). */
  Tower = 3,
  /** Sold-tower remnant — blocks movement; still counts as occupied. */
  Rock = 4,
}

export interface Waypoint {
  x: number;
  y: number;
  /** Optional label, mostly for tests/debugging. */
  label?: string;
}

/**
 * Ordered waypoints. The creep moves Start → Waypoint 1 → ... → End.
 * Each segment is independently A*-routed, so cutting any single segment
 * is what marks a placement as a "full block."
 */
export const WAYPOINTS: readonly Waypoint[] = [
  { x: 0, y: 6, label: "Start" },
  { x: 8, y: 6, label: "WP1" },
  { x: 8, y: 22, label: "WP2" },
  { x: 32, y: 22, label: "WP3" },
  { x: 32, y: 6, label: "WP4" },
  { x: 20, y: 6, label: "WP5" },
  { x: 20, y: 34, label: "WP6" },
  { x: 40, y: 34, label: "End" },
];

export const START = WAYPOINTS[0];
export const END = WAYPOINTS[WAYPOINTS.length - 1];

/** Extra cells around each checkpoint (index 1–6) that are blocked for building. */
export const CHECKPOINT_ZONES: ReadonlyMap<number, ReadonlyArray<{ x: number; y: number }>> = new Map([
  [1, [{ x: 7, y: 6 }, { x: 8, y: 6 }, { x: 9, y: 6 }, { x: 8, y: 7 }]],
  [2, [{ x: 8, y: 21 }, { x: 8, y: 22 }, { x: 8, y: 23 }, { x: 9, y: 22 }]],
  [3, [{ x: 31, y: 22 }, { x: 32, y: 22 }, { x: 32, y: 23 }, { x: 32, y: 21 }]],
  [4, [{ x: 32, y: 7 }, { x: 32, y: 6 }, { x: 32, y: 5 }, { x: 31, y: 6 }]],
  [5, [{ x: 21, y: 6 }, { x: 20, y: 6 }, { x: 19, y: 6 }, { x: 20, y: 7 }]],
  [6, [{ x: 20, y: 33 }, { x: 20, y: 34 }, { x: 19, y: 34 }, { x: 21, y: 34 }]],
]);

/**
 * Permanent path tiles — these are pre-painted onto the board so the player
 * cannot build on them. They form the "guaranteed visible" portion of the
 * route through the four waypoints, with open build rooms between them.
 *
 * Anything not in this set inside the play area is buildable grass.
 */
function buildBaseLayout(): { grid: Cell[][]; pathTiles: Set<string> } {
  const grid: Cell[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_W; x++) {
      // 2-fine-cell-thick wall border (preserves original 1 coarse-tile look).
      const onBorder = x < 2 || x >= GRID_W - 2 || y < 2 || y >= GRID_H - 2;
      row.push(onBorder ? Cell.Wall : Cell.Grass);
    }
    grid.push(row);
  }

  const pathTiles = new Set<string>();
  // Carve a 2×2 start "tile" plus a 2×2 entry corridor on the left edge.
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      const x = dx;
      const y = START.y + dy;
      grid[y][x] = Cell.Path;
      pathTiles.add(`${x},${y}`);
    }
  }
  // Same on the right edge for the end tile + exit corridor.
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      const x = GRID_W - 4 + dx;
      const y = END.y + dy;
      grid[y][x] = Cell.Path;
      pathTiles.add(`${x},${y}`);
    }
  }

  // Mark checkpoint zone cells as Path so they can't be built on.
  for (const cells of CHECKPOINT_ZONES.values()) {
    for (const { x, y } of cells) {
      grid[y][x] = Cell.Path;
      pathTiles.add(`${x},${y}`);
    }
  }

  return { grid, pathTiles };
}

export const BASE = buildBaseLayout();

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

export function isBuildable(cell: Cell): boolean {
  return cell === Cell.Grass;
}

export function isWalkable(cell: Cell): boolean {
  return cell === Cell.Grass || cell === Cell.Path;
}
