/**
 * Selected-tower / creep / rock inspector. Shows stats, range circle (for towers),
 * effect summary, and action buttons.
 */

import { Game } from "../game/Game";
import { GEM_PALETTE, GemType, Quality, QUALITY_NAMES } from "../render/theme";
import { htmlGemTier, htmlSpecial, htmlCreep } from "../render/htmlSprites";
import { effectSummary, gemStats } from "../data/gems";
import {
  COMBOS,
  COMBO_BY_NAME,
  ComboRecipe,
  comboStatsAtTier,
  findAllCombosFor,
  nextUpgrade,
} from "../data/combos";
import { CreepState, TowerState } from "../game/State";
import { towerLevel } from "../systems/Combat";
import { SIM_HZ } from "../game/constants";

export interface InspectorRefs {
  root: HTMLElement;
  body: HTMLDivElement;
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
  title.textContent = "SELECTED · TOWER";
  head.appendChild(title);
  root.appendChild(head);

  const body = document.createElement("div");
  body.className = "inspector-body";
  root.appendChild(body);

  const refs: InspectorRefs = {
    root,
    body,
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
      "creep", c.id, c.kind, c.hp, c.maxHp, c.speed, c.bounty,
      c.slow ? `s${c.slow.factor}` : "",
      c.poison ? `p${c.poison.dps}` : "",
      c.stun ? "stun" : "",
      c.armorDebuff ? `ad${c.armorDebuff.value}` : "",
      c.healBuff ? "hb" : "",
      c.burrowed ? "bur" : "",
      c.flags?.boss ? "B" : "", c.flags?.armored ? "A" : "", c.flags?.air ? "F" : "",
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
  if (!tower) return `none|${game.state.phase}`;
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
      renderCreep(body, creep, game);
      return;
    }
  }

  if (game.selectedRockId !== null) {
    renderRock(body, game, game.selectedRockId);
    return;
  }

  const id = game.selectedTowerId;
  const tower =
    id !== null ? (game.state.towers.find((t) => t.id === id) ?? null) : null;
  if (!tower) {
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    empty.textContent = "Click a tower or rock to inspect.";
    body.appendChild(empty);
    return;
  }

  const stats = effectiveStatsFor(tower);

  // Hero row
  const hero = document.createElement("div");
  hero.className = "px-panel-inset inspector-hero";
  const frame = document.createElement("div");
  frame.className = "inspector-hero-frame";
  frame.appendChild(
    tower.comboKey
      ? htmlSpecial(tower.comboKey, 28, true, tower.upgradeTier ?? 0)
      : htmlGemTier(tower.gem, tower.quality as Quality, 28, true),
  );
  const text = document.createElement("div");
  text.className = "inspector-hero-text";
  const name = document.createElement("div");
  name.className = "inspector-hero-name";
  const sub = document.createElement("span");
  sub.className = "inspector-hero-sub";
  if (tower.comboKey) {
    const combo = COMBO_BY_NAME.get(tower.comboKey!);
    const tier = tower.upgradeTier ?? 0;
    const tierName =
      combo && tier > 0 && combo.upgrades[tier - 1]
        ? combo.upgrades[tier - 1].name
        : combo?.name;
    name.textContent = (tierName ?? "COMBO").toUpperCase();
    const blurb =
      (combo ? comboStatsAtTier(combo, tier) : null)?.blurb ??
      combo?.stats.blurb ??
      "COMBO";
    sub.textContent = blurb;
  } else {
    name.textContent = GEM_PALETTE[tower.gem].name.toUpperCase();
    sub.textContent = QUALITY_NAMES[tower.quality].toUpperCase();
  }
  text.append(name, sub);
  hero.append(frame, text);
  body.appendChild(hero);

  // Kill level chip
  const lvl = towerLevel(tower);
  const killChip = document.createElement("div");
  killChip.className = "inspector-effect";
  const killLbl = document.createElement("div");
  killLbl.className = "inspector-effect-label";
  killLbl.textContent = "KILLS · LEVEL";
  const killTxt = document.createElement("div");
  killTxt.className = "inspector-effect-text";
  killTxt.textContent =
    lvl > 0
      ? `${tower.kills} kills · LV ${lvl} (+${lvl * 5}%)`
      : `${tower.kills} / 10 kills to next level`;
  killChip.append(killLbl, killTxt);
  body.appendChild(killChip);

  // Stats grid
  const grid = document.createElement("div");
  grid.className = "inspector-stats-grid";

  const dmg = document.createElement("div");
  dmg.className = "px-panel-inset inspector-stat inspector-stat-dmg";
  const dmgLabel = document.createElement("div");
  dmgLabel.className = "inspector-stat-label";
  dmgLabel.textContent = "DAMAGE";
  const dmgVal = document.createElement("div");
  dmgVal.className = "inspector-stat-value inspector-stat-value-hero";
  dmgVal.textContent = `${stats.dmgMin} – ${stats.dmgMax}`;
  dmg.append(dmgLabel, dmgVal);
  grid.appendChild(dmg);

  const rng = document.createElement("div");
  rng.className = "px-panel-inset inspector-stat";
  const rngLabel = document.createElement("div");
  rngLabel.className = "inspector-stat-label-sm";
  rngLabel.textContent = "RANGE";
  const rngVal = document.createElement("div");
  rngVal.className = "inspector-stat-value inspector-stat-value-sec";
  rngVal.textContent = stats.range.toFixed(1);
  rng.append(rngLabel, rngVal);
  grid.appendChild(rng);

  const spd = document.createElement("div");
  spd.className = "px-panel-inset inspector-stat";
  const spdLabel = document.createElement("div");
  spdLabel.className = "inspector-stat-label-sm";
  spdLabel.textContent = "SPEED";
  const spdVal = document.createElement("div");
  spdVal.className = "inspector-stat-value inspector-stat-value-sec";
  spdVal.innerHTML = `${stats.atkSpeed.toFixed(2)}<small>/s</small>`;
  spd.append(spdLabel, spdVal);
  grid.appendChild(spd);

  body.appendChild(grid);

  // Targeting chip
  if (stats.targeting !== "all") {
    const tChip = document.createElement("div");
    tChip.className = "inspector-effect";
    const tLbl = document.createElement("div");
    tLbl.className = "inspector-effect-label";
    tLbl.textContent = "TARGET";
    const tTxt = document.createElement("div");
    tTxt.className = "inspector-effect-text";
    tTxt.textContent = stats.targeting === "air" ? "AIR ONLY" : "GROUND ONLY";
    tChip.append(tLbl, tTxt);
    body.appendChild(tChip);
  }

  // Effect chip
  if (stats.effects.length > 0 && stats.effects[0].kind !== "none") {
    const chip = document.createElement("div");
    chip.className = "inspector-effect";
    const lbl = document.createElement("div");
    lbl.className = "inspector-effect-label";
    lbl.textContent = `ON HIT · ${stats.effects[0].kind.toUpperCase()}`;
    const txt = document.createElement("div");
    txt.className = "inspector-effect-text";
    txt.textContent = stats.effects
      .map(effectSummary)
      .filter(Boolean)
      .join(" · ");
    chip.append(lbl, txt);
    body.appendChild(chip);
  }

  // Forges-into chips
  if (!tower.comboKey) {
    const recipes = findAllCombosFor(tower.gem, tower.quality as Quality);
    for (const recipe of recipes) {
      const chip = document.createElement("div");
      chip.className = "inspector-combo";
      const cFrame = document.createElement("div");
      cFrame.className = "inspector-combo-frame";
      cFrame.appendChild(htmlSpecial(recipe.key, 22));
      const cText = document.createElement("div");
      cText.className = "inspector-combo-text";
      const cLabel = document.createElement("div");
      cLabel.className = "inspector-combo-label";
      cLabel.textContent = "FORGES INTO";
      const cName = document.createElement("div");
      cName.className = "inspector-combo-name";
      cName.textContent = recipe.name.toUpperCase();
      cText.append(cLabel, cName);
      const cArrow = document.createElement("div");
      cArrow.className = "inspector-combo-arrow";
      cArrow.textContent = "›";
      chip.append(cFrame, cText, cArrow);
      chip.addEventListener("click", () => {
        game.bus.emit("focusRecipe", { key: recipe.key });
      });
      body.appendChild(chip);
    }
  }

  // Actions
  const actions = document.createElement("div");
  actions.className = "inspector-actions";

  const isCurrentDraw = game.state.draws.some(
    (d) => d.placedTowerId === tower.id,
  );
  const isKeep = game.state.designatedKeepTowerId === tower.id;
  const inBuild = game.state.phase === "build";

  if (isCurrentDraw) {
    const keep = document.createElement("button");
    keep.className = "px-btn px-btn-good inspector-action-keep";
    keep.textContent = isKeep ? "★ KEEPING" : "★ KEEP";
    keep.disabled = !inBuild || isKeep;
    keep.addEventListener("click", () => game.cmdDesignateKeep(tower.id));
    actions.append(keep);
  }

  if (!tower.comboKey) {
    const dg = document.createElement("button");
    dg.className = "px-btn px-btn-bad";
    const canDowngrade =
      isCurrentDraw &&
      tower.quality > 1 &&
      !game.state.downgradeUsedThisRound;
    dg.disabled = !canDowngrade;
    dg.textContent = "▼ DOWNGRADE";
    if (tower.quality <= 1) {
      dg.title = "Already lowest tier";
    } else if (game.state.downgradeUsedThisRound) {
      dg.title = "Already downgraded this round";
    } else if (!isCurrentDraw) {
      dg.title = "Only current-round gems";
    }
    dg.addEventListener("click", () => game.cmdDowngrade(tower.id));
    actions.append(dg);
  }

  const upgInfo = getUpgradeInfo(tower);
  if (upgInfo) {
    const upgBtn = document.createElement("button");
    upgBtn.className = "px-btn px-btn-good";
    const affordable = game.state.gold >= upgInfo.cost;
    upgBtn.disabled = !affordable;
    upgBtn.textContent = `⬆ UPGRADE · ${upgInfo.cost}G`;
    upgBtn.addEventListener("click", () => game.cmdUpgradeTower(tower.id));
    actions.append(upgBtn);
  }

  const comboRow = document.createElement("div");
  comboRow.className = "inspector-actions-combine";

  const combineCount = countCombinePairs(game, tower);
  const specialCount = countSpecialRecipes(game, tower);

  const combineBtn = document.createElement("button");
  combineBtn.className = "px-btn";
  combineBtn.disabled = !inBuild || !!tower.comboKey;
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
    if (selIsCurrent && matchRecipeWithMust(c, currentOnly, sel)) { n++; continue; }
    if (!selIsCurrent && matchRecipeWithMust(c, keptOnly, sel)) { n++; continue; }
    if (selIsCurrent) {
      if (matchRecipeWithMust(c, [sel, ...keptOnly], sel)) { n++; continue; }
    } else {
      const pool = [...keptOnly, ...currentOnly];
      const result = matchRecipeWithMust(c, pool, sel);
      if (result) {
        const currentCount = result.filter((id) => drawIds.has(id)).length;
        if (currentCount <= 1) { n++; continue; }
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
      if (ids) { game.cmdCombine(ids); return; }
    }
    game.bus.emit("toast", { kind: "error", text: "No recipe uses the selected gem yet" });
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
      if (ids1) { game.cmdCombine(ids1); return; }
    }
    if (!selIsCurrent) {
      const ids2 = matchRecipeWithMust(c, keptOnly, sel);
      if (ids2) { game.cmdCombine(ids2); return; }
    }
    if (selIsCurrent) {
      const ids3 = matchRecipeWithMust(c, [sel, ...keptOnly], sel);
      if (ids3) { game.cmdCombine(ids3); return; }
    } else {
      const result = matchRecipeWithMust(c, [...keptOnly, ...currentOnly], sel);
      if (result) {
        const currentCount = result.filter((id) => drawIds.has(id)).length;
        if (currentCount <= 1) { game.cmdCombine(result); return; }
      }
    }
  }
  game.bus.emit("toast", { kind: "error", text: "No recipe uses the selected gem yet" });
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
  normal: "CREEP", fast: "SWIFT", armored: "ARMORED",
  air: "FLYER", boss: "BOSS", healer: "HEALER",
  wizard: "WIZARD", tunneler: "TUNNELER",
};

const ABILITY_DESC: Record<string, string> = {
  healer: "Heals nearby allies over time",
  wizard: "Teleports allies forward",
  tunneler: "Burrows underground, becoming untargetable",
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

  // HP bar
  const hpRow = document.createElement("div");
  hpRow.className = "inspector-creep-hp";
  const hpLabel = document.createElement("div");
  hpLabel.className = "inspector-effect-label";
  hpLabel.textContent = "HIT POINTS";
  const hpNums = document.createElement("div");
  hpNums.className = "inspector-creep-hp-nums";
  const pct = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
  hpNums.textContent = `${Math.ceil(c.hp)} / ${c.maxHp}  (${pct.toFixed(0)}%)`;
  const hpTrack = document.createElement("div");
  hpTrack.className = "inspector-creep-hp-track";
  const hpFill = document.createElement("div");
  hpFill.className = "inspector-creep-hp-fill";
  hpFill.style.width = `${pct}%`;
  if (pct < 25) hpFill.classList.add("hp-crit");
  else if (pct < 50) hpFill.classList.add("hp-warn");
  hpTrack.appendChild(hpFill);
  hpRow.append(hpLabel, hpNums, hpTrack);
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
    const effective = c.armor - c.armorReduction
      - (c.armorDebuff && c.armorDebuff.expiresAt > game.state.tick ? c.armorDebuff.value : 0);
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
  const effects: Array<{ label: string; text: string; kind: "debuff" | "cc" | "buff" }> = [];
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
  const mult = 1 + lvl * 0.05;
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
