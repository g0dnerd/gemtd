const std = @import("std");
const Game = @import("Game.zig");
const state_mod = @import("state.zig");
const types = @import("types.zig");
const constants = @import("constants.zig");

// C-compatible result types
pub const PlaceResult = extern struct {
    success: i32,
    tower_id: i32,
};

pub const WaveResult = extern struct {
    phase: i32, // 0=build, 1=gameover, 2=victory
    wave: i32,
    lives: i32,
    gold: i32,
    killed: i32,
    leaked: i32,
};

pub const DrawInfo = extern struct {
    slot_id: i32,
    gem: i32,
    quality: i32,
    placed_tower_id: i32,
};

pub const TowerInfo = extern struct {
    id: i32,
    x: i32,
    y: i32,
    gem: i32,
    quality: i32,
    combo_key: i32, // -1 = none
    upgrade_tier: i32,
    kills: i32,
    total_damage_lo: i32,
    total_damage_hi: i32,
    is_trap: i32,
};

pub const StateSnapshot = extern struct {
    phase: i32,
    wave: i32,
    lives: i32,
    gold: i32,
    total_kills: i32,
    tick: i32,
    chance_tier: i32,
    tower_count: i32,
    creep_count: i32,
    route_length: i32,
};

pub const Pos = extern struct {
    x: i32,
    y: i32,
};

// Lifecycle
pub export fn sim_create(seed: u32) ?*Game {
    const g = std.heap.page_allocator.create(Game) catch return null;
    g.* = Game.init(seed);
    return g;
}

pub export fn sim_destroy(handle: *Game) void {
    std.heap.page_allocator.destroy(handle);
}

pub export fn sim_reset(handle: *Game, seed: u32) void {
    handle.* = Game.init(seed);
}

pub export fn sim_new_game(handle: *Game) void {
    handle.newGame();
}

pub export fn sim_start_placement(handle: *Game) i32 {
    return if (handle.cmdStartPlacement()) 1 else 0;
}

pub export fn sim_place_gem(handle: *Game, slot: i32, gx: i32, gy: i32) PlaceResult {
    if (slot >= 0) handle.cmdSetActiveSlot(slot);
    if (handle.cmdPlace(gx, gy)) {
        const st = &handle.state;
        for (0..st.tower_count) |i| {
            const t = &st.towers[i];
            if (t.active and t.x == gx and t.y == gy and t.placed_wave == st.wave) {
                return .{ .success = 1, .tower_id = t.id };
            }
        }
        return .{ .success = 1, .tower_id = -1 };
    }
    return .{ .success = 0, .tower_id = -1 };
}

pub export fn sim_designate_keeper(handle: *Game, tower_id: i32) i32 {
    return if (handle.cmdDesignateKeep(tower_id)) 1 else 0;
}

pub export fn sim_start_wave(handle: *Game) void {
    handle.cmdStartWave();
}

pub export fn sim_run_wave(handle: *Game) WaveResult {
    handle.runWave();
    const st = &handle.state;
    return .{
        .phase = switch (st.phase) {
            .build => 0,
            .gameover => 1,
            .victory => 2,
            else => 0,
        },
        .wave = st.wave,
        .lives = st.lives,
        .gold = st.gold,
        .killed = st.wave_stats.killed,
        .leaked = st.wave_stats.leaked,
    };
}

pub export fn sim_upgrade_chance_tier(handle: *Game) i32 {
    return if (handle.cmdUpgradeChanceTier()) 1 else 0;
}

pub export fn sim_combine(handle: *Game, tower_ids: [*]const i32, count: u32) i32 {
    return if (handle.cmdCombine(tower_ids[0..count])) 1 else 0;
}

pub export fn sim_upgrade_tower(handle: *Game, tower_id: i32) i32 {
    return if (handle.cmdUpgradeTower(tower_id)) 1 else 0;
}

// State queries
pub export fn sim_get_draws(handle: *Game, out: [*]DrawInfo, max: u32) u32 {
    const st = &handle.state;
    const n = @min(st.draw_count, max);
    for (0..n) |i| {
        out[i] = .{
            .slot_id = @intCast(st.draws[i].slot_id),
            .gem = @intFromEnum(st.draws[i].gem),
            .quality = @intFromEnum(st.draws[i].quality),
            .placed_tower_id = st.draws[i].placed_tower_id,
        };
    }
    return @intCast(n);
}

pub export fn sim_get_towers(handle: *Game, out: [*]TowerInfo, max: u32) u32 {
    const st = &handle.state;
    var written: u32 = 0;
    for (0..st.tower_count) |i| {
        if (written >= max) break;
        const t = &st.towers[i];
        if (!t.active) continue;
        out[written] = .{
            .id = t.id,
            .x = t.x,
            .y = t.y,
            .gem = @intFromEnum(t.gem),
            .quality = @intFromEnum(t.quality),
            .combo_key = if (t.combo_key) |k| @intFromEnum(k) else -1,
            .upgrade_tier = t.upgrade_tier,
            .kills = t.kills,
            .total_damage_lo = @truncate(t.total_damage),
            .total_damage_hi = @truncate(t.total_damage >> 32),
            .is_trap = if (t.is_trap) 1 else 0,
        };
        written += 1;
    }
    return written;
}

pub export fn sim_get_state(handle: *Game) StateSnapshot {
    const st = &handle.state;
    return .{
        .phase = @intFromEnum(st.phase),
        .wave = st.wave,
        .lives = st.lives,
        .gold = st.gold,
        .total_kills = st.total_kills,
        .tick = st.tick,
        .chance_tier = @intCast(st.chance_tier),
        .tower_count = @intCast(st.tower_count),
        .creep_count = @intCast(st.creep_count),
        .route_length = @intCast(st.flat_route_len),
    };
}

pub export fn sim_get_valid_placements(handle: *Game, out: [*]Pos, max: u32) u32 {
    const pathfinding = @import("pathfinding.zig");
    const st = &handle.state;
    var count: u32 = 0;
    const GW: i32 = @intCast(constants.GRID_W);
    const GH: i32 = @intCast(constants.GRID_H);
    const GRID_SIZE = constants.GRID_W * constants.GRID_H;

    var x: i32 = 0;
    while (x < GW - 1) : (x += 1) {
        var y: i32 = 0;
        while (y < GH - 1) : (y += 1) {
            if (count >= max) return count;
            var buildable = true;
            for ([_][2]i32{ .{ 0, 0 }, .{ 1, 0 }, .{ 0, 1 }, .{ 1, 1 } }) |off| {
                const fx: usize = @intCast(x + off[0]);
                const fy: usize = @intCast(y + off[1]);
                if (!st.grid[fy][fx].isBuildable()) {
                    buildable = false;
                    break;
                }
            }
            if (!buildable) continue;

            var extra: [GRID_SIZE]bool = .{false} ** GRID_SIZE;
            for ([_][2]i32{ .{ 0, 0 }, .{ 1, 0 }, .{ 0, 1 }, .{ 1, 1 } }) |off| {
                const fx: usize = @intCast(x + off[0]);
                const fy: usize = @intCast(y + off[1]);
                extra[fy * constants.GRID_W + fx] = true;
            }
            var temp_st = st.*;
            if (pathfinding.findRoute(&st.grid, &extra, &temp_st)) {
                out[count] = .{ .x = x, .y = y };
                count += 1;
            }
        }
    }
    return count;
}
