import { Cell, BASE } from '../data/map';
import { findRoute, flattenRoute } from '../systems/Pathfinding';

export interface Blueprint {
  rounds: [number, number][][];
  removals?: [number, number][][];
  keeperIndices?: number[];
}

const KEEPER_RANGE = 7;
const KEEPER_R2 = KEEPER_RANGE * KEEPER_RANGE;

export function exposureAt(
  x: number,
  y: number,
  routeSet: Set<string>,
): number {
  const cx = x + 1;
  const cy = y + 1;
  let count = 0;
  for (let dx = -KEEPER_RANGE; dx <= KEEPER_RANGE; dx++) {
    for (let dy = -KEEPER_RANGE; dy <= KEEPER_RANGE; dy++) {
      if (dx * dx + dy * dy > KEEPER_R2) continue;
      if (routeSet.has(`${cx + dx},${cy + dy}`)) count++;
    }
  }
  return count;
}

/** Cells covered by a keeper at (x, y) that fall on the route. */
function coveredCells(
  x: number,
  y: number,
  routeSet: Set<string>,
): string[] {
  const cx = x + 1;
  const cy = y + 1;
  const out: string[] = [];
  for (let dx = -KEEPER_RANGE; dx <= KEEPER_RANGE; dx++) {
    for (let dy = -KEEPER_RANGE; dy <= KEEPER_RANGE; dy++) {
      if (dx * dx + dy * dy > KEEPER_R2) continue;
      const key = `${cx + dx},${cy + dy}`;
      if (routeSet.has(key)) out.push(key);
    }
  }
  return out;
}

export function computeKeeperIndices(blueprint: Blueprint): number[] {
  const grid: Cell[][] = BASE.grid.map((row) => row.slice());
  const keepers: number[] = [];
  const coveredByKeepers = new Set<string>();

  for (let roundIdx = 0; roundIdx < blueprint.rounds.length; roundIdx++) {
    const positions = blueprint.rounds[roundIdx];

    if (blueprint.removals?.[roundIdx]) {
      for (const [rx, ry] of blueprint.removals[roundIdx]) {
        grid[ry][rx] = Cell.Grass;
        grid[ry][rx + 1] = Cell.Grass;
        grid[ry + 1][rx] = Cell.Grass;
        grid[ry + 1][rx + 1] = Cell.Grass;
      }
    }

    const placed: { x: number; y: number; idx: number }[] = [];

    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      let valid = true;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          if (grid[y + dy][x + dx] !== Cell.Grass) valid = false;
      if (!valid) continue;

      grid[y][x] = Cell.Tower;
      grid[y][x + 1] = Cell.Tower;
      grid[y + 1][x] = Cell.Tower;
      grid[y + 1][x + 1] = Cell.Tower;
      placed.push({ x, y, idx: i });
    }

    const segments = findRoute(grid);
    const flat = segments ? flattenRoute(segments) : [];
    const routeSet = new Set(flat.map((p) => `${p.x},${p.y}`));

    // Pick the position covering the most NEW route cells (matching Python select_keeper)
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < placed.length; i++) {
      const cells = coveredCells(placed[i].x, placed[i].y, routeSet);
      let newCount = 0;
      for (const c of cells) {
        if (!coveredByKeepers.has(c)) newCount++;
      }
      if (newCount > bestScore) {
        bestScore = newCount;
        bestIdx = i;
      }
    }
    keepers.push(placed.length > 0 ? placed[bestIdx].idx : 0);

    // Update coverage set with chosen keeper
    if (placed.length > 0) {
      const cells = coveredCells(placed[bestIdx].x, placed[bestIdx].y, routeSet);
      for (const c of cells) coveredByKeepers.add(c);
    }

    for (let i = 0; i < placed.length; i++) {
      if (i === bestIdx) continue;
      const { x, y } = placed[i];
      grid[y][x] = Cell.Rock;
      grid[y][x + 1] = Cell.Rock;
      grid[y + 1][x] = Cell.Rock;
      grid[y + 1][x + 1] = Cell.Rock;
    }
  }

  return keepers;
}
