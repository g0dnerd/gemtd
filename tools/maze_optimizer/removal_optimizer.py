"""Greedy rock-removal post-processor for maze blueprints.

Operates on a completed blueprint: replays round-by-round, identifies rocks
whose positions would be more valuable as keeper towers, and iteratively
removes rocks and re-places towers for net fitness improvement.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from grid import Cell, copy_grid, can_place_2x2, place_tower
from fitness import (
    NUM_ROUNDS,
    RANGE_OFFSETS,
    AIR_ROUNDS,
    round_weight,
    exposure_at,
    air_exposure_at,
    select_keeper,
    repair_position,
)

try:
    from pathfinding_cy import find_route, flatten_route, footprint_cells

    from pathfinding import build_cell_to_seg, reroute_affected
except ImportError:
    from pathfinding import (
        find_route,
        flatten_route,
        footprint_cells,
        build_cell_to_seg,
        reroute_affected,
    )


@dataclass
class RoundSnapshot:
    """State captured after completing one round."""

    grid: np.ndarray
    segments: list[list[tuple[int, int]]]
    route_set: set[tuple[int, int]]
    keepers: list[tuple[int, int]]
    cumulative_path: int
    weighted_coverage: float
    weighted_depth: float
    weighted_air: float


@dataclass
class RockRecord:
    """A non-keeper placement that became a rock."""

    x: int
    y: int
    round_placed: int


# Offsets to generate candidate 2x2 positions overlapping a freed footprint
_OVERLAP_OFFSETS = [
    (0, 0),
    (-1, 0),
    (0, -1),
    (-1, -1),
    (1, 0),
    (0, 1),
    (1, 1),
    (1, -1),
    (-1, 1),
]


def _compute_round_metrics(
    round_idx: int,
    all_keepers: list[tuple[int, int]],
    route_set: set[tuple[int, int]],
) -> tuple[float, float, float]:
    """Weighted coverage, depth, and air contribution for one round."""
    covered: set[tuple[int, int]] = set()
    depth_map: dict[tuple[int, int], int] = {}
    for kx, ky in all_keepers:
        cx, cy = kx + 1, ky + 1
        for dx, dy in RANGE_OFFSETS:
            cell = (cx + dx, cy + dy)
            if cell in route_set:
                covered.add(cell)
                depth_map[cell] = depth_map.get(cell, 0) + 1
    w = round_weight(round_idx)
    w_cov = len(covered) * w
    w_dep = sum(math.log(1 + v) for v in depth_map.values()) * w
    w_air = 0.0
    if round_idx in AIR_ROUNDS:
        w_air = sum(air_exposure_at(kx, ky) for kx, ky in all_keepers) * w
    return w_cov, w_dep, w_air


def replay_rounds(
    chromosome: list[list[tuple[int, int]]],
    removals: list[list[tuple[int, int]]],
    base_grid: np.ndarray,
    air_keeper_ratio: float,
    start_round: int = 0,
    init_grid: np.ndarray | None = None,
    init_segments: list[list[tuple[int, int]]] | None = None,
    init_keepers: list[tuple[int, int]] | None = None,
    init_cum_path: int = 0,
    init_w_cov: float = 0.0,
    init_w_dep: float = 0.0,
    init_w_air: float = 0.0,
    snapshots_out: list[RoundSnapshot] | None = None,
    rocks_out: list[RockRecord] | None = None,
) -> tuple[int, float, float, float]:
    """Replay rounds [start_round, NUM_ROUNDS).

    Returns (cumulative_path, weighted_coverage, weighted_depth, weighted_air).
    Returns (-1, 0, 0, 0) on routing failure.
    """
    grid = init_grid if init_grid is not None else copy_grid(base_grid)

    if init_segments is not None:
        segments = init_segments
    else:
        segments = find_route(grid)
        if segments is None:
            return (-1, 0.0, 0.0, 0.0)

    flat_route = flatten_route(segments)
    route_set = set(flat_route)
    cell_seg = build_cell_to_seg(segments)
    all_keepers = list(init_keepers or [])

    cumulative_path = init_cum_path
    weighted_coverage = init_w_cov
    weighted_depth = init_w_dep
    weighted_air = init_w_air

    for round_idx in range(start_round, NUM_ROUNDS):
        # Apply removals before placements
        round_removals = removals[round_idx] if round_idx < len(removals) else []
        did_remove = False
        for rx, ry in round_removals:
            if grid[ry, rx] == Cell.Rock:
                place_tower(grid, rx, ry, Cell.Grass)
                did_remove = True
                if rocks_out is not None:
                    rocks_out[:] = [
                        r for r in rocks_out if not (r.x == rx and r.y == ry)
                    ]
        if did_remove:
            segments = find_route(grid)
            if segments is None:
                return (-1, 0.0, 0.0, 0.0)
            flat_route = flatten_route(segments)
            route_set = set(flat_route)
            cell_seg = build_cell_to_seg(segments)

        # Place towers
        positions = chromosome[round_idx] if round_idx < len(chromosome) else []
        placed: list[tuple[int, int]] = []

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
                    continue
                x, y = result
                fc = footprint_cells(x, y)
                needs_reroute = bool(fc & route_set)

            place_tower(grid, x, y)
            placed.append((x, y))

            if needs_reroute:
                new_seg = reroute_affected(grid, segments, fc, cell_seg)
                if new_seg:
                    segments = new_seg
                    flat_route = flatten_route(segments)
                    route_set = set(flat_route)
                    cell_seg = build_cell_to_seg(segments)

        # Keeper selection + convert non-keepers to rocks
        if placed:
            is_air = round_idx in AIR_ROUNDS
            keeper_idx = select_keeper(
                placed, route_set, is_air, all_keepers, air_keeper_ratio
            )
            all_keepers.append(placed[keeper_idx])

            rc, rd, ra = _compute_round_metrics(round_idx, all_keepers, route_set)
            weighted_coverage += rc
            weighted_depth += rd
            weighted_air += ra

            for i, (px, py) in enumerate(placed):
                if i != keeper_idx:
                    place_tower(grid, px, py, Cell.Rock)
                    if rocks_out is not None:
                        rocks_out.append(RockRecord(px, py, round_idx))

        cumulative_path += len(flat_route)

        if snapshots_out is not None:
            snap = RoundSnapshot(
                grid=copy_grid(grid),
                segments=[list(s) for s in segments],
                route_set=set(route_set),
                keepers=list(all_keepers),
                cumulative_path=cumulative_path,
                weighted_coverage=weighted_coverage,
                weighted_depth=weighted_depth,
                weighted_air=weighted_air,
            )
            if round_idx < len(snapshots_out):
                snapshots_out[round_idx] = snap
            else:
                snapshots_out.append(snap)

    return (cumulative_path, weighted_coverage, weighted_depth, weighted_air)


class RemovalOptimizer:
    """Greedily removes rocks and re-places towers for net fitness gain."""

    def __init__(
        self,
        chromosome: list[list[tuple[int, int]]],
        base_grid: np.ndarray,
        *,
        w_path: float = 1.0,
        w_coverage: float = 1.5,
        w_depth: float = 0.3,
        w_air: float = 3.0,
        air_keeper_ratio: float = 2.0,
        top_k: int = 50,
        max_iterations: int = 0,
    ):
        self.chromosome = [list(r) for r in chromosome]
        self.base_grid = base_grid
        self.w_path = w_path
        self.w_coverage = w_coverage
        self.w_depth = w_depth
        self.w_air = w_air
        self.air_keeper_ratio = air_keeper_ratio
        self.top_k = top_k
        self.max_iterations = max_iterations

        self.snapshots: list[RoundSnapshot] = []
        self.rocks: list[RockRecord] = []
        self.removals: list[list[tuple[int, int]]] = [[] for _ in range(NUM_ROUNDS)]
        self.baseline_fitness = 0.0

    def _fitness(self, cp: int, wc: float, wd: float, wa: float) -> float:
        return self.w_path * cp + self.w_coverage * wc + self.w_depth * wd + self.w_air * wa

    def _build_baseline(self) -> None:
        """Full replay from scratch, storing all snapshots and rocks."""
        self.snapshots.clear()
        self.rocks.clear()
        cp, wc, wd, wa = replay_rounds(
            self.chromosome,
            self.removals,
            self.base_grid,
            self.air_keeper_ratio,
            snapshots_out=self.snapshots,
            rocks_out=self.rocks,
        )
        self.baseline_fitness = self._fitness(cp, wc, wd, wa)

    def _rebuild_from(self, start_round: int) -> None:
        """Re-replay from start_round onward, rebuilding snapshots and rocks."""
        self.snapshots = self.snapshots[:start_round]
        self.rocks = [r for r in self.rocks if r.round_placed < start_round]

        if start_round > 0:
            prev = self.snapshots[start_round - 1]
            cp, wc, wd, wa = replay_rounds(
                self.chromosome,
                self.removals,
                self.base_grid,
                self.air_keeper_ratio,
                start_round=start_round,
                init_grid=copy_grid(prev.grid),
                init_segments=[list(s) for s in prev.segments],
                init_keepers=list(prev.keepers),
                init_cum_path=prev.cumulative_path,
                init_w_cov=prev.weighted_coverage,
                init_w_dep=prev.weighted_depth,
                init_w_air=prev.weighted_air,
                snapshots_out=self.snapshots,
                rocks_out=self.rocks,
            )
        else:
            cp, wc, wd, wa = replay_rounds(
                self.chromosome,
                self.removals,
                self.base_grid,
                self.air_keeper_ratio,
                snapshots_out=self.snapshots,
                rocks_out=self.rocks,
            )
        self.baseline_fitness = self._fitness(cp, wc, wd, wa)

    def _prefilter(self) -> list[tuple[RockRecord, int, float]]:
        """Score all (rock, target_round) pairs by exposure potential."""
        candidates: list[tuple[RockRecord, int, float]] = []
        for rock in self.rocks:
            for r in range(rock.round_placed + 1, NUM_ROUNDS):
                exp = exposure_at(rock.x, rock.y, self.snapshots[r].route_set)
                if exp > 0:
                    candidates.append((rock, r, float(exp)))
        candidates.sort(key=lambda t: t[2], reverse=True)
        return candidates

    def _candidate_positions(
        self, rx: int, ry: int, grid: np.ndarray
    ) -> list[tuple[int, int]]:
        """Valid 2x2 footprints overlapping the freed rock area."""
        seen: set[tuple[int, int]] = set()
        result: list[tuple[int, int]] = []
        for dx, dy in _OVERLAP_OFFSETS:
            cx, cy = rx + dx, ry + dy
            if (cx, cy) not in seen:
                seen.add((cx, cy))
                if can_place_2x2(grid, cx, cy):
                    result.append((cx, cy))
        return result

    def _evaluate_removal(
        self, rock: RockRecord, target_round: int
    ) -> tuple[float, tuple[int, int] | None, int]:
        """Evaluate best (fitness_delta, candidate_pos, swap_idx) for this removal."""
        prev = self.snapshots[target_round - 1]

        head_fitness = self._fitness(
            prev.cumulative_path, prev.weighted_coverage,
            prev.weighted_depth, prev.weighted_air,
        )
        baseline_tail = self.baseline_fitness - head_fitness

        # Prepare grid with rock removed (+ any existing removals for this round)
        test_grid = copy_grid(prev.grid)
        all_removals = list(self.removals[target_round]) + [(rock.x, rock.y)]
        for rx, ry in all_removals:
            if test_grid[ry, rx] == Cell.Rock:
                place_tower(test_grid, rx, ry, Cell.Grass)
        if find_route(test_grid) is None:
            return (0.0, None, -1)

        candidates = self._candidate_positions(rock.x, rock.y, test_grid)
        if not candidates:
            return (0.0, None, -1)

        orig_positions = self.chromosome[target_round]
        trial_removals = [list(r) for r in self.removals]
        trial_removals[target_round] = all_removals

        best_delta = 0.0
        best_cand: tuple[int, int] | None = None
        best_swap = -1

        for cand in candidates:
            for swap_idx in range(len(orig_positions)):
                modified_chromosome = list(self.chromosome)
                modified_round = list(orig_positions)
                modified_round[swap_idx] = cand
                modified_chromosome[target_round] = modified_round

                cp, wc, wd, wa = replay_rounds(
                    modified_chromosome,
                    trial_removals,
                    self.base_grid,
                    self.air_keeper_ratio,
                    start_round=target_round,
                    init_grid=copy_grid(prev.grid),
                    init_segments=[list(s) for s in prev.segments],
                    init_keepers=list(prev.keepers),
                    init_cum_path=prev.cumulative_path,
                    init_w_cov=prev.weighted_coverage,
                    init_w_dep=prev.weighted_depth,
                    init_w_air=prev.weighted_air,
                )
                if cp < 0:
                    continue

                new_tail = self._fitness(cp, wc, wd, wa) - head_fitness
                delta = new_tail - baseline_tail

                if delta > best_delta:
                    best_delta = delta
                    best_cand = cand
                    best_swap = swap_idx

        return (best_delta, best_cand, best_swap)

    def run(self) -> dict:
        """Run the greedy optimization loop. Returns result dict."""
        self._build_baseline()
        print(f"Baseline fitness: {self.baseline_fitness:.1f}")
        print(f"  Rocks: {len(self.rocks)}")

        iteration = 0
        total_removals = 0

        while True:
            if 0 < self.max_iterations <= iteration:
                print(f"\nMax iterations ({self.max_iterations}) reached.")
                break

            candidates = self._prefilter()
            if not candidates:
                print("\nNo candidates with positive exposure. Converged.")
                break

            top = candidates[: self.top_k]
            print(
                f"\nIteration {iteration}: evaluating {len(top)} "
                f"of {len(candidates)} candidates..."
            )

            best_delta = 0.0
            best_rock: RockRecord | None = None
            best_round = -1
            best_cand: tuple[int, int] | None = None
            best_swap = -1

            for rock, target_round, _exposure in top:
                delta, cand, swap = self._evaluate_removal(rock, target_round)
                if delta > best_delta:
                    best_delta = delta
                    best_rock = rock
                    best_round = target_round
                    best_cand = cand
                    best_swap = swap

            if best_delta <= 0 or best_rock is None or best_cand is None:
                print("No improvement found. Converged.")
                break

            # Accept removal
            self.removals[best_round].append((best_rock.x, best_rock.y))
            self.chromosome[best_round][best_swap] = best_cand
            old_fitness = self.baseline_fitness
            self._rebuild_from(best_round)
            total_removals += 1

            print(
                f"  Removed ({best_rock.x}, {best_rock.y}) "
                f"[placed round {best_rock.round_placed}] at round {best_round}"
            )
            print(
                f"  Swap position {best_swap} → ({best_cand[0]}, {best_cand[1]})"
            )
            print(
                f"  Delta: +{best_delta:.1f}, "
                f"fitness: {old_fitness:.1f} → {self.baseline_fitness:.1f}"
            )

            iteration += 1

        # Final validation replay
        cp, wc, wd, wa = replay_rounds(
            self.chromosome, self.removals, self.base_grid, self.air_keeper_ratio
        )
        final_fitness = self._fitness(cp, wc, wd, wa)

        print(f"\nOptimization complete: {total_removals} removals in {iteration} iterations")
        print(f"  Fitness: {final_fitness:.1f}")
        print(f"  Path: {cp}")
        print(f"  Coverage: {wc:.1f}")
        print(f"  Depth: {wd:.1f}")
        print(f"  Air: {wa:.1f}")

        return {
            "fitness": final_fitness,
            "cumulative_path": cp,
            "weighted_coverage": wc,
            "weighted_depth": wd,
            "weighted_air": wa,
            "rounds": self.chromosome,
            "removals": [[list(pos) for pos in r] for r in self.removals],
        }
