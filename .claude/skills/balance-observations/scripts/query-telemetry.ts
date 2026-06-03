/**
 * query-telemetry.ts — balance-observations analysis engine.
 *
 * Reads the local sim telemetry DB (`.local/telemetry.duckdb`, populated by
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
import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CREEP_ARCHETYPES } from "../../../../src/data/creeps.ts";
import { COMBOS } from "../../../../src/data/combos.ts";
import { GEM_BASE, type EffectKind } from "../../../../src/data/gems.ts";
import { WAVES, type PayloadGroup, type WaveGroup } from "../../../../src/data/waves.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../../.."); // <root>/.claude/skills/balance-observations/scripts
const DB_PATH = join(ROOT, ".local", "telemetry.duckdb");

// Support items are derived from their effect kinds, not hardcoded — a gem/combo is
// "support" when EVERY one of its effects only helps OTHER towers / the creep clock /
// economy (auras, vulnerability, armor shred, air-grounding, bonus gold) and it has no
// damaging effect of its own. Their value lands on other rows, never their own damage
// row, so we exclude them from the damage-dealer mean (which would otherwise be dragged
// down) and report them on the assist/keep/presence axes instead. This is a
// mechanical-role classification, not a balance target; it auto-updates as content
// changes. On the current roster this resolves to opal (gem) + black_opal, red_crystal
// (combos); sapphire et al. stay damage dealers (their slow/CC is not in this set).
const SUPPORT_KINDS = new Set<EffectKind["kind"]>([
  "aura_atkspeed", "aura_dmg", "vulnerability_aura", "prox_armor_reduce",
  "stacking_armor_reduce", "armor_decay_aura", "demote_air", "bonus_gold",
]);
const isSupportEffects = (effects: EffectKind[]): boolean =>
  effects.length > 0 && effects.every((e) => SUPPORT_KINDS.has(e.kind));
const supportGemSet = new Set(
  Object.entries(GEM_BASE).filter(([, b]) => isSupportEffects(b.effects)).map(([g]) => g),
);
const supportComboSet = new Set(
  COMBOS.filter((c) => isSupportEffects(c.stats.effects)).map((c) => c.key),
);

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

let instance: Awaited<ReturnType<typeof DuckDBInstance.create>>;
try {
  instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Conflicting lock")) {
    console.log(JSON.stringify({
      ok: false,
      reason: "db-locked",
      dbPath: DB_PATH,
      message:
        "DuckDB DB is held in read-write mode by another process (most likely " +
        "`npm run telemetry:local`). DuckDB allows only one R/W process per file; " +
        "stop the telemetry server before running this script.",
    }));
    process.exit(0);
  }
  throw err;
}
const db = await instance.connect();

// Coerce bigints to plain numbers — DuckDB returns BIGINT for count/sum-of-INT;
// the script's downstream math assumes Number. Counts here stay well within
// MAX_SAFE_INTEGER so the lossy coercion is fine.
function jsToNumbers<T>(rows: Record<string, unknown>[]): T[] {
  for (const row of rows) {
    for (const k in row) if (typeof row[k] === "bigint") row[k] = Number(row[k]);
  }
  return rows as unknown as T[];
}
async function all<T>(sql: string, params: DuckDBValue[] | Record<string, DuckDBValue> = []): Promise<T[]> {
  const reader = await db.runAndReadAll(sql, params as DuckDBValue[]);
  return jsToNumbers<T>(reader.getRowObjectsJS() as Record<string, unknown>[]);
}
async function one<T>(sql: string, params: DuckDBValue[] | Record<string, DuckDBValue> = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params);
  return rows[0];
}

const inventory = await all(
  `SELECT version, ai, count(*) AS runs FROM runs
   WHERE mode='sim' AND wave_reached > 1
   GROUP BY version, ai ORDER BY version DESC, runs DESC`,
);

const targetRunCount = Number((
  await one(
    `SELECT count(*) AS c FROM runs WHERE mode='sim' AND wave_reached > 1 AND ai=$ai AND version=$version`,
    { ai, version },
  ) as { c: number }
).c);

const meta = { ok: true as const, dbPath: DB_PATH, targetAi: ai, targetVersion: version, targetRunCount, inventory };

if (targetRunCount === 0) {
  console.log(JSON.stringify({ ...meta, ok: false, reason: "no-runs-for-target" }));
  process.exit(0);
}

const scope = (col: string) =>
  `${col} IN (SELECT run_id FROM runs WHERE mode='sim' AND wave_reached > 1 AND ai=$ai AND version=$version)`;
const bind = { ai, version };
const q = <T>(sql: string) => all<T>(sql, bind);

// ── Keeper events → keep-rate (A1) + presence reconstruction (A2) ──────────────
// Exactly one tower is kept per wave; the keeper event records (gem, detail=combo_key,
// wave, run). Raw-gem keeps carry detail=''; combo keeps carry the combo_key. We split
// keep credit so raw-gem and combo shares are disjoint (a combo keeper counts for the
// combo, not its base gem), so gem keep_share + combo keep_share ≈ 1 across kept items.
const keeperRows = await q<{ gem: string; combo_key: string; run_id: string; wave: number }>(
  `SELECT gem, detail AS combo_key, run_id, wave FROM events
   WHERE event_type='keeper' AND ${scope("run_id")}`,
);
const totalKeepers = keeperRows.length || 1;
const gemKeepCount = new Map<string, number>();
const gemKeepRuns = new Map<string, Set<string>>();
const comboKeepCount = new Map<string, number>();
const comboKeepRuns = new Map<string, Set<string>>();
// earliest keep wave per (item, run) — kept towers persist, so item is "present" from then on.
const gemKeepWave = new Map<string, Map<string, number>>();
const comboKeepWave = new Map<string, Map<string, number>>();
const bumpKeep = (
  cnt: Map<string, number>, runs: Map<string, Set<string>>, wave: Map<string, Map<string, number>>,
  key: string, run: string, w: number,
) => {
  cnt.set(key, (cnt.get(key) ?? 0) + 1);
  let s = runs.get(key); if (!s) { s = new Set(); runs.set(key, s); } s.add(run);
  let m = wave.get(key); if (!m) { m = new Map(); wave.set(key, m); }
  m.set(run, Math.min(m.get(run) ?? Infinity, w));
};
for (const r of keeperRows) {
  if (r.combo_key) bumpKeep(comboKeepCount, comboKeepRuns, comboKeepWave, r.combo_key, r.run_id, r.wave);
  else bumpKeep(gemKeepCount, gemKeepRuns, gemKeepWave, r.gem, r.run_id, r.wave);
}
const gemKeep = (gem: string) => ({
  keep_incidence: round((gemKeepRuns.get(gem)?.size ?? 0) / targetRunCount),
  keep_share: round((gemKeepCount.get(gem) ?? 0) / totalKeepers),
});
const comboKeep = (key: string) => ({
  keep_incidence: round((comboKeepRuns.get(key)?.size ?? 0) / targetRunCount),
  keep_share: round((comboKeepCount.get(key) ?? 0) / totalKeepers),
});

// Presence-conditioning data (support items only). CORRELATIONAL, not a counterfactual:
// presence correlates with progression and stronger boards. The skill must caveat loudly.
const runFull = await q<{ run_id: string; wave_reached: number; total_leaks: number }>(
  `SELECT run_id, wave_reached, total_leaks FROM runs
   WHERE mode='sim' AND wave_reached > 1 AND ai=$ai AND version=$version`,
);
const waveDetail = await q<{ run_id: string; wave: number; leaks: number; total_damage: number; avg_ticks_to_kill: number; avg_path_progress: number }>(
  `SELECT run_id, wave, leaks, total_damage, avg_ticks_to_kill, avg_path_progress
   FROM waves WHERE ${scope("run_id")}`,
);
const waveDetailByWave = new Map<number, typeof waveDetail>();
for (const r of waveDetail) {
  let a = waveDetailByWave.get(r.wave); if (!a) { a = []; waveDetailByWave.set(r.wave, a); }
  a.push(r);
}
const avgBy = <T>(rows: T[], f: (r: T) => number) =>
  rows.length ? rows.reduce((s, r) => s + f(r), 0) / rows.length : 0;
function presenceForItem(keepWaveByRun: Map<string, number> | undefined) {
  const kw = keepWaveByRun ?? new Map<string, number>();
  const ever = new Set(kw.keys());
  const kept = runFull.filter((r) => ever.has(r.run_id));
  const never = runFull.filter((r) => !ever.has(r.run_id));
  const outcomeSplit = {
    kept_runs: kept.length,
    never_runs: never.length,
    thin_sample: kept.length < thinCutoff || never.length < thinCutoff,
    kept: kept.length ? { avg_wave_reached: round(avgBy(kept, (r) => r.wave_reached), 2), avg_total_leaks: round(avgBy(kept, (r) => r.total_leaks), 2) } : null,
    never: never.length ? { avg_wave_reached: round(avgBy(never, (r) => r.wave_reached), 2), avg_total_leaks: round(avgBy(never, (r) => r.total_leaks), 2) } : null,
  };
  const perWave = [...waveDetailByWave.keys()].sort((a, b) => a - b).map((w) => {
    const rows = waveDetailByWave.get(w)!;
    const present = rows.filter((r) => { const k = kw.get(r.run_id); return k !== undefined && k <= w; });
    const absent = rows.filter((r) => { const k = kw.get(r.run_id); return k === undefined || k > w; });
    const adequate = present.length >= thinCutoff && absent.length >= thinCutoff;
    const agg = (rs: typeof rows) => ({
      avg_ticks_to_kill: round(avgBy(rs, (r) => r.avg_ticks_to_kill), 0),
      avg_path_progress: round(avgBy(rs, (r) => r.avg_path_progress)),
      avg_total_damage: round(avgBy(rs, (r) => r.total_damage), 0),
      avg_leaks: round(avgBy(rs, (r) => r.leaks)),
    });
    return {
      wave: w,
      present_runs: present.length,
      absent_runs: absent.length,
      thin_sample: !adequate,
      present: adequate ? agg(present) : null,
      absent: adequate ? agg(absent) : null,
    };
  });
  return { outcomeSplit, perWave };
}
const PRESENCE_CAVEAT =
  "Correlational, NOT a counterfactual: a support item's presence correlates with run " +
  "progression and stronger boards, so 'present' cohorts look better partly because " +
  "better runs keep more towers. Only a leave-one-out sim measures marginal value.";

const overview = await one(
  `SELECT count(*) AS runs, avg(wave_reached) AS avg_wave, max(wave_reached) AS max_wave,
          sum(CASE WHEN outcome='victory' THEN 1 ELSE 0 END) AS victories
   FROM runs WHERE mode='sim' AND wave_reached > 1 AND ai=$ai AND version=$version`,
  bind,
);

// ── Gems: per-gem damage/kill share + ratio to the damage-dealer mean ──────────
const gemRows = await q<{ gem: string; total_damage: number; total_kills: number; runs: number }>(
  `SELECT gem, sum(damage) AS total_damage, sum(kills) AS total_kills, count(DISTINCT run_id) AS runs
   FROM wave_gem_damage WHERE is_combo = 0 AND ${scope("run_id")}
   GROUP BY gem ORDER BY total_damage DESC`,
);
const rosterDamage = gemRows.reduce((s, r) => s + r.total_damage, 0) || 1;
const rosterKills = gemRows.reduce((s, r) => s + r.total_kills, 0) || 1;
const dealerShares = gemRows.filter((r) => !supportGemSet.has(r.gem)).map((r) => r.total_damage / rosterDamage);
const dealerMean = dealerShares.length ? dealerShares.reduce((s, x) => s + x, 0) / dealerShares.length : 0;

// ── DMG/HP: damage normalized by the incoming HP pool (mirrors dashboard.ts "Dmg/HP") ──
// For each wave an item dealt damage on: (its damage that wave / runs that dealt it) ÷
// (avg enemy HP that spawned that wave), then averaged across those waves. Gold- AND
// run-length-agnostic — a wave-by-wave share of the HP that actually walked the board — so
// it's the cleanest cross-gem / cross-special damage-output lens. avg_hp_pool mirrors the
// dashboard's waveHpPool query exactly (sum(total_hp_spawned) ÷ distinct runs, per wave).
const hpPoolByWave = new Map(
  (await q<{ wave: number; avg_hp_pool: number }>(
    `SELECT wave, sum(total_hp_spawned) * 1.0 / count(DISTINCT run_id) AS avg_hp_pool
     FROM wave_creep_stats WHERE ${scope("run_id")} GROUP BY wave`,
  )).map((r) => [r.wave, r.avg_hp_pool] as const),
);
const dmgPerHpByKey = (rows: { key: string; wave: number; total_damage: number; runs: number }[]) => {
  const byKey = new Map<string, { wave: number; total_damage: number; runs: number }[]>();
  for (const r of rows) {
    let a = byKey.get(r.key); if (!a) { a = []; byKey.set(r.key, a); }
    a.push(r);
  }
  const out = new Map<string, number | null>();
  for (const [k, rs] of byKey) {
    let sum = 0, n = 0;
    for (const r of rs) {
      const hp = hpPoolByWave.get(r.wave);
      if (hp && hp > 0 && r.runs > 0) { sum += r.total_damage / r.runs / hp; n++; }
    }
    out.set(k, n ? round(sum / n) : null);
  }
  return out;
};
const gemDmgPerHp = dmgPerHpByKey(
  await q<{ key: string; wave: number; total_damage: number; runs: number }>(
    `SELECT gem AS key, wave, sum(damage) AS total_damage, count(DISTINCT run_id) AS runs
     FROM wave_gem_damage WHERE is_combo = 0 AND ${scope("run_id")} GROUP BY gem, wave`,
  ),
);
const comboDmgPerHp = dmgPerHpByKey(
  await q<{ key: string; wave: number; total_damage: number; runs: number }>(
    `SELECT combo_key AS key, wave, sum(damage) AS total_damage, count(DISTINCT run_id) AS runs
     FROM wave_gem_damage WHERE combo_key != '' AND ${scope("run_id")} GROUP BY combo_key, wave`,
  ),
);
// Dealer-gem mean DMG/HP → anchor for a per-gem deviation ratio (parallels dealerMeanDamageShare).
const dealerDmgPerHps = gemRows
  .filter((r) => !supportGemSet.has(r.gem))
  .map((r) => gemDmgPerHp.get(r.gem))
  .filter((x): x is number => typeof x === "number");
const dealerMeanDmgPerHp = dealerDmgPerHps.length
  ? dealerDmgPerHps.reduce((s, x) => s + x, 0) / dealerDmgPerHps.length
  : 0;

// ── Assist (A3): assisted damage credited to support sources, from wave_gem_assist ──
// Pre-instrumentation runs (older versions) have no such table/rows; we omit the block
// then (the script already version-filters, so it returns automatically once new runs land).
const assistTableRow = await one<{ n: number }>(
  `SELECT count(*) AS n FROM information_schema.tables
   WHERE table_schema='main' AND table_name='wave_gem_assist'`,
);
const hasAssistTable = (assistTableRow?.n ?? 0) > 0;
type AssistAgg = { dmg_aura: number; vuln: number; armor_shred: number; atkspeed: number; bonus_gold: number };
const zeroAssist = (): AssistAgg => ({ dmg_aura: 0, vuln: 0, armor_shred: 0, atkspeed: 0, bonus_gold: 0 });
const assistByGem = new Map<string, AssistAgg>();
const assistByCombo = new Map<string, AssistAgg>();
if (hasAssistTable) {
  const assistRows = await q<{ gem: string; combo_key: string; dmg_aura: number; vuln: number; armor_shred: number; atkspeed: number; bonus_gold: number }>(
    `SELECT gem, combo_key,
            sum(dmg_aura_assist) AS dmg_aura, sum(vuln_assist) AS vuln,
            sum(armor_shred_assist) AS armor_shred, sum(atkspeed_assist) AS atkspeed,
            sum(bonus_gold) AS bonus_gold
     FROM wave_gem_assist WHERE ${scope("run_id")} GROUP BY gem, combo_key`,
  );
  for (const r of assistRows) {
    const target = r.combo_key ? assistByCombo : assistByGem;
    const key = r.combo_key || r.gem;
    const a = target.get(key) ?? zeroAssist();
    a.dmg_aura += r.dmg_aura; a.vuln += r.vuln; a.armor_shred += r.armor_shred;
    a.atkspeed += r.atkspeed; a.bonus_gold += r.bonus_gold;
    target.set(key, a);
  }
}
const assistedTotal = (a: AssistAgg) => a.dmg_aura + a.vuln + a.armor_shred + a.atkspeed;
// Support-set median assisted_damage_share → deviation band (parallels the dealer mean).
const supportShares: number[] = [];
for (const [g, a] of assistByGem) if (supportGemSet.has(g)) supportShares.push(assistedTotal(a) / rosterDamage);
for (const [k, a] of assistByCombo) if (supportComboSet.has(k)) supportShares.push(assistedTotal(a) / rosterDamage);
const supportMedianShare = supportShares.length ? median(supportShares) : 0;
const assistRow = (isSupport: boolean, a: AssistAgg) => {
  const assisted = assistedTotal(a);
  const share = assisted / rosterDamage;
  return {
    isSupport,
    dmg_aura_assist: round(a.dmg_aura, 0),
    vuln_assist: round(a.vuln, 0),
    armor_shred_assist: round(a.armor_shred, 0),
    atkspeed_assist: round(a.atkspeed, 0),
    assisted_damage: round(assisted, 0),
    // share against the GEM roster total, so it's directly comparable to dealers' damage_share
    assisted_damage_share: round(share),
    // gold units, NOT folded into damage shares
    bonus_gold: round(a.bonus_gold, 0),
    ratio_to_support_median: isSupport && supportMedianShare > 0 ? round(share / supportMedianShare, 2) : null,
  };
};
const gemAssist = hasAssistTable ? {
  rosterTotalDamage: rosterDamage,
  support_median_assisted_damage_share: supportShares.length ? round(supportMedianShare) : null,
  perGem: [...assistByGem.entries()]
    .map(([gem, a]) => ({ gem, ...assistRow(supportGemSet.has(gem), a) }))
    .filter((r) => r.assisted_damage > 0 || r.bonus_gold > 0)
    .sort((x, y) => y.assisted_damage - x.assisted_damage),
} : null;
const comboAssist = hasAssistTable ? {
  rosterTotalDamage: rosterDamage,
  support_median_assisted_damage_share: supportShares.length ? round(supportMedianShare) : null,
  perCombo: [...assistByCombo.entries()]
    .map(([key, a]) => ({ key, name: comboName.get(key) ?? key, ...assistRow(supportComboSet.has(key), a) }))
    .filter((r) => r.assisted_damage > 0 || r.bonus_gold > 0)
    .sort((x, y) => y.assisted_damage - x.assisted_damage),
} : null;

const gems = {
  rosterTotalDamage: rosterDamage,
  rosterTotalKills: rosterKills,
  dealerMeanDamageShare: round(dealerMean),
  dealerMeanDmgPerHp: round(dealerMeanDmgPerHp),
  supportGems: [...supportGemSet],
  perGem: gemRows.map((r) => {
    const dmgShare = r.total_damage / rosterDamage;
    return {
      gem: r.gem,
      isSupport: supportGemSet.has(r.gem),
      total_damage: r.total_damage,
      total_kills: r.total_kills,
      runs: r.runs,
      damage_share: round(dmgShare),
      kill_share: round(r.total_kills / rosterKills),
      // ratio to the dealer mean; null for support gems (not measured against it)
      ratio_to_dealer_mean: supportGemSet.has(r.gem) || !dealerMean ? null : round(dmgShare / dealerMean, 2),
      // DMG/HP (dashboard "Dmg/HP"): damage per unit of wave HP pool; gold- and run-length-
      // agnostic, so comparable across gems regardless of cost or how far the run got.
      dmg_per_hp: gemDmgPerHp.get(r.gem) ?? null,
      dmg_per_hp_ratio_to_dealer_mean:
        supportGemSet.has(r.gem) || !dealerMeanDmgPerHp || gemDmgPerHp.get(r.gem) == null
          ? null
          : round((gemDmgPerHp.get(r.gem) as number) / dealerMeanDmgPerHp, 2),
      ...gemKeep(r.gem),
    };
  }),
  assist: gemAssist,
  presenceConditioning: {
    caveat: PRESENCE_CAVEAT,
    items: [...supportGemSet].map((g) => ({ gem: g, ...presenceForItem(gemKeepWave.get(g)) })),
  },
};

// ── Combos: build rate + damage per build (two source tables differ by design) ──
const comboDmg = await q<{ combo_key: string; total_damage: number; total_kills: number; runs: number }>(
  `SELECT combo_key, sum(damage) AS total_damage, sum(kills) AS total_kills, count(DISTINCT run_id) AS runs
   FROM wave_gem_damage WHERE combo_key != '' AND ${scope("run_id")} GROUP BY combo_key`,
);
const comboBuild = await q<{ combo_key: string; built: number; runs: number }>(
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
        // DMG/HP (dashboard "Dmg/HP"): damage per unit of wave HP pool — run-length-agnostic,
        // so it's the cleanest cross-special damage-output lens. null if it never dealt damage.
        dmg_per_hp: comboDmgPerHp.get(b.combo_key) ?? null,
        ...comboKeep(b.combo_key),
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
const tierDmgRows = await q<{ combo_key: string; upgrade_tier: number; total_damage: number; total_kills: number; runs: number }>(
  `SELECT combo_key, upgrade_tier, sum(damage) AS total_damage, sum(kills) AS total_kills, count(DISTINCT run_id) AS runs
   FROM wave_gem_damage WHERE combo_key != '' AND ${scope("run_id")} GROUP BY combo_key, upgrade_tier`,
);
const towerTierRows = await q<{ combo_key: string; upgrade_tier: number; n: number }>(
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
  assist: comboAssist,
  presenceConditioning: {
    caveat: PRESENCE_CAVEAT,
    items: [...supportComboSet].map((k) => ({
      key: k,
      name: comboName.get(k) ?? k,
      ...presenceForItem(comboKeepWave.get(k)),
    })),
  },
};

// ── Creeps: within-archetype leak rates ────────────────────────────────────────
const creepRows = await q<{
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
const waveStatRows = await q<{ wave: number; samples: number; avg_leaks: number; total_leaks: number; avg_damage: number; avg_path_progress: number }>(
  `SELECT wave, count(*) AS samples, avg(leaks) AS avg_leaks, sum(leaks) AS total_leaks,
          avg(total_damage) AS avg_damage, avg(avg_path_progress) AS avg_path_progress
   FROM waves WHERE ${scope("run_id")} GROUP BY wave ORDER BY wave`,
);
const reachRows = await q<{ wave: number; reached: number }>(
  `SELECT wave, count(DISTINCT run_id) AS reached FROM waves WHERE ${scope("run_id")} GROUP BY wave`,
);
const deathRows = await q<{ wave: number; deaths: number }>(
  `SELECT wave_reached AS wave, count(*) AS deaths FROM runs
   WHERE outcome='gameover' AND mode='sim' AND wave_reached > 1 AND ai=$ai AND version=$version
   GROUP BY wave_reached`,
);
const leakAttrRows = await q<{ wave: number; creep_kind: string; spawned: number; leaks: number }>(
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
// Pyrite = peridot/spinel/aquamarine. Every run is therefore in exactly one cohort. We
// recover the offer from the run's wave-1 keeper event — `detail` carries the kept combo_key
// (malachite/silver/pyrite), the direct record of the forced choice. (Older runs predating
// per-wave keeper events won't have one; we fall back to the kept gem's recipe membership.)
// This is a BETWEEN-COHORT comparison: all cohorts are driven by the same AI, so the *relative*
// gap in wave reached is a valid signal even though the absolute level is not (the skill states
// this caveat). 'unassigned' counts runs whose wave-1 keeper matches no special (expected ~0).
const STARTER_RECIPES: Record<string, Set<string>> = {
  malachite: new Set(["opal", "emerald", "topaz"]),
  silver: new Set(["sapphire", "garnet", "diamond"]),
  // "carnelian" kept for historical runs before the rename — safe to drop once those runs age out of the dashboards.
  pyrite: new Set(["peridot", "carnelian", "spinel", "aquamarine"]),
};
type Cohort = "malachite" | "silver" | "pyrite";
const COHORT_KEYS = Object.keys(STARTER_RECIPES) as Cohort[];
const w1Keepers = await q<{ run_id: string; gem: string; combo_key: string }>(
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
const runMetaRows = await q<{ run_id: string; wave_reached: number; outcome: string }>(
  `SELECT run_id, wave_reached, outcome FROM runs WHERE mode='sim' AND wave_reached > 1 AND ai=$ai AND version=$version`,
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
const waveLeakRows = await q<{ run_id: string; wave: number; leaks: number }>(
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
db.disconnectSync();
