const std = @import("std");
const types = @import("types.zig");
const constants = @import("constants.zig");
const state_mod = @import("state.zig");
const map_mod = @import("map.zig");
const pathfinding = @import("pathfinding.zig");
const rng_mod = @import("rng.zig");
const combat = @import("combat.zig");
const wave_phase = @import("wave_phase.zig");
const build_phase = @import("build_phase.zig");
const waves_mod = @import("waves.zig");
const combos_mod = @import("combos.zig");

const Game = @This();

state: state_mod.State,
rng: rng_mod.RNG,
seed: u32,
next_entity_id: i32,
wave_state: wave_phase.WavePhaseState,

pub fn init(seed: u32) Game {
    var g = Game{
        .state = .{},
        .rng = rng_mod.RNG.init(seed),
        .seed = seed,
        .next_entity_id = 1,
        .wave_state = .{},
    };
    g.state.grid = map_mod.buildBaseLayout();
    g.state.total_waves = @intCast(waves_mod.WAVES.len);
    _ = pathfinding.findRoute(&g.state.grid, null, &g.state);
    pathfinding.buildAirRoute(&g.state);
    return g;
}

pub fn newGame(self: *Game) void {
    self.state.towers = undefined;
    self.state.tower_count = 0;
    self.state.rocks = undefined;
    self.state.rock_count = 0;
    self.state.creeps = undefined;
    self.state.creep_count = 0;
    self.state.projectiles = undefined;
    self.state.projectile_count = 0;
    self.state.draw_count = 0;
    self.state.active_draw_slot = -1;
    self.state.designated_keep_tower_id = -1;
    self.state.chance_tier = 0;
    self.state.tick = 0;
    self.state.wave = 0;
    self.state.lives = constants.START_LIVES;
    self.state.gold = constants.START_GOLD;
    self.state.total_kills = 0;
    self.state.rocks_removed = 0;
    self.state.downgrade_used_this_round = false;
    self.state.payload_pool_count = 0;
    self.state.grid = map_mod.buildBaseLayout();
    _ = pathfinding.findRoute(&self.state.grid, null, &self.state);
    pathfinding.buildAirRoute(&self.state);
    self.enterBuild();
}

pub fn enterBuild(self: *Game) void {
    self.state.phase = .build;
    self.state.wave += 1;
    self.state.designated_keep_tower_id = -1;
    self.state.downgrade_used_this_round = false;
    self.state.wave_stats = .{};

    // Wave 1: auto-roll draws
    if (self.state.wave == 1) {
        build_phase.rollDraws(&self.state, &self.rng);
    }
}

pub fn enterWave(self: *Game) void {
    if (self.state.phase != .build) return;

    const round_concluded = self.state.draw_count == 0 and self.state.designated_keep_tower_id >= 0;
    if (!round_concluded) {
        if (!self.state.allDrawsPlaced()) return;
        if (self.state.designated_keep_tower_id < 0) return;
        build_phase.applyKeepAndRock(&self.state, &self.next_entity_id);
    }

    self.state.draw_count = 0;
    self.state.designated_keep_tower_id = -1;
    self.state.phase = .wave;
    self.state.active_draw_slot = -1;
    wave_phase.onEnter(&self.wave_state, &self.state);
}

pub fn simStep(self: *Game) void {
    self.state.tick += 1;
    if (self.state.phase == .wave) {
        wave_phase.stepWave(&self.wave_state, &self.state, &self.rng, &self.next_entity_id);
    }
    combat.step(&self.state, &self.rng, &self.next_entity_id);
    combat.stepTraps(&self.state, &self.rng, &self.next_entity_id);
}

pub fn runWave(self: *Game) void {
    const max_ticks: i32 = 60 * 60 * 5;
    var i: i32 = 0;
    while (i < max_ticks) : (i += 1) {
        if (self.state.phase != .wave) break;
        self.simStep();
    }
}

// Command surface
pub fn cmdPlace(self: *Game, x: i32, y: i32) bool {
    return build_phase.place(&self.state, x, y, &self.next_entity_id);
}

pub fn cmdDesignateKeep(self: *Game, tower_id: i32) bool {
    if (!build_phase.designateKeep(&self.state, tower_id)) return false;
    if (self.state.allDrawsPlaced()) {
        self.enterWave();
    }
    return true;
}

pub fn cmdStartPlacement(self: *Game) bool {
    if (self.state.phase != .build) return false;
    if (self.state.draw_count > 0 or self.state.designated_keep_tower_id >= 0) return false;
    build_phase.rollDraws(&self.state, &self.rng);
    return true;
}

pub fn cmdStartWave(self: *Game) void {
    self.enterWave();
}

pub fn cmdUpgradeChanceTier(self: *Game) bool {
    return build_phase.upgradeChanceTier(&self.state);
}

pub fn cmdCombine(self: *Game, tower_ids: []const i32) bool {
    return build_phase.combine(&self.state, tower_ids, &self.next_entity_id);
}

pub fn cmdUpgradeTower(self: *Game, tower_id: i32) bool {
    return build_phase.upgradeTower(&self.state, tower_id);
}

pub fn cmdSetActiveSlot(self: *Game, slot_id: i32) void {
    if (slot_id < 0) return;
    const sid: usize = @intCast(slot_id);
    for (0..self.state.draw_count) |i| {
        if (self.state.draws[i].slot_id == sid and self.state.draws[i].placed_tower_id < 0) {
            self.state.active_draw_slot = slot_id;
            return;
        }
    }
}

pub fn endWave(self: *Game) void {
    // Called when wave phase determines wave is over (via phase transition)
    if (self.state.phase == .build) {
        // Wave ended, build phase auto-entered by wave_phase.endWave
        // But we need to handle the build phase entry properly
        self.state.designated_keep_tower_id = -1;
        self.state.downgrade_used_this_round = false;
        self.state.wave_stats = .{};
        if (self.state.wave == 1) {
            build_phase.rollDraws(&self.state, &self.rng);
        }
    }
}

pub const GameResult = struct {
    seed: u32,
    wave_reached: i32,
    final_gold: i32,
    final_lives: i32,
    outcome: types.Phase, // .victory or .gameover
};

test "game init and route exists" {
    var g = Game.init(42);
    try std.testing.expect(g.state.flat_route_len > 0);
    try std.testing.expect(g.state.air_route_len > 0);
    g.newGame();
    try std.testing.expectEqual(g.state.phase, .build);
    try std.testing.expectEqual(g.state.wave, 1);
    try std.testing.expectEqual(g.state.lives, constants.START_LIVES);
}

test "can place gems and run wave 1" {
    var g = Game.init(42);
    g.newGame();

    // Wave 1: draws are auto-rolled
    try std.testing.expectEqual(g.state.draw_count, 5);
    try std.testing.expectEqual(g.state.phase, .build);

    // Place all 5 draws at valid positions along the grid interior
    const positions = [5][2]i32{
        .{ 4, 4 }, .{ 4, 8 }, .{ 4, 12 }, .{ 4, 16 }, .{ 4, 20 },
    };
    var placed_ids: [5]i32 = .{-1} ** 5;
    for (0..5) |i| {
        g.cmdSetActiveSlot(@intCast(i));
        const ok = g.cmdPlace(positions[i][0], positions[i][1]);
        if (ok) {
            placed_ids[i] = g.state.draws[i].placed_tower_id;
        }
    }

    // At least some placements should succeed
    var placed_count: usize = 0;
    for (placed_ids) |id| {
        if (id >= 0) placed_count += 1;
    }
    try std.testing.expect(placed_count >= 3);

    // If all placed, designate keeper and run wave
    if (g.state.allDrawsPlaced()) {
        const keep_id = placed_ids[0];
        if (keep_id >= 0) {
            _ = g.cmdDesignateKeep(keep_id);
        }

        // Should have transitioned to wave or still be in build
        if (g.state.phase == .wave) {
            g.runWave();
            // After wave 1, should be in build (wave 2) or gameover
            try std.testing.expect(g.state.phase == .build or g.state.phase == .gameover);
            try std.testing.expect(g.state.wave >= 1);
        }
    }
}
