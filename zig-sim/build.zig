const std = @import("std");

pub fn build(b: *std.Build) void {

    // Shared library for Python FFI
    const lib = b.addLibrary(.{
        .name = "gemtd_sim",
        .linkage = .dynamic,
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/c_api.zig"),
            .target = b.graph.host,
        }),
    });
    b.installArtifact(lib);

    // Benchmark executable
    const bench = b.addExecutable(.{
        .name = "bench",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/bench.zig"),
            .target = b.graph.host,
            .optimize = .ReleaseFast,
        }),
    });
    b.installArtifact(bench);
    const run_bench = b.addRunArtifact(bench);
    const bench_step = b.step("bench", "Run benchmark");
    bench_step.dependOn(&run_bench.step);

    // Tests
    const unit_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = b.graph.host,
        }),
    });
    const run_unit_tests = b.addRunArtifact(unit_tests);
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_unit_tests.step);
}
