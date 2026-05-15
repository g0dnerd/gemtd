"""Game data tables — gem stats, combos, constants, blueprint.

Ported from src/data/gems.ts, src/data/combos.ts, src/game/constants.ts,
and src/data/maze-blueprint.ts. These must stay in sync with the TS sources.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ── Constants ───────────────────────────────────────────────────────

TILE = 36
GRID_SCALE = 2
FINE_TILE = TILE / GRID_SCALE
GRID_W = 42
GRID_H = 42
MAX_CHANCE_TIER = 8
GOLD_RESERVE = 20

QUALITY_DMG_MULT = {1: 1.0, 2: 2.2, 3: 5.0, 4: 11.0, 5: 22.0}
QUALITY_RANGE_BONUS = {1: 0.0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1.0}
QUALITY_SPEED_BONUS = {1: 1.0, 2: 1.05, 3: 1.1, 4: 1.18, 5: 1.3}
QUALITY_BASE_COST = {1: 12, 2: 60, 3: 250, 4: 1000, 5: 4000}

CHANCE_TIER_UPGRADE_COST = [25, 75, 120, 160, 210, 260, 300, 350]


# ── Effects ─────────────────────────────────────────────────────────

@dataclass
class Effect:
    kind: str
    # Shared fields — populated per-kind
    factor: float = 0.0
    duration: float = 0.0
    chance: float = 0.0
    dps: float = 0.0
    radius: float = 0.0
    falloff: float = 0.0
    bounces: int = 0
    multiplier: float = 0.0
    pct: float = 0.0
    count: int = 0
    value: float = 0.0
    ramp_per_hit: float = 0.0
    max_stacks: int = 0
    targets: str = "all"
    distance: float = 0.0
    ramp_pct: float = 0.0
    ramp_cap: float = 0.0
    hp_pct: float = 0.0
    speed_threshold: float = 0.0
    dmg_bonus: float = 0.0
    hp_threshold: float = 0.0
    pct_per_hit: float = 0.0
    max_bonus: float = 0.0
    every_n: int = 0
    interval: float = 0.0
    per_hit: float = 0.0
    decay_interval: float = 0.0
    armor_per_sec: float = 0.0
    max_reduction: float = 0.0


# ── Gem stats ───────────────────────────────────────────────────────

@dataclass
class GemBase:
    name: str
    base_dmg: float
    spread: float
    base_range: float
    base_atk_speed: float
    effects: list[Effect]
    targeting: str  # "all", "ground", "air"
    quality_dmg_mult: dict[int, float] | None = None


GEM_BASE: dict[str, GemBase] = {
    "ruby": GemBase("Ruby", 15, 0.2, 3.5, 1.0,
                     [Effect("splash", radius=1.0, falloff=0.5)], "all",
                     quality_dmg_mult={1: 0.9, 2: 2.0, 3: 4.5, 4: 9.0, 5: 18.0}),
    "sapphire": GemBase("Sapphire", 15, 0.15, 4.0, 0.9,
                         [Effect("slow", factor=0.7, duration=1.5)], "all"),
    "emerald": GemBase("Emerald", 13, 0.15, 3.5, 1.0,
                        [Effect("poison", dps=11, duration=4)], "all"),
    "topaz": GemBase("Topaz", 8, 0.2, 3.0, 1.6,
                      [Effect("chain", bounces=2, falloff=0.6)], "all"),
    "amethyst": GemBase("Amethyst", 21, 0.2, 4.5, 0.9,
                         [Effect("true", chance=0.3), Effect("air_bonus", multiplier=2.5)], "all"),
    "opal": GemBase("Opal", 4, 0.2, 3.0, 0.7,
                     [Effect("aura_atkspeed", radius=3.0, pct=0.10)], "all"),
    "diamond": GemBase("Diamond", 25, 0.3, 4.0, 0.8,
                        [Effect("crit", chance=0.25, multiplier=2.0)], "ground"),
    "aquamarine": GemBase("Aquamarine", 2, 0.15, 3.0, 3.0,
                           [Effect("beam_ramp", ramp_per_hit=0.21, max_stacks=30)], "all"),
}


@dataclass
class GemStats:
    gem: str
    quality: int
    dmg_min: int
    dmg_max: int
    range: float
    atk_speed: float
    cost: int
    effects: list[Effect]
    targeting: str


def _scale_effects(effects: list[Effect], quality: int, dmg_scale: float) -> list[Effect]:
    result = []
    for e in effects:
        e2 = Effect(e.kind)
        # Copy all fields
        for f in e.__dataclass_fields__:
            setattr(e2, f, getattr(e, f))

        if e.kind == "poison":
            e2.dps = e.dps * dmg_scale
        elif e.kind == "splash":
            e2.radius = e.radius * (1 + (quality - 1) * 0.08)
            e2.falloff = e.falloff
        elif e.kind == "chain":
            e2.bounces = e.bounces + (quality - 1)
        elif e.kind == "stun":
            e2.chance = min(0.5, e.chance + (quality - 1) * 0.04)
        elif e.kind == "crit":
            e2.chance = min(0.6, e.chance + (quality - 1) * 0.03)
            e2.multiplier = e.multiplier * 0.9 if quality >= 3 else e.multiplier
        elif e.kind == "slow":
            e2.factor = max(0.4, e.factor - (quality - 1) * 0.04)
        elif e.kind == "true":
            e2.chance = min(0.5, e.chance + (quality - 1) * 0.04)
        elif e.kind == "air_bonus":
            e2.multiplier = e.multiplier + (quality - 1) * 0.25
        elif e.kind == "aura_atkspeed":
            e2.pct = e.pct + (quality - 1) * 0.03
            e2.radius = e.radius + QUALITY_RANGE_BONUS[quality]
        elif e.kind == "beam_ramp":
            e2.ramp_per_hit = round(e.ramp_per_hit + (quality - 1) * 0.01, 2)
        elif e.kind == "prox_burn":
            e2.dps = e.dps * dmg_scale
            e2.radius = e.radius * (1 + (quality - 1) * 0.08)
        elif e.kind == "prox_slow":
            e2.factor = max(0.3, e.factor - (quality - 1) * 0.04)
        elif e.kind == "armor_reduce":
            e2.value = e.value + (quality - 1)
            e2.duration = e.duration + (quality - 1) * 0.5

        result.append(e2)
    return result


_gem_stats_cache: dict[tuple[str, int], GemStats] = {}


def gem_stats(gem: str, quality: int) -> GemStats:
    key = (gem, quality)
    if key in _gem_stats_cache:
        return _gem_stats_cache[key]

    base = GEM_BASE[gem]
    if base.quality_dmg_mult and quality in base.quality_dmg_mult:
        dmg_mult = base.quality_dmg_mult[quality]
    else:
        dmg_mult = QUALITY_DMG_MULT[quality]

    dmg_mid = base.base_dmg * dmg_mult
    half = dmg_mid * base.spread
    atk_speed = round(base.base_atk_speed * QUALITY_SPEED_BONUS[quality], 2)

    stats = GemStats(
        gem=gem,
        quality=quality,
        dmg_min=round(dmg_mid - half),
        dmg_max=round(dmg_mid + half),
        range=base.base_range + QUALITY_RANGE_BONUS[quality],
        atk_speed=atk_speed,
        cost=QUALITY_BASE_COST[quality],
        effects=_scale_effects(base.effects, quality, dmg_mult),
        targeting=base.targeting,
    )
    _gem_stats_cache[key] = stats
    return stats


# ── Combo data ──────────────────────────────────────────────────────

@dataclass
class ComboInput:
    gem: str
    quality: int


@dataclass
class ComboStats:
    dmg_min: int
    dmg_max: int
    range: float
    atk_speed: float
    effects: list[Effect]
    targeting: str


@dataclass
class UpgradeTier:
    name: str
    cost: int
    stats: ComboStats


@dataclass
class ComboRecipe:
    key: str
    name: str
    inputs: list[ComboInput]
    stats: ComboStats
    upgrades: list[UpgradeTier]
    visual_gem: str
    is_trap: bool = False


def _cs(dmg_min: int, dmg_max: int, rng: float, atk: float,
         effs: list[Effect], tgt: str = "all") -> ComboStats:
    return ComboStats(dmg_min, dmg_max, rng, atk, effs, tgt)


COMBOS: list[ComboRecipe] = [
    ComboRecipe("black_opal", "Black Opal",
                [ComboInput("opal", 5), ComboInput("diamond", 4), ComboInput("aquamarine", 3)],
                _cs(80, 120, 4.0, 1.0, [Effect("aura_dmg", radius=4.0, pct=0.3)]),
                [UpgradeTier("Void Opal", 300, _cs(120, 180, 4.5, 1.0,
                    [Effect("aura_dmg", radius=4.5, pct=0.35), Effect("vulnerability_aura", radius=4.5, pct=0.2)]))],
                "opal"),
    ComboRecipe("bloodstone", "Bloodstone",
                [ComboInput("ruby", 5), ComboInput("aquamarine", 4), ComboInput("amethyst", 3)],
                _cs(280, 420, 4.0, 1.0, [Effect("splash", radius=2.0, falloff=0.5)]),
                [UpgradeTier("Ancient Bloodstone", 310, _cs(320, 540, 4.0, 1.0,
                    [Effect("splash", radius=2.5, falloff=0.5), Effect("crit", chance=0.35, multiplier=3.0)]))],
                "ruby"),
    ComboRecipe("dark_emerald", "Dark Emerald",
                [ComboInput("emerald", 5), ComboInput("sapphire", 4), ComboInput("topaz", 2)],
                _cs(200, 320, 4.5, 1.1, [Effect("stun", chance=0.125, duration=1.0)]),
                [UpgradeTier("Venomous Emerald", 250, _cs(260, 400, 4.75, 1.2,
                    [Effect("stun", chance=0.15, duration=2.0), Effect("poison", dps=90, duration=3),
                     Effect("death_spread", count=2, radius=2.5)]))],
                "emerald"),
    ComboRecipe("gold", "Gold",
                [ComboInput("amethyst", 5), ComboInput("amethyst", 4), ComboInput("diamond", 2)],
                _cs(220, 310, 4.0, 1.0, [Effect("crit", chance=0.25, multiplier=3.0),
                                          Effect("armor_reduce", value=5, duration=5)]),
                [UpgradeTier("Pharaoh's Gold", 210, _cs(280, 440, 4.0, 1.0,
                    [Effect("crit", chance=0.28, multiplier=3.5), Effect("crit_splash", radius=1.5, falloff=0.5),
                     Effect("prox_armor_reduce", radius=4.0, value=6, targets="ground")]))],
                "topaz"),
    ComboRecipe("jade", "Jade",
                [ComboInput("emerald", 3), ComboInput("opal", 3), ComboInput("sapphire", 2)],
                _cs(50, 80, 4.0, 1.0, [Effect("poison", dps=30, duration=2),
                                        Effect("slow", factor=0.5, duration=2.0)]),
                [UpgradeTier("Asian Jade", 45, _cs(80, 120, 4.0, 1.0,
                    [Effect("poison", dps=35, duration=3), Effect("slow", factor=0.5, duration=3.0)])),
                 UpgradeTier("Lucky Asian Jade", 250, _cs(300, 450, 4.25, 1.3,
                    [Effect("poison", dps=110, duration=4), Effect("slow", factor=0.5, duration=4.0),
                     Effect("crit", chance=0.1, multiplier=6.0), Effect("stun", chance=0.03, duration=2.0),
                     Effect("bonus_gold", chance=0.05)]))],
                "emerald"),
    ComboRecipe("malachite", "Malachite",
                [ComboInput("opal", 1), ComboInput("emerald", 1), ComboInput("aquamarine", 1)],
                _cs(14, 22, 3.5, 1.4, [Effect("multi_target", count=3)]),
                [UpgradeTier("Vivid Malachite", 25, _cs(30, 46, 3.75, 1.5, [Effect("multi_target", count=3)])),
                 UpgradeTier("Mighty Malachite", 280, _cs(70, 100, 4.0, 1.8, [Effect("multi_target", count=10)]))],
                "emerald"),
    ComboRecipe("pink_diamond", "Pink Diamond",
                [ComboInput("diamond", 5), ComboInput("topaz", 3), ComboInput("diamond", 3)],
                _cs(250, 350, 4.5, 1.0, [Effect("crit", chance=0.1, multiplier=5.0)], "ground"),
                [UpgradeTier("Living Diamond", 250, _cs(300, 520, 4.75, 1.1,
                    [Effect("crit", chance=0.12, multiplier=6), Effect("focus_crit", pct_per_hit=0.03, max_bonus=0.15),
                     Effect("execute", dmg_bonus=0.5, hp_threshold=0.25)], "ground"))],
                "ruby"),
    ComboRecipe("silver", "Silver",
                [ComboInput("topaz", 1), ComboInput("diamond", 1), ComboInput("sapphire", 1)],
                _cs(24, 31, 3.5, 1.25, [Effect("splash", radius=1.2, falloff=0.5),
                                          Effect("slow", factor=0.75, duration=1.5)]),
                [UpgradeTier("Frosted Silver", 25, _cs(40, 54, 3.75, 1.1,
                    [Effect("splash", radius=1.5, falloff=0.5), Effect("slow", factor=0.72, duration=1.5),
                     Effect("freeze_chance", chance=0.1, duration=0.8)])),
                 UpgradeTier("Silver Knight", 300, _cs(320, 360, 4.0, 1.1,
                    [Effect("splash", radius=1.8, falloff=0.5), Effect("slow", factor=0.55, duration=2.0),
                     Effect("freeze_chance", chance=0.15, duration=1.0), Effect("periodic_nova", every_n=7)]))],
                "diamond"),
    ComboRecipe("star_ruby", "Star Ruby",
                [ComboInput("ruby", 2), ComboInput("ruby", 1), ComboInput("amethyst", 1)],
                _cs(0, 0, 2.275, 1.0, [Effect("prox_burn", dps=34, radius=2.275)]),
                [UpgradeTier("Plasma Star", 30, _cs(0, 0, 2.4375, 1.0,
                    [Effect("prox_burn_ramp", dps=36, radius=2.4375, ramp_pct=0.08, ramp_cap=0.8)])),
                 UpgradeTier("Solar Core", 290, _cs(0, 0, 2.6, 1.0,
                    [Effect("prox_burn_ramp", dps=95, radius=2.6, ramp_pct=0.12, ramp_cap=1.5),
                     Effect("armor_pierce_burn"), Effect("death_nova", hp_pct=0.08, radius=2.0)]))],
                "ruby"),
    ComboRecipe("yellow_sapphire", "Yellow Sapphire",
                [ComboInput("sapphire", 5), ComboInput("topaz", 4), ComboInput("ruby", 4)],
                _cs(120, 180, 4.0, 1.0, [Effect("splash", radius=2.0, falloff=0.5),
                                           Effect("slow", factor=0.75, duration=2.5)]),
                [UpgradeTier("Blizzard Sapphire", 210, _cs(200, 300, 4.25, 0.9,
                    [Effect("splash", radius=2.0, falloff=0.5), Effect("slow", factor=0.6, duration=2.5),
                     Effect("periodic_freeze", interval=3, duration=0.5),
                     Effect("frostbite", speed_threshold=0.4, dmg_bonus=0.3)]))],
                "sapphire"),
    ComboRecipe("red_crystal", "Red Crystal",
                [ComboInput("emerald", 4), ComboInput("amethyst", 2), ComboInput("ruby", 3)],
                _cs(80, 150, 5.0, 0.8, [Effect("prox_armor_reduce", radius=5.0, value=5, targets="air")], "air"),
                [UpgradeTier("Red Crystal Facet", 100, _cs(160, 250, 5.5, 0.8,
                    [Effect("prox_armor_reduce", radius=5.5, value=6, targets="air")], "air")),
                 UpgradeTier("Rose Quartz Crystal", 100, _cs(240, 300, 6.0, 0.8,
                    [Effect("prox_armor_reduce", radius=6.0, value=7, targets="air")], "air"))],
                "amethyst"),
    ComboRecipe("paraiba_tourmaline", "Paraiba Tourmaline",
                [ComboInput("aquamarine", 5), ComboInput("opal", 4),
                 ComboInput("emerald", 2), ComboInput("aquamarine", 2)],
                _cs(120, 200, 4.25, 0.75,
                    [Effect("prox_armor_reduce", radius=4.25, value=4, targets="ground"),
                     Effect("splash", radius=1.5, falloff=0.5, chance=0.33)]),
                [UpgradeTier("Ancient Paraiba", 350, _cs(360, 500, 4.5, 0.6,
                    [Effect("splash", radius=2.0, falloff=0.5, chance=1.0),
                     Effect("stacking_armor_reduce", per_hit=3, max_stacks=8, decay_interval=3),
                     Effect("prox_slow", factor=0.85, radius=4.5)]))],
                "aquamarine"),
    ComboRecipe("uranium", "Uranium",
                [ComboInput("topaz", 5), ComboInput("sapphire", 3), ComboInput("opal", 2)],
                _cs(0, 0, 4.5, 1.0, [Effect("prox_burn", dps=85, radius=4.5),
                                       Effect("prox_slow", factor=0.55, radius=4.5)]),
                [UpgradeTier("Uranium 235", 190, _cs(0, 0, 4.75, 1.0,
                    [Effect("prox_burn", dps=115, radius=4.75), Effect("prox_slow", factor=0.5, radius=4.75),
                     Effect("armor_decay_aura", armor_per_sec=1, radius=4.75, max_reduction=4),
                     Effect("linger_burn", duration=2)]))],
                "topaz"),
    ComboRecipe("stargem", "Stargem", [],
                _cs(550, 750, 5.5, 2.0,
                    [Effect("poison", dps=400, duration=4), Effect("slow", factor=0.6, duration=2.5),
                     Effect("stun", chance=0.12, duration=1.0),
                     Effect("beam_ramp", ramp_per_hit=0.15, max_stacks=25)]),
                [], "diamond"),
]

COMBO_BY_KEY: dict[str, ComboRecipe] = {c.key: c for c in COMBOS}


def _sort_key(inputs: list[ComboInput]) -> str:
    return "+".join(sorted(f"{i.gem}:{i.quality}" for i in inputs))


_COMBO_BY_INPUT_KEY: dict[str, ComboRecipe] = {
    _sort_key(c.inputs): c for c in COMBOS if c.inputs
}


def find_combo(inputs: list[ComboInput]) -> ComboRecipe | None:
    standard = _COMBO_BY_INPUT_KEY.get(_sort_key(inputs))
    if standard:
        return standard
    if (len(inputs) == 4
            and all(i.quality == 5 for i in inputs)
            and len(set(i.gem for i in inputs)) == 1):
        return COMBO_BY_KEY.get("stargem")
    return None


def find_all_combos_for(gem: str, quality: int) -> list[ComboRecipe]:
    return [c for c in COMBOS if any(i.gem == gem and i.quality == quality for i in c.inputs)]


def combo_stats_at_tier(combo: ComboRecipe, tier: int) -> ComboStats:
    if tier <= 0 or not combo.upgrades:
        return combo.stats
    idx = min(tier - 1, len(combo.upgrades) - 1)
    return combo.upgrades[idx].stats


def next_upgrade(combo: ComboRecipe, tier: int) -> UpgradeTier | None:
    if tier >= len(combo.upgrades):
        return None
    return combo.upgrades[tier]


def combo_input_cost(combo: ComboRecipe) -> int:
    return sum(QUALITY_BASE_COST[i.quality] for i in combo.inputs)


def estimate_combo_dps(combo: ComboRecipe) -> float:
    s = combo.stats
    avg_dmg = (s.dmg_min + s.dmg_max) / 2
    dps = avg_dmg * s.atk_speed
    for e in s.effects:
        if e.kind == "splash":
            dps *= 1.5
        elif e.kind == "chain":
            dps *= 1 + e.bounces * 0.3
        elif e.kind == "poison":
            dps += e.dps * e.duration * 0.3
        elif e.kind == "slow":
            dps *= 1.2
        elif e.kind == "stun":
            dps *= 1 + e.chance * 2
        elif e.kind == "crit":
            dps *= 1 + e.chance * (e.multiplier - 1)
        elif e.kind == "aura_atkspeed":
            dps *= 1 + e.pct * 3
    return dps


def combo_value(combo: ComboRecipe) -> float:
    """StrategistAI's combo valuation."""
    s = combo.stats
    avg_dmg = (s.dmg_min + s.dmg_max) / 2
    dps = avg_dmg * s.atk_speed
    for e in s.effects:
        if e.kind == "splash":
            dps *= 1.5
        elif e.kind == "chain":
            dps *= 1 + e.bounces * 0.3
        elif e.kind in ("slow", "prox_slow"):
            dps *= 1.3
        elif e.kind == "poison":
            dps += e.dps * e.duration * 0.5
        elif e.kind == "prox_burn":
            dps += e.dps * 3
        elif e.kind == "stun":
            dps *= 1 + e.chance * 2
        elif e.kind == "crit":
            dps *= 1 + e.chance * (e.multiplier - 1)
        elif e.kind == "aura_atkspeed":
            dps *= 1 + e.pct * 3
        elif e.kind == "aura_dmg":
            dps *= 1 + e.pct * 3
        elif e.kind == "multi_target":
            dps *= min(e.count, 5)
        elif e.kind == "prox_armor_reduce":
            dps += e.value * 15
        elif e.kind == "armor_reduce":
            dps *= 1 + e.value * 0.1
    if combo.upgrades:
        dps *= 1.3
    return dps


# ── Wave flags (for StrategistAI wave awareness) ────────────────────
# Extracted from src/data/waves.ts: (has_air, has_boss) per wave 1..50

WAVE_FLAGS: list[tuple[bool, bool]] = [
    # (has_air, has_boss) — index 0 = wave 1
    (False, False),  # 1: normal
    (False, False),  # 2: normal
    (False, False),  # 3: fast
    (False, False),  # 4: armored
    (True, False),   # 5: air
    (False, False),  # 6: normal
    (False, False),  # 7: fast
    (False, False),  # 8: armored
    (True, False),   # 9: air
    (False, True),   # 10: boss
    (False, False),  # 11: normal+healer
    (False, False),  # 12: fast
    (True, False),   # 13: air
    (False, False),  # 14: armored+healer
    (False, False),  # 15: normal
    (False, False),  # 16: fast+healer
    (True, False),   # 17: air
    (False, False),  # 18: armored
    (False, False),  # 19: normal+healer
    (False, True),   # 20: boss
    (False, False),  # 21: normal+tunneler
    (False, False),  # 22: fast+healer
    (True, False),   # 23: air+tunneler
    (False, False),  # 24: armored+healer
    (False, False),  # 25: fast+tunneler
    (False, False),  # 26: normal+healer+tunneler
    (True, False),   # 27: air+healer
    (False, False),  # 28: armored+tunneler
    (False, False),  # 29: fast+healer+tunneler
    (False, True),   # 30: boss+healer
    (False, False),  # 31: vessel (container)
    (False, False),  # 32: normal+healer+tunneler
    (True, False),   # 33: air+tunneler
    (False, False),  # 34: armored+healer
    (False, False),  # 35: fast+tunneler+healer
    (False, False),  # 36: vessel
    (True, False),   # 37: air+healer
    (False, False),  # 38: normal+tunneler+healer
    (False, False),  # 39: armored+tunneler
    (False, True),   # 40: boss+healer
    (False, False),  # 41: coral
    (False, False),  # 42: fast+tunneler+healer
    (True, False),   # 43: air+tunneler+healer
    (False, False),  # 44: armored+healer+tunneler
    (False, False),  # 45: vessel+coral
    (False, False),  # 46: normal+healer+tunneler
    (True, False),   # 47: air+healer+tunneler
    (False, False),  # 48: fast+healer+tunneler
    (False, False),  # 49: armored+healer+tunneler
    (False, True),   # 50: boss+healer
]

NUM_WAVES = 50


def wave_has_air(wave: int) -> bool:
    if wave < 1 or wave > len(WAVE_FLAGS):
        return False
    return WAVE_FLAGS[wave - 1][0]


def wave_has_boss(wave: int) -> bool:
    if wave < 1 or wave > len(WAVE_FLAGS):
        return False
    return WAVE_FLAGS[wave - 1][1]


# ── Maze blueprint ──────────────────────────────────────────────────

MAZE_BLUEPRINT: list[list[tuple[int, int]]] = [
    [(4, 6), (8, 7), (2, 4), (6, 8), (10, 7)],
    [(14, 5), (8, 2), (12, 3), (11, 5), (9, 5)],
    [(12, 7), (14, 7), (16, 5), (6, 17), (31, 31)],
    [(19, 2), (22, 5), (20, 7), (18, 5), (23, 3)],
    [(34, 35), (25, 4), (17, 2), (22, 7), (26, 6)],
    [(27, 4), (24, 8), (29, 4), (24, 6), (25, 10)],
    [(28, 6), (37, 7), (33, 5), (28, 8), (31, 4)],
    [(33, 7), (30, 12), (33, 11), (25, 17), (35, 9)],
    [(38, 10), (31, 8), (34, 14), (31, 10), (28, 11)],
    [(37, 3), (29, 15), (27, 15), (26, 13), (27, 19)],
    [(25, 19), (25, 23), (25, 15), (33, 3), (23, 20)],
    [(25, 21), (27, 17), (25, 25), (33, 9), (23, 22)],
    [(23, 24), (33, 37), (27, 21), (23, 28), (21, 26)],
    [(23, 30), (25, 27), (23, 26), (23, 32), (27, 25)],
    [(25, 36), (19, 30), (25, 34), (29, 31), (25, 31)],
    [(25, 29), (21, 34), (19, 35), (22, 37), (21, 32)],
    [(18, 33), (20, 38), (21, 30), (15, 38), (18, 38)],
    [(18, 10), (26, 8), (15, 27), (27, 23), (27, 31)],
    [(29, 33), (36, 35), (27, 27), (38, 20), (20, 20)],
    [(32, 16), (3, 27), (18, 27), (27, 33), (21, 9)],
    [(23, 34), (13, 25), (27, 35), (22, 13), (27, 37)],
    [(14, 9), (9, 11), (22, 17), (29, 35), (17, 16)],
    [(36, 18), (35, 3), (16, 33), (10, 22), (30, 38)],
    [(5, 22), (12, 16), (12, 10), (15, 31), (8, 28)],
    [(34, 16), (38, 32), (16, 36), (2, 30), (30, 18)],
    [(31, 35), (16, 24), (35, 5), (15, 29), (2, 13)],
    [(32, 18), (23, 10), (31, 33), (37, 5), (12, 28)],
    [(13, 35), (34, 18), (10, 33), (12, 18), (11, 25)],
    [(14, 33), (31, 29), (35, 7), (20, 12), (12, 37)],
    [(37, 13), (27, 29), (29, 25), (33, 33), (9, 25)],
    [(30, 20), (29, 23), (12, 33), (4, 30), (16, 20)],
    [(11, 12), (17, 8), (36, 20), (10, 28), (29, 27)],
    [(31, 27), (35, 11), (6, 30), (13, 31), (16, 13)],
    [(8, 17), (9, 9), (8, 33), (16, 22), (36, 16)],
    [(11, 14), (22, 15), (32, 20), (34, 24), (11, 35)],
    [(6, 37), (32, 24), (11, 31), (2, 24), (15, 18)],
    [(9, 38), (10, 16), (33, 27), (34, 22), (9, 31)],
    [(7, 35), (9, 13), (5, 11), (18, 25), (2, 2)],
    [(5, 35), (5, 13), (10, 20), (13, 21), (7, 23)],
    [(7, 13), (2, 38), (3, 35), (21, 24), (5, 25)],
    [(2, 11), (8, 15), (3, 32), (33, 31), (10, 18)],
    [(33, 29), (6, 15), (28, 13), (6, 28), (38, 30)],
    [(34, 20), (9, 35), (35, 37), (37, 37), (36, 32)],
    [(36, 30), (18, 13), (38, 28), (5, 32), (3, 18)],
    [(19, 17), (7, 25), (37, 23), (3, 16), (13, 12)],
    [(5, 20), (4, 2), (13, 14), (21, 22), (20, 14)],
    [(38, 16), (7, 10), (7, 20), (19, 22), (14, 3)],
    [(6, 6), (38, 18), (3, 8), (3, 21), (14, 16)],
    [(13, 23), (29, 29), (4, 4), (6, 2), (6, 4)],
    [(37, 25), (35, 27), (17, 18), (21, 28), (24, 13)],
]
