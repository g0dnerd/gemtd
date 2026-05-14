import type { Env } from "./types";

const MAX_BODY = 256 * 1024;

interface RunData {
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
}

interface Payload {
  runId: string;
  version: string;
  mode: string;
  outcome: string;
  run: RunData;
  waves: Array<Record<string, number>>;
  towers: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

export async function handleIngest(
  request: Request,
  env: Env,
): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_BODY) {
    return new Response("Payload too large", { status: 413 });
  }

  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.runId || !body.version || !body.mode || !body.outcome || !body.run) {
    return new Response("Invalid payload shape", { status: 400 });
  }

  const { runId, version, mode, outcome, run } = body;
  const waves = body.waves ?? [];
  const towers = body.towers ?? [];
  const events = body.events ?? [];

  const db = env.gemtd_telemetry;
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db.prepare(
      `INSERT INTO runs (run_id, version, mode, outcome,
         wave_reached, final_lives, final_gold, total_kills,
         tower_count, combo_count, max_chance_tier, rocks_removed,
         downgrades_used, duration_ticks, total_leaks, clean_waves)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      runId, version, mode, outcome,
      run.waveReached, run.finalLives, run.finalGold, run.totalKills,
      run.towerCount, run.comboCount, run.maxChanceTier, run.rocksRemoved,
      run.downgradesUsed, run.durationTicks, run.totalLeaks, run.cleanWaves,
    ),
  );

  for (const w of waves) {
    stmts.push(
      db.prepare(
        `INSERT INTO waves (run_id, wave, lives, gold, kills, leaks,
           spawned, duration_ticks, chance_tier, tower_count, rock_count,
           combo_count, keeper_quality, total_damage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        runId, w.wave, w.lives, w.gold, w.kills, w.leaks,
        w.spawned, w.durationTicks, w.chanceTier, w.towerCount, w.rockCount,
        w.comboCount, w.keeperQuality, w.totalDamage,
      ),
    );
  }

  for (const t of towers) {
    stmts.push(
      db.prepare(
        `INSERT INTO towers (run_id, gem, quality, combo_key, upgrade_tier,
           kills, total_damage, placed_wave, x, y)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        runId, t.gem, t.quality, t.comboKey, t.upgradeTier,
        t.kills, t.totalDamage, t.placedWave, t.x, t.y,
      ),
    );
  }

  for (const e of events) {
    stmts.push(
      db.prepare(
        `INSERT INTO events (run_id, event_type, wave, gold, gem, quality,
           cost, chance_tier, detail, value1)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        runId, e.type, e.wave, e.gold, e.gem, e.quality,
        e.cost, e.chanceTier, e.detail, e.value1,
      ),
    );
  }

  try {
    await db.batch(stmts);
  } catch (err) {
    console.error("D1 batch insert failed:", err);
    return new Response("Insert failed", { status: 500 });
  }

  return new Response(null, { status: 204 });
}
