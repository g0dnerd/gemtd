const std = @import("std");
const types = @import("types.zig");
const effects = @import("effects.zig");
const Effect = effects.Effect;
const EffectList = effects.EffectList;

pub const GemBase = struct {
    base_dmg: f32,
    spread: f32,
    base_range: f32,
    base_atk_speed: f32,
    effects: EffectList,
    targeting: types.Targeting,
    quality_dmg_mult: ?[5]f32, // per-gem override (indexed by quality-1), null = use global
};

pub const GemStats = struct {
    gem: types.GemType,
    quality: types.Quality,
    dmg_min: i32,
    dmg_max: i32,
    range: f32,
    atk_speed: f32,
    cost: i32,
    effects: EffectList,
    targeting: types.Targeting,
};

const QUALITY_DMG_MULT: [5]f32 = .{ 1.0, 2.2, 5.0, 11.0, 22.0 };
const QUALITY_RANGE_BONUS: [5]f32 = .{ 0.0, 0.25, 0.5, 0.75, 1.0 };
const QUALITY_SPEED_BONUS: [5]f32 = .{ 1.0, 1.05, 1.1, 1.18, 1.3 };
const QUALITY_BASE_COST: [5]i32 = .{ 12, 60, 250, 1000, 4000 };

pub const GEM_BASE: [types.GemType.count]GemBase = init: {
    var bases: [types.GemType.count]GemBase = undefined;

    // Ruby: splash
    bases[@intFromEnum(types.GemType.ruby)] = .{
        .base_dmg = 15,
        .spread = 0.2,
        .base_range = 3.5,
        .base_atk_speed = 1.0,
        .effects = effects.effectsFromSlice(&.{effects.splash(1.0, 0.5)}),
        .targeting = .all,
        .quality_dmg_mult = .{ 0.9, 2.0, 4.5, 9.0, 18.0 },
    };

    // Sapphire: slow
    bases[@intFromEnum(types.GemType.sapphire)] = .{
        .base_dmg = 15,
        .spread = 0.15,
        .base_range = 4.0,
        .base_atk_speed = 0.9,
        .effects = effects.effectsFromSlice(&.{effects.slow(0.7, 1.5)}),
        .targeting = .all,
        .quality_dmg_mult = null,
    };

    // Emerald: poison
    bases[@intFromEnum(types.GemType.emerald)] = .{
        .base_dmg = 13,
        .spread = 0.15,
        .base_range = 3.5,
        .base_atk_speed = 1.0,
        .effects = effects.effectsFromSlice(&.{effects.poison(11, 4)}),
        .targeting = .all,
        .quality_dmg_mult = null,
    };

    // Topaz: chain
    bases[@intFromEnum(types.GemType.topaz)] = .{
        .base_dmg = 8,
        .spread = 0.2,
        .base_range = 3.0,
        .base_atk_speed = 1.6,
        .effects = effects.effectsFromSlice(&.{effects.chain(2, 0.6)}),
        .targeting = .all,
        .quality_dmg_mult = null,
    };

    // Amethyst: true damage + air bonus
    bases[@intFromEnum(types.GemType.amethyst)] = .{
        .base_dmg = 21,
        .spread = 0.2,
        .base_range = 4.5,
        .base_atk_speed = 0.9,
        .effects = effects.effectsFromSlice(&.{ effects.trueDmg(0.3), effects.airBonus(2.5) }),
        .targeting = .all,
        .quality_dmg_mult = null,
    };

    // Opal: atk speed aura
    bases[@intFromEnum(types.GemType.opal)] = .{
        .base_dmg = 4,
        .spread = 0.2,
        .base_range = 3.0,
        .base_atk_speed = 0.7,
        .effects = effects.effectsFromSlice(&.{effects.auraAtkSpeed(3.0, 0.10)}),
        .targeting = .all,
        .quality_dmg_mult = null,
    };

    // Diamond: crit, ground only
    bases[@intFromEnum(types.GemType.diamond)] = .{
        .base_dmg = 25,
        .spread = 0.3,
        .base_range = 4.0,
        .base_atk_speed = 0.8,
        .effects = effects.effectsFromSlice(&.{effects.crit(0.25, 2.0)}),
        .targeting = .ground,
        .quality_dmg_mult = null,
    };

    // Aquamarine: beam ramp
    bases[@intFromEnum(types.GemType.aquamarine)] = .{
        .base_dmg = 2,
        .spread = 0.15,
        .base_range = 3.0,
        .base_atk_speed = 3.0,
        .effects = effects.effectsFromSlice(&.{effects.beamRamp(0.21, 30)}),
        .targeting = .all,
        .quality_dmg_mult = null,
    };

    break :init bases;
};

pub fn gemStats(gem: types.GemType, quality: types.Quality) GemStats {
    const base = &GEM_BASE[@intFromEnum(gem)];
    const qi = quality.toIndex();

    const dmg_mult = if (base.quality_dmg_mult) |m| m[qi] else QUALITY_DMG_MULT[qi];
    const dmg_mid = base.base_dmg * dmg_mult;
    const half = dmg_mid * base.spread;

    return .{
        .gem = gem,
        .quality = quality,
        .dmg_min = @intFromFloat(@round(dmg_mid - half)),
        .dmg_max = @intFromFloat(@round(dmg_mid + half)),
        .range = base.base_range + QUALITY_RANGE_BONUS[qi],
        .atk_speed = @round(base.base_atk_speed * QUALITY_SPEED_BONUS[qi] * 100.0) / 100.0,
        .cost = QUALITY_BASE_COST[qi],
        .effects = scaleEffects(&base.effects, quality, dmg_mult),
        .targeting = base.targeting,
    };
}

fn scaleEffects(base_effects: *const EffectList, quality: types.Quality, dmg_scale: f32) EffectList {
    var result: EffectList = base_effects.*;
    const q = @as(f32, @floatFromInt(@intFromEnum(quality)));

    for (&result) |*e| {
        switch (e.kind) {
            .none => break,
            .poison => {
                e.f1 *= dmg_scale; // dps
            },
            .splash => {
                e.f1 *= (1.0 + (q - 1.0) * 0.08); // radius
            },
            .chain => {
                e.f1 += (q - 1.0); // bounces
            },
            .stun => {
                e.f2 = @min(0.5, e.f2 + (q - 1.0) * 0.04); // chance (f2)
            },
            .crit => {
                e.f1 = @min(0.6, e.f1 + (q - 1.0) * 0.03); // chance
                if (@intFromEnum(quality) >= 3) e.f2 *= 0.9; // multiplier
            },
            .slow => {
                e.f1 = @max(0.4, e.f1 - (q - 1.0) * 0.04); // factor
            },
            .true_dmg => {
                e.f1 = @min(0.5, e.f1 + (q - 1.0) * 0.04); // chance
            },
            .air_bonus => {
                e.f1 += (q - 1.0) * 0.25; // multiplier
            },
            .aura_atkspeed => {
                e.f2 += (q - 1.0) * 0.03; // pct
                e.f1 += QUALITY_RANGE_BONUS[@intFromEnum(quality) - 1]; // radius
            },
            .beam_ramp => {
                e.f1 += (q - 1.0) * 0.01; // rampPerHit
                e.f1 = @round(e.f1 * 100.0) / 100.0;
            },
            .prox_burn => {
                e.f1 *= dmg_scale; // dps
                e.f2 *= (1.0 + (q - 1.0) * 0.08); // radius
            },
            .prox_slow => {
                e.f1 = @max(0.3, e.f1 - (q - 1.0) * 0.04); // factor
            },
            .armor_reduce => {
                e.f1 += (q - 1.0); // value
                e.f2 += (q - 1.0) * 0.5; // duration
            },
            .bonus_gold => {
                e.f1 = @min(0.15, e.f1 + (q - 1.0) * 0.01); // chance
            },
            else => {},
        }
    }
    return result;
}

test "gemStats ruby chipped" {
    const s = gemStats(.ruby, .chipped);
    try std.testing.expect(s.dmg_min > 0);
    try std.testing.expect(s.dmg_max > s.dmg_min);
    try std.testing.expectEqual(s.targeting, .all);
}

test "gemStats diamond is ground only" {
    const s = gemStats(.diamond, .normal);
    try std.testing.expectEqual(s.targeting, .ground);
}
