/**
 * Multi-gem combination recipes.
 *
 * Each recipe demands an exact set of (gem, quality) tuples. Match key is
 * sorted "gem:quality" tuples joined by '+'. Quality words from recipes.md:
 *   Chipped=1, Flawed=2, Normal=3, Flawless=4, Perfect=5.
 */

import { GemType, Quality } from "../render/theme";
import type { EffectKind, Targeting } from "./gems";
import { RUNES_ENABLED } from "../game/constants";

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
  /** 'trap' combos don't block pathing and trigger when creeps walk over them. */
  type?: "trap";
}

const sortKey = (xs: ComboInput[]): string =>
  xs
    .map((i) => `${i.gem}:${i.quality}`)
    .sort()
    .join("+");

const ALL_COMBOS: ComboRecipe[] = [
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
      effects: [{ kind: "aura_dmg", radius: 4.0, pct: 0.3 }],
      blurb: "+30% dmg to nearby towers.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Void Opal",
        cost: 300,
        stats: {
          dmgMin: 120,
          dmgMax: 180,
          range: 4.5,
          atkSpeed: 1.0,
          effects: [
            { kind: "aura_dmg", radius: 4.5, pct: 0.35 },
            { kind: "vulnerability_aura", radius: 4.5, pct: 0.2 },
          ],
          blurb: "+35% dmg aura + 20% vulnerability aura.",
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
      dmgMin: 250,
      dmgMax: 380,
      range: 3.5,
      atkSpeed: 1.2,
      effects: [
        {
          kind: "eruption",
          threshold: 8,
          damage: 1200,
          radius: 3.5,
          falloff: 0.4,
        },
      ],
      blurb: "Eruption every 8 hits: 1200 AoE in r=3.5.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Ancient Bloodstone",
        cost: 310,
        stats: {
          dmgMin: 290,
          dmgMax: 440,
          range: 3.5,
          atkSpeed: 1.3,
          effects: [
            {
              kind: "eruption",
              threshold: 6,
              damage: 1800,
              radius: 3.5,
              falloff: 0.35,
              afterburnDps: 100,
              afterburnDuration: 3,
            },
          ],
          blurb: "Eruption every 6 hits: 1800 AoE r=3.5. Afterburn 100/s 3s.",
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
      effects: [
        { kind: "stun", chance: 0.175, duration: 1.0 },
        { kind: "stun_bonus_dmg", multiplier: 1.5 },
      ],
      blurb: "17.5% stun 1s. 1.5x dmg to stunned.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Venomous Emerald",
        cost: 250,
        stats: {
          dmgMin: 220,
          dmgMax: 340,
          range: 4.75,
          atkSpeed: 1.2,
          effects: [
            { kind: "stun", chance: 0.23, duration: 2.0 },
            { kind: "stun_bonus_dmg", multiplier: 1.5 },
            { kind: "poison", dps: 340, duration: 5 },
            { kind: "death_spread", count: 5, radius: 2 },
          ],
          blurb:
            "23% stun. 1.5x dmg to stunned. Poison 340/s 5s. Plague on death.",
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
      dmgMax: 310,
      range: 4.0,
      atkSpeed: 1.0,
      effects: [
        { kind: "crit", chance: 0.25, multiplier: 3.0 },
        { kind: "armor_reduce", value: 5, duration: 5 },
      ],
      blurb: "25% crit. -5 armor on hit for 5s.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Pharaoh's Gold",
        cost: 210,
        stats: {
          dmgMin: 280,
          dmgMax: 440,
          range: 4.0,
          atkSpeed: 1.0,
          effects: [
            { kind: "crit", chance: 0.18, multiplier: 2.5 },
            { kind: "crit_splash", radius: 1.5, falloff: 0.5 },
            {
              kind: "prox_armor_reduce",
              radius: 4.0,
              value: 6,
              targets: "ground",
            },
          ],
          blurb: "18% crit ×2.5. Crit splashes. -6 armor to ground.",
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
            { kind: "poison", dps: 35, duration: 3 },
            { kind: "slow", factor: 0.5, duration: 3.0 },
          ],
          blurb: "Poison 35 dps for 3s. 50% slow.",
          targeting: "all",
        },
      },
      {
        name: "Lucky Asian Jade",
        cost: 280,
        stats: {
          dmgMin: 257,
          dmgMax: 385,
          range: 4.25,
          atkSpeed: 1.3,
          effects: [
            { kind: "poison", dps: 75, duration: 4 },
            { kind: "slow", factor: 0.5, duration: 4.0 },
            { kind: "crit", chance: 0.12, multiplier: 6.0 },
            { kind: "stun", chance: 0.08, duration: 2.0 },
            { kind: "bonus_gold", chance: 0.01, multiplier: 3 },
          ],
          blurb:
            "Poison 75 dps 4s. 50% slow. Lucky crits, stuns, and 1% ×3 bonus gold on hit.",
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
      dmgMin: 19,
      dmgMax: 26,
      range: 3.5,
      atkSpeed: 1.4,
      effects: [{ kind: "multi_target", count: 3 }],
      blurb: "Attacks 3 enemies at once.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Vivid Malachite",
        cost: 25,
        stats: {
          dmgMin: 33,
          dmgMax: 51,
          range: 3.75,
          atkSpeed: 1.5,
          effects: [{ kind: "multi_target", count: 3 }],
          blurb: "Attacks 3 enemies at once.",
          targeting: "all",
        },
      },
      {
        name: "Mighty Malachite",
        cost: 280,
        stats: {
          dmgMin: 81,
          dmgMax: 116,
          range: 4.5,
          atkSpeed: 1.8,
          effects: [{ kind: "multi_target", count: 99 }],
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
      dmgMin: 250,
      dmgMax: 350,
      range: 4.0,
      atkSpeed: 1.0,
      effects: [{ kind: "crit", chance: 0.1, multiplier: 5.0 }],
      blurb: "10% chance for x5 crit. Ground only.",
      targeting: "ground",
    },
    upgrades: [
      {
        name: "Living Diamond",
        cost: 300,
        stats: {
          dmgMin: 300,
          dmgMax: 470,
          range: 4.5,
          atkSpeed: 1.1,
          effects: [
            { kind: "crit", chance: 0.09, multiplier: 6 },
            { kind: "focus_crit", pctPerHit: 0.06, maxBonus: 0.18 },
            { kind: "execute", dmgBonus: 0.4, hpThreshold: 0.25 },
          ],
          blurb: "9% crit ×6. Focus: +6% crit/hit. Execute below 25% HP.",
          targeting: "ground",
        },
      },
    ],
    visualGem: "diamond",
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
      dmgMin: 34,
      dmgMax: 37,
      range: 3.5,
      atkSpeed: 1.5,
      effects: [
        { kind: "splash", radius: 1.2, falloff: 0.5 },
        { kind: "slow", factor: 0.75, duration: 1.5 },
      ],
      blurb: "Splash slow 25%.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Frosted Silver",
        cost: 25,
        stats: {
          dmgMin: 40,
          dmgMax: 54,
          range: 3.75,
          atkSpeed: 1.1,
          effects: [
            { kind: "splash", radius: 1.5, falloff: 0.5 },
            { kind: "slow", factor: 0.72, duration: 1.5 },
            { kind: "freeze_chance", chance: 0.1, duration: 0.8 },
          ],
          blurb: "Splash slow. 10% freeze chance.",
          targeting: "all",
        },
      },
      {
        name: "Silver Knight",
        cost: 300,
        stats: {
          dmgMin: 250,
          dmgMax: 290,
          range: 4.0,
          atkSpeed: 1.0,
          effects: [
            { kind: "splash", radius: 1.8, falloff: 0.5 },
            { kind: "slow", factor: 0.55, duration: 2.0 },
            { kind: "periodic_nova", everyN: 10 },
          ],
          blurb: "Wide splash. 45% slow. Nova every 10th attack.",
          targeting: "all",
        },
      },
    ],
    visualGem: "sapphire",
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
      dmgMin: 0,
      dmgMax: 0,
      range: 2.275,
      atkSpeed: 1.0,
      effects: [{ kind: "prox_burn", dps: 34, radius: 2.275 }],
      blurb: "Burns all enemies within range for 34/s.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Plasma Star",
        cost: 30,
        stats: {
          dmgMin: 0,
          dmgMax: 0,
          range: 2.4375,
          atkSpeed: 1.0,
          effects: [
            {
              kind: "prox_burn_ramp",
              dps: 36,
              radius: 2.4375,
              rampPct: 0.08,
              rampCap: 0.8,
            },
          ],
          blurb: "Burn ramps +8%/s, up to +80%.",
          targeting: "all",
        },
      },
      {
        name: "Solar Core",
        cost: 290,
        stats: {
          dmgMin: 0,
          dmgMax: 0,
          range: 2.6,
          atkSpeed: 1.0,
          effects: [
            {
              kind: "prox_burn_ramp",
              dps: 105,
              radius: 2.6,
              rampPct: 0.12,
              rampCap: 1.5,
            },
            { kind: "armor_pierce_burn" },
            { kind: "death_nova", hpPct: 0.08, radius: 1.5 },
          ],
          blurb: "Burn ramps +12%/s. Ignores armor. Death nova 8% HP.",
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
      { gem: "topaz", quality: 4 },
      { gem: "ruby", quality: 4 },
    ],
    stats: {
      dmgMin: 120,
      dmgMax: 180,
      range: 4.0,
      atkSpeed: 1.0,
      effects: [
        { kind: "splash", radius: 2.0, falloff: 0.5 },
        { kind: "slow", factor: 0.75, duration: 2.5 },
      ],
      blurb: "Huge AoE slow 25% for 2.5s.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Blizzard Sapphire",
        cost: 210,
        stats: {
          dmgMin: 200,
          dmgMax: 300,
          range: 4.25,
          atkSpeed: 0.9,
          effects: [
            { kind: "splash", radius: 2.0, falloff: 0.5 },
            { kind: "slow", factor: 0.6, duration: 2.5 },
            { kind: "periodic_freeze", interval: 3, duration: 0.5 },
            { kind: "frostbite", speedThreshold: 0.4, dmgBonus: 0.3 },
          ],
          blurb: "AoE slow. Periodic freeze. Frostbite: +30% dmg to slowed.",
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
      { gem: "emerald", quality: 4 },
      { gem: "amethyst", quality: 2 },
      { gem: "ruby", quality: 3 },
    ],
    stats: {
      dmgMin: 68,
      dmgMax: 128,
      range: 5.0,
      atkSpeed: 0.72,
      effects: [{ kind: "demote_air", everyN: 13 }],
      blurb: "Every 13th hit grounds air units.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Red Crystal Facet",
        cost: 100,
        stats: {
          dmgMin: 136,
          dmgMax: 213,
          range: 6.5,
          atkSpeed: 0.72,
          effects: [{ kind: "demote_air", everyN: 12 }],
          blurb: "Every 12th hit grounds air units.",
          targeting: "all",
        },
      },
      {
        name: "Rose Quartz Crystal",
        cost: 100,
        stats: {
          dmgMin: 204,
          dmgMax: 255,
          range: 8.0,
          atkSpeed: 0.72,
          effects: [{ kind: "demote_air", everyN: 11 }],
          blurb: "Every 11th hit grounds air units.",
          targeting: "all",
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
      { gem: "opal", quality: 4 },
      { gem: "emerald", quality: 2 },
      { gem: "aquamarine", quality: 2 },
    ],
    stats: {
      dmgMin: 120,
      dmgMax: 200,
      range: 4.25,
      atkSpeed: 0.75,
      effects: [
        {
          kind: "prox_armor_reduce",
          radius: 4.25,
          value: 4,
          targets: "ground",
        },
        { kind: "splash", radius: 1.5, falloff: 0.5, chance: 0.33 },
      ],
      blurb: "-4 armor to ground in range. 33% frost nova.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Ancient Paraiba",
        cost: 350,
        stats: {
          dmgMin: 360,
          dmgMax: 500,
          range: 4.5,
          atkSpeed: 0.6,
          effects: [
            { kind: "splash", radius: 2.0, falloff: 0.5, chance: 1.0 },
            {
              kind: "stacking_armor_reduce",
              perHit: 3,
              maxStacks: 8,
              decayInterval: 3,
            },
            { kind: "prox_slow", factor: 0.85, radius: 4.5 },
          ],
          blurb:
            "100% splash. Stacking armor shred -3/hit (max 8). Proximity slow.",
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
      dmgMin: 0,
      dmgMax: 0,
      range: 4.5,
      atkSpeed: 1.0,
      effects: [
        { kind: "prox_burn", dps: 95, radius: 4.5 },
        { kind: "prox_slow", factor: 0.55, radius: 4.5 },
      ],
      blurb: "Burns enemies for 95/s and slows 45% within range.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Uranium 235",
        cost: 190,
        stats: {
          dmgMin: 0,
          dmgMax: 0,
          range: 4.75,
          atkSpeed: 1.0,
          effects: [
            { kind: "prox_burn", dps: 130, radius: 4.75 },
            { kind: "prox_slow", factor: 0.5, radius: 4.75 },
            {
              kind: "armor_decay_aura",
              armorPerSec: 1,
              radius: 4.75,
              maxReduction: 4,
            },
            { kind: "linger_burn", duration: 2 },
          ],
          blurb: "Burn + slow. Permanent armor decay. Lingering burn.",
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
      dmgMin: 600,
      dmgMax: 800,
      range: 5.5,
      atkSpeed: 2.0,
      effects: [
        { kind: "splash", radius: 1.5, falloff: 0.5 },
        { kind: "crit", chance: 0.15, multiplier: 3.0 },
        { kind: "poison", dps: 500, duration: 4 },
        { kind: "slow", factor: 0.55, duration: 2.5 },
        { kind: "stun", chance: 0.15, duration: 1.2 },
        { kind: "beam_ramp", rampPerHit: 0.15, maxStacks: 25 },
      ],
      blurb: "The ultimate gem.",
      targeting: "all",
    },
    upgrades: [],
    visualGem: "diamond",
  },
  // ─── Runes (traps) ───────────────────────────────────────────────────────
  {
    key: "rune_holding",
    name: "Rune of Holding",
    inputs: [
      { gem: "topaz", quality: 3 },
      { gem: "amethyst", quality: 2 },
      { gem: "sapphire", quality: 2 },
    ],
    stats: {
      dmgMin: 0,
      dmgMax: 0,
      range: 1.0,
      atkSpeed: 0.5,
      effects: [{ kind: "trap_root", duration: 1.5 }],
      blurb: "Stuns creeps that walk over it.",
      targeting: "ground",
    },
    upgrades: [],
    visualGem: "topaz",
    type: "trap",
  },
  {
    key: "rune_damage",
    name: "Rune of Damage",
    inputs: [
      { gem: "diamond", quality: 3 },
      { gem: "opal", quality: 2 },
      { gem: "ruby", quality: 2 },
    ],
    stats: {
      dmgMin: 150,
      dmgMax: 250,
      range: 1.0,
      atkSpeed: 1.8,
      effects: [],
      blurb: "Deals heavy damage to creeps walking over it.",
      targeting: "ground",
    },
    upgrades: [],
    visualGem: "diamond",
    type: "trap",
  },
  {
    key: "rune_teleport",
    name: "Rune of Teleportation",
    inputs: [
      { gem: "aquamarine", quality: 3 },
      { gem: "amethyst", quality: 2 },
      { gem: "diamond", quality: 2 },
    ],
    stats: {
      dmgMin: 0,
      dmgMax: 0,
      range: 1.0,
      atkSpeed: 0.1,
      effects: [{ kind: "trap_knockback", distance: 4 }],
      blurb: "Knocks creeps back along their path.",
      targeting: "ground",
    },
    upgrades: [],
    visualGem: "aquamarine",
    type: "trap",
  },
  {
    key: "rune_slow",
    name: "Rune of Slow",
    inputs: [
      { gem: "sapphire", quality: 3 },
      { gem: "aquamarine", quality: 2 },
      { gem: "diamond", quality: 2 },
      { gem: "emerald", quality: 2 },
    ],
    stats: {
      dmgMin: 0,
      dmgMax: 0,
      range: 1.0,
      atkSpeed: 60,
      effects: [{ kind: "trap_slow", factor: 0.4, duration: 2.0 }],
      blurb: "Slows all creeps that walk over it.",
      targeting: "ground",
    },
    upgrades: [],
    visualGem: "sapphire",
    type: "trap",
  },
];

export const COMBOS: ComboRecipe[] = RUNES_ENABLED
  ? ALL_COMBOS
  : ALL_COMBOS.filter((c) => c.type !== "trap");

const COMBO_BY_KEY = new Map(
  COMBOS.filter((c) => c.inputs.length > 0).map((c) => [sortKey(c.inputs), c]),
);

export const COMBO_BY_NAME = new Map<string, ComboRecipe>(
  COMBOS.map((c) => [c.key, c]),
);

/** Return the recipe that consumes this exact (gem, quality), if any. */
export function findComboFor(
  gem: GemType,
  quality: Quality,
): ComboRecipe | null {
  for (const c of COMBOS) {
    if (c.inputs.some((i) => i.gem === gem && i.quality === quality)) {
      return c;
    }
  }
  return null;
}

export function findAllCombosFor(
  gem: GemType,
  quality: Quality,
): ComboRecipe[] {
  return COMBOS.filter((c) =>
    c.inputs.some((i) => i.gem === gem && i.quality === quality),
  );
}

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
    return COMBO_BY_NAME.get("stargem") ?? null;
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
export function nextUpgrade(
  combo: ComboRecipe,
  tier: number,
): UpgradeTier | null {
  if (tier >= combo.upgrades.length) return null;
  return combo.upgrades[tier];
}
