import { State, emptyState, allDrawsPlaced } from '../game/State';
import { EventBus } from '../events/EventBus';
import { RNG } from '../game/rng';
import { BASE, Cell } from '../data/map';
import { findRoute, flattenRoute, buildAirRoute } from '../systems/Pathfinding';
import { START_GOLD, START_LIVES, MAX_CHANCE_TIER, CHANCE_TIER_UPGRADE_COST } from '../game/constants';
import { BuildPhase } from '../controllers/BuildPhase';
import { WavePhase } from '../controllers/WavePhase';
import { WAVES } from '../data/waves';
import { COMBOS, nextUpgrade } from '../data/combos';
import { Combat } from '../systems/Combat';
import type { Game } from '../game/Game';
import type { SimAI, GameResult } from './types';

export class HeadlessGame {
  readonly bus = new EventBus();
  readonly state: State;
  readonly rng: RNG;
  readonly seed: number;

  private buildPhase: BuildPhase;
  private wavePhase: WavePhase;
  private combat: Combat;
  private nextEntityId = 1;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new RNG(seed);
    const grid: Cell[][] = BASE.grid.map((row) => row.slice());
    this.state = emptyState(grid, WAVES.length);

    const self = this as unknown as Game;
    this.buildPhase = new BuildPhase(self);
    this.wavePhase = new WavePhase(self);
    this.combat = new Combat(self);

    this.refreshRoute();
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
    this.state.selectedRockId = null;
    this.state.rocksRemoved = 0;
    this.state.tick = 0;
    this.state.wave = 0;
    this.state.lives = START_LIVES;
    this.state.gold = START_GOLD;
    this.state.totalKills = 0;
    this.state.speed = 1;
    this.state.grid = BASE.grid.map((row) => row.slice());
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
    const roundConcluded = this.state.draws.length === 0 && this.state.designatedKeepTowerId !== null;
    if (!roundConcluded) {
      if (!this.buildPhase.ready()) return;
      if (this.state.designatedKeepTowerId === null) return;
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

  refreshRoute(): boolean {
    const route = findRoute(this.state.grid);
    if (!route) return false;
    this.state.routeSegments = route;
    this.state.flatRoute = flattenRoute(route);
    if (this.state.airRoute.length === 0) {
      this.state.airRoute = buildAirRoute();
    }
    return true;
  }

  nextId(): number {
    return this.nextEntityId++;
  }

  selectTower(id: number | null): void {
    this.state.selectedTowerId = id;
  }

  simStep(): void {
    this.state.tick += 1;
    if (this.state.phase === 'wave') {
      this.wavePhase.step();
    }
    this.combat.step();
  }

  runWave(maxTicks = 60 * 60 * 5): void {
    for (let i = 0; i < maxTicks; i++) {
      if (this.state.phase !== 'wave') break;
      this.simStep();
    }
  }

  // --- Command surface (mirrors Game.ts) ---

  cmdPlace(x: number, y: number): boolean {
    return this.buildPhase.place(x, y);
  }

  cmdUndo(): boolean {
    return this.buildPhase.undo();
  }

  cmdStartWave(): void {
    this.enterWave();
  }

  cmdStartPlacement(): boolean {
    const state = this.state;
    if (state.phase !== 'build') return false;
    if (state.draws.length > 0 || state.designatedKeepTowerId !== null) return false;
    this.buildPhase.rollDraws();
    return true;
  }

  cmdSetActiveSlot(slotId: number): void {
    this.buildPhase.setActiveSlot(slotId);
  }

  cmdDesignateKeep(towerId: number): boolean {
    const state = this.state;
    if (state.phase !== 'build') return false;
    const isCurrentDraw = state.draws.some((d) => d.placedTowerId === towerId);
    if (!isCurrentDraw) return false;
    state.designatedKeepTowerId = towerId;
    this.bus.emit('draws:change', {});
    if (allDrawsPlaced(state)) {
      this.enterWave();
    }
    return true;
  }

  cmdUpgradeChanceTier(): boolean {
    const state = this.state;
    if (state.phase !== 'build') return false;
    if (state.chanceTier >= MAX_CHANCE_TIER) return false;
    const cost = CHANCE_TIER_UPGRADE_COST[state.chanceTier];
    if (state.gold < cost) return false;
    state.gold -= cost;
    state.chanceTier += 1;
    this.bus.emit('gold:change', { gold: state.gold });
    return true;
  }

  cmdCombine(towerIds: number[]): boolean {
    return this.buildPhase.combine(towerIds);
  }

  cmdUpgradeTower(towerId: number): boolean {
    const state = this.state;
    const tower = state.towers.find((t) => t.id === towerId);
    if (!tower || !tower.comboKey) return false;
    const combo = COMBOS.find((c) => c.key === tower.comboKey);
    if (!combo) return false;
    const currentTier = tower.upgradeTier ?? 0;
    const upgrade = nextUpgrade(combo, currentTier);
    if (!upgrade) return false;
    if (state.gold < upgrade.cost) return false;
    state.gold -= upgrade.cost;
    tower.upgradeTier = currentTier + 1;
    this.bus.emit('gold:change', { gold: state.gold });
    this.bus.emit('tower:upgrade', { id: towerId, comboKey: tower.comboKey, tier: tower.upgradeTier });
    return true;
  }

  runGame(ai: SimAI): GameResult {
    this.newGame();
    for (;;) {
      const phase = this.state.phase;
      if (phase !== 'build') break;
      ai.playBuild(this);
      if ((this.state.phase as string) !== 'wave') break;
      this.runWave();
      if ((this.state.phase as string) === 'wave') {
        this.state.phase = 'gameover';
        break;
      }
    }
    return {
      seed: this.seed,
      waveReached: this.state.wave,
      finalGold: this.state.gold,
      finalLives: this.state.lives,
      waveSummaries: [],
      towerSummaries: [],
      outcome: this.state.phase === 'victory' ? 'victory' : 'gameover',
    };
  }
}
