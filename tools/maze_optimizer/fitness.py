import math

import numpy as np

from grid import (
    Cell,
    PLACE_MIN,
    PLACE_MAX_X,
    PLACE_MAX_Y,
    WAYPOINTS,
    copy_grid,
    can_place_2x2,
    is_adjacent_to_maze,
    place_tower,
    place_trap,
)

try:
    from pathfinding_cy import find_route, flatten_route, footprint_cells
    from pathfinding import build_cell_to_seg, reroute_affected
except ImportError:
    from pathfinding import (
        find_route, flatten_route, footprint_cells,
        build_cell_to_seg, reroute_affected,
    )

NUM_ROUNDS = 50
GEMS_PER_ROUND = 5

KEEPER_RANGE = 7.0
KEEPER_R2 = KEEPER_RANGE * KEEPER_RANGE

# Precomputed range offsets for set-based exposure
RANGE_OFFSETS = [
    (dx, dy)
    for dx in range(-7, 8)
    for dy in range(-7, 8)
    if dx * dx + dy * dy <= KEEPER_R2
]

# 0-indexed rounds that face air waves
AIR_ROUNDS: frozenset[int] = frozenset({7, 13, 18, 23, 31, 33, 37, 47})


def _build_air_route() -> frozenset[tuple[int, int]]:
    cells: set[tuple[int, int]] = set()
    for i in range(len(WAYPOINTS) - 1):
        ax, ay = WAYPOINTS[i].x, WAYPOINTS[i].y
        bx, by = WAYPOINTS[i + 1].x, WAYPOINTS[i + 1].y
        steps = max(abs(bx - ax), abs(by - ay))
        for s in range(steps + 1):
            t = s / steps if steps > 0 else 0
            cells.add((round(ax + (bx - ax) * t), round(ay + (by - ay) * t)))
    return frozenset(cells)


AIR_ROUTE: frozenset[tuple[int, int]] = _build_air_route()


def round_weight(r: int, power: float = 1.3) -> float:
    return 1.0 + (r / (NUM_ROUNDS - 1)) ** power


def exposure_at(x: int, y: int, route_set: set[tuple[int, int]]) -> int:
    cx, cy = x + 1, y + 1
    count = 0
    for dx, dy in RANGE_OFFSETS:
        if (cx + dx, cy + dy) in route_set:
            count += 1
    return count


def air_exposure_at(x: int, y: int) -> int:
    cx, cy = x + 1, y + 1
    count = 0
    for dx, dy in RANGE_OFFSETS:
        if (cx + dx, cy + dy) in AIR_ROUTE:
            count += 1
    return count


def exposure_at_flat(x: int, y: int, flat_route: list[tuple[int, int]]) -> int:
    cx, cy = x + 1, y + 1
    count = 0
    for fx, fy in flat_route:
        ddx = fx - cx
        ddy = fy - cy
        if ddx * ddx + ddy * ddy <= KEEPER_R2:
            count += 1
    return count


def select_keeper(
    placed: list[tuple[int, int]],
    route_set: set[tuple[int, int]],
    is_air_round: bool,
    existing_keepers: list[tuple[int, int]] | None = None,
    air_keeper_ratio: float = 2.0,
) -> int:
    """Pick the keeper that adds the most new route coverage beyond existing keepers."""
    covered_ground: set[tuple[int, int]] = set()
    covered_air: set[tuple[int, int]] = set()
    for kx, ky in (existing_keepers or []):
        cx, cy = kx + 1, ky + 1
        for dx, dy in RANGE_OFFSETS:
            cell = (cx + dx, cy + dy)
            if cell in route_set:
                covered_ground.add(cell)
            if is_air_round and cell in AIR_ROUTE:
                covered_air.add(cell)

    best_idx = 0
    best_score = -1.0
    for i, (px, py) in enumerate(placed):
        cx, cy = px + 1, py + 1
        new_ground = 0
        new_air = 0
        for dx, dy in RANGE_OFFSETS:
            cell = (cx + dx, cy + dy)
            if cell in route_set and cell not in covered_ground:
                new_ground += 1
            if is_air_round and cell in AIR_ROUTE and cell not in covered_air:
                new_air += 1
        score = float(new_ground)
        if is_air_round:
            score += air_keeper_ratio * new_air
        if score > best_score:
            best_score = score
            best_idx = i
    return best_idx


# Spiral offsets for repair_position, sorted by Manhattan distance
_SPIRAL: list[tuple[int, int, int]] = []
for _dy in range(-(PLACE_MAX_Y - PLACE_MIN), PLACE_MAX_Y - PLACE_MIN + 1):
    for _dx in range(-(PLACE_MAX_X - PLACE_MIN), PLACE_MAX_X - PLACE_MIN + 1):
        _SPIRAL.append((abs(_dx) + abs(_dy), _dx, _dy))
_SPIRAL.sort()


def repair_position(
    grid: np.ndarray,
    tx: int,
    ty: int,
    route_set: set[tuple[int, int]],
) -> tuple[int, int] | None:
    for _, dx, dy in _SPIRAL:
        x = tx + dx
        y = ty + dy
        if x < PLACE_MIN or x > PLACE_MAX_X or y < PLACE_MIN or y > PLACE_MAX_Y:
            continue
        if not can_place_2x2(grid, x, y):
            continue
        fc = footprint_cells(x, y)
        if fc & route_set:
            if find_route(grid, fc) is None:
                continue
        return (x, y)
    return None


def evaluate(
    chromosome: list[list[tuple[int, int]]],
    base_grid: np.ndarray,
    w_path: float = 1.0,
    w_coverage: float = 1.5,
    w_depth: float = 0.3,
    w_air: float = 3.0,
    air_keeper_ratio: float = 2.0,
    removals: list[list[tuple[int, int]]] | None = None,
) -> dict:
    grid = copy_grid(base_grid)
    repaired: list[list[tuple[int, int]]] = []
    total_exposure = 0
    total_air_exposure = 0
    invalid_count = 0
    all_keepers: list[tuple[int, int]] = []

    segments = find_route(grid)
    if segments is None:
        return {
            "fitness": -999999,
            "path_length": 0,
            "cumulative_path": 0,
            "exposure_total": 0,
            "air_exposure_total": 0,
            "weighted_coverage": 0.0,
            "weighted_depth": 0.0,
            "weighted_air": 0.0,
            "validity_penalty": -999999,
            "chromosome": chromosome,
        }
    flat_route = flatten_route(segments)
    route_set = set(flat_route)
    cell_seg = build_cell_to_seg(segments)

    cumulative_path = 0
    weighted_coverage = 0.0
    weighted_depth = 0.0
    weighted_air = 0.0

    for round_idx, positions in enumerate(chromosome):
        if removals and round_idx < len(removals):
            did_remove = False
            for rx, ry in removals[round_idx]:
                if grid[ry, rx] == Cell.Rock:
                    place_tower(grid, rx, ry, Cell.Grass)
                    did_remove = True
            if did_remove:
                segments = find_route(grid)
                if segments is None:
                    return {
                        "fitness": -999999,
                        "path_length": 0,
                        "cumulative_path": 0,
                        "exposure_total": 0,
                        "air_exposure_total": 0,
                        "weighted_coverage": 0.0,
                        "weighted_depth": 0.0,
                        "weighted_air": 0.0,
                        "validity_penalty": -999999,
                        "chromosome": chromosome,
                    }
                flat_route = flatten_route(segments)
                route_set = set(flat_route)
                cell_seg = build_cell_to_seg(segments)

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
                    invalid_count += 1
                    repaired_round.append((orig_x, orig_y))
                    continue
                x, y = result
                fc = footprint_cells(x, y)
                needs_reroute = bool(fc & route_set)

            place_tower(grid, x, y)
            placed.append((x, y))
            repaired_round.append((x, y))

            if needs_reroute:
                new_seg = reroute_affected(grid, segments, fc, cell_seg)
                if new_seg:
                    segments = new_seg
                    flat_route = flatten_route(segments)
                    route_set = set(flat_route)
                    cell_seg = build_cell_to_seg(segments)

        repaired.append(repaired_round)

        if placed:
            is_air = round_idx in AIR_ROUNDS
            keeper_idx = select_keeper(
                placed, route_set, is_air, all_keepers, air_keeper_ratio
            )
            all_keepers.append(placed[keeper_idx])

            covered: set[tuple[int, int]] = set()
            depth_map: dict[tuple[int, int], int] = {}
            for kx, ky in all_keepers:
                cx, cy = kx + 1, ky + 1
                for dx, dy in RANGE_OFFSETS:
                    cell = (cx + dx, cy + dy)
                    if cell in route_set:
                        covered.add(cell)
                        depth_map[cell] = depth_map.get(cell, 0) + 1

            w_r = round_weight(round_idx)
            weighted_coverage += len(covered) * w_r
            weighted_depth += sum(math.log(1 + c) for c in depth_map.values()) * w_r

            total_exposure += sum(exposure_at(kx, ky, route_set) for kx, ky in all_keepers)

            if is_air:
                round_air = sum(air_exposure_at(kx, ky) for kx, ky in all_keepers)
                total_air_exposure += round_air
                weighted_air += round_air * w_r

            for i, (px, py) in enumerate(placed):
                if i != keeper_idx:
                    place_tower(grid, px, py, Cell.Rock)

        cumulative_path += len(flat_route)

    path_length = len(flat_route)

    validity_penalty = -(100 * invalid_count + 10 * invalid_count * invalid_count) if invalid_count else 0

    fitness = (
        w_path * cumulative_path
        + w_coverage * weighted_coverage
        + w_depth * weighted_depth
        + w_air * weighted_air
        + validity_penalty
    )

    return {
        "fitness": fitness,
        "path_length": path_length,
        "cumulative_path": cumulative_path,
        "exposure_total": total_exposure,
        "air_exposure_total": total_air_exposure,
        "weighted_coverage": weighted_coverage,
        "weighted_depth": weighted_depth,
        "weighted_air": weighted_air,
        "validity_penalty": validity_penalty,
        "chromosome": repaired,
    }


def evaluate_with_traps(
    chromosome: list[list[tuple[int, int]]],
    trap_positions: list[tuple[int, int]],
    base_grid: np.ndarray,
    trap_weight: float = 5.0,
    w_path: float = 1.0,
    w_coverage: float = 1.5,
    w_depth: float = 0.3,
    w_air: float = 3.0,
    air_keeper_ratio: float = 2.0,
) -> dict:
    """Evaluate a maze layout that includes trap placements on the path.

    Traps are walkable and don't block pathing, so they can be placed directly
    on the route. Their fitness contribution is based on how many route tiles
    pass through their 2x2 footprint (more exposure = better trap placement).
    """
    grid = copy_grid(base_grid)

    # Place traps first (they don't affect routing)
    placed_traps: list[tuple[int, int]] = []
    for tx, ty in trap_positions:
        if can_place_trap_on_route(grid, tx, ty):
            place_trap(grid, tx, ty)
            placed_traps.append((tx, ty))

    # Run normal tower evaluation on the grid (traps are walkable, so routing works)
    result = evaluate(chromosome, grid, w_path, w_coverage, w_depth, w_air, air_keeper_ratio)

    # Score trap placements by route overlap
    if result["fitness"] <= -999999:
        return result

    final_segments = find_route(grid)
    if final_segments is None:
        return result

    flat_route = flatten_route(final_segments)
    route_set = set(flat_route)

    trap_exposure = 0
    for tx, ty in placed_traps:
        fc = footprint_cells(tx, ty)
        trap_exposure += len(fc & route_set)

    result["fitness"] += trap_weight * trap_exposure
    result["trap_exposure"] = trap_exposure
    result["trap_positions"] = placed_traps

    return result


def can_place_trap_on_route(grid: np.ndarray, x: int, y: int) -> bool:
    """Check if a trap can be placed at (x, y) — allows Grass, Path, or existing Trap cells."""
    if x < PLACE_MIN or x > PLACE_MAX_X or y < PLACE_MIN or y > PLACE_MAX_Y:
        return False
    block = grid[y:y + 2, x:x + 2]
    return bool(((block == Cell.Grass) | (block == Cell.Path) | (block == Cell.Trap)).all())
