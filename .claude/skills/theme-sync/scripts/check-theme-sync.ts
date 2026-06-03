/**
 * theme-sync checker.
 *
 * Theme tokens are intentionally duplicated between:
 *   - src/render/theme.ts   (numeric 0xRRGGBB, consumed by PIXI Graphics)
 *   - src/styles/pixel.css  (#rrggbb CSS custom properties, consumed by the HTML HUD)
 * CLAUDE.md requires the two to be kept in sync. This script verifies the
 * subset of tokens that are *supposed* to mirror each other and reports drift.
 *
 * It deliberately does NOT require 1:1 coverage: theme.ts has plenty with no CSS
 * counterpart (RUNE, ROCK_PAL, APEX_STARGEM, per-quality tables) and pixel.css
 * has derived shades (--px-accent-hi, etc.) with no theme.ts source. Only the
 * pairs listed in MIRROR below, plus auto-detected gem vars, are checked.
 *
 * Run:  npx tsx .claude/skills/theme-sync/scripts/check-theme-sync.ts
 * Exit: 0 = in sync, 1 = drift found, 2 = could not run (missing files, etc.)
 *
 * To add a newly-mirrored token: add a [themeRef, cssVar] line to MIRROR.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
// .claude/skills/theme-sync/scripts -> repo root is four levels up.
const repoRoot = resolve(scriptDir, '../../../..');
const themePath = resolve(repoRoot, 'src/render/theme.ts');
const cssPath = resolve(repoRoot, 'src/styles/pixel.css');

/** 0xRRGGBB number -> '#rrggbb' (lowercased). */
function toHex(n: number): string {
  return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
}

/** Normalise a CSS colour to '#rrggbb' lowercase; expands #rgb shorthand. */
function normCss(v: string): string {
  const s = v.trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (!m) return s;
  const h = m[1];
  return h.length === 3 ? '#' + [...h].map((c) => c + c).join('') : '#' + h;
}

type Issue = { level: 'error' | 'info'; msg: string };
const issues: Issue[] = [];
const mappedCssVars = new Set<string>();
const err = (msg: string) => issues.push({ level: 'error', msg });
const info = (msg: string) => issues.push({ level: 'info', msg });

// --- Load theme.ts (zero imports, so it loads standalone via tsx) ---
let THEME: Record<string, number>;
let CELL: Record<string, number>;
let GEM_PALETTE: Record<
  string,
  { name: string; light: number; mid: number; dark: number; css: { name: string; light: string; mid: string; dark: string } }
>;
try {
  const mod = await import(pathToFileURL(themePath).href);
  ({ THEME, CELL, GEM_PALETTE } = mod);
  if (!THEME || !CELL || !GEM_PALETTE) throw new Error('theme.ts is missing THEME/CELL/GEM_PALETTE exports');
} catch (e) {
  console.error(`theme-sync: could not import ${themePath}\n  ${(e as Error).message}`);
  process.exit(2);
}

// --- Parse pixel.css custom properties ---
let css: string;
try {
  css = readFileSync(cssPath, 'utf8');
} catch (e) {
  console.error(`theme-sync: could not read ${cssPath}\n  ${(e as Error).message}`);
  process.exit(2);
}
// A var can be declared more than once (e.g. :root AND .px-theme-cozy both set
// --px-accent). Collect EVERY occurrence with its line, so drift can't hide in a
// site we didn't look at, and so the two CSS sites disagreeing is itself caught.
const cssDefs = new Map<string, { value: string; line: number }[]>();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
  const line = css.slice(0, m.index).split('\n').length;
  const list = cssDefs.get(m[1]) ?? [];
  list.push({ value: normCss(m[2]), line });
  cssDefs.set(m[1], list);
}

/** Compare a theme colour against every CSS declaration of `cssVar`. */
function checkCssVar(label: string, want: string, cssVar: string): void {
  const defs = cssDefs.get(cssVar);
  if (!defs) {
    err(`${cssVar} (mirror of ${label}) is missing from pixel.css`);
    return;
  }
  mappedCssVars.add(cssVar);
  for (const { value, line } of defs) {
    if (value !== want) err(`${label} = ${want}  !=  ${cssVar} = ${value}  (pixel.css:${line})`);
  }
}

/**
 * Pairs that must match. themeRef is 'THEME.x' or 'CELL.x'; cssVar is the
 * custom property name. Naming differs on both sides, so this is explicit.
 */
const MIRROR: [string, string][] = [
  // Core UI palette  (THEME.* <-> --px-*)
  ['THEME.bg', '--px-bg'],
  ['THEME.panel', '--px-panel'],
  ['THEME.panel2', '--px-panel-2'],
  ['THEME.ink', '--px-ink'],
  ['THEME.inkDim', '--px-ink-dim'],
  ['THEME.borderDark', '--px-border-dark'],
  ['THEME.accent', '--px-accent'],
  ['THEME.good', '--px-good'],
  ['THEME.bad', '--px-bad'],
  ['THEME.info', '--px-info'],
  // Variant B "Cobblestone Keep" cell tokens  (CELL.* <-> --px-*)
  ['CELL.wallSeam', '--px-wall-seam'],
  ['CELL.wallBrickAlt', '--px-wall-brick-alt'],
  ['CELL.pathStone', '--px-path-stone'],
  ['CELL.pathStoneAlt', '--px-path-stone-alt'],
  ['CELL.pathMortar', '--px-path-mortar'],
  ['CELL.crystalLight', '--px-crystal-light'],
  ['CELL.crystalCore', '--px-crystal-core'],
  ['CELL.crystalDeep', '--px-crystal-deep'],
];

const tables: Record<string, Record<string, number>> = { THEME, CELL };

for (const [themeRef, cssVar] of MIRROR) {
  const [tbl, key] = themeRef.split('.');
  const themeVal = tables[tbl]?.[key];
  if (themeVal === undefined) {
    err(`${themeRef} is in the mirror map but not exported from theme.ts`);
    continue;
  }
  checkCssVar(themeRef, toHex(themeVal), cssVar);
}

// --- Gems: internal consistency only ---
// The HUD reads gem colors via inline `element.style.setProperty('--gem-glow',
// GEM_PALETTE[gem].css.mid)` (Hud.ts), so there are no static --gem-* CSS vars
// in pixel.css to compare against. We still want to catch numeric-vs-css-string
// drift *inside* a single GEM_PALETTE entry, since both shades are read from
// theme.ts (numeric by PIXI, css by the inline-style path).
for (const [gem, entry] of Object.entries(GEM_PALETTE)) {
  for (const shade of ['light', 'mid', 'dark'] as const) {
    const fromNum = toHex(entry[shade]);
    const fromCss = normCss(entry.css[shade]);
    if (fromNum !== fromCss) {
      err(`GEM_PALETTE.${gem}: numeric .${shade}=${fromNum} != .css.${shade}=${fromCss} (theme.ts internal)`);
    }
  }
  if (entry.name !== entry.css.name) {
    err(`GEM_PALETTE.${gem}: .name="${entry.name}" != .css.name="${entry.css.name}"`);
  }
}

// --- CSS-only vars (no theme.ts source): informational, not drift ---
for (const name of cssDefs.keys()) {
  if (!mappedCssVars.has(name)) info(`CSS-only var ${name} (no theme.ts mirror — derived/HUD-only)`);
}

// --- Report ---
const errors = issues.filter((i) => i.level === 'error');
const infos = issues.filter((i) => i.level === 'info');

if (errors.length) {
  console.error(`\n✗ theme drift: ${errors.length} mismatch(es) between theme.ts and pixel.css\n`);
  for (const i of errors) console.error('  ' + i.msg);
} else {
  console.log('\n✓ theme.ts and pixel.css are in sync (all mirrored tokens match)');
}
if (infos.length) {
  console.log(`\n  notes (${infos.length}, not drift):`);
  for (const i of infos) console.log('    · ' + i.msg);
}
console.log('');

process.exit(errors.length ? 1 : 0);
