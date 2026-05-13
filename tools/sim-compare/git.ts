import { execSync } from 'child_process';
import type { SnapshotGit } from './types';

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

export function getGitInfo(): SnapshotGit {
  const commit = run('git rev-parse HEAD');
  const shortHash = commit.slice(0, 7);
  const message = run('git log -1 --format=%s');
  const date = run('git log -1 --format=%aI');
  const branch = run('git branch --show-current') || 'detached';
  let dirty = false;
  try {
    execSync('git diff --quiet && git diff --cached --quiet', { encoding: 'utf-8' });
  } catch {
    dirty = true;
  }
  return { commit, shortHash, message, date, branch, dirty };
}

export function getGitInfoForRef(ref: string): SnapshotGit | null {
  try {
    const commit = run(`git rev-parse ${ref}`);
    const shortHash = commit.slice(0, 7);
    const message = run(`git log -1 --format=%s ${commit}`);
    const date = run(`git log -1 --format=%aI ${commit}`);
    return { commit, shortHash, message, date, branch: 'n/a', dirty: false };
  } catch {
    return null;
  }
}

export function resolveRef(ref: string): string | null {
  try {
    return run(`git rev-parse ${ref}`);
  } catch {
    return null;
  }
}
