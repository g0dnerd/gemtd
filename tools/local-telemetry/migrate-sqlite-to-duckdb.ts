/**
 * migrate-sqlite-to-duckdb.ts — one-shot import of the legacy
 * `.local/telemetry.db` (better-sqlite3) into `.local/telemetry.duckdb`.
 *
 * Uses DuckDB's bundled `sqlite` extension to ATTACH the SQLite file and
 * INSERT each table verbatim. Verifies row counts per table after the copy
 * and aborts if any mismatch is detected. Leaves the SQLite file untouched
 * so it remains a backup.
 *
 * Run from repo root:
 *   npm run telemetry:migrate-local
 */
import { existsSync } from "node:fs";
import { openDb, dbPath, sqlitePath } from "./duckdb.js";

const TABLES = [
  { name: "runs", cols: [
    "run_id", "version", "mode", "outcome", "wave_reached", "final_lives",
    "final_gold", "total_kills", "tower_count", "combo_count",
    "max_chance_tier", "rocks_removed", "downgrades_used", "duration_ticks",
    "total_leaks", "clean_waves", "ai", "seed", "created_at",
  ] },
  { name: "waves", cols: [
    "run_id", "wave", "lives", "gold", "kills", "leaks", "spawned",
    "duration_ticks", "chance_tier", "tower_count", "rock_count",
    "combo_count", "keeper_quality", "total_damage", "avg_path_progress",
    "max_path_progress", "avg_ticks_to_kill", "avg_tower_quality",
    "gem_type_count", "max_upgrade_tier",
  ] },
  { name: "towers", cols: [
    "run_id", "gem", "quality", "combo_key", "upgrade_tier", "kills",
    "total_damage", "placed_wave", "x", "y",
  ] },
  { name: "events", cols: [
    "run_id", "event_type", "wave", "gold", "gem", "quality", "cost",
    "chance_tier", "detail", "value1",
  ] },
  { name: "wave_creep_stats", cols: [
    "run_id", "wave", "creep_kind", "spawned", "kills", "leaks",
    "avg_path_progress", "max_path_progress", "avg_ticks_to_kill",
    "total_hp_spawned",
  ] },
  { name: "wave_gem_damage", cols: [
    "run_id", "wave", "gem", "is_combo", "combo_key", "upgrade_tier",
    "damage", "kills",
  ] },
  { name: "wave_gem_assist", cols: [
    "run_id", "wave", "gem", "combo_key", "upgrade_tier", "dmg_aura_assist",
    "vuln_assist", "armor_shred_assist", "atkspeed_assist", "bonus_gold",
  ] },
];

async function countRows(conn: Awaited<ReturnType<typeof openDb>>, sql: string): Promise<number> {
  const reader = await conn.runAndReadAll(sql);
  const row = reader.getRowObjectsJS()[0] as { n: number | bigint };
  return Number(row.n);
}

async function main(): Promise<void> {
  if (!existsSync(sqlitePath())) {
    console.error(`No SQLite file found at ${sqlitePath()}. Nothing to migrate.`);
    process.exit(1);
  }
  const conn = await openDb();

  const existing = await countRows(conn, `SELECT count(*) AS n FROM runs`);
  if (existing > 0) {
    console.error(
      `Refusing to migrate: ${dbPath()} already has ${existing} runs.\n` +
      `Delete it first if you want to re-import, or your DuckDB DB is already populated.`,
    );
    conn.disconnectSync();
    process.exit(1);
  }

  console.log(`Importing ${sqlitePath()} → ${dbPath()}`);

  await conn.run(`INSTALL sqlite`);
  await conn.run(`LOAD sqlite`);
  await conn.run(`ATTACH '${sqlitePath()}' AS src (TYPE SQLITE, READ_ONLY)`);

  const expected: Record<string, number> = {};
  for (const t of TABLES) {
    expected[t.name] = await countRows(conn, `SELECT count(*) AS n FROM src.${t.name}`);
  }

  for (const t of TABLES) {
    const cols = t.cols.join(", ");
    process.stdout.write(`  ${t.name} (${expected[t.name]} rows)... `);
    await conn.run(`INSERT INTO main.${t.name} (${cols}) SELECT ${cols} FROM src.${t.name}`);
    const got = await countRows(conn, `SELECT count(*) AS n FROM main.${t.name}`);
    if (got !== expected[t.name]) {
      console.error(`MISMATCH: expected ${expected[t.name]}, got ${got}`);
      conn.disconnectSync();
      process.exit(2);
    }
    console.log(`ok (${got})`);
  }

  await conn.run(`DETACH src`);
  conn.disconnectSync();

  console.log(`\nMigration complete.`);
  console.log(`Original SQLite file left in place at ${sqlitePath()} as a backup.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(3);
});
