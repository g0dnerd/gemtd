const types = @import("types.zig");

pub const RNG = struct {
    state: u32,

    pub fn init(seed: u32) RNG {
        return .{ .state = seed };
    }

    /// Float in [0, 1).
    pub fn next(self: *RNG) f32 {
        self.state +%= 0x6d2b79f5;
        var t: u32 = self.state;
        t = mulU32(t ^ (t >> 15), t | 1);
        t ^= t +% mulU32(t ^ (t >> 7), t | 61);
        return @as(f32, @floatFromInt(t ^ (t >> 14))) / 4294967296.0;
    }

    /// Integer in [0, max).
    pub fn int(self: *RNG, max: u32) u32 {
        return @intFromFloat(@floor(self.next() * @as(f32, @floatFromInt(max))));
    }

    /// Pick uniformly from a slice.
    pub fn pick(self: *RNG, comptime T: type, items: []const T) T {
        return items[self.int(@intCast(items.len))];
    }

    /// Pick from weighted entries. Weights are parallel array.
    pub fn weighted(self: *RNG, weights: []const f32) usize {
        var total: f32 = 0;
        for (weights) |w| total += w;
        var r = self.next() * total;
        for (weights, 0..) |w, i| {
            r -= w;
            if (r <= 0) return i;
        }
        return weights.len - 1;
    }

    pub fn pickQuality(self: *RNG, tier: usize) types.Quality {
        const constants = @import("constants.zig");
        const clamped = @min(tier, constants.MAX_CHANCE_TIER);
        const row = &constants.CHANCE_TIER_WEIGHTS[clamped];
        const r = self.next();
        var acc: f32 = 0;
        for (row, 0..) |w, i| {
            acc += w;
            if (r <= acc) return types.Quality.fromInt(@intCast(i + 1));
        }
        // Fallback: first non-zero weight
        for (row, 0..) |w, i| {
            if (w > 0) return types.Quality.fromInt(@intCast(i + 1));
        }
        return .chipped;
    }
};

fn mulU32(a: u32, b: u32) u32 {
    const al: u64 = a;
    const bl: u64 = b;
    return @truncate(al * bl);
}

test "rng matches mulberry32" {
    var rng = RNG.init(42);
    const v1 = rng.next();
    const v2 = rng.next();
    try @import("std").testing.expect(v1 >= 0 and v1 < 1);
    try @import("std").testing.expect(v2 >= 0 and v2 < 1);
    try @import("std").testing.expect(v1 != v2);
}

test "rng matches TypeScript mulberry32 output" {
    const testing = @import("std").testing;
    var rng = RNG.init(42);
    // Values from TS: new RNG(42), 10x .next()
    const expected = [_]f32{
        0.6011037519,
        0.4482905590,
        0.8524657935,
        0.6697340414,
        0.1748138987,
        0.5265925422,
        0.2732279943,
        0.6247446539,
        0.8654746483,
        0.4723170551,
    };
    for (expected) |exp| {
        const got = rng.next();
        try testing.expectApproxEqAbs(exp, got, 1e-6);
    }
}
