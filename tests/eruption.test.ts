import { describe, expect, it } from "vitest";
import { Combat } from "../src/systems/Combat";
import { emptyState, CreepState, TowerState, State } from "../src/game/State";
import { BASE } from "../src/data/map";
import { EventBus } from "../src/events/EventBus";
import { RNG } from "../src/game/rng";
import { FINE_TILE, SIM_HZ, TILE } from "../src/game/constants";
import type { Quality } from "../src/render/theme";
import type { Game } from "../src/game/Game";

function makeFakeGame(seed = 42) {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.phase = "wave";
  state.tick = 100;
  state.wave = 1;
  const bus = new EventBus();
  const rng = new RNG(seed);
  let nextId = 1000;
  const game = {
    state,
    bus,
    rng,
    nextId: () => nextId++,
    handleCreepDeath: () => {},
  } as unknown as Game;
  return { game, state, bus };
}

function makeCreep(
  game: Game,
  opts: { hp?: number; x?: number; y?: number } = {},
): CreepState {
  const hp = opts.hp ?? 100000;
  const creep: CreepState = {
    id: game.nextId(),
    kind: "shambler",
    pathPos: 5,
    px: (opts.x ?? 5) * FINE_TILE,
    py: (opts.y ?? 5) * FINE_TILE,
    hp,
    maxHp: hp,
    speed: 2,
    bounty: 5,
    color: "ruby",
    alive: true,
    armorReduction: 0,
    armor: 0,
    slowResist: 0,
    stunResist: 0,
    poisonResist: 0,
    vulnerability: 0,
  };
  game.state.creeps.push(creep);
  return creep;
}

function makeBloodstone(
  game: Game,
  opts: { x?: number; y?: number; upgraded?: boolean } = {},
): TowerState {
  const tower: TowerState = {
    id: game.nextId(),
    x: opts.x ?? 4,
    y: opts.y ?? 4,
    gem: "ruby",
    quality: 5 as Quality,
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0, waveDamage: 0,
    placedWave: 1,
    comboKey: "bloodstone",
    upgradeTier: opts.upgraded ? 1 : 0,
  };
  game.state.towers.push(tower);
  return tower;
}

function step(combat: Combat, state: State, n: number) {
  for (let i = 0; i < n; i++) {
    state.tick++;
    combat.step();
  }
}

describe("eruption mechanic", () => {
  it("builds pressure stacks on each attack", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeBloodstone(game);
    makeCreep(game, { x: 5, y: 5 });

    step(combat, state, SIM_HZ);

    expect(tower.pressureStacks).toBeDefined();
    expect(tower.pressureStacks!).toBeGreaterThan(0);
    expect(tower.pressureStacks!).toBeLessThan(8);
  });

  it("erupts at threshold and resets to 0", () => {
    const { game, state, bus } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeBloodstone(game);
    makeCreep(game, { x: 5, y: 5 });
    tower.pressureStacks = 7;

    let erupted = false;
    bus.on("vfx:eruption", () => { erupted = true; });

    step(combat, state, SIM_HZ);

    expect(erupted).toBe(true);
    // Stacks reset on eruption, then re-accumulate from continued attacks
    expect(tower.pressureStacks!).toBeLessThan(8);
  });

  it("eruption deals distance-based falloff damage", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeBloodstone(game, { x: 4, y: 4 });

    // Close creep: right next to tower
    const close = makeCreep(game, { hp: 500000, x: 5, y: 5 });
    // Edge creep: near edge of 2.5 tile eruption radius
    const edge = makeCreep(game, { hp: 500000 });
    const towerCenterPx = (4 + 1) * FINE_TILE;
    edge.px = towerCenterPx + 2.0 * TILE;
    edge.py = towerCenterPx;
    edge.pathPos = 3;

    tower.pressureStacks = 7;
    const closeHpBefore = close.hp;
    const edgeHpBefore = edge.hp;

    step(combat, state, SIM_HZ);

    const closeDmg = closeHpBefore - close.hp;
    const edgeDmg = edgeHpBefore - edge.hp;

    expect(closeDmg).toBeGreaterThan(0);
    expect(edgeDmg).toBeGreaterThan(0);
    expect(edgeDmg).toBeLessThan(closeDmg);
  });

  it("Ancient Bloodstone erupts at 6 stacks with afterburn", () => {
    const { game, state, bus } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeBloodstone(game, { upgraded: true });
    const creep = makeCreep(game, { x: 5, y: 5, hp: 500000 });
    tower.pressureStacks = 5;

    let erupted = false;
    bus.on("vfx:eruption", () => { erupted = true; });

    step(combat, state, SIM_HZ);

    expect(erupted).toBe(true);
    expect(tower.pressureStacks!).toBeLessThan(6);
    expect(creep.afterburn).toBeDefined();
    expect(creep.afterburn!.dps).toBe(100);
  });

  it("afterburn ticks deal damage over time", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeBloodstone(game, { upgraded: true });
    const creep = makeCreep(game, { x: 5, y: 5, hp: 500000 });

    creep.afterburn = {
      dps: 100,
      expiresAt: state.tick + 3 * SIM_HZ,
      nextTick: state.tick + SIM_HZ,
      ownerId: tower.id,
    };

    const hpBefore = creep.hp;
    step(combat, state, SIM_HZ + 1);

    const dmgFromAll = hpBefore - creep.hp;
    expect(dmgFromAll).toBeGreaterThanOrEqual(100);
  });

  it("pressure stacks persist across phase changes", () => {
    const { game } = makeFakeGame();
    const tower = makeBloodstone(game);
    tower.pressureStacks = 5;

    game.state.phase = "build";
    game.state.phase = "wave";

    expect(tower.pressureStacks).toBe(5);
  });

  it("creeps outside eruption radius take no eruption damage", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeBloodstone(game, { x: 4, y: 4 });

    // In-range creep for the tower to target
    makeCreep(game, { x: 5, y: 5, hp: 500000 });
    // Far creep well outside eruption radius (2.5 tiles = 90px) AND tower range (3.5 tiles)
    const far = makeCreep(game, { hp: 100000 });
    far.px = 20 * FINE_TILE;
    far.py = 20 * FINE_TILE;
    far.pathPos = 1;

    tower.pressureStacks = 7;
    const farHpBefore = far.hp;

    step(combat, state, SIM_HZ);

    expect(far.hp).toBe(farHpBefore);
  });
});
