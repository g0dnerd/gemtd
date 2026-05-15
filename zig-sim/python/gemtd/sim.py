"""Ctypes wrapper for the Zig gemtd_sim shared library."""

from __future__ import annotations

import ctypes
from dataclasses import dataclass
from pathlib import Path

LIB_PATH = Path(__file__).resolve().parents[2] / "zig-out" / "lib" / "libgemtd_sim.so"

GRID_W = 42
GRID_H = 42
GRID_SCALE = 2
FINE_TILE = 36 / GRID_SCALE
MAX_TOWERS = 128
MAX_ROUTE = 2048
MAX_PLACEMENTS = 800
DRAW_COUNT = 5


# ── C struct mirrors ────────────────────────────────────────────────

class _PlaceResult(ctypes.Structure):
    _fields_ = [("success", ctypes.c_int32), ("tower_id", ctypes.c_int32)]


class _WaveResult(ctypes.Structure):
    _fields_ = [
        ("phase", ctypes.c_int32),
        ("wave", ctypes.c_int32),
        ("lives", ctypes.c_int32),
        ("gold", ctypes.c_int32),
        ("killed", ctypes.c_int32),
        ("leaked", ctypes.c_int32),
    ]


class _DrawInfo(ctypes.Structure):
    _fields_ = [
        ("slot_id", ctypes.c_int32),
        ("gem", ctypes.c_int32),
        ("quality", ctypes.c_int32),
        ("placed_tower_id", ctypes.c_int32),
    ]


class _TowerInfo(ctypes.Structure):
    _fields_ = [
        ("id", ctypes.c_int32),
        ("x", ctypes.c_int32),
        ("y", ctypes.c_int32),
        ("gem", ctypes.c_int32),
        ("quality", ctypes.c_int32),
        ("combo_key", ctypes.c_int32),
        ("upgrade_tier", ctypes.c_int32),
        ("kills", ctypes.c_int32),
        ("total_damage_lo", ctypes.c_int32),
        ("total_damage_hi", ctypes.c_int32),
        ("is_trap", ctypes.c_int32),
    ]


class _StateSnapshot(ctypes.Structure):
    _fields_ = [
        ("phase", ctypes.c_int32),
        ("wave", ctypes.c_int32),
        ("lives", ctypes.c_int32),
        ("gold", ctypes.c_int32),
        ("total_kills", ctypes.c_int32),
        ("tick", ctypes.c_int32),
        ("chance_tier", ctypes.c_int32),
        ("tower_count", ctypes.c_int32),
        ("creep_count", ctypes.c_int32),
        ("route_length", ctypes.c_int32),
    ]


class _Pos(ctypes.Structure):
    _fields_ = [("x", ctypes.c_int32), ("y", ctypes.c_int32)]


# ── Python dataclasses ──────────────────────────────────────────────

GEM_NAMES = ["ruby", "sapphire", "emerald", "topaz", "amethyst", "opal", "diamond", "aquamarine"]
GEM_INDEX = {name: i for i, name in enumerate(GEM_NAMES)}

COMBO_KEYS = [
    "black_opal", "bloodstone", "dark_emerald", "gold", "jade", "malachite",
    "pink_diamond", "silver", "star_ruby", "yellow_sapphire", "red_crystal",
    "paraiba_tourmaline", "uranium", "stargem",
    "rune_holding", "rune_damage", "rune_teleport", "rune_slow",
]

PHASE_BUILD = 1
PHASE_WAVE = 2
PHASE_GAMEOVER = 3
PHASE_VICTORY = 4


@dataclass
class DrawSlot:
    slot_id: int
    gem: str
    quality: int
    placed_tower_id: int | None


@dataclass
class TowerSnapshot:
    id: int
    x: int
    y: int
    gem: str
    quality: int
    combo_key: str | None
    upgrade_tier: int
    kills: int
    total_damage: int
    is_trap: bool


@dataclass
class GameState:
    phase: int
    wave: int
    lives: int
    gold: int
    total_kills: int
    tick: int
    chance_tier: int
    tower_count: int
    creep_count: int
    route_length: int


@dataclass
class WaveResult:
    phase: int
    wave: int
    lives: int
    gold: int
    killed: int
    leaked: int


@dataclass
class GameResult:
    seed: int
    wave_reached: int
    final_gold: int
    final_lives: int
    outcome: str  # "gameover" or "victory"
    gem_damage: list[int] | None = None  # per-gem total damage (8 entries)
    wave_leaks: list[int] | None = None  # per-wave leaked counts


# ── Library loader ──────────────────────────────────────────────────

_lib_cache: ctypes.CDLL | None = None


def _load_lib(path: Path = LIB_PATH) -> ctypes.CDLL:
    global _lib_cache
    if _lib_cache is not None:
        return _lib_cache
    if not path.exists():
        raise FileNotFoundError(f"Build the Zig sim first: cd zig-sim && zig build\n  Missing: {path}")
    lib = ctypes.CDLL(str(path))

    lib.sim_create.restype = ctypes.c_void_p
    lib.sim_create.argtypes = [ctypes.c_uint32]
    lib.sim_destroy.restype = None
    lib.sim_destroy.argtypes = [ctypes.c_void_p]
    lib.sim_reset.restype = None
    lib.sim_reset.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    lib.sim_new_game.restype = None
    lib.sim_new_game.argtypes = [ctypes.c_void_p]
    lib.sim_start_placement.restype = ctypes.c_int32
    lib.sim_start_placement.argtypes = [ctypes.c_void_p]
    lib.sim_place_gem.restype = _PlaceResult
    lib.sim_place_gem.argtypes = [ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_int32]
    lib.sim_designate_keeper.restype = ctypes.c_int32
    lib.sim_designate_keeper.argtypes = [ctypes.c_void_p, ctypes.c_int32]
    lib.sim_start_wave.restype = None
    lib.sim_start_wave.argtypes = [ctypes.c_void_p]
    lib.sim_run_wave.restype = _WaveResult
    lib.sim_run_wave.argtypes = [ctypes.c_void_p]
    lib.sim_upgrade_chance_tier.restype = ctypes.c_int32
    lib.sim_upgrade_chance_tier.argtypes = [ctypes.c_void_p]
    lib.sim_combine.restype = ctypes.c_int32
    lib.sim_combine.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int32), ctypes.c_uint32]
    lib.sim_upgrade_tower.restype = ctypes.c_int32
    lib.sim_upgrade_tower.argtypes = [ctypes.c_void_p, ctypes.c_int32]
    lib.sim_get_draws.restype = ctypes.c_uint32
    lib.sim_get_draws.argtypes = [ctypes.c_void_p, ctypes.POINTER(_DrawInfo), ctypes.c_uint32]
    lib.sim_get_towers.restype = ctypes.c_uint32
    lib.sim_get_towers.argtypes = [ctypes.c_void_p, ctypes.POINTER(_TowerInfo), ctypes.c_uint32]
    lib.sim_get_state.restype = _StateSnapshot
    lib.sim_get_state.argtypes = [ctypes.c_void_p]
    lib.sim_get_route.restype = ctypes.c_uint32
    lib.sim_get_route.argtypes = [ctypes.c_void_p, ctypes.POINTER(_Pos), ctypes.c_uint32]
    lib.sim_try_place_route_len.restype = ctypes.c_int32
    lib.sim_try_place_route_len.argtypes = [ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32]
    lib.sim_get_valid_placements.restype = ctypes.c_uint32
    lib.sim_get_valid_placements.argtypes = [ctypes.c_void_p, ctypes.POINTER(_Pos), ctypes.c_uint32]

    lib.sim_set_gem_params.restype = None
    lib.sim_set_gem_params.argtypes = [ctypes.POINTER(ctypes.c_float), ctypes.c_uint32]
    lib.sim_set_quality_params.restype = None
    lib.sim_set_quality_params.argtypes = [ctypes.POINTER(ctypes.c_float), ctypes.c_uint32]
    lib.sim_reset_params.restype = None
    lib.sim_reset_params.argtypes = []

    _lib_cache = lib
    return lib


# ── Sim wrapper ─────────────────────────────────────────────────────

NUM_GEMS = 8
GEM_PARAM_COUNT = NUM_GEMS * 4  # base_dmg, spread, base_range, base_atk_speed per gem
QUALITY_PARAM_COUNT = 15  # 5 dmg_mult + 5 range_bonus + 5 speed_bonus

# Default gem base stats: [base_dmg, spread, base_range, base_atk_speed] per gem
# Order: ruby, sapphire, emerald, topaz, amethyst, opal, diamond, aquamarine
DEFAULT_GEM_PARAMS: list[float] = [
    15, 0.2, 3.5, 1.0,    # ruby
    15, 0.15, 4.0, 0.9,   # sapphire
    13, 0.15, 3.5, 1.0,   # emerald
    8, 0.2, 3.0, 1.6,     # topaz
    21, 0.2, 4.5, 0.9,    # amethyst
    4, 0.2, 3.0, 0.7,     # opal
    25, 0.3, 4.0, 0.8,    # diamond
    2, 0.15, 3.0, 3.0,    # aquamarine
]

DEFAULT_QUALITY_PARAMS: list[float] = [
    1.0, 2.2, 5.0, 11.0, 22.0,     # QUALITY_DMG_MULT
    0.0, 0.25, 0.5, 0.75, 1.0,     # QUALITY_RANGE_BONUS
    1.0, 1.05, 1.1, 1.18, 1.3,     # QUALITY_SPEED_BONUS
]


def set_params(gem_params: list[float] | None = None,
               quality_params: list[float] | None = None,
               lib: ctypes.CDLL | None = None) -> None:
    """Set balance parameters on the shared lib (process-global)."""
    if lib is None:
        lib = _load_lib()
    if gem_params is not None:
        arr = (ctypes.c_float * len(gem_params))(*gem_params)
        lib.sim_set_gem_params(arr, len(gem_params))
    if quality_params is not None:
        arr = (ctypes.c_float * len(quality_params))(*quality_params)
        lib.sim_set_quality_params(arr, len(quality_params))


def reset_params(lib: ctypes.CDLL | None = None) -> None:
    """Reset balance parameters to compiled defaults."""
    if lib is None:
        lib = _load_lib()
    lib.sim_reset_params()


class SimWrapper:
    """High-level Python wrapper around the Zig sim C API.

    One instance = one game handle. Not thread-safe (use one per worker process).
    """

    _lib: ctypes.CDLL
    _handle: int

    # Pre-allocated buffers
    _draws_buf: ctypes.Array
    _towers_buf: ctypes.Array
    _route_buf: ctypes.Array
    _placements_buf: ctypes.Array

    def __init__(self, seed: int, *, lib_path: Path | None = None):
        self._lib = _load_lib(lib_path) if lib_path else _load_lib()
        self._handle = self._lib.sim_create(seed)
        if not self._handle:
            raise RuntimeError("sim_create returned null")
        self._draws_buf = (_DrawInfo * DRAW_COUNT)()
        self._towers_buf = (_TowerInfo * MAX_TOWERS)()
        self._route_buf = (_Pos * MAX_ROUTE)()
        self._placements_buf = (_Pos * MAX_PLACEMENTS)()

    def close(self):
        if self._handle:
            self._lib.sim_destroy(self._handle)
            self._handle = 0

    def __del__(self):
        self.close()

    def reset(self, seed: int):
        self._lib.sim_reset(self._handle, seed)

    def new_game(self):
        self._lib.sim_new_game(self._handle)

    def start_placement(self) -> bool:
        return bool(self._lib.sim_start_placement(self._handle))

    def place_gem(self, slot_id: int, x: int, y: int) -> tuple[bool, int]:
        r = self._lib.sim_place_gem(self._handle, slot_id, x, y)
        return (bool(r.success), r.tower_id)

    def designate_keeper(self, tower_id: int) -> bool:
        return bool(self._lib.sim_designate_keeper(self._handle, tower_id))

    def start_wave(self):
        self._lib.sim_start_wave(self._handle)

    def run_wave(self) -> WaveResult:
        r = self._lib.sim_run_wave(self._handle)
        return WaveResult(
            phase=r.phase, wave=r.wave, lives=r.lives,
            gold=r.gold, killed=r.killed, leaked=r.leaked,
        )

    def upgrade_chance_tier(self) -> bool:
        return bool(self._lib.sim_upgrade_chance_tier(self._handle))

    def combine(self, tower_ids: list[int]) -> bool:
        arr = (ctypes.c_int32 * len(tower_ids))(*tower_ids)
        return bool(self._lib.sim_combine(self._handle, arr, len(tower_ids)))

    def upgrade_tower(self, tower_id: int) -> bool:
        return bool(self._lib.sim_upgrade_tower(self._handle, tower_id))

    def get_draws(self) -> list[DrawSlot]:
        n = self._lib.sim_get_draws(self._handle, self._draws_buf, DRAW_COUNT)
        result = []
        for i in range(n):
            d = self._draws_buf[i]
            result.append(DrawSlot(
                slot_id=d.slot_id,
                gem=GEM_NAMES[d.gem],
                quality=d.quality,
                placed_tower_id=d.placed_tower_id if d.placed_tower_id >= 0 else None,
            ))
        return result

    def get_towers(self) -> list[TowerSnapshot]:
        n = self._lib.sim_get_towers(self._handle, self._towers_buf, MAX_TOWERS)
        result = []
        for i in range(n):
            t = self._towers_buf[i]
            result.append(TowerSnapshot(
                id=t.id,
                x=t.x,
                y=t.y,
                gem=GEM_NAMES[t.gem],
                quality=t.quality,
                combo_key=COMBO_KEYS[t.combo_key] if t.combo_key >= 0 else None,
                upgrade_tier=t.upgrade_tier,
                kills=t.kills,
                total_damage=t.total_damage_lo + (t.total_damage_hi << 32),
                is_trap=bool(t.is_trap),
            ))
        return result

    def get_state(self) -> GameState:
        s = self._lib.sim_get_state(self._handle)
        return GameState(
            phase=s.phase, wave=s.wave, lives=s.lives, gold=s.gold,
            total_kills=s.total_kills, tick=s.tick, chance_tier=s.chance_tier,
            tower_count=s.tower_count, creep_count=s.creep_count,
            route_length=s.route_length,
        )

    def get_route(self) -> list[tuple[int, int]]:
        n = self._lib.sim_get_route(self._handle, self._route_buf, MAX_ROUTE)
        return [(self._route_buf[i].x, self._route_buf[i].y) for i in range(n)]

    def try_place_route_len(self, x: int, y: int) -> int:
        """Returns route length if placement at (x,y) is valid, -1 otherwise."""
        return self._lib.sim_try_place_route_len(self._handle, x, y)

    def get_valid_placements(self) -> list[tuple[int, int]]:
        n = self._lib.sim_get_valid_placements(
            self._handle, self._placements_buf, MAX_PLACEMENTS,
        )
        return [(self._placements_buf[i].x, self._placements_buf[i].y) for i in range(n)]
