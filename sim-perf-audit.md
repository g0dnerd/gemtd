# Sim framework — performance audit & speed-up plan

Audited 2026-06-07 against `main` (v2.0.3). Goal: cut wall-clock for an 8000-run HeuristicAI pass that always writes telemetry into `.local/telemetry.duckdb`.

Constraints you confirmed:

- Telemetry is **always on** (every run POSTs to the local DuckDB ingest server).
- A **pre-build step** is acceptable.
- Outputs must be **bit-exact**: same seed → same wave reached, same gold, same kills, same per-tower damage. No reordering tower/creep iteration that consumes RNG, no cross-tick caching of aura/effect state.
- 17–19 cores available.

Items are ordered by expected impact for your specific workload. I have not profiled — you should profile before committing to any of them. Concrete first step in §10.

---

## 1. DuckDB ingest is the single biggest suspect at 8000 runs × 17 cores

**Where:** `tools/local-telemetry/server.ts:147–215`.

What's happening:

```ts
let ingestQueue: Promise<void> = Promise.resolve();
// every POST becomes:
await exec(`BEGIN TRANSACTION`);
for (const w of waves)           await exec(INSERT_WAVE_SQL, [...]);   // ~50 rows
for (const t of towers)          await exec(INSERT_TOWER_SQL, [...]);  // ~50 rows
for (const e of events)          await exec(INSERT_EVENT_SQL, [...]);
for (const wcs of waveCreepStats) await exec(INSERT_WCS_SQL, [...]);   // 50×N kinds
for (const wgd of waveGemDamage)  await exec(INSERT_WGD_SQL, [...]);   // 50×N gems
for (const wga of waveGemAssign)  await exec(INSERT_WGA_SQL, [...]);
await exec(`COMMIT`);
```

Problems compounding:

1. **Single-writer DuckDB connection** + **serialised promise queue** (`ingestQueue` in the file). With 17 workers each finishing roughly together, 16 of them block waiting for the 17th's transaction. At 8000 runs that's most of your wall-clock once sim cost falls.
2. **One round-trip per row** instead of one prepared statement reused, or one VALUES list, or DuckDB's **Appender** API.
3. **Workers `await collector.whenDone()` before they can be assigned the next seed** (`tools/sim-compare/worker.ts:30`). So ingest latency turns directly into worker idle time.

Recommendations, in order of effort:

- **Quick win — batch all rows of a run into one multi-row INSERT per table.** `INSERT INTO waves VALUES (...), (...), ...`. DuckDB plans and commits these as one statement. Should cut per-run ingest from ~250+ statements to ~7. Bit-exact safe.
- **Use prepared statements.** `db.prepare(INSERT_WAVE_SQL)` once at startup; reuse. Avoids re-planning per call.
- **Use the DuckDB Appender API** (`@duckdb/node-api` exposes it) for the high-volume tables (`waves`, `wave_gem_damage`, `wave_creep_stats`). It's the bulk-load path; orders of magnitude faster than statement-by-statement inserts.
- **Decouple ingest latency from worker idle time.** Two options:
  - Worker fire-and-forgets the telemetry POST, doesn't `await whenDone()`. Buffer pending POSTs in the main process; flush before exit. (The retry loop in `tools/sim-compare/telemetry.ts` already tolerates transient errors.)
  - Or: skip the HTTP hop entirely for `npm run sim:run`. Each worker writes its run as JSONL into a temp file; main process bulk-loads with DuckDB `COPY FROM` at the end. Removes HTTP, removes single-writer contention, removes the per-row INSERT loop. For 8000 runs this is likely the single biggest win.

Estimated impact at 8000 runs × 17 cores: **easily 2–5×** total wall-clock if ingest is currently dominating, which I strongly suspect.

---

## 2. Workers spend the first seed paying tsx's TS-on-the-fly cost

**Where:** `tools/sim-compare/worker-entry.mjs`:

```js
import { register } from 'tsx/esm/api';
register();
await import('./worker.ts');
```

Every worker thread spins up a tsx ESM loader, transpiles every `.ts` file it touches, then primes V8's JIT on freshly-parsed code. With many short-lived sim runs and many workers, this is paid 17–19 times per `sim:run`.

**Fix (since you OK'd a build step):** pre-bundle the sim+AI hot path into a single ESM file with esbuild, point workers at the `.mjs` bundle. Bundle includes `HeadlessGame`, all four AIs, `Combat`, `Pathfinding`, all `data/*`, `Metrics`, `TelemetryCollector`. Add it to `npm run sim:run` as a prelude; cache by mtime so it's instant on re-run.

Bit-exact: trivially safe — same source, different module loader.

Estimated impact:
- Worker cold-start: hundreds of ms → ~tens of ms each.
- Long-term: V8 JIT operates on the same module identity across all 8000 runs in a worker, so inlining/IC stabilises. Hot loops likely 10–25% faster steady-state on top of startup gain.

This is the highest impact-per-effort item after ingest.

---

## 3. Effect-lookup pattern in the per-tick hot loop

**Where:** `src/systems/Combat.ts:152–333` (tower fire loop) and inside `fire()` at `:437–490+`.

Every tower, every tick the tower fires (often every ~30 ticks):

```ts
const stats = effectiveStats(t);
// per fire — 8+ linear scans of stats.effects:
stats.effects.some(e => e.kind === 'prox_burn' || e.kind === 'prox_burn_ramp' || e.kind === 'speed_damage_aura')
stats.effects.find(e => e.kind === 'momentum')
stats.effects.find(e => e.kind === 'beam_ramp')
stats.effects.find(e => e.kind === 'multi_target')
stats.effects.find(e => e.kind === 'demote_air')
stats.effects.find(e => e.kind === 'adaptive_mode')
stats.effects.find(e => e.kind === 'periodic_nova')
// then in fire():
stats.effects.find(e => e.kind === 'distance_scaling')
stats.effects.find(e => e.kind === 'charge_burst')
stats.effects.find(e => e.kind === 'momentum')   // again
stats.effects.find(e => e.kind === 'focus_crit')
for (const e of stats.effects) { /* crit handler */ }
```

`effectiveStats` is already memoised (`effectiveStatsCache` at `:1684`). Promote those `find`s into **direct typed slots on `ResolvedStats`**, populated once when the cache entry is first built:

```ts
interface ResolvedStats {
  ...
  momentum?: Extract<EffectKind, { kind: 'momentum' }>;
  beamRamp?: Extract<EffectKind, { kind: 'beam_ramp' }>;
  multiTarget?: Extract<EffectKind, { kind: 'multi_target' }>;
  demoteAir?: ...
  // ...
  hasPassiveBurn: boolean;  // prox_burn | prox_burn_ramp | speed_damage_aura
}
```

Then in the fire loop: `if (stats.hasPassiveBurn) continue; if (stats.multiTarget) {...}` — no Array.find at all. Cache key already covers `comboKey/gem/quality/upgradeTier/level`, so no invalidation issues.

Same treatment for `applyProximityAuras` (`:1339+`) — it inspects `stats.effects` for `prox_armor_reduce`, `prox_slow`, `vulnerability_aura`, `armor_decay_aura`, `periodic_freeze`, `prox_burn`, etc. Bucket effects at cache-build time and walk only the non-empty buckets.

Bit-exact: yes, **iff** you preserve the same first-match-wins semantics that `find` has today. Since cache entries are derived from the static effect array, the lookups are deterministic.

Estimated impact: probably **15–30%** on per-tick sim cost for runs with many active towers (the late-game waves where you actually spend time).

---

## 4. `pickTarget` is O(towers × creeps) per tick — uniform spatial grid

**Where:** `src/systems/Combat.ts:1793–1842`.

Every tower scans every alive creep every tick (modulo the cheap range check). On a 21×17 board with 50+ towers and dozens of creeps per wave, this is the dominant per-tick cost after auras.

**Fix:** maintain a tile-keyed grid `Map<tileIndex, CreepState[]>` rebuilt once at the top of `Combat.step()`. For each tower, only visit creeps in tiles intersecting `(tower.x ± range, tower.y ± range)`. Range is ≤ ~6 tiles for most gems, so each tower visits ~150 tiles instead of every creep on the board.

Bit-exact concern: **non-trivial.** `pickTarget`'s tiebreakers (`c.pathPos > best.pathPos`, `c.hp > best.hp`) depend on iteration order when scores tie. For exact equivalence, after gathering candidates from the grid you must sort them by the original `state.creeps` index (or insertion order) and run the existing reducer. Tractable but easy to get wrong.

If you want to keep this off the table for bit-exact, skip this item. If you'd accept aggregate equivalence later, this is probably the single largest sim-side win at late-wave creep counts.

---

## 5. State lookups by id done via `Array.find`

**Where:**

- `src/sim/Metrics.ts:61, 76` — every `creep:spawn` and `tower:hit` event walks `state.creeps` / `state.towers`. `tower:hit` fires once per projectile impact, so this is hot.
- `src/sim/HeadlessGame.ts:256, 275, 290` — `cmdDowngrade`, `cmdRemoveRock`, `cmdUpgradeTower` (build-phase, cool).
- `src/sim/ai/HeuristicAI.ts:186` — inside an inner upgrade loop.

`Combat` already maintains `towersById` / `creepsById` (`Combat.ts:46–70`) per tick. Two cheap moves:

- Expose them as a private property on `Game` (or `HeadlessGame`) that Metrics can read directly when handling `tower:hit`. Then the hit handler becomes `towersById.get(id)` instead of `state.towers.find`.
- For per-event subscribers that don't have access to that map, the eventbus payload already includes the relevant ids — consider attaching `gem` to `tower:hit` directly so Metrics doesn't need to look up the tower at all.

Bit-exact: safe.

Estimated impact: small individually, but the `tower:hit` lookup is in the hottest loop you've got. Probably 3–8% on hits-heavy waves.

---

## 6. HeuristicAI re-ranks `COMBOS` on every build-phase call

**Where:** `src/sim/ai/HeuristicAI.ts:212, 248, 338, 377, 451`, plus `estimateComboDps` called by every comparator.

```ts
const ranked = COMBOS.filter((c) => c.inputs.length > 0).sort(
  (a, b) => estimateComboDps(b) - estimateComboDps(a),
);
```

This runs 4+ times per wave per game. `estimateComboDps` is static (depends only on `combo.stats`). Compute the rank list **once at module load** and reuse:

```ts
const RANKED_COMBOS = COMBOS
  .filter(c => c.inputs.length > 0)
  .slice()
  .sort((a, b) => estimateComboDps(b) - estimateComboDps(a));
```

Same for `ARMOR_SHRED_COMBOS.has(combo.key)` — promote into a precomputed bool per combo.

Bit-exact: safe (deterministic sort key, stable as long as you use `Array.prototype.sort` semantics consistently — they are stable in modern V8).

Estimated impact: small per game but you spend ~5 ms/game in the AI here that you don't need to spend. Adds up across 8000 runs.

---

## 7. Worker round-trip overhead — batch seeds per dispatch

**Where:** `tools/sim-compare/runner.ts:318–323` dispatches **one seed per message**. With 8000 / 17 = ~470 seeds per worker, that's 470 round-trips per worker. Each carries a non-trivial result payload back (full `GameResult`, `gemDamageShare`, `gemKillShare`, `dpsVsHp`, `waveSummaries`).

Two improvements:

- Dispatch in **batches of N** (e.g. 16). Worker runs N games, posts back an array. Cuts message overhead and lets workers stay hot. Throughput-only — not latency-sensitive.
- Drop fields you don't actually consume. `compare.ts` and the snapshot format determine what's needed; anything `collectAISnapshot` and the comparison code don't read is pure overhead. Worth a quick `grep` — the worker currently serialises `towerSummaries` etc. that may be dead data for sim-compare.

Bit-exact: safe.

Estimated impact: small (the message bus is fast) but free if you're already restructuring the runner for §1.

---

## 8. Per-tick incidental work

These are smaller; collected for completeness.

- **`computeAuraMults` rebuilds two `Map`s per tick** (`Combat.ts:1741`). Towers don't move; aura mults only change when a tower is added/removed, silenced, or upgraded. Could be invalidated explicitly on those events and reused across ticks. **Bit-exact risk:** silence timing is per-tick, so cache invalidation needs to fire on `tick === silencedUntil`. Doable.
- **Per-tick reset of creep prox state** (`Combat.ts:74–81`) iterates all creeps once just to write `0`s. Combine with the `applyProximityAuras` first pass — single loop.
- **`state.projectiles` compaction** (`Combat.ts:348–353`) runs every tick. Fine — keep it.
- **`WavePhase.step` makes 3 separate passes over `state.creeps`** (`controllers/WavePhase.ts:105, 112, 118`) for advance / abilities / prune. Fuse them; you can advance + tick ability + mark-for-prune in one pass. Bit-exact-safe.
- **`generateWeaknesses`** (`HeadlessGame.ts:84`) — runs once per game, fine.

Estimated impact each: 1–3%.

---

## 9. EventBus overhead in the hot path

**Where:** `src/events/EventBus.ts:78–90`, plus all the `bus.emit('tower:fire' | 'tower:hit' | 'gold:change' | 'creep:die' | …)` calls in Combat / WavePhase.

Each emit is `if (muted) return; if (muteVfx && event starts with 'vfx:') return; const set = listeners.get(event); if (!set) return; for handler ... try { handler(payload) } catch ...`. The `try/catch` defeats inlining and adds throw-table cost in V8.

With telemetry on, almost every event has at least one listener (`TelemetryCollector` + `Metrics`), so the early returns rarely save anything.

Cheap improvements:

- Remove the `try/catch` in the hot path; let exceptions bubble (they're bugs anyway). Or move it behind a `if (process.env.NODE_ENV !== 'production')` style guard.
- For `'vfx:*'` events, `headless.bus.muteVfx = true` once at construction so the prefix check is hit early — wait, it already returns at that check; OK. But the `(event as string).startsWith('vfx:')` runs **every emit even on non-VFX events**. Move the muteVfx check inside a fast path keyed by a small bitmask, or use two buses.
- Consider: for headless sim, swap `EventBus` for a hand-written dispatcher with direct method calls into `Metrics` + `TelemetryCollector`. Removes the Set iteration + handler dispatch. Big refactor, probably not worth it unless profiling implicates EventBus directly.

Bit-exact: safe (you'd preserve emit order).

Estimated impact: 2–5% on telemetry-heavy runs.

---

## 10. Before you do any of this — measure

You're guessing without numbers. The single most valuable hour you can spend:

1. Run a representative pass (say 200 runs at current settings) under `node --cpu-prof` or `clinic flame`. Workers need `--cpu-prof` forwarded via `Worker({ execArgv: ['--cpu-prof'] })`.
2. Compare two runs of the same 200-seed batch:
   - **With** telemetry POSTing.
   - **Without** telemetry (`--ai HeuristicAI` no `--telemetry`, but you'd need to relax the "telemetry on" rule for this one diagnostic run).
   The delta tells you exactly what fraction of wall-clock the ingest path is eating. If it's >40%, focus §1. If it's <20%, focus §2 + §3.
3. Watch `htop` during a real run. If CPUs are pegged at 100% across all 17 workers, you're sim-CPU-bound — §2/§3/§4 matter most. If they idle, you're ingest-bound or message-bound — §1 dominates.

Without this, you'll spend effort on items 3–8 only to find ingest was 70% of the wall-clock.

---

## Suggested order of work

1. **Measure** (§10). Half an hour.
2. **DuckDB ingest rework** (§1). Probably the largest single win at your scale. The JSONL + bulk `COPY FROM` variant is the cleanest.
3. **Pre-bundle sim with esbuild** (§2). Half-day, large compounding effect — every subsequent profile pass benefits.
4. **Effect-slot promotion in `ResolvedStats`** (§3). Mechanical, bit-exact safe, in-and-out.
5. **Id→entity Maps for hot lookups** (§5). Trivial.
6. **Pre-rank `COMBOS` in HeuristicAI** (§6). Five minutes.
7. **Batch worker dispatch + drop unused payload fields** (§7). Half a day.
8. **Fuse `WavePhase` and `Combat` per-tick passes** (§8). Day. Easy to break, run sim-compare to verify bit-exact.
9. **EventBus tightening** (§9). Quick once you've cut everything above.
10. **Spatial grid for `pickTarget`** (§4). Only if §1–§3 didn't get you where you need to be, and only if you reconsider the bit-exact constraint or accept a careful tie-preserving implementation.

If §1 + §2 + §3 land cleanly you should see something like a 3–6× total wall-clock improvement on 8000-run telemetry-on passes, gated by where current cost actually is.
