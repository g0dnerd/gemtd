"""Parallel game runner and metrics collection."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from multiprocessing import Pool
from statistics import median as _median

from .sim import (
    SimWrapper, GameResult, PHASE_BUILD, PHASE_GAMEOVER, PHASE_VICTORY,
    GEM_NAMES, NUM_GEMS, set_params, reset_params,
)


@dataclass
class PerSeedResult:
    seed: int
    wave: int
    gold: int
    lives: int
    towers: int
    outcome: str


@dataclass
class AggregateStats:
    median_wave: float
    mean_wave: float
    p10_wave: float
    p90_wave: float
    min_wave: int
    max_wave: int
    mean_gold: int
    mean_lives: float
    victory_rate: float
    gem_damage_share: list[float] | None = None  # per-gem damage fraction (8 entries)
    gem_share_variance: float | None = None


@dataclass
class BatchResult:
    ai_name: str
    aggregate: AggregateStats
    per_seed: list[PerSeedResult]
    elapsed_s: float


def _percentile(sorted_arr: list[float], p: float) -> float:
    if not sorted_arr:
        return 0
    idx = max(0, int((p / 100) * len(sorted_arr)) - 1)
    return sorted_arr[idx]


def run_single_game(seed: int, ai_name: str, *,
                     gem_params: list[float] | None = None,
                     quality_params: list[float] | None = None,
                     detailed: bool = False) -> GameResult:
    """Run one game with the given AI. Designed for multiprocessing."""
    from .ai import GreedyAI, BlueprintAI, StrategistAI

    ai_map = {
        "GreedyAI": GreedyAI,
        "BlueprintAI": BlueprintAI,
        "StrategistAI": StrategistAI,
    }
    if gem_params is not None or quality_params is not None:
        set_params(gem_params=gem_params, quality_params=quality_params)

    ai = ai_map[ai_name]()
    sim = SimWrapper(seed)
    try:
        return _run_game(sim, ai, detailed=detailed)
    finally:
        sim.close()


def _run_game(sim: SimWrapper, ai, *, detailed: bool = False) -> GameResult:
    sim.new_game()
    wave_leaks: list[int] = [] if detailed else None

    for _ in range(200):
        state = sim.get_state()
        if state.phase != PHASE_BUILD:
            break

        ai.play_build(sim)

        state = sim.get_state()
        if state.phase == PHASE_BUILD:
            sim.start_wave()

        state = sim.get_state()
        if state.phase != 2:  # wave phase
            if state.phase == PHASE_GAMEOVER or state.phase == PHASE_VICTORY:
                break
            continue

        wr = sim.run_wave()
        if detailed:
            wave_leaks.append(wr.leaked)

        state = sim.get_state()
        if state.phase == PHASE_GAMEOVER or state.phase == PHASE_VICTORY:
            break

    state = sim.get_state()
    outcome = "victory" if state.phase == PHASE_VICTORY else "gameover"

    gem_damage = None
    if detailed:
        towers = sim.get_towers()
        gem_damage = [0] * NUM_GEMS
        for t in towers:
            gi = GEM_NAMES.index(t.gem)
            gem_damage[gi] += t.total_damage

    return GameResult(
        seed=0,
        wave_reached=state.wave,
        final_gold=state.gold,
        final_lives=state.lives,
        outcome=outcome,
        gem_damage=gem_damage,
        wave_leaks=wave_leaks,
    )


def _run_game_with_seed(args: tuple) -> tuple[int, GameResult]:
    if len(args) == 2:
        seed, ai_name = args
        result = run_single_game(seed, ai_name)
    else:
        seed, ai_name, gem_params, quality_params, detailed = args
        result = run_single_game(
            seed, ai_name,
            gem_params=gem_params, quality_params=quality_params,
            detailed=detailed,
        )
    result.seed = seed
    return (seed, result)


def run_batch(
    ai_name: str,
    seeds: list[int],
    *,
    workers: int | None = None,
    gem_params: list[float] | None = None,
    quality_params: list[float] | None = None,
    detailed: bool = False,
) -> BatchResult:
    """Run N games in parallel using multiprocessing."""
    t0 = time.time()

    if gem_params is not None or quality_params is not None or detailed:
        args = [(seed, ai_name, gem_params, quality_params, detailed)
                for seed in seeds]
    else:
        args = [(seed, ai_name) for seed in seeds]

    if workers == 1 or len(seeds) == 1:
        results = [_run_game_with_seed(a) for a in args]
    else:
        with Pool(processes=workers) as pool:
            results = pool.map(_run_game_with_seed, args)

    elapsed = time.time() - t0

    per_seed = []
    waves = []
    golds = []
    lives_arr = []
    victories = 0

    for seed, result in results:
        per_seed.append(PerSeedResult(
            seed=seed,
            wave=result.wave_reached,
            gold=result.final_gold,
            lives=result.final_lives,
            towers=0,
            outcome=result.outcome,
        ))
        waves.append(result.wave_reached)
        golds.append(result.final_gold)
        lives_arr.append(result.final_lives)
        if result.outcome == "victory":
            victories += 1

    n = len(results)
    sorted_waves = sorted(waves)

    gem_damage_share = None
    gem_share_variance = None
    if detailed:
        total_gem = [0] * NUM_GEMS
        for _, result in results:
            if result.gem_damage:
                for gi in range(NUM_GEMS):
                    total_gem[gi] += result.gem_damage[gi]
        grand_total = sum(total_gem)
        if grand_total > 0:
            gem_damage_share = [g / grand_total for g in total_gem]
            mean_share = 1.0 / NUM_GEMS
            gem_share_variance = sum((s - mean_share) ** 2 for s in gem_damage_share) / NUM_GEMS

    aggregate = AggregateStats(
        median_wave=_median(waves) if waves else 0,
        mean_wave=round(sum(waves) / n, 1) if n else 0,
        p10_wave=_percentile(sorted_waves, 10),
        p90_wave=_percentile(sorted_waves, 90),
        min_wave=min(waves) if waves else 0,
        max_wave=max(waves) if waves else 0,
        mean_gold=round(sum(golds) / n) if n else 0,
        mean_lives=round(sum(lives_arr) / n, 1) if n else 0,
        victory_rate=round(victories / n, 3) if n else 0,
        gem_damage_share=gem_damage_share,
        gem_share_variance=gem_share_variance,
    )

    return BatchResult(
        ai_name=ai_name,
        aggregate=aggregate,
        per_seed=per_seed,
        elapsed_s=round(elapsed, 1),
    )


def _run_game_indexed(args: tuple) -> tuple[int, int, GameResult]:
    """Run one game and return (candidate_index, seed, result)."""
    cand_idx, seed, ai_name, gem_params, quality_params = args
    result = run_single_game(
        seed, ai_name,
        gem_params=gem_params, quality_params=quality_params,
        detailed=True,
    )
    result.seed = seed
    return (cand_idx, seed, result)


def evaluate_population(
    candidates: list[tuple[list[float], list[float]]],
    ai_name: str,
    seeds: list[int],
    *,
    workers: int | None = None,
    pool: Pool | None = None,
) -> list[BatchResult]:
    """Evaluate multiple param sets in one Pool.map call.

    Pass a persistent `pool` to avoid fork overhead per generation.
    """
    t0 = time.time()

    tasks = []
    for ci, (gem_p, qual_p) in enumerate(candidates):
        for seed in seeds:
            tasks.append((ci, seed, ai_name, gem_p, qual_p))

    if workers == 1 or len(tasks) == 1:
        raw = [_run_game_indexed(t) for t in tasks]
    elif pool is not None:
        raw = pool.map(_run_game_indexed, tasks)
    else:
        with Pool(processes=workers) as p:
            raw = p.map(_run_game_indexed, tasks)

    elapsed = time.time() - t0

    # Regroup by candidate index
    by_cand: dict[int, list[tuple[int, GameResult]]] = {}
    for ci, seed, result in raw:
        by_cand.setdefault(ci, []).append((seed, result))

    batches = []
    for ci in range(len(candidates)):
        results = by_cand.get(ci, [])
        per_seed = []
        waves = []
        golds = []
        lives_arr = []
        victories = 0
        total_gem = [0] * NUM_GEMS

        for seed, result in results:
            per_seed.append(PerSeedResult(
                seed=seed, wave=result.wave_reached, gold=result.final_gold,
                lives=result.final_lives, towers=0, outcome=result.outcome,
            ))
            waves.append(result.wave_reached)
            golds.append(result.final_gold)
            lives_arr.append(result.final_lives)
            if result.outcome == "victory":
                victories += 1
            if result.gem_damage:
                for gi in range(NUM_GEMS):
                    total_gem[gi] += result.gem_damage[gi]

        n = len(results)
        sorted_waves = sorted(waves)
        grand_total = sum(total_gem)
        gem_damage_share = [g / grand_total for g in total_gem] if grand_total > 0 else None
        mean_share = 1.0 / NUM_GEMS
        gem_share_variance = (
            sum((s - mean_share) ** 2 for s in gem_damage_share) / NUM_GEMS
            if gem_damage_share else None
        )

        aggregate = AggregateStats(
            median_wave=_median(waves) if waves else 0,
            mean_wave=round(sum(waves) / n, 1) if n else 0,
            p10_wave=_percentile(sorted_waves, 10),
            p90_wave=_percentile(sorted_waves, 90),
            min_wave=min(waves) if waves else 0,
            max_wave=max(waves) if waves else 0,
            mean_gold=round(sum(golds) / n) if n else 0,
            mean_lives=round(sum(lives_arr) / n, 1) if n else 0,
            victory_rate=round(victories / n, 3) if n else 0,
            gem_damage_share=gem_damage_share,
            gem_share_variance=gem_share_variance,
        )
        batches.append(BatchResult(
            ai_name=ai_name, aggregate=aggregate,
            per_seed=per_seed, elapsed_s=round(elapsed / len(candidates), 1),
        ))

    return batches


def run_all_ais(
    seeds: list[int],
    ai_names: list[str] | None = None,
    *,
    workers: int | None = None,
) -> list[BatchResult]:
    """Run all AIs and return results."""
    if ai_names is None:
        ai_names = ["GreedyAI", "BlueprintAI", "StrategistAI"]

    results = []
    for name in ai_names:
        print(f"  Running {name} ({len(seeds)} seeds)...", end="", flush=True)
        batch = run_batch(name, seeds, workers=workers)
        print(f" done ({batch.elapsed_s}s)")
        results.append(batch)
    return results


def print_summary(results: list[BatchResult]) -> None:
    """Print a summary table of all AI results."""
    print()
    print(f"{'AI':<16} {'Med':>4} {'Mean':>5} {'P10':>4} {'P90':>4} "
          f"{'Min':>4} {'Max':>4} {'Gold':>5} {'Lives':>5} {'Win%':>5}")
    print("-" * 72)
    for r in results:
        a = r.aggregate
        print(f"{r.ai_name:<16} {a.median_wave:>4.0f} {a.mean_wave:>5.1f} "
              f"{a.p10_wave:>4.0f} {a.p90_wave:>4.0f} {a.min_wave:>4} {a.max_wave:>4} "
              f"{a.mean_gold:>5} {a.mean_lives:>5.1f} {a.victory_rate * 100:>5.1f}")
    print()
