/**
 * In-game HUD: 3-column layout (left stats / center board / right stash+recipes).
 *
 * The center column is a host for the Pixi canvas; the left/right columns are
 * pure HTML/CSS using the design's pixel-art tokens.
 */

import type { Application } from 'pixi.js';
import { Game } from '../game/Game';
import { GEM_PALETTE, GEM_TYPES, GemType, QUALITY_NAMES, Quality } from '../render/theme';
import { htmlCoin, htmlGem, htmlHeart } from '../render/htmlSprites';
import { gemStats, effectSummary } from '../data/gems';
import { COMBOS } from '../data/combos';
import { mountInspector, refreshInspector } from './Inspector';
import { mountCombineModal } from './CombineModal';
import { mountTutorialModal } from './TutorialModal';
import { mountGameOver } from './GameOver';
import { activeDraw, allDrawsPlaced } from '../game/State';
import { GRID_H, GRID_W } from '../data/map';
import { TILE, CHANCE_TIER_UPGRADE_COST, MAX_CHANCE_TIER, CHANCE_TIER_WEIGHTS } from '../game/constants';
import { WAVES } from '../data/waves';

interface HudRefs {
  livesValue: HTMLDivElement;
  goldValue: HTMLDivElement;
  waveNum: HTMLDivElement;
  waveBar: HTMLDivElement;
  waveCount: HTMLDivElement;
  waveLabel: HTMLDivElement;
  drawHost: HTMLDivElement;
  stashList: HTMLDivElement;
  startWaveBtn: HTMLButtonElement;
  speedBtn: HTMLButtonElement;
  undoBtn: HTMLButtonElement;
  combineBtn: HTMLButtonElement;
}

export function mountHud(root: HTMLElement, app: Application, game: Game, onExit: () => void): () => void {
  const hud = document.createElement('div');
  hud.className = 'hud';

  const left = document.createElement('div');
  left.className = 'hud-col hud-col-left';
  const center = document.createElement('div');
  center.className = 'hud-col hud-col-center';
  const right = document.createElement('div');
  right.className = 'hud-col hud-col-right';

  hud.append(left, center, right);
  root.appendChild(hud);

  // === Left column ===
  const wordmark = document.createElement('div');
  wordmark.className = 'hud-wordmark';
  wordmark.textContent = 'GEM TOWER';
  left.appendChild(wordmark);

  const livesChip = makeChip(htmlHeart(14), 'LIVES', '50', '#ff8898');
  const goldChip = makeChip(htmlCoin(14), 'GOLD', '100', '#ffe068');
  left.appendChild(livesChip.root);
  left.appendChild(goldChip.root);

  const wave = makeWavePanel();
  left.appendChild(wave.root);

  const chance = makeChancePanel(game);
  left.appendChild(chance.root);

  const draw = makeDrawPanel(game);
  left.appendChild(draw.root);

  const inspector = mountInspector(game);
  left.appendChild(inspector.root);

  // === Center column: Pixi canvas host ===
  const canvasHost = document.createElement('div');
  canvasHost.className = 'gem-canvas-host';
  // Match the host to the board pixel size (board + 6px frame).
  const boardPxW = GRID_W * TILE;
  const boardPxH = GRID_H * TILE;
  canvasHost.style.width = `${boardPxW}px`;
  canvasHost.style.height = `${boardPxH}px`;
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.width = `${boardPxW}px`;
  canvas.style.height = `${boardPxH}px`;
  app.renderer.resize(boardPxW, boardPxH);
  canvasHost.appendChild(canvas);
  center.appendChild(canvasHost);

  game.layoutBoard(boardPxW, boardPxH);

  const hint = document.createElement('div');
  hint.className = 'board-hint';
  hint.textContent = 'CLICK A GRASS TILE TO PLACE THE DRAWN GEM';
  canvasHost.appendChild(hint);

  // === Right column ===
  const stash = document.createElement('div');
  stash.className = 'px-panel';
  const stashTitle = document.createElement('div');
  stashTitle.className = 'panel-h px-h';
  stashTitle.textContent = 'STASH (0)';
  const stashGrid = document.createElement('div');
  stashGrid.className = 'stash-grid';
  stash.append(stashTitle, stashGrid);
  right.appendChild(stash);

  const recipes = document.createElement('div');
  recipes.className = 'px-panel';
  const recipesH = document.createElement('div');
  recipesH.className = 'panel-h px-h';
  recipesH.textContent = 'RECIPES';
  const recipesList = document.createElement('div');
  recipesList.className = 'recipes-list';
  recipesList.style.maxHeight = '180px';
  recipesList.style.overflowY = 'auto';
  for (const c of COMBOS) {
    const row = document.createElement('div');
    row.className = 'row';
    const gems = document.createElement('div');
    gems.className = 'recipe-gems';
    for (let i = 0; i < c.inputs.length; i++) {
      const inp = c.inputs[i];
      const cell = document.createElement('div');
      cell.style.display = 'inline-flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems = 'center';
      cell.appendChild(htmlGem(inp.gem, 18, inp.quality > 2));
      const q = document.createElement('span');
      q.style.fontSize = '6px';
      q.style.color = 'var(--px-ink-dim)';
      q.textContent = `L${inp.quality}`;
      cell.appendChild(q);
      gems.appendChild(cell);
      if (i < c.inputs.length - 1) {
        const plus = document.createElement('span');
        plus.className = 'recipe-plus';
        plus.textContent = '+';
        gems.appendChild(plus);
      }
    }
    row.appendChild(gems);
    const tail = document.createElement('div');
    tail.className = 'recipe-tail';
    const eq = document.createElement('span');
    eq.className = 'recipe-eq';
    eq.textContent = '=';
    const name = document.createElement('span');
    name.className = 'recipe-name px-h';
    name.textContent = c.name.toUpperCase();
    tail.append(eq, name);
    row.appendChild(tail);
    recipesList.appendChild(row);
  }
  recipes.append(recipesH, recipesList);
  right.appendChild(recipes);

  // Action bar (bottom-aligned)
  const actionBar = document.createElement('div');
  actionBar.className = 'action-bar';
  const startBtn = document.createElement('button');
  startBtn.className = 'px-btn px-btn-primary';
  startBtn.textContent = '▶ NEXT WAVE';
  startBtn.addEventListener('click', () => game.cmdStartWave());
  actionBar.appendChild(startBtn);
  const row = document.createElement('div');
  row.className = 'action-bar-row';
  const undoBtn = makeBtn('↶ UNDO', () => game.cmdUndo());
  const speedBtn = makeBtn('1×', () => {
    const nextSpeed = (game.state.speed === 1 ? 2 : game.state.speed === 2 ? 4 : 1) as 1 | 2 | 4;
    game.setSpeed(nextSpeed);
    speedBtn.textContent = `${nextSpeed}×`;
  });
  const combineBtn = makeBtn('★ COMBINE', () => {
    openCombine();
  });
  row.append(undoBtn, speedBtn, combineBtn);
  actionBar.appendChild(row);
  const bottomRow = document.createElement('div');
  bottomRow.className = 'action-bar-row';
  const helpBtn = makeBtn('? HOW TO PLAY', () => mountTutorialModal(root));
  const exitBtn = makeBtn('TITLE', onExit);
  bottomRow.append(helpBtn, exitBtn);
  actionBar.appendChild(bottomRow);
  right.appendChild(actionBar);

  // Stash list updater
  function refreshStash(): void {
    stashGrid.innerHTML = '';
    const s = game.state;
    // Group towers by gem+quality for a "composition" view.
    const counts = new Map<string, { gem: GemType; quality: Quality; count: number }>();
    for (const t of s.towers) {
      if (t.comboKey) continue; // combos render under "Recipes" only
      const key = `${t.gem}:${t.quality}`;
      const e = counts.get(key);
      if (e) {
        e.count++;
      } else {
        counts.set(key, { gem: t.gem, quality: t.quality, count: 1 });
      }
    }
    stashTitle.textContent = `STASH (${s.towers.length})`;
    if (counts.size === 0) {
      // 7 placeholder cells
      for (const g of GEM_TYPES) {
        const cell = document.createElement('div');
        cell.className = 'px-panel-inset stash-cell placeholder';
        cell.appendChild(htmlGem(g, 22));
        stashGrid.appendChild(cell);
      }
      return;
    }
    for (const e of counts.values()) {
      const cell = document.createElement('div');
      cell.className = 'px-panel-inset stash-cell';
      cell.appendChild(htmlGem(e.gem, 22, e.quality > 2));
      if (e.count > 1) {
        const c = document.createElement('div');
        c.className = 'count';
        c.textContent = `×${e.count}`;
        cell.appendChild(c);
      }
      const lvl = document.createElement('div');
      lvl.className = 'lvl';
      lvl.textContent = `L${e.quality}`;
      cell.appendChild(lvl);
      stashGrid.appendChild(cell);
    }
  }

  function refreshDraw(): void {
    draw.refresh();
  }

  function refreshWave(): void {
    const w = game.state.wave || 1;
    const def = WAVES[w - 1];
    wave.num.textContent = `WAVE ${w}/${WAVES.length}`;
    if (def) {
      const total = def.count;
      const killed = game.state.waveStats.killedThisWave + game.state.waveStats.leakedThisWave;
      const ratio = total > 0 ? killed / total : 0;
      wave.bar.style.width = `${Math.round(ratio * 100)}%`;
      wave.count.textContent = `×${Math.max(0, total - game.state.waveStats.spawnedThisWave + (game.state.waveStats.killedThisWave + game.state.waveStats.leakedThisWave))}`;
      wave.label.textContent = def.kind === 'boss' ? 'NEXT: BOSS' : `NEXT: ${def.kind.toUpperCase()}`;
    }
  }

  function refreshChips(): void {
    livesChip.value.textContent = String(game.state.lives);
    goldChip.value.textContent = String(game.state.gold);
  }

  function tick(): void {
    refreshChips();
    refreshStash();
    refreshDraw();
    refreshWave();
    chance.refresh();
    refreshStartGate();
    refreshInspector(inspector, game);
  }

  function refreshStartGate(): void {
    if (game.state.phase !== 'build') return;
    const concluded = game.state.draws.length === 0 && game.state.designatedKeepTowerId !== null;
    const ready = concluded || (allDrawsPlaced(game.state) && game.state.designatedKeepTowerId !== null);
    startBtn.disabled = !ready;
  }

  game.bus.on('gold:change', refreshChips);
  game.bus.on('lives:change', refreshChips);
  game.bus.on('tower:placed', () => { refreshStash(); refreshDraw(); });
  game.bus.on('tower:sold', () => { refreshStash(); });
  game.bus.on('combine:done', () => { refreshStash(); });
  game.bus.on('draws:roll', () => { refreshDraw(); });
  game.bus.on('draws:change', () => { refreshDraw(); });
  game.bus.on('phase:enter', ({ phase }) => {
    if (phase === 'wave') {
      startBtn.disabled = true;
      hint.textContent = 'WAVE IN PROGRESS';
    } else if (phase === 'build') {
      startBtn.disabled = true;
      hint.textContent = 'PLACE ALL 5 GEMS — MARK ONE TO KEEP — TAB CYCLES SLOTS';
    } else if (phase === 'gameover' || phase === 'victory') {
      mountGameOver(root, game, phase, onExit);
    }
  });

  // Periodic refresh for in-wave HUD.
  const tickHandle = window.setInterval(tick, 100);

  // === Pointer + keyboard input ===
  function tileFromPointer(ev: PointerEvent): { x: number; y: number } | null {
    const rect = canvasHost.getBoundingClientRect();
    const lx = ev.clientX - rect.left;
    const ly = ev.clientY - rect.top;
    const bx = game.board.x;
    const by = game.board.y;
    const tx = Math.floor((lx - bx) / TILE);
    const ty = Math.floor((ly - by) / TILE);
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return null;
    return { x: tx, y: ty };
  }

  canvasHost.addEventListener('pointermove', (ev: PointerEvent) => {
    game.hoverTile = tileFromPointer(ev);
  });
  canvasHost.addEventListener('pointerleave', () => {
    game.hoverTile = null;
  });
  canvasHost.addEventListener('pointerdown', (ev: PointerEvent) => {
    const t = tileFromPointer(ev);
    if (!t) return;
    // Right click → sell selected tower at that tile.
    if (ev.button === 2) {
      const tower = game.state.towers.find((tt) => tt.x === t.x && tt.y === t.y);
      if (tower) game.cmdSell(tower.id);
      return;
    }
    // Left click on a tower → select it.
    const tower = game.state.towers.find((tt) => tt.x === t.x && tt.y === t.y);
    if (tower) {
      game.selectTower(tower.id);
      return;
    }
    // Otherwise: try to place if there's an active draw.
    if (activeDraw(game.state)) {
      game.cmdPlace(t.x, t.y);
    } else {
      game.selectTower(null);
    }
  });
  canvasHost.addEventListener('contextmenu', (ev) => ev.preventDefault());

  function openCombine(): void {
    mountCombineModal(root, game);
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === ' ') {
      ev.preventDefault();
      if (game.state.phase === 'build') game.cmdStartWave();
    } else if (ev.key === 'u' || ev.key === 'U') {
      game.cmdUndo();
    } else if (ev.key === 's' || ev.key === 'S') {
      if (game.selectedTowerId !== null) game.cmdSell(game.selectedTowerId);
    } else if (ev.key === '1') {
      game.setSpeed(1);
      speedBtn.textContent = '1×';
    } else if (ev.key === '2') {
      game.setSpeed(2);
      speedBtn.textContent = '2×';
    } else if (ev.key === '4') {
      game.setSpeed(4);
      speedBtn.textContent = '4×';
    } else if (ev.key === 'c' || ev.key === 'C') {
      openCombine();
    } else if (ev.key === 'Escape') {
      game.selectTower(null);
    } else if (ev.key === 'Tab') {
      // Cycle active draw slot (forward; Shift+Tab for backward).
      ev.preventDefault();
      game.cmdCycleActiveSlot(ev.shiftKey ? -1 : 1);
    } else if (ev.key === '?' || ev.key === 'h' || ev.key === 'H') {
      mountTutorialModal(root);
    }
  };
  window.addEventListener('keydown', onKey);

  // Initial paint.
  tick();

  return () => {
    window.clearInterval(tickHandle);
    window.removeEventListener('keydown', onKey);
    hud.remove();
  };

  // ===== Helpers =====
  function makeChip(icon: HTMLElement, label: string, value: string, valueColor: string): {
    root: HTMLDivElement;
    value: HTMLDivElement;
  } {
    const r = document.createElement('div');
    r.className = 'px-panel-inset stat-chip';
    r.appendChild(icon);
    const v = document.createElement('div');
    v.className = 'stat-value';
    v.style.color = valueColor;
    v.textContent = value;
    const l = document.createElement('div');
    l.className = 'stat-label';
    l.textContent = label;
    r.append(v, l);
    return { root: r, value: v };
  }

  function makeBtn(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'px-btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function makeWavePanel(): { root: HTMLDivElement; num: HTMLDivElement; bar: HTMLDivElement; count: HTMLDivElement; label: HTMLDivElement } {
    const r = document.createElement('div');
    r.className = 'px-panel wave-panel';
    const head = document.createElement('div');
    head.className = 'wave-panel-head';
    const num = document.createElement('div');
    num.className = 'wave-num px-h';
    num.textContent = `WAVE 1/${WAVES.length}`;
    const clock = document.createElement('div');
    clock.className = 'wave-clock';
    clock.textContent = '—';
    head.append(num, clock);

    const bar = document.createElement('div');
    bar.className = 'px-bar wave-bar';
    const fill = document.createElement('div');
    fill.className = 'px-bar-fill';
    fill.style.background = 'var(--px-accent)';
    fill.style.width = '0%';
    bar.appendChild(fill);

    const next = document.createElement('div');
    next.className = 'wave-next';
    const sprite = document.createElement('div');
    sprite.appendChild(htmlGem('amethyst', 18));
    const count = document.createElement('div');
    count.className = 'wave-next-count';
    count.textContent = '×0';
    const label = document.createElement('div');
    label.className = 'wave-next-label px-h';
    label.textContent = 'NEXT';
    next.append(sprite, count, label);

    r.append(head, bar, next);
    return { root: r, num, bar: fill, count, label };
  }

  function makeChancePanel(g: Game): { root: HTMLDivElement; refresh: () => void } {
    const r = document.createElement('div');
    r.className = 'px-panel';
    const head = document.createElement('div');
    head.className = 'panel-h px-h';
    head.textContent = 'CHANCE TIER';
    r.appendChild(head);

    const tierLine = document.createElement('div');
    tierLine.style.display = 'flex';
    tierLine.style.justifyContent = 'space-between';
    tierLine.style.alignItems = 'center';
    tierLine.style.marginTop = '4px';
    tierLine.style.fontSize = '9px';
    const tierVal = document.createElement('div');
    tierVal.style.color = 'var(--px-accent)';
    tierVal.style.fontWeight = 'bold';
    tierLine.appendChild(tierVal);
    r.appendChild(tierLine);

    const dist = document.createElement('div');
    dist.style.fontSize = '7px';
    dist.style.color = 'var(--px-ink-dim)';
    dist.style.marginTop = '4px';
    dist.style.lineHeight = '1.4';
    r.appendChild(dist);

    const upBtn = document.createElement('button');
    upBtn.className = 'px-btn';
    upBtn.style.fontSize = '8px';
    upBtn.style.width = '100%';
    upBtn.style.marginTop = '6px';
    upBtn.addEventListener('click', () => g.cmdUpgradeChanceTier());
    r.appendChild(upBtn);

    function refresh(): void {
      const t = g.state.chanceTier;
      tierVal.textContent = `LEVEL ${t}`;
      const labels = ['Chip', 'Flaw', 'Norm', 'Flwl', 'Perf'];
      const row = CHANCE_TIER_WEIGHTS[t];
      dist.textContent = labels
        .map((lbl, i) => `${lbl} ${Math.round(row[i] * 100)}%`)
        .filter((_, i) => row[i] > 0)
        .join(' · ');
      if (t >= MAX_CHANCE_TIER) {
        upBtn.textContent = 'MAX TIER';
        upBtn.disabled = true;
      } else {
        const cost = CHANCE_TIER_UPGRADE_COST[t];
        upBtn.textContent = `UPGRADE (${cost}g)`;
        upBtn.disabled = g.state.phase !== 'build' || g.state.gold < cost;
      }
    }

    return { root: r, refresh };
  }

  function makeDrawPanel(g: Game): {
    root: HTMLDivElement;
    refresh: () => void;
  } {
    const r = document.createElement('div');
    r.className = 'px-panel draw-panel';
    const head = document.createElement('div');
    head.className = 'panel-h px-h';
    head.textContent = 'DRAW (0/5)';
    r.appendChild(head);

    const chips = document.createElement('div');
    chips.style.display = 'grid';
    chips.style.gridTemplateColumns = 'repeat(5, 1fr)';
    chips.style.gap = '4px';
    chips.style.marginTop = '4px';
    r.appendChild(chips);

    const info = document.createElement('div');
    info.className = 'draw-panel-info';
    info.style.marginTop = '6px';
    const name = document.createElement('div');
    name.className = 'draw-name';
    const quality = document.createElement('div');
    quality.className = 'draw-quality';
    info.append(name, quality);
    r.appendChild(info);

    function refresh(): void {
      chips.innerHTML = '';
      const draws = g.state.draws;
      const placed = draws.filter((d) => d.placedTowerId !== null).length;
      head.textContent = `DRAW (${placed}/${draws.length || 5})`;

      if (draws.length === 0) {
        if (g.state.phase === 'build' && g.state.designatedKeepTowerId !== null) {
          name.textContent = 'RECIPE LOCKED';
          quality.textContent = 'Press SPACE to start wave';
        } else {
          name.textContent = '—';
          quality.textContent = g.state.phase === 'wave' ? 'In wave' : 'No draw';
        }
        for (let i = 0; i < 5; i++) {
          const ph = document.createElement('div');
          ph.className = 'px-panel-inset stash-cell placeholder';
          ph.style.opacity = '0.3';
          ph.appendChild(htmlGem('diamond', 18));
          chips.appendChild(ph);
        }
        return;
      }

      for (const d of draws) {
        const cell = document.createElement('button');
        cell.className = 'px-panel-inset stash-cell';
        cell.style.cursor = 'pointer';
        cell.style.padding = '4px';
        cell.style.position = 'relative';
        const isActive = d.slotId === g.state.activeDrawSlot && d.placedTowerId === null;
        const isPlaced = d.placedTowerId !== null;
        const isKeep = isPlaced && d.placedTowerId === g.state.designatedKeepTowerId;
        cell.style.opacity = isPlaced && !isKeep ? '0.45' : '1';
        if (isActive) {
          cell.style.boxShadow = 'inset 2px 2px 0 0 var(--px-border-dark), inset -2px -2px 0 0 var(--px-panel-2), 0 0 0 2px var(--px-accent)';
        } else if (isKeep) {
          cell.style.boxShadow = 'inset 2px 2px 0 0 var(--px-border-dark), inset -2px -2px 0 0 var(--px-panel-2), 0 0 0 2px #58c850';
        }
        cell.appendChild(htmlGem(d.gem, 22, d.quality > 2));
        const lvl = document.createElement('div');
        lvl.className = 'lvl';
        lvl.textContent = `L${d.quality}`;
        cell.appendChild(lvl);
        if (isKeep) {
          const star = document.createElement('div');
          star.style.position = 'absolute';
          star.style.top = '2px';
          star.style.right = '2px';
          star.style.fontSize = '10px';
          star.style.color = '#58c850';
          star.textContent = '★';
          cell.appendChild(star);
        } else if (isPlaced) {
          const check = document.createElement('div');
          check.style.position = 'absolute';
          check.style.top = '2px';
          check.style.right = '2px';
          check.style.fontSize = '10px';
          check.style.color = 'var(--px-accent)';
          check.textContent = '✓';
          cell.appendChild(check);
        }
        cell.title = isPlaced ? 'Click to mark as keep' : 'Click to select slot';
        cell.addEventListener('click', () => {
          if (isPlaced && d.placedTowerId !== null) {
            g.cmdDesignateKeep(d.placedTowerId);
          } else {
            g.cmdSetActiveSlot(d.slotId);
          }
        });
        chips.appendChild(cell);
      }

      const ad = activeDraw(g.state);
      if (ad) {
        name.textContent = GEM_PALETTE[ad.gem].name.toUpperCase();
        quality.textContent = QUALITY_NAMES[ad.quality];
      } else if (placed === draws.length && draws.length > 0) {
        if (g.state.designatedKeepTowerId === null) {
          name.textContent = 'PICK KEEPER';
          quality.textContent = 'Click a chip to mark keep';
        } else {
          name.textContent = 'READY';
          quality.textContent = 'Press SPACE to start wave';
        }
      } else {
        name.textContent = '—';
        quality.textContent = 'Pick a slot';
      }
    }

    return { root: r, refresh };
  }

  // Currently unused — if we want a "next wave preview" gem in the wave panel, swap this in.
  // function _gemForKind(kind: string): GemType {
  //   if (kind === 'fast') return 'sapphire';
  //   if (kind === 'armored') return 'opal';
  //   if (kind === 'air') return 'diamond';
  //   if (kind === 'boss') return 'ruby';
  //   return 'amethyst';
  // }

  void gemStats;
  void effectSummary;
}

interface InspectorRefs {
  root: HTMLElement;
  refresh: (game: Game) => void;
}

// We only export the type; mountInspector is in Inspector.ts.
export type { HudRefs, InspectorRefs };
