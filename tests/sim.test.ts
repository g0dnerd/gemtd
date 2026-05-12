import { describe, expect, it } from 'vitest';
import { HeadlessGame } from '../src/sim/HeadlessGame';
import { GreedyAI } from '../src/sim/ai/GreedyAI';
import { BlueprintAI } from '../src/sim/ai/BlueprintAI';
import { StrategistAI } from '../src/sim/ai/StrategistAI';
import { Metrics } from '../src/sim/Metrics';
import { isBuildable } from '../src/data/map';

function findOpenPositions(game: HeadlessGame, count: number): [number, number][] {
  const out: [number, number][] = [];
  const grid = game.state.grid;
  for (let y = 2; y < grid.length - 3 && out.length < count; y += 2) {
    for (let x = 2; x < grid[0].length - 3 && out.length < count; x += 2) {
      if (
        isBuildable(grid[y][x]) &&
        isBuildable(grid[y][x + 1]) &&
        isBuildable(grid[y + 1][x]) &&
        isBuildable(grid[y + 1][x + 1])
      ) {
        out.push([x, y]);
      }
    }
  }
  return out;
}

function placeAllAndKeep(game: HeadlessGame): boolean {
  const positions = findOpenPositions(game, 5);
  if (positions.length < 5) return false;
  for (const [x, y] of positions) {
    if (!game.cmdPlace(x, y)) return false;
  }
  const keepId = game.state.draws[0].placedTowerId!;
  return game.cmdDesignateKeep(keepId);
}

describe('HeadlessGame smoke', () => {
  it('creates a game, places towers, and runs wave 1', () => {
    const game = new HeadlessGame(42);
    game.newGame();

    expect(game.state.phase).toBe('build');
    expect(game.state.wave).toBe(1);
    expect(game.state.draws.length).toBe(5);

    expect(placeAllAndKeep(game)).toBe(true);
    expect(game.state.phase).toBe('wave');

    game.runWave();

    expect(['build', 'gameover']).toContain(game.state.phase);
    if (game.state.phase === 'build') {
      expect(game.state.wave).toBe(2);
    }
  });

  it('transitions through multiple waves', () => {
    const game = new HeadlessGame(123);
    game.newGame();

    for (let w = 0; w < 3; w++) {
      if (game.state.phase !== 'build') break;
      if (game.state.wave > 1) game.cmdStartPlacement();
      if (!placeAllAndKeep(game)) break;
      game.runWave();
    }

    expect(game.state.wave).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic: same seed produces same result', () => {
    function runOnce(seed: number) {
      const game = new HeadlessGame(seed);
      game.newGame();
      placeAllAndKeep(game);
      game.runWave();
      return {
        wave: game.state.wave,
        lives: game.state.lives,
        gold: game.state.gold,
        kills: game.state.totalKills,
      };
    }

    const a = runOnce(42);
    const b = runOnce(42);
    expect(a).toEqual(b);
  });

  it('different seeds produce different results', () => {
    function runOnce(seed: number) {
      const game = new HeadlessGame(seed);
      game.newGame();
      placeAllAndKeep(game);
      game.runWave();
      return {
        lives: game.state.lives,
        gold: game.state.gold,
        kills: game.state.totalKills,
      };
    }

    const a = runOnce(1);
    const b = runOnce(99999);
    const same = a.lives === b.lives && a.gold === b.gold && a.kills === b.kills;
    expect(same).toBe(false);
  });
});

describe('Metrics', () => {
  it('collects wave summaries for a single wave', () => {
    const game = new HeadlessGame(42);
    const metrics = new Metrics(game.bus, game.state);
    game.newGame();
    placeAllAndKeep(game);
    game.runWave();

    const summaries = metrics.waveSummaries();
    expect(summaries.length).toBe(1);
    const w1 = summaries[0];
    expect(w1.wave).toBe(1);
    expect(w1.creepsSpawned).toBeGreaterThan(0);
    expect(w1.killed + w1.leaked).toBe(w1.creepsSpawned);
    expect(w1.durationTicks).toBeGreaterThan(0);
    expect(w1.totalHpSpawned).toBeGreaterThan(0);
    expect(w1.totalDamageDealt).toBeGreaterThanOrEqual(0);
    metrics.detach();
  });

  it('collects tower summaries with gem and quality', () => {
    const game = new HeadlessGame(42);
    const metrics = new Metrics(game.bus, game.state);
    game.newGame();
    placeAllAndKeep(game);
    game.runWave();

    const towers = metrics.towerSummaries();
    expect(towers.length).toBeGreaterThan(0);
    for (const t of towers) {
      expect(t.gem).toBeTruthy();
      expect(t.quality).toBeGreaterThanOrEqual(1);
      expect(t.quality).toBeLessThanOrEqual(5);
    }
    metrics.detach();
  });

  it('populates waveSummaries in GameResult via runGame', { timeout: 30_000 }, () => {
    const game = new HeadlessGame(42);
    const ai = new GreedyAI();
    const result = game.runGame(ai);

    expect(result.waveSummaries.length).toBeGreaterThan(0);
    expect(result.waveSummaries.length).toBeLessThanOrEqual(result.waveReached);
    for (const ws of result.waveSummaries) {
      expect(ws.creepsSpawned).toBeGreaterThan(0);
      expect(ws.totalHpSpawned).toBeGreaterThan(0);
      expect(ws.killed + ws.leaked).toBe(ws.creepsSpawned);
      expect(ws.durationTicks).toBeGreaterThan(0);
    }
    expect(result.towerSummaries.length).toBeGreaterThan(0);
  });

  it('tracks gem damage share', { timeout: 30_000 }, () => {
    const game = new HeadlessGame(42);
    const ai = new GreedyAI();
    game.runGame(ai);

    const share = game.metrics!.gemDamageShare();
    const total = Object.values(share).reduce((s, v) => s + v, 0);
    expect(total).toBeGreaterThan(0);
    expect(Object.keys(share).length).toBeGreaterThan(0);
  });

  it('computes DPS-vs-HP ratio per wave', { timeout: 30_000 }, () => {
    const game = new HeadlessGame(42);
    const ai = new GreedyAI();
    game.runGame(ai);

    const ratios = game.metrics!.dpsVsHpPerWave();
    expect(ratios.length).toBeGreaterThan(0);
    for (const r of ratios) {
      expect(r.totalHp).toBeGreaterThan(0);
      expect(r.ratio).toBeGreaterThanOrEqual(0);
    }
  });

  it('metrics are deterministic across same seed', { timeout: 30_000 }, () => {
    const ai = new GreedyAI();
    const a = new HeadlessGame(42).runGame(ai);
    const b = new HeadlessGame(42).runGame(ai);
    expect(a.waveSummaries).toEqual(b.waveSummaries);
    expect(a.towerSummaries).toEqual(b.towerSummaries);
  });
});

describe('GreedyAI', () => {
  it('completes a full game and reaches at least wave 3', { timeout: 30_000 }, () => {
    const game = new HeadlessGame(42);
    const ai = new GreedyAI();
    const result = game.runGame(ai);
    expect(result.waveReached).toBeGreaterThanOrEqual(3);
    expect(['gameover', 'victory']).toContain(result.outcome);
  });

  it('is deterministic: same seed produces same result', { timeout: 30_000 }, () => {
    const ai = new GreedyAI();
    const a = new HeadlessGame(42).runGame(ai);
    const b = new HeadlessGame(42).runGame(ai);
    expect(a.waveReached).toBe(b.waveReached);
    expect(a.finalGold).toBe(b.finalGold);
    expect(a.finalLives).toBe(b.finalLives);
  });

  it('different seeds produce different results', { timeout: 30_000 }, () => {
    const ai = new GreedyAI();
    const a = new HeadlessGame(1).runGame(ai);
    const b = new HeadlessGame(99999).runGame(ai);
    const same = a.waveReached === b.waveReached && a.finalGold === b.finalGold;
    expect(same).toBe(false);
  });
});

describe('BlueprintAI', () => {
  it('completes a full game and reaches at least wave 3', { timeout: 30_000 }, () => {
    const game = new HeadlessGame(42);
    const ai = new BlueprintAI();
    const result = game.runGame(ai);
    expect(result.waveReached).toBeGreaterThanOrEqual(3);
    expect(['gameover', 'victory']).toContain(result.outcome);
  });

  it('is deterministic: same seed produces same result', { timeout: 30_000 }, () => {
    const ai = new BlueprintAI();
    const a = new HeadlessGame(42).runGame(ai);
    const b = new HeadlessGame(42).runGame(ai);
    expect(a.waveReached).toBe(b.waveReached);
    expect(a.finalGold).toBe(b.finalGold);
    expect(a.finalLives).toBe(b.finalLives);
  });

  it('different seeds produce different results', { timeout: 30_000 }, () => {
    const ai = new BlueprintAI();
    const a = new HeadlessGame(1).runGame(ai);
    const b = new HeadlessGame(99999).runGame(ai);
    const same = a.waveReached === b.waveReached && a.finalGold === b.finalGold;
    expect(same).toBe(false);
  });
});

describe('StrategistAI', () => {
  it('completes a full game and reaches at least wave 3', { timeout: 30_000 }, () => {
    const game = new HeadlessGame(42);
    const ai = new StrategistAI();
    const result = game.runGame(ai);
    expect(result.waveReached).toBeGreaterThanOrEqual(3);
    expect(['gameover', 'victory']).toContain(result.outcome);
  });

  it('is deterministic: same seed produces same result', { timeout: 30_000 }, () => {
    const ai = new StrategistAI();
    const a = new HeadlessGame(42).runGame(ai);
    const b = new HeadlessGame(42).runGame(ai);
    expect(a.waveReached).toBe(b.waveReached);
    expect(a.finalGold).toBe(b.finalGold);
    expect(a.finalLives).toBe(b.finalLives);
  });

  it('different seeds produce different results', { timeout: 30_000 }, () => {
    const ai = new StrategistAI();
    const a = new HeadlessGame(1).runGame(ai);
    const b = new HeadlessGame(99999).runGame(ai);
    const same = a.waveReached === b.waveReached && a.finalGold === b.finalGold;
    expect(same).toBe(false);
  });
});
