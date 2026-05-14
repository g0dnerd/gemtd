import type { Env } from "./types";

export async function handleStats(
  url: URL,
  env: Env,
): Promise<Response> {
  const version = url.searchParams.get("version") || null;
  const versions = url.searchParams.get("versions")?.split(",").filter(Boolean) || null;
  const db = env.gemtd_telemetry;

  let rv = "";
  let rBind: string[] = [];
  if (versions && versions.length > 0) {
    const ph = versions.map(() => "?").join(",");
    rv = `AND version IN (${ph})`;
    rBind = versions;
  } else if (version) {
    rv = "AND version = ?";
    rBind = [version];
  }

  let cv = "";
  let cBind: string[] = [];
  if (versions && versions.length > 0) {
    const ph = versions.map(() => "?").join(",");
    cv = `AND run_id IN (SELECT run_id FROM runs WHERE version IN (${ph}))`;
    cBind = versions;
  } else if (version) {
    cv = "AND run_id IN (SELECT run_id FROM runs WHERE version = ?)";
    cBind = [version];
  }

  const [
    overviewRows,
    winRows,
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
    versionRows,
  ] = await Promise.all([
    db.prepare(
      `SELECT count(*) as total_runs, avg(wave_reached) as avg_wave,
              avg(duration_ticks) as avg_duration_ticks, avg(total_kills) as avg_kills
       FROM runs WHERE 1=1 ${rv}`,
    ).bind(...rBind).all(),

    db.prepare(
      `SELECT count(*) as wins FROM runs WHERE outcome = 'victory' ${rv}`,
    ).bind(...rBind).all(),

    db.prepare(
      `SELECT wave, count(*) as runs FROM waves
       WHERE 1=1 ${cv} GROUP BY wave ORDER BY wave`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT wave, avg(leaks) as avg_leaks, sum(leaks) as total_leaks,
              avg(lives) as avg_lives, avg(gold) as avg_gold, count(*) as runs
       FROM waves WHERE 1=1 ${cv} GROUP BY wave ORDER BY wave`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT t.combo_key, count(*) as count,
              avg(t.total_damage) as avg_damage,
              avg(t.total_damage * 1.0 / (r.wave_reached - t.placed_wave + 1)) as avg_dmg_per_wave,
              avg(t.placed_wave) as avg_wave_built,
              avg(t.upgrade_tier) as avg_tier, max(t.upgrade_tier) as max_tier
       FROM towers t JOIN runs r ON t.run_id = r.run_id
       WHERE t.combo_key != '' ${cv.replace("run_id", "t.run_id")}
       GROUP BY t.combo_key ORDER BY avg_dmg_per_wave DESC`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT t.gem, count(*) as count,
              avg(t.total_damage) as avg_damage,
              avg(t.total_damage * 1.0 / (r.wave_reached - t.placed_wave + 1)) as avg_dmg_per_wave,
              avg(t.quality) as avg_quality
       FROM towers t JOIN runs r ON t.run_id = r.run_id
       WHERE 1=1 ${cv.replace("run_id", "t.run_id")}
       GROUP BY t.gem ORDER BY avg_dmg_per_wave DESC`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT chance_tier as tier, avg(wave) as avg_wave,
              avg(gold) as avg_gold, count(*) as count
       FROM events WHERE event_type = 'chance_upgrade' ${cv}
       GROUP BY chance_tier ORDER BY chance_tier`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT wave, avg(keeper_quality) as avg_keeper_quality
       FROM waves WHERE keeper_quality > 0 ${cv}
       GROUP BY wave ORDER BY wave`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT gem, count(*) as count,
              avg(quality) as avg_quality, avg(wave) as avg_wave
       FROM events WHERE event_type = 'keeper' ${cv}
       GROUP BY gem ORDER BY count DESC`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT wave, avg(total_damage) as avg_damage
       FROM waves WHERE 1=1 ${cv}
       GROUP BY wave ORDER BY wave`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT detail as creep_kind, count(*) as leak_count,
              sum(cost) as total_lives_lost, avg(cost) as avg_lives_per_leak
       FROM events WHERE event_type = 'leak' ${cv}
       GROUP BY detail ORDER BY total_lives_lost DESC`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT wave_reached as wave, count(*) as deaths
       FROM runs WHERE outcome = 'gameover' ${rv}
       GROUP BY wave_reached ORDER BY wave_reached`,
    ).bind(...rBind).all(),

    db.prepare(
      `SELECT DISTINCT version FROM runs ORDER BY version DESC`,
    ).all(),
  ]);

  const overview = overviewRows.results?.[0] ?? {};
  const wins = winRows.results?.[0]?.wins ?? 0;

  return Response.json({
    overview: { ...overview, wins },
    versions: (versionRows.results ?? []).map((r: Record<string, unknown>) => r.version),
    survivalCurve: survivalCurve.results,
    leaksPerWave: leaksPerWave.results,
    combos: combos.results,
    gemDps: gemDps.results,
    chanceTiming: chanceTiming.results,
    keeperCurve: keeperCurve.results,
    keeperChoices: keeperChoices.results,
    waveDamage: waveDamage.results,
    leaksByKind: leaksByKind.results,
    deathsByWave: deathsByWave.results,
  });
}
