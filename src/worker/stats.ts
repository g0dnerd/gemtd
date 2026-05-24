import type { Env } from "./types";

export async function handleStats(
  url: URL,
  env: Env,
): Promise<Response> {
  const version = url.searchParams.get("version") || null;
  const versions = url.searchParams.get("versions")?.split(",").filter(Boolean) || null;
  const db = env.gemtd_telemetry;

  const mf = "AND mode NOT IN ('debug', 'creative') AND wave_reached > 1";

  let rv = mf;
  let rBind: string[] = [];
  if (versions && versions.length > 0) {
    const ph = versions.map(() => "?").join(",");
    rv = `${mf} AND version IN (${ph})`;
    rBind = versions;
  } else if (version) {
    rv = `${mf} AND version = ?`;
    rBind = [version];
  }

  let cv = `AND run_id IN (SELECT run_id FROM runs WHERE 1=1 ${mf})`;
  let cBind: string[] = [];
  if (versions && versions.length > 0) {
    const ph = versions.map(() => "?").join(",");
    cv = `AND run_id IN (SELECT run_id FROM runs WHERE 1=1 ${mf} AND version IN (${ph}))`;
    cBind = versions;
  } else if (version) {
    cv = `AND run_id IN (SELECT run_id FROM runs WHERE 1=1 ${mf} AND version = ?)`;
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
    wavePressure,
    creepKindProgress,
    creepKindSummary,
    gemDamageByWave,
    gemDamageSummary,
    waveHpPool,
    comboDamageByWave,
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
      `SELECT w.wave, avg(w.leaks) as avg_leaks, sum(w.leaks) as total_leaks,
              avg(w.lives) as avg_lives, avg(w.gold) as avg_gold,
              avg(COALESCE(e.lives_lost, 0)) as avg_lives_lost, count(*) as runs
       FROM waves w
       LEFT JOIN (
         SELECT run_id, wave, sum(cost) as lives_lost
         FROM events WHERE event_type = 'leak' ${cv}
         GROUP BY run_id, wave
       ) e ON w.run_id = e.run_id AND w.wave = e.wave
       WHERE 1=1 ${cv.replace("run_id", "w.run_id")}
       GROUP BY w.wave ORDER BY w.wave`,
    ).bind(...cBind, ...cBind).all(),

    db.prepare(
      `SELECT t.combo_key, t.upgrade_tier as tier, count(*) as count,
              avg(t.total_damage) as avg_damage,
              avg(t.total_damage * 1.0 / (r.wave_reached - t.placed_wave + 1)) as avg_dmg_per_wave,
              avg(t.placed_wave) as avg_wave_built,
              avg(r.wave_reached) as avg_wave_reached
       FROM towers t JOIN runs r ON t.run_id = r.run_id
       WHERE t.combo_key != '' ${cv.replace("run_id", "t.run_id")}
       GROUP BY t.combo_key, t.upgrade_tier ORDER BY t.combo_key, t.upgrade_tier`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT t.gem, t.quality, count(*) as count,
              avg(t.total_damage) as avg_damage,
              avg(t.total_damage * 1.0 / (r.wave_reached - t.placed_wave + 1)) as avg_dmg_per_wave,
              avg(CASE WHEN rt.run_total > 0 THEN t.total_damage * 1.0 / rt.run_total ELSE 0 END) as avg_damage_share
       FROM towers t JOIN runs r ON t.run_id = r.run_id
       JOIN (SELECT run_id, sum(total_damage) as run_total FROM towers GROUP BY run_id) rt
         ON t.run_id = rt.run_id
       WHERE t.combo_key = '' ${cv.replace("run_id", "t.run_id")}
       GROUP BY t.gem, t.quality ORDER BY avg_dmg_per_wave DESC`,
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
      `SELECT DISTINCT version FROM runs WHERE 1=1 ${mf} ORDER BY version DESC`,
    ).all(),

    db.prepare(
      `SELECT wave, avg(avg_path_progress) as avg_path_progress,
              avg(max_path_progress) as avg_max_path_progress,
              avg(avg_ticks_to_kill) as avg_ticks_to_kill,
              avg(avg_tower_quality) as avg_quality,
              avg(gem_type_count) as avg_gem_types,
              avg(max_upgrade_tier) as avg_max_tier,
              count(*) as runs
       FROM waves WHERE 1=1 ${cv}
       GROUP BY wave ORDER BY wave`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT wave, creep_kind, avg(avg_path_progress) as avg_progress,
              avg(max_path_progress) as avg_max_progress,
              avg(avg_ticks_to_kill) as avg_ticks,
              sum(leaks) as total_leaks, sum(spawned) as total_spawned,
              sum(kills) as total_kills, count(*) as runs
       FROM wave_creep_stats WHERE 1=1 ${cv}
       GROUP BY wave, creep_kind ORDER BY wave, creep_kind`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT creep_kind, sum(spawned) as total_spawned,
              sum(kills) as total_kills, sum(leaks) as total_leaks,
              avg(avg_path_progress) as avg_progress,
              avg(avg_ticks_to_kill) as avg_ticks,
              sum(total_hp_spawned) as total_hp
       FROM wave_creep_stats WHERE 1=1 ${cv}
       GROUP BY creep_kind ORDER BY total_leaks DESC`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT wave, gem, is_combo, sum(damage) as total_damage,
              sum(kills) as total_kills, count(DISTINCT run_id) as runs
       FROM wave_gem_damage WHERE 1=1 ${cv}
       GROUP BY wave, gem, is_combo ORDER BY wave, gem`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT gem, is_combo, sum(damage) as total_damage,
              sum(kills) as total_kills,
              sum(damage) * 1.0 / count(DISTINCT run_id) as avg_damage_per_run_wave
       FROM wave_gem_damage WHERE 1=1 ${cv}
       GROUP BY gem, is_combo ORDER BY total_damage DESC`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT wave, sum(total_hp_spawned) * 1.0 / count(DISTINCT run_id) as avg_hp_pool
       FROM wave_creep_stats WHERE 1=1 ${cv}
       GROUP BY wave ORDER BY wave`,
    ).bind(...cBind).all(),

    db.prepare(
      `SELECT wave, combo_key, upgrade_tier, sum(damage) as total_damage,
              sum(kills) as total_kills, count(*) as runs
       FROM wave_gem_damage WHERE combo_key != '' ${cv}
       GROUP BY wave, combo_key, upgrade_tier ORDER BY wave, combo_key, upgrade_tier`,
    ).bind(...cBind).all(),
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
    wavePressure: wavePressure.results,
    creepKindProgress: creepKindProgress.results,
    creepKindSummary: creepKindSummary.results,
    gemDamageByWave: gemDamageByWave.results,
    gemDamageSummary: gemDamageSummary.results,
    waveHpPool: waveHpPool.results,
    comboDamageByWave: comboDamageByWave.results,
  });
}
