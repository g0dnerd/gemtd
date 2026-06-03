import type { HeadlessGame } from '../HeadlessGame';
import { GRID_H, GRID_W, isBuildable } from '../../data/map';
import { MAZE_BLUEPRINT, MAZE_REMOVALS, MAZE_KEEPER_INDICES } from '../../data/maze-blueprint';
import { findRoute, flattenRoute } from '../../systems/Pathfinding';
import { gemStats } from '../../data/gems';
import { GRID_SCALE } from '../../game/constants';
import { computeKeeperIndices } from '../blueprintKeeper';
import { GreedyAI } from './GreedyAI';

const FOOTPRINT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

export class BlueprintAI extends GreedyAI {
  protected readonly keeperIndices: number[];

  constructor() {
    super();
    this.keeperIndices = MAZE_KEEPER_INDICES
      ? Array.from(MAZE_KEEPER_INDICES)
      : computeKeeperIndices({
          rounds: MAZE_BLUEPRINT as [number, number][][],
          removals: MAZE_REMOVALS as [number, number][][],
        });
  }

  protected override placeGems(game: HeadlessGame): void {
    const state = game.state;
    const roundIndex = state.wave - 1;

    if (roundIndex < 0 || roundIndex >= MAZE_BLUEPRINT.length) {
      super.placeGems(game);
      return;
    }

    const removals = MAZE_REMOVALS[roundIndex] ?? [];
    for (const [rx, ry] of removals) {
      const rock = game.state.rocks.find((r) => r.x === rx && r.y === ry);
      if (rock) game.cmdRemoveRock(rock.id);
    }

    const positions = MAZE_BLUEPRINT[roundIndex];
    const keeperPosIdx = roundIndex < this.keeperIndices.length
      ? this.keeperIndices[roundIndex]
      : -1;

    if (keeperPosIdx >= 0 && keeperPosIdx < positions.length) {
      const [kx, ky] = positions[keeperPosIdx];
      const removed = new Set<number>();
      for (const [dx, dy] of FOOTPRINT) {
        const rock = state.rocks.find((r) => r.x === kx + dx && r.y === ky + dy);
        if (rock && !removed.has(rock.id)) {
          removed.add(rock.id);
          game.cmdRemoveRock(rock.id);
        }
      }
    }

    // Build placement order: put the best gem at the keeper position
    const unplaced = state.draws.filter((d) => d.placedTowerId === null);
    const slotOrder = this.buildSlotOrder(unplaced, keeperPosIdx, positions.length);

    let posIdx = 0;
    for (const slotId of slotOrder) {
      if (state.activeDrawSlot === null) break;
      game.cmdSetActiveSlot(slotId);
      const slot = state.draws.find((d) => d.slotId === slotId);
      if (!slot || slot.placedTowerId !== null) continue;

      if (posIdx < positions.length && this.tryBlueprintPlace(game, positions[posIdx])) {
        posIdx++;
        continue;
      }

      const failedPos = posIdx < positions.length ? positions[posIdx] : null;
      posIdx++;
      this.fallbackPlace(game, failedPos);
    }
  }

  /** Order draw slots so the best gem is placed at the keeper position. */
  protected buildSlotOrder(
    unplaced: Array<{ slotId: number; gem: import('../../render/theme').GemType; quality: number }>,
    keeperPosIdx: number,
    positionCount: number,
  ): number[] {
    if (unplaced.length === 0) return [];
    if (keeperPosIdx < 0 || keeperPosIdx >= positionCount) {
      return unplaced.map((d) => d.slotId);
    }

    // Rank draws by effective DPS (penalizing restricted targeting)
    const ranked = unplaced
      .map((d) => {
        const stats = gemStats(d.gem, d.quality as 1 | 2 | 3 | 4 | 5);
        const avgDmg = (stats.dmgMin + stats.dmgMax) / 2;
        let dps = avgDmg * stats.atkSpeed;
        for (const e of stats.effects) {
          if (e.kind === 'splash') dps *= 1.5;
          else if (e.kind === 'chain') dps *= 1 + e.bounces * 0.3;
          else if (e.kind === 'poison') dps += e.dps * e.duration * 0.3;
          else if (e.kind === 'crit') dps *= 1 + e.chance * (e.multiplier - 1);
        }
        if (stats.targeting === 'air') dps *= 0.3;
        else if (stats.targeting === 'ground') dps *= 0.7;
        return { slotId: d.slotId, dps };
      })
      .sort((a, b) => b.dps - a.dps);

    // Place best gem at the keeper position, fill others in rank order
    const bestSlot = ranked[0].slotId;
    const rest = ranked.slice(1).map((r) => r.slotId);
    const order: number[] = [];
    for (let i = 0; i < Math.max(positionCount, unplaced.length); i++) {
      if (i === keeperPosIdx) {
        order.push(bestSlot);
      } else {
        const next = rest.shift();
        if (next !== undefined) order.push(next);
      }
    }
    // If keeper position was beyond the slots we iterated, append bestSlot
    if (!order.includes(bestSlot)) order.splice(keeperPosIdx, 0, bestSlot);

    return order;
  }

  protected override designateKeeper(game: HeadlessGame): void {
    const state = game.state;
    const roundIndex = state.wave - 1;

    if (roundIndex < 0 || roundIndex >= this.keeperIndices.length) {
      super.designateKeeper(game);
      return;
    }

    const targetPosIdx = this.keeperIndices[roundIndex];
    const positions = MAZE_BLUEPRINT[roundIndex];
    if (targetPosIdx >= 0 && targetPosIdx < positions.length) {
      const [kx, ky] = positions[targetPosIdx];
      const tower = state.towers.find((t) => t.x === kx && t.y === ky);
      if (tower && state.draws.some((d) => d.placedTowerId === tower.id)) {
        game.cmdDesignateKeep(tower.id);
        return;
      }
    }

    super.designateKeeper(game);
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

  private fallbackPlace(
    game: HeadlessGame,
    failedPos: readonly [number, number] | null,
  ): void {
    const state = game.state;
    const slot = state.draws.find((d) => d.slotId === state.activeDrawSlot);
    if (!slot || slot.placedTowerId !== null) return;

    if (failedPos) {
      const near = this.getNearCandidates(state.grid, failedPos[0], failedPos[1], 4);
      const placed = this.scoredPlace(game, near);
      if (placed) return;
    }

    let candidates = this.getCandidates(state.grid);
    if (candidates.length === 0) {
      const fallback = this.findAnyOpen(state.grid);
      if (!fallback) return;
      candidates = [fallback];
    }

    this.scoredPlace(game, candidates);
  }

  private getNearCandidates(
    grid: import('../../data/map').Cell[][],
    tx: number,
    ty: number,
    radius: number,
  ): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let y = Math.max(0, ty - radius); y <= Math.min(GRID_H - 2, ty + radius); y++) {
      for (let x = Math.max(0, tx - radius); x <= Math.min(GRID_W - 2, tx + radius); x++) {
        const dist = Math.abs(x - tx) + Math.abs(y - ty);
        if (dist > radius) continue;
        if (
          !isBuildable(grid[y][x]) ||
          !isBuildable(grid[y][x + 1]) ||
          !isBuildable(grid[y + 1]?.[x]) ||
          !isBuildable(grid[y + 1]?.[x + 1])
        ) continue;
        out.push([x, y]);
      }
    }
    return out;
  }

  private scoredPlace(
    game: HeadlessGame,
    candidates: Array<[number, number]>,
  ): boolean {
    if (candidates.length === 0) return false;
    const state = game.state;
    const slot = state.draws.find((d) => d.slotId === state.activeDrawSlot);
    if (!slot || slot.placedTowerId !== null) return false;

    const baseFlat = state.flatRoute;
    const routeLen = baseFlat.length;
    // See GreedyAI.placeGems: off-route candidates leave the route byte-identical,
    // so they can be scored against the cached route without a redundant A* call.
    const routeSet = new Set<number>();
    for (const pt of baseFlat) routeSet.add(pt.y * GRID_W + pt.x);
    const stats = gemStats(slot.gem, slot.quality);
    const rangeFine = stats.range * GRID_SCALE;
    const r2 = rangeFine * rangeFine;

    let bestPos: [number, number] | null = null;
    let bestScore = -Infinity;

    for (const [cx, cy] of candidates) {
      let touchesRoute = false;
      for (const [dx, dy] of FOOTPRINT) {
        if (routeSet.has((cy + dy) * GRID_W + (cx + dx))) {
          touchesRoute = true;
          break;
        }
      }

      let flatTry: { x: number; y: number }[];
      if (touchesRoute) {
        const extra = new Set<number>();
        for (const [dx, dy] of FOOTPRINT) {
          extra.add((cy + dy) * GRID_W + (cx + dx));
        }
        const tryRoute = findRoute(state.grid, extra);
        if (!tryRoute) continue;
        flatTry = flattenRoute(tryRoute);
      } else {
        flatTry = baseFlat;
      }

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
      return game.cmdPlace(bestPos[0], bestPos[1]);
    }
    return false;
  }
}
