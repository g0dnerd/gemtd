import { describe, expect, it } from 'vitest';
import { gemStats, GEM_BASE, initialTargetingFor } from '../src/data/gems';
import { GEM_TYPES, type GemType } from '../src/render/theme';
import { COMBOS } from '../src/data/combos';
import { CREEP_ARCHETYPES, TARGETABLE_CREEP_KINDS, TARGET_GROUPS, type CreepKind } from '../src/data/creeps';
import { buildAirRoute, findRoute, flattenRoute } from '../src/systems/Pathfinding';
import { WAYPOINTS, BASE } from '../src/data/map';
import { pickTarget, pickTargets } from '../src/systems/Combat';
import type {
  CreepState,
  TargetingPriority,
  TowerState,
} from '../src/game/State';
import { TILE, FINE_TILE } from '../src/game/constants';

describe('gem targeting', () => {
  it('amethyst targets all with air bonus', () => {
    expect(GEM_BASE.amethyst.targeting).toBe('all');
    expect(gemStats('amethyst', 3).targeting).toBe('all');
    expect(GEM_BASE.amethyst.effects.some((e) => e.kind === 'air_bonus')).toBe(true);
  });

  it('diamond targets ground only', () => {
    expect(GEM_BASE.diamond.targeting).toBe('ground');
    expect(gemStats('diamond', 3).targeting).toBe('ground');
  });

  it('all other base gems target all', () => {
    const restricted = new Set(['diamond', 'garnet']);
    for (const g of GEM_TYPES) {
      if (restricted.has(g)) continue;
      expect(GEM_BASE[g].targeting).toBe('all');
    }
  });

  it('every gem has a valid targeting value', () => {
    const valid = new Set(['all', 'ground', 'air']);
    for (const g of GEM_TYPES) {
      expect(valid.has(GEM_BASE[g].targeting)).toBe(true);
      expect(valid.has(gemStats(g, 1).targeting)).toBe(true);
    }
  });

  it('targeting carries through quality scaling', () => {
    for (const g of GEM_TYPES) {
      const base = GEM_BASE[g].targeting;
      for (let q = 1; q <= 5; q++) {
        expect(gemStats(g, q as 1 | 2 | 3 | 4 | 5).targeting).toBe(base);
      }
    }
  });
});

describe('combo targeting', () => {
  it('pink diamond targets ground only', () => {
    const pd = COMBOS.find((c) => c.key === 'pink_diamond')!;
    expect(pd.stats.targeting).toBe('ground');
  });

  it('every combo has a valid targeting value', () => {
    const valid = new Set(['all', 'ground', 'air']);
    for (const c of COMBOS) {
      expect(valid.has(c.stats.targeting)).toBe(true);
    }
  });
});

describe('amethyst rework stats', () => {
  it('has nerfed base damage for all-targeting', () => {
    expect(GEM_BASE.amethyst.baseDmg).toBeLessThan(30);
  });

  it('has true damage and air bonus effects', () => {
    const s = gemStats('amethyst', 3);
    expect(s.effects.some((e) => e.kind === 'true')).toBe(true);
    expect(s.effects.some((e) => e.kind === 'air_bonus')).toBe(true);
  });

  it('air bonus multiplier scales with quality', () => {
    const q1 = gemStats('amethyst', 1).effects.find((e) => e.kind === 'air_bonus');
    const q5 = gemStats('amethyst', 5).effects.find((e) => e.kind === 'air_bonus');
    expect(q1!.kind === 'air_bonus' && q5!.kind === 'air_bonus' && q5!.multiplier).toBeGreaterThan(
      q1!.kind === 'air_bonus' ? q1!.multiplier : 0,
    );
  });
});

describe('diamond rework stats', () => {
  it('has boosted base damage', () => {
    expect(GEM_BASE.diamond.baseDmg).toBeGreaterThanOrEqual(25);
  });

  it('retains crit effect', () => {
    const s = gemStats('diamond', 3);
    expect(s.effects.some((e) => e.kind === 'crit')).toBe(true);
  });
});

describe('pink diamond rework stats', () => {
  it('has boosted damage over old values', () => {
    const pd = COMBOS.find((c) => c.key === 'pink_diamond')!;
    expect(pd.stats.dmgMin).toBeGreaterThanOrEqual(250);
    expect(pd.stats.dmgMax).toBeGreaterThanOrEqual(350);
  });

  it('retains x5 crit effect', () => {
    const pd = COMBOS.find((c) => c.key === 'pink_diamond')!;
    const crit = pd.stats.effects.find((e) => e.kind === 'crit');
    expect(crit).toBeDefined();
    if (crit?.kind === 'crit') {
      expect(crit.multiplier).toBe(5.0);
    }
  });
});

describe('air creep archetype', () => {
  it('has reduced HP multiplier for balance', () => {
    expect(CREEP_ARCHETYPES.shrike.hpMult).toBeLessThan(1.0);
  });

  it('has the air flag', () => {
    expect(CREEP_ARCHETYPES.shrike.flags.air).toBe(true);
  });
});

describe('air route', () => {
  it('builds a straight-line route through all waypoints', () => {
    const route = buildAirRoute();
    expect(route.length).toBeGreaterThan(0);
    expect(route[0]).toEqual({ x: WAYPOINTS[0].x, y: WAYPOINTS[0].y });
    const last = WAYPOINTS[WAYPOINTS.length - 1];
    expect(route[route.length - 1]).toEqual({ x: last.x, y: last.y });
  });

  it('is shorter than the ground A* route', () => {
    const groundRoute = flattenRoute(findRoute(BASE.grid)!);
    const airRoute = buildAirRoute();
    expect(airRoute.length).toBeLessThanOrEqual(groundRoute.length);
  });

  it('passes through every waypoint', () => {
    const route = buildAirRoute();
    for (const wp of WAYPOINTS) {
      expect(route.some((p: { x: number; y: number }) => p.x === wp.x && p.y === wp.y)).toBe(true);
    }
  });

  it('has no duplicate consecutive points', () => {
    const route = buildAirRoute();
    for (let i = 1; i < route.length; i++) {
      const same = route[i].x === route[i - 1].x && route[i].y === route[i - 1].y;
      expect(same).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-tower targeting priorities
// ---------------------------------------------------------------------------

/** Minimal tower at (0, 0); the only field pickTarget reads is x/y for centre. */
function makeTower(opts: {
  gem?: GemType;
  priorities?: TargetingPriority[];
} = {}): TowerState {
  return {
    id: 1,
    x: 0,
    y: 0,
    gem: opts.gem ?? 'topaz',
    quality: 3,
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0,
    waveDamage: 0,
    placedWave: 1,
    targetingPriority: opts.priorities,
  };
}

interface CreepOpts {
  id: number;
  kind: CreepKind;
  /** Tower-tile offset along x — at offset n the creep sits at FINE_TILE*(n+1). */
  tileOffset: number;
  hp: number;
  maxHp?: number;
  pathPos?: number;
  air?: boolean;
  speed?: number;
}

/** Builds a creep in front of the tower. tileOffset = how many tiles from the
 *  tower centre along x; HP/maxHp/pathPos are explicit so the tests read clean. */
function makeCreep(o: CreepOpts): CreepState {
  const tx = (0 + 1) * FINE_TILE;
  const ty = (0 + 1) * FINE_TILE;
  return {
    id: o.id,
    kind: o.kind,
    pathPos: o.pathPos ?? o.tileOffset,
    px: tx + o.tileOffset * TILE,
    py: ty,
    hp: o.hp,
    maxHp: o.maxHp ?? o.hp,
    armor: 0,
    speed: o.speed ?? 1,
    bounty: 1,
    color: 'amethyst',
    slowResist: 0,
    stunResist: 0,
    poisonResist: 0,
    armorReduction: 0,
    flags: o.air ? { air: true } : undefined,
    alive: true,
    vulnerability: 0,
  };
}

const RANGE = 10; // tiles — wide enough for these tests
const TICK = 0;

describe('pickTarget priority list', () => {
  it('empty list fires at the creep further along the path', () => {
    const t = makeTower({ priorities: [] });
    const back = makeCreep({ id: 1, kind: 'mender', tileOffset: 2, hp: 100, pathPos: 1 });
    const front = makeCreep({ id: 2, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 7 });
    const pick = pickTarget(t, RANGE, [back, front], 'all', TICK, []);
    expect(pick?.id).toBe(front.id);
  });

  it('undefined priorities behaves like empty (engine never reads gem default at runtime)', () => {
    const t = makeTower({ priorities: undefined });
    const back = makeCreep({ id: 1, kind: 'mender', tileOffset: 2, hp: 100, pathPos: 1 });
    const front = makeCreep({ id: 2, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 7 });
    // Caller in Combat.ts substitutes `[]` for undefined; mirror that here.
    const pick = pickTarget(t, RANGE, [back, front], 'all', TICK, t.targetingPriority ?? []);
    expect(pick?.id).toBe(front.id);
  });

  it('kind filter targets a mender even when a shambler is further along path', () => {
    const t = makeTower({ priorities: [{ kind: 'creep_kind', creep: 'mender' }] });
    const mender = makeCreep({ id: 1, kind: 'mender', tileOffset: 1, hp: 100, pathPos: 1 });
    const shambler = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 9 });
    const pick = pickTarget(
      t, RANGE, [mender, shambler], 'all', TICK,
      t.targetingPriority!,
    );
    expect(pick?.id).toBe(mender.id);
  });

  it('kind filter falls through to "furthest along path" when no match', () => {
    const t = makeTower({ priorities: [{ kind: 'creep_kind', creep: 'mender' }] });
    const back = makeCreep({ id: 1, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 1 });
    const front = makeCreep({ id: 2, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 7 });
    const pick = pickTarget(
      t, RANGE, [back, front], 'all', TICK,
      t.targetingPriority!,
    );
    expect(pick?.id).toBe(front.id); // furthest along path
  });

  it('returns null when nothing is in range', () => {
    const t = makeTower({ priorities: [{ kind: 'creep_kind', creep: 'mender' }] });
    const out = makeCreep({ id: 1, kind: 'mender', tileOffset: 100, hp: 100 });
    const pick = pickTarget(
      t, RANGE, [out], 'all', TICK, t.targetingPriority!,
    );
    expect(pick).toBeNull();
  });

  it('respects targeting mode — ground-only ignores air creeps even if kind matches', () => {
    const t = makeTower({ priorities: [{ kind: 'creep_kind', creep: 'shrike' }] });
    const shrike = makeCreep({ id: 1, kind: 'shrike', tileOffset: 1, hp: 100, air: true, pathPos: 1 });
    const shambler = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 5 });
    const pick = pickTarget(
      t, RANGE, [shrike, shambler], 'ground', TICK,
      t.targetingPriority!,
    );
    // air-only shrike is filtered out; kind filter falls through to furthest non-air
    expect(pick?.id).toBe(shambler.id);
  });

  it('lowest_hp_pct picks the lower-HP-fraction creep ignoring path position', () => {
    const t = makeTower({ priorities: [{ kind: 'lowest_hp_pct' }] });
    const full = makeCreep({ id: 1, kind: 'carapace', tileOffset: 1, hp: 100, maxHp: 100, pathPos: 9 });
    const half = makeCreep({ id: 2, kind: 'carapace', tileOffset: 2, hp: 50, maxHp: 100, pathPos: 1 });
    const pick = pickTarget(
      t, RANGE, [full, half], 'all', TICK,
      t.targetingPriority!,
    );
    expect(pick?.id).toBe(half.id);
  });

  it('highest_hp_abs picks the bigger HP pool', () => {
    const t = makeTower({ priorities: [{ kind: 'highest_hp_abs' }] });
    const lo = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 200, maxHp: 200, pathPos: 5 });
    const hi = makeCreep({ id: 2, kind: 'amalgam', tileOffset: 2, hp: 10_000, maxHp: 10_000, pathPos: 1 });
    const pick = pickTarget(
      t, RANGE, [lo, hi], 'all', TICK,
      t.targetingPriority!,
    );
    expect(pick?.id).toBe(hi.id);
  });
});

describe('pickTarget complex multi-component lists', () => {
  it('[mender, lowest_hp_pct]: no mender → falls through to HP ordering', () => {
    const t = makeTower({
      priorities: [
        { kind: 'creep_kind', creep: 'mender' },
        { kind: 'lowest_hp_pct' },
      ],
    });
    const full = makeCreep({ id: 1, kind: 'carapace', tileOffset: 1, hp: 200, maxHp: 200, pathPos: 9 });
    const halfHP = makeCreep({ id: 2, kind: 'carapace', tileOffset: 2, hp: 100, maxHp: 200, pathPos: 1 });
    const pick = pickTarget(
      t, RANGE, [full, halfHP], 'all', TICK,
      t.targetingPriority!,
    );
    expect(pick?.id).toBe(halfHP.id);
  });

  it('[mender, lowest_hp_pct]: mender present → mender wins regardless of HP', () => {
    const t = makeTower({
      priorities: [
        { kind: 'creep_kind', creep: 'mender' },
        { kind: 'lowest_hp_pct' },
      ],
    });
    const fullMender = makeCreep({ id: 1, kind: 'mender', tileOffset: 1, hp: 100, maxHp: 100, pathPos: 1 });
    const dyingShambler = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 5, maxHp: 200, pathPos: 9 });
    const pick = pickTarget(
      t, RANGE, [fullMender, dyingShambler], 'all', TICK,
      t.targetingPriority!,
    );
    expect(pick?.id).toBe(fullMender.id);
  });

  it('walks down multiple kind filters until one matches, then sorts by pathPos', () => {
    // Priority: kill menders first, else amalgams, else carapaces.
    const t = makeTower({
      priorities: [
        { kind: 'creep_kind', creep: 'mender' },
        { kind: 'creep_kind', creep: 'amalgam' },
        { kind: 'creep_kind', creep: 'carapace' },
      ],
    });
    const cara1 = makeCreep({ id: 1, kind: 'carapace', tileOffset: 1, hp: 100, pathPos: 3 });
    const amal1 = makeCreep({ id: 2, kind: 'amalgam', tileOffset: 2, hp: 5000, pathPos: 2 });
    const amal2 = makeCreep({ id: 3, kind: 'amalgam', tileOffset: 3, hp: 5000, pathPos: 8 });
    const pick = pickTarget(
      t, RANGE, [cara1, amal1, amal2], 'all', TICK,
      t.targetingPriority!,
    );
    // No menders → amalgam filter matches → among amalgams pick furthest pathPos.
    expect(pick?.id).toBe(amal2.id);
  });

  it('three kind filters then terminal lowest_hp_pct — terminal applies only after every kind misses', () => {
    const t = makeTower({
      priorities: [
        { kind: 'creep_kind', creep: 'mender' },
        { kind: 'creep_kind', creep: 'wizard' },
        { kind: 'creep_kind', creep: 'burrower' },
        { kind: 'lowest_hp_pct' },
      ],
    });
    const cara = makeCreep({ id: 1, kind: 'carapace', tileOffset: 1, hp: 200, maxHp: 200, pathPos: 9 });
    const shamb = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 30, maxHp: 100, pathPos: 1 });
    const skit = makeCreep({ id: 3, kind: 'skitter', tileOffset: 3, hp: 60, maxHp: 100, pathPos: 4 });
    const pick = pickTarget(
      t, RANGE, [cara, shamb, skit], 'all', TICK,
      t.targetingPriority!,
    );
    // Nothing matched any kind filter → terminal lowest_hp_pct picks 30/100 shambler.
    expect(pick?.id).toBe(shamb.id);
  });
});

describe('pickTargets (multi-target / adaptive / nova) honours the list', () => {
  it('kind filter returns only matching kinds, ordered by pathPos desc', () => {
    const t = makeTower({ priorities: [{ kind: 'creep_kind', creep: 'mender' }] });
    const m1 = makeCreep({ id: 1, kind: 'mender', tileOffset: 1, hp: 100, pathPos: 3 });
    const m2 = makeCreep({ id: 2, kind: 'mender', tileOffset: 2, hp: 100, pathPos: 9 });
    const m3 = makeCreep({ id: 3, kind: 'mender', tileOffset: 3, hp: 100, pathPos: 6 });
    const shamb = makeCreep({ id: 4, kind: 'shambler', tileOffset: 4, hp: 100, pathPos: 5 });
    const got = pickTargets(
      t, RANGE, [m1, m2, m3, shamb], 'all', TICK, 2,
      t.targetingPriority!,
    );
    expect(got.map((c) => c.id)).toEqual([m2.id, m3.id]);
  });

  it('empty list with count=Infinity returns every in-range creep sorted by pathPos desc', () => {
    const t = makeTower({ priorities: [] });
    const a = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 3 });
    const b = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 9 });
    const c = makeCreep({ id: 3, kind: 'shambler', tileOffset: 3, hp: 100, pathPos: 1 });
    const got = pickTargets(t, RANGE, [a, b, c], 'all', TICK, Infinity, []);
    expect(got.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
  });

  it('kind filter then HP ordering: when kind has matches, HP tail is ignored', () => {
    const t = makeTower({
      priorities: [
        { kind: 'creep_kind', creep: 'amalgam' },
        { kind: 'lowest_hp_pct' },
      ],
    });
    const amal = makeCreep({ id: 1, kind: 'amalgam', tileOffset: 1, hp: 9000, maxHp: 10_000, pathPos: 2 });
    const lowHP = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 5, maxHp: 1000, pathPos: 8 });
    const got = pickTargets(
      t, RANGE, [amal, lowHP], 'all', TICK, 3,
      t.targetingPriority!,
    );
    expect(got.map((c) => c.id)).toEqual([amal.id]);
  });
});

describe('creep_group priority (Containers)', () => {
  it('Containers matches any of vessel/gazer/coral/anemone in range', () => {
    const t = makeTower({
      priorities: [{ kind: 'creep_group', group: 'containers' }],
    });
    // shambler upfront, single vessel deeper along path → vessel should win
    // because the group filter catches it before the implicit fallback.
    const shamb = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 9 });
    const vessel = makeCreep({ id: 2, kind: 'vessel',  tileOffset: 2, hp: 1000, pathPos: 1 });
    const pick = pickTarget(t, RANGE, [shamb, vessel], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(vessel.id);
  });

  it('Containers picks the container furthest along path when multiple are in range', () => {
    const t = makeTower({
      priorities: [{ kind: 'creep_group', group: 'containers' }],
    });
    const gazer  = makeCreep({ id: 1, kind: 'gazer',  tileOffset: 1, hp: 100, pathPos: 2 });
    const coral  = makeCreep({ id: 2, kind: 'coral',  tileOffset: 2, hp: 100, pathPos: 7 });
    const anem   = makeCreep({ id: 3, kind: 'anemone',tileOffset: 3, hp: 100, pathPos: 4 });
    const pick = pickTarget(t, RANGE, [gazer, coral, anem], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(coral.id); // furthest along path among containers
  });

  it('Containers falls through to "furthest along path" when no container is in range', () => {
    const t = makeTower({
      priorities: [{ kind: 'creep_group', group: 'containers' }],
    });
    const back  = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 2 });
    const front = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 8 });
    const pick = pickTarget(t, RANGE, [back, front], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(front.id);
  });

  it('Containers + lowest_hp_pct: terminal HP only fires when no container is in range', () => {
    const t = makeTower({
      priorities: [
        { kind: 'creep_group', group: 'containers' },
        { kind: 'lowest_hp_pct' },
      ],
    });
    const vessel    = makeCreep({ id: 1, kind: 'vessel',  tileOffset: 1, hp: 8000, maxHp: 10000, pathPos: 1 });
    const dyingMob  = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 5, maxHp: 100, pathPos: 9 });
    const got = pickTarget(t, RANGE, [vessel, dyingMob], 'all', TICK, t.targetingPriority!);
    expect(got?.id).toBe(vessel.id); // container wins over HP ordering
  });
});

describe('TARGETABLE_CREEP_KINDS surface', () => {
  it('excludes gestation, the four container kinds, wizard, and mycoid', () => {
    const excluded: CreepKind[] = ['gestation', 'wizard', 'mycoid', 'vessel', 'gazer', 'coral', 'anemone'];
    for (const k of excluded) {
      expect(TARGETABLE_CREEP_KINDS).not.toContain(k);
    }
    // The four container kinds live in the Containers group instead.
    expect(TARGET_GROUPS.containers.kinds).toEqual(['vessel', 'gazer', 'coral', 'anemone']);
  });
});

// ---------------------------------------------------------------------------
// fastest / slowest / nearest_spawn — new terminal orderings
// ---------------------------------------------------------------------------

describe('speed-based terminal orderings', () => {
  it('fastest picks the higher-speed creep regardless of HP or pathPos', () => {
    const t = makeTower({ priorities: [{ kind: 'fastest' }] });
    const slow = makeCreep({ id: 1, kind: 'carapace', tileOffset: 1, hp: 100, speed: 1.2, pathPos: 9 });
    const fast = makeCreep({ id: 2, kind: 'skitter',  tileOffset: 2, hp: 100, speed: 2.6, pathPos: 1 });
    const pick = pickTarget(t, RANGE, [slow, fast], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(fast.id);
  });

  it('slowest picks the lower-speed creep regardless of HP or pathPos', () => {
    const t = makeTower({ priorities: [{ kind: 'slowest' }] });
    const slow = makeCreep({ id: 1, kind: 'carapace', tileOffset: 1, hp: 100, speed: 1.2, pathPos: 1 });
    const fast = makeCreep({ id: 2, kind: 'skitter',  tileOffset: 2, hp: 100, speed: 2.6, pathPos: 9 });
    const pick = pickTarget(t, RANGE, [slow, fast], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(slow.id);
  });

  it('fastest is stable across all in-range creeps (uses every one, not a subset)', () => {
    const t = makeTower({ priorities: [{ kind: 'fastest' }] });
    const a = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 100, speed: 1.5, pathPos: 5 });
    const b = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, speed: 2.0, pathPos: 3 });
    const c = makeCreep({ id: 3, kind: 'shambler', tileOffset: 3, hp: 100, speed: 0.8, pathPos: 9 });
    const got = pickTargets(t, RANGE, [a, b, c], 'all', TICK, Infinity, t.targetingPriority!);
    expect(got.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
  });
});

describe('nearest_spawn terminal ordering', () => {
  it('nearest_spawn picks the creep with the lowest pathPos (opposite of fallback)', () => {
    const t = makeTower({ priorities: [{ kind: 'nearest_spawn' }] });
    const back  = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 1 });
    const front = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 9 });
    const pick = pickTarget(t, RANGE, [back, front], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(back.id);
  });

  it('nearest_spawn over pickTargets returns creeps in ascending-pathPos order', () => {
    const t = makeTower({ priorities: [{ kind: 'nearest_spawn' }] });
    const a = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 5 });
    const b = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 2 });
    const c = makeCreep({ id: 3, kind: 'shambler', tileOffset: 3, hp: 100, pathPos: 8 });
    const got = pickTargets(t, RANGE, [a, b, c], 'all', TICK, Infinity, t.targetingPriority!);
    expect(got.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
  });

  it('nearest_spawn ≠ implicit "furthest" fallback — verifies the empty-list case still picks the front', () => {
    // Same creeps, two towers — one with nearest_spawn, one with the empty fallback.
    const back  = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 1 });
    const front = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 9 });
    const ns = makeTower({ priorities: [{ kind: 'nearest_spawn' }] });
    const fb = makeTower({ priorities: [] });
    expect(pickTarget(ns, RANGE, [back, front], 'all', TICK, ns.targetingPriority!)?.id).toBe(back.id);
    expect(pickTarget(fb, RANGE, [back, front], 'all', TICK, fb.targetingPriority!)?.id).toBe(front.id);
  });
});

describe('new terminals compose with kind filters', () => {
  it('[skitter, slowest]: no skitters → slowest wins among remaining creeps', () => {
    const t = makeTower({
      priorities: [
        { kind: 'creep_kind', creep: 'skitter' },
        { kind: 'slowest' },
      ],
    });
    const carapace = makeCreep({ id: 1, kind: 'carapace', tileOffset: 1, hp: 100, speed: 1.2, pathPos: 8 });
    const shambler = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, speed: 1.6, pathPos: 2 });
    const pick = pickTarget(t, RANGE, [carapace, shambler], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(carapace.id); // slower of the two
  });

  it('[mender, fastest]: mender present → mender wins, fastest never consulted', () => {
    const t = makeTower({
      priorities: [
        { kind: 'creep_kind', creep: 'mender' },
        { kind: 'fastest' },
      ],
    });
    const mender   = makeCreep({ id: 1, kind: 'mender',   tileOffset: 1, hp: 100, speed: 1.4, pathPos: 2 });
    const skitter  = makeCreep({ id: 2, kind: 'skitter',  tileOffset: 2, hp: 100, speed: 2.6, pathPos: 9 });
    const pick = pickTarget(t, RANGE, [mender, skitter], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(mender.id);
  });

  it('[containers, nearest_spawn]: no container in range → fires at the creep closest to spawn', () => {
    const t = makeTower({
      priorities: [
        { kind: 'creep_group', group: 'containers' },
        { kind: 'nearest_spawn' },
      ],
    });
    const back  = makeCreep({ id: 1, kind: 'shambler', tileOffset: 1, hp: 100, pathPos: 1 });
    const front = makeCreep({ id: 2, kind: 'shambler', tileOffset: 2, hp: 100, pathPos: 9 });
    const pick = pickTarget(t, RANGE, [back, front], 'all', TICK, t.targetingPriority!);
    expect(pick?.id).toBe(back.id);
  });
});

describe('initial targeting list hydration', () => {
  it('spinel (highest_hp default) hydrates to highest_hp_abs', () => {
    expect(GEM_BASE.spinel.targetPriority).toBe('highest_hp');
    expect(initialTargetingFor('spinel')).toEqual([{ kind: 'highest_hp_abs' }]);
  });

  it('every other gem hydrates to empty (no priority, furthest fallback)', () => {
    for (const g of GEM_TYPES) {
      if (GEM_BASE[g].targetPriority === 'highest_hp') continue;
      expect(initialTargetingFor(g)).toEqual([]);
    }
  });
});
