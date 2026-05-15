#!/usr/bin/env python3
"""CLI for running Zig sim with Python AI players.

Usage:
    uv run python cli.py run [--seeds N] [--ai NAME] [--workers N]
    uv run python cli.py single SEED [--ai NAME]
"""

from __future__ import annotations

import argparse
import sys
import time

from gemtd.runner import run_all_ais, run_batch, print_summary


def cmd_run(args: argparse.Namespace) -> None:
    seeds = list(range(1, args.seeds + 1))
    ai_names = [args.ai] if args.ai else None

    print(f"Running sim: {len(seeds)} seeds, workers={args.workers or 'auto'}")
    results = run_all_ais(seeds, ai_names, workers=args.workers)
    print_summary(results)


def cmd_search(args: argparse.Namespace) -> None:
    from gemtd.search import run_search, SearchConfig, FitnessConfig

    fitness = FitnessConfig(
        target_victory_rate=args.target_vr,
        target_median_wave=args.target_wave,
    )
    config = SearchConfig(
        seeds=args.seeds,
        ai_name=args.ai,
        workers=args.workers,
        max_generations=args.generations,
        population_size=args.popsize,
        sigma0=args.sigma,
        fitness=fitness,
        output_dir=args.output,
    )
    run_search(config)


def cmd_eval(args: argparse.Namespace) -> None:
    import json
    from gemtd.runner import run_batch, print_summary
    from gemtd.search import compute_fitness, FitnessConfig
    from gemtd.sim import GEM_NAMES

    with open(args.params) as f:
        data = json.load(f)

    gem_params = data["gem_params"]
    quality_params = data["quality_params"]
    seeds = list(range(1, args.seeds + 1))

    print(f"Evaluating {args.params} with {args.seeds} seeds, ai={args.ai}")
    batch = run_batch(
        args.ai, seeds,
        workers=args.workers,
        gem_params=gem_params,
        quality_params=quality_params,
        detailed=True,
    )
    print_summary([batch])

    fb = compute_fitness(batch)
    print(f"Fitness: {fb.total:+.4f}")
    print(f"  victory_rate: {fb.victory_rate:.1%}")
    print(f"  median_wave:  {fb.median_wave:.1f}")
    print(f"  gem_share_var: {fb.gem_share_variance:.6f}")

    if batch.aggregate.gem_damage_share:
        print("\nGem damage share:")
        for i, name in enumerate(GEM_NAMES):
            print(f"  {name:12s}: {batch.aggregate.gem_damage_share[i]:.1%}")


def cmd_single(args: argparse.Namespace) -> None:
    from gemtd.sim import SimWrapper, PHASE_BUILD, PHASE_GAMEOVER, PHASE_VICTORY
    from gemtd.ai import GreedyAI, BlueprintAI, StrategistAI

    ai_map = {
        "GreedyAI": GreedyAI,
        "BlueprintAI": BlueprintAI,
        "StrategistAI": StrategistAI,
    }
    ai = ai_map[args.ai]()
    sim = SimWrapper(args.seed)

    try:
        sim.new_game()
        t0 = time.time()

        for wave_num in range(1, 201):
            state = sim.get_state()
            if state.phase != PHASE_BUILD:
                break

            ai.play_build(sim)

            state = sim.get_state()
            if state.phase == PHASE_BUILD:
                sim.start_wave()

            state = sim.get_state()
            if state.phase != 2:
                if state.phase == PHASE_GAMEOVER or state.phase == PHASE_VICTORY:
                    break
                continue

            wr = sim.run_wave()
            towers = sim.get_towers()
            print(f"  wave {wr.wave:2d}: lives={wr.lives} gold={wr.gold} "
                  f"killed={wr.killed} leaked={wr.leaked} towers={len(towers)}")

            state = sim.get_state()
            if state.phase == PHASE_GAMEOVER or state.phase == PHASE_VICTORY:
                break

        elapsed = time.time() - t0
        state = sim.get_state()
        outcome = "victory" if state.phase == PHASE_VICTORY else "gameover"
        print(f"\nSeed {args.seed}: wave {state.wave}, {outcome}, "
              f"lives={state.lives}, gold={state.gold} ({elapsed:.2f}s)")
    finally:
        sim.close()


def main():
    parser = argparse.ArgumentParser(description="GemTD Zig sim runner")
    sub = parser.add_subparsers(dest="command")

    run_p = sub.add_parser("run", help="Run batch simulation")
    run_p.add_argument("--seeds", type=int, default=50)
    run_p.add_argument("--ai", choices=["GreedyAI", "BlueprintAI", "StrategistAI"])
    run_p.add_argument("--workers", type=int, default=None)

    single_p = sub.add_parser("single", help="Run single seed with verbose output")
    single_p.add_argument("seed", type=int)
    single_p.add_argument("--ai", default="GreedyAI",
                          choices=["GreedyAI", "BlueprintAI", "StrategistAI"])

    search_p = sub.add_parser("search", help="CMA-ES balance parameter search")
    search_p.add_argument("--seeds", type=int, default=50)
    search_p.add_argument("--ai", default="StrategistAI",
                          choices=["GreedyAI", "BlueprintAI", "StrategistAI"])
    search_p.add_argument("--workers", type=int, default=None)
    search_p.add_argument("--generations", type=int, default=100)
    search_p.add_argument("--popsize", type=int, default=None)
    search_p.add_argument("--sigma", type=float, default=0.3)
    search_p.add_argument("--target-vr", type=float, default=0.20)
    search_p.add_argument("--target-wave", type=float, default=37.0)
    search_p.add_argument("--output", default="results")

    eval_p = sub.add_parser("eval", help="Evaluate a parameter set")
    eval_p.add_argument("params", help="Path to params JSON file")
    eval_p.add_argument("--seeds", type=int, default=200)
    eval_p.add_argument("--ai", default="StrategistAI",
                        choices=["GreedyAI", "BlueprintAI", "StrategistAI"])
    eval_p.add_argument("--workers", type=int, default=None)

    args = parser.parse_args()

    if args.command == "run":
        cmd_run(args)
    elif args.command == "single":
        cmd_single(args)
    elif args.command == "search":
        cmd_search(args)
    elif args.command == "eval":
        cmd_eval(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
