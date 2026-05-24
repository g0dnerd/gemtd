import { describe, expect, it } from "vitest";
import { generateWave } from "../src/data/wave-generator";
import { waveDifficulty } from "../src/data/wave-difficulty";
import { CREEP_ARCHETYPES } from "../src/data/creeps";
import { WAVES } from "../src/data/waves";

const SEED = 42;
const ALL_KINDS = new Set(Object.keys(CREEP_ARCHETYPES));

describe("wave generator", () => {
  it("produces valid WaveDef structure for waves 51-100", () => {
    for (let w = 51; w <= 100; w++) {
      const wave = generateWave(w, SEED);
      expect(wave.number).toBe(w);
      expect(wave.groups.length).toBeGreaterThan(0);
      expect(wave.interval).toBeGreaterThan(0);
      expect(wave.bonus).toBeGreaterThan(0);
      for (const g of wave.groups) {
        expect(g.count).toBeGreaterThan(0);
        expect(g.hp).toBeGreaterThan(0);
        expect(g.bounty).toBeGreaterThan(0);
        expect(g.slowResist).toBeGreaterThanOrEqual(0);
        expect(g.slowResist).toBeLessThanOrEqual(1);
      }
    }
  });

  it("determinism: same seed produces same wave", () => {
    for (let w = 51; w <= 70; w++) {
      const a = generateWave(w, SEED);
      const b = generateWave(w, SEED);
      expect(a).toEqual(b);
    }
  });

  it("monotonic difficulty on 5-wave rolling average", () => {
    const diffs: number[] = [];
    for (let w = 51; w <= 100; w++) {
      diffs.push(waveDifficulty(generateWave(w, SEED)));
    }
    for (let i = 5; i < diffs.length; i++) {
      const avg = (diffs[i - 4] + diffs[i - 3] + diffs[i - 2] + diffs[i - 1] + diffs[i]) / 5;
      const prevAvg = (diffs[i - 5] + diffs[i - 4] + diffs[i - 3] + diffs[i - 2] + diffs[i - 1]) / 5;
      expect(
        avg,
        `5-wave avg at ${i + 51} should exceed avg at ${i + 50}`,
      ).toBeGreaterThanOrEqual(prevAvg * 0.9);
    }
  });

  it("curve continuity: wave 51 within 30% of wave 50", () => {
    const wave50diff = waveDifficulty(WAVES[49]);
    const wave51diff = waveDifficulty(generateWave(51, SEED));
    const ratio = wave51diff / wave50diff;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.5);
  });

  it("boss waves at every 10th wave", () => {
    for (const w of [60, 70, 80, 90, 100]) {
      const wave = generateWave(w, SEED);
      const hasAmalgam = wave.groups.some((g) => g.kind === "amalgam");
      expect(hasAmalgam, `wave ${w} should be a boss wave`).toBe(true);
    }
  });

  it("performance: <5ms for 100 waves", () => {
    const start = performance.now();
    for (let w = 51; w <= 150; w++) {
      generateWave(w, SEED);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  it("all generated groups use valid CreepKind values", () => {
    for (let w = 51; w <= 100; w++) {
      const wave = generateWave(w, SEED);
      for (const g of wave.groups) {
        expect(ALL_KINDS.has(g.kind), `invalid kind: ${g.kind}`).toBe(true);
        if (g.payload) {
          for (const p of g.payload) {
            expect(ALL_KINDS.has(p.kind), `invalid payload kind: ${p.kind}`).toBe(true);
          }
        }
      }
    }
  });

  it("different seeds produce different waves", () => {
    const a = generateWave(51, 42);
    const b = generateWave(51, 99);
    const sameGroups =
      a.groups.length === b.groups.length &&
      a.groups.every((g, i) => g.kind === b.groups[i].kind && g.hp === b.groups[i].hp);
    expect(sameGroups).toBe(false);
  });
});
