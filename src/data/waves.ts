/**
 * Full wave list. 70 waves. Waves 1-9 are single-type introductions.
 * Wave 11 introduces healers, wave 21 introduces tunnelers.
 * From wave 21 on, both specials mix in with increasing prominence.
 * Some waves throughout remain single-type for variety.
 * Boss waves are at 10 / 20 / 30 / 40 / 50 / 60 / 70.
 * Starting at wave 30, bosses are accompanied by auxiliary healers.
 */

import type { CreepKind } from "./creeps";

export interface PayloadGroup {
  kind: CreepKind;
  count: number;
  hp: number;
  bounty: number;
  slowResist?: number;
  armor?: number;
  payload?: PayloadGroup[];
}

export interface WaveGroup {
  kind: CreepKind;
  count: number;
  /** Base HP per creep, before archetype multiplier. */
  hp: number;
  /** Bounty per kill. */
  bounty: number;
  /** 0–1. Fraction of slow effect negated (0 = full slow, 1 = immune). */
  slowResist: number;
  /** Numeric armor. Overrides archetype defaultArmor if present. */
  armor?: number;
  /** Creeps spawned when this one dies. Recursive — containers can nest. */
  payload?: PayloadGroup[];
}

export interface WaveDef {
  number: number;
  groups: WaveGroup[];
  /** Seconds between spawns. */
  interval: number;
  /** End-of-wave bonus gold. */
  bonus: number;
}

export function waveTotalCount(def: WaveDef): number {
  let n = 0;
  for (const g of def.groups) n += g.count;
  return n;
}

export function groupForSpawn(def: WaveDef, spawnIndex: number): WaveGroup {
  let cumulative = 0;
  for (const g of def.groups) {
    cumulative += g.count;
    if (spawnIndex < cumulative) return g;
  }
  return def.groups[def.groups.length - 1];
}

function w(
  number: number,
  kind: CreepKind,
  count: number,
  hp: number,
  bounty: number,
  interval = 0.7,
  bonus = 5,
  slowResist = 0,
  armor?: number,
): WaveDef {
  return {
    number,
    groups: [
      {
        kind,
        count,
        hp,
        bounty,
        slowResist,
        ...(armor !== undefined ? { armor } : {}),
      },
    ],
    interval,
    bonus,
  };
}

type G = [CreepKind, number, number, number, number?, number?];

function wm(
  number: number,
  interval: number,
  bonus: number,
  ...groups: G[]
): WaveDef {
  return {
    number,
    groups: groups.map(([kind, count, hp, bounty, slowResist, armor]) => ({
      kind,
      count,
      hp,
      bounty,
      slowResist: slowResist ?? 0,
      ...(armor !== undefined ? { armor } : {}),
    })),
    interval,
    bonus,
  };
}

export const WAVES: WaveDef[] = [
  w(1, "normal", 13, 70, 1, 0.65, 5),
  w(2, "normal", 15, 105, 1, 0.65, 5),
  w(3, "fast", 17, 120, 1, 0.45, 6),
  w(4, "normal", 15, 190, 1, 0.65, 7),
  w(5, "armored", 11, 335, 2, 0.85, 12, 0, 7),
  w(6, "normal", 17, 300, 2, 0.55, 12),
  w(7, "fast", 19, 336, 2, 0.45, 12),
  w(8, "air", 12, 330, 2, 0.6, 14),
  w(9, "armored", 13, 580, 3, 0.85, 17, 0, 7),
  w(10, "boss", 4, 3000, 5, 1.2, 30),

  // --- Waves 11-19: healers introduced, light mixing, armor ramp begins ---
  wm(
    11,
    0.55,
    9,
    ["healer", 2, 800, 4],
    ["normal", 10, 1450, 2, 0, 1],
    ["fast", 5, 1450, 2, 0, 1],
  ),
  w(12, "fast", 20, 1610, 2, 0.4, 9, 0, 1),
  wm(
    13,
    0.75,
    12,
    ["armored", 9, 2250, 4],
    ["fast", 4, 2250, 4, 0, 2],
    ["healer", 2, 1500, 5],
  ),
  wm(14, 0.55, 10, ["air", 11, 1510, 3], ["healer", 2, 1200, 4]),
  {
    number: 15,
    groups: [
      {
        kind: "vessel" as CreepKind,
        count: 5,
        hp: 1800,
        bounty: 4,
        slowResist: 0,
        payload: [
          { kind: "normal" as CreepKind, count: 3, hp: 1200, bounty: 2 },
        ],
      },
    ],
    interval: 0.8,
    bonus: 12,
  },
  w(16, "fast", 22, 2420, 3, 0.4, 12, 0, 2),
  wm(
    17,
    0.55,
    14,
    ["normal", 13, 3220, 3, 0, 2],
    ["fast", 6, 3220, 3, 0, 2],
    ["healer", 2, 2200, 5],
  ),
  w(18, "armored", 15, 3950, 5, 0.75, 17),
  wm(
    19,
    0.55,
    17,
    ["air", 8, 2520, 4],
    ["fast", 4, 2820, 4, 0, 2],
    ["healer", 2, 2000, 5],
  ),
  w(20, "boss", 6, 12000, 12, 1.2, 60),

  // --- Waves 21-29: tunnelers introduced, both specials mix in, armor ramps up ---
  wm(
    21,
    0.5,
    16,
    ["tunneler", 3, 5000, 5, 0.02, 3],
    ["normal", 13, 7400, 3, 0.02, 3],
    ["fast", 6, 7400, 3, 0.02, 3],
  ),
  wm(
    22,
    0.35,
    17,
    ["fast", 18, 7870, 3, 0.14, 3],
    ["armored", 5, 7870, 3, 0.14],
    ["healer", 2, 5500, 5, 0.14, 3],
  ),
  wm(
    23,
    0.75,
    18,
    ["armored", 14, 10830, 4],
    ["normal", 3, 10830, 4, 0, 3],
    ["tunneler", 2, 7500, 6, 0, 3],
  ),
  wm(
    24,
    0.5,
    18,
    ["normal", 13, 11580, 3, 0.1, 3],
    ["air", 3, 11580, 3, 0.1],
    ["fast", 5, 11580, 3, 0.1, 3],
    ["tunneler", 2, 8000, 5, 0.1, 3],
  ),
  {
    number: 25,
    groups: [
      {
        kind: "coral" as CreepKind,
        count: 3,
        hp: 7000,
        bounty: 8,
        slowResist: 0.1,
        armor: 3,
        payload: [
          {
            kind: "vessel" as CreepKind,
            count: 2,
            hp: 5000,
            bounty: 6,
            payload: [
              { kind: "normal" as CreepKind, count: 3, hp: 3500, bounty: 3 },
            ],
          },
        ],
      },
    ],
    interval: 1.0,
    bonus: 19,
  },
  wm(
    26,
    0.35,
    21,
    ["fast", 19, 12350, 3, 0.22, 3],
    ["normal", 4, 12350, 3, 0.22, 3],
    ["healer", 2, 8600, 5, 0.22, 3],
    ["tunneler", 2, 8600, 5, 0.22, 3],
  ),
  wm(
    27,
    0.75,
    23,
    ["armored", 13, 15980, 4, 0.04, 8],
    ["fast", 4, 15980, 4, 0.04, 3],
    ["healer", 2, 11000, 6, 0.04, 3],
  ),
  w(28, "normal", 18, 10824, 4, 0.5, 24, 0.16, 4),
  wm(
    29,
    0.5,
    25,
    ["normal", 14, 18530, 3, 0.18, 4],
    ["armored", 3, 18530, 3, 0.18, 9],
    ["fast", 6, 18530, 3, 0.18, 4],
    ["healer", 2, 13000, 5, 0.18, 4],
  ),
  wm(30, 1.0, 80, ["boss", 8, 32000, 18, 0, 5], ["healer", 3, 22000, 12, 0, 3]),

  // --- Waves 31-39: specials become regular fixtures, armor continues climbing ---
  wm(
    31,
    0.5,
    23,
    ["normal", 14, 17690, 5, 0.22, 7],
    ["fast", 7, 17690, 5, 0.22, 7],
    ["healer", 2, 12400, 7, 0.22, 7],
    ["tunneler", 2, 12400, 7, 0.22, 7],
  ),
  wm(
    32,
    0.35,
    24,
    ["fast", 20, 18320, 5, 0.34, 8],
    ["air", 4, 18320, 5, 0.34, 5],
    ["healer", 3, 12800, 7, 0.34, 8],
  ),
  w(33, "armored", 18, 21600, 5, 0.75, 27, 0.06, 12),
  wm(
    34,
    0.5,
    27,
    ["air", 11, 12160, 5, 0.28, 6],
    ["fast", 4, 16200, 5, 0.28, 9],
    ["healer", 3, 11300, 7, 0.28, 9],
  ),
  {
    number: 35,
    groups: [
      {
        kind: "coral" as CreepKind,
        count: 2,
        hp: 16000,
        bounty: 12,
        slowResist: 0.3,
        armor: 9,
        payload: [
          {
            kind: "vessel" as CreepKind,
            count: 2,
            hp: 12000,
            bounty: 8,
            payload: [
              {
                kind: "gazer" as CreepKind,
                count: 2,
                hp: 8000,
                bounty: 6,
                payload: [
                  {
                    kind: "tunneler" as CreepKind,
                    count: 3,
                    hp: 10000,
                    bounty: 4,
                  },
                  {
                    kind: "normal" as CreepKind,
                    count: 3,
                    hp: 12000,
                    bounty: 3,
                  },
                  {
                    kind: "healer" as CreepKind,
                    count: 1,
                    hp: 5000,
                    bounty: 5,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    interval: 1.2,
    bonus: 29,
  },
  wm(
    36,
    0.5,
    30,
    ["normal", 13, 25270, 5, 0.3, 9],
    ["armored", 4, 25270, 5, 0.3, 13],
    ["fast", 6, 25270, 5, 0.3, 9],
    ["healer", 3, 17700, 7, 0.3, 9],
  ),
  wm(
    37,
    0.75,
    32,
    ["armored", 13, 31840, 6, 0.24, 15],
    ["fast", 6, 31840, 6, 0.24, 11],
    ["tunneler", 3, 22300, 9, 0.24, 11],
    ["healer", 2, 22300, 9, 0.24, 11],
  ),
  wm(
    38,
    0.5,
    34,
    ["air", 9, 22000, 6, 0.36, 8],
    ["fast", 5, 23760, 6, 0.36, 11],
    ["healer", 3, 16600, 9, 0.36, 11],
  ),
  wm(
    39,
    0.5,
    37,
    ["normal", 13, 36640, 5, 0.38, 12],
    ["fast", 7, 36640, 5, 0.38, 12],
    ["armored", 3, 36640, 5, 0.38, 16],
    ["tunneler", 3, 25600, 7, 0.38, 12],
  ),
  wm(
    40,
    1.0,
    100,
    ["boss", 9, 72000, 33, 0, 14],
    ["healer", 4, 40000, 24, 0, 11],
  ),

  // --- Waves 41-49: specials prominent, armor high ---
  wm(
    41,
    0.5,
    46,
    ["normal", 21, 30330, 8, 0.42, 14],
    ["healer", 4, 21000, 12, 0.42, 14],
    ["tunneler", 2, 21000, 12, 0.42, 14],
  ),
  wm(
    42,
    0.35,
    48,
    ["fast", 25, 33490, 8, 0.54, 15],
    ["tunneler", 4, 23000, 12, 0.54, 15],
    ["healer", 2, 23000, 12, 0.54, 15],
  ),
  wm(
    43,
    0.75,
    50,
    ["armored", 18, 43220, 10, 0.36, 18],
    ["healer", 3, 30000, 15, 0.36, 15],
    ["tunneler", 2, 30000, 15, 0.36, 15],
  ),
  wm(
    44,
    0.5,
    52,
    ["normal", 22, 47390, 9, 0.5, 17],
    ["healer", 3, 33000, 14, 0.5, 17],
    ["tunneler", 2, 33000, 14, 0.5, 17],
  ),
  {
    number: 45,
    groups: [
      {
        kind: "coral" as CreepKind,
        count: 2,
        hp: 28000,
        bounty: 15,
        slowResist: 0.5,
        armor: 17,
        payload: [
          {
            kind: "vessel" as CreepKind,
            count: 2,
            hp: 20000,
            bounty: 10,
            payload: [
              {
                kind: "gazer" as CreepKind,
                count: 2,
                hp: 14000,
                bounty: 8,
                payload: [
                  {
                    kind: "anemone" as CreepKind,
                    count: 2,
                    hp: 10000,
                    bounty: 6,
                    payload: [
                      {
                        kind: "fast" as CreepKind,
                        count: 10,
                        hp: 30000,
                        bounty: 4,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    interval: 1.5,
    bonus: 53,
  },
  wm(
    46,
    0.35,
    56,
    ["fast", 26, 53070, 9, 0.62, 17],
    ["tunneler", 2, 37000, 14, 0.62, 17],
    ["healer", 2, 37000, 14, 0.62, 17],
  ),
  wm(
    47,
    0.75,
    58,
    ["armored", 20, 68230, 11, 0.44, 21],
    ["healer", 3, 48000, 16, 0.44, 18],
    ["tunneler", 2, 48000, 16, 0.44, 18],
  ),
  wm(
    48,
    0.5,
    61,
    ["air", 14, 52000, 10, 0.56, 12],
    ["tunneler", 2, 39000, 15, 0.56, 18],
    ["healer", 3, 39000, 15, 0.56, 18],
  ),
  wm(
    49,
    0.5,
    64,
    ["normal", 20, 75820, 10, 0.58, 19],
    ["healer", 4, 53000, 15, 0.58, 19],
    ["tunneler", 4, 53000, 15, 0.58, 19],
  ),
  wm(
    50,
    0.8,
    300,
    ["boss", 10, 200000, 72, 0, 18],
    ["healer", 2, 100000, 48, 0, 15],
  ),

  // --- Waves 51-59: heavy specials ---
  // wm(
  //   51,
  //   0.55,
  //   70,
  //   ["normal", 16, 62000, 10, 0.5],
  //   ["healer", 5, 43000, 14, 0.5],
  //   ["tunneler", 3, 43000, 14, 0.5],
  // ),
  // w(52, "fast", 25, 98000, 12, 0.4, 72, 0.6),
  // wm(
  //   53,
  //   0.75,
  //   74,
  //   ["armored", 16, 68000, 10, 0.52],
  //   ["healer", 4, 47000, 15, 0.52],
  //   ["tunneler", 3, 47000, 15, 0.52],
  // ),
  // wm(
  //   54,
  //   0.5,
  //   76,
  //   ["air", 15, 88000, 12, 0.66],
  //   ["tunneler", 4, 62000, 18, 0.66],
  //   ["healer", 3, 62000, 18, 0.66],
  // ),
  // wm(
  //   55,
  //   0.5,
  //   78,
  //   ["normal", 16, 84000, 12, 0.54],
  //   ["healer", 6, 59000, 18, 0.54],
  //   ["tunneler", 3, 59000, 18, 0.54],
  // ),
  // wm(
  //   56,
  //   0.75,
  //   80,
  //   ["armored", 20, 115000, 14, 0.48],
  //   ["tunneler", 4, 80000, 20, 0.48],
  //   ["healer", 3, 80000, 20, 0.48],
  // ),
  // wm(
  //   57,
  //   0.35,
  //   82,
  //   ["fast", 20, 92000, 12, 0.56],
  //   ["tunneler", 5, 64000, 17, 0.56],
  //   ["healer", 3, 64000, 17, 0.56],
  // ),
  // w(58, "air", 18, 78000, 13, 0.5, 84, 0.6),
  // wm(
  //   59,
  //   0.5,
  //   86,
  //   ["normal", 14, 105000, 12, 0.58],
  //   ["healer", 5, 74000, 18, 0.58],
  //   ["tunneler", 5, 74000, 18, 0.58],
  // ),
  // wm(60, 0.8, 400, ["boss", 11, 420000, 175], ["healer", 6, 200000, 120]),
  //
  // // --- Waves 61-69: heavy mixed, both specials in every wave ---
  // wm(
  //   61,
  //   0.5,
  //   90,
  //   ["normal", 14, 110000, 14, 0.62],
  //   ["healer", 6, 77000, 21, 0.62],
  //   ["tunneler", 4, 77000, 21, 0.62],
  // ),
  // wm(
  //   62,
  //   0.35,
  //   92,
  //   ["fast", 18, 118000, 14, 0.6],
  //   ["tunneler", 6, 83000, 20, 0.6],
  //   ["healer", 5, 83000, 20, 0.6],
  // ),
  // w(63, "armored", 18, 140000, 16, 0.75, 95, 0.64),
  // wm(
  //   64,
  //   0.5,
  //   98,
  //   ["air", 15, 132000, 14, 0.72],
  //   ["healer", 6, 92000, 21, 0.72],
  //   ["tunneler", 4, 92000, 21, 0.72],
  // ),
  // wm(
  //   65,
  //   0.5,
  //   100,
  //   ["normal", 13, 178000, 14, 0.52],
  //   ["healer", 6, 125000, 21, 0.52],
  //   ["tunneler", 7, 125000, 21, 0.52],
  // ),
  // wm(
  //   66,
  //   0.35,
  //   105,
  //   ["fast", 17, 148000, 16, 0.66],
  //   ["tunneler", 6, 104000, 24, 0.66],
  //   ["healer", 5, 104000, 24, 0.66],
  // ),
  // wm(
  //   67,
  //   0.75,
  //   108,
  //   ["armored", 12, 158000, 15, 0.64],
  //   ["healer", 6, 111000, 22, 0.64],
  //   ["tunneler", 6, 111000, 22, 0.64],
  // ),
  // w(68, "air", 16, 185000, 16, 0.5, 112, 0.68),
  // wm(
  //   69,
  //   0.45,
  //   115,
  //   ["normal", 12, 195000, 14, 0.7],
  //   ["healer", 7, 137000, 21, 0.7],
  //   ["tunneler", 7, 137000, 21, 0.7],
  // ),
  // wm(70, 0.7, 600, ["boss", 12, 550000, 250], ["healer", 7, 250000, 150]),
];
