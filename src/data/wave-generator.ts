import { RNG } from "../game/rng";
import { CREEP_ARCHETYPES, type CreepKind } from "./creeps";
import { WAVES, type WaveDef, type WaveGroup, type PayloadGroup } from "./waves";
import { waveDifficulty, creepEffectiveHp } from "./wave-difficulty";
import { DIFFICULTY } from "./difficulty-constants";

const BASE_KINDS: CreepKind[] = ["shambler", "skitter", "carapace", "shrike"];
const SPECIAL_KINDS: CreepKind[] = [
  "mender",
  "burrower",
  "chrysalid",
  "mycoid",
  "wizard",
];
const CONTAINER_KINDS: CreepKind[] = ["vessel", "coral"];
const PAYLOAD_KINDS: CreepKind[] = [
  "shambler",
  "skitter",
  "carapace",
  "shrike",
  "mender",
];

const INTERVALS = [0.525, 0.75, 0.825, 1.125];
const BOSS_DIFFICULTY_MULT = 1.5;
const GROWTH_RATE = 1.08;
const JITTER = 0.15;

function targetDifficulty(waveNum: number, rng: RNG): number {
  const baseDiff = waveDifficulty(WAVES[WAVES.length - 1]);
  let raw = baseDiff * Math.pow(GROWTH_RATE, waveNum - WAVES.length);
  if (waveNum % 10 === 0) raw *= BOSS_DIFFICULTY_MULT;
  return raw * (1 + (rng.next() * 2 - 1) * JITTER);
}

function specialWeight(waveNum: number): number {
  return Math.min(1, 0.3 + (waveNum - WAVES.length) * 0.01);
}

function pickKinds(
  waveNum: number,
  rng: RNG,
  template: "boss" | "container" | "mixed",
): CreepKind[] {
  if (template === "boss") {
    return ["amalgam", "mender"];
  }
  if (template === "container") {
    const container = rng.pick(CONTAINER_KINDS);
    const payload = rng.pick(PAYLOAD_KINDS);
    return [container, payload];
  }

  const groupCount = 2 + rng.int(3);
  const kinds: CreepKind[] = [];
  kinds.push(rng.pick(BASE_KINDS));

  const sw = specialWeight(waveNum);
  const maxSpecials = Math.ceil(groupCount * 0.3);
  let specials = 0;

  for (let i = 1; i < groupCount; i++) {
    if (specials < maxSpecials && rng.next() < sw) {
      kinds.push(rng.pick(SPECIAL_KINDS));
      specials++;
    } else {
      kinds.push(rng.pick(BASE_KINDS));
    }
  }

  return kinds;
}

function isAirWave(_waveNum: number, rng: RNG): boolean {
  return rng.next() < 0.15;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function interactionBonus(kinds: CreepKind[]): number {
  const sorted = [...new Set(kinds)].sort();
  let bonus = 1;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const key = `${sorted[i]}+${sorted[j]}`;
      const b = DIFFICULTY.interactions[key];
      if (b !== undefined) bonus *= b;
    }
  }
  return bonus;
}

function generateBossWave(waveNum: number, rng: RNG, target: number): WaveDef {
  const count = 8 + rng.int(5);
  const menderCount = 2 + rng.int(3);
  const slowResist = clamp(0.3 + (waveNum - WAVES.length) * 0.005, 0, 0.85);
  const stunResist = slowResist * 0.7;
  const armor = Math.floor(5 + (waveNum - WAVES.length) * 0.5);

  const groups: WaveGroup[] = [
    {
      kind: "amalgam",
      count,
      hp: 1,
      bounty: Math.max(1, Math.round((3 * WAVES.length) / waveNum)),
      slowResist,
      stunResist,
      armor,
    },
    {
      kind: "mender",
      count: menderCount,
      hp: 1,
      bounty: Math.max(1, Math.round((3 * WAVES.length) / waveNum)),
      slowResist,
      stunResist,
      armor: Math.floor(armor * 0.7),
    },
  ];

  solveHp(groups, target);

  return {
    number: waveNum,
    groups,
    interval: rng.pick(INTERVALS) * 1.5,
    bonus: Math.round(10 + waveNum * 0.3),
  };
}

function generateContainerWave(
  waveNum: number,
  rng: RNG,
  target: number,
  kinds: CreepKind[],
): WaveDef {
  const containerKind = kinds[0];
  const payloadKind = kinds[1];
  const containerCount = 2 + rng.int(4);
  const payloadCount = 4 + rng.int(7);
  const slowResist = clamp(0.3 + (waveNum - WAVES.length) * 0.005, 0, 0.85);
  const armor = Math.floor(5 + (waveNum - WAVES.length) * 0.5);

  const payloadSlowResist = clamp(slowResist * 0.8, 0, 0.85);
  const payloadArmor = Math.floor(armor * 0.5);

  const payloadEhpPer1 = creepEffectiveHp(
    payloadKind,
    1,
    payloadArmor,
    payloadSlowResist,
    0,
  );
  const containerEhpPer1 = creepEffectiveHp(
    containerKind,
    1,
    armor,
    slowResist,
    0,
  );

  const allKinds = [containerKind, payloadKind];
  const ib = interactionBonus(allKinds);
  const totalUnitDiff =
    (containerEhpPer1 * containerCount +
      payloadEhpPer1 *
        payloadCount *
        containerCount *
        DIFFICULTY.payloadBaseDiscount) *
    ib;
  const hpScale = Math.max(1, Math.round(target / totalUnitDiff));

  const payload: PayloadGroup[] = [
    {
      kind: payloadKind,
      count: payloadCount,
      hp: hpScale,
      bounty: Math.max(1, Math.round((2 * WAVES.length) / waveNum)),
      slowResist: payloadSlowResist,
      armor: payloadArmor,
    },
  ];

  const group: WaveGroup = {
    kind: containerKind,
    count: containerCount,
    hp: hpScale,
    bounty: Math.max(1, Math.round((3 * WAVES.length) / waveNum)),
    slowResist,
    armor,
    payload,
  };

  return {
    number: waveNum,
    groups: [group],
    interval: 2.5,
    bonus: Math.round(10 + waveNum * 0.3),
  };
}

function generateMixedWave(
  waveNum: number,
  rng: RNG,
  target: number,
  kinds: CreepKind[],
  forceAir: boolean,
): WaveDef {
  const slowResist = clamp(0.3 + (waveNum - WAVES.length) * 0.005, 0, 0.85);
  const stunResist = slowResist * 0.7;
  const baseArmor = Math.floor(5 + (waveNum - WAVES.length) * 0.5);

  if (forceAir && !kinds.includes("shrike")) {
    kinds[0] = "shrike";
  }

  const groups: WaveGroup[] = kinds.map((kind) => {
    const count = 15 + rng.int(16);
    const arch = CREEP_ARCHETYPES[kind];
    const armor = arch.flags.armored
      ? Math.floor(baseArmor * 2.5)
      : baseArmor;
    return {
      kind,
      count,
      hp: 1,
      bounty: Math.max(1, Math.round((3 * WAVES.length) / waveNum)),
      slowResist: clamp(slowResist + (rng.next() * 0.1 - 0.05), 0, 0.85),
      stunResist,
      armor,
    };
  });

  solveHp(groups, target);

  return {
    number: waveNum,
    groups,
    interval: rng.pick(INTERVALS) * 1.5,
    bonus: Math.round(10 + waveNum * 0.3),
  };
}

function solveHp(groups: WaveGroup[], target: number): void {
  const allKinds = groups.map((g) => g.kind);
  const ib = interactionBonus(allKinds);

  let totalUnitDiff = 0;
  for (const g of groups) {
    const ehpPer1 = creepEffectiveHp(
      g.kind,
      1,
      g.armor,
      g.slowResist,
      g.stunResist ?? 0,
    );
    totalUnitDiff += ehpPer1 * g.count;
  }
  totalUnitDiff *= ib;

  const hpScale = Math.max(1, Math.round(target / totalUnitDiff));
  for (const g of groups) {
    g.hp = hpScale;
  }
}

export function generateWave(waveNum: number, gameSeed: number): WaveDef {
  const waveSeed = (gameSeed ^ Math.imul(waveNum, 0x9e3779b9)) >>> 0;
  const rng = new RNG(waveSeed);

  const target = targetDifficulty(waveNum, rng);

  const isBoss = waveNum % 10 === 0;
  const isContainer = !isBoss && waveNum % 5 === 0;
  const template = isBoss ? "boss" : isContainer ? "container" : "mixed";
  const kinds = pickKinds(waveNum, rng, template);

  if (template === "boss") {
    return generateBossWave(waveNum, rng, target);
  }
  if (template === "container") {
    return generateContainerWave(waveNum, rng, target, kinds);
  }
  return generateMixedWave(
    waveNum,
    rng,
    target,
    kinds,
    isAirWave(waveNum, rng),
  );
}
