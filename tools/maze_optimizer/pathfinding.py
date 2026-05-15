import heapq

import numpy as np

from grid import GRID_W, GRID_H, Cell, WAYPOINTS, FOOTPRINT

DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _manhattan(ax: int, ay: int, bx: int, by: int) -> int:
    return abs(ax - bx) + abs(ay - by)


def a_star(
    start: tuple[int, int],
    goal: tuple[int, int],
    grid: np.ndarray,
    extra: set[tuple[int, int]] | None = None,
) -> list[tuple[int, int]] | None:
    sx, sy = start
    gx, gy = goal
    if sx == gx and sy == gy:
        return [(sx, sy)]

    goal_idx = gy * GRID_W + gx
    start_idx = sy * GRID_W + sx

    g_score: dict[int, int] = {start_idx: 0}
    came_from: dict[int, int] = {}

    counter = 0
    heap: list[tuple[int, int, int]] = []
    heapq.heappush(heap, (_manhattan(sx, sy, gx, gy), counter, start_idx))

    has_extra = extra is not None and len(extra) > 0

    while heap:
        f, _, idx = heapq.heappop(heap)
        if idx == goal_idx:
            return _reconstruct(came_from, idx)

        cx = idx % GRID_W
        cy = idx // GRID_W
        cg = g_score.get(idx)
        if cg is None or f - _manhattan(cx, cy, gx, gy) > cg:
            continue

        for dx, dy in DIRS:
            nx = cx + dx
            ny = cy + dy
            if nx < 0 or ny < 0 or nx >= GRID_W or ny >= GRID_H:
                continue
            if has_extra and (nx, ny) in extra:
                continue
            c = grid[ny, nx]
            if c == Cell.Wall or c == Cell.Tower or c == Cell.Rock:
                continue
            n_idx = ny * GRID_W + nx
            tentative = cg + 1
            prev = g_score.get(n_idx)
            if prev is not None and tentative >= prev:
                continue
            came_from[n_idx] = idx
            g_score[n_idx] = tentative
            counter += 1
            heapq.heappush(
                heap,
                (tentative + _manhattan(nx, ny, gx, gy), counter, n_idx),
            )

    return None


def _reconstruct(came_from: dict[int, int], end_idx: int) -> list[tuple[int, int]]:
    path: list[tuple[int, int]] = []
    curr: int | None = end_idx
    while curr is not None:
        path.append((curr % GRID_W, curr // GRID_W))
        curr = came_from.get(curr)
    path.reverse()
    return path


def find_route(
    grid: np.ndarray,
    extra: set[tuple[int, int]] | None = None,
    waypoints=None,
) -> list[list[tuple[int, int]]] | None:
    if waypoints is None:
        waypoints = WAYPOINTS
    segments: list[list[tuple[int, int]]] = []
    for i in range(len(waypoints) - 1):
        a = waypoints[i]
        b = waypoints[i + 1]
        seg = a_star((a.x, a.y), (b.x, b.y), grid, extra)
        if seg is None:
            return None
        segments.append(seg)
    return segments


def flatten_route(segments: list[list[tuple[int, int]]]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for i, seg in enumerate(segments):
        if i == 0:
            out.extend(seg)
        else:
            out.extend(seg[1:])
    return out


def footprint_cells(x: int, y: int) -> set[tuple[int, int]]:
    return {(x + dx, y + dy) for dx, dy in FOOTPRINT}


try:
    from pathfinding_cy import a_star as _fast_a_star
except ImportError:
    _fast_a_star = a_star


def build_cell_to_seg(
    segments: list[list[tuple[int, int]]],
) -> dict[tuple[int, int], set[int]]:
    mapping: dict[tuple[int, int], set[int]] = {}
    for seg_idx, seg in enumerate(segments):
        for cell in seg:
            if cell in mapping:
                mapping[cell].add(seg_idx)
            else:
                mapping[cell] = {seg_idx}
    return mapping


def reroute_affected(
    grid: np.ndarray,
    segments: list[list[tuple[int, int]]],
    affected_cells: set[tuple[int, int]],
    cell_to_seg: dict[tuple[int, int], set[int]],
    extra: set[tuple[int, int]] | None = None,
    waypoints=None,
) -> list[list[tuple[int, int]]] | None:
    if waypoints is None:
        waypoints = WAYPOINTS
    dirty: set[int] = set()
    for cell in affected_cells:
        s = cell_to_seg.get(cell)
        if s:
            dirty.update(s)
    if not dirty:
        return segments
    new_segments = list(segments)
    for seg_idx in dirty:
        a = waypoints[seg_idx]
        b = waypoints[seg_idx + 1]
        new_seg = _fast_a_star((a[0], a[1]), (b[0], b[1]), grid, extra)
        if new_seg is None:
            return None
        new_segments[seg_idx] = new_seg
    return new_segments
