/**
 * Tests around build-phase actions: 5-draw rolling, place / undo.
 *
 * We use a minimal Game-like harness because BuildPhase only depends on a
 * subset of the Game surface (state, bus, refreshRoute, nextId, selectTower).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { BuildPhase } from '../src/controllers/BuildPhase';
import { emptyState, State, DRAW_COUNT, activeDraw } from '../src/game/State';
import { BASE, Cell, GRID_H } from '../src/data/map';
import { findRoute, flattenRoute } from '../src/systems/Pathfinding';
import { EventBus } from '../src/events/EventBus';
import { RNG } from '../src/game/rng';

interface FakeGame {
  state: State;
  bus: EventBus;
  rng: RNG;
  nextId(): number;
  refreshRoute(): boolean;
  selectTower(id: number | null): void;
}

function makeFake(): { game: FakeGame; phase: BuildPhase } {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.gold = 1000;
  state.lives = 50;
  state.phase = 'build';
  const bus = new EventBus();
  const rng = new RNG(1);
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
  };
  // BuildPhase is constructed with a Game; emulate enough surface here.
  const phase = new BuildPhase(game as unknown as import('../src/game/Game').Game);
  game.refreshRoute();
  return { game, phase };
}

describe('BuildPhase: rollDraws', () => {
  it('rolls DRAW_COUNT slots with sequential ids', () => {
    const h = makeFake();
    h.phase.rollDraws();
    expect(h.game.state.draws.length).toBe(DRAW_COUNT);
    h.game.state.draws.forEach((d, i) => {
      expect(d.slotId).toBe(i);
      expect(d.placedTowerId).toBe(null);
    });
    expect(h.game.state.activeDrawSlot).toBe(0);
  });
});

describe('BuildPhase: place', () => {
  let h: ReturnType<typeof makeFake>;
  beforeEach(() => { h = makeFake(); });

  it('places the active slot on grass and advances activeDrawSlot', () => {
    h.phase.rollDraws();
    expect(h.game.state.activeDrawSlot).toBe(0);
    const ok = h.phase.place(5, 5);
    expect(ok).toBe(true);
    expect(h.game.state.towers.length).toBe(1);
    expect(h.game.state.grid[5][5]).toBe(Cell.Tower);
    expect(h.game.state.draws[0].placedTowerId).not.toBeNull();
    // Active slot should auto-advance to the next unplaced one (slot 1).
    expect(h.game.state.activeDrawSlot).toBe(1);
  });

  it('rejects placement on a wall tile', () => {
    h.phase.rollDraws();
    const fail = h.phase.place(0, 0);
    expect(fail).toBe(false);
  });

  it('rejects placement that fully blocks the path', () => {
    // Pre-block column 15 (between WP2 and WP3) leaving a single gap at y=22.
    // That gap is the only way through; placing a tower at (15, 22) must
    // be rejected because it would close it.
    for (let y = 2; y < GRID_H - 2; y++) {
      if (y === 22) continue;
      h.game.state.grid[y][15] = Cell.Tower;
    }
    h.game.refreshRoute();
    expect(findRoute(h.game.state.grid)).not.toBeNull();

    h.phase.rollDraws();
    const ok = h.phase.place(15, 22);
    expect(ok).toBe(false);
    expect(h.game.state.grid[22][15]).toBe(Cell.Grass);
  });

  it('refuses to place when there is no active draw', () => {
    // No rollDraws → no slots
    expect(h.phase.place(5, 5)).toBe(false);
  });
});

describe('BuildPhase: setActiveSlot + ready', () => {
  it('lets the player pick a specific unplaced slot', () => {
    const h = makeFake();
    h.phase.rollDraws();
    h.phase.setActiveSlot(3);
    expect(h.game.state.activeDrawSlot).toBe(3);
    expect(activeDraw(h.game.state)?.slotId).toBe(3);
    h.phase.place(5, 5);
    // Slot 3 placed; active should advance to lowest unplaced (slot 0).
    expect(h.game.state.draws[3].placedTowerId).not.toBeNull();
    expect(h.game.state.activeDrawSlot).toBe(0);
  });

  it('ready() is true only when all 5 slots are placed', () => {
    const h = makeFake();
    h.phase.rollDraws();
    expect(h.phase.ready()).toBe(false);
    const tiles: Array<[number, number]> = [
      [4, 4], [4, 6], [6, 4], [6, 6], [8, 4],
    ];
    for (const [x, y] of tiles) {
      h.phase.place(x, y);
    }
    expect(h.phase.ready()).toBe(true);
  });

  it('refuses to setActiveSlot to a placed slot', () => {
    const h = makeFake();
    h.phase.rollDraws();
    h.phase.place(5, 5);
    const placedSlot = h.game.state.draws.find((d) => d.placedTowerId !== null)!;
    const before = h.game.state.activeDrawSlot;
    h.phase.setActiveSlot(placedSlot.slotId);
    // Should not change.
    expect(h.game.state.activeDrawSlot).toBe(before);
  });
});

describe('BuildPhase: undo', () => {
  let h: ReturnType<typeof makeFake>;
  beforeEach(() => { h = makeFake(); });

  it('undo of place removes the tower and returns the slot to the draw pool', () => {
    h.phase.rollDraws();
    const slot0Before = { ...h.game.state.draws[0] };
    h.phase.place(5, 5);
    expect(h.game.state.towers.length).toBe(1);
    expect(h.game.state.draws[0].placedTowerId).not.toBeNull();
    h.phase.undo();
    expect(h.game.state.towers.length).toBe(0);
    expect(h.game.state.grid[5][5]).toBe(Cell.Grass);
    expect(h.game.state.draws[0].placedTowerId).toBe(null);
    // Slot identity preserved.
    expect(h.game.state.draws[0].gem).toBe(slot0Before.gem);
    expect(h.game.state.draws[0].quality).toBe(slot0Before.quality);
    // Active slot is back to 0.
    expect(h.game.state.activeDrawSlot).toBe(0);
  });

  it('undo of nothing is a no-op', () => {
    expect(h.phase.undo()).toBe(false);
  });
});
