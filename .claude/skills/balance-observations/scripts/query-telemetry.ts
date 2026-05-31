/**
 * query-telemetry.ts — balance-observations analysis engine.
 *
 * Reads the local sim telemetry DB (`.local/telemetry.db`, populated by
 * `npm run sim:run -- --telemetry` while `npm run telemetry:local` runs) and
 * prints ONE JSON blob with both the raw aggregates AND the derived metrics the
 * skill needs (damage/kill shares + ratios, combo build rates, within-archetype
 * leak rates, guarded wave neighbor comparisons with creep attribution).
 *
 * The point of doing all the math here is so the skill's only shell command is
 * this single script — no ad-hoc python/jq per run. The script computes facts
 * and descriptive deviations; it does NOT decide what's "good" balance — that
 * judgment stays in SKILL.md and with the user.
 *
 * Usage (run from repo root so node_modules + src imports resolve):
 *   npx tsx .claude/skills/balance-observations/scripts/query-telemetry.ts
 *   npx tsx ... --ai HeuristicAI --version 1.5.11 --thin 50
 *
 * Defaults: ai=HeuristicAI, version=<package.json version>, thin-sample cutoff=50.
 * Scope for every aggregation: mode='sim' AND wave_reached > 1 AND ai=? AND version=?.
 */
import Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CREEP_ARCHETYPES } from "../../../../src/data/creeps.ts";
import { COMBOS } from "../../../../src/data/combos.ts";
import { WAVES, type PayloadGroup, type WaveGroup } from "../../../../src/data/waves.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../../.."); // <root>/.claude/skills/balance-observations/scripts
const DB_PATH = join(ROOT, ".local", "telemetry.db");

// Opal is the one pure-support gem: its value is the attack-speed aura, not its
// (incidental) hit damage. This is a mechanical-role fact, not a balance target —
// it lets us report a damage-dealer mean that isn't dragged down by a gem that was
// never meant to top the damage charts. The skill explains this in the report.
const SUPPORT_GEMS = new Set(["opal"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function pkgVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
}
const round = (n: number, d = 4) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);
// Median is robust to a group's own outliers; used for both tier-ROI and creep peer comparisons.
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// p-quantile (0..1) via linear interpolation — for wave-reached distribution per cohort.
const quantile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
};

const ai = arg("ai") ?? "HeuristicAI";
const version = arg("version") ?? pkgVersion();
const thinCutoff = arg("thin") ? parseInt(arg("thin")!, 10) : 50;

if (!existsSync(DB_PATH)) {
  console.log(
    JSON.stringify({
      ok: false,
      reason: "no-db",
      dbPath: DB_PATH,
      message:
        "Telemetry DB not found. Run `npm run telemetry:local` and `npm run sim:run -- --telemetry` to generate it.",
    }),
  );
  process.exit(0);
}

// ── Derive deployment facts from the static wave list (data-driven, no hardcoding) ──
const deployedKinds = new Set<string>();
const containerKinds = new Set<string>(); // kinds that release a payload on death
function walkPayload(p: PayloadGroup) {
  deployedKinds.add(p.kind);
  if (p.payload?.length) {
    containerKinds.add(p.kind);
    p.payload.forEach(walkPayload);
  }
}
for (const wave of WAVES) {
  for (const g of wave.groups as WaveGroup[]) {
    deployedKinds.add(g.kind);
    if (g.payload?.length) {
      containerKinds.add(g.kind);
      g.payload.forEach(walkPayload);
    }
  }
}
function creepGroup(kind: string): "air" | "boss" | "container" | "standard" {
  const a = CREEP_ARCHETYPES[kind as keyof typeof CREEP_ARCHETYPES];
  if (a?.flags?.air) return "air";
  if (a?.flags?.boss) return "boss";
  if (containerKinds.has(kind)) return "container";
  return "standard";
}
const comboName = new Map(COMBOS.map((c) => [c.key, c.name]));

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma("query_only = ON");

const inventory = db
  .prepare(
    `SELECT version, ai, count(*) AS runs FROM runs
     WHERE mode='sim' AND wave_reached > 1
     GROUP BY version, ai ORDER BY version DESC, runs DESC`,
  )
  .all();

const targetRunCount = (
  db
    .prepare(`SELECT count(*) AS c FROM runs WHERE mode='sim' AND wave_reached > 1 AND ai=? AND version=?`)
    .get(ai, version) as { c: number }
).c;

const meta = { ok: true as const, dbPath: DB_PATH, targetAi: ai, targetVersion: version, targetRunCount, inventory };

if (targetRunCount === 0) {
  console.log(JSON.stringify({ ...meta, ok: false, reason: "no-runs-for-target" }));
  process.exit(0);
}

const scope = (col: string) =>
  `${col} IN (SELECT run_id FROM runs WHERE mode='sim' AND wave_reached > 1 AND ai=@ai AND version=@version)`;
const bind = { ai, version };
const q = <T>(sql: string) => db.prepare(sql).all(bind) as T[];

const overview = db
  .prepare(
    `SELECT count(*) AS runs, avg(wave_reached) AS avg_wave, max(wave_reached) AS max_wave,
            sum(CASE WHEN outcome='victory' THEN 1 ELSE 0 END) AS victories
     FROM runs WHERE mode='sim' AND wave_reached > 1 AND ai=@ai AND version=@version`,
  )
  .get(bind);

// ── Gems: per-gem damage/kill share + ratio to the damage-dealer mean ──────────
const gemRows = q<{ gem: string; total_damage: number; total_kills: number; runs: number }>(
  `SELECT gem, sum(damage) AS total_damage, sum(kills) AS total_kills, count(DISTINCT run_id) AS runs
   FROM wave_gem_damage WHERE is_combo = 0 AND ${scope("run_id")}
   GROUP BY gem ORDER BY total_damage DESC`,
);
const rosterDamage = gemRows.reduce((s, r) => s + r.total_damage, 0) || 1;
const rosterKills = gemRows.reduce((s, r) => s + r.total_kills, 0) || 1;
const dealerShares = gemRows.filter((r) => !SUPPORT_GEMS.has(r.gem)).map((r) => r.total_damage / rosterDamage);
const dealerMean = dealerShares.length ? dealerShares.reduce((s, x) => s + x, 0) / dealerShares.length : 0;
const gems = {
  rosterTotalDamage: rosterDamage,
  rosterTotalKills: rosterKills,
  dealerMeanDamageShare: round(dealerMean),
  supportGems: [...SUPPORT_GEMS],
  perGem: gemRows.map((r) => {
    const dmgShare = r.total_damage / rosterDamage;
    return {
      gem: r.gem,
      isSupport: SUPPORT_GEMS.has(r.gem),
      total_damage: r.total_damage,
      total_kills: r.total_kills,
      runs: r.runs,
      damage_share: round(dmgShare),
      kill_share: round(r.total_kills / rosterKills),
      // ratio to the dealer mean; null for support gems (not measured against it)
      ratio_to_dealer_mean: SUPPORT_GEMS.has(r.gem) || !dealerMean ? null : round(dmgShare / dealerMean, 2),
    };
  }),
};

// ── Combos: build rate + damage per build (two source tables differ by design) ──
const comboDmg = q<{ combo_key: string; total_damage: number; total_kills: number; runs: number }>(
  `SELECT combo_key, sum(damage) AS total_damage, sum(kills) AS total_kills, count(DISTINCT run_id) AS runs
   FROM wave_gem_damage WHERE combo_key != '' AND ${scope("run_id")} GROUP BY combo_key`,
);
const comboBuild = q<{ combo_key: string; built: number; runs: number }>(
  `SELECT combo_key, count(*) AS built, count(DISTINCT run_id) AS runs
   FROM towers WHERE combo_key != '' AND ${scope("run_id")} GROUP BY combo_key`,
);
const dmgByKey = new Map(comboDmg.map((r) => [r.combo_key, r]));
const combos = {
  totalRuns: targetRunCount,
  perCombo: comboBuild
    .map((b) => {
      const d = dmgByKey.get(b.combo_key);
      return {
        key: b.combo_key,
        name: comboName.get(b.combo_key) ?? b.combo_key,
        built: b.built,
        built_runs: b.runs,
        build_rate: round(b.runs / targetRunCount),
        total_damage: d?.total_damage ?? 0,
        total_kills: d?.total_kills ?? 0,
        damage_runs: d?.runs ?? 0, // runs where it dealt damage (≠ built_runs, different table)
        dmg_per_build: round((d?.total_damage ?? 0) / b.built, 0),
      };
    })
    .sort((a, b) => b.build_rate - a.build_rate),
};

// ── Combo upgrade-tier ROI: damage vs gold, compared across combos per tier ─────
// Damage is attributed to the tier the tower was AT when it dealt it
// (wave_gem_damage.upgrade_tier), so a tower that later upgrades contributes to
// each tier's row in turn. Gold comes from the static upgrade costs in combos.ts —
// it is never re-derived from telemetry. We report, per (combo, tier):
//   • dmg_per_build_at_tier — damage one tower deals while sitting at this tier
//     (total tier damage ÷ towers that reached at least this tier).
//   • marginal_dmg_per_gold — that tier's productivity ÷ the gold for THAT upgrade
//     step (the ROI of buying *this* tier; null for base, which costs no gold).
//   • cum_dmg_per_gold — total damage a tower deals from build through this tier
//     ÷ total gold invested to reach it (the headline cross-combo number; null for base).
// Outliers are read ACROSS combos WITHIN a tier bucket (gold scales differ by tier),
// so each row carries the tier's median cum_dmg_per_gold and a ratio to it.
const comboUpgradeCosts = new Map(COMBOS.map((c) => [c.key, c.upgrades.map((u) => u.cost)]));
const tierDmgRows = q<{ combo_key: string; upgrade_tier: number; total_damage: number; total_kills: number; runs: number }>(
  `SELECT combo_key, upgrade_tier, sum(damage) AS total_damage, sum(kills) AS total_kills, count(DISTINCT run_id) AS runs
   FROM wave_gem_damage WHERE combo_key != '' AND ${scope("run_id")} GROUP BY combo_key, upgrade_tier`,
);
const towerTierRows = q<{ combo_key: string; upgrade_tier: number; n: number }>(
  `SELECT combo_key, upgrade_tier, count(*) AS n FROM towers WHERE combo_key != '' AND ${scope("run_id")}
   GROUP BY combo_key, upgrade_tier`,
);
// final-tier tower counts → how many towers PAID to reach (≥) each tier
const finalTierByCombo = new Map<string, Map<number, number>>();
for (const r of towerTierRows) {
  if (!finalTierByCombo.has(r.combo_key)) finalTierByCombo.set(r.combo_key, new Map());
  finalTierByCombo.get(r.combo_key)!.set(r.upgrade_tier, r.n);
}
const buildsToTier = (combo: string, tier: number) => {
  const m = finalTierByCombo.get(combo);
  if (!m) return 0;
  let s = 0;
  for (const [ft, n] of m) if (ft >= tier) s += n;
  return s;
};
const cumGold = (combo: string, tier: number) => (comboUpgradeCosts.get(combo) ?? []).slice(0, tier).reduce((s, c) => s + c, 0);
const marginalGold = (combo: string, tier: number) => (tier >= 1 ? (comboUpgradeCosts.get(combo)?.[tier - 1] ?? 0) : 0);
// damage-per-build at each (combo, tier)
const dmgPerBuildAt = new Map<string, Map<number, number>>();
const tierDmgByKey = new Map<string, { total_damage: number; total_kills: number; runs: number }>();
for (const r of tierDmgRows) {
  tierDmgByKey.set(`${r.combo_key}|${r.upgrade_tier}`, r);
  const builds = buildsToTier(r.combo_key, r.upgrade_tier);
  if (!dmgPerBuildAt.has(r.combo_key)) dmgPerBuildAt.set(r.combo_key, new Map());
  dmgPerBuildAt.get(r.combo_key)!.set(r.upgrade_tier, builds ? r.total_damage / builds : 0);
}
const cumDmgPerBuild = (combo: string, tier: number) => {
  const m = dmgPerBuildAt.get(combo);
  if (!m) return 0;
  let s = 0;
  for (let t = 0; t <= tier; t++) s += m.get(t) ?? 0;
  return s;
};
const tierRoiRaw = tierDmgRows.map((r) => {
  const builds = buildsToTier(r.combo_key, r.upgrade_tier);
  const dpb = builds ? r.total_damage / builds : 0;
  const mGold = marginalGold(r.combo_key, r.upgrade_tier);
  const cGold = cumGold(r.combo_key, r.upgrade_tier);
  const tierNames = COMBOS.find((c) => c.key === r.combo_key)?.upgrades.map((u) => u.name) ?? [];
  return {
    combo_key: r.combo_key,
    name: comboName.get(r.combo_key) ?? r.combo_key,
    tier: r.upgrade_tier,
    tier_name: r.upgrade_tier === 0 ? "base" : tierNames[r.upgrade_tier - 1] ?? `tier ${r.upgrade_tier}`,
    runs: r.runs,
    total_damage: r.total_damage,
    total_kills: r.total_kills,
    builds_to_tier: builds,
    dmg_per_build_at_tier: round(dpb, 0),
    marginal_gold: mGold,
    cum_gold: cGold,
    // ROI numbers are null at base (no gold spent) — base is reported on raw productivity only.
    marginal_dmg_per_gold: r.upgrade_tier >= 1 && mGold > 0 ? round(dpb / mGold, 1) : null,
    cum_dmg_per_gold: r.upgrade_tier >= 1 && cGold > 0 ? round(cumDmgPerBuild(r.combo_key, r.upgrade_tier) / cGold, 1) : null,
  };
});
// within-tier (across-combo) median of the headline cum_dmg_per_gold → deviation ratio
const cumByTier = new Map<number, number[]>();
for (const r of tierRoiRaw) {
  if (r.cum_dmg_per_gold === null) continue;
  if (!cumByTier.has(r.tier)) cumByTier.set(r.tier, []);
  cumByTier.get(r.tier)!.push(r.cum_dmg_per_gold);
}
const combos2 = {
  ...combos,
  tierRoi: tierRoiRaw
    .map((r) => {
      const peers = cumByTier.get(r.tier) ?? [];
      const med = median(peers);
      return {
        ...r,
        tier_group_size: peers.length,
        tier_median_cum_dmg_per_gold: peers.length ? round(med) : null,
        // null at base (no ROI) or when the tier has only one combo to compare against
        ratio_to_tier_median: r.cum_dmg_per_gold !== null && peers.length >= 2 && med > 0 ? round(r.cum_dmg_per_gold / med, 2) : null,
      };
    })
    .sort((a, b) => a.tier - b.tier || (b.cum_dmg_per_gold ?? -1) - (a.cum_dmg_per_gold ?? -1)),
};

// ── Creeps: within-archetype leak rates ────────────────────────────────────────
const creepRows = q<{
  creep_kind: string;
  spawned: number;
  kills: number;
  leaks: number;
  avg_progress: number;
  max_progress: number;
  avg_ticks_to_kill: number;
  total_hp: number;
}>(
  `SELECT creep_kind, sum(spawned) AS spawned, sum(kills) AS kills, sum(leaks) AS leaks,
          avg(avg_path_progress) AS avg_progress, avg(max_path_progress) AS max_progress,
          avg(avg_ticks_to_kill) AS avg_ticks_to_kill, sum(total_hp_spawned) AS total_hp
   FROM wave_creep_stats WHERE ${scope("run_id")} GROUP BY creep_kind`,
);
const enrichedCreeps = creepRows.map((r) => {
  const a = CREEP_ARCHETYPES[r.creep_kind as keyof typeof CREEP_ARCHETYPES];
  return {
    kind: r.creep_kind,
    group: creepGroup(r.creep_kind),
    deployed: deployedKinds.has(r.creep_kind),
    spawned: r.spawned,
    kills: r.kills,
    leaks: r.leaks,
    leak_rate: round(r.spawned ? r.leaks / r.spawned : 0),
    avg_progress: round(r.avg_progress),
    max_progress: round(r.max_progress),
    avg_ticks_to_kill: round(r.avg_ticks_to_kill, 0),
    total_hp: r.total_hp,
    speed: a?.speed ?? null,
    hpMult: a?.hpMult ?? null,
    armored: !!a?.flags?.armored,
  };
});
// Group-relative stats (median is robust to the group's own outliers).
const byGroup = new Map<string, number[]>();
for (const c of enrichedCreeps) {
  if (!byGroup.has(c.group)) byGroup.set(c.group, []);
  byGroup.get(c.group)!.push(c.leak_rate);
}
const creeps = {
  perKind: enrichedCreeps
    .map((c) => {
      const groupRates = byGroup.get(c.group)!;
      const gMean = groupRates.reduce((s, x) => s + x, 0) / groupRates.length;
      const gMed = median(groupRates);
      return {
        ...c,
        group_size: groupRates.length,
        group_mean_leak_rate: round(gMean),
        group_median_leak_rate: round(gMed),
        // null when the group has one member (a self-comparison ratio of 1.0 is meaningless)
        ratio_to_group_median: groupRates.length >= 2 && gMed > 0 ? round(c.leak_rate / gMed, 1) : null,
      };
    })
    .sort((a, b) => b.leak_rate - a.leak_rate),
};

// ── Waves: per-wave death/leak, guarded neighbor comparison, creep attribution ──
const waveStatRows = q<{ wave: number; samples: number; avg_leaks: number; total_leaks: number; avg_damage: number; avg_path_progress: number }>(
  `SELECT wave, count(*) AS samples, avg(leaks) AS avg_leaks, sum(leaks) AS total_leaks,
          avg(total_damage) AS avg_damage, avg(avg_path_progress) AS avg_path_progress
   FROM waves WHERE ${scope("run_id")} GROUP BY wave ORDER BY wave`,
);
const reachRows = q<{ wave: number; reached: number }>(
  `SELECT wave, count(DISTINCT run_id) AS reached FROM waves WHERE ${scope("run_id")} GROUP BY wave`,
);
const deathRows = q<{ wave: number; deaths: number }>(
  `SELECT wave_reached AS wave, count(*) AS deaths FROM runs
   WHERE outcome='gameover' AND mode='sim' AND wave_reached > 1 AND ai=@ai AND version=@version
   GROUP BY wave_reached`,
);
const leakAttrRows = q<{ wave: number; creep_kind: string; spawned: number; leaks: number }>(
  `SELECT wave, creep_kind, sum(spawned) AS spawned, sum(leaks) AS leaks
   FROM wave_creep_stats WHERE ${scope("run_id")} GROUP BY wave, creep_kind HAVING sum(leaks) > 0`,
);
const reachByWave = new Map(reachRows.map((r) => [r.wave, r.reached]));
const deathByWave = new Map(deathRows.map((r) => [r.wave, r.deaths]));
const attrByWave = new Map<number, { creep_kind: string; leaks: number; spawned: number }[]>();
for (const r of leakAttrRows) {
  if (!attrByWave.has(r.wave)) attrByWave.set(r.wave, []);
  attrByWave.get(r.wave)!.push({ creep_kind: r.creep_kind, leaks: r.leaks, spawned: r.spawned });
}
const perWaveBase = waveStatRows.map((w) => {
  const reached = reachByWave.get(w.wave) ?? w.samples;
  const deaths = deathByWave.get(w.wave) ?? 0;
  return {
    wave: w.wave,
    reached,
    samples: w.samples,
    deaths,
    death_rate: round(reached ? deaths / reached : 0),
    avg_leaks: round(w.avg_leaks),
    total_leaks: w.total_leaks,
    avg_damage: round(w.avg_damage, 0),
    avg_path_progress: round(w.avg_path_progress),
    thin_sample: reached < thinCutoff,
  };
});
const leakByWaveNum = new Map(perWaveBase.map((w) => [w.wave, w.avg_leaks]));
const deathRateByWaveNum = new Map(perWaveBase.map((w) => [w.wave, w.death_rate]));
const NEAR_ZERO_LEAKS = 0.05; // below this a neighbor leak avg can't anchor a ratio
const NEAR_ZERO_DEATH = 0.01;
const neighborAvg = (m: Map<number, number>, wave: number) => {
  const vals = [wave - 1, wave + 1].filter((n) => m.has(n)).map((n) => m.get(n)!);
  return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
};
const waves = {
  perWave: perWaveBase.map((w) => {
    const nLeak = neighborAvg(leakByWaveNum, w.wave);
    const nDeath = neighborAvg(deathRateByWaveNum, w.wave);
    const leakNearZero = nLeak !== null && nLeak < NEAR_ZERO_LEAKS;
    const deathNearZero = nDeath !== null && nDeath < NEAR_ZERO_DEATH;
    const attr = (attrByWave.get(w.wave) ?? []).sort((a, b) => b.leaks - a.leaks).slice(0, 4);
    return {
      ...w,
      neighbor_avg_leaks: nLeak === null ? null : round(nLeak),
      neighbor_avg_death_rate: nDeath === null ? null : round(nDeath),
      // Guarded ratios: null when the neighbor anchor is ~0 (would divide-by-zero / explode).
      leak_ratio_to_neighbors: nLeak && !leakNearZero ? round(w.avg_leaks / nLeak, 1) : null,
      death_ratio_to_neighbors: nDeath && !deathNearZero ? round(w.death_rate / nDeath, 1) : null,
      neighbor_near_zero: leakNearZero || deathNearZero,
      top_leak_creeps: attr,
    };
  }),
};

// ── Wave-1 choice: Malachite / Silver / Pyrite cohorts (by the forced starter offer) ──
// On wave 1 the game guarantees ingredients for exactly ONE of three early specials
// (BuildPhase.rollDraws): Malachite = opal/emerald/topaz, Silver = sapphire/garnet/diamond,
// Pyrite = carnelian/spinel/aquamarine. Every run is therefore in exactly one cohort. We
// recover the offer from the run's wave-1 keeper event — `detail` carries the kept combo_key
// (malachite/silver/pyrite), the direct record of the forced choice. (Older runs predating
// per-wave keeper events won't have one; we fall back to the kept gem's recipe membership.)
// This is a BETWEEN-COHORT comparison: all cohorts are driven by the same AI, so the *relative*
// gap in wave reached is a valid signal even though the absolute level is not (the skill states
// this caveat). 'unassigned' counts runs whose wave-1 keeper matches no special (expected ~0).
const STARTER_RECIPES: Record<string, Set<string>> = {
  malachite: new Set(["opal", "emerald", "topaz"]),
  silver: new Set(["sapphire", "garnet", "diamond"]),
  pyrite: new Set(["carnelian", "spinel", "aquamarine"]),
};
type Cohort = "malachite" | "silver" | "pyrite";
const COHORT_KEYS = Object.keys(STARTER_RECIPES) as Cohort[];
const w1Keepers = q<{ run_id: string; gem: string; combo_key: string }>(
  `SELECT run_id, gem, detail AS combo_key FROM events
   WHERE event_type = 'keeper' AND wave = 1 AND ${scope("run_id")}`,
);
const cohortByRun = new Map<string, Cohort>();
let unassigned = 0;
for (const r of w1Keepers) {
  // Prefer the kept combo (direct signal); fall back to the kept gem's recipe.
  const matched = COHORT_KEYS.find(
    (c) => r.combo_key === c || (!r.combo_key && STARTER_RECIPES[c].has(r.gem)),
  );
  if (matched) cohortByRun.set(r.run_id, matched);
  else unassigned++;
}
const runMetaRows = q<{ run_id: string; wave_reached: number; outcome: string }>(
  `SELECT run_id, wave_reached, outcome FROM runs WHERE mode='sim' AND wave_reached > 1 AND ai=@ai AND version=@version`,
);
const cohortWaves = Object.fromEntries(COHORT_KEYS.map((c) => [c, []])) as Record<Cohort, number[]>;
const cohortVictories = Object.fromEntries(COHORT_KEYS.map((c) => [c, 0])) as Record<Cohort, number>;
for (const r of runMetaRows) {
  const c = cohortByRun.get(r.run_id);
  if (!c) continue;
  cohortWaves[c].push(r.wave_reached);
  if (r.outcome === "victory") cohortVictories[c]++;
}
const cohortSummary = (c: Cohort) => {
  const xs = cohortWaves[c];
  const n = xs.length;
  return {
    runs: n,
    avg_wave: n ? round(xs.reduce((s, x) => s + x, 0) / n, 2) : null,
    median_wave: n ? round(median(xs), 1) : null,
    q1_wave: n ? round(quantile(xs, 0.25), 1) : null,
    q3_wave: n ? round(quantile(xs, 0.75), 1) : null,
    max_wave: n ? Math.max(...xs) : null,
    victories: cohortVictories[c],
  };
};
// per-wave death & leak, split by cohort, so we can see WHERE each choice falls behind
const waveLeakRows = q<{ run_id: string; wave: number; leaks: number }>(
  `SELECT run_id, wave, leaks FROM waves WHERE ${scope("run_id")}`,
);
type WaveAgg = { reached: number; leakSum: number };
const perWaveCohort = new Map<number, Record<Cohort, WaveAgg>>();
const emptyWaveAgg = (): Record<Cohort, WaveAgg> =>
  Object.fromEntries(COHORT_KEYS.map((c) => [c, { reached: 0, leakSum: 0 }])) as Record<Cohort, WaveAgg>;
const ensureWave = (w: number) => {
  if (!perWaveCohort.has(w)) perWaveCohort.set(w, emptyWaveAgg());
  return perWaveCohort.get(w)!;
};
for (const r of waveLeakRows) {
  const c = cohortByRun.get(r.run_id);
  if (!c) continue;
  const agg = ensureWave(r.wave)[c];
  agg.reached += 1;
  agg.leakSum += r.leaks;
}
// deaths at a wave = runs whose run ended (gameover) at that wave_reached, per cohort
const deathsByWaveCohort = new Map<number, Record<Cohort, number>>();
for (const r of runMetaRows) {
  if (r.outcome !== "gameover") continue;
  const c = cohortByRun.get(r.run_id);
  if (!c) continue;
  if (!deathsByWaveCohort.has(r.wave_reached)) deathsByWaveCohort.set(r.wave_reached, Object.fromEntries(COHORT_KEYS.map((c) => [c, 0])) as Record<Cohort, number>);
  deathsByWaveCohort.get(r.wave_reached)![c] += 1;
}
const cohortWaveStats = (w: number, c: Cohort) => {
  const agg = perWaveCohort.get(w)![c];
  const deaths = deathsByWaveCohort.get(w)?.[c] ?? 0;
  return {
    reached: agg.reached,
    deaths,
    death_rate: agg.reached ? round(deaths / agg.reached) : 0,
    avg_leaks: agg.reached ? round(agg.leakSum / agg.reached) : 0,
    thin_sample: agg.reached < thinCutoff,
  };
};
const cohortSummaries = Object.fromEntries(COHORT_KEYS.map((c) => [c, cohortSummary(c)])) as Record<Cohort, ReturnType<typeof cohortSummary>>;
const pairwiseDeltas: Record<string, number | null> = {};
for (let i = 0; i < COHORT_KEYS.length; i++) {
  for (let j = i + 1; j < COHORT_KEYS.length; j++) {
    const a = COHORT_KEYS[i], b = COHORT_KEYS[j];
    const aAvg = cohortSummaries[a].avg_wave, bAvg = cohortSummaries[b].avg_wave;
    pairwiseDeltas[`${b}_minus_${a}_avg_wave`] = aAvg !== null && bAvg !== null ? round(bAvg - aAvg, 2) : null;
  }
}
const waveOneChoice = {
  detector: "wave-1 keeper event combo_key (Malachite / Silver / Pyrite; falls back to the kept gem's recipe for runs without keeper events)",
  unassigned,
  cohorts: cohortSummaries,
  deltas: pairwiseDeltas,
  perWave: [...perWaveCohort.keys()]
    .sort((a, b) => a - b)
    .map((w) => ({ wave: w, ...Object.fromEntries(COHORT_KEYS.map((c) => [c, cohortWaveStats(w, c)])) })),
};

console.log(JSON.stringify({ ...meta, overview, gems, combos: combos2, creeps, waves, waveOneChoice }, null, 2));
db.close();
