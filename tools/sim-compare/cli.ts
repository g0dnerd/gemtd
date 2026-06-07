import { getGitInfo, getGitInfoForRef, resolveRef } from './git';
import { runAllAIs, runAllAIsSequential, ALL_AIS } from './runner';
import { writeSnapshot, readSnapshot, listSnapshots, findLatestOther } from './snapshot';
import { compareSnapshots } from './compare';
import { printRunSummary, printComparison, printHistory } from './format';
import type { Snapshot } from './types';
import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, 'results');

const DEFAULT_SEEDS = 50;

function parseArgs(args: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

function generateRandomSeeds(count: number): number[] {
  // 32-bit positive ints, deduped so 8000-seed runs never repeat.
  const seen = new Set<number>();
  const out: number[] = [];
  while (out.length < count) {
    const seed = Math.floor(Math.random() * 0x7fffffff) + 1;
    if (seen.has(seed)) continue;
    seen.add(seed);
    out.push(seed);
  }
  return out;
}

async function handleRun(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const seedCount = flags.seeds ? parseInt(flags.seeds, 10) : DEFAULT_SEEDS;
  const randomSeeds = flags['random-seeds'] === 'true';
  const seeds = randomSeeds
    ? generateRandomSeeds(seedCount)
    : Array.from({ length: seedCount }, (_, i) => i + 1);
  const tag = flags.tag;
  const sequential = flags.sequential === 'true';
  const workerCount = flags.workers ? parseInt(flags.workers, 10) : undefined;

  let git;
  if (tag) {
    console.log(`Resolving git info for ref "${tag}"...`);
    const tagged = getGitInfoForRef(tag);
    if (!tagged) {
      console.log(`Could not resolve ref "${tag}".`);
      process.exit(1);
    }
    git = tagged;
    console.log(`Tagging snapshot as ${git.shortHash} (${git.message})`);
    console.log('\x1b[33mNote: sim runs with current working tree code, tagged as a different commit\x1b[0m');
  } else {
    console.log('Gathering git info...');
    git = getGitInfo();
    if (git.dirty) {
      console.log('\x1b[33mWarning: working tree has uncommitted changes\x1b[0m');
    }
  }

  // Telemetry: off by default. `--telemetry` emits to the local server; add
  // `--remote` (with --telemetry-url or GEMTD_TELEMETRY_URL) to hit production.
  const telemetryEnabled = flags.telemetry === 'true';
  let telemetry: { url: string; version: string } | undefined;
  if (telemetryEnabled) {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
    ) as { version: string };
    let url: string;
    if (flags.remote === 'true') {
      const remoteUrl =
        flags['telemetry-url'] && flags['telemetry-url'] !== 'true'
          ? flags['telemetry-url']
          : process.env.GEMTD_TELEMETRY_URL;
      if (!remoteUrl) {
        console.log('--remote requires a telemetry URL via --telemetry-url <url> or the GEMTD_TELEMETRY_URL env var.');
        process.exit(1);
      }
      url = remoteUrl;
    } else {
      const port = process.env.TELEMETRY_PORT ?? '3456';
      url = `http://localhost:${port}/api/telemetry`;
    }
    telemetry = { url, version: pkg.version };
    console.log(`Telemetry enabled → ${url} (mode=sim, version=${pkg.version})`);
  }

  // Only HeuristicAI emits by default; an explicit --ai still records ai=<name>.
  let aiFilter = flags.ai;
  if (telemetryEnabled && !aiFilter) aiFilter = 'HeuristicAI';
  const ais = aiFilter
    ? ALL_AIS.filter((a) => a.name.toLowerCase() === aiFilter.toLowerCase())
    : ALL_AIS;
  if (ais.length === 0) {
    console.log(`Unknown AI "${aiFilter}". Available: ${ALL_AIS.map((a) => a.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`Running sim for commit ${git.shortHash} (${git.message})...`);
  if (randomSeeds) {
    console.log(`  Using ${seedCount} random seeds (first few: ${seeds.slice(0, 5).join(', ')}…)`);
  }
  const t0 = Date.now();
  const aisResult = await (sequential
    ? runAllAIsSequential(seeds, ais, telemetry)
    : runAllAIs(seeds, ais, workerCount, telemetry));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  Total: ${elapsed}s`);

  const snap: Snapshot = {
    version: 1,
    git,
    timestamp: new Date().toISOString(),
    config: { seedCount, aiNames: ais.map((a) => a.name) },
    ais: aisResult,
  };

  const filePath = writeSnapshot(snap);
  printRunSummary(snap);
  console.log(`Saved to ${filePath}`);
}

function loadSnapshot(ref: string, label: string): Snapshot {
  const resolved = resolveRef(ref);
  let snap = resolved ? readSnapshot(resolved) : null;
  if (!snap) snap = readSnapshot(ref);
  if (!snap) {
    console.log(`No snapshot found for ${label} ref "${ref}". Available snapshots:`);
    printHistory(listSnapshots());
    process.exit(1);
  }
  return snap;
}

function handleCompare(args: string[]): void {
  const { positional } = parseArgs(args);

  let current: Snapshot;
  let base: Snapshot;

  if (positional.length >= 2) {
    current = loadSnapshot(positional[0], 'current');
    base = loadSnapshot(positional[1], 'base');
  } else {
    const git = getGitInfo();
    const snap = readSnapshot(git.commit);
    if (!snap) {
      console.log(`No snapshot for current commit ${git.shortHash}. Run \`npm run sim:run\` first.`);
      process.exit(1);
    }
    current = snap;

    if (positional.length === 1) {
      base = loadSnapshot(positional[0], 'base');
    } else {
      const other = findLatestOther(git.commit);
      if (!other) {
        console.log('No other snapshot to compare against. Run sim:run on another commit first.');
        process.exit(1);
      }
      base = other;
    }
  }

  const result = compareSnapshots(base, current);
  printComparison(result);

  // Write comparison JSON
  const compareFile = resolve(
    RESULTS_DIR,
    `compare-${result.current.shortHash}-vs-${result.base.shortHash}.json`,
  );
  writeFileSync(compareFile, JSON.stringify(result, null, 2) + '\n');
  console.log(`Comparison written to ${compareFile}`);
}

function handleHistory(args: string[]): void {
  const { flags } = parseArgs(args);
  const limit = flags.limit ? parseInt(flags.limit, 10) : 20;
  const metas = listSnapshots().slice(0, limit);
  printHistory(metas);
}

function printUsage(): void {
  console.log(`
Usage: npx tsx tools/sim-compare/cli.ts <command> [options]

Commands:
  run [--seeds N] [--random-seeds] [--tag <ref>] [--ai <name>] [--workers N]
      [--sequential] [--telemetry] [--remote] [--telemetry-url <url>]
                                   Run sim and store snapshot
  compare [current] [base]         Compare two snapshots (default current: HEAD, default base: most recent other)
  history [--limit N]              List stored snapshots (default: 20)

Options for 'run':
  --workers N         Number of worker threads (default: CPU count - 1)
  --sequential        Disable parallelization, run AIs one at a time
  --random-seeds      Use unique random seeds instead of 1..N (no repeats)
  --telemetry         Emit runs to the telemetry pipeline (mode='sim'). Off by
                      default. Defaults --ai to HeuristicAI when --ai is unset.
                      Target is http://localhost:\${TELEMETRY_PORT:-3456}/api/telemetry.
  --remote            Send to a remote ingest URL instead of localhost. Requires
                      --telemetry-url <url> or the GEMTD_TELEMETRY_URL env var.
  --telemetry-url <url>  Explicit remote ingest URL (used with --remote).

Examples:
  npm run sim:run
  npm run sim:run -- --workers 8
  npm run sim:run -- --sequential
  npm run sim:run -- --seeds 8000 --random-seeds
  npm run sim:run -- --telemetry --seeds 10
  GEMTD_TELEMETRY_URL=https://example.com/api/telemetry npm run sim:run -- --telemetry --remote --seeds 5
  npm run sim:compare                          # HEAD vs most recent other
  npm run sim:compare -- abc1234               # HEAD vs abc1234
  npm run sim:compare -- abc1234 def5678       # abc1234 (current) vs def5678 (base)
  npm run sim:history
`);
}

const args = process.argv.slice(2);
const subcommand = args[0];

switch (subcommand) {
  case 'run':
    handleRun(args.slice(1)).catch((err) => {
      console.error(err);
      process.exit(1);
    });
    break;
  case 'compare':
    handleCompare(args.slice(1));
    break;
  case 'history':
    handleHistory(args.slice(1));
    break;
  default:
    printUsage();
    process.exit(subcommand ? 1 : 0);
}
