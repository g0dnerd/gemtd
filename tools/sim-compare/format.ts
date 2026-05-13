import type { Snapshot, ComparisonResult, AggregateStats, MetricDelta, Flag } from './types';
import type { SnapshotMeta } from './snapshot';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function green(s: string): string { return `${GREEN}${s}${RESET}`; }
function red(s: string): string { return `${RED}${s}${RESET}`; }
function yellow(s: string): string { return `${YELLOW}${s}${RESET}`; }
function bold(s: string): string { return `${BOLD}${s}${RESET}`; }
function dim(s: string): string { return `${DIM}${s}${RESET}`; }

function pad(v: string | number, width: number): string {
  return String(v).padStart(width);
}

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function fmtDelta(delta: number, higherBetter = true): string {
  if (delta === 0) return dim('--');
  const sign = delta > 0 ? '+' : '';
  const str = `${sign}${delta}`;
  const isGood = higherBetter ? delta > 0 : delta < 0;
  return isGood ? green(str) : red(str);
}

function fmtDeltaRound(delta: number, decimals: number, higherBetter = true): string {
  if (Math.abs(delta) < 0.05) return dim('--');
  const rounded = delta.toFixed(decimals);
  const sign = delta > 0 ? '+' : '';
  const str = `${sign}${rounded}`;
  const isGood = higherBetter ? delta > 0 : delta < 0;
  return isGood ? green(str) : red(str);
}

export function printRunSummary(snap: Snapshot): void {
  const g = snap.git;
  const dirty = g.dirty ? yellow(' (dirty)') : '';
  console.log('');
  console.log(bold(`=== Sim Snapshot: ${g.shortHash}${dirty} ===`));
  console.log(`Branch: ${g.branch} | ${g.date.slice(0, 10)} | ${g.message}`);
  console.log(`Seeds: ${snap.config.seedCount} | AIs: ${snap.config.aiNames.join(', ')}`);
  console.log('');

  const header = `${'AI'.padEnd(16)}| Med Wave | P10 | P90 | Mean Gold | Mean Lives | Win Rate`;
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const [aiName, ai] of Object.entries(snap.ais)) {
    const a = ai.aggregate;
    console.log(
      `${aiName.padEnd(16)}| ${pad(a.medianWave, 8)} | ${pad(a.p10Wave, 3)} | ${pad(a.p90Wave, 3)} | ${pad(a.meanGold, 9)} | ${pad(a.meanLives, 10)} | ${pad(fmtPct(a.victoryRate), 8)}`,
    );
  }
  console.log('');
}

const DISPLAY_METRICS: Array<{ key: keyof AggregateStats; label: string; width: number; higherBetter: boolean; isPercent: boolean }> = [
  { key: 'medianWave',  label: 'Median Wave',  width: 6, higherBetter: true,  isPercent: false },
  { key: 'p10Wave',     label: 'P10 Wave',     width: 6, higherBetter: true,  isPercent: false },
  { key: 'p90Wave',     label: 'P90 Wave',     width: 6, higherBetter: true,  isPercent: false },
  { key: 'meanWave',    label: 'Mean Wave',    width: 6, higherBetter: true,  isPercent: false },
  { key: 'meanGold',    label: 'Mean Gold',    width: 6, higherBetter: true,  isPercent: false },
  { key: 'meanLives',   label: 'Mean Lives',   width: 6, higherBetter: true,  isPercent: false },
  { key: 'victoryRate', label: 'Victory Rate', width: 6, higherBetter: true,  isPercent: true  },
];

export function printComparison(comp: ComparisonResult): void {
  console.log('');
  console.log(bold(`=== ${comp.current.shortHash} vs ${comp.base.shortHash} ===`));
  console.log(`Base:    ${comp.base.shortHash} (${comp.base.date.slice(0, 10)}) ${comp.base.message}`);
  console.log(`Current: ${comp.current.shortHash} (${comp.current.date.slice(0, 10)}) ${comp.current.message}`);
  console.log('');

  const aiNames = Object.keys(comp.ais);

  // Aggregate metrics table
  const metricColWidth = 14;
  const aiColWidth = 22;
  let headerLine = 'Metric'.padEnd(metricColWidth) + '|';
  let sepLine = '-'.repeat(metricColWidth) + '|';
  for (const aiName of aiNames) {
    headerLine += ` ${aiName.padEnd(aiColWidth)}|`;
    sepLine += '-'.repeat(aiColWidth + 1) + '|';
  }
  console.log(headerLine);
  console.log(sepLine);

  for (const metric of DISPLAY_METRICS) {
    let line = metric.label.padEnd(metricColWidth) + '|';
    for (const aiName of aiNames) {
      const md: MetricDelta = comp.ais[aiName].aggregate[metric.key];
      const baseStr = metric.isPercent ? fmtPct(md.base) : String(md.base);
      const curStr = metric.isPercent ? fmtPct(md.current) : String(md.current);
      const deltaStr = metric.isPercent
        ? fmtDeltaRound(md.delta * 100, 0, metric.higherBetter) + (Math.abs(md.delta) >= 0.005 ? 'pp' : '')
        : fmtDelta(md.delta, metric.higherBetter);
      const cell = ` ${pad(baseStr, 5)} ${pad(curStr, 5)} ${deltaStr}`;
      line += cell.padEnd(aiColWidth + 1) + '|';
    }
    console.log(line);
  }
  console.log('');

  // Gem damage share shifts (only show if any flagged)
  for (const aiName of aiNames) {
    const shifts = comp.ais[aiName].gemDamageShift.filter((s) => Math.abs(s.delta) >= 1);
    if (shifts.length === 0) continue;
    console.log(bold(`Gem Damage Share Shifts (${aiName}):`));
    const gemHeader = `${'Gem'.padEnd(14)}| Base   Now   Delta`;
    console.log(gemHeader);
    console.log('-'.repeat(gemHeader.length + 10));
    for (const s of shifts) {
      const deltaStr = fmtDeltaRound(s.delta, 1, false);
      const flagStr = Math.abs(s.delta) >= GEM_SHARE_WARN_THRESHOLD ? yellow(' !!') : '';
      console.log(
        `${s.gem.padEnd(14)}| ${pad(s.base.toFixed(1) + '%', 6)} ${pad(s.current.toFixed(1) + '%', 6)} ${deltaStr}pp${flagStr}`,
      );
    }
    console.log('');
  }

  // Flags summary
  if (comp.flags.length > 0) {
    console.log(bold('=== Flags ==='));
    for (const flag of comp.flags) {
      const icon = flag.severity === 'critical' ? red('[CRITICAL]') : yellow('[WARN]');
      console.log(`  ${icon} ${flag.ai}: ${flag.message}`);
    }
  } else {
    console.log(green('=== No significant regressions detected ==='));
  }
  console.log('');
}

const GEM_SHARE_WARN_THRESHOLD = 5;

export function printHistory(metas: SnapshotMeta[]): void {
  if (metas.length === 0) {
    console.log('No snapshots stored yet. Run `npm run sim:run` to create one.');
    return;
  }

  console.log('');
  console.log(bold('=== Sim Snapshot History ==='));

  const allAIs = new Set<string>();
  for (const m of metas) {
    for (const ai of Object.keys(m.medianWaves)) allAIs.add(ai);
  }
  const aiList = [...allAIs];

  let header = `${'Commit'.padEnd(9)}| ${'Date'.padEnd(12)}| ${'Branch'.padEnd(12)}| ${'Message'.padEnd(40)}|`;
  for (const ai of aiList) {
    header += ` ${ai.replace('AI', '').padEnd(10)}|`;
  }
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const m of metas) {
    let line = `${m.shortHash.padEnd(9)}| ${m.date.padEnd(12)}| ${m.branch.slice(0, 10).padEnd(12)}| ${m.message.slice(0, 38).padEnd(40)}|`;
    for (const ai of aiList) {
      const wave = m.medianWaves[ai];
      line += ` ${wave !== undefined ? pad(wave, 4) : pad('-', 4)}      |`;
    }
    console.log(line);
  }
  console.log('');
}
