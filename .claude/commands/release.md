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

Update the version in **both** of these files:

1. **`package.json`** — the `"version"` field.
2. **`src/ui/Hud.ts`** — the line that sets `wmVer.textContent = "v..."`. Update the string literal to the new version prefixed with `v`.
3. **`src/ui/Title.ts`** — the line that sets `footer.textContent = "v..."`. Update the string literal to the new version prefixed with `v`.

### 3. Changelog (skip if `none`)

If `$ARGUMENTS` is `none`, skip this step entirely.

Otherwise, ask the user:

> Should the changes from this conversation be added to the CHANGES section in `src/ui/TutorialModal.ts`?

If yes:

- Summarize the conversation's changes into short changelog bullet strings (use the same `<b>Tag</b> — description` HTML format as the existing entries).
- Present the proposed bullets to the user for approval/editing.
- Insert a **new version block** at the top of the `versions` array in the `changesBody()` function of `src/ui/TutorialModal.ts`, matching the existing format:

  ```ts
      {
        ver: 'X.Y.Z',
        notes: [
          '<b>Tag</b> — description.',
        ],
      },
  ```

### 4. Commit

Commit **all** uncommitted changes related to the current work — not just the version bump files. This includes any code changes the user made or asked Claude to make across the session.

- Stage all modified and new files that are part of the current work.
- Do NOT stage unrelated untracked files or changes.
- Write a commit message with:
  - **Title**: under 50 characters. If a version bump was applied, e.g. `v0.9.0` or `v0.9.0 — brief summary`. If `none`, use a descriptive title summarizing the changes.
  - **Body**: only if there are substantive changes beyond the version bump; keep it to 1-3 lines max.
  - End with the `Co-Authored-By` trailer.
