const types = @import("types.zig");

pub const MAX_GROUPS: usize = 4;
pub const MAX_PAYLOAD_DEPTH: usize = 4;

pub const PayloadGroup = struct {
    kind: types.CreepKind = .normal,
    count: i32 = 0,
    hp: i32 = 0,
    bounty: i32 = 0,
    slow_resist: f32 = 0,
    armor: i32 = 0,
    payload: ?[]const PayloadGroup = null,
};

pub const WaveGroup = struct {
    kind: types.CreepKind = .normal,
    count: i32 = 0,
    hp: i32 = 0,
    bounty: i32 = 0,
    slow_resist: f32 = 0,
    armor: i32 = -1, // -1 = use archetype default
    payload: ?[]const PayloadGroup = null,
};

pub const WaveDef = struct {
    number: i32,
    groups: [MAX_GROUPS]WaveGroup,
    group_count: usize,
    interval: f32,
    bonus: i32,
};

fn w(number: i32, kind: types.CreepKind, count: i32, hp: i32, bounty: i32, interval: f32, bonus: i32, slow_resist: f32, armor: i32) WaveDef {
    return .{
        .number = number,
        .groups = .{
            .{ .kind = kind, .count = count, .hp = hp, .bounty = bounty, .slow_resist = slow_resist, .armor = armor },
            .{}, .{}, .{},
        },
        .group_count = 1,
        .interval = interval,
        .bonus = bonus,
    };
}

fn w1(number: i32, kind: types.CreepKind, count: i32, hp: i32, bounty: i32, interval: f32, bonus: i32) WaveDef {
    return w(number, kind, count, hp, bounty, interval, bonus, 0, -1);
}

fn w2(number: i32, kind: types.CreepKind, count: i32, hp: i32, bounty: i32, interval: f32, bonus: i32, slow_resist: f32) WaveDef {
    return w(number, kind, count, hp, bounty, interval, bonus, slow_resist, -1);
}

fn wm2(number: i32, interval: f32, bonus: i32, g0: WaveGroup, g1: WaveGroup) WaveDef {
    return .{ .number = number, .groups = .{ g0, g1, .{}, .{} }, .group_count = 2, .interval = interval, .bonus = bonus };
}

fn wm3(number: i32, interval: f32, bonus: i32, g0: WaveGroup, g1: WaveGroup, g2: WaveGroup) WaveDef {
    return .{ .number = number, .groups = .{ g0, g1, g2, .{} }, .group_count = 3, .interval = interval, .bonus = bonus };
}

fn wm4(number: i32, interval: f32, bonus: i32, g0: WaveGroup, g1: WaveGroup, g2: WaveGroup, g3: WaveGroup) WaveDef {
    return .{ .number = number, .groups = .{ g0, g1, g2, g3 }, .group_count = 4, .interval = interval, .bonus = bonus };
}

fn g(kind: types.CreepKind, count: i32, hp: i32, bounty: i32) WaveGroup {
    return .{ .kind = kind, .count = count, .hp = hp, .bounty = bounty };
}

fn ga(kind: types.CreepKind, count: i32, hp: i32, bounty: i32, slow_resist: f32, armor: i32) WaveGroup {
    return .{ .kind = kind, .count = count, .hp = hp, .bounty = bounty, .slow_resist = slow_resist, .armor = armor };
}

fn gs(kind: types.CreepKind, count: i32, hp: i32, bounty: i32, slow_resist: f32) WaveGroup {
    return .{ .kind = kind, .count = count, .hp = hp, .bounty = bounty, .slow_resist = slow_resist };
}

// Wave 15 payload: vessel → 3 normal
const w15_payload: []const PayloadGroup = &.{
    .{ .kind = .normal, .count = 3, .hp = 1200, .bounty = 2 },
};

// Wave 25 payload: coral → vessel → normal
const w25_inner_payload: []const PayloadGroup = &.{
    .{ .kind = .normal, .count = 3, .hp = 3500, .bounty = 3 },
};
const w25_payload: []const PayloadGroup = &.{
    .{ .kind = .vessel, .count = 2, .hp = 5000, .bounty = 6, .payload = w25_inner_payload },
};

// Wave 35 payload: coral → vessel → gazer → tunneler + normal + healer
const w35_inner3: []const PayloadGroup = &.{
    .{ .kind = .tunneler, .count = 3, .hp = 10000, .bounty = 4 },
    .{ .kind = .normal, .count = 3, .hp = 12000, .bounty = 3 },
    .{ .kind = .healer, .count = 1, .hp = 5000, .bounty = 5 },
};
const w35_inner2: []const PayloadGroup = &.{
    .{ .kind = .gazer, .count = 2, .hp = 8000, .bounty = 6, .payload = w35_inner3 },
};
const w35_payload: []const PayloadGroup = &.{
    .{ .kind = .vessel, .count = 2, .hp = 12000, .bounty = 8, .payload = w35_inner2 },
};

// Wave 45 payload: coral → vessel → gazer → anemone → fast
const w45_inner4: []const PayloadGroup = &.{
    .{ .kind = .fast, .count = 10, .hp = 30000, .bounty = 4 },
};
const w45_inner3: []const PayloadGroup = &.{
    .{ .kind = .anemone, .count = 2, .hp = 10000, .bounty = 6, .payload = w45_inner4 },
};
const w45_inner2: []const PayloadGroup = &.{
    .{ .kind = .gazer, .count = 2, .hp = 14000, .bounty = 8, .payload = w45_inner3 },
};
const w45_payload: []const PayloadGroup = &.{
    .{ .kind = .vessel, .count = 2, .hp = 20000, .bounty = 10, .payload = w45_inner2 },
};

pub const WAVES: [50]WaveDef = .{
    // Waves 1-10
    w1(1, .normal, 13, 70, 1, 0.65, 5),
    w1(2, .normal, 15, 105, 1, 0.65, 5),
    w1(3, .fast, 17, 120, 1, 0.45, 6),
    w1(4, .normal, 15, 190, 1, 0.65, 7),
    w(5, .armored, 11, 335, 2, 0.85, 12, 0, 7),
    w1(6, .normal, 17, 300, 2, 0.55, 12),
    w1(7, .fast, 19, 336, 2, 0.45, 12),
    w1(8, .air, 12, 330, 2, 0.6, 14),
    w(9, .armored, 13, 580, 3, 0.85, 17, 0, 7),
    w1(10, .boss, 4, 3000, 5, 1.2, 30),

    // Waves 11-20
    wm3(11, 0.55, 9, g(.healer, 2, 800, 4), ga(.normal, 10, 1450, 2, 0, 1), ga(.fast, 5, 1450, 2, 0, 1)),
    w(12, .fast, 20, 1610, 2, 0.4, 9, 0, 1),
    wm3(13, 0.75, 12, g(.armored, 9, 2250, 4), ga(.fast, 4, 2250, 4, 0, 2), g(.healer, 2, 1500, 5)),
    wm2(14, 0.55, 10, g(.air, 11, 1510, 3), g(.healer, 2, 1200, 4)),
    .{ .number = 15, .groups = .{ .{ .kind = .vessel, .count = 5, .hp = 1800, .bounty = 4, .payload = w15_payload }, .{}, .{}, .{} }, .group_count = 1, .interval = 0.8, .bonus = 12 },
    w(16, .fast, 22, 2420, 3, 0.4, 12, 0, 2),
    wm3(17, 0.55, 14, ga(.normal, 13, 3220, 3, 0, 2), ga(.fast, 6, 3220, 3, 0, 2), g(.healer, 2, 2200, 5)),
    w1(18, .armored, 15, 3950, 5, 0.75, 17),
    wm3(19, 0.55, 17, g(.air, 8, 2520, 4), ga(.fast, 4, 2820, 4, 0, 2), g(.healer, 2, 2000, 5)),
    w1(20, .boss, 6, 12000, 12, 1.2, 60),

    // Waves 21-30
    wm3(21, 0.5, 16, ga(.tunneler, 3, 5000, 5, 0.02, 3), ga(.normal, 13, 7400, 3, 0.02, 3), ga(.fast, 6, 7400, 3, 0.02, 3)),
    wm3(22, 0.35, 17, ga(.fast, 18, 7870, 3, 0.14, 3), gs(.armored, 5, 7870, 3, 0.14), ga(.healer, 2, 5500, 5, 0.14, 3)),
    wm3(23, 0.75, 18, g(.armored, 14, 10830, 4), ga(.normal, 3, 10830, 4, 0, 3), ga(.tunneler, 2, 7500, 6, 0, 3)),
    wm4(24, 0.5, 18, ga(.normal, 13, 11580, 3, 0.1, 3), gs(.air, 3, 11580, 3, 0.1), ga(.fast, 5, 11580, 3, 0.1, 3), ga(.tunneler, 2, 8000, 5, 0.1, 3)),
    .{ .number = 25, .groups = .{ .{ .kind = .coral, .count = 3, .hp = 7000, .bounty = 8, .slow_resist = 0.1, .armor = 3, .payload = w25_payload }, .{}, .{}, .{} }, .group_count = 1, .interval = 1.0, .bonus = 19 },
    wm4(26, 0.35, 21, ga(.fast, 19, 12350, 3, 0.22, 3), ga(.normal, 4, 12350, 3, 0.22, 3), ga(.healer, 2, 8600, 5, 0.22, 3), ga(.tunneler, 2, 8600, 5, 0.22, 3)),
    wm3(27, 0.75, 23, ga(.armored, 13, 15980, 4, 0.04, 8), ga(.fast, 4, 15980, 4, 0.04, 3), ga(.healer, 2, 11000, 6, 0.04, 3)),
    w(28, .normal, 18, 10824, 4, 0.5, 24, 0.16, 4),
    wm4(29, 0.5, 25, ga(.normal, 14, 18530, 3, 0.18, 4), ga(.armored, 3, 18530, 3, 0.18, 9), ga(.fast, 6, 18530, 3, 0.18, 4), ga(.healer, 2, 13000, 5, 0.18, 4)),
    wm2(30, 1.0, 80, ga(.boss, 8, 32000, 18, 0, 5), ga(.healer, 3, 22000, 12, 0, 3)),

    // Waves 31-40
    wm4(31, 0.5, 23, ga(.normal, 14, 17690, 5, 0.22, 7), ga(.fast, 7, 17690, 5, 0.22, 7), ga(.healer, 2, 12400, 7, 0.22, 7), ga(.tunneler, 2, 12400, 7, 0.22, 7)),
    wm3(32, 0.35, 24, ga(.fast, 20, 18320, 5, 0.34, 8), ga(.air, 4, 18320, 5, 0.34, 5), ga(.healer, 3, 12800, 7, 0.34, 8)),
    w(33, .armored, 18, 21600, 5, 0.75, 27, 0.06, 12),
    wm3(34, 0.5, 27, ga(.air, 11, 12160, 5, 0.28, 6), ga(.fast, 4, 16200, 5, 0.28, 9), ga(.healer, 3, 11300, 7, 0.28, 9)),
    .{ .number = 35, .groups = .{ .{ .kind = .coral, .count = 2, .hp = 16000, .bounty = 12, .slow_resist = 0.3, .armor = 9, .payload = w35_payload }, .{}, .{}, .{} }, .group_count = 1, .interval = 1.2, .bonus = 29 },
    wm4(36, 0.5, 30, ga(.normal, 13, 25270, 5, 0.3, 9), ga(.armored, 4, 25270, 5, 0.3, 13), ga(.fast, 6, 25270, 5, 0.3, 9), ga(.healer, 3, 17700, 7, 0.3, 9)),
    wm4(37, 0.75, 32, ga(.armored, 13, 31840, 6, 0.24, 15), ga(.fast, 6, 31840, 6, 0.24, 11), ga(.tunneler, 3, 22300, 9, 0.24, 11), ga(.healer, 2, 22300, 9, 0.24, 11)),
    wm3(38, 0.5, 34, ga(.air, 9, 22000, 6, 0.36, 8), ga(.fast, 5, 23760, 6, 0.36, 11), ga(.healer, 3, 16600, 9, 0.36, 11)),
    wm4(39, 0.5, 37, ga(.normal, 13, 36640, 5, 0.38, 12), ga(.fast, 7, 36640, 5, 0.38, 12), ga(.armored, 3, 36640, 5, 0.38, 16), ga(.tunneler, 3, 25600, 7, 0.38, 12)),
    wm2(40, 1.0, 100, ga(.boss, 9, 72000, 33, 0, 14), ga(.healer, 4, 40000, 24, 0, 11)),

    // Waves 41-50
    wm3(41, 0.5, 46, ga(.normal, 21, 30330, 8, 0.42, 14), ga(.healer, 4, 21000, 12, 0.42, 14), ga(.tunneler, 2, 21000, 12, 0.42, 14)),
    wm3(42, 0.35, 48, ga(.fast, 25, 33490, 8, 0.54, 15), ga(.tunneler, 4, 23000, 12, 0.54, 15), ga(.healer, 2, 23000, 12, 0.54, 15)),
    wm3(43, 0.75, 50, ga(.armored, 18, 43220, 10, 0.36, 18), ga(.healer, 3, 30000, 15, 0.36, 15), ga(.tunneler, 2, 30000, 15, 0.36, 15)),
    wm3(44, 0.5, 52, ga(.normal, 22, 47390, 9, 0.5, 17), ga(.healer, 3, 33000, 14, 0.5, 17), ga(.tunneler, 2, 33000, 14, 0.5, 17)),
    .{ .number = 45, .groups = .{ .{ .kind = .coral, .count = 2, .hp = 28000, .bounty = 15, .slow_resist = 0.5, .armor = 17, .payload = w45_payload }, .{}, .{}, .{} }, .group_count = 1, .interval = 1.5, .bonus = 53 },
    wm3(46, 0.35, 56, ga(.fast, 26, 53070, 9, 0.62, 17), ga(.tunneler, 2, 37000, 14, 0.62, 17), ga(.healer, 2, 37000, 14, 0.62, 17)),
    wm3(47, 0.75, 58, ga(.armored, 20, 68230, 11, 0.44, 21), ga(.healer, 3, 48000, 16, 0.44, 18), ga(.tunneler, 2, 48000, 16, 0.44, 18)),
    wm3(48, 0.5, 61, ga(.air, 14, 52000, 10, 0.56, 12), ga(.tunneler, 2, 39000, 15, 0.56, 18), ga(.healer, 3, 39000, 15, 0.56, 18)),
    wm4(49, 0.5, 64, ga(.normal, 20, 75820, 10, 0.58, 19), ga(.healer, 4, 53000, 15, 0.58, 19), ga(.tunneler, 4, 53000, 15, 0.58, 19), .{}),
    wm2(50, 0.8, 300, ga(.boss, 10, 200000, 72, 0, 18), ga(.healer, 2, 100000, 48, 0, 15)),
};

pub fn waveTotalCount(def: *const WaveDef) i32 {
    var n: i32 = 0;
    for (0..def.group_count) |i| {
        n += def.groups[i].count;
    }
    return n;
}

pub fn groupForSpawn(def: *const WaveDef, spawn_index: i32) *const WaveGroup {
    var cumulative: i32 = 0;
    for (0..def.group_count) |i| {
        cumulative += def.groups[i].count;
        if (spawn_index < cumulative) return &def.groups[i];
    }
    return &def.groups[def.group_count - 1];
}
