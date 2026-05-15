"""CMA-ES balance parameter search."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path

from multiprocessing import Pool

import cma
import numpy as np

from .runner import run_batch, evaluate_population, BatchResult
from .sim import (
    DEFAULT_GEM_PARAMS, DEFAULT_QUALITY_PARAMS,
    GEM_NAMES, NUM_GEMS, GEM_PARAM_COUNT, QUALITY_PARAM_COUNT,
)

PARAM_NAMES: list[str] = []
for _gem in GEM_NAMES:
    for _stat in ("base_dmg", "spread", "base_range", "base_atk_speed"):
        PARAM_NAMES.append(f"{_gem}.{_stat}")
for _i in range(5):
    PARAM_NAMES.append(f"quality_dmg_mult[{_i}]")
for _i in range(5):
    PARAM_NAMES.append(f"quality_range_bonus[{_i}]")
for _i in range(5):
    PARAM_NAMES.append(f"quality_speed_bonus[{_i}]")

TOTAL_PARAMS = GEM_PARAM_COUNT + QUALITY_PARAM_COUNT  # 47


def defaults_vec() -> np.ndarray:
    return np.array(DEFAULT_GEM_PARAMS + DEFAULT_QUALITY_PARAMS, dtype=np.float64)


def vec_to_params(x: np.ndarray) -> tuple[list[float], list[float]]:
    return list(x[:GEM_PARAM_COUNT]), list(x[GEM_PARAM_COUNT:])


# Bounds: each param has a sensible min/max range
def default_bounds() -> tuple[np.ndarray, np.ndarray]:
    lower = np.zeros(TOTAL_PARAMS)
    upper = np.zeros(TOTAL_PARAMS)
    dv = defaults_vec()

    for i in range(NUM_GEMS):
        base = i * 4
        lower[base] = max(1.0, dv[base] * 0.3)        # base_dmg
        upper[base] = dv[base] * 3.0
        lower[base + 1] = 0.05                          # spread
        upper[base + 1] = 0.5
        lower[base + 2] = max(2.0, dv[base + 2] * 0.6) # base_range
        upper[base + 2] = dv[base + 2] * 1.5
        lower[base + 3] = max(0.3, dv[base + 3] * 0.5) # base_atk_speed
        upper[base + 3] = dv[base + 3] * 2.0

    qoff = GEM_PARAM_COUNT
    # quality_dmg_mult: must be monotonically increasing, but CMA-ES doesn't enforce that
    for i in range(5):
        lower[qoff + i] = max(0.5, dv[qoff + i] * 0.5)
        upper[qoff + i] = dv[qoff + i] * 2.0
    # quality_range_bonus
    for i in range(5):
        lower[qoff + 5 + i] = 0.0
        upper[qoff + 5 + i] = max(0.5, dv[qoff + 5 + i] * 2.0)
    # quality_speed_bonus
    for i in range(5):
        lower[qoff + 10 + i] = max(0.8, dv[qoff + 10 + i] * 0.8)
        upper[qoff + 10 + i] = dv[qoff + 10 + i] * 1.5

    return lower, upper


@dataclass
class FitnessConfig:
    target_victory_rate: float = 0.20
    target_median_wave: float = 37.0
    w_victory_rate: float = 10.0
    w_median_wave: float = 0.5
    w_gem_share_variance: float = 5.0
    w_wave_roughness: float = 2.0


@dataclass
class FitnessBreakdown:
    total: float
    victory_rate_term: float
    median_wave_term: float
    gem_share_term: float
    wave_roughness_term: float
    victory_rate: float
    median_wave: float
    gem_share_variance: float


def compute_fitness(batch: BatchResult, config: FitnessConfig | None = None) -> FitnessBreakdown:
    if config is None:
        config = FitnessConfig()

    a = batch.aggregate
    vr_term = -abs(a.victory_rate - config.target_victory_rate) * config.w_victory_rate
    mw_term = -abs(a.median_wave - config.target_median_wave) * config.w_median_wave

    gsv = a.gem_share_variance if a.gem_share_variance is not None else 0.0
    gs_term = -gsv * config.w_gem_share_variance

    roughness = 0.0
    if batch.per_seed:
        waves_sorted = sorted(r.wave for r in batch.per_seed)
        if len(waves_sorted) > 1:
            diffs = [abs(waves_sorted[i + 1] - waves_sorted[i])
                     for i in range(len(waves_sorted) - 1)]
            roughness = sum(diffs) / len(diffs)
    wr_term = -roughness * config.w_wave_roughness

    return FitnessBreakdown(
        total=vr_term + mw_term + gs_term + wr_term,
        victory_rate_term=vr_term,
        median_wave_term=mw_term,
        gem_share_term=gs_term,
        wave_roughness_term=wr_term,
        victory_rate=a.victory_rate,
        median_wave=a.median_wave,
        gem_share_variance=gsv,
    )


@dataclass
class SearchConfig:
    seeds: int = 50
    ai_name: str = "StrategistAI"
    workers: int | None = None
    max_generations: int = 100
    population_size: int | None = None  # None = CMA-ES default
    sigma0: float = 0.3  # initial step size (relative to param range)
    fitness: FitnessConfig | None = None
    output_dir: str = "results"


def run_search(config: SearchConfig | None = None) -> dict:
    if config is None:
        config = SearchConfig()

    out_dir = Path(config.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dv = defaults_vec()
    lower, upper = default_bounds()
    ranges = upper - lower
    sigma0 = config.sigma0 * np.median(ranges)

    seed_list = list(range(1, config.seeds + 1))

    opts = cma.CMAOptions()
    opts["bounds"] = [lower.tolist(), upper.tolist()]
    opts["maxiter"] = config.max_generations
    opts["verb_disp"] = 1
    opts["verb_log"] = 0
    if config.population_size:
        opts["popsize"] = config.population_size

    es = cma.CMAEvolutionStrategy(dv.tolist(), sigma0, opts)

    best_fitness = float("inf")
    best_params = None
    history: list[dict] = []
    t0 = time.time()

    popsize = es.popsize
    total_games_per_gen = popsize * config.seeds

    print(f"CMA-ES search: {TOTAL_PARAMS} dims, {config.seeds} seeds/eval, "
          f"popsize={popsize}, ai={config.ai_name}")
    print(f"Target: victory_rate={config.fitness.target_victory_rate if config.fitness else 0.2}, "
          f"median_wave={config.fitness.target_median_wave if config.fitness else 37}")
    print(f"Games per generation: {total_games_per_gen}")
    print()

    pool = Pool(processes=config.workers) if (config.workers != 1) else None

    gen = 0
    try:
        while not es.stop():
            solutions = es.ask()

            candidates = []
            for x in solutions:
                clipped = np.clip(x, lower, upper)
                candidates.append(vec_to_params(clipped))

            batches = evaluate_population(
                candidates, config.ai_name, seed_list,
                workers=config.workers,
                pool=pool,
            )

            fitnesses = []
            for i, batch in enumerate(batches):
                fb = compute_fitness(batch, config.fitness)
                f = -fb.total
                fitnesses.append(f)
                if f < best_fitness:
                    best_fitness = f
                    best_params = np.array(solutions[i])

            es.tell(solutions, fitnesses)
            gen += 1

            best_this_gen = min(fitnesses)
            mean_this_gen = sum(fitnesses) / len(fitnesses)
            elapsed = time.time() - t0

            entry = {
                "gen": gen,
                "best": -best_this_gen,
                "mean": -mean_this_gen,
                "best_ever": -best_fitness,
                "elapsed_s": round(elapsed, 1),
            }
            history.append(entry)
            print(f"  gen {gen:3d}: best={-best_this_gen:+.4f} mean={-mean_this_gen:+.4f} "
                  f"best_ever={-best_fitness:+.4f} ({elapsed:.0f}s)")
    finally:
        if pool is not None:
            pool.terminate()
            pool.join()

    best_clipped = np.clip(best_params, lower, upper)
    gem_p, qual_p = vec_to_params(best_clipped)

    # Final detailed evaluation of best params
    print("\nFinal evaluation of best params...")
    final_batch = run_batch(
        config.ai_name, seed_list,
        workers=config.workers,
        gem_params=gem_p, quality_params=qual_p,
        detailed=True,
    )
    fb = compute_fitness(final_batch, config.fitness)

    result = {
        "gem_params": gem_p,
        "quality_params": qual_p,
        "param_names": PARAM_NAMES,
        "fitness": asdict(fb),
        "config": asdict(config) if not isinstance(config.fitness, type(None)) else {
            **asdict(config), "fitness": asdict(FitnessConfig())
        },
        "history": history,
        "aggregate": {
            "median_wave": final_batch.aggregate.median_wave,
            "mean_wave": final_batch.aggregate.mean_wave,
            "victory_rate": final_batch.aggregate.victory_rate,
            "gem_damage_share": dict(zip(GEM_NAMES, final_batch.aggregate.gem_damage_share or [])),
        },
    }

    out_path = out_dir / "best.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\nResults saved to {out_path}")

    print(f"\nFitness: {fb.total:+.4f}")
    print(f"  victory_rate: {fb.victory_rate:.1%} (target {config.fitness.target_victory_rate if config.fitness else 0.2:.0%})")
    print(f"  median_wave:  {fb.median_wave:.1f} (target {config.fitness.target_median_wave if config.fitness else 37})")
    print(f"  gem_share_var: {fb.gem_share_variance:.6f}")

    if final_batch.aggregate.gem_damage_share:
        print("\nGem damage share:")
        for i, name in enumerate(GEM_NAMES):
            print(f"  {name:12s}: {final_batch.aggregate.gem_damage_share[i]:.1%}")

    return result
