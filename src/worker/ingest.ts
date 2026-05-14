import type { Env, TelemetryPayload } from "./types";

const MAX_BODY = 256 * 1024;

export async function handleIngest(
  request: Request,
  env: Env,
): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_BODY) {
    return new Response("Payload too large", { status: 413 });
  }

  let payload: TelemetryPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (
    !payload.runId ||
    !payload.version ||
    !payload.mode ||
    !payload.outcome ||
    !payload.run ||
    !Array.isArray(payload.waves) ||
    !Array.isArray(payload.towers) ||
    !Array.isArray(payload.events)
  ) {
    return new Response("Invalid payload shape", { status: 400 });
  }

  const { runId, version, mode, outcome, run } = payload;

  env.TELEMETRY_RUNS.writeDataPoint({
    indexes: [runId],
    blobs: [outcome, version, mode],
    doubles: [
      run.waveReached,
      run.finalLives,
      run.finalGold,
      run.totalKills,
      run.towerCount,
      run.comboCount,
      run.maxChanceTier,
      run.rocksRemoved,
      run.downgradesUsed,
      run.durationTicks,
      run.totalLeaks,
      run.cleanWaves,
    ],
  });

  for (const w of payload.waves) {
    env.TELEMETRY_WAVES.writeDataPoint({
      indexes: [runId],
      blobs: [version, mode],
      doubles: [
        w.wave,
        w.lives,
        w.gold,
        w.kills,
        w.leaks,
        w.spawned,
        w.durationTicks,
        w.chanceTier,
        w.towerCount,
        w.rockCount,
        w.comboCount,
        w.keeperQuality,
        w.totalDamage,
      ],
    });
  }

  for (const t of payload.towers) {
    env.TELEMETRY_TOWERS.writeDataPoint({
      indexes: [runId],
      blobs: [t.gem, t.comboKey, version, mode],
      doubles: [
        t.quality,
        t.upgradeTier,
        t.kills,
        t.totalDamage,
        t.placedWave,
        t.x,
        t.y,
        run.waveReached,
      ],
    });
  }

  for (const e of payload.events) {
    env.TELEMETRY_EVENTS.writeDataPoint({
      indexes: [runId],
      blobs: [e.type, e.gem, version, mode, e.detail],
      doubles: [
        e.wave,
        e.gold,
        e.quality,
        e.cost,
        e.chanceTier,
        e.value1,
      ],
    });
  }

  return new Response(null, { status: 204 });
}
