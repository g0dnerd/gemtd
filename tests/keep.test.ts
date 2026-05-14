/**
 * Tests for build-phase keep-designation + wave-start rock conversion.
 * Replaces the old KeeperPhase tests.
 */

import { describe, expect, it } from 'vitest';
import { BuildPhase } from '../src/controllers/BuildPhase';
import { emptyState, State, TowerState, DrawSlot } from '../src/game/State';
import { BASE, Cell } from '../src/data/map';
import { findRoute, flattenRoute } from '../src/systems/Pathfinding';
import { EventBus } from '../src/events/EventBus';
import { RNG } from '../src/game/rng';
import type { GemType } from '../src/render/theme';

interface FakeGame {
  state: State;
  bus: EventBus;
  rng: RNG;
  nextId(): number;
  refreshRoute(): boolean;
  selectTower(id: number | null): void;
}

function setup() {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.gold = 1000;
  state.lives = 50;
  state.wave = 5;
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
  game.refreshRoute();
  const phase = new BuildPhase(game as unknown as import('../src/game/Game').Game);
  return { game, phase };
}

function placeTower(game: FakeGame, x: number, y: number, gem: GemType): TowerState {
  const id = game.nextId();
  const t: TowerState = { id, x, y, gem, quality: 1, lastFireTick: 0, kills: 0, totalDamage: 0 };
  game.state.towers.push(t);
  // Tower occupies a 2×2 fine-cell footprint anchored at (x, y).
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      game.state.grid[y + dy][x + dx] = Cell.Tower;
    }
  }
  return t;
}

function asDrawSlot(slotId: number, tower: TowerState): DrawSlot {
  return { slotId, gem: tower.gem, quality: tower.quality, placedTowerId: tower.id };
}

describe('BuildPhase.applyKeepAndRock', () => {
  it('rocks every current-round tower except the designated keep', () => {
    const h = setup();
    // Anchors must not overlap (each tower is a 2×2 fine-cell footprint).
    const ts = [
      placeTower(h.game, 4, 4, 'ruby'),
      placeTower(h.game, 4, 6, 'sapphire'),
      placeTower(h.game, 4, 8, 'emerald'),
      placeTower(h.game, 6, 4, 'topaz'),
      placeTower(h.game, 6, 6, 'amethyst'),
    ];
    h.game.state.draws = ts.map((t, i) => asDrawSlot(i, t));
    h.game.state.designatedKeepTowerId = ts[2].id; // keep emerald

    h.phase.applyKeepAndRock();

    // Only the keep remains.
    expect(h.game.state.towers.length).toBe(1);
    expect(h.game.state.towers[0].id).toBe(ts[2].id);
    expect(h.game.state.grid[ts[2].y][ts[2].x]).toBe(Cell.Tower);

    // Other 4 towers each leave a 2×2 rock footprint.
    expect(h.game.state.rocks.length).toBe(4 * 4);
    for (const t of ts) {
      if (t.id === ts[2].id) continue;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          expect(h.game.state.grid[t.y + dy][t.x + dx]).toBe(Cell.Rock);
          expect(
            h.game.state.rocks.some((r) => r.x === t.x + dx && r.y === t.y + dy),
          ).toBe(true);
        }
      }
    }
  });

  it('leaves prior-round towers untouched', () => {
    const h = setup();
    const kept = placeTower(h.game, 2, 5, 'diamond'); // prior-round tower
    const round = [
      placeTower(h.game, 4, 4, 'ruby'),
      placeTower(h.game, 4, 6, 'sapphire'),
    ];
    h.game.state.draws = round.map((t, i) => asDrawSlot(i, t));
    h.game.state.designatedKeepTowerId = round[0].id;

    h.phase.applyKeepAndRock();

    // Kept and round[0] survive; round[1] becomes a 2×2 rock footprint.
    expect(h.game.state.towers.find((t) => t.id === kept.id)).toBeDefined();
    expect(h.game.state.towers.find((t) => t.id === round[0].id)).toBeDefined();
    expect(h.game.state.towers.find((t) => t.id === round[1].id)).toBeUndefined();
    expect(h.game.state.rocks.length).toBe(4);
  });
});
