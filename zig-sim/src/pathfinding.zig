const std = @import("std");
const types = @import("types.zig");
const constants = @import("constants.zig");
const map_mod = @import("map.zig");
const state_mod = @import("state.zig");

const GRID_W = constants.GRID_W;
const GRID_H = constants.GRID_H;
const GRID_SIZE = GRID_W * GRID_H;

const DIRS: [4][2]i32 = .{ .{ 1, 0 }, .{ -1, 0 }, .{ 0, 1 }, .{ 0, -1 } };

const HeapEntry = struct {
    f: i32,
    idx: u16,
};

const MinHeap = struct {
    items: [GRID_SIZE]HeapEntry = undefined,
    len: usize = 0,

    fn push(self: *MinHeap, f: i32, idx: u16) void {
        self.items[self.len] = .{ .f = f, .idx = idx };
        self.bubbleUp(self.len);
        self.len += 1;
    }

    fn pop(self: *MinHeap) ?HeapEntry {
        if (self.len == 0) return null;
        const top = self.items[0];
        self.len -= 1;
        if (self.len > 0) {
            self.items[0] = self.items[self.len];
            self.sinkDown(0);
        }
        return top;
    }

    fn bubbleUp(self: *MinHeap, start: usize) void {
        var i = start;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (self.items[parent].f <= self.items[i].f) break;
            const tmp = self.items[parent];
            self.items[parent] = self.items[i];
            self.items[i] = tmp;
            i = parent;
        }
    }

    fn sinkDown(self: *MinHeap, start: usize) void {
        var i = start;
        while (true) {
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            var smallest = i;
            if (l < self.len and self.items[l].f < self.items[smallest].f) smallest = l;
            if (r < self.len and self.items[r].f < self.items[smallest].f) smallest = r;
            if (smallest == i) break;
            const tmp = self.items[smallest];
            self.items[smallest] = self.items[i];
            self.items[i] = tmp;
            i = smallest;
        }
    }
};

fn manhattan(ax: i32, ay: i32, bx: i32, by: i32) i32 {
    return @intCast(@abs(ax - bx) + @abs(ay - by));
}

const SENTINEL: u16 = 0xFFFF;

/// A* between two grid tiles. Returns path length, writes points to out_path.
/// Returns 0 if unreachable.
pub fn aStar(
    start: types.Point,
    goal: types.Point,
    grid: *const map_mod.Grid,
    extra_blocked: ?*const [GRID_SIZE]bool,
    out_path: []types.Point,
) usize {
    if (start.x == goal.x and start.y == goal.y) {
        if (out_path.len > 0) out_path[0] = start;
        return 1;
    }

    const start_idx: u16 = @intCast(@as(usize, @intCast(start.y)) * GRID_W + @as(usize, @intCast(start.x)));
    const goal_idx: u16 = @intCast(@as(usize, @intCast(goal.y)) * GRID_W + @as(usize, @intCast(goal.x)));

    var came_from: [GRID_SIZE]u16 = .{SENTINEL} ** GRID_SIZE;
    var g_score: [GRID_SIZE]i32 = .{std.math.maxInt(i32)} ** GRID_SIZE;
    var heap = MinHeap{};

    g_score[start_idx] = 0;
    heap.push(manhattan(start.x, start.y, goal.x, goal.y), start_idx);

    while (heap.pop()) |top| {
        const idx = top.idx;
        if (idx == goal_idx) {
            return reconstruct(&came_from, idx, out_path);
        }

        const cx: i32 = @intCast(idx % GRID_W);
        const cy: i32 = @intCast(idx / GRID_W);
        const cg = g_score[idx];

        // Skip if we already found a better path
        if (top.f > cg + manhattan(cx, cy, goal.x, goal.y)) continue;

        for (DIRS) |dir| {
            const nx = cx + dir[0];
            const ny = cy + dir[1];
            if (nx < 0 or ny < 0 or nx >= @as(i32, GRID_W) or ny >= @as(i32, GRID_H)) continue;

            const nux: usize = @intCast(nx);
            const nuy: usize = @intCast(ny);
            const n_idx: u16 = @intCast(nuy * GRID_W + nux);

            if (extra_blocked) |eb| {
                if (eb[n_idx]) continue;
            }

            if (grid[nuy][nux].isBlocking()) continue;

            const tentative = cg + 1;
            if (tentative < g_score[n_idx]) {
                came_from[n_idx] = idx;
                g_score[n_idx] = tentative;
                const f = tentative + manhattan(nx, ny, goal.x, goal.y);
                heap.push(f, n_idx);
            }
        }
    }
    return 0; // unreachable
}

fn reconstruct(came_from: *const [GRID_SIZE]u16, end_idx: u16, out: []types.Point) usize {
    // Build path in reverse
    var rev_buf: [GRID_SIZE]u16 = undefined;
    var len: usize = 0;
    var curr: u16 = end_idx;
    while (curr != SENTINEL) {
        rev_buf[len] = curr;
        len += 1;
        curr = came_from[curr];
    }
    // Reverse into output
    const n = @min(len, out.len);
    for (0..n) |i| {
        const idx = rev_buf[len - 1 - i];
        out[i] = .{
            .x = @intCast(idx % GRID_W),
            .y = @intCast(idx / GRID_W),
        };
    }
    return n;
}

/// Find a route through all waypoints. Returns total length, or 0 if blocked.
/// Writes flat route to state.flat_route and segment info to state.segment_lengths.
pub fn findRoute(grid: *const map_mod.Grid, extra_blocked: ?*const [GRID_SIZE]bool, st: *state_mod.State) bool {
    const waypoints = map_mod.WAYPOINTS;
    var total_len: usize = 0;
    st.segment_count = 0;

    for (0..waypoints.len - 1) |i| {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        const remaining = st.flat_route[total_len..];
        const seg_len = aStar(
            .{ .x = a.x, .y = a.y },
            .{ .x = b.x, .y = b.y },
            grid,
            extra_blocked,
            remaining,
        );
        if (seg_len == 0) return false;

        st.segment_lengths[st.segment_count] = seg_len;
        st.segment_count += 1;

        if (i == 0) {
            total_len += seg_len;
        } else {
            // Skip first point of segment (it's the last point of previous)
            if (seg_len > 1) {
                // Shift segment points back by 1 to avoid duplicate
                const dest_start = total_len;
                for (1..seg_len) |j| {
                    st.flat_route[dest_start + j - 1] = remaining[j];
                }
                total_len += seg_len - 1;
            }
        }
    }
    st.flat_route_len = total_len;
    return true;
}

/// Build straight-line air route through waypoints.
pub fn buildAirRoute(st: *state_mod.State) void {
    const waypoints = map_mod.WAYPOINTS;
    var len: usize = 0;

    for (0..waypoints.len - 1) |i| {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        const dx_abs: i32 = @intCast(@abs(b.x - a.x));
        const dy_abs: i32 = @intCast(@abs(b.y - a.y));
        const steps: i32 = @max(dx_abs, dy_abs);

        const start_s: i32 = if (i == 0) 0 else 1;
        var s = start_s;
        while (s <= steps) : (s += 1) {
            if (len >= state_mod.MAX_ROUTE) break;
            const t: f32 = if (steps == 0) 0 else @as(f32, @floatFromInt(s)) / @as(f32, @floatFromInt(steps));
            st.air_route[len] = .{
                .x = @intFromFloat(@round(@as(f32, @floatFromInt(a.x)) + @as(f32, @floatFromInt(b.x - a.x)) * t)),
                .y = @intFromFloat(@round(@as(f32, @floatFromInt(a.y)) + @as(f32, @floatFromInt(b.y - a.y)) * t)),
            };
            len += 1;
        }
    }
    st.air_route_len = len;
}

test "findRoute on empty grid" {
    var st = state_mod.State{};
    st.grid = map_mod.buildBaseLayout();
    const ok = findRoute(&st.grid, null, &st);
    try std.testing.expect(ok);
    try std.testing.expect(st.flat_route_len > 10);
}

test "buildAirRoute" {
    var st = state_mod.State{};
    buildAirRoute(&st);
    try std.testing.expect(st.air_route_len > 10);
}
