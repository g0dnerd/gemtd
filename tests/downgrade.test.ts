import { describe, expect, it } from 'vitest';
import { BuildPhase } from '../src/controllers/BuildPhase';
import { emptyState, State, TowerState, DrawSlot } from '../src/game/State';
import { BASE, Cell } from '../src/data/map';
import { EventBus } from '../src/events/EventBus';
import { RNG } from '../src/game/rng';
import { findRoute, flattenRoute } from '../src/systems/Pathfinding';
import type { Quality } from '../src/render/theme';

interface FakeGame {
  state: State;
  bus: EventBus;
  rng: RNG;
  nextId(): number;
  refreshRoute(): boolean;
  selectTower(id: number | null): void;
  enterWave(): void;
  waveStarted: boolean;
}

function setup() {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.phase = 'build';
  state.wave = 1;
  const bus = new EventBus();
  const rng = new RNG(42);
  let nextId = 1;
  const game: FakeGame = {
    state,
    bus,
    rng,
    nextId: () => nextId++,
    refreshRoute() {
      const r = findRoute(state.grid);
      if (!r) return false;
      state.routeSegments = r;
      state.flatRoute = flattenRoute(r);
      return true;
    },
    selectTower: (id) => { state.selectedTowerId = id; },
    enterWave: () => { game.waveStarted = true; },
    waveStarted: false,
  };
  const phase = new BuildPhase(game as unknown as import('../src/game/Game').Game);
  game.refreshRoute();
  return { game, phase };
}

function placeTower(game: FakeGame, x: number, y: number, gem: TowerState['gem'], quality: Quality): TowerState {
  const id = game.nextId();
  const t: TowerState = { id, x, y, gem, quality, lastFireTick: 0, kills: 0 };
  game.state.towers.push(t);
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      game.state.grid[y + dy][x + dx] = Cell.Tower;
    }
  }
  return t;
}

function asDraws(towers: TowerState[]): DrawSlot[] {
  return towers.map((t, i) => ({ slotId: i, gem: t.gem, quality: t.quality, placedTowerId: t.id }));
}

describe('downgrade', () => {
  it('reduces quality by 1 and auto-concludes the round', () => {
    const h = setup();
    const towers = [
      placeTower(h.game, 4, 4, 'ruby', 3),
      placeTower(h.game, 4, 6, 'emerald', 2),
      placeTower(h.game, 6, 4, 'sapphire', 1),
      placeTower(h.game, 6, 6, 'topaz', 2),
      placeTower(h.game, 8, 4, 'opal', 4),
    ];
    h.game.state.draws = asDraws(towers);

    const target = towers[0];
    expect(h.phase.downgrade(target.id)).toBe(true);
    expect(target.quality).toBe(2);
    expect(h.game.state.downgradeUsedThisRound).toBe(true);
    // Auto-concludes: draws cleared, keeper set, wave started
    expect(h.game.state.draws).toHaveLength(0);
    expect(h.game.state.designatedKeepTowerId).toBe(target.id);
    expect(h.game.waveStarted).toBe(true);
    // Other towers became rocks
    expect(h.game.state.towers).toHaveLength(1);
    expect(h.game.state.towers[0].id).toBe(target.id);
  });

  it('rejects downgrade on quality 1 (Chipped)', () => {
    const h = setup();
    const t = placeTower(h.game, 4, 4, 'ruby', 1);
    h.game.state.draws = asDraws([t]);
    expect(h.phase.downgrade(t.id)).toBe(false);
    expect(t.quality).toBe(1);
    expect(h.game.state.downgradeUsedThisRound).toBe(false);
  });

  it('rejects downgrade on combo/special towers', () => {
    const h = setup();
    const t = placeTower(h.game, 4, 4, 'ruby', 3);
    t.comboKey = 'black_opal';
    h.game.state.draws = asDraws([t]);
    expect(h.phase.downgrade(t.id)).toBe(false);
  });

  it('allows only one downgrade per round', () => {
    const h = setup();
    const towers = [
      placeTower(h.game, 4, 4, 'ruby', 3),
      placeTower(h.game, 4, 6, 'emerald', 2),
    ];
    h.game.state.draws = asDraws(towers);
    h.game.state.downgradeUsedThisRound = true;
    expect(h.phase.downgrade(towers[0].id)).toBe(false);
    expect(towers[0].quality).toBe(3);
  });

  it('rejects downgrade on non-current-draw towers', () => {
    const h = setup();
    const kept = placeTower(h.game, 4, 4, 'ruby', 3);
    const current = placeTower(h.game, 4, 6, 'emerald', 2);
    // Only 'current' is in the draws
    h.game.state.draws = asDraws([current]);
    expect(h.phase.downgrade(kept.id)).toBe(false);
    expect(kept.quality).toBe(3);
  });

  it('emits tower:downgrade event', () => {
    const h = setup();
    const t = placeTower(h.game, 4, 4, 'ruby', 4);
    h.game.state.draws = asDraws([t]);

    let emitted: { id: number; oldQuality: number; newQuality: number } | null = null;
    h.game.bus.on('tower:downgrade', (e) => { emitted = e; });

    h.phase.downgrade(t.id);
    expect(emitted).not.toBeNull();
    expect(emitted!.id).toBe(t.id);
    expect(emitted!.oldQuality).toBe(4);
    expect(emitted!.newQuality).toBe(3);
  });

  it('works on combined gems (just drops tier, no split)', () => {
    const h = setup();
    // Simulate a gem that was combined to Flawed (quality 2)
    const t = placeTower(h.game, 4, 4, 'ruby', 2);
    h.game.state.draws = asDraws([t]);
    expect(h.phase.downgrade(t.id)).toBe(true);
    expect(t.quality).toBe(1);
    expect(h.game.state.towers).toHaveLength(1);
  });
});
