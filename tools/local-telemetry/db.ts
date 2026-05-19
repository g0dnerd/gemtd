import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DB_DIR = join(ROOT, ".local");
const DB_PATH = join(DB_DIR, "telemetry.db");

export function openDb(): Database.Database {
  mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const migrations = [
    "0001_create_tables.sql",
    "0002_wave_pressure.sql",
    "0003_balance_telemetry.sql",
  ];

  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)",
  );

  const hasRuns = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'")
    .get();
  if (hasRuns) {
    db.prepare(
      "INSERT OR IGNORE INTO _migrations (name) VALUES (?)",
    ).run("0001_create_tables.sql");
  }

  for (const name of migrations) {
    const applied = db
      .prepare("SELECT 1 FROM _migrations WHERE name = ?")
      .get(name);
    if (applied) continue;
    const sql = readFileSync(join(ROOT, "migrations", name), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(name);
    console.log(`Applied migration ${name}`);
  }

  return db;
}

export function dbPath(): string {
  return DB_PATH;
}
