import { CREEP_ARCHETYPES, type CreepKind } from "./creeps";
import { armorDamageMultiplier } from "../systems/Combat";
import { DIFFICULTY } from "./difficulty-constants";
import type { WaveDef, WaveGroup, PayloadGroup } from "./waves";

export function creepEffectiveHp(
  kind: CreepKind,
  hp: number,
  armor: number | undefined,
  slowResist: number,
  stunResist: number,
): number {
  const arch = CREEP_ARCHETYPES[kind];
  const rawHp = hp * arch.hpMult;
  const effectiveArmor = armor ?? arch.defaultArmor ?? 0;
  const armorEhp = rawHp / armorDamageMultiplier(effectiveArmor);
  const speedFactor =
    Math.pow(arch.speed / DIFFICULTY.baselineSpeed, DIFFICULTY.speedExponent);
  const airFactor = arch.flags.air ? DIFFICULTY.airMultiplier : 1.0;
  const abilityFactor = DIFFICULTY.abilityMultipliers[kind] ?? 1.0;
  const ccFactor =
    1 +
    slowResist * DIFFICULTY.slowResistWeight +
    stunResist * DIFFICULTY.stunResistWeight;
  return armorEhp * speedFactor * airFactor * abilityFactor * ccFactor;
}

export function invertCreepHp(
  targetEhp: number,
  kind: CreepKind,
  armor: number | undefined,
  slowResist: number,
  stunResist: number,
): number {
  const arch = CREEP_ARCHETYPES[kind];
  const effectiveArmor = armor ?? arch.defaultArmor ?? 0;
  const speedFactor =
    Math.pow(arch.speed / DIFFICULTY.baselineSpeed, DIFFICULTY.speedExponent);
  const airFactor = arch.flags.air ? DIFFICULTY.airMultiplier : 1.0;
  const abilityFactor = DIFFICULTY.abilityMultipliers[kind] ?? 1.0;
  const ccFactor =
    1 +
    slowResist * DIFFICULTY.slowResistWeight +
    stunResist * DIFFICULTY.stunResistWeight;
  const multiplier =
    (arch.hpMult / armorDamageMultiplier(effectiveArmor)) *
    speedFactor *
    airFactor *
    abilityFactor *
    ccFactor;
  return targetEhp / multiplier;
}

function collectKinds(groups: WaveGroup[]): Set<CreepKind> {
  const kinds = new Set<CreepKind>();
  for (const g of groups) {
    kinds.add(g.kind);
    if (g.payload) collectPayloadKinds(g.payload, kinds);
  }
  return kinds;
}

function collectPayloadKinds(
  payloads: PayloadGroup[],
  kinds: Set<CreepKind>,
): void {
  for (const p of payloads) {
    kinds.add(p.kind);
    if (p.payload) collectPayloadKinds(p.payload, kinds);
  }
}

function interactionBonus(groups: WaveGroup[]): number {
  const kinds = [...collectKinds(groups)].sort();
  let bonus = 1;
  for (let i = 0; i < kinds.length; i++) {
    for (let j = i + 1; j < kinds.length; j++) {
      const key = `${kinds[i]}+${kinds[j]}`;
      const b = DIFFICULTY.interactions[key];
      if (b !== undefined) bonus *= b;
    }
  }
  return bonus;
}

function payloadDifficulty(
  payloads: PayloadGroup[],
  parentCount: number,
  depth: number,
): number {
  const discount = Math.pow(DIFFICULTY.payloadBaseDiscount, depth);
  let total = 0;
  for (const p of payloads) {
    const ehp = creepEffectiveHp(
      p.kind,
      p.hp,
      p.armor,
      p.slowResist ?? 0,
      p.stunResist ?? 0,
    );
    total += ehp * p.count * parentCount * discount;
    if (p.payload) {
      total += payloadDifficulty(p.payload, p.count * parentCount, depth + 1);
    }
  }
  return total;
}

function groupDifficulty(g: WaveGroup): number {
  const ehp = creepEffectiveHp(
    g.kind,
    g.hp,
    g.armor,
    g.slowResist,
    g.stunResist ?? 0,
  );
  let total = ehp * g.count;
  if (g.payload) {
    total += payloadDifficulty(g.payload, g.count, 1);
  }
  return total;
}

export function waveDifficulty(wave: WaveDef): number {
  let total = 0;
  for (const g of wave.groups) {
    total += groupDifficulty(g);
  }
  total *= interactionBonus(wave.groups);
  return Math.round(total);
}
