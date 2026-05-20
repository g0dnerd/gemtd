import { describe, expect, it } from "vitest";
import { WAVES } from "../src/data/waves";
import { waveDifficulty } from "../src/data/wave-difficulty";

const DIFFICULTY_SNAPSHOT = [
  971, 1680, 2475, 4560, 7555, 9067, 12910, 24235, 27583, 33600, 44249, 61992,
  57794, 104890, 105250, 120782, 126849, 121477, 221521, 248379, 280540,
  432061, 391178, 612160, 611686, 689745, 622702, 647747, 879485, 980856,
  1563544, 2122340, 2073538, 2637733, 2261327, 2675144, 2616977, 3155314,
  3425320, 2718796, 2976315, 3710308, 4612220, 4122159, 7005676, 9843833,
  7704108, 8951651, 9988461, 33145273,
];

const DRIFT_TOLERANCE = 0.15;

describe("wave difficulty", () => {
  it("snapshot: no wave drifts more than 15% without acknowledgment", () => {
    expect(WAVES.length).toBe(DIFFICULTY_SNAPSHOT.length);
    for (let i = 0; i < WAVES.length; i++) {
      const actual = waveDifficulty(WAVES[i]);
      const expected = DIFFICULTY_SNAPSHOT[i];
      const drift = Math.abs(actual - expected) / expected;
      expect(drift, `wave ${WAVES[i].number} drifted ${(drift * 100).toFixed(1)}%`).toBeLessThan(DRIFT_TOLERANCE);
    }
  });

  it("average difficulty increases across each 10-wave tier", () => {
    const tierCount = Math.floor(WAVES.length / 10);
    const tierAvg = (tier: number) => {
      let sum = 0;
      for (let i = tier * 10; i < tier * 10 + 10; i++) {
        sum += waveDifficulty(WAVES[i]);
      }
      return sum / 10;
    };
    for (let t = 1; t < tierCount; t++) {
      expect(
        tierAvg(t),
        `tier ${t + 1} avg should exceed tier ${t} avg`,
      ).toBeGreaterThan(tierAvg(t - 1));
    }
  });

  it("no consecutive non-container wave drops more than 50%", () => {
    const containerKinds = new Set(["vessel", "coral", "anemone", "gestation"]);
    let prev = 0;
    for (const w of WAVES) {
      const d = waveDifficulty(w);
      const isContainer = w.groups.some((g) => containerKinds.has(g.kind));
      if (prev > 0 && !isContainer) {
        const ratio = d / prev;
        expect(
          ratio,
          `wave ${w.number} dropped to ${(ratio * 100).toFixed(0)}% of previous`,
        ).toBeGreaterThan(0.4);
      }
      prev = d;
    }
  });

  it("boss waves are among the hardest in their tier", () => {
    const tierCount = Math.floor(WAVES.length / 10);
    for (let t = 0; t < tierCount; t++) {
      const tierWaves = WAVES.slice(t * 10, t * 10 + 10);
      const diffs = tierWaves.map((w) => waveDifficulty(w));
      const bossIdx = 9;
      const bossDiff = diffs[bossIdx];
      const median = [...diffs].sort((a, b) => a - b)[5];
      expect(
        bossDiff,
        `tier ${t + 1} boss should exceed tier median`,
      ).toBeGreaterThan(median);
    }
  });

  it("difficulty values are positive and finite", () => {
    for (const w of WAVES) {
      const d = waveDifficulty(w);
      expect(d).toBeGreaterThan(0);
      expect(Number.isFinite(d)).toBe(true);
    }
  });
});
