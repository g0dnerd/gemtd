import { parentPort, workerData } from 'node:worker_threads';
import { HeadlessGame } from '../../src/sim/HeadlessGame';
import { GreedyAI } from '../../src/sim/ai/GreedyAI';
import { BlueprintAI } from '../../src/sim/ai/BlueprintAI';
import { StrategistAI } from '../../src/sim/ai/StrategistAI';
import { HeuristicAI } from '../../src/sim/ai/HeuristicAI';
import type { SimAI } from '../../src/sim/types';
import { makeTransport, type TelemetryConfig } from './telemetry';

const AI_MAP: Record<string, SimAI> = {
  GreedyAI: new GreedyAI(),
  BlueprintAI: new BlueprintAI(),
  StrategistAI: new StrategistAI(),
  HeuristicAI: new HeuristicAI(),
};

const telemetry: TelemetryConfig | undefined = workerData?.telemetry;
const transport = telemetry ? makeTransport(telemetry.url) : undefined;

parentPort!.on('message', async (msg: { type: string; aiName: string; seed: number }) => {
  if (msg.type === 'run') {
    const ai = AI_MAP[msg.aiName];
    const game = new HeadlessGame(msg.seed);
    const collector = telemetry && transport
      ? game.attachTelemetry({ version: telemetry.version, mode: 'sim', ai: msg.aiName, seed: msg.seed, transport })
      : undefined;
    const result = game.runGame(ai);
    if (collector) {
      collector.finalize(result.outcome);
      await collector.whenDone(); // ensure the POST lands before the worker can be terminated
    }
    parentPort!.postMessage({
      type: 'result',
      aiName: msg.aiName,
      seed: msg.seed,
      result,
      gemDamageShare: game.metrics!.gemDamageShare(),
      gemKillShare: game.metrics!.gemKillShare(),
      dpsVsHp: game.metrics!.dpsVsHpPerWave(),
      waveSummaries: game.metrics!.waveSummaries(),
    });
  }
});

parentPort!.postMessage({ type: 'ready' });
