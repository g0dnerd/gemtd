import json
import sys

import numpy as np

from grid import (
    GRID_W,
    GRID_H,
    Cell,
    WAYPOINTS,
    FOOTPRINT,
    build_base_layout,
    place_tower,
)

try:
    from pathfinding_cy import find_route, flatten_route, footprint_cells
except ImportError:
    from pathfinding import find_route, flatten_route, footprint_cells

from fitness import exposure_at_flat

C_WALL = 0
C_GRASS = 1
C_PATH_TILE = 2
C_ROUTE = 3
C_ROCK = 4
C_TOWER = 5
C_WAYPOINT = 6

COLORS_CSS = [
    "#1a1a2e",
    "#2d5a1e",
    "#3a7a3a",
    "#44bbcc",
    "#5a5a6e",
    "#22cc55",
    "#ffcc00",
]


def snapshot_grid(grid, keepers, route_set, wp_set):
    cells = []
    for y in range(GRID_H):
        for x in range(GRID_W):
            cell = grid[y, x]
            is_keeper_cell = any((x - dx, y - dy) in keepers for dx, dy in FOOTPRINT)
            is_route = (x, y) in route_set
            is_wp = (x, y) in wp_set

            if is_wp:
                cells.append(C_WAYPOINT)
            elif is_keeper_cell or cell == Cell.Tower:
                cells.append(C_TOWER)
            elif cell == Cell.Rock:
                cells.append(C_ROCK)
            elif is_route:
                cells.append(C_ROUTE)
            elif cell == Cell.Wall:
                cells.append(C_WALL)
            elif cell == Cell.Path:
                cells.append(C_PATH_TILE)
            else:
                cells.append(C_GRASS)
    return cells


def build_all_snapshots(data):
    rounds = data["rounds"]
    total = len(rounds)
    wp_set = {(wp.x, wp.y) for wp in WAYPOINTS}

    snapshots = []

    grid = build_base_layout()
    keepers: set[tuple[int, int]] = set()
    segments = find_route(grid)
    flat_route = flatten_route(segments) if segments else []
    route_set = set(flat_route)

    snapshots.append(
        {
            "cells": snapshot_grid(grid, keepers, route_set, wp_set),
            "route": flat_route,
            "path_length": len(flat_route),
        }
    )

    for r_idx in range(total):
        positions = rounds[r_idx]
        placed: list[tuple[int, int]] = []
        for x, y in positions:
            ok = all(
                0 <= y + dy < GRID_H
                and 0 <= x + dx < GRID_W
                and grid[y + dy, x + dx] == Cell.Grass
                for dx, dy in FOOTPRINT
            )
            if not ok:
                continue
            fc = footprint_cells(x, y)
            if find_route(grid, fc) is None:
                continue
            place_tower(grid, x, y)
            placed.append((x, y))

        segments = find_route(grid)
        flat_route = flatten_route(segments) if segments else []
        route_set = set(flat_route)

        if placed:
            best_idx = max(
                range(len(placed)),
                key=lambda i: exposure_at_flat(placed[i][0], placed[i][1], flat_route),
            )
            for i, (px, py) in enumerate(placed):
                if i == best_idx:
                    keepers.add((px, py))
                else:
                    place_tower(grid, px, py, Cell.Rock)

        segments = find_route(grid)
        flat_route = flatten_route(segments) if segments else []
        route_set = set(flat_route)

        snapshots.append(
            {
                "cells": snapshot_grid(grid, keepers, route_set, wp_set),
                "route": flat_route,
                "path_length": len(flat_route),
            }
        )

    return snapshots


def generate_html(blueprint_path: str) -> str:
    with open(blueprint_path) as f:
        data = json.load(f)

    print("Replaying blueprint to build snapshots...")
    snapshots = build_all_snapshots(data)
    total_rounds = len(data["rounds"])

    snap_json = []
    for s in snapshots:
        route_flat = []
        for x, y in s["route"]:
            route_flat.append(x)
            route_flat.append(y)
        snap_json.append(
            {
                "c": "".join(str(c) for c in s["cells"]),
                "r": route_flat,
                "p": s["path_length"],
            }
        )

    fitness = data.get("fitness", 0)
    exposure = data.get("exposure_total", 0)

    waypoints_json = [[wp.x, wp.y] for wp in WAYPOINTS]

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>GemTD Maze Blueprint</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 24px;
    background: #111118; color: #e0e0e0;
    font-family: 'Segoe UI', system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center;
  }}
  h1 {{ margin: 0 0 8px; font-size: 20px; color: #fff; }}
  .stats {{
    display: flex; gap: 24px; margin-bottom: 16px;
    font-size: 14px; color: #aaa;
  }}
  .stats b {{ color: #fff; font-weight: 600; }}
  canvas {{ border: 1px solid #333; border-radius: 4px; cursor: crosshair; }}
  .slider-row {{
    display: flex; align-items: center; gap: 12px;
    margin-top: 16px; width: 100%; max-width: 600px;
  }}
  .slider-row label {{ font-size: 14px; white-space: nowrap; }}
  .slider-row input[type=range] {{ flex: 1; accent-color: #44bbcc; }}
  #round-input {{
    width: 52px; padding: 2px 6px; font-size: 14px;
    background: #222; color: #fff; border: 1px solid #444;
    border-radius: 4px; text-align: center;
    -moz-appearance: textfield;
  }}
  #round-input::-webkit-inner-spin-button {{ opacity: 1; }}
  .legend {{
    display: flex; gap: 16px; margin-top: 12px; font-size: 12px;
  }}
  .legend-item {{ display: flex; align-items: center; gap: 4px; }}
  .legend-swatch {{
    width: 14px; height: 14px; border-radius: 2px;
    border: 1px solid rgba(255,255,255,0.15);
  }}
</style>
</head>
<body>
  <h1>GemTD Maze Blueprint</h1>
  <div class="stats">
    <div>Round: <b id="st-round">0</b>/{total_rounds}</div>
    <div>Path length: <b id="st-path">0</b></div>
    <div>Fitness: <b>{fitness:.0f}</b></div>
    <div>Exposure: <b>{exposure}</b></div>
  </div>
  <canvas id="c" width="{GRID_W * 14}" height="{GRID_H * 14}"></canvas>
  <div id="hover-info" style="font-size:12px;color:#888;height:18px;margin-top:4px;"></div>
  <div class="slider-row">
    <label for="sl">Round</label>
    <input type="range" id="sl" min="0" max="{total_rounds}" value="0">
    <input type="number" id="round-input" min="0" max="{total_rounds}" value="0">
  </div>
  <div class="legend">
    <div class="legend-item"><div class="legend-swatch" style="background:#ffcc00"></div> Waypoint</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#22cc55"></div> Tower</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#5a5a6e"></div> Rock</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#44bbcc"></div> Creep path</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#1a1a2e"></div> Wall</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#2d5a1e"></div> Grass</div>
  </div>
<script>
const SNAPSHOTS = {json.dumps(snap_json, separators=(",", ":"))};
const WAYPOINTS = {json.dumps(waypoints_json)};
const GW = {GRID_W}, GH = {GRID_H}, CS = 14;
const PALETTE = {json.dumps(COLORS_CSS)};

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const slider = document.getElementById('sl');
const roundInput = document.getElementById('round-input');
const stRound = document.getElementById('st-round');
const stPath = document.getElementById('st-path');
const hoverInfo = document.getElementById('hover-info');
const TOTAL = {total_rounds};
const CELL_NAMES = ['Wall','Grass','Path','Route','Rock','Tower','Waypoint'];

let curRound = 0;

function draw(round) {{
  curRound = round;
  const snap = SNAPSHOTS[round];
  const cells = snap.c;
  const routeFlat = snap.r;

  for (let y = 0; y < GH; y++) {{
    for (let x = 0; x < GW; x++) {{
      ctx.fillStyle = PALETTE[+cells[y * GW + x]];
      ctx.fillRect(x * CS, y * CS, CS, CS);
    }}
  }}

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= GW; x++) {{
    ctx.moveTo(x * CS, 0);
    ctx.lineTo(x * CS, GH * CS);
  }}
  for (let y = 0; y <= GH; y++) {{
    ctx.moveTo(0, y * CS);
    ctx.lineTo(GW * CS, y * CS);
  }}
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= GW; x += 2) {{
    ctx.moveTo(x * CS, 0);
    ctx.lineTo(x * CS, GH * CS);
  }}
  for (let y = 0; y <= GH; y += 2) {{
    ctx.moveTo(0, y * CS);
    ctx.lineTo(GW * CS, y * CS);
  }}
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let x = 0; x < GW; x += 4) {{
    ctx.fillText(x, x * CS + CS / 2, CS * 0.9);
  }}
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < GH; y += 4) {{
    ctx.fillText(y, 2, y * CS + CS / 2);
  }}

  if (routeFlat.length >= 4) {{
    const half = CS / 2;
    ctx.beginPath();
    ctx.moveTo(routeFlat[0] * CS + half, routeFlat[1] * CS + half);
    for (let i = 2; i < routeFlat.length; i += 2) {{
      ctx.lineTo(routeFlat[i] * CS + half, routeFlat[i+1] * CS + half);
    }}
    ctx.strokeStyle = 'rgba(68,187,204,0.45)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }}

  for (const [wx, wy] of WAYPOINTS) {{
    const cx = wx * CS + CS / 2;
    const cy = wy * CS + CS / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CS * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }}

  stRound.textContent = round;
  stPath.textContent = snap.p;
}}

function setRound(v) {{
  v = Math.max(0, Math.min(TOTAL, Math.round(v)));
  slider.value = v;
  roundInput.value = v;
  draw(v);
}}

slider.addEventListener('input', () => setRound(+slider.value));
roundInput.addEventListener('input', () => setRound(+roundInput.value));

canvas.addEventListener('mousemove', (e) => {{
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CS);
  const y = Math.floor((e.clientY - rect.top) / CS);
  if (x >= 0 && x < GW && y >= 0 && y < GH) {{
    const ci = +SNAPSHOTS[curRound].c[y * GW + x];
    hoverInfo.textContent = `(${{x}}, ${{y}})  ${{CELL_NAMES[ci]}}`;
  }}
}});
canvas.addEventListener('mouseleave', () => {{ hoverInfo.textContent = ''; }});

draw(0);
</script>
</body>
</html>"""


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "blueprint2.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "maze_viz.html"

    html = generate_html(path)
    with open(out, "w") as f:
        f.write(html)
    print(f"Written to {out}")
