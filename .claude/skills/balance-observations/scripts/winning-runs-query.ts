import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../../..");
const DB_PATH = join(ROOT, ".local", "telemetry.duckdb");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

async function main() {
  const conn = await (await DuckDBInstance.create(DB_PATH)).connect();
  const q = async (sql: string, params: DuckDBValue[] = []) => {
    const r = await conn.run(sql, params);
    return await r.getRowObjectsJson();
  };

  const BASE = `mode='sim' AND ai='HeuristicAI' AND version=? AND wave_reached > 1`;

  const cohorts = [
    { name: "All runs", filter: BASE },
    { name: "Beat wave 20", filter: `${BASE} AND wave_reached >= 20` },
    { name: "Beat wave 30", filter: `${BASE} AND wave_reached >= 30` },
    { name: "Beat wave 40", filter: `${BASE} AND wave_reached >= 40` },
    { name: "Beat wave 45", filter: `${BASE} AND wave_reached >= 45` },
    { name: "Victories (W50)", filter: `${BASE} AND wave_reached >= 50` },
  ];

  const out: any = { version: VERSION, cohorts: {} };

  for (const c of cohorts) {
    const runCount = (await q(`SELECT COUNT(*) AS n FROM runs WHERE ${c.filter}`, [VERSION]))[0].n;
    const n = Number(runCount);
    out.cohorts[c.name] = { runs: n, combos: [], gems: [] };
    if (n === 0) continue;

    const comboRows = await q(`
      WITH cohort_runs AS (SELECT run_id FROM runs WHERE ${c.filter}),
           tower_max_tier AS (
             SELECT t.run_id, t.combo_key, t.x, t.y, MAX(t.upgrade_tier) AS max_tier
             FROM towers t JOIN cohort_runs r USING(run_id)
             WHERE t.combo_key <> ''
             GROUP BY t.run_id, t.combo_key, t.x, t.y
           ),
           run_combo_max AS (
             SELECT DISTINCT run_id, combo_key, max_tier FROM tower_max_tier
           )
      SELECT combo_key, max_tier, COUNT(*) AS runs_with_it
      FROM run_combo_max
      GROUP BY combo_key, max_tier
      ORDER BY runs_with_it DESC
    `, [VERSION]);

    out.cohorts[c.name].combos = comboRows.map((r: any) => ({
      combo_key: r.combo_key,
      tier: Number(r.max_tier),
      runs_with_it: Number(r.runs_with_it),
      presence_rate: Number(Number(r.runs_with_it) / n),
    }));

    const gemRows = await q(`
      WITH cohort_runs AS (SELECT run_id FROM runs WHERE ${c.filter})
      SELECT t.gem, COUNT(DISTINCT t.run_id) AS runs_with_it
      FROM towers t JOIN cohort_runs r USING(run_id)
      WHERE t.combo_key = ''
      GROUP BY t.gem
      ORDER BY runs_with_it DESC
    `, [VERSION]);
    out.cohorts[c.name].gems = gemRows.map((r: any) => ({
      gem: r.gem,
      runs_with_it: Number(r.runs_with_it),
      presence_rate: Number(Number(r.runs_with_it) / n),
    }));
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
