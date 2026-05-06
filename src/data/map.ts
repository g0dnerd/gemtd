/**
 * Map layout for GemTD.
 *
 * Inspired by the canonical SC2 GemTD: a roughly square build area with the
 * creep path defined as an ordered set of waypoints. Players "maze" by placing
 * towers between waypoints; A* re-routes around them as long as connectivity
 * remains intact.
 *
 * We use a 21-wide x 17-tall grid:
 *   - x ∈ [0, 20], y ∈ [0, 16]
 *   - Tiles outside the build area are walls (BORDER).
 *   - The path is forced through 4 mid-board waypoints, creating natural
 *     "rooms" the player can fill in to lengthen the maze.
 */

export const GRID_W = 21;
export const GRID_H = 17;

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
  { x: 0, y: 1, label: 'Start' },
  { x: 5, y: 3, label: 'WP1' },
  { x: 15, y: 3, label: 'WP2' },
  { x: 15, y: 13, label: 'WP3' },
  { x: 5, y: 13, label: 'WP4' },
  { x: 20, y: 8, label: 'End' },
];

export const START = WAYPOINTS[0];
export const END = WAYPOINTS[WAYPOINTS.length - 1];

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
      // Outermost border tiles are walls so the maze can't escape.
      const onBorder = x === 0 || x === GRID_W - 1 || y === 0 || y === GRID_H - 1;
      row.push(onBorder ? Cell.Wall : Cell.Grass);
    }
    grid.push(row);
  }

  // Carve out the start tile (left edge) and end tile (right edge).
  grid[START.y][START.x] = Cell.Path;
  grid[END.y][END.x] = Cell.Path;

  // Also carve a 1-tile entry/exit corridor at start and end so the
  // path can leave the wall.
  grid[START.y][1] = Cell.Path;
  grid[END.y][GRID_W - 2] = Cell.Path;

  const pathTiles = new Set<string>();
  pathTiles.add(`${START.x},${START.y}`);
  pathTiles.add(`1,${START.y}`);
  pathTiles.add(`${END.x},${END.y}`);
  pathTiles.add(`${GRID_W - 2},${END.y}`);

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
