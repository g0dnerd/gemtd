const std = @import("std");
const types = @import("types.zig");
const constants = @import("constants.zig");
const effects_mod = @import("effects.zig");
const gems_mod = @import("gems.zig");
const combos_mod = @import("combos.zig");
const state_mod = @import("state.zig");
const rng_mod = @import("rng.zig");

const TILE = constants.TILE;
const FINE_TILE = constants.FINE_TILE;
const GRID_SCALE = constants.GRID_SCALE;
const SIM_DT = constants.SIM_DT;
const SIM_HZ = constants.SIM_HZ;
const SIM_HZ_INT = constants.SIM_HZ_INT;

const PROJECTILE_PX_PER_SEC: f32 = 480.0;

pub fn armorDamageMultiplier(armor: f32) f32 {
    if (armor >= 0) return 1.0 / (1.0 + armor * 0.06);
    const neg = @min(-armor, 10.0);
    return 2.0 - std.math.pow(f32, 0.94, neg);
}

const ResolvedStats = struct {
    dmg_min: i32,
    dmg_max: i32,
    range: f32,
    atk_speed: f32,
    effects: effects_mod.EffectList,
    visual_gem: types.GemType,
    targeting: types.Targeting,
};

fn towerLevel(t: *const state_mod.TowerState) i32 {
    return @divFloor(t.kills, 10);
}

fn effectiveStats(t: *const state_mod.TowerState) ResolvedStats {
    const lvl = towerLevel(t);
    const mult: f32 = 1.0 + @as(f32, @floatFromInt(lvl)) * 0.05;

    if (t.combo_key) |key| {
        const combo = combos_mod.comboByKey(key);
        const s = combos_mod.comboStatsAtTier(combo, t.upgrade_tier);
        return .{
            .dmg_min = @intFromFloat(@round(@as(f32, @floatFromInt(s.dmg_min)) * mult)),
            .dmg_max = @intFromFloat(@round(@as(f32, @floatFromInt(s.dmg_max)) * mult)),
            .range = s.range,
            .atk_speed = @round(s.atk_speed * mult * 100.0) / 100.0,
            .effects = s.effects,
            .visual_gem = combo.visual_gem,
            .targeting = s.targeting,
        };
    }

    const s = gems_mod.gemStats(t.gem, t.quality);
    return .{
        .dmg_min = @intFromFloat(@round(@as(f32, @floatFromInt(s.dmg_min)) * mult)),
        .dmg_max = @intFromFloat(@round(@as(f32, @floatFromInt(s.dmg_max)) * mult)),
        .range = s.range,
        .atk_speed = @round(s.atk_speed * mult * 100.0) / 100.0,
        .effects = s.effects,
        .visual_gem = t.gem,
        .targeting = s.targeting,
    };
}

const AuraMults = struct {
    atk_speed: [state_mod.MAX_TOWERS]f32,
    dmg: [state_mod.MAX_TOWERS]f32,
};

fn computeAuraMults(st: *const state_mod.State) AuraMults {
    var mults = AuraMults{
        .atk_speed = .{0} ** state_mod.MAX_TOWERS,
        .dmg = .{0} ** state_mod.MAX_TOWERS,
    };

    for (0..st.tower_count) |si| {
        const src = &st.towers[si];
        if (!src.active or src.is_trap) continue;
        const stats = effectiveStats(src);

        for (&stats.effects) |e| {
            if (e.kind == .none) break;
            if (e.kind != .aura_atkspeed and e.kind != .aura_dmg) continue;

            const radius_fine = e.f1 * GRID_SCALE;
            const r2 = radius_fine * radius_fine;

            for (0..st.tower_count) |ti| {
                const tgt = &st.towers[ti];
                if (!tgt.active or tgt.is_trap or tgt.id == src.id) continue;
                const dx: f32 = @floatFromInt(tgt.x - src.x);
                const dy: f32 = @floatFromInt(tgt.y - src.y);
                if (dx * dx + dy * dy > r2) continue;

                if (e.kind == .aura_atkspeed) {
                    mults.atk_speed[ti] += e.f2;
                } else {
                    mults.dmg[ti] += e.f2;
                }
            }
        }
    }
    return mults;
}

fn canTarget(targeting: types.Targeting, creep: *const state_mod.CreepState) bool {
    if (targeting == .all) return true;
    const is_air = creep.flags.air;
    return if (targeting == .air) is_air else !is_air;
}

fn canTargetProx(targeting: types.Targeting, creep: *const state_mod.CreepState) bool {
    return canTarget(targeting, creep);
}

fn isBurrowed(c: *const state_mod.CreepState, tick: i32) bool {
    return c.burrow_expires > tick;
}

fn towerCenter(t: *const state_mod.TowerState) struct { x: f32, y: f32 } {
    return .{
        .x = @as(f32, @floatFromInt(t.x + 1)) * FINE_TILE,
        .y = @as(f32, @floatFromInt(t.y + 1)) * FINE_TILE,
    };
}

fn pickTarget(t: *const state_mod.TowerState, range: f32, st: *const state_mod.State) ?usize {
    const r2 = (range * TILE) * (range * TILE);
    const tc = towerCenter(t);
    var best: ?usize = null;
    var best_pos: f32 = -1;

    for (0..st.creep_count) |i| {
        const c = &st.creeps[i];
        if (!c.alive or isBurrowed(c, st.tick)) continue;
        if (!canTarget(effectiveStats(t).targeting, c)) continue;
        const dx = c.px - tc.x;
        const dy = c.py - tc.y;
        if (dx * dx + dy * dy > r2) continue;
        if (c.path_pos > best_pos) {
            best_pos = c.path_pos;
            best = i;
        }
    }
    return best;
}

fn pickTargets(t: *const state_mod.TowerState, range: f32, st: *const state_mod.State, count: usize, out: []usize) usize {
    const r2 = (range * TILE) * (range * TILE);
    const tc = towerCenter(t);
    var in_range: [state_mod.MAX_CREEPS]struct { idx: usize, pos: f32 } = undefined;
    var n: usize = 0;
    const targeting = effectiveStats(t).targeting;

    for (0..st.creep_count) |i| {
        const c = &st.creeps[i];
        if (!c.alive or isBurrowed(c, st.tick) or !canTarget(targeting, c)) continue;
        const dx = c.px - tc.x;
        const dy = c.py - tc.y;
        if (dx * dx + dy * dy <= r2) {
            in_range[n] = .{ .idx = i, .pos = c.path_pos };
            n += 1;
        }
    }
    // Sort by path_pos descending
    std.sort.insertion(@TypeOf(in_range[0]), in_range[0..n], {}, struct {
        fn f(_: void, a: @TypeOf(in_range[0]), b: @TypeOf(in_range[0])) bool {
            return a.pos > b.pos;
        }
    }.f);
    const result_count = @min(n, @min(count, out.len));
    for (0..result_count) |i| out[i] = in_range[i].idx;
    return result_count;
}

fn nearest(st: *const state_mod.State, x: f32, y: f32, exclude: *const [state_mod.MAX_CREEPS]bool, max_dist: f32) ?usize {
    var best: ?usize = null;
    var best_d2 = max_dist * max_dist;
    for (0..st.creep_count) |i| {
        const c = &st.creeps[i];
        if (!c.alive or exclude[i] or isBurrowed(c, st.tick)) continue;
        const dx = c.px - x;
        const dy = c.py - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= best_d2) {
            best_d2 = d2;
            best = i;
        }
    }
    return best;
}

fn randInt(rng: *rng_mod.RNG, min_v: i32, max_v: i32) i32 {
    if (max_v <= min_v) return min_v;
    return min_v + @as(i32, @intFromFloat(@floor(rng.next() * @as(f32, @floatFromInt(max_v - min_v + 1)))));
}

pub fn step(st: *state_mod.State, rng: *rng_mod.RNG, next_id: *i32) void {
    const tick = st.tick;

    if (st.phase == .wave) {
        // Reset proximity aura effects
        for (0..st.creep_count) |i| {
            if (st.creeps[i].alive) {
                st.creeps[i].armor_reduction = 0;
                st.creeps[i].prox_slow_factor = 1.0;
                st.creeps[i].vulnerability = 0;
            }
        }

        // Apply proximity auras
        var in_burn_aura: [state_mod.MAX_CREEPS]bool = .{false} ** state_mod.MAX_CREEPS;
        applyProximityAuras(st, rng, tick, &in_burn_aura, next_id);

        // Linger burn + armor stack decay
        for (0..st.creep_count) |i| {
            const c = &st.creeps[i];
            if (!c.alive) continue;

            if (c.linger_ticks_left > 0 and !in_burn_aura[i]) {
                if (st.findTower(c.linger_owner_id)) |owner| {
                    const dmg = @max(@as(i32, 1), @as(i32, @intFromFloat(@round(c.linger_dps / SIM_HZ))));
                    applyDamage(st, i, dmg, owner, rng, false, next_id);
                }
                c.linger_ticks_left -= 1;
                if (c.linger_ticks_left <= 0) {
                    c.linger_dps = 0;
                    c.linger_owner_id = -1;
                }
            }

            if (c.armor_stack_count > 0) {
                if (tick - c.armor_stack_last_decay >= c.armor_stack_decay_ticks) {
                    c.armor_stack_count -= 1;
                    c.armor_stack_last_decay = tick;
                }
            }
        }

        // Towers fire
        const auras = computeAuraMults(st);

        for (0..st.tower_count) |ti| {
            const t = &st.towers[ti];
            if (!t.active or t.is_trap) continue;
            const stats = effectiveStats(t);

            // Passive burn towers don't fire projectiles
            var is_passive_burn = false;
            for (&stats.effects) |e| {
                if (e.kind == .prox_burn or e.kind == .prox_burn_ramp) {
                    is_passive_burn = true;
                    break;
                }
                if (e.kind == .none) break;
            }
            if (is_passive_burn) continue;

            const atk_mult = auras.atk_speed[ti];
            const effective_atk_speed = stats.atk_speed * (1.0 + atk_mult);
            const cooldown_ticks = @max(@as(i32, 1), @as(i32, @intFromFloat(@round(SIM_HZ / effective_atk_speed))));
            if (tick - t.last_fire_tick < cooldown_ticks) continue;

            // Check for beam, multi_target, periodic_nova effects
            var beam_effect: ?effects_mod.Effect = null;
            var multi_count: ?usize = null;
            var nova_every_n: ?i32 = null;
            for (&stats.effects) |e| {
                if (e.kind == .none) break;
                if (e.kind == .beam_ramp) beam_effect = e;
                if (e.kind == .multi_target) multi_count = @intFromFloat(e.f1);
                if (e.kind == .periodic_nova) nova_every_n = @intFromFloat(e.f1);
            }

            const dmg_mult = auras.dmg[ti];

            if (multi_count) |mc| {
                var target_indices: [state_mod.MAX_CREEPS]usize = undefined;
                const count = pickTargets(t, stats.range, st, mc, &target_indices);
                if (count == 0) continue;
                t.last_fire_tick = tick;
                for (0..count) |j| {
                    fire(st, t, target_indices[j], &stats, dmg_mult, rng, next_id);
                }
            } else {
                const target_idx = pickTarget(t, stats.range, st) orelse {
                    if (beam_effect != null) {
                        t.beam_target_id = -1;
                        t.beam_stacks = 0;
                    }
                    continue;
                };
                t.last_fire_tick = tick;

                if (nova_every_n) |every_n| {
                    t.attack_count += 1;
                    if (@rem(t.attack_count, every_n) == 0) {
                        // Nova: fire at all targets in range
                        var target_indices: [state_mod.MAX_CREEPS]usize = undefined;
                        const count = pickTargets(t, stats.range, st, state_mod.MAX_CREEPS, &target_indices);
                        for (0..count) |j| {
                            fire(st, t, target_indices[j], &stats, dmg_mult, rng, next_id);
                        }
                    } else {
                        fire(st, t, target_idx, &stats, dmg_mult, rng, next_id);
                    }
                } else if (beam_effect) |beam| {
                    beamHit(st, t, target_idx, &stats, &beam, dmg_mult, rng, next_id);
                    // Also apply on-hit effects via fire if tower has slow/poison/stun
                    var has_on_hit = false;
                    for (&stats.effects) |e| {
                        if (e.kind == .none) break;
                        if (e.kind == .slow or e.kind == .poison or e.kind == .stun) {
                            has_on_hit = true;
                            break;
                        }
                    }
                    if (has_on_hit) fire(st, t, target_idx, &stats, dmg_mult, rng, next_id);
                } else {
                    fire(st, t, target_idx, &stats, dmg_mult, rng, next_id);
                }
            }
        }
    }

    // Advance projectiles
    for (0..st.projectile_count) |i| {
        const p = &st.projectiles[i];
        if (!p.alive) continue;
        const dx = p.to_x - p.from_x;
        const dy = p.to_y - p.from_y;
        const dist = @sqrt(dx * dx + dy * dy);
        const dt = (PROJECTILE_PX_PER_SEC / @max(@as(f32, 1), dist)) * SIM_DT;
        p.t += dt;
        if (p.t >= 1.0) {
            p.alive = false;
            impact(st, p, rng, next_id);
        }
    }
    st.pruneDeadProjectiles();
}

fn beamHit(
    st: *state_mod.State,
    tower: *state_mod.TowerState,
    target_idx: usize,
    stats: *const ResolvedStats,
    beam: *const effects_mod.Effect,
    dmg_aura_mult: f32,
    rng: *rng_mod.RNG,
    next_id: *i32,
) void {
    const target = &st.creeps[target_idx];
    if (tower.beam_target_id == target.id) {
        tower.beam_stacks = @min(tower.beam_stacks + 1, @as(i32, @intFromFloat(beam.f2)));
    } else {
        tower.beam_target_id = target.id;
        tower.beam_stacks = 0;
    }
    const base_dmg = randInt(rng, stats.dmg_min, stats.dmg_max);
    const ramp_mult = 1.0 + @as(f32, @floatFromInt(tower.beam_stacks)) * beam.f1;
    const dmg: i32 = @intFromFloat(@round(@as(f32, @floatFromInt(base_dmg)) * ramp_mult * (1.0 + dmg_aura_mult)));
    applyDamage(st, target_idx, dmg, tower, rng, false, next_id);
}

fn fire(
    st: *state_mod.State,
    tower: *state_mod.TowerState,
    target_idx: usize,
    stats: *const ResolvedStats,
    dmg_aura_mult: f32,
    rng: *rng_mod.RNG,
    next_id: *i32,
) void {
    const target = &st.creeps[target_idx];
    const tc = towerCenter(tower);
    const base_dmg = randInt(rng, stats.dmg_min, stats.dmg_max);
    var dmg: i32 = @intFromFloat(@round(@as(f32, @floatFromInt(base_dmg)) * (1.0 + dmg_aura_mult)));

    // Focus crit tracking
    var focus_crit_effect: ?effects_mod.Effect = null;
    for (&stats.effects) |e| {
        if (e.kind == .none) break;
        if (e.kind == .focus_crit) {
            focus_crit_effect = e;
            break;
        }
    }
    if (focus_crit_effect) |fc| {
        if (tower.focus_target_id == target.id) {
            const max_stacks: i32 = @intFromFloat(@round(fc.f2 / fc.f1));
            tower.focus_stacks = @min(tower.focus_stacks + 1, max_stacks);
        } else {
            tower.focus_target_id = target.id;
            tower.focus_stacks = 0;
        }
    }

    var was_crit = false;
    for (&stats.effects) |e| {
        if (e.kind == .none) break;
        if (e.kind == .crit) {
            var chance = e.f1;
            if (focus_crit_effect != null) {
                chance += @as(f32, @floatFromInt(tower.focus_stacks)) * focus_crit_effect.?.f1;
            }
            if (rng.next() < chance) {
                dmg = @intFromFloat(@round(@as(f32, @floatFromInt(dmg)) * e.f2));
                was_crit = true;
            }
        }
        if (e.kind == .air_bonus and target.flags.air) {
            dmg = @intFromFloat(@round(@as(f32, @floatFromInt(dmg)) * e.f1));
        }
    }

    // Execute bonus
    for (&stats.effects) |e| {
        if (e.kind == .none) break;
        if (e.kind == .execute) {
            if (target.max_hp > 0) {
                const hp_frac = @as(f32, @floatFromInt(target.hp)) / @as(f32, @floatFromInt(target.max_hp));
                if (hp_frac < e.f2) {
                    dmg = @intFromFloat(@round(@as(f32, @floatFromInt(dmg)) * (1.0 + e.f1)));
                }
            }
        }
    }

    const proj = state_mod.ProjectileState{
        .id = next_id.*,
        .from_x = tc.x,
        .from_y = tc.y,
        .to_x = target.px,
        .to_y = target.py,
        .target_id = target.id,
        .t = 0,
        .speed = PROJECTILE_PX_PER_SEC,
        .damage = dmg,
        .owner_tower_id = tower.id,
        .color = stats.visual_gem,
        .alive = true,
        .was_crit = was_crit,
    };
    next_id.* += 1;
    st.addProjectile(proj);
}

fn impact(st: *state_mod.State, p: *const state_mod.ProjectileState, rng: *rng_mod.RNG, next_id: *i32) void {
    const owner = st.findTower(p.owner_tower_id) orelse return;
    const stats = effectiveStats(owner);

    // Find target
    var target_idx: ?usize = null;
    for (0..st.creep_count) |i| {
        if (st.creeps[i].id == p.target_id and st.creeps[i].alive) {
            target_idx = i;
            break;
        }
    }

    // Direct hit
    if (target_idx) |ti| {
        if (!isBurrowed(&st.creeps[ti], st.tick)) {
            applyDamage(st, ti, p.damage, owner, rng, false, next_id);
            applyEffects(st, ti, &stats.effects, rng);
        }
    }

    // Splash
    var splash_targets: [state_mod.MAX_CREEPS]usize = undefined;
    var splash_count: usize = 0;

    for (&stats.effects) |e| {
        if (e.kind == .none) break;
        if (e.kind == .splash) {
            if (e.f3 > 0 and rng.next() >= e.f3) continue;
            for (0..st.creep_count) |i| {
                const c = &st.creeps[i];
                if (!c.alive) continue;
                if (target_idx != null and i == target_idx.?) continue;
                if (isBurrowed(c, st.tick)) continue;
                const dx = c.px - p.to_x;
                const dy = c.py - p.to_y;
                const dist = @sqrt(dx * dx + dy * dy);
                if (dist <= e.f1 * TILE) {
                    const fall = if (e.f2 > 0) e.f2 else 0.5;
                    const splash_dmg: i32 = @intFromFloat(@round(@as(f32, @floatFromInt(p.damage)) * fall));
                    applyDamage(st, i, splash_dmg, owner, rng, false, next_id);
                    if (splash_count < state_mod.MAX_CREEPS) {
                        splash_targets[splash_count] = i;
                        splash_count += 1;
                    }
                }
            }
        } else if (e.kind == .chain and target_idx != null) {
            var last_x = st.creeps[target_idx.?].px;
            var last_y = st.creeps[target_idx.?].py;
            var chain_dmg: f32 = @floatFromInt(p.damage);
            var hit: [state_mod.MAX_CREEPS]bool = .{false} ** state_mod.MAX_CREEPS;
            hit[target_idx.?] = true;
            const bounces: usize = @intFromFloat(e.f1);
            for (0..bounces) |_| {
                chain_dmg *= e.f2;
                const next_target = nearest(st, last_x, last_y, &hit, stats.range * TILE) orelse break;
                const cdmg: i32 = @intFromFloat(@round(chain_dmg));
                applyDamage(st, next_target, cdmg, owner, rng, false, next_id);
                // Apply non-chain effects
                var filtered: effects_mod.EffectList = undefined;
                var fi: usize = 0;
                for (&stats.effects) |fe| {
                    if (fe.kind == .none) break;
                    if (fe.kind != .chain) {
                        filtered[fi] = fe;
                        fi += 1;
                    }
                }
                while (fi < effects_mod.MAX_EFFECTS) : (fi += 1) filtered[fi] = .{};
                applyEffects(st, next_target, &filtered, rng);
                hit[next_target] = true;
                last_x = st.creeps[next_target].px;
                last_y = st.creeps[next_target].py;
            }
        }
    }

    // Crit splash
    if (p.was_crit) {
        for (&stats.effects) |e| {
            if (e.kind == .none) break;
            if (e.kind == .crit_splash) {
                for (0..st.creep_count) |i| {
                    const c = &st.creeps[i];
                    if (!c.alive or (target_idx != null and i == target_idx.?) or isBurrowed(c, st.tick)) continue;
                    const dx = c.px - p.to_x;
                    const dy = c.py - p.to_y;
                    if (@sqrt(dx * dx + dy * dy) <= e.f1 * TILE) {
                        const sdmg: i32 = @intFromFloat(@round(@as(f32, @floatFromInt(p.damage)) * e.f2));
                        applyDamage(st, i, sdmg, owner, rng, false, next_id);
                    }
                }
            }
        }
    }

    // Freeze chance on splash targets
    for (&stats.effects) |e| {
        if (e.kind == .none) break;
        if (e.kind == .freeze_chance and splash_count > 0) {
            for (0..splash_count) |si| {
                const ci = splash_targets[si];
                if (!st.creeps[ci].alive) continue;
                if (rng.next() < e.f1) {
                    const expires = st.tick + @as(i32, @intFromFloat(@round(e.f2 * SIM_HZ)));
                    if (st.creeps[ci].stun_expires < expires) {
                        st.creeps[ci].stun_expires = expires;
                    }
                }
            }
        }
    }

    // Stacking armor reduce
    for (&stats.effects) |e| {
        if (e.kind == .none) break;
        if (e.kind == .stacking_armor_reduce) {
            // Apply to primary + splash targets
            if (target_idx) |ti| {
                if (st.creeps[ti].alive) applyStackingArmor(st, ti, &e);
            }
            for (0..splash_count) |si| {
                if (st.creeps[splash_targets[si]].alive) applyStackingArmor(st, splash_targets[si], &e);
            }
        }
    }
}

fn applyStackingArmor(st: *state_mod.State, ci: usize, e: *const effects_mod.Effect) void {
    const c = &st.creeps[ci];
    if (c.armor_stack_count > 0) {
        if (c.armor_stack_count < @as(i32, @intFromFloat(e.f2))) {
            c.armor_stack_count += 1;
            c.armor_stack_last_decay = st.tick;
        }
    } else {
        c.armor_stack_count = 1;
        c.armor_stack_per = e.f1;
        c.armor_stack_decay_ticks = @intFromFloat(@round(e.f3 * SIM_HZ));
        c.armor_stack_last_decay = st.tick;
    }
}

pub fn applyDamage(st: *state_mod.State, ci: usize, raw_dmg: i32, owner: *state_mod.TowerState, rng: *rng_mod.RNG, ignore_armor: bool, next_id: *i32) void {
    const c = &st.creeps[ci];
    if (!c.alive) return;

    var dmg = raw_dmg;
    if (!ignore_armor) {
        var effective_armor = @as(f32, @floatFromInt(c.armor)) - c.armor_reduction;
        if (c.armor_debuff_expires > st.tick) {
            effective_armor -= c.armor_debuff_value;
        }
        effective_armor -= c.radiation_armor;
        if (c.armor_stack_count > 0) {
            effective_armor -= @as(f32, @floatFromInt(c.armor_stack_count)) * c.armor_stack_per;
        }
        effective_armor = @max(effective_armor, -10.0);
        if (effective_armor != 0) {
            dmg = @intFromFloat(@round(@as(f32, @floatFromInt(dmg)) * armorDamageMultiplier(effective_armor)));
        }
    }
    if (c.vulnerability > 0) {
        dmg = @intFromFloat(@round(@as(f32, @floatFromInt(dmg)) * (1.0 + c.vulnerability)));
    }

    owner.total_damage += dmg;
    c.hp -= dmg;

    if (c.hp <= 0) {
        c.alive = false;
        owner.kills += 1;

        st.gold += c.bounty;
        // Bonus gold check
        const owner_stats = effectiveStats(owner);
        for (&owner_stats.effects) |e| {
            if (e.kind == .none) break;
            if (e.kind == .bonus_gold and rng.next() < e.f1) {
                st.gold += c.bounty;
            }
        }
        st.total_kills += 1;
        st.wave_stats.killed += 1;
        handleDeathEffects(st, ci, rng, next_id);
    }
}

fn applyEffects(st: *state_mod.State, ci: usize, effs: *const effects_mod.EffectList, rng: *rng_mod.RNG) void {
    const c = &st.creeps[ci];
    if (!c.alive) return;
    const tick = st.tick;

    for (effs) |e| {
        if (e.kind == .none) break;
        switch (e.kind) {
            .slow => {
                const chance = if (e.f3 > 0) e.f3 else 1.0;
                if (rng.next() > chance) continue;
                const expires = tick + @as(i32, @intFromFloat(@round(e.f2 * SIM_HZ)));
                const factor = e.f1 + (1.0 - e.f1) * c.slow_resist;
                if (c.slow_expires < expires or c.slow_factor > factor) {
                    c.slow_factor = factor;
                    c.slow_expires = expires;
                }
            },
            .poison => {
                const expires = tick + @as(i32, @intFromFloat(@round(e.f2 * SIM_HZ)));
                if (c.poison_dps < e.f1) {
                    c.poison_dps = e.f1;
                    c.poison_expires = expires;
                    c.poison_next_tick = tick + SIM_HZ_INT;
                } else {
                    c.poison_expires = expires;
                }
                // Check for death_spread in same effect list
                for (effs) |e2| {
                    if (e2.kind == .none) break;
                    if (e2.kind == .death_spread) {
                        c.poison_spread_count = @intFromFloat(e2.f1);
                        c.poison_spread_radius = e2.f2;
                    }
                }
            },
            .stun => {
                if (rng.next() > e.f2) continue; // f2 = chance
                const expires = tick + @as(i32, @intFromFloat(@round(e.f1 * SIM_HZ))); // f1 = duration
                if (c.stun_expires < expires) {
                    c.stun_expires = expires;
                }
                // Stun poison
                for (effs) |e2| {
                    if (e2.kind == .none) break;
                    if (e2.kind == .stun_poison) {
                        const p_expires = tick + @as(i32, @intFromFloat(@round(e2.f2 * SIM_HZ)));
                        if (c.poison_dps < e2.f1) {
                            c.poison_dps = e2.f1;
                            c.poison_expires = p_expires;
                            c.poison_next_tick = tick + SIM_HZ_INT;
                        } else {
                            c.poison_expires = p_expires;
                        }
                        for (effs) |e3| {
                            if (e3.kind == .none) break;
                            if (e3.kind == .death_spread) {
                                c.poison_spread_count = @intFromFloat(e3.f1);
                                c.poison_spread_radius = e3.f2;
                            }
                        }
                    }
                }
            },
            .armor_reduce => {
                const expires = tick + @as(i32, @intFromFloat(@round(e.f2 * SIM_HZ)));
                if (c.armor_debuff_value < e.f1) {
                    c.armor_debuff_value = e.f1;
                    c.armor_debuff_expires = expires;
                } else if (c.armor_debuff_value == e.f1) {
                    c.armor_debuff_expires = @max(c.armor_debuff_expires, expires);
                }
            },
            else => {},
        }
    }
}

fn applyProximityAuras(st: *state_mod.State, rng: *rng_mod.RNG, tick: i32, in_burn_aura: *[state_mod.MAX_CREEPS]bool, next_id: *i32) void {
    for (0..st.tower_count) |ti| {
        const src = &st.towers[ti];
        if (!src.active) continue;
        const stats = effectiveStats(src);
        const tc = towerCenter(src);

        var has_linger_burn = false;
        var has_burn = false;
        for (&stats.effects) |e| {
            if (e.kind == .none) break;
            if (e.kind == .linger_burn) has_linger_burn = true;
            if (e.kind == .prox_burn or e.kind == .prox_burn_ramp) has_burn = true;
        }

        // Track current burn aura creep IDs for linger detection
        var current_burn_ids: [state_mod.MAX_CREEPS]i32 = .{-1} ** state_mod.MAX_CREEPS;
        var current_burn_count: usize = 0;

        for (&stats.effects) |e| {
            if (e.kind == .none) break;
            switch (e.kind) {
                .prox_armor_reduce => {
                    const r2 = (e.f1 * TILE) * (e.f1 * TILE);
                    for (0..st.creep_count) |ci| {
                        const c = &st.creeps[ci];
                        if (!c.alive or !canTargetProx(e.targeting, c)) continue;
                        const dx = c.px - tc.x;
                        const dy = c.py - tc.y;
                        if (dx * dx + dy * dy > r2) continue;
                        c.armor_reduction = @max(c.armor_reduction, e.f2);
                    }
                },
                .prox_burn => {
                    const r2 = (e.f2 * TILE) * (e.f2 * TILE);
                    const dmg_per_tick = e.f1 / SIM_HZ;
                    for (0..st.creep_count) |ci| {
                        const c = &st.creeps[ci];
                        if (!c.alive) continue;
                        const dx = c.px - tc.x;
                        const dy = c.py - tc.y;
                        if (dx * dx + dy * dy > r2) continue;
                        applyDamage(st, ci, @max(@as(i32, 1), @as(i32, @intFromFloat(@round(dmg_per_tick)))), @constCast(src), rng, false, next_id);
                        in_burn_aura[ci] = true;
                        if (has_linger_burn and current_burn_count < state_mod.MAX_CREEPS) {
                            current_burn_ids[current_burn_count] = c.id;
                            current_burn_count += 1;
                        }
                    }
                },
                .prox_burn_ramp => {
                    const r2 = (e.f2 * TILE) * (e.f2 * TILE);
                    var has_armor_pierce = false;
                    for (&stats.effects) |e2| {
                        if (e2.kind == .none) break;
                        if (e2.kind == .armor_pierce_burn) has_armor_pierce = true;
                    }

                    // Clear old burn exposure, compute new
                    var new_exposure_ids: [64]i32 = .{-1} ** 64;
                    var new_exposure_ticks: [64]i32 = .{0} ** 64;
                    var ne_count: usize = 0;

                    for (0..st.creep_count) |ci| {
                        const c = &st.creeps[ci];
                        if (!c.alive) continue;
                        const dx = c.px - tc.x;
                        const dy = c.py - tc.y;
                        if (dx * dx + dy * dy > r2) continue;

                        // Find previous exposure
                        var prev: i32 = 0;
                        for (0..64) |bi| {
                            if (src.burn_exposure_ids[bi] == c.id) {
                                prev = src.burn_exposure_ticks[bi];
                                break;
                            }
                        }
                        const exposure = prev + 1;
                        if (ne_count < 64) {
                            new_exposure_ids[ne_count] = c.id;
                            new_exposure_ticks[ne_count] = exposure;
                            ne_count += 1;
                        }

                        const ramp_mult = 1.0 + @min(@as(f32, @floatFromInt(exposure)) / SIM_HZ * e.f3, e.f4);
                        const dmg: i32 = @max(@as(i32, 1), @as(i32, @intFromFloat(@round(e.f1 * ramp_mult / SIM_HZ))));
                        applyDamage(st, ci, dmg, @constCast(src), rng, has_armor_pierce, next_id);
                        in_burn_aura[ci] = true;
                        if (has_linger_burn and current_burn_count < state_mod.MAX_CREEPS) {
                            current_burn_ids[current_burn_count] = c.id;
                            current_burn_count += 1;
                        }
                    }
                    // We need mutable access but src is const from the loop
                    // Store back via towers array
                    st.towers[ti].burn_exposure_ids = new_exposure_ids;
                    st.towers[ti].burn_exposure_ticks = new_exposure_ticks;
                },
                .prox_slow => {
                    const r2 = (e.f2 * TILE) * (e.f2 * TILE);
                    for (0..st.creep_count) |ci| {
                        const c = &st.creeps[ci];
                        if (!c.alive) continue;
                        const dx = c.px - tc.x;
                        const dy = c.py - tc.y;
                        if (dx * dx + dy * dy > r2) continue;
                        const factor = e.f1 + (1.0 - e.f1) * c.slow_resist;
                        c.prox_slow_factor = @min(c.prox_slow_factor, factor);
                    }
                },
                .vulnerability_aura => {
                    const r2 = (e.f1 * TILE) * (e.f1 * TILE);
                    for (0..st.creep_count) |ci| {
                        const c = &st.creeps[ci];
                        if (!c.alive) continue;
                        const dx = c.px - tc.x;
                        const dy = c.py - tc.y;
                        if (dx * dx + dy * dy > r2) continue;
                        c.vulnerability += e.f2;
                    }
                },
                .armor_decay_aura => {
                    const r2 = (e.f2 * TILE) * (e.f2 * TILE);
                    for (0..st.creep_count) |ci| {
                        const c = &st.creeps[ci];
                        if (!c.alive) continue;
                        const dx = c.px - tc.x;
                        const dy = c.py - tc.y;
                        if (dx * dx + dy * dy > r2) continue;
                        c.radiation_armor = @min(c.radiation_armor + e.f1 / SIM_HZ, e.f3);
                    }
                },
                .periodic_freeze => {
                    const interval_ticks: i32 = @intFromFloat(@round(e.f1 * SIM_HZ));
                    if (tick - src.last_freeze_tick >= interval_ticks) {
                        st.towers[ti].last_freeze_tick = tick;
                        const r2 = (stats.range * TILE) * (stats.range * TILE);
                        const stun_duration: i32 = @intFromFloat(@round(e.f2 * SIM_HZ));
                        for (0..st.creep_count) |ci| {
                            const c = &st.creeps[ci];
                            if (!c.alive) continue;
                            const dx = c.px - tc.x;
                            const dy = c.py - tc.y;
                            if (dx * dx + dy * dy > r2) continue;
                            const expires = tick + stun_duration;
                            if (c.stun_expires < expires) c.stun_expires = expires;
                        }
                    }
                },
                else => {},
            }
        }

        // Linger burn: detect creeps that left
        if (has_linger_burn and has_burn) {
            var linger_dps: f32 = 0;
            for (&stats.effects) |e| {
                if (e.kind == .none) break;
                if (e.kind == .prox_burn or e.kind == .prox_burn_ramp) linger_dps = e.f1;
            }
            var linger_duration: f32 = 0;
            for (&stats.effects) |e| {
                if (e.kind == .none) break;
                if (e.kind == .linger_burn) linger_duration = e.f1;
            }

            for (0..src.burn_aura_count) |pi| {
                const prev_id = src.burn_aura_creep_ids[pi];
                if (prev_id < 0) continue;
                var still_in = false;
                for (0..current_burn_count) |ci| {
                    if (current_burn_ids[ci] == prev_id) {
                        still_in = true;
                        break;
                    }
                }
                if (!still_in) {
                    for (0..st.creep_count) |ci| {
                        if (st.creeps[ci].id == prev_id and st.creeps[ci].alive) {
                            st.creeps[ci].linger_dps = linger_dps;
                            st.creeps[ci].linger_ticks_left = @intFromFloat(@round(linger_duration * SIM_HZ));
                            st.creeps[ci].linger_owner_id = src.id;
                            break;
                        }
                    }
                }
            }
            st.towers[ti].burn_aura_creep_ids = .{-1} ** state_mod.MAX_CREEPS;
            for (0..current_burn_count) |ci| {
                st.towers[ti].burn_aura_creep_ids[ci] = current_burn_ids[ci];
            }
            st.towers[ti].burn_aura_count = current_burn_count;
        }
    }

    // Second pass: frostbite
    for (0..st.tower_count) |ti| {
        const src = &st.towers[ti];
        if (!src.active) continue;
        const stats = effectiveStats(src);
        const tc = towerCenter(src);

        for (&stats.effects) |e| {
            if (e.kind == .none) break;
            if (e.kind != .frostbite) continue;
            const r2 = (stats.range * TILE) * (stats.range * TILE);
            for (0..st.creep_count) |ci| {
                const c = &st.creeps[ci];
                if (!c.alive) continue;
                const dx = c.px - tc.x;
                const dy = c.py - tc.y;
                if (dx * dx + dy * dy > r2) continue;
                const slow_factor = if (c.slow_expires > tick) c.slow_factor else 1.0;
                const prox_factor = c.prox_slow_factor;
                if (slow_factor * prox_factor <= e.f1) {
                    c.vulnerability += e.f2;
                }
            }
        }
    }
}

pub fn handleDeathEffects(st: *state_mod.State, dead_idx: usize, rng: *rng_mod.RNG, next_id: *i32) void {
    const dead = st.creeps[dead_idx];

    // Death nova
    for (0..st.tower_count) |ti| {
        const t = &st.towers[ti];
        if (!t.active) continue;
        const stats = effectiveStats(t);
        const tc = towerCenter(t);

        for (&stats.effects) |e| {
            if (e.kind == .none) break;
            if (e.kind == .death_nova) {
                const range_px = stats.range * TILE;
                const dx = dead.px - tc.x;
                const dy = dead.py - tc.y;
                if (dx * dx + dy * dy > range_px * range_px) continue;

                const nova_dmg: i32 = @intFromFloat(@round(@as(f32, @floatFromInt(dead.max_hp)) * e.f1));
                const nova_r2 = (e.f2 * TILE) * (e.f2 * TILE);
                for (0..st.creep_count) |ci| {
                    const c = &st.creeps[ci];
                    if (!c.alive) continue;
                    const cdx = c.px - dead.px;
                    const cdy = c.py - dead.py;
                    if (cdx * cdx + cdy * cdy <= nova_r2) {
                        applyDamage(st, ci, nova_dmg, @constCast(t), rng, false, next_id);
                    }
                }
            }
        }
    }

    // Death spread (plague)
    if (dead.poison_spread_count > 0 and dead.poison_dps > 0) {
        const r2 = (dead.poison_spread_radius * TILE) * (dead.poison_spread_radius * TILE);
        var candidates: [state_mod.MAX_CREEPS]struct { idx: usize, dist2: f32 } = undefined;
        var cand_count: usize = 0;
        for (0..st.creep_count) |ci| {
            const c = &st.creeps[ci];
            if (!c.alive) continue;
            const dx = c.px - dead.px;
            const dy = c.py - dead.py;
            const d2 = dx * dx + dy * dy;
            if (d2 <= r2) {
                candidates[cand_count] = .{ .idx = ci, .dist2 = d2 };
                cand_count += 1;
            }
        }
        std.sort.insertion(@TypeOf(candidates[0]), candidates[0..cand_count], {}, struct {
            fn f(_: void, a: @TypeOf(candidates[0]), b: @TypeOf(candidates[0])) bool {
                return a.dist2 < b.dist2;
            }
        }.f);
        const spread_count = @min(@as(usize, @intCast(dead.poison_spread_count)), cand_count);
        for (0..spread_count) |i| {
            const c = &st.creeps[candidates[i].idx];
            c.poison_dps = dead.poison_dps;
            c.poison_expires = st.tick + 3 * SIM_HZ_INT;
            c.poison_next_tick = st.tick + SIM_HZ_INT;
        }
    }

    // Spawn container payload
    spawnPayload(st, &dead, next_id);
}

fn spawnPayload(st: *state_mod.State, dead: *const state_mod.CreepState, next_id: *i32) void {
    if (dead.payload_index < 0 or dead.payload_count <= 0) return;

    const start: usize = @intCast(dead.payload_index);
    const count: usize = @intCast(dead.payload_count);

    for (start..start + count) |pi| {
        if (pi >= st.payload_pool_count) break;
        const p = &st.payload_pool[pi];
        const is_air = p.flags.air;
        const route = if (is_air) st.air_route[0..st.air_route_len] else st.flat_route[0..st.flat_route_len];
        if (route.len == 0) continue;

        var path_pos = dead.path_pos;
        if (dead.flags.air != is_air) {
            path_pos = nearestPathPos(dead.px, dead.py, route);
        }
        path_pos = @min(path_pos, @as(f32, @floatFromInt(route.len)) - 2.0);

        for (0..@as(usize, @intCast(p.count))) |_| {
            if (st.creep_count >= state_mod.MAX_CREEPS) break;
            const id = next_id.*;
            next_id.* += 1;
            var creep = state_mod.CreepState{
                .id = id,
                .kind = p.kind,
                .path_pos = path_pos,
                .px = dead.px,
                .py = dead.py,
                .hp = p.hp,
                .max_hp = p.hp,
                .speed = p.speed,
                .bounty = p.bounty,
                .color = p.color,
                .armor = p.armor,
                .slow_resist = p.slow_resist,
                .flags = p.flags,
                .alive = true,
            };
            if (p.child_count > 0) {
                creep.payload_index = p.child_index;
                creep.payload_count = p.child_count;
            }
            _ = st.addCreep(creep);
            st.wave_stats.spawned += 1;
            st.wave_stats.total_to_spawn += 1;
        }
    }
}

fn nearestPathPos(px: f32, py: f32, route: []const types.Point) f32 {
    var best: usize = 0;
    var best_d: f32 = std.math.inf(f32);
    const FINE = constants.FINE_TILE;
    for (route, 0..) |pt, i| {
        const rx = @as(f32, @floatFromInt(pt.x)) * FINE + FINE / 2.0;
        const ry = @as(f32, @floatFromInt(pt.y)) * FINE + FINE / 2.0;
        const d = (px - rx) * (px - rx) + (py - ry) * (py - ry);
        if (d < best_d) {
            best_d = d;
            best = i;
        }
    }
    return @floatFromInt(best);
}

// Trap system
pub fn stepTraps(st: *state_mod.State, rng: *rng_mod.RNG, next_id: *i32) void {
    if (st.phase != .wave) return;
    const tick = st.tick;
    const FINE = constants.FINE_TILE;

    for (0..st.tower_count) |ti| {
        const trap = &st.towers[ti];
        if (!trap.active or !trap.is_trap) continue;

        const combo_key = trap.combo_key orelse continue;
        const combo = combos_mod.comboByKey(combo_key);
        const s = combos_mod.comboStatsAtTier(combo, trap.upgrade_tier);

        const cooldown_ticks = @max(@as(i32, 1), @as(i32, @intFromFloat(@round(SIM_HZ / s.atk_speed))));
        if (tick - trap.last_trigger_tick < cooldown_ticks) continue;

        const left = @as(f32, @floatFromInt(trap.x)) * FINE;
        const top = @as(f32, @floatFromInt(trap.y)) * FINE;
        const right = @as(f32, @floatFromInt(trap.x + 2)) * FINE;
        const bottom = @as(f32, @floatFromInt(trap.y + 2)) * FINE;

        var triggered = false;
        for (0..st.creep_count) |ci| {
            const c = &st.creeps[ci];
            if (!c.alive) continue;
            if (!canTarget(s.targeting, c)) continue;
            if (c.px < left or c.px > right or c.py < top or c.py > bottom) continue;

            applyTrap(st, ti, ci, s, rng, next_id);
            triggered = true;
        }
        if (triggered) {
            st.towers[ti].last_trigger_tick = tick;
        }
    }
}

fn applyTrap(st: *state_mod.State, trap_idx: usize, ci: usize, s: *const combos_mod.ComboStats, rng: *rng_mod.RNG, next_id: *i32) void {
    const c = &st.creeps[ci];
    if (!c.alive) return;
    const tick = st.tick;
    const trap = &st.towers[trap_idx];

    // Direct damage
    if (s.dmg_max > 0) {
        const dmg = randInt(rng, s.dmg_min, s.dmg_max);
        c.hp -= dmg;
        if (c.hp <= 0) {
            c.alive = false;
            st.gold += c.bounty;
            st.total_kills += 1;
            st.wave_stats.killed += 1;
            handleDeathEffects(st, ci, rng, next_id);
            return;
        }
    }

    // Trap effects
    for (&s.effects) |e| {
        if (e.kind == .none) break;
        switch (e.kind) {
            .trap_slow => {
                const expires = tick + @as(i32, @intFromFloat(@round(e.f2 * SIM_HZ)));
                const factor = e.f1 + (1.0 - e.f1) * c.slow_resist;
                if (c.slow_expires < expires or c.slow_factor > factor) {
                    c.slow_factor = factor;
                    c.slow_expires = expires;
                }
            },
            .trap_dot => {
                const expires = tick + @as(i32, @intFromFloat(@round(e.f2 * SIM_HZ)));
                if (c.poison_dps < e.f1) {
                    c.poison_dps = e.f1;
                    c.poison_expires = expires;
                    c.poison_next_tick = tick + SIM_HZ_INT;
                } else {
                    c.poison_expires = expires;
                }
            },
            .trap_explode => {
                const r2 = (e.f1 * TILE) * (e.f1 * TILE);
                for (0..st.creep_count) |oi| {
                    const other = &st.creeps[oi];
                    if (!other.alive or oi == ci) continue;
                    if (!canTarget(s.targeting, other)) continue;
                    const dx = other.px - c.px;
                    const dy = other.py - c.py;
                    if (dx * dx + dy * dy > r2) continue;
                    const splash_dmg: i32 = @intFromFloat(@round(@as(f32, @floatFromInt(randInt(rng, s.dmg_min, s.dmg_max))) * e.f2));
                    other.hp -= splash_dmg;
                    if (other.hp <= 0) {
                        other.alive = false;
                        st.gold += other.bounty;
                        st.total_kills += 1;
                        st.wave_stats.killed += 1;
                        handleDeathEffects(st, oi, rng, next_id);
                    }
                }
            },
            .trap_root => {
                const expires = tick + @as(i32, @intFromFloat(@round(e.f1 * SIM_HZ)));
                if (c.stun_expires < expires) c.stun_expires = expires;
            },
            .trap_knockback => {
                c.path_pos = @max(0, c.path_pos - e.f1);
            },
            else => {},
        }
    }
    _ = trap;
}

test "armorDamageMultiplier positive" {
    const mult = armorDamageMultiplier(10);
    try std.testing.expect(mult < 1.0);
    try std.testing.expect(mult > 0.5);
}

test "armorDamageMultiplier negative" {
    const mult = armorDamageMultiplier(-5);
    try std.testing.expect(mult > 1.0);
}
