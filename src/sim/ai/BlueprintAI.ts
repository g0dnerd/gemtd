import type { HeadlessGame } from '../HeadlessGame';
import { GRID_H, GRID_W, isBuildable } from '../../data/map';
import { MAZE_BLUEPRINT } from '../../data/maze-blueprint';
import { findRoute, flattenRoute } from '../../systems/Pathfinding';
import { gemStats } from '../../data/gems';
import { GRID_SCALE } from '../../game/constants';
import { GreedyAI } from './GreedyAI';

const FOOTPRINT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

export class BlueprintAI extends GreedyAI {
  protected override placeGems(game: HeadlessGame): void {
    const state = game.state;
    const roundIndex = state.wave - 1;

    if (roundIndex < 0 || roundIndex >= MAZE_BLUEPRINT.length) {
      super.placeGems(game);
      return;
    }

    const positions = MAZE_BLUEPRINT[roundIndex];
    let posIdx = 0;

    for (let i = 0; i < 5; i++) {
      if (state.activeDrawSlot === null) break;
      const slot = state.draws.find((d) => d.slotId === state.activeDrawSlot);
      if (!slot || slot.placedTowerId !== null) break;

      if (posIdx < positions.length && this.tryBlueprintPlace(game, positions[posIdx])) {
        posIdx++;
        continue;
      }

      posIdx++;
      this.fallbackPlace(game);
    }
  }

  private tryBlueprintPlace(
    game: HeadlessGame,
    pos: readonly [number, number],
  ): boolean {
    const [x, y] = pos;
    const grid = game.state.grid;

    if (
      x < 0 || y < 0 ||
      x + 1 >= GRID_W || y + 1 >= GRID_H ||
      !isBuildable(grid[y][x]) ||
      !isBuildable(grid[y][x + 1]) ||
      !isBuildable(grid[y + 1][x]) ||
      !isBuildable(grid[y + 1][x + 1])
    ) {
      return false;
    }

    const extra = new Set<number>();
    for (const [dx, dy] of FOOTPRINT) {
      extra.add((y + dy) * GRID_W + (x + dx));
    }
    if (!findRoute(grid, extra)) return false;

    return game.cmdPlace(x, y);
  }

  private fallbackPlace(game: HeadlessGame): void {
    const state = game.state;
    const slot = state.draws.find((d) => d.slotId === state.activeDrawSlot);
    if (!slot || slot.placedTowerId !== null) return;

    let candidates = this.getCandidates(state.grid);
    if (candidates.length === 0) {
      const fallback = this.findAnyOpen(state.grid);
      if (!fallback) return;
      candidates = [fallback];
    }

    const routeLen = state.flatRoute.length;
    const stats = gemStats(slot.gem, slot.quality);
    const rangeFine = stats.range * GRID_SCALE;
    const r2 = rangeFine * rangeFine;

    let bestPos: [number, number] | null = null;
    let bestScore = -Infinity;

    for (const [cx, cy] of candidates) {
      const extra = new Set<number>();
      for (const [dx, dy] of FOOTPRINT) {
        extra.add((cy + dy) * GRID_W + (cx + dx));
      }
      const tryRoute = findRoute(state.grid, extra);
      if (!tryRoute) continue;

      const flatTry = flattenRoute(tryRoute);
      const towerCx = cx + 1;
      const towerCy = cy + 1;
      let exposure = 0;
      for (const pt of flatTry) {
        const ddx = pt.x - towerCx;
        const ddy = pt.y - towerCy;
        if (ddx * ddx + ddy * ddy <= r2) exposure++;
      }

      const mazeGain = flatTry.length - routeLen;
      const score = exposure * 2 + mazeGain;

      if (score > bestScore) {
        bestScore = score;
        bestPos = [cx, cy];
      }
    }

    if (bestPos) {
      game.cmdPlace(bestPos[0], bestPos[1]);
    }
  }
}
