/**
 * Combat sanity: damage scales with quality; effect strategies populate
 * the right shape. We avoid running the full sim here — we just assert on
 * the data layer's outputs.
 */

import { describe, expect, it } from 'vitest';
import { gemStats } from '../src/data/gems';
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
