import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { type DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";
import { openDb, dbPath, hasStaleSqlite, sqlitePath } from "./duckdb.js";
import { handleDashboard } from "../../src/worker/dashboard.js";

const PORT = parseInt(process.env.TELEMETRY_PORT || "3456");

const stale = hasStaleSqlite();
const db: DuckDBConnection = await openDb();
if (stale) {
  console.log(
    `Note: ${sqlitePath()} exists but no DuckDB DB was found. ` +
    `Run \`npm run telemetry:migrate-local\` to import your existing runs.`,
  );
}

// ── query helpers ────────────────────────────────────────────────────

// Coerce any bigints in a row (count(*) and sum() of INTEGER cols come back as
// BIGINT via the JS converter) to plain numbers. All counts/sums in this DB stay
// safely within Number.MAX_SAFE_INTEGER, so the lossy coercion is fine here.
function jsToNumbers<T>(rows: Record<string, unknown>[]): T[] {
  for (const row of rows) {
    for (const k in row) if (typeof row[k] === "bigint") row[k] = Number(row[k]);
  }
  return rows as unknown as T[];
}

async function all<T = Record<string, unknown>>(
  sql: string,
  params: DuckDBValue[] = [],
): Promise<T[]> {
  const reader = await db.runAndReadAll(sql, params);
  return jsToNumbers<T>(reader.getRowObjectsJS() as Record<string, unknown>[]);
}

async function one<T = Record<string, unknown>>(
  sql: string,
  params: DuckDBValue[] = [],
): Promise<T | undefined> {
  const rows = await all<T>(sql, params);
  return rows[0];
}

async function exec(sql: string, params: DuckDBValue[] = []): Promise<void> {
  await db.run(sql, params);
}

function validRun(runset: string | null): string {
  return runset === "sim"
    ? "mode = 'sim' AND wave_reached > 1"
    : "mode NOT IN ('debug', 'creative', 'sim', 'hardcore') AND wave_reached > 1";
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

// ── http helpers ─────────────────────────────────────────────────────

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

const INSERT_RUN_SQL =
  `INSERT INTO runs (run_id, version, mode, outcome,
     wave_reached, final_lives, final_gold, total_kills,
     tower_count, combo_count, max_chance_tier, rocks_removed,
     downgrades_used, duration_ticks, total_leaks, clean_waves,
     ai, seed)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT DO NOTHING`;

const INSERT_WAVE_SQL =
  `INSERT INTO waves (run_id, wave, lives, gold, kills, leaks,
     spawned, duration_ticks, chance_tier, tower_count, rock_count,
     combo_count, keeper_quality, total_damage,
     avg_path_progress, max_path_progress, avg_ticks_to_kill,
     avg_tower_quality, gem_type_count, max_upgrade_tier)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_TOWER_SQL =
  `INSERT INTO towers (run_id, gem, quality, combo_key, upgrade_tier,
     kills, total_damage, placed_wave, x, y)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_EVENT_SQL =
  `INSERT INTO events (run_id, event_type, wave, gold, gem, quality,
     cost, chance_tier, detail, value1)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_WCS_SQL =
  `INSERT INTO wave_creep_stats (run_id, wave, creep_kind, spawned, kills, leaks,
     avg_path_progress, max_path_progress, avg_ticks_to_kill, total_hp_spawned)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_WGD_SQL =
  `INSERT INTO wave_gem_damage (run_id, wave, gem, is_combo, combo_key, upgrade_tier, damage, kills)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_WGA_SQL =
  `INSERT INTO wave_gem_assist (run_id, wave, gem, combo_key, upgrade_tier,
     dmg_aura_assist, vuln_assist, armor_shred_assist, atkspeed_assist,
     demote_air_assist, bonus_gold)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// Serialise ingest so concurrent posts can't interleave their transactions
// (DuckDB has a single writer per connection; chaining the promises keeps the
// inserts ordered and BEGIN/COMMIT pairs balanced).
let ingestQueue: Promise<void> = Promise.resolve();

async function ingest(
  runId: string, version: string, mode: string, outcome: string,
  ai: string, seed: number,
  run: any, waves: any[], towers: any[], events: any[],
  waveCreepStats: any[], waveGemDamage: any[], waveGemAssign: any[],
): Promise<void> {
  await exec(`BEGIN TRANSACTION`);
  try {
    await exec(INSERT_RUN_SQL, [
      runId, version, mode, outcome,
      run.waveReached, run.finalLives, run.finalGold, run.totalKills,
      run.towerCount, run.comboCount, run.maxChanceTier, run.rocksRemoved,
      run.downgradesUsed, run.durationTicks, run.totalLeaks, run.cleanWaves,
      ai, seed,
    ]);
    for (const w of waves) {
      await exec(INSERT_WAVE_SQL, [
        runId, w.wave, w.lives, w.gold, w.kills, w.leaks,
        w.spawned, w.durationTicks, w.chanceTier, w.towerCount, w.rockCount,
        w.comboCount, w.keeperQuality, w.totalDamage,
        w.avgPathProgress ?? 0, w.maxPathProgress ?? 0, w.avgTicksToKill ?? 0,
        w.avgTowerQuality ?? 0, w.gemTypeCount ?? 0, w.maxUpgradeTier ?? 0,
      ]);
    }
    for (const t of towers) {
      await exec(INSERT_TOWER_SQL, [
        runId, t.gem, t.quality, t.comboKey, t.upgradeTier,
        t.kills, t.totalDamage, t.placedWave, t.x, t.y,
      ]);
    }
    for (const e of events) {
      await exec(INSERT_EVENT_SQL, [
        runId, e.type, e.wave, e.gold, e.gem, e.quality,
        e.cost, e.chanceTier, e.detail, e.value1,
      ]);
    }
    for (const wcs of waveCreepStats) {
      const kills = Number(wcs.kills) || 0;
      const leaks = Number(wcs.leaks) || 0;
      const total = kills + leaks;
      const avgProgress = total > 0 ? (Number(wcs.pathProgressSum) || 0) / total : 0;
      const avgTicks = kills > 0 ? (Number(wcs.ticksToKillSum) || 0) / kills : 0;
      await exec(INSERT_WCS_SQL, [
        runId, wcs.wave, wcs.creepKind, wcs.spawned, kills, leaks,
        avgProgress, wcs.maxPathProgress, avgTicks, wcs.totalHpSpawned,
      ]);
    }
    for (const wgd of waveGemDamage) {
      await exec(INSERT_WGD_SQL, [
        runId, wgd.wave, wgd.gem, wgd.isCombo ? 1 : 0, wgd.comboKey ?? "", wgd.upgradeTier ?? 0, wgd.damage, wgd.kills,
      ]);
    }
    for (const wga of waveGemAssign) {
      await exec(INSERT_WGA_SQL, [
        runId, wga.wave, wga.gem, wga.comboKey ?? "", wga.upgradeTier ?? 0,
        wga.dmgAuraAssist ?? 0, wga.vulnAssist ?? 0, wga.armorShredAssist ?? 0,
        wga.atkspeedAssist ?? 0, wga.demoteAirAssist ?? 0, wga.bonusGold ?? 0,
      ]);
    }
    await exec(`COMMIT`);
  } catch (err) {
    await exec(`ROLLBACK`).catch(() => {});
    throw err;
  }
}

function handleIngest(req: IncomingMessage, res: ServerResponse): void {
  readBody(req).then((raw) => {
    let body: any;
    try { body = JSON.parse(raw); } catch { text(res, "Invalid JSON", 400); return; }

    if (!body.runId || !body.version || !body.mode || !body.outcome || !body.run) {
      text(res, "Invalid payload shape", 400); return;
    }

    const { runId, version, mode, outcome, run } = body;

    const task = ingestQueue.then(() =>
      ingest(
        runId, version, mode, outcome, body.ai ?? "", body.seed ?? 0,
        run, body.waves ?? [], body.towers ?? [], body.events ?? [],
        body.waveCreepStats ?? [], body.waveGemDamage ?? [], body.waveGemAssign ?? [],
      ),
    );
    // Swallow rejections on the shared queue so one failed ingest doesn't poison the next.
    ingestQueue = task.catch(() => {});
    task.then(
      () => {
        statsCacheGen++;
        statsCache.clear();
        console.log(`Ingested run ${runId} (${mode}${body.ai ? `/${body.ai}` : ""}, wave ${run.waveReached}, ${outcome})`);
        cors(res);
        res.writeHead(204);
        res.end();
      },
      (err) => {
        console.error("Insert failed:", err);
        text(res, "Insert failed", 500);
      },
    );
  }).catch((err) => {
    text(res, err.message, err.message.includes("large") ? 413 : 500);
  });
}

// ── GET /api/stats ───────────────────────────────────────────────────

// LRU stats cache keyed by the raw `?...` query string. Invalidated whenever a
// successful ingest commits (statsCacheGen++ and clear) — precise, no TTL.
const STATS_CACHE_MAX = 32;
let statsCacheGen = 0;
const statsCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const v = statsCache.get(key);
  if (v === undefined) return undefined;
  statsCache.delete(key);
  statsCache.set(key, v);
  return v;
}

function cacheSet(key: string, value: string): void {
  if (statsCache.has(key)) statsCache.delete(key);
  statsCache.set(key, value);
  while (statsCache.size > STATS_CACHE_MAX) {
    const oldest = statsCache.keys().next().value;
    if (oldest === undefined) break;
    statsCache.delete(oldest);
  }
}

async function handleStats(url: URL, res: ServerResponse): Promise<void> {
  const cacheKey = `${url.search}|gen=${statsCacheGen}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) {
    cors(res);
    res.writeHead(200, { "Content-Type": "application/json", "X-Cache": "hit" });
    res.end(hit);
    return;
  }

  const vf = versionFilter(
    url.searchParams.get("version") || null,
    url.searchParams.get("versions")?.split(",").filter(Boolean) || null,
  );
  const VALID = validRun(url.searchParams.get("runset"));
  const runsWhere = `AND ${VALID} ${vf.clause}`;
  const childWhere = (col = "run_id") =>
    `AND ${col} IN (SELECT run_id FROM runs WHERE ${VALID} ${vf.clause})`;

  const overview = await one(
    `SELECT count(*) as total_runs, avg(wave_reached) as avg_wave,
            avg(duration_ticks) as avg_duration_ticks, avg(total_kills) as avg_kills
     FROM runs WHERE 1=1 ${runsWhere}`,
    vf.binds,
  ) as any ?? {};

  const winRow = await one(
    `SELECT count(*) as wins FROM runs WHERE outcome = 'victory' ${runsWhere}`,
    vf.binds,
  ) as any ?? {};

  const survivalCurve = await all(
    `SELECT wave, count(*) as runs FROM waves
     WHERE 1=1 ${childWhere()} GROUP BY wave ORDER BY wave`,
    vf.binds,
  );

  const leaksPerWave = await all(
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
    [...vf.binds, ...vf.binds],
  );

  // DuckDB raises on integer division by zero where SQLite returns NULL — guard
  // the (wave_reached - placed_wave + 1) denominator so a same-wave keeper
  // doesn't blow up the aggregation.
  const combos = await all(
    `SELECT t.combo_key, t.upgrade_tier as tier, count(*) as count,
            avg(t.total_damage) as avg_damage,
            avg(t.total_damage * 1.0 / NULLIF(r.wave_reached - t.placed_wave + 1, 0)) as avg_dmg_per_wave,
            avg(t.placed_wave) as avg_wave_built,
            avg(r.wave_reached) as avg_wave_reached
     FROM towers t JOIN runs r ON t.run_id = r.run_id
     WHERE t.combo_key != '' ${childWhere("t.run_id")}
     GROUP BY t.combo_key, t.upgrade_tier ORDER BY t.combo_key, t.upgrade_tier`,
    vf.binds,
  );

  const gemDps = await all(
    `SELECT t.gem, t.quality, count(*) as count,
            avg(t.total_damage) as avg_damage,
            avg(t.total_damage * 1.0 / NULLIF(r.wave_reached - t.placed_wave + 1, 0)) as avg_dmg_per_wave,
            avg(CASE WHEN rt.run_total > 0 THEN t.total_damage * 1.0 / rt.run_total ELSE 0 END) as avg_damage_share
     FROM towers t JOIN runs r ON t.run_id = r.run_id
     JOIN (SELECT run_id, sum(total_damage) as run_total FROM towers GROUP BY run_id) rt
       ON t.run_id = rt.run_id
     WHERE t.combo_key = '' ${childWhere("t.run_id")}
     GROUP BY t.gem, t.quality ORDER BY avg_dmg_per_wave DESC`,
    vf.binds,
  );

  const chanceTiming = await all(
    `SELECT chance_tier as tier, avg(wave) as avg_wave,
            avg(gold) as avg_gold, count(*) as count
     FROM events WHERE event_type = 'chance_upgrade' ${childWhere()}
     GROUP BY chance_tier ORDER BY chance_tier`,
    vf.binds,
  );

  const keeperCurve = await all(
    `SELECT wave, avg(keeper_quality) as avg_keeper_quality
     FROM waves WHERE keeper_quality > 0 ${childWhere()}
     GROUP BY wave ORDER BY wave`,
    vf.binds,
  );

  const keeperChoices = await all(
    `SELECT gem, count(*) as count,
            avg(quality) as avg_quality, avg(wave) as avg_wave
     FROM events WHERE event_type = 'keeper' ${childWhere()}
     GROUP BY gem ORDER BY count DESC`,
    vf.binds,
  );

  const waveDamage = await all(
    `SELECT wave, avg(total_damage) as avg_damage
     FROM waves WHERE 1=1 ${childWhere()}
     GROUP BY wave ORDER BY wave`,
    vf.binds,
  );

  const leaksByKind = await all(
    `SELECT detail as creep_kind, count(*) as leak_count,
            sum(cost) as total_lives_lost, avg(cost) as avg_lives_per_leak
     FROM events WHERE event_type = 'leak' ${childWhere()}
     GROUP BY detail ORDER BY total_lives_lost DESC`,
    vf.binds,
  );

  const deathsByWave = await all(
    `SELECT wave_reached as wave, count(*) as deaths
     FROM runs WHERE outcome = 'gameover' ${runsWhere}
     GROUP BY wave_reached ORDER BY wave_reached`,
    vf.binds,
  );

  const versionRows = await all<{ version: string }>(
    `SELECT DISTINCT version FROM runs WHERE ${VALID} ORDER BY version DESC`,
  );

  const wavePressure = await all(
    `SELECT wave, avg(avg_path_progress) as avg_path_progress,
            avg(max_path_progress) as avg_max_path_progress,
            avg(avg_ticks_to_kill) as avg_ticks_to_kill,
            avg(avg_tower_quality) as avg_quality,
            avg(gem_type_count) as avg_gem_types,
            avg(max_upgrade_tier) as avg_max_tier,
            count(*) as runs
     FROM waves WHERE 1=1 ${childWhere()}
     GROUP BY wave ORDER BY wave`,
    vf.binds,
  );

  const creepKindProgress = await all(
    `SELECT wave, creep_kind, avg(avg_path_progress) as avg_progress,
            avg(max_path_progress) as avg_max_progress,
            avg(avg_ticks_to_kill) as avg_ticks,
            sum(leaks) as total_leaks, sum(spawned) as total_spawned,
            sum(kills) as total_kills, count(*) as runs
     FROM wave_creep_stats WHERE 1=1 ${childWhere()}
     GROUP BY wave, creep_kind ORDER BY wave, creep_kind`,
    vf.binds,
  );

  const creepKindSummary = await all(
    `SELECT creep_kind, sum(spawned) as total_spawned,
            sum(kills) as total_kills, sum(leaks) as total_leaks,
            avg(avg_path_progress) as avg_progress,
            avg(avg_ticks_to_kill) as avg_ticks,
            sum(total_hp_spawned) as total_hp
     FROM wave_creep_stats WHERE 1=1 ${childWhere()}
     GROUP BY creep_kind ORDER BY total_leaks DESC`,
    vf.binds,
  );

  const gemDamageByWave = await all(
    `SELECT wave, gem, is_combo, sum(damage) as total_damage,
            sum(kills) as total_kills, count(DISTINCT run_id) as runs
     FROM wave_gem_damage WHERE 1=1 ${childWhere()}
     GROUP BY wave, gem, is_combo ORDER BY wave, gem`,
    vf.binds,
  );

  const gemDamageSummary = await all(
    `SELECT gem, is_combo, sum(damage) as total_damage,
            sum(kills) as total_kills,
            sum(damage) * 1.0 / count(DISTINCT run_id) as avg_damage_per_run_wave
     FROM wave_gem_damage WHERE 1=1 ${childWhere()}
     GROUP BY gem, is_combo ORDER BY total_damage DESC`,
    vf.binds,
  );

  const waveHpPool = await all(
    `SELECT wave, sum(total_hp_spawned) * 1.0 / count(DISTINCT run_id) as avg_hp_pool
     FROM wave_creep_stats WHERE 1=1 ${childWhere()}
     GROUP BY wave ORDER BY wave`,
    vf.binds,
  );

  const comboDamageByWave = await all(
    `SELECT wave, combo_key, upgrade_tier, sum(damage) as total_damage,
            sum(kills) as total_kills, count(DISTINCT run_id) as runs
     FROM wave_gem_damage WHERE combo_key != '' ${childWhere()}
     GROUP BY wave, combo_key, upgrade_tier ORDER BY wave, combo_key, upgrade_tier`,
    vf.binds,
  );

  const payload = JSON.stringify({
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
  cacheSet(cacheKey, payload);
  cors(res);
  res.writeHead(200, { "Content-Type": "application/json", "X-Cache": "miss" });
  res.end(payload);
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
  wave_gem_assist: [
    "run_id", "wave", "gem", "combo_key", "upgrade_tier",
    "dmg_aura_assist", "vuln_assist", "armor_shred_assist", "atkspeed_assist", "bonus_gold",
  ],
};

async function handleExport(url: URL, res: ServerResponse): Promise<void> {
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
  const binds: DuckDBValue[] = [];

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

  const rows = await all(sql, binds);

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
        const v = (row as Record<string, unknown>)[k];
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

async function handleSummary(res: ServerResponse): Promise<void> {
  const row = await one<{ total: number }>(
    `SELECT count(*) as total FROM runs WHERE ${validRun(null)}`,
  );
  json(res, { total: row?.total ?? 0 });
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
    handleStats(url, res).catch((err) => { console.error("stats failed:", err); text(res, "stats failed", 500); });
  } else if (req.method === "GET" && path === "/api/export") {
    handleExport(url, res).catch((err) => { console.error("export failed:", err); text(res, "export failed", 500); });
  } else if (req.method === "GET" && path === "/api/summary") {
    handleSummary(res).catch((err) => { console.error("summary failed:", err); text(res, "summary failed", 500); });
  } else if (req.method === "GET" && (path === "/stats" || path === "/")) {
    serveDashboard(res).catch((err) => { console.error("dashboard failed:", err); text(res, "dashboard failed", 500); });
  } else {
    text(res, "Not found", 404);
  }
});

// Sim workers reuse one keep-alive socket across games, but a HeuristicAI game
// can take 30s+ — far longer than the 5s default. Keep idle sockets open so the
// server doesn't close one out from under a worker's next POST (ECONNRESET).
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

const startupRow = await one<{ total: number }>(`SELECT count(*) as total FROM runs`);
server.listen(PORT, () => {
  console.log(`Local telemetry server on http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/stats`);
  console.log(`DB: ${dbPath()} (${startupRow?.total ?? 0} runs)`);
});
