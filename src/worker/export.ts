import type { Env } from "./types";

const DATASETS: Record<string, { dataset: string; columns: string[] }> = {
  runs: {
    dataset: "gemtd_runs",
    columns: [
      "index1 as run_id",
      "blob1 as outcome",
      "blob2 as version",
      "blob3 as mode",
      "double1 as wave_reached",
      "double2 as final_lives",
      "double3 as final_gold",
      "double4 as total_kills",
      "double5 as tower_count",
      "double6 as combo_count",
      "double7 as max_chance_tier",
      "double8 as rocks_removed",
      "double9 as downgrades_used",
      "double10 as duration_ticks",
      "double11 as total_leaks",
      "double12 as clean_waves",
    ],
  },
  waves: {
    dataset: "gemtd_waves",
    columns: [
      "index1 as run_id",
      "blob1 as version",
      "blob2 as mode",
      "double1 as wave",
      "double2 as lives",
      "double3 as gold",
      "double4 as kills",
      "double5 as leaks",
      "double6 as spawned",
      "double7 as duration_ticks",
      "double8 as chance_tier",
      "double9 as tower_count",
      "double10 as rock_count",
      "double11 as combo_count",
      "double12 as keeper_quality",
      "double13 as total_damage",
    ],
  },
  towers: {
    dataset: "gemtd_towers",
    columns: [
      "index1 as run_id",
      "blob1 as gem",
      "blob2 as combo_key",
      "blob3 as version",
      "blob4 as mode",
      "double1 as quality",
      "double2 as upgrade_tier",
      "double3 as kills",
      "double4 as total_damage",
      "double5 as placed_wave",
      "double6 as x",
      "double7 as y",
      "double8 as wave_reached",
    ],
  },
  events: {
    dataset: "gemtd_events",
    columns: [
      "index1 as run_id",
      "blob1 as event_type",
      "blob2 as gem",
      "blob3 as version",
      "blob4 as mode",
      "blob5 as detail",
      "double1 as wave",
      "double2 as gold",
      "double3 as quality",
      "double4 as cost",
      "double5 as chance_tier",
      "double6 as value1",
    ],
  },
};

export async function handleExport(
  url: URL,
  env: Env,
): Promise<Response> {
  const datasetKey = url.searchParams.get("dataset") || "runs";
  const format = url.searchParams.get("format") || "json";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "1000"),
    10000,
  );
  const version = url.searchParams.get("version") || null;

  const def = DATASETS[datasetKey];
  if (!def) {
    return new Response(
      `Invalid dataset. Valid: ${Object.keys(DATASETS).join(", ")}`,
      { status: 400 },
    );
  }

  const versionCol =
    datasetKey === "runs" || datasetKey === "waves" ? "blob2" :
    datasetKey === "towers" ? "blob3" : "blob3";
  const versionFilter = version
    ? `WHERE ${versionCol} = '${version}'`
    : "";

  const sql = `SELECT ${def.columns.join(", ")} FROM ${def.dataset} ${versionFilter} ORDER BY timestamp DESC LIMIT ${limit}`;

  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          "Content-Type": "text/plain",
        },
        body: sql,
      },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(`AE query failed: ${text}`, { status: 502 });
    }

    const result: { data: Record<string, unknown>[] } = await resp.json();
    const rows = result.data;

    if (format === "csv") {
      if (rows.length === 0) {
        return new Response("", {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${datasetKey}.csv"`,
          },
        });
      }
      const keys = Object.keys(rows[0]);
      const header = keys.join(",");
      const lines = rows.map((row) =>
        keys.map((k) => {
          const v = row[k];
          if (typeof v === "string" && (v.includes(",") || v.includes('"'))) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return String(v ?? "");
        }).join(","),
      );
      return new Response([header, ...lines].join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${datasetKey}.csv"`,
        },
      });
    }

    return Response.json(rows, {
      headers: {
        "Content-Disposition": `attachment; filename="${datasetKey}.json"`,
      },
    });
  } catch (err) {
    return new Response(`Export failed: ${err}`, { status: 502 });
  }
}
