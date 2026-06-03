import type { HeadlessGame } from "../HeadlessGame";
import type { TowerState } from "../../game/State";
import type { ComboRecipe } from "../../data/combos";
import type { GemType, Quality } from "../../render/theme";
import {
  COMBOS,
  COMBO_BY_NAME,
  findAllCombosFor,
  nextUpgrade,
} from "../../data/combos";
import { GRID_SCALE, MAX_CHANCE_TIER } from "../../game/constants";
import { BlueprintAI } from "./BlueprintAI";
import { MAZE_BLUEPRINT } from "../../data/maze-blueprint";

const QUALITY_NAMES: Record<number, string> = {
  1: "Chipped",
  2: "Flawed",
  3: "Normal",
  4: "Flawless",
  5: "Perfect",
};

const GEM_NAMES: Record<string, string> = {
  ruby: "Ruby",
  sapphire: "Sapphire",
  emerald: "Emerald",
  topaz: "Topaz",
  amethyst: "Amethyst",
  opal: "Opal",
  diamond: "Diamond",
  aquamarine: "Aquamarine",
  garnet: "Garnet",
  spinel: "Spinel",
  peridot: "Peridot",
};

function gemLabel(gem: string, quality: number): string {
  return `${QUALITY_NAMES[quality] ?? "?"} ${GEM_NAMES[gem] ?? gem}`;
}

const PRIORITY_COMBOS = new Set(["stargem", "black_opal"]);

function estimateComboDps(combo: ComboRecipe): number {
  const s = combo.stats;
  const avgDmg = (s.dmgMin + s.dmgMax) / 2;
  let dps = avgDmg * s.atkSpeed;
  for (const e of s.effects) {
    if (e.kind === "splash") dps *= 1.5;
    else if (e.kind === "chain") dps *= 1 + e.bounces * 0.3;
    else if (e.kind === "poison") dps += e.dps * e.duration * 0.3;
    else if (e.kind === "slow") dps *= 1.2;
    else if (e.kind === "stun") dps *= 1 + e.chance * 2;
    else if (e.kind === "crit") dps *= 1 + e.chance * (e.multiplier - 1);
    else if (e.kind === "aura_atkspeed") dps *= 1 + e.pct * 3;
    else if (e.kind === "aura_dmg") dps *= 1 + e.pct * 3;
    else if (e.kind === "multi_target") dps *= Math.min(e.count, 5);
    else if (e.kind === "prox_burn") dps += e.dps * 3;
    else if (e.kind === "prox_armor_reduce") dps += e.value * 15;
    else if (e.kind === "charge_burst") dps *= 1.5;
    else if (e.kind === "momentum") dps *= (1 + e.rampSpeed) / 2;
    else if (e.kind === "pierce") dps *= 1 + e.count * 0.4;
    else if (e.kind === "kill_explode") dps *= 1.3;
    else if (e.kind === "speed_damage_aura") dps += e.dps * 3;
    else if (e.kind === "distance_scaling") dps *= (e.minMult + e.maxMult) / 2;
    else if (e.kind === "amplifying_chain")
      dps *= 1 + e.bounces * (1 + e.ampPerBounce) * 0.3;
    else if (e.kind === "adaptive_mode")
      dps *= 1 + e.scatterCount * e.scatterDmgMult * 0.3;
  }
  return dps;
}

export class HeuristicAI extends BlueprintAI {
  private _game: HeadlessGame | null = null;

  override playBuild(game: HeadlessGame): void {
    this._game = game;
    const s = game.state;
    if (this.logging) {
      const ws = s.waveStats;
      const prevWaveInfo =
        s.wave > 1
          ? ` (prev: ${ws.killedThisWave}killed ${ws.leakedThisWave}leaked)`
          : "";
      this.log.push(
        `\n── Wave ${s.wave} ── gold:${s.gold} lives:${s.lives} chanceTier:${s.chanceTier} towers:${s.towers.length} route:${s.flatRoute.length}${prevWaveInfo}`,
      );
      if (s.towers.length > 0) {
        const towerList = s.towers
          .map((t) => {
            const label = t.comboKey ?? gemLabel(t.gem, t.quality);
            return `${label}@(${t.x},${t.y})`;
          })
          .join(", ");
        this.log.push(`  existing: ${towerList}`);
      }
    }

    if (s.wave > 1) {
      const tierBefore = s.chanceTier;
      const goldBefore = s.gold;
      this.upgradeChanceTier(game);
      if (this.logging && s.chanceTier > tierBefore) {
        this.log.push(
          `  chance tier ${tierBefore}→${s.chanceTier} (spent ${goldBefore - s.gold}g, left ${s.gold}g)`,
        );
      }
      this.formKeptTowerCombos(game);
      this.upgradeComboTowers(game);
      game.cmdStartPlacement();
    }

    if (this.logging) {
      const draws = s.draws.map((d) => gemLabel(d.gem, d.quality));
      this.log.push(`  draws: ${draws.join(", ")}`);
    }

    this.placeGems(game);
    this.tryCombos(game);

    if (game.state.phase === "build") {
      const demoted = this.designateKeeper(game);
      if (!demoted) {
        this.formComboWithKeeper(game);
      }
    }

    // After any auto-conclude (level-up or demotion), form combos from
    // surviving towers immediately — recipe combines work during wave phase
    this.formKeptTowerCombos(game);
  }

  protected override upgradeComboTowers(game: HeadlessGame): void {
    const state = game.state;

    // Special (combo) upgrades only begin once the final chance tier is bought;
    // until then every spare gold goes toward chance tier.
    if (state.chanceTier < MAX_CHANCE_TIER) {
      if (this.logging) {
        this.log.push(
          `  no special upgrades yet (chance tier ${state.chanceTier}/${MAX_CHANCE_TIER})`,
        );
      }
      return;
    }

    // Priority: Black Opal → Void Opal always takes precedence, then the rest
    // strictly by gem kills.
    const voidOpals: number[] = [];
    const rest: Array<{ towerId: number; kills: number }> = [];

    for (const tower of state.towers) {
      if (!tower.comboKey) continue;
      const combo = COMBO_BY_NAME.get(tower.comboKey);
      if (!combo) continue;
      if (!nextUpgrade(combo, tower.upgradeTier ?? 0)) continue;
      if (tower.comboKey === "black_opal") {
        voidOpals.push(tower.id);
      } else {
        rest.push({ towerId: tower.id, kills: tower.kills });
      }
    }

    rest.sort((a, b) => b.kills - a.kills);
    const order = [...voidOpals, ...rest.map((r) => r.towerId)];

    // Fully upgrade each tower through every tier it can afford before moving
    // to the next. When the next-priority upgrade is unaffordable, stop and
    // save up rather than buying a cheaper lower-priority upgrade.
    for (const towerId of order) {
      const tower = state.towers.find((t) => t.id === towerId);
      if (!tower || !tower.comboKey) continue;
      const combo = COMBO_BY_NAME.get(tower.comboKey);
      if (!combo) continue;

      for (;;) {
        const upgrade = nextUpgrade(combo, tower.upgradeTier ?? 0);
        if (!upgrade) break;
        if (state.gold < upgrade.cost) {
          if (this.logging) {
            this.log.push(
              `  saving for: ${combo.name} → ${upgrade.name} (${upgrade.cost}g, have ${state.gold}g)`,
            );
          }
          return;
        }
        if (this.logging) {
          this.log.push(
            `  upgrade: ${combo.name} → ${upgrade.name} (${upgrade.cost}g, ${tower.kills} kills)`,
          );
        }
        game.cmdUpgradeTower(towerId);
      }
    }
  }

  private formKeptTowerCombos(game: HeadlessGame): void {
    const ranked = COMBOS.filter((c) => c.inputs.length > 0).sort(
      (a, b) => estimateComboDps(b) - estimateComboDps(a),
    );

    for (const combo of ranked) {
      const towers = game.state.towers.filter((t) => !t.comboKey);
      const matched = this.matchComboInputs(combo, towers);
      if (!matched) continue;

      const reordered = this.reorderByExposure(matched);
      if (this.logging) {
        const inputs = matched.map((t) => gemLabel(t.gem, t.quality)).join("+");
        this.log.push(`  combo (kept towers): ${combo.name} (${inputs})`);
      }
      game.cmdCombine(reordered.map((t) => t.id));
    }
  }

  private formComboWithKeeper(game: HeadlessGame): void {
    if (game.state.phase !== "build") return;
    const keepId = game.state.designatedKeepTowerId;
    if (keepId === null) return;

    const keeper = game.state.towers.find((t) => t.id === keepId);
    if (!keeper || keeper.comboKey) return;

    const currentRoundIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const survivors = game.state.towers.filter(
      (t) => !t.comboKey && (!currentRoundIds.has(t.id) || t.id === keepId),
    );

    const ranked = COMBOS.filter((c) => c.inputs.length > 0).sort(
      (a, b) => estimateComboDps(b) - estimateComboDps(a),
    );

    for (const combo of ranked) {
      if (game.state.phase !== "build") return;
      const matched = this.matchComboInputs(combo, survivors);
      if (!matched || !matched.some((t) => t.id === keepId)) continue;

      const reordered = this.reorderByExposure(matched);
      if (this.logging) {
        const inputs = matched.map((t) => gemLabel(t.gem, t.quality)).join("+");
        this.log.push(`  combo (with keeper): ${combo.name} (${inputs})`);
      }
      game.cmdCombine(reordered.map((t) => t.id));
      return;
    }
  }

  protected override buildSlotOrder(
    unplaced: Array<{ slotId: number; gem: GemType; quality: number }>,
    keeperPosIdx: number,
    positionCount: number,
  ): number[] {
    if (unplaced.length === 0) return [];
    if (keeperPosIdx < 0 || keeperPosIdx >= positionCount) {
      return unplaced.map((d) => d.slotId);
    }

    const keptTowers: TowerState[] = this._game
      ? this._game.state.towers.filter((t) => !t.comboKey)
      : [];

    // Detect round-only combo so an input lands at keeper position
    const comboSlots = this.findComboSlotsInDraws(unplaced);

    // Count duplicates for level-up potential
    const groupCounts = new Map<string, number>();
    for (const d of unplaced) {
      const key = `${d.gem}:${d.quality}`;
      groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    }

    const scored = unplaced.map((d) => {
      let score = this.scoreDrawForKeeper(
        d.gem,
        d.quality as Quality,
        keptTowers,
      );

      if (comboSlots.has(d.slotId)) {
        score = Math.max(score, 50000);
      }

      // If duplicates exist, consider the combined result's score too
      const count = groupCounts.get(`${d.gem}:${d.quality}`) ?? 0;
      if (count >= 2 && d.quality <= 4) {
        const resultQ = Math.min(
          5,
          d.quality + (count >= 4 ? 2 : 1),
        ) as Quality;
        score = Math.max(
          score,
          this.scoreDrawForKeeper(d.gem, resultQ, keptTowers),
        );
      }

      return { slotId: d.slotId, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const bestSlot = scored[0].slotId;
    const rest = scored.slice(1).map((r) => r.slotId);
    const order: number[] = [];
    for (let i = 0; i < Math.max(positionCount, unplaced.length); i++) {
      if (i === keeperPosIdx) {
        order.push(bestSlot);
      } else {
        const next = rest.shift();
        if (next !== undefined) order.push(next);
      }
    }
    if (!order.includes(bestSlot)) order.splice(keeperPosIdx, 0, bestSlot);

    return order;
  }

  private findComboSlotsInDraws(
    draws: Array<{ slotId: number; gem: GemType; quality: number }>,
  ): Set<number> {
    const sorted = COMBOS.filter((c) => c.inputs.length > 0).sort(
      (a, b) => estimateComboDps(b) - estimateComboDps(a),
    );

    for (const combo of sorted) {
      const used = new Set<number>();
      let allFound = true;
      for (const inp of combo.inputs) {
        const idx = draws.findIndex(
          (d, i) =>
            !used.has(i) && d.gem === inp.gem && d.quality === inp.quality,
        );
        if (idx < 0) {
          allFound = false;
          break;
        }
        used.add(idx);
      }
      if (allFound) {
        return new Set([...used].map((i) => draws[i].slotId));
      }
    }
    return new Set();
  }

  protected override tryCombos(game: HeadlessGame): void {
    if (game.state.phase !== "build") return;

    const currentRoundIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );

    // Top priority: always form combos that use only this round's gems
    this.formRoundOnlyCombos(game, currentRoundIds);

    if (game.state.phase !== "build") return;

    const ranked = COMBOS.filter((c) => c.inputs.length > 0).sort(
      (a, b) => estimateComboDps(b) - estimateComboDps(a),
    );

    for (const combo of ranked) {
      if (game.state.phase !== "build") return;
      const matched = this.matchComboInputs(combo, game.state.towers);
      if (!matched) continue;

      const usesKeptTowers = matched.some((t) => !currentRoundIds.has(t.id));
      if (!usesKeptTowers) continue;

      const reordered = this.reorderByExposure(matched);
      if (this.logging) {
        const inputs = matched.map((t) => gemLabel(t.gem, t.quality)).join("+");
        this.log.push(`  combo: ${combo.name} (${inputs})`);
      }
      game.cmdCombine(reordered.map((t) => t.id));
    }

    if (game.state.phase !== "build") return;

    // Level-up combines (same as GreedyAI)
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
      if (game.state.phase !== "build") return;
      const canCombine4 = towers.length >= 4 && towers[0].quality <= 4;
      const canCombine2 = towers.length >= 2 && towers[0].quality <= 4;
      const count = canCombine4 ? 4 : canCombine2 ? 2 : 0;
      if (count === 0) continue;

      const resultQ = Math.min(5, towers[0].quality + (count === 4 ? 2 : 1));
      const combineIds = new Set(towers.slice(0, count).map((t) => t.id));
      if (
        !this.shouldLevelUp(
          game,
          towers[0].gem,
          resultQ,
          combineIds,
          roundTowers,
        )
      )
        continue;

      const combineGroup = this.ensureKeeperFirst(towers.slice(0, count));

      if (this.logging) {
        this.log.push(
          `  level-up: ${count}x${gemLabel(towers[0].gem, towers[0].quality)} → q${resultQ}`,
        );
      }
      game.cmdCombine(combineGroup.map((t) => t.id));
    }
  }

  protected override formRoundOnlyCombos(
    game: HeadlessGame,
    currentRoundIds: Set<number>,
  ): void {
    const ranked = COMBOS.filter((c) => c.inputs.length > 0).sort(
      (a, b) => estimateComboDps(b) - estimateComboDps(a),
    );

    for (const combo of ranked) {
      if (game.state.phase !== "build") return;
      const roundTowers = game.state.towers.filter(
        (t) => currentRoundIds.has(t.id) && !t.comboKey,
      );

      const matched = this.matchComboInputs(combo, roundTowers);
      if (!matched) continue;

      const reordered = this.ensureKeeperFirst(matched);
      if (this.logging) {
        const inputs = matched.map((t) => gemLabel(t.gem, t.quality)).join("+");
        this.log.push(
          `  combo (round-only, always take): ${combo.name} (${inputs})`,
        );
      }
      game.cmdCombine(reordered.map((t) => t.id));
    }
  }

  private reorderByExposure(towers: TowerState[]): TowerState[] {
    if (!this._game) return towers;
    const route = this._game.state.flatRoute;
    const RANGE_ESTIMATE = 4.0;
    const rangeFine = RANGE_ESTIMATE * GRID_SCALE;
    const r2 = rangeFine * rangeFine;
    return towers.slice().sort((a, b) => {
      let aExp = 0;
      let bExp = 0;
      const aCx = a.x + 1,
        aCy = a.y + 1;
      const bCx = b.x + 1,
        bCy = b.y + 1;
      for (const pt of route) {
        const dax = pt.x - aCx,
          day = pt.y - aCy;
        if (dax * dax + day * day <= r2) aExp++;
        const dbx = pt.x - bCx,
          dby = pt.y - bCy;
        if (dbx * dbx + dby * dby <= r2) bExp++;
      }
      return bExp - aExp;
    });
  }

  private ensureKeeperFirst(towers: TowerState[]): TowerState[] {
    const roundIdx = this._game ? this._game.state.wave - 1 : -1;
    if (roundIdx < 0 || roundIdx >= this.keeperIndices.length) return towers;
    const kpi = this.keeperIndices[roundIdx];
    const bpPositions = MAZE_BLUEPRINT[roundIdx];
    if (kpi < 0 || !bpPositions || kpi >= bpPositions.length) return towers;
    const [kx, ky] = bpPositions[kpi];
    const ki = towers.findIndex((t) => t.x === kx && t.y === ky);
    if (ki <= 0) return towers;
    const out = towers.slice();
    out.unshift(out.splice(ki, 1)[0]);
    return out;
  }

  protected override shouldLevelUp(
    game: HeadlessGame,
    gem: string,
    resultQuality: number,
    _combineIds: Set<number>,
    roundTowers: TowerState[],
  ): boolean {
    if (resultQuality > 5) return false;

    const roundIds = new Set(roundTowers.map((t) => t.id));
    const keptTowers = game.state.towers.filter(
      (t) => !roundIds.has(t.id) && !t.comboKey,
    );

    const combinedScore = this.scoreDrawForKeeper(
      gem as GemType,
      resultQuality as Quality,
      keptTowers,
    );

    let bestIndividualScore = -Infinity;
    for (const t of roundTowers) {
      if (t.comboKey) continue;
      const score = this.scoreDrawForKeeper(
        t.gem,
        t.quality as Quality,
        keptTowers,
      );
      if (score > bestIndividualScore) bestIndividualScore = score;
    }

    if (this.logging) {
      this.log.push(
        `    level-up eval: ${gemLabel(gem, resultQuality)} score=${Math.round(combinedScore)} vs best individual=${Math.round(bestIndividualScore)}`,
      );
    }

    return combinedScore >= bestIndividualScore;
  }

  protected override designateKeeper(game: HeadlessGame): boolean {
    const state = game.state;
    const currentRoundIds = new Set(
      state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const roundTowers = state.towers.filter((t) => currentRoundIds.has(t.id));
    if (roundTowers.length === 0) return false;

    const keptTowers = state.towers.filter(
      (t) => !currentRoundIds.has(t.id) && !t.comboKey,
    );

    const canDemote = !state.downgradeUsedThisRound;

    const scored = roundTowers.map((tower) => {
      let score: number;
      let demote = false;
      if (tower.comboKey) {
        const combo = COMBO_BY_NAME.get(tower.comboKey);
        score = combo ? 20000 + estimateComboDps(combo) : 10000;
      } else {
        score = this.scoreDrawForKeeper(
          tower.gem,
          tower.quality as Quality,
          keptTowers,
        );
        if (canDemote && tower.quality > 1) {
          const demotedScore = this.scoreDrawForKeeper(
            tower.gem,
            (tower.quality - 1) as Quality,
            keptTowers,
          );
          if (demotedScore > score) {
            score = demotedScore;
            demote = true;
          }
        }
      }
      return { tower, score, demote };
    });

    scored.sort((a, b) => b.score - a.score);
    const bestScore = scored[0].score;
    const tied = scored.filter((s) => s.score === bestScore);
    const pick = tied.length > 1 ? tied[game.rng.int(tied.length)] : scored[0];

    if (this.logging) {
      for (const { tower, score, demote } of scored) {
        const label = tower.comboKey ?? gemLabel(tower.gem, tower.quality);
        this.log.push(
          `    keeper candidate: ${label}${demote ? " (demote)" : ""} score=${Math.round(score)}`,
        );
      }
      const label =
        pick.tower.comboKey ?? gemLabel(pick.tower.gem, pick.tower.quality);
      this.log.push(
        `  → KEEP: ${label}${pick.demote ? " (will demote)" : ""} (score=${Math.round(bestScore)}${tied.length > 1 ? `, random from ${tied.length} tied` : ""})`,
      );
    }

    if (pick.demote) {
      game.cmdDowngrade(pick.tower.id);
    }
    game.cmdDesignateKeep(pick.tower.id);
    return pick.demote;
  }

  private scoreDrawForKeeper(
    gem: GemType,
    quality: Quality,
    keptTowers: TowerState[],
  ): number {
    // Rule 1: completes a combo → score 10000+
    const completions = this.findCompletedCombosForDraw(
      gem,
      quality,
      keptTowers,
    );
    if (completions.length > 0) {
      const best = completions.sort((a, b) => {
        const aPri = PRIORITY_COMBOS.has(a.key);
        const bPri = PRIORITY_COMBOS.has(b.key);
        if (aPri !== bPri) return aPri ? -1 : 1;
        return estimateComboDps(b) - estimateComboDps(a);
      })[0];
      return (
        10000 +
        estimateComboDps(best) +
        (PRIORITY_COMBOS.has(best.key) ? 100000 : 0)
      );
    }

    // Rule 2: uniqueness + quality
    const keptPairs = new Set(keptTowers.map((t) => `${t.gem}:${t.quality}`));
    const isUnique = !keptPairs.has(`${gem}:${quality}`);
    const qualityScore = quality * 100 + (isUnique ? 500 : 0);

    // Rule 3: combo ingredient progress
    const progress = this.comboProgressForDraw(gem, quality, keptTowers);

    // Chipped: below duplicate flawed (200), unless first chipped ruby/amethyst
    if (quality === 1) {
      const isFirstSpecial =
        (gem === "ruby" || gem === "amethyst") &&
        !keptTowers.some(
          (t) => t.gem === gem && t.quality === 1 && !t.comboKey,
        );
      if (isFirstSpecial) return 250;
      return progress > 0 ? 50 + progress * 10 : 1;
    }

    // Tiebreaker: prefer gems not already covered by an existing combo's inputs
    const coveredGems = new Set<string>();
    for (const t of keptTowers) {
      if (!t.comboKey) continue;
      const combo = COMBO_BY_NAME.get(t.comboKey);
      if (combo) for (const inp of combo.inputs) coveredGems.add(inp.gem);
    }
    const coveredPenalty = coveredGems.has(gem) ? -25 : 0;

    return qualityScore + progress * 50 + coveredPenalty;
  }

  private findCompletedCombosForDraw(
    gem: GemType,
    quality: Quality,
    keptTowers: TowerState[],
  ): ComboRecipe[] {
    const results: ComboRecipe[] = [];

    const combos = findAllCombosFor(gem, quality);
    for (const combo of combos) {
      const needed = combo.inputs.slice();
      const selfIdx = needed.findIndex(
        (inp) => inp.gem === gem && inp.quality === quality,
      );
      if (selfIdx < 0) continue;
      needed.splice(selfIdx, 1);

      const used = new Set<number>();
      let have = 0;
      for (const inp of needed) {
        const match = keptTowers.find(
          (t) =>
            !used.has(t.id) &&
            t.gem === inp.gem &&
            t.quality === inp.quality &&
            !t.comboKey,
        );
        if (match) {
          used.add(match.id);
          have++;
        }
      }
      if (have === needed.length) results.push(combo);
    }

    if (quality === 5) {
      const sameQ5 = keptTowers.filter(
        (t) => t.gem === gem && t.quality === 5 && !t.comboKey,
      ).length;
      if (sameQ5 >= 3) {
        const stargem = COMBO_BY_NAME.get("stargem");
        if (stargem) results.push(stargem);
      }
    }

    return results;
  }

  private comboProgressForDraw(
    gem: GemType,
    quality: Quality,
    keptTowers: TowerState[],
  ): number {
    const combos = findAllCombosFor(gem, quality);
    let best = 0;

    for (const combo of combos) {
      const needed = combo.inputs.slice();
      const selfIdx = needed.findIndex(
        (inp) => inp.gem === gem && inp.quality === quality,
      );
      if (selfIdx < 0) continue;
      needed.splice(selfIdx, 1);

      const used = new Set<number>();
      let have = 0;
      for (const inp of needed) {
        const match = keptTowers.find(
          (t) =>
            !used.has(t.id) &&
            t.gem === inp.gem &&
            t.quality === inp.quality &&
            !t.comboKey,
        );
        if (match) {
          used.add(match.id);
          have++;
        }
      }
      if (have > best) best = have;
    }

    return best;
  }
}
