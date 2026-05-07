/**
 * Multi-gem combination recipes.
 *
 * Each recipe demands an exact set of (gem, quality) tuples. Match key is
 * sorted "gem:quality" tuples joined by '+'. Quality words from recipes.md:
 *   Chipped=1, Flawed=2, Normal=3, Flawless=4, Perfect=5.
 */

import { GemType, Quality } from "../render/theme";
import type { EffectKind, Targeting } from "./gems";

export interface ComboInput {
  gem: GemType;
  quality: Quality;
}

export interface ComboRecipe {
  key: string;
  name: string;
  inputs: ComboInput[];
  stats: {
    dmgMin: number;
    dmgMax: number;
    range: number;
    atkSpeed: number;
    effects: EffectKind[];
    blurb: string;
    targeting: Targeting;
  };
  visualGem: GemType;
}

const sortKey = (xs: ComboInput[]): string =>
  xs
    .map((i) => `${i.gem}:${i.quality}`)
    .sort()
    .join("+");

export const COMBOS: ComboRecipe[] = [
  {
    key: "black_opal",
    name: "Black Opal",
    inputs: [
      { gem: "opal", quality: 5 },
      { gem: "diamond", quality: 4 },
      { gem: "aquamarine", quality: 3 },
    ],
    stats: {
      dmgMin: 80,
      dmgMax: 120,
      range: 4.0,
      atkSpeed: 1.0,
      effects: [{ kind: "aura_atkspeed", radius: 2.5, pct: 0.3 }],
      blurb: "+30% atk speed to nearby towers.",
      targeting: "all",
    },
    visualGem: "opal",
  },
  {
    key: "bloodstone",
    name: "Bloodstone",
    inputs: [
      { gem: "ruby", quality: 5 },
      { gem: "aquamarine", quality: 4 },
      { gem: "amethyst", quality: 3 },
    ],
    stats: {
      dmgMin: 280,
      dmgMax: 420,
      range: 4.0,
      atkSpeed: 1.0,
      effects: [
        { kind: "splash", radius: 2.0, falloff: 0.5 },
        { kind: "poison", dps: 100, duration: 4 },
      ],
      blurb: "Burn dmg to nearby enemies. High splash radius.",
      targeting: "all",
    },
    visualGem: "ruby",
  },
  {
    key: "dark_emerald",
    name: "Dark Emerald",
    inputs: [
      { gem: "emerald", quality: 5 },
      { gem: "sapphire", quality: 4 },
      { gem: "topaz", quality: 2 },
    ],
    stats: {
      dmgMin: 200,
      dmgMax: 320,
      range: 4.5,
      atkSpeed: 1.1,
      effects: [{ kind: "stun", chance: 0.125, duration: 1.0 }],
      blurb: "12.5% chance to stun for 1 sec.",
      targeting: "all",
    },
    visualGem: "emerald",
  },
  {
    key: "gold",
    name: "Gold",
    inputs: [
      { gem: "amethyst", quality: 5 },
      { gem: "amethyst", quality: 4 },
      { gem: "diamond", quality: 2 },
    ],
    stats: {
      dmgMin: 220,
      dmgMax: 360,
      range: 4.0,
      atkSpeed: 1.0,
      effects: [{ kind: "crit", chance: 0.25, multiplier: 3.0 }],
      blurb: "25% crit chance.",
      targeting: "all",
    },
    visualGem: "topaz",
  },
  {
    key: "jade",
    name: "Jade",
    inputs: [
      { gem: "emerald", quality: 3 },
      { gem: "opal", quality: 3 },
      { gem: "sapphire", quality: 2 },
    ],
    stats: {
      dmgMin: 50,
      dmgMax: 80,
      range: 4.0,
      atkSpeed: 1.0,
      effects: [
        { kind: "poison", dps: 30, duration: 2 },
        { kind: "slow", factor: 0.5, duration: 2.0 },
      ],
      blurb: "Poison + 50% slow for 2s.",
      targeting: "all",
    },
    visualGem: "emerald",
  },
  {
    key: "malachite",
    name: "Malachite",
    inputs: [
      { gem: "opal", quality: 1 },
      { gem: "emerald", quality: 1 },
      { gem: "aquamarine", quality: 1 },
    ],
    stats: {
      dmgMin: 14,
      dmgMax: 22,
      range: 3.5,
      atkSpeed: 1.4,
      effects: [{ kind: "chain", bounces: 2, falloff: 1.0 }],
      blurb: "Attacks 3 enemies at once.",
      targeting: "all",
    },
    visualGem: "emerald",
  },
  {
    key: "pink_diamond",
    name: "Pink Diamond",
    inputs: [
      { gem: "diamond", quality: 5 },
      { gem: "topaz", quality: 3 },
      { gem: "diamond", quality: 3 },
    ],
    stats: {
      dmgMin: 350,
      dmgMax: 520,
      range: 4.5,
      atkSpeed: 1.0,
      effects: [{ kind: "crit", chance: 0.1, multiplier: 5.0 }],
      blurb: "10% chance for x5 crit. Ground only.",
      targeting: "ground",
    },
    visualGem: "ruby",
  },
  {
    key: "silver",
    name: "Silver",
    inputs: [
      { gem: "topaz", quality: 1 },
      { gem: "diamond", quality: 1 },
      { gem: "sapphire", quality: 1 },
    ],
    stats: {
      dmgMin: 20,
      dmgMax: 26,
      range: 3.5,
      atkSpeed: 1.1,
      effects: [
        { kind: "splash", radius: 1.2, falloff: 0.5 },
        { kind: "slow", factor: 0.8, duration: 1.5 },
      ],
      blurb: "Splash slow 20%.",
      targeting: "all",
    },
    visualGem: "diamond",
  },
  {
    key: "star_ruby",
    name: "Star Ruby",
    inputs: [
      { gem: "ruby", quality: 2 },
      { gem: "ruby", quality: 1 },
      { gem: "amethyst", quality: 1 },
    ],
    stats: {
      dmgMin: 20,
      dmgMax: 32,
      range: 3.5,
      atkSpeed: 1.0,
      effects: [
        { kind: "splash", radius: 1.5, falloff: 0.5 },
        { kind: "poison", dps: 12, duration: 3 },
      ],
      blurb: "Burns nearby enemies.",
      targeting: "all",
    },
    visualGem: "ruby",
  },
  {
    key: "uranium",
    name: "Uranium",
    inputs: [
      { gem: "topaz", quality: 5 },
      { gem: "sapphire", quality: 3 },
      { gem: "opal", quality: 2 },
    ],
    stats: {
      dmgMin: 240,
      dmgMax: 380,
      range: 4.5,
      atkSpeed: 1.0,
      effects: [
        { kind: "splash", radius: 2.0, falloff: 0.6 },
        { kind: "slow", factor: 0.5, duration: 2.0 },
        { kind: "poison", dps: 80, duration: 4 },
      ],
      blurb: "Slow + heavy burn nearby.",
      targeting: "all",
    },
    visualGem: "topaz",
  },
];

const COMBO_BY_KEY = new Map(COMBOS.map((c) => [sortKey(c.inputs), c]));

/** Find a recipe matching the given inputs (any order). Strict exact match on (gem, quality). */
export function findCombo(inputs: ComboInput[]): ComboRecipe | null {
  return COMBO_BY_KEY.get(sortKey(inputs)) ?? null;
}
