/**
 * In-game HUD: 3-column layout (left stats / center board / right stash+recipes).
 *
 * The center column is a host for the Pixi canvas; the left/right columns are
 * pure HTML/CSS using the design's pixel-art tokens.
 */

import type { Application } from "pixi.js";
import { Game } from "../game/Game";
import {
  GEM_PALETTE,
  GemType,
  QUALITY_NAMES,
  TIER_COLORS,
} from "../render/theme";
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
import { activeDraw, allDrawsPlaced, type TowerState } from "../game/State";
import { GRID_H, GRID_W } from "../data/map";
import {
  FINE_TILE,
  CHANCE_TIER_UPGRADE_COST,
  MAX_CHANCE_TIER,
  CHANCE_TIER_WEIGHTS,
  SPEEDS,
  type SpeedMultiplier,
} from "../game/constants";
import { WAVES, WaveDef, waveTotalCount } from "../data/waves";
import type { CreepKind } from "../data/creeps";

const TIER_LABELS = [
  "CHIPPED",
  "FLAWED",
  "NORMAL",
  "FLAWLESS",
  "PERFECT",
] as const;
const CHANCE_TIER_COLORS = [
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
  healer: "#38c860",
  wizard: "#3878e8",
  tunneler: "#f0c038",
};

/** Static lookup: which gem each creep archetype is weak to. */
const ARCHETYPE_WEAKNESS: Record<CreepKind, GemType> = {
  normal: "ruby",
  fast: "topaz",
  armored: "emerald",
  air: "sapphire",
  boss: "amethyst",
  healer: "ruby",
  wizard: "topaz",
  tunneler: "diamond",
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

  // === Right-click radial menu (Keep / Combine / Special) ===
  const SVG_NS = "http://www.w3.org/2000/svg";
  const KEEP_WEDGE =
    "M -77.94 -45 A 90 90 0 0 1 77.94 -45 L 17.32 -10 A 20 20 0 0 0 -17.32 -10 Z";
  const COMBINE_WEDGE =
    "M -77.94 -45 L -17.32 -10 A 20 20 0 0 0 0 20 L 0 90 A 90 90 0 0 1 -77.94 -45 Z";
  const SPECIAL_WEDGE =
    "M 0 90 A 90 90 0 0 0 77.94 -45 L 17.32 -10 A 20 20 0 0 1 0 20 Z";
  const BEVEL_ARC = "M -77.94 -45 A 90 90 0 0 1 77.94 -45";
  type RadialSlice = "keep" | "combine" | "special";

  const WEDGE_PATHS: Record<RadialSlice, string> = {
    keep: KEEP_WEDGE,
    combine: COMBINE_WEDGE,
    special: SPECIAL_WEDGE,
  };
  const SLICE_HIGHLIGHT: Record<
    RadialSlice,
    { fill: string; stroke: string }
  > = {
    keep: { fill: "rgba(88,200,80,0.22)", stroke: "#58c850" },
    combine: { fill: "rgba(240,160,64,0.22)", stroke: "#f0a040" },
    special: { fill: "rgba(120,168,248,0.22)", stroke: "#78a8f8" },
  };

  function svgEl<K extends keyof SVGElementTagNameMap>(
    tag: K,
  ): SVGElementTagNameMap[K] {
    return document.createElementNS(SVG_NS, tag);
  }
  function svgPath(d: string): SVGPathElement {
    const p = svgEl("path");
    p.setAttribute("d", d);
    return p;
  }

  const radialWrap = document.createElement("div");
  radialWrap.className = "radial-wrap";
  radialWrap.style.display = "none";
  canvasHost.appendChild(radialWrap);

  const rSvg = svgEl("svg");
  rSvg.setAttribute("viewBox", "-100 -100 200 200");
  rSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  radialWrap.appendChild(rSvg);

  const rDefs = svgEl("defs");
  const rFilter = svgEl("filter");
  rFilter.id = "radial-shadow";
  rFilter.setAttribute("x", "-20%");
  rFilter.setAttribute("y", "-20%");
  rFilter.setAttribute("width", "140%");
  rFilter.setAttribute("height", "140%");
  const rDrop = svgEl("feDropShadow");
  rDrop.setAttribute("dx", "0");
  rDrop.setAttribute("dy", "3");
  rDrop.setAttribute("stdDeviation", "0");
  rDrop.setAttribute("flood-color", "#1a1428");
  rDrop.setAttribute("flood-opacity", "1");
  rFilter.appendChild(rDrop);
  rDefs.appendChild(rFilter);
  const rHatchPat = svgEl("pattern");
  rHatchPat.id = "radial-hatch";
  rHatchPat.setAttribute("patternUnits", "userSpaceOnUse");
  rHatchPat.setAttribute("width", "6");
  rHatchPat.setAttribute("height", "6");
  rHatchPat.setAttribute("patternTransform", "rotate(45)");
  const rHatchLine = svgEl("line");
  rHatchLine.setAttribute("x1", "0");
  rHatchLine.setAttribute("y1", "0");
  rHatchLine.setAttribute("x2", "0");
  rHatchLine.setAttribute("y2", "6");
  rHatchLine.setAttribute("stroke", "#1a1428");
  rHatchLine.setAttribute("stroke-width", "2");
  rHatchPat.appendChild(rHatchLine);
  rDefs.appendChild(rHatchPat);
  const rGlowFilter = svgEl("filter");
  rGlowFilter.id = "radial-glow";
  rGlowFilter.setAttribute("x", "-30%");
  rGlowFilter.setAttribute("y", "-30%");
  rGlowFilter.setAttribute("width", "160%");
  rGlowFilter.setAttribute("height", "160%");
  const rGlowBlur = svgEl("feGaussianBlur");
  rGlowBlur.setAttribute("stdDeviation", "4");
  rGlowBlur.setAttribute("in", "SourceGraphic");
  rGlowFilter.appendChild(rGlowBlur);
  rDefs.appendChild(rGlowFilter);
  rSvg.appendChild(rDefs);

  const rShadowG = svgEl("g");
  rShadowG.setAttribute("filter", "url(#radial-shadow)");
  rSvg.appendChild(rShadowG);

  const keepW = svgPath(KEEP_WEDGE);
  const combineW = svgPath(COMBINE_WEDGE);
  const specialW = svgPath(SPECIAL_WEDGE);
  for (const w of [keepW, combineW, specialW]) {
    w.setAttribute("fill", "#3d3252");
    w.setAttribute("stroke", "#1a1428");
    w.setAttribute("stroke-width", "2");
    rShadowG.appendChild(w);
  }
  const rBevel = svgPath(BEVEL_ARC);
  rBevel.setAttribute("stroke", "#524470");
  rBevel.setAttribute("stroke-width", "3");
  rBevel.setAttribute("fill", "none");
  rShadowG.appendChild(rBevel);

  const combineHatchEl = svgPath(COMBINE_WEDGE);
  combineHatchEl.setAttribute("fill", "url(#radial-hatch)");
  combineHatchEl.setAttribute("opacity", "0.5");
  combineHatchEl.style.display = "none";
  rShadowG.appendChild(combineHatchEl);
  const specialHatchEl = svgPath(SPECIAL_WEDGE);
  specialHatchEl.setAttribute("fill", "url(#radial-hatch)");
  specialHatchEl.setAttribute("opacity", "0.5");
  specialHatchEl.style.display = "none";
  rShadowG.appendChild(specialHatchEl);

  const combineGlow = svgPath(COMBINE_WEDGE);
  combineGlow.setAttribute("fill", "none");
  combineGlow.setAttribute("stroke", "#f0a040");
  combineGlow.setAttribute("stroke-width", "3");
  combineGlow.setAttribute("filter", "url(#radial-glow)");
  combineGlow.classList.add("radial-glow-ring");
  combineGlow.style.display = "none";
  rSvg.appendChild(combineGlow);
  const specialGlow = svgPath(SPECIAL_WEDGE);
  specialGlow.setAttribute("fill", "none");
  specialGlow.setAttribute("stroke", "#78a8f8");
  specialGlow.setAttribute("stroke-width", "3");
  specialGlow.setAttribute("filter", "url(#radial-glow)");
  specialGlow.classList.add("radial-glow-ring");
  specialGlow.style.display = "none";
  rSvg.appendChild(specialGlow);

  const rHover = svgPath("");
  rHover.style.display = "none";
  rSvg.appendChild(rHover);

  function makeRadialLabel(
    cls: string,
    ico: string,
    txt: string,
  ): HTMLDivElement {
    const el = document.createElement("div");
    el.className = `radial-label ${cls}`;
    const icoEl = document.createElement("span");
    icoEl.className = "ico";
    icoEl.textContent = ico;
    el.append(icoEl, document.createTextNode(txt));
    return el;
  }
  const keepLbl = makeRadialLabel("keep", "★", "KEEP");
  keepLbl.style.left = "50%";
  keepLbl.style.top = "calc(50% - 60px)";
  const combineLbl = makeRadialLabel("combine", "⊕", "COMBINE");
  combineLbl.style.left = "calc(50% - 52px)";
  combineLbl.style.top = "calc(50% + 30px)";
  const specialLbl = makeRadialLabel("special", "✦", "SPECIAL");
  specialLbl.style.left = "calc(50% + 52px)";
  specialLbl.style.top = "calc(50% + 30px)";
  radialWrap.append(keepLbl, combineLbl, specialLbl);

  const rCenter = document.createElement("div");
  rCenter.className = "radial-center";
  radialWrap.appendChild(rCenter);

  const reasonChips = document.createElement("div");
  reasonChips.className = "radial-reason-chips";
  reasonChips.style.display = "none";
  canvasHost.appendChild(reasonChips);
  const combineChip = document.createElement("div");
  combineChip.className = "reason-chip";
  combineChip.textContent = "⊕ NO PAIR THIS ROUND";
  const specialChip = document.createElement("div");
  specialChip.className = "reason-chip";
  specialChip.textContent = "✦ NO RECIPE MATCH";
  reasonChips.append(combineChip, specialChip);

  let radialOpen = false;
  let radialTowerId: number | null = null;
  let radialCenterX = 0;
  let radialCenterY = 0;
  let radialCombineOk = false;
  let radialSpecialOk = false;
  let radialAlreadyKeeping = false;
  let curSlice: RadialSlice | null = null;

  function sliceFromXY(px: number, py: number): RadialSlice | null {
    const dx = px - radialCenterX;
    const dy = py - radialCenterY;
    if (Math.sqrt(dx * dx + dy * dy) < 20) return null;
    let a = Math.atan2(dy, dx) * (180 / Math.PI);
    if (a < 0) a += 360;
    if (a >= 210 && a < 330) return "keep";
    if (a >= 90 && a < 210) return "combine";
    return "special";
  }

  function isSliceActive(s: RadialSlice): boolean {
    if (s === "keep") return !radialAlreadyKeeping;
    if (s === "combine") return radialCombineOk;
    return radialSpecialOk;
  }

  function openRadial(towerId: number, tx: number, ty: number): void {
    const tower = game.state.towers.find((t) => t.id === towerId);
    if (!tower) return;
    radialTowerId = towerId;
    const bx = game.board.x;
    const by = game.board.y;
    radialCenterX = bx + (tx + 0.5) * FINE_TILE;
    radialCenterY = by + (ty + 0.5) * FINE_TILE;
    radialWrap.style.setProperty("--x", `${radialCenterX}px`);
    radialWrap.style.setProperty("--y", `${radialCenterY}px`);

    radialAlreadyKeeping = game.state.designatedKeepTowerId === towerId;
    radialCombineOk = checkCombineOk(tower);
    radialSpecialOk = checkSpecialOk(tower);

    combineW.setAttribute("fill", radialCombineOk ? "#3d3252" : "#2a2238");
    specialW.setAttribute("fill", radialSpecialOk ? "#3d3252" : "#2a2238");
    combineHatchEl.style.display = radialCombineOk ? "none" : "";
    specialHatchEl.style.display = radialSpecialOk ? "none" : "";
    combineGlow.style.display = radialCombineOk ? "" : "none";
    specialGlow.style.display = radialSpecialOk ? "" : "none";

    keepLbl.classList.toggle("disabled", radialAlreadyKeeping);
    keepLbl.textContent = "";
    const kIco = document.createElement("span");
    kIco.className = "ico";
    kIco.textContent = "★";
    keepLbl.append(
      kIco,
      document.createTextNode(radialAlreadyKeeping ? "KEEPING" : "KEEP"),
    );
    combineLbl.classList.toggle("disabled", !radialCombineOk);
    specialLbl.classList.toggle("disabled", !radialSpecialOk);

    combineChip.style.display = radialCombineOk ? "none" : "";
    specialChip.style.display = radialSpecialOk ? "none" : "";
    reasonChips.style.display =
      !radialCombineOk || !radialSpecialOk ? "" : "none";

    rCenter.innerHTML = "";
    rCenter.appendChild(htmlGem(tower.gem, 24, tower.quality > 2));

    rHover.style.display = "none";
    curSlice = null;
    radialWrap.style.display = "";
    radialOpen = true;
    window.addEventListener("pointermove", onRadialMove);
    window.addEventListener("pointerup", onRadialUp);
  }

  function closeRadial(): void {
    if (!radialOpen) return;
    radialOpen = false;
    radialTowerId = null;
    curSlice = null;
    radialWrap.style.display = "none";
    reasonChips.style.display = "none";
    rHover.style.display = "none";
    window.removeEventListener("pointermove", onRadialMove);
    window.removeEventListener("pointerup", onRadialUp);
  }

  function onRadialMove(ev: PointerEvent): void {
    const rect = canvasHost.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const dx = px - radialCenterX;
    const dy = py - radialCenterY;
    if (Math.sqrt(dx * dx + dy * dy) > 150) {
      closeRadial();
      return;
    }
    const s = sliceFromXY(px, py);
    if (s === curSlice) return;
    curSlice = s;
    if (!s || !isSliceActive(s)) {
      rHover.style.display = "none";
      return;
    }
    const h = SLICE_HIGHLIGHT[s];
    rHover.setAttribute("d", WEDGE_PATHS[s]);
    rHover.setAttribute("fill", h.fill);
    rHover.setAttribute("stroke", h.stroke);
    rHover.setAttribute("stroke-width", "2");
    rHover.style.display = "";
  }

  function onRadialUp(ev: PointerEvent): void {
    if (!radialOpen || radialTowerId === null) {
      closeRadial();
      return;
    }
    const rect = canvasHost.getBoundingClientRect();
    const s = sliceFromXY(
      ev.clientX - rect.left,
      ev.clientY - rect.top,
    );
    const tower = game.state.towers.find((t) => t.id === radialTowerId);
    if (s && tower && isSliceActive(s)) {
      if (s === "keep") {
        game.cmdDesignateKeep(radialTowerId);
      } else {
        game.selectTower(radialTowerId);
        if (s === "combine") doRadialCombine(tower);
        else doRadialSpecial(tower);
      }
    }
    closeRadial();
  }

  function checkCombineOk(tower: TowerState): boolean {
    if (tower.comboKey) return false;
    if (tower.quality >= 5) return false;
    const drawIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    if (!drawIds.has(tower.id)) return false;
    return (
      game.state.towers.filter(
        (t) =>
          drawIds.has(t.id) &&
          !t.comboKey &&
          t.gem === tower.gem &&
          t.quality === tower.quality,
      ).length >= 2
    );
  }

  function checkSpecialOk(tower: TowerState): boolean {
    if (tower.comboKey) return false;
    const placed = game.state.towers.filter((t) => !t.comboKey);
    for (const c of COMBOS) {
      const used = new Set<number>([tower.id]);
      let consumed = false;
      let valid = true;
      for (const inp of c.inputs) {
        if (!consumed && inp.gem === tower.gem && inp.quality === tower.quality) {
          consumed = true;
          continue;
        }
        const t = placed.find(
          (tt) =>
            !used.has(tt.id) &&
            tt.gem === inp.gem &&
            tt.quality === inp.quality,
        );
        if (!t) {
          valid = false;
          break;
        }
        used.add(t.id);
      }
      if (valid && consumed) return true;
    }
    return false;
  }

  function doRadialCombine(tower: TowerState): void {
    const drawIds = new Set(
      game.state.draws
        .map((d) => d.placedTowerId)
        .filter((id): id is number => id !== null),
    );
    const matches = game.state.towers.filter(
      (t) =>
        drawIds.has(t.id) &&
        !t.comboKey &&
        t.gem === tower.gem &&
        t.quality === tower.quality,
    );
    if (matches.length < 2) return;
    const others = matches.filter((t) => t.id !== tower.id);
    const take = matches.length >= 4 ? 4 : 2;
    game.cmdCombine([
      tower.id,
      ...others.slice(0, take - 1).map((t) => t.id),
    ]);
  }

  function doRadialSpecial(tower: TowerState): void {
    const placed = game.state.towers.filter((t) => !t.comboKey);
    for (const c of COMBOS) {
      if (c.key === 'stargem') {
        if (tower.quality === 5) {
          const same = placed.filter(t => t.id !== tower.id && t.gem === tower.gem && t.quality === 5);
          if (same.length >= 3) {
            game.cmdCombine([tower.id, ...same.slice(0, 3).map(t => t.id)]);
            return;
          }
        }
        continue;
      }
      const used = new Set<number>([tower.id]);
      const ids: number[] = [];
      let consumed = false;
      let valid = true;
      for (const inp of c.inputs) {
        if (!consumed && inp.gem === tower.gem && inp.quality === tower.quality) {
          ids.push(tower.id);
          consumed = true;
          continue;
        }
        const t = placed.find(
          (tt) =>
            !used.has(tt.id) &&
            tt.gem === inp.gem &&
            tt.quality === inp.quality,
        );
        if (!t) {
          valid = false;
          break;
        }
        used.add(t.id);
        ids.push(t.id);
      }
      if (valid && consumed) {
        game.cmdCombine(ids);
        return;
      }
    }
  }

  canvasHost.addEventListener("contextmenu", (ev) => ev.preventDefault());

  // === Pattern #5: Shift+click hint ===
  const shiftHint = document.createElement("div");
  shiftHint.className = "shift-keep-hint";
  shiftHint.style.display = "none";
  shiftHint.innerHTML =
    '<div>SHIFT + CLICK</div><div class="keepline">★ PLACE &amp; KEEP</div>';
  canvasHost.appendChild(shiftHint);

  let shiftDown = false;

  function updateShiftHint(): void {
    if (
      !shiftDown ||
      game.state.phase !== "build" ||
      !activeDraw(game.state) ||
      !game.hoverTile
    ) {
      shiftHint.style.display = "none";
      return;
    }
    const t = game.hoverTile;
    const bx = game.board.x;
    const by = game.board.y;
    shiftHint.style.left = `${bx + (t.x + 1) * FINE_TILE}px`;
    shiftHint.style.top = `${by + t.y * FINE_TILE}px`;
    shiftHint.style.display = "block";
  }

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
      card.className = "px-panel-inset recipe-card v2c";
      card.dataset.recipeKey = c.key;

      const banner = document.createElement("div");
      banner.className = "recipe-banner";
      banner.style.setProperty(
        "--banner-tint",
        GEM_PALETTE[c.visualGem].css.dark,
      );

      const spriteHost = document.createElement("div");
      spriteHost.className = "recipe-banner-sprite";
      spriteHost.appendChild(htmlSpecial(c.key, 36, true));
      banner.appendChild(spriteHost);

      const name = document.createElement("div");
      name.className = "recipe-name";
      name.textContent = c.name.toUpperCase();
      banner.appendChild(name);

      if (c.stats.blurb) {
        const blurb = document.createElement("div");
        blurb.className = "recipe-blurb";
        blurb.textContent = c.stats.blurb;
        banner.appendChild(blurb);
      }

      const dmg = document.createElement("div");
      dmg.className = "recipe-dmg";
      const dmgVal = document.createElement("span");
      dmgVal.className = "recipe-dmg-value";
      dmgVal.textContent = `${c.stats.dmgMin}–${c.stats.dmgMax}`;
      const dmgLbl = document.createElement("span");
      dmgLbl.className = "recipe-dmg-label";
      dmgLbl.textContent = "DMG";
      dmg.append(dmgVal, dmgLbl);
      banner.appendChild(dmg);

      card.appendChild(banner);

      const ingredients = document.createElement("div");
      ingredients.className = "recipe-ingredients";
      for (const inp of c.inputs) {
        const row = document.createElement("div");
        row.className = "recipe-ingredient";
        row.style.setProperty("--tier-color", TIER_COLORS[inp.quality]);
        row.appendChild(htmlGemTier(inp.gem, inp.quality, 22, inp.quality > 2));
        const gemName = document.createElement("span");
        gemName.className = "recipe-ingredient-name";
        gemName.textContent = GEM_PALETTE[inp.gem].name.toUpperCase();
        const tierLabel = document.createElement("span");
        tierLabel.className = "recipe-ingredient-tier";
        tierLabel.textContent = QUALITY_NAMES[inp.quality].toUpperCase();
        row.append(gemName, tierLabel);
        ingredients.appendChild(row);
      }
      card.appendChild(ingredients);
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
    const idx = SPEEDS.indexOf(game.state.speed as SpeedMultiplier);
    const nextSpeed = SPEEDS[(idx + 1) % SPEEDS.length];
    game.setSpeed(nextSpeed);
    speedBtn.textContent = `${nextSpeed}×`;
  });

  const pathBtn = document.createElement("button");
  pathBtn.className = "px-btn btn-path-viz";
  pathBtn.type = "button";
  function refreshPathBtn(): void {
    const on = game.pathVizEnabled;
    pathBtn.classList.toggle("is-on", on);
    pathBtn.setAttribute("aria-pressed", String(on));
    pathBtn.setAttribute("aria-label", on ? "Hide path" : "Show path");
    pathBtn.innerHTML = on
      ? '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M2 8 C 4 4, 12 4, 14 8 C 12 12, 4 12, 2 8 Z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg> PATH'
      : '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M2 8 C 4 4, 12 4, 14 8 C 12 12, 4 12, 2 8 Z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/><path d="M2 14 L 14 2" stroke="currentColor" stroke-width="1.5"/></svg> PATH';
  }
  refreshPathBtn();
  pathBtn.addEventListener("click", () => {
    game.togglePathViz();
    refreshPathBtn();
  });

  utilsRow.append(undoBtn, speedBtn, pathBtn);
  actionBar.appendChild(utilsRow);

  const systemRow = document.createElement("div");
  systemRow.className = "action-bar-system";
  const helpBtn = makeBtn("? HELP", () => mountTutorialModal(root));
  const exitBtn = makeBtn("EXIT", onExit);
  systemRow.append(helpBtn, exitBtn);
  actionBar.appendChild(systemRow);

  const resetBtn = document.createElement("button");
  resetBtn.className = "px-btn px-btn-bad action-bar-reset";
  resetBtn.textContent = "↺ RESET RUN · CTRL+R";
  resetBtn.addEventListener("click", () => game.restartGame());
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
    const primary = def.groups[0];
    arch.style.color = ARCHETYPE_COLORS[primary.kind];
    arch.textContent = def.groups.map(g => g.kind.toUpperCase()).join(" + ");
    const weakRow = document.createElement("div");
    weakRow.className = "threat-weak-row";
    const weakLbl = document.createElement("span");
    weakLbl.className = "threat-weak-lbl";
    weakLbl.textContent = "WEAK";
    const weakGem = ARCHETYPE_WEAKNESS[primary.kind];
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
    hpVal.textContent = formatHp(primary.hp);
    const hpUnit = document.createElement("span");
    hpUnit.className = "threat-hp-unit";
    hpUnit.textContent = "hp";
    hp.append(hpVal, hpUnit);
    const cnt = document.createElement("div");
    cnt.className = "threat-count";
    cnt.textContent = `×${waveTotalCount(def)}`;
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
      (allDrawsPlaced(game.state) && (game.state.designatedKeepTowerId !== null || game.creativeMode));
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
      closeRadial();
    } else if (phase === "gameover" || phase === "victory") {
      mountGameOver(root, game, phase, onExit);
    }
    game.refreshRoute();
  });

  game.bus.on("focusRecipe", ({ key }) => {
    const card = recipesList.querySelector<HTMLElement>(
      `.recipe-card[data-recipe-key="${key}"]`,
    );
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    card.style.outline = "2px solid var(--px-accent)";
    setTimeout(() => {
      card.style.outline = "";
    }, 600);
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
    shiftDown = ev.shiftKey;
    updateShiftHint();
  });
  canvasHost.addEventListener("pointerleave", () => {
    game.hoverTile = null;
    game.hoverPixel = null;
    game.hoverPresent = false;
    shiftDown = false;
    updateShiftHint();
  });
  canvasHost.addEventListener("pointerenter", () => {
    game.hoverPresent = true;
  });
  canvasHost.addEventListener("pointerdown", (ev: PointerEvent) => {
    if (ev.button === 2) {
      if (radialOpen) {
        closeRadial();
        return;
      }
      if (game.state.phase !== "build") return;
      const rt = tileFromPointer(ev);
      if (!rt) return;
      const rTower = game.state.towers.find(
        (tt) => tt.x === rt.x && tt.y === rt.y,
      );
      if (!rTower) return;
      const isRoundTower = game.state.draws.some(
        (d) => d.placedTowerId === rTower.id,
      );
      if (!isRoundTower) return;
      openRadial(rTower.id, rt.x, rt.y);
      return;
    }
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
      const placed = game.cmdPlace(t.x, t.y);
      // Pattern #5: Shift+click = place AND keep
      if (placed && ev.shiftKey) {
        const justPlaced = game.state.towers.find(
          (tt) => tt.x === t.x && tt.y === t.y,
        );
        if (justPlaced) {
          const isCurrentDraw = game.state.draws.some(
            (d) => d.placedTowerId === justPlaced.id,
          );
          if (isCurrentDraw) {
            const prev = game.state.designatedKeepTowerId;
            game.cmdDesignateKeep(justPlaced.id);
            if (prev !== null && prev !== justPlaced.id) {
              const prevTower = game.state.towers.find((tt) => tt.id === prev);
              if (prevTower) {
                game.bus.emit("toast", {
                  kind: "good",
                  text: `Keeper changed to ${GEM_PALETTE[justPlaced.gem].name}`,
                });
              }
            }
          }
        }
      }
    } else if (game.creativeMode && game.state.phase === "build") {
      game.cmdPlaceCreativeRock(t.x, t.y);
    } else {
      game.selectTower(null);
      game.selectRock(null);
    }
  });

  function openCombine(initialTab?: "level" | "recipe"): void {
    mountCombineModal(root, game, initialTab);
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Shift") {
      shiftDown = true;
      updateShiftHint();
    }
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
    } else if (ev.key === "8") {
      game.setSpeed(8);
      speedBtn.textContent = "8×";
    } else if (ev.key === "c" || ev.key === "C") {
      openCombine();
    } else if (ev.key === "Escape") {
      if (radialOpen) {
        closeRadial();
        return;
      }
      game.selectTower(null);
      game.selectRock(null);
    } else if (ev.key === "r" && ev.ctrlKey) {
      ev.preventDefault();
      game.restartGame();
    } else if (ev.key === "r" || ev.key === "R") {
      if (game.selectedRockId !== null) {
        game.cmdRemoveRock(game.selectedRockId);
      }
    } else if (ev.key === "Tab") {
      // Cycle active draw slot (forward; Shift+Tab for backward).
      ev.preventDefault();
      game.cmdCycleActiveSlot(ev.shiftKey ? -1 : 1);
    } else if (ev.key === "k" || ev.key === "K") {
      // Pattern #4: K hotkey to keep hovered or selected gem
      if (game.state.phase !== "build") return;
      const ht = game.hoverTile;
      if (ht) {
        const tower = game.state.towers.find(
          (tt) => tt.x === ht.x && tt.y === ht.y,
        );
        if (tower) {
          const isCurrentDraw = game.state.draws.some(
            (d) => d.placedTowerId === tower.id,
          );
          if (isCurrentDraw) {
            game.cmdDesignateKeep(tower.id);
            return;
          }
        }
      }
      if (game.selectedTowerId !== null) {
        const isCurrentDraw = game.state.draws.some(
          (d) => d.placedTowerId === game.selectedTowerId,
        );
        if (isCurrentDraw) {
          game.cmdDesignateKeep(game.selectedTowerId);
          return;
        }
      }
      game.bus.emit("toast", {
        kind: "info",
        text: "Hover a placed gem to mark it keeper",
      });
    } else if (ev.key === "p" || ev.key === "P") {
      game.togglePathViz();
      refreshPathBtn();
    } else if (ev.key === "?" || ev.key === "h" || ev.key === "H") {
      mountTutorialModal(root);
    } else if (ev.key === "b" && ev.ctrlKey) {
      ev.preventDefault();
      game.toggleBlueprint();
      game.bus.emit("toast", {
        kind: "info",
        text: game.blueprintMode ? "Blueprint ON" : "Blueprint OFF",
      });
    } else if (ev.key === "m" && ev.ctrlKey) {
      ev.preventDefault();
      game.toggleCreativeMode();
      game.bus.emit("toast", {
        kind: "info",
        text: game.creativeMode ? "Creative mode ON — place rocks freely" : "Creative mode OFF",
      });
    }
  };
  window.addEventListener("keydown", onKey);

  const onKeyUp = (ev: KeyboardEvent) => {
    if (ev.key === "Shift") {
      shiftDown = false;
      updateShiftHint();
    }
  };
  window.addEventListener("keyup", onKeyUp);

  // Initial paint.
  rebuildRecipes();
  tick();

  return () => {
    closeRadial();
    window.clearInterval(tickHandle);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKeyUp);
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
        label.style.color = CHANCE_TIER_COLORS[i];
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
        fill.style.background = CHANCE_TIER_COLORS[i];
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
        const affordable = g.state.gold >= (cost ?? 0);
        upBtn.disabled = !affordable;
        upBtn.classList.toggle("is-affordable", affordable);
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
        // Pattern #3: hover overlay for placed non-keep cells
        if (isPlaced && !isKeep) {
          const hoverOverlay = document.createElement("div");
          hoverOverlay.className = "draw-keep-hover";
          hoverOverlay.innerHTML = '<span class="star">★</span>';
          cell.appendChild(hoverOverlay);
          const tip = document.createElement("div");
          tip.className = "draw-keep-tip";
          tip.textContent = "CLICK · KEEP";
          cell.appendChild(tip);
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
