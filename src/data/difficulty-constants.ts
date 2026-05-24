import type { CreepKind } from "./creeps";

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
  baselineSpeed: 1.5,
  speedExponent: 1.0,
  airMultiplier: 9.0,
  abilityMultipliers: {
    mender: 1.7,
    burrower: 1.5,
    chrysalid: 1.6,
    wizard: 1.6,
    mycoid: 1.4,
  },
  slowResistWeight: 0.6,
  stunResistWeight: 0.4,
  payloadBaseDiscount: 0.75,
  interactions: {
    "carapace+mender": 1.15,
    "amalgam+mender": 1.2,
    "chrysalid+mender": 1.12,
    "burrower+mender": 1.1,
    "skitter+wizard": 1.1,
    "burrower+chrysalid": 1.08,
    "mender+mycoid": 1.1,
    "mender+shrike": 1.12,
    "carapace+wizard": 1.08,
    "chrysalid+mycoid": 1.06,
  },
};
