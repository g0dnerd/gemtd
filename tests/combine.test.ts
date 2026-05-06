import { describe, expect, it } from 'vitest';
import { BuildPhase } from '../src/controllers/BuildPhase';
import { emptyState, State, TowerState, DrawSlot } from '../src/game/State';
import { BASE, Cell } from '../src/data/map';
import { EventBus } from '../src/events/EventBus';
import { RNG } from '../src/game/rng';
import { findRoute, flattenRoute } from '../src/systems/Pathfinding';
import { Quality } from '../src/render/theme';
import { findCombo } from '../src/data/combos';

interface FakeGame {
  state: State;
  bus: EventBus;
  rng: RNG;
  nextId(): number;
  refreshRoute(): boolean;
  selectTower(id: number | null): void;
  enterWave(): void;
}

function setup() {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.phase = 'build';
  const bus = new EventBus();
  const rng = new RNG(2);
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
    enterWave: () => {},
  };
  const phase = new BuildPhase(game as unknown as import('../src/game/Game').Game);
  game.refreshRoute();
  return { game, phase };
}

function placeTower(game: FakeGame, x: number, y: number, gem: TowerState['gem'], quality: Quality): TowerState {
  const id = game.nextId();
  const t: TowerState = { id, x, y, gem, quality, lastFireTick: 0, kills: 0 };
  game.state.towers.push(t);
  game.state.grid[y][x] = Cell.Tower;
  return t;
}

function asDraws(towers: TowerState[]): DrawSlot[] {
  return towers.map((t, i) => ({ slotId: i, gem: t.gem, quality: t.quality, placedTowerId: t.id }));
}

describe('combine: level-up (current round)', () => {
  it('2 same-gem same-quality → +1 quality', () => {
    const h = setup();
    const ts = [
      placeTower(h.game, 4, 4, 'ruby', 1),
      placeTower(h.game, 4, 5, 'ruby', 1),
    ];
    h.game.state.draws = asDraws(ts);
    expect(h.phase.combine(ts.map((t) => t.id))).toBe(true);
    expect(h.game.state.towers.length).toBe(1);
    expect(h.game.state.towers[0].gem).toBe('ruby');
    expect(h.game.state.towers[0].quality).toBe(2);
  });

  it('4 same-gem same-quality → +2 quality', () => {
    const h = setup();
    const ts = [
      placeTower(h.game, 4, 4, 'ruby', 1),
      placeTower(h.game, 4, 5, 'ruby', 1),
      placeTower(h.game, 4, 6, 'ruby', 1),
      placeTower(h.game, 5, 4, 'ruby', 1),
    ];
    h.game.state.draws = asDraws(ts);
    expect(h.phase.combine(ts.map((t) => t.id))).toBe(true);
    expect(h.game.state.towers.find((t) => t.gem === 'ruby' && t.quality === 3)).toBeDefined();
    // 3 of 4 input tiles became rocks.
    expect(h.game.state.rocks.length).toBe(3);
  });

  it('refuses level-up when not all inputs are current-round', () => {
    const h = setup();
    const t1 = placeTower(h.game, 4, 4, 'ruby', 1);
    const t2 = placeTower(h.game, 4, 5, 'ruby', 1);
    h.game.state.draws = asDraws([t1]); // only t1 is current-round
    expect(h.phase.combine([t1.id, t2.id])).toBe(false);
    expect(h.game.state.towers.length).toBe(2);
  });

  it('refuses 3 same-gem same-quality (only 2 or 4 valid)', () => {
    const h = setup();
    const ts = [
      placeTower(h.game, 4, 4, 'ruby', 1),
      placeTower(h.game, 4, 5, 'ruby', 1),
      placeTower(h.game, 4, 6, 'ruby', 1),
    ];
    h.game.state.draws = asDraws(ts);
    expect(h.phase.combine(ts.map((t) => t.id))).toBe(false);
  });

  it('refuses level-up at perfect quality', () => {
    const h = setup();
    const ts = [
      placeTower(h.game, 4, 4, 'ruby', 5),
      placeTower(h.game, 4, 5, 'ruby', 5),
    ];
    h.game.state.draws = asDraws(ts);
    expect(h.phase.combine(ts.map((t) => t.id))).toBe(false);
  });
});

describe('combine: recipe path', () => {
  it('matches Silver (Chipped Topaz + Chipped Diamond + Chipped Sapphire)', () => {
    const h = setup();
    const ts = [
      placeTower(h.game, 4, 4, 'topaz', 1),
      placeTower(h.game, 4, 5, 'diamond', 1),
      placeTower(h.game, 4, 6, 'sapphire', 1),
    ];
    expect(h.phase.combine(ts.map((t) => t.id))).toBe(true);
    expect(h.game.state.towers.length).toBe(1);
    expect(h.game.state.towers[0].comboKey).toBe('silver');
    expect(h.game.state.rocks.length).toBe(2);
  });

  it('matches Bloodstone (Perfect Ruby + Flawless Aquamarine + Normal Amethyst)', () => {
    const h = setup();
    const ts = [
      placeTower(h.game, 4, 4, 'ruby', 5),
      placeTower(h.game, 4, 5, 'aquamarine', 4),
      placeTower(h.game, 4, 6, 'amethyst', 3),
    ];
    expect(h.phase.combine(ts.map((t) => t.id))).toBe(true);
    expect(h.game.state.towers[0].comboKey).toBe('bloodstone');
  });

  it('matches Gold (2× Amethyst Perfect+Flawless + Flawed Diamond)', () => {
    const h = setup();
    const ts = [
      placeTower(h.game, 4, 4, 'amethyst', 5),
      placeTower(h.game, 4, 5, 'amethyst', 4),
      placeTower(h.game, 4, 6, 'diamond', 2),
    ];
    expect(h.phase.combine(ts.map((t) => t.id))).toBe(true);
    expect(h.game.state.towers[0].comboKey).toBe('gold');
  });

  it('refuses recipe match with wrong qualities', () => {
    const h = setup();
    // Silver requires Chipped (q=1) of all three; pass with q=2 instead.
    const ts = [
      placeTower(h.game, 4, 4, 'topaz', 2),
      placeTower(h.game, 4, 5, 'diamond', 2),
      placeTower(h.game, 4, 6, 'sapphire', 2),
    ];
    expect(h.phase.combine(ts.map((t) => t.id))).toBe(false);
  });

  it('findCombo strict tuple matching', () => {
    expect(findCombo([
      { gem: 'topaz', quality: 1 },
      { gem: 'diamond', quality: 1 },
      { gem: 'sapphire', quality: 1 },
    ])?.key).toBe('silver');
    // Wrong quality combination.
    expect(findCombo([
      { gem: 'topaz', quality: 2 },
      { gem: 'diamond', quality: 1 },
      { gem: 'sapphire', quality: 1 },
    ])).toBeNull();
  });
});

describe('combine: tile fate', () => {
  it('first input tile holds the result; other input tiles become rocks', () => {
    const h = setup();
    const ts = [
      placeTower(h.game, 4, 4, 'ruby', 1),
      placeTower(h.game, 4, 5, 'ruby', 1),
    ];
    h.game.state.draws = asDraws(ts);
    h.phase.combine(ts.map((t) => t.id));
    expect(h.game.state.grid[4][4]).toBe(Cell.Tower);
    expect(h.game.state.grid[5][4]).toBe(Cell.Rock);
  });
});
