"""
Cross-validate Zig sim against TypeScript sim.

Loads a TS trace (from tools/dump-trace.ts) and replays the same decisions
through the Zig shared library, comparing state at each wave boundary.

Usage: uv run python zig-sim/cross_validate.py [trace_file]
"""

import ctypes
import json
import sys
from pathlib import Path

# Load shared library
LIB_PATH = Path(__file__).parent / "zig-out" / "lib" / "libgemtd_sim.so"
if not LIB_PATH.exists():
    print(f"Build first: cd zig-sim && zig build")
    sys.exit(1)

lib = ctypes.CDLL(str(LIB_PATH))


# C struct types
class PlaceResult(ctypes.Structure):
    _fields_ = [("success", ctypes.c_int32), ("tower_id", ctypes.c_int32)]


class WaveResult(ctypes.Structure):
    _fields_ = [
        ("phase", ctypes.c_int32),
        ("wave", ctypes.c_int32),
        ("lives", ctypes.c_int32),
        ("gold", ctypes.c_int32),
        ("killed", ctypes.c_int32),
        ("leaked", ctypes.c_int32),
    ]


class DrawInfo(ctypes.Structure):
    _fields_ = [
        ("slot_id", ctypes.c_int32),
        ("gem", ctypes.c_int32),
        ("quality", ctypes.c_int32),
        ("placed_tower_id", ctypes.c_int32),
    ]


class StateSnapshot(ctypes.Structure):
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


# Function signatures
lib.sim_create.restype = ctypes.c_void_p
lib.sim_create.argtypes = [ctypes.c_uint32]

lib.sim_destroy.restype = None
lib.sim_destroy.argtypes = [ctypes.c_void_p]

lib.sim_new_game.restype = None
lib.sim_new_game.argtypes = [ctypes.c_void_p]

lib.sim_start_placement.restype = ctypes.c_int32
lib.sim_start_placement.argtypes = [ctypes.c_void_p]

lib.sim_place_gem.restype = PlaceResult
lib.sim_place_gem.argtypes = [ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_int32]

lib.sim_designate_keeper.restype = ctypes.c_int32
lib.sim_designate_keeper.argtypes = [ctypes.c_void_p, ctypes.c_int32]

lib.sim_start_wave.restype = None
lib.sim_start_wave.argtypes = [ctypes.c_void_p]

lib.sim_run_wave.restype = WaveResult
lib.sim_run_wave.argtypes = [ctypes.c_void_p]

lib.sim_upgrade_chance_tier.restype = ctypes.c_int32
lib.sim_upgrade_chance_tier.argtypes = [ctypes.c_void_p]

lib.sim_combine.restype = ctypes.c_int32
lib.sim_combine.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int32), ctypes.c_uint32]

lib.sim_get_draws.restype = ctypes.c_uint32
lib.sim_get_draws.argtypes = [ctypes.c_void_p, ctypes.POINTER(DrawInfo), ctypes.c_uint32]

lib.sim_get_state.restype = StateSnapshot
lib.sim_get_state.argtypes = [ctypes.c_void_p]


GEM_NAMES = ["ruby", "sapphire", "emerald", "topaz", "amethyst", "opal", "diamond", "aquamarine"]


def main():
    trace_file = sys.argv[1] if len(sys.argv) > 1 else "/tmp/trace_42.json"
    with open(trace_file) as f:
        trace = json.load(f)

    seed = trace["seed"]
    print(f"Cross-validating seed {seed}: TS reached wave {trace['waveReached']} ({trace['outcome']})")

    handle = lib.sim_create(seed)
    if not handle:
        print("Failed to create sim")
        sys.exit(1)

    try:
        lib.sim_new_game(handle)

        # Check initial draws match
        draws_buf = (DrawInfo * 5)()
        n = lib.sim_get_draws(handle, draws_buf, 5)
        print(f"\nWave 1 draws (Zig): ", end="")
        for i in range(n):
            d = draws_buf[i]
            print(f"{GEM_NAMES[d.gem]}:L{d.quality}", end=" ")
        print()

        ts_wave1 = trace["waves"][0]
        print(f"Wave 1 draws (TS):  ", end="")
        for p in ts_wave1["placements"][:5]:
            # Only print unique placements
            pass
        for d in ts_wave1["placements"]:
            print(f"{d['gem']}:L{d['quality']}", end=" ")
        print()

        # Verify draw gems match
        ts_gems = set()
        for p in ts_wave1["placements"]:
            ts_gems.add((p["gem"], p["quality"]))
        zig_gems = set()
        for i in range(n):
            d = draws_buf[i]
            zig_gems.add((GEM_NAMES[d.gem], d.quality))

        if ts_gems == zig_gems:
            print("  MATCH: Draw gem sets match")
        else:
            print(f"  MISMATCH: TS={ts_gems} Zig={zig_gems}")

        # For each wave in the trace, replay placements and compare
        mismatches = 0
        for wave_trace in trace["waves"]:
            wave_num = wave_trace["wave"]
            ts_state = wave_trace["stateAfterWave"]

            # Upgrade chance tier
            while wave_trace["chanceTierAfter"] > wave_trace["chanceTierBefore"]:
                lib.sim_upgrade_chance_tier(handle)
                wave_trace["chanceTierBefore"] += 1

            # Start placement (waves 2+)
            if wave_num > 1:
                lib.sim_start_placement(handle)

            # Get Zig draws
            n = lib.sim_get_draws(handle, draws_buf, 5)

            # Place gems at the trace positions
            seen_placements = set()
            for p in wave_trace["placements"]:
                key = (p["x"], p["y"], p["slotId"])
                if key in seen_placements:
                    continue
                seen_placements.add(key)
                result = lib.sim_place_gem(handle, p["slotId"], p["x"], p["y"])
                if not result.success:
                    print(f"  wave {wave_num}: placement failed at ({p['x']},{p['y']}) slot {p['slotId']}")

            # Try combines
            for combo in wave_trace["combinesDone"]:
                ids = combo["inputIds"]
                arr = (ctypes.c_int32 * len(ids))(*ids)
                lib.sim_combine(handle, arr, len(ids))

            # Designate keeper
            keep_id = wave_trace["keepTowerId"]
            if keep_id >= 0:
                lib.sim_designate_keeper(handle, keep_id)

            # Check state - get snapshot before running wave
            snap = lib.sim_get_state(handle)

            # If we're still in build phase (keeper not auto-starting wave), start it
            if snap.phase == 1:  # build
                lib.sim_start_wave(handle)

            # Run the wave
            result = lib.sim_run_wave(handle)

            # Compare
            snap = lib.sim_get_state(handle)
            diffs = []
            if snap.lives != ts_state["lives"]:
                diffs.append(f"lives: zig={snap.lives} ts={ts_state['lives']}")
            if snap.gold != ts_state["gold"]:
                diffs.append(f"gold: zig={snap.gold} ts={ts_state['gold']}")
            if snap.total_kills != ts_state["totalKills"]:
                diffs.append(f"kills: zig={snap.total_kills} ts={ts_state['totalKills']}")
            if snap.tower_count != ts_state["towerCount"]:
                diffs.append(f"towers: zig={snap.tower_count} ts={ts_state['towerCount']}")

            status = "OK" if not diffs else "DIFF"
            if diffs:
                mismatches += 1
            detail = f" [{', '.join(diffs)}]" if diffs else ""
            print(f"  wave {wave_num:2d}: {status} lives={snap.lives} gold={snap.gold} kills={snap.total_kills} towers={snap.tower_count} route={snap.route_length}{detail}")

            # Check game over
            if snap.phase == 3 or snap.phase == 4:  # gameover or victory
                break

        print(f"\nResult: {mismatches} mismatches out of {len(trace['waves'])} waves")

    finally:
        lib.sim_destroy(handle)


if __name__ == "__main__":
    main()
