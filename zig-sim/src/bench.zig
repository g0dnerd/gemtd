const std = @import("std");
const greedy_ai = @import("greedy_ai.zig");

pub fn main() !void {
    var single_threaded: std.Io.Threaded = .init_single_threaded;
    const io = single_threaded.io();

    const seeds: u32 = 50;
    const clock = std.Io.Clock.awake;
    const start = std.Io.Timestamp.now(io, clock);

    var total_waves: i64 = 0;
    var victories: i64 = 0;

    for (1..seeds + 1) |s| {
        const result = greedy_ai.runGame(@intCast(s));
        total_waves += result.wave_reached;
        if (result.outcome == .victory) victories += 1;
    }

    const elapsed = start.untilNow(io, clock);
    const elapsed_ms = elapsed.toMilliseconds();
    const per_game_ms = @as(f64, @floatFromInt(elapsed_ms)) / @as(f64, @floatFromInt(seeds));

    var stdout_buffer: [512]u8 = undefined;
    var stdout_writer = std.Io.File.stdout().writer(io, &stdout_buffer);
    const stdout: *std.Io.Writer = &stdout_writer.interface;

    try stdout.print("Ran {d} games in {d}ms ({d:.1}ms/game)\n", .{ seeds, elapsed_ms, per_game_ms });
    try stdout.print("Mean wave: {d:.1}, victories: {d}/{d}\n", .{
        @as(f64, @floatFromInt(total_waves)) / @as(f64, @floatFromInt(seeds)),
        victories,
        seeds,
    });
    try stdout.flush();
}
