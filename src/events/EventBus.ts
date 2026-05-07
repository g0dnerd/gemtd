/**
 * Tiny typed pub/sub. Used by gameplay systems to announce events the UI
 * (and a future audio module) can subscribe to without coupling.
 */

import type { Quality } from '../render/theme';
import type { GemType } from '../render/theme';

export interface GameEvents {
  'phase:enter': { phase: 'title' | 'build' | 'wave' | 'gameover' | 'victory' };
  'wave:start': { wave: number };
  'wave:end': { wave: number; lifeLost: number; goldEarned: number };
  'creep:spawn': { id: number };
  'creep:die': { id: number; bounty: number };
  'creep:leak': { id: number };
  'tower:placed': { id: number; x: number; y: number; gem: GemType; quality: Quality };
  'tower:fire': { id: number; targetId: number };
  'tower:hit': { id: number; targetId: number; damage: number };
  'gold:change': { gold: number };
  'lives:change': { lives: number };
  'draws:roll': { count: number };
  'draws:change': Record<string, never>;
  'combine:done': {
    inputIds: number[];
    outputGem: GemType;
    outputQuality: Quality;
  };
  'tower:upgrade': { id: number; comboKey: string; tier: number };
  'toast': { kind: 'info' | 'good' | 'error'; text: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => {
      set!.delete(handler as Handler<unknown>);
    };
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as Handler<GameEvents[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] handler for ${String(event)} threw`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
