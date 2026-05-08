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
  w(1, "normal", 12, 50, 2, 0.7, 5),
  w(2, "normal", 14, 75, 2, 0.7, 5),
  w(3, "fast", 16, 85, 2, 0.5, 6),
  w(4, "normal", 14, 135, 2, 0.7, 7),
  w(5, "armored", 10, 265, 4, 0.9, 12),
  w(6, "normal", 16, 215, 3, 0.6, 12),
  w(7, "fast", 18, 240, 3, 0.5, 12),
  w(8, "air", 12, 310, 4, 0.6, 14),
  w(9, "armored", 12, 460, 5, 0.9, 17),
  w(10, "boss", 4, 3500, 16, 1.2, 30),

  w(11, "normal", 18, 1035, 2, 0.6, 9),
  w(12, "fast", 20, 1150, 2, 0.45, 9),
  w(13, "armored", 14, 1780, 4, 0.8, 12),
  w(14, "normal", 18, 1520, 2, 0.6, 10),
  w(15, "air", 14, 1610, 3, 0.55, 12),
  w(16, "fast", 22, 2010, 3, 0.45, 12),
  w(17, "normal", 20, 2300, 3, 0.6, 14),
  w(18, "armored", 16, 3680, 5, 0.8, 17),
  w(19, "air", 14, 2650, 4, 0.55, 17),
  w(20, "boss", 4, 14000, 40, 1.2, 60),

  w(21, "normal", 22, 5280, 3, 0.55, 16),
  w(22, "fast", 24, 5610, 3, 0.4, 17),
  w(23, "armored", 18, 8580, 4, 0.8, 18),
  w(24, "air", 16, 5280, 3, 0.5, 18),
  w(25, "normal", 22, 8250, 3, 0.55, 19),
  w(26, "fast", 26, 8800, 3, 0.4, 21),
  w(27, "armored", 18, 12650, 4, 0.8, 23),
  w(28, "air", 16, 9020, 4, 0.5, 24),
  w(29, "normal", 24, 13200, 3, 0.55, 25),
  w(30, "boss", 5, 32000, 60, 1.0, 100),

  w(31, "normal", 24, 12600, 5, 0.55, 23),
  w(32, "fast", 28, 13050, 5, 0.4, 24),
  w(33, "armored", 20, 17100, 5, 0.8, 27),
  w(34, "air", 18, 13500, 5, 0.5, 27),
  w(35, "normal", 26, 18000, 5, 0.55, 29),
  w(36, "fast", 30, 20250, 5, 0.4, 30),
  w(37, "armored", 22, 25200, 6, 0.8, 32),
  w(38, "air", 18, 19800, 6, 0.5, 34),
  w(39, "normal", 26, 26100, 5, 0.55, 37),
  w(40, "boss", 5, 90000, 110, 1.0, 140),

  w(41, "normal", 26, 21600, 8, 0.55, 46),
  w(42, "fast", 30, 23850, 8, 0.4, 48),
  w(43, "armored", 22, 34200, 10, 0.8, 50),
  w(44, "air", 20, 27900, 9, 0.5, 52),
  w(45, "normal", 26, 33750, 9, 0.55, 53),
  w(46, "fast", 30, 37800, 9, 0.4, 56),
  w(47, "armored", 24, 54000, 11, 0.8, 58),
  w(48, "air", 20, 46800, 10, 0.5, 61),
  w(49, "normal", 28, 54000, 10, 0.55, 64),
  w(50, "boss", 6, 200000, 240, 0.8, 300),
];
