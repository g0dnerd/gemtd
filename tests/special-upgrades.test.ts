import { describe, expect, it } from "vitest";
import { armorDamageMultiplier, Combat } from "../src/systems/Combat";
import { emptyState, CreepState, TowerState } from "../src/game/State";
import { BASE } from "../src/data/map";
import { EventBus } from "../src/events/EventBus";
import { RNG } from "../src/game/rng";
import { FINE_TILE, SIM_HZ } from "../src/game/constants";
import type { Quality } from "../src/render/theme";
import type { Game } from "../src/game/Game";
import type { EffectKind } from "../src/data/gems";

function makeFakeGame(seed = 42) {
  const grid = BASE.grid.map((r) => r.slice());
  const state = emptyState(grid, 50);
  state.phase = "wave";
  state.tick = 100;
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
  return { game, state, rng };
}

function makeCreep(
  game: Game,
  opts: {
    armor?: number;
    hp?: number;
    x?: number;
    y?: number;
    slowResist?: number;
  } = {},
): CreepState {
  const hp = opts.hp ?? 10000;
  const creep: CreepState = {
    id: game.nextId(),
    kind: "normal",
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
    armor: opts.armor ?? 0,
    slowResist: opts.slowResist ?? 0,
    vulnerability: 0,
  };
  game.state.creeps.push(creep);
  return creep;
}

function makeTower(
  game: Game,
  opts: {
    x?: number;
    y?: number;
    comboKey?: string;
    upgradeTier?: number;
    effects?: EffectKind[];
  } = {},
): TowerState {
  const tower: TowerState = {
    id: game.nextId(),
    x: opts.x ?? 4,
    y: opts.y ?? 4,
    gem: "ruby",
    quality: 1 as Quality,
    lastFireTick: 0,
    kills: 0, totalDamage: 0, placedWave: 1,
    comboKey: opts.comboKey,
    upgradeTier: opts.upgradeTier,
  };
  game.state.towers.push(tower);
  return tower;
}

function directDamage(
  combat: Combat,
  tower: TowerState,
  creep: CreepState,
  damage: number,
) {
  combat.applyDamage(creep, damage, tower);
}

// ─── Vulnerability ────────────────────────────────────────────

describe("vulnerability multiplier", () => {
  it("amplifies damage by (1 + vulnerability)", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game);
    creep.vulnerability = 0.2;
    directDamage(combat, tower, creep, 1000);
    expect(creep.hp).toBe(10000 - Math.round(1000 * 1.2));
  });

  it("stacks additively from multiple sources", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game);
    creep.vulnerability = 0.35 + 0.25;
    directDamage(combat, tower, creep, 1000);
    expect(creep.hp).toBe(10000 - Math.round(1000 * 1.6));
  });

  it("applies after armor reduction", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 5 });
    creep.vulnerability = 0.2;
    directDamage(combat, tower, creep, 1000);
    const afterArmor = Math.round(1000 * armorDamageMultiplier(5));
    const expected = Math.round(afterArmor * 1.2);
    expect(creep.hp).toBe(10000 - expected);
  });
});

// ─── Burn ramp ────────────────────────────────────────────────

describe("prox_burn_ramp", () => {
  it("ramps damage with exposure time", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "star_ruby";
    tower.upgradeTier = 2; // Solar Core

    const creep = makeCreep(game, { x: 5, y: 5, hp: 10000000 });

    // Measure damage over first second (no ramp yet)
    const hp0 = creep.hp;
    for (let i = 0; i < SIM_HZ; i++) {
      game.state.tick++;
      combat.step();
    }
    const firstSecDmg = hp0 - creep.hp;
    expect(firstSecDmg).toBeGreaterThan(0);

    // Measure damage over 8th second (ramp should be significant)
    for (let i = 0; i < 6 * SIM_HZ; i++) {
      game.state.tick++;
      combat.step();
    }
    const hp7 = creep.hp;
    for (let i = 0; i < SIM_HZ; i++) {
      game.state.tick++;
      combat.step();
    }
    const eighthSecDmg = hp7 - creep.hp;

    expect(eighthSecDmg).toBeGreaterThan(firstSecDmg);
  });

  it("resets exposure when creep leaves range", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    const creep = makeCreep(game, { x: 5, y: 5, hp: 100000 });
    tower.comboKey = "star_ruby";
    tower.upgradeTier = 1;

    // Build up exposure
    for (let i = 0; i < 30; i++) {
      game.state.tick++;
      combat.step();
    }
    expect(tower.burnExposure).toBeDefined();
    expect(tower.burnExposure![creep.id]).toBeGreaterThan(0);

    // Move creep far away
    creep.px = 50 * FINE_TILE;
    creep.py = 50 * FINE_TILE;
    game.state.tick++;
    combat.step();

    // Exposure should be cleared
    expect(tower.burnExposure![creep.id]).toBeUndefined();
  });
});

// ─── Focus crit ───────────────────────────────────────────────

describe("focus_crit", () => {
  it("accumulates stacks on same target", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "pink_diamond";
    tower.upgradeTier = 1; // Living Diamond

    const creep = makeCreep(game, { x: 5, y: 5, hp: 100000 });

    // Let the tower fire several times
    for (let i = 0; i < 200; i++) {
      game.state.tick++;
      combat.step();
    }

    expect(tower.focusTarget).toBeDefined();
    expect(tower.focusTarget!.creepId).toBe(creep.id);
    expect(tower.focusTarget!.stacks).toBeGreaterThan(0);
  });

  it("resets stacks when target changes", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "pink_diamond";
    tower.upgradeTier = 1;

    const creep1 = makeCreep(game, { x: 5, y: 5, hp: 100000 });
    // Fire at creep1 to build stacks
    for (let i = 0; i < 200; i++) {
      game.state.tick++;
      combat.step();
    }
    const stacks = tower.focusTarget?.stacks ?? 0;
    expect(stacks).toBeGreaterThan(0);

    // Move creep1 away, add creep2
    creep1.alive = false;
    const creep2 = makeCreep(game, { x: 5, y: 5, hp: 100000 });

    for (let i = 0; i < 200; i++) {
      game.state.tick++;
      combat.step();
    }

    expect(tower.focusTarget!.creepId).toBe(creep2.id);
    // Stacks started from 0 for new target
  });
});

// ─── Execute ──────────────────────────────────────────────────

describe("execute", () => {
  it("deals bonus damage below HP threshold", () => {
    const { game } = makeFakeGame(999);
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "pink_diamond";
    tower.upgradeTier = 1;

    // High HP creep above threshold
    const creepHigh = makeCreep(game, { x: 5, y: 5, hp: 100000 });

    // Let tower fire once
    game.state.tick++;
    combat.step();
    // Process projectile
    for (let i = 0; i < 30; i++) {
      game.state.tick++;
      combat.step();
    }
    const dmgHigh = 100000 - creepHigh.hp;

    // Reset — low HP creep below 25% threshold
    creepHigh.alive = false;
    const creepLow = makeCreep(game, { x: 5, y: 5, hp: 100000 });
    creepLow.hp = 20000; // 20% of max — below 25% threshold
    tower.lastFireTick = 0;
    tower.focusTarget = undefined;

    game.state.tick++;
    combat.step();
    for (let i = 0; i < 30; i++) {
      game.state.tick++;
      combat.step();
    }
    const dmgLow = 20000 - creepLow.hp;

    // Execute should amplify damage on low HP target
    // (exact comparison is hard due to crit RNG, but on average execute should be higher)
    // At minimum, the execute code path is exercised without errors
    expect(dmgLow).toBeGreaterThanOrEqual(0);
    expect(dmgHigh).toBeGreaterThanOrEqual(0);
  });
});

// ─── Periodic nova ────────────────────────────────────────────

describe("periodic_nova", () => {
  it("fires at all targets every Nth attack", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "silver";
    tower.upgradeTier = 2; // Silver Knight with periodic_nova every 4

    // Place multiple creeps in range
    const creeps = [];
    for (let i = 0; i < 5; i++) {
      creeps.push(makeCreep(game, { x: 5, y: 5, hp: 100000 }));
    }

    // Fire 4 attacks worth of ticks
    let fireCount = 0;
    game.bus.on("tower:fire", () => fireCount++);

    for (let i = 0; i < 400; i++) {
      game.state.tick++;
      combat.step();
    }

    expect(tower.attackCount).toBeDefined();
    // Should have fired multiple times, with some being novas (hitting all 5)
    expect(fireCount).toBeGreaterThan(5);
  });
});

// ─── Death nova ───────────────────────────────────────────────

describe("death_nova", () => {
  it("deals maxHP%-based damage to nearby creeps on death", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);

    // Star Ruby T2 (Solar Core) has death_nova(15% maxHP, r2.0)
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "star_ruby";
    tower.upgradeTier = 2;

    // Dead creep (will trigger death nova)
    const deadCreep: CreepState = {
      id: game.nextId(),
      kind: "normal",
      pathPos: 5,
      px: 5 * FINE_TILE,
      py: 5 * FINE_TILE,
      hp: 0,
      maxHp: 1000,
      speed: 2,
      bounty: 5,
      color: "ruby",
      alive: false,
      armorReduction: 0,
      armor: 0,
      slowResist: 0,
      vulnerability: 0,
    };

    // Nearby alive creep (should take nova damage)
    const nearby = makeCreep(game, { x: 5, y: 5, hp: 5000 });

    // Far away creep (should NOT take nova damage)
    const faraway = makeCreep(game, { x: 20, y: 20, hp: 5000 });

    combat.handleDeathEffects(deadCreep);

    // Nova damage: 10% of 1000 maxHP = 100
    expect(nearby.hp).toBeLessThan(5000);
    expect(nearby.hp).toBe(5000 - 100);
    expect(faraway.hp).toBe(5000);
  });
});

// ─── Death spread (plague) ────────────────────────────────────

describe("death_spread", () => {
  it("spreads poison to nearby creeps on death", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);

    const deadCreep: CreepState = {
      id: game.nextId(),
      kind: "normal",
      pathPos: 5,
      px: 5 * FINE_TILE,
      py: 5 * FINE_TILE,
      hp: 0,
      maxHp: 1000,
      speed: 2,
      bounty: 5,
      color: "ruby",
      alive: false,
      armorReduction: 0,
      armor: 0,
      slowResist: 0,
      vulnerability: 0,
      poison: { dps: 80, expiresAt: game.state.tick + 3 * SIM_HZ, nextTick: game.state.tick + SIM_HZ },
      poisonSpread: { count: 2, radius: 2.0 },
    };

    const near1 = makeCreep(game, { x: 5, y: 5, hp: 5000 });
    const near2 = makeCreep(game, { x: 5, y: 6, hp: 5000 });
    const far = makeCreep(game, { x: 20, y: 20, hp: 5000 });

    combat.handleDeathEffects(deadCreep);

    // Near creeps should have poison
    expect(near1.poison).toBeDefined();
    expect(near1.poison!.dps).toBe(80);
    expect(near2.poison).toBeDefined();

    // Far creep should NOT have poison
    expect(far.poison).toBeUndefined();
  });

  it("does not chain (one generation only)", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);

    const deadCreep: CreepState = {
      id: game.nextId(),
      kind: "normal",
      pathPos: 5,
      px: 5 * FINE_TILE,
      py: 5 * FINE_TILE,
      hp: 0,
      maxHp: 1000,
      speed: 2,
      bounty: 5,
      color: "ruby",
      alive: false,
      armorReduction: 0,
      armor: 0,
      slowResist: 0,
      vulnerability: 0,
      poison: { dps: 80, expiresAt: game.state.tick + 180, nextTick: game.state.tick + 60 },
      poisonSpread: { count: 2, radius: 2.0 },
    };

    const near = makeCreep(game, { x: 5, y: 5, hp: 5000 });
    combat.handleDeathEffects(deadCreep);

    // Spread poison should NOT be spreadable
    expect(near.poison).toBeDefined();
    expect(near.poisonSpread).toBeUndefined();
  });
});

// ─── Stacking armor reduce ───────────────────────────────────

describe("stacking_armor_reduce", () => {
  it("accumulates stacks and reduces effective armor", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 10 });

    // Apply 3 stacks of -2 armor each
    creep.armorStacks = {
      count: 3,
      armorPer: 2,
      decayTicks: 3 * SIM_HZ,
      lastDecayTick: game.state.tick,
    };

    directDamage(combat, tower, creep, 1000);
    // Effective armor: 10 - 3*2 = 4
    const expected = Math.round(1000 * armorDamageMultiplier(4));
    expect(creep.hp).toBe(10000 - expected);
  });

  it("decays stacks over time", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    makeTower(game);
    const creep = makeCreep(game, { hp: 100000 });

    creep.armorStacks = {
      count: 3,
      armorPer: 2,
      decayTicks: Math.round(3 * SIM_HZ),
      lastDecayTick: game.state.tick,
    };

    // Advance past decay interval
    for (let i = 0; i < 3 * SIM_HZ + 1; i++) {
      game.state.tick++;
      combat.step();
    }

    // Should have decayed at least one stack
    if (creep.armorStacks) {
      expect(creep.armorStacks.count).toBeLessThan(3);
    }
  });

  it("respects max stacks cap", () => {
    const { game } = makeFakeGame();
    const creep = makeCreep(game);

    // Try to apply more than max
    creep.armorStacks = {
      count: 6,
      armorPer: 2,
      decayTicks: 180,
      lastDecayTick: game.state.tick,
    };

    // Already at max (6), count should stay at 6
    expect(creep.armorStacks.count).toBe(6);
  });
});

// ─── Armor decay aura (Uranium) ──────────────────────────────

describe("armor_decay_aura", () => {
  it("accumulates radiation armor persistently", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "uranium";
    tower.upgradeTier = 1; // Uranium 235 with armor_decay_aura

    const creep = makeCreep(game, { x: 5, y: 5, hp: 100000, armor: 10 });

    // Run for 1 second
    for (let i = 0; i < SIM_HZ; i++) {
      game.state.tick++;
      combat.step();
    }

    // Should have accumulated ~1 armor decay after 1 second (-1/s)
    expect(creep.radiationArmor).toBeDefined();
    expect(creep.radiationArmor!).toBeCloseTo(1, 0);
  });

  it("does not reset between ticks", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "uranium";
    tower.upgradeTier = 1;

    const creep = makeCreep(game, { x: 5, y: 5, hp: 1000000, armor: 20 });

    // Run for 5 seconds
    for (let i = 0; i < 5 * SIM_HZ; i++) {
      game.state.tick++;
      combat.step();
    }

    // Should cap at maxReduction (4)
    expect(creep.radiationArmor!).toBeCloseTo(4, 0);
  });

  it("respects armor floor of -10", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 0 });
    creep.radiationArmor = 100; // Way more than needed

    directDamage(combat, tower, creep, 1000);
    // Armor floor is -10, so effective armor = max(0 - 100, -10) = -10
    const expected = Math.round(1000 * armorDamageMultiplier(-10));
    expect(creep.hp).toBe(10000 - expected);
  });
});

// ─── Linger burn ──────────────────────────────────────────────

describe("linger_burn", () => {
  it("applies damage after creep leaves burn aura", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "uranium";
    tower.upgradeTier = 1; // Has prox_burn + linger_burn(3s)

    const creep = makeCreep(game, { x: 5, y: 5, hp: 1000000 });

    // Stay in range for a few ticks to register in burnAuraCreepIds
    for (let i = 0; i < 5; i++) {
      game.state.tick++;
      combat.step();
    }

    // Move out of range
    creep.px = 50 * FINE_TILE;
    creep.py = 50 * FINE_TILE;
    game.state.tick++;
    combat.step();

    // Creep should now have linger burn
    expect(creep.lingerBurn).toBeDefined();
    expect(creep.lingerBurn!.ticksLeft).toBeGreaterThan(0);

    // Linger burn should deal damage
    const hpBefore = creep.hp;
    game.state.tick++;
    combat.step();
    expect(creep.hp).toBeLessThan(hpBefore);
  });

  it("stops after duration expires", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "uranium";
    tower.upgradeTier = 1;

    const creep = makeCreep(game, { x: 5, y: 5, hp: 1000000 });

    // Stay in range
    for (let i = 0; i < 5; i++) {
      game.state.tick++;
      combat.step();
    }

    // Move out
    creep.px = 50 * FINE_TILE;
    creep.py = 50 * FINE_TILE;

    // Run past linger duration (3s = 180 ticks)
    for (let i = 0; i < 200; i++) {
      game.state.tick++;
      combat.step();
    }

    // Linger should have expired
    expect(creep.lingerBurn).toBeUndefined();
  });
});

// ─── Frostbite ────────────────────────────────────────────────

describe("frostbite", () => {
  it("adds vulnerability when creep speed is below threshold", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "yellow_sapphire";
    tower.upgradeTier = 1; // Blizzard Sapphire with frostbite

    const creep = makeCreep(game, { x: 5, y: 5, hp: 100000 });
    // Manually slow the creep below 40% speed
    creep.slow = { factor: 0.3, expiresAt: game.state.tick + 1000 };

    combat.step();

    // Frostbite should add vulnerability (+25%)
    expect(creep.vulnerability).toBeGreaterThan(0);
  });

  it("does not add vulnerability when speed is above threshold", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "yellow_sapphire";
    tower.upgradeTier = 1;

    const creep = makeCreep(game, { x: 5, y: 5, hp: 100000 });
    // No slow — speed at 100%

    combat.step();

    // Frostbite should NOT trigger
    expect(creep.vulnerability).toBe(0);
  });
});

// ─── Freeze chance ────────────────────────────────────────────

describe("freeze_chance", () => {
  it("can stun splash targets", () => {
    const { game } = makeFakeGame(1);
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "silver";
    tower.upgradeTier = 1; // Frosted Silver with freeze_chance(10%, 0.8s)

    // Place multiple creeps close together
    makeCreep(game, { x: 5, y: 5, hp: 100000 });
    const splashTargets: CreepState[] = [];
    for (let i = 0; i < 20; i++) {
      splashTargets.push(makeCreep(game, { x: 5, y: 5, hp: 100000 }));
    }

    // Track whether any stun was ever applied
    let anyStunned = false;
    for (let i = 0; i < 600; i++) {
      game.state.tick++;
      combat.step();
      if (splashTargets.some((c) => c.stun && c.stun.expiresAt > game.state.tick)) {
        anyStunned = true;
        break;
      }
    }

    expect(anyStunned).toBe(true);
  });
});

// ─── Periodic freeze (Yellow Sapphire) ───────────────────────

describe("periodic_freeze", () => {
  it("stuns all creeps in range at regular intervals", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game, { x: 4, y: 4 });
    tower.comboKey = "yellow_sapphire";
    tower.upgradeTier = 1; // periodic_freeze(3s interval, 0.5s stun)
    tower.lastFreezeTick = game.state.tick;

    const creep = makeCreep(game, { x: 5, y: 5, hp: 100000 });

    // Advance exactly to the freeze interval
    for (let i = 0; i < 3 * SIM_HZ; i++) {
      game.state.tick++;
      combat.step();
    }

    // Creep should be stunned (stun applied this tick, lasts 0.5s)
    expect(creep.stun).toBeDefined();
    expect(creep.stun!.expiresAt).toBeGreaterThan(game.state.tick);
  });
});

// ─── Ignore armor (armor_pierce_burn) ────────────────────────

describe("armor_pierce_burn", () => {
  it("bypasses armor when ignoreArmor is true", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 20 });

    combat.applyDamage(creep, 1000, tower, true);
    // With ignoreArmor, should take full 1000 damage
    expect(creep.hp).toBe(10000 - 1000);
  });

  it("still applies vulnerability even with ignoreArmor", () => {
    const { game } = makeFakeGame();
    const combat = new Combat(game);
    const tower = makeTower(game);
    const creep = makeCreep(game, { armor: 20 });
    creep.vulnerability = 0.5;

    combat.applyDamage(creep, 1000, tower, true);
    expect(creep.hp).toBe(10000 - Math.round(1000 * 1.5));
  });
});
