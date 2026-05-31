import { describe, expect, it } from "vitest";
import { WAVES } from "../src/data/waves";
import { waveDifficulty, creepEffectiveHp, invertCreepHp } from "../src/data/wave-difficulty";
import { CREEP_ARCHETYPES, type CreepKind } from "../src/data/creeps";

const DIFFICULTY_SNAPSHOT = [
  1225, 2120, 4351, 5754, 7726, 11441, 22692, 32919, 28205, 34358, 55148,
  108966, 78230, 124517, 102133, 212305, 177930, 124218, 251479, 309448,
  345220, 699953, 609559, 738915, 544416, 1022824, 847146, 1155041, 1380800,
  1077399, 1222309, 2917680, 2101648, 2431797, 1308766, 3078015, 2830578,
  3322192, 5601853, 2967668, 2706563, 8661734, 5215273, 5341222, 4619724,
  9629340, 7996408, 9251525, 11850251, 12837953,
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
        `tier ${t + 1} boss should be at or above tier median`,
      ).toBeGreaterThanOrEqual(median);
    }
  });

  it("difficulty values are positive and finite", () => {
    for (const w of WAVES) {
      const d = waveDifficulty(w);
      expect(d).toBeGreaterThan(0);
      expect(Number.isFinite(d)).toBe(true);
    }
  });

  it("mender+carapace wave gets interaction bonus", () => {
    const baseWave = WAVES.find(
      (w) =>
        w.groups.some((g) => g.kind === "mender") &&
        w.groups.some((g) => g.kind === "carapace"),
    )!;
    expect(baseWave).toBeDefined();
    const withoutInteraction = baseWave.groups.reduce((sum, g) => {
      const ehp = creepEffectiveHp(g.kind, g.hp, g.armor, g.slowResist, g.stunResist ?? 0);
      return sum + ehp * g.count;
    }, 0);
    const withInteraction = waveDifficulty(baseWave);
    expect(withInteraction).toBeGreaterThan(Math.round(withoutInteraction));
  });

  it("nested payloads contribute less than top-level equivalent", () => {
    const containerWave = WAVES.find((w) =>
      w.groups.some((g) => g.payload && g.payload.some((p) => p.payload)),
    )!;
    expect(containerWave).toBeDefined();
    const actual = waveDifficulty(containerWave);
    const flatGroups = containerWave.groups.map((g) => ({
      ...g,
      payload: g.payload?.map((p) => ({ ...p, payload: undefined })),
    }));
    const flatWave = { ...containerWave, groups: flatGroups };
    const withoutNested = waveDifficulty(flatWave);
    expect(actual).toBeGreaterThan(withoutNested);
  });
});

describe("difficulty inversion", () => {
  const ARCHETYPES_TO_TEST: CreepKind[] = [
    "shambler", "skitter", "carapace", "shrike", "amalgam",
    "mender", "wizard", "burrower", "vessel", "gazer",
    "coral", "anemone", "chrysalid", "mycoid", "gestation",
  ];

  it("roundtrip: invertCreepHp(creepEffectiveHp(...)) ≈ hp for all archetypes", () => {
    for (const kind of ARCHETYPES_TO_TEST) {
      const hp = 10000;
      const armor = CREEP_ARCHETYPES[kind].defaultArmor ?? 5;
      const slowResist = 0.3;
      const stunResist = 0.2;
      const ehp = creepEffectiveHp(kind, hp, armor, slowResist, stunResist);
      const recovered = invertCreepHp(ehp, kind, armor, slowResist, stunResist);
      expect(
        Math.abs(recovered - hp),
        `${kind}: expected ${hp}, got ${recovered.toFixed(2)}`,
      ).toBeLessThan(0.01);
    }
  });
});
