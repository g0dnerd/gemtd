import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Snapshot, SnapshotGit } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, 'results');

export function writeSnapshot(snap: Snapshot): string {
  const filePath = resolve(RESULTS_DIR, `${snap.git.commit}.json`);
  writeFileSync(filePath, JSON.stringify(snap, null, 2) + '\n');
  return filePath;
}

export function readSnapshot(commitOrPrefix: string): Snapshot | null {
  const exact = resolve(RESULTS_DIR, `${commitOrPrefix}.json`);
  if (existsSync(exact)) {
    return JSON.parse(readFileSync(exact, 'utf-8'));
  }
  const files = readdirSync(RESULTS_DIR).filter(
    (f) => f.endsWith('.json') && !f.startsWith('compare-') && f.startsWith(commitOrPrefix),
  );
  if (files.length === 1) {
    return JSON.parse(readFileSync(resolve(RESULTS_DIR, files[0]), 'utf-8'));
  }
  return null;
}

export interface SnapshotMeta {
  commit: string;
  shortHash: string;
  date: string;
  branch: string;
  message: string;
  filePath: string;
  medianWaves: Record<string, number>;
}

export function listSnapshots(): SnapshotMeta[] {
  if (!existsSync(RESULTS_DIR)) return [];
  const files = readdirSync(RESULTS_DIR).filter(
    (f) => f.endsWith('.json') && !f.startsWith('compare-'),
  );
  const metas: SnapshotMeta[] = [];
  for (const file of files) {
    const filePath = resolve(RESULTS_DIR, file);
    const snap: Snapshot = JSON.parse(readFileSync(filePath, 'utf-8'));
    const medianWaves: Record<string, number> = {};
    for (const [aiName, aiSnap] of Object.entries(snap.ais)) {
      medianWaves[aiName] = aiSnap.aggregate.medianWave;
    }
    metas.push({
      commit: snap.git.commit,
      shortHash: snap.git.shortHash,
      date: snap.git.date.slice(0, 10),
      branch: snap.git.branch,
      message: snap.git.message,
      filePath,
      medianWaves,
    });
  }
  return metas.sort((a, b) => b.date.localeCompare(a.date));
}

export function findLatestOther(currentCommit: string): Snapshot | null {
  const metas = listSnapshots();
  const other = metas.find((m) => m.commit !== currentCommit);
  if (!other) return null;
  return readSnapshot(other.commit);
}
