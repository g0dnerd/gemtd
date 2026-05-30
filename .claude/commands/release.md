# Release — version bump, changelog, commit

Bump the version, optionally update the in-game changelog, and commit all outstanding work from the current session.

## Arguments

$ARGUMENTS — one of: `major`, `minor`, `patch`, or `none`. Determines which semver segment to bump, or skips the version bump entirely.

## Steps

### 1. Version bump (skip if `none`)

If `$ARGUMENTS` is `none`, skip steps 1 and 2 entirely — no version changes are made.

Otherwise:

- Read the current version from `package.json` (`"version"` field). It follows semver: `MAJOR.MINOR.PATCH`.
- Based on `$ARGUMENTS`:
  - `major` → increment MAJOR, reset MINOR and PATCH to 0
  - `minor` → increment MINOR, reset PATCH to 0
  - `patch` → increment PATCH
- Store the new version string (e.g. `0.9.0`).

### 2. Apply the version bump

Update the version in **`package.json`** — the `"version"` field. That's the only file that needs a manual update; `Hud.ts` and `Title.ts` both read `__GAME_VERSION__` at build time.

### 3. Changelog (skip if `none`)

If `$ARGUMENTS` is `none`, skip this step entirely.

Otherwise, ask the user:

> Should the changes from this conversation be added to the CHANGES section in `src/ui/TutorialModal.ts`?

If yes:

- Summarize the conversation's changes into changelog notes, then present them for approval/editing.
- **Always use specific numeric values, never prose.** Each note states the concrete before/after,
  e.g. `Ancient Bloodstone damage 290-440 -> 270-410.` — not "trimmed Bloodstone's damage." Use ` -> `
  (spaces around the arrow) to match existing entries.
- **One note per changed special gem** (so each is individually scannable). **Wave changes may be
  grouped** into a single note, since they're usually many small per-wave number tweaks.
- Each note is `{ tag, text }`. `tag` is one of `new | buff | nerf | bal | fix`. Use `buff`/`nerf`
  for a single-direction stat change, `bal` for a mixed or neutral retune (e.g. some waves up, one
  down), `new` for content, `fix` for bugfixes.
- Insert a **new version block** at the top of the `versions` array in the `changesBody()` function
  of `src/ui/TutorialModal.ts`, matching the existing format:

  ```ts
      {
        ver: "X.Y.Z",
        notes: [
          { tag: "nerf", text: "Ancient Bloodstone damage 290-440 -> 270-410." },
        ],
      },
  ```

### 4. Verify tests pass (always)

**Before committing, always run `npm test` and confirm it passes.** This applies on every release, including `none`.

- If any test fails, **stop** — do not commit. Report the failures to the user and fix them (or get direction) before proceeding to the commit step.
- Note: `npm test` excludes the heavy `sim.test.ts` / `sim-run.test.ts` by design — that's expected, don't run those here.

### 5. Commit

Commit **all** uncommitted changes related to the current work — not just the version bump files. This includes any code changes the user made or asked Claude to make across the session.

- **Before staging, run `git status` and check for pre-existing staged files.** If the index already contains staged changes unrelated to this session's work, unstage them with `git reset HEAD <file>` first. Only then stage the files from this session.
- Stage all modified and new files that are part of the current work.
- Do NOT stage unrelated untracked files or changes.
- Write a commit message with:
  - **Title**: under 60 characters, lowercase. If a version bump was applied: `vX.Y.Z - short summary` (e.g. `v1.5.0 - container creeps`). If `none`, use `<area>: <verb phrase>` or a plain summary matching the repo's existing style.
  - **Body**: only if there are substantive changes beyond the version bump; keep it to 1-3 lines max.
  - End with the `Co-Authored-By` trailer.

**Note:** `__GAME_VERSION__` is a Vite build-time variable that auto-syncs from `package.json` — all runtime version references (HUD, title screen, telemetry) use it, so only `package.json` needs updating.
