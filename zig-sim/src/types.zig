pub const Cell = enum(u8) {
    grass = 0,
    path = 1,
    wall = 2,
    tower = 3,
    rock = 4,
    trap = 5,

    pub fn isBuildable(self: Cell) bool {
        return self == .grass;
    }

    pub fn isWalkable(self: Cell) bool {
        return self == .grass or self == .path or self == .trap;
    }

    pub fn isBlocking(self: Cell) bool {
        return self == .wall or self == .tower or self == .rock;
    }
};

pub const GemType = enum(u8) {
    ruby = 0,
    sapphire = 1,
    emerald = 2,
    topaz = 3,
    amethyst = 4,
    opal = 5,
    diamond = 6,
    aquamarine = 7,

    pub const count = 8;

    pub fn fromIndex(i: usize) GemType {
        return @enumFromInt(i);
    }
};

pub const Quality = enum(u8) {
    chipped = 1,
    flawed = 2,
    normal = 3,
    flawless = 4,
    perfect = 5,

    pub fn toIndex(self: Quality) usize {
        return @as(usize, @intFromEnum(self)) - 1;
    }

    pub fn fromInt(v: u8) Quality {
        return @enumFromInt(v);
    }
};

pub const Targeting = enum(u8) {
    all = 0,
    ground = 1,
    air = 2,
};

pub const CreepKind = enum(u8) {
    shambler = 0,
    skitter = 1,
    carapace = 2,
    shrike = 3,
    amalgam = 4,
    mender = 5,
    wizard = 6,
    burrower = 7,
    vessel = 8,
    gazer = 9,
    coral = 10,
    anemone = 11,
    chrysalid = 12,
    mycoid = 13,
};

pub const Phase = enum(u8) {
    title = 0,
    build = 1,
    wave = 2,
    gameover = 3,
    victory = 4,
};

pub const Point = struct {
    x: i32,
    y: i32,
};

pub const Waypoint = struct {
    x: i32,
    y: i32,
};
