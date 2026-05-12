import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { State, emptyState, TowerState } from '../../src/game/State';
import { EventBus } from '../../src/events/EventBus';
import { RNG } from '../../src/game/rng';
import { BASE, Cell } from '../../src/data/map';
import { findRoute, flattenRoute, buildAirRoute } from '../../src/systems/Pathfinding';
import { SIM_HZ } from '../../src/game/constants';
import { WavePhase } from '../../src/controllers/WavePhase';
import { WAVES } from '../../src/data/waves';
import { COMBOS, comboStatsAtTier } from '../../src/data/combos';
import type { ComboRecipe } from '../../src/data/combos';
import { gemStats, effectSummary, GEM_BASE } from '../../src/data/gems';
import type { GemType, Quality } from '../../src/render/theme';
import { QUALITY_NAMES } from '../../src/render/theme';
import { QUALITY_BASE_COST } from '../../src/game/constants';
import { Combat } from '../../src/systems/Combat';
import { Traps } from '../../src/systems/Traps';
import { Metrics } from '../../src/sim/Metrics';
import { exposureAt } from '../../src/sim/blueprintKeeper';
import type { Game } from '../../src/game/Game';

// ── Config ────────────────────────────────────────────────────────────────

const SEED = 42;
const BENCHMARK_WAVES = [8, 10, 15, 18, 20, 22, 24, 25, 30];
const MAX_TICKS = 60 * 60 * 20; // 20-minute safety cap (bosses are slow)

// ── Types ─────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  category: 'normal' | 'combo';
  comboKey: string;
  comboName: string;
  tier: number;
  tierName: string;
  waveNumber: number;
  totalDamage: number;
  dps: number;
  waveDurationTicks: number;
  kills: number;
  leaked: number;
  creepsSpawned: number;
  goldCost: number;
  damagePerGold: number;
  targeting: string;
  isAura: boolean;
  effects: string[];
}

interface MazeState {
  grid: Cell[][];
  keeperPositions: { x: number; y: number }[];
}

// ── Blueprint loading ─────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadBlueprint(): { rounds: [number, number][][] } {
  const raw = readFileSync(
    resolve(__dirname, '../maze_optimizer/blueprint_v5.json'),
    'utf-8',
  );
  return JSON.parse(raw);
}

// ── Maze construction (mirrors computeKeeperIndices logic) ────────────────

function buildMaze(
  blueprint: { rounds: [number, number][][] },
  upToRound: number,
): MazeState {
  const grid: Cell[][] = BASE.grid.map((row) => row.slice());
  const keeperPositions: { x: number; y: number }[] = [];
  const roundCount = Math.min(upToRound, blueprint.rounds.length);

  for (let r = 0; r < roundCount; r++) {
    const positions = blueprint.rounds[r];
    const placed: { x: number; y: number; idx: number }[] = [];

    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      let valid = true;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          if (grid[y + dy]?.[x + dx] !== Cell.Grass) valid = false;
      if (!valid) continue;

      grid[y][x] = Cell.Tower;
      grid[y][x + 1] = Cell.Tower;
      grid[y + 1][x] = Cell.Tower;
      grid[y + 1][x + 1] = Cell.Tower;
      placed.push({ x, y, idx: i });
    }

    const segments = findRoute(grid);
    const flat = segments ? flattenRoute(segments) : [];
    const routeSet = new Set(flat.map((p) => `${p.x},${p.y}`));

    let bestLocalIdx = 0;
    let bestExp = -1;
    for (let i = 0; i < placed.length; i++) {
      const exp = exposureAt(placed[i].x, placed[i].y, routeSet);
      if (exp > bestExp) {
        bestExp = exp;
        bestLocalIdx = i;
      }
    }

    for (let i = 0; i < placed.length; i++) {
      const { x, y } = placed[i];
      if (i === bestLocalIdx) {
        keeperPositions.push({ x, y });
      } else {
        grid[y][x] = Cell.Rock;
        grid[y][x + 1] = Cell.Rock;
        grid[y + 1][x] = Cell.Rock;
        grid[y + 1][x + 1] = Cell.Rock;
      }
    }
  }

  return { grid, keeperPositions };
}

// ── Gold cost ─────────────────────────────────────────────────────────────

function comboGoldCost(combo: ComboRecipe, tier: number): number {
  let cost = 0;
  for (let i = 0; i < tier && i < combo.upgrades.length; i++) {
    cost += combo.upgrades[i].cost;
  }
  return cost;
}

// ── Effect summary ────────────────────────────────────────────────────────

function summarizeEffects(combo: ComboRecipe, tier: number): string[] {
  const stats = comboStatsAtTier(combo, tier);
  const out: string[] = [];
  for (const e of stats.effects) {
    switch (e.kind) {
      case 'splash':
        out.push(`Splash r${e.radius}${e.chance != null ? ` ${Math.round(e.chance * 100)}%` : ''}`);
        break;
      case 'chain':
        out.push(`Chain ${e.bounces}`);
        break;
      case 'slow':
        out.push(`Slow ${Math.round((1 - e.factor) * 100)}% ${e.duration}s`);
        break;
      case 'poison':
        out.push(`Poison ${e.dps}dps ${e.duration}s`);
        break;
      case 'stun':
        out.push(`Stun ${Math.round(e.chance * 100)}% ${e.duration}s`);
        break;
      case 'crit':
        out.push(`Crit ${Math.round(e.chance * 100)}% ×${e.multiplier}`);
        break;
      case 'aura_atkspeed':
        out.push(`Aura +${Math.round(e.pct * 100)}% AS`);
        break;
      case 'aura_dmg':
        out.push(`Aura +${Math.round(e.pct * 100)}% Dmg`);
        break;
      case 'prox_armor_reduce':
        out.push(`Armor -${e.value} (${e.targets})`);
        break;
      case 'air_bonus':
        out.push(`Air ×${e.multiplier}`);
        break;
      default:
        out.push(e.kind);
    }
  }
  return out;
}

function isAuraGem(combo: ComboRecipe, tier: number): boolean {
  const stats = comboStatsAtTier(combo, tier);
  return stats.effects.some(
    (e) => e.kind === 'aura_atkspeed' || e.kind === 'aura_dmg',
  );
}

// ── Scenario runner ───────────────────────────────────────────────────────

class BenchmarkScenario {
  readonly bus = new EventBus();
  readonly state: State;
  readonly rng: RNG;
  private wavePhase: WavePhase;
  private combat: Combat;
  private traps: Traps;
  private metrics: Metrics;
  private nextEntityId = 1;

  constructor(seed: number) {
    this.rng = new RNG(seed);
    const grid: Cell[][] = BASE.grid.map((row) => row.slice());
    this.state = emptyState(grid, WAVES.length);
    this.state.airRoute = buildAirRoute();

    const self = this as unknown as Game;
    this.wavePhase = new WavePhase(self);
    this.combat = new Combat(self);
    this.traps = new Traps(self);
    this.metrics = new Metrics(this.bus, this.state);
  }

  nextId(): number {
    return this.nextEntityId++;
  }

  refreshRoute(): boolean {
    const route = findRoute(this.state.grid);
    if (!route) return false;
    this.state.routeSegments = route;
    this.state.flatRoute = flattenRoute(route);
    return true;
  }

  endWave(lifeLost: number, goldEarned: number): void {
    this.bus.emit('wave:end', {
      wave: this.state.wave,
      lifeLost,
      goldEarned,
    });
    this.state.phase = 'build';
  }

  selectTower(_id: number | null): void {}
  selectRock(_id: number | null): void {}

  run(
    mazeState: MazeState,
    combo: ComboRecipe,
    tier: number,
    waveNumber: number,
  ): BenchmarkResult {
    // Apply maze grid
    for (let y = 0; y < mazeState.grid.length; y++) {
      for (let x = 0; x < mazeState.grid[y].length; x++) {
        this.state.grid[y][x] = mazeState.grid[y][x];
      }
    }
    this.refreshRoute();

    // Find highest-exposure keeper position
    const routeSet = new Set(
      this.state.flatRoute.map((p) => `${p.x},${p.y}`),
    );
    let bestPos = mazeState.keeperPositions[0];
    let bestExp = -1;
    for (const pos of mazeState.keeperPositions) {
      const exp = exposureAt(pos.x, pos.y, routeSet);
      if (exp > bestExp) {
        bestExp = exp;
        bestPos = pos;
      }
    }

    // Place the test tower
    const stats = comboStatsAtTier(combo, tier);
    const tower: TowerState = {
      id: this.nextId(),
      x: bestPos.x,
      y: bestPos.y,
      gem: combo.visualGem,
      quality: 5 as const,
      comboKey: combo.key,
      upgradeTier: tier,
      lastFireTick: 0,
      kills: 0,
    };
    this.state.towers = [tower];
    this.state.creeps = [];
    this.state.projectiles = [];
    this.state.rocks = [];

    // Set up wave
    this.state.wave = waveNumber;
    this.state.lives = 99999;
    this.state.gold = 0;
    this.state.tick = 0;
    this.state.totalKills = 0;
    this.state.phase = 'wave';
    this.state.waveStats = {
      spawnedThisWave: 0,
      killedThisWave: 0,
      leakedThisWave: 0,
      totalToSpawn: 0,
    };

    this.wavePhase.onEnter(waveNumber);
    this.bus.emit('wave:start', { wave: waveNumber });

    // Run simulation
    const startTick = this.state.tick;
    for (let i = 0; i < MAX_TICKS; i++) {
      if (this.state.phase !== 'wave') break;
      this.state.tick += 1;
      this.wavePhase.step();
      this.combat.step();
      this.traps.step();
    }
    const endTick = this.state.tick;

    // Force wave:end if wave didn't complete (for metrics collection)
    if (this.state.phase === 'wave') {
      this.bus.emit('wave:end', { wave: waveNumber, lifeLost: 0, goldEarned: 0 });
      this.state.phase = 'build';
    }

    // Collect results
    const towerSummaries = this.metrics.towerSummaries();
    const ts = towerSummaries.find((t) => t.id === tower.id);

    const totalDamage = ts?.damageDealt ?? 0;
    const durationTicks = endTick - startTick;
    const durationSec = durationTicks / SIM_HZ;
    const goldCost = comboGoldCost(combo, tier);
    const waveStats = this.state.waveStats;

    let tierName = combo.name;
    if (tier > 0 && tier <= combo.upgrades.length) {
      tierName = combo.upgrades[tier - 1].name;
    }

    return {
      category: 'combo' as const,
      comboKey: combo.key,
      comboName: combo.name,
      tier,
      tierName,
      waveNumber,
      totalDamage,
      dps: durationSec > 0 ? Math.round(totalDamage / durationSec) : 0,
      waveDurationTicks: durationTicks,
      kills: tower.kills,
      leaked: waveStats.leakedThisWave,
      creepsSpawned: waveStats.spawnedThisWave,
      goldCost,
      damagePerGold: goldCost > 0 ? Math.round((totalDamage / goldCost) * 100) / 100 : 0,
      targeting: stats.targeting,
      isAura: isAuraGem(combo, tier),
      effects: summarizeEffects(combo, tier),
    };
  }

  runNormalGem(
    mazeState: MazeState,
    gem: GemType,
    quality: Quality,
    waveNumber: number,
  ): BenchmarkResult {
    for (let y = 0; y < mazeState.grid.length; y++) {
      for (let x = 0; x < mazeState.grid[y].length; x++) {
        this.state.grid[y][x] = mazeState.grid[y][x];
      }
    }
    this.refreshRoute();

    const routeSet = new Set(
      this.state.flatRoute.map((p) => `${p.x},${p.y}`),
    );
    let bestPos = mazeState.keeperPositions[0];
    let bestExp = -1;
    for (const pos of mazeState.keeperPositions) {
      const exp = exposureAt(pos.x, pos.y, routeSet);
      if (exp > bestExp) {
        bestExp = exp;
        bestPos = pos;
      }
    }

    const stats = gemStats(gem, quality);
    const tower: TowerState = {
      id: this.nextId(),
      x: bestPos.x,
      y: bestPos.y,
      gem,
      quality,
      lastFireTick: 0,
      kills: 0,
    };
    this.state.towers = [tower];
    this.state.creeps = [];
    this.state.projectiles = [];
    this.state.rocks = [];

    this.state.wave = waveNumber;
    this.state.lives = 99999;
    this.state.gold = 0;
    this.state.tick = 0;
    this.state.totalKills = 0;
    this.state.phase = 'wave';
    this.state.waveStats = {
      spawnedThisWave: 0,
      killedThisWave: 0,
      leakedThisWave: 0,
      totalToSpawn: 0,
    };

    this.wavePhase.onEnter(waveNumber);
    this.bus.emit('wave:start', { wave: waveNumber });

    const startTick = this.state.tick;
    for (let i = 0; i < MAX_TICKS; i++) {
      if (this.state.phase !== 'wave') break;
      this.state.tick += 1;
      this.wavePhase.step();
      this.combat.step();
      this.traps.step();
    }
    const endTick = this.state.tick;

    if (this.state.phase === 'wave') {
      this.bus.emit('wave:end', { wave: waveNumber, lifeLost: 0, goldEarned: 0 });
      this.state.phase = 'build';
    }

    const towerSummaries = this.metrics.towerSummaries();
    const ts = towerSummaries.find((t) => t.id === tower.id);

    const totalDamage = ts?.damageDealt ?? 0;
    const durationTicks = endTick - startTick;
    const durationSec = durationTicks / SIM_HZ;
    const goldCost = QUALITY_BASE_COST[quality];
    const waveStats = this.state.waveStats;
    const qualityName = QUALITY_NAMES[quality];
    const tierName = `${qualityName} ${stats.name}`;
    const hasAura = stats.effects.some(
      (e) => e.kind === 'aura_atkspeed' || e.kind === 'aura_dmg',
    );

    return {
      category: 'normal' as const,
      comboKey: gem,
      comboName: stats.name,
      tier: quality,
      tierName,
      waveNumber,
      totalDamage,
      dps: durationSec > 0 ? Math.round(totalDamage / durationSec) : 0,
      waveDurationTicks: durationTicks,
      kills: tower.kills,
      leaked: waveStats.leakedThisWave,
      creepsSpawned: waveStats.spawnedThisWave,
      goldCost,
      damagePerGold: goldCost > 0 ? Math.round((totalDamage / goldCost) * 100) / 100 : 0,
      targeting: stats.targeting,
      isAura: hasAura,
      effects: stats.effects.map(effectSummary).filter(Boolean),
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

const NON_RUNE_COMBOS = COMBOS.filter((c) => c.type !== 'trap');
const NORMAL_GEMS: GemType[] = (Object.keys(GEM_BASE) as GemType[]).filter((g) => g !== 'opal');
const QUALITIES: Quality[] = [1, 2, 3, 4, 5];
const blueprint = loadBlueprint();
const results: BenchmarkResult[] = [];

console.log(`Benchmarking ${NORMAL_GEMS.length} normal gems × ${QUALITIES.length} qualities × ${BENCHMARK_WAVES.length} waves...`);

for (const gem of NORMAL_GEMS) {
  for (const quality of QUALITIES) {
    for (const wave of BENCHMARK_WAVES) {
      const maze = buildMaze(blueprint, wave);
      const scenario = new BenchmarkScenario(SEED);
      const result = scenario.runNormalGem(maze, gem, quality, wave);
      results.push(result);

      const qLabel = QUALITY_NAMES[quality];
      console.log(
        `  ${qLabel} ${GEM_BASE[gem].name} wave ${wave}: ${result.totalDamage} dmg, ${result.dps} dps, ${result.kills}/${result.creepsSpawned} kills`,
      );
    }
  }
}

console.log(`\nBenchmarking ${NON_RUNE_COMBOS.length} combos × ${BENCHMARK_WAVES.length} waves...`);

for (const combo of NON_RUNE_COMBOS) {
  const tiers = [0, ...combo.upgrades.map((_, i) => i + 1)];
  for (const tier of tiers) {
    for (const wave of BENCHMARK_WAVES) {
      const maze = buildMaze(blueprint, wave);
      const scenario = new BenchmarkScenario(SEED);
      const result = scenario.run(maze, combo, tier, wave);
      results.push(result);

      const tierLabel = tier === 0 ? 'base' : `T${tier}`;
      console.log(
        `  ${combo.name} [${tierLabel}] wave ${wave}: ${result.totalDamage} dmg, ${result.dps} dps, ${result.kills}/${result.creepsSpawned} kills`,
      );
    }
  }
}

// ── HTML report generation ────────────────────────────────────────────────

function waveLabel(w: number): string {
  const def = WAVES[w - 1];
  if (!def) return `Wave ${w}`;
  const kinds = [...new Set(def.groups.map((g) => g.kind))];
  return `Wave ${w} (${kinds.join('+')})`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tierLabel(r: BenchmarkResult): string {
  if (r.category === 'normal') return `Q${r.tier}`;
  return r.tier === 0 ? 'Base' : `T${r.tier}`;
}

function costColumnHeader(category: 'normal' | 'combo'): string {
  return category === 'normal' ? 'Gem Cost' : 'Upgrade Cost';
}

function buildTableHtml(
  waveResults: BenchmarkResult[],
  title: string,
): string {
  const sorted = [...waveResults].sort((a, b) => b.dps - a.dps);
  const maxDmg = Math.max(...sorted.map((r) => r.totalDamage), 1);
  const maxDps = Math.max(...sorted.map((r) => r.dps), 1);
  const category = sorted[0]?.category ?? 'combo';

  const rows = sorted
    .map((r, i) => {
      const dmgBar = Math.round((r.totalDamage / maxDmg) * 100);
      const dpsBar = Math.round((r.dps / maxDps) * 100);
      const dpgStr = r.goldCost > 0 ? r.damagePerGold.toFixed(2) : '—';
      const notes: string[] = [];
      if (r.isAura) notes.push('aura (solo — buff not active)');
      if (r.targeting !== 'all') notes.push(`${r.targeting} only`);

      return `<tr>
        <td>${i + 1}</td>
        <td class="gem-name">${escapeHtml(r.tierName)}</td>
        <td>${tierLabel(r)}</td>
        <td>${r.targeting}</td>
        <td>${escapeHtml(r.effects.join(', '))}</td>
        <td class="num" data-sort="${r.goldCost}">${r.goldCost > 0 ? fmt(r.goldCost) : '—'}</td>
        <td class="num bar-cell" data-sort="${r.totalDamage}">
          <div class="bar" style="width:${dmgBar}%"></div>
          <span>${fmt(r.totalDamage)}</span>
        </td>
        <td class="num bar-cell" data-sort="${r.dps}">
          <div class="bar dpg" style="width:${dpsBar}%"></div>
          <span>${fmt(r.dps)}</span>
        </td>
        <td class="num" data-sort="${r.goldCost > 0 ? r.damagePerGold : -1}">${dpgStr}</td>
        <td class="num" data-sort="${r.kills}">${r.kills}/${r.creepsSpawned}</td>
        <td class="num" data-sort="${r.leaked}">${r.leaked}</td>
        <td class="note">${escapeHtml(notes.join('; '))}</td>
      </tr>`;
    })
    .join('\n');

  return `
    <h2>${escapeHtml(title)}</h2>
    <table class="bench-table">
      <thead>
        <tr>
          <th>#</th>
          <th data-col="name">Gem</th>
          <th data-col="tier">Tier</th>
          <th data-col="targeting">Target</th>
          <th data-col="effects">Effects</th>
          <th data-col="goldCost" class="sortable">${costColumnHeader(category)}</th>
          <th data-col="totalDamage" class="sortable">Total Damage</th>
          <th data-col="dps" class="sortable">DPS</th>
          <th data-col="damagePerGold" class="sortable">Dmg/Gold</th>
          <th data-col="kills" class="sortable">Kills</th>
          <th data-col="leaked" class="sortable">Leaked</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildSummaryTable(allResults: BenchmarkResult[], title: string, category: 'normal' | 'combo'): string {
  const filtered = allResults.filter((r) => r.category === category);
  const grouped = new Map<string, BenchmarkResult>();
  for (const r of filtered) {
    if (r.waveNumber === 20) {
      grouped.set(`${r.comboKey}:${r.tier}`, r);
    }
  }

  const entries = [...grouped.values()].sort((a, b) => b.dps - a.dps);
  const maxDps = Math.max(...entries.map((e) => e.dps), 1);

  const rows = entries
    .map((r, i) => {
      const dpsBar = Math.round((r.dps / maxDps) * 100);
      const dpgStr = r.goldCost > 0 ? r.damagePerGold.toFixed(2) : '—';
      const notes: string[] = [];
      if (r.isAura) notes.push('aura');
      if (r.targeting !== 'all') notes.push(r.targeting);

      return `<tr>
        <td>${i + 1}</td>
        <td class="gem-name">${escapeHtml(r.tierName)}</td>
        <td>${tierLabel(r)}</td>
        <td>${r.goldCost > 0 ? fmt(r.goldCost) : '—'}</td>
        <td class="num bar-cell" data-sort="${r.dps}">
          <div class="bar dpg" style="width:${dpsBar}%"></div>
          <span>${fmt(r.dps)}</span>
        </td>
        <td class="num" data-sort="${r.goldCost > 0 ? r.damagePerGold : -1}">${dpgStr}</td>
        <td class="note">${escapeHtml(notes.join(', '))}</td>
      </tr>`;
    })
    .join('\n');

  return `
    <h2>${escapeHtml(title)}</h2>
    <table class="bench-table summary">
      <thead>
        <tr>
          <th>#</th>
          <th>Gem</th>
          <th>Tier</th>
          <th class="sortable">${costColumnHeader(category)}</th>
          <th class="sortable">DPS (W20)</th>
          <th class="sortable">Dmg/Gold (W20)</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GemTD Gem Benchmark</title>
<style>
  :root {
    --bg: #1a1a2e;
    --surface: #16213e;
    --border: #0f3460;
    --text: #e0e0e0;
    --text-dim: #888;
    --accent: #e94560;
    --bar-dmg: rgba(233, 69, 96, 0.3);
    --bar-dpg: rgba(80, 200, 120, 0.3);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', monospace;
    background: var(--bg);
    color: var(--text);
    padding: 24px;
    line-height: 1.5;
  }
  h1 { color: var(--accent); margin-bottom: 8px; font-size: 1.5em; }
  .meta { color: var(--text-dim); margin-bottom: 24px; font-size: 0.85em; }
  h2 { color: var(--accent); margin: 32px 0 12px; font-size: 1.15em; }
  table.bench-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    font-size: 0.85em;
  }
  th, td {
    padding: 6px 10px;
    border: 1px solid var(--border);
    text-align: left;
    white-space: nowrap;
  }
  th {
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--accent); }
  th.sort-asc::after { content: ' ▲'; }
  th.sort-desc::after { content: ' ▼'; }
  tr:nth-child(even) { background: rgba(255,255,255,0.02); }
  tr:hover { background: rgba(233, 69, 96, 0.08); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.gem-name { font-weight: bold; }
  td.note { color: var(--text-dim); font-size: 0.9em; }
  td.bar-cell {
    position: relative;
  }
  td.bar-cell .bar {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    background: var(--bar-dmg);
    pointer-events: none;
  }
  td.bar-cell .bar.dpg { background: var(--bar-dpg); }
  td.bar-cell span { position: relative; z-index: 1; }
</style>
</head>
<body>
<h1>GemTD Gem Benchmark</h1>
<div class="meta">
  Generated: ${new Date().toISOString()} | Seed: ${SEED} |
  Waves: ${BENCHMARK_WAVES.join(', ')} |
  Blueprint: blueprint_v5.json | Mode: Solo (no support towers)
</div>

${buildSummaryTable(results, 'Normal Gems — Ranked by DPS at Wave 20', 'normal')}
${buildSummaryTable(results, 'Special Gems — Ranked by DPS at Wave 20', 'combo')}

${BENCHMARK_WAVES.map((w) => {
  const normalWave = results.filter((r) => r.waveNumber === w && r.category === 'normal');
  const comboWave = results.filter((r) => r.waveNumber === w && r.category === 'combo');
  return buildTableHtml(normalWave, `${waveLabel(w)} — Normal Gems`)
    + buildTableHtml(comboWave, `${waveLabel(w)} — Special Gems`);
}).join('\n')}

<script>
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const table = th.closest('table');
    const tbody = table.querySelector('tbody');
    const idx = Array.from(th.parentNode.children).indexOf(th);
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const isDesc = th.classList.contains('sort-asc');

    table.querySelectorAll('th').forEach(h => {
      h.classList.remove('sort-asc', 'sort-desc');
    });
    th.classList.add(isDesc ? 'sort-desc' : 'sort-asc');

    rows.sort((a, b) => {
      const aCell = a.children[idx];
      const bCell = b.children[idx];
      const aVal = parseFloat(aCell.dataset.sort ?? aCell.textContent.replace(/,/g, ''));
      const bVal = parseFloat(bCell.dataset.sort ?? bCell.textContent.replace(/,/g, ''));
      return isDesc ? aVal - bVal : bVal - aVal;
    });
    rows.forEach((row, i) => {
      row.children[0].textContent = String(i + 1);
      tbody.appendChild(row);
    });
  });
});
</script>
</body>
</html>`;

const outPath = resolve(__dirname, 'report.html');
writeFileSync(outPath, html);
console.log(`\nReport written to ${outPath}`);
