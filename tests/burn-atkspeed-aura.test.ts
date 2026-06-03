/**
 * atk-speed auras (e.g. Opal's aura_atkspeed +10%) amplify passive burn
 * damage the same way dmg-auras do. Burn ticks at a fixed 60Hz, so "faster
 * attacks" translates into "more damage per tick" — multiply dps by
 * (1 + atkSpeedAuraMult).
 */

import { describe, expect, it } from "vitest";
import { Combat } from "../src/systems/Combat";
import { emptyState, type CreepState, type State, type TowerState } from "../src/game/State";
import { BASE } from "../src/data/map";
import { EventBus } from "../src/events/EventBus";
import { RNG } from "../src/game/rng";
import { FINE_TILE, SIM_HZ } from "../src/game/constants";
import type { Quality, GemType } from "../src/render/theme";
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
  return { game, state };
}

function makeCreep(game: Game, opts: { hp?: number; x?: number; y?: number } = {}): CreepState {
  const hp = opts.hp ?? 10_000_000;
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

function makeTower(
  game: Game,
  spec: { combo?: string; gem?: GemType; quality?: Quality; upgradeTier?: number; x?: number; y?: number },
): TowerState {
  const tower: TowerState = {
    id: game.nextId(),
    x: spec.x ?? 4,
    y: spec.y ?? 4,
    gem: spec.gem ?? "ruby",
    quality: spec.quality ?? (5 as Quality),
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0,
    waveDamage: 0,
    placedWave: 1,
    comboKey: spec.combo,
    upgradeTier: spec.upgradeTier ?? 0,
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

function runScenario(setup: (game: Game) => void, ticks = SIM_HZ * 2): number {
  const { game, state } = makeFakeGame();
  const combat = new Combat(game);
  setup(game);
  const creep = makeCreep(game, { x: 5, y: 5 });
  const before = creep.hp;
  step(combat, state, ticks);
  return before - creep.hp;
}

describe("aura_atkspeed on passive burn damage", () => {
  // Opal at quality 5: aura_atkspeed pct = 0.1 + (5-1)*0.03 = 0.22 (+22%).
  // Burn dps scales by (1 + 0.22) = 1.22, modulo per-tick integer rounding.
  // Use Plasma Star (dps=250) where rounding noise is small relative to the
  // tick value.
  const Q5_ATKSPD = 0.1 + (5 - 1) * 0.03;
  const EXPECTED = 1 + Q5_ATKSPD;

  // Note: a plain prox_burn case (e.g. Uranium 235, dps=115 → ~2/tick) can't
  // distinguish a +22% boost through Math.round — both 1.92 and 2.34 round to
  // 2. The compose test below uses Black Opal + Opal together (~58% total
  // boost) which clears the rounding threshold for prox_burn too.

  it("prox_burn_ramp (Plasma Star) gains aura_atkspeed boost", () => {
    const plain = runScenario((g) => makeTower(g, { combo: "star_ruby", upgradeTier: 1, x: 4, y: 4 }));
    const opalAlone = runScenario((g) => makeTower(g, { gem: "opal", quality: 5 as Quality, x: 4, y: 6 }));
    const combined = runScenario((g) => {
      makeTower(g, { combo: "star_ruby", upgradeTier: 1, x: 4, y: 4 });
      makeTower(g, { gem: "opal", quality: 5 as Quality, x: 4, y: 6 });
    });
    const boosted = combined - opalAlone;
    expect(boosted).toBeGreaterThan(plain);
    const ratio = boosted / plain;
    expect(ratio).toBeGreaterThan(EXPECTED * 0.9);
    expect(ratio).toBeLessThan(EXPECTED * 1.15);
  });

  it("speed_damage_aura (Prismatic Beryl) gains aura_atkspeed boost", () => {
    const plain = runScenario((g) => makeTower(g, { combo: "golden_beryl", upgradeTier: 2, x: 4, y: 4 }));
    const opalAlone = runScenario((g) => makeTower(g, { gem: "opal", quality: 5 as Quality, x: 4, y: 6 }));
    const combined = runScenario((g) => {
      makeTower(g, { combo: "golden_beryl", upgradeTier: 2, x: 4, y: 4 });
      makeTower(g, { gem: "opal", quality: 5 as Quality, x: 4, y: 6 });
    });
    const boosted = combined - opalAlone;
    expect(boosted).toBeGreaterThan(plain);
    const ratio = boosted / plain;
    expect(ratio).toBeGreaterThan(EXPECTED * 0.85);
    expect(ratio).toBeLessThan(EXPECTED * 1.2);
  });

  it("burn tower outside aura radius is unaffected", () => {
    // Opal quality-5 aura radius ≈ 3 + (5-1)*0.5 = 5 tiles. Place burn 8
    // tiles away — clearly outside.
    const withDistantOpal = runScenario((g) => {
      makeTower(g, { combo: "star_ruby", upgradeTier: 1, x: 4, y: 4 });
      makeTower(g, { gem: "opal", quality: 5 as Quality, x: 4, y: 18 });
    });
    const plain = runScenario((g) => makeTower(g, { combo: "star_ruby", upgradeTier: 1, x: 4, y: 4 }));
    // Opal at distance also has projectile damage; subtract that.
    const opalAloneAtDistance = runScenario((g) =>
      makeTower(g, { gem: "opal", quality: 5 as Quality, x: 4, y: 18 }),
    );
    expect(withDistantOpal - opalAloneAtDistance).toBe(plain);
  });

  it("Opal accrues atkSpeedAssist credit for burn damage it boosted", () => {
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const opal = makeTower(game, { gem: "opal", quality: 5 as Quality, x: 4, y: 6 });
    makeTower(game, { combo: "star_ruby", upgradeTier: 1, x: 4, y: 4 });
    makeCreep(game, { x: 5, y: 5 });

    step(combat, state, SIM_HZ);

    expect(opal.atkSpeedAssist ?? 0).toBeGreaterThan(0);
  });

  it("dmg-aura and atk-speed-aura compose multiplicatively on burn damage", () => {
    // Black Opal (aura_dmg +30%) and a quality-5 Opal (aura_atkspeed +22%)
    // on the same burn tower → expected dps mult ≈ 1.30 * 1.22 = 1.586.
    const burnSetup = (g: Game) => makeTower(g, { combo: "star_ruby", upgradeTier: 1, x: 4, y: 4 });
    const blackOpalSetup = (g: Game) => makeTower(g, { combo: "black_opal", upgradeTier: 0, x: 4, y: 6 });
    const opalSetup = (g: Game) => makeTower(g, { gem: "opal", quality: 5 as Quality, x: 6, y: 4 });

    const plain = runScenario(burnSetup);
    const supportsAlone = runScenario((g) => {
      blackOpalSetup(g);
      opalSetup(g);
    });
    const combined = runScenario((g) => {
      burnSetup(g);
      blackOpalSetup(g);
      opalSetup(g);
    });
    const boosted = combined - supportsAlone;
    const ratio = boosted / plain;
    const expected = 1.3 * (1 + Q5_ATKSPD);
    expect(ratio).toBeGreaterThan(expected * 0.9);
    expect(ratio).toBeLessThan(expected * 1.15);
  });
});
