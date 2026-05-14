import { describe, expect, it } from 'vitest';
import { HeadlessGame } from '../src/sim/HeadlessGame';
import { START_LIVES } from '../src/game/constants';
import { WAVES, waveTotalCount } from '../src/data/waves';
import type { CreepState } from '../src/game/State';

function injectLeakingCreep(game: HeadlessGame, boss = false): void {
  const route = game.state.flatRoute;
  const creep: CreepState = {
    id: game.nextId(),
    kind: boss ? 'boss' : 'normal',
    pathPos: route.length - 1.001,
    px: 0,
    py: 0,
    hp: 100,
    maxHp: 100,
    speed: 2,
    bounty: 1,
    color: 'amethyst',
    slowResist: 0,
    armorReduction: 0,
    armor: 0,
    flags: boss ? { boss: true } : {},
    alive: true,
    vulnerability: 0,
  };
  game.state.creeps.push(creep);
}

function setupAndLeak(waveNum: number, boss = false): number {
  const game = new HeadlessGame(42);
  game.newGame();

  game.state.wave = waveNum;
  game.state.lives = START_LIVES;

  const waveDef = WAVES[waveNum - 1];
  game.state.phase = 'build';
  game.state.waveStats = {
    spawnedThisWave: waveTotalCount(waveDef),
    killedThisWave: 0,
    leakedThisWave: 0,
    totalToSpawn: waveTotalCount(waveDef),
  };

  // Force into wave phase via the proper path so WavePhase.onEnter runs
  game.state.phase = 'wave';
  // Manually call enterWave internals: we set phase and call wavePhase.onEnter
  // through the public surface. Instead, use the simStep path — we need onEnter
  // called with the right wave. We'll call enterWave-like setup via the game:
  // Actually, the simplest way is to just call simStep after injecting the creep
  // at near-end position. But we need WavePhase.onEnter called first.
  // Let's access the private wavePhase via cast.
  const gAny = game as any;
  gAny.wavePhase.onEnter(waveNum);

  injectLeakingCreep(game, boss);

  const livesBefore = game.state.lives;
  game.simStep();
  return livesBefore - game.state.lives;
}

describe('escalating leak cost', () => {
  it('waves 1-9 cost 1 life per normal leak', () => {
    expect(setupAndLeak(1)).toBe(1);
    expect(setupAndLeak(5)).toBe(1);
    expect(setupAndLeak(9)).toBe(1);
  });

  it('waves 10-19 cost 2 lives per normal leak', () => {
    expect(setupAndLeak(10)).toBe(2);
    expect(setupAndLeak(15)).toBe(2);
    expect(setupAndLeak(19)).toBe(2);
  });

  it('waves 20-29 cost 3 lives per normal leak', () => {
    expect(setupAndLeak(25)).toBe(3);
  });

  it('waves 40-49 cost 5 lives per normal leak', () => {
    expect(setupAndLeak(45)).toBe(5);
  });

  it('wave 50 costs 6 lives per normal leak', () => {
    expect(setupAndLeak(50)).toBe(6);
  });

  it('boss leaks add wave scaling on top of base 6', () => {
    expect(setupAndLeak(10, true)).toBe(7);  // 6 + floor(10/10)
    expect(setupAndLeak(30, true)).toBe(9);  // 6 + floor(30/10)
    expect(setupAndLeak(50, true)).toBe(11); // 6 + floor(50/10)
  });

  it('multiple leaks in the same wave each cost the escalated amount', () => {
    const game = new HeadlessGame(42);
    game.newGame();
    const waveNum = 20;
    game.state.wave = waveNum;
    game.state.lives = START_LIVES;

    const waveDef = WAVES[waveNum - 1];
    game.state.waveStats = {
      spawnedThisWave: waveTotalCount(waveDef),
      killedThisWave: 0,
      leakedThisWave: 0,
      totalToSpawn: waveTotalCount(waveDef),
    };
    game.state.phase = 'wave';
    (game as any).wavePhase.onEnter(waveNum);

    injectLeakingCreep(game);
    injectLeakingCreep(game);
    const livesBefore = game.state.lives;
    game.simStep();
    const totalCost = livesBefore - game.state.lives;
    expect(totalCost).toBe(6); // 3 + 3
  });
});
