import { getGitInfo, getGitInfoForRef, resolveRef } from './git';
import { runAllAIs, ALL_AIS } from './runner';
import { writeSnapshot, readSnapshot, listSnapshots, findLatestOther } from './snapshot';
import { compareSnapshots } from './compare';
import { printRunSummary, printComparison, printHistory } from './format';
import type { Snapshot } from './types';
import { writeFileSync } from 'fs';
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

function handleRun(args: string[]): void {
  const { flags } = parseArgs(args);
  const seedCount = flags.seeds ? parseInt(flags.seeds, 10) : DEFAULT_SEEDS;
  const tag = flags.tag;

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

  console.log(`Running sim for commit ${git.shortHash} (${git.message})...`);
  const aisResult = runAllAIs(seedCount, ALL_AIS);

  const snap: Snapshot = {
    version: 1,
    git,
    timestamp: new Date().toISOString(),
    config: { seedCount, aiNames: ALL_AIS.map((a) => a.name) },
    ais: aisResult,
  };

  const filePath = writeSnapshot(snap);
  printRunSummary(snap);
  console.log(`Saved to ${filePath}`);
}

function handleCompare(args: string[]): void {
  const { positional } = parseArgs(args);
  const ref = positional[0];

  const git = getGitInfo();

  // Load current snapshot
  let current = readSnapshot(git.commit);
  if (!current) {
    console.log(`No snapshot for current commit ${git.shortHash}. Run \`npm run sim:run\` first.`);
    process.exit(1);
  }

  // Load base snapshot
  let base: Snapshot | null = null;
  if (ref) {
    const resolved = resolveRef(ref);
    if (resolved) {
      base = readSnapshot(resolved);
    }
    if (!base) {
      base = readSnapshot(ref);
    }
    if (!base) {
      console.log(`No snapshot found for ref "${ref}". Available snapshots:`);
      printHistory(listSnapshots());
      process.exit(1);
    }
  } else {
    base = findLatestOther(git.commit);
    if (!base) {
      console.log('No other snapshot to compare against. Run sim:run on another commit first.');
      process.exit(1);
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
  run [--seeds N] [--tag <ref>]  Run sim and store snapshot (default: 50 seeds, tagged as HEAD)
  compare [ref]          Compare current snapshot against ref (default: most recent other)
  history [--limit N]    List stored snapshots (default: 20)

Examples:
  npm run sim:run
  npm run sim:compare
  npm run sim:compare -- abc1234
  npm run sim:history
`);
}

const args = process.argv.slice(2);
const subcommand = args[0];

switch (subcommand) {
  case 'run':
    handleRun(args.slice(1));
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
