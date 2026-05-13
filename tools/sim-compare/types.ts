export interface SnapshotGit {
  commit: string;
  shortHash: string;
  message: string;
  date: string;
  branch: string;
  dirty: boolean;
}

export interface AggregateStats {
  medianWave: number;
  meanWave: number;
  p10Wave: number;
  p90Wave: number;
  minWave: number;
  maxWave: number;
  meanGold: number;
  meanLives: number;
  victoryRate: number;
}

export interface PerSeedResult {
  seed: number;
  wave: number;
  gold: number;
  lives: number;
  towers: number;
  outcome: 'gameover' | 'victory';
}

export interface DpsHpEntry {
  wave: number;
  avgDps: number;
  avgHp: number;
  ratio: number;
}

export interface AISnapshot {
  aggregate: AggregateStats;
  gemDamageShare: Record<string, number>;
  gemKillShare: Record<string, number>;
  dpsVsHp: DpsHpEntry[];
  perSeed: PerSeedResult[];
}

export interface Snapshot {
  version: 1;
  git: SnapshotGit;
  timestamp: string;
  config: { seedCount: number; aiNames: string[] };
  ais: Record<string, AISnapshot>;
}

export type FlagSeverity = 'warn' | 'critical';

export interface Flag {
  ai: string;
  metric: string;
  severity: FlagSeverity;
  message: string;
}

export interface MetricDelta {
  base: number;
  current: number;
  delta: number;
  deltaPercent: number;
  flag: 'regression' | 'improvement' | null;
}

export interface GemShareDelta {
  gem: string;
  base: number;
  current: number;
  delta: number;
  flag: 'regression' | 'improvement' | null;
}

export interface AIComparison {
  aggregate: Record<keyof AggregateStats, MetricDelta>;
  gemDamageShift: GemShareDelta[];
  gemKillShift: GemShareDelta[];
}

export interface ComparisonResult {
  base: SnapshotGit;
  current: SnapshotGit;
  ais: Record<string, AIComparison>;
  flags: Flag[];
}
