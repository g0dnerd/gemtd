/**
 * Full wave list. 50 waves (51-70 planned but not yet active).
 * Waves 1-9 are single-type introductions.
 * Wave 11 introduces menders, wave 21 introduces burrowers.
 * From wave 21 on, both specials mix in with increasing prominence.
 * Some waves throughout remain single-type for variety.
 * Amalgam waves are at 10 / 20 / 30 / 40 / 50.
 * Starting at wave 30, amalgams are accompanied by auxiliary menders.
 */

import type { CreepKind } from "./creeps";

export interface PayloadGroup {
  kind: CreepKind;
  count: number;
  hp: number;
  bounty: number;
  slowResist?: number;
  stunResist?: number;
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
  /** 0–1. Fraction of stun chance negated (0 = full stun, 1 = immune). */
  stunResist?: number;
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
  w(1, "shambler", 13, 70, 1, 0.65, 5),
  w(2, "shambler", 15, 105, 1, 0.65, 5),
  w(3, "skitter", 17, 120, 1, 0.45, 6),
  w(4, "shambler", 15, 285, 1, 0.65, 7),
  w(5, "carapace", 11, 335, 2, 0.85, 12, 0, 12),
  w(6, "shambler", 17, 500, 2, 0.55, 12),
  w(7, "skitter", 19, 560, 2, 0.45, 12),
  w(8, "shrike", 12, 430, 2, 0.6, 14),
  w(9, "carapace", 13, 1000, 3, 0.85, 17, 0, 13),
  w(10, "amalgam", 4, 3000, 5, 1.2, 30),

  // --- Waves 11-19: healers introduced, light mixing, armor ramp begins ---
  wm(11, 0.55, 9, ["mender", 2, 1000, 4], ["shambler", 15, 2450, 2, 0, 1]),
  w(12, "skitter", 20, 2410, 2, 0.4, 9, 0, 1),
  wm(
    13,
    0.75,
    12,
    ["carapace", 9, 2250, 4],
    ["skitter", 4, 2250, 4, 0, 2],
    ["mender", 2, 1500, 5],
  ),
  wm(14, 0.55, 10, ["shrike", 11, 1510, 3], ["mender", 2, 1200, 4]),
  {
    number: 15,
    groups: [
      {
        kind: "vessel" as CreepKind,
        count: 5,
        hp: 5000,
        bounty: 4,
        slowResist: 0,
        payload: [
          { kind: "shambler" as CreepKind, count: 10, hp: 1200, bounty: 2 },
        ],
      },
    ],
    interval: 2.5,
    bonus: 12,
  },
  w(16, "skitter", 22, 4040, 3, 0.4, 12, 0, 2),
  wm(
    17,
    0.55,
    14,
    ["shambler", 13, 4980, 3, 0, 2],
    ["skitter", 6, 4980, 3, 0, 2],
    ["mender", 2, 3300, 5],
  ),
  w(18, "carapace", 15, 3950, 5, 0.75, 17),
  wm(19, 0.55, 17, ["shrike", 10, 3150, 4], ["skitter", 6, 3525, 4, 0, 2]),
  wm(20, 1.2, 60, ["amalgam", 6, 13500, 12], ["mender", 2, 8000, 8]),

  // --- Waves 21-29: tunnelers introduced, both specials mix in, armor ramps up ---
  wm(
    21,
    0.5,
    16,
    ["burrower", 3, 5000, 5, 0.02, 3],
    ["shambler", 13, 7400, 3, 0.02, 3],
    ["burrower", 6, 7400, 3, 0.02, 3],
  ),
  wm(
    22,
    0.35,
    17,
    ["skitter", 13, 11805, 3, 0.14, 3],
    ["carapace", 10, 7870, 3, 0.14],
    ["mender", 2, 5500, 5, 0.14, 3],
  ),
  wm(
    23,
    0.75,
    18,
    ["carapace", 14, 13500, 4],
    ["shambler", 3, 13500, 4, 0, 3],
    ["burrower", 2, 9400, 6, 0, 3],
  ),
  wm(
    24,
    0.5,
    18,
    ["shrike", 7, 7300, 3, 0],
    ["skitter", 10, 11580, 3, 0.1, 3],
    ["burrower", 4, 8000, 5, 0.1, 3],
  ),
  {
    number: 25,
    groups: [
      {
        kind: "coral" as CreepKind,
        count: 3,
        hp: 17000,
        bounty: 6,
        slowResist: 0.1,
        armor: 3,
        payload: [
          {
            kind: "vessel" as CreepKind,
            count: 2,
            hp: 8000,
            bounty: 4,
            payload: [
              { kind: "skitter" as CreepKind, count: 5, hp: 12000, bounty: 2 },
            ],
          },
        ],
      },
    ],
    interval: 2.5,
    bonus: 19,
  },
  wm(
    26,
    0.35,
    21,
    ["skitter", 19, 12350, 2, 0.22, 3],
    ["burrower", 8, 13000, 4, 0.22, 3],
  ),
  wm(
    27,
    0.75,
    23,
    ["carapace", 11, 15980, 3, 0.04, 18],
    ["skitter", 6, 15980, 3, 0.04, 3],
    ["mender", 2, 11000, 4, 0.04, 3],
  ),
  w(28, "shambler", 18, 35600, 3, 0.5, 24, 0.16, 4),
  wm(
    29,
    0.5,
    25,
    ["carapace", 7, 21900, 2, 0.18, 15],
    ["skitter", 12, 21900, 2, 0.18, 4],
    ["mender", 2, 15300, 4, 0.18, 4],
  ),
  wm(
    30,
    1.0,
    80,
    ["amalgam", 7, 32000, 13, 0, 5],
    ["mender", 2, 15400, 8, 0, 3],
  ),

  // --- Waves 31-39: specials become regular fixtures, armor continues climbing ---
  wm(
    31,
    0.5,
    13,
    ["chrysalid", 20, 14000, 2, 0.22, 6],
    ["mender", 2, 12400, 2, 0.22, 6],
  ),
  wm(
    32,
    0.35,
    13,
    ["skitter", 15, 27000, 2, 0.34, 8],
    ["chrysalid", 12, 27800, 2, 0.34, 8],
  ),
  w(33, "carapace", 18, 32700, 2, 0.75, 14, 0.06, 38),
  wm(34, 0.55, 14, ["chrysalid", 17, 33100, 2, 0.28, 9]),
  {
    number: 35,
    groups: [
      {
        kind: "coral" as CreepKind,
        count: 5,
        hp: 36000,
        bounty: 4,
        slowResist: 0.3,
        armor: 9,
        payload: [
          {
            kind: "vessel" as CreepKind,
            count: 2,
            hp: 22000,
            bounty: 3,
            payload: [
              {
                kind: "gazer" as CreepKind,
                count: 1,
                hp: 18000,
                bounty: 2,
                payload: [
                  {
                    kind: "anemone" as CreepKind,
                    count: 3,
                    hp: 10000,
                    bounty: 2,
                  },
                  {
                    kind: "shambler" as CreepKind,
                    count: 3,
                    hp: 12000,
                    bounty: 1,
                  },
                  {
                    kind: "mender" as CreepKind,
                    count: 1,
                    hp: 5000,
                    bounty: 2,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    interval: 2.5,
    bonus: 15,
  },
  wm(
    36,
    0.5,
    13,
    ["carapace", 12, 25270, 2, 0.3, 28],
    ["chrysalid", 10, 23895, 2, 0.3, 11],
    ["mender", 3, 17700, 2, 0.3, 9],
  ),
  wm(
    37,
    0.75,
    14,
    ["carapace", 14, 28700, 2, 0.24, 30],
    ["chrysalid", 5, 22300, 2, 0.24, 11],
    ["mender", 3, 20000, 2, 0.24, 11],
  ),
  wm(
    38,
    0.5,
    14,
    ["shrike", 7, 27500, 2, 0.36, 8],
    ["chrysalid", 6, 20800, 2, 0.36, 11],
    ["burrower", 3, 20800, 2, 0.36, 11],
  ),
  wm(
    39,
    0.5,
    15,
    ["skitter", 12, 54000, 2, 0.38, 12],
    ["chrysalid", 8, 37800, 2, 0.38, 12],
    ["burrower", 4, 37800, 2, 0.38, 12],
  ),
  wm(
    40,
    1.0,
    50,
    ["amalgam", 9, 54000, 18, 0, 14],
    ["mender", 4, 24000, 13, 0, 11],
  ),

  // --- Waves 41-49: specials prominent, armor high, bounties taper ---
  wm(
    41,
    0.5,
    17,
    ["chrysalid", 18, 21600, 2, 0.42, 14],
    ["mender", 5, 18900, 2, 0.42, 14],
  ),
  wm(
    42,
    0.35,
    17,
    ["skitter", 24, 57000, 2, 0.54, 15],
    ["chrysalid", 4, 39000, 2, 0.54, 15],
  ),
  w(43, "carapace", 20, 49000, 2, 0.75, 18, 0.36, 45),
  wm(
    44,
    0.5,
    18,
    ["carapace", 14, 46200, 2, 0.5, 30],
    ["burrower", 5, 33000, 2, 0.5, 17],
    ["mender", 3, 33000, 2, 0.5, 17],
  ),
  {
    number: 45,
    groups: [
      {
        kind: "coral" as CreepKind,
        count: 2,
        hp: 60000,
        bounty: 3,
        slowResist: 0.5,
        armor: 17,
        payload: [
          {
            kind: "vessel" as CreepKind,
            count: 2,
            hp: 37500,
            bounty: 2,
            payload: [
              {
                kind: "gazer" as CreepKind,
                count: 2,
                hp: 26300,
                bounty: 2,
                payload: [
                  {
                    kind: "anemone" as CreepKind,
                    count: 2,
                    hp: 22000,
                    bounty: 1,
                    payload: [
                      {
                        kind: "skitter" as CreepKind,
                        count: 10,
                        hp: 43000,
                        bounty: 1,
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
    interval: 2.5,
    bonus: 18,
  },
  wm(
    46,
    0.65,
    17,
    ["chrysalid", 15, 47000, 2, 0.52, 22],
    ["burrower", 8, 38700, 2, 0.52, 22],
    ["mender", 3, 38700, 2, 0.52, 17],
  ),
  wm(
    47,
    0.75,
    18,
    ["carapace", 18, 60040, 2, 0.54, 45],
    ["mender", 4, 42240, 2, 0.54, 27],
  ),
  wm(
    48,
    0.5,
    18,
    ["shrike", 12, 41600, 2, 0.56, 12],
    ["burrower", 8, 39000, 2, 0.56, 18],
  ),
  wm(
    49,
    0.5,
    19,
    ["chrysalid", 14, 56000, 2, 0.58, 19],
    ["burrower", 6, 64000, 2, 0.58, 19],
    ["mender", 4, 48000, 2, 0.58, 19],
  ),
  {
    number: 50,
    groups: [
      {
        kind: "gestation" as CreepKind,
        count: 1,
        hp: 240300,
        bounty: 28,
        slowResist: 0.7,
        stunResist: 0.7,
        armor: 35,
        payload: [
          {
            kind: "anemone" as CreepKind,
            count: 3,
            hp: 100000,
            bounty: 0,
            payload: [
              {
                kind: "coral" as CreepKind,
                count: 2,
                hp: 56000,
                bounty: 0,
                payload: [
                  {
                    kind: "amalgam" as CreepKind,
                    count: 5,
                    hp: 80000,
                    bounty: 0,
                    armor: 20,
                    slowResist: 0.6,
                  },
                  {
                    kind: "mender" as CreepKind,
                    count: 2,
                    hp: 75000,
                    bounty: 0,
                    armor: 16,
                    slowResist: 0.5,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    interval: 0.8,
    bonus: 120,
  },

  // --- Waves 51-59: heavy specials ---
  // wm(
  //   51,
  //   0.55,
  //   70,
  //   ["shambler", 16, 62000, 10, 0.5],
  //   ["mender", 5, 43000, 14, 0.5],
  //   ["burrower", 3, 43000, 14, 0.5],
  // ),
  // w(52, "skitter", 25, 98000, 12, 0.4, 72, 0.6),
  // wm(
  //   53,
  //   0.75,
  //   74,
  //   ["carapace", 16, 68000, 10, 0.52],
  //   ["mender", 4, 47000, 15, 0.52],
  //   ["burrower", 3, 47000, 15, 0.52],
  // ),
  // wm(
  //   54,
  //   0.5,
  //   76,
  //   ["shrike", 15, 88000, 12, 0.66],
  //   ["burrower", 4, 62000, 18, 0.66],
  //   ["mender", 3, 62000, 18, 0.66],
  // ),
  // wm(
  //   55,
  //   0.5,
  //   78,
  //   ["shambler", 16, 84000, 12, 0.54],
  //   ["mender", 6, 59000, 18, 0.54],
  //   ["burrower", 3, 59000, 18, 0.54],
  // ),
  // wm(
  //   56,
  //   0.75,
  //   80,
  //   ["carapace", 20, 115000, 14, 0.48],
  //   ["burrower", 4, 80000, 20, 0.48],
  //   ["mender", 3, 80000, 20, 0.48],
  // ),
  // wm(
  //   57,
  //   0.35,
  //   82,
  //   ["skitter", 20, 92000, 12, 0.56],
  //   ["burrower", 5, 64000, 17, 0.56],
  //   ["mender", 3, 64000, 17, 0.56],
  // ),
  // w(58, "shrike", 18, 78000, 13, 0.5, 84, 0.6),
  // wm(
  //   59,
  //   0.5,
  //   86,
  //   ["shambler", 14, 105000, 12, 0.58],
  //   ["mender", 5, 74000, 18, 0.58],
  //   ["burrower", 5, 74000, 18, 0.58],
  // ),
  // wm(60, 0.8, 400, ["amalgam", 11, 420000, 175], ["mender", 6, 200000, 120]),
  //
  // // --- Waves 61-69: heavy mixed, both specials in every wave ---
  // wm(
  //   61,
  //   0.5,
  //   90,
  //   ["shambler", 14, 110000, 14, 0.62],
  //   ["mender", 6, 77000, 21, 0.62],
  //   ["burrower", 4, 77000, 21, 0.62],
  // ),
  // wm(
  //   62,
  //   0.35,
  //   92,
  //   ["skitter", 18, 118000, 14, 0.6],
  //   ["burrower", 6, 83000, 20, 0.6],
  //   ["mender", 5, 83000, 20, 0.6],
  // ),
  // w(63, "carapace", 18, 140000, 16, 0.75, 95, 0.64),
  // wm(
  //   64,
  //   0.5,
  //   98,
  //   ["shrike", 15, 132000, 14, 0.72],
  //   ["mender", 6, 92000, 21, 0.72],
  //   ["burrower", 4, 92000, 21, 0.72],
  // ),
  // wm(
  //   65,
  //   0.5,
  //   100,
  //   ["shambler", 13, 178000, 14, 0.52],
  //   ["mender", 6, 125000, 21, 0.52],
  //   ["burrower", 7, 125000, 21, 0.52],
  // ),
  // wm(
  //   66,
  //   0.35,
  //   105,
  //   ["skitter", 17, 148000, 16, 0.66],
  //   ["burrower", 6, 104000, 24, 0.66],
  //   ["mender", 5, 104000, 24, 0.66],
  // ),
  // wm(
  //   67,
  //   0.75,
  //   108,
  //   ["carapace", 12, 158000, 15, 0.64],
  //   ["mender", 6, 111000, 22, 0.64],
  //   ["burrower", 6, 111000, 22, 0.64],
  // ),
  // w(68, "shrike", 16, 185000, 16, 0.5, 112, 0.68),
  // wm(
  //   69,
  //   0.45,
  //   115,
  //   ["shambler", 12, 195000, 14, 0.7],
  //   ["mender", 7, 137000, 21, 0.7],
  //   ["burrower", 7, 137000, 21, 0.7],
  // ),
  // wm(70, 0.7, 600, ["amalgam", 12, 550000, 250], ["mender", 7, 250000, 150]),
];

for (const w of WAVES) {
  w.interval = Math.max(0.5, +(w.interval * 1.5).toFixed(2));
}
