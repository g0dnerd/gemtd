import type { Env } from "./types";

async function queryAE(
  env: Env,
  sql: string,
): Promise<{ data: Record<string, unknown>[] }> {
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
    throw new Error(`AE SQL API ${resp.status}: ${text}`);
  }
  return resp.json();
}

export async function handleStats(
  url: URL,
  env: Env,
): Promise<Response> {
  const version = url.searchParams.get("version") || null;
  const versionFilter = version
    ? `AND blob2 = '${version}'`
    : "";
  const versionFilterB1 = version
    ? `AND blob1 = '${version}'`
    : "";
  const versionFilterB3 = version
    ? `AND blob3 = '${version}'`
    : "";

  try {
    const [overview, survivalCurve, leaksPerWave, combos, gemDps, chanceTiming, keeperCurve] =
      await Promise.all([
        queryAE(
          env,
          `SELECT
            count() as total_runs,
            sum(if(blob1 = 'victory', 1, 0)) as wins,
            avg(double1) as avg_wave,
            avg(double10) as avg_duration_ticks,
            avg(double4) as avg_kills
          FROM gemtd_runs
          WHERE 1=1 ${versionFilter}`,
        ),
        queryAE(
          env,
          `SELECT
            double1 as wave,
            count() as runs
          FROM gemtd_waves
          WHERE 1=1 ${versionFilterB1}
          GROUP BY double1
          ORDER BY double1`,
        ),
        queryAE(
          env,
          `SELECT
            double1 as wave,
            avg(double5) as avg_leaks,
            sum(double5) as total_leaks,
            count() as runs
          FROM gemtd_waves
          WHERE 1=1 ${versionFilterB1}
          GROUP BY double1
          ORDER BY double1`,
        ),
        queryAE(
          env,
          `SELECT
            blob2 as combo_key,
            count() as count,
            avg(double4) as avg_damage
          FROM gemtd_towers
          WHERE blob2 != '' ${versionFilterB3}
          GROUP BY blob2
          ORDER BY count DESC`,
        ),
        queryAE(
          env,
          `SELECT
            blob1 as gem,
            count() as count,
            avg(double4) as avg_damage,
            avg(double1) as avg_quality
          FROM gemtd_towers
          WHERE 1=1 ${versionFilterB3}
          GROUP BY blob1
          ORDER BY avg_damage DESC`,
        ),
        queryAE(
          env,
          `SELECT
            double5 as tier,
            avg(double1) as avg_wave,
            avg(double2) as avg_gold,
            count() as count
          FROM gemtd_events
          WHERE blob1 = 'chance_upgrade' ${versionFilterB3}
          GROUP BY double5
          ORDER BY double5`,
        ),
        queryAE(
          env,
          `SELECT
            double1 as wave,
            avg(double12) as avg_keeper_quality
          FROM gemtd_waves
          WHERE double12 > 0 ${versionFilterB1}
          GROUP BY double1
          ORDER BY double1`,
        ),
      ]);

    return Response.json({
      overview: overview.data[0] ?? {},
      survivalCurve: survivalCurve.data,
      leaksPerWave: leaksPerWave.data,
      combos: combos.data,
      gemDps: gemDps.data,
      chanceTiming: chanceTiming.data,
      keeperCurve: keeperCurve.data,
    });
  } catch (err) {
    return Response.json(
      { error: String(err) },
      { status: 502 },
    );
  }
}
