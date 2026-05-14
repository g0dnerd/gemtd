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
