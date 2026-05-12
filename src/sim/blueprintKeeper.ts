import { Cell, BASE } from '../data/map';
import { findRoute, flattenRoute } from '../systems/Pathfinding';

export interface Blueprint {
  rounds: [number, number][][];
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

export function computeKeeperIndices(blueprint: Blueprint): number[] {
  const grid: Cell[][] = BASE.grid.map((row) => row.slice());
  const keepers: number[] = [];

  for (const positions of blueprint.rounds) {
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

    let bestIdx = 0;
    let bestExp = -1;
    for (let i = 0; i < placed.length; i++) {
      const exp = exposureAt(placed[i].x, placed[i].y, routeSet);
      if (exp > bestExp) {
        bestExp = exp;
        bestIdx = i;
      }
    }
    keepers.push(placed.length > 0 ? placed[bestIdx].idx : 0);

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
