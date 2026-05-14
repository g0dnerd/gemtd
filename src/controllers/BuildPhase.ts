/**
 * Build-phase logic: 5-gem draw at wave start, place / undo / combine.
 *
 * Canonical SC2 GemTD: every build phase rolls 5 random gems. The player must
 * place all 5 before starting the wave. After the wave, KeeperPhase asks the
 * player which one to keep — the other 4 become rocks.
 *
 * Placement rules:
 *  - Tile must be buildable Grass.
 *  - Placement must not break the path through any consecutive waypoint pair.
 *  - Draws are free (canonical: gems aren't bought, they're rolled).
 */

import { Cell, GRID_H, GRID_W, isBuildable } from '../data/map';
import { Game } from '../game/Game';
import { findCombo, COMBO_BY_NAME } from '../data/combos';
import type { GemType, Quality } from '../render/theme';
import { GEM_TYPES } from '../render/theme';
import { findRoute } from '../systems/Pathfinding';
import { CHANCE_TIER_WEIGHTS, QUALITY_BASE_COST } from '../game/constants';
import { State, TowerState, DRAW_COUNT, activeDraw, allDrawsPlaced, nextUnplacedSlot } from '../game/State';

/** Towers and their rock remnants both occupy a 2×2 fine-cell footprint. */
const FOOTPRINT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

function footprintCells(ax: number, ay: number): Array<{ x: number; y: number }> {
  return FOOTPRINT_OFFSETS.map(([dx, dy]) => ({ x: ax + dx, y: ay + dy }));
}

function setFootprint(state: State, ax: number, ay: number, cell: Cell): void {
  for (const c of footprintCells(ax, ay)) state.grid[c.y][c.x] = cell;
}

function rockFootprint(state: State, ax: number, ay: number, id: number): Array<{ x: number; y: number }> {
  const cells = footprintCells(ax, ay);
  for (const c of cells) {
    state.grid[c.y][c.x] = Cell.Rock;
    state.rocks.push({ x: c.x, y: c.y, id, placedAtBuildOfWave: state.wave });
  }
  return cells;
}

function unrockFootprint(state: State, ax: number, ay: number): void {
  for (const c of footprintCells(ax, ay)) {
    state.grid[c.y][c.x] = Cell.Grass;
    const idx = state.rocks.findIndex((r) => r.x === c.x && r.y === c.y);
    if (idx >= 0) state.rocks.splice(idx, 1);
  }
}

export class BuildPhase {
  constructor(private game: Game) {}

  /**
   * Build phase opens in a "pre-placement" sub-state with no draws rolled yet,
   * so the player can spend wave-end gold on chance-tier upgrades before
   * committing to the round's draws. {@link rollDraws} flips us into placement.
   *
   * Exception: on wave 1 the player has no gold to upgrade with, so we roll
   * straight away to skip an empty pre-placement screen.
   */
  onEnter(): void {
    if (this.game.state.wave === 1) this.rollDraws();
  }

  /** Generate DRAW_COUNT fresh draw slots. */
  rollDraws(): void {
    const state = this.game.state;
    state.draws = [];

    const gems: Array<{ gem: GemType; quality: Quality }> = [];

    if (state.wave === 1) {
      // Guarantee ingredients for a random early-game special (Silver or Malachite).
      const recipes: GemType[][] = [
        ['topaz', 'diamond', 'sapphire'],
        ['opal', 'emerald', 'aquamarine'],
      ];
      for (const g of this.game.rng.pick(recipes)) {
        gems.push({ gem: g, quality: 1 });
      }
      for (let i = gems.length; i < DRAW_COUNT; i++) {
        gems.push({ gem: this.game.rng.pick(GEM_TYPES), quality: pickQuality(this.game.rng.next(), state.chanceTier) });
      }
      for (let i = gems.length - 1; i > 0; i--) {
        const j = this.game.rng.int(i + 1);
        [gems[i], gems[j]] = [gems[j], gems[i]];
      }
    } else {
      for (let i = 0; i < DRAW_COUNT; i++) {
        gems.push({ gem: this.game.rng.pick(GEM_TYPES), quality: pickQuality(this.game.rng.next(), state.chanceTier) });
      }
    }

    for (let i = 0; i < DRAW_COUNT; i++) {
      state.draws.push({ slotId: i, gem: gems[i].gem, quality: gems[i].quality, placedTowerId: null });
    }
    state.activeDrawSlot = 0;
    this.game.bus.emit('draws:roll', { count: state.draws.length });
  }

  /** Set the active draw slot (called by HUD chip clicks / Tab key). */
  setActiveSlot(slotId: number): void {
    const state = this.game.state;
    const slot = state.draws.find((d) => d.slotId === slotId);
    if (!slot || slot.placedTowerId !== null) return;
    state.activeDrawSlot = slotId;
  }

  /**
   * Place the active draw at (x, y). Returns true on success.
   */
  place(x: number, y: number): boolean {
    const state = this.game.state;
    if (state.phase !== 'build') {
      this.game.bus.emit('toast', { kind: 'error', text: 'Wave in progress' });
      return false;
    }
    const slot = activeDraw(state);
    if (!slot) {
      this.game.bus.emit('toast', { kind: 'error', text: 'No gem drawn' });
      return false;
    }
    // Anchor (x, y) is the top-left of the 2×2 footprint.
    if (x < 0 || y < 0 || x + 1 >= GRID_W || y + 1 >= GRID_H) return false;
    for (const c of footprintCells(x, y)) {
      if (!isBuildable(state.grid[c.y][c.x])) {
        this.game.bus.emit('toast', { kind: 'error', text: 'Cannot build there' });
        return false;
      }
    }

    // Tentatively block all 4 footprint cells and try to find a route.
    const tentative = new Set<number>();
    for (const c of footprintCells(x, y)) tentative.add(c.y * GRID_W + c.x);
    const tryRoute = findRoute(state.grid, tentative);
    if (!tryRoute) {
      this.game.bus.emit('toast', { kind: 'error', text: 'Would block path' });
      return false;
    }

    // Commit.
    const id = this.game.nextId();
    const placedSlotId = slot.slotId;
    const placedGem = slot.gem;
    const placedQuality = slot.quality;
    const tower: TowerState = {
      id,
      x, y,
      gem: placedGem,
      quality: placedQuality,
      lastFireTick: 0,
      kills: 0,
      totalDamage: 0,
      placedWave: state.wave,
    };
    state.towers.push(tower);
    setFootprint(state, x, y, Cell.Tower);
    slot.placedTowerId = id;
    state.activeDrawSlot = nextUnplacedSlot(state);
    this.game.refreshRoute();
    this.game.selectTower(null);
    this.game.selectRock(null);

    // Push to undo stack.
    state.undoStack.push({
      description: `Place ${placedGem} L${placedQuality}`,
      undo: () => {
        // Remove tower
        const idx = state.towers.findIndex((t) => t.id === id);
        if (idx >= 0) state.towers.splice(idx, 1);
        setFootprint(state, x, y, Cell.Grass);
        const s = state.draws.find((d) => d.slotId === placedSlotId);
        if (s) s.placedTowerId = null;
        state.activeDrawSlot = placedSlotId;
        this.game.refreshRoute();
        this.game.bus.emit('draws:change', { });
      },
    });

    this.game.bus.emit('tower:placed', {
      id, x, y, gem: tower.gem, quality: tower.quality,
    });
    this.game.bus.emit('draws:change', {});
    return true;
  }

  undo(): boolean {
    const state = this.game.state;
    const action = state.undoStack.pop();
    if (!action) {
      this.game.bus.emit('toast', { kind: 'info', text: 'Nothing to undo' });
      return false;
    }
    action.undo();
    return true;
  }

  /** Returns true if every draw slot is placed — gates wave start. */
  ready(): boolean {
    return allDrawsPlaced(this.game.state);
  }

  /**
   * Convert all current-round draw towers EXCEPT the designated keep into rocks.
   * Called just before WavePhase starts.
   */
  applyKeepAndRock(): void {
    const state = this.game.state;
    const keepId = state.designatedKeepTowerId;
    const drawTowerIds = state.draws
      .map((d) => d.placedTowerId)
      .filter((id): id is number => id !== null);
    for (const id of drawTowerIds) {
      if (id === keepId) continue;
      const idx = state.towers.findIndex((t) => t.id === id);
      if (idx < 0) continue;
      const t = state.towers[idx];
      state.towers.splice(idx, 1);
      rockFootprint(state, t.x, t.y, this.game.nextId());
    }
    this.game.refreshRoute();
    if (state.selectedTowerId !== null && !state.towers.some((t) => t.id === state.selectedTowerId)) {
      this.game.selectTower(null);
    }
  }

  /**
   * Combine the given tower IDs.
   *  - Level-up path (current-round only): 2 same (gem, quality) → +1 quality;
   *    4 same (gem, quality) → +2 quality. Clamped at 5.
   *  - Recipe path (any placed tower): exact (gem, quality) tuple match
   *    against a recipe in combos.ts.
   *
   * On success, all input towers are removed; the result tower is placed at
   * the FIRST input's tile, and every other input tile becomes a Rock.
   */
  combine(towerIds: number[]): boolean {
    const state = this.game.state;
    if (towerIds.length < 2) return false;

    const towers = towerIds.map((id) => state.towers.find((t) => t.id === id)).filter(Boolean) as TowerState[];
    if (towers.length !== towerIds.length) return false;

    // Anchor the result at the currently-selected tower whenever it's one of
    // the inputs — commitTransform places the new tower at towers[0].
    const selId = state.selectedTowerId;
    if (selId !== null) {
      const selIdx = towers.findIndex((t) => t.id === selId);
      if (selIdx > 0) {
        const [sel] = towers.splice(selIdx, 1);
        towers.unshift(sel);
      }
    }

    const currentRoundIds = new Set(
      state.draws.map((d) => d.placedTowerId).filter((id): id is number => id !== null),
    );
    const allCurrentRound = towers.every((t) => currentRoundIds.has(t.id));
    const noneCurrentRound = towers.every((t) => !currentRoundIds.has(t.id));

    // Level-up path: all same gem, same quality, length 2 or 4, all current-round.
    // Only allowed during build phase.
    const sameGem = towers.every((t) => t.gem === towers[0].gem);
    const sameQuality = towers.every((t) => t.quality === towers[0].quality);
    if (sameGem && sameQuality && (towers.length === 2 || towers.length === 4)) {
      const q = towers[0].quality;
      const bump = towers.length === 2 ? 1 : 2;
      const newQ = Math.min(5, q + bump) as Quality;
      if (newQ !== q) {
        if (state.phase !== 'build') {
          this.game.bus.emit('toast', { kind: 'error', text: 'Level-up only during build phase' });
          return false;
        }
        if (!allCurrentRound) {
          this.game.bus.emit('toast', { kind: 'error', text: 'Level-up requires current-round towers only' });
          return false;
        }
        const newTowerId = this.commitTransform(towers, towers[0].gem, newQ, undefined);
        this.autoConcludeRound(newTowerId);
        this.game.enterWave();
        return true;
      }
    }

    // Recipe path: strict (gem, quality) tuple match.
    // During build: all-current-round, all-kept, or exactly 1 current-round piece completing a kept set.
    if (state.phase === 'build' && !allCurrentRound && !noneCurrentRound) {
      const currentRoundCount = towers.filter((t) => currentRoundIds.has(t.id)).length;
      if (currentRoundCount > 1) {
        this.game.bus.emit('toast', { kind: 'error', text: 'Recipe allows at most 1 piece from the current round' });
        return false;
      }
    }
    const inputs = towers.map((t) => ({ gem: t.gem, quality: t.quality }));
    const combo = findCombo(inputs);
    if (!combo) {
      this.game.bus.emit('toast', { kind: 'error', text: 'No matching recipe' });
      return false;
    }
    const outputQ = (Math.max(...towers.map((t) => t.quality))) as Quality;
    const inputTouchedRound = state.phase === 'build' && towers.some((t) => currentRoundIds.has(t.id));
    const newTowerId = this.commitTransform(towers, combo.visualGem, outputQ, combo.key);
    if (inputTouchedRound) {
      this.autoConcludeRound(newTowerId);
      this.game.enterWave();
    }
    return true;
  }

  /**
   * After a recipe combine that consumed any current-round tower: the special
   * is auto-kept, every other current-round draw tower becomes a rock, and the
   * draw cycle ends. The wave can start immediately.
   */
  private autoConcludeRound(keepTowerId: number): void {
    const state = this.game.state;
    for (const d of state.draws) {
      const id = d.placedTowerId;
      if (id === null || id === keepTowerId) continue;
      const idx = state.towers.findIndex((t) => t.id === id);
      if (idx < 0) continue;
      const t = state.towers[idx];
      state.towers.splice(idx, 1);
      rockFootprint(state, t.x, t.y, this.game.nextId());
    }
    state.draws = [];
    state.activeDrawSlot = null;
    state.designatedKeepTowerId = keepTowerId;
    state.undoStack = [];
    this.game.refreshRoute();
    this.game.bus.emit('draws:change', {});
  }

  private commitTransform(
    inputs: TowerState[],
    outGem: GemType,
    outQuality: Quality,
    comboKey: string | undefined,
  ): number {
    const state = this.game.state;
    const baseTower = inputs[0];
    const removedIds = new Set(inputs.map((t) => t.id));

    // Track which draw slots consumed inputs — they need to be cleared so the
    // designated-keep / start-wave gating still makes sense.
    const slotsConsumed: Array<{ slotId: number; placedTowerId: number }> = [];
    for (const d of state.draws) {
      if (d.placedTowerId !== null && removedIds.has(d.placedTowerId)) {
        slotsConsumed.push({ slotId: d.slotId, placedTowerId: d.placedTowerId });
      }
    }
    const wasKeep = state.designatedKeepTowerId !== null && removedIds.has(state.designatedKeepTowerId);

    state.towers = state.towers.filter((t) => !removedIds.has(t.id));
    for (const t of inputs) {
      setFootprint(state, t.x, t.y, Cell.Grass);
    }

    // Place the new tower at the first input's anchor.
    const comboRecipe = comboKey ? COMBO_BY_NAME.get(comboKey) : undefined;
    const isTrap = comboRecipe?.type === 'trap';
    const newTower: TowerState = {
      id: this.game.nextId(),
      x: baseTower.x,
      y: baseTower.y,
      gem: outGem,
      quality: outQuality,
      comboKey,
      lastFireTick: 0,
      kills: 0,
      totalDamage: 0,
      placedWave: state.wave,
      isTrap: isTrap || undefined,
    };
    state.towers.push(newTower);
    setFootprint(state, baseTower.x, baseTower.y, isTrap ? Cell.Trap : Cell.Tower);

    // Non-result anchors become 2×2 rock footprints (mirrors keeper-rock).
    const rockedAnchors: Array<{ x: number; y: number }> = [];
    for (let i = 1; i < inputs.length; i++) {
      const t = inputs[i];
      rockFootprint(state, t.x, t.y, this.game.nextId());
      rockedAnchors.push({ x: t.x, y: t.y });
    }

    // Clear consumed draw slots; if the new tower is in the same round, fold it
    // into the first consumed slot so designate-keep still applies.
    if (slotsConsumed.length > 0) {
      const firstSlotId = slotsConsumed[0].slotId;
      for (const c of slotsConsumed) {
        const d = state.draws.find((dd) => dd.slotId === c.slotId);
        if (d) d.placedTowerId = null;
      }
      // If all consumed inputs were current-round, the result inherits the first slot.
      if (slotsConsumed.length === inputs.length) {
        const d = state.draws.find((dd) => dd.slotId === firstSlotId);
        if (d) d.placedTowerId = newTower.id;
      }
    }
    if (wasKeep) {
      state.designatedKeepTowerId = slotsConsumed.length === inputs.length ? newTower.id : null;
    }

    this.game.refreshRoute();
    this.game.selectTower(newTower.id);

    state.undoStack.push({
      description: `Combine → ${outGem} L${outQuality}`,
      undo: () => {
        state.towers = state.towers.filter((t) => t.id !== newTower.id);
        setFootprint(state, newTower.x, newTower.y, Cell.Grass);
        for (const r of rockedAnchors) {
          unrockFootprint(state, r.x, r.y);
        }
        for (const t of inputs) {
          state.towers.push(t);
          setFootprint(state, t.x, t.y, Cell.Tower);
        }
        for (const c of slotsConsumed) {
          const d = state.draws.find((dd) => dd.slotId === c.slotId);
          if (d) d.placedTowerId = c.placedTowerId;
        }
        if (wasKeep) state.designatedKeepTowerId = slotsConsumed[0]?.placedTowerId ?? null;
        this.game.refreshRoute();
      },
    });

    this.game.bus.emit('combine:done', {
      inputIds: inputs.map((t) => t.id),
      outputGem: outGem,
      outputQuality: outQuality,
    });
    this.game.bus.emit('draws:change', {});
    return newTower.id;
  }

  /**
   * Downgrade a current-draw tower by 1 quality tier.
   * During build: auto-keeps the tower, concludes the round, and starts the wave.
   * During wave: just reduces quality on the kept tower.
   */
  downgrade(towerId: number): boolean {
    const state = this.game.state;
    const duringWave = state.phase === 'wave';

    const tower = state.towers.find((t) => t.id === towerId);
    if (!tower) return false;
    if (tower.comboKey) {
      this.game.bus.emit('toast', { kind: 'error', text: 'Cannot downgrade specials' });
      return false;
    }
    if (tower.quality <= 1) {
      this.game.bus.emit('toast', { kind: 'error', text: 'Already lowest tier' });
      return false;
    }
    if (state.downgradeUsedThisRound) {
      this.game.bus.emit('toast', { kind: 'error', text: 'Already downgraded this round' });
      return false;
    }

    if (duringWave) {
      if (state.keptTowerIdThisRound !== towerId) {
        this.game.bus.emit('toast', { kind: 'error', text: 'Only the kept tower can be downgraded' });
        return false;
      }
    } else {
      const isCurrentDraw = state.draws.some((d) => d.placedTowerId === towerId);
      if (!isCurrentDraw) {
        this.game.bus.emit('toast', { kind: 'error', text: 'Only current-round gems can be downgraded' });
        return false;
      }
    }

    const oldQuality = tower.quality;
    tower.quality = (tower.quality - 1) as Quality;
    state.downgradeUsedThisRound = true;

    this.game.bus.emit('tower:downgrade', {
      id: towerId,
      gem: tower.gem,
      oldQuality: oldQuality as Quality,
      newQuality: tower.quality as Quality,
    });

    if (!duringWave) {
      this.autoConcludeRound(towerId);
      this.game.enterWave();
    }
    return true;
  }
}

function pickQuality(r: number, tier: number): Quality {
  const row = CHANCE_TIER_WEIGHTS[Math.max(0, Math.min(CHANCE_TIER_WEIGHTS.length - 1, tier))];
  let acc = 0;
  for (let i = 0; i < row.length; i++) {
    acc += row[i];
    if (r <= acc) return (i + 1) as Quality;
  }
  return (row.findIndex((w) => w > 0) + 1) as Quality || 1;
}

void QUALITY_BASE_COST;
