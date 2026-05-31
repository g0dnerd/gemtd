/**
 * Combat sanity: damage scales with quality; effect strategies populate
 * the right shape. We avoid running the full sim here — we just assert on
 * the data layer's outputs.
 */

import { describe, expect, it } from 'vitest';
import { gemStats } from '../src/data/gems';
import { COMBO_BY_NAME } from '../src/data/combos';
import { GEM_TYPES, Quality } from '../src/render/theme';
import { Combat, armorDamageMultiplier } from '../src/systems/Combat';
import { emptyState, type CreepState, type TowerState } from '../src/game/State';
import { BASE } from '../src/data/map';
import { EventBus } from '../src/events/EventBus';
import { RNG } from '../src/game/rng';
import { FINE_TILE, SIM_HZ } from '../src/game/constants';
import type { Game } from '../src/game/Game';

describe('combat data', () => {
  it('damage at quality 5 is far above quality 1', () => {
    for (const g of GEM_TYPES) {
      const q1 = gemStats(g, 1);
      const q5 = gemStats(g, 5);
      expect(q5.dmgMax).toBeGreaterThan(q1.dmgMax * 5);
    }
  });

  it('attack speed scales mildly with quality', () => {
    for (const g of GEM_TYPES) {
      const q1 = gemStats(g, 1);
      const q5 = gemStats(g, 5);
      expect(q5.atkSpeed).toBeGreaterThanOrEqual(q1.atkSpeed);
    }
  });

  it('range increases monotonically', () => {
    for (const g of GEM_TYPES) {
      let prev = 0;
      for (let q = 1 as Quality; q <= 5; q = (q + 1) as Quality) {
        const s = gemStats(g, q);
        expect(s.range).toBeGreaterThanOrEqual(prev);
        prev = s.range;
      }
    }
  });

  it('ruby has splash effect', () => {
    const s = gemStats('ruby', 3);
    expect(s.effects.some((e) => e.kind === 'splash')).toBe(true);
  });

  it('sapphire has slow effect', () => {
    const s = gemStats('sapphire', 3);
    expect(s.effects.some((e) => e.kind === 'slow')).toBe(true);
  });

  it('topaz chain bounces increase with quality', () => {
    const q1 = gemStats('topaz', 1).effects.find((e) => e.kind === 'chain');
    const q5 = gemStats('topaz', 5).effects.find((e) => e.kind === 'chain');
    if (q1?.kind === 'chain' && q5?.kind === 'chain') {
      expect(q5.bounces).toBeGreaterThan(q1.bounces);
    }
  });
});

describe('new special combo data', () => {
  it('Golden Beryl has speed_damage_aura and no projectile damage', () => {
    const combo = COMBO_BY_NAME.get('golden_beryl');
    expect(combo).toBeDefined();
    expect(combo!.stats.dmgMin).toBe(0);
    expect(combo!.stats.dmgMax).toBe(0);
    const aura = combo!.stats.effects.find(e => e.kind === 'speed_damage_aura');
    expect(aura).toBeDefined();
    if (aura?.kind === 'speed_damage_aura') {
      expect(aura.dps).toBeGreaterThan(0);
      expect(aura.radius).toBeGreaterThan(0);
    }
  });

  it("Tiger's Eye has distance_scaling with maxMult > minMult", () => {
    const combo = COMBO_BY_NAME.get('tigers_eye');
    expect(combo).toBeDefined();
    const ds = combo!.stats.effects.find(e => e.kind === 'distance_scaling');
    expect(ds).toBeDefined();
    if (ds?.kind === 'distance_scaling') {
      expect(ds.maxMult).toBeGreaterThan(ds.minMult);
    }
  });

  it('Thunderstone has amplifying_chain with positive amp', () => {
    const combo = COMBO_BY_NAME.get('thunderstone');
    expect(combo).toBeDefined();
    const ac = combo!.stats.effects.find(e => e.kind === 'amplifying_chain');
    expect(ac).toBeDefined();
    if (ac?.kind === 'amplifying_chain') {
      expect(ac.bounces).toBeGreaterThan(0);
      expect(ac.ampPerBounce).toBeGreaterThan(0);
    }
  });

  it('Ametrine has adaptive_mode', () => {
    const combo = COMBO_BY_NAME.get('ametrine');
    expect(combo).toBeDefined();
    const am = combo!.stats.effects.find(e => e.kind === 'adaptive_mode');
    expect(am).toBeDefined();
    if (am?.kind === 'adaptive_mode') {
      expect(am.threshold).toBeGreaterThan(0);
      expect(am.scatterCount).toBeGreaterThan(am.threshold);
      expect(am.scatterDmgMult).toBeGreaterThan(0);
      expect(am.scatterDmgMult).toBeLessThan(1);
    }
  });

  it('all new specials have upgrade tiers', () => {
    for (const key of ['golden_beryl', 'tigers_eye', 'thunderstone', 'ametrine']) {
      const combo = COMBO_BY_NAME.get(key);
      expect(combo, `${key} missing`).toBeDefined();
      expect(combo!.upgrades.length, `${key} has no upgrades`).toBeGreaterThan(0);
    }
  });

  it("Dragon's Eye (Tiger's Eye T2) gains pierce", () => {
    const combo = COMBO_BY_NAME.get('tigers_eye');
    expect(combo!.upgrades.length).toBeGreaterThan(0);
    const t2 = combo!.upgrades[0].stats;
    expect(t2.effects.some(e => e.kind === 'pierce')).toBe(true);
  });

  it('Storm Crown (Thunderstone T2) strengthens the amplifying chain', () => {
    const combo = COMBO_BY_NAME.get('thunderstone');
    expect(combo!.upgrades.length).toBeGreaterThan(0);
    const base = combo!.stats.effects.find(e => e.kind === 'amplifying_chain');
    const t2 = combo!.upgrades[0].stats.effects.find(e => e.kind === 'amplifying_chain');
    expect(base?.kind === 'amplifying_chain' && t2?.kind === 'amplifying_chain').toBe(true);
    if (base?.kind === 'amplifying_chain' && t2?.kind === 'amplifying_chain') {
      expect(t2.bounces).toBeGreaterThan(base.bounces);
    }
  });

  it('Ametrine Sovereign (T3) gains execute', () => {
    const combo = COMBO_BY_NAME.get('ametrine');
    expect(combo!.upgrades.length).toBe(2);
    const t3 = combo!.upgrades[1].stats;
    expect(t3.effects.some(e => e.kind === 'execute')).toBe(true);
  });
});

// ── Support-assist instrumentation (telemetry-only credit to source towers) ─────

function makeAssistGame(seed = 42) {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.phase = 'wave';
  state.tick = 100;
  state.wave = 1;
  const bus = new EventBus();
  const rng = new RNG(seed);
  let nextId = 1000;
  const game = {
    state,
    bus,
    rng,
    nextId: () => nextId++,
    handleCreepDeath: () => {},
  } as unknown as Game;
  return { game, state };
}

function makeTower(game: Game, opts: Partial<TowerState> & { gem?: TowerState['gem'] } = {}): TowerState {
  const tower: TowerState = {
    id: game.nextId(),
    x: opts.x ?? 4,
    y: opts.y ?? 4,
    gem: opts.gem ?? 'ruby',
    quality: (opts.quality ?? 3) as Quality,
    comboKey: opts.comboKey,
    upgradeTier: opts.upgradeTier,
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0,
    waveDamage: 0,
    placedWave: 1,
  };
  game.state.towers.push(tower);
  return tower;
}

function makeCreep(game: Game, opts: Partial<CreepState> & { x?: number; y?: number } = {}): CreepState {
  const hp = opts.hp ?? 1_000_000;
  const creep: CreepState = {
    id: game.nextId(),
    kind: 'shambler',
    pathPos: 5,
    px: (opts.x ?? 5) * FINE_TILE,
    py: (opts.y ?? 5) * FINE_TILE,
    hp,
    maxHp: hp,
    speed: 2,
    bounty: 5,
    color: 'ruby',
    alive: true,
    armor: opts.armor ?? 0,
    armorReduction: opts.armorReduction ?? 0,
    slowResist: 0,
    stunResist: 0,
    poisonResist: 0,
    vulnerability: opts.vulnerability ?? 0,
    ...opts,
  };
  game.state.creeps.push(creep);
  return creep;
}

describe('support-assist attribution', () => {
  it('splits armor-shred + vuln credit across source towers, summing to total amplification', () => {
    const { game } = makeAssistGame();
    const combat = new Combat(game);
    const dealer = makeTower(game, { x: 4, y: 4 });
    const armorSrc = makeTower(game, { x: 6, y: 4 });
    const vulnSrc = makeTower(game, { x: 4, y: 6 });

    // A creep with both an armor-reduce source (5 pts) and a vuln source (+20%).
    const creep = makeCreep(game, {
      armor: 10,
      armorReduction: 5,
      armorReductionSources: { [armorSrc.id]: 5 },
      vulnerability: 0.2,
      vulnSources: { [vulnSrc.id]: 0.2 },
    });

    const incoming = 1000;
    combat.applyDamage(creep, incoming, dealer);

    const armorMultFull = armorDamageMultiplier(10 - 5);
    const armorMultBase = armorDamageMultiplier(10);
    const totalAssist = incoming * armorMultFull * 1.2 - incoming * armorMultBase;

    // Each source is credited on its own channel; nothing leaks to the dealer.
    expect(armorSrc.armorShredAssist ?? 0).toBeGreaterThan(0);
    expect(vulnSrc.vulnAssist ?? 0).toBeGreaterThan(0);
    expect(dealer.armorShredAssist ?? 0).toBe(0);
    expect(dealer.vulnAssist ?? 0).toBe(0);
    // Channel credits sum to the realized amplification (final − baseline), within rounding.
    const credited = (armorSrc.armorShredAssist ?? 0) + (vulnSrc.vulnAssist ?? 0);
    expect(credited).toBeCloseTo(totalAssist, 5);
  });

  it('credits an Opal attack-speed aura to the opal tower when a buffed dealer fires', () => {
    const { game, state } = makeAssistGame();
    const combat = new Combat(game);
    const opal = makeTower(game, { x: 4, y: 4, gem: 'opal', quality: 3 });
    makeTower(game, { x: 5, y: 4, gem: 'ruby', quality: 3 }); // buffed dealer
    makeCreep(game, { x: 5, y: 4 });

    for (let i = 0; i < SIM_HZ * 2; i++) { state.tick++; combat.step(); }

    // The dealer's shots, sped up by Opal's aura, credit Opal's atk-speed assist.
    expect(opal.atkSpeedAssist ?? 0).toBeGreaterThan(0);
  });

  it('accrues bonus_gold to the firing tower on a successful roll', () => {
    const { game, state } = makeAssistGame();
    // Force every RNG roll to succeed (bonus_gold chance is tiny otherwise).
    (game as unknown as { rng: { next: () => number } }).rng = { next: () => 0 };
    const combat = new Combat(game);
    // Lucky Asian Jade (jade tier 2) carries a bonus_gold effect and a real weapon.
    const jade = makeTower(game, { x: 4, y: 4, gem: 'emerald', comboKey: 'jade', upgradeTier: 2 });
    makeCreep(game, { x: 5, y: 5, bounty: 5 });

    for (let i = 0; i < SIM_HZ; i++) { state.tick++; combat.step(); }

    expect(jade.bonusGoldGenerated ?? 0).toBeGreaterThan(0);
  });
});
