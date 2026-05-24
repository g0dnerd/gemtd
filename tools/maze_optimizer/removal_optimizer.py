"""Greedy rock-removal post-processor for maze blueprints.

Operates on a completed blueprint: replays round-by-round, identifies rocks
whose positions would be more valuable as keeper towers, and iteratively
removes rocks and re-places towers for net fitness improvement.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from multiprocessing import Pool, cpu_count

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


# ---------------------------------------------------------------------------
# Module-level functions (used by both serial path and worker processes)
# ---------------------------------------------------------------------------


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


def _candidate_positions(
    rx: int, ry: int, grid: np.ndarray
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


def _evaluate_removal_core(
    rock_x: int,
    rock_y: int,
    target_round: int,
    base_grid: np.ndarray,
    chromosome: list[list[tuple[int, int]]],
    removals: list[list[tuple[int, int]]],
    snapshot: RoundSnapshot,
    w_path: float,
    w_coverage: float,
    w_depth: float,
    w_air: float,
    air_keeper_ratio: float,
    baseline_fitness: float,
) -> tuple[float, tuple[int, int] | None, int, int]:
    """Core evaluation: best (delta, candidate, swap_idx, n_replays) for one removal."""

    def fitness(cp: int, wc: float, wd: float, wa: float) -> float:
        return w_path * cp + w_coverage * wc + w_depth * wd + w_air * wa

    head = fitness(
        snapshot.cumulative_path, snapshot.weighted_coverage,
        snapshot.weighted_depth, snapshot.weighted_air,
    )
    baseline_tail = baseline_fitness - head

    test_grid = copy_grid(snapshot.grid)
    all_removals = list(removals[target_round]) + [(rock_x, rock_y)]
    for rx, ry in all_removals:
        if test_grid[ry, rx] == Cell.Rock:
            place_tower(test_grid, rx, ry, Cell.Grass)
    if find_route(test_grid) is None:
        return (0.0, None, -1, 0)

    candidates = _candidate_positions(rock_x, rock_y, test_grid)
    if not candidates:
        return (0.0, None, -1, 0)

    orig_positions = chromosome[target_round]
    trial_removals = [list(r) for r in removals]
    trial_removals[target_round] = all_removals

    best_delta = 0.0
    best_cand: tuple[int, int] | None = None
    best_swap = -1
    n_replays = 0

    for cand in candidates:
        for swap_idx in range(len(orig_positions)):
            modified_chromosome = list(chromosome)
            modified_round = list(orig_positions)
            modified_round[swap_idx] = cand
            modified_chromosome[target_round] = modified_round

            cp, wc, wd, wa = replay_rounds(
                modified_chromosome,
                trial_removals,
                base_grid,
                air_keeper_ratio,
                start_round=target_round,
                init_grid=copy_grid(snapshot.grid),
                init_segments=[list(s) for s in snapshot.segments],
                init_keepers=list(snapshot.keepers),
                init_cum_path=snapshot.cumulative_path,
                init_w_cov=snapshot.weighted_coverage,
                init_w_dep=snapshot.weighted_depth,
                init_w_air=snapshot.weighted_air,
            )
            n_replays += 1
            if cp < 0:
                continue

            delta = fitness(cp, wc, wd, wa) - head - baseline_tail
            if delta > best_delta:
                best_delta = delta
                best_cand = cand
                best_swap = swap_idx

    return (best_delta, best_cand, best_swap, n_replays)


# ---------------------------------------------------------------------------
# Multiprocessing worker
# ---------------------------------------------------------------------------

_w_base_grid: np.ndarray | None = None
_w_chromosome: list | None = None
_w_removals: list | None = None
_w_snapshots: list | None = None
_w_wp: float = 1.0
_w_wc: float = 1.5
_w_wd: float = 0.3
_w_wa: float = 3.0
_w_akr: float = 2.0
_w_baseline: float = 0.0


def _init_eval_worker(
    base_grid: np.ndarray,
    chromosome: list,
    removals: list,
    snapshots: list,
    w_path: float,
    w_coverage: float,
    w_depth: float,
    w_air: float,
    air_keeper_ratio: float,
    baseline_fitness: float,
) -> None:
    global _w_base_grid, _w_chromosome, _w_removals, _w_snapshots
    global _w_wp, _w_wc, _w_wd, _w_wa, _w_akr, _w_baseline
    _w_base_grid = base_grid
    _w_chromosome = chromosome
    _w_removals = removals
    _w_snapshots = snapshots
    _w_wp = w_path
    _w_wc = w_coverage
    _w_wd = w_depth
    _w_wa = w_air
    _w_akr = air_keeper_ratio
    _w_baseline = baseline_fitness


def _eval_one(
    task: tuple[int, int, int, int, int],
) -> tuple[int, float, tuple[int, int] | None, int, int]:
    """Worker: evaluate one (rock, target_round) pair.

    task = (candidate_index, rock_x, rock_y, rock_placed, target_round)
    Returns (candidate_index, delta, best_cand, best_swap, n_replays).
    """
    ci, rock_x, rock_y, _rock_placed, target_round = task
    snapshot = _w_snapshots[target_round - 1]  # type: ignore[index]
    delta, cand, swap, n_rep = _evaluate_removal_core(
        rock_x, rock_y, target_round,
        _w_base_grid,  # type: ignore[arg-type]
        _w_chromosome,  # type: ignore[arg-type]
        _w_removals,  # type: ignore[arg-type]
        snapshot,
        _w_wp, _w_wc, _w_wd, _w_wa, _w_akr, _w_baseline,
    )
    return (ci, delta, cand, swap, n_rep)


# ---------------------------------------------------------------------------
# Optimizer class
# ---------------------------------------------------------------------------


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
        cores: int | None = None,
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
        self.cores = cores or cpu_count()

        self.snapshots: list[RoundSnapshot] = []
        self.rocks: list[RockRecord] = []
        self.removals: list[list[tuple[int, int]]] = [[] for _ in range(NUM_ROUNDS)]
        self.baseline_fitness = 0.0

    def _fitness(self, cp: int, wc: float, wd: float, wa: float) -> float:
        return self.w_path * cp + self.w_coverage * wc + self.w_depth * wd + self.w_air * wa

    def _build_baseline(self) -> None:
        """Full replay from scratch, storing all snapshots and rocks."""
        print("Building baseline (50 rounds)...", flush=True)
        t0 = time.monotonic()
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
        print(f"  Done in {time.monotonic() - t0:.1f}s", flush=True)

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
        t0 = time.monotonic()
        candidates: list[tuple[RockRecord, int, float]] = []
        for rock in self.rocks:
            for r in range(rock.round_placed + 1, NUM_ROUNDS):
                exp = exposure_at(rock.x, rock.y, self.snapshots[r].route_set)
                if exp > 0:
                    candidates.append((rock, r, float(exp)))
        candidates.sort(key=lambda t: t[2], reverse=True)
        n_pairs = sum(NUM_ROUNDS - 1 - r.round_placed for r in self.rocks)
        print(
            f"  Pre-filter: scanned {n_pairs} (rock, round) pairs → "
            f"{len(candidates)} with exposure > 0  [{time.monotonic() - t0:.1f}s]",
            flush=True,
        )
        return candidates

    def _evaluate_removal(
        self, rock: RockRecord, target_round: int
    ) -> tuple[float, tuple[int, int] | None, int, int]:
        """Serial evaluation for a single (rock, target_round) pair."""
        return _evaluate_removal_core(
            rock.x, rock.y, target_round,
            self.base_grid, self.chromosome, self.removals,
            self.snapshots[target_round - 1],
            self.w_path, self.w_coverage, self.w_depth, self.w_air,
            self.air_keeper_ratio, self.baseline_fitness,
        )

    def _evaluate_batch_serial(
        self,
        top: list[tuple[RockRecord, int, float]],
    ) -> tuple[float, RockRecord | None, int, tuple[int, int] | None, int]:
        """Evaluate candidates serially with per-candidate logging."""
        best_delta = 0.0
        best_rock: RockRecord | None = None
        best_round = -1
        best_cand: tuple[int, int] | None = None
        best_swap = -1
        total_replays = 0
        t_eval = time.monotonic()

        for ci, (rock, target_round, exposure) in enumerate(top):
            t_cand = time.monotonic()
            delta, cand, swap, n_rep = self._evaluate_removal(rock, target_round)
            total_replays += n_rep
            tag = ""
            if delta > best_delta:
                best_delta = delta
                best_rock = rock
                best_round = target_round
                best_cand = cand
                best_swap = swap
                tag = f"  ← new best +{delta:.1f}"
            print(
                f"    [{ci + 1}/{len(top)}] rock ({rock.x},{rock.y}) "
                f"r{rock.round_placed}→r{target_round}  "
                f"exp={exposure:.0f}  {n_rep} replays  "
                f"{time.monotonic() - t_cand:.1f}s{tag}",
                flush=True,
            )

        elapsed = time.monotonic() - t_eval
        print(
            f"  Evaluated {total_replays} replays in {elapsed:.1f}s "
            f"({total_replays / elapsed:.0f} replay/s)" if elapsed > 0
            else f"  Evaluated {total_replays} replays",
            flush=True,
        )
        return best_delta, best_rock, best_round, best_cand, best_swap

    def _evaluate_batch_parallel(
        self,
        top: list[tuple[RockRecord, int, float]],
    ) -> tuple[float, RockRecord | None, int, tuple[int, int] | None, int]:
        """Evaluate candidates in parallel across worker processes."""
        tasks = [
            (ci, rock.x, rock.y, rock.round_placed, target_round)
            for ci, (rock, target_round, _) in enumerate(top)
        ]

        t_eval = time.monotonic()
        print(
            f"  Dispatching {len(tasks)} tasks to {self.cores} workers...",
            flush=True,
        )

        with Pool(
            self.cores,
            initializer=_init_eval_worker,
            initargs=(
                self.base_grid, self.chromosome, self.removals,
                self.snapshots,
                self.w_path, self.w_coverage, self.w_depth, self.w_air,
                self.air_keeper_ratio, self.baseline_fitness,
            ),
        ) as pool:
            best_delta = 0.0
            best_rock: RockRecord | None = None
            best_round = -1
            best_cand: tuple[int, int] | None = None
            best_swap = -1
            total_replays = 0
            completed = 0

            for ci, delta, cand, swap, n_rep in pool.imap_unordered(_eval_one, tasks):
                completed += 1
                total_replays += n_rep
                rock, target_round, exposure = top[ci]
                tag = ""
                if delta > best_delta:
                    best_delta = delta
                    best_rock = rock
                    best_round = target_round
                    best_cand = cand
                    best_swap = swap
                    tag = f"  ← new best +{delta:.1f}"
                print(
                    f"    [{completed}/{len(tasks)}] rock ({rock.x},{rock.y}) "
                    f"r{rock.round_placed}→r{target_round}  "
                    f"exp={exposure:.0f}  {n_rep} replays{tag}",
                    flush=True,
                )

        elapsed = time.monotonic() - t_eval
        print(
            f"  Evaluated {total_replays} replays in {elapsed:.1f}s "
            f"({total_replays / elapsed:.0f} replay/s)" if elapsed > 0
            else f"  Evaluated {total_replays} replays",
            flush=True,
        )
        return best_delta, best_rock, best_round, best_cand, best_swap

    def run(self) -> dict:
        """Run the greedy optimization loop. Returns result dict."""
        self._build_baseline()
        print(f"Baseline fitness: {self.baseline_fitness:.1f}")
        print(f"  Rocks: {len(self.rocks)}")
        print(f"  Cores: {self.cores}")

        iteration = 0
        total_removals = 0
        t_start = time.monotonic()

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
                f"of {len(candidates)} candidates...",
                flush=True,
            )

            if self.cores == 1:
                best_delta, best_rock, best_round, best_cand, best_swap = (
                    self._evaluate_batch_serial(top)
                )
            else:
                best_delta, best_rock, best_round, best_cand, best_swap = (
                    self._evaluate_batch_parallel(top)
                )

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

        elapsed = time.monotonic() - t_start
        print(f"\nOptimization complete: {total_removals} removals in {iteration} iterations ({elapsed:.0f}s)")
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
