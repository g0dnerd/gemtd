pub const constants = @import("constants.zig");
pub const types = @import("types.zig");
pub const rng = @import("rng.zig");
pub const map = @import("map.zig");
pub const effects = @import("effects.zig");
pub const gems = @import("gems.zig");
pub const creeps = @import("creeps.zig");
pub const waves = @import("waves.zig");
pub const combos = @import("combos.zig");
pub const state = @import("state.zig");
pub const pathfinding = @import("pathfinding.zig");
pub const combat = @import("combat.zig");
pub const wave_phase = @import("wave_phase.zig");
pub const build_phase = @import("build_phase.zig");
pub const Game = @import("Game.zig");
pub const c_api = @import("c_api.zig");
pub const greedy_ai = @import("greedy_ai.zig");

comptime {
    // Force analysis of all c_api exports so they appear in the shared library
    @import("std").testing.refAllDecls(c_api);
}

test {
    @import("std").testing.refAllDecls(@This());
}
