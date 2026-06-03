import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import { HeadlessGame } from "../../src/sim/HeadlessGame";
import { GreedyAI } from "../../src/sim/ai/GreedyAI";
import { BlueprintAI } from "../../src/sim/ai/BlueprintAI";
import { StrategistAI } from "../../src/sim/ai/StrategistAI";
import { HeuristicAI } from "../../src/sim/ai/HeuristicAI";
import type { SimAI, GameResult, WaveSummary } from "../../src/sim/types";
import type {
  AISnapshot,
  AggregateStats,
  PerSeedResult,
  DpsHpEntry,
  WavePerformance,
} from "./types";
import { makeTransport, type TelemetryConfig } from "./telemetry";

const WORKER_PATH = fileURLToPath(
  new URL("./worker-entry.mjs", import.meta.url),
);

interface RunData {
  result: GameResult;
  gemDamageShare: Record<string, number>;
  gemKillShare: Record<string, number>;
  dpsVsHp: Array<{
    wave: number;
    totalDamage: number;
    totalHp: number;
    ratio: number;
  }>;
  waveSummaries: WaveSummary[];
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

async function runBatch(
  seedCount: number,
  ai: SimAI,
  aiName: string,
  telemetry?: TelemetryConfig,
): Promise<RunData[]> {
  const runs: RunData[] = [];
  const transport = telemetry ? makeTransport(telemetry.url) : undefined;
  for (let seed = 1; seed <= seedCount; seed++) {
    const game = new HeadlessGame(seed);
    const collector =
      telemetry && transport
        ? game.attachTelemetry({
            version: telemetry.version,
            mode: "sim",
            ai: aiName,
            seed,
            transport,
          })
        : undefined;
    const result = game.runGame(ai);
    if (collector) {
      collector.finalize(result.outcome);
      await collector.whenDone();
    }
    runs.push({
      result,
      gemDamageShare: game.metrics!.gemDamageShare(),
      gemKillShare: game.metrics!.gemKillShare(),
      dpsVsHp: game.metrics!.dpsVsHpPerWave(),
      waveSummaries: game.metrics!.waveSummaries(),
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
    victoryRate:
      Math.round(
        (runs.filter((r) => r.result.outcome === "victory").length /
          runs.length) *
          1000,
      ) / 1000,
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

  const waveAgg = new Map<
    number,
    { totalDamage: number; totalHp: number; count: number }
  >();
  for (const run of runs) {
    for (const entry of run.dpsVsHp) {
      const agg = waveAgg.get(entry.wave) ?? {
        totalDamage: 0,
        totalHp: 0,
        count: 0,
      };
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
      ratio:
        agg.totalHp > 0
          ? Math.round(
              (agg.totalDamage / agg.count / (agg.totalHp / agg.count)) * 100,
            ) / 100
          : 0,
    }));

  const perSeed: PerSeedResult[] = runs.map((r) => ({
    seed: r.result.seed,
    wave: r.result.waveReached,
    gold: r.result.finalGold,
    lives: r.result.finalLives,
    towers: r.result.towerSummaries.length,
    outcome: r.result.outcome,
  }));

  const gameOverWaves = new Map<number, number>();
  for (const r of runs) {
    if (r.result.outcome === "gameover") {
      const w = r.result.waveReached;
      gameOverWaves.set(w, (gameOverWaves.get(w) ?? 0) + 1);
    }
  }

  const waveAggPerf = new Map<
    number,
    {
      leaks: number[];
      kills: number[];
      lives: number[];
      gold: number[];
      towers: number[];
      dpsRatio: number[];
    }
  >();
  for (const run of runs) {
    for (const ws of run.waveSummaries) {
      let agg = waveAggPerf.get(ws.wave);
      if (!agg) {
        agg = {
          leaks: [],
          kills: [],
          lives: [],
          gold: [],
          towers: [],
          dpsRatio: [],
        };
        waveAggPerf.set(ws.wave, agg);
      }
      agg.leaks.push(ws.leaked);
      agg.kills.push(ws.killed);
      agg.lives.push(ws.livesRemaining);
      agg.gold.push(ws.goldAtEnd);
      agg.towers.push(ws.towersCount);
      agg.dpsRatio.push(
        ws.totalHpSpawned > 0 ? ws.totalDamageDealt / ws.totalHpSpawned : 0,
      );
    }
  }

  const wavePerformance: WavePerformance[] = [...waveAggPerf.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wave, agg]) => ({
      wave,
      sampleCount: agg.leaks.length,
      meanLeaks: Math.round(mean(agg.leaks) * 100) / 100,
      meanKills: Math.round(mean(agg.kills) * 100) / 100,
      meanLivesAfter: Math.round(mean(agg.lives) * 100) / 100,
      meanGoldAfter: Math.round(mean(agg.gold)),
      meanTowers: Math.round(mean(agg.towers) * 10) / 10,
      meanDpsRatio: Math.round(mean(agg.dpsRatio) * 100) / 100,
      gameOverCount: gameOverWaves.get(wave) ?? 0,
    }));

  return {
    aggregate,
    gemDamageShare: toPercent(gemDmgTotals),
    gemKillShare: toPercent(gemKillTotals),
    dpsVsHp,
    perSeed,
    wavePerformance,
  };
}

export interface AIEntry {
  name: string;
  ai: SimAI;
}

export const ALL_AIS: AIEntry[] = [
  { name: "GreedyAI", ai: new GreedyAI() },
  { name: "BlueprintAI", ai: new BlueprintAI() },
  { name: "StrategistAI", ai: new StrategistAI() },
  { name: "HeuristicAI", ai: new HeuristicAI() },
];

export async function runAllAIsSequential(
  seedCount: number,
  ais: AIEntry[],
  telemetry?: TelemetryConfig,
): Promise<Record<string, AISnapshot>> {
  const result: Record<string, AISnapshot> = {};
  for (const { name, ai } of ais) {
    const t0 = Date.now();
    process.stdout.write(`  Running ${name} (${seedCount} seeds)...`);
    const runs = await runBatch(seedCount, ai, name, telemetry);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(` done (${elapsed}s)\n`);
    result[name] = collectAISnapshot(runs);
  }
  return result;
}

export function runAllAIs(
  seedCount: number,
  ais: AIEntry[],
  workerCount?: number,
  telemetry?: TelemetryConfig,
): Promise<Record<string, AISnapshot>> {
  const numWorkers = Math.min(
    workerCount ?? Math.max(1, cpus().length - 1),
    seedCount * ais.length,
  );

  const workQueue: Array<{ aiName: string; seed: number }> = [];
  for (const { name } of ais) {
    for (let seed = 1; seed <= seedCount; seed++) {
      workQueue.push({ aiName: name, seed });
    }
  }

  const total = workQueue.length;
  console.log(
    `  Running ${ais.length} AI${ais.length > 1 ? "s" : ""} x ${seedCount} seeds across ${numWorkers} workers...`,
  );

  return new Promise((resolve, reject) => {
    const runsByAI = new Map<string, RunData[]>();
    for (const { name } of ais) runsByAI.set(name, []);

    let completed = 0;
    let queueIdx = 0;
    const workers: Worker[] = [];
    let settled = false;

    function finish(err?: Error): void {
      if (settled) return;
      settled = true;
      for (const w of workers) w.terminate();
      if (err) {
        reject(err);
        return;
      }
      process.stdout.write(
        `\r\x1b[2K  Progress: ${total}/${total} games — done\n`,
      );
      const result: Record<string, AISnapshot> = {};
      for (const { name } of ais) {
        result[name] = collectAISnapshot(runsByAI.get(name)!);
      }
      resolve(result);
    }

    function dispatchNext(w: Worker): void {
      if (queueIdx < workQueue.length) {
        const item = workQueue[queueIdx++];
        w.postMessage({ type: "run", aiName: item.aiName, seed: item.seed });
      }
    }

    for (let i = 0; i < numWorkers; i++) {
      const w = new Worker(WORKER_PATH, { workerData: { telemetry } });
      workers.push(w);

      w.on(
        "message",
        (msg: {
          type: string;
          aiName: string;
          seed: number;
          result: GameResult;
          gemDamageShare: Record<string, number>;
          gemKillShare: Record<string, number>;
          dpsVsHp: RunData["dpsVsHp"];
          waveSummaries: WaveSummary[];
        }) => {
          if (msg.type === "ready") {
            dispatchNext(w);
            return;
          }
          if (msg.type !== "result") return;
          runsByAI.get(msg.aiName)!.push({
            result: msg.result,
            gemDamageShare: msg.gemDamageShare,
            gemKillShare: msg.gemKillShare,
            dpsVsHp: msg.dpsVsHp,
            waveSummaries: msg.waveSummaries,
          });
          completed++;
          process.stdout.write(
            `\r\x1b[2K  Progress: ${completed}/${total} games`,
          );
          if (completed === total) {
            finish();
          } else {
            dispatchNext(w);
          }
        },
      );

      w.on("error", (err) => finish(err));
    }
  });
}
