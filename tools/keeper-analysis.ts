import { HeadlessGame } from '../src/sim/HeadlessGame';
import { StrategistAI } from '../src/sim/ai/StrategistAI';
import { gemStats } from '../src/data/gems';
import {
  COMBO_BY_NAME, findAllCombosFor, comboStatsAtTier,
  type ComboRecipe,
} from '../src/data/combos';
import type { TowerState, DrawSlot } from '../src/game/State';
import {
  GRID_SCALE, CHANCE_TIER_UPGRADE_COST,
} from '../src/game/constants';
import { WAVES } from '../src/data/waves';
import * as fs from 'fs';

// ── Helpers ──

const QNAME: Record<number, string> = { 1: 'Chipped', 2: 'Flawed', 3: 'Normal', 4: 'Flawless', 5: 'Perfect' };

function tLabel(t: TowerState): string {
  if (t.comboKey) {
    const tier = t.upgradeTier ?? 0;
    return tier > 0 ? `${t.comboKey}+${tier}` : t.comboKey;
  }
  return `${QNAME[t.quality]} ${t.gem}`;
}

function dLabel(d: DrawSlot): string {
  return `${QNAME[d.quality]} ${d.gem}`;
}

function getStats(t: TowerState) {
  return t.comboKey
    ? comboStatsAtTier(COMBO_BY_NAME.get(t.comboKey)!, t.upgradeTier ?? 0)
    : gemStats(t.gem, t.quality);
}

function calcExposure(tower: TowerState, route: Array<{ x: number; y: number }>): number {
  const stats = getStats(tower);
  const cx = tower.x + 1, cy = tower.y + 1;
  const r2 = (stats.range * GRID_SCALE) ** 2;
  let exp = 0;
  for (const pt of route) {
    if ((pt.x - cx) ** 2 + (pt.y - cy) ** 2 <= r2) exp++;
  }
  return exp;
}

function rawDps(t: TowerState): number {
  const stats = getStats(t);
  const avg = (stats.dmgMin + stats.dmgMax) / 2;
  return avg * stats.atkSpeed;
}

function effectiveDps(t: TowerState): number {
  const stats = getStats(t);
  const avg = (stats.dmgMin + stats.dmgMax) / 2;
  let dps = avg * stats.atkSpeed;
  for (const e of stats.effects) {
    if (e.kind === 'splash') dps *= 1.5;
    else if (e.kind === 'chain') dps *= 1 + e.bounces * 0.3;
    else if (e.kind === 'poison') dps += e.dps * e.duration * 0.3;
    else if (e.kind === 'crit') dps *= 1 + e.chance * (e.multiplier - 1);
    else if (e.kind === 'prox_burn') dps += e.dps * 5;
    else if (e.kind === 'multi_target') dps *= Math.min(e.count, 3);
    else if (e.kind === 'stun') dps *= 1 + e.chance * 2;
  }
  return dps;
}

function comboReadiness(
  combo: ComboRecipe,
  towers: TowerState[],
  excludeId: number,
): { have: number; missing: number; total: number } {
  const total = combo.inputs.length;
  const tower = towers.find(t => t.id === excludeId);
  const used = new Set<number>();
  const matchedInputs = new Set<number>();
  let have = 0;

  if (tower) {
    for (let i = 0; i < combo.inputs.length; i++) {
      const inp = combo.inputs[i];
      if (inp.gem === tower.gem && inp.quality === tower.quality) {
        matchedInputs.add(i);
        have++;
        break;
      }
    }
  }

  for (let i = 0; i < combo.inputs.length; i++) {
    if (matchedInputs.has(i)) continue;
    const input = combo.inputs[i];
    const match = towers.find(
      t => t.id !== excludeId && !used.has(t.id) &&
        t.gem === input.gem && t.quality === input.quality && !t.comboKey,
    );
    if (match) { used.add(match.id); have++; }
  }

  return { have: Math.min(have, total), missing: total - Math.min(have, total), total };
}

function bestComboInfo(tower: TowerState, allTowers: TowerState[]): string {
  if (tower.comboKey) return tower.comboKey;
  const combos = findAllCombosFor(tower.gem, tower.quality as 1|2|3|4|5);
  if (combos.length === 0) return '';
  let best = '';
  let bestScore = -1;
  for (const combo of combos) {
    const r = comboReadiness(combo, allTowers, tower.id);
    const score = r.have / r.total;
    if (score > bestScore) {
      bestScore = score;
      best = `${combo.name}:${r.have}/${r.total}`;
    }
  }
  return best;
}

// ── Per-candidate scoring (mirrors StrategistAI.scoreTowerKeeper) ──

function scoreTowerDetailed(
  tower: TowerState,
  allTowers: TowerState[],
  keptTowers: TowerState[],
  route: Array<{ x: number; y: number }>,
  hasAirNext: boolean,
  isBossNext: boolean,
) {
  const stats = getStats(tower);
  const avgDmg = (stats.dmgMin + stats.dmgMax) / 2;

  const cx = tower.x + 1, cy = tower.y + 1;
  const r2 = (stats.range * GRID_SCALE) ** 2;
  let exposure = 0;
  for (const pt of route) {
    if ((pt.x - cx) ** 2 + (pt.y - cy) ** 2 <= r2) exposure++;
  }

  let exposureDps = avgDmg * stats.atkSpeed * Math.max(1, exposure);
  for (const e of stats.effects) {
    if (e.kind === 'splash') exposureDps *= 1.5;
    else if (e.kind === 'chain') exposureDps *= 1 + e.bounces * 0.3;
    else if (e.kind === 'aura_atkspeed') {
      const ar2 = (e.radius * GRID_SCALE) ** 2;
      const nearby = allTowers.filter(o => {
        if (o.id === tower.id) return false;
        return (o.x - tower.x) ** 2 + (o.y - tower.y) ** 2 <= ar2;
      }).length;
      exposureDps *= 1 + nearby * 0.4;
    }
  }

  let comboScore = 0;
  if (!tower.comboKey) {
    for (const combo of findAllCombosFor(tower.gem, tower.quality as 1|2|3|4|5)) {
      const r = comboReadiness(combo, allTowers, tower.id);
      if (r.missing === 0) comboScore += comboValue(combo) * 2;
      else if (r.missing === 1) comboScore += comboValue(combo) * 1.2;
      else comboScore += comboValue(combo) * (r.have / r.total) * 0.5;
    }
  } else {
    comboScore = comboValue(COMBO_BY_NAME.get(tower.comboKey)!) * 1.5;
  }

  const qualityPremium = tower.quality >= 3
    ? avgDmg * stats.atkSpeed * (tower.quality - 2) * 0.5
    : 0;

  let waveBonus = 0;
  if (hasAirNext) {
    if (tower.gem === 'amethyst' || stats.targeting === 'all') waveBonus += exposureDps * 0.3;
    if (stats.targeting === 'ground') waveBonus -= exposureDps * 0.3;
  }
  if (isBossNext) {
    if (!stats.effects.some(e => e.kind === 'splash')) waveBonus += exposureDps * 0.15;
  }

  let portfolioMult = 1.0;
  if (stats.targeting !== 'all' && keptTowers.length >= 2) {
    const sameTargeting = keptTowers.filter(t => {
      const ts = getStats(t);
      return ts.targeting === stats.targeting;
    }).length;
    const ratio = sameTargeting / keptTowers.length;
    if (ratio > 0.4) portfolioMult = 0.5;
    else if (ratio > 0.25) portfolioMult = 0.75;
  }
  if (!tower.comboKey && comboScore === 0) {
    const dup = keptTowers.filter(t => t.gem === tower.gem && !t.comboKey).length;
    if (dup > 0) portfolioMult *= 0.5;
  }

  const totalScore = (exposureDps * 0.3 + comboScore * 0.4 + qualityPremium * 0.15 + waveBonus * 0.15) * portfolioMult;

  return {
    exposure,
    exposureDps: Math.round(exposureDps),
    comboScore: Math.round(comboScore),
    qualityPremium: Math.round(qualityPremium),
    waveBonus: Math.round(waveBonus),
    portfolioMult,
    totalScore: Math.round(totalScore),
  };
}

function comboValue(combo: ComboRecipe): number {
  const s = combo.stats;
  const avg = (s.dmgMin + s.dmgMax) / 2;
  let dps = avg * s.atkSpeed;
  for (const e of s.effects) {
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

// ── Run & collect ──

interface CandidateRow {
  seed: number;
  wave: number;
  waveTypes: string;
  waveHp: number;
  goldBefore: number;
  goldAfter: number;
  chanceTierBefore: number;
  chanceTierAfter: number;
  chanceTierSpent: number;
  comboUpgradeSpent: number;
  routeLen: number;
  candidateIdx: number;
  candidateLabel: string;
  candidateGem: string;
  candidateQuality: number;
  candidateIsCombo: boolean;
  isKept: boolean;
  exposure: number;
  rawDps: number;
  effectiveDps: number;
  targeting: string;
  scoreExposureDps: number;
  scoreCombo: number;
  scoreQualityPremium: number;
  scoreWaveBonus: number;
  scorePortfolioMult: number;
  scoreFinal: number;
  bestComboProgress: string;
  boardTowerCount: number;
  boardTotalDps: number;
  combosFormedThisRound: string;
  killed: number;
  leaked: number;
  livesAfter: number;
  outcome: string;
  waveReached: number;
}

function runSeed(seed: number): CandidateRow[] {
  const ai = new StrategistAI();
  const game = new HeadlessGame(seed);
  const rows: CandidateRow[] = [];

  let goldAtBuildStart = 0;
  let chanceTierAtBuildStart = 0;

  interface DrawSnap { gem: string; quality: number; slotId: number; placedTowerId: number }
  let preCombineDraws: DrawSnap[] = [];
  let preCombineTowerIds = new Set<number>();

  game.bus.on('phase:enter', ({ phase }) => {
    if (phase === 'build') {
      goldAtBuildStart = game.state.gold;
      chanceTierAtBuildStart = game.state.chanceTier;
      preCombineDraws = [];
      preCombineTowerIds = new Set();
    }
  });

  // Capture the last all-placed, pre-keeper state (before combines can alter towers)
  game.bus.on('draws:change', () => {
    const state = game.state;
    if (state.draws.length > 0
      && state.draws.every(d => d.placedTowerId !== null)
      && state.designatedKeepTowerId === null) {
      preCombineDraws = state.draws.map(d => ({
        gem: d.gem, quality: d.quality, slotId: d.slotId, placedTowerId: d.placedTowerId!,
      }));
      preCombineTowerIds = new Set(preCombineDraws.map(d => d.placedTowerId));
    }
  });

  // Main handler: fires when designatedKeepTowerId is set (either by designateKeeper or autoConcludeRound)
  game.bus.on('draws:change', () => {
    const state = game.state;
    if (state.designatedKeepTowerId === null) return;
    if (preCombineDraws.length === 0) return; // safety

    const keepId = state.designatedKeepTowerId;
    const route = state.flatRoute;
    const wave = state.wave;

    const waveInfo = WAVES[wave - 1];
    const waveTypes = waveInfo?.groups.map(g => `${g.count}${g.kind}`).join('+') ?? '';
    const waveHp = waveInfo?.groups[0]?.hp ?? 0;

    // Identify board (prior-round) vs round towers using pre-combine snapshot
    const liveTowerIds = new Set(state.towers.map(t => t.id));
    const roundTowerIds = new Set<number>();
    for (const id of preCombineTowerIds) {
      if (liveTowerIds.has(id)) roundTowerIds.add(id);
    }
    // Combo/level-up results: new tower IDs not in preCombineTowerIds but also not prior-round
    // The keepId from autoConclude is always a round tower
    if (keepId && liveTowerIds.has(keepId) && !roundTowerIds.has(keepId)) {
      roundTowerIds.add(keepId);
    }
    // Any other new combo tower not in preCombineTowerIds — find by elimination
    for (const t of state.towers) {
      if (!roundTowerIds.has(t.id) && !preCombineTowerIds.has(t.id)) {
        // Could be a prior-round tower. Only add if we can't account for it.
        // Prior-round towers existed before this build phase.
        // We don't have a perfect prior-round set, so skip — the keepId catch above handles combos.
      }
    }

    const boardTowers = state.towers.filter(t => !roundTowerIds.has(t.id));
    const keptTowers = boardTowers;
    const allTowers = state.towers;

    let chanceTierCost = 0;
    for (let i = chanceTierAtBuildStart; i < state.chanceTier; i++) {
      chanceTierCost += CHANCE_TIER_UPGRADE_COST[i] ?? 0;
    }
    const comboUpgradeSpent = Math.max(0, goldAtBuildStart - chanceTierCost - state.gold);

    const waveIdx = Math.min(wave - 1, WAVES.length - 1);
    const nextWaveDef = waveIdx + 1 < WAVES.length ? WAVES[waveIdx + 1] : null;
    const hasAirNext = nextWaveDef?.groups.some(g => g.kind === 'air') ?? false;
    const isBossNext = nextWaveDef?.groups.some(g => g.kind === 'boss') ?? false;

    const combosFormed: string[] = [];
    for (const t of state.towers) {
      if (roundTowerIds.has(t.id) && t.comboKey) combosFormed.push(tLabel(t));
    }

    const boardTotalDps = Math.round(boardTowers.reduce((s, t) => s + effectiveDps(t), 0));
    const roundTotalDps = Math.round(
      state.towers.filter(t => roundTowerIds.has(t.id)).reduce((s, t) => s + effectiveDps(t), 0),
    );

    function emitRow(
      idx: number,
      label: string, gem: string, quality: number, isCombo: boolean, isKept: boolean,
      tower: TowerState | null,
    ) {
      const scoring = tower
        ? scoreTowerDetailed(tower, allTowers, keptTowers, route, hasAirNext, isBossNext)
        : null;
      rows.push({
        seed, wave, waveTypes, waveHp,
        goldBefore: goldAtBuildStart, goldAfter: state.gold,
        chanceTierBefore: chanceTierAtBuildStart, chanceTierAfter: state.chanceTier,
        chanceTierSpent: chanceTierCost, comboUpgradeSpent,
        routeLen: route.length,
        candidateIdx: idx,
        candidateLabel: label,
        candidateGem: gem,
        candidateQuality: quality,
        candidateIsCombo: isCombo,
        isKept,
        exposure: scoring?.exposure ?? 0,
        rawDps: tower ? Math.round(rawDps(tower)) : 0,
        effectiveDps: tower ? Math.round(effectiveDps(tower)) : 0,
        targeting: tower ? getStats(tower).targeting : '',
        scoreExposureDps: scoring?.exposureDps ?? 0,
        scoreCombo: scoring?.comboScore ?? 0,
        scoreQualityPremium: scoring?.qualityPremium ?? 0,
        scoreWaveBonus: scoring?.waveBonus ?? 0,
        scorePortfolioMult: scoring?.portfolioMult ?? 0,
        scoreFinal: scoring?.totalScore ?? 0,
        bestComboProgress: tower ? bestComboInfo(tower, allTowers) : 'consumed by combine',
        boardTowerCount: boardTowers.length + roundTowerIds.size,
        boardTotalDps: boardTotalDps + roundTotalDps,
        combosFormedThisRound: combosFormed.join('; '),
        killed: 0, leaked: 0, livesAfter: state.lives,
        outcome: '', waveReached: 0,
      });
    }

    const emittedTowerIds = new Set<number>();

    // Emit each original draw (from pre-combine snapshot)
    for (let idx = 0; idx < preCombineDraws.length; idx++) {
      const d = preCombineDraws[idx];
      const tower = state.towers.find(t => t.id === d.placedTowerId);
      if (tower) {
        emittedTowerIds.add(tower.id);
        emitRow(idx,
          tower.comboKey ? tLabel(tower) : `${QNAME[d.quality]} ${d.gem}`,
          tower.comboKey ?? d.gem,
          tower.comboKey ? 0 : d.quality,
          !!tower.comboKey,
          tower.id === keepId,
          tower,
        );
      } else {
        // Tower consumed by combine
        emitRow(idx,
          `[consumed] ${QNAME[d.quality]} ${d.gem}`,
          d.gem, d.quality, false, false, null,
        );
      }
    }

    // Emit combo/level-up towers with new IDs (not in original draws)
    for (const tid of roundTowerIds) {
      if (emittedTowerIds.has(tid)) continue;
      const tower = state.towers.find(t => t.id === tid);
      if (!tower) continue;
      emittedTowerIds.add(tid);
      emitRow(-1,
        tLabel(tower),
        tower.comboKey ?? tower.gem,
        tower.comboKey ? 0 : tower.quality,
        !!tower.comboKey,
        tower.id === keepId,
        tower,
      );
    }
  });

  game.bus.on('wave:end', ({ wave }) => {
    const waveRows = rows.filter(r => r.seed === seed && r.wave === wave);
    for (const r of waveRows) {
      r.killed = game.state.waveStats.killedThisWave;
      r.leaked = game.state.waveStats.leakedThisWave;
      r.livesAfter = game.state.lives;
    }
  });

  const result = game.runGame(ai);
  for (const r of rows) {
    r.outcome = result.outcome;
    r.waveReached = result.waveReached;
  }

  return rows;
}

// ── Main ──

const allRows: CandidateRow[] = [];
for (let seed = 1; seed <= 50; seed++) {
  process.stdout.write(`  seed ${seed}...`);
  const rows = runSeed(seed);
  allRows.push(...rows);
  process.stdout.write(` ${rows.length} rows\n`);
}

// Write CSV
const headers = [
  'seed', 'wave', 'waveTypes', 'waveHp',
  'goldBefore', 'goldAfter', 'chanceTierBefore', 'chanceTierAfter', 'chanceTierSpent', 'comboUpgradeSpent',
  'routeLen',
  'candidateIdx', 'candidateLabel', 'candidateGem', 'candidateQuality', 'candidateIsCombo',
  'isKept',
  'exposure', 'rawDps', 'effectiveDps', 'targeting',
  'scoreExposureDps', 'scoreCombo', 'scoreQualityPremium', 'scoreWaveBonus', 'scorePortfolioMult', 'scoreFinal',
  'bestComboProgress',
  'boardTowerCount', 'boardTotalDps', 'combosFormedThisRound',
  'killed', 'leaked', 'livesAfter',
  'outcome', 'waveReached',
];

const csvLines = [headers.join(',')];
for (const r of allRows) {
  const values = headers.map(h => {
    const v = (r as Record<string, unknown>)[h];
    if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`;
    return String(v);
  });
  csvLines.push(values.join(','));
}

const outPath = 'tools/sim-compare/results/keeper-decisions.csv';
fs.writeFileSync(outPath, csvLines.join('\n') + '\n');
console.log(`\nWrote ${allRows.length} rows to ${outPath}`);
console.log(`Seeds: 50, Waves per seed: varies, Candidates per wave: up to 5`);

// Quick summary stats
const keptRows = allRows.filter(r => r.isKept);
const chippedKept = keptRows.filter(r => r.candidateQuality === 1 && !r.candidateIsCombo);
const chippedKeptLate = chippedKept.filter(r => r.wave >= 6);
console.log(`\nKept decisions: ${keptRows.length}`);
console.log(`Chipped kept (all waves): ${chippedKept.length} (${(chippedKept.length / keptRows.length * 100).toFixed(1)}%)`);
console.log(`Chipped kept (wave 6+): ${chippedKeptLate.length} (${(chippedKeptLate.length / keptRows.length * 100).toFixed(1)}%)`);

// Per-wave-band quality breakdown
for (const [label, lo, hi] of [['W1-5', 1, 5], ['W6-10', 6, 10], ['W11-15', 11, 15], ['W16-20', 16, 20], ['W21+', 21, 99]] as [string, number, number][]) {
  const band = keptRows.filter(r => r.wave >= lo && r.wave <= hi);
  if (band.length === 0) continue;
  const qDist: Record<number, number> = {};
  for (const r of band) {
    if (r.candidateIsCombo) { qDist[0] = (qDist[0] ?? 0) + 1; }
    else { qDist[r.candidateQuality] = (qDist[r.candidateQuality] ?? 0) + 1; }
  }
  const parts = Object.entries(qDist).sort((a, b) => +a[0] - +b[0]).map(
    ([q, n]) => `${+q === 0 ? 'combo' : QNAME[+q]}:${n}(${(n / band.length * 100).toFixed(0)}%)`,
  );
  console.log(`  ${label}: ${band.length} keeps — ${parts.join(' ')}`);
}

// How often was a higher-DPS candidate skipped?
let betterSkipped = 0;
const waveKeys = new Set(keptRows.map(r => `${r.seed}:${r.wave}`));
for (const key of waveKeys) {
  const waveRows = allRows.filter(r => `${r.seed}:${r.wave}` === key);
  const kept = waveRows.find(r => r.isKept);
  if (!kept) continue;
  const skipped = waveRows.filter(r => !r.isKept && r.effectiveDps > kept.effectiveDps);
  if (skipped.length > 0) betterSkipped++;
}
console.log(`\nWaves where a higher-effectiveDps gem was skipped: ${betterSkipped}/${waveKeys.size} (${(betterSkipped / waveKeys.size * 100).toFixed(1)}%)`);
