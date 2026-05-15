const std = @import("std");
const types = @import("types.zig");
const constants = @import("constants.zig");
const state_mod = @import("state.zig");
const map_mod = @import("map.zig");
const pathfinding = @import("pathfinding.zig");
const gems_mod = @import("gems.zig");
const combos_mod = @import("combos.zig");
const build_phase = @import("build_phase.zig");
const Game = @import("Game.zig");

const GRID_W = constants.GRID_W;
const GRID_H = constants.GRID_H;
const GRID_SIZE = GRID_W * GRID_H;
const TILE = constants.TILE;
const FINE_TILE = constants.FINE_TILE;
const GRID_SCALE = constants.GRID_SCALE;

const GOLD_RESERVE = 20;
const FOOTPRINT = [4][2]i32{ .{ 0, 0 }, .{ 1, 0 }, .{ 0, 1 }, .{ 1, 1 } };

fn exposure(st: *const state_mod.State, ax: i32, ay: i32, range: f32) f32 {
    const tx = @as(f32, @floatFromInt(ax + 1)) * FINE_TILE;
    const ty = @as(f32, @floatFromInt(ay + 1)) * FINE_TILE;
    const r2 = (range * TILE) * (range * TILE);
    var count: f32 = 0;
    for (0..st.flat_route_len) |i| {
        const rx = @as(f32, @floatFromInt(st.flat_route[i].x)) * FINE_TILE + FINE_TILE / 2.0;
        const ry = @as(f32, @floatFromInt(st.flat_route[i].y)) * FINE_TILE + FINE_TILE / 2.0;
        const dx = tx - rx;
        const dy = ty - ry;
        if (dx * dx + dy * dy <= r2) count += 1;
    }
    return count;
}

fn mazeGain(st: *const state_mod.State, ax: i32, ay: i32) f32 {
    var extra: [GRID_SIZE]bool = .{false} ** GRID_SIZE;
    for (FOOTPRINT) |off| {
        const fx: usize = @intCast(ax + off[0]);
        const fy: usize = @intCast(ay + off[1]);
        extra[fy * GRID_W + fx] = true;
    }
    var temp_st = st.*;
    if (pathfinding.findRoute(&st.grid, &extra, &temp_st)) {
        return @as(f32, @floatFromInt(temp_st.flat_route_len)) - @as(f32, @floatFromInt(st.flat_route_len));
    }
    return -1000; // blocked
}

const ScoredPos = struct {
    x: i32,
    y: i32,
    score: f32,
};

fn scorePlacement(st: *const state_mod.State, ax: i32, ay: i32) f32 {
    const exp = exposure(st, ax, ay, 7.0);
    const mg = mazeGain(st, ax, ay);
    if (mg < -999) return -1000;
    return exp * 2.0 + mg;
}

fn findBestPosition(st: *const state_mod.State) ?struct { x: i32, y: i32 } {
    var best_score: f32 = -10000;
    var best_x: i32 = -1;
    var best_y: i32 = -1;

    var x: i32 = 2;
    while (x < @as(i32, GRID_W) - 3) : (x += 1) {
        var y: i32 = 2;
        while (y < @as(i32, GRID_H) - 3) : (y += 1) {
            // Check buildable
            var buildable = true;
            for (FOOTPRINT) |off| {
                const fx: usize = @intCast(x + off[0]);
                const fy: usize = @intCast(y + off[1]);
                if (!st.grid[fy][fx].isBuildable()) {
                    buildable = false;
                    break;
                }
            }
            if (!buildable) continue;

            const s = scorePlacement(st, x, y);
            if (s > best_score) {
                best_score = s;
                best_x = x;
                best_y = y;
            }
        }
    }

    if (best_x >= 0) return .{ .x = best_x, .y = best_y };
    return null;
}

fn keeperScore(st: *const state_mod.State, t: *const state_mod.TowerState) f32 {
    const stats = gems_mod.gemStats(t.gem, t.quality);
    const dmg_mid = @as(f32, @floatFromInt(stats.dmg_min + stats.dmg_max)) / 2.0;
    const dps = dmg_mid * stats.atk_speed;
    const exp = exposure(st, t.x, t.y, stats.range);
    return dps * (1.0 + exp * 0.1);
}

pub fn playBuild(game: *Game) void {
    const st = &game.state;

    // Upgrade chance tier
    if (st.wave > 1) {
        while (st.gold > GOLD_RESERVE) {
            if (!build_phase.upgradeChanceTier(st)) break;
        }
        // Start placement
        _ = game.cmdStartPlacement();
    }

    // Place all 5 gems at best positions
    for (0..st.draw_count) |i| {
        game.cmdSetActiveSlot(@intCast(i));
        if (findBestPosition(st)) |pos| {
            _ = game.cmdPlace(pos.x, pos.y);
        }
    }

    // Skip combine logic for now (matches basic GreedyAI behavior)

    // Designate keeper: pick the tower with highest score
    if (st.phase == .build) {
        var best_id: i32 = -1;
        var best_score: f32 = -1;
        for (0..st.draw_count) |i| {
            const tid = st.draws[i].placed_tower_id;
            if (tid < 0) continue;
            if (st.findTowerConst(tid)) |t| {
                const s = keeperScore(st, t);
                if (s > best_score) {
                    best_score = s;
                    best_id = tid;
                }
            }
        }
        if (best_id >= 0) {
            _ = game.cmdDesignateKeep(best_id);
        }
    }
}

pub fn runGame(seed: u32) Game.GameResult {
    var game = Game.init(seed);
    game.newGame();

    var iters: usize = 0;
    while (iters < 200) : (iters += 1) {
        if (game.state.phase != .build) break;
        playBuild(&game);
        if (game.state.phase != .wave) {
            if (game.state.allDrawsPlaced() and game.state.designated_keep_tower_id >= 0) {
                game.enterWave();
            } else {
                break;
            }
        }
        if (game.state.phase != .wave) break;
        game.runWave();
        if (game.state.phase == .wave) {
            game.state.phase = .gameover;
            break;
        }
    }

    return .{
        .seed = seed,
        .wave_reached = game.state.wave,
        .final_gold = game.state.gold,
        .final_lives = game.state.lives,
        .outcome = game.state.phase,
    };
}

test "greedy AI runs seed 42" {
    const result = runGame(42);
    try std.testing.expect(result.wave_reached >= 3);
    try std.testing.expect(result.outcome == .gameover or result.outcome == .victory);
}

test "greedy AI runs 10 seeds" {
    for (1..11) |s| {
        const result = runGame(@intCast(s));
        try std.testing.expect(result.wave_reached >= 1);
    }
}
