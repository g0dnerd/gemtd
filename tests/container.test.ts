import { describe, expect, it } from 'vitest';
import { HeadlessGame } from '../src/sim/HeadlessGame';
import { WAVES, WaveDef, WaveGroup } from '../src/data/waves';
import { CREEP_ARCHETYPES } from '../src/data/creeps';

function makeContainerWave(groups: WaveGroup[]): WaveDef {
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

describe('container creeps', () => {
  it('single-layer: killing a vessel spawns payload creeps', () => {
    const wave = makeContainerWave([{
      kind: 'vessel',
      count: 1,
      hp: 100,
      bounty: 2,
      slowResist: 0,
      payload: [
        { kind: 'shambler', count: 3, hp: 50, bounty: 1 },
      ],
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const vessels = game.state.creeps.filter(c => c.kind === 'vessel');
      expect(vessels.length).toBe(1);
      expect(vessels[0].alive).toBe(true);
      expect(vessels[0].payload).toBeDefined();
      expect(vessels[0].payload!.length).toBe(1);
      expect(vessels[0].payload![0].count).toBe(3);

      vessels[0].hp = 0;
      vessels[0].alive = false;
      game.handleCreepDeath(vessels[0]);
      for (let j = 0; j < 60; j++) game.simStep();

      const normals = game.state.creeps.filter(c => c.kind === 'shambler');
      expect(normals.length).toBe(3);
      for (const n of normals) {
        expect(n.alive).toBe(true);
      }
    });
  });

  it('payload HP is scaled by archetype hpMult', () => {
    const payloadHp = 200;
    const wave = makeContainerWave([{
      kind: 'vessel',
      count: 1,
      hp: 100,
      bounty: 2,
      slowResist: 0,
      payload: [
        { kind: 'skitter', count: 2, hp: payloadHp, bounty: 1 },
      ],
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const vessel = game.state.creeps.find(c => c.kind === 'vessel')!;
      vessel.hp = 0;
      vessel.alive = false;
      game.handleCreepDeath(vessel);
      for (let j = 0; j < 30; j++) game.simStep();

      const fasts = game.state.creeps.filter(c => c.kind === 'skitter');
      const expectedHp = Math.round(payloadHp * CREEP_ARCHETYPES.skitter.hpMult);
      for (const f of fasts) {
        expect(f.maxHp).toBe(expectedHp);
        expect(f.hp).toBe(expectedHp);
      }
    });
  });

  it('two-layer nesting: coral → vessel → normals', () => {
    const wave = makeContainerWave([{
      kind: 'coral',
      count: 1,
      hp: 200,
      bounty: 3,
      slowResist: 0,
      payload: [
        { kind: 'vessel', count: 2, hp: 100, bounty: 2, payload: [
          { kind: 'shambler', count: 2, hp: 50, bounty: 1 },
        ]},
      ],
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const coral = game.state.creeps.find(c => c.kind === 'coral')!;
      coral.hp = 0;
      coral.alive = false;
      game.handleCreepDeath(coral);
      for (let j = 0; j < 30; j++) game.simStep();

      const vessels = game.state.creeps.filter(c => c.kind === 'vessel');
      expect(vessels.length).toBe(2);
      for (const v of vessels) {
        expect(v.payload).toBeDefined();
        expect(v.alive).toBe(true);
      }

      vessels[0].hp = 0;
      vessels[0].alive = false;
      game.handleCreepDeath(vessels[0]);
      for (let j = 0; j < 30; j++) game.simStep();

      const normals = game.state.creeps.filter(c => c.kind === 'shambler');
      expect(normals.length).toBe(2);

      vessels[1].hp = 0;
      vessels[1].alive = false;
      game.handleCreepDeath(vessels[1]);
      for (let j = 0; j < 30; j++) game.simStep();

      const allNormals = game.state.creeps.filter(c => c.kind === 'shambler');
      expect(allNormals.length).toBe(4);
    });
  });

  it('payload creeps inherit position from parent', () => {
    const wave = makeContainerWave([{
      kind: 'vessel',
      count: 1,
      hp: 100,
      bounty: 2,
      slowResist: 0,
      payload: [
        { kind: 'shambler', count: 2, hp: 50, bounty: 1 },
      ],
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 120; i++) game.simStep();

      const vessel = game.state.creeps.find(c => c.kind === 'vessel')!;
      const parentPx = vessel.px;
      expect(parentPx).toBeGreaterThan(0);

      vessel.hp = 0;
      vessel.alive = false;
      game.handleCreepDeath(vessel);
      for (let j = 0; j < 30; j++) game.simStep();

      const normals = game.state.creeps.filter(c => c.kind === 'shambler');
      for (const n of normals) {
        expect(n.px).toBeGreaterThan(0);
      }
    });
  });

  it('payload creeps use archetype speed, not parent speed', () => {
    const wave = makeContainerWave([{
      kind: 'coral',
      count: 1,
      hp: 100,
      bounty: 2,
      slowResist: 0,
      payload: [
        { kind: 'skitter', count: 1, hp: 50, bounty: 1 },
      ],
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const coral = game.state.creeps.find(c => c.kind === 'coral')!;
      coral.hp = 0;
      coral.alive = false;
      game.handleCreepDeath(coral);
      for (let j = 0; j < 30; j++) game.simStep();

      const fast = game.state.creeps.find(c => c.kind === 'skitter')!;
      expect(fast.speed).toBe(CREEP_ARCHETYPES.skitter.speed);
      expect(fast.speed).not.toBe(CREEP_ARCHETYPES.coral.speed);
    });
  });

  it('waveStats.totalToSpawn increments when payload spawns', () => {
    const wave = makeContainerWave([{
      kind: 'vessel',
      count: 1,
      hp: 100,
      bounty: 2,
      slowResist: 0,
      payload: [
        { kind: 'shambler', count: 4, hp: 50, bounty: 1 },
      ],
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();
      expect(game.state.waveStats.totalToSpawn).toBe(1);

      const vessel = game.state.creeps.find(c => c.kind === 'vessel')!;
      vessel.hp = 0;
      vessel.alive = false;
      game.handleCreepDeath(vessel);

      expect(game.state.waveStats.totalToSpawn).toBe(5);
      for (let j = 0; j < 80; j++) game.simStep();
      expect(game.state.waveStats.spawnedThisWave).toBe(5);
    });
  });

  it('non-container creeps produce no payload on death', () => {
    const wave = makeContainerWave([{
      kind: 'shambler',
      count: 1,
      hp: 100,
      bounty: 2,
      slowResist: 0,
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const normal = game.state.creeps.find(c => c.kind === 'shambler')!;
      const countBefore = game.state.creeps.length;
      normal.hp = 0;
      normal.alive = false;
      game.handleCreepDeath(normal);

      expect(game.state.creeps.length).toBe(countBefore);
    });
  });

  it('wave definitions at 15/25/35/45 have container payloads', () => {
    const containerWaves = [15, 25, 35, 45];
    for (const num of containerWaves) {
      const wave = WAVES[num - 1];
      expect(wave.number).toBe(num);
      const hasPayload = wave.groups.some(g => g.payload && g.payload.length > 0);
      expect(hasPayload, `wave ${num} should have payload`).toBe(true);
    }
  });

  it('container nesting depth increases: w15=1, w25=2, w35=3, w45=4', () => {
    function maxDepth(groups: Array<{ payload?: any[] }>): number {
      let d = 0;
      for (const g of groups) {
        if (g.payload && g.payload.length > 0) {
          d = Math.max(d, 1 + maxDepth(g.payload));
        }
      }
      return d;
    }

    expect(maxDepth(WAVES[14].groups)).toBe(1);
    expect(maxDepth(WAVES[24].groups)).toBe(2);
    expect(maxDepth(WAVES[34].groups)).toBe(3);
    expect(maxDepth(WAVES[44].groups)).toBe(4);
  });

  it('payload spawns are staggered over time, not instant', () => {
    const wave = makeContainerWave([{
      kind: 'vessel',
      count: 1,
      hp: 100,
      bounty: 2,
      slowResist: 0,
      payload: [
        { kind: 'shambler', count: 4, hp: 50, bounty: 1 },
      ],
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const vessel = game.state.creeps.find(c => c.kind === 'vessel')!;
      vessel.hp = 0;
      vessel.alive = false;
      game.handleCreepDeath(vessel);

      // First child spawns immediately
      const immediateCount = game.state.creeps.filter(c => c.kind === 'shambler').length;
      expect(immediateCount).toBe(1);

      // After enough ticks for 2nd spawn (STAGGER_TICKS=20), more appear
      for (let i = 0; i < 25; i++) game.simStep();
      const afterSome = game.state.creeps.filter(c => c.kind === 'shambler').length;
      expect(afterSome).toBeGreaterThan(1);
      expect(afterSome).toBeLessThan(4);

      // After enough ticks for all spawns (delay 60 for 4th creep)
      for (let i = 0; i < 60; i++) game.simStep();
      const afterAll = game.state.creeps.filter(c => c.kind === 'shambler').length;
      expect(afterAll).toBe(4);
    });
  });

  it('pending payload spawns are cleared on wave end', () => {
    const wave = makeContainerWave([{
      kind: 'vessel',
      count: 1,
      hp: 100,
      bounty: 2,
      slowResist: 0,
      payload: [
        { kind: 'shambler', count: 4, hp: 50, bounty: 1 },
      ],
    }]);

    runWithWave(wave, (game) => {
      for (let i = 0; i < 60; i++) game.simStep();

      const vessel = game.state.creeps.find(c => c.kind === 'vessel')!;
      vessel.hp = 0;
      vessel.alive = false;
      game.handleCreepDeath(vessel);

      // Only first child spawned immediately
      expect(game.state.creeps.filter(c => c.kind === 'shambler').length).toBe(1);

      // End the wave before remaining children spawn
      game.endWave(0, 0);

      // Step more ticks — no additional normals should appear
      for (let i = 0; i < 60; i++) game.simStep();
      // The wave ended, phase changed — pending spawns cleared
      const normals = game.state.creeps.filter(c => c.kind === 'shambler');
      expect(normals.length).toBe(1);
    });
  });
});
