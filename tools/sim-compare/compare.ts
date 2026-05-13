import type {
  Snapshot,
  AggregateStats,
  ComparisonResult,
  AIComparison,
  MetricDelta,
  GemShareDelta,
  Flag,
  FlagSeverity,
} from './types';

interface ThresholdDef {
  warn: number;
  critical: number;
  direction: 'higher-better' | 'lower-better';
}

const AGGREGATE_THRESHOLDS: Partial<Record<keyof AggregateStats, ThresholdDef>> = {
  medianWave:  { warn: 1, critical: 2, direction: 'higher-better' },
  p10Wave:     { warn: 1, critical: 2, direction: 'higher-better' },
  p90Wave:     { warn: 1, critical: 2, direction: 'higher-better' },
  meanWave:    { warn: 1, critical: 2, direction: 'higher-better' },
  victoryRate: { warn: 0.05, critical: 0.10, direction: 'higher-better' },
};

const GEM_SHARE_WARN = 5;
const GEM_SHARE_CRITICAL = 10;

function makeMetricDelta(base: number, current: number, threshold?: ThresholdDef): MetricDelta {
  const delta = current - base;
  const deltaPercent = base !== 0 ? Math.round((delta / Math.abs(base)) * 1000) / 10 : 0;
  let flag: MetricDelta['flag'] = null;
  if (threshold) {
    const isRegression = threshold.direction === 'higher-better' ? delta < 0 : delta > 0;
    const absDelta = Math.abs(delta);
    if (absDelta >= threshold.warn) {
      flag = isRegression ? 'regression' : 'improvement';
    }
  }
  return { base, current, delta, deltaPercent, flag };
}

function makeShareDelta(gem: string, base: number, current: number): GemShareDelta {
  const delta = Math.round((current - base) * 10) / 10;
  let flag: GemShareDelta['flag'] = null;
  if (Math.abs(delta) >= GEM_SHARE_WARN) {
    flag = delta > 0 ? 'improvement' : 'regression';
  }
  return { gem, base, current, delta, flag };
}

function compareAI(
  aiName: string,
  base: Snapshot['ais'][string],
  current: Snapshot['ais'][string],
  flags: Flag[],
): AIComparison {
  const aggregate = {} as AIComparison['aggregate'];
  for (const key of Object.keys(base.aggregate) as Array<keyof AggregateStats>) {
    const threshold = AGGREGATE_THRESHOLDS[key];
    const md = makeMetricDelta(base.aggregate[key], current.aggregate[key], threshold);
    aggregate[key] = md;

    if (md.flag === 'regression' && threshold) {
      const absDelta = Math.abs(md.delta);
      const severity: FlagSeverity = absDelta >= threshold.critical ? 'critical' : 'warn';
      flags.push({
        ai: aiName,
        metric: key,
        severity,
        message: `${key}: ${base.aggregate[key]} -> ${current.aggregate[key]} (${md.delta >= 0 ? '+' : ''}${md.delta})`,
      });
    }
  }

  const allGems = new Set([
    ...Object.keys(base.gemDamageShare),
    ...Object.keys(current.gemDamageShare),
  ]);
  const gemDamageShift: GemShareDelta[] = [];
  for (const gem of allGems) {
    const sd = makeShareDelta(gem, base.gemDamageShare[gem] ?? 0, current.gemDamageShare[gem] ?? 0);
    gemDamageShift.push(sd);
    if (Math.abs(sd.delta) >= GEM_SHARE_WARN) {
      const severity: FlagSeverity = Math.abs(sd.delta) >= GEM_SHARE_CRITICAL ? 'critical' : 'warn';
      flags.push({
        ai: aiName,
        metric: `damage share (${gem})`,
        severity,
        message: `${gem} damage share: ${sd.base}% -> ${sd.current}% (${sd.delta >= 0 ? '+' : ''}${sd.delta}pp)`,
      });
    }
  }
  gemDamageShift.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const allKillGems = new Set([
    ...Object.keys(base.gemKillShare),
    ...Object.keys(current.gemKillShare),
  ]);
  const gemKillShift: GemShareDelta[] = [];
  for (const gem of allKillGems) {
    gemKillShift.push(makeShareDelta(gem, base.gemKillShare[gem] ?? 0, current.gemKillShare[gem] ?? 0));
  }
  gemKillShift.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { aggregate, gemDamageShift, gemKillShift };
}

export function compareSnapshots(base: Snapshot, current: Snapshot): ComparisonResult {
  const flags: Flag[] = [];
  const ais: Record<string, AIComparison> = {};

  for (const aiName of Object.keys(current.ais)) {
    if (!base.ais[aiName]) continue;
    ais[aiName] = compareAI(aiName, base.ais[aiName], current.ais[aiName], flags);
  }

  return { base: base.git, current: current.git, ais, flags };
}
