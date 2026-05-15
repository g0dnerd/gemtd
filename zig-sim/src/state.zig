const std = @import("std");
const types = @import("types.zig");
const combos = @import("combos.zig");
const constants = @import("constants.zig");
const map_mod = @import("map.zig");
const waves = @import("waves.zig");
const creeps_mod = @import("creeps.zig");

pub const MAX_TOWERS: usize = 128;
pub const MAX_CREEPS: usize = 512;
pub const MAX_PROJECTILES: usize = 256;
pub const MAX_ROCKS: usize = 512;
pub const MAX_ROUTE: usize = 2048;

pub const TowerState = struct {
    id: i32 = 0,
    x: i32 = 0,
    y: i32 = 0,
    gem: types.GemType = .ruby,
    quality: types.Quality = .chipped,
    combo_key: ?combos.ComboKey = null,
    upgrade_tier: u8 = 0,
    last_fire_tick: i32 = 0,
    kills: i32 = 0,
    total_damage: i64 = 0,
    placed_wave: i32 = 0,
    is_trap: bool = false,
    // Beam state
    beam_target_id: i32 = -1,
    beam_stacks: i32 = 0,
    // Periodic nova attack counter
    attack_count: i32 = 0,
    // Focus crit tracking
    focus_target_id: i32 = -1,
    focus_stacks: i32 = 0,
    // Burn exposure per-creep (simplified: store last 64 creep IDs and their exposure ticks)
    burn_exposure_ids: [64]i32 = .{-1} ** 64,
    burn_exposure_ticks: [64]i32 = .{0} ** 64,
    // Periodic freeze
    last_freeze_tick: i32 = 0,
    // Linger burn tracking
    burn_aura_creep_ids: [MAX_CREEPS]i32 = .{-1} ** MAX_CREEPS,
    burn_aura_count: usize = 0,
    last_trigger_tick: i32 = 0,
    active: bool = false,
};

pub const CreepState = struct {
    id: i32 = 0,
    kind: types.CreepKind = .normal,
    path_pos: f32 = 0,
    px: f32 = 0,
    py: f32 = 0,
    hp: i32 = 0,
    max_hp: i32 = 0,
    armor: i32 = 0,
    speed: f32 = 0,
    bounty: i32 = 0,
    color: types.GemType = .ruby,
    slow_resist: f32 = 0,
    flags: creeps_mod.CreepFlags = .{},
    alive: bool = false,
    // Status effects
    slow_factor: f32 = 1.0,
    slow_expires: i32 = 0,
    poison_dps: f32 = 0,
    poison_expires: i32 = 0,
    poison_next_tick: i32 = 0,
    stun_expires: i32 = 0,
    armor_reduction: f32 = 0, // proximity aura, reset each tick
    armor_debuff_value: f32 = 0,
    armor_debuff_expires: i32 = 0,
    prox_slow_factor: f32 = 1.0,
    vulnerability: f32 = 0,
    radiation_armor: f32 = 0,
    // Heal buff
    heal_hp_per_tick: f32 = 0,
    heal_expires: i32 = 0,
    // Tunneler burrow
    burrow_expires: i32 = 0,
    ability_cooldown: i32 = 0,
    // Linger burn
    linger_dps: f32 = 0,
    linger_ticks_left: i32 = 0,
    linger_owner_id: i32 = -1,
    // Stacking armor shred
    armor_stack_count: i32 = 0,
    armor_stack_per: f32 = 0,
    armor_stack_decay_ticks: i32 = 0,
    armor_stack_last_decay: i32 = 0,
    // Poison spread on death
    poison_spread_count: i32 = 0,
    poison_spread_radius: f32 = 0,
    // Container payload (index into payload pool)
    payload_index: i32 = -1,
    payload_count: i32 = 0,
};

pub const ProjectileState = struct {
    id: i32 = 0,
    from_x: f32 = 0,
    from_y: f32 = 0,
    to_x: f32 = 0,
    to_y: f32 = 0,
    target_id: i32 = 0,
    t: f32 = 0,
    speed: f32 = 0,
    damage: i32 = 0,
    owner_tower_id: i32 = 0,
    color: types.GemType = .ruby,
    alive: bool = false,
    was_crit: bool = false,
};

pub const RockState = struct {
    x: i32 = 0,
    y: i32 = 0,
    id: i32 = 0,
    placed_wave: i32 = 0,
    active: bool = false,
};

pub const DrawSlot = struct {
    slot_id: usize = 0,
    gem: types.GemType = .ruby,
    quality: types.Quality = .chipped,
    placed_tower_id: i32 = -1, // -1 = not placed
};

pub const WaveStats = struct {
    spawned: i32 = 0,
    killed: i32 = 0,
    leaked: i32 = 0,
    total_to_spawn: i32 = 0,
};

pub const PayloadEntry = struct {
    kind: types.CreepKind = .normal,
    count: i32 = 0,
    hp: i32 = 0,
    speed: f32 = 0,
    bounty: i32 = 0,
    color: types.GemType = .ruby,
    armor: i32 = 0,
    slow_resist: f32 = 0,
    flags: creeps_mod.CreepFlags = .{},
    // For nested payloads
    child_index: i32 = -1,
    child_count: i32 = 0,
};

pub const MAX_PAYLOAD_POOL: usize = 256;

pub const State = struct {
    phase: types.Phase = .title,
    wave: i32 = 0,
    lives: i32 = 0,
    gold: i32 = 0,
    total_kills: i32 = 0,
    tick: i32 = 0,
    total_waves: i32 = 0,
    chance_tier: usize = 0,
    designated_keep_tower_id: i32 = -1,
    kept_tower_id_this_round: i32 = -1,
    rocks_removed: i32 = 0,
    downgrade_used_this_round: bool = false,

    grid: map_mod.Grid = undefined,
    towers: [MAX_TOWERS]TowerState = undefined,
    tower_count: usize = 0,
    rocks: [MAX_ROCKS]RockState = undefined,
    rock_count: usize = 0,
    creeps: [MAX_CREEPS]CreepState = undefined,
    creep_count: usize = 0,
    projectiles: [MAX_PROJECTILES]ProjectileState = undefined,
    projectile_count: usize = 0,

    flat_route: [MAX_ROUTE]types.Point = undefined,
    flat_route_len: usize = 0,
    air_route: [MAX_ROUTE]types.Point = undefined,
    air_route_len: usize = 0,

    // Route segments for waypoint position calculation
    segment_lengths: [8]usize = .{0} ** 8,
    segment_count: usize = 0,

    draws: [constants.DRAW_COUNT]DrawSlot = undefined,
    draw_count: usize = 0,
    active_draw_slot: i32 = -1, // -1 = none

    wave_stats: WaveStats = .{},

    // Payload pool for container creeps
    payload_pool: [MAX_PAYLOAD_POOL]PayloadEntry = undefined,
    payload_pool_count: usize = 0,

    pub fn addTower(self: *State, tower: TowerState) *TowerState {
        std.debug.assert(self.tower_count < MAX_TOWERS);
        self.towers[self.tower_count] = tower;
        self.towers[self.tower_count].active = true;
        self.tower_count += 1;
        return &self.towers[self.tower_count - 1];
    }

    pub fn removeTower(self: *State, id: i32) void {
        for (0..self.tower_count) |i| {
            if (self.towers[i].id == id and self.towers[i].active) {
                self.towers[i].active = false;
                // Compact: swap with last
                if (i < self.tower_count - 1) {
                    self.towers[i] = self.towers[self.tower_count - 1];
                }
                self.tower_count -= 1;
                return;
            }
        }
    }

    pub fn findTower(self: *State, id: i32) ?*TowerState {
        for (0..self.tower_count) |i| {
            if (self.towers[i].id == id and self.towers[i].active) return &self.towers[i];
        }
        return null;
    }

    pub fn findTowerConst(self: *const State, id: i32) ?*const TowerState {
        for (0..self.tower_count) |i| {
            if (self.towers[i].id == id and self.towers[i].active) return &self.towers[i];
        }
        return null;
    }

    pub fn addCreep(self: *State, creep: CreepState) *CreepState {
        std.debug.assert(self.creep_count < MAX_CREEPS);
        self.creeps[self.creep_count] = creep;
        self.creep_count += 1;
        return &self.creeps[self.creep_count - 1];
    }

    pub fn addProjectile(self: *State, proj: ProjectileState) void {
        if (self.projectile_count >= MAX_PROJECTILES) return;
        self.projectiles[self.projectile_count] = proj;
        self.projectile_count += 1;
    }

    pub fn addRock(self: *State, rock: RockState) void {
        if (self.rock_count >= MAX_ROCKS) return;
        self.rocks[self.rock_count] = rock;
        self.rocks[self.rock_count].active = true;
        self.rock_count += 1;
    }

    pub fn pruneDeadCreeps(self: *State) void {
        var write: usize = 0;
        for (0..self.creep_count) |i| {
            if (self.creeps[i].alive) {
                self.creeps[write] = self.creeps[i];
                write += 1;
            }
        }
        self.creep_count = write;
    }

    pub fn pruneDeadProjectiles(self: *State) void {
        var write: usize = 0;
        for (0..self.projectile_count) |i| {
            if (self.projectiles[i].alive) {
                self.projectiles[write] = self.projectiles[i];
                write += 1;
            }
        }
        self.projectile_count = write;
    }

    pub fn activeDraw(self: *State) ?*DrawSlot {
        if (self.active_draw_slot < 0) return null;
        const slot_id: usize = @intCast(self.active_draw_slot);
        for (0..self.draw_count) |i| {
            if (self.draws[i].slot_id == slot_id and self.draws[i].placed_tower_id < 0) {
                return &self.draws[i];
            }
        }
        return null;
    }

    pub fn allDrawsPlaced(self: *const State) bool {
        if (self.draw_count == 0) return false;
        for (0..self.draw_count) |i| {
            if (self.draws[i].placed_tower_id < 0) return false;
        }
        return true;
    }

    pub fn nextUnplacedSlot(self: *const State) i32 {
        var min_slot: i32 = -1;
        for (0..self.draw_count) |i| {
            if (self.draws[i].placed_tower_id < 0) {
                const sid: i32 = @intCast(self.draws[i].slot_id);
                if (min_slot < 0 or sid < min_slot) min_slot = sid;
            }
        }
        return min_slot;
    }

    pub fn addPayload(self: *State, entry: PayloadEntry) i32 {
        if (self.payload_pool_count >= MAX_PAYLOAD_POOL) return -1;
        const idx: i32 = @intCast(self.payload_pool_count);
        self.payload_pool[self.payload_pool_count] = entry;
        self.payload_pool_count += 1;
        return idx;
    }
};
