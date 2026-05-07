import type { GemType, Quality } from '../render/theme';
import type { HeadlessGame } from './HeadlessGame';

export interface SimAI {
  playBuild(game: HeadlessGame): void;
}

export interface WaveSummary {
  wave: number;
  creepsSpawned: number;
  killed: number;
  leaked: number;
  livesRemaining: number;
  goldAtEnd: number;
  towersCount: number;
  durationTicks: number;
}

export interface TowerSummary {
  id: number;
  gem: GemType;
  quality: Quality;
  comboKey?: string;
  kills: number;
  damageDealt: number;
}

export interface GameResult {
  seed: number;
  waveReached: number;
  finalGold: number;
  finalLives: number;
  waveSummaries: WaveSummary[];
  towerSummaries: TowerSummary[];
  outcome: 'gameover' | 'victory';
}
