const types = @import("types.zig");

pub const EffectKind = enum(u8) {
    none,
    slow,
    poison,
    splash,
    chain,
    stun,
    crit,
    true_dmg,
    aura_atkspeed,
    aura_dmg,
    prox_armor_reduce,
    trap_slow,
    trap_dot,
    trap_explode,
    trap_root,
    trap_knockback,
    air_bonus,
    beam_ramp,
    multi_target,
    prox_burn,
    prox_slow,
    armor_reduce,
    bonus_gold,
    vulnerability_aura,
    crit_splash,
    focus_crit,
    execute,
    freeze_chance,
    periodic_nova,
    prox_burn_ramp,
    death_nova,
    armor_pierce_burn,
    periodic_freeze,
    frostbite,
    stun_poison,
    death_spread,
    stacking_armor_reduce,
    armor_decay_aura,
    linger_burn,
};

pub const Effect = struct {
    kind: EffectKind = .none,

    // Shared numeric fields — interpreted per kind.
    // Using a flat struct avoids tagged unions and keeps things cache-friendly.
    f1: f32 = 0, // slow.factor, poison.dps, splash.radius, chain.bounces, stun.duration, crit.chance, etc.
    f2: f32 = 0, // slow.duration, splash.falloff, chain.falloff, stun.chance, crit.multiplier, etc.
    f3: f32 = 0, // splash.chance, beam_ramp.maxStacks, multi_target.count, etc.
    f4: f32 = 0, // extra
    targeting: types.Targeting = .all, // for prox_armor_reduce
};

// Constructors for each effect type
pub fn slow(factor: f32, duration: f32) Effect {
    return .{ .kind = .slow, .f1 = factor, .f2 = duration };
}

pub fn slowChance(factor: f32, duration: f32, chance: f32) Effect {
    return .{ .kind = .slow, .f1 = factor, .f2 = duration, .f3 = chance };
}

pub fn poison(dps: f32, duration: f32) Effect {
    return .{ .kind = .poison, .f1 = dps, .f2 = duration };
}

pub fn splash(radius: f32, falloff: f32) Effect {
    return .{ .kind = .splash, .f1 = radius, .f2 = falloff };
}

pub fn splashChance(radius: f32, falloff: f32, chance: f32) Effect {
    return .{ .kind = .splash, .f1 = radius, .f2 = falloff, .f3 = chance };
}

pub fn chain(bounces: f32, falloff: f32) Effect {
    return .{ .kind = .chain, .f1 = bounces, .f2 = falloff };
}

pub fn stun(chance: f32, duration: f32) Effect {
    return .{ .kind = .stun, .f1 = duration, .f2 = chance };
}

pub fn crit(chance: f32, multiplier: f32) Effect {
    return .{ .kind = .crit, .f1 = chance, .f2 = multiplier };
}

pub fn trueDmg(chance: f32) Effect {
    return .{ .kind = .true_dmg, .f1 = chance };
}

pub fn auraAtkSpeed(radius: f32, pct: f32) Effect {
    return .{ .kind = .aura_atkspeed, .f1 = radius, .f2 = pct };
}

pub fn auraDmg(radius: f32, pct: f32) Effect {
    return .{ .kind = .aura_dmg, .f1 = radius, .f2 = pct };
}

pub fn proxArmorReduce(radius: f32, value: f32, targeting: types.Targeting) Effect {
    return .{ .kind = .prox_armor_reduce, .f1 = radius, .f2 = value, .targeting = targeting };
}

pub fn airBonus(multiplier: f32) Effect {
    return .{ .kind = .air_bonus, .f1 = multiplier };
}

pub fn beamRamp(ramp_per_hit: f32, max_stacks: f32) Effect {
    return .{ .kind = .beam_ramp, .f1 = ramp_per_hit, .f2 = max_stacks };
}

pub fn multiTarget(count_f: f32) Effect {
    return .{ .kind = .multi_target, .f1 = count_f };
}

pub fn proxBurn(dps: f32, radius: f32) Effect {
    return .{ .kind = .prox_burn, .f1 = dps, .f2 = radius };
}

pub fn proxSlow(factor: f32, radius: f32) Effect {
    return .{ .kind = .prox_slow, .f1 = factor, .f2 = radius };
}

pub fn armorReduce(value: f32, duration: f32) Effect {
    return .{ .kind = .armor_reduce, .f1 = value, .f2 = duration };
}

pub fn bonusGold(chance: f32) Effect {
    return .{ .kind = .bonus_gold, .f1 = chance };
}

pub fn vulnerabilityAura(radius: f32, pct: f32) Effect {
    return .{ .kind = .vulnerability_aura, .f1 = radius, .f2 = pct };
}

pub fn critSplash(radius: f32, falloff: f32) Effect {
    return .{ .kind = .crit_splash, .f1 = radius, .f2 = falloff };
}

pub fn focusCrit(pct_per_hit: f32, max_bonus: f32) Effect {
    return .{ .kind = .focus_crit, .f1 = pct_per_hit, .f2 = max_bonus };
}

pub fn execute(dmg_bonus: f32, hp_threshold: f32) Effect {
    return .{ .kind = .execute, .f1 = dmg_bonus, .f2 = hp_threshold };
}

pub fn freezeChance(chance: f32, duration: f32) Effect {
    return .{ .kind = .freeze_chance, .f1 = chance, .f2 = duration };
}

pub fn periodicNova(every_n: f32) Effect {
    return .{ .kind = .periodic_nova, .f1 = every_n };
}

pub fn proxBurnRamp(dps: f32, radius: f32, ramp_pct: f32, ramp_cap: f32) Effect {
    return .{ .kind = .prox_burn_ramp, .f1 = dps, .f2 = radius, .f3 = ramp_pct, .f4 = ramp_cap };
}

pub fn deathNova(hp_pct: f32, radius: f32) Effect {
    return .{ .kind = .death_nova, .f1 = hp_pct, .f2 = radius };
}

pub fn armorPierceBurn() Effect {
    return .{ .kind = .armor_pierce_burn };
}

pub fn periodicFreeze(interval: f32, duration: f32) Effect {
    return .{ .kind = .periodic_freeze, .f1 = interval, .f2 = duration };
}

pub fn frostbite(speed_threshold: f32, dmg_bonus: f32) Effect {
    return .{ .kind = .frostbite, .f1 = speed_threshold, .f2 = dmg_bonus };
}

pub fn stunPoison(dps: f32, duration: f32) Effect {
    return .{ .kind = .stun_poison, .f1 = dps, .f2 = duration };
}

pub fn deathSpread(count_f: f32, radius: f32) Effect {
    return .{ .kind = .death_spread, .f1 = count_f, .f2 = radius };
}

pub fn stackingArmorReduce(per_hit: f32, max_stacks: f32, decay_interval: f32) Effect {
    return .{ .kind = .stacking_armor_reduce, .f1 = per_hit, .f2 = max_stacks, .f3 = decay_interval };
}

pub fn armorDecayAura(armor_per_sec: f32, radius: f32, max_reduction: f32) Effect {
    return .{ .kind = .armor_decay_aura, .f1 = armor_per_sec, .f2 = radius, .f3 = max_reduction };
}

pub fn lingerBurn(duration: f32) Effect {
    return .{ .kind = .linger_burn, .f1 = duration };
}

pub fn trapSlow(factor: f32, duration: f32) Effect {
    return .{ .kind = .trap_slow, .f1 = factor, .f2 = duration };
}

pub fn trapDot(dps: f32, duration: f32) Effect {
    return .{ .kind = .trap_dot, .f1 = dps, .f2 = duration };
}

pub fn trapExplode(radius: f32, falloff: f32) Effect {
    return .{ .kind = .trap_explode, .f1 = radius, .f2 = falloff };
}

pub fn trapRoot(duration: f32) Effect {
    return .{ .kind = .trap_root, .f1 = duration };
}

pub fn trapKnockback(distance: f32) Effect {
    return .{ .kind = .trap_knockback, .f1 = distance };
}

pub const MAX_EFFECTS: usize = 8;
pub const EffectList = [MAX_EFFECTS]Effect;

pub fn emptyEffects() EffectList {
    return .{Effect{}} ** MAX_EFFECTS;
}

pub fn effectsFromSlice(slice: []const Effect) EffectList {
    var list = emptyEffects();
    const n = @min(slice.len, MAX_EFFECTS);
    for (0..n) |i| {
        list[i] = slice[i];
    }
    return list;
}

pub fn countEffects(list: *const EffectList) usize {
    for (list, 0..) |e, i| {
        if (e.kind == .none) return i;
    }
    return MAX_EFFECTS;
}
