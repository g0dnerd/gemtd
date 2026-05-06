/**
 * Selected-tower inspector. Shows stats, range circle (rendered in PIXI),
 * effect summary, and KEEP / COMBINE buttons.
 */

import { Game } from '../game/Game';
import { GEM_PALETTE, GemType, Quality, QUALITY_NAMES } from '../render/theme';
import { htmlGem } from '../render/htmlSprites';
import { effectSummary, gemStats } from '../data/gems';
import { COMBOS } from '../data/combos';
import { TowerState } from '../game/State';

export interface InspectorRefs {
  root: HTMLElement;
  body: HTMLDivElement;
  refresh: (g: Game) => void;
  lastFingerprint: string;
}

export function mountInspector(game: Game): InspectorRefs {
  const root = document.createElement('div');
  root.className = 'px-panel inspector';
  const head = document.createElement('div');
  head.className = 'panel-head';
  const title = document.createElement('div');
  title.className = 'panel-h px-h';
  title.textContent = 'SELECTED · TOWER';
  head.appendChild(title);
  root.appendChild(head);

  const body = document.createElement('div');
  body.className = 'inspector-body';
  root.appendChild(body);

  const refs: InspectorRefs = {
    root,
    body,
    refresh: (g: Game) => render(refs, g),
    lastFingerprint: '',
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
  const id = game.selectedTowerId;
  const tower = id !== null ? game.state.towers.find((t) => t.id === id) ?? null : null;
  if (!tower) return `none|${game.state.phase}`;
  const isCurrentDraw = game.state.draws.some((d) => d.placedTowerId === tower.id);
  const sameColor = isCurrentDraw
    ? 0
    : game.state.towers.filter(
        (t) => t.gem === tower.gem && t.quality === tower.quality && !game.state.draws.some((d) => d.placedTowerId === t.id),
      ).length;
  return [
    tower.id,
    tower.gem,
    tower.quality,
    tower.comboKey ?? '',
    game.state.phase,
    game.state.designatedKeepTowerId ?? '',
    isCurrentDraw ? 1 : 0,
    sameColor,
  ].join('|');
}

function render(refs: InspectorRefs, game: Game): void {
  const fp = fingerprint(game);
  if (fp === refs.lastFingerprint) return;
  refs.lastFingerprint = fp;
  const body = refs.body;
  body.innerHTML = '';
  const id = game.selectedTowerId;
  const tower = id !== null ? game.state.towers.find((t) => t.id === id) ?? null : null;
  if (!tower) {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.textContent = 'Click a tower to inspect.';
    body.appendChild(empty);
    return;
  }

  const stats = effectiveStatsFor(tower);

  // Hero row
  const hero = document.createElement('div');
  hero.className = 'px-panel-inset inspector-hero';
  const frame = document.createElement('div');
  frame.className = 'inspector-hero-frame';
  frame.appendChild(htmlGem(tower.gem, 40, true));
  const text = document.createElement('div');
  text.className = 'inspector-hero-text';
  const name = document.createElement('div');
  name.className = 'inspector-hero-name';
  const sub = document.createElement('div');
  sub.className = 'inspector-hero-sub';
  if (tower.comboKey) {
    const combo = COMBOS.find((c) => c.key === tower.comboKey);
    name.textContent = combo ? combo.name.toUpperCase() : 'COMBO';
    sub.textContent = `LV. ${tower.quality} · ${combo?.stats.blurb ?? 'COMBO'}`;
  } else {
    name.textContent = GEM_PALETTE[tower.gem].name.toUpperCase();
    sub.textContent = `LV. ${tower.quality} · ${QUALITY_NAMES[tower.quality].toUpperCase()}`;
  }
  text.append(name, sub);
  hero.append(frame, text);
  body.appendChild(hero);

  // Stats grid
  const grid = document.createElement('div');
  grid.className = 'inspector-stats-grid';

  const dmg = document.createElement('div');
  dmg.className = 'px-panel-inset inspector-stat inspector-stat-dmg';
  const dmgLabel = document.createElement('div');
  dmgLabel.className = 'inspector-stat-label';
  dmgLabel.textContent = 'DAMAGE';
  const dmgVal = document.createElement('div');
  dmgVal.className = 'inspector-stat-value inspector-stat-value-hero';
  dmgVal.textContent = `${stats.dmgMin} – ${stats.dmgMax}`;
  dmg.append(dmgLabel, dmgVal);
  grid.appendChild(dmg);

  const rng = document.createElement('div');
  rng.className = 'px-panel-inset inspector-stat';
  const rngLabel = document.createElement('div');
  rngLabel.className = 'inspector-stat-label-sm';
  rngLabel.textContent = 'RANGE';
  const rngVal = document.createElement('div');
  rngVal.className = 'inspector-stat-value inspector-stat-value-sec';
  rngVal.textContent = stats.range.toFixed(1);
  rng.append(rngLabel, rngVal);
  grid.appendChild(rng);

  const spd = document.createElement('div');
  spd.className = 'px-panel-inset inspector-stat';
  const spdLabel = document.createElement('div');
  spdLabel.className = 'inspector-stat-label-sm';
  spdLabel.textContent = 'SPEED';
  const spdVal = document.createElement('div');
  spdVal.className = 'inspector-stat-value inspector-stat-value-sec';
  spdVal.innerHTML = `${stats.atkSpeed.toFixed(2)}<small>/s</small>`;
  spd.append(spdLabel, spdVal);
  grid.appendChild(spd);

  body.appendChild(grid);

  // Effect chip
  if (stats.effects.length > 0 && stats.effects[0].kind !== 'none') {
    const chip = document.createElement('div');
    chip.className = 'inspector-effect';
    const lbl = document.createElement('div');
    lbl.className = 'inspector-effect-label';
    lbl.textContent = `ON HIT · ${stats.effects[0].kind.toUpperCase()}`;
    const txt = document.createElement('div');
    txt.className = 'inspector-effect-text';
    txt.textContent = stats.effects.map(effectSummary).filter(Boolean).join(' · ');
    chip.append(lbl, txt);
    body.appendChild(chip);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'inspector-actions';

  const isCurrentDraw = game.state.draws.some((d) => d.placedTowerId === tower.id);
  const isKeep = game.state.designatedKeepTowerId === tower.id;

  const keep = document.createElement('button');
  keep.className = 'px-btn px-btn-good';
  keep.style.flex = '1';
  if (isCurrentDraw) {
    keep.textContent = isKeep ? '★ KEEPING' : '★ MARK KEEP';
    keep.disabled = game.state.phase !== 'build' || isKeep;
    keep.addEventListener('click', () => game.cmdDesignateKeep(tower.id));
  } else {
    keep.textContent = '★ COMBINE';
    const sameColor = game.state.towers.filter(
      (t) => t.gem === tower.gem && t.quality === tower.quality && !game.state.draws.some((d) => d.placedTowerId === t.id),
    );
    const canCombine = sameColor.length >= 2;
    keep.disabled = game.state.phase !== 'build';
    if (canCombine && game.state.phase === 'build') keep.classList.add('is-active');
    keep.addEventListener('click', () => {
      if (canCombine) {
        game.cmdCombine(sameColor.slice(0, 2).map((t) => t.id));
      } else {
        game.bus.emit('toast', { kind: 'info', text: 'Need 2 same-color, same-quality (this round).' });
      }
    });
  }
  actions.append(keep);
  body.appendChild(actions);
}

interface ResolvedStats {
  dmgMin: number;
  dmgMax: number;
  range: number;
  atkSpeed: number;
  effects: ReturnType<typeof gemStats>['effects'];
}

function effectiveStatsFor(t: TowerState): ResolvedStats {
  if (t.comboKey) {
    const combo = COMBOS.find((c) => c.key === t.comboKey);
    if (combo) {
      return {
        dmgMin: combo.stats.dmgMin,
        dmgMax: combo.stats.dmgMax,
        range: combo.stats.range,
        atkSpeed: combo.stats.atkSpeed,
        effects: combo.stats.effects,
      };
    }
  }
  const s = gemStats(t.gem, t.quality);
  return s;
}

// Re-export for convenience
export type { GemType, Quality };
