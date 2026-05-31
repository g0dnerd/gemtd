/**
 * Creep archetypes referenced by waves.ts.
 * Each entry produces creeps with the listed base stats; the wave layer
 * scales HP & gold per wave.
 */

import { GemType } from "../render/theme";

export type CreepKind =
  | "shambler"
  | "skitter"
  | "carapace"
  | "shrike"
  | "amalgam"
  | "mender"
  | "wizard"
  | "burrower"
  | "vessel"
  | "gazer"
  | "coral"
  | "anemone"
  | "chrysalid"
  | "mycoid"
  | "gestation";

export interface CreepArchetype {
  kind: CreepKind;
  /** Tiles per second. */
  speed: number;
  /** Color hint for sprite tinting. */
  color: GemType;
  /** Multiplier applied on top of wave HP scale. */
  hpMult: number;
  /** Bounty multiplier. */
  bountyMult: number;
  defaultArmor?: number;
  flags: { boss?: boolean; armored?: boolean; air?: boolean };
  /** Short ability description shown in threat panel on first appearance. */
  blurb?: string;
}

export const CREEP_ARCHETYPES: Record<CreepKind, CreepArchetype> = {
  shambler: {
    kind: "shambler",
    speed: 1.6,
    color: "amethyst",
    hpMult: 1.27,
    bountyMult: 1.0,
    flags: {},
  },
  skitter: {
    kind: "skitter",
    speed: 2.6,
    color: "sapphire",
    hpMult: 1.30,
    bountyMult: 1.1,
    flags: {},
  },
  carapace: {
    kind: "carapace",
    speed: 1.2,
    color: "opal",
    hpMult: 1.49,
    bountyMult: 1.2,
    defaultArmor: 12,
    flags: { armored: true },
  },
  shrike: {
    kind: "shrike",
    speed: 1.7,
    color: "diamond",
    hpMult: 0.6,
    bountyMult: 1.2,
    flags: { air: true },
  },
  amalgam: {
    kind: "amalgam",
    speed: 1.2,
    color: "ruby",
    hpMult: 3.5,
    bountyMult: 3.0,
    flags: { boss: true },
  },
  mender: {
    kind: "mender",
    speed: 1.4,
    color: "emerald",
    hpMult: 0.85,
    bountyMult: 1.5,
    flags: {},
    blurb: "Heals nearby creeps",
  },
  wizard: {
    kind: "wizard",
    speed: 1.3,
    color: "sapphire",
    hpMult: 1.0,
    bountyMult: 1.5,
    flags: {},
    blurb: "Teleports nearby creeps forward",
  },
  burrower: {
    kind: "burrower",
    speed: 1.65,
    color: "topaz",
    hpMult: 1.65,
    bountyMult: 1.3,
    flags: {},
    blurb: "Burrows underground, untargetable and regenerating",
  },
  vessel: {
    kind: "vessel",
    speed: 0.55,
    color: "topaz",
    hpMult: 4.5,
    bountyMult: 0.5,
    flags: {},
    blurb: "Releases smaller creeps on death",
  },
  gazer: {
    kind: "gazer",
    speed: 0.6,
    color: "amethyst",
    hpMult: 4.0,
    bountyMult: 0.5,
    flags: {},
    blurb: "Releases smaller creeps on death",
  },
  coral: {
    kind: "coral",
    speed: 0.45,
    color: "emerald",
    hpMult: 5.0,
    bountyMult: 0.5,
    flags: {},
    blurb: "Releases smaller creeps on death",
  },
  anemone: {
    kind: "anemone",
    speed: 0.6,
    color: "aquamarine",
    hpMult: 4.0,
    bountyMult: 0.5,
    flags: {},
    blurb: "Releases smaller creeps on death",
  },
  chrysalid: {
    kind: "chrysalid",
    speed: 1.3,
    color: "amethyst",
    hpMult: 2.0,
    bountyMult: 1.4,
    flags: {},
    blurb: "At low HP, awakens",
  },
  mycoid: {
    kind: "mycoid",
    speed: 1.45,
    color: "emerald",
    hpMult: 0.65,
    bountyMult: 1.3,
    flags: {},
    blurb: "Spore pulse silences tower auras nearby",
  },
  gestation: {
    kind: "gestation",
    speed: 0.35,
    color: "opal",
    hpMult: 8.0,
    bountyMult: 0.5,
    flags: {},
  },
};
