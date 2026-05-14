import { describe, expect, it } from "vitest";
import { armorDamageMultiplier } from "../src/systems/Combat";
import { ARMOR_REDUCTION, ARMOR_NEGATIVE_BONUS } from "../src/data/gemtd-reference";
import { emptyState, CreepState, TowerState } from "../src/game/State";
import { Combat } from "../src/systems/Combat";
import { BASE } from "../src/data/map";
import { EventBus } from "../src/events/EventBus";
import { RNG } from "../src/game/rng";
import { FINE_TILE } from "../src/game/constants";
import type { Quality } from "../src/render/theme";
import type { Game } from "../src/game/Game";

// ─── Formula unit tests ───────────────────────────────────────

describe("armorDamageMultiplier", () => {
  it("armor 0 returns exactly 1.0", () => {
    expect(armorDamageMultiplier(0)).toBe(1);
  });

  it("matches reference table for positive armor 1-35", () => {
    for (let a = 1; a < ARMOR_REDUCTION.length; a++) {
      const got = armorDamageMultiplier(a);
      const want = ARMOR_REDUCTION[a];
      expect(got).toBeCloseTo(want, 2);
    }
  });

  it("matches reference table for negative armor -1 to -10", () => {
    for (let i = 1; i < ARMOR_NEGATIVE_BONUS.length; i++) {
      const got = armorDamageMultiplier(-i);
      const want = ARMOR_NEGATIVE_BONUS[i];
      expect(got).toBeCloseTo(want, 2);
    }
  });

  it("clamps negative armor at -10", () => {
    expect(armorDamageMultiplier(-10)).toBeCloseTo(armorDamageMultiplier(-15), 5);
    expect(armorDamageMultiplier(-10)).toBeCloseTo(armorDamageMultiplier(-100), 5);
  });

  it("positive armor always reduces damage (multiplier < 1)", () => {
    for (let a = 1; a <= 35; a++) {
      expect(armorDamageMultiplier(a)).toBeLessThan(1);
    }
  });

  it("negative armor always amplifies damage (multiplier > 1)", () => {
    for (let a = -1; a >= -10; a--) {
      expect(armorDamageMultiplier(a)).toBeGreaterThan(1);
    }
  });

  it("armor 7 ≈ old armored flag 0.7×", () => {
    expect(armorDamageMultiplier(7)).toBeCloseTo(0.704, 2);
  });
});

// ─── Integration: armor in combat ─────────────────────────────

function makeFakeGame() {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  // Use "build" phase so step() only advances projectiles —
  // no tower auto-fire and no armorReduction reset.
  state.phase = "build";
  state.tick = 100;
  const bus = new EventBus();
  const rng = new RNG(42);
  let nextId = 1;
  const game = {
    state,
    bus,
    rng,
    nextId: () => nextId++,
  } as unknown as Game;
  return { game, state };
}

function makeCreep(game: Game, opts: { armor?: number; armorReduction?: number; armorDebuff?: CreepState["armorDebuff"] } = {}): CreepState {
  const creep: CreepState = {
    id: game.nextId(),
    kind: "normal",
    pathPos: 5,
    px: 5 * FINE_TILE,
    py: 5 * FINE_TILE,
    hp: 10000,
    maxHp: 10000,
    speed: 2,
    bounty: 5,
    color: "ruby",
    alive: true,
    armorReduction: opts.armorReduction ?? 0,
    armor: opts.armor ?? 0,
    armorDebuff: opts.armorDebuff,
    slowResist: 0,
    vulnerability: 0,
  };
  game.state.creeps.push(creep);
  return creep;
}

function makeTower(game: Game): TowerState {
  const tower: TowerState = {
    id: game.nextId(),
    x: 4,
    y: 4,
    gem: "ruby",
    quality: 1 as Quality,
    lastFireTick: 0,
    kills: 0, totalDamage: 0,
  };
  game.state.towers.push(tower);
  return tower;
}

function fireProjectileAndStep(game: Game, combat: Combat, tower: TowerState, creep: CreepState, damage: number) {
  game.state.projectiles.push({
    id: game.nextId(),
    fromX: creep.px,
    fromY: creep.py,
    toX: creep.px,
    toY: creep.py,
    targetId: creep.id,
    t: 0,
    speed: 480,
    damage,
    ownerTowerId: tower.id,
    color: "ruby",
    alive: true,
  });
  combat.step();
}

describe("armor in combat", () => {
  it("armor 0 creep takes full damage", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 0 });
    fireProjectileAndStep(game, combat, tower, creep, 100);
    expect(creep.hp).toBe(10000 - 100);
  });

  it("armor 7 reduces damage by ~0.704×", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 7 });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const expected = Math.round(1000 * armorDamageMultiplier(7));
    expect(creep.hp).toBe(10000 - expected);
  });

  it("armor 3 reduces damage correctly", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 3 });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const expected = Math.round(1000 * armorDamageMultiplier(3));
    expect(creep.hp).toBe(10000 - expected);
  });

  it("proximity armor reduction subtracts from base armor", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 7, armorReduction: 5 });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const expected = Math.round(1000 * armorDamageMultiplier(7 - 5));
    expect(creep.hp).toBe(10000 - expected);
  });

  it("on-hit armor debuff subtracts from base armor", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, {
      armor: 7,
      armorDebuff: { value: 3, expiresAt: game.state.tick + 300 },
    });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const expected = Math.round(1000 * armorDamageMultiplier(7 - 3));
    expect(creep.hp).toBe(10000 - expected);
  });

  it("proximity + on-hit debuffs stack", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, {
      armor: 10,
      armorReduction: 4,
      armorDebuff: { value: 3, expiresAt: game.state.tick + 300 },
    });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const expected = Math.round(1000 * armorDamageMultiplier(10 - 4 - 3));
    expect(creep.hp).toBe(10000 - expected);
  });

  it("armor can go negative — damage is amplified", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 3, armorReduction: 8 });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const effectiveArmor = 3 - 8; // -5
    const expected = Math.round(1000 * armorDamageMultiplier(effectiveArmor));
    expect(expected).toBeGreaterThan(1000);
    expect(creep.hp).toBe(10000 - expected);
  });

  it("negative armor is clamped at -10", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 0, armorReduction: 20 });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const expected = Math.round(1000 * armorDamageMultiplier(-10));
    expect(creep.hp).toBe(10000 - expected);
  });

  it("expired armor debuff is ignored", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, {
      armor: 7,
      armorDebuff: { value: 5, expiresAt: game.state.tick - 1 },
    });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const expected = Math.round(1000 * armorDamageMultiplier(7));
    expect(creep.hp).toBe(10000 - expected);
  });

  it("full shred on armor 7: prox 5 + debuff 5 → effective -3", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, {
      armor: 7,
      armorReduction: 5,
      armorDebuff: { value: 5, expiresAt: game.state.tick + 300 },
    });
    fireProjectileAndStep(game, combat, tower, creep, 1000);
    const effectiveArmor = 7 - 5 - 5; // -3
    const expected = Math.round(1000 * armorDamageMultiplier(effectiveArmor));
    expect(expected).toBeGreaterThan(1000);
    expect(creep.hp).toBe(10000 - expected);
  });
});
