import type { Snapshot, ComparisonResult, WaveDelta } from './types';

const COMPOSITE_WARN = 0.10;
const COMPOSITE_CRITICAL = 0.25;
const LEAK_WARN = 2;

export function compareSnapshots(base: Snapshot, current: Snapshot): ComparisonResult {
  const deltas: WaveDelta[] = [];
  const flags: ComparisonResult['flags'] = [];

  for (let i = 0; i < base.waves.length; i++) {
    const bw = base.waves[i];
    const cw = current.waves[i];
    if (!cw) continue;

    const compositeDelta = cw.composite - bw.composite;
    const compositeDeltaPct = bw.composite > 0 ? (compositeDelta / bw.composite) * 100 : 0;

    let flag: WaveDelta['flag'] = null;
    if (Math.abs(compositeDeltaPct) >= COMPOSITE_CRITICAL * 100) {
      flag = compositeDelta > 0 ? 'regression' : 'improvement';
      flags.push({
        wave: bw.waveNum,
        severity: 'critical',
        message: `composite ${compositeDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(compositeDeltaPct).toFixed(1)}%`,
      });
    } else if (Math.abs(compositeDeltaPct) >= COMPOSITE_WARN * 100) {
      flag = compositeDelta > 0 ? 'regression' : 'improvement';
      flags.push({
        wave: bw.waveNum,
        severity: 'warn',
        message: `composite ${compositeDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(compositeDeltaPct).toFixed(1)}%`,
      });
    }

    const leakDelta = cw.meanLeaks - bw.meanLeaks;
    if (Math.abs(leakDelta) >= LEAK_WARN && !flag) {
      flag = leakDelta > 0 ? 'regression' : 'improvement';
      flags.push({
        wave: bw.waveNum,
        severity: 'warn',
        message: `leaks ${leakDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(leakDelta).toFixed(1)}`,
      });
    }

    deltas.push({ waveNum: bw.waveNum, base: bw, current: cw, compositeDelta, compositeDeltaPct, flag });
  }

  return { base: base.git, current: current.git, deltas, flags };
}
