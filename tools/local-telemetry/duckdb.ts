import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DB_DIR = join(ROOT, ".local");
const DB_PATH = join(DB_DIR, "telemetry.duckdb");
const SQLITE_PATH = join(DB_DIR, "telemetry.db");
const SCHEMA_PATH = join(__dirname, "schema.duckdb.sql");

export async function openDb(): Promise<DuckDBConnection> {
  mkdirSync(DB_DIR, { recursive: true });
  const instance = await DuckDBInstance.create(DB_PATH);
  const conn = await instance.connect();

  const reader = await conn.runAndReadAll(
    `SELECT count(*) AS n FROM information_schema.tables
     WHERE table_schema = 'main' AND table_name = 'runs'`,
  );
  const exists = Number((reader.getRowObjectsJS()[0] as { n: number | bigint }).n) > 0;
  if (!exists) {
    const schema = readFileSync(SCHEMA_PATH, "utf-8");
    await conn.run(schema);
    console.log(`Applied DuckDB schema (${SCHEMA_PATH})`);
  }

  return conn;
}

export function dbPath(): string {
  return DB_PATH;
}

export function sqlitePath(): string {
  return SQLITE_PATH;
}

export function hasStaleSqlite(): boolean {
  return !existsSync(DB_PATH) && existsSync(SQLITE_PATH);
}
