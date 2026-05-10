import { Container, Graphics, Text } from "pixi.js";
import { FINE_TILE } from "../game/constants";
import { THEME } from "./theme";
import { Cell, BASE } from "../data/map";
import { findRoute, flattenRoute } from "../systems/Pathfinding";

export interface Blueprint {
  rounds: [number, number][][];
  keeperIndices?: number[];
}

const KEEPER_RANGE = 7;
const KEEPER_R2 = KEEPER_RANGE * KEEPER_RANGE;

function exposureAt(
  x: number,
  y: number,
  routeSet: Set<string>,
): number {
  const cx = x + 1;
  const cy = y + 1;
  let count = 0;
  for (let dx = -KEEPER_RANGE; dx <= KEEPER_RANGE; dx++) {
    for (let dy = -KEEPER_RANGE; dy <= KEEPER_RANGE; dy++) {
      if (dx * dx + dy * dy > KEEPER_R2) continue;
      if (routeSet.has(`${cx + dx},${cy + dy}`)) count++;
    }
  }
  return count;
}

export function computeKeeperIndices(blueprint: Blueprint): number[] {
  const grid: Cell[][] = BASE.grid.map((row) => row.slice());
  const keepers: number[] = [];

  for (const positions of blueprint.rounds) {
    const placed: { x: number; y: number; idx: number }[] = [];

    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      let valid = true;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          if (grid[y + dy][x + dx] !== Cell.Grass) valid = false;
      if (!valid) continue;

      grid[y][x] = Cell.Tower;
      grid[y][x + 1] = Cell.Tower;
      grid[y + 1][x] = Cell.Tower;
      grid[y + 1][x + 1] = Cell.Tower;
      placed.push({ x, y, idx: i });
    }

    const segments = findRoute(grid);
    const flat = segments ? flattenRoute(segments) : [];
    const routeSet = new Set(flat.map((p) => `${p.x},${p.y}`));

    let bestIdx = 0;
    let bestExp = -1;
    for (let i = 0; i < placed.length; i++) {
      const exp = exposureAt(placed[i].x, placed[i].y, routeSet);
      if (exp > bestExp) {
        bestExp = exp;
        bestIdx = i;
      }
    }
    keepers.push(placed.length > 0 ? placed[bestIdx].idx : 0);

    for (let i = 0; i < placed.length; i++) {
      if (i === bestIdx) continue;
      const { x, y } = placed[i];
      grid[y][x] = Cell.Rock;
      grid[y][x + 1] = Cell.Rock;
      grid[y + 1][x] = Cell.Rock;
      grid[y + 1][x + 1] = Cell.Rock;
    }
  }

  return keepers;
}

let gfx: Graphics | null = null;
const labels: Text[] = [];

export function renderBlueprintOverlay(
  layer: Container,
  blueprint: Blueprint | null,
  wave: number,
  phase: string,
  placedCount: number,
): void {
  if (!gfx) {
    gfx = new Graphics();
    layer.addChild(gfx);
  }
  gfx.clear();
  for (const l of labels) l.destroy();
  labels.length = 0;

  if (!blueprint || phase !== "build" || wave < 1) return;
  const roundIdx = wave - 1;
  if (roundIdx >= blueprint.rounds.length) return;

  const positions = blueprint.rounds[roundIdx];
  const keeperIdx = blueprint.keeperIndices?.[roundIdx] ?? 0;
  const sz = FINE_TILE * 2;

  for (let i = 0; i < positions.length; i++) {
    const [x, y] = positions[i];
    const px = x * FINE_TILE;
    const py = y * FINE_TILE;
    const isKeeper = i === keeperIdx;
    const placed = i < placedCount;

    if (!isKeeper && !placed) continue;

    if (placed) {
      const doneColor = isKeeper ? 0xf0c038 : THEME.good;
      gfx.rect(px + 1, py + 1, sz - 2, sz - 2).fill({ color: doneColor, alpha: 0.12 });
      continue;
    }

    const isNext = i === placedCount;
    const color = isKeeper ? 0xf0c038 : isNext ? THEME.accent : 0xffffff;
    const alpha = isNext ? 0.7 : isKeeper ? 0.6 : 0.35;

    gfx.rect(px, py, sz, 1).fill({ color, alpha });
    gfx.rect(px, py + sz - 1, sz, 1).fill({ color, alpha });
    gfx.rect(px, py, 1, sz).fill({ color, alpha });
    gfx.rect(px + sz - 1, py, 1, sz).fill({ color, alpha });

    if (isNext || isKeeper) {
      gfx.rect(px + 1, py + 1, sz - 2, sz - 2).fill({ color, alpha: 0.1 });
    }

    const labelText = isKeeper ? "K" : String(i + 1);
    const label = new Text({
      text: labelText,
      style: {
        fontFamily: "Press Start 2P",
        fontSize: 7,
        fill: color,
      },
    });
    label.alpha = alpha;
    label.x = px + Math.round((sz - label.width) / 2);
    label.y = py + Math.round((sz - label.height) / 2);
    layer.addChild(label);
    labels.push(label);
  }
}
