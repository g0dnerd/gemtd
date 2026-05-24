import argparse
import json
import sys

from grid import build_base_layout
from genetic import run_ga
from beam_search import run_beam_search


def _add_weight_args(parser: argparse.ArgumentParser) -> None:
    """Add shared fitness weight arguments to a parser."""
    parser.add_argument("--w-path", type=float, default=1.0, help="Path length weight")
    parser.add_argument("--w-coverage", type=float, default=1.5, help="Coverage weight")
    parser.add_argument("--w-depth", type=float, default=0.3, help="Depth weight")
    parser.add_argument("--w-air", type=float, default=3.0, help="Air exposure weight")
    parser.add_argument(
        "--air-keeper-ratio", type=float, default=2.0,
        help="Air-to-ground weight when selecting keeper on air rounds",
    )


def search_main(args: argparse.Namespace) -> None:
    base_grid = build_base_layout()

    if args.algorithm == "beam":
        result = run_beam_search(
            base_grid=base_grid,
            beam_width=args.beam_width,
            variants_per_state=args.variants,
            keeper_choices=args.keeper_choices,
            max_candidates=args.max_candidates,
            seed=args.seed,
            w_path=args.w_path,
            w_coverage=args.w_coverage,
            w_depth=args.w_depth,
            w_air=args.w_air,
            air_keeper_ratio=args.air_keeper_ratio,
            cores=args.cores,
            checkpoint_path=args.output,
        )
    else:
        result = run_ga(
            base_grid=base_grid,
            population_size=args.population,
            generations=args.generations,
            tournament_size=args.tournament,
            mutation_rate=args.mutation_rate,
            crossover_rate=args.crossover_rate,
            elite_pct=args.elite_pct,
            cores=args.cores,
            seed=args.seed,
            w_path=args.w_path,
            w_coverage=args.w_coverage,
            w_depth=args.w_depth,
            w_air=args.w_air,
            air_keeper_ratio=args.air_keeper_ratio,
            checkpoint_path=args.output,
        )

    output = {
        "fitness": result["fitness"],
        "path_length": result["path_length"],
        "cumulative_path": result["cumulative_path"],
        "exposure_total": result["exposure_total"],
        "air_exposure_total": result["air_exposure_total"],
        "weighted_coverage": result.get("weighted_coverage", 0.0),
        "weighted_depth": result.get("weighted_depth", 0.0),
        "weighted_air": result.get("weighted_air", 0.0),
        "rounds": result["chromosome"],
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nBlueprint saved to {args.output}")
    print(f"  Fitness:           {result['fitness']:.1f}")
    print(f"  Path length:       {result['path_length']}")
    print(f"  Cumulative path:   {result['cumulative_path']}")
    print(f"  Weighted coverage: {result.get('weighted_coverage', 0):.1f}")
    print(f"  Weighted depth:    {result.get('weighted_depth', 0):.1f}")
    print(f"  Weighted air:      {result.get('weighted_air', 0):.1f}")
    print(f"  Ground exposure:   {result['exposure_total']}")
    print(f"  Air exposure:      {result['air_exposure_total']}")


def optimize_main(args: argparse.Namespace) -> None:
    from removal_optimizer import RemovalOptimizer

    with open(args.blueprint) as f:
        data = json.load(f)

    chromosome = [[(x, y) for x, y in r] for r in data["rounds"]]
    base_grid = build_base_layout()

    optimizer = RemovalOptimizer(
        chromosome,
        base_grid,
        w_path=args.w_path,
        w_coverage=args.w_coverage,
        w_depth=args.w_depth,
        w_air=args.w_air,
        air_keeper_ratio=args.air_keeper_ratio,
        top_k=args.top_k,
        max_iterations=args.max_iterations,
    )

    result = optimizer.run()

    output = {
        "fitness": result["fitness"],
        "cumulative_path": result["cumulative_path"],
        "weighted_coverage": result["weighted_coverage"],
        "weighted_depth": result["weighted_depth"],
        "weighted_air": result["weighted_air"],
        "rounds": result["rounds"],
        "removals": result["removals"],
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nOptimized blueprint saved to {args.output}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="GemTD maze blueprint optimizer"
    )
    subparsers = parser.add_subparsers(dest="command")

    # --- search subcommand (GA / beam) ---
    search = subparsers.add_parser(
        "search", help="Search for a new blueprint (GA or beam search)"
    )
    search.add_argument(
        "--algorithm", choices=["ga", "beam"], default="ga",
        help="Optimization algorithm (default: ga)",
    )
    _add_weight_args(search)
    search.add_argument("--cores", type=int, default=None, help="CPU cores (default: all)")
    search.add_argument("--seed", type=int, default=42, help="RNG seed")
    search.add_argument(
        "--output", type=str, default="tools/maze_optimizer/blueprint.json",
        help="Output JSON path",
    )

    ga = search.add_argument_group("Genetic algorithm")
    ga.add_argument("--population", type=int, default=200, help="Population size")
    ga.add_argument("--generations", type=int, default=500, help="Max generations")
    ga.add_argument("--tournament", type=int, default=3, help="Tournament size")
    ga.add_argument("--mutation-rate", type=float, default=0.3, help="Mutation probability")
    ga.add_argument("--crossover-rate", type=float, default=0.7, help="Crossover probability")
    ga.add_argument("--elite-pct", type=float, default=0.05, help="Elite percentage")

    beam = search.add_argument_group("Beam search")
    beam.add_argument("--beam-width", type=int, default=100, help="Beam width")
    beam.add_argument("--variants", type=int, default=6, help="Variants per state per round")
    beam.add_argument("--keeper-choices", type=int, default=2, help="Keeper branches per variant")
    beam.add_argument("--max-candidates", type=int, default=50, help="Max placement candidates per gem")

    # --- optimize subcommand (rock removal) ---
    opt = subparsers.add_parser(
        "optimize", help="Optimize an existing blueprint via rock removal"
    )
    opt.add_argument("blueprint", help="Path to input blueprint JSON")
    opt.add_argument(
        "--output", type=str, default=None,
        help="Output path (default: input with -optimized suffix)",
    )
    opt.add_argument("--max-iterations", type=int, default=0, help="Max iterations (0 = unlimited)")
    opt.add_argument("--top-k", type=int, default=50, help="Candidates to evaluate per iteration")
    _add_weight_args(opt)

    # Backward compat: no subcommand → search
    if len(sys.argv) > 1 and sys.argv[1] not in ("search", "optimize", "-h", "--help"):
        sys.argv.insert(1, "search")

    args = parser.parse_args()

    if args.command == "optimize":
        if args.output is None:
            base = args.blueprint.rsplit(".", 1)
            args.output = base[0] + "-optimized." + base[1] if len(base) > 1 else args.blueprint + "-optimized"
        optimize_main(args)
    elif args.command == "search":
        search_main(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
