const std = @import("std");
const types = @import("types.zig");
const constants = @import("constants.zig");
const state_mod = @import("state.zig");
const waves_mod = @import("waves.zig");
const creeps_mod = @import("creeps.zig");
const rng_mod = @import("rng.zig");
const combat = @import("combat.zig");

const TILE = constants.TILE;
const FINE_TILE = constants.FINE_TILE;
const GRID_SCALE = constants.GRID_SCALE;
const SIM_DT = constants.SIM_DT;
const SIM_HZ = constants.SIM_HZ;
const SIM_HZ_INT = constants.SIM_HZ_INT;

const HEALER_INTERVAL = 5 * SIM_HZ_INT;
const HEALER_RADIUS_PX = 3.0 * TILE;
const HEALER_BUFF_DURATION = 2 * SIM_HZ_INT;
const HEALER_HEAL_PCT: f32 = 0.00075;

const WIZARD_COOLDOWN = 12 * SIM_HZ_INT;
const WIZARD_RADIUS_PX = 3.0 * TILE;
const WIZARD_TELEPORT_TILES: f32 = 8.0;

const TUNNELER_COOLDOWN = 12 * SIM_HZ_INT;
const TUNNELER_BURROW_DURATION: i32 = @intFromFloat(3.5 * SIM_HZ);

pub const WavePhaseState = struct {
    wave: i32 = 0,
    spawned_so_far: i32 = 0,
    spawn_timer: f32 = 0,
    elapsed: f32 = 0,
    gold_earned: i32 = 0,
    lives_at_start: i32 = 0,
};

pub fn onEnter(wps: *WavePhaseState, st: *state_mod.State) void {
    wps.wave = st.wave;
    wps.spawned_so_far = 0;
    wps.spawn_timer = 0;
    wps.elapsed = 0;
    wps.gold_earned = 0;
    wps.lives_at_start = st.lives;

    const def = waveDef(st) orelse return;
    st.wave_stats = .{
        .spawned = 0,
        .killed = 0,
        .leaked = 0,
        .total_to_spawn = waves_mod.waveTotalCount(def),
    };
}

fn waveDef(st: *const state_mod.State) ?*const waves_mod.WaveDef {
    if (st.wave < 1 or st.wave > @as(i32, @intCast(waves_mod.WAVES.len))) return null;
    return &waves_mod.WAVES[@intCast(st.wave - 1)];
}

pub fn stepWave(wps: *WavePhaseState, st: *state_mod.State, rng: *rng_mod.RNG, next_id: *i32) void {
    if (st.phase != .wave) return;
    const def = waveDef(st) orelse return;

    wps.elapsed += SIM_DT;
    wps.spawn_timer += SIM_DT;

    const total = waves_mod.waveTotalCount(def);

    // Spawn
    if (wps.spawned_so_far < total and wps.spawn_timer >= def.interval) {
        wps.spawn_timer = 0;
        spawnCreep(wps, st, def, rng, next_id);
    } else if (wps.spawned_so_far < total and wps.spawned_so_far == 0) {
        spawnCreep(wps, st, def, rng, next_id);
    }

    // Advance creeps
    for (0..st.creep_count) |i| {
        const c = &st.creeps[i];
        if (!c.alive) continue;
        advanceCreep(wps, st, c, i, rng, next_id);
        if (st.phase != .wave) return;
    }

    // Creep abilities
    for (0..st.creep_count) |i| {
        const c = &st.creeps[i];
        if (!c.alive) continue;
        tickAbility(st, c, i);
    }

    // Prune dead creeps, check wave end
    st.pruneDeadCreeps();
    if (wps.spawned_so_far >= total) {
        var all_dead = true;
        for (0..st.creep_count) |i| {
            if (st.creeps[i].alive) {
                all_dead = false;
                break;
            }
        }
        if (all_dead) endWave(wps, st);
    }
}

fn spawnCreep(wps: *WavePhaseState, st: *state_mod.State, def: *const waves_mod.WaveDef, _: *rng_mod.RNG, next_id: *i32) void {
    const group = waves_mod.groupForSpawn(def, wps.spawned_so_far);
    const arch = creeps_mod.archetype(group.kind);
    const is_air = arch.flags.air;
    const route = if (is_air) st.air_route[0..st.air_route_len] else st.flat_route[0..st.flat_route_len];
    if (route.len == 0) return;

    const start = route[0];
    const id = next_id.*;
    next_id.* += 1;
    const hp: i32 = @intFromFloat(@round(@as(f32, @floatFromInt(group.hp)) * arch.hp_mult));
    const bounty: i32 = @intFromFloat(@round(@as(f32, @floatFromInt(group.bounty)) * arch.bounty_mult));
    const armor: i32 = if (group.armor >= 0) group.armor else arch.default_armor;

    var creep = state_mod.CreepState{
        .id = id,
        .kind = arch.kind,
        .path_pos = 0,
        .px = @as(f32, @floatFromInt(start.x)) * FINE_TILE + FINE_TILE / 2.0,
        .py = @as(f32, @floatFromInt(start.y)) * FINE_TILE + FINE_TILE / 2.0,
        .hp = hp,
        .max_hp = hp,
        .speed = arch.speed,
        .bounty = bounty,
        .color = arch.color,
        .alive = true,
        .armor = armor,
        .slow_resist = group.slow_resist,
        .flags = arch.flags,
    };

    // Resolve payload
    if (group.payload) |payload_groups| {
        const start_idx = st.payload_pool_count;
        resolvePayload(st, payload_groups);
        const count = st.payload_pool_count - start_idx;
        if (count > 0) {
            creep.payload_index = @intCast(start_idx);
            creep.payload_count = @intCast(count);
        }
    }

    _ = st.addCreep(creep);
    wps.spawned_so_far += 1;
    st.wave_stats.spawned += 1;
}

fn resolvePayload(st: *state_mod.State, groups: []const waves_mod.PayloadGroup) void {
    for (groups) |pg| {
        const arch = creeps_mod.archetype(pg.kind);
        const entry = state_mod.PayloadEntry{
            .kind = pg.kind,
            .count = pg.count,
            .hp = @intFromFloat(@round(@as(f32, @floatFromInt(pg.hp)) * arch.hp_mult)),
            .speed = arch.speed,
            .bounty = @intFromFloat(@round(@as(f32, @floatFromInt(pg.bounty)) * arch.bounty_mult)),
            .color = arch.color,
            .armor = if (pg.armor > 0) pg.armor else arch.default_armor,
            .slow_resist = pg.slow_resist,
            .flags = arch.flags,
        };

        if (pg.payload) |child_groups| {
            const child_start = st.payload_pool_count + 1; // +1 because we haven't added this entry yet
            // We need to add this entry first, then resolve children
            const my_idx = st.addPayload(entry);
            _ = my_idx;
            const actual_child_start = st.payload_pool_count;
            resolvePayload(st, child_groups);
            const child_count = st.payload_pool_count - actual_child_start;
            // Patch the entry we just added
            if (st.payload_pool_count > 0) {
                const parent_idx: usize = @intCast(actual_child_start - 1);
                if (parent_idx < state_mod.MAX_PAYLOAD_POOL) {
                    st.payload_pool[parent_idx].child_index = @intCast(actual_child_start);
                    st.payload_pool[parent_idx].child_count = @intCast(child_count);
                }
            }
            _ = child_start;
        } else {
            _ = st.addPayload(entry);
        }
    }
}

fn advanceCreep(wps: *WavePhaseState, st: *state_mod.State, c: *state_mod.CreepState, ci: usize, rng: *rng_mod.RNG, next_id: *i32) void {
    if (c.stun_expires > st.tick) return;

    var speed = c.speed;
    if (c.slow_expires > st.tick) {
        speed *= c.slow_factor;
    }
    if (c.prox_slow_factor < 1.0) {
        speed *= c.prox_slow_factor;
    }

    const is_air = c.flags.air;
    const route = if (is_air) st.air_route[0..st.air_route_len] else st.flat_route[0..st.flat_route_len];
    if (route.len == 0) return;

    c.path_pos += speed * GRID_SCALE * SIM_DT;
    if (c.path_pos >= @as(f32, @floatFromInt(route.len)) - 1.0) {
        c.alive = false;
        leak(wps, st, c);
        return;
    }

    const idx: usize = @intFromFloat(@floor(c.path_pos));
    const t_a = route[idx];
    const t_b = if (idx + 1 < route.len) route[idx + 1] else t_a;
    const frac = c.path_pos - @as(f32, @floatFromInt(idx));
    c.px = (@as(f32, @floatFromInt(t_a.x)) + @as(f32, @floatFromInt(t_b.x - t_a.x)) * frac) * FINE_TILE + FINE_TILE / 2.0;
    c.py = (@as(f32, @floatFromInt(t_a.y)) + @as(f32, @floatFromInt(t_b.y - t_a.y)) * frac) * FINE_TILE + FINE_TILE / 2.0;

    // Clear expired buffs
    if (c.burrow_expires > 0 and c.burrow_expires <= st.tick) c.burrow_expires = 0;
    if (c.heal_expires > 0 and c.heal_expires <= st.tick) {
        c.heal_hp_per_tick = 0;
        c.heal_expires = 0;
    }
    if (c.armor_debuff_expires > 0 and c.armor_debuff_expires <= st.tick) {
        c.armor_debuff_value = 0;
        c.armor_debuff_expires = 0;
    }

    // Heal buff ticks
    if (c.heal_hp_per_tick > 0 and c.heal_expires > st.tick) {
        c.hp = @min(c.max_hp, c.hp + @as(i32, @intFromFloat(c.heal_hp_per_tick)));
    }

    // Poison ticks
    if (c.poison_dps > 0 and c.poison_expires > st.tick) {
        if (st.tick >= c.poison_next_tick) {
            c.hp -= @as(i32, @intFromFloat(c.poison_dps));
            c.poison_next_tick = st.tick + SIM_HZ_INT;
        }
    }

    if (c.hp <= 0) {
        kill(wps, st, c, ci, rng, next_id);
    }
}

fn leak(wps: *WavePhaseState, st: *state_mod.State, c: *const state_mod.CreepState) void {
    const wave_num = st.wave;
    const base_cost: i32 = if (c.flags.boss) 6 else 1;
    const cost = base_cost + @divFloor(wave_num, 10);
    st.lives = @max(0, st.lives - cost);
    st.wave_stats.leaked += 1;

    if (st.lives <= 0) {
        endWave(wps, st);
    }
}

fn kill(wps: *WavePhaseState, st: *state_mod.State, c: *state_mod.CreepState, ci: usize, rng: *rng_mod.RNG, next_id: *i32) void {
    c.alive = false;
    st.gold += c.bounty;
    st.total_kills += 1;
    st.wave_stats.killed += 1;
    wps.gold_earned += c.bounty;
    combat.handleDeathEffects(st, ci, rng, next_id);
}

fn tickAbility(st: *state_mod.State, c: *state_mod.CreepState, ci: usize) void {
    const tick = st.tick;
    if (c.stun_expires > tick) return;
    if (c.ability_cooldown > tick) return;

    switch (c.kind) {
        .healer => healerAbility(st, c, ci, tick),
        .wizard => wizardAbility(st, c, ci, tick),
        .tunneler => tunnelerAbility(c, tick),
        else => {},
    }
}

fn healerAbility(st: *state_mod.State, c: *state_mod.CreepState, _: usize, tick: i32) void {
    c.ability_cooldown = tick + HEALER_INTERVAL;
    const r2 = HEALER_RADIUS_PX * HEALER_RADIUS_PX;

    for (0..st.creep_count) |i| {
        const other = &st.creeps[i];
        if (!other.alive or other.id == c.id) continue;
        const dx = other.px - c.px;
        const dy = other.py - c.py;
        if (dx * dx + dy * dy > r2) continue;
        if (other.heal_expires > tick) continue;
        const hp_per_tick = @max(@as(f32, 1), @round(@as(f32, @floatFromInt(other.max_hp)) * HEALER_HEAL_PCT));
        other.heal_hp_per_tick = hp_per_tick;
        other.heal_expires = tick + HEALER_BUFF_DURATION;
    }
}

fn wizardAbility(st: *state_mod.State, c: *state_mod.CreepState, _: usize, tick: i32) void {
    c.ability_cooldown = tick + WIZARD_COOLDOWN;
    const r2 = WIZARD_RADIUS_PX * WIZARD_RADIUS_PX;

    // Compute waypoint positions along route
    var wp_positions: [8]f32 = .{0} ** 8;
    var wp_count: usize = 0;
    var cum_len: f32 = 0;
    for (0..st.segment_count) |i| {
        const seg_len: f32 = @floatFromInt(st.segment_lengths[i]);
        cum_len += seg_len - if (i > 0) @as(f32, 1.0) else @as(f32, 0.0);
        if (wp_count < 8) {
            wp_positions[wp_count] = cum_len - 1.0;
            wp_count += 1;
        }
    }

    for (0..st.creep_count) |i| {
        const other = &st.creeps[i];
        if (!other.alive or other.id == c.id) continue;
        if (other.flags.air) continue;
        const dx = other.px - c.px;
        const dy = other.py - c.py;
        if (dx * dx + dy * dy > r2) continue;

        // Find next waypoint
        var next_wp: ?f32 = null;
        for (0..wp_count) |wi| {
            if (wp_positions[wi] > other.path_pos) {
                next_wp = wp_positions[wi];
                break;
            }
        }
        if (next_wp) |nwp| {
            const max_advance = nwp - other.path_pos;
            const advance = @min(WIZARD_TELEPORT_TILES, max_advance);
            other.path_pos += advance;
        }
    }
}

fn tunnelerAbility(c: *state_mod.CreepState, tick: i32) void {
    if (c.burrow_expires > tick) return;
    c.ability_cooldown = tick + TUNNELER_COOLDOWN;
    c.burrow_expires = tick + TUNNELER_BURROW_DURATION;
}

fn endWave(wps: *WavePhaseState, st: *state_mod.State) void {
    const def = waveDef(st) orelse return;
    const life_lost = wps.lives_at_start - st.lives;
    _ = life_lost;

    if (st.wave_stats.leaked == 0) {
        st.gold += def.bonus;
        wps.gold_earned += def.bonus;
    }

    // Transition: check for gameover or victory, else enter build
    if (st.lives <= 0) {
        st.phase = .gameover;
        return;
    }
    if (st.wave >= st.total_waves) {
        st.phase = .victory;
        return;
    }
    // Transition to next build phase (mirrors TS HeadlessGame.endWave → enterBuild)
    st.phase = .build;
    st.wave += 1;
    st.designated_keep_tower_id = -1;
    st.downgrade_used_this_round = false;
    st.wave_stats = .{};
}
