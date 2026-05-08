import heapq
from grid import GRID_W, GRID_H, Cell, WAYPOINTS, FOOTPRINT

DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _manhattan(ax: int, ay: int, bx: int, by: int) -> int:
    return abs(ax - bx) + abs(ay - by)


def a_star(
    start: tuple[int, int],
    goal: tuple[int, int],
    blocked,
    w: int = GRID_W,
    h: int = GRID_H,
) -> list[tuple[int, int]] | None:
    sx, sy = start
    gx, gy = goal
    if sx == gx and sy == gy:
        return [(sx, sy)]

    goal_idx = gy * w + gx
    start_idx = sy * w + sx

    g_score: dict[int, int] = {start_idx: 0}
    came_from: dict[int, int] = {}

    counter = 0
    heap: list[tuple[int, int, int]] = []
    heapq.heappush(heap, (_manhattan(sx, sy, gx, gy), counter, start_idx))

    while heap:
        f, _, idx = heapq.heappop(heap)
        if idx == goal_idx:
            return _reconstruct(came_from, idx, w)

        cx = idx % w
        cy = idx // w
        cg = g_score.get(idx)
        if cg is None or f - _manhattan(cx, cy, gx, gy) > cg:
            continue

        for dx, dy in DIRS:
            nx = cx + dx
            ny = cy + dy
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            if blocked(nx, ny):
                continue
            n_idx = ny * w + nx
            tentative = cg + 1
            prev = g_score.get(n_idx)
            if prev is None or tentative < prev:
                came_from[n_idx] = idx
                g_score[n_idx] = tentative
                counter += 1
                heapq.heappush(
                    heap,
                    (tentative + _manhattan(nx, ny, gx, gy), counter, n_idx),
                )

    return None


def _reconstruct(
    came_from: dict[int, int], end_idx: int, w: int
) -> list[tuple[int, int]]:
    path: list[tuple[int, int]] = []
    curr: int | None = end_idx
    while curr is not None:
        x = curr % w
        y = curr // w
        path.append((x, y))
        curr = came_from.get(curr)
    path.reverse()
    return path


def blocked_from_grid(grid: list[list[int]], extra: set[tuple[int, int]] | None = None):
    if extra:

        def _blocked(x: int, y: int) -> bool:
            if (x, y) in extra:
                return True
            c = grid[y][x]
            return c == Cell.Wall or c == Cell.Tower or c == Cell.Rock
    else:

        def _blocked(x: int, y: int) -> bool:
            c = grid[y][x]
            return c == Cell.Wall or c == Cell.Tower or c == Cell.Rock

    return _blocked


def find_route(
    grid: list[list[int]],
    extra: set[tuple[int, int]] | None = None,
    waypoints=None,
) -> list[list[tuple[int, int]]] | None:
    if waypoints is None:
        waypoints = WAYPOINTS
    blocked = blocked_from_grid(grid, extra)
    segments: list[list[tuple[int, int]]] = []
    for i in range(len(waypoints) - 1):
        a = waypoints[i]
        b = waypoints[i + 1]
        seg = a_star((a.x, a.y), (b.x, b.y), blocked)
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
