import argparse
import json

from grid import build_base_layout
from genetic import run_ga


def main() -> None:
    parser = argparse.ArgumentParser(
        description="GemTD maze blueprint optimizer (genetic algorithm)"
    )
    parser.add_argument("--population", type=int, default=200, help="Population size")
    parser.add_argument("--generations", type=int, default=500, help="Max generations")
    parser.add_argument("--tournament", type=int, default=3, help="Tournament size")
    parser.add_argument(
        "--mutation-rate", type=float, default=0.3, help="Mutation probability"
    )
    parser.add_argument(
        "--crossover-rate", type=float, default=0.7, help="Crossover probability"
    )
    parser.add_argument(
        "--elite-pct", type=float, default=0.05, help="Elite percentage"
    )
    parser.add_argument(
        "--exposure-weight", type=float, default=0.15, help="Ground exposure weight in fitness"
    )
    parser.add_argument(
        "--air-exposure-weight", type=float, default=5.0, help="Air exposure weight in fitness"
    )
    parser.add_argument(
        "--air-keeper-ratio", type=float, default=2.0,
        help="Air-to-ground weight when selecting keeper on air rounds",
    )
    parser.add_argument(
        "--cores", type=int, default=None, help="CPU cores (default: all)"
    )
    parser.add_argument("--seed", type=int, default=42, help="RNG seed")
    parser.add_argument(
        "--output",
        type=str,
        default="tools/maze_optimizer/blueprint.json",
        help="Output JSON path",
    )
    args = parser.parse_args()

    base_grid = build_base_layout()

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
        exposure_weight=args.exposure_weight,
        air_exposure_weight=args.air_exposure_weight,
        air_keeper_ratio=args.air_keeper_ratio,
    )

    output = {
        "fitness": result["fitness"],
        "path_length": result["path_length"],
        "cumulative_path": result["cumulative_path"],
        "exposure_total": result["exposure_total"],
        "air_exposure_total": result["air_exposure_total"],
        "rounds": result["chromosome"],
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nBlueprint saved to {args.output}")
    print(f"  Fitness:         {result['fitness']:.1f}")
    print(f"  Path length:     {result['path_length']}")
    print(f"  Cumulative path: {result['cumulative_path']}")
    print(f"  Ground exposure: {result['exposure_total']}")
    print(f"  Air exposure:    {result['air_exposure_total']}")


if __name__ == "__main__":
    main()
