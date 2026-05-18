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

  const hasRuns = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'")
    .get();
  if (!hasRuns) {
    const migration = readFileSync(
      join(ROOT, "migrations/0001_create_tables.sql"),
      "utf-8",
    );
    db.exec(migration);
    console.log("Created telemetry tables");
  }

  return db;
}

export function dbPath(): string {
  return DB_PATH;
}
