from grid import (
    Cell,
    PLACE_MIN,
    PLACE_MAX_X,
    PLACE_MAX_Y,
    copy_grid,
    can_place_2x2,
    is_adjacent_to_maze,
    place_tower,
)
from pathfinding import find_route, flatten_route, footprint_cells

NUM_ROUNDS = 50
GEMS_PER_ROUND = 5

# Average tower range: 3.5 coarse tiles * GRID_SCALE(2) = 7.0 fine tiles
KEEPER_RANGE = 7.0
KEEPER_R2 = KEEPER_RANGE * KEEPER_RANGE


def exposure_at(x: int, y: int, flat_route: list[tuple[int, int]]) -> int:
    cx, cy = x + 1, y + 1
    count = 0
    for fx, fy in flat_route:
        ddx = fx - cx
        ddy = fy - cy
        if ddx * ddx + ddy * ddy <= KEEPER_R2:
            count += 1
    return count


def repair_position(
    grid: list[list[int]],
    tx: int,
    ty: int,
    route_set: set[tuple[int, int]],
) -> tuple[int, int] | None:
    candidates: list[tuple[int, int, int, int]] = []
    for y in range(PLACE_MIN, PLACE_MAX_Y + 1):
        for x in range(PLACE_MIN, PLACE_MAX_X + 1):
            if not can_place_2x2(grid, x, y):
                continue
            dist = abs(x - tx) + abs(y - ty)
            adj = 0 if is_adjacent_to_maze(grid, x, y) else 1
            candidates.append((dist, adj, x, y))

    candidates.sort()

    for _, _, x, y in candidates:
        fc = footprint_cells(x, y)
        if fc & route_set:
            if find_route(grid, fc) is None:
                continue
        return (x, y)

    return None


def evaluate(
    chromosome: list[list[tuple[int, int]]],
    base_grid: list[list[int]],
) -> dict:
    grid = copy_grid(base_grid)
    repaired: list[list[tuple[int, int]]] = []
    total_exposure = 0
    validity_penalty = 0

    segments = find_route(grid)
    if segments is None:
        return {
            "fitness": -999999,
            "path_length": 0,
            "exposure_total": 0,
            "validity_penalty": -999999,
            "chromosome": chromosome,
        }
    flat_route = flatten_route(segments)
    route_set = set(flat_route)

    for positions in chromosome:
        placed: list[tuple[int, int]] = []
        repaired_round: list[tuple[int, int]] = []

        for orig_x, orig_y in positions:
            x, y = orig_x, orig_y
            valid = can_place_2x2(grid, x, y)
            needs_reroute = False

            if valid:
                fc = footprint_cells(x, y)
                if fc & route_set:
                    if find_route(grid, fc) is None:
                        valid = False
                    else:
                        needs_reroute = True

            if not valid:
                result = repair_position(grid, x, y, route_set)
                if result is None:
                    validity_penalty -= 1000
                    repaired_round.append((orig_x, orig_y))
                    continue
                x, y = result
                fc = footprint_cells(x, y)
                needs_reroute = bool(fc & route_set)

            place_tower(grid, x, y)
            placed.append((x, y))
            repaired_round.append((x, y))

            if needs_reroute:
                new_seg = find_route(grid)
                if new_seg:
                    flat_route = flatten_route(new_seg)
                    route_set = set(flat_route)

        repaired.append(repaired_round)

        if placed:
            best_idx = 0
            best_exp = -1
            for i, (px, py) in enumerate(placed):
                exp = exposure_at(px, py, flat_route)
                if exp > best_exp:
                    best_exp = exp
                    best_idx = i
            total_exposure += max(0, best_exp)

            for i, (px, py) in enumerate(placed):
                if i != best_idx:
                    place_tower(grid, px, py, Cell.Rock)

    final_segments = find_route(grid)
    path_length = len(flatten_route(final_segments)) if final_segments else 0

    fitness = path_length + 0.5 * total_exposure + validity_penalty

    return {
        "fitness": fitness,
        "path_length": path_length,
        "exposure_total": total_exposure,
        "validity_penalty": validity_penalty,
        "chromosome": repaired,
    }
