/**
 * In-game HUD: 3-column layout (left stats / center board / right stash+recipes).
 *
 * The center column is a host for the Pixi canvas; the left/right columns are
 * pure HTML/CSS using the design's pixel-art tokens.
 */

import type { Application } from "pixi.js";
import { Game } from "../game/Game";
import { GEM_PALETTE, GemType, QUALITY_NAMES } from "../render/theme";
import { htmlCoin, htmlGem, htmlHeart } from "../render/htmlSprites";
import { COMBOS, ComboRecipe } from "../data/combos";
import { mountInspector, refreshInspector } from "./Inspector";
import { mountCombineModal } from "./CombineModal";
import { mountTutorialModal } from "./TutorialModal";
import { mountGameOver } from "./GameOver";
import { activeDraw, allDrawsPlaced, TowerState } from "../game/State";
import { GRID_H, GRID_W } from "../data/map";
import {
  TILE,
  CHANCE_TIER_UPGRADE_COST,
  MAX_CHANCE_TIER,
  CHANCE_TIER_WEIGHTS,
} from "../game/constants";
import { WAVES, WaveDef } from "../data/waves";
import type { CreepKind } from "../data/creeps";

const TIER_LABELS = [
  "CHIPPED",
  "FLAWED",
  "NORMAL",
  "FLAWLESS",
  "PERFECT",
] as const;
const TIER_COLORS = [
  "#8c7a5e",
  "var(--px-ink-dim)",
  "var(--px-ink)",
  "var(--px-accent)",
  "var(--px-good)",
] as const;

const ARCHETYPE_COLORS: Record<CreepKind, string> = {
  normal: "var(--px-ink)",
  fast: "#78e898",
  armored: "var(--px-ink-dim)",
  air: "#78a8f8",
  boss: "#ff6878",
};

/** Static lookup: which gem each creep archetype is weak to. */
const ARCHETYPE_WEAKNESS: Record<CreepKind, GemType> = {
  normal: "ruby",
  fast: "topaz",
  armored: "emerald",
  air: "sapphire",
  boss: "amethyst",
};

export function mountHud(
  root: HTMLElement,
  app: Application,
  game: Game,
  onExit: () => void,
): () => void {
  const hud = document.createElement("div");
  hud.className = "hud";

  const left = document.createElement("div");
  left.className = "hud-col hud-col-left";
  const center = document.createElement("div");
  center.className = "hud-col hud-col-center";
  const right = document.createElement("div");
  right.className = "hud-col hud-col-right";

  hud.append(left, center, right);
  root.appendChild(hud);

  // === Left column ===
  const wordmarkRow = document.createElement("div");
  wordmarkRow.className = "hud-wordmark-row";
  const wordmark = document.createElement("div");
  wordmark.className = "hud-wordmark";
  wordmark.textContent = "GEM TD";
  const version = document.createElement("div");
  version.className = "hud-version";
  version.textContent = "v0.1";
  wordmarkRow.append(wordmark, version);
  left.appendChild(wordmarkRow);

  const statsRow = document.createElement("div");
  statsRow.className = "stats-row";
  const livesChip = makeChip(htmlHeart(20), "LIVES", "50", "#ff8898");
  const goldChip = makeChip(htmlCoin(20), "GOLD", "100", "#ffe068");
  statsRow.append(livesChip.root, goldChip.root);
  left.appendChild(statsRow);

  const chance = makeChancePanel(game);
  left.appendChild(chance.root);

  const draw = makeDrawPanel(game);
  left.appendChild(draw.root);

  const inspector = mountInspector(game);
  left.appendChild(inspector.root);

  // === Center column: Pixi canvas host ===
  const canvasHost = document.createElement("div");
  canvasHost.className = "gem-canvas-host";
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

  const hint = document.createElement("div");
  hint.className = "board-hint";
  const hintPill = document.createElement("span");
  hintPill.className = "board-hint-pill";
  hintPill.textContent = "BUILD";
  const hintMsg = document.createElement("span");
  hintMsg.className = "board-hint-msg";
  hintMsg.textContent = "Place all 5 gems → mark one keeper";
  const hintKey = document.createElement("span");
  hintKey.className = "board-hint-key";
  hintKey.textContent = "TAB cycles";
  hint.append(hintPill, hintMsg, hintKey);
  center.insertBefore(hint, canvasHost);

  // === Right column ===
  const threats = document.createElement("div");
  threats.className = "px-panel threat-panel";
  const threatsHead = document.createElement("div");
  threatsHead.className = "panel-head";
  const threatsTitle = document.createElement("div");
  threatsTitle.className = "panel-h px-h";
  threatsTitle.textContent = "THREAT · NEXT 3";
  threatsHead.appendChild(threatsTitle);
  const threatsList = document.createElement("div");
  threatsList.className = "threat-list";
  threats.append(threatsHead, threatsList);
  right.appendChild(threats);

  const recipes = document.createElement("div");
  recipes.className = "px-panel recipes-panel";
  const recipesHead = document.createElement("div");
  recipesHead.className = "panel-head";
  const recipesH = document.createElement("div");
  recipesH.className = "panel-h px-h";
  recipesH.textContent = `RECIPES · ${COMBOS.length}`;
  recipesHead.appendChild(recipesH);
  const recipesList = document.createElement("div");
  recipesList.className = "recipes-list";
  recipes.append(recipesHead, recipesList);
  right.appendChild(recipes);

  function rebuildRecipes(): void {
    recipesList.innerHTML = "";
    const ownedCombos = new Set(
      game.state.towers.map((t) => t.comboKey).filter((k): k is string => !!k),
    );
    for (const c of COMBOS) {
      const card = document.createElement("div");
      card.className = "px-panel-inset recipe-card";

      const head = document.createElement("div");
      head.className = "recipe-card-head";
      head.appendChild(htmlGem(c.visualGem, 28, true));
      const info = document.createElement("div");
      info.className = "recipe-info";
      const name = document.createElement("div");
      name.className = "recipe-name";
      name.textContent = c.name.toUpperCase();
      info.appendChild(name);
      if (ownedCombos.has(c.key)) {
        const owned = document.createElement("div");
        owned.className = "recipe-owned";
        owned.textContent = "OWNED ✓";
        info.appendChild(owned);
      }
      head.appendChild(info);
      card.appendChild(head);

      const inputs = document.createElement("div");
      inputs.className = "recipe-inputs";
      for (let i = 0; i < c.inputs.length; i++) {
        const inp = c.inputs[i];
        const pill = document.createElement("div");
        pill.className = "recipe-pill";
        pill.appendChild(htmlGem(inp.gem, 14, inp.quality > 2));
        const q = document.createElement("span");
        q.className = "recipe-pill-q";
        q.textContent = `L${inp.quality}`;
        pill.appendChild(q);
        inputs.appendChild(pill);
        if (i < c.inputs.length - 1) {
          const plus = document.createElement("span");
          plus.className = "recipe-plus";
          plus.textContent = "+";
          inputs.appendChild(plus);
        }
      }
      card.appendChild(inputs);
      recipesList.appendChild(card);
    }
  }

  // Action bar (bottom-aligned)
  const actionBar = document.createElement("div");
  actionBar.className = "action-bar";
  const startBtn = document.createElement("button");
  startBtn.className = "px-btn px-btn-primary";
  startBtn.textContent = "▶ NEXT WAVE · SPACE";
  startBtn.addEventListener("click", () => game.cmdStartWave());
  actionBar.appendChild(startBtn);

  const utilsRow = document.createElement("div");
  utilsRow.className = "action-bar-utils";
  const undoBtn = makeBtn("↶ UNDO", () => game.cmdUndo());
  const speedBtn = makeBtn("1×", () => {
    const nextSpeed = (
      game.state.speed === 1 ? 2 : game.state.speed === 2 ? 4 : 1
    ) as 1 | 2 | 4;
    game.setSpeed(nextSpeed);
    speedBtn.textContent = `${nextSpeed}×`;
  });
  utilsRow.append(undoBtn, speedBtn);
  actionBar.appendChild(utilsRow);

  const combineRow = document.createElement("div");
  combineRow.className = "action-bar-combine";
  const combineBtn = makeBtn("★ COMBINE", () => tryAutoCombine());
  const combineSpecialBtn = makeBtn("★ SPECIAL", () => tryAutoCombineSpecial());
  combineRow.append(combineBtn, combineSpecialBtn);
  actionBar.appendChild(combineRow);

  const systemRow = document.createElement("div");
  systemRow.className = "action-bar-system";
  const helpBtn = makeBtn("? HELP", () => mountTutorialModal(root));
  const exitBtn = makeBtn("EXIT", onExit);
  systemRow.append(helpBtn, exitBtn);
  actionBar.appendChild(systemRow);
  right.appendChild(actionBar);

  function refreshThreats(): void {
    threatsList.innerHTML = "";
    const cur = Math.max(1, game.state.wave || 1);
    // During wave: show current + next 2; during build: also show current (the upcoming wave).
    const start = cur;
    const end = Math.min(WAVES.length, start + 2);
    for (let n = start; n <= end; n++) {
      const def = WAVES[n - 1];
      if (!def) continue;
      const isCurrent = n === cur;
      threatsList.appendChild(makeThreatRow(def, isCurrent));
    }
  }

  function makeThreatRow(def: WaveDef, isCurrent: boolean): HTMLDivElement {
    const row = document.createElement("div");
    row.className =
      "px-panel-inset threat-row" + (isCurrent ? " is-current" : "");

    const num = document.createElement("div");
    num.className = "threat-num" + (isCurrent ? " is-current" : "");
    num.textContent = String(def.number).padStart(2, "0");
    row.appendChild(num);

    const mid = document.createElement("div");
    mid.className = "threat-mid";
    const arch = document.createElement("div");
    arch.className = "threat-arch";
    arch.style.color = ARCHETYPE_COLORS[def.kind];
    arch.textContent = def.kind.toUpperCase();
    const weakRow = document.createElement("div");
    weakRow.className = "threat-weak-row";
    const weakLbl = document.createElement("span");
    weakLbl.className = "threat-weak-lbl";
    weakLbl.textContent = "WEAK";
    const weakGem = ARCHETYPE_WEAKNESS[def.kind];
    const pill = document.createElement("span");
    pill.className = "threat-weak-pill";
    pill.appendChild(htmlGem(weakGem, 12));
    const pillName = document.createElement("span");
    pillName.className = "threat-weak-name";
    pillName.textContent = GEM_PALETTE[weakGem].name.toUpperCase();
    pill.appendChild(pillName);
    weakRow.append(weakLbl, pill);
    mid.append(arch, weakRow);
    row.appendChild(mid);

    const right = document.createElement("div");
    right.className = "threat-right";
    const hp = document.createElement("div");
    hp.className = "threat-hp";
    const hpVal = document.createElement("span");
    hpVal.className = "threat-hp-val";
    hpVal.textContent = formatHp(def.hp);
    const hpUnit = document.createElement("span");
    hpUnit.className = "threat-hp-unit";
    hpUnit.textContent = "hp";
    hp.append(hpVal, hpUnit);
    const cnt = document.createElement("div");
    cnt.className = "threat-count";
    cnt.textContent = `×${def.count}`;
    right.append(hp, cnt);
    row.appendChild(right);

    return row;
  }

  function formatHp(hp: number): string {
    if (hp >= 1000) return `${Math.round(hp / 100) / 10}k`;
    return String(hp);
  }

  function refreshDraw(): void {
    draw.refresh();
  }

  function refreshChips(): void {
    livesChip.value.textContent = String(game.state.lives);
    goldChip.value.textContent = String(game.state.gold);
  }

  function tick(): void {
    refreshChips();
    refreshThreats();
    refreshDraw();
    chance.refresh();
    refreshStartGate();
    refreshInspector(inspector, game);
  }

  function refreshStartGate(): void {
    if (game.state.phase !== "build") return;
    const concluded =
      game.state.draws.length === 0 &&
      game.state.designatedKeepTowerId !== null;
    const ready =
      concluded ||
      (allDrawsPlaced(game.state) && game.state.designatedKeepTowerId !== null);
    startBtn.disabled = !ready;
  }

  game.bus.on("gold:change", refreshChips);
  game.bus.on("lives:change", refreshChips);
  game.bus.on("tower:placed", () => {
    refreshDraw();
    rebuildRecipes();
  });
  game.bus.on("tower:sold", () => {
    rebuildRecipes();
  });
  game.bus.on("combine:done", () => {
    rebuildRecipes();
  });
  game.bus.on("wave:start", () => {
    refreshThreats();
  });
  game.bus.on("wave:end", () => {
    refreshThreats();
  });
  game.bus.on("phase:enter", () => {
    refreshThreats();
  });
  game.bus.on("draws:roll", () => {
    refreshDraw();
  });
  game.bus.on("draws:change", () => {
    refreshDraw();
  });
  game.bus.on("phase:enter", ({ phase }) => {
    if (phase === "wave") {
      startBtn.disabled = true;
      hintPill.textContent = "WAVE";
      hintPill.className = "board-hint-pill wave";
      hintMsg.textContent = "Wave in progress — towers fire automatically";
      hintKey.textContent = "1× 2× 4×";
    } else if (phase === "build") {
      startBtn.disabled = true;
      hintPill.textContent = "BUILD";
      hintPill.className = "board-hint-pill";
      hintMsg.textContent = "Place all 5 gems → mark one keeper";
      hintKey.textContent = "TAB cycles";
    } else if (phase === "gameover" || phase === "victory") {
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

  canvasHost.addEventListener("pointermove", (ev: PointerEvent) => {
    game.hoverTile = tileFromPointer(ev);
  });
  canvasHost.addEventListener("pointerleave", () => {
    game.hoverTile = null;
  });
  canvasHost.addEventListener("pointerdown", (ev: PointerEvent) => {
    const t = tileFromPointer(ev);
    if (!t) return;
    // Right click → sell selected tower at that tile.
    if (ev.button === 2) {
      const tower = game.state.towers.find(
        (tt) => tt.x === t.x && tt.y === t.y,
      );
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
  canvasHost.addEventListener("contextmenu", (ev) => ev.preventDefault());

  function openCombine(initialTab?: "level" | "recipe"): void {
    mountCombineModal(root, game, initialTab);
  }

  /**
   * Auto-combine: level-up two/four same gem+quality towers from the current
   * round. Picks deterministically when multiple eligible groups exist:
   * highest-quality first, then alphabetical by gem name. Always combines —
   * never prompts for selection.
   */
  function tryAutoCombine(): void {
    if (game.state.phase !== "build") return;
    const drawIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const groups = new Map<string, TowerState[]>();
    for (const t of game.state.towers) {
      if (!drawIds.has(t.id)) continue;
      if (t.comboKey) continue;
      const k = `${t.gem}:${t.quality}`;
      const arr = groups.get(k) ?? [];
      arr.push(t);
      groups.set(k, arr);
    }
    const eligible: TowerState[][] = [];
    for (const arr of groups.values()) {
      if (arr.length >= 2) eligible.push(arr);
    }
    if (eligible.length === 0) {
      game.bus.emit("toast", {
        kind: "error",
        text: "No same-gem pair this round",
      });
      return;
    }
    eligible.sort((a, b) => {
      // Prefer larger groups (4 over 2), then higher quality, then gem name.
      if (b.length !== a.length) return b.length - a.length;
      if (b[0].quality !== a[0].quality) return b[0].quality - a[0].quality;
      return a[0].gem.localeCompare(b[0].gem);
    });
    const arr = eligible[0];
    const take = arr.length >= 4 ? 4 : 2;
    game.cmdCombine(arr.slice(0, take).map((t) => t.id));
  }

  /**
   * Auto-combine special: pick the first recipe (in COMBOS order) whose inputs
   * are satisfiable from placed (non-combo) towers, and execute it. Always
   * combines if at least one recipe matches — never prompts.
   */
  function tryAutoCombineSpecial(): void {
    if (game.state.phase !== "build") return;
    const placed = game.state.towers.filter((t) => !t.comboKey);
    for (const c of COMBOS) {
      const ids = matchRecipe(c, placed);
      if (ids) {
        game.cmdCombine(ids);
        return;
      }
    }
    game.bus.emit("toast", {
      kind: "error",
      text: "No recipe is satisfiable",
    });
  }

  function matchRecipe(c: ComboRecipe, towers: TowerState[]): number[] | null {
    const used = new Set<number>();
    const ids: number[] = [];
    for (const inp of c.inputs) {
      const t = towers.find(
        (tt) =>
          !used.has(tt.id) && tt.gem === inp.gem && tt.quality === inp.quality,
      );
      if (!t) return null;
      used.add(t.id);
      ids.push(t.id);
    }
    return ids;
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === " ") {
      ev.preventDefault();
      if (game.state.phase === "build") game.cmdStartWave();
    } else if (ev.key === "u" || ev.key === "U") {
      game.cmdUndo();
    } else if (ev.key === "s" || ev.key === "S") {
      if (game.selectedTowerId !== null) game.cmdSell(game.selectedTowerId);
    } else if (ev.key === "1") {
      game.setSpeed(1);
      speedBtn.textContent = "1×";
    } else if (ev.key === "2") {
      game.setSpeed(2);
      speedBtn.textContent = "2×";
    } else if (ev.key === "4") {
      game.setSpeed(4);
      speedBtn.textContent = "4×";
    } else if (ev.key === "c" || ev.key === "C") {
      openCombine();
    } else if (ev.key === "Escape") {
      game.selectTower(null);
    } else if (ev.key === "Tab") {
      // Cycle active draw slot (forward; Shift+Tab for backward).
      ev.preventDefault();
      game.cmdCycleActiveSlot(ev.shiftKey ? -1 : 1);
    } else if (ev.key === "?" || ev.key === "h" || ev.key === "H") {
      mountTutorialModal(root);
    }
  };
  window.addEventListener("keydown", onKey);

  // Initial paint.
  rebuildRecipes();
  tick();

  return () => {
    window.clearInterval(tickHandle);
    window.removeEventListener("keydown", onKey);
    hud.remove();
  };

  // ===== Helpers =====
  function makeChip(
    icon: HTMLElement,
    label: string,
    value: string,
    valueColor: string,
  ): {
    root: HTMLDivElement;
    value: HTMLDivElement;
  } {
    const r = document.createElement("div");
    r.className = "px-panel-inset stat-chip";
    const iconWrap = document.createElement("div");
    iconWrap.className = "stat-icon";
    iconWrap.appendChild(icon);
    const col = document.createElement("div");
    col.className = "stat-col";
    const l = document.createElement("div");
    l.className = "stat-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "stat-value";
    v.style.color = valueColor;
    v.textContent = value;
    col.append(l, v);
    r.append(iconWrap, col);
    return { root: r, value: v };
  }

  function makeBtn(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "px-btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function makeChancePanel(g: Game): {
    root: HTMLDivElement;
    refresh: () => void;
  } {
    const r = document.createElement("div");
    r.className = "px-panel";
    const head = document.createElement("div");
    head.className = "panel-head";
    const title = document.createElement("div");
    title.className = "panel-h px-h";
    title.textContent = "CHANCE TIER";
    head.appendChild(title);
    r.appendChild(head);

    const hero = document.createElement("div");
    hero.className = "chance-hero";
    const lvl = document.createElement("div");
    lvl.className = "chance-lvl";
    const next = document.createElement("div");
    next.className = "chance-next";
    hero.append(lvl, next);
    r.appendChild(hero);

    const bars = document.createElement("div");
    bars.className = "chance-bars";
    r.appendChild(bars);

    const upBtn = document.createElement("button");
    upBtn.className = "px-btn px-btn-primary chance-upgrade";
    upBtn.addEventListener("click", () => g.cmdUpgradeChanceTier());
    r.appendChild(upBtn);

    function refresh(): void {
      const t = g.state.chanceTier;
      lvl.textContent = `LV. ${t}`;
      const cost = t < MAX_CHANCE_TIER ? CHANCE_TIER_UPGRADE_COST[t] : null;
      next.textContent = cost !== null ? `NEXT ${cost}G` : "MAX";

      const row = CHANCE_TIER_WEIGHTS[t];
      bars.innerHTML = "";
      for (let i = 0; i < row.length; i++) {
        const pct = Math.round(row[i] * 100);
        if (pct <= 0) continue;
        const wrap = document.createElement("div");
        wrap.className = "chance-row";
        const headRow = document.createElement("div");
        headRow.className = "chance-row-head";
        const label = document.createElement("span");
        label.style.color = TIER_COLORS[i];
        label.textContent = TIER_LABELS[i];
        const pctEl = document.createElement("span");
        pctEl.className = "chance-pct";
        pctEl.textContent = `${pct}%`;
        headRow.append(label, pctEl);
        wrap.appendChild(headRow);
        const bar = document.createElement("div");
        bar.className = "px-bar chance-bar";
        const fill = document.createElement("div");
        fill.className = "px-bar-fill";
        fill.style.background = TIER_COLORS[i];
        fill.style.width = `${pct}%`;
        bar.appendChild(fill);
        wrap.appendChild(bar);
        bars.appendChild(wrap);
      }

      if (t >= MAX_CHANCE_TIER) {
        upBtn.textContent = "MAX TIER";
        upBtn.disabled = true;
      } else {
        upBtn.textContent = `UPGRADE · ${cost}G`;
        upBtn.disabled =
          g.state.phase !== "build" || g.state.gold < (cost ?? 0);
      }
    }

    return { root: r, refresh };
  }

  function makeDrawPanel(g: Game): {
    root: HTMLDivElement;
    refresh: () => void;
  } {
    const r = document.createElement("div");
    r.className = "px-panel";
    const head = document.createElement("div");
    head.className = "panel-head";
    const title = document.createElement("div");
    title.className = "panel-h px-h";
    title.textContent = "DRAW · 0/5 PLACED";
    const action = document.createElement("div");
    action.className = "draw-keeper-tag";
    head.append(title, action);
    r.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "draw-grid";
    r.appendChild(grid);

    const status = document.createElement("div");
    status.className = "px-panel-inset draw-status";
    const primary = document.createElement("div");
    primary.className = "draw-status-primary";
    // const secondary = document.createElement("div");
    // secondary.className = "draw-status-secondary";
    status.append(primary);
    r.appendChild(status);

    function refresh(): void {
      grid.innerHTML = "";
      const draws = g.state.draws;
      const placed = draws.filter((d) => d.placedTowerId !== null).length;
      const total = draws.length || 5;
      title.textContent = `DRAW · ${placed}/${total} PLACED`;

      const keeperSet = g.state.designatedKeepTowerId !== null;
      action.textContent = keeperSet ? "★ KEEPER SET" : "";

      if (draws.length === 0) {
        for (let i = 0; i < 5; i++) {
          const ph = document.createElement("div");
          ph.className = "px-panel-inset draw-cell placed-non-keep";
          ph.appendChild(htmlGem("diamond", 26));
          grid.appendChild(ph);
        }
        if (g.state.phase === "build" && keeperSet) {
          primary.innerHTML = "";
          const ready = document.createElement("span");
          ready.style.color = "var(--px-accent)";
          ready.textContent = "READY";
          primary.appendChild(ready);
          // secondary.textContent = "Press SPACE to start the wave.";
        } else {
          primary.textContent = g.state.phase === "wave" ? "In wave" : "—";
          // secondary.textContent =
          //   g.state.phase === "wave"
          //     ? "Towers fire automatically."
          //     : "Waiting for next draw.";
        }
        return;
      }

      let keepDraw: (typeof draws)[number] | null = null;
      for (const d of draws) {
        const cell = document.createElement("button");
        cell.className = "px-panel-inset draw-cell";
        const isActive =
          d.slotId === g.state.activeDrawSlot && d.placedTowerId === null;
        const isPlaced = d.placedTowerId !== null;
        const isKeep =
          isPlaced && d.placedTowerId === g.state.designatedKeepTowerId;
        if (isPlaced && !isKeep) cell.classList.add("placed-non-keep");
        if (isKeep) {
          cell.classList.add("is-keep");
          keepDraw = d;
        } else if (isActive) {
          cell.classList.add("is-active");
        }
        cell.appendChild(htmlGem(d.gem, 26, d.quality > 2));
        const q = document.createElement("div");
        q.className = "draw-quality";
        q.textContent = `L${d.quality}`;
        cell.appendChild(q);
        if (isKeep) {
          const star = document.createElement("div");
          star.className = "draw-keep-badge";
          star.textContent = "★";
          cell.appendChild(star);
        }
        cell.title = isPlaced
          ? "Click to mark as keep"
          : "Click to select slot";
        cell.addEventListener("click", () => {
          if (isPlaced && d.placedTowerId !== null) {
            g.cmdDesignateKeep(d.placedTowerId);
          } else {
            g.cmdSetActiveSlot(d.slotId);
          }
        });
        grid.appendChild(cell);
      }

      const ad = activeDraw(g.state);
      if (keepDraw) {
        primary.innerHTML = "";
        const star = document.createElement("span");
        star.className = "keep-name";
        star.textContent = `★ ${GEM_PALETTE[keepDraw.gem].name}`;
        primary.appendChild(star);
        primary.appendChild(
          document.createTextNode(" will be kept after this wave."),
        );
        // secondary.innerHTML = "";
        // secondary.appendChild(
        //   document.createTextNode("The other 4 will turn into rocks. "),
        // );
        // const kbd = document.createElement("kbd");
        // kbd.textContent = "TAB";
        // secondary.appendChild(kbd);
        // secondary.appendChild(document.createTextNode(" cycles slots."));
      } else if (ad) {
        primary.textContent = `${GEM_PALETTE[ad.gem].name.toUpperCase()} · ${QUALITY_NAMES[ad.quality].toUpperCase()}`;
        // secondary.textContent =
        //   "Click a grass tile to place. TAB cycles slots.";
      } else if (placed === draws.length && draws.length > 0) {
        primary.textContent = "PICK A KEEPER";
        // secondary.textContent =
        // "Click a placed gem to mark it. The rest turn into rocks.";
      } else {
        primary.textContent = "—";
        // secondary.textContent = "Pick a slot.";
      }
    }

    return { root: r, refresh };
  }
}

interface HudRefs {
  livesValue: HTMLDivElement;
  goldValue: HTMLDivElement;
  startWaveBtn: HTMLButtonElement;
}

interface InspectorRefs {
  root: HTMLElement;
  refresh: (game: Game) => void;
}

// We only export the type; mountInspector is in Inspector.ts.
export type { HudRefs, InspectorRefs };
