import { CREEP_ARCHETYPES, type CreepKind } from "./creeps";
import { armorDamageMultiplier } from "../systems/Combat";
import type { WaveDef, WaveGroup, PayloadGroup } from "./waves";

const BASELINE_SPEED = 1.5;

const AIR_MULTIPLIER = 9.0;

const ABILITY_MULTIPLIERS: Partial<Record<CreepKind, number>> = {
  healer: 1.7,
  tunneler: 1.5,
  chrysalid: 1.6,
  wizard: 1.6,
  mycoid: 1.4,
};

const SLOW_RESIST_WEIGHT = 0.6;
const STUN_RESIST_WEIGHT = 0.4;

function creepEffectiveHp(
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
  const speedFactor = arch.speed / BASELINE_SPEED;
  const airFactor = arch.flags.air ? AIR_MULTIPLIER : 1.0;
  const abilityFactor = ABILITY_MULTIPLIERS[kind] ?? 1.0;
  const ccFactor =
    1 + slowResist * SLOW_RESIST_WEIGHT + stunResist * STUN_RESIST_WEIGHT;
  return armorEhp * speedFactor * airFactor * abilityFactor * ccFactor;
}

function payloadDifficulty(
  payloads: PayloadGroup[],
  parentCount: number,
): number {
  let total = 0;
  for (const p of payloads) {
    const ehp = creepEffectiveHp(
      p.kind,
      p.hp,
      p.armor,
      p.slowResist ?? 0,
      p.stunResist ?? 0,
    );
    total += ehp * p.count * parentCount;
    if (p.payload) {
      total += payloadDifficulty(p.payload, p.count * parentCount);
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
    total += payloadDifficulty(g.payload, g.count);
  }
  return total;
}

export function waveDifficulty(wave: WaveDef): number {
  let total = 0;
  for (const g of wave.groups) {
    total += groupDifficulty(g);
  }
  return Math.round(total);
}
