import type { HeadlessGame } from '../HeadlessGame';
import type { TowerState } from '../../game/State';
import type { ComboRecipe } from '../../data/combos';
import { COMBOS, findAllCombosFor, comboStatsAtTier, COMBO_BY_NAME, nextUpgrade } from '../../data/combos';
import { gemStats } from '../../data/gems';
import { WAVES } from '../../data/waves';
import { GRID_SCALE } from '../../game/constants';
import { BlueprintAI } from './BlueprintAI';

export class StrategistAI extends BlueprintAI {
  protected override upgradeComboTowers(game: HeadlessGame): void {
    const state = game.state;
    const reserve = Math.max(10, state.wave * 2);
    const upgradeable: Array<{ towerId: number; cost: number; dpsGainPerGold: number }> = [];

    for (const tower of state.towers) {
      if (!tower.comboKey) continue;
      const combo = COMBO_BY_NAME.get(tower.comboKey);
      if (!combo) continue;
      const currentTier = tower.upgradeTier ?? 0;
      const upgrade = nextUpgrade(combo, currentTier);
      if (!upgrade) continue;

      const currentStats = comboStatsAtTier(combo, currentTier);
      const nextStats = upgrade.stats;
      const currentDps = ((currentStats.dmgMin + currentStats.dmgMax) / 2) * currentStats.atkSpeed;
      const nextDps = ((nextStats.dmgMin + nextStats.dmgMax) / 2) * nextStats.atkSpeed;
      const dpsGainPerGold = (nextDps - currentDps) / upgrade.cost;

      upgradeable.push({ towerId: tower.id, cost: upgrade.cost, dpsGainPerGold });
    }

    upgradeable.sort((a, b) => b.dpsGainPerGold - a.dpsGainPerGold);

    for (const { towerId, cost } of upgradeable) {
      if (state.gold - cost < reserve) continue;
      game.cmdUpgradeTower(towerId);
    }
  }

  protected override tryCombos(game: HeadlessGame): void {
    if (game.state.phase !== 'build') return;

    const currentRoundIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );

    const bestIndividualDps = this.bestRoundGemDps(game, currentRoundIds);

    // Priority 1: try to complete recipes using this round's draws
    const ranked = [...COMBOS]
      .filter((c) => c.inputs.length > 0)
      .sort((a, b) => comboValue(b) - comboValue(a));

    for (const combo of ranked) {
      if (game.state.phase !== 'build') return;

      const matched = this.matchComboInputs(combo, game.state.towers);
      if (!matched) continue;

      const allCurrentRound = matched.every((t) => currentRoundIds.has(t.id));
      const usesKeptTowers = matched.some((t) => !currentRoundIds.has(t.id));

      if (allCurrentRound) {
        game.cmdCombine(matched.map((t) => t.id));
      } else if (usesKeptTowers) {
        if (comboValue(combo) < bestIndividualDps) continue;
        game.cmdCombine(matched.map((t) => t.id));
      } else {
        game.cmdCombine(matched.map((t) => t.id));
      }
    }

    // Priority 2: level-up combines
    if (game.state.phase !== 'build') return;

    const freshRoundIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const freshRoundTowers = game.state.towers.filter(
      (t) => freshRoundIds.has(t.id) && !t.comboKey,
    );

    const groups = new Map<string, TowerState[]>();
    for (const t of freshRoundTowers) {
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
      if (!this.shouldLevelUp(game, towers[0].gem, resultQ, combineIds, freshRoundTowers)) continue;

      game.cmdCombine(towers.slice(0, count).map((t) => t.id));
    }
  }

  protected override designateKeeper(game: HeadlessGame): void {
    const state = game.state;
    const currentRoundIds = new Set(
      state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const roundTowers = state.towers.filter((t) => currentRoundIds.has(t.id));

    if (roundTowers.length === 0) return;

    const route = state.flatRoute;
    const waveIdx = Math.min(state.wave - 1, WAVES.length - 1);
    const nextWaveDef = waveIdx + 1 < WAVES.length ? WAVES[waveIdx + 1] : null;
    const hasAirNext = nextWaveDef?.groups.some((g) => g.kind === 'air') ?? false;
    const isBossNext = nextWaveDef?.groups.some((g) => g.kind === 'boss') ?? false;

    let bestId = roundTowers[0].id;
    let bestScore = -Infinity;
    let blueprintKeeperId: number | null = null;
    let blueprintKeeperScore = -Infinity;

    const roundIndex = state.wave - 1;
    if (roundIndex >= 0 && roundIndex < this.keeperIndices.length) {
      const targetPosIdx = this.keeperIndices[roundIndex];
      const draw = state.draws[targetPosIdx];
      if (draw?.placedTowerId !== null && draw?.placedTowerId !== undefined) {
        blueprintKeeperId = draw.placedTowerId;
      }
    }

    const keptTowers = state.towers.filter((t) => !currentRoundIds.has(t.id));

    for (const tower of roundTowers) {
      const score = this.scoreTowerKeeper(tower, state.towers, keptTowers, route, hasAirNext, isBossNext);

      if (tower.id === blueprintKeeperId) {
        blueprintKeeperScore = score;
      }

      if (score > bestScore) {
        bestScore = score;
        bestId = tower.id;
      }
    }

    // Prefer blueprint keeper unless another scores meaningfully higher (>1.3x)
    if (
      blueprintKeeperId !== null &&
      blueprintKeeperScore > 0 &&
      bestId !== blueprintKeeperId &&
      bestScore <= blueprintKeeperScore * 1.3
    ) {
      bestId = blueprintKeeperId;
    }

    game.cmdDesignateKeep(bestId);
  }

  private scoreTowerKeeper(
    tower: TowerState,
    allTowers: TowerState[],
    keptTowers: TowerState[],
    route: Array<{ x: number; y: number }>,
    hasAirNext: boolean,
    isBossNext: boolean,
  ): number {
    const stats = tower.comboKey
      ? comboStatsAtTier(COMBO_BY_NAME.get(tower.comboKey)!, tower.upgradeTier ?? 0)
      : gemStats(tower.gem, tower.quality);
    const avgDmg = (stats.dmgMin + stats.dmgMax) / 2;

    // --- Exposure DPS (weight 0.3) ---
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

    let exposureDps = avgDmg * stats.atkSpeed * Math.max(1, exposure);
    for (const e of stats.effects) {
      if (e.kind === 'splash') exposureDps *= 1.5;
      else if (e.kind === 'chain') exposureDps *= 1 + e.bounces * 0.3;
      else if (e.kind === 'aura_atkspeed') {
        const auraFine = e.radius * GRID_SCALE;
        const ar2 = auraFine * auraFine;
        const nearbyCount = allTowers.filter((other) => {
          if (other.id === tower.id) return false;
          const ddx = other.x - tower.x;
          const ddy = other.y - tower.y;
          return ddx * ddx + ddy * ddy <= ar2;
        }).length;
        exposureDps *= 1 + nearbyCount * 0.4;
      }
    }

    // --- Combo contribution (weight 0.4) ---
    let comboScore = 0;
    if (!tower.comboKey) {
      const combosFor = findAllCombosFor(tower.gem, tower.quality);
      for (const combo of combosFor) {
        const readiness = this.comboReadiness(combo, allTowers, tower.id);
        if (readiness.missing === 0) {
          comboScore += comboValue(combo) * 2;
        } else if (readiness.missing === 1) {
          comboScore += comboValue(combo) * 1.2;
        } else {
          comboScore += comboValue(combo) * (readiness.have / readiness.total) * 0.5;
        }
      }
    } else {
      comboScore = comboValue(COMBO_BY_NAME.get(tower.comboKey)!) * 1.5;
    }

    // --- Quality premium (weight 0.15) ---
    // Scale quality to DPS-equivalent: higher quality = rarer = more worth keeping
    const qualityPremium = tower.quality >= 3
      ? avgDmg * stats.atkSpeed * (tower.quality - 2) * 0.5
      : 0;

    // --- Wave awareness (weight 0.15) ---
    let waveBonus = 0;
    if (hasAirNext) {
      if (tower.gem === 'amethyst' || stats.targeting === 'all') {
        waveBonus += exposureDps * 0.3;
      }
      if (stats.targeting === 'ground') {
        waveBonus -= exposureDps * 0.3;
      }
    }
    if (isBossNext) {
      const hasSplash = stats.effects.some((e) => e.kind === 'splash');
      if (!hasSplash) waveBonus += exposureDps * 0.15;
    }

    // --- Targeting portfolio penalty ---
    // Penalize keeping gems whose targeting restriction is already overrepresented
    let portfolioMult = 1.0;
    if (stats.targeting !== 'all' && keptTowers.length >= 2) {
      const sameTargeting = keptTowers.filter((t) => {
        const ts = t.comboKey
          ? comboStatsAtTier(COMBO_BY_NAME.get(t.comboKey)!, t.upgradeTier ?? 0)
          : gemStats(t.gem, t.quality);
        return ts.targeting === stats.targeting;
      }).length;
      const ratio = sameTargeting / keptTowers.length;
      if (ratio > 0.4) portfolioMult = 0.5;
      else if (ratio > 0.25) portfolioMult = 0.75;
    }

    // --- Diversity penalty ---
    // Duplicate gem types with no combo value waste a keeper slot
    if (!tower.comboKey && comboScore === 0) {
      const sameGemKept = keptTowers.filter(
        (t) => t.gem === tower.gem && !t.comboKey,
      ).length;
      if (sameGemKept > 0) portfolioMult *= 0.5;
    }

    return (
      exposureDps * 0.3 +
      comboScore * 0.4 +
      qualityPremium * 0.15 +
      waveBonus * 0.15
    ) * portfolioMult;
  }

  private comboReadiness(
    combo: ComboRecipe,
    towers: TowerState[],
    excludeId: number,
  ): { have: number; missing: number; total: number } {
    const total = combo.inputs.length;
    const used = new Set<number>();
    let have = 0;

    for (const input of combo.inputs) {
      const match = towers.find(
        (t) =>
          t.id !== excludeId &&
          !used.has(t.id) &&
          t.gem === input.gem &&
          t.quality === input.quality &&
          !t.comboKey,
      );
      if (match) {
        used.add(match.id);
        have++;
      }
    }

    // The tower being scored IS one of the inputs, so count it
    const isInput = combo.inputs.some(
      (inp) => {
        const tower = towers.find((t) => t.id === excludeId);
        return tower && inp.gem === tower.gem && inp.quality === tower.quality;
      },
    );
    if (isInput) have++;

    return { have: Math.min(have, total), missing: total - Math.min(have, total), total };
  }
}

function comboValue(combo: ComboRecipe): number {
  const stats = combo.stats;
  const avgDmg = (stats.dmgMin + stats.dmgMax) / 2;
  let dps = avgDmg * stats.atkSpeed;

  for (const e of stats.effects) {
    if (e.kind === 'splash') dps *= 1.5;
    else if (e.kind === 'chain') dps *= 1 + e.bounces * 0.3;
    else if (e.kind === 'slow') dps *= 1.3;
    else if (e.kind === 'poison') dps += e.dps * e.duration * 0.5;
    else if (e.kind === 'stun') dps *= 1 + e.chance * 2;
    else if (e.kind === 'crit') dps *= 1 + e.chance * (e.multiplier - 1);
    else if (e.kind === 'aura_atkspeed') dps *= 1 + e.pct * 3;
  }

  if (combo.upgrades.length > 0) dps *= 1.3;

  return dps;
}
