/**
 * Multi-gem combination recipes.
 *
 * Each recipe demands an exact set of (gem, quality) tuples. Match key is
 * sorted "gem:quality" tuples joined by '+'. Quality words from recipes.md:
 *   Chipped=1, Flawed=2, Normal=3, Flawless=4, Perfect=5.
 *
 * Ordered by tier: highest max-quality first, then descending by quality sum.
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
  // ─── Q5 recipes (descending by quality sum) ─────────────────────────────
  {
    key: "paraiba_tourmaline",
    name: "Paraiba Tourmaline",
    inputs: [
      { gem: "aquamarine", quality: 5 },
      { gem: "topaz", quality: 4 },
      { gem: "opal", quality: 4 },
      { gem: "emerald", quality: 2 },
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
        cost: 400,
        stats: {
          dmgMin: 330,
          dmgMax: 470,
          range: 4.5,
          atkSpeed: 0.7,
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
    key: "black_opal",
    name: "Black Opal",
    inputs: [
      { gem: "opal", quality: 5 },
      { gem: "carnelian", quality: 4 },
      { gem: "diamond", quality: 4 },
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
      { gem: "garnet", quality: 4 },
      { gem: "aquamarine", quality: 3 },
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
          dmgMin: 270,
          dmgMax: 410,
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
    key: "gold",
    name: "Gold",
    inputs: [
      { gem: "amethyst", quality: 5 },
      { gem: "spinel", quality: 4 },
      { gem: "ruby", quality: 3 },
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
          blurb: "18% crit x2.5. Crit splashes. -6 armor to ground.",
          targeting: "all",
        },
      },
    ],
    visualGem: "amethyst",
  },
  {
    key: "pink_diamond",
    name: "Pink Diamond",
    inputs: [
      { gem: "diamond", quality: 5 },
      { gem: "ruby", quality: 4 },
      { gem: "spinel", quality: 3 },
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
          blurb: "9% crit x6. Focus: +6% crit/hit. Execute below 25% HP.",
          targeting: "ground",
        },
      },
    ],
    visualGem: "diamond",
  },
  {
    key: "ametrine",
    name: "Raw Ametrine",
    inputs: [
      { gem: "carnelian", quality: 5 },
      { gem: "amethyst", quality: 4 },
      { gem: "sapphire", quality: 2 },
    ],
    stats: {
      dmgMin: 80,
      dmgMax: 130,
      range: 4.0,
      atkSpeed: 0.8,
      effects: [
        {
          kind: "adaptive_mode",
          threshold: 5,
          scatterCount: 5,
          scatterDmgMult: 0.7,
          modeCooldown: 1.0,
        },
      ],
      blurb: "Adapts: focus vs scatter based on creep count.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Imperial Ametrine",
        cost: 120,
        stats: {
          dmgMin: 210,
          dmgMax: 330,
          range: 4.5,
          atkSpeed: 0.9,
          effects: [
            {
              kind: "adaptive_mode",
              threshold: 5,
              scatterCount: 6,
              scatterDmgMult: 1.0,
              modeCooldown: 1.0,
            },
          ],
          blurb: "Enhanced adaptive modes.",
          targeting: "all",
        },
      },
      {
        name: "Ametrine Sovereign",
        cost: 320,
        stats: {
          dmgMin: 255,
          dmgMax: 400,
          range: 5.0,
          atkSpeed: 1.0,
          effects: [
            {
              kind: "adaptive_mode",
              threshold: 5,
              scatterCount: 8,
              scatterDmgMult: 1.05,
              modeCooldown: 1.0,
            },
            { kind: "execute", dmgBonus: 0.35, hpThreshold: 0.25 },
          ],
          blurb: "Adaptive master. Execute in focus mode.",
          targeting: "all",
        },
      },
    ],
    visualGem: "amethyst",
  },
  {
    key: "dark_emerald",
    name: "Dark Emerald",
    inputs: [
      { gem: "emerald", quality: 5 },
      { gem: "garnet", quality: 3 },
      { gem: "topaz", quality: 3 },
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
        cost: 300,
        stats: {
          dmgMin: 200,
          dmgMax: 300,
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
    key: "thunderstone",
    name: "Thunderstone",
    inputs: [
      { gem: "garnet", quality: 5 },
      { gem: "emerald", quality: 4 },
      { gem: "topaz", quality: 2 },
    ],
    stats: {
      dmgMin: 80,
      dmgMax: 120,
      range: 4.0,
      atkSpeed: 0.8,
      effects: [{ kind: "amplifying_chain", bounces: 3, ampPerBounce: 0.3 }],
      blurb: "Chain bounces hit harder each jump.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Storm Crown",
        cost: 360,
        stats: {
          dmgMin: 125,
          dmgMax: 185,
          range: 4.5,
          atkSpeed: 0.9,
          effects: [
            { kind: "amplifying_chain", bounces: 4, ampPerBounce: 0.4 },
          ],
          blurb: "Amplifying chain - bounces hit harder each jump.",
          targeting: "all",
        },
      },
    ],
    visualGem: "garnet",
  },
  {
    key: "uranium",
    name: "Uranium",
    inputs: [
      { gem: "topaz", quality: 5 },
      { gem: "carnelian", quality: 3 },
      { gem: "opal", quality: 3 },
    ],
    stats: {
      dmgMin: 0,
      dmgMax: 0,
      range: 4.5,
      atkSpeed: 1.0,
      effects: [
        { kind: "prox_burn", dps: 80, radius: 4.5 },
        { kind: "prox_slow", factor: 0.55, radius: 4.5 },
      ],
      blurb: "Burns enemies for 80/s and slows 45% within range.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Uranium 235",
        cost: 340,
        stats: {
          dmgMin: 0,
          dmgMax: 0,
          range: 4.75,
          atkSpeed: 1.0,
          effects: [
            { kind: "prox_burn", dps: 115, radius: 4.75 },
            { kind: "prox_slow", factor: 0.5, radius: 4.75 },
            {
              kind: "armor_decay_aura",
              armorPerSec: 0.75,
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
    key: "yellow_sapphire",
    name: "Yellow Sapphire",
    inputs: [
      { gem: "sapphire", quality: 5 },
      { gem: "aquamarine", quality: 4 },
      { gem: "carnelian", quality: 2 },
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
    key: "tigers_eye",
    name: "Tiger's Eye",
    inputs: [
      { gem: "spinel", quality: 5 },
      { gem: "amethyst", quality: 2 },
      { gem: "diamond", quality: 2 },
    ],
    stats: {
      dmgMin: 160,
      dmgMax: 280,
      range: 7.0,
      atkSpeed: 0.5,
      effects: [{ kind: "distance_scaling", minMult: 0.5, maxMult: 2.2 }],
      blurb: "More damage the farther the target.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Dragon's Eye",
        cost: 300,
        stats: {
          dmgMin: 200,
          dmgMax: 350,
          range: 8.0,
          atkSpeed: 0.6,
          effects: [
            { kind: "distance_scaling", minMult: 0.4, maxMult: 2.5 },
            { kind: "pierce", count: 1 },
          ],
          blurb: "Devastating at range. Shots pierce.",
          targeting: "all",
        },
      },
    ],
    visualGem: "spinel",
  },

  // ─── Q4 recipes ─────────────────────────────────────────────────────────
  {
    key: "red_crystal",
    name: "Red Crystal",
    inputs: [
      { gem: "sapphire", quality: 4 },
      { gem: "amethyst", quality: 3 },
      { gem: "spinel", quality: 2 },
    ],
    stats: {
      dmgMin: 85,
      dmgMax: 160,
      range: 5.0,
      atkSpeed: 0.72,
      effects: [
        { kind: "demote_air", everyN: 12 },
        { kind: "true_vs_air" },
      ],
      blurb: "True damage vs air. Every 12th hit grounds air units.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Red Crystal Facet",
        cost: 100,
        stats: {
          dmgMin: 170,
          dmgMax: 266,
          range: 6.5,
          atkSpeed: 0.72,
          effects: [
            { kind: "demote_air", everyN: 11 },
            { kind: "true_vs_air" },
          ],
          blurb: "True damage vs air. Every 11th hit grounds air units.",
          targeting: "all",
        },
      },
      {
        name: "Rose Quartz Crystal",
        cost: 100,
        stats: {
          dmgMin: 255,
          dmgMax: 319,
          range: 8.0,
          atkSpeed: 0.72,
          effects: [
            { kind: "demote_air", everyN: 10 },
            { kind: "true_vs_air" },
          ],
          blurb: "True damage vs air. Every 10th hit grounds air units.",
          targeting: "all",
        },
      },
    ],
    visualGem: "amethyst",
  },

  // ─── Q3 recipes ─────────────────────────────────────────────────────────
  {
    key: "jade",
    name: "Jade",
    inputs: [
      { gem: "sapphire", quality: 3 },
      { gem: "emerald", quality: 3 },
      { gem: "opal", quality: 2 },
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
          dmgMin: 110,
          dmgMax: 160,
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
            "Poison 75 dps 4s. 50% slow. Lucky crits, stuns, and 1% x3 bonus gold on hit.",
          targeting: "all",
        },
      },
    ],
    visualGem: "emerald",
  },
  {
    key: "golden_beryl",
    name: "Golden Beryl",
    inputs: [
      { gem: "diamond", quality: 3 },
      { gem: "garnet", quality: 2 },
      { gem: "aquamarine", quality: 2 },
    ],
    stats: {
      dmgMin: 0,
      dmgMax: 0,
      range: 3.5,
      atkSpeed: 1.0,
      effects: [{ kind: "speed_damage_aura", dps: 30, radius: 3.5 }],
      blurb: "Aura damages creeps based on their speed.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Radiant Beryl",
        cost: 80,
        stats: {
          dmgMin: 0,
          dmgMax: 0,
          range: 4.0,
          atkSpeed: 1.0,
          effects: [{ kind: "speed_damage_aura", dps: 65, radius: 4.0 }],
          blurb: "Stronger speed-reactive aura.",
          targeting: "all",
        },
      },
      {
        name: "Prismatic Beryl",
        cost: 250,
        stats: {
          dmgMin: 0,
          dmgMax: 0,
          range: 4.5,
          atkSpeed: 1.0,
          effects: [{ kind: "speed_damage_aura", dps: 120, radius: 4.5 }],
          blurb: "Intense prismatic aura shreds fast creeps.",
          targeting: "all",
        },
      },
    ],
    visualGem: "carnelian",
  },

  // ─── Q2 recipes ─────────────────────────────────────────────────────────
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
        cost: 100,
        stats: {
          dmgMin: 0,
          dmgMax: 0,
          range: 2.8,
          atkSpeed: 1.0,
          effects: [
            {
              kind: "prox_burn_ramp",
              dps: 250,
              radius: 2.8,
              rampPct: 0.1,
              rampCap: 1.2,
            },
          ],
          blurb: "Burn ramps +10%/s, up to +120%.",
          targeting: "all",
        },
      },
      {
        name: "Solar Core",
        cost: 290,
        stats: {
          dmgMin: 0,
          dmgMax: 0,
          range: 2.8,
          atkSpeed: 1.0,
          effects: [
            {
              kind: "prox_burn_ramp",
              dps: 275,
              radius: 2.8,
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

  // ─── Q1 recipes (R1 starters) ──────────────────────────────────────────
  {
    key: "malachite",
    name: "Malachite",
    inputs: [
      { gem: "opal", quality: 1 },
      { gem: "emerald", quality: 1 },
      { gem: "topaz", quality: 1 },
    ],
    stats: {
      dmgMin: 28,
      dmgMax: 37,
      range: 3.5,
      atkSpeed: 1.4,
      effects: [{ kind: "multi_target", count: 3 }],
      blurb: "Attacks 3 enemies at once.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Vivid Malachite",
        cost: 75,
        stats: {
          dmgMin: 93,
          dmgMax: 140,
          range: 4.0,
          atkSpeed: 1.6,
          effects: [{ kind: "multi_target", count: 6 }],
          blurb: "Attacks 6 enemies at once.",
          targeting: "all",
        },
      },
      {
        name: "Mighty Malachite",
        cost: 250,
        stats: {
          dmgMin: 68,
          dmgMax: 96,
          range: 4.5,
          atkSpeed: 1.7,
          effects: [{ kind: "multi_target", count: 99 }],
          blurb: "Attacks all enemies in range.",
          targeting: "all",
        },
      },
    ],
    visualGem: "emerald",
  },
  {
    key: "pyrite",
    name: "Pyrite",
    inputs: [
      { gem: "carnelian", quality: 1 },
      { gem: "spinel", quality: 1 },
      { gem: "aquamarine", quality: 1 },
    ],
    stats: {
      dmgMin: 32,
      dmgMax: 40,
      range: 5.5,
      atkSpeed: 0.65,
      effects: [
        { kind: "momentum", maxStacks: 15, rampSpeed: 4.5, rampDmg: 1.5 },
      ],
      blurb: "Slow start. Builds momentum - faster and harder each shot.",
      targeting: "all",
    },
    upgrades: [
      {
        name: "Molten Pyrite",
        cost: 100,
        stats: {
          dmgMin: 72,
          dmgMax: 92,
          range: 5.5,
          atkSpeed: 0.5,
          effects: [
            { kind: "momentum", maxStacks: 15, rampSpeed: 4.5, rampDmg: 1.55 },
          ],
          blurb: "Momentum ramps speed and damage (+55% at max).",
          targeting: "all",
        },
      },
      {
        name: "Pyroclast",
        cost: 280,
        stats: {
          dmgMin: 70,
          dmgMax: 95,
          range: 5.5,
          atkSpeed: 0.55,
          effects: [
            { kind: "momentum", maxStacks: 15, rampSpeed: 4.5, rampDmg: 1.75 },
            { kind: "pierce", count: 1 },
            { kind: "kill_explode", radius: 1.0, falloff: 0.4 },
          ],
          blurb: "Max momentum: pierce + kill explosions.",
          targeting: "all",
        },
      },
    ],
    visualGem: "spinel",
  },
  {
    key: "silver",
    name: "Silver",
    inputs: [
      { gem: "sapphire", quality: 1 },
      { gem: "garnet", quality: 1 },
      { gem: "diamond", quality: 1 },
    ],
    stats: {
      dmgMin: 42,
      dmgMax: 45,
      range: 3.5,
      atkSpeed: 1.56,
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
        cost: 110,
        stats: {
          dmgMin: 185,
          dmgMax: 245,
          range: 3.75,
          atkSpeed: 1.35,
          effects: [
            { kind: "splash", radius: 1.5, falloff: 0.5 },
            { kind: "slow", factor: 0.6, duration: 1.5 },
            { kind: "freeze_chance", chance: 0.1, duration: 0.8 },
          ],
          blurb: "Splash slow. 10% freeze chance.",
          targeting: "all",
        },
      },
      {
        name: "Silver Knight",
        cost: 270,
        stats: {
          dmgMin: 185,
          dmgMax: 225,
          range: 4.0,
          atkSpeed: 1.0,
          effects: [
            { kind: "splash", radius: 1.8, falloff: 0.5 },
            { kind: "slow", factor: 0.45, duration: 2.0 },
            { kind: "periodic_nova", everyN: 10 },
          ],
          blurb: "Wide splash. 55% slow. Nova every 10th attack at 50% dmg.",
          targeting: "all",
        },
      },
    ],
    visualGem: "sapphire",
  },

  // ─── Special ────────────────────────────────────────────────────────────
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

/** A placed gem that shares a recipe with a selected draw, grouped by recipe. */
export interface DrawPartnerLink {
  combo: ComboRecipe;
  /** ids of placed gems that fill a *different* input slot of `combo`. */
  partnerTowerIds: number[];
}

/** Minimal placed-gem shape needed to match against recipe inputs. */
export interface PartnerCandidate {
  id: number;
  gem: GemType;
  quality: Quality;
  comboKey?: string;
}

/**
 * Given a selected draw `(gem, quality)` and the gems currently on the board,
 * find which placed gems share a special recipe with it.
 *
 * A placed gem is a "partner" for a recipe when, after the selected draw claims
 * one matching input slot, the placed gem's exact `(gem, quality)` still
 * satisfies one of the recipe's remaining inputs. Matching is strict on quality
 * (recipes demand an exact tier), so a same-type gem at the wrong quality is
 * intentionally not highlighted. Already-combined gems (those carrying a
 * `comboKey`) are finished specials, not raw ingredients, so they're skipped.
 */
export function findDrawPartners(
  gem: GemType,
  quality: Quality,
  towers: readonly PartnerCandidate[],
): DrawPartnerLink[] {
  const raw = towers.filter((t) => !t.comboKey);
  const links: DrawPartnerLink[] = [];
  for (const combo of findAllCombosFor(gem, quality)) {
    // Remaining inputs after the selected draw consumes one matching slot.
    const remaining = combo.inputs.slice();
    const claimIdx = remaining.findIndex(
      (i) => i.gem === gem && i.quality === quality,
    );
    if (claimIdx >= 0) remaining.splice(claimIdx, 1);
    const remainingKeys = new Set(remaining.map((i) => `${i.gem}:${i.quality}`));
    if (remainingKeys.size === 0) continue;
    const partnerTowerIds: number[] = [];
    for (const t of raw) {
      if (remainingKeys.has(`${t.gem}:${t.quality}`)) partnerTowerIds.push(t.id);
    }
    if (partnerTowerIds.length > 0) links.push({ combo, partnerTowerIds });
  }
  return links;
}

/** Flattened unique set of partner ids across every shared recipe. */
export function partnerTowerIdSet(links: readonly DrawPartnerLink[]): Set<number> {
  const ids = new Set<number>();
  for (const l of links) for (const id of l.partnerTowerIds) ids.add(id);
  return ids;
}

/** A special recipe fully completable from the gems in the current draw. */
export interface DrawRecipeMatch {
  combo: ComboRecipe;
  /** slotIds of the draws assigned to this recipe's inputs (one per input). */
  slotIds: number[];
}

/** Minimal draw shape needed to match recipes within the current draw set. */
export interface DrawSlotCandidate {
  slotId: number;
  gem: GemType;
  quality: Quality;
}

/**
 * Find every special recipe whose entire ingredient list can be satisfied using
 * only gems present in the current draw set. Matching is strict on (gem,
 * quality) and consumes each draw at most once, so a recipe needing two
 * identical inputs requires two matching draws. Open recipes with no fixed
 * input list (the Stargem) are skipped.
 */
export function findCompletableDrawRecipes(
  draws: readonly DrawSlotCandidate[],
): DrawRecipeMatch[] {
  // Available draw slotIds grouped by exact `(gem:quality)` key.
  const pool = new Map<string, number[]>();
  for (const d of draws) {
    const k = `${d.gem}:${d.quality}`;
    const list = pool.get(k);
    if (list) list.push(d.slotId);
    else pool.set(k, [d.slotId]);
  }
  const matches: DrawRecipeMatch[] = [];
  for (const combo of COMBOS) {
    if (combo.inputs.length === 0) continue; // open recipe (Stargem)
    const need = new Map<string, number>();
    for (const i of combo.inputs) {
      const k = `${i.gem}:${i.quality}`;
      need.set(k, (need.get(k) ?? 0) + 1);
    }
    let ok = true;
    const slotIds: number[] = [];
    for (const [k, n] of need) {
      const avail = pool.get(k);
      if (!avail || avail.length < n) {
        ok = false;
        break;
      }
      slotIds.push(...avail.slice(0, n));
    }
    if (ok) matches.push({ combo, slotIds });
  }
  return matches;
}

/** Flattened set of draw slotIds participating in any completable recipe. */
export function completableDrawSlotSet(
  matches: readonly DrawRecipeMatch[],
): Set<number> {
  const ids = new Set<number>();
  for (const m of matches) for (const id of m.slotIds) ids.add(id);
  return ids;
}

/** Find a recipe matching the given inputs (any order). Strict exact match on (gem, quality). */
export function findCombo(inputs: ComboInput[]): ComboRecipe | null {
  const standard = COMBO_BY_KEY.get(sortKey(inputs));
  if (standard) return standard;

  // Stargem: 4x same gem at Perfect quality
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
