/**
 * In-game HUD: 3-column layout (left stats / center board / right stash+recipes).
 *
 * The center column is a host for the Pixi canvas; the left/right columns are
 * pure HTML/CSS using the design's pixel-art tokens.
 */

import type { Application } from "pixi.js";
import { Game } from "../game/Game";
import { GEM_PALETTE, GemType, QUALITY_NAMES } from "../render/theme";
import {
  htmlCoin,
  htmlGem,
  htmlGemTier,
  htmlHeart,
  htmlSpecial,
} from "../render/htmlSprites";
import { COMBOS } from "../data/combos";
import { mountInspector, refreshInspector } from "./Inspector";
import { mountCombineModal } from "./CombineModal";
import { mountTutorialModal } from "./TutorialModal";
import { mountGameOver } from "./GameOver";
import { activeDraw, allDrawsPlaced } from "../game/State";
import { GRID_H, GRID_W } from "../data/map";
import {
  FINE_TILE,
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
  // Compact header strip: wordmark + lives + gold consolidated into one row.
  const headerBar = document.createElement("div");
  headerBar.className = "header-bar";

  const wm = document.createElement("div");
  wm.className = "wm";
  const wmName = document.createElement("div");
  wmName.className = "wm-name";
  wmName.textContent = "GEM TD";
  const wmVer = document.createElement("div");
  wmVer.className = "wm-ver";
  wmVer.textContent = "v0.1";
  wm.append(wmName, wmVer);
  headerBar.appendChild(wm);

  const livesMini = makeStatMini(htmlHeart(16), "LIVES", "50", "#ff8898");
  const goldMini = makeStatMini(htmlCoin(16), "GOLD", "100", "#ffe068");
  headerBar.append(livesMini.root, goldMini.root);
  left.appendChild(headerBar);

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
  const boardPxW = GRID_W * FINE_TILE;
  const boardPxH = GRID_H * FINE_TILE;
  canvasHost.style.width = `${boardPxW}px`;
  canvasHost.style.height = `${boardPxH}px`;
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.width = `${boardPxW}px`;
  canvas.style.height = `${boardPxH}px`;
  app.renderer.resize(boardPxW, boardPxH);
  canvasHost.appendChild(canvas);
  center.appendChild(canvasHost);

  game.layoutBoard(boardPxW, boardPxH);

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
    for (const c of COMBOS) {
      const card = document.createElement("div");
      card.className = "px-panel-inset recipe-card";

      const head = document.createElement("div");
      head.className = "recipe-card-head";
      head.appendChild(htmlSpecial(c.key, 28, true));
      const info = document.createElement("div");
      info.className = "recipe-info";
      const name = document.createElement("div");
      name.className = "recipe-name";
      name.textContent = c.name.toUpperCase();
      info.appendChild(name);
      head.appendChild(info);
      card.appendChild(head);

      const inputs = document.createElement("div");
      inputs.className = "recipe-inputs";
      for (let i = 0; i < c.inputs.length; i++) {
        const inp = c.inputs[i];
        const pill = document.createElement("div");
        pill.className = "recipe-pill";
        pill.appendChild(
          htmlGemTier(inp.gem, inp.quality, 16, inp.quality > 2),
        );
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
  startBtn.textContent = "▶ START PLACEMENT · SPACE";
  startBtn.addEventListener("click", () => triggerStartCta());
  actionBar.appendChild(startBtn);

  /** True when build phase is open but no draws are rolled yet. */
  function inPrePlacement(): boolean {
    const s = game.state;
    return (
      s.phase === "build" &&
      s.draws.length === 0 &&
      s.designatedKeepTowerId === null
    );
  }

  function triggerStartCta(): void {
    if (game.state.phase !== "build") return;
    if (inPrePlacement()) game.cmdStartPlacement();
    else game.cmdStartWave();
  }

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

  const systemRow = document.createElement("div");
  systemRow.className = "action-bar-system";
  const helpBtn = makeBtn("? HELP", () => mountTutorialModal(root));
  const exitBtn = makeBtn("EXIT", onExit);
  systemRow.append(helpBtn, exitBtn);
  actionBar.appendChild(systemRow);

  const resetBtn = document.createElement("button");
  resetBtn.className = "px-btn px-btn-bad action-bar-reset";
  resetBtn.textContent = "↺ RESET RUN · R";
  resetBtn.addEventListener("click", () => game.newGame());
  actionBar.appendChild(resetBtn);

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
    livesMini.value.textContent = String(game.state.lives);
    goldMini.value.textContent = String(game.state.gold);
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
    if (inPrePlacement()) {
      startBtn.textContent = "▶ START PLACEMENT · SPACE";
      startBtn.disabled = false;
      return;
    }
    startBtn.textContent = "▶ NEXT WAVE · SPACE";
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
    const tx = Math.floor((lx - bx) / FINE_TILE);
    const ty = Math.floor((ly - by) / FINE_TILE);
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return null;
    return { x: tx, y: ty };
  }

  function pixelFromPointer(ev: PointerEvent): { x: number; y: number } | null {
    const rect = canvasHost.getBoundingClientRect();
    const lx = ev.clientX - rect.left;
    const ly = ev.clientY - rect.top;
    const bx = game.board.x;
    const by = game.board.y;
    const px = lx - bx;
    const py = ly - by;
    const boardW = GRID_W * FINE_TILE;
    const boardH = GRID_H * FINE_TILE;
    if (px < 0 || py < 0 || px >= boardW || py >= boardH) return null;
    return { x: px, y: py };
  }

  canvasHost.addEventListener("pointermove", (ev: PointerEvent) => {
    game.hoverTile = tileFromPointer(ev);
    game.hoverPixel = pixelFromPointer(ev);
    game.hoverPresent = true;
  });
  canvasHost.addEventListener("pointerleave", () => {
    game.hoverTile = null;
    game.hoverPixel = null;
    game.hoverPresent = false;
  });
  canvasHost.addEventListener("pointerenter", () => {
    game.hoverPresent = true;
  });
  canvasHost.addEventListener("pointerdown", (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const t = tileFromPointer(ev);
    if (!t) return;
    // Left click on a tower → select it.
    const tower = game.state.towers.find((tt) => tt.x === t.x && tt.y === t.y);
    if (tower) {
      game.selectTower(tower.id);
      return;
    }
    // Click on a rock cell → select the rock for inspection / removal.
    const rock = game.state.rocks.find((rr) => rr.x === t.x && rr.y === t.y);
    if (rock) {
      game.selectRock(rock.id);
      return;
    }
    // Otherwise: try to place if there's an active draw.
    if (activeDraw(game.state)) {
      game.cmdPlace(t.x, t.y);
    } else {
      game.selectTower(null);
      game.selectRock(null);
    }
  });

  function openCombine(initialTab?: "level" | "recipe"): void {
    mountCombineModal(root, game, initialTab);
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === " ") {
      ev.preventDefault();
      triggerStartCta();
    } else if (ev.key === "u" || ev.key === "U") {
      game.cmdUndo();
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
      game.selectRock(null);
    } else if (ev.key === "r" || ev.key === "R") {
      game.newGame();
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
  function makeStatMini(
    icon: HTMLElement,
    label: string,
    value: string,
    valueColor: string,
  ): {
    root: HTMLDivElement;
    value: HTMLDivElement;
  } {
    const r = document.createElement("div");
    r.className = "stat-mini";
    const iconWrap = document.createElement("div");
    iconWrap.className = "stat-mini-icon";
    iconWrap.appendChild(icon);
    const col = document.createElement("div");
    col.className = "stat-mini-col";
    const l = document.createElement("div");
    l.className = "lbl";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "val";
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

    const collapsed = document.createElement("div");
    collapsed.className = "chance-collapsed";
    const lvl = document.createElement("span");
    lvl.className = "chance-lvl";
    collapsed.appendChild(lvl);
    head.appendChild(collapsed);
    r.appendChild(head);

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
        upBtn.classList.remove("is-affordable");
      } else {
        upBtn.textContent = `UPGRADE · ${cost}G`;
        const inBuild = g.state.phase === "build";
        const affordable = g.state.gold >= (cost ?? 0);
        upBtn.disabled = !inBuild || !affordable;
        upBtn.classList.toggle("is-affordable", inBuild && affordable);
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
    title.textContent = "GEMS · 0/5";
    const tag = document.createElement("div");
    tag.className = "draw-keeper-tag";
    head.append(title, tag);
    r.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "draw-grid";
    r.appendChild(grid);

    function refresh(): void {
      grid.innerHTML = "";
      const draws = g.state.draws;
      const placed = draws.filter((d) => d.placedTowerId !== null).length;
      const total = draws.length || 5;
      title.textContent = `GEMS · ${placed}/${total}`;

      if (draws.length === 0) {
        for (let i = 0; i < 5; i++) {
          const ph = document.createElement("div");
          ph.className = "px-panel-inset draw-cell placed-non-keep";
          ph.style.setProperty("--gem-glow", GEM_PALETTE.diamond.css.mid);
          const phHost = document.createElement("div");
          phHost.className = "draw-sprite-host";
          phHost.appendChild(htmlGemTier("diamond", 3, 22));
          ph.appendChild(phHost);
          grid.appendChild(ph);
        }
        const keeperSet = g.state.designatedKeepTowerId !== null;
        if (g.state.phase === "build" && keeperSet) {
          tag.textContent = "★ READY";
          tag.style.color = "var(--px-accent)";
        } else {
          tag.textContent = g.state.phase === "wave" ? "IN WAVE" : "";
          tag.style.color = "var(--px-ink-dim)";
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
        cell.style.setProperty("--gem-glow", GEM_PALETTE[d.gem].css.mid);
        const host = document.createElement("div");
        host.className = "draw-sprite-host";
        host.appendChild(htmlGemTier(d.gem, d.quality, 22, d.quality > 2));
        cell.appendChild(host);
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
        tag.textContent = `★ ${GEM_PALETTE[keepDraw.gem].name.toUpperCase()} · ${QUALITY_NAMES[keepDraw.quality].toUpperCase()}`;
        tag.style.color = "var(--px-good)";
      } else if (ad) {
        tag.textContent = `${GEM_PALETTE[ad.gem].name.toUpperCase()} · ${QUALITY_NAMES[ad.quality].toUpperCase()}`;
        tag.style.color = "var(--px-accent)";
      } else if (placed === draws.length && draws.length > 0) {
        tag.textContent = "PICK A KEEPER";
        tag.style.color = "var(--px-accent)";
      } else {
        tag.textContent = "";
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
