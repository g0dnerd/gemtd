/**
 * Regression: Void Opal's two auras (aura_dmg +35%, vulnerability_aura +20%)
 * must reach passive burn damage sources — prox_burn, prox_burn_ramp,
 * speed_damage_aura — the same way they reach projectile damage.
 *
 * Pre-fix, aura_dmg was only applied at fire time (so burn towers got nothing
 * from it), and vulnerability_aura's effect on burn damage was order-dependent
 * (only worked if the vuln-aura tower happened to be iterated first).
 */

import { describe, expect, it } from "vitest";
import { Combat } from "../src/systems/Combat";
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

function makeTower(
  game: Game,
  comboKey: string,
  opts: { x?: number; y?: number; upgradeTier?: number; pushFront?: boolean } = {},
): TowerState {
  const tower: TowerState = {
    id: game.nextId(),
    x: opts.x ?? 4,
    y: opts.y ?? 4,
    gem: "ruby",
    quality: 5 as Quality,
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0,
    waveDamage: 0,
    placedWave: 1,
    comboKey,
    upgradeTier: opts.upgradeTier ?? 0,
  };
  if (opts.pushFront) game.state.towers.unshift(tower);
  else game.state.towers.push(tower);
  return tower;
}

function step(combat: Combat, state: State, n: number) {
  for (let i = 0; i < n; i++) {
    state.tick++;
    combat.step();
  }
}

/** Run the supplied tower fleet against a single creep for `ticks` and return HP lost. */
function runScenario(
  setup: (game: Game) => void,
  opts: { ticks?: number; creepAt?: { x: number; y: number } } = {},
): number {
  const { game, state } = makeFakeGame();
  const combat = new Combat(game);
  setup(game);
  const creep = makeCreep(game, opts.creepAt ?? { x: 5, y: 5 });
  const before = creep.hp;
  step(combat, state, opts.ticks ?? SIM_HZ * 2);
  return before - creep.hp;
}

/** Isolate the burn tower's damage contribution under Void Opal's auras.
 *  Void Opal's projectile damage is the same in (opal-only) and (combined),
 *  so subtracting it leaves only the (boosted) burn portion. */
function burnBoostRatio(burnCombo: string, burnTier: number, ticks = SIM_HZ * 2) {
  const plain = runScenario((g) => makeTower(g, burnCombo, { x: 4, y: 4, upgradeTier: burnTier }), { ticks });
  const opalAlone = runScenario((g) => makeTower(g, "black_opal", { x: 4, y: 6, upgradeTier: 1 }), { ticks });
  const combined = runScenario((g) => {
    makeTower(g, burnCombo, { x: 4, y: 4, upgradeTier: burnTier });
    makeTower(g, "black_opal", { x: 4, y: 6, upgradeTier: 1 });
  }, { ticks });
  const boosted = combined - opalAlone;
  return { plain, boosted, ratio: boosted / plain };
}

describe("Void Opal auras on passive burn damage", () => {
  // Void Opal: aura_dmg +35%, vulnerability_aura +20% (both r=4.5).
  // Composite multiplier on burn damage = 1.35 * 1.20 = 1.62 — but per-tick
  // integer rounding (Math.round + the Math.max(1, ...) clamp) can shift the
  // realized ratio meaningfully when the per-tick dmg is small. Bounds below
  // are loose enough to absorb that, tight enough to fail if either aura is
  // dropped from the burn path (which would push the ratio down toward 1.2 or
  // 1.35).
  const EXPECTED = 1.35 * 1.2;

  it("prox_burn (Uranium 235) gains both aura_dmg and vulnerability_aura", () => {
    // dps=115 → ~2/tick plain → ~4/tick boosted; rounding pushes the ratio above
    // the analytic 1.62, hence the wide upper bound.
    const { plain, boosted, ratio } = burnBoostRatio("uranium", 1);
    expect(boosted).toBeGreaterThan(plain);
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(2.2);
  });

  it("prox_burn_ramp (Plasma Star) gains both aura_dmg and vulnerability_aura", () => {
    // dps=250 — per-tick dmg is large enough that rounding noise is small.
    const { plain, boosted, ratio } = burnBoostRatio("star_ruby", 1);
    expect(boosted).toBeGreaterThan(plain);
    expect(ratio).toBeGreaterThan(EXPECTED * 0.9);
    expect(ratio).toBeLessThan(EXPECTED * 1.1);
  });

  it("speed_damage_aura (Prismatic Beryl) gains both aura_dmg and vulnerability_aura", () => {
    // dps=120 with speed²/pivot ≈ 2.35 — per-tick dmg ~5; rounding here goes
    // the other way and trims the ratio below 1.62.
    const { plain, boosted, ratio } = burnBoostRatio("golden_beryl", 2);
    expect(boosted).toBeGreaterThan(plain);
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(1.8);
  });

  it("aura_dmg alone (Black Opal base, no vulnerability) boosts burn ~+30%", () => {
    // Isolates the aura_dmg path: Black Opal tier-0 has aura_dmg pct=0.3 and
    // no vulnerability_aura. Cleanly confirms the aura_dmg branch reaches
    // burn damage on its own.
    const plain = runScenario((g) => makeTower(g, "star_ruby", { x: 4, y: 4, upgradeTier: 1 }));
    const opalAlone = runScenario((g) => makeTower(g, "black_opal", { x: 4, y: 6, upgradeTier: 0 }));
    const combined = runScenario((g) => {
      makeTower(g, "star_ruby", { x: 4, y: 4, upgradeTier: 1 });
      makeTower(g, "black_opal", { x: 4, y: 6, upgradeTier: 0 });
    });
    const boosted = combined - opalAlone;
    const ratio = boosted / plain;
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.45);
  });

  it("vulnerability_aura amplifies burn damage regardless of tower iteration order", () => {
    // Pre-fix, this would diverge: Void Opal placed after the burn tower in
    // state.towers meant the vuln-aura wasn't visible to applyDamage when burn
    // damage was being applied that tick. The two-pass refactor pins this.
    const opalAfter = runScenario((g) => {
      makeTower(g, "star_ruby", { x: 4, y: 4, upgradeTier: 1 });
      makeTower(g, "black_opal", { x: 4, y: 6, upgradeTier: 1 });
    });
    const opalBefore = runScenario((g) => {
      makeTower(g, "black_opal", { x: 4, y: 6, upgradeTier: 1 });
      makeTower(g, "star_ruby", { x: 4, y: 4, upgradeTier: 1 });
    });
    expect(opalAfter).toBe(opalBefore);
  });

  it("burn tower placed outside aura radius is unaffected", () => {
    // Void Opal at (0,0); burn tower at (15, 15) — well outside r=4.5 tile aura.
    // Creep right next to the burn tower so it stays in burn range.
    const setup = { creepAt: { x: 16, y: 16 } };
    const withDistantOpal = runScenario((g) => {
      makeTower(g, "black_opal", { x: 0, y: 0, upgradeTier: 1 });
      makeTower(g, "star_ruby", { x: 15, y: 15, upgradeTier: 1 });
    }, setup);
    const plain = runScenario(
      (g) => makeTower(g, "star_ruby", { x: 15, y: 15, upgradeTier: 1 }),
      setup,
    );
    expect(withDistantOpal).toBe(plain);
  });

  it("Void Opal credits dmg-aura assist for burn damage it amplified", () => {
    // Telemetry parity: when Void Opal boosts projectile damage it accrues
    // dmgAuraAssist. The same must happen when it boosts burn damage.
    const { game, state } = makeFakeGame();
    const combat = new Combat(game);
    const opal = makeTower(game, "black_opal", { x: 4, y: 6, upgradeTier: 1 });
    makeTower(game, "star_ruby", { x: 4, y: 4, upgradeTier: 1 });
    makeCreep(game, { x: 5, y: 5 });

    step(combat, state, SIM_HZ);

    expect(opal.dmgAuraAssist ?? 0).toBeGreaterThan(0);
  });
});
