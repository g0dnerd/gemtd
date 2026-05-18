import { HeadlessGame } from '../../src/sim/HeadlessGame';
import { WAVES } from '../../src/data/waves';
import { buildBoard, REFERENCE_TOWERS } from './board';
import type { WaveMetrics, AggregatedWaveMetrics } from './types';

const MAX_WAVE_TICKS = 60 * 60 * 5;

function resetForWave(game: HeadlessGame, board: ReturnType<typeof buildBoard>, waveNum: number): void {
  const s = game.state;
  s.creeps = [];
  s.projectiles = [];
  s.wave = waveNum;
  s.lives = 999_999;
  s.gold = 999_999;
  s.totalKills = 0;
  s.tick = 0;
  s.waveStats = { spawnedThisWave: 0, killedThisWave: 0, leakedThisWave: 0, totalToSpawn: 0 };
  s.debugWaveDef = undefined;

  s.towers = board.towers.map(t => ({
    ...t,
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0,
    beam: undefined,
    burnExposure: undefined,
    lastFreezeTick: undefined,
    burnAuraCreepIds: undefined,
    silencedUntil: undefined,
    attackCount: undefined,
    focusTarget: undefined,
    lastTriggerTick: undefined,
  }));

  s.grid = board.grid.map(r => r.slice());
  s.flatRoute = board.flatRoute;
  s.airRoute = board.airRoute;
  s.routeSegments = [];
}

function runSingleWave(game: HeadlessGame, waveNum: number): WaveMetrics {
  const s = game.state;
  const routeLen = s.flatRoute.length;
  const airRouteLen = s.airRoute.length;

  const pathPosAtDeath: number[] = [];
  let leaks = 0;
  let maxPathPos = 0;

  const offDie = game.bus.on('creep:die', ({ id }) => {
    const c = s.creeps.find(cr => cr.id === id);
    if (!c) return;
    const rLen = c.flags?.air ? airRouteLen : routeLen;
    const normalized = rLen > 1 ? c.pathPos / (rLen - 1) : 0;
    pathPosAtDeath.push(normalized);
    if (normalized > maxPathPos) maxPathPos = normalized;
  });

  const offLeak = game.bus.on('creep:leak', () => {
    leaks++;
    pathPosAtDeath.push(1.0);
    maxPathPos = 1.0;
  });

  s.phase = 'build';
  s.draws = [];
  s.designatedKeepTowerId = s.towers[0]?.id ?? null;
  game.enterWave();

  const tickStart = s.tick;
  for (let i = 0; i < MAX_WAVE_TICKS; i++) {
    if (s.phase !== 'wave') break;
    game.simStep();
  }
  const ticksToComplete = s.tick - tickStart;

  let totalDamageDealt = 0;
  for (const t of s.towers) totalDamageDealt += t.totalDamage;

  offDie();
  offLeak();

  // Include surviving creeps at timeout — they represent unresolved difficulty
  const survivors = s.creeps.filter(c => c.alive);
  for (const c of survivors) {
    const rLen = c.flags?.air ? airRouteLen : routeLen;
    const normalized = rLen > 1 ? c.pathPos / (rLen - 1) : 0;
    pathPosAtDeath.push(normalized);
    if (normalized > maxPathPos) maxPathPos = normalized;
  }

  const avgPathPos = pathPosAtDeath.length > 0
    ? pathPosAtDeath.reduce((a, b) => a + b, 0) / pathPosAtDeath.length
    : 0;

  return {
    waveNum,
    leaks,
    survived: survivors.length,
    totalCreeps: pathPosAtDeath.length,
    avgPathPos,
    maxPathPos,
    ticksToComplete,
    totalDamageDealt,
  };
}

function runTrial(seed: number): WaveMetrics[] {
  const board = buildBoard(seed);
  const game = new HeadlessGame(seed);
  const results: WaveMetrics[] = [];

  for (let w = 1; w <= WAVES.length; w++) {
    resetForWave(game, board, w);
    results.push(runSingleWave(game, w));
  }

  return results;
}

function aggregate(trials: WaveMetrics[][]): AggregatedWaveMetrics[] {
  const waveCount = trials[0].length;
  const agg: AggregatedWaveMetrics[] = [];

  for (let w = 0; w < waveCount; w++) {
    const samples = trials.map(t => t[w]);
    const n = samples.length;
    const meanLeaks = samples.reduce((s, m) => s + m.leaks, 0) / n;
    const meanSurvived = samples.reduce((s, m) => s + m.survived, 0) / n;
    const meanAvgPathPos = samples.reduce((s, m) => s + m.avgPathPos, 0) / n;
    const meanMaxPathPos = samples.reduce((s, m) => s + m.maxPathPos, 0) / n;
    const meanTicksToComplete = samples.reduce((s, m) => s + m.ticksToComplete, 0) / n;
    const meanTotalDamage = samples.reduce((s, m) => s + m.totalDamageDealt, 0) / n;

    agg.push({
      waveNum: samples[0].waveNum,
      meanLeaks,
      meanSurvived,
      meanAvgPathPos,
      meanMaxPathPos,
      meanTicksToComplete,
      meanTotalDamage,
      composite: 0,
    });
  }

  const maxLeaks = Math.max(1, ...agg.map(a => a.meanLeaks));
  const maxSurvived = Math.max(1, ...agg.map(a => a.meanSurvived));
  const maxTicks = Math.max(1, ...agg.map(a => a.meanTicksToComplete));
  const maxDamage = Math.max(1, ...agg.map(a => a.meanTotalDamage));

  for (const a of agg) {
    const leakScore = a.meanLeaks / maxLeaks;
    const survivedScore = a.meanSurvived / maxSurvived;
    const pathScore = a.meanAvgPathPos;
    const timeScore = a.meanTicksToComplete / maxTicks;
    const damageScore = a.meanTotalDamage / maxDamage;
    a.composite = leakScore * 0.25 + survivedScore * 0.2 + pathScore * 0.2 + timeScore * 0.15 + damageScore * 0.2;
  }

  return agg;
}

export function evaluate(trialCount: number, onProgress?: (done: number, total: number) => void): AggregatedWaveMetrics[] {
  const trials: WaveMetrics[][] = [];
  for (let i = 0; i < trialCount; i++) {
    trials.push(runTrial(i + 1));
    onProgress?.(i + 1, trialCount);
  }
  return aggregate(trials);
}

export function towerLabels(): string[] {
  return REFERENCE_TOWERS.map(t => t.label);
}
