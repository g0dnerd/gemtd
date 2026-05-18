export interface WaveMetrics {
  waveNum: number;
  leaks: number;
  survived: number;
  totalCreeps: number;
  avgPathPos: number;
  maxPathPos: number;
  ticksToComplete: number;
  totalDamageDealt: number;
}

export interface AggregatedWaveMetrics {
  waveNum: number;
  meanLeaks: number;
  meanSurvived: number;
  meanAvgPathPos: number;
  meanMaxPathPos: number;
  meanTicksToComplete: number;
  meanTotalDamage: number;
  composite: number;
}

export interface SnapshotGit {
  commit: string;
  shortHash: string;
  message: string;
  date: string;
  branch: string;
  dirty: boolean;
}

export interface Snapshot {
  version: 1;
  git: SnapshotGit;
  timestamp: string;
  config: { trials: number; towerLabels: string[] };
  waves: AggregatedWaveMetrics[];
}

export interface WaveDelta {
  waveNum: number;
  base: AggregatedWaveMetrics;
  current: AggregatedWaveMetrics;
  compositeDelta: number;
  compositeDeltaPct: number;
  flag: 'regression' | 'improvement' | null;
}

export interface ComparisonResult {
  base: SnapshotGit;
  current: SnapshotGit;
  deltas: WaveDelta[];
  flags: Array<{ wave: number; severity: 'warn' | 'critical'; message: string }>;
}
