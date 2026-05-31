import copy
import json
import math
import random
import time
from dataclasses import dataclass, field
from multiprocessing import Pool

import numpy as np

from grid import (
    Cell,
    PLACE_MIN,
    PLACE_MAX_X,
    PLACE_MAX_Y,
    build_base_layout,
    can_place_2x2,
    copy_grid,
    get_candidates,
    is_adjacent_to_maze,
    place_tower,
)

try:
    from pathfinding_cy import find_route, flatten_route, footprint_cells
    from pathfinding import build_cell_to_seg, reroute_affected
except ImportError:
    from pathfinding import (
        find_route, flatten_route, footprint_cells,
        build_cell_to_seg, reroute_affected,
    )

from fitness import (
    NUM_ROUNDS,
    GEMS_PER_ROUND,
    KEEPER_R2,
    RANGE_OFFSETS,
    AIR_ROUNDS,
    AIR_ROUTE,
    round_weight,
    air_exposure_at,
    select_keeper,
    evaluate,
)


@dataclass
class BeamState:
    grid: np.ndarray
    segments: list[list[tuple[int, int]]]
    cell_seg: dict[tuple[int, int], set[int]]
    flat_route: list[tuple[int, int]]
    route_set: set[tuple[int, int]]
    keepers: list[tuple[int, int]]
    coverage_map: dict[tuple[int, int], int]
    chromosome: list[list[tuple[int, int]]]
    round_idx: int

    cumulative_path: int = 0
    weighted_coverage: float = 0.0
    weighted_depth: float = 0.0
    weighted_air: float = 0.0
    invalid_count: int = 0


def clone_state(s: BeamState) -> BeamState:
    return BeamState(
        grid=s.grid.copy(),
        segments=[list(seg) for seg in s.segments],
        cell_seg={k: set(v) for k, v in s.cell_seg.items()},
        flat_route=list(s.flat_route),
        route_set=set(s.route_set),
        keepers=list(s.keepers),
        coverage_map=dict(s.coverage_map),
        chromosome=[list(r) for r in s.chromosome],
        round_idx=s.round_idx,
        cumulative_path=s.cumulative_path,
        weighted_coverage=s.weighted_coverage,
        weighted_depth=s.weighted_depth,
        weighted_air=s.weighted_air,
        invalid_count=s.invalid_count,
    )


def make_initial_state(base_grid: np.ndarray) -> BeamState:
    grid = copy_grid(base_grid)
    segments = find_route(grid)
    assert segments is not None
    flat_route = flatten_route(segments)
    return BeamState(
        grid=grid,
        segments=segments,
        cell_seg=build_cell_to_seg(segments),
        flat_route=flat_route,
        route_set=set(flat_route),
        keepers=[],
        coverage_map={},
        chromosome=[],
        round_idx=0,
        cumulative_path=0,
        weighted_coverage=0.0,
        weighted_depth=0.0,
        weighted_air=0.0,
        invalid_count=0,
    )


def construct_round(
    state: BeamState,
    rng: random.Random,
    max_candidates: int,
    w_unique: float = 1.0,
) -> tuple[
    list[tuple[int, int]],
    np.ndarray,
    list[list[tuple[int, int]]],
    list[tuple[int, int]],
    set[tuple[int, int]],
    dict[tuple[int, int], set[int]],
]:
    grid = state.grid.copy()
    segments = [list(seg) for seg in state.segments]
    flat_route = list(state.flat_route)
    route_set = set(state.route_set)
    cell_seg = {k: set(v) for k, v in state.cell_seg.items()}
    is_air = state.round_idx in AIR_ROUNDS

    noise = 0.3
    w_exp = 0.5 + rng.uniform(-noise, noise)
    w_maze = 3.0 + rng.uniform(-noise, noise)
    w_air_local = 1.0 + rng.uniform(-noise, noise)
    w_uniq = w_unique * (1.0 + rng.uniform(-noise, noise))

    positions: list[tuple[int, int]] = []

    for _ in range(GEMS_PER_ROUND):
        candidates = get_candidates(grid, adjacent_only=True)
        if not candidates:
            candidates = get_candidates(grid, adjacent_only=False)
        if not candidates:
            break
        if len(candidates) > max_candidates:
            candidates = rng.sample(candidates, max_candidates)

        route_len = len(flat_route)
        best_pos: tuple[int, int] | None = None
        best_score = -float("inf")

        for cx, cy in candidates:
            fc = footprint_cells(cx, cy)
            on_route = bool(fc & route_set)

            if on_route:
                try_seg = find_route(grid, fc)
                if try_seg is None:
                    continue
                flat_try = flatten_route(try_seg)
            else:
                flat_try = flat_route

            tcx, tcy = cx + 1, cy + 1
            exp = 0
            unique = 0
            for fx, fy in flat_try:
                ddx = fx - tcx
                ddy = fy - tcy
                if ddx * ddx + ddy * ddy <= KEEPER_R2:
                    exp += 1
                    if (fx, fy) not in state.coverage_map:
                        unique += 1

            maze_gain = len(flat_try) - route_len
            score = maze_gain * w_maze + exp * w_exp + unique * w_uniq
            if is_air:
                score += air_exposure_at(cx, cy) * w_air_local

            if score > best_score:
                best_score = score
                best_pos = (cx, cy)

        if best_pos is None:
            break

        x, y = best_pos
        place_tower(grid, x, y)
        positions.append((x, y))

        fc = footprint_cells(x, y)
        if fc & route_set:
            new_seg = reroute_affected(grid, segments, fc, cell_seg)
            if new_seg:
                segments = new_seg
                flat_route = flatten_route(segments)
                route_set = set(flat_route)
                cell_seg = build_cell_to_seg(segments)

    while len(positions) < GEMS_PER_ROUND:
        positions.append(positions[-1] if positions else (PLACE_MIN, PLACE_MIN))

    return positions, grid, segments, flat_route, route_set, cell_seg


def score_keeper_candidates(
    positions: list[tuple[int, int]],
    route_set: set[tuple[int, int]],
    coverage_map: dict[tuple[int, int], int],
    keepers: list[tuple[int, int]],
    is_air: bool,
    air_keeper_ratio: float,
    keeper_choices: int,
) -> list[int]:
    scores: list[tuple[float, int]] = []
    for i, (px, py) in enumerate(positions):
        cx, cy = px + 1, py + 1
        new_ground = 0
        new_air = 0
        for dx, dy in RANGE_OFFSETS:
            cell = (cx + dx, cy + dy)
            if cell in route_set and cell not in coverage_map:
                new_ground += 1
            if is_air and cell in AIR_ROUTE and cell not in coverage_map:
                new_air += 1
        score = float(new_ground)
        if is_air:
            score += air_keeper_ratio * new_air
        scores.append((score, i))

    scores.sort(reverse=True)

    default_idx = select_keeper(positions, route_set, is_air, keepers, air_keeper_ratio)

    chosen: list[int] = []
    seen: set[int] = set()
    for _, idx in scores:
        if idx not in seen:
            chosen.append(idx)
            seen.add(idx)
        if len(chosen) >= keeper_choices:
            break
    if default_idx not in seen:
        if len(chosen) >= keeper_choices:
            chosen[-1] = default_idx
        else:
            chosen.append(default_idx)

    return chosen


def apply_keeper(
    state: BeamState,
    positions: list[tuple[int, int]],
    keeper_idx: int,
    grid: np.ndarray,
    segments: list[list[tuple[int, int]]],
    flat_route: list[tuple[int, int]],
    route_set: set[tuple[int, int]],
    cell_seg: dict[tuple[int, int], set[int]],
    w_air_weight: float,
    air_keeper_ratio: float,
) -> BeamState:
    child = BeamState(
        grid=grid.copy(),
        segments=[list(seg) for seg in segments],
        cell_seg={k: set(v) for k, v in cell_seg.items()},
        flat_route=list(flat_route),
        route_set=set(route_set),
        keepers=list(state.keepers),
        coverage_map=dict(state.coverage_map),
        chromosome=[list(r) for r in state.chromosome],
        round_idx=state.round_idx + 1,
        cumulative_path=state.cumulative_path,
        weighted_coverage=state.weighted_coverage,
        weighted_depth=state.weighted_depth,
        weighted_air=state.weighted_air,
        invalid_count=state.invalid_count,
    )

    kx, ky = positions[keeper_idx]
    child.keepers.append((kx, ky))
    child.chromosome.append(list(positions))

    # Update coverage_map incrementally
    cx, cy = kx + 1, ky + 1
    for dx, dy in RANGE_OFFSETS:
        cell = (cx + dx, cy + dy)
        child.coverage_map[cell] = child.coverage_map.get(cell, 0) + 1

    # Convert non-keepers to rocks
    for i, (px, py) in enumerate(positions):
        if i != keeper_idx:
            place_tower(child.grid, px, py, Cell.Rock)

    # Compute per-round score components
    child.cumulative_path += len(flat_route)

    route_coverage = {c: v for c, v in child.coverage_map.items() if c in route_set}
    w_r = round_weight(state.round_idx)
    child.weighted_coverage += len(route_coverage) * w_r
    child.weighted_depth += sum(math.log(1 + c) for c in route_coverage.values()) * w_r

    is_air = state.round_idx in AIR_ROUNDS
    if is_air:
        round_air = sum(air_exposure_at(kx, ky) for kx, ky in child.keepers)
        child.weighted_air += round_air * w_r

    return child


def expand_one_state(
    state: BeamState,
    rng: random.Random,
    variants_per_state: int,
    keeper_choices: int,
    max_candidates: int,
    air_keeper_ratio: float,
    w_air_weight: float,
) -> list[BeamState]:
    children: list[BeamState] = []
    is_air = state.round_idx in AIR_ROUNDS

    for _ in range(variants_per_state):
        positions, grid, segments, flat_route, route_set, cell_seg = construct_round(
            state, rng, max_candidates
        )

        keeper_indices = score_keeper_candidates(
            positions, route_set, state.coverage_map,
            state.keepers, is_air, air_keeper_ratio, keeper_choices,
        )

        for ki in keeper_indices:
            child = apply_keeper(
                state, positions, ki,
                grid, segments, flat_route, route_set, cell_seg,
                w_air_weight, air_keeper_ratio,
            )
            children.append(child)

    return children


def partial_score(
    state: BeamState,
    w_path: float,
    w_coverage: float,
    w_depth: float,
    w_air: float,
) -> float:
    actual = (
        w_path * state.cumulative_path
        + w_coverage * state.weighted_coverage
        + w_depth * state.weighted_depth
        + w_air * state.weighted_air
    )

    remaining = NUM_ROUNDS - state.round_idx
    future_path = w_path * len(state.flat_route) * remaining

    if state.round_idx > 0:
        weight_sum = sum(round_weight(r) for r in range(state.round_idx))
        avg_cov = state.weighted_coverage / weight_sum if weight_sum > 0 else 0
        future_weight = sum(round_weight(r) for r in range(state.round_idx, NUM_ROUNDS))
        future_cov = w_coverage * avg_cov * future_weight * 0.8
    else:
        future_cov = 0.0

    return actual + future_path + future_cov


def select_beam(
    candidates: list[BeamState],
    beam_width: int,
    w_path: float,
    w_coverage: float,
    w_depth: float,
    w_air: float,
) -> list[BeamState]:
    candidates.sort(
        key=lambda s: partial_score(s, w_path, w_coverage, w_depth, w_air),
        reverse=True,
    )
    selected: list[BeamState] = []
    seen: set[tuple] = set()
    for s in candidates:
        key = (
            tuple(tuple(r) for r in s.chromosome[-3:])
            if len(s.chromosome) >= 3
            else tuple(tuple(r) for r in s.chromosome),
            len(s.flat_route),
        )
        if key in seen:
            continue
        seen.add(key)
        selected.append(s)
        if len(selected) >= beam_width:
            break
    return selected


_worker_params = None


def _init_beam_worker(
    base_grid_bytes, grid_shape, grid_dtype,
    variants, keeper_choices, max_candidates,
    air_keeper_ratio, w_air,
):
    global _worker_params
    base_grid = np.frombuffer(base_grid_bytes, dtype=grid_dtype).reshape(grid_shape).copy()
    _worker_params = (base_grid, variants, keeper_choices, max_candidates, air_keeper_ratio, w_air)


def _expand_wrapper(args):
    state, seed = args
    rng = random.Random(seed)
    _, variants, keeper_choices, max_candidates, air_keeper_ratio, w_air = _worker_params
    return expand_one_state(
        state, rng, variants, keeper_choices, max_candidates,
        air_keeper_ratio, w_air,
    )


def run_beam_search(
    base_grid: np.ndarray | None = None,
    beam_width: int = 100,
    variants_per_state: int = 6,
    keeper_choices: int = 2,
    max_candidates: int = 50,
    seed: int = 42,
    w_path: float = 1.0,
    w_coverage: float = 1.5,
    w_depth: float = 0.3,
    w_air: float = 3.0,
    air_keeper_ratio: float = 2.0,
    cores: int | None = None,
    checkpoint_path: str | None = None,
) -> dict:
    if base_grid is None:
        base_grid = build_base_layout()

    rng = random.Random(seed)
    beam = [make_initial_state(base_grid)]

    print(f"Beam search: width={beam_width}, variants={variants_per_state}, "
          f"keeper_choices={keeper_choices}, candidates={max_candidates}, "
          f"cores={cores}")
    print(f"Weights: path={w_path}, coverage={w_coverage}, depth={w_depth}, air={w_air}")

    total_start = time.time()

    for round_idx in range(NUM_ROUNDS):
        t0 = time.time()

        if cores == 1 or len(beam) <= 2:
            all_children: list[BeamState] = []
            for state in beam:
                children = expand_one_state(
                    state, random.Random(rng.randint(0, 2**31)),
                    variants_per_state, keeper_choices, max_candidates,
                    air_keeper_ratio, w_air,
                )
                all_children.extend(children)
        else:
            args = [(state, rng.randint(0, 2**31)) for state in beam]
            with Pool(
                cores,
                initializer=_init_beam_worker,
                initargs=(
                    base_grid.tobytes(), base_grid.shape, base_grid.dtype,
                    variants_per_state, keeper_choices, max_candidates,
                    air_keeper_ratio, w_air,
                ),
            ) as pool:
                results = pool.map(_expand_wrapper, args)
            all_children = [child for batch in results for child in batch]

        beam = select_beam(all_children, beam_width, w_path, w_coverage, w_depth, w_air)

        elapsed = time.time() - t0
        best = beam[0]
        best_score = partial_score(best, w_path, w_coverage, w_depth, w_air)

        if (round_idx + 1) % 5 == 0 or round_idx == 0:
            print(
                f"Round {round_idx + 1}/{NUM_ROUNDS}: "
                f"beam={len(beam)}, children={len(all_children)}, "
                f"path={len(best.flat_route)}, keepers={len(best.keepers)}, "
                f"score={best_score:.0f} ({elapsed:.1f}s)"
            )

        if checkpoint_path and (round_idx + 1) % 10 == 0:
            _write_beam_checkpoint(best, checkpoint_path, base_grid, w_path, w_coverage, w_depth, w_air)

    total_elapsed = time.time() - total_start
    print(f"\nBeam search complete in {total_elapsed:.1f}s")

    best = beam[0]
    result = evaluate(best.chromosome, base_grid, w_path, w_coverage, w_depth, w_air, air_keeper_ratio)

    print(f"  Fitness:           {result['fitness']:.1f}")
    print(f"  Path length:       {result['path_length']}")
    print(f"  Cumulative path:   {result['cumulative_path']}")
    print(f"  Weighted coverage: {result['weighted_coverage']:.1f}")
    print(f"  Weighted depth:    {result['weighted_depth']:.1f}")
    print(f"  Weighted air:      {result['weighted_air']:.1f}")
    print(f"  Ground exposure:   {result['exposure_total']}")
    print(f"  Air exposure:      {result['air_exposure_total']}")

    return result


def _write_beam_checkpoint(
    state: BeamState,
    path: str,
    base_grid: np.ndarray,
    w_path: float,
    w_coverage: float,
    w_depth: float,
    w_air: float,
) -> None:
    result = evaluate(state.chromosome, base_grid, w_path, w_coverage, w_depth, w_air)
    output = {
        "fitness": result["fitness"],
        "path_length": result["path_length"],
        "cumulative_path": result["cumulative_path"],
        "exposure_total": result["exposure_total"],
        "air_exposure_total": result["air_exposure_total"],
        "weighted_coverage": result["weighted_coverage"],
        "weighted_depth": result["weighted_depth"],
        "weighted_air": result["weighted_air"],
        "rounds": result["chromosome"],
    }
    with open(path, "w") as f:
        json.dump(output, f, indent=2)
