const types = @import("types.zig");

pub const CreepFlags = packed struct {
    boss: bool = false,
    armored: bool = false,
    air: bool = false,
};

pub const CreepArchetype = struct {
    kind: types.CreepKind,
    speed: f32,
    color: types.GemType,
    hp_mult: f32,
    bounty_mult: f32,
    default_armor: i32,
    flags: CreepFlags,
};

pub const ARCHETYPES = init: {
    var a: [14]CreepArchetype = undefined;
    a[@intFromEnum(types.CreepKind.shambler)] = .{
        .kind = .shambler, .speed = 1.6, .color = .amethyst, .hp_mult = 1.0, .bounty_mult = 1.0, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.skitter)] = .{
        .kind = .skitter, .speed = 2.6, .color = .sapphire, .hp_mult = 0.7, .bounty_mult = 1.1, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.carapace)] = .{
        .kind = .carapace, .speed = 1.2, .color = .opal, .hp_mult = 1.6, .bounty_mult = 1.2, .default_armor = 7, .flags = .{ .armored = true },
    };
    a[@intFromEnum(types.CreepKind.shrike)] = .{
        .kind = .shrike, .speed = 1.7, .color = .diamond, .hp_mult = 0.6, .bounty_mult = 1.2, .default_armor = 0, .flags = .{ .air = true },
    };
    a[@intFromEnum(types.CreepKind.amalgam)] = .{
        .kind = .amalgam, .speed = 1.2, .color = .ruby, .hp_mult = 3.5, .bounty_mult = 3.0, .default_armor = 0, .flags = .{ .boss = true },
    };
    a[@intFromEnum(types.CreepKind.mender)] = .{
        .kind = .mender, .speed = 1.55, .color = .emerald, .hp_mult = 0.9, .bounty_mult = 1.5, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.wizard)] = .{
        .kind = .wizard, .speed = 1.3, .color = .sapphire, .hp_mult = 1.0, .bounty_mult = 1.5, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.burrower)] = .{
        .kind = .burrower, .speed = 1.65, .color = .topaz, .hp_mult = 0.8, .bounty_mult = 1.3, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.vessel)] = .{
        .kind = .vessel, .speed = 1.3, .color = .topaz, .hp_mult = 1.8, .bounty_mult = 0.5, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.gazer)] = .{
        .kind = .gazer, .speed = 1.4, .color = .amethyst, .hp_mult = 1.6, .bounty_mult = 0.5, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.coral)] = .{
        .kind = .coral, .speed = 1.1, .color = .emerald, .hp_mult = 2.0, .bounty_mult = 0.5, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.anemone)] = .{
        .kind = .anemone, .speed = 1.5, .color = .aquamarine, .hp_mult = 1.5, .bounty_mult = 0.5, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.chrysalid)] = .{
        .kind = .chrysalid, .speed = 1.3, .color = .amethyst, .hp_mult = 1.4, .bounty_mult = 1.4, .default_armor = 0, .flags = .{},
    };
    a[@intFromEnum(types.CreepKind.mycoid)] = .{
        .kind = .mycoid, .speed = 1.45, .color = .emerald, .hp_mult = 0.65, .bounty_mult = 1.3, .default_armor = 0, .flags = .{},
    };
    break :init a;
};

pub fn archetype(kind: types.CreepKind) *const CreepArchetype {
    return &ARCHETYPES[@intFromEnum(kind)];
}
