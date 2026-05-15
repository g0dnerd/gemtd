/**
 * Creep archetypes referenced by waves.ts.
 * Each entry produces creeps with the listed base stats; the wave layer
 * scales HP & gold per wave.
 */

import { GemType } from '../render/theme';

export type CreepKind = 'normal' | 'fast' | 'armored' | 'air' | 'boss' | 'healer' | 'wizard' | 'tunneler' | 'vessel' | 'gazer' | 'coral' | 'anemone';

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
  defaultArmor?: number;
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
    defaultArmor: 7,
    flags: { armored: true },
  },
  air: {
    kind: 'air',
    speed: 1.7,
    color: 'diamond',
    hpMult: 0.6,
    bountyMult: 1.2,
    flags: { air: true },
  },
  boss: {
    kind: 'boss',
    speed: 1.2,
    color: 'ruby',
    hpMult: 3.5,
    bountyMult: 3.0,
    flags: { boss: true },
  },
  healer: {
    kind: 'healer',
    speed: 1.55,
    color: 'emerald',
    hpMult: 0.9,
    bountyMult: 1.5,
    flags: {},
  },
  wizard: {
    kind: 'wizard',
    speed: 1.3,
    color: 'sapphire',
    hpMult: 1.0,
    bountyMult: 1.5,
    flags: {},
  },
  tunneler: {
    kind: 'tunneler',
    speed: 1.65,
    color: 'topaz',
    hpMult: 0.8,
    bountyMult: 1.3,
    flags: {},
  },
  vessel: {
    kind: 'vessel',
    speed: 1.3,
    color: 'topaz',
    hpMult: 1.8,
    bountyMult: 0.5,
    flags: {},
  },
  gazer: {
    kind: 'gazer',
    speed: 1.4,
    color: 'amethyst',
    hpMult: 1.6,
    bountyMult: 0.5,
    flags: {},
  },
  coral: {
    kind: 'coral',
    speed: 1.1,
    color: 'emerald',
    hpMult: 2.0,
    bountyMult: 0.5,
    flags: {},
  },
  anemone: {
    kind: 'anemone',
    speed: 1.5,
    color: 'aquamarine',
    hpMult: 1.5,
    bountyMult: 0.5,
    flags: {},
  },
};
