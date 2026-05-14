/**
 * Gem catalog: 7 gem types × 5 qualities, plus a small set of multi-gem
 * specials (defined in combos.ts).
 *
 * Stats are derived from a per-gem base stat block, scaled by quality.
 * This is a faithful flavor of the SC2 GemTD canonical numbers, adjusted
 * to the 7-gem palette imposed by the design handoff.
 */

import { GemType, Quality } from '../render/theme';
import { QUALITY_BASE_COST } from '../game/constants';

export type EffectKind =
  | { kind: 'none' }
  | { kind: 'slow'; factor: number; duration: number; chance?: number }
  | { kind: 'poison'; dps: number; duration: number }
  | { kind: 'splash'; radius: number; falloff?: number; chance?: number }
  | { kind: 'chain'; bounces: number; falloff: number }
  | { kind: 'stun'; duration: number; chance: number }
  | { kind: 'crit'; chance: number; multiplier: number }
  | { kind: 'true'; chance: number }
  | { kind: 'aura_atkspeed'; radius: number; pct: number }
  | { kind: 'aura_dmg'; radius: number; pct: number }
  | { kind: 'prox_armor_reduce'; radius: number; value: number; targets: 'ground' | 'air' | 'all' }
  | { kind: 'trap_slow'; factor: number; duration: number }
  | { kind: 'trap_dot'; dps: number; duration: number }
  | { kind: 'trap_explode'; radius: number; falloff: number }
  | { kind: 'trap_root'; duration: number }
  | { kind: 'trap_knockback'; distance: number }
  | { kind: 'air_bonus'; multiplier: number }
  | { kind: 'beam_ramp'; rampPerHit: number; maxStacks: number }
  | { kind: 'multi_target'; count: number }
  | { kind: 'prox_burn'; dps: number; radius: number }
  | { kind: 'prox_slow'; factor: number; radius: number }
  | { kind: 'armor_reduce'; value: number; duration: number }
  | { kind: 'bonus_gold'; chance: number }
  | { kind: 'vulnerability_aura'; radius: number; pct: number }
  | { kind: 'crit_splash'; radius: number; falloff: number }
  | { kind: 'focus_crit'; pctPerHit: number; maxBonus: number }
  | { kind: 'execute'; dmgBonus: number; hpThreshold: number }
  | { kind: 'freeze_chance'; chance: number; duration: number }
  | { kind: 'periodic_nova'; everyN: number }
  | { kind: 'prox_burn_ramp'; dps: number; radius: number; rampPct: number; rampCap: number }
  | { kind: 'death_nova'; hpPct: number; radius: number }
  | { kind: 'armor_pierce_burn' }
  | { kind: 'periodic_freeze'; interval: number; duration: number }
  | { kind: 'frostbite'; speedThreshold: number; dmgBonus: number }
  | { kind: 'stun_poison'; dps: number; duration: number }
  | { kind: 'death_spread'; count: number; radius: number }
  | { kind: 'stacking_armor_reduce'; perHit: number; maxStacks: number; decayInterval: number }
  | { kind: 'armor_decay_aura'; armorPerSec: number; radius: number; maxReduction: number }
  | { kind: 'linger_burn'; duration: number };

export type Targeting = 'all' | 'ground' | 'air';

export interface GemBase {
  /** Display name (without quality prefix). */
  name: string;
  /** One-line flavor for the inspector. */
  blurb: string;
  /** Base damage (mid of the dmg range). Quality multiplier applied at runtime. */
  baseDmg: number;
  /** Damage spread (e.g. 0.25 → ±25% range around base). */
  spread: number;
  /** Tiles. */
  baseRange: number;
  /** Attacks per second. */
  baseAtkSpeed: number;
  /** Effects on hit. */
  effects: EffectKind[];
  /** Which creep types this gem can target. */
  targeting: Targeting;
  /** Color hint for projectile (defaults to gem color). */
  projectileColor?: GemType;
}

/** Per-gem stat block. */
export const GEM_BASE: Record<GemType, GemBase> = {
  ruby: {
    name: 'Ruby',
    blurb: 'Steady, splashing fire damage.',
    baseDmg: 15,
    spread: 0.2,
    baseRange: 3.5,
    baseAtkSpeed: 1.0,
    effects: [{ kind: 'splash', radius: 1.0, falloff: 0.5 }],
    targeting: 'all',
  },
  sapphire: {
    name: 'Sapphire',
    blurb: 'Frostbite — slows on hit.',
    baseDmg: 15,
    spread: 0.15,
    baseRange: 4.0,
    baseAtkSpeed: 0.9,
    effects: [{ kind: 'slow', factor: 0.7, duration: 1.5 }],
    targeting: 'all',
  },
  emerald: {
    name: 'Emerald',
    blurb: 'Lingering venom over time.',
    baseDmg: 13,
    spread: 0.15,
    baseRange: 3.5,
    baseAtkSpeed: 1.0,
    effects: [{ kind: 'poison', dps: 11, duration: 4 }],
    targeting: 'all',
  },
  topaz: {
    name: 'Topaz',
    blurb: 'Rapid arcs — chain to nearby foes.',
    baseDmg: 8,
    spread: 0.2,
    baseRange: 3.0,
    baseAtkSpeed: 1.6,
    effects: [{ kind: 'chain', bounces: 2, falloff: 0.6 }],
    targeting: 'all',
  },
  amethyst: {
    name: 'Amethyst',
    blurb: 'Arcane lance — true damage, devastating vs air.',
    baseDmg: 21,
    spread: 0.2,
    baseRange: 4.5,
    baseAtkSpeed: 0.9,
    effects: [{ kind: 'true', chance: 0.3 }, { kind: 'air_bonus', multiplier: 2.5 }],
    targeting: 'all',
  },
  opal: {
    name: 'Opal',
    blurb: 'Support aura — boosts attack speed of nearby towers.',
    baseDmg: 4,
    spread: 0.2,
    baseRange: 3.0,
    baseAtkSpeed: 0.7,
    effects: [{ kind: 'aura_atkspeed', radius: 3.0, pct: 0.10 }],
    targeting: 'all',
  },
  diamond: {
    name: 'Diamond',
    blurb: 'Crystalline edge — devastating crits. Ground only.',
    baseDmg: 25,
    spread: 0.3,
    baseRange: 4.0,
    baseAtkSpeed: 0.8,
    effects: [{ kind: 'crit', chance: 0.25, multiplier: 2.0 }],
    targeting: 'ground',
  },
  aquamarine: {
    name: 'Aquamarine',
    blurb: 'Focusing beam — damage ramps on the same target.',
    baseDmg: 2,
    spread: 0.15,
    baseRange: 3.0,
    baseAtkSpeed: 3.0,
    effects: [{ kind: 'beam_ramp', rampPerHit: 0.21, maxStacks: 30 }],
    targeting: 'all',
  },
};

/** Computed stat block for a (gem, quality) pair. */
export interface GemStats {
  gem: GemType;
  quality: Quality;
  name: string;
  qualityName: string;
  blurb: string;
  dmgMin: number;
  dmgMax: number;
  range: number;
  atkSpeed: number;
  cost: number;
  effects: EffectKind[];
  targeting: Targeting;
}

const QUALITY_DMG_MULT: Record<Quality, number> = {
  1: 1.0,
  2: 2.2,
  3: 5.0,
  4: 11.0,
  5: 22.0,
};

const QUALITY_RANGE_BONUS: Record<Quality, number> = {
  1: 0.0,
  2: 0.25,
  3: 0.5,
  4: 0.75,
  5: 1.0,
};

const QUALITY_SPEED_BONUS: Record<Quality, number> = {
  1: 1.0,
  2: 1.05,
  3: 1.1,
  4: 1.18,
  5: 1.3,
};

/** Effect potency typically scales with quality too. */
function scaleEffects(effects: EffectKind[], quality: Quality): EffectKind[] {
  const dmgScale = QUALITY_DMG_MULT[quality];
  return effects.map((e) => {
    switch (e.kind) {
      case 'poison':
        return { ...e, dps: e.dps * dmgScale };
      case 'splash':
        return { ...e, radius: e.radius * (1 + (quality - 1) * 0.08) };
      case 'chain':
        return { ...e, bounces: e.bounces + (quality - 1) };
      case 'stun':
        return { ...e, chance: Math.min(0.5, e.chance + (quality - 1) * 0.04) };
      case 'crit':
        return { ...e, chance: Math.min(0.6, e.chance + (quality - 1) * 0.05) };
      case 'slow':
        return { ...e, factor: Math.max(0.4, e.factor - (quality - 1) * 0.04) };
      case 'true':
        return { ...e, chance: Math.min(0.5, e.chance + (quality - 1) * 0.04) };
      case 'air_bonus':
        return { ...e, multiplier: e.multiplier + (quality - 1) * 0.25 };
      case 'aura_atkspeed': {
        const pct = e.pct + (quality - 1) * 0.03;
        const radius = e.radius + QUALITY_RANGE_BONUS[quality];
        return { ...e, pct, radius };
      }
      case 'beam_ramp':
        return { ...e, rampPerHit: +(e.rampPerHit + (quality - 1) * 0.01).toFixed(2) };
      case 'prox_burn':
        return { ...e, dps: e.dps * dmgScale, radius: e.radius * (1 + (quality - 1) * 0.08) };
      case 'prox_slow':
        return { ...e, factor: Math.max(0.3, e.factor - (quality - 1) * 0.04) };
      case 'armor_reduce':
        return { ...e, value: e.value + (quality - 1), duration: e.duration + (quality - 1) * 0.5 };
      case 'bonus_gold':
        return { ...e, chance: Math.min(0.15, e.chance + (quality - 1) * 0.01) };
      default:
        return e;
    }
  });
}

const QUALITY_LABELS: Record<Quality, string> = {
  1: 'Chipped',
  2: 'Flawed',
  3: 'Normal',
  4: 'Flawless',
  5: 'Perfect',
};

export function gemStats(gem: GemType, quality: Quality): GemStats {
  const base = GEM_BASE[gem];
  const dmgMid = base.baseDmg * QUALITY_DMG_MULT[quality];
  const half = dmgMid * base.spread;
  return {
    gem,
    quality,
    name: base.name,
    qualityName: QUALITY_LABELS[quality],
    blurb: base.blurb,
    dmgMin: Math.round(dmgMid - half),
    dmgMax: Math.round(dmgMid + half),
    range: base.baseRange + QUALITY_RANGE_BONUS[quality],
    atkSpeed: +(base.baseAtkSpeed * QUALITY_SPEED_BONUS[quality]).toFixed(2),
    cost: QUALITY_BASE_COST[quality],
    effects: scaleEffects(base.effects, quality),
    targeting: base.targeting,
  };
}

export function effectSummary(e: EffectKind): string {
  switch (e.kind) {
    case 'slow':
      return `Slow ×${e.factor.toFixed(2)} for ${e.duration}s`;
    case 'poison':
      return `Poison ${Math.round(e.dps)}/s for ${e.duration}s`;
    case 'splash':
      return `Splash r=${e.radius.toFixed(1)}`;
    case 'chain':
      return `Chain to ${e.bounces} more`;
    case 'stun':
      return `${Math.round(e.chance * 100)}% stun ${e.duration}s`;
    case 'crit':
      return `${Math.round(e.chance * 100)}% crit ×${e.multiplier}`;
    case 'true':
      return `${Math.round(e.chance * 100)}% true dmg`;
    case 'aura_atkspeed':
      return `Aura: +${Math.round(e.pct * 100)}% atk spd · ${e.radius.toFixed(1)} tiles`;
    case 'aura_dmg':
      return `Aura: +${Math.round(e.pct * 100)}% dmg · ${e.radius.toFixed(1)} tiles`;
    case 'prox_armor_reduce':
      return `-${e.value} armor to ${e.targets} · ${e.radius.toFixed(1)} tiles`;
    case 'trap_slow':
      return `Trap: Slow ×${e.factor.toFixed(2)} for ${e.duration}s`;
    case 'trap_dot':
      return `Trap: ${Math.round(e.dps)}/s for ${e.duration}s`;
    case 'trap_explode':
      return `Trap: Explode r=${e.radius.toFixed(1)}`;
    case 'trap_root':
      return `Trap: Root ${e.duration}s`;
    case 'trap_knockback':
      return `Trap: Knockback ${e.distance} tiles`;
    case 'air_bonus':
      return `×${e.multiplier.toFixed(1)} vs air`;
    case 'beam_ramp':
      return `Beam: +${Math.round(e.rampPerHit * 100)}%/hit, max ×${(1 + e.maxStacks * e.rampPerHit).toFixed(1)}`;
    case 'multi_target':
      return `Attacks ${e.count} targets`;
    case 'prox_burn':
      return `Burn ${Math.round(e.dps)}/s · ${e.radius.toFixed(1)} tiles`;
    case 'prox_slow':
      return `Slow ×${e.factor.toFixed(2)} nearby · ${e.radius.toFixed(1)} tiles`;
    case 'armor_reduce':
      return `-${e.value} armor for ${e.duration}s`;
    case 'bonus_gold':
      return `${Math.round(e.chance * 100)}% bonus gold`;
    case 'vulnerability_aura':
      return `Vuln +${Math.round(e.pct * 100)}% · ${e.radius.toFixed(1)} tiles`;
    case 'crit_splash':
      return `Crit splash r=${e.radius.toFixed(1)} ×${e.falloff}`;
    case 'focus_crit':
      return `Focus: +${Math.round(e.pctPerHit * 100)}%/hit, max +${Math.round(e.maxBonus * 100)}%`;
    case 'execute':
      return `Execute +${Math.round(e.dmgBonus * 100)}% below ${Math.round(e.hpThreshold * 100)}% HP`;
    case 'freeze_chance':
      return `${Math.round(e.chance * 100)}% freeze ${e.duration}s`;
    case 'periodic_nova':
      return `Nova every ${e.everyN} attacks`;
    case 'prox_burn_ramp':
      return `Burn ${Math.round(e.dps)}/s +${Math.round(e.rampPct * 100)}%/s · ${e.radius.toFixed(1)} tiles`;
    case 'death_nova':
      return `Death: ${Math.round(e.hpPct * 100)}% maxHP nova r=${e.radius.toFixed(1)}`;
    case 'armor_pierce_burn':
      return `Burn ignores armor`;
    case 'periodic_freeze':
      return `Freeze all ${e.interval}s for ${e.duration}s`;
    case 'frostbite':
      return `Frostbite: +${Math.round(e.dmgBonus * 100)}% dmg when ≤${Math.round(e.speedThreshold * 100)}% speed`;
    case 'stun_poison':
      return `Stun → Poison ${Math.round(e.dps)}/s for ${e.duration}s`;
    case 'death_spread':
      return `Plague: spreads to ${e.count} on death`;
    case 'stacking_armor_reduce':
      return `-${e.perHit} armor/hit, max ${e.maxStacks} stacks`;
    case 'armor_decay_aura':
      return `-${e.armorPerSec} armor/s · ${e.radius.toFixed(1)} tiles`;
    case 'linger_burn':
      return `Linger burn ${e.duration}s`;
    case 'none':
      return '';
  }
}
