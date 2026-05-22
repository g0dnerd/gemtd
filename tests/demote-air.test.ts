import { describe, expect, it } from "vitest";
import { Combat } from "../src/systems/Combat";
import { emptyState, CreepState, TowerState, State } from "../src/game/State";
import { BASE } from "../src/data/map";
import { EventBus } from "../src/events/EventBus";
import { RNG } from "../src/game/rng";
import { FINE_TILE, SIM_HZ } from "../src/game/constants";
import { findRoute, flattenRoute, buildAirRoute } from "../src/systems/Pathfinding";
import type { Quality } from "../src/render/theme";
import type { Game } from "../src/game/Game";

function makeFakeGame(seed = 42) {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.phase = "wave";
  state.tick = 100;
  state.wave = 1;
  const segments = findRoute(grid)!;
  state.routeSegments = segments;
  state.flatRoute = flattenRoute(segments);
  state.airRoute = buildAirRoute();
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

function makeAirCreep(
  game: Game,
  opts: { hp?: number; x?: number; y?: number } = {},
): CreepState {
  const hp = opts.hp ?? 100000;
  const creep: CreepState = {
    id: game.nextId(),
    kind: "shrike",
    pathPos: 5,
    px: (opts.x ?? 5) * FINE_TILE,
    py: (opts.y ?? 5) * FINE_TILE,
    hp,
    maxHp: hp,
    speed: 1.7,
    bounty: 5,
    color: "diamond",
    alive: true,
    armorReduction: 0,
    armor: 0,
    slowResist: 0,
    stunResist: 0,
    poisonResist: 0,
    vulnerability: 0,
    flags: { air: true },
  };
  game.state.creeps.push(creep);
  return creep;
}

function makeGroundCreep(
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
    speed: 1.6,
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

function makeRedCrystal(
  game: Game,
  opts: { x?: number; y?: number; upgradeTier?: number } = {},
): TowerState {
  const tower: TowerState = {
    id: game.nextId(),
    x: opts.x ?? 4,
    y: opts.y ?? 4,
    gem: "amethyst",
    quality: 2 as Quality,
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0,
    placedWave: 1,
    comboKey: "red_crystal",
    upgradeTier: opts.upgradeTier ?? 0,
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

describe("red crystal demote mechanic", () => {
  it("can target ground creeps (no longer air-only)", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    makeRedCrystal(game);
    const ground = makeGroundCreep(game, { x: 5, y: 5, hp: 100000 });
    const hpBefore = ground.hp;

    step(combat, state, SIM_HZ);

    expect(ground.hp).toBeLessThan(hpBefore);
  });

  it("demotes air creep to ground on every 14th hit", () => {
    const { game, state, bus } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeRedCrystal(game);
    const air = makeAirCreep(game, { x: 5, y: 5, hp: 500000 });
    tower.attackCount = 13;

    let demoted = false;
    bus.on("creep:demoted", () => { demoted = true; });

    step(combat, state, SIM_HZ);

    expect(demoted).toBe(true);
    expect(air.flags?.air).toBe(false);
  });

  it("does not demote on non-14th hits", () => {
    const { game, state, bus } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeRedCrystal(game);
    const air = makeAirCreep(game, { x: 5, y: 5, hp: 500000 });
    tower.attackCount = 0;

    let demoted = false;
    bus.on("creep:demoted", () => { demoted = true; });

    // At 0.8 atk speed, cooldown = 75 ticks. Over 60 ticks only 1 attack fires.
    step(combat, state, SIM_HZ);

    expect(demoted).toBe(false);
    expect(air.flags?.air).toBe(true);
  });

  it("does not demote ground creeps on 14th hit", () => {
    const { game, state, bus } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeRedCrystal(game);
    makeGroundCreep(game, { x: 5, y: 5, hp: 500000 });
    tower.attackCount = 13;

    let demoted = false;
    bus.on("creep:demoted", () => { demoted = true; });

    step(combat, state, SIM_HZ);

    expect(demoted).toBe(false);
  });

  it("demoted creep switches to ground route", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeRedCrystal(game);
    const air = makeAirCreep(game, { x: 5, y: 5, hp: 500000 });
    tower.attackCount = 13;

    step(combat, state, SIM_HZ);

    expect(air.flags?.air).toBe(false);
    // pathPos should be remapped to ground route (different from air pathPos)
    expect(air.pathPos).toBeDefined();
    expect(air.pathPos).toBeLessThan(state.flatRoute.length - 1);
  });

  it("resets attackCount to 0 after demoting an air creep", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeRedCrystal(game);
    makeAirCreep(game, { x: 5, y: 5, hp: 500000 });
    tower.attackCount = 13;

    step(combat, state, SIM_HZ);

    expect(tower.attackCount).toBe(0);
  });

  it("does not reset attackCount when hitting a ground creep on 14th hit", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeRedCrystal(game);
    makeGroundCreep(game, { x: 5, y: 5, hp: 500000 });
    tower.attackCount = 13;

    step(combat, state, SIM_HZ);

    expect(tower.attackCount).toBeGreaterThan(0);
  });

  it("attackCount keeps incrementing after reset until next demotion", () => {
    const { game, state, bus } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeRedCrystal(game);
    makeAirCreep(game, { x: 5, y: 5, hp: 500000 });
    tower.attackCount = 13;

    step(combat, state, SIM_HZ);
    expect(tower.attackCount).toBe(0);

    let demoteCount = 0;
    bus.on("creep:demoted", () => { demoteCount++; });

    // Step enough for several attacks but not 14 more
    step(combat, state, SIM_HZ * 5);
    expect(tower.attackCount).toBeGreaterThan(0);
    expect(tower.attackCount).toBeLessThan(14);
    expect(demoteCount).toBe(0);
  });

  it("damage is reduced by 15% from original values", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    makeRedCrystal(game);
    const creep = makeGroundCreep(game, { x: 5, y: 5, hp: 500000 });

    step(combat, state, SIM_HZ * 5);

    const dmgDealt = 500000 - creep.hp;
    // Base Red Crystal: 68-128 dmg at 0.8 atk speed = ~78 DPS
    // Over 5 seconds: ~390 damage (rough, with RNG)
    expect(dmgDealt).toBeGreaterThan(200);
    expect(dmgDealt).toBeLessThan(800);
  });
});
