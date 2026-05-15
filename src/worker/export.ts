import type { Env } from "./types";

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

export async function handleExport(
  url: URL,
  env: Env,
): Promise<Response> {
  const table = url.searchParams.get("dataset") || "runs";
  const format = url.searchParams.get("format") || "json";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "1000"),
    10000,
  );
  const version = url.searchParams.get("version") || null;
  const versions = url.searchParams.get("versions")?.split(",").filter(Boolean) || null;

  const columns = TABLES[table];
  if (!columns) {
    return new Response(
      `Invalid dataset. Valid: ${Object.keys(TABLES).join(", ")}`,
      { status: 400 },
    );
  }

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
      const ph = versions.map(() => "?").join(",");
      subWhere.push(`version IN (${ph})`);
      binds.push(...versions);
    } else if (version) {
      subWhere.push("version = ?");
      binds.push(version);
    }
    sql = `SELECT ${columns.join(", ")} FROM ${table} WHERE run_id IN (SELECT run_id FROM runs WHERE ${subWhere.join(" AND ")})`;
    sql += " LIMIT ?";
  }
  binds.push(limit);

  try {
    const result = await env.gemtd_telemetry.prepare(sql).bind(...binds).all();
    const rows = result.results;

    if (format === "csv") {
      if (rows.length === 0) {
        return new Response("", {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${table}.csv"`,
          },
        });
      }
      const keys = Object.keys(rows[0]);
      const header = keys.join(",");
      const lines = rows.map((row) =>
        keys.map((k) => {
          const v = (row as Record<string, unknown>)[k];
          if (typeof v === "string" && (v.includes(",") || v.includes('"'))) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return String(v ?? "");
        }).join(","),
      );
      return new Response([header, ...lines].join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${table}.csv"`,
        },
      });
    }

    return Response.json(rows, {
      headers: {
        "Content-Disposition": `attachment; filename="${table}.json"`,
      },
    });
  } catch (err) {
    return new Response(`Export failed: ${err}`, { status: 502 });
  }
}
