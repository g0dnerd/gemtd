import { WAVES } from '../../src/data/waves';
import { waveDifficulty } from '../../src/data/wave-difficulty';
import {
  readSnapshot as readSimSnapshot,
  listSnapshots as listSimSnapshots,
} from '../sim-compare/snapshot';
import type { Snapshot as SimSnapshot, AISnapshot, WavePerformance } from '../sim-compare/types';

interface SimDifficultyEntry {
  wave: number;
  reachPct: number;
  meanLeaks: number;
  gameOverPct: number;
  meanDpsRatio: number;
  empScore: number;
  empRank: number;
  theoRank: number;
  gap: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function computeEmpiricalScore(wp: WavePerformance, totalSeeds: number): number {
  const leakRate = wp.meanLeaks + wp.meanKills > 0
    ? wp.meanLeaks / (wp.meanLeaks + wp.meanKills)
    : 0;
  const gameOverRate = wp.sampleCount > 0 ? wp.gameOverCount / wp.sampleCount : 0;
  const reachRate = totalSeeds > 0 ? wp.sampleCount / totalSeeds : 1;
  const dpsShortfall = clamp(1 - wp.meanDpsRatio, 0, 1);

  return leakRate * 0.35
    + gameOverRate * 0.35
    + (1 - reachRate) * 0.15
    + dpsShortfall * 0.15;
}

function rankArray(values: Array<{ wave: number; score: number }>): Map<number, number> {
  const sorted = [...values].sort((a, b) => a.score - b.score);
  const ranks = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    ranks.set(sorted[i].wave, i + 1);
  }
  return ranks;
}

function spearmanCorrelation(ranks1: Map<number, number>, ranks2: Map<number, number>): number {
  const waves = [...ranks1.keys()].filter((w) => ranks2.has(w));
  const n = waves.length;
  if (n < 2) return 0;
  let sumD2 = 0;
  for (const w of waves) {
    const d = ranks1.get(w)! - ranks2.get(w)!;
    sumD2 += d * d;
  }
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

function resolveSnapshot(snapshotRef?: string): SimSnapshot {
  if (snapshotRef) {
    const snap = readSimSnapshot(snapshotRef);
    if (!snap) throw new Error(`Sim snapshot not found: ${snapshotRef}`);
    return snap;
  }
  const metas = listSimSnapshots();
  if (metas.length === 0) throw new Error('No sim-compare snapshots found. Run `npm run sim:run` first.');
  const snap = readSimSnapshot(metas[0].commit);
  if (!snap) throw new Error('Failed to read latest sim snapshot');
  return snap;
}

function resolveAI(snap: SimSnapshot, aiName?: string): { name: string; ai: AISnapshot } {
  const aiEntries = Object.entries(snap.ais);
  if (aiEntries.length === 0) throw new Error('Snapshot has no AI data');

  if (aiName) {
    const match = aiEntries.find(([n]) => n.toLowerCase() === aiName.toLowerCase());
    if (!match) throw new Error(`AI "${aiName}" not found. Available: ${aiEntries.map(([n]) => n).join(', ')}`);
    return { name: match[0], ai: match[1] };
  }

  let best = aiEntries[0];
  for (const entry of aiEntries) {
    if (entry[1].aggregate.medianWave > best[1].aggregate.medianWave) best = entry;
  }
  return { name: best[0], ai: best[1] };
}

function deriveFromPerSeed(ai: AISnapshot): WavePerformance[] {
  const maxWave = Math.max(...ai.perSeed.map((s) => s.wave));
  const totalSeeds = ai.perSeed.length;
  const dpsMap = new Map<number, number>();
  for (const d of ai.dpsVsHp) dpsMap.set(d.wave, d.ratio);

  const gameOverCounts = new Map<number, number>();
  for (const s of ai.perSeed) {
    if (s.outcome === 'gameover') {
      gameOverCounts.set(s.wave, (gameOverCounts.get(s.wave) ?? 0) + 1);
    }
  }

  const wps: WavePerformance[] = [];
  for (let w = 1; w <= maxWave; w++) {
    const reachCount = ai.perSeed.filter((s) => s.wave >= w).length;
    if (reachCount === 0) continue;
    wps.push({
      wave: w,
      sampleCount: reachCount,
      meanLeaks: 0,
      meanKills: 0,
      meanLivesAfter: 0,
      meanGoldAfter: 0,
      meanTowers: 0,
      meanDpsRatio: dpsMap.get(w) ?? 0,
      gameOverCount: gameOverCounts.get(w) ?? 0,
    });
  }
  return wps;
}

export function analyzeSimDifficulty(
  snapshotRef?: string,
  aiName?: string,
): { entries: SimDifficultyEntry[]; spearman: number; snap: SimSnapshot; aiLabel: string } {
  const snap = resolveSnapshot(snapshotRef);
  const { name, ai } = resolveAI(snap, aiName);

  const wavePerf = ai.wavePerformance ?? deriveFromPerSeed(ai);
  const totalSeeds = ai.perSeed.length;

  const empScores = wavePerf.map((wp) => ({
    wave: wp.wave,
    score: computeEmpiricalScore(wp, totalSeeds),
  }));

  const theoScores = WAVES.map((w) => ({
    wave: w.number,
    score: waveDifficulty(w),
  }));

  const empRanks = rankArray(empScores);
  const theoRanks = rankArray(theoScores);

  const wpMap = new Map(wavePerf.map((wp) => [wp.wave, wp]));

  const entries: SimDifficultyEntry[] = [];
  for (const wp of wavePerf) {
    const eRank = empRanks.get(wp.wave) ?? 0;
    const tRank = theoRanks.get(wp.wave) ?? 0;
    entries.push({
      wave: wp.wave,
      reachPct: totalSeeds > 0 ? Math.round((wp.sampleCount / totalSeeds) * 100) : 100,
      meanLeaks: wp.meanLeaks,
      gameOverPct: wp.sampleCount > 0
        ? Math.round((wp.gameOverCount / wp.sampleCount) * 100)
        : 0,
      meanDpsRatio: wp.meanDpsRatio,
      empScore: Math.round(computeEmpiricalScore(wp, totalSeeds) * 1000) / 1000,
      empRank: eRank,
      theoRank: tRank,
      gap: eRank - tRank,
    });
  }

  entries.sort((a, b) => a.wave - b.wave);

  const spearman = spearmanCorrelation(empRanks, theoRanks);

  return { entries, spearman, snap, aiLabel: name };
}

function pad(s: string, n: number): string {
  return s.padStart(n);
}

export function printSimAnalysis(
  entries: SimDifficultyEntry[],
  spearman: number,
  snap: SimSnapshot,
  aiLabel: string,
): void {
  const seedCount = snap.config.seedCount;
  console.log(`\nWave Difficulty: Theoretical vs Sim (${aiLabel}, ${seedCount} seeds)`);
  console.log(`Snapshot: ${snap.git.shortHash} (${snap.git.message})`);
  console.log('─'.repeat(78));
  console.log(
    `${pad('Wave', 5)}  ${pad('Reach%', 6)}  ${pad('Leaks', 6)}  ${pad('GO%', 5)}  ${pad('DPS/HP', 6)}  ${pad('Theo', 5)}  ${pad('Emp', 5)}  ${pad('Gap', 5)}`,
  );
  console.log(
    `${pad('────', 5)}  ${pad('──────', 6)}  ${pad('─────', 6)}  ${pad('─────', 5)}  ${pad('──────', 6)}  ${pad('────', 5)}  ${pad('────', 5)}  ${pad('────', 5)}`,
  );

  for (const e of entries) {
    const gapStr = e.gap === 0 ? '' : (e.gap > 0 ? `+${e.gap}` : `${e.gap}`);
    const gapFlag = Math.abs(e.gap) > 10 ? ' !!' : Math.abs(e.gap) > 5 ? '  !' : '';
    console.log(
      `${pad(String(e.wave), 5)}  ${pad(String(e.reachPct) + '%', 6)}  ${pad(e.meanLeaks.toFixed(1), 6)}  ${pad(String(e.gameOverPct) + '%', 5)}  ${pad(e.meanDpsRatio.toFixed(2), 6)}  ${pad(String(e.theoRank), 5)}  ${pad(String(e.empRank), 5)}  ${pad(gapStr, 5)}${gapFlag}`,
    );
  }

  console.log('─'.repeat(78));
  console.log(`Spearman rank correlation: ${spearman.toFixed(3)}`);

  const mismatches = entries.filter((e) => Math.abs(e.gap) > 5).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  if (mismatches.length > 0) {
    console.log(`\nMismatched waves (|gap| > 5):`);
    for (const m of mismatches) {
      const dir = m.gap > 0 ? 'harder' : 'easier';
      console.log(`  Wave ${m.wave}: theoretical rank ${m.theoRank}, empirical rank ${m.empRank} (${dir} than predicted, gap ${m.gap > 0 ? '+' : ''}${m.gap})`);
    }
  }
}
