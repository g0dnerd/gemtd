export interface Env {
  ASSETS: Fetcher;
  TELEMETRY_RUNS: AnalyticsEngineDataset;
  TELEMETRY_WAVES: AnalyticsEngineDataset;
  TELEMETRY_TOWERS: AnalyticsEngineDataset;
  TELEMETRY_EVENTS: AnalyticsEngineDataset;
  TELEMETRY_SECRET: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
}

export interface TelemetryPayload {
  runId: string;
  version: string;
  mode: "normal" | "hardcore" | "blueprint";
  outcome: "gameover" | "victory";
  run: {
    waveReached: number;
    finalLives: number;
    finalGold: number;
    totalKills: number;
    towerCount: number;
    comboCount: number;
    maxChanceTier: number;
    rocksRemoved: number;
    downgradesUsed: number;
    durationTicks: number;
    totalLeaks: number;
    cleanWaves: number;
  };
  waves: Array<{
    wave: number;
    lives: number;
    gold: number;
    kills: number;
    leaks: number;
    spawned: number;
    durationTicks: number;
    chanceTier: number;
    towerCount: number;
    rockCount: number;
    comboCount: number;
    keeperQuality: number;
    totalDamage: number;
  }>;
  towers: Array<{
    gem: string;
    quality: number;
    comboKey: string;
    upgradeTier: number;
    kills: number;
    totalDamage: number;
    placedWave: number;
    x: number;
    y: number;
  }>;
  events: Array<{
    type: string;
    wave: number;
    gold: number;
    gem: string;
    quality: number;
    cost: number;
    chanceTier: number;
    detail: string;
    value1: number;
  }>;
}
