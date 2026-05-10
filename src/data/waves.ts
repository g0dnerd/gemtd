/**
 * Full wave list. 50 waves, mixing normal / fast / armored / air / boss.
 * Boss waves are at 10 / 20 / 30 / 40 / 50.
 */

import type { CreepKind } from "./creeps";

export interface WaveDef {
  number: number;
  kind: CreepKind;
  count: number;
  /** Base HP per creep, before archetype multiplier. */
  hp: number;
  /** Bounty per kill. */
  bounty: number;
  /** Seconds between spawns. */
  interval: number;
  /** End-of-wave bonus gold. */
  bonus: number;
  /** 0–1. Fraction of slow effect negated (0 = full slow, 1 = immune). */
  slowResist: number;
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
): WaveDef {
  return { number, kind, count, hp, bounty, interval, bonus, slowResist };
}

export const WAVES: WaveDef[] = [
  w(1, "normal", 12, 60, 2, 0.7, 5),
  w(2, "normal", 14, 90, 2, 0.7, 5),
  w(3, "fast", 16, 102, 2, 0.5, 6),
  w(4, "normal", 14, 162, 2, 0.7, 7),
  w(5, "armored", 10, 286, 4, 0.9, 12),
  w(6, "normal", 16, 258, 3, 0.6, 12),
  w(7, "fast", 18, 288, 3, 0.5, 12),
  w(8, "air", 12, 372, 4, 0.6, 14),
  w(9, "armored", 12, 497, 5, 0.9, 17),
  w(10, "boss", 4, 3500, 16, 1.2, 30),

  w(11, "normal", 18, 1242, 2, 0.6, 9),
  w(12, "fast", 20, 1380, 2, 0.45, 9),
  w(13, "armored", 14, 1922, 4, 0.8, 12),
  w(14, "normal", 18, 1824, 2, 0.6, 10),
  w(15, "air", 14, 1932, 3, 0.55, 12),
  w(16, "fast", 22, 2412, 3, 0.45, 12),
  w(17, "normal", 20, 2760, 3, 0.6, 14),
  w(18, "armored", 16, 3974, 5, 0.8, 17),
  w(19, "air", 14, 3180, 4, 0.55, 17),
  w(20, "boss", 4, 14000, 40, 1.2, 60),

  w(21, "normal", 22, 6336, 3, 0.55, 16, 0.02),
  w(22, "fast", 24, 6732, 3, 0.4, 17, 0.04),
  w(23, "armored", 18, 9266, 4, 0.8, 18, 0.06),
  w(24, "air", 16, 6336, 3, 0.5, 18, 0.08),
  w(25, "normal", 22, 9900, 3, 0.55, 19, 0.10),
  w(26, "fast", 26, 10560, 3, 0.4, 21, 0.12),
  w(27, "armored", 18, 13662, 4, 0.8, 23, 0.14),
  w(28, "air", 16, 10824, 4, 0.5, 24, 0.16),
  w(29, "normal", 24, 15840, 3, 0.55, 25, 0.18),
  w(30, "boss", 5, 32000, 60, 1.0, 100),

  w(31, "normal", 24, 15120, 5, 0.55, 23, 0.22),
  w(32, "fast", 28, 15660, 5, 0.4, 24, 0.24),
  w(33, "armored", 20, 18468, 5, 0.8, 27, 0.26),
  w(34, "air", 18, 16200, 5, 0.5, 27, 0.28),
  w(35, "normal", 26, 21600, 5, 0.55, 29, 0.30),
  w(36, "fast", 30, 24300, 5, 0.4, 30, 0.32),
  w(37, "armored", 22, 27216, 6, 0.8, 32, 0.34),
  w(38, "air", 18, 23760, 6, 0.5, 34, 0.36),
  w(39, "normal", 26, 31320, 5, 0.55, 37, 0.38),
  w(40, "boss", 5, 90000, 110, 1.0, 140),

  w(41, "normal", 26, 25920, 8, 0.55, 46, 0.42),
  w(42, "fast", 30, 28620, 8, 0.4, 48, 0.44),
  w(43, "armored", 22, 36936, 10, 0.8, 50, 0.46),
  w(44, "air", 20, 33480, 9, 0.5, 52, 0.48),
  w(45, "normal", 26, 40500, 9, 0.55, 53, 0.50),
  w(46, "fast", 30, 45360, 9, 0.4, 56, 0.52),
  w(47, "armored", 24, 58320, 11, 0.8, 58, 0.54),
  w(48, "air", 20, 56160, 10, 0.5, 61, 0.56),
  w(49, "normal", 28, 64800, 10, 0.55, 64, 0.58),
  w(50, "boss", 6, 200000, 240, 0.8, 300),
];
