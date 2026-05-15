const std = @import("std");
const types = @import("types.zig");
const effects = @import("effects.zig");
const Effect = effects.Effect;
const EffectList = effects.EffectList;

pub const ComboInput = struct {
    gem: types.GemType,
    quality: types.Quality,
};

pub const ComboStats = struct {
    dmg_min: i32,
    dmg_max: i32,
    range: f32,
    atk_speed: f32,
    effects: EffectList,
    targeting: types.Targeting,
};

pub const UpgradeTier = struct {
    cost: i32,
    stats: ComboStats,
};

pub const MAX_INPUTS: usize = 4;
pub const MAX_UPGRADES: usize = 2;

pub const ComboKey = enum(u8) {
    black_opal,
    bloodstone,
    dark_emerald,
    gold,
    jade,
    malachite,
    pink_diamond,
    silver,
    star_ruby,
    yellow_sapphire,
    red_crystal,
    paraiba_tourmaline,
    uranium,
    stargem,
    rune_holding,
    rune_damage,
    rune_teleport,
    rune_slow,

    pub const count = 18;
};

pub const ComboRecipe = struct {
    key: ComboKey,
    inputs: [MAX_INPUTS]ComboInput,
    input_count: usize,
    stats: ComboStats,
    upgrades: [MAX_UPGRADES]?UpgradeTier,
    visual_gem: types.GemType,
    is_trap: bool,
};

fn cs(dmg_min: i32, dmg_max: i32, range: f32, atk_speed: f32, effs: []const Effect, targeting: types.Targeting) ComboStats {
    return .{
        .dmg_min = dmg_min,
        .dmg_max = dmg_max,
        .range = range,
        .atk_speed = atk_speed,
        .effects = effects.effectsFromSlice(effs),
        .targeting = targeting,
    };
}

fn inp(comptime pairs: anytype) [MAX_INPUTS]ComboInput {
    var result: [MAX_INPUTS]ComboInput = .{ComboInput{ .gem = .ruby, .quality = .chipped }} ** MAX_INPUTS;
    inline for (pairs, 0..) |p, i| {
        result[i] = ComboInput{ .gem = p[0], .quality = p[1] };
    }
    return result;
}

pub const COMBOS: [ComboKey.count]ComboRecipe = init: {
    var c: [ComboKey.count]ComboRecipe = undefined;

    c[@intFromEnum(ComboKey.black_opal)] = .{
        .key = .black_opal,
        .inputs = inp(.{ .{ .opal, .perfect }, .{ .diamond, .flawless }, .{ .aquamarine, .normal } }),
        .input_count = 3,
        .stats = cs(80, 120, 4.0, 1.0, &.{effects.auraDmg(4.0, 0.3)}, .all),
        .upgrades = .{
            .{ .cost = 300, .stats = cs(120, 180, 4.5, 1.0, &.{ effects.auraDmg(4.5, 0.35), effects.vulnerabilityAura(4.5, 0.2) }, .all) },
            null,
        },
        .visual_gem = .opal,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.bloodstone)] = .{
        .key = .bloodstone,
        .inputs = inp(.{ .{ .ruby, .perfect }, .{ .aquamarine, .flawless }, .{ .amethyst, .normal } }),
        .input_count = 3,
        .stats = cs(280, 420, 4.0, 1.0, &.{effects.splash(2.0, 0.5)}, .all),
        .upgrades = .{
            .{ .cost = 310, .stats = cs(320, 540, 4.0, 1.0, &.{ effects.splash(2.5, 0.5), effects.crit(0.35, 3.0) }, .all) },
            null,
        },
        .visual_gem = .ruby,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.dark_emerald)] = .{
        .key = .dark_emerald,
        .inputs = inp(.{ .{ .emerald, .perfect }, .{ .sapphire, .flawless }, .{ .topaz, .flawed } }),
        .input_count = 3,
        .stats = cs(200, 320, 4.5, 1.1, &.{effects.stun(0.125, 1.0)}, .all),
        .upgrades = .{
            .{ .cost = 250, .stats = cs(260, 400, 4.75, 1.2, &.{ effects.stun(0.15, 2.0), effects.poison(90, 3), effects.deathSpread(2, 2.5) }, .all) },
            null,
        },
        .visual_gem = .emerald,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.gold)] = .{
        .key = .gold,
        .inputs = inp(.{ .{ .amethyst, .perfect }, .{ .amethyst, .flawless }, .{ .diamond, .flawed } }),
        .input_count = 3,
        .stats = cs(220, 310, 4.0, 1.0, &.{ effects.crit(0.25, 3.0), effects.armorReduce(5, 5) }, .all),
        .upgrades = .{
            .{ .cost = 210, .stats = cs(280, 440, 4.0, 1.0, &.{ effects.crit(0.28, 3.5), effects.critSplash(1.5, 0.5), effects.proxArmorReduce(4.0, 6, .ground) }, .all) },
            null,
        },
        .visual_gem = .topaz,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.jade)] = .{
        .key = .jade,
        .inputs = inp(.{ .{ .emerald, .normal }, .{ .opal, .normal }, .{ .sapphire, .flawed } }),
        .input_count = 3,
        .stats = cs(50, 80, 4.0, 1.0, &.{ effects.poison(30, 2), effects.slow(0.5, 2.0) }, .all),
        .upgrades = .{
            .{ .cost = 45, .stats = cs(80, 120, 4.0, 1.0, &.{ effects.poison(35, 3), effects.slow(0.5, 3.0) }, .all) },
            .{ .cost = 250, .stats = cs(300, 450, 4.25, 1.3, &.{ effects.poison(110, 4), effects.slow(0.5, 4.0), effects.crit(0.1, 6.0), effects.stun(0.03, 2.0), effects.bonusGold(0.05) }, .all) },
        },
        .visual_gem = .emerald,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.malachite)] = .{
        .key = .malachite,
        .inputs = inp(.{ .{ .opal, .chipped }, .{ .emerald, .chipped }, .{ .aquamarine, .chipped } }),
        .input_count = 3,
        .stats = cs(14, 22, 3.5, 1.4, &.{effects.multiTarget(3)}, .all),
        .upgrades = .{
            .{ .cost = 25, .stats = cs(30, 46, 3.75, 1.5, &.{effects.multiTarget(3)}, .all) },
            .{ .cost = 280, .stats = cs(70, 100, 4.0, 1.8, &.{effects.multiTarget(10)}, .all) },
        },
        .visual_gem = .emerald,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.pink_diamond)] = .{
        .key = .pink_diamond,
        .inputs = inp(.{ .{ .diamond, .perfect }, .{ .topaz, .normal }, .{ .diamond, .normal } }),
        .input_count = 3,
        .stats = cs(250, 350, 4.5, 1.0, &.{effects.crit(0.1, 5.0)}, .ground),
        .upgrades = .{
            .{ .cost = 250, .stats = cs(300, 520, 4.75, 1.1, &.{ effects.crit(0.12, 6), effects.focusCrit(0.03, 0.15), effects.execute(0.5, 0.25) }, .ground) },
            null,
        },
        .visual_gem = .ruby,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.silver)] = .{
        .key = .silver,
        .inputs = inp(.{ .{ .topaz, .chipped }, .{ .diamond, .chipped }, .{ .sapphire, .chipped } }),
        .input_count = 3,
        .stats = cs(24, 31, 3.5, 1.25, &.{ effects.splash(1.2, 0.5), effects.slow(0.75, 1.5) }, .all),
        .upgrades = .{
            .{ .cost = 25, .stats = cs(40, 54, 3.75, 1.1, &.{ effects.splash(1.5, 0.5), effects.slow(0.72, 1.5), effects.freezeChance(0.1, 0.8) }, .all) },
            .{ .cost = 300, .stats = cs(320, 360, 4.0, 1.1, &.{ effects.splash(1.8, 0.5), effects.slow(0.55, 2.0), effects.freezeChance(0.15, 1.0), effects.periodicNova(7) }, .all) },
        },
        .visual_gem = .diamond,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.star_ruby)] = .{
        .key = .star_ruby,
        .inputs = inp(.{ .{ .ruby, .flawed }, .{ .ruby, .chipped }, .{ .amethyst, .chipped } }),
        .input_count = 3,
        .stats = cs(0, 0, 2.275, 1.0, &.{effects.proxBurn(34, 2.275)}, .all),
        .upgrades = .{
            .{ .cost = 30, .stats = cs(0, 0, 2.4375, 1.0, &.{effects.proxBurnRamp(36, 2.4375, 0.08, 0.8)}, .all) },
            .{ .cost = 290, .stats = cs(0, 0, 2.6, 1.0, &.{ effects.proxBurnRamp(95, 2.6, 0.12, 1.5), effects.armorPierceBurn(), effects.deathNova(0.08, 2.0) }, .all) },
        },
        .visual_gem = .ruby,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.yellow_sapphire)] = .{
        .key = .yellow_sapphire,
        .inputs = inp(.{ .{ .sapphire, .perfect }, .{ .topaz, .flawless }, .{ .ruby, .flawless } }),
        .input_count = 3,
        .stats = cs(120, 180, 4.0, 1.0, &.{ effects.splash(2.0, 0.5), effects.slow(0.75, 2.5) }, .all),
        .upgrades = .{
            .{ .cost = 210, .stats = cs(200, 300, 4.25, 0.9, &.{ effects.splash(2.0, 0.5), effects.slow(0.6, 2.5), effects.periodicFreeze(3, 0.5), effects.frostbite(0.4, 0.3) }, .all) },
            null,
        },
        .visual_gem = .sapphire,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.red_crystal)] = .{
        .key = .red_crystal,
        .inputs = inp(.{ .{ .emerald, .flawless }, .{ .amethyst, .flawed }, .{ .ruby, .normal } }),
        .input_count = 3,
        .stats = cs(80, 150, 5.0, 0.8, &.{effects.proxArmorReduce(5.0, 5, .air)}, .air),
        .upgrades = .{
            .{ .cost = 100, .stats = cs(160, 250, 5.5, 0.8, &.{effects.proxArmorReduce(5.5, 6, .air)}, .air) },
            .{ .cost = 100, .stats = cs(240, 300, 6.0, 0.8, &.{effects.proxArmorReduce(6.0, 7, .air)}, .air) },
        },
        .visual_gem = .amethyst,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.paraiba_tourmaline)] = .{
        .key = .paraiba_tourmaline,
        .inputs = inp(.{ .{ .aquamarine, .perfect }, .{ .opal, .flawless }, .{ .emerald, .flawed }, .{ .aquamarine, .flawed } }),
        .input_count = 4,
        .stats = cs(120, 200, 4.25, 0.75, &.{ effects.proxArmorReduce(4.25, 4, .ground), effects.splashChance(1.5, 0.5, 0.33) }, .all),
        .upgrades = .{
            .{ .cost = 350, .stats = cs(360, 500, 4.5, 0.6, &.{ effects.splashChance(2.0, 0.5, 1.0), effects.stackingArmorReduce(3, 8, 3), effects.proxSlow(0.85, 4.5) }, .all) },
            null,
        },
        .visual_gem = .aquamarine,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.uranium)] = .{
        .key = .uranium,
        .inputs = inp(.{ .{ .topaz, .perfect }, .{ .sapphire, .normal }, .{ .opal, .flawed } }),
        .input_count = 3,
        .stats = cs(0, 0, 4.5, 1.0, &.{ effects.proxBurn(85, 4.5), effects.proxSlow(0.55, 4.5) }, .all),
        .upgrades = .{
            .{ .cost = 190, .stats = cs(0, 0, 4.75, 1.0, &.{ effects.proxBurn(115, 4.75), effects.proxSlow(0.5, 4.75), effects.armorDecayAura(1, 4.75, 4), effects.lingerBurn(2) }, .all) },
            null,
        },
        .visual_gem = .topaz,
        .is_trap = false,
    };

    c[@intFromEnum(ComboKey.stargem)] = .{
        .key = .stargem,
        .inputs = .{ComboInput{ .gem = .ruby, .quality = .chipped }} ** MAX_INPUTS, // special: 4x same Perfect
        .input_count = 0, // special matching
        .stats = cs(550, 750, 5.5, 2.0, &.{ effects.poison(400, 4), effects.slow(0.6, 2.5), effects.stun(0.12, 1.0), effects.beamRamp(0.15, 25) }, .all),
        .upgrades = .{ null, null },
        .visual_gem = .diamond,
        .is_trap = false,
    };

    // Traps (runes) — disabled by default via RUNES_ENABLED
    c[@intFromEnum(ComboKey.rune_holding)] = .{
        .key = .rune_holding,
        .inputs = inp(.{ .{ .topaz, .normal }, .{ .amethyst, .flawed }, .{ .sapphire, .flawed } }),
        .input_count = 3,
        .stats = cs(0, 0, 1.0, 0.5, &.{effects.trapRoot(1.5)}, .ground),
        .upgrades = .{ null, null },
        .visual_gem = .topaz,
        .is_trap = true,
    };

    c[@intFromEnum(ComboKey.rune_damage)] = .{
        .key = .rune_damage,
        .inputs = inp(.{ .{ .diamond, .normal }, .{ .opal, .flawed }, .{ .ruby, .flawed } }),
        .input_count = 3,
        .stats = cs(150, 250, 1.0, 1.8, &.{}, .ground),
        .upgrades = .{ null, null },
        .visual_gem = .diamond,
        .is_trap = true,
    };

    c[@intFromEnum(ComboKey.rune_teleport)] = .{
        .key = .rune_teleport,
        .inputs = inp(.{ .{ .aquamarine, .normal }, .{ .amethyst, .flawed }, .{ .diamond, .flawed } }),
        .input_count = 3,
        .stats = cs(0, 0, 1.0, 0.1, &.{effects.trapKnockback(4)}, .ground),
        .upgrades = .{ null, null },
        .visual_gem = .aquamarine,
        .is_trap = true,
    };

    c[@intFromEnum(ComboKey.rune_slow)] = .{
        .key = .rune_slow,
        .inputs = inp(.{ .{ .sapphire, .normal }, .{ .aquamarine, .flawed }, .{ .diamond, .flawed }, .{ .emerald, .flawed } }),
        .input_count = 4,
        .stats = cs(0, 0, 1.0, 60, &.{effects.trapSlow(0.4, 2.0)}, .ground),
        .upgrades = .{ null, null },
        .visual_gem = .sapphire,
        .is_trap = true,
    };

    break :init c;
};

pub fn comboStatsAtTier(combo: *const ComboRecipe, tier: usize) *const ComboStats {
    if (tier == 0 or combo.upgrades[0] == null) return &combo.stats;
    const idx = @min(tier, MAX_UPGRADES) - 1;
    if (combo.upgrades[idx]) |*u| return &u.stats;
    // If requested tier exceeds available, return highest available
    var i: usize = MAX_UPGRADES;
    while (i > 0) {
        i -= 1;
        if (combo.upgrades[i]) |*u| return &u.stats;
    }
    return &combo.stats;
}

pub fn nextUpgrade(combo: *const ComboRecipe, tier: usize) ?*const UpgradeTier {
    if (tier >= MAX_UPGRADES) return null;
    if (combo.upgrades[tier]) |*u| return u;
    return null;
}

pub fn findCombo(inputs: []const ComboInput) ?ComboKey {
    // Check stargem: 4x same gem at Perfect quality
    if (inputs.len == 4) {
        var all_perfect = true;
        var all_same = true;
        for (inputs) |i| {
            if (i.quality != .perfect) all_perfect = false;
            if (i.gem != inputs[0].gem) all_same = false;
        }
        if (all_perfect and all_same) return .stargem;
    }

    // Sort inputs for comparison
    var sorted: [MAX_INPUTS]ComboInput = undefined;
    for (0..inputs.len) |i| sorted[i] = inputs[i];
    std.sort.insertion(ComboInput, sorted[0..inputs.len], {}, lessThanComboInput);

    // Check each combo recipe
    for (&COMBOS) |*combo| {
        if (combo.input_count == 0) continue; // stargem handled above
        if (combo.input_count != inputs.len) continue;
        if (combo.is_trap and !@import("constants.zig").RUNES_ENABLED) continue;

        var recipe_sorted: [MAX_INPUTS]ComboInput = undefined;
        for (0..combo.input_count) |i| recipe_sorted[i] = combo.inputs[i];
        std.sort.insertion(ComboInput, recipe_sorted[0..combo.input_count], {}, lessThanComboInput);

        var match = true;
        for (0..combo.input_count) |i| {
            if (sorted[i].gem != recipe_sorted[i].gem or sorted[i].quality != recipe_sorted[i].quality) {
                match = false;
                break;
            }
        }
        if (match) return combo.key;
    }
    return null;
}

fn lessThanComboInput(_: void, a: ComboInput, b: ComboInput) bool {
    const ag = @intFromEnum(a.gem);
    const bg = @intFromEnum(b.gem);
    if (ag != bg) return ag < bg;
    return @intFromEnum(a.quality) < @intFromEnum(b.quality);
}

pub fn comboByKey(key: ComboKey) *const ComboRecipe {
    return &COMBOS[@intFromEnum(key)];
}

test "findCombo silver" {
    const result = findCombo(&.{
        .{ .gem = .topaz, .quality = .chipped },
        .{ .gem = .diamond, .quality = .chipped },
        .{ .gem = .sapphire, .quality = .chipped },
    });
    try std.testing.expect(result != null);
    try std.testing.expectEqual(result.?, .silver);
}

test "findCombo stargem" {
    const result = findCombo(&.{
        .{ .gem = .ruby, .quality = .perfect },
        .{ .gem = .ruby, .quality = .perfect },
        .{ .gem = .ruby, .quality = .perfect },
        .{ .gem = .ruby, .quality = .perfect },
    });
    try std.testing.expect(result != null);
    try std.testing.expectEqual(result.?, .stargem);
}
