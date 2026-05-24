import { getGitInfo, resolveRef } from './git';
import { evaluate, towerLabels } from './runner';
import { writeSnapshot, readSnapshot, listSnapshots, findLatestOther } from './snapshot';
import { compareSnapshots } from './compare';
import { printTable, printComparison, printHistory } from './format';
import { fit, writeConstants, printFitResult } from './fit';
import type { Snapshot } from './types';

const DEFAULT_TRIALS = 20;

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
  const trials = flags.trials ? parseInt(flags.trials, 10) : DEFAULT_TRIALS;

  console.log('Gathering git info...');
  const git = getGitInfo();
  if (git.dirty) console.log('\x1b[33mWarning: working tree has uncommitted changes\x1b[0m');

  console.log(`Running wave difficulty evaluation (${trials} trials)...`);
  const waves = evaluate(trials, (done, total) => {
    process.stdout.write(`\r  Trial ${done}/${total}`);
  });
  console.log('');

  const snap: Snapshot = {
    version: 1,
    git,
    timestamp: new Date().toISOString(),
    config: { trials, towerLabels: towerLabels() },
    waves,
  };

  printTable(waves, trials);

  const filePath = writeSnapshot(snap);
  console.log(`\nSnapshot saved to ${filePath}`);
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
      console.log(`No snapshot for current commit ${git.shortHash}. Run \`npm run wave-difficulty\` first.`);
      process.exit(1);
    }
    current = snap;

    if (positional.length === 1) {
      base = loadSnapshot(positional[0], 'base');
    } else {
      const other = findLatestOther(git.commit);
      if (!other) {
        console.log('No other snapshot to compare against. Run wave-difficulty on another commit first.');
        process.exit(1);
      }
      base = other;
    }
  }

  const result = compareSnapshots(base, current);
  printComparison(result);
}

function handleHistory(args: string[]): void {
  const { flags } = parseArgs(args);
  const limit = flags.limit ? parseInt(flags.limit, 10) : 20;
  printHistory(listSnapshots().slice(0, limit));
}

function handleCalibrate(args: string[]): void {
  const { flags } = parseArgs(args);
  const snapshotRef = flags.snapshot;
  const shouldWrite = flags.write === 'true';

  console.log('Running calibration optimizer...');
  const result = fit(snapshotRef);
  printFitResult(result);

  if (shouldWrite) {
    writeConstants(result.constants);
    console.log('\nConstants written to src/data/difficulty-constants.ts');
    console.log('Run tests to verify: npm test');
  } else {
    console.log('\nDry run — pass --write to update difficulty-constants.ts');
  }
}

function printUsage(): void {
  console.log(`
Usage: npx tsx tools/wave-difficulty/cli.ts <command> [options]

Commands:
  run [--trials N]               Evaluate all waves and store snapshot (default: ${DEFAULT_TRIALS} trials)
  compare [current] [base]       Compare two snapshots (default: HEAD vs most recent other)
  history [--limit N]            List stored snapshots (default: 20)
  calibrate [--write] [--snapshot <ref>]  Optimize constants against sim + expert data

Examples:
  npm run wave-difficulty
  npm run wave-difficulty -- --trials 50
  npm run wave-difficulty:compare
  npm run wave-difficulty:history
  npm run wave-difficulty:calibrate
  npm run wave-difficulty:calibrate -- --write
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
  case 'calibrate':
    handleCalibrate(args.slice(1));
    break;
  default:
    printUsage();
    process.exit(subcommand ? 1 : 0);
}
