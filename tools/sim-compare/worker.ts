import { parentPort } from 'node:worker_threads';
import { HeadlessGame } from '../../src/sim/HeadlessGame';
import { GreedyAI } from '../../src/sim/ai/GreedyAI';
import { BlueprintAI } from '../../src/sim/ai/BlueprintAI';
import { StrategistAI } from '../../src/sim/ai/StrategistAI';
import { HeuristicAI } from '../../src/sim/ai/HeuristicAI';
import type { SimAI } from '../../src/sim/types';

const AI_MAP: Record<string, SimAI> = {
  GreedyAI: new GreedyAI(),
  BlueprintAI: new BlueprintAI(),
  StrategistAI: new StrategistAI(),
  HeuristicAI: new HeuristicAI(),
};

parentPort!.on('message', (msg: { type: string; aiName: string; seed: number }) => {
  if (msg.type === 'run') {
    const ai = AI_MAP[msg.aiName];
    const game = new HeadlessGame(msg.seed);
    const result = game.runGame(ai);
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
