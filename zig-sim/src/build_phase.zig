const std = @import("std");
const types = @import("types.zig");
const constants = @import("constants.zig");
const state_mod = @import("state.zig");
const map_mod = @import("map.zig");
const pathfinding = @import("pathfinding.zig");
const rng_mod = @import("rng.zig");
const combos_mod = @import("combos.zig");

const GRID_W = constants.GRID_W;
const GRID_H = constants.GRID_H;
const GRID_SIZE = GRID_W * GRID_H;
const DRAW_COUNT = constants.DRAW_COUNT;

const FOOTPRINT: [4][2]i32 = .{ .{ 0, 0 }, .{ 1, 0 }, .{ 0, 1 }, .{ 1, 1 } };

fn setFootprint(st: *state_mod.State, ax: i32, ay: i32, cell: types.Cell) void {
    for (FOOTPRINT) |off| {
        const x: usize = @intCast(ax + off[0]);
        const y: usize = @intCast(ay + off[1]);
        st.grid[y][x] = cell;
    }
}

fn footprintBuildable(st: *const state_mod.State, ax: i32, ay: i32) bool {
    for (FOOTPRINT) |off| {
        const x: usize = @intCast(ax + off[0]);
        const y: usize = @intCast(ay + off[1]);
        if (!st.grid[y][x].isBuildable()) return false;
    }
    return true;
}

pub fn rollDraws(st: *state_mod.State, rng: *rng_mod.RNG) void {
    st.draw_count = 0;

    const GemType = types.GemType;
    const gem_types = [_]GemType{ .ruby, .sapphire, .emerald, .topaz, .amethyst, .opal, .diamond, .aquamarine };

    if (st.wave == 1) {
        // Guarantee ingredients for a random early-game special
        const recipes = [_][3]GemType{
            .{ .topaz, .diamond, .sapphire },
            .{ .opal, .emerald, .aquamarine },
        };
        const recipe = recipes[rng.int(2)];

        var gems: [DRAW_COUNT]struct { gem: GemType, quality: types.Quality } = undefined;
        for (0..3) |i| {
            gems[i] = .{ .gem = recipe[i], .quality = .chipped };
        }
        for (3..DRAW_COUNT) |i| {
            gems[i] = .{ .gem = gem_types[rng.int(GemType.count)], .quality = rng.pickQuality(st.chance_tier) };
        }
        // Shuffle
        var i: usize = DRAW_COUNT;
        while (i > 1) {
            i -= 1;
            const j = rng.int(@intCast(i + 1));
            const tmp = gems[i];
            gems[i] = gems[j];
            gems[j] = tmp;
        }

        for (0..DRAW_COUNT) |di| {
            st.draws[di] = .{ .slot_id = di, .gem = gems[di].gem, .quality = gems[di].quality, .placed_tower_id = -1 };
        }
    } else {
        for (0..DRAW_COUNT) |i| {
            const gem = gem_types[rng.int(GemType.count)];
            const quality = rng.pickQuality(st.chance_tier);
            st.draws[i] = .{ .slot_id = i, .gem = gem, .quality = quality, .placed_tower_id = -1 };
        }
    }

    st.draw_count = DRAW_COUNT;
    st.active_draw_slot = 0;
}

pub fn place(st: *state_mod.State, x: i32, y: i32, next_id: *i32) bool {
    if (st.phase != .build) return false;

    const slot = st.activeDraw() orelse return false;

    if (x < 0 or y < 0 or x + 1 >= @as(i32, GRID_W) or y + 1 >= @as(i32, GRID_H)) return false;
    if (!footprintBuildable(st, x, y)) return false;

    // Tentatively block and check route
    var extra: [GRID_SIZE]bool = .{false} ** GRID_SIZE;
    for (FOOTPRINT) |off| {
        const fx: usize = @intCast(x + off[0]);
        const fy: usize = @intCast(y + off[1]);
        extra[fy * GRID_W + fx] = true;
    }
    var temp_st = st.*;
    if (!pathfinding.findRoute(&st.grid, &extra, &temp_st)) return false;

    // Commit
    const id = next_id.*;
    next_id.* += 1;
    const tower = state_mod.TowerState{
        .id = id,
        .x = x,
        .y = y,
        .gem = slot.gem,
        .quality = slot.quality,
        .last_fire_tick = 0,
        .kills = 0,
        .total_damage = 0,
        .placed_wave = st.wave,
        .active = true,
    };
    _ = st.addTower(tower);
    setFootprint(st, x, y, .tower);
    slot.placed_tower_id = id;
    st.active_draw_slot = st.nextUnplacedSlot();

    // Refresh route
    _ = pathfinding.findRoute(&st.grid, null, st);

    return true;
}

pub fn designateKeep(st: *state_mod.State, tower_id: i32) bool {
    if (st.phase != .build) return false;
    var is_current_draw = false;
    for (0..st.draw_count) |i| {
        if (st.draws[i].placed_tower_id == tower_id) {
            is_current_draw = true;
            break;
        }
    }
    if (!is_current_draw) return false;
    st.designated_keep_tower_id = tower_id;
    return true;
}

pub fn applyKeepAndRock(st: *state_mod.State, next_id: *i32) void {
    const keep_id = st.designated_keep_tower_id;

    for (0..st.draw_count) |di| {
        const tower_id = st.draws[di].placed_tower_id;
        if (tower_id < 0) continue;
        if (tower_id == keep_id) continue;

        // Find and remove tower, replace with rocks
        if (st.findTower(tower_id)) |t| {
            const tx = t.x;
            const ty = t.y;
            st.removeTower(tower_id);

            // Place rock footprint
            const rock_id = next_id.*;
            next_id.* += 1;
            for (FOOTPRINT) |off| {
                const fx: usize = @intCast(tx + off[0]);
                const fy: usize = @intCast(ty + off[1]);
                st.grid[fy][fx] = .rock;
                st.addRock(.{
                    .x = tx + off[0],
                    .y = ty + off[1],
                    .id = rock_id,
                    .placed_wave = st.wave,
                    .active = true,
                });
            }
        }
    }

    _ = pathfinding.findRoute(&st.grid, null, st);
}

pub fn combine(st: *state_mod.State, tower_ids: []const i32, next_id: *i32) bool {
    if (tower_ids.len < 2) return false;

    // Gather towers
    var towers: [4]*state_mod.TowerState = undefined;
    var tower_count: usize = 0;
    for (tower_ids) |id| {
        if (st.findTower(id)) |t| {
            towers[tower_count] = t;
            tower_count += 1;
        }
    }
    if (tower_count != tower_ids.len) return false;

    // Check if all are current round
    var current_round_ids: [DRAW_COUNT]i32 = undefined;
    var cr_count: usize = 0;
    for (0..st.draw_count) |i| {
        if (st.draws[i].placed_tower_id >= 0) {
            current_round_ids[cr_count] = st.draws[i].placed_tower_id;
            cr_count += 1;
        }
    }

    var all_current = true;
    for (0..tower_count) |i| {
        var found = false;
        for (0..cr_count) |j| {
            if (towers[i].id == current_round_ids[j]) {
                found = true;
                break;
            }
        }
        if (!found) all_current = false;
    }

    // Level-up: same gem, same quality, 2 or 4 towers, all current round
    const same_gem = blk: {
        for (1..tower_count) |i| {
            if (towers[i].gem != towers[0].gem) break :blk false;
        }
        break :blk true;
    };
    const same_quality = blk: {
        for (1..tower_count) |i| {
            if (towers[i].quality != towers[0].quality) break :blk false;
        }
        break :blk true;
    };

    if (same_gem and same_quality and (tower_count == 2 or tower_count == 4)) {
        if (st.phase != .build or !all_current) return false;
        const q = @intFromEnum(towers[0].quality);
        const bump: u8 = if (tower_count == 2) 1 else 2;
        const new_q = @min(@as(u8, 5), q + bump);
        if (new_q == q) return false;

        const new_id = commitTransform(st, towers[0..tower_count], towers[0].gem, types.Quality.fromInt(new_q), null, next_id);
        autoConcludeRound(st, new_id, next_id);
        return true;
    }

    // Recipe path
    var inputs: [4]combos_mod.ComboInput = undefined;
    for (0..tower_count) |i| {
        inputs[i] = .{ .gem = towers[i].gem, .quality = towers[i].quality };
    }
    const combo_key = combos_mod.findCombo(inputs[0..tower_count]) orelse return false;
    const combo = combos_mod.comboByKey(combo_key);

    // During build: at most 1 current-round piece if mixed
    if (st.phase == .build and !all_current) {
        var cr_in_combo: usize = 0;
        for (0..tower_count) |i| {
            for (0..cr_count) |j| {
                if (towers[i].id == current_round_ids[j]) cr_in_combo += 1;
            }
        }
        if (cr_in_combo > 1) return false;
    }

    var max_q: u8 = 0;
    for (0..tower_count) |i| {
        const q = @intFromEnum(towers[i].quality);
        if (q > max_q) max_q = q;
    }

    var input_touched_round = false;
    if (st.phase == .build) {
        for (0..tower_count) |i| {
            for (0..cr_count) |j| {
                if (towers[i].id == current_round_ids[j]) input_touched_round = true;
            }
        }
    }

    const new_id = commitTransform(st, towers[0..tower_count], combo.visual_gem, types.Quality.fromInt(max_q), combo_key, next_id);
    if (input_touched_round) {
        autoConcludeRound(st, new_id, next_id);
    }
    return true;
}

fn commitTransform(
    st: *state_mod.State,
    inputs: []const *state_mod.TowerState,
    out_gem: types.GemType,
    out_quality: types.Quality,
    combo_key: ?combos_mod.ComboKey,
    next_id: *i32,
) i32 {
    const base_x = inputs[0].x;
    const base_y = inputs[0].y;

    // Remove all input towers
    var input_ids: [4]i32 = .{-1} ** 4;
    for (0..inputs.len) |i| {
        input_ids[i] = inputs[i].id;
        setFootprint(st, inputs[i].x, inputs[i].y, .grass);
    }
    for (input_ids[0..inputs.len]) |id| {
        if (id >= 0) st.removeTower(id);
    }

    // Create new tower
    const is_trap = if (combo_key) |key| combos_mod.comboByKey(key).is_trap else false;
    const new_id = next_id.*;
    next_id.* += 1;
    _ = st.addTower(.{
        .id = new_id,
        .x = base_x,
        .y = base_y,
        .gem = out_gem,
        .quality = out_quality,
        .combo_key = combo_key,
        .last_fire_tick = 0,
        .kills = 0,
        .total_damage = 0,
        .placed_wave = st.wave,
        .is_trap = is_trap,
        .active = true,
    });
    setFootprint(st, base_x, base_y, if (is_trap) .trap else .tower);

    // Rock other input positions
    for (1..inputs.len) |i| {
        const rock_id = next_id.*;
        next_id.* += 1;
        for (FOOTPRINT) |off| {
            const fx: usize = @intCast(inputs[i].x + off[0]);
            const fy: usize = @intCast(inputs[i].y + off[1]);
            st.grid[fy][fx] = .rock;
            st.addRock(.{ .x = inputs[i].x + off[0], .y = inputs[i].y + off[1], .id = rock_id, .placed_wave = st.wave, .active = true });
        }
    }

    _ = pathfinding.findRoute(&st.grid, null, st);

    // Update draw slots
    for (0..st.draw_count) |di| {
        for (input_ids[0..inputs.len]) |iid| {
            if (st.draws[di].placed_tower_id == iid) {
                st.draws[di].placed_tower_id = -1;
            }
        }
    }
    // If all inputs were current-round, assign new tower to first slot
    if (st.draw_count > 0) {
        for (0..st.draw_count) |di| {
            if (st.draws[di].placed_tower_id < 0) {
                st.draws[di].placed_tower_id = new_id;
                break;
            }
        }
    }

    return new_id;
}

fn autoConcludeRound(st: *state_mod.State, keep_tower_id: i32, next_id: *i32) void {
    // Rock all other current-round towers
    for (0..st.draw_count) |di| {
        const id = st.draws[di].placed_tower_id;
        if (id < 0 or id == keep_tower_id) continue;
        if (st.findTower(id)) |t| {
            const tx = t.x;
            const ty = t.y;
            st.removeTower(id);
            const rock_id = next_id.*;
            next_id.* += 1;
            for (FOOTPRINT) |off| {
                const fx: usize = @intCast(tx + off[0]);
                const fy: usize = @intCast(ty + off[1]);
                st.grid[fy][fx] = .rock;
                st.addRock(.{ .x = tx + off[0], .y = ty + off[1], .id = rock_id, .placed_wave = st.wave, .active = true });
            }
        }
    }
    st.draw_count = 0;
    st.active_draw_slot = -1;
    st.designated_keep_tower_id = keep_tower_id;
    _ = pathfinding.findRoute(&st.grid, null, st);
}

pub fn upgradeTower(st: *state_mod.State, tower_id: i32) bool {
    const tower = st.findTower(tower_id) orelse return false;
    const combo_key = tower.combo_key orelse return false;
    const combo = combos_mod.comboByKey(combo_key);
    const current_tier = tower.upgrade_tier;
    const upgrade = combos_mod.nextUpgrade(combo, current_tier) orelse return false;
    if (st.gold < upgrade.cost) return false;
    st.gold -= upgrade.cost;
    tower.upgrade_tier = current_tier + 1;
    return true;
}

pub fn upgradeChanceTier(st: *state_mod.State) bool {
    if (st.phase != .build) return false;
    if (st.chance_tier >= constants.MAX_CHANCE_TIER) return false;
    const cost = constants.CHANCE_TIER_UPGRADE_COST[st.chance_tier];
    if (st.gold < cost) return false;
    st.gold -= cost;
    st.chance_tier += 1;
    return true;
}
