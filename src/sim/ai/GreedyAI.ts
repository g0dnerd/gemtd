import type { HeadlessGame } from '../HeadlessGame';
import type { SimAI } from '../types';
import type { ComboRecipe } from '../../data/combos';
import type { TowerState } from '../../game/State';
import { Cell, GRID_H, GRID_W, isBuildable } from '../../data/map';
import { findRoute, flattenRoute } from '../../systems/Pathfinding';
import { gemStats } from '../../data/gems';
import { COMBOS, COMBO_BY_NAME, nextUpgrade, findAllCombosFor } from '../../data/combos';
import {
  MAX_CHANCE_TIER,
  GRID_SCALE,
  QUALITY_BASE_COST,
} from '../../game/constants';

const GOLD_RESERVE = 20;

const QUALITY_NAMES: Record<number, string> = {
  1: 'Chipped', 2: 'Flawed', 3: 'Normal', 4: 'Flawless', 5: 'Perfect',
};

const GEM_NAMES: Record<string, string> = {
  ruby: 'Ruby', sapphire: 'Sapphire', emerald: 'Emerald', topaz: 'Topaz',
  amethyst: 'Amethyst', opal: 'Opal', diamond: 'Diamond', aquamarine: 'Aquamarine',
};

function gemLabel(gem: string, quality: number): string {
  return `${QUALITY_NAMES[quality] ?? '?'} ${GEM_NAMES[gem] ?? gem}`;
}

const FOOTPRINT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

export class GreedyAI implements SimAI {
  readonly log: string[] = [];
  logging = false;

  playBuild(game: HeadlessGame): void {
    const s = game.state;
    if (this.logging) {
      const ws = s.waveStats;
      const prevWaveInfo = s.wave > 1 ? ` (prev: ${ws.killedThisWave}killed ${ws.leakedThisWave}leaked)` : '';
      this.log.push(`\n── Wave ${s.wave} ── gold:${s.gold} lives:${s.lives} chanceTier:${s.chanceTier} towers:${s.towers.length} route:${s.flatRoute.length}${prevWaveInfo}`);
      if (s.towers.length > 0) {
        const towerList = s.towers.map((t) => {
          const label = t.comboKey ?? gemLabel(t.gem, t.quality);
          return `${label}@(${t.x},${t.y})`;
        }).join(', ');
        this.log.push(`  existing: ${towerList}`);
      }
    }

    if (game.state.wave > 1) {
      const tierBefore = s.chanceTier;
      const goldBefore = s.gold;
      this.upgradeChanceTier(game);
      if (this.logging && s.chanceTier > tierBefore) {
        this.log.push(`  chance tier ${tierBefore}→${s.chanceTier} (spent ${goldBefore - s.gold}g, left ${s.gold}g)`);
      }
      this.upgradeComboTowers(game);
      game.cmdStartPlacement();
    }

    if (this.logging) {
      const draws = s.draws.map((d) => gemLabel(d.gem, d.quality));
      this.log.push(`  draws: ${draws.join(', ')}`);
    }

    this.placeGems(game);
    this.tryCombos(game);

    if (game.state.phase === 'build') {
      this.designateKeeper(game);
    }
  }

  protected upgradeChanceTier(game: HeadlessGame): void {
    while (game.state.chanceTier < MAX_CHANCE_TIER) {
      if (!game.cmdUpgradeChanceTier()) break;
    }
  }

  protected upgradeComboTowers(game: HeadlessGame): void {
    const state = game.state;
    const upgradeable: Array<{ towerId: number; cost: number }> = [];

    for (const tower of state.towers) {
      if (!tower.comboKey) continue;
      const combo = COMBO_BY_NAME.get(tower.comboKey!);
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

  protected placeGems(game: HeadlessGame): void {
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

  protected getCandidates(grid: Cell[][]): Array<[number, number]> {
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

  protected isAdjacentToMaze(grid: Cell[][], ax: number, ay: number): boolean {
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

  protected findAnyOpen(grid: Cell[][]): [number, number] | null {
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

  protected tryCombos(game: HeadlessGame): void {
    if (game.state.phase !== 'build') return;

    const currentRoundIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );

    // Best individual gem DPS from this round (the "keep" alternative)
    const bestIndividualDps = this.bestRoundGemDps(game, currentRoundIds);

    const ranked = COMBOS.filter((c) => c.inputs.length > 0)
      .sort((a, b) => comboInputCost(b) - comboInputCost(a));

    for (const combo of ranked) {
      if (game.state.phase !== 'build') return;
      const matched = this.matchComboInputs(combo, game.state.towers);
      if (!matched) continue;

      const allCurrentRound = matched.every((t) => currentRoundIds.has(t.id));
      const usesKeptTowers = matched.some((t) => !currentRoundIds.has(t.id));

      if (allCurrentRound) {
        if (this.logging) {
          const inputs = matched.map((t) => gemLabel(t.gem, t.quality)).join('+');
          this.log.push(`  combo: ${combo.name} (${inputs}) [all current-round → auto-take]`);
        }
        game.cmdCombine(matched.map((t) => t.id));
      } else if (usesKeptTowers) {
        const comboDps = estimateComboDps(combo);
        if (comboDps < bestIndividualDps) {
          if (this.logging) {
            const inputs = matched.map((t) => gemLabel(t.gem, t.quality)).join('+');
            this.log.push(`  combo SKIP: ${combo.name} (${inputs}) dps=${Math.round(comboDps)} < bestGem=${Math.round(bestIndividualDps)}`);
          }
          continue;
        }
        if (this.logging) {
          const inputs = matched.map((t) => gemLabel(t.gem, t.quality)).join('+');
          this.log.push(`  combo: ${combo.name} (${inputs}) [uses kept towers, dps=${Math.round(comboDps)} > ${Math.round(bestIndividualDps)}]`);
        }
        game.cmdCombine(matched.map((t) => t.id));
      } else {
        if (this.logging) {
          const inputs = matched.map((t) => gemLabel(t.gem, t.quality)).join('+');
          this.log.push(`  combo: ${combo.name} (${inputs})`);
        }
        game.cmdCombine(matched.map((t) => t.id));
      }
    }

    if (game.state.phase !== 'build') return;

    // Level-up combines: 2× or 4× same gem+quality
    const freshRoundIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const roundTowers = game.state.towers.filter(
      (t) => freshRoundIds.has(t.id) && !t.comboKey,
    );

    const groups = new Map<string, TowerState[]>();
    for (const t of roundTowers) {
      const key = `${t.gem}:${t.quality}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    for (const [, towers] of groups) {
      if (game.state.phase !== 'build') return;
      const canCombine4 = towers.length >= 4 && towers[0].quality <= 4;
      const canCombine2 = towers.length >= 2 && towers[0].quality <= 4;
      const count = canCombine4 ? 4 : canCombine2 ? 2 : 0;
      if (count === 0) continue;

      const resultQ = Math.min(5, towers[0].quality + (count === 4 ? 2 : 1));
      const combineIds = new Set(towers.slice(0, count).map((t) => t.id));
      if (!this.shouldLevelUp(game, towers[0].gem, resultQ, combineIds, roundTowers)) {
        if (this.logging) {
          this.log.push(`  level-up SKIP: ${count}×${gemLabel(towers[0].gem, towers[0].quality)} → q${resultQ} (better keeper available)`);
        }
        continue;
      }

      if (this.logging) {
        this.log.push(`  level-up: ${count}×${gemLabel(towers[0].gem, towers[0].quality)} → q${resultQ}`);
      }
      game.cmdCombine(towers.slice(0, count).map((t) => t.id));
    }
  }

  /**
   * Level-up combines auto-keep the result and rock everything else.
   * Only combine if the result is actually the best keeper in the round.
   */
  protected shouldLevelUp(
    _game: HeadlessGame,
    gem: string,
    resultQuality: number,
    combineIds: Set<number>,
    roundTowers: TowerState[],
  ): boolean {
    for (const t of roundTowers) {
      if (combineIds.has(t.id) || t.comboKey) continue;
      if (t.gem === gem && t.quality >= resultQuality) return false;
      if (t.quality > resultQuality) return false;
    }
    return true;
  }

  protected bestRoundGemDps(
    game: HeadlessGame,
    currentRoundIds: Set<number>,
  ): number {
    let best = 0;
    for (const tower of game.state.towers) {
      if (!currentRoundIds.has(tower.id) || tower.comboKey) continue;
      const stats = gemStats(tower.gem, tower.quality);
      const avgDmg = (stats.dmgMin + stats.dmgMax) / 2;
      let dps = avgDmg * stats.atkSpeed;
      for (const e of stats.effects) {
        if (e.kind === 'splash') dps *= 1.5;
        else if (e.kind === 'chain') dps *= 1 + e.bounces * 0.3;
        else if (e.kind === 'poison') dps += e.dps * e.duration * 0.3;
        else if (e.kind === 'crit') dps *= 1 + e.chance * (e.multiplier - 1);
      }
      if (stats.targeting === 'air') dps *= 0.25;
      else if (stats.targeting === 'ground') dps *= 0.7;
      if (dps > best) best = dps;
    }
    return best;
  }

  protected matchComboInputs(
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

  protected designateKeeper(game: HeadlessGame): void {
    const state = game.state;
    const currentRoundIds = new Set(
      state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const roundTowers = state.towers.filter((t) => currentRoundIds.has(t.id));

    if (roundTowers.length === 0) return;

    const keptTowers = state.towers.filter(
      (t) => !currentRoundIds.has(t.id) && !t.comboKey,
    );

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

      // #1: Targeting penalty — air/ground-only gems are useless on many waves
      if (stats.targeting === 'air') score *= 0.3;
      else if (stats.targeting === 'ground') score *= 0.7;

      // #2: Combo ingredient bonus — reward gems that advance a recipe
      const comboBonus = this.comboIngredientBonus(tower, keptTowers);
      score += comboBonus;

      // #3: Diversity penalty — duplicate gem types without combo value are wasteful
      const sameGemKept = keptTowers.filter(
        (t) => t.gem === tower.gem && !t.comboKey,
      ).length;
      const diversityMult = sameGemKept > 0 && comboBonus === 0 ? 0.5 : 1.0;
      score *= diversityMult;

      if (this.logging) {
        const label = tower.comboKey ?? gemLabel(tower.gem, tower.quality);
        const comboPart = comboBonus > 0 ? ` combo+${Math.round(comboBonus)}` : '';
        const targetPart = stats.targeting !== 'all' ? ` [${stats.targeting}]` : '';
        const divPart = diversityMult < 1 ? ' dup×0.5' : '';
        this.log.push(`    keeper candidate: ${label} score=${Math.round(score)} (dmg=${Math.round(avgDmg)} atk=${stats.atkSpeed.toFixed(2)} exp=${exposure}${targetPart}${comboPart}${divPart})`);
      }

      if (score > bestScore) {
        bestScore = score;
        bestId = tower.id;
      }
    }

    if (this.logging) {
      const kept = roundTowers.find((t) => t.id === bestId)!;
      const label = kept.comboKey ?? gemLabel(kept.gem, kept.quality);
      this.log.push(`  → KEEP: ${label} (score=${Math.round(bestScore)})`);
    }

    game.cmdDesignateKeep(bestId);
  }

  protected comboIngredientBonus(
    tower: TowerState,
    keptTowers: TowerState[],
  ): number {
    if (tower.comboKey) return 0;

    const relevantCombos = findAllCombosFor(tower.gem, tower.quality);
    if (relevantCombos.length === 0) return 0;

    let bestBonus = 0;

    for (const combo of relevantCombos) {
      const needed = combo.inputs.slice();
      const used = new Set<number>();

      // Count this tower as providing one input
      const selfIdx = needed.findIndex(
        (inp) => inp.gem === tower.gem && inp.quality === tower.quality,
      );
      if (selfIdx < 0) continue;
      needed.splice(selfIdx, 1);

      // Count how many remaining inputs are satisfied by kept towers
      let have = 0;
      for (const inp of needed) {
        const match = keptTowers.find(
          (t) =>
            !used.has(t.id) &&
            t.gem === inp.gem &&
            t.quality === inp.quality,
        );
        if (match) {
          used.add(match.id);
          have++;
        }
      }

      const missing = needed.length - have;
      const comboDps = estimateComboDps(combo);

      if (missing === 0) {
        // Keeping this gem completes the recipe next round
        bestBonus = Math.max(bestBonus, comboDps * 3);
      } else if (missing === 1) {
        // One more ingredient needed after this
        bestBonus = Math.max(bestBonus, comboDps * 1.0);
      } else if (missing === 2 && needed.length >= 3) {
        bestBonus = Math.max(bestBonus, comboDps * 0.3);
      }
    }

    return bestBonus;
  }
}

function comboInputCost(combo: ComboRecipe): number {
  return combo.inputs.reduce((sum, inp) => sum + QUALITY_BASE_COST[inp.quality], 0);
}

function estimateComboDps(combo: ComboRecipe): number {
  const s = combo.stats;
  const avgDmg = (s.dmgMin + s.dmgMax) / 2;
  let dps = avgDmg * s.atkSpeed;
  for (const e of s.effects) {
    if (e.kind === 'splash') dps *= 1.5;
    else if (e.kind === 'chain') dps *= 1 + e.bounces * 0.3;
    else if (e.kind === 'poison') dps += e.dps * e.duration * 0.3;
    else if (e.kind === 'slow') dps *= 1.2;
    else if (e.kind === 'stun') dps *= 1 + e.chance * 2;
    else if (e.kind === 'crit') dps *= 1 + e.chance * (e.multiplier - 1);
    else if (e.kind === 'aura_atkspeed') dps *= 1 + e.pct * 3;
  }
  return dps;
}
