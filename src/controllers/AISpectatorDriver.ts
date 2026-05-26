import type { Game } from '../game/Game';
import type { HeadlessGame } from '../sim/HeadlessGame';
import type { State, TowerState } from '../game/State';
import type { GemType, Quality } from '../render/theme';
import { HeuristicAI } from '../sim/ai/HeuristicAI';
import { COMBO_BY_NAME } from '../data/combos';

interface Annotation {
  type: 'place' | 'combo' | 'keeper' | 'chanceTier' | 'upgradeTower';
  gem?: GemType;
  quality?: Quality;
  x?: number;
  y?: number;
  towerIds?: number[];
  comboName?: string;
  candidates?: Array<{ label: string; score: number }>;
  reason?: string;
  tier?: number;
  cost?: number;
  towerLabel?: string;
}

interface RecordedAction {
  method: string;
  args: unknown[];
  annotation?: Annotation;
}

const TIMING: Record<string, { pre: number; post: number }> = {
  cmdUpgradeChanceTier: { pre: 200, post: 0 },
  cmdUpgradeTower: { pre: 200, post: 0 },
  cmdRemoveRock: { pre: 300, post: 0 },
  cmdStartPlacement: { pre: 0, post: 800 },
  cmdSetActiveSlot: { pre: 100, post: 0 },
  cmdPlace: { pre: 600, post: 400 },
  cmdDowngrade: { pre: 400, post: 0 },
  cmdCombine: { pre: 600, post: 400 },
  cmdDesignateKeep: { pre: 800, post: 0 },
};

const WRAPPED_METHODS = [
  'cmdUpgradeChanceTier',
  'cmdUpgradeTower',
  'cmdStartPlacement',
  'cmdSetActiveSlot',
  'cmdPlace',
  'cmdCombine',
  'cmdDesignateKeep',
  'cmdRemoveRock',
  'cmdDowngrade',
] as const;

type WrappedMethod = (typeof WRAPPED_METHODS)[number];

export class AISpectatorDriver {
  private ai: HeuristicAI;
  private cancelled = false;
  private replayRunning = false;

  constructor() {
    this.ai = new HeuristicAI();
    this.ai.logging = true;
  }

  async runBuild(game: Game): Promise<void> {
    if (this.cancelled) return;
    this.replayRunning = true;

    const recorded: RecordedAction[] = [];
    const state = game.state;

    // 1. Snapshot
    const preRng = game.rng.saveState();
    const preEntityId = game.entityIdCounter;
    const preSelectedTower = game.selectedTowerId;
    const preSelectedRock = game.selectedRockId;
    const preSelectedCreep = game.selectedCreepId;
    const preLogLen = this.ai.log.length;
    const preState = structuredClone(
      Object.assign({} as Record<string, unknown>, state, { undoStack: [] }),
    );

    // 2. Mute events, flag recording, wrap commands
    game.bus.muted = true;
    game._recording = true;
    const originals = this.wrapCommands(game, recorded);

    // 3. Run AI synchronously
    this.ai.playBuild(game as unknown as HeadlessGame);

    // 4. Save post-AI RNG + entity counter
    const postRng = game.rng.saveState();
    const postEntityId = game.entityIdCounter;

    // 5. Unwrap, restore
    this.unwrapCommands(game, originals);
    this.restoreState(game, preState);
    game.rng.restoreState(preRng);
    game.entityIdCounter = preEntityId;
    game.selectedTowerId = preSelectedTower;
    game.selectedRockId = preSelectedRock;
    game.selectedCreepId = preSelectedCreep;
    game.bus.muted = false;
    game._recording = false;
    game.refreshRoute();

    // 6. Parse AI log for keeper annotations
    this.attachKeeperAnnotations(recorded, this.ai.log, preLogLen);

    // 7. Replay with delays
    for (const action of recorded) {
      if (this.cancelled) break;
      const timing = TIMING[action.method] ?? { pre: 0, post: 0 };

      if (timing.pre > 0) {
        this.emitAnnotation(game, action);
        await this.delay(timing.pre);
      }
      if (this.cancelled) break;

      game.bus.emit('ai:clear', {});
      this.executeCommand(game, action);

      if (timing.post > 0) {
        await this.delay(timing.post);
      }
      if (this.cancelled) break;
    }

    // 8. Restore post-AI RNG so subsequent waves use correct sequence
    if (!this.cancelled) {
      game.rng.restoreState(postRng);
      game.entityIdCounter = postEntityId;
    }
    game.bus.emit('ai:clear', {});
    this.replayRunning = false;
  }

  cancel(): void {
    this.cancelled = true;
  }

  get isReplaying(): boolean {
    return this.replayRunning;
  }

  private wrapCommands(
    game: Game,
    recorded: RecordedAction[],
  ): Map<string, (...args: unknown[]) => unknown> {
    const originals = new Map<string, (...args: unknown[]) => unknown>();
    const state = game.state;

    for (const method of WRAPPED_METHODS) {
      const orig = (game[method] as (...args: unknown[]) => unknown).bind(game);
      originals.set(method, orig);

      (game as unknown as Record<string, unknown>)[method] = (
        ...args: unknown[]
      ) => {
        const annotation = this.capturePreAnnotation(method, args, state);
        const result = orig(...args);
        this.capturePostAnnotation(annotation, method, state);
        recorded.push({ method, args, annotation });
        return result;
      };
    }

    return originals;
  }

  private unwrapCommands(
    game: Game,
    originals: Map<string, (...args: unknown[]) => unknown>,
  ): void {
    for (const [method, orig] of originals) {
      (game as unknown as Record<string, unknown>)[method] = orig;
    }
  }

  private capturePreAnnotation(
    method: string,
    args: unknown[],
    state: State,
  ): Annotation | undefined {
    switch (method) {
      case 'cmdPlace': {
        const slot = state.draws.find(
          (d) => d.slotId === state.activeDrawSlot && d.placedTowerId === null,
        );
        if (slot) {
          return {
            type: 'place',
            gem: slot.gem,
            quality: slot.quality,
            x: args[0] as number,
            y: args[1] as number,
          };
        }
        return undefined;
      }
      case 'cmdCombine': {
        const ids = args[0] as number[];
        const towers = ids
          .map((id) => state.towers.find((t) => t.id === id))
          .filter((t): t is TowerState => !!t);
        if (towers.length === 0) return undefined;
        return {
          type: 'combo',
          towerIds: ids,
          x: towers[0].x,
          y: towers[0].y,
        };
      }
      case 'cmdUpgradeChanceTier': {
        return { type: 'chanceTier', tier: state.chanceTier + 1 };
      }
      case 'cmdUpgradeTower': {
        const tower = state.towers.find((t) => t.id === (args[0] as number));
        if (tower?.comboKey) {
          const combo = COMBO_BY_NAME.get(tower.comboKey);
          return {
            type: 'upgradeTower',
            towerLabel: combo?.name ?? tower.comboKey,
            tier: (tower.upgradeTier ?? 0) + 1,
          };
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  private capturePostAnnotation(
    annotation: Annotation | undefined,
    method: string,
    state: State,
  ): void {
    if (!annotation) return;
    if (method === 'cmdCombine' && annotation.type === 'combo') {
      const resultTower = state.towers.find(
        (t) => t.x === annotation.x && t.y === annotation.y,
      );
      if (resultTower?.comboKey) {
        const combo = COMBO_BY_NAME.get(resultTower.comboKey);
        annotation.comboName = combo?.name ?? resultTower.comboKey;
      }
    }
  }

  private attachKeeperAnnotations(
    recorded: RecordedAction[],
    log: string[],
    preLogLen: number,
  ): void {
    let keepAction: RecordedAction | undefined;
    for (let i = recorded.length - 1; i >= 0; i--) {
      if (recorded[i].method === 'cmdDesignateKeep') {
        keepAction = recorded[i];
        break;
      }
    }
    if (!keepAction) return;

    const newEntries = log.slice(preLogLen);
    const candidates: Array<{ label: string; score: number }> = [];
    let reason = '';

    for (const line of newEntries) {
      const candMatch = line.match(/keeper candidate: (.+?) score=(-?\d+)/);
      if (candMatch) {
        candidates.push({ label: candMatch[1], score: Number(candMatch[2]) });
      }
      const keepMatch = line.match(/→ KEEP: (.+?) \(/);
      if (keepMatch) reason = keepMatch[1];
    }

    if (candidates.length > 0) {
      keepAction.annotation = {
        type: 'keeper',
        candidates,
        reason,
        towerIds: [keepAction.args[0] as number],
      };
    }
  }

  private emitAnnotation(game: Game, action: RecordedAction): void {
    if (!action.annotation) return;
    const ann = action.annotation;

    switch (ann.type) {
      case 'place':
        if (
          ann.gem &&
          ann.quality &&
          ann.x !== undefined &&
          ann.y !== undefined
        ) {
          game.bus.emit('ai:highlight', {
            x: ann.x,
            y: ann.y,
            gem: ann.gem,
            quality: ann.quality,
          });
        }
        break;
      case 'combo':
        if (ann.towerIds) {
          game.bus.emit('ai:combo', {
            towerIds: ann.towerIds,
            comboName: ann.comboName ?? '',
          });
        }
        break;
      case 'keeper':
        if (ann.towerIds?.[0] !== undefined) {
          game.bus.emit('ai:keeper', {
            towerId: ann.towerIds[0],
            reason: ann.reason ?? '',
            candidates: ann.candidates ?? [],
          });
        }
        break;
      case 'chanceTier':
        game.bus.emit('toast', {
          kind: 'good',
          text: `AI: Chance tier → L${ann.tier}`,
          duration: 3000,
        });
        break;
      case 'upgradeTower':
        game.bus.emit('toast', {
          kind: 'good',
          text: `AI: Upgrade ${ann.towerLabel} → T${ann.tier}`,
          duration: 3000,
        });
        break;
    }
  }

  private executeCommand(game: Game, action: RecordedAction): void {
    const method = action.method as WrappedMethod;
    const fn = game[method] as (...args: unknown[]) => unknown;
    fn.call(game, ...action.args);
  }

  private restoreState(
    game: Game,
    snapshot: Record<string, unknown>,
  ): void {
    const state = game.state as unknown as Record<string, unknown>;
    for (const key of Object.keys(snapshot)) {
      state[key] = snapshot[key];
    }
    game.state.undoStack = [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
