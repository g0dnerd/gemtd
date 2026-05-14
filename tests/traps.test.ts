import { describe, expect, it } from "vitest";
import { Traps } from "../src/systems/Traps";
import { emptyState, State, TowerState, CreepState } from "../src/game/State";
import { BASE, Cell } from "../src/data/map";
import { EventBus } from "../src/events/EventBus";
import { RNG } from "../src/game/rng";
import { FINE_TILE, RUNES_ENABLED } from "../src/game/constants";
import { findRoute, flattenRoute } from "../src/systems/Pathfinding";
import { BuildPhase } from "../src/controllers/BuildPhase";
import { COMBOS, comboStatsAtTier, findCombo } from "../src/data/combos";
import { isBuildable } from "../src/data/map";
import { Quality } from "../src/render/theme";

const describeRunes = RUNES_ENABLED ? describe : describe.skip;

interface FakeGame {
  state: State;
  bus: EventBus;
  rng: RNG;
  nextId(): number;
  refreshRoute(): boolean;
  selectTower(id: number | null): void;
  selectRock(id: number | null): void;
  enterWave(): void;
}

function setup() {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.phase = "wave";
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
    selectTower: () => {},
    selectRock: () => {},
    enterWave: () => {},
  };
  game.refreshRoute();
  return { game, state, bus, rng };
}

function makeTrap(
  game: FakeGame,
  comboKey: string,
  x: number,
  y: number,
): TowerState {
  const id = game.nextId();
  const combo = COMBOS.find((c) => c.key === comboKey)!;
  const trap: TowerState = {
    id,
    x,
    y,
    gem: combo.visualGem,
    quality: 3 as Quality,
    comboKey,
    lastFireTick: 0,
    kills: 0,
    isTrap: true,
    lastTriggerTick: -99999,
  };
  game.state.towers.push(trap);
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      game.state.grid[y + dy][x + dx] = Cell.Trap;
    }
  }
  return trap;
}

function makeCreep(game: FakeGame, px: number, py: number): CreepState {
  const id = game.nextId();
  const creep: CreepState = {
    id,
    kind: "normal",
    pathPos: 5,
    px,
    py,
    hp: 1000,
    maxHp: 1000,
    speed: 2,
    bounty: 5,
    color: "ruby",
    alive: true,
    armorReduction: 0,
    armor: 0,
    slowResist: 0,
  };
  game.state.creeps.push(creep);
  return creep;
}

describeRunes("Traps system", () => {
  it("triggers when a creep is inside the trap footprint", () => {
    const { game, state } = setup();
    const trap = makeTrap(game, "rune_damage", 10, 10);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(creep.hp).toBeLessThan(1000);
    expect(trap.lastTriggerTick).toBe(1);
  });

  it("does not trigger when creep is outside the footprint", () => {
    const { game, state } = setup();
    makeTrap(game, "rune_damage", 10, 10);
    const farX = 20 * FINE_TILE;
    const farY = 20 * FINE_TILE;
    const creep = makeCreep(game, farX, farY);

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(creep.hp).toBe(1000);
  });

  it("respects cooldown between triggers", () => {
    const { game, state } = setup();
    makeTrap(game, "rune_damage", 10, 10);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);

    const traps = new Traps(game as any);

    state.tick = 1;
    traps.step();
    const hpAfterFirst = creep.hp;
    expect(hpAfterFirst).toBeLessThan(1000);

    state.tick = 2;
    traps.step();
    expect(creep.hp).toBe(hpAfterFirst);
  });

  it("trap_root applies stun to creep", () => {
    const { game, state } = setup();
    makeTrap(game, "rune_holding", 10, 10);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(creep.stun).toBeDefined();
    expect(creep.stun!.expiresAt).toBeGreaterThan(1);
  });

  it("trap_knockback moves creep backward along path", () => {
    const { game, state } = setup();
    makeTrap(game, "rune_teleport", 10, 10);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);
    creep.pathPos = 10;

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(creep.pathPos).toBeLessThan(10);
  });

  it("trap_slow applies slow effect to creep", () => {
    const { game, state } = setup();
    makeTrap(game, "rune_slow", 10, 10);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(creep.slow).toBeDefined();
    expect(creep.slow!.factor).toBeLessThan(1);
    expect(creep.slow!.expiresAt).toBeGreaterThan(1);
  });

  it("does not trigger during build phase", () => {
    const { game, state } = setup();
    state.phase = "build";
    makeTrap(game, "rune_damage", 10, 10);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(creep.hp).toBe(1000);
  });

  it("kills creep and awards bounty on lethal damage", () => {
    const { game, state } = setup();
    makeTrap(game, "rune_damage", 10, 10);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);
    creep.hp = 1;
    const goldBefore = state.gold;

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(creep.alive).toBe(false);
    expect(state.gold).toBe(goldBefore + creep.bounty);
    expect(state.totalKills).toBe(1);
  });

  it("skips dead creeps", () => {
    const { game, state } = setup();
    const trap = makeTrap(game, "rune_damage", 10, 10);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);
    creep.alive = false;

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(trap.lastTriggerTick).toBe(-99999);
  });

  it("skips non-trap towers", () => {
    const { game, state } = setup();
    const id = game.nextId();
    const normalTower: TowerState = {
      id,
      x: 10,
      y: 10,
      gem: "ruby",
      quality: 3 as Quality,
      lastFireTick: 0,
      kills: 0,
    };
    state.towers.push(normalTower);
    const cx = 10 * FINE_TILE + FINE_TILE / 2;
    const cy = 10 * FINE_TILE + FINE_TILE / 2;
    const creep = makeCreep(game, cx, cy);

    state.tick = 1;
    const traps = new Traps(game as any);
    traps.step();

    expect(creep.hp).toBe(1000);
  });
});

describeRunes("Traps: Cell.Trap walkability", () => {
  it("Cell.Trap is walkable for pathfinding", () => {
    const grid = BASE.grid.map((r) => r.slice());
    grid[10][10] = Cell.Trap;
    grid[10][11] = Cell.Trap;
    grid[11][10] = Cell.Trap;
    grid[11][11] = Cell.Trap;
    const route = findRoute(grid);
    expect(route).not.toBeNull();
  });

  it("Cell.Trap is not buildable", () => {
    expect(isBuildable(Cell.Trap)).toBe(false);
  });
});

describeRunes("Traps: combine produces trap towers", () => {
  it("Rune of Holding recipe produces a trap tower", () => {
    const grid = BASE.grid.map((r) => r.slice());
    const state = emptyState(grid, 50);
    state.phase = "build";
    const bus = new EventBus();
    const rng = new RNG(7);
    let nextId = 1;
    const game = {
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
      selectTower: () => {},
      selectRock: () => {},
      enterWave: () => {},
    };
    game.refreshRoute();
    const phase = new BuildPhase(game as any);

    const t1: TowerState = {
      id: game.nextId(),
      x: 4,
      y: 4,
      gem: "topaz",
      quality: 3 as Quality,
      lastFireTick: 0,
      kills: 0,
    };
    const t2: TowerState = {
      id: game.nextId(),
      x: 4,
      y: 6,
      gem: "amethyst",
      quality: 2 as Quality,
      lastFireTick: 0,
      kills: 0,
    };
    const t3: TowerState = {
      id: game.nextId(),
      x: 4,
      y: 8,
      gem: "sapphire",
      quality: 2 as Quality,
      lastFireTick: 0,
      kills: 0,
    };
    for (const t of [t1, t2, t3]) {
      state.towers.push(t);
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          state.grid[t.y + dy][t.x + dx] = Cell.Tower;
        }
      }
    }
    state.draws = [t1, t2, t3].map((t, i) => ({
      slotId: i,
      gem: t.gem,
      quality: t.quality,
      placedTowerId: t.id,
    }));

    expect(phase.combine([t1.id, t2.id, t3.id])).toBe(true);
    const result = state.towers[0];
    expect(result.comboKey).toBe("rune_holding");
    expect(result.isTrap).toBe(true);
    expect(state.grid[result.y][result.x]).toBe(Cell.Trap);
  });

  it("findCombo matches all four rune recipes", () => {
    expect(
      findCombo([
        { gem: "topaz", quality: 3 },
        { gem: "amethyst", quality: 2 },
        { gem: "sapphire", quality: 2 },
      ])?.key,
    ).toBe("rune_holding");

    expect(
      findCombo([
        { gem: "diamond", quality: 3 },
        { gem: "opal", quality: 2 },
        { gem: "ruby", quality: 2 },
      ])?.key,
    ).toBe("rune_damage");

    expect(
      findCombo([
        { gem: "aquamarine", quality: 3 },
        { gem: "amethyst", quality: 2 },
        { gem: "diamond", quality: 2 },
      ])?.key,
    ).toBe("rune_teleport");

    expect(
      findCombo([
        { gem: "sapphire", quality: 3 },
        { gem: "aquamarine", quality: 2 },
        { gem: "diamond", quality: 2 },
        { gem: "emerald", quality: 2 },
      ])?.key,
    ).toBe("rune_slow");
  });
});

describeRunes("Traps: combo stats", () => {
  it("rune_damage has positive damage", () => {
    const combo = COMBOS.find((c) => c.key === "rune_damage")!;
    const stats = comboStatsAtTier(combo, 0);
    expect(stats.dmgMin).toBeGreaterThan(0);
    expect(stats.dmgMax).toBeGreaterThan(stats.dmgMin);
  });

  it("rune_holding has trap_root effect", () => {
    const combo = COMBOS.find((c) => c.key === "rune_holding")!;
    const stats = comboStatsAtTier(combo, 0);
    expect(stats.effects.some((e) => e.kind === "trap_root")).toBe(true);
  });

  it("rune_teleport has trap_knockback effect", () => {
    const combo = COMBOS.find((c) => c.key === "rune_teleport")!;
    const stats = comboStatsAtTier(combo, 0);
    expect(stats.effects.some((e) => e.kind === "trap_knockback")).toBe(true);
  });

  it("rune_slow has trap_slow effect", () => {
    const combo = COMBOS.find((c) => c.key === "rune_slow")!;
    const stats = comboStatsAtTier(combo, 0);
    expect(stats.effects.some((e) => e.kind === "trap_slow")).toBe(true);
  });

  it("all rune combos have type trap", () => {
    const runes = COMBOS.filter((c) => c.key.startsWith("rune_"));
    expect(runes.length).toBe(4);
    for (const r of runes) {
      expect(r.type).toBe("trap");
    }
  });
});
