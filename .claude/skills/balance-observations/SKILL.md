---
name: balance-observations
description: >-
  Analyze local sim-run telemetry to surface gem, special-gem (combo), creep,
  and wave BALANCE OUTLIERS in the GemTD project — which items stand out from
  their peers. Use this whenever the user asks for balance observations, balance
  analysis, what's over/underpowered, which gems/creeps/waves are outliers, which
  special-gem UPGRADE TIERS are worth their gold (damage-per-gold ROI), or about the
  WAVE-1 STARTER CHOICE (Malachite / Silver / Pyrite) and its impact on how far runs get.
  Also use for "look at the telemetry / sim data for balance," and whenever the user
  wants to be WALKED THROUGH the findings, decide what (if anything) to change, or
  "help me decide what to tune." Reads `.local/telemetry.duckdb` directly (HeuristicAI sim
  runs at the current game version). It explains every deduction in full, makes NO
  assumptions about a target/desirable balance state the user hasn't confirmed, then
  INTERVIEWS the user finding-by-finding (AskUserQuestion) — keep or change, and if
  change, which lever — and, only after explicit confirmation, can apply the resulting
  edits to the data files. Does NOT judge overall difficulty; never edits data files
  without the user's explicit go-ahead.
---

# Balance Observations

Turn local sim telemetry into a report of **balance outliers** across four domains:
**gems, special gems (combos), creeps, waves**. Surface what stands out from its peers,
explain exactly how you deduced it, and let the user decide what (if anything) is wrong.

## Core stance — read this before anything else

These three rules override every convenience below. They exist because "what good
balance looks like" is the user's call, not yours — your job is to make the data legible,
not to impose a target.

1. **Explain every deduction.** No finding is a bare assertion. State the raw numbers, how
   you computed them, what you compared against, and the sample size. The reader must be
   able to re-derive any claim from the numbers you show.

2. **Assume no desirable balance state.** Identifying that something is an *outlier* (X
   does 3× the damage of its peers, wave W leaks 5× its neighbors) is a factual,
   descriptive observation — that is allowed and is the point of the skill. Concluding
   that an outlier is *wrong*, *undesirable*, or *should be changed* is a value judgment
   that depends on design intent you have not been told. Do not make that leap on your own.
   A gem dominating, a creep being trivial, a flat or a spiky curve — none of these are
   "bad" until the user says the intended design is otherwise.

3. **When unsure, ask — don't conclude.** Where a recommendation hinges on intent you
   can't confirm (is this dominant combo an intended power pick or an accident? is this
   creep meant to be a standout threat?), use **AskUserQuestion** to ask the user before
   recommending anything. Prefer asking over guessing. Step 4 turns this into a finding-by-finding
   interview — one decision per finding, with its numbers in view.

The severity markers 🔴/🟡 in the report mean **how large the deviation from peers is**
(🔴 = large, 🟡 = moderate) — a measure of how far the outlier sits from the pack, NOT a
claim that it is undesirable. Say this in the report so the reader doesn't read red as "bad."

## Scope (what the data can and can't tell you)

- **Relative only.** The sim AI (HeuristicAI) is weaker than a skilled human, so absolute
  win rate, absolute wave-reached, and "the game is too hard/easy" are **not valid
  signals** — never report them. Every observation is item-vs-comparable-items or
  wave-vs-adjacent-waves; relative structure survives the AI's weakness, absolute outcomes
  don't. **One scoped exception:** the Wave-1 choice analysis compares wave-reached *between
  three cohorts that share the same AI* (Malachite / Silver / Pyrite-offered), so their relative
  gaps are valid — report the deltas, never the absolute level. See "Wave-1 starter choice" in Step 2.
- **Only what's deployed.** Analyze only the gems / combos / creeps that actually appear
  in the script output. The codebase defines content that the current wave list may never
  spawn (e.g. some creep kinds). If a defined type is absent from the data, you may note it
  in one line as "currently not deployed in waves 1–50," but do not analyze its balance —
  there's nothing to analyze.
- **HeuristicAI has hardcoded build/upgrade biases — strip them before reading "the AI keeps X."**
  The AI is not a neutral scorer; it intentionally tilts toward specific combos. Treat elevated
  `build_rate` / `keep_incidence` / upgrade-tier presence on these items as **at least partly
  policy, not just strength**, and say so in the report:
  - **Armor-shred combos** (`paraiba_tourmaline`, `gold`, `uranium`, `ametrine`) get a keeper-score
    bonus from **wave 20+** (and an ingredient-progress bias from wave 15+), and the bonus keeps
    applying even after one shred combo is already on the board — so the AI will stack multiple
    shreds in late game when given the chance. Among shreds, **Paraiba Tourmaline is preferred**
    when multiple completions are available. Elevated build/keep rates on these four combos
    partly reflect the AI policy, not raw strength — and Paraiba specifically will skew higher
    than its peers for this reason.
  - **Paraiba → Ancient Paraiba and Black Opal → Void Opal upgrades are always bought first**
    (in that order) before any other combo's next tier. Elevated max-tier presence on these two
    in deep-run cohorts partly reflects spend-order policy. The cluster read
    ("armor-shred coverage is in X% of the W50 cohort") is still valid, but flag Paraiba's lift
    within that cluster as policy-amplified.
  - Black Opal no longer has a *build-time* boost (it was dropped) — only the upgrade-order boost.
    So a Black Opal build_rate ≈ its peers is the expected baseline now; if it's still elevated
    that's a real signal.

  Practical rule: when reporting on Paraiba / Gold / Uranium / Ametrine, lead with
  damage and assist axes; treat `build_rate` / `keep_incidence` as confounded; and when computing
  W50-cohort lift, name the AI bias as one of the candidate explanations alongside genuine strength.

- **Support value is now partially measured — but still imperfect.** Support gems/combos
  (the *derived* support set: items whose every effect only helps other towers / the creep
  clock / economy) carry value that never lands on their own damage row. The script now
  surfaces three new axes for them: **assisted damage** (B-instrumentation: damage-aura,
  vulnerability, armor-shred, attack-speed credited back to the source), **keep-rate** (A1),
  and **presence-conditioning** (A2). This means a support gem that's low on *all* of these
  is a stronger weakness signal than damage_share alone ever was. But the coverage is still
  incomplete: assisted damage is an **attribution approximation** (per-channel marginal credit,
  normalized — not a ground-truth counterfactual), and **slow / crowd-control duration and
  path-distance-denied remain unmeasured**. So absence of assist data is *not* proof of
  weakness — name what's still unmeasured before reading a low number as a problem.

## Step 1 — Check data freshness (do this first, always)

The analysis is only meaningful on sim runs that match the **current game version** and
use **HeuristicAI** (the canonical balance evaluator). Run **both** bundled query scripts from
the repo root — the first computes outlier deviations, the second computes deep-run /
victory-cohort keeper composition:

```bash
npx tsx .claude/skills/balance-observations/scripts/query-telemetry.ts
npx tsx .claude/skills/balance-observations/scripts/winning-runs-query.ts
```

`query-telemetry.ts` reads the current version from `package.json` and targets
`mode='sim' AND ai='HeuristicAI' AND version=<current> AND wave_reached > 1`. Inspect the
JSON it prints:

- `ok: false, reason: "no-db"` → the DB doesn't exist yet.
- `ok: false, reason: "no-runs-for-target"` → DB exists but has no HeuristicAI sim runs at
  the current version. The `inventory` array shows which `(version, ai)` buckets DO have
  data — use it to tell the user whether they have stale data from an older version.
- `ok: true` → `targetRunCount` runs are available; the full analysis is included.

`winning-runs-query.ts` returns per-cohort keeper composition: how often each (combo, max
upgrade tier kept) and bare gem appears across **All runs**, **Beat W30**, **Beat W40**,
**Beat W45**, and **Made W50** (the victory-adjacent cohort). The ratio of presence in the
W50 cohort vs All-runs tells you which keepers are *associated with deep-run progress*. This
is one of the strongest signals available — see "Deep-run keeper composition" in Step 2.

**These two scripts are the only commands you need to run.** They do all the extraction *and*
the derived math (shares, ratios, leak rates, guarded wave comparisons, creep attribution,
cohort presence rates) and print JSON blobs. Read those JSON outputs and reason over them
directly — do **not** write inline `python`/`jq`/`node -e` to parse or recompute (the values
are already there, and ad-hoc scripts trigger approval prompts for no benefit). The blobs
are sizeable (tens to hundreds of KB for a full run set), so they're normally persisted to
files rather than shown inline — that's expected; just Read the persisted file. When you
need a gem/combo/creep's kit or a wave's composition for context, **Read** the data file
(`gems.ts`, `combos.ts`, `creeps.ts`, `waves.ts`) — prefer the Read tool over `grep`/`head`,
per the repo's conventions. The key output fields (a few extra raw fields also appear; these
are the ones you'll use):

```
overview            { runs, avg_wave, max_wave, victories }
gems.dealerMeanDamageShare, gems.dealerMeanDmgPerHp, gems.supportGems   // supportGems is now DERIVED from effect kinds
gems.perGem[]       { gem, isSupport, total_damage, total_kills, damage_share, kill_share,
                      ratio_to_dealer_mean,        // ratio null for support gems
                      dmg_per_hp, dmg_per_hp_ratio_to_dealer_mean,  // DMG/HP (dashboard "Dmg/HP") + ratio to dealer mean; gold/run-length agnostic; ratio null for support
                      keep_incidence, keep_share } // A1: keep_incidence = distinct runs kept ÷ runs;
                                                   //     keep_share = this gem's keeper events ÷ all
gems.assist         // A3 — null/absent on pre-instrumentation runs (then OMIT it entirely):
                    { rosterTotalDamage, support_median_assisted_damage_share,
                      perGem[]{ gem, isSupport, dmg_aura_assist, vuln_assist, armor_shred_assist,
                                atkspeed_assist, demote_air_assist,
                                assisted_damage, assisted_damage_share,
                                bonus_gold, ratio_to_support_median } }
                      // assisted_damage_share uses the GEM roster total → comparable to damage_share;
                      // ratio_to_support_median null for non-support; bonus_gold is GOLD, not damage;
                      // demote_air_assist = damage landed by ground-only towers on creeps the
                      // source grounded with demote_air (Red Crystal's air-grounding value)
gems.presenceConditioning  // A2 — CORRELATIONAL (see `caveat`); support gems only:
                    { caveat, items[]{ gem,
                        outcomeSplit{ kept_runs, never_runs, thin_sample,
                                      kept{avg_wave_reached,avg_total_leaks}, never{...} },
                        perWave[]{ wave, present_runs, absent_runs, thin_sample,
                                   present{avg_ticks_to_kill,avg_path_progress,avg_total_damage,avg_leaks},
                                   absent{...} } } }   // present/absent null below the thin cutoff
combos.perCombo[]   { key, name, built, built_runs, build_rate, total_damage, total_kills,
                      damage_runs, dmg_per_build, dmg_per_hp,  // dmg_per_hp = DMG/HP (dashboard "Dmg/HP"); run-length agnostic; null if it never dealt damage
                      keep_incidence, keep_share } // sorted by build_rate desc
combos.assist       // A3 — same shape as gems.assist but perCombo[]{ key, name, ... }; null → OMIT
combos.presenceConditioning  // A2 — { caveat, items[]{ key, name, outcomeSplit, perWave } }
combos.tierRoi[]    { combo_key, name, tier, tier_name, runs, total_damage, total_kills,
                      builds_to_tier, dmg_per_build_at_tier, marginal_gold, cum_gold,
                      marginal_dmg_per_gold, cum_dmg_per_gold,
                      // Peer-group split: intermediate-T1 vs final-T1 vs final-T2.
                      // A combo's FINAL upgrade carries the combo's ceiling, so its
                      // dmg/gold is structurally higher than any intermediate at the same
                      // numeric tier. We split the peer pool on this axis (use ONLY these
                      // fields for cross-combo deviation reads — they're the honest comparison).
                      is_final, peer_group,            // "intermediate-t1" | "final-t1" | "final-t2" | null at base
                      peer_group_size,
                      peer_group_median_cum_dmg_per_gold,
                      ratio_to_peer_group_median }    // null at base or when peer group < 2 combos
                      // ROI fields null at base (tier 0, no gold).
                      // sorted by tier asc, then cum_dmg_per_gold desc
waveOneChoice       { detector, unassigned,
                      deltas.{<b>_minus_<a>_avg_wave} (pairwise, positive → b further),
                      cohorts.{malachite,silver,pyrite}.{runs,avg_wave,median_wave,q1_wave,
                                                          q3_wave,max_wave,victories},
                      perWave[]{ wave, malachite{reached,deaths,death_rate,avg_leaks,
                                                  thin_sample}, silver{...}, pyrite{...} } }
creeps.perKind[]    { kind, group(air|boss|container|standard), deployed, spawned, kills,
                      leaks, leak_rate, avg_progress, avg_ticks_to_kill, speed, hpMult,
                      group_size, group_median_leak_rate, ratio_to_group_median }
                      // ratio null when group_size < 2 (e.g. air, boss); sorted by leak_rate desc
waves.perWave[]     { wave, reached, samples, deaths, death_rate, avg_leaks, avg_damage,
                      thin_sample, neighbor_avg_leaks, neighbor_avg_death_rate,
                      leak_ratio_to_neighbors, death_ratio_to_neighbors, neighbor_near_zero,
                      top_leak_creeps[] }          // ratios null when the neighbor anchor is ~0
```

`winning-runs-query.ts` output (separate JSON):

```
version, cohorts.{name}.{ runs, combos[], gems[] }
  // name ∈ "All runs" | "Beat wave 30" | "Beat wave 40" | "Beat wave 45" | "Victories (W50)"
  // combos[]: { combo_key, tier, runs_with_it, presence_rate }
  //   tier = MAX tier kept for that combo in each run; sorted by runs_with_it desc.
  // gems[]:  { gem, runs_with_it, presence_rate } — bare uncombined kept gems
```

**If data is missing or stale, STOP and tell the user to generate it manually.** Do not run
the sims yourself. Print these exact commands and explain that **both must run at the same
time** — the sim posts telemetry over HTTP to the local server, so the server must be up or
nothing is recorded:

```bash
# Terminal 1 — telemetry server (must stay running)
npm run telemetry:local

# Terminal 2 — generate sim runs (HeuristicAI is the default with --telemetry)
npm run sim:run -- --telemetry --seeds 200
```

Recommend a seed count (≈200 is a good default; more = steadier per-wave and per-gem
numbers, especially for late waves few runs reach). Then ask them to re-invoke once the run
finishes.

**Sample-size honesty:** even when `ok: true`, late-wave rows have small samples because few
runs get there. When `targetRunCount` is low (say < 50) or a wave's `reached` / `samples`
count is tiny, state the sample size next to the finding and label it a weak signal. Thin
data is a caveat you must surface, not hide. **Assisted-damage and presence rows inherit the
same thin-sample caveats** (presence-conditioning nulls out `present`/`absent` below the cutoff
and flags `thin_sample`; honor it). And spell out that **presence-conditioning is
*correlational*, not a counterfactual** — a support item's presence correlates with run
progression and stronger boards, so "present" cohorts can look better simply because better
runs keep more towers (the script's `caveat` field says this; repeat it in the report). The
only clean marginal-value measure is a leave-one-out sim, which is **out of scope** here.

## Step 2 — Measure outliers (describe, don't judge)

The script already computed the deviations; your job is to read them, pick what's notable,
and explain *why* each number looks the way it does. Cross-reference the live data files
(`src/data/gems.ts`, `combos.ts`, `creeps.ts`, `waves.ts`) for the mechanical **kit** behind
a number and for the specific lever a later suggestion would touch — but never treat the kit
as a target the number "should" hit. The bands/markers below are reporting salience ("how
notable is this gap"), not balance targets.

### Gems (`gems.ts`)

Read `gems.perGem[]`: each gem's `damage_share`, `kill_share`, and `ratio_to_dealer_mean`
(its damage share ÷ the mean across the damage-dealing gems — support gems in
`gems.supportGems` are excluded from that mean and carry a null ratio). Report the full
spread (highest to lowest), not just the extremes. Read share correctly: of the five forced
draws each build, only **one** tower is kept (the rest become rocks), so a gem accumulates
damage across waves only when it's actually kept and used — share is therefore a combined
signal of raw strength and how often the AI keeps it. The script now **also** breaks out
`keep_incidence` / `keep_share` (A1) so you can separate the two: a high keep-rate with a low
damage_share means the AI values it for something other than raw damage (a support role) — read
the two together rather than collapsing them.

Mechanical kit, to interpret numbers (from `gems.ts` — verify current effects there):

| Gem | Kit (what it mechanically does) |
|-----|---------------------------------|
| ruby | splash fire damage |
| emerald | poison damage-over-time |
| topaz | chaining arcs (multi-target) |
| amethyst | true damage; bonus vs air |
| aquamarine | single-target beam that ramps |
| sapphire | frost slow (crowd control) — much of its value is the slow, which is not in damage telemetry |
| diamond | crit burst; **ground-only targeting** caps how much it can hit |
| opal | **support aura (attack-speed buff)** — the one derived-support *gem*; near-zero damage share is mechanically inevitable. Primary assist channel: `atkspeed_assist`. Read it on assist/keep/presence, not damage |
| garnet | mortar — slow-firing, long-range, ground-target splash (hits a position, not a creep); **ground-only** |
| spinel | sniper — high damage, long range, slow fire; targets highest-HP creep |
| peridot | charged burst — first shot after idle deals up to 4× damage; quality scales the multiplier |

How to describe (the deviation, with its size):
- Use `ratio_to_dealer_mean`. Mark 🔴 for a ratio above ~2× or below ~0.4×, 🟡 for ~1.5–2× or
  ~0.4–0.66×. Say you excluded the support gem(s) from the mean and why.
- **Also read `dmg_per_hp` (DMG/HP)** — the same metric the telemetry dashboard shows (its
  `Dmg/HP` column): this gem's damage per unit of enemy HP that spawned, averaged across the
  waves it fought (the script mirrors the dashboard's formula exactly). Unlike `damage_share`
  it's **gold- AND run-length-agnostic**, so it's the cleanest cross-gem damage-output lens.
  Mark deviations off `dmg_per_hp_ratio_to_dealer_mean` with the same bands as
  `ratio_to_dealer_mean` (🔴 above ~2× or below ~0.4×, 🟡 ~1.5–2× or ~0.4–0.66×; null for
  support gems). When it and `ratio_to_dealer_mean` **disagree** — high damage_share but low
  DMG/HP, or vice-versa — call out the tension: it usually means the gem concentrates its
  damage on a few (high- or low-HP) waves rather than spreading it across the run.
- For a gem low in **both** `damage_share` and `kill_share` relative to its kit, say so
  plainly with the numbers — it's contributing little when kept. Whether that's a problem is
  the user's call (Step 4).
- **Derived support gems** (those in `gems.supportGems` — currently just opal; the set is
  derived from effect kinds, not hardcoded). For these, **don't** read damage_share as the
  headline. Lead instead, in this order:
  1. **`assisted_damage_share`** (from `gems.assist`, if present) — the support item's enabled
     damage as a share of the gem roster total, so you can put it *next to* dealers'
     `damage_share` and see whether it's pulling its weight on a comparable axis. Name its
     primary channel (opal → `atkspeed_assist`).
  2. **Keep-rate** (`keep_incidence` / `keep_share`) — a support gem the AI keeps despite ~0
     direct damage is earning its slot; that's a signal, not noise.
  3. **Presence-conditioning** (`gems.presenceConditioning`) — how the roster does in waves
     where it's on the board vs not (read with the loud confound caveat — it's correlational).
  Only if it's low on *all* of these is "weak" a defensible read — and even then, say which
  unmeasured value (slow/CC, path-denied) might still justify it. If `gems.assist` is absent
  (pre-instrumentation runs), say the assist axis isn't available yet and fall back to keep-rate
  + presence; do **not** infer weakness from its absence. Note: sapphire's slow is **not** in
  the support set (sapphire is a damage dealer) — its CC value is genuinely unmeasured, so its
  absence from damage findings is expected; state that and move on.

**Assist-deviation band (new — gems *and* combos).** When `assist` data is present, mark
assist outliers off **`ratio_to_support_median`** = a support item's `assisted_damage_share` ÷
the support-set median (the script computes both; `support_median_assisted_damage_share` is the
anchor). Mark 🔴 for a ratio above ~2× or below ~0.5×, 🟡 for ~1.5–2× or ~0.5–0.66×, with the
same disclaimer as every other marker — **deviation size, not "undesirable."** `bonus_gold` is
reported in **gold units** and is **not** folded into `assisted_damage` / the shares; report it
as its own line (e.g. "Red Crystal generated N gold over the run set"), never as a damage share.

### Special gems / combos (`combos.ts`)

Read `combos.perCombo[]` (already sorted by `build_rate`). Each carries `name` (the display
name from `combos.ts` — use it, never the raw key), `build_rate` (runs built in ÷ total
runs), `dmg_per_build`, and totals. **Note:** `built_runs` and `damage_runs` come from
different tables, so they won't match exactly (`damage_runs` counts runs where the combo
*dealt damage in a wave*; `built_runs` counts runs where it was *built*) — expected, not an
inconsistency.

How to describe:
- Report each combo's `build_rate` and `dmg_per_build` and show the distribution. Don't
  impose a hard "dead content" cutoff — describe where each sits (e.g. "built in 38% of runs,
  the lowest; mid-pack damage-per-build").
- **Also read `dmg_per_hp` (DMG/HP)** — the dashboard's `Dmg/HP` metric: the special's damage
  per unit of enemy HP that spawned, averaged across the waves it fought. It's
  **run-length-agnostic** (and, unlike `dmg_per_build`, doesn't depend on how the build cost was
  split), so it's the cleanest way to compare raw damage output *across specials*. Report it
  relative to the peer spread (e.g. "≈1.8× the median special's DMG/HP"), the same descriptive way
  as the other ratios. Low `dmg_per_hp` carries the same support/utility caveat as low
  `dmg_per_build` — name the kit reason from `combos.ts` before reading it as weak.
- Distinguish **availability** from **value**: a rarely-built combo may simply need
  high-quality inputs (check its recipe in `combos.ts`) rather than being unrewarding. Inspect
  the recipe and say which it looks like — but flag that distinguishing them with confidence
  may need the user's read on intent.
- Low damage-per-build is expected for support/utility combos (auras, air-grounding,
  prox-effects); name the mechanical reason from `combos.ts` rather than calling them weak.
- **Derived support combos** (those in the support set — currently Black Opal and Red Crystal;
  Void Opal is Black Opal's tier-1, same key). Treat them exactly like support gems: lead with
  **`assisted_damage_share`** from `combos.assist` (Black/Void Opal earn on `dmg_aura_assist` +
  `vuln_assist`; Red Crystal earns on `demote_air_assist` — damage landed by ground-only towers
  on creeps it grounded — alongside its direct damage), then **keep-rate**
  (`keep_incidence` / `keep_share`), then **`combos.presenceConditioning`** (correlational caveat).
  If `combos.assist` is absent (pre-instrumentation), say so and fall back to keep-rate + presence.
  Older runs (pre-migration 0008) won't have `demote_air_assist` on their rows; the channel
  reads as 0 there and the script handles the missing-column case.

#### Upgrade-tier ROI (`combos.tierRoi[]`)

`perCombo` treats a combo as one thing; this layer asks a sharper question: **is each
upgrade tier's gold worth the damage it buys?** Each combo has a base (tier 0, made by
combining gems — no gold) and gold-priced upgrades in `combos.ts` (`upgrades[].cost`,
e.g. Malachite → Vivid 25g → Mighty 280g). Damage is attributed to the tier a tower was
**at** when it dealt it, so the same tower feeds tier 0, then tier 1, then tier 2 as it
upgrades.

Read `combos.tierRoi[]`. The two gold metrics (both are per-tower, so combos with
different build rates stay comparable):
- **`cum_dmg_per_gold`** — total damage a tower deals from build through this tier ÷ total
  gold invested to reach it. The **headline** number. Null at base (no gold spent → base is
  reported on raw `dmg_per_build_at_tier` only).
- **`marginal_dmg_per_gold`** — that tier's own productivity ÷ the gold for **that** upgrade
  step. Isolates whether buying *this specific* tier pays off (a great combo can still have a
  weak final tier, or vice-versa).

Compare **only across structurally-comparable peers**. The naïve "compare every tier-1 row
against every other tier-1 row" is wrong: some combos *stop* at T1 (Ancient Paraiba,
Pharaoh's Gold, Uranium 235, Dark Emerald, …) — for them, T1 is the combo's full ceiling,
so their dmg/gold is structurally higher than any combo's intermediate T1 (Plasma Star,
Vivid Malachite, Frosted Silver, …) that leads to a stronger T2. Comparing a mid-step to
another combo's final inflates the perceived gap and produces phantom "below-median"
findings for combos that are actually fine.

The script handles this split for you. Use these fields and NOTHING else for cross-combo
deviation reads:

- **`peer_group`** — `"intermediate-t1"` | `"final-t1"` | `"final-t2"` | `null` at base.
- **`peer_group_median_cum_dmg_per_gold`** — median across structurally-comparable peers.
- **`ratio_to_peer_group_median`** — the honest comparison ratio. Mark 🔴 for above ~2× or
  below ~0.5×, 🟡 for ~1.5–2× or ~0.5–0.66×. null at base or when the peer group has < 2
  combos.

A practical consequence: a low `ratio_to_peer_group_median` on a final-tier upgrade is
*much* more concerning than the same ratio on an intermediate, because intermediates are
allowed to be modest stepping stones whose ceiling lives at T2. Never collapse the
distinction.

How to describe:
- Lead with the cross-combo outliers per peer group: "Among final-T1 upgrades, Ancient
  Paraiba's cum dmg/gold is 1.81× the final-T1 median, over N builds — its 400g upgrade
  buys far more damage per gold than the field." Always name the peer group explicitly so
  the reader knows the comparison is fair. Show the numbers and the build count
  (`builds_to_tier`); thin builds are a weak signal, say so.
- When `cum` and `marginal` **disagree**, surface it — e.g. a combo strong cumulatively but
  whose top tier is a poor marginal buy means "the early tiers carry it; the last upgrade is
  overpriced for what it adds." That split is the actionable part.
- A low ratio is **not automatically weak**: a splash/slow/utility combo (Silver) trades raw
  damage for crowd-control that isn't in damage telemetry — name that from `combos.ts` before
  reading a low dmg/gold as underpowered, exactly as for `dmg_per_build`. Whether any ROI gap
  is a problem is the user's call (Step 4).
- For a **derived support combo**, a tier that buys aura radius/pct/vuln shows up in
  **`assisted_damage`**, not in this tier's damage ROI — so read its low `dmg_per_gold`
  **alongside** its per-tier assist (e.g. Void Opal's 300g upgrade adds a vulnerability aura;
  that gold buys assist, not weapon damage). Don't call such a tier a weak buy on damage ROI alone.

### Creeps (`creeps.ts`)

Read `creeps.perKind[]` (sorted by `leak_rate`). Each carries `leak_rate`, its `group`
(air / boss / container / standard — derived from creep flags and whether it releases a
payload), `group_median_leak_rate`, and `ratio_to_group_median` (null when the group has only
one member, e.g. air/boss). The metric is **leak rate compared within the same `group`** —
that grouping is already done for you; state which group you're comparing inside:
- **standard** (shambler, skitter, carapace, chrysalid, burrower, mender, …): leak rate and
  path progress are directly comparable; `ratio_to_group_median` is the headline number.
- **air** (shrike): only air-capable gems hit it, so a high leak rate may reflect the roster's
  anti-air coverage rather than the creep's tuning — say so; don't pin it on the creep alone.
  (Single-member group → null ratio; compare descriptively against standard runners instead.)
- **container** (vessel, coral, gazer, anemone, gestation): slow and high-HP by design; the
  threat is the payload they release. Don't describe low speed or high HP as an outlier — look
  at whether they or their children leak unusually.
- **disruptors / regenerators** (mender, burrower, etc. — these sit in `standard` by flags):
  their effect is indirect (healing, regen); also judge their influence through the waves they
  appear in (see Waves), not their leak rate alone.

Describe the deviation with the numbers the script gives (e.g. "chrysalid `leak_rate` 0.041
vs standard `group_median` 0.014 → 2.9×, over 34k spawns"). Mark 🔴 for a large within-group
deviation (very high or near-zero leak rate over many spawns), 🟡 for moderate. **Single-member
groups (air, boss) have a null ratio — there is no peer to deviate from, so don't assign a 🔴/🟡
marker to them.** Report them descriptively on absolute leak rate with the caveat that they
stand alone (air = roster anti-air question; boss = milestone-wave creep). Attribute, then
stop — whether a standout creep is an intended threat or an accident is the user's call.

### Waves (`waves.ts`)

Read `waves.perWave[]`. Each wave carries `death_rate` (`deaths/reached`), `avg_leaks`, their
neighbor averages, the guarded ratios `leak_ratio_to_neighbors` / `death_ratio_to_neighbors`
(**null** when the neighbor anchor is ~0 — the script already protects you from divide-by-zero
and exploding ratios), `neighbor_near_zero`, `thin_sample`, and `top_leak_creeps[]` (the kinds
that leaked most that wave). The signal is a **local deviation from neighbors**, not absolute
level — ignore the natural upward trend and look for waves out of step with W-1 and W+1.

When a ratio is null or `neighbor_near_zero` is true, lead with the **absolute** numbers
(`avg_leaks`, `death_rate`, `top_leak_creeps`) and say the ratio is unstable because a neighbor
is near-zero — never report a giant multiplier as a clean spike. Use `top_leak_creeps` to
attribute a spike, then open `waves.ts` for that wave's group composition (counts, HP, armor,
payload tree) to ground the finding. Mark 🔴 for a large, well-supported deviation; 🟡 for a
milder or `thin_sample` one. Troughs (a wave far softer than both neighbors) are equally valid
observations — report them the same way.

### Deep-run keeper composition (`winning-runs-query.ts` output)

This is the highest-signal cross-cut available: **which keepers do progressively-deeper-run
cohorts share?** Read the JSON from `winning-runs-query.ts`. Each cohort lists every
(combo_key, max_tier) and bare gem with its presence rate. Compute the **lift** = (W50
cohort presence rate ÷ All-runs presence rate) for each combo+tier and each gem.

**Why this signal is legitimate at the cohort level.** Same logic as the Wave-1 carve-out:
every cohort is driven by the SAME AI, so the AI's weakness cancels out and the *relative
difference between cohorts* is the valid signal. Report the deep-run-conditioned presence
rates and the lift ratio; do NOT report absolute "% of all runs that win." Absolute win
rate stays an invalid signal because the AI is weaker than human play.

How to describe:
- **Top finding.** Identify the combo+tier with the largest lift. A lift of **2× or more**
  in the W50 cohort vs All-runs is structurally significant — that keeper is over-represented
  in deep-run boards. A lift of **5×+ at W50-cohort presence near-100%** is the strongest
  signal: that keeper is *effectively mandatory* for winning. Frame the finding as a fact
  about cohort composition, not a verdict ("X% of W50-cohort runs kept Y" — let the user
  decide whether the dependence is intended or accidental).
- **Cluster reads.** Group combos by mechanic family (armor-shred, damage-aura, splash,
  single-target). If an entire mechanical lane appears in 60%+ of the W50 cohort, surface
  it as a bottleneck pattern: "armor-shred coverage (Paraiba + Uranium + Gold) is in 64–99%
  of the W50 cohort vs 22–27% of all runs."
- **Wave-1 starter sanity check.** Look at the three Wave-1 starter T2s (Mighty Malachite,
  Silver Knight, Pyroclast) in the W50 cohort. If their lifts are ≈ 1.0× (no association
  with deep runs), that's a real observation: which starter you build into doesn't predict
  victory. Combined with `waveOneChoice.deltas` near-zero, this confirms the starter choice
  is fair on average.
- **Cohort size honesty.** The W50 cohort is small (single-digit % of total runs). Lift
  ratios have wide confidence intervals at this sample size; treat the 2×+ band as the
  threshold for "worth talking about" and don't read precision into a 1.4× vs 1.6× lift.
- **Not a marginal-value claim.** Same correlational caveat as `presenceConditioning`: a
  keeper appearing in 70% of deep-run boards doesn't *prove* it caused those runs to reach
  deep — better boards keep more towers in general. The only clean marginal-value test is a
  leave-one-out sim, out of scope here.
- **AI-bias caveat for specific keepers.** The four armor-shred combos (build-time bonus
  from wave 20+, Paraiba preferred) and Paraiba/Black-Opal max-tier presence (upgrade-order
  policy) all carry hardcoded AI biases — see the "HeuristicAI has
  hardcoded build/upgrade biases" bullet in Scope. When their W50-cohort lift is high, name
  the bias as a candidate explanation alongside genuine strength; don't read elevated lift as
  pure "deep runs need this." Paraiba in particular will outrank Gold/Uranium/Ametrine within
  the shred cluster for policy reasons, not just strength.

Sample-size guard: do not analyze cohorts below ~50 runs; flag as `thin_sample` and skip.
At full sample (typical runs >= a few thousand), the W50 cohort is ~5–7% of total runs.

This subsection's findings often surface the **single most actionable item in the entire
report** (a near-mandatory keeper, a missing alternate path). It belongs near the top of
Step 3's report when present.

### Wave-1 starter choice — Malachite / Silver / Pyrite (`waveOneChoice`)

On wave 1 the game forces the player toward **one** of three early specials by guaranteeing its
ingredients (`BuildPhase.rollDraws`): **Malachite** (opal/emerald/topaz), **Silver**
(sapphire/garnet/diamond), or **Pyrite** (peridot/spinel/aquamarine). Every run is in exactly
one cohort. The script recovers the offer from the run's **wave-1 keeper event** — its
`combo_key` directly records which special was kept (older runs without per-wave keeper events
fall back to the kept gem's recipe) — and splits all runs into the three cohorts (`detector`
names the rule; `unassigned` should be ~0 — if it isn't, say so, the split is leaky).

**Why absolute wave-reached is allowed *here* (the one carve-out).** Everywhere else this
skill forbids absolute wave-reached, because the sim AI is weaker than a human so the absolute
level is meaningless. This comparison is different: **all cohorts are driven by the same AI**,
so the AI's weakness cancels out and the *relative gaps between cohorts* are valid signals.
Report the **deltas**, never the absolute level as a difficulty claim. (`avg_wave` per cohort
is shown only so the reader can see where the deltas come from — frame it as "Silver reaches
+2.1 waves further than Malachite," not "runs reach wave 35.")

Read `waveOneChoice`:
- **The gaps.** `deltas` contains pairwise `<b>_minus_<a>_avg_wave` values (positive → b gets
  further). Show each cohort's `avg_wave` / `median_wave` and spread (`q1_wave`, `q3_wave`,
  `max_wave`). Report median alongside mean — if they disagree the distribution is skewed. State
  all cohort sizes; a lopsided split is itself worth a line.
- **Where each choice struggles.** Walk `perWave[]`: for each wave, all three cohorts'
  `death_rate` and `avg_leaks` side by side. Find the waves where one cohort's death-rate or
  leaks clearly exceed the others (respect `thin_sample` / `reached` counts — late waves thin
  out fast). This is the *mechanism* behind the headline gaps: "Pyrite dies more around waves
  10–12 but pulls ahead later," etc. Tie a divergence to what's spawning then (open `waves.ts`)
  and to each special's kit (`combos.ts`: Malachite = multi-target, Silver = splash + slow,
  Pyrite = momentum ramp) — that's what makes the finding actionable.
- Keep it **descriptive**. That one choice outperforms another is an observation, not a verdict
  that the weaker one needs buffing — whether the gap is intended (a deliberate risk/reward fork)
  or a balance problem is the user's call (Step 4).

## Step 3 — Present observations (factual layer)

Lead with provenance, then the four sections. This first pass is **observations only** — what
stands out and how you know. Use this structure:

```
## Balance Observations — HeuristicAI, <N> runs @ v<version>

<1–2 sentences: the most prominent deviations, stated descriptively. No verdicts.>

Legend: 🔴 large deviation from peers · 🟡 moderate deviation. Markers measure how far an
item sits from its comparison group — not a judgment that it is undesirable.

### Gems
🔴 <Gem> — <damage_share / ratio_to_dealer_mean + dmg_per_hp (DMG/HP) ratio> · <how computed / compared> · <kit-based reason it looks this way> · <sample size if relevant>
<Support gem> — assisted_damage_share <X> (<ratio_to_support_median>×) · keep_incidence <Y> · presence Δ <Z> · <primary assist channel> (omit the assist clause if assist data absent)

### Special Gems
🟡 <Combo display name> — <build rate, dmg/build, dmg/hp (DMG/HP), recipe note> · <availability-vs-value read>
<Support combo> — assisted_damage_share <X> (channels) · keep_incidence <Y> · bonus_gold <G> gold · presence Δ <Z>

**Upgrade-tier ROI** (damage per gold, compared only within structurally-comparable peer groups: intermediate-t1 vs other intermediate-t1, final-t1+final-t2 each within themselves):
🔴 <Combo, tier name> — <cum_dmg_per_gold vs PEER GROUP median → ratio_to_peer_group_median, over N builds> · <name the peer group: intermediate-t1 / final-t1 / final-t2> · <marginal note if it disagrees> · <kit reason if low ROI is utility>

### Deep-run keeper composition (`winning-runs-query.ts`)
Cohort sizes: All <n> · Beat W30 <n> · Beat W40 <n> · Beat W45 <n> · Made W50 <n>
🔴 <Combo, tier name> — All-runs <X%>, W50 <Y%> (<lift>× lift) · <kit mechanic / role>
<Repeat for each combo+tier with W50/All-runs lift ≥ 2× or W50 presence ≥ 60%>
Cluster reads: <mechanical-family pattern, e.g. "armor-shred trio (A/B/C) appears in 60-99% of W50 cohort">
Starter sanity: Wave-1 starter T2s (Mighty Malachite/Silver Knight/Pyroclast) lift ≈ <ratios> — <"interchangeable" or "one dominates">

### Creeps
🔴 <Creep> — <leak rate vs named same-archetype peers, over N spawns>

### Waves
🔴 Wave <N> — <death rate & avg leaks, absolute + vs-neighbor (guarded)> · <creep attribution> · <composition from waves.ts>

### Wave-1 Choice (Malachite / Silver / Pyrite)
Cohorts: Malachite <n>, Silver <n>, Pyrite <n> (by forced starter offer; unassigned <n>).
Gaps: <pairwise deltas, e.g. Silver +2.1 over Malachite, Pyrite +0.5 over Malachite> — relative, same AI all sides.
Where it diverges: <wave range> <which cohort> <death_rate / leaks vs the others> · <kit / waves.ts tie-in>

---
Basis: HeuristicAI sim runs only (weaker than human play); all findings are relative outliers,
not a difficulty assessment. Markers = deviation size, not desirability. Low-sample items noted inline.
The Wave-1 Choice gaps are between-cohort deltas (valid because all cohorts share the AI); their absolute
wave numbers are not a difficulty claim.
```

Rules: every finding shows its supporting numbers; order each section 🔴 before 🟡; if a domain
has no notable deviations, say so in one line (a clean domain is a real result). Keep it scannable.

This report is the shared reference for the interview that follows — after presenting it, move
into Step 4 and walk the findings one at a time. (If the user explicitly asked only for
observations and no decisions, stop here and skip the interview.)

## Step 4 — Walk the findings one at a time (the interview)

The report told the user *what stands out*. This step turns each notable finding into a
decision: **is this the intended design, or do you want to change it — and if so, how?**
Walking findings one at a time (rather than firing a batch of intent questions) keeps each
decision in its own context, with that finding's numbers and kit fresh, so the user is never
choosing in the abstract. The keep-or-change question *is* the intent check the skill used to
batch — anchoring it to a single finding with its numbers in view makes the answer grounded,
not guessed.

**Which findings to walk.** Every 🔴 and 🟡 from the report — across all four domains plus the
Wave-1 choice. Order by salience: 🔴 before 🟡, and within that follow the report's section
order (Gems → Special Gems → Creeps → Waves → Wave-1). Before the first question, tell the user
how many findings you'll walk and that they can stop at any point — an interview with no exit is
worse than none. If a domain was clean, there's simply nothing to walk there; say so and move on.

**Ask strictly serially — one finding at a time.** Issue exactly **one** `AskUserQuestion`
call, wait for its answer, record it, and only then ask about the next finding. **Never** batch
multiple findings into one call or fire several `AskUserQuestion` calls in the same turn — even
though they're independent, parallel questions bury the user and make the interview unusable.
The "change it" follow-up (the lever question) is also its own separate call, asked only after
the keep/change answer comes back. One question on screen at any moment, always.

**The two-question shape per finding.** Use **AskUserQuestion**. First, the keep/change decision:

- Restate the finding in one line *inside the question header/text* — the numbers and the
  kit-based reason — so the user isn't scrolling back to the report to answer.
- Options:
  - **"Intended — leave it"** — the deviation is by design; nothing to do.
  - **"Change it"** — something should move.
  - (Add a third concrete option when one is natural, e.g. *"Not sure — explain more"*; the
    user can always use "Other" to say *stop the interview here* or ask a question.)
- A **leave-it is a real outcome**, not a dead end: it confirms intent and is worth recording.
  Record it and move straight to the next finding with no second question.

If they choose **change it**, immediately ask the second question — **which lever?** Options must
be concrete, each naming a *direction* (buff/nerf and roughly where), drawn from the item's kit
and the data file that actually holds the lever. When you have a confident read, make your
recommended lever the **first** option and append "(Recommended)". Leave "Other" for a lever you
didn't list. Build the options from this menu — pick the 2–4 that genuinely fit the finding:

| Domain (file holding the lever) | Typical levers (direction depends on whether it's over/under) |
|---|---|
| **Gem** (`gems.ts`) | damage scaling for a quality band · range · attack speed · effect potency (slow %, poison dps, splash radius, crit chance/mult) — and *which quality* moves |
| **Support gem / combo** (`gems.ts` / `combos.ts`) | aura `radius` / `pct` (`aura_atkspeed`, `aura_dmg`) · vulnerability `pct` (`vulnerability_aura`) · armor-reduction `value` (`prox_armor_reduce` / `armor_reduce` / `stacking_armor_reduce` / `armor_decay_aura`) · `bonus_gold` `chance` / `multiplier` · `demote_air` `everyN` — and *which quality / upgrade tier* moves. Use when an `assist`/keep/presence finding (not a damage finding) becomes a "change it" |
| **Special gem / combo** (`combos.ts`) | base stats · re-price a specific upgrade tier's `cost` · a tier's stats · the recipe (input quality → how easily it's built) |
| **Creep** (`creeps.ts`) | `hpMult` · `speed` · `armor` · its count in the waves it appears in (`waves.ts`) |
| **Wave** (`waves.ts`) | creep counts · which kinds spawn · HP/armor of that wave's pack · payload tree — or, instead of touching the wave, buff/nerf a *counter* gem elsewhere |
| **Wave-1 choice** (`combos.ts` / `BuildPhase`) | buff the weaker starter's stats/recipe · nerf the stronger · or change the wave-1 forced offer itself |

When you genuinely can't reduce a finding to a confident lever, say so in the question and offer
a *"help me think it through"* option rather than inventing a false-precision one.

**Record as you go; don't edit yet.** Keep a running ledger: finding → keep / change → chosen
lever + direction + rough magnitude + exact file. Hold all edits for Step 5. Collecting the full
set first lets the user see decisions in relation to each other before anything lands, and avoids
half-applied changes if they stop the interview early.

## Step 5 — Summarize decisions and offer to apply

When the walk is done (or the user stops early), present the full ledger:

```
## Interview decisions — <N> findings reviewed

Leaving as-is (intended): <finding>, <finding>, …
Changing:
- <Finding> → <file>: <lever, direction, rough magnitude> — assumption: <the intent it rests on>
- …
Undecided: <finding> — <what you still need from the user to advise>
```

Each "Changing" row keeps the discipline the skill has always required: the **assumption** it
rests on, the **deduction** from observation → lever, and the **specific lever, file, and
direction**. If a finding never reduced to a confident lever, leave it under "Undecided" and say
what would resolve it — don't manufacture a change.

Then **offer to apply** the changes — never apply unprompted. Editing a data file is a real,
balance-affecting action, so it waits for an explicit yes *here* even though the user already
signaled intent during the interview: intent to change is not approval of a specific diff. When
they confirm:

- Make the edits to the named data files (`gems.ts` / `combos.ts` / `creeps.ts` / `waves.ts`),
  touching only the levers agreed in the ledger.
- **Confirm the lever actually moves the number before editing.** A combo's damage may come from
  an *effect* (`prox_burn` dps, `poison` dps, `eruption`) while `dmgMin/dmgMax` are 0 — trimming
  the weapon stats would do nothing. Read the kit and edit the field that produced the telemetry.
- **Round to clean values.** When a percentage change yields an ugly number, round to a tidy one
  (creep `hp` to the nearest 100 is a good default; costs/damage to sensible round figures) so the
  data files stay readable — unless the user asked for the exact computed value.
- These changes are balance-affecting by definition. Per the repo's rules, update
  `tests/balance.test.ts` if the change crosses a threshold it asserts, and **call out which
  threshold moved and why** — don't bury it in the diff.
- Offer **`/sim-compare`** to validate the change set (don't run it unprompted — it's slow).
- Offer **`/release`** for the version bump + changelog once the change is ready to ship.

If they decline to apply, the ledger *is* the deliverable — a complete, self-contained change
plan they can act on whenever they like.
