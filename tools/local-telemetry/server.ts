import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { openDb, dbPath } from "./db.js";
import { handleDashboard } from "../../src/worker/dashboard.js";

const PORT = parseInt(process.env.TELEMETRY_PORT || "3456");
const db = openDb();

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

function handleIngest(req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((raw) => {
    let body: any;
    try { body = JSON.parse(raw); } catch { text(res, "Invalid JSON", 400); return; }

    if (!body.runId || !body.version || !body.mode || !body.outcome || !body.run) {
      text(res, "Invalid payload shape", 400); return;
    }

    const { runId, version, mode, outcome, run } = body;
    const waves: any[] = body.waves ?? [];
    const towers: any[] = body.towers ?? [];
    const events: any[] = body.events ?? [];

    const insertRun = db.prepare(
      `INSERT OR IGNORE INTO runs (run_id, version, mode, outcome,
         wave_reached, final_lives, final_gold, total_kills,
         tower_count, combo_count, max_chance_tier, rocks_removed,
         downgrades_used, duration_ticks, total_leaks, clean_waves)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertWave = db.prepare(
      `INSERT INTO waves (run_id, wave, lives, gold, kills, leaks,
         spawned, duration_ticks, chance_tier, tower_count, rock_count,
         combo_count, keeper_quality, total_damage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    const tx = db.transaction(() => {
      insertRun.run(
        runId, version, mode, outcome,
        run.waveReached, run.finalLives, run.finalGold, run.totalKills,
        run.towerCount, run.comboCount, run.maxChanceTier, run.rocksRemoved,
        run.downgradesUsed, run.durationTicks, run.totalLeaks, run.cleanWaves,
      );
      for (const w of waves) {
        insertWave.run(
          runId, w.wave, w.lives, w.gold, w.kills, w.leaks,
          w.spawned, w.durationTicks, w.chanceTier, w.towerCount, w.rockCount,
          w.comboCount, w.keeperQuality, w.totalDamage,
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
    });

    try {
      tx();
      console.log(`Ingested run ${runId} (${mode}, wave ${run.waveReached}, ${outcome})`);
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
  const version = url.searchParams.get("version") || null;
  const versions = url.searchParams.get("versions")?.split(",").filter(Boolean) || null;

  const mf = "AND mode NOT IN ('debug', 'creative') AND wave_reached > 1";

  let rv = mf;
  let rBind: string[] = [];
  if (versions && versions.length > 0) {
    rv = `${mf} AND version IN (${versions.map(() => "?").join(",")})`;
    rBind = versions;
  } else if (version) {
    rv = `${mf} AND version = ?`;
    rBind = [version];
  }

  let cv = `AND run_id IN (SELECT run_id FROM runs WHERE 1=1 ${mf})`;
  let cBind: string[] = [];
  if (versions && versions.length > 0) {
    const ph = versions.map(() => "?").join(",");
    cv = `AND run_id IN (SELECT run_id FROM runs WHERE 1=1 ${mf} AND version IN (${ph}))`;
    cBind = versions;
  } else if (version) {
    cv = `AND run_id IN (SELECT run_id FROM runs WHERE 1=1 ${mf} AND version = ?)`;
    cBind = [version];
  }

  const overview = db.prepare(
    `SELECT count(*) as total_runs, avg(wave_reached) as avg_wave,
            avg(duration_ticks) as avg_duration_ticks, avg(total_kills) as avg_kills
     FROM runs WHERE 1=1 ${rv}`,
  ).get(...rBind) as any ?? {};

  const winRow = db.prepare(
    `SELECT count(*) as wins FROM runs WHERE outcome = 'victory' ${rv}`,
  ).get(...rBind) as any ?? {};

  const survivalCurve = db.prepare(
    `SELECT wave, count(*) as runs FROM waves
     WHERE 1=1 ${cv} GROUP BY wave ORDER BY wave`,
  ).all(...cBind);

  const leaksPerWave = db.prepare(
    `SELECT w.wave, avg(w.leaks) as avg_leaks, sum(w.leaks) as total_leaks,
            avg(w.lives) as avg_lives, avg(w.gold) as avg_gold,
            avg(COALESCE(e.lives_lost, 0)) as avg_lives_lost, count(*) as runs
     FROM waves w
     LEFT JOIN (
       SELECT run_id, wave, sum(cost) as lives_lost
       FROM events WHERE event_type = 'leak' ${cv}
       GROUP BY run_id, wave
     ) e ON w.run_id = e.run_id AND w.wave = e.wave
     WHERE 1=1 ${cv.replace("run_id", "w.run_id")}
     GROUP BY w.wave ORDER BY w.wave`,
  ).all(...cBind, ...cBind);

  const combos = db.prepare(
    `SELECT t.combo_key, t.upgrade_tier as tier, count(*) as count,
            avg(t.total_damage) as avg_damage,
            avg(t.total_damage * 1.0 / (r.wave_reached - t.placed_wave + 1)) as avg_dmg_per_wave,
            avg(t.placed_wave) as avg_wave_built,
            avg(r.wave_reached) as avg_wave_reached
     FROM towers t JOIN runs r ON t.run_id = r.run_id
     WHERE t.combo_key != '' ${cv.replace("run_id", "t.run_id")}
     GROUP BY t.combo_key, t.upgrade_tier ORDER BY t.combo_key, t.upgrade_tier`,
  ).all(...cBind);

  const gemDps = db.prepare(
    `SELECT t.gem, t.quality, count(*) as count,
            avg(t.total_damage) as avg_damage,
            avg(t.total_damage * 1.0 / (r.wave_reached - t.placed_wave + 1)) as avg_dmg_per_wave
     FROM towers t JOIN runs r ON t.run_id = r.run_id
     WHERE t.combo_key = '' ${cv.replace("run_id", "t.run_id")}
     GROUP BY t.gem, t.quality ORDER BY avg_dmg_per_wave DESC`,
  ).all(...cBind);

  const chanceTiming = db.prepare(
    `SELECT chance_tier as tier, avg(wave) as avg_wave,
            avg(gold) as avg_gold, count(*) as count
     FROM events WHERE event_type = 'chance_upgrade' ${cv}
     GROUP BY chance_tier ORDER BY chance_tier`,
  ).all(...cBind);

  const keeperCurve = db.prepare(
    `SELECT wave, avg(keeper_quality) as avg_keeper_quality
     FROM waves WHERE keeper_quality > 0 ${cv}
     GROUP BY wave ORDER BY wave`,
  ).all(...cBind);

  const keeperChoices = db.prepare(
    `SELECT gem, count(*) as count,
            avg(quality) as avg_quality, avg(wave) as avg_wave
     FROM events WHERE event_type = 'keeper' ${cv}
     GROUP BY gem ORDER BY count DESC`,
  ).all(...cBind);

  const waveDamage = db.prepare(
    `SELECT wave, avg(total_damage) as avg_damage
     FROM waves WHERE 1=1 ${cv}
     GROUP BY wave ORDER BY wave`,
  ).all(...cBind);

  const leaksByKind = db.prepare(
    `SELECT detail as creep_kind, count(*) as leak_count,
            sum(cost) as total_lives_lost, avg(cost) as avg_lives_per_leak
     FROM events WHERE event_type = 'leak' ${cv}
     GROUP BY detail ORDER BY total_lives_lost DESC`,
  ).all(...cBind);

  const deathsByWave = db.prepare(
    `SELECT wave_reached as wave, count(*) as deaths
     FROM runs WHERE outcome = 'gameover' ${rv}
     GROUP BY wave_reached ORDER BY wave_reached`,
  ).all(...rBind);

  const versionRows = db.prepare(
    `SELECT DISTINCT version FROM runs WHERE 1=1 ${mf} ORDER BY version DESC`,
  ).all() as Array<{ version: string }>;

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
  });
}

// ── GET /api/export ──────────────────────────────────────────────────

const TABLES: Record<string, string[]> = {
  runs: [
    "run_id", "outcome", "version", "mode", "wave_reached", "final_lives",
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
};

function handleExport(url: URL, res: ServerResponse): void {
  const table = url.searchParams.get("dataset") || "runs";
  const format = url.searchParams.get("format") || "json";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 10000);
  const version = url.searchParams.get("version") || null;
  const versions = url.searchParams.get("versions")?.split(",").filter(Boolean) || null;

  const columns = TABLES[table];
  if (!columns) { text(res, `Invalid dataset. Valid: ${Object.keys(TABLES).join(", ")}`, 400); return; }

  const mf = "mode NOT IN ('debug', 'creative') AND wave_reached > 1";
  let sql: string;
  const binds: unknown[] = [];

  if (table === "runs") {
    sql = `SELECT ${columns.join(", ")} FROM runs WHERE ${mf}`;
    if (versions && versions.length > 0) {
      sql += ` AND version IN (${versions.map(() => "?").join(",")})`;
      binds.push(...versions);
    } else if (version) {
      sql += " AND version = ?";
      binds.push(version);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
  } else {
    const subWhere = [mf];
    if (versions && versions.length > 0) {
      subWhere.push(`version IN (${versions.map(() => "?").join(",")})`);
      binds.push(...versions);
    } else if (version) {
      subWhere.push("version = ?");
      binds.push(version);
    }
    sql = `SELECT ${columns.join(", ")} FROM ${table} WHERE run_id IN (SELECT run_id FROM runs WHERE ${subWhere.join(" AND ")})`;
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

// ── GET /api/summary — quick run count for startup message ───────────

function handleSummary(res: ServerResponse): void {
  const row = db.prepare(
    "SELECT count(*) as total FROM runs WHERE mode NOT IN ('debug', 'creative') AND wave_reached > 1",
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

server.listen(PORT, () => {
  const row = db.prepare("SELECT count(*) as total FROM runs").get() as { total: number };
  console.log(`Local telemetry server on http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/stats`);
  console.log(`DB: ${dbPath()} (${row.total} runs)`);
});
