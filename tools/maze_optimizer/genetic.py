import random
import time
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
    is_adjacent_to_maze,
    place_tower,
)

try:
    from pathfinding_cy import find_route, flatten_route, footprint_cells
except ImportError:
    from pathfinding import find_route, flatten_route, footprint_cells

from fitness import (
    NUM_ROUNDS,
    GEMS_PER_ROUND,
    KEEPER_R2,
    evaluate,
    exposure_at,
    exposure_at_flat,
)

Chromosome = list[list[tuple[int, int]]]

_worker_base_grid: np.ndarray | None = None
_worker_exposure_weight: float = 0.1


def _init_worker(base_grid: np.ndarray, exposure_weight: float) -> None:
    global _worker_base_grid, _worker_exposure_weight
    _worker_base_grid = base_grid
    _worker_exposure_weight = exposure_weight


def _evaluate_wrapper(chromosome: Chromosome) -> dict:
    return evaluate(chromosome, _worker_base_grid, _worker_exposure_weight)  # type: ignore[arg-type]


def get_candidates(
    grid: np.ndarray, adjacent_only: bool = True
) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for y in range(PLACE_MIN, PLACE_MAX_Y + 1):
        for x in range(PLACE_MIN, PLACE_MAX_X + 1):
            if not can_place_2x2(grid, x, y):
                continue
            if adjacent_only and not is_adjacent_to_maze(grid, x, y):
                continue
            out.append((x, y))
    return out


def create_greedy_individual(
    base_grid: np.ndarray,
    rng: random.Random,
    noise: float = 0.5,
    max_candidates: int = 50,
) -> Chromosome:
    grid = copy_grid(base_grid)
    chromosome: Chromosome = []

    segments = find_route(grid)
    assert segments is not None
    flat_route = flatten_route(segments)
    route_set = set(flat_route)

    w_exp = 0.5 + rng.uniform(-noise, noise)
    w_maze = 3.0 + rng.uniform(-noise, noise)

    for _ in range(NUM_ROUNDS):
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
                for fx, fy in flat_try:
                    ddx = fx - tcx
                    ddy = fy - tcy
                    if ddx * ddx + ddy * ddy <= KEEPER_R2:
                        exp += 1

                maze_gain = len(flat_try) - route_len
                score = exp * w_exp + maze_gain * w_maze

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
                new_seg = find_route(grid)
                if new_seg:
                    flat_route = flatten_route(new_seg)
                    route_set = set(flat_route)

        while len(positions) < GEMS_PER_ROUND:
            positions.append(positions[-1] if positions else (PLACE_MIN, PLACE_MIN))

        chromosome.append(positions)

        if positions:
            best_keeper = max(
                range(len(positions)),
                key=lambda i: exposure_at_flat(positions[i][0], positions[i][1], flat_route),
            )
            for i, (px, py) in enumerate(positions):
                if i != best_keeper:
                    place_tower(grid, px, py, Cell.Rock)

    return chromosome


def create_random_individual(
    base_grid: np.ndarray, rng: random.Random
) -> Chromosome:
    grid = copy_grid(base_grid)
    chromosome: Chromosome = []

    segments = find_route(grid)
    assert segments is not None
    flat_route = flatten_route(segments)
    route_set = set(flat_route)

    for _ in range(NUM_ROUNDS):
        positions: list[tuple[int, int]] = []

        for _ in range(GEMS_PER_ROUND):
            candidates = get_candidates(grid, adjacent_only=True)
            if not candidates:
                candidates = get_candidates(grid, adjacent_only=False)
            if not candidates:
                break

            rng.shuffle(candidates)
            placed = False

            for cx, cy in candidates:
                fc = footprint_cells(cx, cy)
                if fc & route_set:
                    if find_route(grid, fc) is None:
                        continue

                place_tower(grid, cx, cy)
                positions.append((cx, cy))
                placed = True

                if fc & route_set:
                    new_seg = find_route(grid)
                    if new_seg:
                        flat_route = flatten_route(new_seg)
                        route_set = set(flat_route)
                break

            if not placed:
                break

        while len(positions) < GEMS_PER_ROUND:
            positions.append(positions[-1] if positions else (PLACE_MIN, PLACE_MIN))

        chromosome.append(positions)

        if positions:
            best_keeper = max(
                range(len(positions)),
                key=lambda i: exposure_at_flat(positions[i][0], positions[i][1], flat_route),
            )
            for i, (px, py) in enumerate(positions):
                if i != best_keeper:
                    place_tower(grid, px, py, Cell.Rock)

    return chromosome


def init_population(
    base_grid: np.ndarray, pop_size: int, rng: random.Random
) -> list[Chromosome]:
    greedy_count = max(1, pop_size * 2 // 5)
    random_count = pop_size - greedy_count

    population: list[Chromosome] = []

    print(f"Creating {greedy_count} greedy-seeded individuals...")
    for i in range(greedy_count):
        population.append(create_greedy_individual(base_grid, rng, noise=0.5))
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{greedy_count}")

    print(f"Creating {random_count} random-constructive individuals...")
    for i in range(random_count):
        population.append(create_random_individual(base_grid, rng))
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{random_count}")

    return population


def tournament_select(
    population: list[Chromosome],
    fitness_scores: list[float],
    tournament_size: int,
    rng: random.Random,
) -> Chromosome:
    indices = rng.sample(range(len(population)), min(tournament_size, len(population)))
    best = max(indices, key=lambda i: fitness_scores[i])
    return population[best]


def crossover(
    parent_a: Chromosome, parent_b: Chromosome, rng: random.Random
) -> Chromosome:
    child: Chromosome = []
    for i in range(NUM_ROUNDS):
        if rng.random() < 0.5:
            child.append(list(parent_a[i]))
        else:
            child.append(list(parent_b[i]))
    return child


def _replay_to_round(
    chromosome: Chromosome,
    base_grid: np.ndarray,
    target_round: int,
) -> tuple[np.ndarray, list[tuple[int, int]], set[tuple[int, int]]]:
    """Replay chromosome up to (but not including) target_round, returning grid state."""
    grid = copy_grid(base_grid)
    segments = find_route(grid)
    assert segments is not None
    flat_route = flatten_route(segments)
    route_set = set(flat_route)

    for r in range(target_round):
        positions = chromosome[r]
        placed: list[tuple[int, int]] = []
        for x, y in positions:
            if not can_place_2x2(grid, x, y):
                continue
            fc = footprint_cells(x, y)
            if fc & route_set:
                if find_route(grid, fc) is None:
                    continue
            place_tower(grid, x, y)
            placed.append((x, y))
            if fc & route_set:
                new_seg = find_route(grid)
                if new_seg:
                    flat_route = flatten_route(new_seg)
                    route_set = set(flat_route)

        if placed:
            best_keeper = max(
                range(len(placed)),
                key=lambda i: exposure_at_flat(placed[i][0], placed[i][1], flat_route),
            )
            for i, (px, py) in enumerate(placed):
                if i != best_keeper:
                    place_tower(grid, px, py, Cell.Rock)
            new_seg = find_route(grid)
            if new_seg:
                flat_route = flatten_route(new_seg)
                route_set = set(flat_route)

    return grid, flat_route, route_set


def _greedy_round(
    grid: np.ndarray,
    flat_route: list[tuple[int, int]],
    route_set: set[tuple[int, int]],
    rng: random.Random,
    max_candidates: int = 200,
) -> list[tuple[int, int]]:
    """Generate one round of greedy placements on the given grid state."""
    grid = copy_grid(grid)
    positions: list[tuple[int, int]] = []
    w_exp = 0.5 + rng.uniform(-0.3, 0.3)
    w_maze = 3.0 + rng.uniform(-0.5, 0.5)

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
            for fx, fy in flat_try:
                ddx = fx - tcx
                ddy = fy - tcy
                if ddx * ddx + ddy * ddy <= KEEPER_R2:
                    exp += 1
            maze_gain = len(flat_try) - route_len
            score = exp * w_exp + maze_gain * w_maze
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
            new_seg = find_route(grid)
            if new_seg:
                flat_route = flatten_route(new_seg)
                route_set = set(flat_route)

    while len(positions) < GEMS_PER_ROUND:
        positions.append(positions[-1] if positions else (PLACE_MIN, PLACE_MIN))
    return positions


def mutate(chromosome: Chromosome, rng: random.Random, base_grid: np.ndarray | None = None) -> int:
    """Mutate chromosome in place. Returns index of first modified round."""
    r = rng.random()

    if r < 0.15:
        # Small perturbation (±5)
        round_idx = rng.randint(0, NUM_ROUNDS - 1)
        pos_idx = rng.randint(0, GEMS_PER_ROUND - 1)
        x, y = chromosome[round_idx][pos_idx]
        dx = rng.randint(-5, 5)
        dy = rng.randint(-5, 5)
        chromosome[round_idx][pos_idx] = (
            max(PLACE_MIN, min(PLACE_MAX_X, x + dx)),
            max(PLACE_MIN, min(PLACE_MAX_Y, y + dy)),
        )
        return round_idx

    elif r < 0.25:
        # Large perturbation (±15)
        round_idx = rng.randint(0, NUM_ROUNDS - 1)
        pos_idx = rng.randint(0, GEMS_PER_ROUND - 1)
        x, y = chromosome[round_idx][pos_idx]
        dx = rng.randint(-15, 15)
        dy = rng.randint(-15, 15)
        chromosome[round_idx][pos_idx] = (
            max(PLACE_MIN, min(PLACE_MAX_X, x + dx)),
            max(PLACE_MIN, min(PLACE_MAX_Y, y + dy)),
        )
        return round_idx

    elif r < 0.35:
        # Random position
        round_idx = rng.randint(0, NUM_ROUNDS - 1)
        pos_idx = rng.randint(0, GEMS_PER_ROUND - 1)
        chromosome[round_idx][pos_idx] = (
            rng.randint(PLACE_MIN, PLACE_MAX_X),
            rng.randint(PLACE_MIN, PLACE_MAX_Y),
        )
        return round_idx

    elif r < 0.45:
        # Swap within round
        round_idx = rng.randint(0, NUM_ROUNDS - 1)
        i, j = rng.sample(range(GEMS_PER_ROUND), 2)
        chromosome[round_idx][i], chromosome[round_idx][j] = (
            chromosome[round_idx][j],
            chromosome[round_idx][i],
        )
        return round_idx

    elif r < 0.55:
        # Swap between rounds
        r1, r2 = rng.sample(range(NUM_ROUNDS), 2)
        p1 = rng.randint(0, GEMS_PER_ROUND - 1)
        p2 = rng.randint(0, GEMS_PER_ROUND - 1)
        chromosome[r1][p1], chromosome[r2][p2] = chromosome[r2][p2], chromosome[r1][p1]
        return min(r1, r2)

    elif r < 0.85:
        # Greedy round re-optimize
        if base_grid is not None:
            round_idx = rng.randint(0, NUM_ROUNDS - 1)
            grid, flat_route, route_set = _replay_to_round(chromosome, base_grid, round_idx)
            chromosome[round_idx] = _greedy_round(grid, flat_route, route_set, rng)
            return round_idx
        # Fallback: small perturbation
        round_idx = rng.randint(0, NUM_ROUNDS - 1)
        pos_idx = rng.randint(0, GEMS_PER_ROUND - 1)
        x, y = chromosome[round_idx][pos_idx]
        chromosome[round_idx][pos_idx] = (
            max(PLACE_MIN, min(PLACE_MAX_X, x + rng.randint(-5, 5))),
            max(PLACE_MIN, min(PLACE_MAX_Y, y + rng.randint(-5, 5))),
        )
        return round_idx

    elif r < 0.90:
        # Round permutation
        round_idx = rng.randint(0, NUM_ROUNDS - 1)
        rng.shuffle(chromosome[round_idx])
        return round_idx

    else:
        # Multi-position mutation (2-3 in same round)
        round_idx = rng.randint(0, NUM_ROUNDS - 1)
        count = rng.randint(2, 3)
        indices = rng.sample(range(GEMS_PER_ROUND), min(count, GEMS_PER_ROUND))
        for pos_idx in indices:
            x, y = chromosome[round_idx][pos_idx]
            chromosome[round_idx][pos_idx] = (
                max(PLACE_MIN, min(PLACE_MAX_X, x + rng.randint(-5, 5))),
                max(PLACE_MIN, min(PLACE_MAX_Y, y + rng.randint(-5, 5))),
            )
        return round_idx


def local_search(
    individual: Chromosome,
    base_grid: np.ndarray,
    rng: random.Random,
    iterations: int = 50,
    exposure_weight: float = 0.1,
) -> tuple[Chromosome, float]:
    """Hill-climbing on a single individual."""
    best = [list(r) for r in individual]
    best_result = evaluate(best, base_grid, exposure_weight)
    best_fitness = best_result["fitness"]
    best = best_result["chromosome"]

    for _ in range(iterations):
        candidate = [list(r) for r in best]
        round_idx = rng.randint(0, NUM_ROUNDS - 1)
        pos_idx = rng.randint(0, GEMS_PER_ROUND - 1)
        x, y = candidate[round_idx][pos_idx]
        candidate[round_idx][pos_idx] = (
            max(PLACE_MIN, min(PLACE_MAX_X, x + rng.randint(-5, 5))),
            max(PLACE_MIN, min(PLACE_MAX_Y, y + rng.randint(-5, 5))),
        )
        result = evaluate(candidate, base_grid, exposure_weight)
        if result["fitness"] > best_fitness:
            best_fitness = result["fitness"]
            best = result["chromosome"]

    return best, best_fitness


def evaluate_population(
    population: list[Chromosome],
    base_grid: np.ndarray,
    cores: int | None,
    exposure_weight: float = 0.1,
) -> list[dict]:
    if cores == 1:
        return [evaluate(ind, base_grid, exposure_weight) for ind in population]

    with Pool(cores, initializer=_init_worker, initargs=(base_grid, exposure_weight)) as pool:
        return pool.map(_evaluate_wrapper, population)


def run_ga(
    base_grid: np.ndarray | None = None,
    population_size: int = 200,
    generations: int = 500,
    tournament_size: int = 3,
    mutation_rate: float = 0.3,
    crossover_rate: float = 0.7,
    elite_pct: float = 0.05,
    cores: int | None = None,
    seed: int = 42,
    exposure_weight: float = 0.05,
) -> dict:
    if base_grid is None:
        base_grid = build_base_layout()

    rng = random.Random(seed)

    print(f"GA params: pop={population_size}, gen={generations}, tourn={tournament_size}, "
          f"exp_w={exposure_weight}, cores={cores}")
    print("Initializing population...")

    t0 = time.time()
    population = init_population(base_grid, population_size, rng)
    print(f"Population initialized in {time.time() - t0:.1f}s")

    print("Evaluating initial population...")
    t0 = time.time()
    results = evaluate_population(population, base_grid, cores, exposure_weight)
    print(f"Initial evaluation in {time.time() - t0:.1f}s")

    population = [r["chromosome"] for r in results]
    fitness_scores = [r["fitness"] for r in results]

    best_fitness = max(fitness_scores)
    best_idx = fitness_scores.index(best_fitness)
    best_result = results[best_idx]
    stagnation = 0

    r0 = results[best_idx]
    print(
        f"Gen 0: best={best_fitness:.1f} avg={sum(fitness_scores) / len(fitness_scores):.1f} "
        f"path={r0['path_length']} cum={r0['cumulative_path']} exp={r0['exposure_total']}"
    )

    elite_count = max(1, int(population_size * elite_pct))
    ls_count = min(5, elite_count)

    for gen in range(1, generations + 1):
        ranked = sorted(range(len(population)), key=lambda i: -fitness_scores[i])

        new_population: list[Chromosome] = [
            [list(r) for r in population[i]] for i in ranked[:elite_count]
        ]

        # Adaptive mutation rate
        effective_mutation = mutation_rate * (1.0 + stagnation / 25.0)

        # Immigration on stagnation
        if stagnation > 0 and stagnation % 10 == 0:
            immigrant_count = max(1, population_size // 20)
            for _ in range(immigrant_count):
                new_population.append(
                    create_greedy_individual(base_grid, rng, noise=2.0)
                )

        while len(new_population) < population_size:
            parent_a = tournament_select(
                population, fitness_scores, tournament_size, rng
            )
            parent_b = tournament_select(
                population, fitness_scores, tournament_size, rng
            )

            if rng.random() < crossover_rate:
                child = crossover(parent_a, parent_b, rng)
            else:
                child = [list(round_pos) for round_pos in parent_a]

            if rng.random() < effective_mutation:
                mutate(child, rng, base_grid)

            new_population.append(child)

        population = new_population[:population_size]

        t0 = time.time()
        results = evaluate_population(population, base_grid, cores, exposure_weight)
        eval_time = time.time() - t0

        population = [r["chromosome"] for r in results]
        fitness_scores = [r["fitness"] for r in results]

        gen_best = max(fitness_scores)
        gen_avg = sum(fitness_scores) / len(fitness_scores)
        gen_best_idx = fitness_scores.index(gen_best)

        if gen_best > best_fitness:
            best_fitness = gen_best
            best_result = results[gen_best_idx]
            stagnation = 0
        else:
            stagnation += 1

        # Local search on elites every 10 generations
        if gen % 5 == 0:
            for li in range(ls_count):
                idx = ranked[li] if li < len(ranked) else 0
                ls_chrom, ls_fit = local_search(
                    population[idx], base_grid, rng, iterations=100, exposure_weight=exposure_weight
                )
                if ls_fit > fitness_scores[idx]:
                    population[idx] = ls_chrom
                    fitness_scores[idx] = ls_fit
                    if ls_fit > best_fitness:
                        best_fitness = ls_fit
                        best_result = evaluate(ls_chrom, base_grid, exposure_weight)
                        stagnation = 0

        if gen % 5 == 0 or stagnation == 0:
            ri = results[gen_best_idx]
            print(
                f"Gen {gen}: best={gen_best:.1f} avg={gen_avg:.1f} "
                f"path={ri['path_length']} cum={ri['cumulative_path']} exp={ri['exposure_total']} "
                f"pen={ri['validity_penalty']} stag={stagnation} mut={effective_mutation:.2f} ({eval_time:.1f}s)"
            )

        if stagnation >= 150:
            print(f"Converged after {gen} generations (150 without improvement)")
            break

    return best_result
