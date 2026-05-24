import { describe, expect, it } from 'vitest';
import { HeadlessGame } from '../src/sim/HeadlessGame';
import { BlueprintAI } from '../src/sim/ai/BlueprintAI';
import { MAZE_BLUEPRINT, MAZE_KEEPER_INDICES } from '../src/data/maze-blueprint';
import { Cell } from '../src/data/map';

class NoComboBlueprintAI extends BlueprintAI {
  protected override tryCombos(): void { /* skip combos to isolate placement + keeper */ }
}

function plantRock(
  game: HeadlessGame,
  anchorX: number,
  anchorY: number,
  rockId: number,
  wave = 0,
): void {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      game.state.grid[anchorY + dy][anchorX + dx] = Cell.Rock;
      game.state.rocks.push({
        x: anchorX + dx,
        y: anchorY + dy,
        id: rockId,
        placedAtBuildOfWave: wave,
      });
    }
  }
}

describe('BlueprintAI: keeper position rock auto-removal', () => {
  const roundIndex = 0;
  const positions = MAZE_BLUEPRINT[roundIndex];
  const keeperIdx = MAZE_KEEPER_INDICES[roundIndex];
  const [kx, ky] = positions[keeperIdx];

  it('removes a rock fully occupying the keeper position', () => {
    const game = new HeadlessGame(42);
    game.newGame();

    plantRock(game, kx, ky, 900);

    const ai = new NoComboBlueprintAI();
    ai.playBuild(game);

    expect(game.state.rocks.filter((r) => r.id === 900)).toHaveLength(0);
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        expect(game.state.grid[ky + dy][kx + dx]).not.toBe(Cell.Rock);
      }
    }
  });

  it('removes a rock half-overlapping the keeper position (offset left)', () => {
    const game = new HeadlessGame(42);
    game.newGame();

    const rockId = 901;
    plantRock(game, kx - 1, ky, rockId);

    const ai = new NoComboBlueprintAI();
    ai.playBuild(game);

    expect(game.state.rocks.filter((r) => r.id === rockId)).toHaveLength(0);
    const towerAtKeeper = game.state.towers.find((t) => t.x === kx && t.y === ky);
    expect(towerAtKeeper).toBeDefined();
  });

  it('removes a rock half-overlapping the keeper position (offset up)', () => {
    const game = new HeadlessGame(42);
    game.newGame();

    const rockId = 902;
    plantRock(game, kx, ky - 1, rockId);

    const ai = new NoComboBlueprintAI();
    ai.playBuild(game);

    expect(game.state.rocks.filter((r) => r.id === rockId)).toHaveLength(0);
    expect(game.state.grid[ky - 1][kx]).toBe(Cell.Grass);
    expect(game.state.grid[ky - 1][kx + 1]).toBe(Cell.Grass);
  });

  it('removes multiple rocks partially overlapping the keeper position', () => {
    const game = new HeadlessGame(42);
    game.newGame();

    const rockIdA = 903;
    const rockIdB = 904;
    plantRock(game, kx - 1, ky, rockIdA);
    plantRock(game, kx + 1, ky, rockIdB);

    const ai = new NoComboBlueprintAI();
    ai.playBuild(game);

    expect(game.state.rocks.filter((r) => r.id === rockIdA)).toHaveLength(0);
    expect(game.state.rocks.filter((r) => r.id === rockIdB)).toHaveLength(0);
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        expect(game.state.grid[ky + dy][kx + dx]).not.toBe(Cell.Rock);
      }
    }
  });

  it('places a tower at the keeper position after removing the blocking rock', () => {
    const game = new HeadlessGame(42);
    game.newGame();

    plantRock(game, kx, ky, 905);

    const ai = new NoComboBlueprintAI();
    ai.playBuild(game);

    const towerAtKeeper = game.state.towers.find(
      (t) => t.x === kx && t.y === ky,
    );
    expect(towerAtKeeper).toBeDefined();
  });
});
