import { describe, expect, it } from 'vitest';
import { HeadlessGame } from '../src/sim/HeadlessGame';
import { GreedyAI } from '../src/sim/ai/GreedyAI';
import { BlueprintAI } from '../src/sim/ai/BlueprintAI';
import type { SimAI, GameResult } from '../src/sim/types';

const SEED_COUNT = 50;

interface RunData {
  result: GameResult;
  gemDamageShare: Record<string, number>;
}

function runBatch(count: number, ai?: SimAI): RunData[] {
  const player = ai ?? new GreedyAI();
  const runs: RunData[] = [];
  for (let seed = 1; seed <= count; seed++) {
    const game = new HeadlessGame(seed);
    const result = game.runGame(player);
    runs.push({
      result,
      gemDamageShare: game.metrics!.gemDamageShare(),
    });
  }
  return runs;
}

function median(arr: number[]): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function pad(v: string | number, width: number): string {
  return String(v).padStart(width);
}

function printPerSeed(runs: RunData[]): void {
  console.log('');
  console.log('Seed  | Wave | Lives | Gold | Towers | Combos');
  console.log('------|------|-------|------|--------|-------');
  for (const { result: r } of runs) {
    const combos = [
      ...new Set(
        r.towerSummaries.filter((t) => t.comboKey).map((t) => t.comboKey!),
      ),
    ];
    console.log(
      `${pad(r.seed, 5)} | ${pad(r.waveReached, 4)} | ${pad(r.finalLives, 5)} | ${pad(r.finalGold, 4)} | ${pad(r.towerSummaries.length, 6)} | ${combos.join(', ') || '-'}`,
    );
  }
}

function printAggregate(runs: RunData[]): void {
  const waves = runs.map((r) => r.result.waveReached);
  const meanGold = Math.round(
    runs.reduce((s, r) => s + r.result.finalGold, 0) / runs.length,
  );

  console.log('');
  console.log(`=== AGGREGATE (${runs.length} seeds) ===`);
  console.log(
    `Median wave: ${median(waves)}  |  P10: ${percentile(waves, 10)}  |  P90: ${percentile(waves, 90)}`,
  );
  console.log(`Mean gold at death: ${meanGold}`);
}

function printGemKillShare(runs: RunData[]): void {
  const gemKills: Record<string, number> = {};
  for (const { result: r } of runs) {
    for (const t of r.towerSummaries) {
      gemKills[t.gem] = (gemKills[t.gem] ?? 0) + t.kills;
    }
  }
  const total = Object.values(gemKills).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(gemKills).sort((a, b) => b[1] - a[1]);

  console.log('');
  console.log('=== GEM KILL SHARE ===');
  console.log(
    sorted
      .map(
        ([gem, k]) =>
          `${gem}: ${total > 0 ? Math.round((k / total) * 100) : 0}%`,
      )
      .join('  '),
  );
}

function printGemDamageShare(runs: RunData[]): void {
  const totals: Record<string, number> = {};
  for (const { gemDamageShare } of runs) {
    for (const [gem, dmg] of Object.entries(gemDamageShare)) {
      totals[gem] = (totals[gem] ?? 0) + dmg;
    }
  }
  const total = Object.values(totals).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  console.log('');
  console.log('=== GEM DAMAGE SHARE ===');
  console.log(
    sorted
      .map(
        ([gem, d]) =>
          `${gem}: ${total > 0 ? Math.round((d / total) * 100) : 0}%`,
      )
      .join('  '),
  );
}

function printDpsVsHp(runs: RunData[]): void {
  const waveAgg = new Map<
    number,
    { totalDamage: number; totalHp: number; count: number }
  >();
  for (const { result: r } of runs) {
    for (const ws of r.waveSummaries) {
      const agg = waveAgg.get(ws.wave) ?? {
        totalDamage: 0,
        totalHp: 0,
        count: 0,
      };
      agg.totalDamage += ws.totalDamageDealt;
      agg.totalHp += ws.totalHpSpawned;
      agg.count += 1;
      waveAgg.set(ws.wave, agg);
    }
  }

  console.log('');
  console.log('=== DPS vs HP PER WAVE (averaged) ===');
  for (const [wave, agg] of [...waveAgg.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const avgDps = Math.round(agg.totalDamage / agg.count);
    const avgHp = Math.round(agg.totalHp / agg.count);
    const ratio =
      avgHp > 0 ? agg.totalDamage / agg.count / (agg.totalHp / agg.count) : 0;
    console.log(
      `Wave ${pad(wave, 2)}: DPS ${pad(avgDps, 7)} vs HP ${pad(avgHp, 7)} (ratio ${ratio.toFixed(2)})`,
    );
  }
}

let cachedRuns: RunData[] | null = null;
function getRuns(): RunData[] {
  if (!cachedRuns) cachedRuns = runBatch(SEED_COUNT);
  return cachedRuns;
}

let cachedBlueprintRuns: RunData[] | null = null;
function getBlueprintRuns(): RunData[] {
  if (!cachedBlueprintRuns) cachedBlueprintRuns = runBatch(SEED_COUNT, new BlueprintAI());
  return cachedBlueprintRuns;
}

describe('Sim batch run', { timeout: 600_000 }, () => {
  it('runs batch and prints summary', () => {
    const runs = getRuns();

    printPerSeed(runs);
    printAggregate(runs);
    printGemKillShare(runs);
    printGemDamageShare(runs);
    printDpsVsHp(runs);

    expect(runs.length).toBe(SEED_COUNT);
  });

  it('deterministic: same seed produces same result', () => {
    const ai = new GreedyAI();
    const a = new HeadlessGame(42).runGame(ai);
    const b = new HeadlessGame(42).runGame(ai);
    expect(a.waveReached).toBe(b.waveReached);
    expect(a.finalGold).toBe(b.finalGold);
    expect(a.finalLives).toBe(b.finalLives);
    expect(a.waveSummaries).toEqual(b.waveSummaries);
  });

  // --- Phase 5 tuning targets ---

  it('greedy player median wave >= 25 across seeds', () => {
    const runs = getRuns();
    const waves = runs.map((r) => r.result.waveReached);
    expect(median(waves)).toBeGreaterThanOrEqual(25);
  });

  it('at least 90% of runs reach wave 10', () => {
    const runs = getRuns();
    const waves = runs.map((r) => r.result.waveReached);
    expect(percentile(waves, 10)).toBeGreaterThanOrEqual(10);
  });

  it('no single gem type accounts for >50% of total damage', () => {
    const runs = getRuns();
    const gemDmg: Record<string, number> = {};
    for (const { gemDamageShare } of runs) {
      for (const [gem, dmg] of Object.entries(gemDamageShare)) {
        gemDmg[gem] = (gemDmg[gem] ?? 0) + dmg;
      }
    }
    const total = Object.values(gemDmg).reduce((s, v) => s + v, 0);
    for (const [gem, dmg] of Object.entries(gemDmg)) {
      expect(
        dmg / total,
        `${gem} has ${Math.round((dmg / total) * 100)}% damage share`,
      ).toBeLessThan(0.5);
    }
  });
});

describe('BlueprintAI batch run', { timeout: 600_000 }, () => {
  it('runs batch and prints summary', () => {
    const runs = getBlueprintRuns();

    printPerSeed(runs);
    printAggregate(runs);
    printGemKillShare(runs);
    printGemDamageShare(runs);
    printDpsVsHp(runs);

    expect(runs.length).toBe(SEED_COUNT);
  });

  it('deterministic: same seed produces same result', () => {
    const ai = new BlueprintAI();
    const a = new HeadlessGame(42).runGame(ai);
    const b = new HeadlessGame(42).runGame(ai);
    expect(a.waveReached).toBe(b.waveReached);
    expect(a.finalGold).toBe(b.finalGold);
    expect(a.finalLives).toBe(b.finalLives);
    expect(a.waveSummaries).toEqual(b.waveSummaries);
  });

  it('prints blueprint vs greedy comparison', () => {
    const greedy = getRuns();
    const blueprint = getBlueprintRuns();
    const greedyMedian = median(greedy.map((r) => r.result.waveReached));
    const blueprintMedian = median(blueprint.map((r) => r.result.waveReached));
    console.log(`GreedyAI median: ${greedyMedian}, BlueprintAI median: ${blueprintMedian}`);
    console.log(`Delta: ${blueprintMedian - greedyMedian} waves`);
  });

  it('at least 90% of runs reach wave 10', () => {
    const runs = getBlueprintRuns();
    const waves = runs.map((r) => r.result.waveReached);
    expect(percentile(waves, 10)).toBeGreaterThanOrEqual(10);
  });
});
