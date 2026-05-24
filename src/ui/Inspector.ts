/**
 * Selected-tower / creep / rock inspector. Shows stats, range circle (for towers),
 * effect summary, and action buttons.
 */

import { Game } from "../game/Game";
import { GEM_PALETTE, GemType, Quality, QUALITY_NAMES } from "../render/theme";
import { htmlGemTier, htmlSpecial, htmlCreep } from "../render/htmlSprites";
import { EffectKind, gemStats } from "../data/gems";
import {
  COMBOS,
  COMBO_BY_NAME,
  ComboRecipe,
  comboStatsAtTier,
  findAllCombosFor,
  nextUpgrade,
} from "../data/combos";
import { CreepState, TowerState } from "../game/State";
import { CREEP_ARCHETYPES } from "../data/creeps";
import { towerLevel } from "../systems/Combat";
import { SIM_HZ } from "../game/constants";

export interface InspectorRefs {
  root: HTMLElement;
  body: HTMLDivElement;
  title: HTMLDivElement;
  refresh: (g: Game) => void;
  lastFingerprint: string;
}

export function mountInspector(game: Game): InspectorRefs {
  const root = document.createElement("div");
  root.className = "px-panel inspector";
  const head = document.createElement("div");
  head.className = "panel-head";
  const title = document.createElement("div");
  title.className = "panel-h px-h";
  title.textContent = "SELECTED · GEM";
  head.appendChild(title);
  root.appendChild(head);

  const body = document.createElement("div");
  body.className = "inspector-body";
  root.appendChild(body);

  const refs: InspectorRefs = {
    root,
    body,
    title,
    refresh: (g: Game) => render(refs, g),
    lastFingerprint: "",
  };

  render(refs, game);
  return refs;
}

export function refreshInspector(refs: InspectorRefs, game: Game): void {
  refs.refresh(game);
}

/**
 * Fingerprint of all state that affects what the inspector renders. If this
 * is unchanged we skip the rebuild — otherwise the periodic 100ms tick would
 * destroy and recreate the action buttons mid-click, eating clicks whenever
 * mousedown and mouseup straddle a tick boundary.
 */
function fingerprint(game: Game): string {
  const creepId = game.selectedCreepId;
  if (creepId !== null) {
    const c = game.state.creeps.find((cc) => cc.id === creepId);
    if (!c || !c.alive) return `none|${game.state.phase}`;
    return [
      "creep",
      c.id,
      c.kind,
      c.hp,
      c.maxHp,
      c.speed,
      c.bounty,
      c.slow ? `s${c.slow.factor}` : "",
      c.poison ? `p${c.poison.dps}` : "",
      c.stun ? "stun" : "",
      c.armorDebuff ? `ad${c.armorDebuff.value}` : "",
      c.healBuff ? "hb" : "",
      c.burrowed ? "bur" : "",
      c.flags?.boss ? "B" : "",
      c.flags?.armored ? "A" : "",
      c.flags?.air ? "F" : "",
      game.state.tick,
    ].join("|");
  }
  const rockId = game.selectedRockId;
  if (rockId !== null) {
    const removable = game.canRemoveRock(rockId);
    const cost = game.rockRemovalCost();
    const affordable = game.state.gold >= cost;
    return `rock|${rockId}|${game.state.phase}|${removable ? 1 : 0}|${affordable ? 1 : 0}|${cost}`;
  }
  const id = game.selectedTowerId;
  const tower =
    id !== null ? (game.state.towers.find((t) => t.id === id) ?? null) : null;
  if (!tower) {
    const dmgFp = game.state.towers
      .map((t) => `${t.id}:${Math.floor(t.totalDamage)}`)
      .join(",");
    return `lb|${game.state.phase}|${dmgFp}`;
  }
  const isCurrentDraw = game.state.draws.some(
    (d) => d.placedTowerId === tower.id,
  );
  const combineCount = countCombinePairs(game, tower);
  const specialCount = countSpecialRecipes(game, tower);
  const upgradeCost = getUpgradeCost(tower);
  const canAfford = upgradeCost !== null && game.state.gold >= upgradeCost;
  return [
    tower.id,
    tower.gem,
    tower.quality,
    tower.comboKey ?? "",
    tower.upgradeTier ?? 0,
    tower.kills,
    game.state.phase,
    game.state.designatedKeepTowerId ?? "",
    isCurrentDraw ? 1 : 0,
    combineCount,
    specialCount,
    upgradeCost ?? "",
    canAfford ? 1 : 0,
    game.state.downgradeUsedThisRound ? 1 : 0,
  ].join("|");
}

function render(refs: InspectorRefs, game: Game): void {
  const fp = fingerprint(game);
  if (fp === refs.lastFingerprint) return;
  refs.lastFingerprint = fp;
  const body = refs.body;
  body.innerHTML = "";

  if (game.selectedCreepId !== null) {
    const creep = game.state.creeps.find((c) => c.id === game.selectedCreepId);
    if (creep && creep.alive) {
      refs.title.textContent = "SELECTED · CREEP";
      renderCreep(body, creep, game);
      return;
    }
  }

  if (game.selectedRockId !== null) {
    refs.title.textContent = "SELECTED · ROCK";
    renderRock(body, game, game.selectedRockId);
    return;
  }

  const id = game.selectedTowerId;
  const tower =
    id !== null ? (game.state.towers.find((t) => t.id === id) ?? null) : null;
  if (!tower) {
    refs.title.textContent = "GEM DAMAGE";
    renderLeaderboard(body, game);
    return;
  }

  refs.title.textContent = "SELECTED · GEM";

  const stats = effectiveStatsFor(tower);

  const hero = document.createElement("div");
  hero.className = "px-panel-inset inspector-tower-hero";
  const frame = document.createElement("div");
  frame.className = "inspector-hero-frame";
  frame.appendChild(
    tower.comboKey
      ? htmlSpecial(tower.comboKey, 40, true, tower.upgradeTier ?? 0)
      : htmlGemTier(tower.gem, tower.quality as Quality, 36, true),
  );
  const mid = document.createElement("div");
  mid.className = "inspector-tower-hero-mid";
  const heroName = document.createElement("div");
  heroName.className = "inspector-tower-hero-name";
  const heroSub = document.createElement("div");
  heroSub.className = "inspector-tower-hero-sub";
  if (tower.comboKey) {
    const combo = COMBO_BY_NAME.get(tower.comboKey!);
    const tier = tower.upgradeTier ?? 0;
    const tierName =
      combo && tier > 0 && combo.upgrades[tier - 1]
        ? combo.upgrades[tier - 1].name
        : combo?.name;
    heroName.textContent = (tierName ?? "COMBO").toUpperCase();
    heroSub.textContent =
      (combo ? comboStatsAtTier(combo, tier) : null)?.blurb ??
      combo?.stats.blurb ??
      "COMBO";
  } else {
    heroName.textContent = GEM_PALETTE[tower.gem].name.toUpperCase();
    heroSub.textContent = QUALITY_NAMES[tower.quality].toUpperCase();
  }
  const heroMeta = document.createElement("div");
  heroMeta.className = "inspector-tower-hero-meta";
  const lvl = towerLevel(tower);
  heroMeta.textContent =
    lvl > 0
      ? `${tower.kills} kills · LV ${lvl} (+${Math.round(((0.05 * lvl) / (1 + 0.03 * lvl)) * 100)}%)`
      : `${tower.kills} / 10 kills to next level`;
  mid.append(heroName, heroSub, heroMeta);
  hero.append(frame, mid);
  body.appendChild(hero);

  const statsRow = document.createElement("div");
  statsRow.className = "inspector-stats-row";
  statsRow.appendChild(
    statCell("DAMAGE", `${stats.dmgMin}–${stats.dmgMax}`, true),
  );
  statsRow.appendChild(statCell("RANGE", stats.range.toFixed(1), false));
  statsRow.appendChild(
    statCell(
      "SPEED",
      `${stats.atkSpeed.toFixed(2)}<small>/s</small>`,
      false,
      true,
    ),
  );
  body.appendChild(statsRow);

  const chiclets: ChicletData[] = [];
  for (const eff of stats.effects) {
    const c = effectChiclet(eff);
    if (c) chiclets.push(c);
  }
  if (stats.targeting !== "all") {
    chiclets.push({
      label: "TGT",
      text: stats.targeting === "air" ? "AIR" : "GROUND",
      tone: "tgt",
    });
  }
  if (chiclets.length > 0) {
    const grid = document.createElement("div");
    grid.className = "inspector-chiclet-grid";
    for (const c of chiclets) grid.appendChild(makeChicletEl(c));
    body.appendChild(grid);
  }

  if (!tower.comboKey) {
    const recipes = findAllCombosFor(tower.gem, tower.quality as Quality);
    for (const recipe of recipes) {
      const row = document.createElement("div");
      row.className = "inspector-forge-row";
      const head = document.createElement("div");
      head.className = "inspector-forge-row-head";
      head.textContent = "FORGES INTO";
      const rowBody = document.createElement("div");
      rowBody.className = "inspector-forge-row-body";
      const icon = document.createElement("div");
      icon.className = "forge-icon";
      icon.appendChild(htmlSpecial(recipe.key, 22));
      const fname = document.createElement("div");
      fname.className = "forge-name";
      fname.textContent = recipe.name.toUpperCase();
      const arrow = document.createElement("div");
      arrow.className = "forge-arrow";
      arrow.textContent = "›";
      rowBody.append(icon, fname, arrow);
      row.append(head, rowBody);
      row.addEventListener("click", () => {
        game.bus.emit("focusRecipe", { key: recipe.key });
      });
      body.appendChild(row);
    }
  }

  const actions = document.createElement("div");
  actions.className = "inspector-actions";

  const isCurrentDraw = game.state.draws.some(
    (d) => d.placedTowerId === tower.id,
  );
  const isKeep = game.state.designatedKeepTowerId === tower.id;
  const inBuild = game.state.phase === "build";
  const upgInfo = getUpgradeInfo(tower);

  const hasSecondBtn = !tower.comboKey || !!upgInfo;
  if (isCurrentDraw && hasSecondBtn) {
    const topRow = document.createElement("div");
    topRow.className = "inspector-action-row";
    const keep = document.createElement("button");
    keep.className = "px-btn px-btn-good";
    keep.textContent = isKeep ? "★ KEEPING" : "★ KEEP";
    keep.disabled = !inBuild || isKeep;
    keep.addEventListener("click", () => game.cmdDesignateKeep(tower.id));
    topRow.appendChild(keep);

    if (upgInfo) {
      const upgBtn = document.createElement("button");
      upgBtn.className = "px-btn px-btn-primary";
      upgBtn.disabled = game.state.gold < upgInfo.cost;
      upgBtn.textContent = `↑ UPGRADE ${upgInfo.cost}G`;
      upgBtn.addEventListener("click", () => game.cmdUpgradeTower(tower.id));
      topRow.appendChild(upgBtn);
    } else {
      const dg = document.createElement("button");
      dg.className = "px-btn px-btn-bad";
      const canDowngrade =
        tower.quality > 1 && !game.state.downgradeUsedThisRound;
      dg.disabled = !canDowngrade;
      dg.textContent = "▼ DOWNGRADE";
      if (tower.quality <= 1) dg.title = "Already lowest tier";
      else if (game.state.downgradeUsedThisRound)
        dg.title = "Already downgraded this round";
      dg.addEventListener("click", () => game.cmdDowngrade(tower.id));
      topRow.appendChild(dg);
    }
    actions.appendChild(topRow);
  } else if (isCurrentDraw) {
    const keep = document.createElement("button");
    keep.className = "px-btn px-btn-good inspector-action-keep";
    keep.textContent = isKeep ? "★ KEEPING" : "★ KEEP";
    keep.disabled = !inBuild || isKeep;
    keep.addEventListener("click", () => game.cmdDesignateKeep(tower.id));
    actions.appendChild(keep);
  } else if (upgInfo) {
    const upgBtn = document.createElement("button");
    upgBtn.className = "px-btn px-btn-primary inspector-action-keep";
    upgBtn.disabled = game.state.gold < upgInfo.cost;
    upgBtn.textContent = `↑ UPGRADE · ${upgInfo.cost}G`;
    upgBtn.addEventListener("click", () => game.cmdUpgradeTower(tower.id));
    actions.appendChild(upgBtn);
  }

  const comboRow = document.createElement("div");
  comboRow.className = "inspector-action-row";

  const combineCount = countCombinePairs(game, tower);
  const specialCount = countSpecialRecipes(game, tower);

  const combineBtn = document.createElement("button");
  combineBtn.className = "px-btn";
  combineBtn.disabled = !inBuild || !!tower.comboKey || tower.quality >= 5;
  setComboButton(combineBtn, "★ COMBINE", combineCount, false);
  combineBtn.addEventListener("click", () => tryAutoCombine(game));

  const specialBtn = document.createElement("button");
  specialBtn.className = "px-btn";
  specialBtn.disabled = !!tower.comboKey;
  setComboButton(specialBtn, "★ SPECIAL", specialCount, true);
  specialBtn.addEventListener("click", () => tryAutoCombineSpecial(game));

  comboRow.append(combineBtn, specialBtn);
  actions.append(comboRow);
  body.appendChild(actions);
}

function towerDisplayName(t: TowerState): string {
  if (t.comboKey) {
    const combo = COMBO_BY_NAME.get(t.comboKey);
    if (!combo) return t.comboKey;
    const tier = t.upgradeTier ?? 0;
    if (tier > 0 && combo.upgrades[tier - 1])
      return combo.upgrades[tier - 1].name;
    return combo.name;
  }
  return `${QUALITY_NAMES[t.quality]} ${GEM_PALETTE[t.gem].name}`;
}

function formatDamage(d: number): string {
  if (d >= 1_000_000) return `${(d / 1_000_000).toFixed(1)}M`;
  if (d >= 1_000) return `${(d / 1_000).toFixed(1)}k`;
  return String(Math.round(d));
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lbGemColors(gem: GemType): {
  text: string;
  fill: string;
  fillAlpha: number;
  borderAlpha: number;
} {
  switch (gem) {
    case "ruby":
      return {
        text: "#ff6878",
        fill: "#ff6878",
        fillAlpha: 0.2,
        borderAlpha: 0.3,
      };
    case "sapphire":
      return {
        text: "#a0c8ff",
        fill: "#5898ff",
        fillAlpha: 0.22,
        borderAlpha: 0.3,
      };
    case "emerald":
      return {
        text: "#78e898",
        fill: "#50e878",
        fillAlpha: 0.2,
        borderAlpha: 0.3,
      };
    case "topaz":
      return {
        text: "#ffe068",
        fill: "#ffe068",
        fillAlpha: 0.18,
        borderAlpha: 0.28,
      };
    case "amethyst":
      return {
        text: "#d090f0",
        fill: "#d090f0",
        fillAlpha: 0.2,
        borderAlpha: 0.3,
      };
    case "opal":
      return {
        text: "#c0d0e0",
        fill: "#8898b8",
        fillAlpha: 0.28,
        borderAlpha: 0.35,
      };
    case "diamond":
      return {
        text: "#e8f8ff",
        fill: "#80d0f0",
        fillAlpha: 0.24,
        borderAlpha: 0.3,
      };
    case "aquamarine":
      return {
        text: "#b8f4ee",
        fill: "#7fe6e1",
        fillAlpha: 0.2,
        borderAlpha: 0.3,
      };
  }
}

function renderLeaderboard(body: HTMLDivElement, game: Game): void {
  const towers = game.state.towers
    .filter((t) => t.totalDamage > 0)
    .sort((a, b) => b.totalDamage - a.totalDamage);

  if (towers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    empty.textContent = "No gem damage yet.";
    body.appendChild(empty);
    return;
  }

  const maxDmg = towers[0].totalDamage;
  const totalDmg = towers.reduce((sum, t) => sum + t.totalDamage, 0);
  const list = document.createElement("div");
  list.className = "lb-list";

  const limit = Math.min(towers.length, 8);
  for (let i = 0; i < limit; i++) {
    const t = towers[i];
    const c = lbGemColors(t.gem);
    const barPct = (t.totalDamage / maxDmg) * 100;
    const sharePct = totalDmg > 0 ? (t.totalDamage / totalDmg) * 100 : 0;

    const row = document.createElement("div");
    row.className = "lb-row";
    row.style.backgroundImage = `linear-gradient(to right, ${hexToRgba(c.fill, c.fillAlpha)} ${barPct}%, transparent ${barPct}%)`;
    row.style.borderBottom = `1px solid ${hexToRgba(c.fill, c.borderAlpha)}`;
    row.addEventListener("click", () => game.selectTower(t.id));
    row.addEventListener("mouseenter", () => {
      game.hoveredTowerId = t.id;
    });
    row.addEventListener("mouseleave", () => {
      game.hoveredTowerId = null;
    });

    const rank = document.createElement("div");
    rank.className = "lb-rank";
    rank.textContent = String(i + 1);

    const sprite = document.createElement("div");
    sprite.className = "lb-sprite";
    sprite.appendChild(
      t.comboKey
        ? htmlSpecial(t.comboKey, 18, false, t.upgradeTier ?? 0)
        : htmlGemTier(t.gem, t.quality as Quality, 18, false),
    );

    const nameEl = document.createElement("div");
    nameEl.className = "lb-name";
    nameEl.style.color = c.text;
    nameEl.textContent = towerDisplayName(t);

    const pctEl = document.createElement("div");
    pctEl.className = "lb-pct";
    pctEl.style.color = c.text;
    pctEl.textContent = `${Math.round(sharePct)}%`;

    const val = document.createElement("div");
    val.className = "lb-val";
    val.textContent = formatDamage(t.totalDamage);

    row.append(rank, sprite, nameEl, pctEl, val);
    list.appendChild(row);
  }

  body.appendChild(list);

  if (towers.length > limit) {
    const more = document.createElement("div");
    more.className = "lb-more";
    more.textContent = `+ ${towers.length - limit} more`;
    body.appendChild(more);
  }
}

function setComboButton(
  btn: HTMLButtonElement,
  label: string,
  count: number,
  special: boolean,
): void {
  btn.textContent = label;
  if (count > 0) {
    btn.classList.add("combo-active");
    btn.classList.toggle("special", special);
    const badge = document.createElement("span");
    badge.className = "badge-count";
    badge.textContent = String(count);
    btn.appendChild(badge);
  } else {
    btn.classList.remove("combo-active", "special");
  }
}

function countCombinePairs(game: Game, sel: TowerState): number {
  if (sel.comboKey) return 0;
  if (sel.quality >= 5) return 0;
  const drawIds = new Set(
    game.state.draws
      .map((d) => d.placedTowerId)
      .filter((id): id is number => id !== null),
  );
  if (!drawIds.has(sel.id)) return 0;
  const matches = game.state.towers.filter(
    (t) =>
      drawIds.has(t.id) &&
      !t.comboKey &&
      t.gem === sel.gem &&
      t.quality === sel.quality,
  );
  return matches.length >= 2 ? 1 : 0;
}

function countSpecialRecipes(game: Game, sel: TowerState): number {
  if (sel.comboKey) return 0;
  const state = game.state;

  if (state.phase !== "build") {
    const placed = state.towers.filter((t) => !t.comboKey);
    let n = 0;
    for (const c of COMBOS) {
      if (matchRecipeWithMust(c, placed, sel)) n++;
    }
    return n;
  }

  const drawIds = new Set(
    state.draws
      .map((d) => d.placedTowerId)
      .filter((id): id is number => id !== null),
  );
  const selIsCurrent = drawIds.has(sel.id);
  const allNonCombo = state.towers.filter((t) => !t.comboKey);
  const currentOnly = allNonCombo.filter((t) => drawIds.has(t.id));
  const keptOnly = allNonCombo.filter((t) => !drawIds.has(t.id));

  let n = 0;
  for (const c of COMBOS) {
    if (selIsCurrent && matchRecipeWithMust(c, currentOnly, sel)) {
      n++;
      continue;
    }
    if (!selIsCurrent && matchRecipeWithMust(c, keptOnly, sel)) {
      n++;
      continue;
    }
    if (selIsCurrent) {
      if (matchRecipeWithMust(c, [sel, ...keptOnly], sel)) {
        n++;
        continue;
      }
    } else {
      const pool = [...keptOnly, ...currentOnly];
      const result = matchRecipeWithMust(c, pool, sel);
      if (result) {
        const currentCount = result.filter((id) => drawIds.has(id)).length;
        if (currentCount <= 1) {
          n++;
          continue;
        }
      }
    }
  }
  return n;
}

function matchRecipeWithMust(
  c: ComboRecipe,
  towers: TowerState[],
  must: TowerState,
): number[] | null {
  if (c.key === "stargem") {
    if (must.quality !== 5) return null;
    const same = towers.filter(
      (t) => t.id !== must.id && t.gem === must.gem && t.quality === 5,
    );
    if (same.length < 3) return null;
    return [must.id, ...same.slice(0, 3).map((t) => t.id)];
  }
  const used = new Set<number>([must.id]);
  const ids: number[] = [];
  let consumed = false;
  for (const inp of c.inputs) {
    if (!consumed && inp.gem === must.gem && inp.quality === must.quality) {
      ids.push(must.id);
      consumed = true;
      continue;
    }
    const t = towers.find(
      (tt) =>
        !used.has(tt.id) && tt.gem === inp.gem && tt.quality === inp.quality,
    );
    if (!t) return null;
    used.add(t.id);
    ids.push(t.id);
  }
  if (!consumed) return null;
  return ids;
}

function selectedTower(game: Game): TowerState | null {
  const id = game.selectedTowerId;
  if (id === null) return null;
  return game.state.towers.find((t) => t.id === id) ?? null;
}

function tryAutoCombine(game: Game): void {
  if (game.state.phase !== "build") return;
  const sel = selectedTower(game);
  if (!sel) {
    game.bus.emit("toast", { kind: "error", text: "Select a gem to combine" });
    return;
  }
  if (sel.comboKey) {
    game.bus.emit("toast", {
      kind: "error",
      text: "Specials cannot be levelled up",
    });
    return;
  }
  const drawIds = new Set(
    game.state.draws
      .map((d) => d.placedTowerId)
      .filter((id): id is number => id !== null),
  );
  if (!drawIds.has(sel.id)) {
    game.bus.emit("toast", {
      kind: "error",
      text: "Level-up only works on this round's draws",
    });
    return;
  }
  const matches = game.state.towers.filter(
    (t) =>
      drawIds.has(t.id) &&
      !t.comboKey &&
      t.gem === sel.gem &&
      t.quality === sel.quality,
  );
  if (matches.length < 2) {
    game.bus.emit("toast", {
      kind: "error",
      text: "Need another same-gem, same-quality from this round",
    });
    return;
  }
  const others = matches.filter((t) => t.id !== sel.id);
  const take = matches.length >= 4 ? 4 : 2;
  const ids = [sel.id, ...others.slice(0, take - 1).map((t) => t.id)];
  game.cmdCombine(ids);
}

function tryAutoCombineSpecial(game: Game): void {
  const sel = selectedTower(game);
  if (!sel) {
    game.bus.emit("toast", {
      kind: "error",
      text: "Select a gem to anchor the recipe",
    });
    return;
  }
  if (sel.comboKey) {
    game.bus.emit("toast", {
      kind: "error",
      text: "Specials cannot be re-combined",
    });
    return;
  }
  const state = game.state;

  if (state.phase !== "build") {
    const placed = state.towers.filter((t) => !t.comboKey);
    for (const c of COMBOS) {
      const ids = matchRecipeWithMust(c, placed, sel);
      if (ids) {
        game.cmdCombine(ids);
        return;
      }
    }
    game.bus.emit("toast", {
      kind: "error",
      text: "No recipe uses the selected gem yet",
    });
    return;
  }

  const drawIds = new Set(
    state.draws
      .map((d) => d.placedTowerId)
      .filter((id): id is number => id !== null),
  );
  const selIsCurrent = drawIds.has(sel.id);
  const allNonCombo = state.towers.filter((t) => !t.comboKey);
  const currentOnly = allNonCombo.filter((t) => drawIds.has(t.id));
  const keptOnly = allNonCombo.filter((t) => !drawIds.has(t.id));

  for (const c of COMBOS) {
    if (selIsCurrent) {
      const ids1 = matchRecipeWithMust(c, currentOnly, sel);
      if (ids1) {
        game.cmdCombine(ids1);
        return;
      }
    }
    if (!selIsCurrent) {
      const ids2 = matchRecipeWithMust(c, keptOnly, sel);
      if (ids2) {
        game.cmdCombine(ids2);
        return;
      }
    }
    if (selIsCurrent) {
      const ids3 = matchRecipeWithMust(c, [sel, ...keptOnly], sel);
      if (ids3) {
        game.cmdCombine(ids3);
        return;
      }
    } else {
      const result = matchRecipeWithMust(c, [...keptOnly, ...currentOnly], sel);
      if (result) {
        const currentCount = result.filter((id) => drawIds.has(id)).length;
        if (currentCount <= 1) {
          game.cmdCombine(result);
          return;
        }
      }
    }
  }
  game.bus.emit("toast", {
    kind: "error",
    text: "No recipe uses the selected gem yet",
  });
}

function renderRock(body: HTMLDivElement, game: Game, rockId: number): void {
  const rock = game.state.rocks.find((r) => r.id === rockId);
  if (!rock) {
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    empty.textContent = "Click a tower or rock to inspect.";
    body.appendChild(empty);
    return;
  }

  const hero = document.createElement("div");
  hero.className = "px-panel-inset inspector-hero";
  const frame = document.createElement("div");
  frame.className = "inspector-hero-frame";
  const swatch = document.createElement("div");
  swatch.style.width = "32px";
  swatch.style.height = "32px";
  swatch.style.background = "#7e6d5a";
  swatch.style.boxShadow =
    "inset 2px 2px 0 0 #a89478, inset -2px -2px 0 0 #4a3d2e";
  frame.appendChild(swatch);
  const text = document.createElement("div");
  text.className = "inspector-hero-text";
  const name = document.createElement("div");
  name.className = "inspector-hero-name";
  name.textContent = "ROCK";
  const sub = document.createElement("div");
  sub.className = "inspector-hero-sub";
  sub.textContent = `PLACED · WAVE ${rock.placedAtBuildOfWave}`;
  text.append(name, sub);
  hero.append(frame, text);
  body.appendChild(hero);

  const removable = game.canRemoveRock(rockId);
  const cost = game.rockRemovalCost();
  const affordable = game.state.gold >= cost;

  const note = document.createElement("div");
  note.className = "inspector-effect";
  const noteLbl = document.createElement("div");
  noteLbl.className = "inspector-effect-label";
  noteLbl.textContent = removable ? "DEMOLISH · COST" : "LOCKED · THIS ROUND";
  const noteTxt = document.createElement("div");
  noteTxt.className = "inspector-effect-text";
  noteTxt.textContent = removable
    ? `${cost} gold — frees the 2×2 footprint`
    : "Available once this build phase ends";
  note.append(noteLbl, noteTxt);
  body.appendChild(note);

  const actions = document.createElement("div");
  actions.className = "inspector-actions";
  const remove = document.createElement("button");
  remove.className = "px-btn px-btn-bad";
  remove.textContent = `↯ REMOVE · ${cost}G`;
  remove.disabled = !removable || !affordable;
  remove.addEventListener("click", () => game.cmdRemoveRock(rockId));
  actions.append(remove);
  body.appendChild(actions);
}

const CREEP_KIND_NAMES: Record<string, string> = {
  shambler: "SHAMBLER",
  skitter: "SWIFT",
  carapace: "CARAPACE",
  shrike: "SHRIKE",
  amalgam: "AMALGAM",
  mender: "MENDER",
  wizard: "WIZARD",
  burrower: "BURROWER",
  vessel: "VESSEL",
  gazer: "GAZER",
  coral: "CORAL",
  anemone: "ANEMONE",
  chrysalid: "CHRYSALID",
  mycoid: "MYCOID",
  gestation: "GESTATION",
};

const ABILITY_DESC: Record<string, string> = {
  mender: "Heals flesh of nearby allies",
  wizard: "Teleports allies forward",
  burrower: "Burrows underground, becoming untargetable",
};

function renderCreep(body: HTMLDivElement, c: CreepState, game: Game): void {
  // Hero row — large sprite + name
  const hero = document.createElement("div");
  hero.className = "px-panel-inset inspector-hero";
  const frame = document.createElement("div");
  frame.className = "inspector-hero-frame inspector-hero-frame-creep";
  frame.appendChild(htmlCreep(c.kind, c.color, 44, true));
  const text = document.createElement("div");
  text.className = "inspector-hero-text";
  const name = document.createElement("div");
  name.className = "inspector-hero-name";
  name.textContent = CREEP_KIND_NAMES[c.kind] ?? c.kind.toUpperCase();
  const sub = document.createElement("span");
  sub.className = "inspector-hero-sub";
  sub.textContent = GEM_PALETTE[c.color].name.toUpperCase();
  text.append(name, sub);
  hero.append(frame, text);
  body.appendChild(hero);

  // Flag chips (boss / armored / air)
  if (c.flags?.boss || c.flags?.armored || c.flags?.air) {
    const flagRow = document.createElement("div");
    flagRow.className = "inspector-creep-flags";
    if (c.flags.boss) flagRow.appendChild(flagChip("BOSS", "bad"));
    if (c.flags.armored) flagRow.appendChild(flagChip("ARMORED", "muted"));
    if (c.flags.air) flagRow.appendChild(flagChip("AIR", "accent"));
    body.appendChild(flagRow);
  }

  // Blurb (archetype description)
  const archetype = CREEP_ARCHETYPES[c.kind as keyof typeof CREEP_ARCHETYPES];
  if (archetype?.blurb) {
    const blurb = document.createElement("div");
    blurb.className = "inspector-creep-blurb";
    blurb.textContent = archetype.blurb;
    body.appendChild(blurb);
  }

  // HP bar (inset card)
  const hpRow = document.createElement("div");
  hpRow.className = "px-panel-inset inspector-creep-hp";
  const hpHead = document.createElement("div");
  hpHead.className = "inspector-creep-hp-head";
  const hpLabel = document.createElement("div");
  hpLabel.className = "inspector-stat-label-sm";
  hpLabel.textContent = "HP";
  const hpNums = document.createElement("div");
  hpNums.className = "inspector-creep-hp-nums";
  const pct = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
  hpNums.textContent = `${Math.ceil(c.hp)} / ${c.maxHp}  (${pct.toFixed(0)}%)`;
  hpHead.append(hpLabel, hpNums);
  const hpTrack = document.createElement("div");
  hpTrack.className = "inspector-creep-hp-track";
  const hpFill = document.createElement("div");
  hpFill.className = "inspector-creep-hp-fill";
  hpFill.style.width = `${pct}%`;
  if (pct < 25) hpFill.classList.add("hp-crit");
  else if (pct < 50) hpFill.classList.add("hp-warn");
  hpTrack.appendChild(hpFill);
  hpRow.append(hpHead, hpTrack);
  body.appendChild(hpRow);

  // Stats grid — speed + bounty + optional slow resist
  const grid = document.createElement("div");
  grid.className = "inspector-stats-grid";

  const spdStat = document.createElement("div");
  spdStat.className = "px-panel-inset inspector-stat";
  const spdLbl = document.createElement("div");
  spdLbl.className = "inspector-stat-label-sm";
  spdLbl.textContent = "SPEED";
  const spdVal = document.createElement("div");
  spdVal.className = "inspector-stat-value inspector-stat-value-sec";
  spdVal.innerHTML = `${c.speed.toFixed(1)}<small>/s</small>`;
  spdStat.append(spdLbl, spdVal);
  grid.appendChild(spdStat);

  const bntStat = document.createElement("div");
  bntStat.className = "px-panel-inset inspector-stat";
  const bntLbl = document.createElement("div");
  bntLbl.className = "inspector-stat-label-sm";
  bntLbl.textContent = "BOUNTY";
  const bntVal = document.createElement("div");
  bntVal.className = "inspector-stat-value inspector-stat-value-sec";
  bntVal.innerHTML = `${c.bounty}<small>g</small>`;
  bntStat.append(bntLbl, bntVal);
  grid.appendChild(bntStat);

  if (c.slowResist > 0) {
    const srStat = document.createElement("div");
    srStat.className = "px-panel-inset inspector-stat";
    const srLbl = document.createElement("div");
    srLbl.className = "inspector-stat-label-sm";
    srLbl.textContent = "SLOW RES";
    const srVal = document.createElement("div");
    srVal.className = "inspector-stat-value inspector-stat-value-sec";
    srVal.textContent = `${(c.slowResist * 100).toFixed(0)}%`;
    srStat.append(srLbl, srVal);
    grid.appendChild(srStat);
  }

  if (c.armor > 0) {
    const arStat = document.createElement("div");
    arStat.className = "px-panel-inset inspector-stat";
    const arLbl = document.createElement("div");
    arLbl.className = "inspector-stat-label-sm";
    arLbl.textContent = "ARMOR";
    const arVal = document.createElement("div");
    arVal.className = "inspector-stat-value inspector-stat-value-sec";
    const effective =
      c.armor -
      c.armorReduction -
      (c.armorDebuff && c.armorDebuff.expiresAt > game.state.tick
        ? c.armorDebuff.value
        : 0);
    if (effective !== c.armor) {
      arVal.textContent = `${effective} (base ${c.armor})`;
    } else {
      arVal.textContent = `${c.armor}`;
    }
    arStat.append(arLbl, arVal);
    grid.appendChild(arStat);
  }

  body.appendChild(grid);

  // Ability chip (healer / wizard / tunneler)
  const abilDesc = ABILITY_DESC[c.kind];
  if (abilDesc) {
    const chip = document.createElement("div");
    chip.className = "inspector-effect";
    const lbl = document.createElement("div");
    lbl.className = "inspector-effect-label";
    lbl.textContent = `ABILITY · ${c.kind.toUpperCase()}`;
    const txt = document.createElement("div");
    txt.className = "inspector-effect-text";
    txt.textContent = abilDesc;
    chip.append(lbl, txt);
    body.appendChild(chip);
  }

  // Active status effects
  const effects: Array<{
    label: string;
    text: string;
    kind: "debuff" | "cc" | "buff";
  }> = [];
  const tick = game.state.tick;

  if (c.slow) {
    const rem = Math.max(0, (c.slow.expiresAt - tick) / SIM_HZ);
    effects.push({
      label: "SLOW",
      text: `${((1 - c.slow.factor) * 100).toFixed(0)}% slow · ${rem.toFixed(1)}s`,
      kind: "debuff",
    });
  }
  if (c.poison) {
    const rem = Math.max(0, (c.poison.expiresAt - tick) / SIM_HZ);
    effects.push({
      label: "POISON",
      text: `${c.poison.dps.toFixed(1)} dps · ${rem.toFixed(1)}s`,
      kind: "debuff",
    });
  }
  if (c.armorDebuff) {
    const rem = Math.max(0, (c.armorDebuff.expiresAt - tick) / SIM_HZ);
    effects.push({
      label: "ARMOR BREAK",
      text: `-${c.armorDebuff.value} armor · ${rem.toFixed(1)}s`,
      kind: "debuff",
    });
  }
  if (c.stun) {
    const rem = Math.max(0, (c.stun.expiresAt - tick) / SIM_HZ);
    effects.push({
      label: "STUNNED",
      text: `${rem.toFixed(1)}s remaining`,
      kind: "cc",
    });
  }
  if (c.burrowed) {
    const rem = Math.max(0, (c.burrowed.expiresAt - tick) / SIM_HZ);
    effects.push({
      label: "BURROWED",
      text: `Untargetable · ${rem.toFixed(1)}s`,
      kind: "buff",
    });
  }
  if (c.healBuff) {
    const rem = Math.max(0, (c.healBuff.expiresAt - tick) / SIM_HZ);
    effects.push({
      label: "HEALING",
      text: `+${(c.healBuff.hpPerTick * SIM_HZ).toFixed(0)} hp/s · ${rem.toFixed(1)}s`,
      kind: "buff",
    });
  }

  for (const eff of effects) {
    const chip = document.createElement("div");
    chip.className = `inspector-effect inspector-effect-${eff.kind}`;
    const lbl = document.createElement("div");
    lbl.className = "inspector-effect-label";
    lbl.textContent = eff.label;
    const txt = document.createElement("div");
    txt.className = "inspector-effect-text";
    txt.textContent = eff.text;
    chip.append(lbl, txt);
    body.appendChild(chip);
  }
}

function flagChip(text: string, variant: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `inspector-creep-flag inspector-creep-flag-${variant}`;
  span.textContent = text;
  return span;
}

function statCell(
  label: string,
  value: string,
  isDmg: boolean,
  useHtml = false,
): HTMLDivElement {
  const cell = document.createElement("div");
  cell.className = `px-panel-inset inspector-stat-cell${isDmg ? " is-dmg" : ""}`;
  const lbl = document.createElement("div");
  lbl.className = "stat-lbl";
  lbl.textContent = label;
  const val = document.createElement("div");
  val.className = "stat-val";
  if (useHtml) val.innerHTML = value;
  else val.textContent = value;
  cell.append(lbl, val);
  return cell;
}

interface ChicletData {
  label: string;
  text: string;
  tone: "aoe" | "cc" | "buff" | "debuff" | "tgt";
}

function makeChicletEl(c: ChicletData): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `inspector-chiclet tone-${c.tone}`;
  const lbl = document.createElement("span");
  lbl.className = "chiclet-lbl";
  lbl.textContent = c.label;
  const val = document.createElement("span");
  val.className = "chiclet-val";
  val.textContent = c.text;
  el.append(lbl, val);
  return el;
}

function effectChiclet(e: EffectKind): ChicletData | null {
  switch (e.kind) {
    case "none":
      return null;
    case "splash":
      return {
        label: "SPLASH",
        text: `r=${e.radius.toFixed(1)}${e.falloff ? ` ${Math.round(e.falloff * 100)}%` : ""}`,
        tone: "aoe",
      };
    case "chain":
      return { label: "CHAIN", text: `${e.bounces} bounces`, tone: "aoe" };
    case "multi_target":
      return { label: "MULTI", text: `${e.count} targets`, tone: "aoe" };
    case "periodic_nova":
      return { label: "NOVA", text: `every ${e.everyN} hits`, tone: "aoe" };
    case "death_nova":
      return {
        label: "DEATH NOVA",
        text: `${Math.round(e.hpPct * 100)}% HP r=${e.radius.toFixed(1)}`,
        tone: "aoe",
      };
    case "crit_splash":
      return {
        label: "CRIT AoE",
        text: `r=${e.radius.toFixed(1)}`,
        tone: "aoe",
      };
    case "eruption":
      return {
        label: "ERUPTION",
        text: `every ${e.threshold} hits`,
        tone: "aoe",
      };
    case "trap_explode":
      return {
        label: "EXPLODE",
        text: `r=${e.radius.toFixed(1)}`,
        tone: "aoe",
      };
    case "slow":
      return {
        label: "SLOW",
        text: `×${e.factor.toFixed(2)} ${e.duration}s`,
        tone: "cc",
      };
    case "stun":
      return {
        label: "STUN",
        text: `${Math.round(e.chance * 100)}% ${e.duration}s`,
        tone: "cc",
      };
    case "freeze_chance":
      return {
        label: "FREEZE",
        text: `${Math.round(e.chance * 100)}% ${e.duration}s`,
        tone: "cc",
      };
    case "periodic_freeze":
      return {
        label: "FREEZE",
        text: `every ${e.interval}s ${e.duration}s`,
        tone: "cc",
      };
    case "frostbite":
      return {
        label: "FROSTBITE",
        text: `+${Math.round(e.dmgBonus * 100)}%`,
        tone: "cc",
      };
    case "trap_root":
      return { label: "ROOT", text: `${e.duration}s`, tone: "cc" };
    case "trap_slow":
      return {
        label: "SLOW",
        text: `×${e.factor.toFixed(2)} ${e.duration}s`,
        tone: "cc",
      };
    case "trap_knockback":
      return { label: "KNOCKBACK", text: `${e.distance} tiles`, tone: "cc" };
    case "prox_slow":
      return {
        label: "SLOW FIELD",
        text: `×${e.factor.toFixed(2)} r=${e.radius.toFixed(1)}`,
        tone: "cc",
      };
    case "demote_air":
      return { label: "GROUND", text: `every ${e.everyN}th hit`, tone: "cc" };
    case "crit":
      return {
        label: "CRIT",
        text: `${Math.round(e.chance * 100)}% ×${e.multiplier}`,
        tone: "buff",
      };
    case "aura_atkspeed":
      return {
        label: "ATK SPD",
        text: `+${Math.round(e.pct * 100)}% r=${e.radius.toFixed(1)}`,
        tone: "buff",
      };
    case "aura_dmg":
      return {
        label: "DMG AURA",
        text: `+${Math.round(e.pct * 100)}% r=${e.radius.toFixed(1)}`,
        tone: "buff",
      };
    case "beam_ramp":
      return {
        label: "BEAM",
        text: `+${Math.round(e.rampPerHit * 100)}%/hit`,
        tone: "buff",
      };
    case "focus_crit":
      return {
        label: "FOCUS",
        text: `+${Math.round(e.pctPerHit * 100)}%/hit`,
        tone: "buff",
      };
    case "execute":
      return {
        label: "EXECUTE",
        text: `+${Math.round(e.dmgBonus * 100)}% <${Math.round(e.hpThreshold * 100)}%`,
        tone: "buff",
      };
    case "stun_bonus_dmg":
      return { label: "STUN DMG", text: `×${e.multiplier}`, tone: "buff" };
    case "bonus_gold": {
      const pct = e.chance * 100;
      return {
        label: "GOLD",
        text: `${pct % 1 ? pct.toFixed(1) : pct}% ×${e.multiplier} bounty (max 10)`,
        tone: "buff",
      };
    }
    case "air_bonus":
      return {
        label: "AIR BONUS",
        text: `×${e.multiplier.toFixed(1)}`,
        tone: "buff",
      };
    case "true":
      return {
        label: "TRUE DMG",
        text: `${Math.round(e.chance * 100)}%`,
        tone: "buff",
      };
    case "poison":
      return {
        label: "POISON",
        text: `${Math.round(e.dps)}/s ${e.duration}s`,
        tone: "debuff",
      };
    case "armor_reduce":
      return {
        label: "ARMOR BREAK",
        text: `-${e.value} ${e.duration}s`,
        tone: "debuff",
      };
    case "prox_armor_reduce":
      return {
        label: "ARMOR SHRED",
        text: `-${e.value} r=${e.radius.toFixed(1)}`,
        tone: "debuff",
      };
    case "vulnerability_aura":
      return {
        label: "VULN",
        text: `+${Math.round(e.pct * 100)}% r=${e.radius.toFixed(1)}`,
        tone: "debuff",
      };
    case "stacking_armor_reduce":
      return {
        label: "ARMOR STACK",
        text: `-${e.perHit}/hit max ${e.maxStacks}`,
        tone: "debuff",
      };
    case "armor_decay_aura":
      return {
        label: "ARMOR DECAY",
        text: `-${e.armorPerSec}/s r=${e.radius.toFixed(1)}`,
        tone: "debuff",
      };
    case "stun_poison":
      return {
        label: "VENOM",
        text: `${Math.round(e.dps)}/s ${e.duration}s`,
        tone: "debuff",
      };
    case "death_spread":
      return { label: "PLAGUE", text: `→${e.count} on death`, tone: "debuff" };
    case "armor_pierce_burn":
      return { label: "PIERCE", text: "ignores armor", tone: "debuff" };
    case "linger_burn":
      return { label: "LINGER", text: `burn ${e.duration}s`, tone: "debuff" };
    case "trap_dot":
      return {
        label: "DAMAGE",
        text: `${Math.round(e.dps)}/s ${e.duration}s`,
        tone: "debuff",
      };
    case "prox_burn":
      return {
        label: "BURN",
        text: `${Math.round(e.dps)}/s r=${e.radius.toFixed(1)}`,
        tone: "debuff",
      };
    case "prox_burn_ramp":
      return {
        label: "BURN",
        text: `${Math.round(e.dps)}/s +${Math.round(e.rampPct * 100)}%/s`,
        tone: "debuff",
      };
  }
}

interface ResolvedStats {
  dmgMin: number;
  dmgMax: number;
  range: number;
  atkSpeed: number;
  effects: ReturnType<typeof gemStats>["effects"];
  targeting: "all" | "ground" | "air";
}

function effectiveStatsFor(t: TowerState): ResolvedStats {
  const lvl = towerLevel(t);
  const mult = 1 + (0.05 * lvl) / (1 + 0.03 * lvl);
  if (t.comboKey) {
    const combo = COMBO_BY_NAME.get(t.comboKey);
    if (combo) {
      const s = comboStatsAtTier(combo, t.upgradeTier ?? 0);
      return {
        dmgMin: Math.round(s.dmgMin * mult),
        dmgMax: Math.round(s.dmgMax * mult),
        range: s.range,
        atkSpeed: Math.round(s.atkSpeed * mult * 100) / 100,
        effects: s.effects,
        targeting: s.targeting,
      };
    }
  }
  const s = gemStats(t.gem, t.quality);
  if (lvl === 0) return s;
  return {
    dmgMin: Math.round(s.dmgMin * mult),
    dmgMax: Math.round(s.dmgMax * mult),
    range: s.range,
    atkSpeed: +(s.atkSpeed * mult).toFixed(2),
    effects: s.effects,
    targeting: s.targeting,
  };
}

function getUpgradeCost(tower: TowerState): number | null {
  if (!tower.comboKey) return null;
  const combo = COMBO_BY_NAME.get(tower.comboKey);
  if (!combo) return null;
  const upgrade = nextUpgrade(combo, tower.upgradeTier ?? 0);
  return upgrade?.cost ?? null;
}

function getUpgradeInfo(
  tower: TowerState,
): { name: string; cost: number } | null {
  if (!tower.comboKey) return null;
  const combo = COMBO_BY_NAME.get(tower.comboKey);
  if (!combo) return null;
  const upgrade = nextUpgrade(combo, tower.upgradeTier ?? 0);
  if (!upgrade) return null;
  return { name: upgrade.name, cost: upgrade.cost };
}

// Re-export for convenience
export type { GemType, Quality };
