# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server at http://localhost:5173
- `npm run build` — `tsc -b && tsc -p tsconfig.worker.json && vite build` (typechecks both app and worker, then bundles; output in `dist/`)
- `npm run typecheck` — typecheck app and worker, no emit
- `npm test` — Vitest run-once (**excludes** `sim.test.ts` and `sim-run.test.ts`)
- `npm run test:watch` — Vitest in watch mode
- `npm run sim` — run the heavy headless-sim test (the one `npm test` skips)
- `npm run sim:run|sim:compare|sim:history` — `tools/sim-compare/cli.ts` entry points (balance regression diffing)
- `npm run wave-difficulty|wave-difficulty:compare|wave-difficulty:history` — wave difficulty analysis CLI
- `npm run telemetry:local` — local telemetry server for offline dev
- `npm run blueprint:viz` — visualize maze blueprint (Python, uses `uv run`)
- `npm run blueprint:export` — export blueprint JSON (Python, uses `uv run`)
- `npm run preview` — local build + `wrangler dev` (Cloudflare Worker simulator)
- `npm run deploy` — production deploy to Cloudflare. **Never run this without explicit confirmation.**
- Single test file: `npx vitest run tests/combat.test.ts`
- Single test by name: `npx vitest run -t "name fragment"`

TypeScript is `strict` with `noUnusedLocals`/`noUnusedParameters` on — unused imports/locals will fail the build, not just lint.

## Architecture

Browser clone of SC2 Gem Tower Defense. TypeScript + PixiJS v8 (canvas) + plain HTML/CSS HUD overlay. Vite for bundling, Vitest for unit tests (Node environment, no jsdom). Hosted as a Cloudflare Worker with a D1 database for telemetry.

### Sim/render split

`src/game/Game.ts` is the top-level controller. Pixi's ticker drives `tick()`, which **decouples sim from render**:

- Sim runs at fixed `SIM_HZ = 60` (`SIM_DT` accumulator). Speed multiplier (1/2/4) scales how much sim time is consumed per real frame; render still happens once per frame.
- Render reads from `state` each tick — `renderTowers/Rocks/Creeps/Projectiles/Hover/RangePreview` in `src/render/EntityRenderer.ts`.
- Don't add per-frame work to the sim path. Don't read wall-clock time from sim code; use `state.tick`.

### State is plain data

`src/game/State.ts` defines a single mutable `State` object owned by `Game`. It is intentionally JSON-clean (no class instances, no Pixi refs) so save/load is a cheap follow-on. Systems mutate `state` in place; UI reads from it. Don't stash live Pixi objects on `State`.

### Phases (state machine)

Game progresses through phases in `state.phase`: `title → build → wave → choose-keeper → build → ...` (or `gameover`/`victory`). Each phase has its own controller in `src/controllers/`:

- `BuildPhase` — rolls 5 random gem draws (`DRAW_COUNT`); player must place all 5 before wave can start. Handles place/undo/combine. Placement is rejected if it disconnects the route through any consecutive waypoint pair.
- `WavePhase` — spawns + steps creeps for the current wave.
- Keeper handling (no controller file, lives on `Game`) — after each wave, player keeps **one** of the 5 placed towers; the others convert to rocks (permanent maze blockers, no refund). This is core to the genre and to the design intent (see below).
- `Combat` (`src/systems/Combat.ts`) — runs every sim step regardless of phase; handles tower targeting/firing, projectile flight, on-hit effects.
- `Traps` (`src/systems/Traps.ts`) — towers with `isTrap=true` don't fire projectiles; instead they trigger area effects when creeps walk within range.
- `PayloadSpawner` (`src/systems/PayloadSpawner.ts`) — handles container creep death: spawns child creeps with staggered timing at the parent's death position.

`Game.cmd*` methods are the public command surface UI calls into; phase controllers do the actual work.

### Pathfinding

`src/systems/Pathfinding.ts` runs 4-directional A* between consecutive `WAYPOINTS` (defined in `src/data/map.ts`) and concatenates segments. `findRoute` is called on every placement attempt to verify the maze still connects; `Game.refreshRoute()` caches `routeSegments` + `flatRoute` for creep movement. The grid is `Cell[][]` — `Grass` is buildable, `Path` is forced-walkable, `Tower`/`Rock`/`Wall` block.

### Pure-data game content

Everything in `src/data/` is data-only (no Pixi, no DOM):

- `map.ts` — 21×17 grid layout, waypoints, `Cell` enum.
- `gems.ts` — 8 gem types × 5 qualities. `gemStats(gem, quality)` is the canonical stat resolver; quality scales damage/range/atk-speed and effect potency. Note: `GemType` and `Quality` types are defined in `src/render/theme.ts`, not here — `gems.ts` imports them.
- `combos.ts` — multi-gem recipes; `findCombo` matches greedily.
- `creeps.ts`, `waves.ts` — per-wave creep specs.
- `maze-blueprint.ts` — blueprint consumed by `BlueprintAI` (output of the Python `maze_optimizer`).
- `wave-difficulty.ts` — empirical wave difficulty evaluator (armor, HP, speed scoring).
- `gemtd-reference.ts` — reference data extracted from another GemTD port, used for cross-checking.

Add new gems/combos/waves here and they flow through automatically.

### UI / events

UI is **HTML/CSS, not Pixi** (`src/ui/`, styled by `src/styles/`). The Pixi canvas is mounted into the HUD's center column by `Shell.ts`. UI talks to the sim through:

1. `Game.cmd*` methods (UI → sim).
2. `EventBus` (`src/events/EventBus.ts`) — typed pub/sub keyed by `GameEvents`. Sim emits, UI subscribes. Add new events to the `GameEvents` interface.

### Rendering

PixiJS v8 with pixel-art settings (`antialias: false`, `roundPixels: true`). `BoardRenderer` draws static layers (ground, checkpoints, path overlay) once; `EntityRenderer` redraws dynamic layers each frame. `TowerSpriteCache` (`src/render/TowerRenderer.ts`) caches generated textures keyed by gem+quality+combo. Theme tokens are duplicated between `src/render/theme.ts` (for Pixi `Graphics` numeric colors) and `src/styles/pixel.css` (for HTML); keep them in sync.

### Determinism

`src/game/rng.ts` — seeded PRNG used for draws and combat rolls. Use `game.rng`, not `Math.random()`, anywhere that affects gameplay.

### localStorage

All keys use the format `gemtd:<kebab-case>`. Current keys: `gemtd:music-muted`, `gemtd:path-viz`, `gemtd:sim-speed`, `gemtd:last-seen-version`. Wrap writes in `try/catch` for private-browsing mode.

## Tooling beyond the game

### Headless sim + AI players (`src/sim/`)

`HeadlessGame` runs the game without Pixi. `src/sim/ai/` has four AI players — `BlueprintAI`, `GreedyAI`, `StrategistAI`, `HeuristicAI` — used **for balance evaluation only** (driving sim-compare runs). Update them only when a new mechanic genuinely needs to be understood by the evaluator; treat them as offline analysis tooling, not gameplay code.

Headless sim runs **don't write telemetry by default** — guard at the `TelemetryCollector` boundary, not in dashboard queries. The **one** intentional exception is `npm run sim:run -- --telemetry`, which attaches the collector and emits runs tagged `mode='sim'` (local server by default; `--remote` + `--telemetry-url`/`GEMTD_TELEMETRY_URL` for production, and only `HeuristicAI` unless `--ai` says otherwise). Plain `npm test`, `npm run sim`, and default `sim:run` still never emit.

### `tools/sim-compare/`

CLI in `tools/sim-compare/cli.ts` runs a fleet of AI sims against a baseline snapshot and reports balance deltas (wave reached, leaks, gold, etc.). Invoked via `npm run sim:run | sim:compare | sim:history` or the `/sim-compare` skill.

### `tools/maze_optimizer/` (Python)

Offline genetic-algorithm tool that produces the blueprint JSON consumed by `BlueprintAI` and `src/data/maze-blueprint.ts`. Touch this **when adding new gem types** — the fitness function depends on the gem roster, so a fresh blueprint should be regenerated. Otherwise leave it alone.

### Telemetry + Cloudflare Worker (`src/worker/`, `src/telemetry/`, `migrations/`)

- D1 binding `gemtd_telemetry`; schema in `migrations/`. The Worker exposes ingest, dashboard, stats, and export endpoints.
- **Run validity filter:** for real-player runs (the default `runset`), dashboards and exports compute aggregates over `mode NOT IN ('debug','creative','sim') AND wave_reached > 1`; `runset=sim` switches the base to `mode = 'sim' AND wave_reached > 1`. Any new dashboard/export query must mirror this filter — don't aggregate raw rows.
- If you add a new run `mode` (e.g. `sandbox`, `tutorial`), update the SQL filter list in `src/worker/{stats,export}.ts` **and** `tools/local-telemetry/server.ts`, and call it out in the PR. (`'sim'` is already excluded from real aggregates; sim runs also carry `ai`/`seed` columns on `runs` for grouping and seed-level reproducibility.)
- Telemetry is **opt-in / privacy-sensitive**. Don't send PII or anything that could re-identify a player beyond the seed. New fields on `TelemetryCollector` require explicit justification.
- **Never deploy** (`npm run deploy`) without explicit confirmation — it hits production.

## Working on this codebase

### Balance-affecting changes

A change is balance-affecting if it touches `src/data/{gems,combos,creeps,waves}.ts`, `src/systems/Combat.ts`, or tuning constants in `src/game/`. For these:

1. **Update `tests/balance.test.ts`** if thresholds shift. When you do, call out **which threshold moved and why** in the response — don't bury balance changes inside an opaque test diff.
2. **Ask whether to run sim-compare** before declaring the task done. Don't run it unprompted (it's slow), but offer.
3. **Bump version + changelog** via the `/release` skill once the change is ready to ship (see Versioning).

### Versioning & releases

Use this shape, but **always propose the bump in `/release` and wait for confirmation** — don't decide unilaterally:

- **Patch** (e.g. v1.3.3 → v1.3.4) — pure number tweaks, small bugfixes. Examples in log: "soften Ruby damage scaling", "nerf air speed".
- **Minor** (e.g. v1.3.x → v1.4.0) — new content type (gem / combo / creep / wave mechanic) or rule change. Examples: "container creeps", "healer buffs no longer stack".
- **Major** — save-format break or genre-level rewrite. None in current log.

Reach for the `/release` skill **proactively** when a change is ready to ship (user-visible or balance-affecting). For internal-only changes (dashboard, telemetry plumbing, dev tooling), no version bump.

### Commit messages

Two patterns, both lowercase, kept short (~60 chars):

- **Release commits:** `vX.Y.Z - short summary`. Example: `v1.4.0 - container creeps`.
- **Non-release commits, one area dominates:** `<area>: <verb phrase>`. Examples: `dashboard: hierarchical version selector`, `telemetry: migrate from Analytics Engine to D1`.
- **Cross-cutting work:** skip the area prefix and just write a plain summary.

No body unless something is genuinely non-obvious from the diff.

### New UI elements

When the task calls for new UI (a new panel, modal, indicator), **don't try to match the final design**. Implement a **simple functional placeholder** that's wired up correctly — basic HTML, minimal styling, ignore visual consistency with the rest of the HUD. The user provides finished design specs separately; polish happens then. Don't block on asking for the spec first.

### Skills to reach for proactively

- **`/release`** — when a change is ready to ship, proactively propose a version bump + changelog commit and wait for confirmation.
- **`/sim-compare`** — don't run unprompted (slow), but offer it after balance-affecting changes.
- All other skills (`/simplify`, `/review`, `/security-review`, etc.) — only when the user invokes them.

## Game design intent

When making judgment calls on balance or UX, lean on these:

- **High difficulty by design.** Target is roughly 1 in 5 runs beaten at strong play. Bias balance changes toward "still possible if you build well" rather than "safe by default." Don't soften something just because it's hard.
- **Keeper choice is the core decision.** The player keeping one of five towers each wave is what makes the genre work. Active keeper decisions adapting to the current board's weaknesses are the point — don't add auto-suggestions, "recommended keeper" highlights, or any UX that reduces the weight of the choice.
- **Unique identities for gems and creeps.** Every gem type and every creep type should feel distinct in role, not just in numbers. When balancing, prefer changes that sharpen identity (e.g. shift a gem toward its niche) over changes that flatten it (e.g. make a weak gem competent at everything).
