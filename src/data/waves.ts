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
  // Waves 1-4: gentle ramp-up.
  w(1, 'normal', 12, 40, 2, 0.7, 6),
  w(2, 'normal', 14, 60, 2, 0.7, 7),
  w(3, 'fast', 16, 70, 2, 0.5, 8),
  w(4, 'normal', 14, 110, 3, 0.7, 9),
  // Waves 5-9: pressure builds.
  w(5, 'armored', 10, 220, 5, 0.9, 17),
  w(6, 'normal', 16, 180, 4, 0.6, 17),
  w(7, 'fast', 18, 200, 4, 0.5, 18),
  w(8, 'air', 12, 260, 5, 0.6, 21),
  w(9, 'armored', 12, 380, 7, 0.9, 24),
  w(10, 'boss', 4, 3500, 16, 1.2, 30),

  // Waves 11-19: HP ~2× original, bounties cut ~50%.
  w(11, 'normal', 18, 900, 3, 0.6, 13),
  w(12, 'fast', 20, 1000, 3, 0.45, 13),
  w(13, 'armored', 14, 1550, 5, 0.8, 17),
  w(14, 'normal', 18, 1320, 3, 0.6, 14),
  w(15, 'air', 14, 1400, 4, 0.55, 18),
  w(16, 'fast', 22, 1750, 4, 0.45, 17),
  w(17, 'normal', 20, 2000, 4, 0.6, 20),
  w(18, 'armored', 16, 3200, 6, 0.8, 24),
  w(19, 'air', 14, 2300, 5, 0.55, 24),
  w(20, 'boss', 4, 14000, 40, 1.2, 60),

  // Waves 21-29: HP ~3× original, bounties cut ~60%.
  w(21, 'normal', 22, 4800, 3, 0.55, 19),
  w(22, 'fast', 24, 5100, 3, 0.4, 21),
  w(23, 'armored', 18, 7800, 5, 0.8, 22),
  w(24, 'air', 16, 4800, 4, 0.5, 22),
  w(25, 'normal', 22, 7500, 4, 0.55, 24),
  w(26, 'fast', 26, 8000, 4, 0.4, 26),
  w(27, 'armored', 18, 11500, 5, 0.8, 28),
  w(28, 'air', 16, 8200, 5, 0.5, 30),
  w(29, 'normal', 24, 12000, 4, 0.55, 31),
  w(30, 'boss', 5, 32000, 60, 1.0, 100),

  // Waves 31-39: HP ~2.5× original, bounties cut ~40%.
  w(31, 'normal', 24, 14000, 5, 0.55, 26),
  w(32, 'fast', 28, 14500, 5, 0.4, 27),
  w(33, 'armored', 20, 19000, 6, 0.8, 30),
  w(34, 'air', 18, 15000, 6, 0.5, 30),
  w(35, 'normal', 26, 20000, 6, 0.55, 32),
  w(36, 'fast', 30, 22500, 6, 0.4, 33),
  w(37, 'armored', 22, 28000, 7, 0.8, 36),
  w(38, 'air', 18, 22000, 7, 0.5, 38),
  w(39, 'normal', 26, 29000, 6, 0.55, 41),
  w(40, 'boss', 5, 90000, 110, 1.0, 140),

  // Waves 41-49: HP ~+50% over original.
  w(41, 'normal', 26, 24000, 8, 0.55, 46),
  w(42, 'fast', 30, 26500, 8, 0.4, 48),
  w(43, 'armored', 22, 38000, 10, 0.8, 50),
  w(44, 'air', 20, 31000, 9, 0.5, 52),
  w(45, 'normal', 26, 37500, 9, 0.55, 53),
  w(46, 'fast', 30, 42000, 9, 0.4, 56),
  w(47, 'armored', 24, 60000, 11, 0.8, 58),
  w(48, 'air', 20, 52000, 10, 0.5, 61),
  w(49, 'normal', 28, 60000, 10, 0.55, 64),
  w(50, 'boss', 6, 200000, 240, 0.8, 300),
];
