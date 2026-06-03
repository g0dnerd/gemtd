# Handoff: rename Carnelian → Peridot, swap palette

## Goal

Replace the basic gem **Carnelian** with **Peridot** across the entire codebase.
**Functionality is unchanged.** Only the identifier (`carnelian` → `peridot`), the
display name (`Carnelian` → `Peridot`), and the three palette colors change.

The `charge_burst` effect kind, the ring-FX mechanic, gem stats (damage / range /
atk-speed / spread), and every combo recipe that contains carnelian keep their
behavior verbatim — they just reference the new gem key.

## New palette

| Slot | Old (Carnelian)   | New (Peridot)     | Notes                                     |
|------|-------------------|-------------------|-------------------------------------------|
| light | `#e89060` / `0xe89060` | `#d8f060` / `0xd8f060` | yellow-shifted chartreuse highlight  |
| mid   | `#c06030` / `0xc06030` | `#a8c828` / `0xa8c828` | olivine mid-green                    |
| dark  | `#502818` / `0x502818` | `#445818` / `0x445818` | deep olive shadow                    |
| spec (ring FX only) | `0xffd9b0` (warm peach) | `0xf0ffb0` (pale lime-white) | sharpened highlight inside `PERIDOT_RING` |

Use these values **verbatim**. Don't round, re-tone, or pick a different green.
The point of the rename is to fill the yellow-green hole in the basic-gem
palette; that requires this exact hue zone.

## What to change

Make all edits in one branch. Don't try to keep backwards compat — there is no
save format that depends on the string `"carnelian"`, so a clean global rename is
correct. Don't leave behind alias shims, `// renamed from carnelian` comments,
or re-exports.

### 1. Data + types (load-bearing)

- **`src/render/theme.ts`**
  - Update the `GemType` union: replace `'carnelian'` with `'peridot'`.
  - Update the `GEM_TYPES` array (same position is fine).
  - In `GEM_COLORS`, rename the `carnelian` key to `peridot`, change `name`
    to `'Peridot'`, and swap the three numeric/CSS colors per the table above
    (including `css.name: 'Peridot'`).

- **`src/data/gems.ts`**
  - Rename the `carnelian` key in `GEM_BASES` (or wherever the base block lives)
    to `peridot` and change `name: "Peridot"`. Leave `blurb`, `baseDmg`,
    `spread`, `baseRange`, `baseAtkSpeed`, `effects`, `targeting` unchanged.

- **`src/data/combos.ts`** — replace every occurrence of the string `"carnelian"`
  with `"peridot"`. Affected lines today: 113, 285, 437, 485, 723 (`visualGem`),
  845. Do not change recipe `key` or `name` fields (e.g. `pyrite`, `Raw
  Ametrine`) — those are combo identifiers, not gem identifiers.

- **`src/controllers/BuildPhase.ts`** — line 98, replace `"carnelian"` with
  `"peridot"` inside the wave-1 starter Pyrite cohort
  `["carnelian", "spinel", "aquamarine"]`.

### 2. Rendering

- **`src/render/EntityRenderer.ts`** — this file has both the gem string check
  and the charge-ring FX named after the old gem. Rename everything:
  - String compare `t.gem === "carnelian"` → `t.gem === "peridot"` (line ~536).
  - Constant `CARNELIAN_RING` → `PERIDOT_RING`. Update the three palette entries
    inside it to the new Peridot colors (`light: 0xd8f060`, `mid: 0xa8c828`,
    `dark: 0x445818`) and the `spec` to `0xf0ffb0`.
  - Constants `CARNELIAN_DISCHARGE_MS`, `CARNELIAN_RING_R`, `CARNELIAN_RING_W`
    → `PERIDOT_DISCHARGE_MS`, `PERIDOT_RING_R`, `PERIDOT_RING_W` (values
    unchanged).
  - Module-level cache `carnelianRingTex` → `peridotRingTex`.
  - Helper `carnelianRing(...)` → `peridotRing(...)`.
  - Interface `CarnelianChargeFx` → `PeridotChargeFx`.
  - Render-entry fields: `carnelianChargeFx`, `carnelianChargeTicks`,
    `carnelianLastFireTick`, `carnelianDischargeStart` →
    `peridotChargeFx`, `peridotChargeTicks`, `peridotLastFireTick`,
    `peridotDischargeStart`.
  - Function `animateCarnelianChargeFx` → `animatePeridotChargeFx`.
  - Update the section banner comments (`===== Carnelian — Charge Ring =====`,
    `/** Carnelian charge ring … */`, etc.) to say Peridot. Don't add a
    "(formerly Carnelian)" note.

  Use `Edit` with `replace_all: true` on `carnelian` / `Carnelian` /
  `CARNELIAN` within this file — every occurrence in `EntityRenderer.ts` is
  load-bearing for the rename. Then re-read to spot-check.

### 3. UI

- **`src/ui/Inspector.ts`** — line 596, the `case "carnelian":` arm. Rename
  the case to `"peridot"`. If it sets a display label, change to `"Peridot"`.

### 4. AI players

- **`src/sim/ai/GreedyAI.ts`** line 41 and **`src/sim/ai/HeuristicAI.ts`**
  line 34: the display-name map entry `carnelian: "Carnelian"` becomes
  `peridot: "Peridot"`.

### 5. Telemetry / dashboard

- **`src/worker/dashboard.ts`** line 377: in the gem-color map, rename
  `carnelian: '#e89060'` to `peridot: '#d8f060'`.
- Telemetry rows already in D1 will still carry the string `"carnelian"` as
  the historical gem id. **Do not** add migration code, and do not try to
  back-fill old runs. New runs will write `peridot`. Mention this in the
  PR description so the dashboard reviewer expects the dual labels for a
  while.

### 6. Tests

- **`tests/combine.test.ts`**
  - Line 251: rename the `it("matches Raw Ametrine …")` description from
    `Perfect Carnelian` to `Perfect Peridot`.
  - Line 256 (and any other `placeTower(..., "carnelian", ...)` calls in
    this file): change the gem string to `"peridot"`.
- Run `npm test` and fix any test that fails purely because a string literal
  references the old name. Do **not** edit balance thresholds — the rename
  shouldn't move any numeric outcome; if a balance test fails, stop and report
  before touching it.

### 7. Documentation + skills

- **`CLAUDE.md`**
  - Line ~63: in the `gems.ts` description, replace `garnet, spinel, carnelian`
    with `garnet, spinel, peridot`.
  - Line ~74: replace `**Carnelian** (charged burst)` with
    `**Peridot** (charged burst)`.
  - Line ~76: replace `garnet/spinel/carnelian` with `garnet/spinel/peridot`.

- **`.claude/plans/new-gems-phase2-specials.md`** — this is the original
  phase-2 plan that named the gem. Update every `Carnelian` / `carnelian`
  occurrence (lines ~11, ~22, ~36, ~70, ~86, ~88, ~90). Keep historical accuracy
  by adding a single line at the top: `> Renamed from Carnelian to Peridot
  on <today's date>. Mechanic and recipes unchanged.` — that's the only
  "formerly" note allowed anywhere in the codebase.

- **`.claude/skills/balance-observations/SKILL.md`**
  - Line ~225: row label `carnelian` → `peridot`.
  - Line ~392: in the wave-1 starter description, replace `Pyrite
    (carnelian/spinel/aquamarine)` with `Pyrite (peridot/spinel/aquamarine)`.

- **`.claude/skills/balance-observations/scripts/query-telemetry.ts`**
  - Line ~736: the comment `Pyrite = carnelian/spinel/aquamarine` →
    `Pyrite = peridot/spinel/aquamarine`.
  - Line ~746: the cohort `Set` membership `["carnelian", "spinel",
    "aquamarine"]` → `["peridot", "spinel", "aquamarine"]`.
  - **Important:** historical telemetry rows still carry `"carnelian"` as
    the gem id. Update the Set to include **both** strings during a transition
    period: `new Set(["peridot", "carnelian", "spinel", "aquamarine"])`.
    Add a short comment: `// "carnelian" kept for historical runs before the
    rename — safe to drop once those runs age out of the dashboards.` This is
    the **one** place a backwards-compat alias is appropriate, because the
    data lives in an external D1 we cannot rewrite.

- **`.claude/skills/theme-sync/SKILL.md`**
  - Line ~46: the list `aquamarine, garnet, spinel, carnelian` →
    `aquamarine, garnet, spinel, peridot`.

### 8. Cleanup (optional but recommended)

- The proposal preview HTMLs (`carnelian-replacement-proposals.html`,
  `carnelian-replacement-proposals-2.html`, plus their `.artifact.json`
  siblings) are scratch files from the design exploration. Delete them in
  this same commit unless the user wants them archived.

## Things NOT to change

- The `charge_burst` effect kind in `src/data/gems.ts` and `Combat.ts`. It
  describes the mechanic, not the gem; renaming it would churn unrelated code.
- The combo `name` or `key` fields (`pyrite`, `raw_ametrine`, etc.). They are
  combo identifiers and Peridot is just one ingredient now.
- Gem stat numbers (`baseDmg: 18`, `baseRange: 4.0`, `baseAtkSpeed: 0.8`,
  `spread: 0.2`, `maxMultiplier: 4.0`, `chargeSeconds: 8`). Functionality is
  identical.
- Historical sim-compare result JSONs under `tools/sim-compare/results/` —
  they snapshot past runs that used the name `carnelian`; rewriting them
  would corrupt the history.

## Validation checklist (run in order)

1. `rg -i 'carnelian'` over the repo. After the rename, the **only** remaining
   hits should be: (a) the dashboard-compat Set in
   `query-telemetry.ts`, (b) the one-line "Renamed from Carnelian…" note in
   `new-gems-phase2-specials.md`, (c) historical
   `tools/sim-compare/results/*.json`, and — if not deleted — the proposal
   preview HTMLs.
2. `npm run typecheck` — must pass clean (the `GemType` union touches many
   files; this is the load-bearing check).
3. `npm test` — must pass clean.
4. `npm run dev`, place a Peridot tower, fire a wave. Verify:
   - Tower body renders in the new lime palette.
   - The charge ring shows in the dark olive `#445818` track and fills toward
     the pale lime-white spec on discharge.
   - The Pyrite recipe (peridot + spinel + aquamarine) still detects and forges.
   - The wave-1 starter Pyrite-cohort draw still works.
5. Inspector on a placed Peridot tower shows the new name and the charged-burst
   blurb.

## Release

This is a balance-affecting touch (gem id changes affect telemetry partitioning
and combo recipes). After the validation checklist passes:

- Propose a **minor** bump via `/release` and wait for confirmation. The
  changelog line should read approximately:
  `rename Carnelian → Peridot, swap to lime palette`.
- **Ask** whether to run `/sim-compare` before shipping. Numbers shouldn't
  move, but it's the right gate after a basic-gem identity change.
