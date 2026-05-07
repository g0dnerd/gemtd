import type { HeadlessGame } from '../HeadlessGame';
import type { SimAI } from '../types';
import type { ComboRecipe } from '../../data/combos';
import type { TowerState } from '../../game/State';
import { Cell, GRID_H, GRID_W, isBuildable } from '../../data/map';
import { findRoute, flattenRoute } from '../../systems/Pathfinding';
import { gemStats } from '../../data/gems';
import { COMBOS, nextUpgrade } from '../../data/combos';
import {
  CHANCE_TIER_UPGRADE_COST,
  MAX_CHANCE_TIER,
  GRID_SCALE,
  QUALITY_BASE_COST,
} from '../../game/constants';

const GOLD_RESERVE = 20;

const FOOTPRINT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

export class GreedyAI implements SimAI {
  playBuild(game: HeadlessGame): void {
    if (game.state.wave > 1) {
      this.upgradeChanceTier(game);
      this.upgradeComboTowers(game);
      game.cmdStartPlacement();
    }

    this.placeGems(game);
    this.tryCombos(game);

    if (game.state.phase === 'build') {
      this.designateKeeper(game);
    }
  }

  private upgradeChanceTier(game: HeadlessGame): void {
    const state = game.state;
    const wave = state.wave;
    while (state.chanceTier < MAX_CHANCE_TIER) {
      const cost = CHANCE_TIER_UPGRADE_COST[state.chanceTier];
      if (state.gold - cost < GOLD_RESERVE) break;

      if (wave <= 10) {
        if (cost > state.gold * 0.6) break;
      } else if (wave <= 25) {
        if (state.gold < cost * 2) break;
      } else {
        if (state.gold < cost * 4) break;
      }

      if (!game.cmdUpgradeChanceTier()) break;
    }
  }

  private upgradeComboTowers(game: HeadlessGame): void {
    const state = game.state;
    const upgradeable: Array<{ towerId: number; cost: number }> = [];

    for (const tower of state.towers) {
      if (!tower.comboKey) continue;
      const combo = COMBOS.find((c) => c.key === tower.comboKey);
      if (!combo) continue;
      const next = nextUpgrade(combo, tower.upgradeTier ?? 0);
      if (!next) continue;
      upgradeable.push({ towerId: tower.id, cost: next.cost });
    }

    upgradeable.sort((a, b) => a.cost - b.cost);

    for (const { towerId, cost } of upgradeable) {
      if (state.gold - cost < GOLD_RESERVE) continue;
      game.cmdUpgradeTower(towerId);
    }
  }

  private placeGems(game: HeadlessGame): void {
    const state = game.state;

    for (let i = 0; i < 5; i++) {
      if (state.activeDrawSlot === null) break;
      const slot = state.draws.find((d) => d.slotId === state.activeDrawSlot);
      if (!slot || slot.placedTowerId !== null) break;

      let candidates = this.getCandidates(state.grid);
      if (candidates.length === 0) {
        const fallback = this.findAnyOpen(state.grid);
        if (!fallback) break;
        candidates = [fallback];
      }

      const routeLen = state.flatRoute.length;
      const stats = gemStats(slot.gem, slot.quality);
      const rangeFine = stats.range * GRID_SCALE;
      const r2 = rangeFine * rangeFine;

      let bestPos: [number, number] | null = null;
      let bestScore = -Infinity;

      for (const [cx, cy] of candidates) {
        const extra = new Set<string>();
        for (const [dx, dy] of FOOTPRINT) {
          extra.add(`${cx + dx},${cy + dy}`);
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

  private getCandidates(grid: Cell[][]): Array<[number, number]> {
    const out: Array<[number, number]> = [];

    for (let y = 2; y <= GRID_H - 4; y++) {
      for (let x = 2; x <= GRID_W - 4; x++) {
        if (
          !isBuildable(grid[y][x]) ||
          !isBuildable(grid[y][x + 1]) ||
          !isBuildable(grid[y + 1][x]) ||
          !isBuildable(grid[y + 1][x + 1])
        )
          continue;

        if (!this.isAdjacentToMaze(grid, x, y)) continue;

        out.push([x, y]);
      }
    }

    return out;
  }

  private isAdjacentToMaze(grid: Cell[][], ax: number, ay: number): boolean {
    for (let dx = -1; dx <= 2; dx++) {
      for (let dy = -1; dy <= 2; dy++) {
        if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) continue;
        const nx = ax + dx;
        const ny = ay + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const cell = grid[ny][nx];
        if (cell === Cell.Tower || cell === Cell.Rock || cell === Cell.Path) return true;
      }
    }
    return false;
  }

  private findAnyOpen(grid: Cell[][]): [number, number] | null {
    for (let y = 2; y <= GRID_H - 4; y++) {
      for (let x = 2; x <= GRID_W - 4; x++) {
        if (
          isBuildable(grid[y][x]) &&
          isBuildable(grid[y][x + 1]) &&
          isBuildable(grid[y + 1][x]) &&
          isBuildable(grid[y + 1][x + 1])
        ) {
          return [x, y];
        }
      }
    }
    return null;
  }

  private tryCombos(game: HeadlessGame): void {
    if (game.state.phase !== 'build') return;

    const ranked = [...COMBOS].sort((a, b) => comboInputCost(b) - comboInputCost(a));

    for (const combo of ranked) {
      if (game.state.phase !== 'build') return;
      const matched = this.matchComboInputs(combo, game.state.towers);
      if (!matched) continue;
      game.cmdCombine(matched.map((t) => t.id));
    }

    if (game.state.phase !== 'build') return;

    const currentRoundIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const roundTowers = game.state.towers.filter(
      (t) => currentRoundIds.has(t.id) && !t.comboKey,
    );

    const groups = new Map<string, TowerState[]>();
    for (const t of roundTowers) {
      const key = `${t.gem}:${t.quality}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    for (const [, towers] of groups) {
      if (game.state.phase !== 'build') return;
      if (towers.length >= 4 && towers[0].quality <= 4) {
        game.cmdCombine(towers.slice(0, 4).map((t) => t.id));
      } else if (towers.length >= 2 && towers[0].quality <= 4) {
        game.cmdCombine(towers.slice(0, 2).map((t) => t.id));
      }
    }
  }

  private matchComboInputs(
    combo: ComboRecipe,
    towers: TowerState[],
  ): TowerState[] | null {
    const used = new Set<number>();
    const result: TowerState[] = [];

    for (const input of combo.inputs) {
      const match = towers.find(
        (t) =>
          !used.has(t.id) &&
          t.gem === input.gem &&
          t.quality === input.quality &&
          !t.comboKey,
      );
      if (!match) return null;
      used.add(match.id);
      result.push(match);
    }

    return result;
  }

  private designateKeeper(game: HeadlessGame): void {
    const state = game.state;
    const currentRoundIds = new Set(
      state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const roundTowers = state.towers.filter((t) => currentRoundIds.has(t.id));

    if (roundTowers.length === 0) return;

    const route = state.flatRoute;
    let bestId = roundTowers[0].id;
    let bestScore = -Infinity;

    for (const tower of roundTowers) {
      const stats = gemStats(tower.gem, tower.quality);
      const avgDmg = (stats.dmgMin + stats.dmgMax) / 2;

      const towerCx = tower.x + 1;
      const towerCy = tower.y + 1;
      const rangeFine = stats.range * GRID_SCALE;
      const r2fine = rangeFine * rangeFine;
      let exposure = 0;
      for (const pt of route) {
        const dx = pt.x - towerCx;
        const dy = pt.y - towerCy;
        if (dx * dx + dy * dy <= r2fine) exposure++;
      }

      let score = avgDmg * stats.atkSpeed * Math.max(1, exposure);

      for (const e of stats.effects) {
        if (e.kind === 'splash') {
          score *= 1.5;
        } else if (e.kind === 'chain') {
          score *= 1 + e.bounces * 0.3;
        } else if (e.kind === 'aura_atkspeed') {
          const auraFine = e.radius * GRID_SCALE;
          const ar2 = auraFine * auraFine;
          const nearbyCount = state.towers.filter((other) => {
            if (other.id === tower.id) return false;
            const ddx = other.x - tower.x;
            const ddy = other.y - tower.y;
            return ddx * ddx + ddy * ddy <= ar2;
          }).length;
          score *= 1 + nearbyCount * 0.4;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestId = tower.id;
      }
    }

    game.cmdDesignateKeep(bestId);
  }
}

function comboInputCost(combo: ComboRecipe): number {
  return combo.inputs.reduce((sum, inp) => sum + QUALITY_BASE_COST[inp.quality], 0);
}
