pub const TILE: f32 = 36.0;
pub const GRID_SCALE: f32 = 2.0;
pub const FINE_TILE: f32 = TILE / GRID_SCALE;
pub const SIM_HZ: f32 = 60.0;
pub const SIM_DT: f32 = 1.0 / SIM_HZ;
pub const SIM_HZ_INT: i32 = 60;

pub const START_LIVES: i32 = 50;
pub const START_GOLD: i32 = 10;

pub const GRID_W: usize = 42;
pub const GRID_H: usize = 42;

pub const DRAW_COUNT: usize = 5;
pub const MAX_CHANCE_TIER: usize = 8;

pub const CHANCE_TIER_WEIGHTS: [9][5]f32 = .{
    .{ 1.0, 0.0, 0.0, 0.0, 0.0 }, // L0
    .{ 0.7, 0.3, 0.0, 0.0, 0.0 }, // L1
    .{ 0.6, 0.3, 0.1, 0.0, 0.0 }, // L2
    .{ 0.5, 0.3, 0.2, 0.0, 0.0 }, // L3
    .{ 0.4, 0.3, 0.2, 0.1, 0.0 }, // L4
    .{ 0.3, 0.3, 0.3, 0.1, 0.0 }, // L5
    .{ 0.2, 0.3, 0.3, 0.2, 0.0 }, // L6
    .{ 0.1, 0.3, 0.3, 0.3, 0.0 }, // L7
    .{ 0.0, 0.3, 0.3, 0.3, 0.1 }, // L8
};

pub const CHANCE_TIER_UPGRADE_COST: [8]i32 = .{ 25, 75, 120, 160, 210, 260, 300, 350 };

pub const QUALITY_BASE_COST: [5]i32 = .{ 12, 60, 250, 1000, 4000 };

pub const RUNES_ENABLED: bool = false;
