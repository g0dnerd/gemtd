import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../src/sim/HeadlessGame";
import { Metrics } from "../src/sim/Metrics";
import { MAZE_BLUEPRINT } from "../src/data/maze-blueprint";
import { computeKeeperIndices } from "../src/sim/blueprintKeeper";
import { Cell } from "../src/data/map";
import type { GemType, Quality } from "../src/render/theme";
import { GEM_TYPES } from "../src/render/theme";
import type { TowerState } from "../src/game/State";

const keeperIndices = computeKeeperIndices({
  rounds: MAZE_BLUEPRINT as [number, number][][],
});
const R1_KEEPER_IDX = keeperIndices[0];
const R1_POSITIONS = MAZE_BLUEPRINT[0];

/**
 * Set up wave 1 with a combo tower at the R1 keeper position and rocks at the
 * other 4 positions — matching what the blueprint optimizer produces. Bypasses
 * the normal build-phase flow to avoid incremental path-validation issues with
 * blueprint positions.
 */
function setupR1Combo(
  comboKey: string,
  visualGem: GemType,
  weakness: GemType,
  seed = 42,
): { game: HeadlessGame; metrics: Metrics } {
  const game = new HeadlessGame(seed);
  const metrics = new Metrics(game.bus, game.state);
  game.newGame();
  const state = game.state;

  state.gemWeaknesses[0] = weakness;

  // Clear the auto-rolled draws — we're setting up manually
  state.draws = [];
  state.activeDrawSlot = null;

  const [kx, ky] = R1_POSITIONS[R1_KEEPER_IDX];
  const comboTower: TowerState = {
    id: game.nextId(),
    x: kx,
    y: ky,
    gem: visualGem,
    quality: 1 as Quality,
    comboKey,
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0,
    waveDamage: 0,
    placedWave: 1,
  };
  state.towers.push(comboTower);
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) state.grid[ky + dy][kx + dx] = Cell.Tower;

  // Place rocks at the 4 non-keeper positions
  for (let i = 0; i < R1_POSITIONS.length; i++) {
    if (i === R1_KEEPER_IDX) continue;
    const [rx, ry] = R1_POSITIONS[i];
    const rockId = game.nextId();
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        state.grid[ry + dy][rx + dx] = Cell.Rock;
        state.rocks.push({
          x: rx + dx,
          y: ry + dy,
          id: rockId,
          placedAtBuildOfWave: 1,
        });
      }
  }

  game.refreshRoute();
  state.designatedKeepTowerId = comboTower.id;
  game.enterWave();

  return { game, metrics };
}

/**
 * Set up wave 1 with a combo tower at the R1 keeper position and rocks at the
 * other 4 positions — matching what the blueprint optimizer produces. Bypasses
 * the normal build-phase flow to avoid incremental path-validation issues with
 * blueprint positions.
 */
function setupR1ComboNoMaze(
  comboKey: string,
  visualGem: GemType,
  weakness: GemType,
  seed = 42,
): { game: HeadlessGame; metrics: Metrics } {
  const game = new HeadlessGame(seed);
  const metrics = new Metrics(game.bus, game.state);
  game.newGame();
  const state = game.state;

  state.gemWeaknesses[0] = weakness;

  // Clear the auto-rolled draws — we're setting up manually
  state.draws = [];
  state.activeDrawSlot = null;

  const [kx, ky] = [5, 8];
  const comboTower: TowerState = {
    id: game.nextId(),
    x: kx,
    y: ky,
    gem: visualGem,
    quality: 1 as Quality,
    comboKey,
    lastFireTick: 0,
    kills: 0,
    totalDamage: 0,
    waveDamage: 0,
    placedWave: 1,
  };
  state.towers.push(comboTower);
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) state.grid[ky + dy][kx + dx] = Cell.Tower;

  // Place rocks at the 4 non-keeper positions
  for (let i = 1; i < 5; i++) {
    const [rx, ry] = [kx, ky + 2 * i];
    const rockId = game.nextId();
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        state.grid[ry + dy][rx + dx] = Cell.Rock;
        state.rocks.push({
          x: rx + dx,
          y: ry + dy,
          id: rockId,
          placedAtBuildOfWave: 1,
        });
      }
  }

  game.refreshRoute();
  state.designatedKeepTowerId = comboTower.id;
  game.enterWave();

  return { game, metrics };
}

const combatGems = GEM_TYPES.filter((g) => g !== "opal");
const SEED_COUNT = 20;

describe("special gem wave 1 clear", () => {
  for (const w of combatGems) {
    it(`Silver clears wave 1 across ${SEED_COUNT} seeds (weakness=${w})`, () => {
      for (let seed = 0; seed < SEED_COUNT; seed++) {
        const { game, metrics } = setupR1Combo("silver", "sapphire", w, seed);
        game.runWave();
        const [w1] = metrics.waveSummaries();
        expect(w1, `seed=${seed}`).toBeDefined();
        expect(w1.leaked, `seed=${seed} weakness=${w}`).toBe(0);
        expect(w1.killed, `seed=${seed} weakness=${w}`).toBe(13);
        metrics.detach();
      }
    });
  }

  for (const w of combatGems) {
    it(`Malachite clears wave 1 across ${SEED_COUNT} seeds (weakness=${w})`, () => {
      for (let seed = 0; seed < SEED_COUNT; seed++) {
        const { game, metrics } = setupR1Combo("malachite", "emerald", w, seed);
        game.runWave();
        const [w1] = metrics.waveSummaries();
        expect(w1, `seed=${seed}`).toBeDefined();
        expect(w1.leaked, `seed=${seed} weakness=${w}`).toBe(0);
        expect(w1.killed, `seed=${seed} weakness=${w}`).toBe(13);
        metrics.detach();
      }
    });
  }

  for (const w of combatGems) {
    it(`Pyrite clears wave 1 across ${SEED_COUNT} seeds (weakness=${w})`, () => {
      for (let seed = 0; seed < SEED_COUNT; seed++) {
        const { game, metrics } = setupR1Combo("pyrite", "spinel", w, seed);
        game.runWave();
        const [w1] = metrics.waveSummaries();
        expect(w1, `seed=${seed}`).toBeDefined();
        expect(w1.leaked, `seed=${seed} weakness=${w}`).toBe(0);
        expect(w1.killed, `seed=${seed} weakness=${w}`).toBe(13);
        metrics.detach();
      }
    });
  }
});

describe("special gem wave 1 clear without maze", () => {
  for (const w of combatGems) {
    it(`Silver clears wave 1 across ${SEED_COUNT} seeds (weakness=${w}) with no maze`, () => {
      for (let seed = 0; seed < SEED_COUNT; seed++) {
        const { game, metrics } = setupR1ComboNoMaze(
          "silver",
          "sapphire",
          w,
          seed,
        );
        game.runWave();
        const [w1] = metrics.waveSummaries();
        expect(w1, `seed=${seed}`).toBeDefined();
        expect(w1.leaked, `seed=${seed} weakness=${w}`).toBe(0);
        expect(w1.killed, `seed=${seed} weakness=${w}`).toBe(13);
        metrics.detach();
      }
    });
  }

  for (const w of combatGems) {
    it(`Malachite clears wave 1 across ${SEED_COUNT} seeds (weakness=${w}) with no maze`, () => {
      for (let seed = 0; seed < SEED_COUNT; seed++) {
        const { game, metrics } = setupR1ComboNoMaze("malachite", "emerald", w, seed);
        game.runWave();
        const [w1] = metrics.waveSummaries();
        expect(w1, `seed=${seed}`).toBeDefined();
        expect(w1.leaked, `seed=${seed} weakness=${w}`).toBe(0);
        expect(w1.killed, `seed=${seed} weakness=${w}`).toBe(13);
        metrics.detach();
      }
    });
  }

  for (const w of combatGems) {
    it(`Pyrite clears wave 1 across ${SEED_COUNT} seeds (weakness=${w}) with no maze`, () => {
      for (let seed = 0; seed < SEED_COUNT; seed++) {
        const { game, metrics } = setupR1ComboNoMaze("pyrite", "spinel", w, seed);
        game.runWave();
        const [w1] = metrics.waveSummaries();
        expect(w1, `seed=${seed}`).toBeDefined();
        expect(w1.leaked, `seed=${seed} weakness=${w}`).toBe(0);
        expect(w1.killed, `seed=${seed} weakness=${w}`).toBe(13);
        metrics.detach();
      }
    });
  }
});
