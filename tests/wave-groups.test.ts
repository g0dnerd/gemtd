import { describe, expect, it } from 'vitest';
import { waveTotalCount, groupForSpawn, WaveDef, WaveGroup } from '../src/data/waves';
import { CREEP_ARCHETYPES } from '../src/data/creeps';
import { HeadlessGame } from '../src/sim/HeadlessGame';
import { WAVES } from '../src/data/waves';

function makeGroup(kind: WaveGroup['kind'], count: number, hp = 100, bounty = 5, slowResist = 0): WaveGroup {
  return { kind, count, hp, bounty, slowResist };
}

function makeDef(number: number, groups: WaveGroup[], interval = 0.5, bonus = 10): WaveDef {
  return { number, groups, interval, bonus };
}

describe('wave group helpers', () => {
  it('waveTotalCount sums all groups', () => {
    const def = makeDef(1, [
      makeGroup('armored', 20),
      makeGroup('healer', 3),
      makeGroup('wizard', 2),
    ]);
    expect(waveTotalCount(def)).toBe(25);
  });

  it('waveTotalCount works for single group', () => {
    const def = makeDef(1, [makeGroup('normal', 15)]);
    expect(waveTotalCount(def)).toBe(15);
  });

  it('groupForSpawn returns correct group by spawn index', () => {
    const armored = makeGroup('armored', 20, 500, 10);
    const healer = makeGroup('healer', 3, 200, 15);
    const wizard = makeGroup('wizard', 2, 300, 20);
    const def = makeDef(1, [armored, healer, wizard]);

    expect(groupForSpawn(def, 0)).toBe(armored);
    expect(groupForSpawn(def, 19)).toBe(armored);
    expect(groupForSpawn(def, 20)).toBe(healer);
    expect(groupForSpawn(def, 22)).toBe(healer);
    expect(groupForSpawn(def, 23)).toBe(wizard);
    expect(groupForSpawn(def, 24)).toBe(wizard);
  });

  it('groupForSpawn clamps to last group for out-of-range index', () => {
    const wizard = makeGroup('wizard', 2);
    const def = makeDef(1, [makeGroup('normal', 5), wizard]);
    expect(groupForSpawn(def, 100)).toBe(wizard);
  });
});

describe('multi-group wave spawning', () => {
  it('spawns creeps from multiple groups with correct stats', () => {
    const game = new HeadlessGame(42);
    game.newGame();

    const armoredHp = 1000;
    const healerHp = 500;
    const multiWave: WaveDef = makeDef(
      1,
      [makeGroup('armored', 2, armoredHp, 10), makeGroup('healer', 2, healerHp, 8)],
      0.01,
      20,
    );

    // Patch WAVES[0] temporarily
    const original = WAVES[0];
    WAVES[0] = multiWave;

    try {
      game.state.wave = 1;
      game.state.phase = 'wave';
      (game as any).wavePhase.onEnter(1);

      expect(game.state.waveStats.totalToSpawn).toBe(4);

      // Step enough times to spawn all 4 creeps
      for (let i = 0; i < 300; i++) game.simStep();

      expect(game.state.waveStats.spawnedThisWave).toBe(4);

      // Gather spawned creep kinds from all creeps (alive or dead)
      const kinds = game.state.creeps.map(c => c.kind);
      const armoredCount = kinds.filter(k => k === 'armored').length;
      const healerCount = kinds.filter(k => k === 'healer').length;
      expect(armoredCount).toBe(2);
      expect(healerCount).toBe(2);

      // Verify HP values reflect group-specific hp × archetype hpMult
      const armoredCreeps = game.state.creeps.filter(c => c.kind === 'armored');
      const healerCreeps = game.state.creeps.filter(c => c.kind === 'healer');
      const expectedArmoredHp = Math.round(armoredHp * CREEP_ARCHETYPES.armored.hpMult);
      const expectedHealerHp = Math.round(healerHp * CREEP_ARCHETYPES.healer.hpMult);
      for (const c of armoredCreeps) expect(c.maxHp).toBe(expectedArmoredHp);
      for (const c of healerCreeps) expect(c.maxHp).toBe(expectedHealerHp);
    } finally {
      WAVES[0] = original;
    }
  });

  it('existing single-group waves still work unchanged', () => {
    const def = WAVES[0];
    expect(def.groups.length).toBe(1);
    expect(waveTotalCount(def)).toBe(def.groups[0].count);
    expect(CREEP_ARCHETYPES[def.groups[0].kind]).toBeDefined();
  });
});
