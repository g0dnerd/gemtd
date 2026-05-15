const std = @import("std");
const types = @import("types.zig");
const c = @import("constants.zig");

pub const WAYPOINTS: []const types.Waypoint = &.{
    .{ .x = 0, .y = 6 }, // Start
    .{ .x = 8, .y = 6 }, // WP1
    .{ .x = 8, .y = 22 }, // WP2
    .{ .x = 32, .y = 22 }, // WP3
    .{ .x = 32, .y = 6 }, // WP4
    .{ .x = 20, .y = 6 }, // WP5
    .{ .x = 20, .y = 34 }, // WP6
    .{ .x = 40, .y = 34 }, // End
};

pub const START = types.Waypoint{ .x = 0, .y = 6 };
pub const END = types.Waypoint{ .x = 40, .y = 34 };

const CheckpointCell = struct { x: usize, y: usize };

const checkpoint_zones: []const []const CheckpointCell = &.{
    // WP1 (index 1)
    &.{ .{ .x = 7, .y = 6 }, .{ .x = 8, .y = 6 }, .{ .x = 9, .y = 6 }, .{ .x = 8, .y = 7 } },
    // WP2 (index 2)
    &.{ .{ .x = 8, .y = 21 }, .{ .x = 8, .y = 22 }, .{ .x = 8, .y = 23 }, .{ .x = 9, .y = 22 } },
    // WP3 (index 3)
    &.{ .{ .x = 31, .y = 22 }, .{ .x = 32, .y = 22 }, .{ .x = 32, .y = 23 }, .{ .x = 32, .y = 21 } },
    // WP4 (index 4)
    &.{ .{ .x = 32, .y = 7 }, .{ .x = 32, .y = 6 }, .{ .x = 32, .y = 5 }, .{ .x = 31, .y = 6 } },
    // WP5 (index 5)
    &.{ .{ .x = 21, .y = 6 }, .{ .x = 20, .y = 6 }, .{ .x = 19, .y = 6 }, .{ .x = 20, .y = 7 } },
    // WP6 (index 6)
    &.{ .{ .x = 20, .y = 33 }, .{ .x = 20, .y = 34 }, .{ .x = 19, .y = 34 }, .{ .x = 21, .y = 34 } },
};

pub const Grid = [c.GRID_H][c.GRID_W]types.Cell;

pub fn buildBaseLayout() Grid {
    var grid: Grid = undefined;

    // Fill with walls/grass
    for (0..c.GRID_H) |y| {
        for (0..c.GRID_W) |x| {
            const on_border = x < 2 or x >= c.GRID_W - 2 or y < 2 or y >= c.GRID_H - 2;
            grid[y][x] = if (on_border) .wall else .grass;
        }
    }

    // Start 2×2 tile
    const sx: usize = 0;
    const sy: usize = @intCast(START.y);
    for (0..2) |dy| {
        for (0..2) |dx| {
            grid[sy + dy][sx + dx] = .path;
        }
    }
    // Start blocked cell
    grid[sy][2] = .path;

    // End 2×2 tile
    const ey: usize = @intCast(END.y);
    for (0..2) |dy| {
        for (0..2) |dx| {
            grid[ey + dy][c.GRID_W - 2 + dx] = .path;
        }
    }
    // End blocked cell
    grid[ey][c.GRID_W - 3] = .path;

    // Checkpoint zones
    for (checkpoint_zones) |zone| {
        for (zone) |cell| {
            grid[cell.y][cell.x] = .path;
        }
    }

    return grid;
}

pub fn copyGrid(dst: *Grid, src: *const Grid) void {
    dst.* = src.*;
}

pub fn inBounds(x: i32, y: i32) bool {
    return x >= 0 and y >= 0 and x < @as(i32, c.GRID_W) and y < @as(i32, c.GRID_H);
}

test "base layout has paths" {
    const grid = buildBaseLayout();
    // Start area should be path
    try std.testing.expect(grid[6][0] == .path);
    try std.testing.expect(grid[6][1] == .path);
    // Interior should be grass
    try std.testing.expect(grid[10][10] == .grass);
    // Border should be wall
    try std.testing.expect(grid[0][0] == .wall);
}
