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

export interface ComboStats {
  dmgMin: number;
  dmgMax: number;
  range: number;
  atkSpeed: number;
  effects: EffectKind[];
  blurb: string;
  targeting: Targeting;
}

export interface UpgradeTier {
  name: string;
  cost: number;
  stats: ComboStats;
}

export interface ComboRecipe {
  key: string;
  name: string;
  inputs: ComboInput[];
  stats: ComboStats;
  upgrades: UpgradeTier[];
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
    upgrades: [
      {
        name: "Mystic Black Opal",
        cost: 300,
        stats: {
          dmgMin: 140,
          dmgMax: 200,
          range: 4.5,
          atkSpeed: 1.0,
          effects: [{ kind: "aura_atkspeed", radius: 3.0, pct: 0.4 }],
          blurb: "+40% atk speed aura. Wider radius.",
          targeting: "all",
        },
      },
    ],
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
    upgrades: [
      {
        name: "Ancient Bloodstone",
        cost: 310,
        stats: {
          dmgMin: 400,
          dmgMax: 620,
          range: 4.0,
          atkSpeed: 1.0,
          effects: [
            { kind: "splash", radius: 2.5, falloff: 0.5 },
            { kind: "poison", dps: 150, duration: 4 },
            { kind: "crit", chance: 0.15, multiplier: 3.0 },
          ],
          blurb: "Massive splash + burn. 15% crit x3.",
          targeting: "all",
        },
      },
    ],
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
    upgrades: [
      {
        name: "Enchanted Emerald",
        cost: 250,
        stats: {
          dmgMin: 280,
          dmgMax: 450,
          range: 4.75,
          atkSpeed: 1.2,
          effects: [
            { kind: "stun", chance: 0.15, duration: 2.0 },
            { kind: "crit", chance: 0.15, multiplier: 4.0 },
          ],
          blurb: "15% stun for 2s. 15% crit x4.",
          targeting: "all",
        },
      },
    ],
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
    upgrades: [
      {
        name: "Egyptian Gold",
        cost: 210,
        stats: {
          dmgMin: 300,
          dmgMax: 480,
          range: 4.0,
          atkSpeed: 1.1,
          effects: [{ kind: "crit", chance: 0.3, multiplier: 3.5 }],
          blurb: "30% crit for x3.5 damage.",
          targeting: "all",
        },
      },
    ],
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
    upgrades: [
      {
        name: "Asian Jade",
        cost: 45,
        stats: {
          dmgMin: 80,
          dmgMax: 120,
          range: 4.0,
          atkSpeed: 1.0,
          effects: [
            { kind: "poison", dps: 50, duration: 3 },
            { kind: "slow", factor: 0.5, duration: 3.0 },
          ],
          blurb: "Poison 50 dps for 3s. 50% slow.",
          targeting: "all",
        },
      },
      {
        name: "Lucky Asian Jade",
        cost: 250,
        stats: {
          dmgMin: 110,
          dmgMax: 150,
          range: 4.25,
          atkSpeed: 1.2,
          effects: [
            { kind: "poison", dps: 60, duration: 4 },
            { kind: "slow", factor: 0.5, duration: 4.0 },
            { kind: "crit", chance: 0.05, multiplier: 4.0 },
            { kind: "stun", chance: 0.01, duration: 2.0 },
          ],
          blurb: "Poison 60 dps 4s. 50% slow. Lucky crits and stuns.",
          targeting: "all",
        },
      },
    ],
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
    upgrades: [
      {
        name: "Vivid Malachite",
        cost: 25,
        stats: {
          dmgMin: 30,
          dmgMax: 46,
          range: 3.75,
          atkSpeed: 1.5,
          effects: [{ kind: "chain", bounces: 3, falloff: 1.0 }],
          blurb: "Attacks 4 enemies at once.",
          targeting: "all",
        },
      },
      {
        name: "Mighty Malachite",
        cost: 280,
        stats: {
          dmgMin: 100,
          dmgMax: 150,
          range: 4.0,
          atkSpeed: 1.6,
          effects: [{ kind: "chain", bounces: 9, falloff: 1.0 }],
          blurb: "Attacks all enemies in range.",
          targeting: "all",
        },
      },
    ],
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
    upgrades: [
      {
        name: "Great Pink Diamond",
        cost: 175,
        stats: {
          dmgMin: 440,
          dmgMax: 680,
          range: 4.75,
          atkSpeed: 1.1,
          effects: [{ kind: "crit", chance: 0.1, multiplier: 8.0 }],
          blurb: "10% chance for x8 crit. Ground only.",
          targeting: "ground",
        },
      },
    ],
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
    upgrades: [
      {
        name: "Sterling Silver",
        cost: 25,
        stats: {
          dmgMin: 42,
          dmgMax: 56,
          range: 3.75,
          atkSpeed: 1.1,
          effects: [
            { kind: "splash", radius: 1.5, falloff: 0.5 },
            { kind: "slow", factor: 0.7, duration: 1.5 },
          ],
          blurb: "AoE splash slow 30%.",
          targeting: "all",
        },
      },
      {
        name: "Silver Knight",
        cost: 300,
        stats: {
          dmgMin: 130,
          dmgMax: 170,
          range: 4.0,
          atkSpeed: 1.1,
          effects: [
            { kind: "splash", radius: 1.8, falloff: 0.5 },
            { kind: "slow", factor: 0.6, duration: 2.0 },
          ],
          blurb: "Wide splash. 40% slow for 2s.",
          targeting: "all",
        },
      },
    ],
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
    upgrades: [
      {
        name: "Blood Star",
        cost: 30,
        stats: {
          dmgMin: 36,
          dmgMax: 52,
          range: 3.75,
          atkSpeed: 1.0,
          effects: [
            { kind: "splash", radius: 1.8, falloff: 0.5 },
            { kind: "poison", dps: 20, duration: 3 },
          ],
          blurb: "Stronger burn. Wider splash.",
          targeting: "all",
        },
      },
      {
        name: "Fire Star",
        cost: 290,
        stats: {
          dmgMin: 110,
          dmgMax: 160,
          range: 4.0,
          atkSpeed: 1.0,
          effects: [
            { kind: "splash", radius: 2.0, falloff: 0.5 },
            { kind: "poison", dps: 40, duration: 4 },
          ],
          blurb: "Devastating burn. Large splash.",
          targeting: "all",
        },
      },
    ],
    visualGem: "ruby",
  },
  {
    key: "yellow_sapphire",
    name: "Yellow Sapphire",
    inputs: [
      { gem: "sapphire", quality: 5 },
      { gem: "sapphire", quality: 4 },
      { gem: "opal", quality: 3 },
    ],
    stats: {
      dmgMin: 80,
      dmgMax: 120,
      range: 4.0,
      atkSpeed: 1.0,
      effects: [
        { kind: "splash", radius: 2.0, falloff: 0.5 },
        { kind: "slow", factor: 0.8, duration: 2.0 },
      ],
      blurb: "Huge AoE slow.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Star Yellow Sapphire",
        cost: 210,
        stats: {
          dmgMin: 150,
          dmgMax: 210,
          range: 4.25,
          atkSpeed: 0.8,
          effects: [
            { kind: "splash", radius: 2.0, falloff: 0.5 },
            { kind: "slow", factor: 0.8, duration: 2.0 },
            { kind: "aura_dmg", radius: 3.0, pct: 0.05 },
          ],
          blurb: "Huge AoE slow. +5% damage to nearby towers.",
          targeting: "all",
        },
      },
    ],
    visualGem: "sapphire",
  },
  {
    key: "red_crystal",
    name: "Red Crystal",
    inputs: [
      { gem: "amethyst", quality: 5 },
      { gem: "amethyst", quality: 4 },
      { gem: "ruby", quality: 3 },
    ],
    stats: {
      dmgMin: 80,
      dmgMax: 150,
      range: 5.0,
      atkSpeed: 0.8,
      effects: [
        { kind: "prox_armor_reduce", radius: 3.5, value: 5, targets: "air" },
      ],
      blurb: "-5 armor to air in range. Air only.",
      targeting: "air",
    },
    upgrades: [
      {
        name: "Red Crystal Facet",
        cost: 100,
        stats: {
          dmgMin: 120,
          dmgMax: 200,
          range: 5.5,
          atkSpeed: 0.8,
          effects: [
            { kind: "prox_armor_reduce", radius: 3.5, value: 6, targets: "air" },
          ],
          blurb: "-6 armor to air in range. Air only.",
          targeting: "air",
        },
      },
      {
        name: "Rose Quartz Crystal",
        cost: 100,
        stats: {
          dmgMin: 160,
          dmgMax: 250,
          range: 6.0,
          atkSpeed: 0.8,
          effects: [
            { kind: "prox_armor_reduce", radius: 4.0, value: 7, targets: "air" },
          ],
          blurb: "-7 armor to air in range. Air only.",
          targeting: "air",
        },
      },
    ],
    visualGem: "amethyst",
  },
  {
    key: "paraiba_tourmaline",
    name: "Paraiba Tourmaline",
    inputs: [
      { gem: "aquamarine", quality: 5 },
      { gem: "emerald", quality: 4 },
      { gem: "sapphire", quality: 3 },
    ],
    stats: {
      dmgMin: 60,
      dmgMax: 200,
      range: 4.25,
      atkSpeed: 0.75,
      effects: [
        { kind: "prox_armor_reduce", radius: 2.5, value: 4, targets: "ground" },
        { kind: "splash", radius: 1.5, falloff: 0.5, chance: 0.33 },
      ],
      blurb: "-4 armor to ground in range. 33% frost nova.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Paraiba Tourmaline Facet",
        cost: 350,
        stats: {
          dmgMin: 200,
          dmgMax: 400,
          range: 4.5,
          atkSpeed: 0.6,
          effects: [
            { kind: "prox_armor_reduce", radius: 2.5, value: 6, targets: "ground" },
            { kind: "splash", radius: 1.5, falloff: 0.5, chance: 0.33 },
          ],
          blurb: "-6 armor to ground in range. 33% frost nova.",
          targeting: "all",
        },
      },
    ],
    visualGem: "aquamarine",
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
    upgrades: [
      {
        name: "Uranium 238",
        cost: 190,
        stats: {
          dmgMin: 340,
          dmgMax: 520,
          range: 4.75,
          atkSpeed: 1.0,
          effects: [
            { kind: "splash", radius: 2.5, falloff: 0.6 },
            { kind: "slow", factor: 0.5, duration: 3.0 },
            { kind: "poison", dps: 120, duration: 5 },
          ],
          blurb: "Intense slow + burn. Wider splash.",
          targeting: "all",
        },
      },
    ],
    visualGem: "topaz",
  },
  {
    key: "stargem",
    name: "Stargem",
    inputs: [],
    stats: {
      dmgMin: 500,
      dmgMax: 2500,
      range: 5.5,
      atkSpeed: 0.5,
      effects: [{ kind: "crit", chance: 0.25, multiplier: 4.0 }],
      blurb: "A stone of pure damage.",
      targeting: "all",
    },
    upgrades: [],
    visualGem: "diamond",
  },
];

const COMBO_BY_KEY = new Map(
  COMBOS.filter((c) => c.inputs.length > 0).map((c) => [sortKey(c.inputs), c]),
);

/** Find a recipe matching the given inputs (any order). Strict exact match on (gem, quality). */
export function findCombo(inputs: ComboInput[]): ComboRecipe | null {
  const standard = COMBO_BY_KEY.get(sortKey(inputs));
  if (standard) return standard;

  // Stargem: 4× same gem at Perfect quality
  if (
    inputs.length === 4 &&
    inputs.every((i) => i.quality === 5) &&
    inputs.every((i) => i.gem === inputs[0].gem)
  ) {
    return COMBOS.find((c) => c.key === "stargem") ?? null;
  }

  return null;
}

/** Resolve the effective stats for a combo at a given upgrade tier (0 = base). */
export function comboStatsAtTier(combo: ComboRecipe, tier: number): ComboStats {
  if (tier <= 0 || combo.upgrades.length === 0) return combo.stats;
  const idx = Math.min(tier - 1, combo.upgrades.length - 1);
  return combo.upgrades[idx].stats;
}

/** Return the next available upgrade for a combo at the given tier, or null if maxed. */
export function nextUpgrade(combo: ComboRecipe, tier: number): UpgradeTier | null {
  if (tier >= combo.upgrades.length) return null;
  return combo.upgrades[tier];
}
