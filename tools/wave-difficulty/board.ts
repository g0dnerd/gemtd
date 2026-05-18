import { Cell, BASE } from '../../src/data/map';
import { findRoute, flattenRoute, buildAirRoute } from '../../src/systems/Pathfinding';
import { exposureAt } from '../../src/sim/blueprintKeeper';
import { MAZE_BLUEPRINT } from '../../src/data/maze-blueprint';
import { RNG } from '../../src/game/rng';
import type { TowerState } from '../../src/game/State';
import type { GemType, Quality } from '../../src/render/theme';

interface TowerSpec {
  label: string;
  gem: GemType;
  quality: Quality;
  comboKey?: string;
  upgradeTier?: number;
}

export const REFERENCE_TOWERS: TowerSpec[] = [
  { label: 'Ruby Q3', gem: 'ruby', quality: 3 },
  { label: 'Sapphire Q3', gem: 'sapphire', quality: 3 },
  { label: 'Emerald Q3', gem: 'emerald', quality: 3 },
  { label: 'Diamond Q3', gem: 'diamond', quality: 3 },
  { label: 'Topaz Q3', gem: 'topaz', quality: 3 },
  { label: 'Amethyst Q3', gem: 'amethyst', quality: 3 },
  { label: 'Aquamarine Q3', gem: 'aquamarine', quality: 3 },
  { label: 'Solar Core', gem: 'ruby', quality: 5, comboKey: 'star_ruby', upgradeTier: 2 },
  { label: 'Uranium 235', gem: 'topaz', quality: 5, comboKey: 'uranium', upgradeTier: 1 },
  { label: 'Silver Knight', gem: 'diamond', quality: 5, comboKey: 'silver', upgradeTier: 2 },
  { label: 'Ancient Paraiba', gem: 'aquamarine', quality: 5, comboKey: 'paraiba_tourmaline', upgradeTier: 1 },
  { label: 'Rose Quartz Crystal', gem: 'amethyst', quality: 5, comboKey: 'red_crystal', upgradeTier: 2 },
  { label: 'Mighty Malachite', gem: 'emerald', quality: 5, comboKey: 'malachite', upgradeTier: 2 },
];

export interface BoardResult {
  grid: Cell[][];
  towers: TowerState[];
  flatRoute: Array<{ x: number; y: number }>;
  airRoute: Array<{ x: number; y: number }>;
}

let cachedMaze: {
  grid: Cell[][];
  keeperPositions: Array<{ x: number; y: number; exposure: number }>;
} | null = null;

function buildMaze(): { grid: Cell[][]; keeperPositions: Array<{ x: number; y: number; exposure: number }> } {
  if (cachedMaze) return { grid: cachedMaze.grid.map(r => r.slice()), keeperPositions: cachedMaze.keeperPositions };

  const grid: Cell[][] = BASE.grid.map(r => r.slice());
  const keeperPositions: Array<{ x: number; y: number; exposure: number }> = [];

  for (const positions of MAZE_BLUEPRINT) {
    const placed: Array<{ x: number; y: number }> = [];

    for (const [x, y] of positions) {
      let valid = true;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          if (grid[y + dy]?.[x + dx] !== Cell.Grass) valid = false;
      if (!valid) continue;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) grid[y + dy][x + dx] = Cell.Tower;
      placed.push({ x, y });
    }

    if (placed.length === 0) continue;

    const segments = findRoute(grid);
    const flat = segments ? flattenRoute(segments) : [];
    const routeSet = new Set(flat.map(p => `${p.x},${p.y}`));

    let bestIdx = 0;
    let bestExp = -1;
    for (let i = 0; i < placed.length; i++) {
      const exp = exposureAt(placed[i].x, placed[i].y, routeSet);
      if (exp > bestExp) {
        bestExp = exp;
        bestIdx = i;
      }
    }

    keeperPositions.push({ ...placed[bestIdx], exposure: bestExp });

    for (let i = 0; i < placed.length; i++) {
      if (i === bestIdx) continue;
      const { x, y } = placed[i];
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) grid[y + dy][x + dx] = Cell.Rock;
    }
  }

  cachedMaze = { grid: grid.map(r => r.slice()), keeperPositions };
  return { grid, keeperPositions };
}

export function buildBoard(seed: number): BoardResult {
  const rng = new RNG(seed);
  const { grid, keeperPositions } = buildMaze();

  const sorted = [...keeperPositions].sort((a, b) => b.exposure - a.exposure);
  const towerSlots = sorted.slice(0, REFERENCE_TOWERS.length);

  for (let i = REFERENCE_TOWERS.length; i < sorted.length; i++) {
    const { x, y } = sorted[i];
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) grid[y + dy][x + dx] = Cell.Rock;
  }

  const specs = [...REFERENCE_TOWERS];
  for (let i = specs.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [specs[i], specs[j]] = [specs[j], specs[i]];
  }

  const towers: TowerState[] = [];
  for (let i = 0; i < towerSlots.length; i++) {
    const pos = towerSlots[i];
    const spec = specs[i];
    towers.push({
      id: i + 1,
      x: pos.x,
      y: pos.y,
      gem: spec.gem,
      quality: spec.quality,
      comboKey: spec.comboKey,
      upgradeTier: spec.upgradeTier,
      lastFireTick: 0,
      kills: 0,
      totalDamage: 0,
      placedWave: 1,
    });
  }

  const segments = findRoute(grid);
  const flatRoute = segments ? flattenRoute(segments) : [];
  const airRoute = buildAirRoute();

  return { grid, towers, flatRoute, airRoute };
}
