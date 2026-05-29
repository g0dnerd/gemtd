---
name: balance-observations
description: >-
  Analyze local sim-run telemetry to surface gem, special-gem (combo), creep,
  and wave BALANCE OUTLIERS in the GemTD project — which items stand out from
  their peers. Use this whenever the user asks for balance observations, balance
  analysis, what's over/underpowered, which gems/creeps/waves are outliers, or to
  "look at the telemetry / sim data for balance." Reads `.local/telemetry.db`
  directly (HeuristicAI sim runs at the current game version). It explains every
  deduction in full, makes NO assumptions about a target/desirable balance state
  the user hasn't confirmed, and asks the user (AskUserQuestion) before drawing
  evaluative conclusions when intent is unconfirmed. Does NOT judge overall
  difficulty and does NOT edit data files.
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
   recommending anything. Prefer asking over guessing. See "Step 4" for how to batch this.

The severity markers 🔴/🟡 in the report mean **how large the deviation from peers is**
(🔴 = large, 🟡 = moderate) — a measure of how far the outlier sits from the pack, NOT a
claim that it is undesirable. Say this in the report so the reader doesn't read red as "bad."

## Scope (what the data can and can't tell you)

- **Relative only.** The sim AI (HeuristicAI) is weaker than a skilled human, so absolute
  win rate, absolute wave-reached, and "the game is too hard/easy" are **not valid
  signals** — never report them. Every observation is item-vs-comparable-items or
  wave-vs-adjacent-waves; relative structure survives the AI's weakness, absolute outcomes
  don't.
- **Only what's deployed.** Analyze only the gems / combos / creeps that actually appear
  in the script output. The codebase defines content that the current wave list may never
  spawn (e.g. some creep kinds). If a defined type is absent from the data, you may note it
  in one line as "currently not deployed in waves 1–50," but do not analyze its balance —
  there's nothing to analyze.

## Step 1 — Check data freshness (do this first, always)

The analysis is only meaningful on sim runs that match the **current game version** and
use **HeuristicAI** (the canonical balance evaluator). Run the bundled query script from
the repo root:

```bash
npx tsx .claude/skills/balance-observations/scripts/query-telemetry.ts
```

It reads the current version from `package.json` and targets
`mode='sim' AND ai='HeuristicAI' AND version=<current> AND wave_reached > 1`. Inspect the
JSON it prints:

- `ok: false, reason: "no-db"` → the DB doesn't exist yet.
- `ok: false, reason: "no-runs-for-target"` → DB exists but has no HeuristicAI sim runs at
  the current version. The `inventory` array shows which `(version, ai)` buckets DO have
  data — use it to tell the user whether they have stale data from an older version.
- `ok: true` → `targetRunCount` runs are available; the full analysis is included.

**This script is the only command you need to run.** It does all the extraction *and* the
derived math (shares, ratios, leak rates, guarded wave comparisons, creep attribution) and
prints one JSON blob. Read that JSON and reason over it directly — do **not** write inline
`python`/`jq`/`node -e` to parse or recompute it (the values are already there, and ad-hoc
scripts trigger approval prompts for no benefit). The blob is sizeable (tens of KB for a full
run set), so it's normally persisted to a file rather than shown inline — that's expected;
just Read the persisted file. When you need a gem/combo/creep's kit or a wave's composition
for context, **Read** the data file (`gems.ts`, `combos.ts`, `creeps.ts`, `waves.ts`) — prefer
the Read tool over `grep`/`head`, per the repo's conventions. The key output fields (a few
extra raw fields also appear; these are the ones you'll use):

```
overview            { runs, avg_wave, max_wave, victories }
gems.dealerMeanDamageShare, gems.supportGems
gems.perGem[]       { gem, isSupport, total_damage, total_kills, damage_share, kill_share,
                      ratio_to_dealer_mean }      // ratio null for support gems
combos.perCombo[]   { key, name, built, built_runs, build_rate, total_damage, total_kills,
                      damage_runs, dmg_per_build } // sorted by build_rate desc
creeps.perKind[]    { kind, group(air|boss|container|standard), deployed, spawned, kills,
                      leaks, leak_rate, avg_progress, avg_ticks_to_kill, speed, hpMult,
                      group_size, group_median_leak_rate, ratio_to_group_median }
                      // ratio null when group_size < 2 (e.g. air, boss); sorted by leak_rate desc
waves.perWave[]     { wave, reached, samples, deaths, death_rate, avg_leaks, avg_damage,
                      thin_sample, neighbor_avg_leaks, neighbor_avg_death_rate,
                      leak_ratio_to_neighbors, death_ratio_to_neighbors, neighbor_near_zero,
                      top_leak_creeps[] }          // ratios null when the neighbor anchor is ~0
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
data is a caveat you must surface, not hide.

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
signal of raw strength and how often the AI keeps it. (Sim telemetry records no keeper
choices, so there's no separate "kept" field.)

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
| opal | **support aura (attack-speed buff)** — deals no direct damage; near-zero damage share is mechanically inevitable, not an outlier |

How to describe (the deviation, with its size):
- Use `ratio_to_dealer_mean`. Mark 🔴 for a ratio above ~2× or below ~0.4×, 🟡 for ~1.5–2× or
  ~0.4–0.66×. Say you excluded the support gem(s) from the mean and why.
- For a gem low in **both** `damage_share` and `kill_share` relative to its kit, say so
  plainly with the numbers — it's contributing little when kept. Whether that's a problem is
  the user's call (Step 4).
- CC/support gems (sapphire's slow, opal's aura) won't appear as damage outliers; their value
  isn't in damage telemetry. State that their absence from damage findings is expected and
  move on — do not infer they're weak.

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
- Distinguish **availability** from **value**: a rarely-built combo may simply need
  high-quality inputs (check its recipe in `combos.ts`) rather than being unrewarding. Inspect
  the recipe and say which it looks like — but flag that distinguishing them with confidence
  may need the user's read on intent.
- Low damage-per-build is expected for support/utility combos (auras, air-grounding,
  prox-effects); name the mechanical reason from `combos.ts` rather than calling them weak.

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

## Step 3 — Present observations (factual layer)

Lead with provenance, then the four sections. This first pass is **observations only** — what
stands out and how you know. Use this structure:

```
## Balance Observations — HeuristicAI, <N> runs @ v<version>

<1–2 sentences: the most prominent deviations, stated descriptively. No verdicts.>

Legend: 🔴 large deviation from peers · 🟡 moderate deviation. Markers measure how far an
item sits from its comparison group — not a judgment that it is undesirable.

### Gems
🔴 <Gem> — <the numbers> · <how computed / compared> · <kit-based reason it looks this way> · <sample size if relevant>

### Special Gems
🟡 <Combo display name> — <build rate, dmg/build, recipe note> · <availability-vs-value read>

### Creeps
🔴 <Creep> — <leak rate vs named same-archetype peers, over N spawns>

### Waves
🔴 Wave <N> — <death rate & avg leaks, absolute + vs-neighbor (guarded)> · <creep attribution> · <composition from waves.ts>

---
Basis: HeuristicAI sim runs only (weaker than human play); all findings are relative outliers,
not a difficulty assessment. Markers = deviation size, not desirability. Low-sample items noted inline.
```

Rules: every finding shows its supporting numbers; order each section 🔴 before 🟡; if a domain
has no notable deviations, say so in one line (a clean domain is a real result). Keep it scannable.

## Step 4 — Ask about intent, then advise (only after observations)

After the observations, decide which findings could warrant a change. A recommendation is only
honest if you know the intended design — and you usually don't. So:

- **If the user's request already stated the goal** (e.g. "find gems that are too dominant",
  "I want a smooth curve"), apply that goal, and state that you're applying it.
- **Otherwise, ask before recommending.** Use **AskUserQuestion** to confirm intent for the
  findings where it's the crux. Batch the most consequential ones into a single call (the tool
  allows up to 4 questions). Frame each around the observation and the design fork, e.g.:
  *"Chrysalid's leak rate is ~2.9× its standard-group median (0.041 vs 0.014). Is that its
  intended role (a deliberate standout mid-game threat), or should it sit closer to the other
  runners?"* — with options like "Intended — leave it", "Should be reined in", etc. If more than ~4 findings need intent, ask
  about the top ones and list the rest as "intent unconfirmed — tell me the goal and I'll advise."

Only **after** intent is established do you give a recommendation, and each recommendation must:
- **Name the assumption it rests on** ("Given you want chrysalid in line with its archetype…").
- **Explain the deduction** from observation → lever, in full.
- **Name the specific lever and direction**: which gem/quality damage or effect scaling in
  `gems.ts`, which combo recipe/stats/upgrade cost in `combos.ts`, which creep `hpMult`/`speed`/
  `armor` in `creeps.ts`, or which wave's composition in `waves.ts`, and roughly how much.
- Stay a **suggestion** — never edit data files unless the user explicitly asks.

If you genuinely can't reduce a finding to a confident lever even after intent is clear, say so
and ask a follow-up rather than guessing.

Since these touch balance-affecting data, you may offer `/sim-compare` to validate any change the
user decides to make — but don't run it unprompted.
