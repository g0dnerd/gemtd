/**
 * Full wave list. 50 waves, mixing normal / fast / armored / air / boss.
 * Boss waves are at 10 / 20 / 30 / 40 / 50.
 */

import type { CreepKind } from './creeps';

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
}

function w(
  number: number,
  kind: CreepKind,
  count: number,
  hp: number,
  bounty: number,
  interval = 0.7,
  bonus = 5,
): WaveDef {
  return { number, kind, count, hp, bounty, interval, bonus };
}

export const WAVES: WaveDef[] = [
  w(1, 'normal', 12, 40, 2, 0.7, 6),
  w(2, 'normal', 14, 60, 2, 0.7, 7),
  w(3, 'fast', 16, 70, 2, 0.5, 8),
  w(4, 'normal', 14, 110, 3, 0.7, 9),
  // Waves 5-10: +30% bounty / +50% bonus.
  w(5, 'armored', 10, 220, 5, 0.9, 17),
  w(6, 'normal', 16, 180, 4, 0.6, 17),
  w(7, 'fast', 18, 200, 4, 0.5, 18),
  w(8, 'air', 12, 260, 5, 0.6, 21),
  w(9, 'armored', 12, 380, 7, 0.9, 24),
  w(10, 'boss', 1, 4500, 78, 1.0, 45),

  // Waves 11-20: +40% bounty / +50% bonus.
  w(11, 'normal', 18, 480, 6, 0.6, 21),
  w(12, 'fast', 20, 520, 6, 0.45, 21),
  w(13, 'armored', 14, 900, 8, 0.8, 27),
  w(14, 'normal', 18, 700, 6, 0.6, 24),
  w(15, 'air', 14, 850, 7, 0.55, 30),
  w(16, 'fast', 22, 920, 7, 0.45, 27),
  w(17, 'normal', 20, 1100, 7, 0.6, 33),
  w(18, 'armored', 16, 1900, 10, 0.8, 39),
  w(19, 'air', 14, 1500, 8, 0.55, 39),
  w(20, 'boss', 1, 22000, 224, 1.0, 90),

  // Waves 21-30: +20% bounty / +30% bonus.
  w(21, 'normal', 22, 1800, 7, 0.55, 34),
  w(22, 'fast', 24, 1900, 7, 0.4, 36),
  w(23, 'armored', 18, 3200, 10, 0.8, 39),
  w(24, 'air', 16, 2400, 8, 0.5, 39),
  w(25, 'normal', 22, 2800, 8, 0.55, 42),
  w(26, 'fast', 26, 3000, 8, 0.4, 47),
  w(27, 'armored', 18, 4800, 11, 0.8, 49),
  w(28, 'air', 16, 4000, 10, 0.5, 52),
  w(29, 'normal', 24, 4500, 10, 0.55, 55),
  w(30, 'boss', 1, 80000, 456, 1.0, 156),

  w(31, 'normal', 24, 5500, 9, 0.55, 44),
  w(32, 'fast', 28, 6000, 9, 0.4, 46),
  w(33, 'armored', 20, 9000, 11, 0.8, 50),
  w(34, 'air', 18, 7800, 10, 0.5, 50),
  w(35, 'normal', 26, 8500, 10, 0.55, 54),
  w(36, 'fast', 30, 9500, 10, 0.4, 56),
  w(37, 'armored', 22, 14000, 12, 0.8, 60),
  w(38, 'air', 18, 12000, 11, 0.5, 64),
  w(39, 'normal', 26, 13500, 11, 0.55, 68),
  w(40, 'boss', 1, 220000, 800, 1.0, 220),

  w(41, 'normal', 26, 16000, 12, 0.55, 70),
  w(42, 'fast', 30, 17500, 12, 0.4, 72),
  w(43, 'armored', 22, 26000, 14, 0.8, 76),
  w(44, 'air', 20, 22000, 13, 0.5, 78),
  w(45, 'normal', 26, 25000, 13, 0.55, 80),
  w(46, 'fast', 30, 28000, 13, 0.4, 84),
  w(47, 'armored', 24, 42000, 15, 0.8, 88),
  w(48, 'air', 20, 36000, 14, 0.5, 92),
  w(49, 'normal', 28, 40000, 14, 0.55, 96),
  w(50, 'boss', 1, 700000, 2000, 1.0, 500),
];
