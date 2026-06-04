# Instrument `demote_air` in telemetry

## Why

Red Crystal's headline mechanic is `demote_air` (every Nth hit grounds an air
creep so ground-only towers can hit it). It is currently the only assist channel
the balance-observations skill cannot measure. In `combos.assist` the entry for
Red Crystal shows `assisted_damage` and all assist channels at `0`, even though
the mechanic visibly fires every game. As a result:

- The skill cannot judge whether Red Crystal earns its slot. We fall back to
  keep-rate + presence (`keep_incidence` 0.577 in the v2.0.0 data set), which
  conflates "the AI keeps it" with "it is mechanically valuable."
- Any future Red Crystal balance change (cost, tier kit, `everyN` cadence)
  cannot be validated against sim runs — we only see the dmg-per-build row,
  which is a tiny fraction of its real contribution.
- The skill's report has to explicitly say "Red Crystal's air-grounding value
  is **unmeasured**" every time it appears, which dampens any finding that
  involves it.

Closing this gap turns Red Crystal into a first-class citizen in the assist
data alongside `dmg_aura_assist`, `vuln_assist`, `armor_shred_assist`,
`atkspeed_assist`.

## What to measure (design decision needed FIRST)

Demoting an air creep is *enabling*, not damaging. There are two reasonable
attribution rules. Pick one before writing code.

**Option A — downstream damage credit.** A creep that was demoted by Red
Crystal at tick T continues taking damage from ground-only towers
(diamond, garnet, sapphire-on-ground, etc.). Credit all damage that
*would not have landed* without the demotion back to the Red Crystal that
demoted it, until the creep dies or leaks.

- Pros: Same unit as other assist channels (raw damage). Sits next to
  `dmg_aura_assist` / `vuln_assist` cleanly in `assisted_damage_share`.
- Cons: Requires marking each demoted creep with the source tower id and
  filtering "ground-only-tower damage taken while flag is removed." A
  creep can be re-demoted multiple times (Red Crystal Facet `everyN: 11`,
  Rose Quartz `everyN: 10`) — pick the most recent demoter, or split
  credit evenly? Recommend "most recent demoter" (mirrors `armorDebuff.ownerId`).
- Edge case: ground-capable gems (amethyst, ruby with air_bonus, etc.) still
  hit air creeps. Damage from those is **not** demote-enabled — only count
  damage from gems whose `targeting === "ground"` or whose effect is
  ground-only.

**Option B — event count.** Just count demote events per tower per run/wave.
Report a derived `demote_events`. The skill consumes it as "Red Crystal
demoted air creeps N times this run, N×presence-rate as a separate axis."

- Pros: Trivial to instrument. Always-correct. Doesn't require the
  ground-only-damage filter.
- Cons: Different unit from other assist channels (events, not damage),
  so it cannot live in `assisted_damage_share`. Becomes its own column,
  outside the assist-share comparison. The skill has to explain the unit
  every time.

**Recommendation: Option A.** It puts Red Crystal on the same axis as the
other supports, which is what the skill's `assisted_damage_share` was
designed for. Option B leaves the "is it pulling its weight on a comparable
axis?" question unanswered.

If A is too expensive, fall back to a hybrid: ship Option B first (one wave),
then upgrade to Option A once attribution is settled. The schema can carry
both.

## Files to touch (Option A path)

Assuming Option A. If the user picks B, only steps 1, 2, 3, 5 change shape;
step 4 (Combat damage attribution) is dropped.

1. **Schema migration** — `migrations/000X_demote_air_assist.sql`
   - Add a column `demote_air_assist REAL NOT NULL DEFAULT 0` to the
     existing `wave_gem_assist` table (see `migrations/0007_wave_gem_assist.sql`
     for the existing shape). Same row granularity (per-tower-per-wave).
   - In production this is a D1 migration; run via the same flow as 0007.

2. **TelemetryCollector** (`src/telemetry/TelemetryCollector.ts`)
   - Add a `demoteAirAssist` accumulator alongside `dmgAuraAssist` /
     `vulnAssist` / `armorShredAssist` / `atkspeedAssist`. Per-tower-per-wave.
   - In the flush path, include `demoteAirAssist` in the `wave_gem_assist`
     payload.

3. **Combat — emit demote** (`src/systems/Combat.ts`, around line 621)
   - Where the `isDemoteShot` branch fires (sets `target.flags.air = false`
     and emits `creep:demoted`), tag the creep with
     `creep.demotedByTowerId = owner.id` (new optional field on `CreepState`
     in `src/game/State.ts`).
   - If the creep was already demoted by some other Red Crystal, overwrite
     with the most-recent demoter (mirrors `armorDebuff.ownerId` convention).

4. **Combat — credit downstream damage** (`src/systems/Combat.ts`,
   `applyDamage()` around line 870)
   - At the top of `applyDamage`, if `c.demotedByTowerId !== undefined` AND
     the firing tower's `stats.targeting === "ground"` (i.e. it wouldn't have
     been able to hit this creep without the demotion), call into the
     TelemetryCollector to credit `dmg` to the demoter.
   - Subtlety: the demoter is identified by tower id, but the collector
     attributes by `(gem, quality, combo_key, upgrade_tier)` rows. Either
     resolve tower id → gem-attribution at credit time, or store the demoter's
     attribution snapshot on the creep when demoting (recommended — snapshot
     at demote time, like `armorStacks.ownerId` does).

5. **Worker ingest** (`src/worker/ingest.ts` ~line 104)
   - Add `demote_air_assist` to the `wave_gem_assist` INSERT.

6. **Query script** (`.claude/skills/balance-observations/scripts/query-telemetry.ts`)
   - In the assist computation, add `demote_air_assist` as a fourth channel
     for combos (sum it into `assisted_damage` and `assisted_damage_share`).
     Currently the query has channels: `dmg_aura_assist`, `vuln_assist`,
     `armor_shred_assist`, `atkspeed_assist`. Add the fifth.
   - Re-derive `support_median_assisted_damage_share` from the new totals.

7. **SKILL.md** (`.claude/skills/balance-observations/SKILL.md`)
   - Update the assist schema block to list the new `demote_air_assist`
     channel.
   - Remove the "demote_air remains **unmeasured**" caveat from the Red
     Crystal description.
   - The "What's still unmeasured" line currently calls out slow/CC,
     path-distance-denied, AND air-grounding — drop air-grounding from that
     list.

## Verification

After implementing:

1. Run a fresh sim batch with telemetry on:
   ```bash
   npm run telemetry:local                       # terminal 1
   npm run sim:run -- --telemetry --seeds 200    # terminal 2
   ```
2. Re-run `npx tsx .claude/skills/balance-observations/scripts/query-telemetry.ts`.
   Red Crystal should now have a non-zero `demote_air_assist` and the entry
   should move out of the "0 assisted_damage" pile.
3. Sanity check: `demote_air_assist` should be **smaller** than the air-creep
   damage taken on shrike-heavy waves (W14, W19, W24, W38, W48). If it
   exceeds total air damage in the run, the ground-only filter is broken.
4. Cross-check that ground-capable towers (amethyst especially) didn't
   accidentally credit their damage back to Red Crystal — amethyst's
   damage_share should not have dropped.

## Out of scope / decisions deferred

- **Pre-instrumentation runs** — the v2.0.0 / v2.0.1-alpha-1 data already
  recorded does NOT have `demote_air_assist`. The skill already handles
  "assist field absent" by omitting it (see `gems.assist` null handling).
  Old runs stay unanalyzed on this channel; that's fine.
- **Re-demote attribution** — recommendation is "most recent demoter wins"
  but a "split evenly across demoters in the kill window" rule is also
  defensible. Pick at design time and document in the SKILL.md schema note.
- **Gold value of bonus_gold** — already in the assist data as `bonus_gold`
  (separate unit, not folded into shares). Out of scope for this work.

## Estimated cost

4–6 files touched. The Combat.ts changes are the riskiest part (attribution
filter, creep state field). Plan for one focused session: design pick (A vs B),
schema migration, collector wiring, Combat instrumentation, query+SKILL.md
updates, sim re-run for verification. Roughly half a working session if
Option B; full session if Option A.
