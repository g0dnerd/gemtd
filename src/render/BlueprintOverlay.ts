import { Container, Graphics, Text } from "pixi.js";
import { FINE_TILE } from "../game/constants";
import { THEME } from "./theme";
import type { Blueprint } from "../sim/blueprintKeeper";
export type { Blueprint } from "../sim/blueprintKeeper";
export { computeKeeperIndices } from "../sim/blueprintKeeper";

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
