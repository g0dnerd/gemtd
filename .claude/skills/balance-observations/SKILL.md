---
name: balance-observations
description: >-
  Analyze local sim-run telemetry to surface gem, special-gem (combo), creep,
  and wave BALANCE OUTLIERS in the GemTD project — which items stand out from
  their peers. Use this whenever the user asks for balance observations, balance
  analysis, what's over/underpowered, which gems/creeps/waves are outliers, which
  special-gem UPGRADE TIERS are worth their gold (damage-per-gold ROI), or about the
  WAVE-1 STARTER CHOICE (Malachite vs Silver) and its impact on how far runs get.
  Also use for "look at the telemetry / sim data for balance," and whenever the user
  wants to be WALKED THROUGH the findings, decide what (if anything) to change, or
  "help me decide what to tune." Reads `.local/telemetry.db` directly (HeuristicAI sim
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
  two cohorts that share the same AI* (Malachite-offered vs Silver-offered), so their relative
  gap is valid — report the delta, never the absolute level. See "Wave-1 starter choice" in Step 2.
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
combos.tierRoi[]    { combo_key, name, tier, tier_name, runs, total_damage, total_kills,
                      builds_to_tier, dmg_per_build_at_tier, marginal_gold, cum_gold,
                      marginal_dmg_per_gold, cum_dmg_per_gold, tier_group_size,
                      tier_median_cum_dmg_per_gold, ratio_to_tier_median }
                      // ROI fields null at base (tier 0, no gold); ratio null if tier has <2 combos.
                      // sorted by tier asc, then cum_dmg_per_gold desc
waveOneChoice       { detector, unassigned, silver_minus_malachite_avg_wave,
                      cohorts.{malachite,silver}.{runs,avg_wave,median_wave,q1_wave,q3_wave,
                                                   max_wave,victories},
                      perWave[]{ wave, malachite{reached,deaths,death_rate,avg_leaks,thin_sample},
                                       silver{...} } }
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
signal of raw strength and how often the AI keeps it. (Sim telemetry now records per-wave
keeper events, but this skill doesn't yet break out a separate keep-rate, so continue to read
share as that combined signal.)

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

Compare **across combos within the same tier** — gold scales differ between tiers, so a
tier-1 number isn't comparable to a tier-2 number. The script does this grouping for you:
`ratio_to_tier_median` is each row's `cum_dmg_per_gold` ÷ the median across all combos at
that tier (null at base, or when a tier has only one combo). Mark 🔴 for a ratio above ~2×
or below ~0.5×, 🟡 for ~1.5–2× or ~0.5–0.66×.

How to describe:
- Lead with the cross-combo outliers per tier: "At tier 1, Uranium's cum dmg/gold is 2.81×
  the tier-1 median (raw vs median), over N builds — its 165g upgrade buys far more damage
  per gold than the field." Show the numbers and the build count (`builds_to_tier`); thin
  builds are a weak signal, say so.
- When `cum` and `marginal` **disagree**, surface it — e.g. a combo strong cumulatively but
  whose top tier is a poor marginal buy means "the early tiers carry it; the last upgrade is
  overpriced for what it adds." That split is the actionable part.
- A low ratio is **not automatically weak**: a splash/slow/utility combo (Silver) trades raw
  damage for crowd-control that isn't in damage telemetry — name that from `combos.ts` before
  reading a low dmg/gold as underpowered, exactly as for `dmg_per_build`. Whether any ROI gap
  is a problem is the user's call (Step 4).

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

### Wave-1 starter choice — Malachite vs Silver (`waveOneChoice`)

On wave 1 the game forces the player toward **one** of two early specials by guaranteeing its
ingredients (`BuildPhase.rollDraws`): **Malachite** (opal/emerald/aquamarine) or **Silver**
(topaz/diamond/sapphire). Every run is in exactly one cohort. The script recovers the offer
from the run's **wave-1 keeper event** — its `combo_key` directly records which special was
kept (older runs without per-wave keeper events fall back to the kept gem's recipe) — and
splits all runs into the two cohorts (`detector` names the rule; `unassigned` should be ~0 —
if it isn't, say so, the split is leaky).

**Why absolute wave-reached is allowed *here* (the one carve-out).** Everywhere else this
skill forbids absolute wave-reached, because the sim AI is weaker than a human so the absolute
level is meaningless. This comparison is different: **both cohorts are driven by the same AI**,
so the AI's weakness cancels out and the *relative gap between the two cohorts* is a valid
signal. Report the **delta**, never the absolute level as a difficulty claim. (`avg_wave` per
cohort is shown only so the reader can see where the delta comes from — frame it as "Silver
reaches +2.1 waves further than Malachite," not "runs reach wave 35.")

Read `waveOneChoice`:
- **The gap.** `silver_minus_malachite_avg_wave` (positive → Silver gets further) plus each
  cohort's `avg_wave` / `median_wave` and the spread (`q1_wave`, `q3_wave`, `max_wave`). Report
  median alongside mean — if they disagree the distribution is skewed. State both cohort sizes;
  a lopsided split (e.g. 165 vs 135) is itself worth a line.
- **Where each choice struggles.** Walk `perWave[]`: for each wave, both cohorts' `death_rate`
  and `avg_leaks` side by side. Find the waves where one cohort's death-rate or leaks clearly
  exceed the other's (respect `thin_sample` / `reached` counts — late waves thin out fast). This
  is the *mechanism* behind the headline gap: "Silver dies more around waves 20–22 (dr 0.09 vs
  0.02) but pulls ahead later," or "Malachite leaks more from wave 24 on." Tie a divergence to
  what's spawning then (open `waves.ts`) and to each special's kit (`combos.ts`: Malachite =
  multi-target, Silver = splash + slow) — that's what makes the finding actionable.
- Keep it **descriptive**. That one choice outperforms the other is an observation, not a
  verdict that the weaker one needs buffing — whether the gap is intended (a deliberate
  risk/reward fork) or a balance problem is the user's call (Step 4).

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

**Upgrade-tier ROI** (damage per gold, compared across combos within each tier):
🔴 <Combo, tier name> — <cum_dmg_per_gold vs tier median → ratio, over N builds> · <marginal note if it disagrees> · <kit reason if low ROI is utility>

### Creeps
🔴 <Creep> — <leak rate vs named same-archetype peers, over N spawns>

### Waves
🔴 Wave <N> — <death rate & avg leaks, absolute + vs-neighbor (guarded)> · <creep attribution> · <composition from waves.ts>

### Wave-1 Choice (Malachite vs Silver)
Cohorts: Malachite <n>, Silver <n> (by forced starter offer; unassigned <n>).
Gap: <Silver/Malachite> reaches +<Δ> waves on average (median <m> vs <m>) — relative, same AI both sides.
Where it diverges: <wave range> <which cohort> <death_rate / leaks vs the other> · <kit / waves.ts tie-in>

---
Basis: HeuristicAI sim runs only (weaker than human play); all findings are relative outliers,
not a difficulty assessment. Markers = deviation size, not desirability. Low-sample items noted inline.
The Wave-1 Choice gap is a between-cohort delta (valid because both cohorts share the AI); its absolute
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
