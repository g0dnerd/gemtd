"""AI players for the Zig sim — Python ports of the TS heuristic AIs.

GreedyAI: exposure x 2 + mazeGain scoring, DPS-based keeper selection
BlueprintAI: follows MAZE_BLUEPRINT positions, falls back to Greedy
StrategistAI: weighted multi-factor keeper scoring with wave awareness
"""

from __future__ import annotations

from .sim import (
    SimWrapper,
    GameState,
    DrawSlot,
    TowerSnapshot,
    GRID_SCALE,
    PHASE_BUILD,
    PHASE_GAMEOVER,
    PHASE_VICTORY,
)
from .data import (
    gem_stats,
    COMBOS,
    COMBO_BY_KEY,
    find_all_combos_for,
    combo_stats_at_tier,
    next_upgrade,
    combo_input_cost,
    estimate_combo_dps,
    combo_value,
    MAX_CHANCE_TIER,
    GOLD_RESERVE,
    MAZE_BLUEPRINT,
    wave_has_air,
    wave_has_boss,
    NUM_WAVES,
)

FOOTPRINT = [(0, 0), (1, 0), (0, 1), (1, 1)]


def _exposure(route: list[tuple[int, int]], tx: int, ty: int, gem_range: float) -> int:
    """Count route points within tower's attack range."""
    cx = tx + 1
    cy = ty + 1
    r2 = (gem_range * GRID_SCALE) ** 2
    count = 0
    for rx, ry in route:
        dx = rx - cx
        dy = ry - cy
        if dx * dx + dy * dy <= r2:
            count += 1
    return count


class GreedyAI:
    name = "GreedyAI"

    def play_build(self, sim: SimWrapper) -> None:
        state = sim.get_state()

        if state.wave > 1:
            self._upgrade_chance_tier(sim, state)
            self._upgrade_combo_towers(sim)
            sim.start_placement()

        self._place_gems(sim)
        self._try_combos(sim)

        state = sim.get_state()
        if state.phase == PHASE_BUILD:
            self._designate_keeper(sim)

    def _upgrade_chance_tier(self, sim: SimWrapper, state: GameState) -> None:
        while state.chance_tier < MAX_CHANCE_TIER:
            if not sim.upgrade_chance_tier():
                break
            state = sim.get_state()

    def _upgrade_combo_towers(self, sim: SimWrapper) -> None:
        state = sim.get_state()
        towers = sim.get_towers()
        upgradeable = []
        for t in towers:
            if not t.combo_key:
                continue
            combo = COMBO_BY_KEY.get(t.combo_key)
            if not combo:
                continue
            nxt = next_upgrade(combo, t.upgrade_tier)
            if not nxt:
                continue
            upgradeable.append((t.id, nxt.cost))

        upgradeable.sort(key=lambda x: x[1])
        for tower_id, cost in upgradeable:
            state = sim.get_state()
            if state.gold - cost < GOLD_RESERVE:
                continue
            sim.upgrade_tower(tower_id)

    def _place_gems(self, sim: SimWrapper) -> None:
        for _ in range(5):
            draws = sim.get_draws()
            state = sim.get_state()
            route = sim.get_route()
            route_len = state.route_length
            towers = sim.get_towers()

            active = next((d for d in draws if d.placed_tower_id is None), None)
            if active is None:
                break

            stats = gem_stats(active.gem, active.quality)

            candidates = self._get_candidates(sim, towers)
            if not candidates:
                candidates = self._find_any_open(sim)
                if not candidates:
                    break

            best_pos = None
            best_score = float("-inf")

            for cx, cy in candidates:
                new_route_len = sim.try_place_route_len(cx, cy)
                if new_route_len < 0:
                    continue

                exp = _exposure(route, cx, cy, stats.range)
                maze_gain = new_route_len - route_len
                score = exp * 2 + maze_gain

                if score > best_score:
                    best_score = score
                    best_pos = (cx, cy)

            if best_pos:
                sim.place_gem(active.slot_id, best_pos[0], best_pos[1])

    def _get_candidates(
        self, sim: SimWrapper, towers: list[TowerSnapshot]
    ) -> list[tuple[int, int]]:
        """Get valid placements filtered to positions near existing maze."""
        all_valid = sim.get_valid_placements()
        if not towers:
            return all_valid

        tower_set = set()
        for t in towers:
            for dx in range(-1, 3):
                for dy in range(-1, 3):
                    tower_set.add((t.x + dx, t.y + dy))

        near = []
        for x, y in all_valid:
            for dx in range(-1, 3):
                for dy in range(-1, 3):
                    if (x + dx, y + dy) in tower_set:
                        near.append((x, y))
                        break
                else:
                    continue
                break

        return near if near else all_valid

    def _find_any_open(self, sim: SimWrapper) -> list[tuple[int, int]]:
        valid = sim.get_valid_placements()
        return valid[:1] if valid else []

    def _try_combos(self, sim: SimWrapper) -> None:
        state = sim.get_state()
        if state.phase != PHASE_BUILD:
            return

        draws = sim.get_draws()
        current_round_ids = {
            d.placed_tower_id for d in draws if d.placed_tower_id is not None
        }
        towers = sim.get_towers()

        best_individual_dps = self._best_round_gem_dps(towers, current_round_ids)

        ranked = sorted(
            [c for c in COMBOS if c.inputs],
            key=lambda c: combo_input_cost(c),
            reverse=True,
        )

        for combo in ranked:
            state = sim.get_state()
            if state.phase != PHASE_BUILD:
                return
            towers = sim.get_towers()

            matched = _match_combo_inputs(combo, towers)
            if not matched:
                continue

            matched_ids = [t.id for t in matched]
            all_current = all(t.id in current_round_ids for t in matched)
            uses_kept = any(t.id not in current_round_ids for t in matched)

            if all_current:
                sim.combine(matched_ids)
            elif uses_kept:
                combo_dps = estimate_combo_dps(combo)
                if combo_dps < best_individual_dps:
                    continue
                sim.combine(matched_ids)
            else:
                sim.combine(matched_ids)

        # Level-up combines
        state = sim.get_state()
        if state.phase != PHASE_BUILD:
            return

        draws = sim.get_draws()
        fresh_round_ids = {
            d.placed_tower_id for d in draws if d.placed_tower_id is not None
        }
        towers = sim.get_towers()
        round_towers = [
            t for t in towers if t.id in fresh_round_ids and not t.combo_key
        ]

        groups: dict[str, list[TowerSnapshot]] = {}
        for t in round_towers:
            key = f"{t.gem}:{t.quality}"
            groups.setdefault(key, []).append(t)

        for towers_group in groups.values():
            state = sim.get_state()
            if state.phase != PHASE_BUILD:
                return
            q = towers_group[0].quality
            can4 = len(towers_group) >= 4 and q <= 4
            can2 = len(towers_group) >= 2 and q <= 4
            count = 4 if can4 else (2 if can2 else 0)
            if count == 0:
                continue

            result_q = min(5, q + (2 if count == 4 else 1))
            combine_ids = {t.id for t in towers_group[:count]}

            if not self._should_level_up(
                towers_group[0].gem, result_q, combine_ids, round_towers
            ):
                continue
            sim.combine([t.id for t in towers_group[:count]])

    def _should_level_up(
        self,
        gem: str,
        result_quality: int,
        combine_ids: set[int],
        round_towers: list[TowerSnapshot],
    ) -> bool:
        for t in round_towers:
            if t.id in combine_ids or t.combo_key:
                continue
            if t.gem == gem and t.quality >= result_quality:
                return False
            if t.quality > result_quality:
                return False
        return True

    def _best_round_gem_dps(
        self, towers: list[TowerSnapshot], current_round_ids: set[int]
    ) -> float:
        best = 0.0
        for t in towers:
            if t.id not in current_round_ids or t.combo_key:
                continue
            stats = gem_stats(t.gem, t.quality)
            avg_dmg = (stats.dmg_min + stats.dmg_max) / 2
            dps = avg_dmg * stats.atk_speed
            for e in stats.effects:
                if e.kind == "splash":
                    dps *= 1.5
                elif e.kind == "chain":
                    dps *= 1 + e.bounces * 0.3
                elif e.kind == "poison":
                    dps += e.dps * e.duration * 0.3
                elif e.kind == "crit":
                    dps *= 1 + e.chance * (e.multiplier - 1)
            if stats.targeting == "air":
                dps *= 0.25
            elif stats.targeting == "ground":
                dps *= 0.7
            best = max(best, dps)
        return best

    def _designate_keeper(self, sim: SimWrapper) -> None:
        draws = sim.get_draws()
        current_round_ids = {
            d.placed_tower_id for d in draws if d.placed_tower_id is not None
        }
        towers = sim.get_towers()
        round_towers = [t for t in towers if t.id in current_round_ids]
        kept_towers = [
            t for t in towers if t.id not in current_round_ids and not t.combo_key
        ]

        if not round_towers:
            return

        route = sim.get_route()
        best_id = round_towers[0].id
        best_score = float("-inf")

        for tower in round_towers:
            stats = gem_stats(tower.gem, tower.quality)
            avg_dmg = (stats.dmg_min + stats.dmg_max) / 2
            exp = _exposure(route, tower.x, tower.y, stats.range)
            score = avg_dmg * stats.atk_speed * max(1, exp)

            for e in stats.effects:
                if e.kind == "splash":
                    score *= 1.5
                elif e.kind == "chain":
                    score *= 1 + e.bounces * 0.3
                elif e.kind == "aura_atkspeed":
                    aura_r2 = (e.radius * GRID_SCALE) ** 2
                    nearby = sum(
                        1
                        for o in towers
                        if o.id != tower.id
                        and (o.x - tower.x) ** 2 + (o.y - tower.y) ** 2 <= aura_r2
                    )
                    score *= 1 + nearby * 0.4

            if stats.targeting == "air":
                score *= 0.3
            elif stats.targeting == "ground":
                score *= 0.7

            combo_bonus = _combo_ingredient_bonus(tower, kept_towers)
            score += combo_bonus

            same_gem_kept = sum(
                1 for t in kept_towers if t.gem == tower.gem and not t.combo_key
            )
            if same_gem_kept > 0 and combo_bonus == 0:
                score *= 0.5

            if score > best_score:
                best_score = score
                best_id = tower.id

        sim.designate_keeper(best_id)


# ── BlueprintAI ─────────────────────────────────────────────────────


class BlueprintAI(GreedyAI):
    name = "BlueprintAI"

    def __init__(self):
        self._keeper_indices = _compute_keeper_indices()

    def _place_gems(self, sim: SimWrapper) -> None:
        state = sim.get_state()
        round_index = state.wave - 1

        if round_index < 0 or round_index >= len(MAZE_BLUEPRINT):
            super()._place_gems(sim)
            return

        positions = MAZE_BLUEPRINT[round_index]
        keeper_pos_idx = (
            self._keeper_indices[round_index]
            if round_index < len(self._keeper_indices)
            else -1
        )

        draws = sim.get_draws()
        unplaced = [d for d in draws if d.placed_tower_id is None]
        slot_order = self._build_slot_order(unplaced, keeper_pos_idx, len(positions))

        pos_idx = 0
        for slot_id in slot_order:
            state = sim.get_state()
            if state.phase != PHASE_BUILD:
                break
            draws = sim.get_draws()
            slot = next((d for d in draws if d.slot_id == slot_id), None)
            if not slot or slot.placed_tower_id is not None:
                continue

            if pos_idx < len(positions):
                x, y = positions[pos_idx]
                ok, _ = sim.place_gem(slot_id, x, y)
                if ok:
                    pos_idx += 1
                    continue

            pos_idx += 1
            self._fallback_place(sim, slot_id)

    def _build_slot_order(
        self, unplaced: list[DrawSlot], keeper_pos_idx: int, position_count: int
    ) -> list[int]:
        if not unplaced:
            return []
        if keeper_pos_idx < 0 or keeper_pos_idx >= position_count:
            return [d.slot_id for d in unplaced]

        ranked = []
        for d in unplaced:
            stats = gem_stats(d.gem, d.quality)
            avg_dmg = (stats.dmg_min + stats.dmg_max) / 2
            dps = avg_dmg * stats.atk_speed
            for e in stats.effects:
                if e.kind == "splash":
                    dps *= 1.5
                elif e.kind == "chain":
                    dps *= 1 + e.bounces * 0.3
                elif e.kind == "poison":
                    dps += e.dps * e.duration * 0.3
                elif e.kind == "crit":
                    dps *= 1 + e.chance * (e.multiplier - 1)
            if stats.targeting == "air":
                dps *= 0.3
            elif stats.targeting == "ground":
                dps *= 0.7
            ranked.append((d.slot_id, dps))

        ranked.sort(key=lambda x: x[1], reverse=True)
        best_slot = ranked[0][0]
        rest = [r[0] for r in ranked[1:]]

        order = []
        for i in range(max(position_count, len(unplaced))):
            if i == keeper_pos_idx:
                order.append(best_slot)
            else:
                if rest:
                    order.append(rest.pop(0))
        if best_slot not in order:
            order.insert(keeper_pos_idx, best_slot)

        return order

    def _fallback_place(self, sim: SimWrapper, slot_id: int) -> None:
        draws = sim.get_draws()
        slot = next((d for d in draws if d.slot_id == slot_id), None)
        if not slot or slot.placed_tower_id is not None:
            return

        state = sim.get_state()
        route = sim.get_route()
        route_len = state.route_length
        towers = sim.get_towers()
        stats = gem_stats(slot.gem, slot.quality)

        candidates = self._get_candidates(sim, towers)
        if not candidates:
            candidates = self._find_any_open(sim)
            if not candidates:
                return

        best_pos = None
        best_score = float("-inf")

        for cx, cy in candidates:
            new_rl = sim.try_place_route_len(cx, cy)
            if new_rl < 0:
                continue
            exp = _exposure(route, cx, cy, stats.range)
            maze_gain = new_rl - route_len
            score = exp * 2 + maze_gain
            if score > best_score:
                best_score = score
                best_pos = (cx, cy)

        if best_pos:
            sim.place_gem(slot_id, best_pos[0], best_pos[1])

    def _designate_keeper(self, sim: SimWrapper) -> None:
        state = sim.get_state()
        round_index = state.wave - 1

        if round_index < 0 or round_index >= len(self._keeper_indices):
            super()._designate_keeper(sim)
            return

        target_pos_idx = self._keeper_indices[round_index]
        draws = sim.get_draws()
        if target_pos_idx < len(draws):
            draw = draws[target_pos_idx]
            if draw.placed_tower_id is not None:
                sim.designate_keeper(draw.placed_tower_id)
                return

        super()._designate_keeper(sim)


# ── StrategistAI ────────────────────────────────────────────────────


class StrategistAI(BlueprintAI):
    name = "StrategistAI"

    def _upgrade_combo_towers(self, sim: SimWrapper) -> None:
        state = sim.get_state()
        reserve = max(10, state.wave * 2)
        towers = sim.get_towers()
        upgradeable = []

        for t in towers:
            if not t.combo_key:
                continue
            combo = COMBO_BY_KEY.get(t.combo_key)
            if not combo:
                continue
            current_tier = t.upgrade_tier
            upgrade = next_upgrade(combo, current_tier)
            if not upgrade:
                continue

            current_stats = combo_stats_at_tier(combo, current_tier)
            next_stats = upgrade.stats
            current_dps = (
                (current_stats.dmg_min + current_stats.dmg_max) / 2
            ) * current_stats.atk_speed
            next_dps = (
                (next_stats.dmg_min + next_stats.dmg_max) / 2
            ) * next_stats.atk_speed
            dps_gain_per_gold = (next_dps - current_dps) / upgrade.cost

            upgradeable.append((t.id, upgrade.cost, dps_gain_per_gold))

        upgradeable.sort(key=lambda x: x[2], reverse=True)

        for tower_id, cost, _ in upgradeable:
            state = sim.get_state()
            if state.gold - cost < reserve:
                continue
            sim.upgrade_tower(tower_id)

    def _try_combos(self, sim: SimWrapper) -> None:
        state = sim.get_state()
        if state.phase != PHASE_BUILD:
            return

        draws = sim.get_draws()
        current_round_ids = {
            d.placed_tower_id for d in draws if d.placed_tower_id is not None
        }
        towers = sim.get_towers()

        best_individual_dps = self._best_round_gem_dps(towers, current_round_ids)

        ranked = sorted(
            [c for c in COMBOS if c.inputs],
            key=lambda c: combo_value(c),
            reverse=True,
        )

        for combo in ranked:
            state = sim.get_state()
            if state.phase != PHASE_BUILD:
                return
            towers = sim.get_towers()

            matched = _match_combo_inputs(combo, towers)
            if not matched:
                continue

            matched_ids = [t.id for t in matched]
            all_current = all(t.id in current_round_ids for t in matched)
            uses_kept = any(t.id not in current_round_ids for t in matched)

            if all_current:
                sim.combine(matched_ids)
            elif uses_kept:
                if combo_value(combo) < best_individual_dps:
                    continue
                sim.combine(matched_ids)
            else:
                sim.combine(matched_ids)

        # Level-up combines
        state = sim.get_state()
        if state.phase != PHASE_BUILD:
            return

        draws = sim.get_draws()
        fresh_round_ids = {
            d.placed_tower_id for d in draws if d.placed_tower_id is not None
        }
        towers = sim.get_towers()
        fresh_round_towers = [
            t for t in towers if t.id in fresh_round_ids and not t.combo_key
        ]

        groups: dict[str, list[TowerSnapshot]] = {}
        for t in fresh_round_towers:
            key = f"{t.gem}:{t.quality}"
            groups.setdefault(key, []).append(t)

        for towers_group in groups.values():
            state = sim.get_state()
            if state.phase != PHASE_BUILD:
                return
            q = towers_group[0].quality
            can4 = len(towers_group) >= 4 and q <= 4
            can2 = len(towers_group) >= 2 and q <= 4
            count = 4 if can4 else (2 if can2 else 0)
            if count == 0:
                continue

            result_q = min(5, q + (2 if count == 4 else 1))
            combine_ids = {t.id for t in towers_group[:count]}
            if not self._should_level_up(
                towers_group[0].gem, result_q, combine_ids, fresh_round_towers
            ):
                continue
            sim.combine([t.id for t in towers_group[:count]])

    def _designate_keeper(self, sim: SimWrapper) -> None:
        state = sim.get_state()
        draws = sim.get_draws()
        current_round_ids = {
            d.placed_tower_id for d in draws if d.placed_tower_id is not None
        }
        towers = sim.get_towers()
        round_towers = [t for t in towers if t.id in current_round_ids]

        if not round_towers:
            return

        route = sim.get_route()
        wave_idx = min(state.wave - 1, NUM_WAVES - 1)
        has_air_next = wave_has_air(
            wave_idx + 2
        )  # +2 because wave is 1-based, looking at NEXT wave
        is_boss_next = wave_has_boss(wave_idx + 2)

        best_id = round_towers[0].id
        best_score = float("-inf")
        blueprint_keeper_id = None
        blueprint_keeper_score = float("-inf")

        round_index = state.wave - 1
        if 0 <= round_index < len(self._keeper_indices):
            target_pos_idx = self._keeper_indices[round_index]
            if target_pos_idx < len(draws):
                draw = draws[target_pos_idx]
                if draw.placed_tower_id is not None:
                    blueprint_keeper_id = draw.placed_tower_id

        kept_towers = [t for t in towers if t.id not in current_round_ids]

        for tower in round_towers:
            score = self._score_tower_keeper(
                tower,
                towers,
                kept_towers,
                route,
                has_air_next,
                is_boss_next,
            )
            if tower.id == blueprint_keeper_id:
                blueprint_keeper_score = score
            if score > best_score:
                best_score = score
                best_id = tower.id

        if (
            blueprint_keeper_id is not None
            and blueprint_keeper_score > 0
            and best_id != blueprint_keeper_id
            and best_score <= blueprint_keeper_score * 1.3
        ):
            best_id = blueprint_keeper_id

        sim.designate_keeper(best_id)

    def _score_tower_keeper(
        self,
        tower: TowerSnapshot,
        all_towers: list[TowerSnapshot],
        kept_towers: list[TowerSnapshot],
        route: list[tuple[int, int]],
        has_air_next: bool,
        is_boss_next: bool,
    ) -> float:
        if tower.combo_key:
            combo = COMBO_BY_KEY.get(tower.combo_key)
            if combo:
                stats = combo_stats_at_tier(combo, tower.upgrade_tier)
            else:
                stats = gem_stats(tower.gem, tower.quality)
        else:
            stats = gem_stats(tower.gem, tower.quality)

        avg_dmg = (stats.dmg_min + stats.dmg_max) / 2
        exp = _exposure(route, tower.x, tower.y, stats.range)

        exposure_dps = avg_dmg * stats.atk_speed * max(1, exp)
        for e in stats.effects:
            if e.kind == "splash":
                exposure_dps *= 1.5
            elif e.kind == "chain":
                exposure_dps *= 1 + e.bounces * 0.3
            elif e.kind == "aura_atkspeed":
                aura_r2 = (e.radius * GRID_SCALE) ** 2
                nearby = sum(
                    1
                    for o in all_towers
                    if o.id != tower.id
                    and (o.x - tower.x) ** 2 + (o.y - tower.y) ** 2 <= aura_r2
                )
                exposure_dps *= 1 + nearby * 0.4

        # Combo contribution
        combo_score = 0.0
        if not tower.combo_key:
            combos_for = find_all_combos_for(tower.gem, tower.quality)
            for combo in combos_for:
                readiness = _combo_readiness(combo, all_towers, tower.id)
                if readiness[1] == 0:  # missing == 0
                    combo_score += combo_value(combo) * 2
                elif readiness[1] == 1:
                    combo_score += combo_value(combo) * 1.2
                else:
                    combo_score += (
                        combo_value(combo) * (readiness[0] / readiness[2]) * 0.5
                    )
        elif tower.combo_key:
            combo = COMBO_BY_KEY.get(tower.combo_key)
            if combo:
                combo_score = combo_value(combo) * 1.5

        # Quality premium
        quality_premium = 0.0
        if tower.quality >= 3:
            quality_premium = avg_dmg * stats.atk_speed * (tower.quality - 2) * 0.5

        # Wave awareness
        wave_bonus = 0.0
        if has_air_next:
            if tower.gem == "amethyst" or stats.targeting == "all":
                wave_bonus += exposure_dps * 0.3
            if stats.targeting == "ground":
                wave_bonus -= exposure_dps * 0.3
        if is_boss_next:
            has_splash = any(e.kind == "splash" for e in stats.effects)
            if not has_splash:
                wave_bonus += exposure_dps * 0.15

        # Portfolio penalty
        portfolio_mult = 1.0
        if stats.targeting != "all" and len(kept_towers) >= 2:
            same_targeting = 0
            for t in kept_towers:
                if t.combo_key:
                    tc = COMBO_BY_KEY.get(t.combo_key)
                    if tc:
                        ts = combo_stats_at_tier(tc, t.upgrade_tier)
                    else:
                        ts = gem_stats(t.gem, t.quality)
                else:
                    ts = gem_stats(t.gem, t.quality)
                if ts.targeting == stats.targeting:
                    same_targeting += 1
            ratio = same_targeting / len(kept_towers)
            if ratio > 0.4:
                portfolio_mult = 0.5
            elif ratio > 0.25:
                portfolio_mult = 0.75

        # Diversity penalty
        if not tower.combo_key and combo_score == 0:
            same_gem_kept = sum(
                1 for t in kept_towers if t.gem == tower.gem and not t.combo_key
            )
            if same_gem_kept > 0:
                portfolio_mult *= 0.5

        return (
            exposure_dps * 0.3
            + combo_score * 0.4
            + quality_premium * 0.15
            + wave_bonus * 0.15
        ) * portfolio_mult


# ── Shared helpers ──────────────────────────────────────────────────


def _match_combo_inputs(
    combo, towers: list[TowerSnapshot]
) -> list[TowerSnapshot] | None:
    used: set[int] = set()
    result = []
    for inp in combo.inputs:
        match = None
        for t in towers:
            if (
                t.id not in used
                and t.gem == inp.gem
                and t.quality == inp.quality
                and not t.combo_key
            ):
                match = t
                break
        if match is None:
            return None
        used.add(match.id)
        result.append(match)
    return result


def _combo_ingredient_bonus(
    tower: TowerSnapshot, kept_towers: list[TowerSnapshot]
) -> float:
    if tower.combo_key:
        return 0
    relevant = find_all_combos_for(tower.gem, tower.quality)
    if not relevant:
        return 0

    best_bonus = 0.0
    for combo in relevant:
        needed = list(combo.inputs)
        self_idx = next(
            (
                i
                for i, inp in enumerate(needed)
                if inp.gem == tower.gem and inp.quality == tower.quality
            ),
            -1,
        )
        if self_idx < 0:
            continue
        needed.pop(self_idx)

        used: set[int] = set()
        have = 0
        for inp in needed:
            match = next(
                (
                    t
                    for t in kept_towers
                    if t.id not in used
                    and t.gem == inp.gem
                    and t.quality == inp.quality
                ),
                None,
            )
            if match:
                used.add(match.id)
                have += 1

        missing = len(needed) - have
        combo_dps = estimate_combo_dps(combo)

        if missing == 0:
            best_bonus = max(best_bonus, combo_dps * 3)
        elif missing == 1:
            best_bonus = max(best_bonus, combo_dps * 1.0)
        elif missing == 2 and len(needed) >= 3:
            best_bonus = max(best_bonus, combo_dps * 0.3)

    return best_bonus


def _combo_readiness(
    combo, towers: list[TowerSnapshot], exclude_id: int
) -> tuple[int, int, int]:
    """Returns (have, missing, total)."""
    total = len(combo.inputs)
    tower = next((t for t in towers if t.id == exclude_id), None)
    used: set[int] = set()
    matched_inputs: set[int] = set()
    have = 0

    if tower:
        for i, inp in enumerate(combo.inputs):
            if inp.gem == tower.gem and inp.quality == tower.quality:
                matched_inputs.add(i)
                have += 1
                break

    for i, inp in enumerate(combo.inputs):
        if i in matched_inputs:
            continue
        match = next(
            (
                t
                for t in towers
                if t.id != exclude_id
                and t.id not in used
                and t.gem == inp.gem
                and t.quality == inp.quality
                and not t.combo_key
            ),
            None,
        )
        if match:
            used.add(match.id)
            have += 1

    have = min(have, total)
    return (have, total - have, total)


def _compute_keeper_indices() -> list[int]:
    """Precompute which blueprint position should be kept each round.

    Replays blueprint placements through a temporary Zig sim to compute
    exposure-based keeper selection (mirrors TS computeKeeperIndices).
    """
    KEEPER_RANGE = 7
    KEEPER_R2 = KEEPER_RANGE * KEEPER_RANGE

    sim = SimWrapper(1)
    try:
        sim.new_game()

        keepers: list[int] = []
        for round_idx, positions in enumerate(MAZE_BLUEPRINT):
            state = sim.get_state()
            if state.phase != PHASE_BUILD:
                keepers.append(0)
                continue

            if round_idx > 0:
                sim.start_placement()

            # Place all 5 at blueprint positions (fallback to any valid pos)
            placed: list[tuple[int, int, int]] = []  # (x, y, blueprint_idx)
            for i, (x, y) in enumerate(positions):
                ok, _tid = sim.place_gem(i, x, y)
                if ok:
                    placed.append((x, y, i))
                else:
                    # Blueprint position blocked — place anywhere valid
                    valid = sim.get_valid_placements()
                    if valid:
                        ok2, _tid2 = sim.place_gem(i, valid[0][0], valid[0][1])
                        if ok2:
                            placed.append((valid[0][0], valid[0][1], i))

            if not placed:
                keepers.append(0)
                # Need to handle the wave somehow — skip
                state = sim.get_state()
                if state.phase == PHASE_BUILD:
                    sim.designate_keeper(-1)
                continue

            # Get route after all placements
            route = sim.get_route()
            route_set = set(route)

            # Compute exposure for each placed tower
            best_placed_idx = 0
            best_exp = -1
            for pi, (px, py, _bp_idx) in enumerate(placed):
                cx = px + 1
                cy = py + 1
                exp = 0
                for dx in range(-KEEPER_RANGE, KEEPER_RANGE + 1):
                    for dy in range(-KEEPER_RANGE, KEEPER_RANGE + 1):
                        if dx * dx + dy * dy > KEEPER_R2:
                            continue
                        if (cx + dx, cy + dy) in route_set:
                            exp += 1
                if exp > best_exp:
                    best_exp = exp
                    best_placed_idx = pi

            keeper_bp_idx = placed[best_placed_idx][2]
            keepers.append(keeper_bp_idx)

            # Designate the keeper and let the sim transition
            draws = sim.get_draws()
            keeper_draw = next(
                (
                    d
                    for d in draws
                    if d.slot_id == keeper_bp_idx and d.placed_tower_id is not None
                ),
                None,
            )
            if keeper_draw:
                sim.designate_keeper(keeper_draw.placed_tower_id)
            else:
                first_placed = next(
                    (d for d in draws if d.placed_tower_id is not None), None
                )
                if first_placed:
                    sim.designate_keeper(first_placed.placed_tower_id)

            # Advance: start wave if still in build, then run it
            state = sim.get_state()
            if state.phase == PHASE_BUILD:
                sim.start_wave()
            state = sim.get_state()
            if state.phase == 2:  # wave
                sim.run_wave()
            elif state.phase == PHASE_BUILD:
                # Still stuck in build — bail
                keepers.extend([0] * (len(MAZE_BLUEPRINT) - len(keepers)))
                break

            state = sim.get_state()
            if state.phase == PHASE_GAMEOVER or state.phase == PHASE_VICTORY:
                # Fill remaining rounds with 0
                keepers.extend([0] * (len(MAZE_BLUEPRINT) - len(keepers)))
                break

        return keepers
    finally:
        sim.close()


ALL_AIS = [
    GreedyAI(),
    BlueprintAI(),
    StrategistAI(),
]
