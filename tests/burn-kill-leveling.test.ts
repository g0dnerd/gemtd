/**
 * Regression: towers whose main damage source is a passive aura (prox_burn,
 * prox_burn_ramp, speed_damage_aura) have dmgMin/dmgMax = 0, so the per-kill
 * damage multiplier applied in `effectiveStats` only matters if it is also
 * propagated to the effect's `dps`. This test pins that behavior — kill-leveling
 * must scale the burn dps, not just the (irrelevant) projectile damage range.
 */

import { describe, expect, it } from "vitest";
import { Combat, towerLevel } from "../src/systems/Combat";
import { emptyState, type CreepState, type State, type TowerState } from "../src/game/State";
import { BASE } from "../src/data/map";
import { EventBus } from "../src/events/EventBus";
import { RNG } from "../src/game/rng";
import { FINE_TILE, SIM_HZ } from "../src/game/constants";
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
  return { game, state };
}

function makeCreep(game: Game, opts: { hp?: number; x?: number; y?: number; speed?: number } = {}): CreepState {
  const hp = opts.hp ?? 10_000_000;
  const creep: CreepState = {
    id: game.nextId(),
    kind: "shambler",
    pathPos: 5,
    px: (opts.x ?? 5) * FINE_TILE,
    py: (opts.y ?? 5) * FINE_TILE,
    hp,
    maxHp: hp,
    speed: opts.speed ?? 2,
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

function makeBurnTower(
  game: Game,
  comboKey: string,
  opts: { x?: number; y?: number; upgradeTier?: number; kills?: number } = {},
): TowerState {
  const tower: TowerState = {
    id: game.nextId(),
    x: opts.x ?? 4,
    y: opts.y ?? 4,
    gem: "ruby",
    quality: 5 as Quality,
    lastFireTick: 0,
    kills: opts.kills ?? 0,
    totalDamage: 0,
    waveDamage: 0,
    placedWave: 1,
    comboKey,
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

/** Run a burn tower at the given kill count and report how much HP the creep lost over `ticks`. */
function damageOverTicks(comboKey: string, upgradeTier: number, kills: number, ticks: number, creepSpeed = 2): number {
  const { game, state } = makeFakeGame();
  const combat = new Combat(game);
  makeBurnTower(game, comboKey, { upgradeTier, kills });
  const creep = makeCreep(game, { speed: creepSpeed });
  const before = creep.hp;
  step(combat, state, ticks);
  return before - creep.hp;
}

/** Expected kill-level multiplier — mirrors the formula in `effectiveStats`. */
function killMult(kills: number): number {
  const lvl = Math.floor(kills / 10);
  return 1 + (0.05 * lvl) / (1 + 0.06 * lvl);
}

describe("kill leveling on non-projectile main damage sources", () => {
  it("prox_burn scales with tower kill level (Uranium 235)", () => {
    // Uranium 235: prox_burn dps=115. At lvl=0 → ~2/tick; at lvl=20 (mult ≈ 1.4545)
    // → ~3/tick — clear of the Math.max(1, ...) clamp Star Ruby (dps=34) hits.
    const baseDmg = damageOverTicks("uranium", 1, 0, SIM_HZ * 4);
    const leveledDmg = damageOverTicks("uranium", 1, 200, SIM_HZ * 4);
    expect(towerLevel({ kills: 200 } as TowerState)).toBe(20);
    expect(leveledDmg).toBeGreaterThan(baseDmg);
    const ratio = leveledDmg / baseDmg;
    const expected = killMult(200);
    expect(ratio).toBeGreaterThan(expected * 0.9);
    expect(ratio).toBeLessThan(expected * 1.1);
  });

  it("prox_burn_ramp scales with tower kill level (Plasma Star)", () => {
    // Plasma Star: prox_burn_ramp dps=250 with rampPct=0.1, rampCap=1.2.
    // The ramp multiplier is a function of exposure ticks, which is identical
    // in both runs, so the dps scaling alone drives the ratio.
    const baseDmg = damageOverTicks("star_ruby", 1, 0, SIM_HZ * 2);
    const leveledDmg = damageOverTicks("star_ruby", 1, 200, SIM_HZ * 2);
    expect(leveledDmg).toBeGreaterThan(baseDmg);
    const ratio = leveledDmg / baseDmg;
    const expected = killMult(200);
    expect(ratio).toBeGreaterThan(expected * 0.95);
    expect(ratio).toBeLessThan(expected * 1.05);
  });

  it("speed_damage_aura scales with tower kill level (Golden Beryl)", () => {
    // Prismatic Beryl (upgradeTier=2): dps=120, plenty of headroom above the
    // Math.max(1, ...) clamp. Creep speed=2 → per-tick dmg ≈ dps * 4 / 1.7 / 60.
    const baseDmg = damageOverTicks("golden_beryl", 2, 0, SIM_HZ * 2);
    const leveledDmg = damageOverTicks("golden_beryl", 2, 200, SIM_HZ * 2);
    expect(leveledDmg).toBeGreaterThan(baseDmg);
    const ratio = leveledDmg / baseDmg;
    const expected = killMult(200);
    expect(ratio).toBeGreaterThan(expected * 0.95);
    expect(ratio).toBeLessThan(expected * 1.05);
  });

  it("burn damage is unchanged below the lvl=1 threshold (kills < 10)", () => {
    // Sanity check the granularity: 9 kills should still be lvl=0, so damage
    // matches the baseline exactly. Catches any accidental tier off-by-one.
    const baseDmg = damageOverTicks("golden_beryl", 2, 0, SIM_HZ);
    const sub = damageOverTicks("golden_beryl", 2, 9, SIM_HZ);
    expect(sub).toBe(baseDmg);
  });
});
