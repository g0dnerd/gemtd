# Handoff: Runes (Engraved Stone Tablet)

## Overview

Runes are a new tower type for **gemtd2** that does **not** block creep pathing — creeps walk over them on the path and trigger an effect. There is **a single tier per rune** (no upgrades). Four effects ship in this set:

| Rune                      | Effect                                                       |
| ------------------------- | ------------------------------------------------------------ |
| Rune of Holding           | Stuns the creep that steps on it.                            |
| Rune of Damage            | Damages the creep that steps on it.                          |
| Rune of Teleportation     | Knocks the creep back N tiles along its path.                |
| Rune of Slow              | Slows every creep that walks over it.                        |

Visually: a **square stone paver inlaid into the path**, with a deep recess carved into its face and a glowing glyph inside the recess. Reads as a permanent ground inscription — geological, ambient, distinct from the gem-tower silhouette (which stands up off a grass tile and bobs).

## About the Design Files

The files in this bundle (`Runes.html`, `runes.jsx`, `design-canvas.jsx`) are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the gemtd2 codebase** (TypeScript + PixiJS v8, see `CLAUDE.md`) using the project's established patterns:

- Render with `Graphics` / `Sprite` in `src/render/`, NOT React/HTML.
- Pull theme colors from `src/render/theme.ts` and `src/styles/pixel.css`; add new tokens there.
- Sim/render split — runes live in `State` as plain data; rendering reads from state every tick (see `src/render/EntityRenderer.ts` for the pattern used by towers, creeps, projectiles).
- Use the seeded RNG (`game.rng`) for any randomized rolls (e.g. teleport tile count if it varies).

## Fidelity

**High-fidelity.** All sprites, palettes, glyphs, and trigger animations below are final. Recreate pixel-for-pixel.

## What lives where in the bundle

| File                  | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `Runes.html`          | The HTML wrapper that loads the design canvas + the runes.jsx mock. Open in a browser to view. |
| `runes.jsx`           | All sprite grids, palettes, and renderers. **Direction A — Engraved Stone Tablet** is the `StoneTablet` component (around line 168). Other directions (B Painted Sigil, C Crystal Disc) are NOT shipping; ignore them. |
| `design-canvas.jsx`   | The artboard/section/zoom shell — irrelevant to implementation; just a viewer for the mocks. |

## The Design

### Sprite — base tablet (shared across all four runes)

A 14×14 pixel grid. Stone bezel + sunken recess. Colour codes:

- `0` transparent
- `1` stone-light (`#cdb78a`)
- `2` stone-mid (`#8a6e44`)
- `3` stone-dark / recess shadow (`#3a2a1a`)
- `4` outline (`#0a0510`)

```
0,4,4,4,4,4,4,4,4,4,4,4,4,0
4,3,1,1,2,2,2,2,2,2,1,1,3,4
4,1,2,2,2,2,2,2,2,2,2,2,1,4
4,1,2,3,3,3,3,3,3,3,3,2,1,4
4,2,2,3,2,2,2,2,2,2,3,2,2,4
4,2,2,3,2,0,0,0,0,2,3,2,2,4
4,2,2,3,2,0,0,0,0,2,3,2,2,4
4,2,2,3,2,0,0,0,0,2,3,2,2,4
4,2,2,3,2,0,0,0,0,2,3,2,2,4
4,2,2,3,2,2,2,2,2,2,3,2,2,4
4,1,2,3,3,3,3,3,3,3,3,2,1,4
4,1,2,2,2,2,2,2,2,2,2,2,1,4
4,3,1,1,2,2,2,2,2,2,1,1,3,4
0,4,4,4,4,4,4,4,4,4,4,4,4,0
```

The 4×4 block of `0`s in the middle (rows 5–8, cols 5–8) is the **carved recess** — the path stone shows through, dimmed by a dark overlay. The glyph is drawn into this recess.

Verbatim source: `runes.jsx`, constant `TABLET_BASE`.

### Glyphs — 8×8 grid, drawn centred on top of the tablet at offset (col 3, row 3)

`1` = lit pixel (drawn in the rune's `glow` colour). `0` = empty.

**Holding — vertical I-beam (anchor / stake driven into the ground)**
```
0,0,0,1,1,0,0,0
1,1,1,1,1,1,1,0    <- top serif
0,0,0,1,1,0,0,0
0,0,0,1,1,0,0,0
0,0,0,1,1,0,0,0
0,0,0,1,1,0,0,0
1,1,1,1,1,1,1,0    <- bottom serif
0,0,0,1,1,0,0,0
```

**Damage — jagged lightning bolt**
```
0,0,0,0,1,1,1,0
0,0,0,1,1,1,0,0
0,0,1,1,1,0,0,0
0,1,1,1,1,1,0,0
0,0,1,1,1,1,1,0
0,0,0,1,1,1,0,0
0,0,1,1,1,0,0,0
0,1,1,0,0,0,0,0
```

**Teleportation — three-loop spiral / vortex**
```
0,0,1,1,1,1,0,0
0,1,0,0,0,0,1,0
1,0,0,1,1,1,0,1
1,0,1,0,0,1,0,1
1,0,1,1,0,1,0,1
1,0,0,0,0,1,0,0
0,1,0,0,0,0,0,0
0,0,1,1,1,1,1,0
```

**Slow — six-armed snowflake**
```
0,0,0,1,1,0,0,0
1,0,1,1,1,1,0,1
0,1,0,1,1,0,1,0
1,1,1,1,1,1,1,1
1,1,1,1,1,1,1,1
0,1,0,1,1,0,1,0
1,0,1,1,1,1,0,1
0,0,0,1,1,0,0,0
```

Verbatim source: each rune's `glyph8` property in `runes.jsx`, constant `RUNE_EFFECTS`.

### Per-rune palette

Stone bezel and outline are shared across all four runes. Only `glow`, `glyph`, `glyphDeep`, and `triggerColor` change. Full table:

| Rune                  | `glow` (recess+halo) | `glyph` (lit pixel) | `glyphDeep` (etched shadow) | `triggerColor` (flash + ring + burst) |
| --------------------- | -------------------- | ------------------- | --------------------------- | ------------------------------------- |
| Holding               | `#ffc54a`            | `#fff0a8`           | `#a06818`                   | `#ffe890`                             |
| Damage                | `#ff4838`            | `#ffd0a8`           | `#7a1010`                   | `#ffb070`                             |
| Teleportation         | `#b048f0`            | `#e8b8ff`           | `#48107a`                   | `#d890ff`                             |
| Slow                  | `#48d0f0`            | `#d0f4ff`           | `#104878`                   | `#a8eaff`                             |

Render order, top to bottom (alpha):

1. Path tile (existing path-stone render — unchanged).
2. Tablet base sprite (TABLET_BASE) — pixel codes 1–4 use the stone-shared palette above; the four `0`s in the recess leave the path visible.
3. **Recess fill** — a `glow`-tinted rect at 22% opacity covering the 4×4 recess (rows 5–8, cols 5–8). This is what gives the recess its faint colored bed.
4. **Etched shadow pass** — render `glyph8` in `glyphDeep` at full alpha, offset 1 pixel right and 1 pixel down. (Placed at tablet col 3, row 3.)
5. **Glyph pass** — render `glyph8` in `glyph` at full alpha, on top of the shadow.
6. **Idle glow halo** — a radial gradient centred on the recess, from `glow` at ~40% alpha fading to transparent at ~60% radius. Pulses opacity 0.55 ↔ 1.0 over 2.4 s, ease-in-out, looping.

### Trigger sequence

Fires when a creep enters the rune's tile. **Same animation for all four runes** — only `triggerColor` differs.

Total length: **~520 ms** from creep-enter to fully cleared.

| Phase              | Time (ms) | Action                                                       |
| ------------------ | --------- | ------------------------------------------------------------ |
| Pre-flash          | 0         | Creep arrives. State machine fires `RuneTriggered`.          |
| Flash              | 0–60      | Solid `triggerColor` disc, blend mode screen, covers full tablet. Opacity 0 → 0.95 (0–20 ms) → 0.4 (60 ms) → 0.15 (110 ms) → 0 (220 ms). |
| Expanding ring     | 0–280     | Stroked ring in `triggerColor`, screen blend, centred on tablet. Scale 0.6 → 1.6 (radius from ~50% tile to ~140% tile). Opacity 0.95 → 0 over 280 ms, ease-out. Stroke ~2 px at native sprite scale. |
| Pixel burst        | 0–360     | Eight square pixels (~1.5 px native) fly outward in 8 cardinals (0°, 45°, 90°, … 315°). Travel ~26–32 px from center (alternate near/far). Opacity 1 → 0 over 360 ms, ease-out. |
| Settle             | 360–520   | Idle halo resumes its base pulse.                             |

**Cooldown rules:**
- Holding, Damage, Teleportation: fire **once per creep**, then go on a per-creep ~0.5 s cooldown so a stuck creep can't chain-trigger.
- Slow: re-triggers continuously while any creep stands on it (cheap aura tick; the trigger animation only plays on the first tick of any continuous occupation).

### On-tile context

Runes live on `Path` cells. The path tile renderer is unchanged — runes draw on top of the existing path. Tablet sprite occupies the central ~14×14 pixels of the tile; the 1-pixel transparent border on each side of the sprite is intentional so the path stone trims through.

Path-tile reference colors (from `theme.ts`, unchanged): `path #6b5230`, `pathHi #8a6c44`, `pathLo #4a3820`.

### Idle vs. inert

A rune always has the idle halo pulse running — it never goes fully dark. This is the "I'm armed" tell. The trigger animation overlays additively on top.

## Game Logic & Integration

This section describes the engine-side integration. Source-of-truth conventions are in `CLAUDE.md`.

### New cell type

Extend `Cell` in `src/data/map.ts`:

```ts
export enum Cell {
  Grass,
  Path,
  Tower,
  Rock,
  Wall,
  Rune,   // NEW — walkable, blocks no path
}
```

Pathfinding must treat `Rune` as walkable (same as `Path`). See `src/systems/Pathfinding.ts` — the cell-walkability check needs an additional case.

### Placement rules

- Runes are placed on **`Path`** cells (towers go on `Grass`).
- Placement does **not** call `findRoute`; the route is unaffected.
- Runes count toward the player's per-build-phase `DRAW_COUNT` budget — open question, see below.
- Selling/keeping rules: TBD with `BuildPhase` / `KeeperPhase`. **Open question:** does a rune get the same keep-or-rock outcome as a gem at the end of a wave, or does it persist by default? Recommended default: persists, keeper choice does not affect runes. Confirm with design.

### State

Extend `State` in `src/game/State.ts`:

```ts
interface RuneInstance {
  id: number;
  x: number;          // grid col
  y: number;          // grid row
  effect: 'holding' | 'damage' | 'teleport' | 'slow';
  cooldownPerCreep: Map<creepId, simTickReady>;  // for non-slow runes
}
```

Keep `State` JSON-clean — no Pixi refs. Live render objects are owned by `EntityRenderer`.

### Combat hook

In `src/systems/Combat.ts`, after creep movement integration each sim tick:

1. For each creep, look up the cell it now occupies.
2. If the cell has a rune:
   - For non-slow runes: if `cooldownPerCreep.get(creep.id) > state.tick`, skip. Otherwise resolve effect and set cooldown to `state.tick + 30` (0.5 s @ 60 Hz).
   - For slow rune: apply slow modifier to the creep for the tick (cleared next tick if the creep moves off).
3. Emit `RuneTriggered` event so the renderer can play the trigger animation.

Effect resolutions:

- **Holding**: apply `Stunned` status with duration TBD (suggest `0.75` s — confirm with design balance).
- **Damage**: apply flat damage = TBD (suggest `30` HP at wave 1 baseline — confirm).
- **Teleportation**: rewind the creep along `state.flatRoute` by N tiles (suggest `3` — confirm). Clamp to start.
- **Slow**: while occupying, multiply creep `speed` by 0.5. Stack rule: does not stack with itself. Stacks multiplicatively with other slow sources (TBD).

Numbers above are placeholders for the design pass — please confirm with the project owner before locking.

### Render

Add a `RuneRenderer` (or extend `EntityRenderer`) following the pattern of `renderTowers`/`renderCreeps`:

- One Pixi `Container` per rune.
- Static layer: tablet sprite + glyph + idle halo (cached as a Texture via a `RuneSpriteCache` keyed by effect, similar to `TowerSpriteCache`).
- Dynamic layer: trigger animation, mounted only while a `RuneTriggered` event is in flight (~520 ms).

Subscribe to `RuneTriggered` on `EventBus` (`src/events/EventBus.ts`) and add the event to the `GameEvents` interface.

### UI

- Build-phase picker: 4 new tile entries with the rune sprites — slot into the existing pick UI alongside gem draws.
- Inspector panel: show name + effect text + range (1 tile, the rune's own tile) + per-rune cooldown rules.
- HUD legend: extend any existing legend that lists Cell types so the new `Rune` color/symbol shows up on map overlays.

Match the existing HUD copy style and density — the runes don't need new UI conventions.

## Design Tokens

Add to `src/render/theme.ts` (and mirror in `src/styles/pixel.css`):

```ts
export const RUNE = {
  // shared
  outline: 0x0a0510,
  stoneLight: 0xcdb78a,
  stoneMid: 0x8a6e44,
  stoneDark: 0x3a2a1a,

  // per-effect
  holding:   { glow: 0xffc54a, glyph: 0xfff0a8, glyphDeep: 0xa06818, trigger: 0xffe890 },
  damage:    { glow: 0xff4838, glyph: 0xffd0a8, glyphDeep: 0x7a1010, trigger: 0xffb070 },
  teleport:  { glow: 0xb048f0, glyph: 0xe8b8ff, glyphDeep: 0x48107a, trigger: 0xd890ff },
  slow:      { glow: 0x48d0f0, glyph: 0xd0f4ff, glyphDeep: 0x104878, trigger: 0xa8eaff },
} as const;
```

## Animation values

| Animation        | Duration | Easing       | Loop?   | Notes                                         |
| ---------------- | -------- | ------------ | ------- | --------------------------------------------- |
| Idle halo pulse  | 2.4 s    | ease-in-out  | yes     | opacity 0.55 ↔ 1.0                             |
| Trigger flash    | 220 ms   | ease-out     | no      | 0 → 0.95 → 0.4 → 0.15 → 0 keyframes            |
| Trigger ring     | 280 ms   | ease-out     | no      | scale 0.6 → 1.6, opacity 0.95 → 0              |
| Trigger burst    | 360 ms   | ease-out     | no      | 8 cardinals, 26–32 px travel, alpha 1 → 0      |

## Open Questions for the Designer

1. **Stun / damage / knockback / slow numeric values** — placeholders above (0.75 s, 30 HP, 3 tiles, ×0.5).
2. **Keeper interaction** — does a rune survive the keep-or-rock pick at end of wave like a gem, or persist automatically?
3. **Draw budget** — does a rune count as one of the 5 random draws each build phase, or are runes a separate purchasable resource?
4. **Sell refund** — same `SELL_REFUND` (75%) as gems?
5. **Stacking** — multiple runes on one tile: legal or rejected?

## Files

- `Runes.html` — design viewer (open in browser).
- `runes.jsx` — all sprites and renderers; Direction A `StoneTablet` is the one that ships.
- `design-canvas.jsx` — viewer chrome only; not part of the implementation.
