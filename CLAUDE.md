# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server at http://localhost:5173
- `npm run build` — `tsc -b && vite build` (typecheck-then-bundle; output in `dist/`)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest run-once (excludes heavy sim tests)
- `npm run test:watch` — Vitest in watch mode
- Single test file: `npx vitest run tests/combat.test.ts`
- Single test by name: `npx vitest run -t "name fragment"`

TypeScript is `strict` with `noUnusedLocals`/`noUnusedParameters` on — unused imports/locals will fail the build, not just lint.

## Architecture

Browser clone of SC2 Gem Tower Defense. TypeScript + PixiJS v8 (canvas) + plain HTML/CSS HUD overlay. Vite for bundling, Vitest for unit tests (Node environment, no jsdom).

### Sim/render split

`src/game/Game.ts` is the top-level controller. Pixi's ticker drives `tick()`, which **decouples sim from render**:

- Sim runs at fixed `SIM_HZ = 60` (`SIM_DT` accumulator). Speed multiplier (1/2/4) scales how much sim time is consumed per real frame; render still happens once per frame.
- Render reads from `state` each tick — `renderTowers/Rocks/Creeps/Projectiles/Hover/RangePreview` in `src/render/EntityRenderer.ts`.
- Don't add per-frame work to the sim path. Don't read the clock from sim code; use `state.tick`.

### State is plain data

`src/game/State.ts` defines a single mutable `State` object owned by `Game`. It is intentionally JSON-clean (no class instances, no Pixi refs) so save/load is a cheap follow-on. Systems mutate `state` in place; UI reads from it. Don't stash live Pixi objects on `State`.

### Phases (state machine)

Game progresses through phases in `state.phase`: `title → build → wave → choose-keeper → build → ...` (or `gameover`/`victory`). Each phase has its own controller in `src/controllers/`:

- `BuildPhase` — rolls 5 random gem draws (`DRAW_COUNT`); player must place all 5 before wave can start. Handles place/undo/combine. Placement is rejected if it disconnects the route through any consecutive waypoint pair.
- `WavePhase` — spawns + steps creeps for the current wave.
- `KeeperPhase` — after each wave, player keeps **one** of the 5 placed towers; the others convert to rocks (permanent maze blockers, no refund). This is core to the genre.
- `Combat` (`src/systems/Combat.ts`) — runs every sim step regardless of phase; handles tower targeting/firing, projectile flight, on-hit effects.

`Game.cmd*` methods are the public command surface UI calls into; phase controllers do the actual work.

### Pathfinding

`src/systems/Pathfinding.ts` runs 4-directional A* between consecutive `WAYPOINTS` (defined in `src/data/map.ts`) and concatenates segments. `findRoute` is called on every placement attempt to verify the maze still connects; `Game.refreshRoute()` caches `routeSegments` + `flatRoute` for creep movement. The grid is `Cell[][]` — `Grass` is buildable, `Path` is forced-walkable, `Tower`/`Rock`/`Wall` block.

### Pure-data game content

Everything in `src/data/` is data-only (no Pixi, no DOM):

- `map.ts` — 21×17 grid layout, waypoints, `Cell` enum.
- `gems.ts` — 7 gem types × 5 qualities. `gemStats(gem, quality)` is the canonical stat resolver; quality scales damage/range/atk-speed and effect potency.
- `combos.ts` — multi-gem recipes; `findCombo` matches greedily.
- `creeps.ts`, `waves.ts` — per-wave creep specs.

Add new gems/combos/waves here and they flow through automatically.

### UI / events

UI is **HTML/CSS, not Pixi** (`src/ui/`, styled by `src/styles/`). The Pixi canvas is mounted into the HUD's center column by `Shell.ts`. UI talks to the sim through:

1. `Game.cmd*` methods (UI → sim).
2. `EventBus` (`src/events/EventBus.ts`) — typed pub/sub keyed by `GameEvents`. Sim emits, UI subscribes. Add new events to the `GameEvents` interface.

### Rendering

PixiJS v8 with pixel-art settings (`antialias: false`, `roundPixels: true`). `BoardRenderer` draws static layers (ground, checkpoints, path overlay) once; `EntityRenderer` redraws dynamic layers each frame. `TowerSpriteCache` (`src/render/TowerRenderer.ts`) caches generated textures keyed by gem+quality+combo. Theme tokens are duplicated between `src/render/theme.ts` (for Pixi `Graphics` numeric colors) and `src/styles/pixel.css` (for HTML); keep them in sync.

### Determinism

`src/game/rng.ts` — seeded PRNG used for draws and combat rolls. Use `game.rng`, not `Math.random()`, anywhere that affects gameplay.
