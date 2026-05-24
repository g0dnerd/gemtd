import { WAVES } from "../../src/data/waves";
import { waveDifficulty } from "../../src/data/wave-difficulty";
import {
  DIFFICULTY,
  type DifficultyConstants,
} from "../../src/data/difficulty-constants";
import { buildCalibrationTargets, type CalibrationTarget } from "./calibration";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSTANTS_PATH = resolve(
  __dirname,
  "../../src/data/difficulty-constants.ts",
);

interface FitResult {
  constants: DifficultyConstants;
  objective: number;
  iterations: number;
  residuals: Array<{ waveNum: number; ratio: number; logRatio: number }>;
}

function cloneConstants(c: DifficultyConstants): DifficultyConstants {
  return {
    ...c,
    abilityMultipliers: { ...c.abilityMultipliers },
    interactions: { ...c.interactions },
  };
}

function evaluate(
  constants: DifficultyConstants,
  targets: CalibrationTarget[],
): number {
  const original = cloneConstants(DIFFICULTY);
  Object.assign(DIFFICULTY, constants);

  let diffs: number[];
  try {
    diffs = WAVES.map((w) => waveDifficulty(w));
  } finally {
    Object.assign(DIFFICULTY, original);
  }

  const ranked = diffs
    .map((d, i) => ({ waveNum: WAVES[i].number, diff: d }))
    .sort((a, b) => a.diff - b.diff);

  const rankMap = new Map<number, number>();
  for (let i = 0; i < ranked.length; i++) {
    rankMap.set(ranked[i].waveNum, i + 1);
  }

  let obj = 0;
  for (const t of targets) {
    const rank = rankMap.get(t.waveNum);
    if (rank === undefined) continue;
    const logRatio = Math.log(rank / t.target);
    obj += logRatio * logRatio;
  }

  return obj;
}

type ParamAccessor = {
  get: (c: DifficultyConstants) => number;
  set: (c: DifficultyConstants, v: number) => void;
  min: number;
  max: number;
  step: number;
};

function buildAccessors(): ParamAccessor[] {
  const accessors: ParamAccessor[] = [
    {
      get: (c) => c.airMultiplier,
      set: (c, v) => (c.airMultiplier = v),
      min: 1,
      max: 20,
      step: 0.5,
    },
    {
      get: (c) => c.speedExponent,
      set: (c, v) => (c.speedExponent = v),
      min: 0.1,
      max: 3,
      step: 0.1,
    },
    {
      get: (c) => c.slowResistWeight,
      set: (c, v) => (c.slowResistWeight = v),
      min: 0,
      max: 2,
      step: 0.1,
    },
    {
      get: (c) => c.stunResistWeight,
      set: (c, v) => (c.stunResistWeight = v),
      min: 0,
      max: 2,
      step: 0.1,
    },
    {
      get: (c) => c.payloadBaseDiscount,
      set: (c, v) => (c.payloadBaseDiscount = v),
      min: 0.1,
      max: 1,
      step: 0.05,
    },
  ];

  const abilityKinds = Object.keys(
    DIFFICULTY.abilityMultipliers,
  ) as (keyof typeof DIFFICULTY.abilityMultipliers)[];
  for (const kind of abilityKinds) {
    accessors.push({
      get: (c) => c.abilityMultipliers[kind] ?? 1,
      set: (c, v) => (c.abilityMultipliers[kind] = v),
      min: 0.5,
      max: 5,
      step: 0.1,
    });
  }

  const interactionKeys = Object.keys(DIFFICULTY.interactions);
  for (const key of interactionKeys) {
    accessors.push({
      get: (c) => c.interactions[key] ?? 1,
      set: (c, v) => (c.interactions[key] = v),
      min: 1,
      max: 2,
      step: 0.02,
    });
  }

  return accessors;
}

export function fit(snapshotRef?: string): FitResult {
  const targets = buildCalibrationTargets(snapshotRef);
  const accessors = buildAccessors();
  const constants = cloneConstants(DIFFICULTY);

  let bestObj = evaluate(constants, targets);
  let iterations = 0;
  const maxIter = 200;

  for (let iter = 0; iter < maxIter; iter++) {
    let improved = false;
    iterations++;

    for (const acc of accessors) {
      const current = acc.get(constants);

      const up = cloneConstants(constants);
      acc.set(up, Math.min(acc.max, current + acc.step));
      const upObj = evaluate(up, targets);

      const down = cloneConstants(constants);
      acc.set(down, Math.max(acc.min, current - acc.step));
      const downObj = evaluate(down, targets);

      if (upObj < bestObj && upObj <= downObj) {
        acc.set(constants, Math.min(acc.max, current + acc.step));
        bestObj = upObj;
        improved = true;
      } else if (downObj < bestObj) {
        acc.set(constants, Math.max(acc.min, current - acc.step));
        bestObj = downObj;
        improved = true;
      }
    }

    if (!improved) break;
  }

  const original = cloneConstants(DIFFICULTY);
  Object.assign(DIFFICULTY, constants);
  let diffs: number[];
  try {
    diffs = WAVES.map((w) => waveDifficulty(w));
  } finally {
    Object.assign(DIFFICULTY, original);
  }

  const ranked = diffs
    .map((d, i) => ({ waveNum: WAVES[i].number, diff: d }))
    .sort((a, b) => a.diff - b.diff);
  const rankMap = new Map<number, number>();
  for (let i = 0; i < ranked.length; i++) {
    rankMap.set(ranked[i].waveNum, i + 1);
  }

  const residuals = targets.map((t) => {
    const rank = rankMap.get(t.waveNum) ?? 0;
    const ratio = rank / t.target;
    return { waveNum: t.waveNum, ratio, logRatio: Math.log(ratio) };
  });

  return { constants, objective: bestObj, iterations, residuals };
}

function formatConstants(c: DifficultyConstants): string {
  const abilityLines = Object.entries(c.abilityMultipliers)
    .map(([k, v]) => `    ${k}: ${v},`)
    .join("\n");

  const interactionLines = Object.entries(c.interactions)
    .map(([k, v]) => `    "${k}": ${v},`)
    .join("\n");

  return `import type { CreepKind } from "./creeps";

export interface DifficultyConstants {
  baselineSpeed: number;
  speedExponent: number;
  airMultiplier: number;
  abilityMultipliers: Partial<Record<CreepKind, number>>;
  slowResistWeight: number;
  stunResistWeight: number;
  payloadBaseDiscount: number;
  interactions: Record<string, number>;
}

export const DIFFICULTY: DifficultyConstants = {
  baselineSpeed: ${c.baselineSpeed},
  speedExponent: ${c.speedExponent},
  airMultiplier: ${c.airMultiplier},
  abilityMultipliers: {
${abilityLines}
  },
  slowResistWeight: ${c.slowResistWeight},
  stunResistWeight: ${c.stunResistWeight},
  payloadBaseDiscount: ${c.payloadBaseDiscount},
  interactions: {
${interactionLines}
  },
};
`;
}

export function writeConstants(c: DifficultyConstants): void {
  writeFileSync(CONSTANTS_PATH, formatConstants(c));
}

export function printFitResult(result: FitResult): void {
  console.log(`\nOptimization converged in ${result.iterations} iterations`);
  console.log(`Objective (sum of squared log-ratios): ${result.objective.toFixed(4)}`);

  console.log("\nOptimized constants:");
  console.log(`  airMultiplier: ${result.constants.airMultiplier}`);
  console.log(`  speedExponent: ${result.constants.speedExponent}`);
  console.log(`  slowResistWeight: ${result.constants.slowResistWeight}`);
  console.log(`  stunResistWeight: ${result.constants.stunResistWeight}`);
  console.log(`  payloadBaseDiscount: ${result.constants.payloadBaseDiscount}`);
  console.log("  abilityMultipliers:");
  for (const [k, v] of Object.entries(result.constants.abilityMultipliers)) {
    console.log(`    ${k}: ${v}`);
  }
  console.log("  interactions:");
  for (const [k, v] of Object.entries(result.constants.interactions)) {
    console.log(`    ${k}: ${v}`);
  }

  console.log("\nResiduals (rank/target ratio — 1.0 is perfect):");
  const sorted = [...result.residuals].sort(
    (a, b) => Math.abs(b.logRatio) - Math.abs(a.logRatio),
  );
  for (const r of sorted.slice(0, 10)) {
    const pct = ((r.ratio - 1) * 100).toFixed(1);
    const sign = r.ratio >= 1 ? "+" : "";
    console.log(`  W${r.waveNum}: ${r.ratio.toFixed(3)} (${sign}${pct}%)`);
  }
}
