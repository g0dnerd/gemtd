/**
 * Top-level game controller. Owns:
 *  - the Pixi Application (rendering)
 *  - the State (game data)
 *  - the EventBus (UI ↔ sim communication)
 *  - the BuildPhase / WavePhase controllers
 *
 * Main loop is fixed-step at SIM_HZ; render runs each Pixi tick.
 */

import { Application, Container, Ticker } from 'pixi.js';
import { State, emptyState } from './State';
import { EventBus } from '../events/EventBus';
import { RNG } from './rng';
import { BASE, Cell } from '../data/map';
import { findRoute, flattenRoute } from '../systems/Pathfinding';
import { BoardLayers, makeBoardLayers, renderGround, renderPathTrace, renderCheckpoints } from '../render/BoardRenderer';
import { TILE, START_GOLD, START_LIVES, SIM_DT, DEFAULT_SEED } from './constants';
import { BuildPhase } from '../controllers/BuildPhase';
import { WavePhase } from '../controllers/WavePhase';
import { WAVES } from '../data/waves';
import { CHANCE_TIER_UPGRADE_COST, MAX_CHANCE_TIER } from './constants';
import { Combat } from '../systems/Combat';
import { TowerSpriteCache } from '../render/TowerRenderer';
import { renderTowers, renderRocks, renderCreeps, renderProjectiles, renderHover, renderRangePreview } from '../render/EntityRenderer';

export class Game {
  readonly bus = new EventBus();
  readonly state: State;
  readonly rng: RNG;
  readonly app: Application;

  readonly board: Container;
  readonly layers: BoardLayers;
  readonly towerSprites: TowerSpriteCache;

  private buildPhase: BuildPhase;
  private wavePhase: WavePhase;
  private combat: Combat;

  /** Accumulator for fixed-step sim. */
  private accum = 0;
  private nextEntityId = 1;

  /** Tile under the pointer (for build preview). null if outside the board. */
  hoverTile: { x: number; y: number } | null = null;

  /** Currently selected tower (if any). null otherwise. */
  selectedTowerId: number | null = null;

  constructor(app: Application) {
    this.app = app;
    this.rng = new RNG(DEFAULT_SEED);

    const grid: Cell[][] = BASE.grid.map((row) => row.slice());
    this.state = emptyState(grid, WAVES.length);

    this.board = new Container();
    this.board.label = 'board';
    this.layers = makeBoardLayers();
    this.board.addChild(this.layers.root);
    this.app.stage.addChild(this.board);

    this.towerSprites = new TowerSpriteCache(this.app.renderer, this.bus);

    this.buildPhase = new BuildPhase(this);
    this.wavePhase = new WavePhase(this);
    this.combat = new Combat(this);

    renderGround(this.layers.ground, this.state.grid);
    renderCheckpoints(this.layers.checkpoints);
    this.refreshRoute();

    this.app.ticker.add(this.tick, this);
  }

  start(): void {
    this.state.phase = 'title';
    this.state.lives = START_LIVES;
    this.state.gold = START_GOLD;
    this.state.wave = 0;
    this.bus.emit('phase:enter', { phase: 'title' });
    this.bus.emit('gold:change', { gold: this.state.gold });
    this.bus.emit('lives:change', { lives: this.state.lives });
  }

  /** Kick off a new run from the title screen. */
  newGame(): void {
    this.state.towers = [];
    this.state.rocks = [];
    this.state.creeps = [];
    this.state.projectiles = [];
    this.state.undoStack = [];
    this.state.draws = [];
    this.state.activeDrawSlot = null;
    this.state.designatedKeepTowerId = null;
    this.state.chanceTier = 0;
    this.state.selectedTowerId = null;
    this.selectedTowerId = null;
    this.state.tick = 0;
    this.state.wave = 0;
    this.state.lives = START_LIVES;
    this.state.gold = START_GOLD;
    this.state.totalKills = 0;
    this.state.speed = 1;
    // Reset grid
    this.state.grid = BASE.grid.map((row) => row.slice());
    renderGround(this.layers.ground, this.state.grid);
    renderCheckpoints(this.layers.checkpoints);
    this.refreshRoute();
    this.enterBuild();
  }

  enterBuild(): void {
    this.state.phase = 'build';
    this.state.wave += 1;
    this.state.undoStack = [];
    this.state.designatedKeepTowerId = null;
    this.state.waveStats = { spawnedThisWave: 0, killedThisWave: 0, leakedThisWave: 0, totalToSpawn: 0 };
    this.buildPhase.onEnter();
    this.bus.emit('phase:enter', { phase: 'build' });
  }

  enterWave(): void {
    if (this.state.phase !== 'build') return;
    // A recipe combine during the round can auto-conclude (clears draws, sets keep).
    const roundConcluded = this.state.draws.length === 0 && this.state.designatedKeepTowerId !== null;
    if (!roundConcluded) {
      if (!this.buildPhase.ready()) {
        this.bus.emit('toast', { kind: 'error', text: 'Place all 5 gems first' });
        return;
      }
      if (this.state.designatedKeepTowerId === null) {
        this.bus.emit('toast', { kind: 'error', text: 'Mark one gem to keep first' });
        return;
      }
      this.buildPhase.applyKeepAndRock();
    }
    this.state.draws = [];
    this.state.designatedKeepTowerId = null;
    this.state.phase = 'wave';
    this.state.undoStack = [];
    this.state.activeDrawSlot = null;
    this.wavePhase.onEnter(this.state.wave);
    this.bus.emit('phase:enter', { phase: 'wave' });
    this.bus.emit('wave:start', { wave: this.state.wave });
  }

  endWave(lifeLost: number, goldEarned: number): void {
    this.bus.emit('wave:end', { wave: this.state.wave, lifeLost, goldEarned });
    if (this.state.lives <= 0) {
      this.state.phase = 'gameover';
      this.bus.emit('phase:enter', { phase: 'gameover' });
      return;
    }
    if (this.state.wave >= this.state.totalWaves) {
      this.state.phase = 'victory';
      this.bus.emit('phase:enter', { phase: 'victory' });
      return;
    }
    this.enterBuild();
  }

  /** Re-runs A* for all waypoints; updates state.routeSegments / flatRoute. */
  refreshRoute(): boolean {
    const route = findRoute(this.state.grid);
    if (!route) {
      // Should not happen on a valid board; preserve last known good route.
      return false;
    }
    this.state.routeSegments = route;
    this.state.flatRoute = flattenRoute(route);
    renderPathTrace(this.layers.pathOverlay, route);
    return true;
  }

  nextId(): number {
    return this.nextEntityId++;
  }

  selectTower(id: number | null): void {
    this.selectedTowerId = id;
    this.state.selectedTowerId = id;
  }

  setSpeed(s: 1 | 2 | 4): void {
    this.state.speed = s;
  }

  /** Center the board container in the canvas host. */
  layoutBoard(canvasW: number, canvasH: number): void {
    const boardW = this.state.grid[0].length * TILE;
    const boardH = this.state.grid.length * TILE;
    this.board.x = Math.round((canvasW - boardW) / 2);
    this.board.y = Math.round((canvasH - boardH) / 2);
  }

  /** Pixi ticker callback. */
  private tick(ticker: Ticker): void {
    const dtMs = ticker.deltaMS;
    const speed = this.state.speed;
    const cap = 0.25; // safety: don't run more than 250ms of sim per frame
    let toSimulate = Math.min(cap, (dtMs / 1000) * speed);
    this.accum += toSimulate;
    while (this.accum >= SIM_DT) {
      this.simStep();
      this.accum -= SIM_DT;
    }
    this.renderEntities();
  }

  private simStep(): void {
    this.state.tick += 1;
    if (this.state.phase === 'wave') {
      this.wavePhase.step();
    }
    this.combat.step();
  }

  private renderEntities(): void {
    renderTowers(this.layers.towers, this.state.towers, this.towerSprites);
    renderRocks(this.layers.rocks, this.state.rocks);
    renderCreeps(this.layers.creeps, this.state.creeps);
    renderProjectiles(this.layers.projectiles, this.state.projectiles);
    renderRangePreview(this.layers.preview, this.state, this.hoverTile, this.selectedTowerId);
    renderHover(this.layers.preview, this.state, this.hoverTile);
  }

  // Public command surface used by UI / input.
  cmdPlace(x: number, y: number): boolean {
    return this.buildPhase.place(x, y);
  }
  cmdSell(towerId: number): boolean {
    return this.buildPhase.sell(towerId);
  }
  cmdUndo(): boolean {
    return this.buildPhase.undo();
  }
  cmdStartWave(): void {
    this.enterWave();
  }
  cmdSetActiveSlot(slotId: number): void {
    this.buildPhase.setActiveSlot(slotId);
  }
  cmdCycleActiveSlot(direction: 1 | -1): void {
    const state = this.state;
    if (state.draws.length === 0) return;
    const unplaced = state.draws.filter((d) => d.placedTowerId === null);
    if (unplaced.length === 0) return;
    const sorted = unplaced.map((d) => d.slotId).sort((a, b) => a - b);
    const cur = state.activeDrawSlot ?? sorted[0];
    const idx = sorted.indexOf(cur);
    const nextIdx = idx < 0 ? 0 : (idx + direction + sorted.length) % sorted.length;
    this.buildPhase.setActiveSlot(sorted[nextIdx]);
  }
  cmdDesignateKeep(towerId: number): boolean {
    const state = this.state;
    if (state.phase !== 'build') return false;
    const isCurrentDraw = state.draws.some((d) => d.placedTowerId === towerId);
    if (!isCurrentDraw) {
      this.bus.emit('toast', { kind: 'error', text: 'Mark a gem from this round only' });
      return false;
    }
    state.designatedKeepTowerId = towerId;
    this.bus.emit('draws:change', {});
    return true;
  }
  cmdUpgradeChanceTier(): boolean {
    const state = this.state;
    if (state.phase !== 'build') {
      this.bus.emit('toast', { kind: 'error', text: 'Upgrade only in build phase' });
      return false;
    }
    if (state.chanceTier >= MAX_CHANCE_TIER) {
      this.bus.emit('toast', { kind: 'info', text: 'Chance tier maxed' });
      return false;
    }
    const cost = CHANCE_TIER_UPGRADE_COST[state.chanceTier];
    if (state.gold < cost) {
      this.bus.emit('toast', { kind: 'error', text: `Need ${cost}g` });
      return false;
    }
    state.gold -= cost;
    state.chanceTier += 1;
    this.bus.emit('gold:change', { gold: state.gold });
    this.bus.emit('toast', { kind: 'good', text: `Chance tier → L${state.chanceTier}` });
    return true;
  }
  cmdCombine(towerIds: number[]): boolean {
    return this.buildPhase.combine(towerIds);
  }
}
