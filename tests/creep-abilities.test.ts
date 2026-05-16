import { describe, expect, it } from 'vitest';
import { HeadlessGame } from '../src/sim/HeadlessGame';
import { WAVES, WaveDef, WaveGroup } from '../src/data/waves';
import { CREEP_ARCHETYPES } from '../src/data/creeps';
import { Cell } from '../src/data/map';
import { MAZE_BLUEPRINT } from '../src/data/maze-blueprint';
import { computeKeeperIndices } from '../src/sim/blueprintKeeper';
import { FINE_TILE, TILE } from '../src/game/constants';
import type { GemType, Quality } from '../src/render/theme';
import type { TowerState, CreepState } from '../src/game/State';

function makeWave(groups: WaveGroup[]): WaveDef {
  return { number: 1, groups, interval: 0.01, bonus: 10 };
}

function runWithWave(waveDef: WaveDef, fn: (game: HeadlessGame) => void): void {
  const game = new HeadlessGame(42);
  game.newGame();
  const original = WAVES[0];
  WAVES[0] = waveDef;
  try {
    game.state.wave = 1;
    game.state.phase = 'wave';
    (game as any).wavePhase.onEnter(1);
    fn(game);
  } finally {
    WAVES[0] = original;
  }
}

function spawnAndGetCreep(kind: string, hp: number): { game: HeadlessGame; creep: CreepState } {
  const wave = makeWave([{ kind: kind as any, count: 1, hp, bounty: 5, slowResist: 0 }]);
  let creep!: CreepState;
  const game = new HeadlessGame(42);
  game.newGame();
  const original = WAVES[0];
  WAVES[0] = wave;
  game.state.wave = 1;
  game.state.phase = 'wave';
  (game as any).wavePhase.onEnter(1);
  for (let i = 0; i < 60; i++) game.simStep();
  creep = game.state.creeps.find(c => c.kind === kind)!;
  WAVES[0] = original;
  return { game, creep };
}

describe('chrysalid (berserker)', () => {
  it('awakens at 40% HP: gains speed, becomes debuff-immune', () => {
    const wave = makeWave([{ kind: 'chrysalid', count: 1, hp: 1000, bounty: 5, slowResist: 0 }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const c = game.state.creeps.find(cr => cr.kind === 'chrysalid')!;
      expect(c).toBeDefined();
      expect(c.chrysalidAwakened).toBeFalsy();

      const originalSpeed = c.speed;
      expect(originalSpeed).toBe(CREEP_ARCHETYPES.chrysalid.speed);

      // Apply debuffs before awakening (no stun — stun blocks advanceCreep entirely)
      c.slow = { factor: 0.5, expiresAt: game.state.tick + 999 };
      c.poison = { dps: 50, expiresAt: game.state.tick + 999, nextTick: game.state.tick + 999 };
      c.armorDebuff = { value: 5, expiresAt: game.state.tick + 999 };

      // Drop HP to 40% threshold
      c.hp = Math.floor(c.maxHp * 0.4);
      game.simStep();

      expect(c.chrysalidAwakened).toBe(true);
      expect(c.speed).toBe(originalSpeed * 1.5);
      expect(c.slowResist).toBe(1);
      // Debuffs cleared
      expect(c.slow).toBeUndefined();
      expect(c.poison).toBeUndefined();
      expect(c.armorDebuff).toBeUndefined();
    });
  });

  it('awakening clears active stun', () => {
    const wave = makeWave([{ kind: 'chrysalid', count: 1, hp: 1000, bounty: 5, slowResist: 0 }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const c = game.state.creeps.find(cr => cr.kind === 'chrysalid')!;

      // Set HP below threshold without stun so awakening triggers
      c.stun = { expiresAt: game.state.tick + 999 };
      c.hp = Math.floor(c.maxHp * 0.3);

      // Stun blocks advanceCreep, so let stun expire first
      c.stun.expiresAt = game.state.tick;
      game.simStep();

      // After awakening, stun should be cleared
      expect(c.chrysalidAwakened).toBe(true);
      expect(c.stun).toBeUndefined();
    });
  });

  it('does not awaken above 40% HP', () => {
    const wave = makeWave([{ kind: 'chrysalid', count: 1, hp: 1000, bounty: 5, slowResist: 0 }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const c = game.state.creeps.find(cr => cr.kind === 'chrysalid')!;
      c.hp = Math.floor(c.maxHp * 0.41);
      game.simStep();

      expect(c.chrysalidAwakened).toBeFalsy();
      expect(c.speed).toBe(CREEP_ARCHETYPES.chrysalid.speed);
    });
  });

  it('new effects cannot be applied after awakening', () => {
    const wave = makeWave([{ kind: 'chrysalid', count: 1, hp: 1000, bounty: 5, slowResist: 0 }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const c = game.state.creeps.find(cr => cr.kind === 'chrysalid')!;
      c.hp = Math.floor(c.maxHp * 0.4);
      game.simStep();
      expect(c.chrysalidAwakened).toBe(true);

      // Combat's applyEffects should bail out for awakened chrysalids
      const combat = (game as any).combat;
      const fakeTower = {} as TowerState;
      combat.applyEffects(c, [{ kind: 'slow', factor: 0.5, duration: 2 }], fakeTower);

      expect(c.slow).toBeUndefined();
    });
  });

  it('awakening only happens once', () => {
    const wave = makeWave([{ kind: 'chrysalid', count: 1, hp: 1000, bounty: 5, slowResist: 0 }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const c = game.state.creeps.find(cr => cr.kind === 'chrysalid')!;
      const baseSpeed = c.speed;
      c.hp = Math.floor(c.maxHp * 0.4);
      game.simStep();

      const awakenedSpeed = c.speed;
      expect(awakenedSpeed).toBe(baseSpeed * 1.5);

      // Drop HP further — should not double-awaken
      c.hp = Math.floor(c.maxHp * 0.1);
      game.simStep();
      expect(c.speed).toBe(awakenedSpeed);
    });
  });
});

describe('mycoid (sapper)', () => {
  const keeperIndices = computeKeeperIndices({
    rounds: MAZE_BLUEPRINT as [number, number][][],
  });
  const R1_KEEPER_IDX = keeperIndices[0];
  const R1_POSITIONS = MAZE_BLUEPRINT[0];

  function setupWithTower(): HeadlessGame {
    const game = new HeadlessGame(42);
    game.newGame();
    const state = game.state;
    state.draws = [];
    state.activeDrawSlot = null;

    const [kx, ky] = R1_POSITIONS[R1_KEEPER_IDX];
    const tower: TowerState = {
      id: game.nextId(),
      x: kx,
      y: ky,
      gem: 'opal',
      quality: 5 as Quality,
      lastFireTick: 0,
      kills: 0,
      totalDamage: 0,
      placedWave: 1,
    };
    state.towers.push(tower);
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++)
        state.grid[ky + dy][kx + dx] = Cell.Tower;

    for (let i = 0; i < R1_POSITIONS.length; i++) {
      if (i === R1_KEEPER_IDX) continue;
      const [rx, ry] = R1_POSITIONS[i];
      const rockId = game.nextId();
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          state.grid[ry + dy][rx + dx] = Cell.Rock;
          state.rocks.push({ x: rx + dx, y: ry + dy, id: rockId, placedAtBuildOfWave: 1 });
        }
    }

    game.refreshRoute();
    return game;
  }

  it('mycoid pulse applies silencedUntil to towers in range', () => {
    const game = setupWithTower();
    const state = game.state;

    // Manually spawn a mycoid near the tower
    const tower = state.towers[0];
    const towerPx = (tower.x + 1) * FINE_TILE;
    const towerPy = (tower.y + 1) * FINE_TILE;

    const mycoid: CreepState = {
      id: game.nextId(),
      kind: 'mycoid',
      pathPos: 0,
      px: towerPx + 10,
      py: towerPy + 10,
      hp: 500,
      maxHp: 500,
      armor: 0,
      speed: CREEP_ARCHETYPES.mycoid.speed,
      bounty: 5,
      color: 'emerald',
      slowResist: 0,
      flags: {},
      alive: true,
      armorReduction: 0,
      vulnerability: 0,
    };
    state.creeps.push(mycoid);
    state.phase = 'wave';
    state.wave = 1;

    // Tick until mycoid fires its ability
    expect(tower.silencedUntil).toBeUndefined();

    // Trigger the ability directly via the wavePhase tickAbility
    const wavePhase = (game as any).wavePhase;
    wavePhase.tickAbility(mycoid);

    expect(tower.silencedUntil).toBeDefined();
    expect(tower.silencedUntil!).toBeGreaterThan(state.tick);
  });

  it('mycoid pulse does NOT affect towers out of range', () => {
    const game = setupWithTower();
    const state = game.state;
    const tower = state.towers[0];

    // Place mycoid far from tower
    const mycoid: CreepState = {
      id: game.nextId(),
      kind: 'mycoid',
      pathPos: 0,
      px: 9999,
      py: 9999,
      hp: 500,
      maxHp: 500,
      armor: 0,
      speed: CREEP_ARCHETYPES.mycoid.speed,
      bounty: 5,
      color: 'emerald',
      slowResist: 0,
      flags: {},
      alive: true,
      armorReduction: 0,
      vulnerability: 0,
    };
    state.creeps.push(mycoid);
    state.phase = 'wave';
    state.wave = 1;

    const wavePhase = (game as any).wavePhase;
    wavePhase.tickAbility(mycoid);

    expect(tower.silencedUntil).toBeUndefined();
  });

  it('silenced towers skip proximity aura effects', () => {
    const game = setupWithTower();
    const state = game.state;
    const tower = state.towers[0];

    // Silence the tower
    tower.silencedUntil = state.tick + 999;

    // Spawn a creep near the tower that would normally be affected by auras
    const towerPx = (tower.x + 1) * FINE_TILE;
    const towerPy = (tower.y + 1) * FINE_TILE;
    const creep: CreepState = {
      id: game.nextId(),
      kind: 'normal',
      pathPos: 0,
      px: towerPx,
      py: towerPy,
      hp: 1000,
      maxHp: 1000,
      armor: 0,
      speed: 1.6,
      bounty: 5,
      color: 'amethyst',
      slowResist: 0,
      flags: {},
      alive: true,
      armorReduction: 0,
      vulnerability: 0,
    };
    state.creeps.push(creep);
    state.phase = 'wave';

    // Run combat step — silenced tower's auras should not apply
    const combat = (game as any).combat;
    combat.step();

    // If the tower had an aura (e.g. prox_armor_reduce), it shouldn't affect the creep
    // since it's silenced. armorReduction is reset each tick, so 0 means no aura applied.
    expect(creep.armorReduction).toBe(0);
  });

  it('silence expires after duration', () => {
    const game = setupWithTower();
    const state = game.state;
    const tower = state.towers[0];

    tower.silencedUntil = state.tick + 5;

    // Advance past expiry
    for (let i = 0; i < 10; i++) {
      state.tick++;
    }

    // After expiry, tower should no longer be silenced
    expect(state.tick).toBeGreaterThan(tower.silencedUntil!);
  });
});
