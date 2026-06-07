#!/usr/bin/env python3
"""
Parse a speedscope `evented` CPU profile and produce a readable hot-path report.

Usage:
    python3 tools/parse-profile.py <path-to-speedscope.json> [--top N]

What it computes (per frame):
    self_us        microseconds the frame was the top of the call stack
    inclusive_us   microseconds the frame appeared anywhere on the stack
                   (counting overlapping recursive calls once)

What it reports:
    1. Profile overview (duration, sampled wall-clock).
    2. Top N project frames by self time   ← hottest leaf work.
    3. Top N project frames by inclusive   ← time spent under each entry point.
    4. Aggregated self time per source file.
    5. Targeted buckets — Combat / Pathfinding / EventBus / Metrics / tsx load
       so you can see where the sim's wall-clock actually goes without scrolling.

"Project" = frames whose `file` is in src/ or tools/ (not node:internal,
node_modules, or empty). Adjust PROJECT_PREFIXES if your layout differs.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field

PROJECT_MARKERS = ("/gemtd/src/", "/gemtd/tools/")
SIM_FILE_HINTS = (
    "src/systems/Combat.ts",
    "src/systems/Pathfinding.ts",
    "src/systems/Traps.ts",
    "src/systems/PayloadSpawner.ts",
    "src/controllers/WavePhase.ts",
    "src/controllers/BuildPhase.ts",
    "src/sim/HeadlessGame.ts",
    "src/sim/Metrics.ts",
    "src/sim/ai/HeuristicAI.ts",
    "src/sim/ai/BlueprintAI.ts",
    "src/events/EventBus.ts",
    "src/telemetry/TelemetryCollector.ts",
    "src/game/State.ts",
    "src/game/rng.ts",
    "src/data/",
)
LOADER_HINTS = ("tsx", "node:internal", "esm/loader", "node_modules/tsx")


@dataclass
class FrameStat:
    frame_id: int
    name: str
    file: str
    line: int
    self_us: int = 0
    inclusive_us: int = 0
    open_count: int = 0
    # depth tracker for inclusive accounting
    _depth: int = 0
    _open_at: int = 0


def short_file(path: str) -> str:
    # Strip file:// URL prefix.
    if path.startswith("file://"):
        path = path[len("file://") :]
    # Try to anchor on /gemtd/{src,tools}/ so the report is machine-independent.
    for marker in PROJECT_MARKERS:
        idx = path.find(marker)
        if idx >= 0:
            return path[idx + len("/gemtd/") :]
    if path.startswith("/"):
        return os.path.basename(path)
    return path


def is_project(file: str) -> bool:
    return any(m in file for m in PROJECT_MARKERS)


def is_loader(file: str, name: str) -> bool:
    blob = f"{file} {name}"
    return any(h in blob for h in LOADER_HINTS)


def parse(path: str) -> tuple[list[FrameStat], int, int]:
    with open(path) as f:
        data = json.load(f)

    frames_raw = data["shared"]["frames"]
    profile = data["profiles"][0]
    assert profile["type"] == "evented", f"only evented profiles supported, got {profile['type']}"
    assert profile["unit"] == "microseconds", f"unexpected unit {profile['unit']}"

    stats = [
        FrameStat(
            frame_id=i,
            name=fr.get("name", "?"),
            file=fr.get("file", ""),
            line=fr.get("line", 0),
        )
        for i, fr in enumerate(frames_raw)
    ]

    events = profile["events"]
    start = profile["startValue"]
    end = profile["endValue"]
    total = end - start

    # Walk events.
    # Self time: at every event, attribute (event.at - last_ts) to whatever
    # frame is currently on top of the stack.
    # Inclusive time: each frame tracks its open depth; when depth goes 0→1 we
    # remember the open timestamp; when it falls back to 0 we add the elapsed
    # interval to inclusive. This counts overlapping recursive calls once.
    stack: list[int] = []
    last_ts = start

    for ev in events:
        ts = ev["at"]
        # Attribute interval to the top of the stack.
        if stack:
            stats[stack[-1]].self_us += ts - last_ts
        last_ts = ts

        if ev["type"] == "O":
            fid = ev["frame"]
            f = stats[fid]
            f.open_count += 1
            if f._depth == 0:
                f._open_at = ts
            f._depth += 1
            stack.append(fid)
        elif ev["type"] == "C":
            fid = ev["frame"]
            f = stats[fid]
            f._depth -= 1
            if f._depth == 0:
                f.inclusive_us += ts - f._open_at
            # Pop the matching frame off the stack. The format guarantees LIFO
            # but we defensively scan rather than assume the close matches the top.
            for i in range(len(stack) - 1, -1, -1):
                if stack[i] == fid:
                    del stack[i]
                    break
        else:
            # Unknown event type; ignore.
            pass

    # Tail attribution.
    if stack:
        stats[stack[-1]].self_us += end - last_ts

    return stats, total, len(events)


def fmt_us(us: int, total: int) -> str:
    ms = us / 1000.0
    pct = (us / total * 100.0) if total > 0 else 0.0
    if ms >= 1000:
        return f"{ms / 1000:8.2f} s  ({pct:5.1f}%)"
    return f"{ms:8.1f} ms ({pct:5.1f}%)"


def print_table(title: str, rows: list[tuple[str, int]], total: int, top: int) -> None:
    print(f"\n── {title} ──")
    if not rows:
        print("  (empty)")
        return
    width = max(len(r[0]) for r in rows[:top])
    width = min(width, 80)
    for label, us in rows[:top]:
        print(f"  {fmt_us(us, total)}  {label[:width]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("profile", help="path to speedscope JSON")
    ap.add_argument("--top", type=int, default=25)
    args = ap.parse_args()

    stats, total, n_events = parse(args.profile)
    project = [s for s in stats if is_project(s.file)]
    loader = [s for s in stats if is_loader(s.file, s.name)]

    on_cpu = sum(s.self_us for s in stats if s.frame_id != 0)
    sampled = sum(s.self_us for s in stats)

    print(f"\nFile         : {args.profile}")
    print(f"Frames       : {len(stats)} ({len(project)} project, {len(loader)} loader/runtime)")
    print(f"Events       : {n_events}")
    print(f"Profile span : {total / 1e6:.2f} s")
    print(f"Sampled self : {sampled / 1e6:.2f} s ({sampled / total * 100:.1f}% of span)")
    print(f"On-CPU (non-program) : {on_cpu / 1e6:.2f} s ({on_cpu / total * 100:.1f}% of span)")

    # Project frames by self time (= the actual hot leaf work).
    proj_self = sorted(
        [
            (f"{s.name:42}  {short_file(s.file)}:{s.line}", s.self_us)
            for s in project
            if s.self_us > 0
        ],
        key=lambda r: -r[1],
    )
    print_table("Top project frames by SELF time (where the CPU actually burns)", proj_self, total, args.top)

    # Project frames by inclusive time (= entry-point hotness).
    proj_incl = sorted(
        [
            (f"{s.name:42}  {short_file(s.file)}:{s.line}", s.inclusive_us)
            for s in project
            if s.inclusive_us > 0
        ],
        key=lambda r: -r[1],
    )
    print_table("Top project frames by INCLUSIVE time (under each entry point)", proj_incl, total, args.top)

    # Self time bucketed by source file.
    per_file: dict[str, int] = defaultdict(int)
    for s in project:
        per_file[s.file] += s.self_us
    by_file = sorted(
        ((short_file(f), us) for f, us in per_file.items() if us > 0),
        key=lambda r: -r[1],
    )
    print_table("Self time by source file (project only)", by_file, total, args.top)

    # Targeted buckets.
    bucket_us: dict[str, int] = defaultdict(int)
    for s in project:
        for hint in SIM_FILE_HINTS:
            if hint in s.file:
                bucket_us[hint] += s.self_us
                break
    loader_total = sum(s.self_us for s in loader)
    bucket_us["(tsx + node loader steady-state self)"] = loader_total
    fetch_total = sum(s.self_us for s in stats if "fetch" in s.name.lower() or "undici" in s.file)
    bucket_us["(fetch / undici self)"] = fetch_total
    json_total = sum(s.self_us for s in stats if s.name in ("stringify", "parse") and "JSON" in s.file.upper())
    bucket_us["(JSON.stringify/parse self)"] = json_total

    buckets = sorted(((k, v) for k, v in bucket_us.items() if v > 0), key=lambda r: -r[1])
    print_table("Targeted buckets (self time)", buckets, total, len(buckets))

    # Specific named hot spots that the audit calls out — surface these
    # directly so you can read their cost without grepping the tables.
    named_targets = (
        "pickTarget",
        "pickTargets",
        "effectiveStats",
        "computeAuraMults",
        "applyProximityAuras",
        "step",
        "fire",
        "advanceCreep",
        "emit",
        "on",
        "find",
        "randInt",
        "armorDamageMultiplier",
    )
    named_rows: list[tuple[str, int]] = []
    for target in named_targets:
        matching = [s for s in project if s.name == target]
        if not matching:
            continue
        total_self = sum(s.self_us for s in matching)
        total_incl = sum(s.inclusive_us for s in matching)
        files = sorted({short_file(s.file) for s in matching})
        label = f"{target}() self+incl={total_self/1000:.0f}+{total_incl/1000:.0f}ms in {','.join(files)}"
        named_rows.append((label, total_self))
    named_rows.sort(key=lambda r: -r[1])
    print_table("Audit's named hot spots", named_rows, total, len(named_rows))


if __name__ == "__main__":
    main()
