import type { AggregatedWaveMetrics, ComparisonResult, Snapshot } from './types';
import type { SnapshotMeta } from './snapshot';

function pad(s: string, n: number, right = false): string {
  return right ? s.padEnd(n) : s.padStart(n);
}

function fmtNum(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function printTable(waves: AggregatedWaveMetrics[], trials: number): void {
  console.log(`\nWave Difficulty Evaluation (${trials} trials, 13-tower reference panel)`);
  console.log('─'.repeat(88));
  console.log(
    `${pad('Wave', 5)} │ ${pad('Composite', 9)} │ ${pad('Leaks', 7)} │ ${pad('Alive', 7)} │ ${pad('AvgPath', 7)} │ ${pad('MaxPath', 7)} │ ${pad('Ticks', 7)} │ ${pad('Damage', 12)}`,
  );
  console.log(`${'─'.repeat(5)}─┼─${'─'.repeat(9)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(12)}`);

  for (const w of waves) {
    const row = [
      pad(String(w.waveNum), 5),
      pad(fmtNum(w.composite, 3), 9),
      pad(fmtNum(w.meanLeaks), 7),
      pad(fmtNum(w.meanSurvived), 7),
      pad(fmtNum(w.meanAvgPathPos, 3), 7),
      pad(fmtNum(w.meanMaxPathPos, 3), 7),
      pad(fmtInt(w.meanTicksToComplete), 7),
      pad(fmtInt(w.meanTotalDamage), 12),
    ];
    console.log(row.join(' │ '));
  }

  console.log('');
  const tierCount = Math.floor(waves.length / 10);
  console.log('── Tier averages ──');
  for (let t = 0; t < tierCount; t++) {
    const tier = waves.slice(t * 10, t * 10 + 10);
    const avg = tier.reduce((s, w) => s + w.composite, 0) / tier.length;
    console.log(`  Tier ${t + 1} (waves ${t * 10 + 1}-${t * 10 + 10}): composite avg ${fmtNum(avg, 3)}`);
  }
}

export function printComparison(result: ComparisonResult): void {
  console.log(`\nWave Difficulty Comparison`);
  console.log(`  Base:    ${result.base.shortHash} (${result.base.message})`);
  console.log(`  Current: ${result.current.shortHash} (${result.current.message})`);
  console.log('─'.repeat(72));
  console.log(
    `${pad('Wave', 5)} │ ${pad('Base', 7)} │ ${pad('Current', 7)} │ ${pad('Delta', 7)} │ ${pad('Δ%', 7)} │ Flag`,
  );
  console.log(`${'─'.repeat(5)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(7)}─┼─${'─'.repeat(12)}`);

  for (const d of result.deltas) {
    const flag = d.flag === 'regression'
      ? '\x1b[31m▲ harder\x1b[0m'
      : d.flag === 'improvement'
        ? '\x1b[32m▼ easier\x1b[0m'
        : '';
    console.log([
      pad(String(d.waveNum), 5),
      pad(fmtNum(d.base.composite, 3), 7),
      pad(fmtNum(d.current.composite, 3), 7),
      pad((d.compositeDelta >= 0 ? '+' : '') + fmtNum(d.compositeDelta, 3), 7),
      pad((d.compositeDeltaPct >= 0 ? '+' : '') + fmtNum(d.compositeDeltaPct, 1) + '%', 7),
      flag,
    ].join(' │ '));
  }

  if (result.flags.length > 0) {
    console.log('');
    console.log('── Flags ──');
    for (const f of result.flags) {
      const color = f.severity === 'critical' ? '\x1b[31m' : '\x1b[33m';
      console.log(`  ${color}${f.severity.toUpperCase()}\x1b[0m wave ${f.wave}: ${f.message}`);
    }
  }
}

export function printHistory(metas: SnapshotMeta[]): void {
  if (metas.length === 0) {
    console.log('No snapshots found.');
    return;
  }
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`${pad('Date', 12)} │ ${pad('Hash', 8)} │ ${pad('Trials', 6)} │ ${pad('Message', 35, true)}`);
  console.log(`${'─'.repeat(12)}─┼─${'─'.repeat(8)}─┼─${'─'.repeat(6)}─┼─${'─'.repeat(35)}`);
  for (const m of metas) {
    console.log([
      pad(m.date, 12),
      pad(m.shortHash, 8),
      pad(String(m.trials), 6),
      pad(m.message.slice(0, 35), 35, true),
    ].join(' │ '));
  }
}
