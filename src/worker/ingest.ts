import type { Env } from "./types";

const MAX_BODY = 256 * 1024;

interface Header {
  runId: string;
  version: string;
  mode: string;
  outcome: string;
  dataset: string;
  run: {
    waveReached: number;
    finalLives: number;
    finalGold: number;
    totalKills: number;
    towerCount: number;
    comboCount: number;
    maxChanceTier: number;
    rocksRemoved: number;
    downgradesUsed: number;
    durationTicks: number;
    totalLeaks: number;
    cleanWaves: number;
  };
}

export async function handleIngest(
  request: Request,
  env: Env,
): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_BODY) {
    return new Response("Payload too large", { status: 413 });
  }

  let body: Header & Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.runId || !body.version || !body.mode || !body.outcome || !body.dataset || !body.run) {
    return new Response("Invalid payload shape", { status: 400 });
  }

  const { runId, version, mode, outcome, run, dataset } = body;

  if (dataset === "runs") {
    env.TELEMETRY_RUNS.writeDataPoint({
      indexes: [runId],
      blobs: [outcome, version, mode],
      doubles: [
        run.waveReached, run.finalLives, run.finalGold, run.totalKills,
        run.towerCount, run.comboCount, run.maxChanceTier, run.rocksRemoved,
        run.downgradesUsed, run.durationTicks, run.totalLeaks, run.cleanWaves,
      ],
    });
  } else if (dataset === "waves") {
    const waves = body.waves as Array<Record<string, number>>;
    if (!Array.isArray(waves)) return new Response("Missing waves", { status: 400 });
    for (const w of waves) {
      env.TELEMETRY_WAVES.writeDataPoint({
        indexes: [runId],
        blobs: [version, mode],
        doubles: [
          w.wave, w.lives, w.gold, w.kills, w.leaks, w.spawned,
          w.durationTicks, w.chanceTier, w.towerCount, w.rockCount,
          w.comboCount, w.keeperQuality, w.totalDamage,
        ],
      });
    }
  } else if (dataset === "towers") {
    const towers = body.towers as Array<Record<string, unknown>>;
    if (!Array.isArray(towers)) return new Response("Missing towers", { status: 400 });
    for (const t of towers) {
      env.TELEMETRY_TOWERS.writeDataPoint({
        indexes: [runId],
        blobs: [String(t.gem), String(t.comboKey), version, mode],
        doubles: [
          t.quality as number, t.upgradeTier as number, t.kills as number,
          t.totalDamage as number, t.placedWave as number,
          t.x as number, t.y as number, run.waveReached,
        ],
      });
    }
  } else if (dataset === "events") {
    const events = body.events as Array<Record<string, unknown>>;
    if (!Array.isArray(events)) return new Response("Missing events", { status: 400 });
    for (const e of events) {
      env.TELEMETRY_EVENTS.writeDataPoint({
        indexes: [runId],
        blobs: [String(e.type), String(e.gem), version, mode, String(e.detail)],
        doubles: [
          e.wave as number, e.gold as number, e.quality as number,
          e.cost as number, e.chanceTier as number, e.value1 as number,
        ],
      });
    }
  }

  return new Response(null, { status: 204 });
}
