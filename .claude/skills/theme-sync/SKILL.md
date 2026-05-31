---
name: theme-sync
description: Check that the duplicated theme tokens in src/render/theme.ts (PIXI numeric colors) and src/styles/pixel.css (HTML HUD CSS vars) are in sync, and report any drift. Use after editing either file's palette/color tokens, before shipping a visual change, or whenever asked to verify the theme is consistent between the Pixi and HTML sides.
---

# theme-sync

## Why this exists

Theme color tokens are **intentionally duplicated** across two files because the
Pixi canvas and the HTML HUD consume colors differently:

- `src/render/theme.ts` — numeric `0xRRGGBB`, used by PIXI `Graphics`.
- `src/styles/pixel.css` — `#rrggbb` CSS custom properties, used by the HTML HUD.

CLAUDE.md says "keep them in sync," but nothing enforced it. This skill makes the
invariant **checkable** instead of trust-based.

## Run it

```bash
npx tsx .claude/skills/theme-sync/scripts/check-theme-sync.ts
```

- **Exit 0** — all mirrored tokens match.
- **Exit 1** — drift found; each mismatch prints `theme.ts value != css var (pixel.css:LINE)`.
- **Exit 2** — couldn't run (a file moved, theme.ts stopped being import-safe, etc.).

The script imports `theme.ts` directly (it has zero imports, so it loads
standalone) and parses every `--var: #hex;` declaration in `pixel.css`.

## What it checks

1. **Core UI palette** — `THEME.{bg,panel,panel2,ink,inkDim,borderDark,accent,good,bad,info}`
   against their `--px-*` counterparts.
2. **Variant B cell tokens** — `CELL.{wallSeam,pathStone,crystalCore,…}` against `--px-*`.
3. **Gem palette** — `GEM_PALETTE[gem].mid`/`.dark` against `--gem-<gem>` / `--gem-<gem>-d`,
   for gems that have CSS vars (auto-detected). Also checks each gem's **internal**
   numeric-vs-`.css`-string consistency inside `theme.ts`.
4. **Every CSS occurrence.** Some tokens are declared twice (`:root` *and*
   `.px-theme-cozy`). The checker compares *all* declarations, so drift can't hide
   in a second site and a self-inconsistent CSS file is itself flagged.

## What it does NOT flag (reported as notes, not drift)

- Gems with no CSS vars yet (aquamarine, garnet, spinel, carnelian) — the HUD
  doesn't theme them. Adding the vars makes them auto-checked.
- CSS-only derived shades (`--px-accent-hi`, `--px-ink-dimmer`, …) and pure-Pixi
  tables (`RUNE`, `ROCK_PAL`, `APEX_STARGEM`, per-quality maps) — these have no
  counterpart by design.

## Maintaining the map

The token names differ between the two files (`panel2` ↔ `--px-panel-2`), so
correspondences are explicit in the `MIRROR` table in the script. When you add a
**newly mirrored** token (a theme.ts color that also gets a CSS var), add one
`['THEME.x', '--px-x']` or `['CELL.x', '--px-x']` line to `MIRROR`. Gem vars need
no edit — they're detected by `--gem-<name>` presence.
