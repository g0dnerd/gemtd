/**
 * Combat sanity: damage scales with quality; effect strategies populate
 * the right shape. We avoid running the full sim here — we just assert on
 * the data layer's outputs.
 */

import { describe, expect, it } from 'vitest';
import { gemStats } from '../src/data/gems';
import { COMBO_BY_NAME } from '../src/data/combos';
import { GEM_TYPES, Quality } from '../src/render/theme';

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

  it('Storm Crown (Thunderstone T2) gains poison', () => {
    const combo = COMBO_BY_NAME.get('thunderstone');
    expect(combo!.upgrades.length).toBeGreaterThan(0);
    const t2 = combo!.upgrades[0].stats;
    expect(t2.effects.some(e => e.kind === 'poison')).toBe(true);
  });

  it('Ametrine Sovereign (T3) gains execute', () => {
    const combo = COMBO_BY_NAME.get('ametrine');
    expect(combo!.upgrades.length).toBe(2);
    const t3 = combo!.upgrades[1].stats;
    expect(t3.effects.some(e => e.kind === 'execute')).toBe(true);
  });
});
