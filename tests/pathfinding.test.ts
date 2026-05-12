import { describe, expect, it } from 'vitest';
import { aStar, blockedFromGrid, findRoute, flattenRoute } from '../src/systems/Pathfinding';
import { Cell, GRID_H, GRID_W, BASE, WAYPOINTS } from '../src/data/map';

function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => row.slice());
}

describe('A*', () => {
  it('finds straight-line path on empty grid', () => {
    const grid = makeOpenGrid();
    const blocked = blockedFromGrid(grid);
    const path = aStar({ x: 1, y: 1 }, { x: 5, y: 1 }, blocked);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 5, y: 1 });
    expect(path!.length).toBe(5);
  });

  it('routes around a wall', () => {
    const grid = makeOpenGrid();
    grid[1][3] = Cell.Tower;
    grid[2][3] = Cell.Tower;
    grid[3][3] = Cell.Tower;
    const blocked = blockedFromGrid(grid);
    const path = aStar({ x: 1, y: 1 }, { x: 5, y: 1 }, blocked);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(5); // forced to detour
  });

  it('returns null when fully blocked', () => {
    const grid = makeOpenGrid();
    for (let y = 0; y < GRID_H; y++) {
      grid[y][3] = Cell.Tower;
    }
    const blocked = blockedFromGrid(grid);
    const path = aStar({ x: 1, y: 1 }, { x: 5, y: 1 }, blocked);
    expect(path).toBeNull();
  });

  it('handles same start and goal', () => {
    const grid = makeOpenGrid();
    const blocked = blockedFromGrid(grid);
    const path = aStar({ x: 4, y: 4 }, { x: 4, y: 4 }, blocked);
    expect(path).toEqual([{ x: 4, y: 4 }]);
  });
});

describe('findRoute through canonical waypoints', () => {
  it('finds a route on the base map', () => {
    const route = findRoute(cloneGrid(BASE.grid));
    expect(route).not.toBeNull();
    expect(route!.length).toBe(WAYPOINTS.length - 1);
    const flat = flattenRoute(route!);
    expect(flat[0]).toEqual({ x: WAYPOINTS[0].x, y: WAYPOINTS[0].y });
    expect(flat[flat.length - 1]).toEqual({
      x: WAYPOINTS[WAYPOINTS.length - 1].x,
      y: WAYPOINTS[WAYPOINTS.length - 1].y,
    });
  });

  it('rejects placements that fully block any segment', () => {
    const grid = cloneGrid(BASE.grid);
    // Wall off the entire column between waypoints by simulating a tower line.
    const extra = new Set<number>();
    for (let y = 1; y < GRID_H - 1; y++) {
      extra.add(y * GRID_W + 10);
    }
    const route = findRoute(grid, extra);
    expect(route).toBeNull();
  });

  it('allows placements that lengthen but do not disconnect', () => {
    const grid = cloneGrid(BASE.grid);
    const extra = new Set<number>();
    extra.add(8 * GRID_W + 10);
    extra.add(8 * GRID_W + 11);
    const before = findRoute(grid)!;
    const after = findRoute(grid, extra)!;
    expect(after).not.toBeNull();
    const beforeLen = flattenRoute(before).length;
    const afterLen = flattenRoute(after).length;
    expect(afterLen).toBeGreaterThanOrEqual(beforeLen);
  });
});

function makeOpenGrid(): Cell[][] {
  const grid: Cell[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_W; x++) {
      row.push(Cell.Grass);
    }
    grid.push(row);
  }
  return grid;
}
