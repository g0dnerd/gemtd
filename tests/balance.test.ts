import { describe, expect, it } from 'vitest';
import { GEM_BASE, gemStats } from '../src/data/gems';
import { GEM_TYPES, Quality } from '../src/render/theme';
import { COMBOS, findCombo } from '../src/data/combos';
import { CREEP_ARCHETYPES } from '../src/data/creeps';
import { WAVES } from '../src/data/waves';
import { CHANCE_TIER_WEIGHTS, CHANCE_TIER_UPGRADE_COST } from '../src/game/constants';

describe('balance / data integrity', () => {
  it('every gem type has a base stat block', () => {
    for (const g of GEM_TYPES) {
      expect(GEM_BASE[g]).toBeDefined();
    }
  });

  it('quality scaling produces strictly increasing damage', () => {
    for (const g of GEM_TYPES) {
      let prev = -Infinity;
      for (let q = 1 as Quality; q <= 5; q = (q + 1) as Quality) {
        const s = gemStats(g, q);
        expect(s.dmgMin).toBeGreaterThanOrEqual(0);
        expect(s.dmgMax).toBeGreaterThan(s.dmgMin - 1); // allow equal at chipped (small spread)
        expect(s.dmgMax).toBeGreaterThan(prev);
        prev = s.dmgMax;
      }
    }
  });

  it('every combo references real gem types', () => {
    for (const c of COMBOS) {
      for (const inp of c.inputs) {
        expect(GEM_TYPES).toContain(inp.gem);
        expect(inp.quality).toBeGreaterThanOrEqual(1);
        expect(inp.quality).toBeLessThanOrEqual(5);
      }
      expect(GEM_TYPES).toContain(c.visualGem);
    }
  });

  it('combos with the same input tuples are unique', () => {
    const seen = new Set<string>();
    for (const c of COMBOS) {
      const k = c.inputs.map((i) => `${i.gem}:${i.quality}`).slice().sort().join('+');
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('findCombo matches in any order', () => {
    const silver = COMBOS.find((c) => c.key === 'silver')!;
    const found = findCombo(silver.inputs.slice().reverse());
    expect(found?.key).toBe('silver');
  });

  it('findCombo strict-quality match', () => {
    const silver = COMBOS.find((c) => c.key === 'silver')!;
    // Same gems, wrong quality — should miss.
    const wrong = silver.inputs.map((i) => ({ gem: i.gem, quality: 2 as Quality }));
    expect(findCombo(wrong)).toBeNull();
    expect(findCombo(silver.inputs)).not.toBeNull();
  });

  it('every wave references a real creep archetype', () => {
    for (const w of WAVES) {
      expect(CREEP_ARCHETYPES[w.kind]).toBeDefined();
      expect(w.count).toBeGreaterThan(0);
      expect(w.hp).toBeGreaterThan(0);
      expect(w.bounty).toBeGreaterThan(0);
      expect(w.interval).toBeGreaterThan(0);
    }
  });

  it('wave HP trends upward across each set of 10 waves', () => {
    for (let i = 0; i < 4; i++) {
      const groupAvg = (start: number) => {
        let sum = 0;
        for (let j = 0; j < 10; j++) sum += WAVES[start + j].hp;
        return sum / 10;
      };
      expect(groupAvg((i + 1) * 10)).toBeGreaterThan(groupAvg(i * 10));
    }
  });

  it('boss waves are at every 10', () => {
    for (let i = 9; i < WAVES.length; i += 10) {
      expect(WAVES[i].kind).toBe('boss');
    }
  });

  it('every chance tier row sums to ~1', () => {
    for (const row of CHANCE_TIER_WEIGHTS) {
      const sum = row.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
    }
  });

  it('chance-tier upgrade costs total 1000g', () => {
    const total = CHANCE_TIER_UPGRADE_COST.reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
  });

  it('there are exactly 50 waves', () => {
    expect(WAVES.length).toBe(50);
  });
});
