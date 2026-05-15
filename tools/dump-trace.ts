/**
 * Runs GreedyAI on a seed and dumps a JSON trace of all decisions + state
 * at each wave boundary. Used for cross-validation with the Zig sim.
 *
 * Usage: npx tsx tools/dump-trace.ts [seed]
 */

import { HeadlessGame } from '../src/sim/HeadlessGame';
import { GreedyAI } from '../src/sim/ai/GreedyAI';

interface PlacementAction {
  slotId: number;
  gem: string;
  quality: number;
  x: number;
  y: number;
  towerId: number;
}

interface WaveTrace {
  wave: number;
  chanceTierBefore: number;
  chanceTierAfter: number;
  placements: PlacementAction[];
  keepTowerId: number;
  combinesDone: Array<{ inputIds: number[]; resultId: number }>;
  upgradesDone: Array<{ towerId: number }>;
  // State after wave completes
  stateAfterWave: {
    lives: number;
    gold: number;
    totalKills: number;
    towerCount: number;
    routeLength: number;
    killed: number;
    leaked: number;
    tick: number;
  };
}

interface GameTrace {
  seed: number;
  waveReached: number;
  outcome: string;
  waves: WaveTrace[];
}

class TracingAI extends GreedyAI {
  traces: WaveTrace[] = [];
  private currentTrace: WaveTrace | null = null;

  playBuild(game: HeadlessGame): void {
    const s = game.state;
    this.currentTrace = {
      wave: s.wave,
      chanceTierBefore: s.chanceTier,
      chanceTierAfter: s.chanceTier,
      placements: [],
      keepTowerId: -1,
      combinesDone: [],
      upgradesDone: [],
      stateAfterWave: {
        lives: 0, gold: 0, totalKills: 0, towerCount: 0,
        routeLength: 0, killed: 0, leaked: 0, tick: 0,
      },
    };

    // Hook into bus events to capture decisions
    const placementHandler = (e: any) => {
      if (!this.currentTrace) return;
      const slot = s.draws.find(d => d.placedTowerId === e.id);
      this.currentTrace.placements.push({
        slotId: slot?.slotId ?? -1,
        gem: e.gem,
        quality: e.quality,
        x: e.x,
        y: e.y,
        towerId: e.id,
      });
    };
    const combineHandler = (e: any) => {
      if (!this.currentTrace) return;
      this.currentTrace.combinesDone.push({
        inputIds: e.inputIds,
        resultId: -1,
      });
    };

    game.bus.on('tower:placed', placementHandler);
    game.bus.on('combine:done', combineHandler);

    // Run the base AI
    super.playBuild(game);

    this.currentTrace.chanceTierAfter = s.chanceTier;
    this.currentTrace.keepTowerId = s.designatedKeepTowerId ?? -1;
  }

  recordWaveEnd(game: HeadlessGame): void {
    if (!this.currentTrace) return;
    const s = game.state;
    this.currentTrace.stateAfterWave = {
      lives: s.lives,
      gold: s.gold,
      totalKills: s.totalKills,
      towerCount: s.towers.length,
      routeLength: s.flatRoute.length,
      killed: s.waveStats.killedThisWave,
      leaked: s.waveStats.leakedThisWave,
      tick: s.tick,
    };
    this.traces.push(this.currentTrace);
    this.currentTrace = null;
  }
}

function runTrace(seed: number): GameTrace {
  const game = new HeadlessGame(seed);
  const ai = new TracingAI();

  game.newGame();

  for (;;) {
    if (game.state.phase !== 'build') break;
    ai.playBuild(game);
    if ((game.state.phase as string) !== 'wave') break;
    game.runWave();
    ai.recordWaveEnd(game);
    if ((game.state.phase as string) === 'wave') {
      game.state.phase = 'gameover' as any;
      break;
    }
  }

  return {
    seed,
    waveReached: game.state.wave,
    outcome: game.state.phase,
    waves: ai.traces,
  };
}

const seed = parseInt(process.argv[2] || '42', 10);
const trace = runTrace(seed);
console.log(JSON.stringify(trace, null, 2));
