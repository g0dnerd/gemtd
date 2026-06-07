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

/** Display name for the targeting-priority editor's kind-filter menu. */
export const CREEP_DISPLAY_NAMES: Record<CreepKind, string> = {
  shambler: "Shamblers",
  skitter: "Skitters",
  carapace: "Carapaces",
  shrike: "Shrikes",
  amalgam: "Amalgams",
  mender: "Menders",
  wizard: "Wizards",
  burrower: "Burrowers",
  vessel: "Vessels",
  gazer: "Gazers",
  coral: "Coral",
  anemone: "Anemones",
  chrysalid: "Chrysalids",
  mycoid: "Mycoids",
  gestation: "Gestation",
};

/**
 * Creep kinds offered as individual rows in the per-tower targeting editor.
 *
 * Excluded:
 *  - `wizard` / `mycoid` — their disruption isn't worth a priority slot.
 *  - `gestation` — always the only enemy on the map when it spawns; pointing
 *    at it adds no leverage.
 *  - `vessel` / `gazer` / `coral` / `anemone` — collapsed into the
 *    `containers` target group below (one chip covers all four).
 */
export const TARGETABLE_CREEP_KINDS: readonly CreepKind[] = [
  "shambler",
  "skitter",
  "carapace",
  "shrike",
  "amalgam",
  "mender",
  "burrower",
  "chrysalid",
];

/**
 * Targetable groups bundle multiple kinds under one chip. A `creep_group`
 * priority entry matches any in-range creep whose kind is in the group's
 * `kinds` set; same fall-through semantics as a single-kind filter.
 */
export type TargetGroupKey = "containers";

export const TARGET_GROUPS: Record<
  TargetGroupKey,
  { displayName: string; kinds: readonly CreepKind[] }
> = {
  containers: {
    displayName: "Containers",
    kinds: ["vessel", "gazer", "coral", "anemone"],
  },
};

export const TARGET_GROUP_KEYS: readonly TargetGroupKey[] = ["containers"];

/** Quick membership lookup keyed by group, used by Combat.orderByPriorities. */
export const TARGET_GROUP_KIND_SETS: Record<TargetGroupKey, ReadonlySet<CreepKind>> = {
  containers: new Set(TARGET_GROUPS.containers.kinds),
};

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
    defaultArmor: 11,
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
    speed: 1.5,
    color: "topaz",
    hpMult: 1.8,
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
