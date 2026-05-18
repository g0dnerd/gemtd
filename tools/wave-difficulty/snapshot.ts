import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Snapshot } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, 'results');

function ensureDir(): void {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
}

export function writeSnapshot(snap: Snapshot): string {
  ensureDir();
  const filePath = resolve(RESULTS_DIR, `${snap.git.commit}.json`);
  writeFileSync(filePath, JSON.stringify(snap, null, 2) + '\n');
  return filePath;
}

export function readSnapshot(commitOrPrefix: string): Snapshot | null {
  ensureDir();
  const exact = resolve(RESULTS_DIR, `${commitOrPrefix}.json`);
  if (existsSync(exact)) return JSON.parse(readFileSync(exact, 'utf-8'));
  const files = readdirSync(RESULTS_DIR).filter(
    f => f.endsWith('.json') && !f.startsWith('compare-') && f.startsWith(commitOrPrefix),
  );
  if (files.length === 1) return JSON.parse(readFileSync(resolve(RESULTS_DIR, files[0]), 'utf-8'));
  return null;
}

export interface SnapshotMeta {
  commit: string;
  shortHash: string;
  date: string;
  message: string;
  trials: number;
  filePath: string;
}

export function listSnapshots(): SnapshotMeta[] {
  ensureDir();
  const files = readdirSync(RESULTS_DIR).filter(
    f => f.endsWith('.json') && !f.startsWith('compare-'),
  );
  const metas: SnapshotMeta[] = [];
  for (const file of files) {
    const filePath = resolve(RESULTS_DIR, file);
    const snap: Snapshot = JSON.parse(readFileSync(filePath, 'utf-8'));
    metas.push({
      commit: snap.git.commit,
      shortHash: snap.git.shortHash,
      date: snap.git.date.slice(0, 10),
      message: snap.git.message,
      trials: snap.config.trials,
      filePath,
    });
  }
  return metas.sort((a, b) => b.date.localeCompare(a.date));
}

export function findLatestOther(currentCommit: string): Snapshot | null {
  const metas = listSnapshots();
  const other = metas.find(m => m.commit !== currentCommit);
  return other ? readSnapshot(other.commit) : null;
}
