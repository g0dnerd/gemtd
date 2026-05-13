import { HeadlessGame } from '../../src/sim/HeadlessGame';
import { GreedyAI } from '../../src/sim/ai/GreedyAI';
import { BlueprintAI } from '../../src/sim/ai/BlueprintAI';
import { StrategistAI } from '../../src/sim/ai/StrategistAI';
import type { SimAI, GameResult } from '../../src/sim/types';
import type { AISnapshot, AggregateStats, PerSeedResult, DpsHpEntry } from './types';

interface RunData {
  result: GameResult;
  gemDamageShare: Record<string, number>;
  gemKillShare: Record<string, number>;
  dpsVsHp: Array<{ wave: number; totalDamage: number; totalHp: number; ratio: number }>;
}

export function median(arr: number[]): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(arr: number[], p: number): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function runBatch(seedCount: number, ai: SimAI): RunData[] {
  const runs: RunData[] = [];
  for (let seed = 1; seed <= seedCount; seed++) {
    const game = new HeadlessGame(seed);
    const result = game.runGame(ai);
    runs.push({
      result,
      gemDamageShare: game.metrics!.gemDamageShare(),
      gemKillShare: game.metrics!.gemKillShare(),
      dpsVsHp: game.metrics!.dpsVsHpPerWave(),
    });
  }
  return runs;
}

function toPercent(share: Record<string, number>): Record<string, number> {
  const total = Object.values(share).reduce((s, v) => s + v, 0);
  if (total === 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(share)) {
    out[k] = Math.round((v / total) * 1000) / 10;
  }
  return out;
}

function collectAISnapshot(runs: RunData[]): AISnapshot {
  const waves = runs.map((r) => r.result.waveReached);
  const golds = runs.map((r) => r.result.finalGold);
  const livesArr = runs.map((r) => r.result.finalLives);

  const aggregate: AggregateStats = {
    medianWave: median(waves),
    meanWave: Math.round(mean(waves) * 10) / 10,
    p10Wave: percentile(waves, 10),
    p90Wave: percentile(waves, 90),
    minWave: Math.min(...waves),
    maxWave: Math.max(...waves),
    meanGold: Math.round(mean(golds)),
    meanLives: Math.round(mean(livesArr) * 10) / 10,
    victoryRate: Math.round((runs.filter((r) => r.result.outcome === 'victory').length / runs.length) * 1000) / 1000,
  };

  const gemDmgTotals: Record<string, number> = {};
  const gemKillTotals: Record<string, number> = {};
  for (const run of runs) {
    for (const [gem, dmg] of Object.entries(run.gemDamageShare)) {
      gemDmgTotals[gem] = (gemDmgTotals[gem] ?? 0) + dmg;
    }
    for (const [gem, kills] of Object.entries(run.gemKillShare)) {
      gemKillTotals[gem] = (gemKillTotals[gem] ?? 0) + kills;
    }
  }

  const waveAgg = new Map<number, { totalDamage: number; totalHp: number; count: number }>();
  for (const run of runs) {
    for (const entry of run.dpsVsHp) {
      const agg = waveAgg.get(entry.wave) ?? { totalDamage: 0, totalHp: 0, count: 0 };
      agg.totalDamage += entry.totalDamage;
      agg.totalHp += entry.totalHp;
      agg.count += 1;
      waveAgg.set(entry.wave, agg);
    }
  }
  const dpsVsHp: DpsHpEntry[] = [...waveAgg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wave, agg]) => ({
      wave,
      avgDps: Math.round(agg.totalDamage / agg.count),
      avgHp: Math.round(agg.totalHp / agg.count),
      ratio: agg.totalHp > 0 ? Math.round((agg.totalDamage / agg.count / (agg.totalHp / agg.count)) * 100) / 100 : 0,
    }));

  const perSeed: PerSeedResult[] = runs.map((r) => ({
    seed: r.result.seed,
    wave: r.result.waveReached,
    gold: r.result.finalGold,
    lives: r.result.finalLives,
    towers: r.result.towerSummaries.length,
    outcome: r.result.outcome,
  }));

  return {
    aggregate,
    gemDamageShare: toPercent(gemDmgTotals),
    gemKillShare: toPercent(gemKillTotals),
    dpsVsHp,
    perSeed,
  };
}

export interface AIEntry {
  name: string;
  ai: SimAI;
}

export const ALL_AIS: AIEntry[] = [
  { name: 'GreedyAI', ai: new GreedyAI() },
  { name: 'BlueprintAI', ai: new BlueprintAI() },
  { name: 'StrategistAI', ai: new StrategistAI() },
];

export function runAllAIs(seedCount: number, ais: AIEntry[]): Record<string, AISnapshot> {
  const result: Record<string, AISnapshot> = {};
  for (const { name, ai } of ais) {
    const t0 = Date.now();
    process.stdout.write(`  Running ${name} (${seedCount} seeds)...`);
    const runs = runBatch(seedCount, ai);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(` done (${elapsed}s)\n`);
    result[name] = collectAISnapshot(runs);
  }
  return result;
}
