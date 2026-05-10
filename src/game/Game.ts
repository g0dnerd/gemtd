/**
 * Top-level game controller. Owns:
 *  - the Pixi Application (rendering)
 *  - the State (game data)
 *  - the EventBus (UI ↔ sim communication)
 *  - the BuildPhase / WavePhase controllers
 *
 * Main loop is fixed-step at SIM_HZ; render runs each Pixi tick.
 */

import { Application, Container, Ticker } from "pixi.js";
import { State, emptyState, allDrawsPlaced } from "./State";
import { EventBus } from "../events/EventBus";
import { RNG } from "./rng";
import { BASE, Cell } from "../data/map";
import { findRoute, flattenRoute, buildAirRoute } from "../systems/Pathfinding";
import {
  BoardLayers,
  makeBoardLayers,
  renderGround,
  renderPathTrace,
  renderCheckpoints,
} from "../render/BoardRenderer";
import { FINE_TILE, START_GOLD, START_LIVES, SIM_DT, type SpeedMultiplier } from "./constants";
import { BuildPhase } from "../controllers/BuildPhase";
import { WavePhase } from "../controllers/WavePhase";
import { WAVES } from "../data/waves";
import { CHANCE_TIER_UPGRADE_COST, MAX_CHANCE_TIER } from "./constants";
import { COMBOS, nextUpgrade } from "../data/combos";
import { Combat } from "../systems/Combat";
import { Traps } from "../systems/Traps";
import { TowerSpriteCache } from "../render/TowerRenderer";
import {
  renderTowers,
  renderRocks,
  renderCreeps,
  renderProjectiles,
  renderHover,
  renderRangePreview,
} from "../render/EntityRenderer";
import { renderCursorGrid, renderUniformGrid } from "../render/CursorGrid";
import {
  type Blueprint,
  computeKeeperIndices,
  renderBlueprintOverlay,
} from "../render/BlueprintOverlay";
import blueprintData from "../../tools/maze_optimizer/blueprint_v3.json";

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
  private traps: Traps;

  /** Accumulator for fixed-step sim. */
  private accum = 0;
  private lastTickTime = performance.now();
  private backgroundInterval: ReturnType<typeof setInterval> | null = null;
  private nextEntityId = 1;

  /** Tile under the pointer (for build preview). null if outside the board. */
  hoverTile: { x: number; y: number } | null = null;

  /** Raw pointer position in board-space pixels. null if outside the board. */
  hoverPixel: { x: number; y: number } | null = null;

  /** Whether the pointer is currently over the canvas. */
  hoverPresent = false;

  /** Animated halo opacity (0..1). Fades in on pointer-enter, out on pointer-leave. */
  haloAlpha = 0;

  /** Last known hover positions — kept alive during fade-out so the grid doesn't vanish instantly. */
  private lastHoverPixel: { x: number; y: number } | null = null;
  private lastHoverTile: { x: number; y: number } | null = null;

  /** Whether the cursor-local grid feature is enabled (tweaks toggle). */
  cursorGridEnabled = true;

  /** Whether the path overlay is visible. Persisted to localStorage. */
  pathVizEnabled = true;

  /** Blueprint overlay mode — hidden cheat activated by Ctrl+B. */
  blueprintMode = false;
  private blueprint: Blueprint | null = null;

  /** Currently selected tower (if any). null otherwise. */
  selectedTowerId: number | null = null;

  /** Currently selected rock anchor id (mutually exclusive with selectedTowerId). */
  selectedRockId: number | null = null;

  constructor(app: Application) {
    this.app = app;
    this.rng = new RNG(
      (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
    );

    const grid: Cell[][] = BASE.grid.map((row) => row.slice());
    this.state = emptyState(grid, WAVES.length);

    this.board = new Container();
    this.board.label = "board";
    this.layers = makeBoardLayers();
    this.board.addChild(this.layers.root);
    this.app.stage.addChild(this.board);

    this.towerSprites = new TowerSpriteCache(this.app.renderer, this.bus);

    const storedPathViz = localStorage.getItem("gemtd:pathViz");
    if (storedPathViz !== null) this.pathVizEnabled = storedPathViz === "1";

    this.buildPhase = new BuildPhase(this);
    this.wavePhase = new WavePhase(this);
    this.combat = new Combat(this);
    this.traps = new Traps(this);

    renderGround(this.layers.ground, this.state.grid);
    renderCheckpoints(this.layers.checkpoints);
    this.refreshRoute();

    this.app.ticker.add(this.tick, this);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.backgroundInterval = setInterval(
          () => this.drainAccumulator(),
          1000,
        );
      } else {
        if (this.backgroundInterval !== null) {
          clearInterval(this.backgroundInterval);
          this.backgroundInterval = null;
        }
      }
    });
  }

  start(): void {
    this.state.phase = "title";
    this.state.lives = START_LIVES;
    this.state.gold = START_GOLD;
    this.state.wave = 0;
    this.bus.emit("phase:enter", { phase: "title" });
    this.bus.emit("gold:change", { gold: this.state.gold });
    this.bus.emit("lives:change", { lives: this.state.lives });
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
    this.state.selectedRockId = null;
    this.selectedTowerId = null;
    this.selectedRockId = null;
    this.state.rocksRemoved = 0;
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
    this.state.phase = "build";
    this.state.wave += 1;
    this.state.undoStack = [];
    this.state.designatedKeepTowerId = null;
    this.state.waveStats = {
      spawnedThisWave: 0,
      killedThisWave: 0,
      leakedThisWave: 0,
      totalToSpawn: 0,
    };
    this.buildPhase.onEnter();
    this.bus.emit("phase:enter", { phase: "build" });
  }

  enterWave(): void {
    if (this.state.phase !== "build") return;
    // A recipe combine during the round can auto-conclude (clears draws, sets keep).
    const roundConcluded =
      this.state.draws.length === 0 &&
      this.state.designatedKeepTowerId !== null;
    if (!roundConcluded) {
      if (!this.buildPhase.ready()) {
        this.bus.emit("toast", {
          kind: "error",
          text: "Place all 5 gems first",
        });
        return;
      }
      if (this.state.designatedKeepTowerId === null) {
        this.bus.emit("toast", {
          kind: "error",
          text: "Mark one gem to keep first",
        });
        return;
      }
      this.buildPhase.applyKeepAndRock();
    }
    this.state.draws = [];
    this.state.designatedKeepTowerId = null;
    this.state.phase = "wave";
    this.state.undoStack = [];
    this.state.activeDrawSlot = null;
    this.wavePhase.onEnter(this.state.wave);
    this.bus.emit("phase:enter", { phase: "wave" });
    this.bus.emit("wave:start", { wave: this.state.wave });
  }

  endWave(lifeLost: number, goldEarned: number): void {
    this.bus.emit("wave:end", { wave: this.state.wave, lifeLost, goldEarned });
    if (this.state.lives <= 0) {
      this.state.phase = "gameover";
      this.bus.emit("phase:enter", { phase: "gameover" });
      return;
    }
    if (this.state.wave >= this.state.totalWaves) {
      this.state.phase = "victory";
      this.bus.emit("phase:enter", { phase: "victory" });
      return;
    }
    this.enterBuild();
  }

  /** Re-runs A* for all waypoints; updates state.routeSegments / flatRoute. */
  refreshRoute(): boolean {
    const route = findRoute(this.state.grid);
    if (!route) {
      return false;
    }
    this.state.routeSegments = route;
    this.state.flatRoute = flattenRoute(route);
    if (this.state.airRoute.length === 0) {
      this.state.airRoute = buildAirRoute();
    }
    if (this.pathVizEnabled) {
      renderPathTrace(this.layers.pathOverlay, route, this.state.phase);
    } else {
      this.layers.pathOverlay.removeChildren();
    }
    return true;
  }

  togglePathViz(): void {
    this.pathVizEnabled = !this.pathVizEnabled;
    try { localStorage.setItem("gemtd:pathViz", this.pathVizEnabled ? "1" : "0"); }
    catch { /* private mode */ }
    this.refreshRoute();
  }

  toggleBlueprint(): void {
    this.blueprintMode = !this.blueprintMode;
    if (this.blueprintMode && !this.blueprint) {
      const bp = blueprintData as unknown as Blueprint;
      bp.keeperIndices = computeKeeperIndices(bp);
      this.blueprint = bp;
    }
  }

  nextId(): number {
    return this.nextEntityId++;
  }

  selectTower(id: number | null): void {
    this.selectedTowerId = id;
    this.state.selectedTowerId = id;
    if (id !== null) {
      this.selectedRockId = null;
      this.state.selectedRockId = null;
    }
  }

  selectRock(id: number | null): void {
    this.selectedRockId = id;
    this.state.selectedRockId = id;
    if (id !== null) {
      this.selectedTowerId = null;
      this.state.selectedTowerId = null;
    }
  }

  /** Cost in gold to demolish the next rock. Starts at 2 and grows by 1 per removal. */
  rockRemovalCost(): number {
    return 2 + this.state.rocksRemoved;
  }

  /** True when the rock can be removed: not currently in the same build phase it was placed in. */
  canRemoveRock(rockId: number): boolean {
    const rock = this.state.rocks.find((r) => r.id === rockId);
    if (!rock) return false;
    return !(
      this.state.phase === "build" &&
      this.state.wave === rock.placedAtBuildOfWave
    );
  }

  cmdRemoveRock(rockId: number): boolean {
    const state = this.state;
    const cells = state.rocks.filter((r) => r.id === rockId);
    if (cells.length === 0) return false;
    if (!this.canRemoveRock(rockId)) {
      this.bus.emit("toast", {
        kind: "error",
        text: "Wait until this round ends",
      });
      return false;
    }
    const cost = this.rockRemovalCost();
    if (state.gold < cost) {
      this.bus.emit("toast", { kind: "error", text: `Need ${cost}g` });
      return false;
    }
    for (const c of cells) {
      state.grid[c.y][c.x] = Cell.Grass;
    }
    state.rocks = state.rocks.filter((r) => r.id !== rockId);
    state.gold -= cost;
    state.rocksRemoved += 1;
    if (state.selectedRockId === rockId) this.selectRock(null);
    this.refreshRoute();
    this.bus.emit("gold:change", { gold: state.gold });
    this.bus.emit("toast", { kind: "good", text: `Rock cleared · −${cost}g` });
    return true;
  }

  setSpeed(s: SpeedMultiplier): void {
    this.state.speed = s;
  }

  /** Center the board container in the canvas host. */
  layoutBoard(canvasW: number, canvasH: number): void {
    const boardW = this.state.grid[0].length * FINE_TILE;
    const boardH = this.state.grid.length * FINE_TILE;
    this.board.x = Math.round((canvasW - boardW) / 2);
    this.board.y = Math.round((canvasH - boardH) / 2);
  }

  /** Pixi ticker callback. */
  private tick(_ticker: Ticker): void {
    this.drainAccumulator();
    this.renderEntities();
  }

  /** Advance the sim to match elapsed wall-clock time. */
  private drainAccumulator(): void {
    const now = performance.now();
    const dtMs = now - this.lastTickTime;
    this.lastTickTime = now;
    const speed = this.state.speed;
    const maxCatchUp = 120;
    const toSimulate = Math.min(maxCatchUp, (dtMs / 1000) * speed);
    this.accum += toSimulate;
    while (this.accum >= SIM_DT) {
      this.simStep();
      this.accum -= SIM_DT;
    }
  }

  private simStep(): void {
    this.state.tick += 1;
    if (this.state.phase === "wave") {
      this.wavePhase.step();
    }
    this.combat.step();
    this.traps.step();
  }

  private renderEntities(): void {
    this.updateHaloAlpha();
    renderTowers(
      this.layers.towers,
      this.state.towers,
      this.towerSprites,
      this.state.tick,
    );
    renderRocks(this.layers.rocks, this.state.rocks, this.towerSprites);
    renderCreeps(this.layers.creeps, this.state.creeps);
    renderProjectiles(this.layers.projectiles, this.state.projectiles);
    if (this.blueprintMode) {
      const placedCount = this.state.draws.filter(
        (d) => d.placedTowerId !== null,
      ).length;
      renderBlueprintOverlay(
        this.layers.blueprint,
        this.blueprint,
        this.state.wave,
        this.state.phase,
        placedCount,
      );
    } else {
      renderBlueprintOverlay(this.layers.blueprint, null, 0, "", 0);
    }
    renderRangePreview(
      this.layers.preview,
      this.state,
      this.hoverTile,
      this.selectedTowerId,
    );
    renderHover(this.layers.preview, this.state, this.hoverTile);
    if (this.hoverPixel) this.lastHoverPixel = this.hoverPixel;
    if (this.hoverTile) this.lastHoverTile = this.hoverTile;
    if (this.cursorGridEnabled) {
      renderCursorGrid(
        this.layers.cursorGrid,
        this.layers.ghostCell,
        this.hoverPixel ?? this.lastHoverPixel,
        this.hoverTile ?? this.lastHoverTile,
        this.haloAlpha,
        this.state.phase,
        this.state.grid,
      );
    } else {
      renderUniformGrid(this.layers.cursorGrid, this.state.phase);
    }
  }

  private updateHaloAlpha(): void {
    // 120ms fade-in, 160ms fade-out, driven by real frame delta (render-only, not sim).
    const fadeInRate = 1 / (0.12 * 60); // per-frame at 60fps
    const fadeOutRate = 1 / (0.16 * 60);
    const dt = this.app.ticker.deltaTime; // frames elapsed (typically ~1)
    if (this.hoverPresent && this.state.phase === "build") {
      this.haloAlpha = Math.min(1, this.haloAlpha + fadeInRate * dt);
    } else {
      this.haloAlpha = Math.max(0, this.haloAlpha - fadeOutRate * dt);
    }
  }

  // Public command surface used by UI / input.
  cmdPlace(x: number, y: number): boolean {
    const ok = this.buildPhase.place(x, y);
    if (ok && this.blueprintMode && this.blueprint) {
      const roundIdx = this.state.wave - 1;
      const bp = this.blueprint;
      if (roundIdx >= 0 && roundIdx < bp.rounds.length) {
        const positions = bp.rounds[roundIdx];
        const keeperIdx = bp.keeperIndices?.[roundIdx] ?? 0;
        const [kx, ky] = positions[keeperIdx];
        if (x === kx && y === ky) {
          const rest = positions.filter((_p, i) => i !== keeperIdx);
          for (let i = rest.length - 1; i > 0; i--) {
            const j = this.rng.int(i + 1);
            [rest[i], rest[j]] = [rest[j], rest[i]];
          }
          for (const [px, py] of rest) {
            this.buildPhase.place(px, py);
          }
        }
      }
    }
    return ok;
  }
  cmdUndo(): boolean {
    return this.buildPhase.undo();
  }
  cmdStartWave(): void {
    this.enterWave();
  }
  /** Roll the round's draws. Only valid in build phase before placement begins. */
  cmdStartPlacement(): boolean {
    const state = this.state;
    if (state.phase !== "build") return false;
    if (state.draws.length > 0 || state.designatedKeepTowerId !== null)
      return false;
    this.buildPhase.rollDraws();
    return true;
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
    const nextIdx =
      idx < 0 ? 0 : (idx + direction + sorted.length) % sorted.length;
    this.buildPhase.setActiveSlot(sorted[nextIdx]);
  }
  cmdDesignateKeep(towerId: number): boolean {
    const state = this.state;
    if (state.phase !== "build") return false;
    const isCurrentDraw = state.draws.some((d) => d.placedTowerId === towerId);
    if (!isCurrentDraw) {
      this.bus.emit("toast", {
        kind: "error",
        text: "Mark a gem from this round only",
      });
      return false;
    }
    state.designatedKeepTowerId = towerId;
    this.bus.emit("draws:change", {});
    if (allDrawsPlaced(state)) {
      this.enterWave();
    }
    return true;
  }
  cmdUpgradeChanceTier(): boolean {
    const state = this.state;
    if (state.chanceTier >= MAX_CHANCE_TIER) {
      this.bus.emit("toast", { kind: "info", text: "Chance tier maxed" });
      return false;
    }
    const cost = CHANCE_TIER_UPGRADE_COST[state.chanceTier];
    if (state.gold < cost) {
      this.bus.emit("toast", { kind: "error", text: `Need ${cost}g` });
      return false;
    }
    state.gold -= cost;
    state.chanceTier += 1;
    this.bus.emit("gold:change", { gold: state.gold });
    this.bus.emit("toast", {
      kind: "good",
      text: `Chance tier → L${state.chanceTier}`,
    });
    return true;
  }
  cmdCombine(towerIds: number[]): boolean {
    return this.buildPhase.combine(towerIds);
  }
  cmdUpgradeTower(towerId: number): boolean {
    const state = this.state;
    const tower = state.towers.find((t) => t.id === towerId);
    if (!tower || !tower.comboKey) {
      this.bus.emit("toast", { kind: "error", text: "Not a special tower" });
      return false;
    }
    const combo = COMBOS.find((c) => c.key === tower.comboKey);
    if (!combo) return false;
    const currentTier = tower.upgradeTier ?? 0;
    const upgrade = nextUpgrade(combo, currentTier);
    if (!upgrade) {
      this.bus.emit("toast", { kind: "info", text: "Already max tier" });
      return false;
    }
    if (state.gold < upgrade.cost) {
      this.bus.emit("toast", { kind: "error", text: `Need ${upgrade.cost}g` });
      return false;
    }
    state.gold -= upgrade.cost;
    tower.upgradeTier = currentTier + 1;
    this.bus.emit("gold:change", { gold: state.gold });
    this.bus.emit("tower:upgrade", {
      id: towerId,
      comboKey: tower.comboKey,
      tier: tower.upgradeTier,
    });
    this.bus.emit("toast", {
      kind: "good",
      text: `Upgraded to ${upgrade.name}`,
    });
    return true;
  }
}
