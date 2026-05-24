import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { listSnapshots, readSnapshot } from "./snapshot";
import type { AggregatedWaveMetrics } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ExpertCorrection {
  wave: number;
  adjustment: number;
  reason: string;
}

export interface CalibrationTarget {
  waveNum: number;
  target: number;
}

function loadExpertCorrections(): ExpertCorrection[] {
  const path = resolve(__dirname, "expert-corrections.json");
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function buildCalibrationTargets(
  snapshotRef?: string,
): CalibrationTarget[] {
  let waves: AggregatedWaveMetrics[];

  if (snapshotRef) {
    const snap = readSnapshot(snapshotRef);
    if (!snap) throw new Error(`Snapshot not found: ${snapshotRef}`);
    waves = snap.waves;
  } else {
    const metas = listSnapshots();
    if (metas.length === 0)
      throw new Error(
        "No snapshots found. Run `npm run wave-difficulty` first.",
      );
    const snap = readSnapshot(metas[0].commit);
    if (!snap) throw new Error("Failed to read latest snapshot");
    waves = snap.waves;
  }

  const corrections = loadExpertCorrections();
  const correctionMap = new Map(corrections.map((c) => [c.wave, c.adjustment]));

  const ranked = waves
    .map((w) => ({ waveNum: w.waveNum, pathPos: w.meanAvgPathPos }))
    .sort((a, b) => a.pathPos - b.pathPos);

  const targets: CalibrationTarget[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const w = ranked[i];
    let target = i + 1;
    const adj = correctionMap.get(w.waveNum);
    if (adj !== undefined) target *= adj;
    targets.push({ waveNum: w.waveNum, target });
  }

  return targets.sort((a, b) => a.waveNum - b.waveNum);
}
