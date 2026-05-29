import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { openDb, dbPath } from "./db.js";
import { handleDashboard } from "../../src/worker/dashboard.js";

const PORT = parseInt(process.env.TELEMETRY_PORT || "3456");
const db = openDb();

function validRun(runset: string | null): string {
  return runset === "sim"
    ? "mode = 'sim' AND wave_reached > 1"
    : "mode NOT IN ('debug', 'creative', 'sim') AND wave_reached > 1";
}

function versionFilter(
  version: string | null,
  versions: string[] | null,
): { clause: string; binds: string[] } {
  if (versions && versions.length > 0)
    return { clause: `AND version IN (${versions.map(() => "?").join(",")})`, binds: versions };
  if (version)
    return { clause: "AND version = ?", binds: [version] };
  return { clause: "", binds: [] };
}

// ── helpers ──────────────────────────────────────────────────────────

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function text(res: ServerResponse, body: string, status = 200, headers: Record<string, string> = {}): void {
  cors(res);
  res.writeHead(status, { "Content-Type": "text/plain", ...headers });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 256 * 1024) { reject(new Error("Payload too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ── POST /api/telemetry ──────────────────────────────────────────────

const insertRun = db.prepare(
  `INSERT OR IGNORE INTO runs (run_id, version, mode, outcome,
     wave_reached, final_lives, final_gold, total_kills,
     tower_count, combo_count, max_chance_tier, rocks_removed,
     downgrades_used, duration_ticks, total_leaks, clean_waves,
     ai, seed)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const insertWave = db.prepare(
  `INSERT INTO waves (run_id, wave, lives, gold, kills, leaks,
     spawned, duration_ticks, chance_tier, tower_count, rock_count,
     combo_count, keeper_quality, total_damage,
     avg_path_progress, max_path_progress, avg_ticks_to_kill,
     avg_tower_quality, gem_type_count, max_upgrade_tier)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const insertTower = db.prepare(
  `INSERT INTO towers (run_id, gem, quality, combo_key, upgrade_tier,
     kills, total_damage, placed_wave, x, y)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const insertEvent = db.prepare(
  `INSERT INTO events (run_id, event_type, wave, gold, gem, quality,
     cost, chance_tier, detail, value1)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const insertWaveCreepStat = db.prepare(
  `INSERT INTO wave_creep_stats (run_id, wave, creep_kind, spawned, kills, leaks,
     avg_path_progress, max_path_progress, avg_ticks_to_kill, total_hp_spawned)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const insertWaveGemDamage = db.prepare(
  `INSERT INTO wave_gem_damage (run_id, wave, gem, is_combo, combo_key, upgrade_tier, damage, kills)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);

const ingestTx = db.transaction(
  (runId: string, version: string, mode: string, outcome: string,
   ai: string, seed: number,
   run: any, waves: any[], towers: any[], events: any[],
   waveCreepStats: any[], waveGemDamage: any[]) => {
    insertRun.run(
      runId, version, mode, outcome,
      run.waveReached, run.finalLives, run.finalGold, run.totalKills,
      run.towerCount, run.comboCount, run.maxChanceTier, run.rocksRemoved,
      run.downgradesUsed, run.durationTicks, run.totalLeaks, run.cleanWaves,
      ai, seed,
    );
    for (const w of waves) {
      insertWave.run(
        runId, w.wave, w.lives, w.gold, w.kills, w.leaks,
        w.spawned, w.durationTicks, w.chanceTier, w.towerCount, w.rockCount,
        w.comboCount, w.keeperQuality, w.totalDamage,
        w.avgPathProgress ?? 0, w.maxPathProgress ?? 0, w.avgTicksToKill ?? 0,
        w.avgTowerQuality ?? 0, w.gemTypeCount ?? 0, w.maxUpgradeTier ?? 0,
      );
    }
    for (const t of towers) {
      insertTower.run(
        runId, t.gem, t.quality, t.comboKey, t.upgradeTier,
        t.kills, t.totalDamage, t.placedWave, t.x, t.y,
      );
    }
    for (const e of events) {
      insertEvent.run(
        runId, e.type, e.wave, e.gold, e.gem, e.quality,
        e.cost, e.chanceTier, e.detail, e.value1,
      );
    }
    for (const wcs of waveCreepStats) {
      const kills = Number(wcs.kills) || 0;
      const leaks = Number(wcs.leaks) || 0;
      const total = kills + leaks;
      const avgProgress = total > 0 ? (Number(wcs.pathProgressSum) || 0) / total : 0;
      const avgTicks = kills > 0 ? (Number(wcs.ticksToKillSum) || 0) / kills : 0;
      insertWaveCreepStat.run(
        runId, wcs.wave, wcs.creepKind, wcs.spawned, kills, leaks,
        avgProgress, wcs.maxPathProgress, avgTicks, wcs.totalHpSpawned,
      );
    }
    for (const wgd of waveGemDamage) {
      insertWaveGemDamage.run(
        runId, wgd.wave, wgd.gem, wgd.isCombo ? 1 : 0, wgd.comboKey ?? "", wgd.upgradeTier ?? 0, wgd.damage, wgd.kills,
      );
    }
  },
);

function handleIngest(req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((raw) => {
    let body: any;
    try { body = JSON.parse(raw); } catch { text(res, "Invalid JSON", 400); return; }

    if (!body.runId || !body.version || !body.mode || !body.outcome || !body.run) {
      text(res, "Invalid payload shape", 400); return;
    }

    const { runId, version, mode, outcome, run } = body;

    try {
      ingestTx(runId, version, mode, outcome, body.ai ?? "", body.seed ?? 0, run, body.waves ?? [], body.towers ?? [], body.events ?? [], body.waveCreepStats ?? [], body.waveGemDamage ?? []);
      console.log(`Ingested run ${runId} (${mode}${body.ai ? `/${body.ai}` : ""}, wave ${run.waveReached}, ${outcome})`);
      cors(res);
      res.writeHead(204);
      res.end();
    } catch (err) {
      console.error("Insert failed:", err);
      text(res, "Insert failed", 500);
    }
  }).catch((err) => {
    text(res, err.message, err.message.includes("large") ? 413 : 500);
  });
}

// ── GET /api/stats ───────────────────────────────────────────────────

function handleStats(url: URL, res: ServerResponse): void {
  const vf = versionFilter(
    url.searchParams.get("version") || null,
    url.searchParams.get("versions")?.split(",").filter(Boolean) || null,
  );
  const VALID = validRun(url.searchParams.get("runset"));
  const runsWhere = `AND ${VALID} ${vf.clause}`;
  const childWhere = (col = "run_id") =>
    `AND ${col} IN (SELECT run_id FROM runs WHERE ${VALID} ${vf.clause})`;

  const overview = db.prepare(
    `SELECT count(*) as total_runs, avg(wave_reached) as avg_wave,
            avg(duration_ticks) as avg_duration_ticks, avg(total_kills) as avg_kills
     FROM runs WHERE 1=1 ${runsWhere}`,
  ).get(...vf.binds) as any ?? {};

  const winRow = db.prepare(
    `SELECT count(*) as wins FROM runs WHERE outcome = 'victory' ${runsWhere}`,
  ).get(...vf.binds) as any ?? {};

  const survivalCurve = db.prepare(
    `SELECT wave, count(*) as runs FROM waves
     WHERE 1=1 ${childWhere()} GROUP BY wave ORDER BY wave`,
  ).all(...vf.binds);

  const leaksPerWave = db.prepare(
    `SELECT w.wave, avg(w.leaks) as avg_leaks, sum(w.leaks) as total_leaks,
            avg(w.lives) as avg_lives, avg(w.gold) as avg_gold,
            avg(COALESCE(e.lives_lost, 0)) as avg_lives_lost, count(*) as runs
     FROM waves w
     LEFT JOIN (
       SELECT run_id, wave, sum(cost) as lives_lost
       FROM events WHERE event_type = 'leak' ${childWhere()}
       GROUP BY run_id, wave
     ) e ON w.run_id = e.run_id AND w.wave = e.wave
     WHERE 1=1 ${childWhere("w.run_id")}
     GROUP BY w.wave ORDER BY w.wave`,
  ).all(...vf.binds, ...vf.binds);

  const combos = db.prepare(
    `SELECT t.combo_key, t.upgrade_tier as tier, count(*) as count,
            avg(t.total_damage) as avg_damage,
            avg(t.total_damage * 1.0 / (r.wave_reached - t.placed_wave + 1)) as avg_dmg_per_wave,
            avg(t.placed_wave) as avg_wave_built,
            avg(r.wave_reached) as avg_wave_reached
     FROM towers t JOIN runs r ON t.run_id = r.run_id
     WHERE t.combo_key != '' ${childWhere("t.run_id")}
     GROUP BY t.combo_key, t.upgrade_tier ORDER BY t.combo_key, t.upgrade_tier`,
  ).all(...vf.binds);

  const gemDps = db.prepare(
    `SELECT t.gem, t.quality, count(*) as count,
            avg(t.total_damage) as avg_damage,
            avg(t.total_damage * 1.0 / (r.wave_reached - t.placed_wave + 1)) as avg_dmg_per_wave,
            avg(CASE WHEN rt.run_total > 0 THEN t.total_damage * 1.0 / rt.run_total ELSE 0 END) as avg_damage_share
     FROM towers t JOIN runs r ON t.run_id = r.run_id
     JOIN (SELECT run_id, sum(total_damage) as run_total FROM towers GROUP BY run_id) rt
       ON t.run_id = rt.run_id
     WHERE t.combo_key = '' ${childWhere("t.run_id")}
     GROUP BY t.gem, t.quality ORDER BY avg_dmg_per_wave DESC`,
  ).all(...vf.binds);

  const chanceTiming = db.prepare(
    `SELECT chance_tier as tier, avg(wave) as avg_wave,
            avg(gold) as avg_gold, count(*) as count
     FROM events WHERE event_type = 'chance_upgrade' ${childWhere()}
     GROUP BY chance_tier ORDER BY chance_tier`,
  ).all(...vf.binds);

  const keeperCurve = db.prepare(
    `SELECT wave, avg(keeper_quality) as avg_keeper_quality
     FROM waves WHERE keeper_quality > 0 ${childWhere()}
     GROUP BY wave ORDER BY wave`,
  ).all(...vf.binds);

  const keeperChoices = db.prepare(
    `SELECT gem, count(*) as count,
            avg(quality) as avg_quality, avg(wave) as avg_wave
     FROM events WHERE event_type = 'keeper' ${childWhere()}
     GROUP BY gem ORDER BY count DESC`,
  ).all(...vf.binds);

  const waveDamage = db.prepare(
    `SELECT wave, avg(total_damage) as avg_damage
     FROM waves WHERE 1=1 ${childWhere()}
     GROUP BY wave ORDER BY wave`,
  ).all(...vf.binds);

  const leaksByKind = db.prepare(
    `SELECT detail as creep_kind, count(*) as leak_count,
            sum(cost) as total_lives_lost, avg(cost) as avg_lives_per_leak
     FROM events WHERE event_type = 'leak' ${childWhere()}
     GROUP BY detail ORDER BY total_lives_lost DESC`,
  ).all(...vf.binds);

  const deathsByWave = db.prepare(
    `SELECT wave_reached as wave, count(*) as deaths
     FROM runs WHERE outcome = 'gameover' ${runsWhere}
     GROUP BY wave_reached ORDER BY wave_reached`,
  ).all(...vf.binds);

  const versionRows = db.prepare(
    `SELECT DISTINCT version FROM runs WHERE ${VALID} ORDER BY version DESC`,
  ).all() as Array<{ version: string }>;

  const wavePressure = db.prepare(
    `SELECT wave, avg(avg_path_progress) as avg_path_progress,
            avg(max_path_progress) as avg_max_path_progress,
            avg(avg_ticks_to_kill) as avg_ticks_to_kill,
            avg(avg_tower_quality) as avg_quality,
            avg(gem_type_count) as avg_gem_types,
            avg(max_upgrade_tier) as avg_max_tier,
            count(*) as runs
     FROM waves WHERE 1=1 ${childWhere()}
     GROUP BY wave ORDER BY wave`,
  ).all(...vf.binds);

  const creepKindProgress = db.prepare(
    `SELECT wave, creep_kind, avg(avg_path_progress) as avg_progress,
            avg(max_path_progress) as avg_max_progress,
            avg(avg_ticks_to_kill) as avg_ticks,
            sum(leaks) as total_leaks, sum(spawned) as total_spawned,
            sum(kills) as total_kills, count(*) as runs
     FROM wave_creep_stats WHERE 1=1 ${childWhere()}
     GROUP BY wave, creep_kind ORDER BY wave, creep_kind`,
  ).all(...vf.binds);

  const creepKindSummary = db.prepare(
    `SELECT creep_kind, sum(spawned) as total_spawned,
            sum(kills) as total_kills, sum(leaks) as total_leaks,
            avg(avg_path_progress) as avg_progress,
            avg(avg_ticks_to_kill) as avg_ticks,
            sum(total_hp_spawned) as total_hp
     FROM wave_creep_stats WHERE 1=1 ${childWhere()}
     GROUP BY creep_kind ORDER BY total_leaks DESC`,
  ).all(...vf.binds);

  const gemDamageByWave = db.prepare(
    `SELECT wave, gem, is_combo, sum(damage) as total_damage,
            sum(kills) as total_kills, count(DISTINCT run_id) as runs
     FROM wave_gem_damage WHERE 1=1 ${childWhere()}
     GROUP BY wave, gem, is_combo ORDER BY wave, gem`,
  ).all(...vf.binds);

  const gemDamageSummary = db.prepare(
    `SELECT gem, is_combo, sum(damage) as total_damage,
            sum(kills) as total_kills,
            sum(damage) * 1.0 / count(DISTINCT run_id) as avg_damage_per_run_wave
     FROM wave_gem_damage WHERE 1=1 ${childWhere()}
     GROUP BY gem, is_combo ORDER BY total_damage DESC`,
  ).all(...vf.binds);

  const waveHpPool = db.prepare(
    `SELECT wave, sum(total_hp_spawned) * 1.0 / count(DISTINCT run_id) as avg_hp_pool
     FROM wave_creep_stats WHERE 1=1 ${childWhere()}
     GROUP BY wave ORDER BY wave`,
  ).all(...vf.binds);

  const comboDamageByWave = db.prepare(
    `SELECT wave, combo_key, upgrade_tier, sum(damage) as total_damage,
            sum(kills) as total_kills, count(DISTINCT run_id) as runs
     FROM wave_gem_damage WHERE combo_key != '' ${childWhere()}
     GROUP BY wave, combo_key, upgrade_tier ORDER BY wave, combo_key, upgrade_tier`,
  ).all(...vf.binds);

  json(res, {
    overview: { ...overview, wins: winRow.wins ?? 0 },
    versions: versionRows.map((r) => r.version),
    survivalCurve,
    leaksPerWave,
    combos,
    gemDps,
    chanceTiming,
    keeperCurve,
    keeperChoices,
    waveDamage,
    leaksByKind,
    deathsByWave,
    wavePressure,
    creepKindProgress,
    creepKindSummary,
    gemDamageByWave,
    gemDamageSummary,
    waveHpPool,
    comboDamageByWave,
  });
}

// ── GET /api/export ──────────────────────────────────────────────────

const TABLES: Record<string, string[]> = {
  runs: [
    "run_id", "outcome", "version", "mode", "ai", "seed", "wave_reached", "final_lives",
    "final_gold", "total_kills", "tower_count", "combo_count", "max_chance_tier",
    "rocks_removed", "downgrades_used", "duration_ticks", "total_leaks",
    "clean_waves", "created_at",
  ],
  waves: [
    "run_id", "wave", "lives", "gold", "kills", "leaks", "spawned",
    "duration_ticks", "chance_tier", "tower_count", "rock_count",
    "combo_count", "keeper_quality", "total_damage",
  ],
  towers: [
    "run_id", "gem", "quality", "combo_key", "upgrade_tier", "kills",
    "total_damage", "placed_wave", "x", "y",
  ],
  events: [
    "run_id", "event_type", "gem", "detail", "wave", "gold", "quality",
    "cost", "chance_tier", "value1",
  ],
  wave_creep_stats: [
    "run_id", "wave", "creep_kind", "spawned", "kills", "leaks",
    "avg_path_progress", "max_path_progress", "avg_ticks_to_kill",
    "total_hp_spawned",
  ],
  wave_gem_damage: [
    "run_id", "wave", "gem", "is_combo", "combo_key", "upgrade_tier", "damage", "kills",
  ],
};

function handleExport(url: URL, res: ServerResponse): void {
  const table = url.searchParams.get("dataset") || "runs";
  const format = url.searchParams.get("format") || "json";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 10000);
  const vf = versionFilter(
    url.searchParams.get("version") || null,
    url.searchParams.get("versions")?.split(",").filter(Boolean) || null,
  );
  const VALID = validRun(url.searchParams.get("runset"));

  const columns = TABLES[table];
  if (!columns) { text(res, `Invalid dataset. Valid: ${Object.keys(TABLES).join(", ")}`, 400); return; }

  let sql: string;
  const binds: unknown[] = [];

  if (table === "runs") {
    sql = `SELECT ${columns.join(", ")} FROM runs WHERE ${VALID} ${vf.clause}`;
    binds.push(...vf.binds);
    sql += " ORDER BY created_at DESC LIMIT ?";
  } else {
    sql = `SELECT ${columns.join(", ")} FROM ${table} WHERE run_id IN (SELECT run_id FROM runs WHERE ${VALID} ${vf.clause})`;
    binds.push(...vf.binds);
    sql += " LIMIT ?";
  }
  binds.push(limit);

  const rows = db.prepare(sql).all(...binds) as Array<Record<string, unknown>>;

  if (format === "csv") {
    if (rows.length === 0) {
      cors(res);
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${table}.csv"`,
      });
      res.end("");
      return;
    }
    const keys = Object.keys(rows[0]);
    const header = keys.join(",");
    const lines = rows.map((row) =>
      keys.map((k) => {
        const v = row[k];
        if (typeof v === "string" && (v.includes(",") || v.includes('"')))
          return `"${v.replace(/"/g, '""')}"`;
        return String(v ?? "");
      }).join(","),
    );
    cors(res);
    res.writeHead(200, {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${table}.csv"`,
    });
    res.end([header, ...lines].join("\n"));
    return;
  }

  json(res, rows);
}

// ── GET /stats — dashboard ───────────────────────────────────────────

async function serveDashboard(res: ServerResponse): Promise<void> {
  const response = handleDashboard("");
  const html = await response.text();
  cors(res);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

// ── GET /api/summary ─────────────────────────────────────────────────

function handleSummary(res: ServerResponse): void {
  const row = db.prepare(
    `SELECT count(*) as total FROM runs WHERE ${validRun(null)}`,
  ).get() as { total: number };
  json(res, { total: row.total });
}

// ── router ───────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === "POST" && path === "/api/telemetry") {
    handleIngest(req, res);
  } else if (req.method === "GET" && path === "/api/stats") {
    handleStats(url, res);
  } else if (req.method === "GET" && path === "/api/export") {
    handleExport(url, res);
  } else if (req.method === "GET" && path === "/api/summary") {
    handleSummary(res);
  } else if (req.method === "GET" && (path === "/stats" || path === "/")) {
    serveDashboard(res);
  } else {
    text(res, "Not found", 404);
  }
});

// Sim workers reuse one keep-alive socket across games, but a HeuristicAI game
// can take 30s+ — far longer than the 5s default. Keep idle sockets open so the
// server doesn't close one out from under a worker's next POST (ECONNRESET).
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

server.listen(PORT, () => {
  const row = db.prepare("SELECT count(*) as total FROM runs").get() as { total: number };
  console.log(`Local telemetry server on http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/stats`);
  console.log(`DB: ${dbPath()} (${row.total} runs)`);
});
