/**
 * Creep archetypes referenced by waves.ts.
 * Each entry produces creeps with the listed base stats; the wave layer
 * scales HP & gold per wave.
 */

import { GemType } from '../render/theme';

export type CreepKind = 'normal' | 'fast' | 'armored' | 'air' | 'boss';

export interface CreepArchetype {
  kind: CreepKind;
  /** Tiles per second. */
  speed: number;
  /** Color hint for sprite tinting. */
  color: GemType;
  /** Multiplier applied on top of wave HP scale. */
  hpMult: number;
  /** Bounty multiplier. */
  bountyMult: number;
  flags: { boss?: boolean; armored?: boolean; air?: boolean };
}

export const CREEP_ARCHETYPES: Record<CreepKind, CreepArchetype> = {
  normal: {
    kind: 'normal',
    speed: 1.6,
    color: 'amethyst',
    hpMult: 1.0,
    bountyMult: 1.0,
    flags: {},
  },
  fast: {
    kind: 'fast',
    speed: 2.6,
    color: 'sapphire',
    hpMult: 0.7,
    bountyMult: 1.1,
    flags: {},
  },
  armored: {
    kind: 'armored',
    speed: 1.2,
    color: 'opal',
    hpMult: 1.6,
    bountyMult: 1.2,
    flags: { armored: true },
  },
  air: {
    kind: 'air',
    speed: 2.0,
    color: 'diamond',
    hpMult: 0.6,
    bountyMult: 1.2,
    flags: { air: true },
  },
  boss: {
    kind: 'boss',
    speed: 1.0,
    color: 'ruby',
    hpMult: 8.0,
    bountyMult: 4.0,
    flags: { boss: true },
  },
};
