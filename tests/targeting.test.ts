import { describe, expect, it } from 'vitest';
import { gemStats, GEM_BASE } from '../src/data/gems';
import { GEM_TYPES } from '../src/render/theme';
import { COMBOS } from '../src/data/combos';
import { CREEP_ARCHETYPES } from '../src/data/creeps';
import { buildAirRoute, findRoute, flattenRoute } from '../src/systems/Pathfinding';
import { WAYPOINTS, BASE } from '../src/data/map';

describe('gem targeting', () => {
  it('amethyst targets air only', () => {
    expect(GEM_BASE.amethyst.targeting).toBe('air');
    expect(gemStats('amethyst', 3).targeting).toBe('air');
  });

  it('diamond targets ground only', () => {
    expect(GEM_BASE.diamond.targeting).toBe('ground');
    expect(gemStats('diamond', 3).targeting).toBe('ground');
  });

  it('all other base gems target all', () => {
    const restricted = new Set(['amethyst', 'diamond']);
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
  it('has higher base damage than old value', () => {
    expect(GEM_BASE.amethyst.baseDmg).toBeGreaterThanOrEqual(30);
  });

  it('has true damage effect instead of stun', () => {
    const s = gemStats('amethyst', 3);
    expect(s.effects.some((e) => e.kind === 'true')).toBe(true);
    expect(s.effects.some((e) => e.kind === 'stun')).toBe(false);
  });
});

describe('diamond rework stats', () => {
  it('has boosted base damage', () => {
    expect(GEM_BASE.diamond.baseDmg).toBeGreaterThanOrEqual(28);
  });

  it('retains crit effect', () => {
    const s = gemStats('diamond', 3);
    expect(s.effects.some((e) => e.kind === 'crit')).toBe(true);
  });
});

describe('pink diamond rework stats', () => {
  it('has boosted damage over old values', () => {
    const pd = COMBOS.find((c) => c.key === 'pink_diamond')!;
    expect(pd.stats.dmgMin).toBeGreaterThanOrEqual(300);
    expect(pd.stats.dmgMax).toBeGreaterThanOrEqual(450);
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
    expect(CREEP_ARCHETYPES.air.hpMult).toBeLessThan(1.0);
  });

  it('has the air flag', () => {
    expect(CREEP_ARCHETYPES.air.flags.air).toBe(true);
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
    expect(airRoute.length).toBeLessThan(groundRoute.length);
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
