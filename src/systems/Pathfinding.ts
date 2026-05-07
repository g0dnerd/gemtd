/**
 * 4-directional A* on a tile grid.
 *
 * The grid is represented as a flat array of "blocked" booleans for speed.
 * We expose a high-level `findRoute` that walks the ordered waypoint list and
 * concatenates segments — this is what the build phase consults to decide
 * whether a placement disconnects the creep route.
 */

import { Cell, GRID_H, GRID_W, WAYPOINTS, Waypoint } from '../data/map';

export interface Point {
  x: number;
  y: number;
}

export type Blocked = (x: number, y: number) => boolean;

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Min-heap keyed by f-score. Small custom impl avoids dep weight.
 * Stores [f, idx] pairs; idx is a packed (y*GRID_W + x) tile index.
 */
class MinHeap {
  private heap: { f: number; idx: number }[] = [];
  push(f: number, idx: number): void {
    this.heap.push({ f, idx });
    this.bubbleUp(this.heap.length - 1);
  }
  pop(): { f: number; idx: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }
  get size(): number {
    return this.heap.length;
  }
  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].f <= this.heap[i].f) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }
  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && this.heap[l].f < this.heap[smallest].f) smallest = l;
      if (r < n && this.heap[r].f < this.heap[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/**
 * A* between two grid tiles.
 * @returns ordered list of points (inclusive of start and goal) or null if unreachable.
 */
export function aStar(
  start: Point,
  goal: Point,
  blocked: Blocked,
  bounds: { w: number; h: number } = { w: GRID_W, h: GRID_H },
): Point[] | null {
  const w = bounds.w;
  const h = bounds.h;
  if (start.x === goal.x && start.y === goal.y) return [{ ...start }];

  const startIdx = start.y * w + start.x;
  const goalIdx = goal.y * w + goal.x;

  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const open = new MinHeap();

  gScore.set(startIdx, 0);
  open.push(manhattan(start.x, start.y, goal.x, goal.y), startIdx);

  while (open.size > 0) {
    const top = open.pop()!;
    const idx = top.idx;
    if (idx === goalIdx) {
      return reconstruct(cameFrom, idx, w);
    }
    const cx = idx % w;
    const cy = (idx - cx) / w;
    const cg = gScore.get(idx)!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      // The goal tile itself may be "blocked" (e.g. a Path tile considered
      // walkable for creeps but flagged as path) — leave that to the caller's
      // `blocked` predicate.
      if (blocked(nx, ny)) continue;
      const nIdx = ny * w + nx;
      const tentative = cg + 1;
      const prev = gScore.get(nIdx);
      if (prev === undefined || tentative < prev) {
        cameFrom.set(nIdx, idx);
        gScore.set(nIdx, tentative);
        const f = tentative + manhattan(nx, ny, goal.x, goal.y);
        open.push(f, nIdx);
      }
    }
  }
  return null;
}

function reconstruct(cameFrom: Map<number, number>, endIdx: number, w: number): Point[] {
  const out: Point[] = [];
  let curr: number | undefined = endIdx;
  while (curr !== undefined) {
    const x = curr % w;
    const y = (curr - x) / w;
    out.push({ x, y });
    curr = cameFrom.get(curr);
  }
  return out.reverse();
}

/**
 * Build a `blocked` predicate from a grid + an optional set of
 * tentative-blocked tiles (used to test whether placing a tower
 * would disconnect the path).
 */
export function blockedFromGrid(grid: Cell[][], extra?: Set<string>): Blocked {
  return (x, y) => {
    if (extra?.has(`${x},${y}`)) return true;
    const c = grid[y][x];
    return c === Cell.Wall || c === Cell.Tower || c === Cell.Rock;
  };
}

/** Find a route through all waypoints; null if any segment is unreachable. */
export function findRoute(
  grid: Cell[][],
  extra?: Set<string>,
  waypoints: readonly Waypoint[] = WAYPOINTS,
): Point[][] | null {
  const blocked = blockedFromGrid(grid, extra);
  const segments: Point[][] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const seg = aStar(a, b, blocked);
    if (!seg) return null;
    segments.push(seg);
  }
  return segments;
}

/** Concatenate segments into a single ordered point list. */
export function flattenRoute(segments: Point[][]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i === 0) out.push(...seg);
    else out.push(...seg.slice(1));
  }
  return out;
}

/** Straight-line route through waypoints for air creeps (Bresenham-style). */
export function buildAirRoute(waypoints: readonly Waypoint[] = WAYPOINTS): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let s = (i === 0 ? 0 : 1); s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      out.push({
        x: Math.round(a.x + (b.x - a.x) * t),
        y: Math.round(a.y + (b.y - a.y) * t),
      });
    }
  }
  return out;
}
