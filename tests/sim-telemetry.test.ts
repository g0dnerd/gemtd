import { describe, expect, it } from 'vitest';
import { HeadlessGame } from '../src/sim/HeadlessGame';
import { GreedyAI } from '../src/sim/ai/GreedyAI';

// These tests exercise the opt-in sim telemetry path (HeadlessGame.attachTelemetry
// reusing TelemetryCollector). A capturing in-memory transport stands in for the
// HTTP POST, so nothing touches the network or any DB.

describe('sim telemetry', () => {
  it('tags runs as sim, emits the parity-fixed chance:upgrade event, and finalizes once', async () => {
    // Surgical + instant: drive the fixed command directly rather than running a
    // full game, so this guards the HeadlessGame event-parity fix regardless of
    // any AI's trajectory.
    const game = new HeadlessGame(1);
    game.newGame(); // enters the build phase

    let captured: Record<string, unknown> | null = null;
    let sendCount = 0;
    const collector = game.attachTelemetry({
      version: 'test',
      mode: 'sim',
      ai: 'manual',
      seed: 1,
      transport: async (payload) => {
        sendCount++;
        captured = payload;
      },
    });

    game.state.gold = 9999;
    expect(game.cmdUpgradeChanceTier()).toBe(true);
    expect(game.cmdUpgradeChanceTier()).toBe(true);

    // No terminal phase:enter fired -> flush happens only via finalize (mirrors
    // HeadlessGame.runGame's timeout branch). Second call must be a no-op.
    collector.finalize('gameover');
    collector.finalize('gameover');
    await collector.whenDone();

    expect(sendCount).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = captured as any;
    expect(p.mode).toBe('sim');
    expect(p.ai).toBe('manual');
    expect(p.seed).toBe(1);
    expect(p.version).toBe('test');
    expect(p.events.some((e: { type: string }) => e.type === 'chance_upgrade')).toBe(true);
    // Without the chance:upgrade emit this would stay 0 (HeuristicAI is chance-tier-aggressive).
    expect(p.run.maxChanceTier).toBeGreaterThan(0);
  });

  it('produces the per-gem balancing dataset for a full sim run', async () => {
    // A real (deterministic) run end-to-end. GreedyAI dies early, so this stays
    // fast while still populating waves/towers/waveGemDamage like a real player run.
    const seed = 1;
    const game = new HeadlessGame(seed);

    let captured: Record<string, unknown> | null = null;
    const collector = game.attachTelemetry({
      version: 'test',
      mode: 'sim',
      ai: 'GreedyAI',
      seed,
      transport: async (payload) => {
        captured = payload;
      },
    });

    const result = game.runGame(new GreedyAI());
    collector.finalize(result.outcome);
    await collector.whenDone();

    expect(captured).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = captured as any;
    expect(p.mode).toBe('sim');
    expect(p.ai).toBe('GreedyAI');
    expect(p.seed).toBe(seed);
    expect(p.outcome).toBe(result.outcome);
    expect(Array.isArray(p.waveGemDamage)).toBe(true);
    expect(p.waveGemDamage.length).toBeGreaterThan(0);
  });
});
