/**
 * Selected-tower inspector. Shows stats, range circle (rendered in PIXI),
 * effect summary, and SELL / COMBINE buttons.
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
}

export function mountInspector(game: Game): InspectorRefs {
  const root = document.createElement('div');
  root.className = 'px-panel inspector';
  const head = document.createElement('div');
  head.className = 'panel-h px-h';
  head.textContent = 'SELECTED';
  root.appendChild(head);

  const body = document.createElement('div');
  root.appendChild(body);

  const refs: InspectorRefs = {
    root,
    body,
    refresh: (g: Game) => render(refs, g),
  };

  render(refs, game);
  return refs;
}

export function refreshInspector(refs: InspectorRefs, game: Game): void {
  refs.refresh(game);
}

function render(refs: InspectorRefs, game: Game): void {
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

  const headRow = document.createElement('div');
  headRow.className = 'inspector-head';
  headRow.appendChild(htmlGem(tower.gem, 28, tower.quality > 2));
  const title = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'name';
  const quality = document.createElement('div');
  quality.className = 'sub';
  if (tower.comboKey) {
    const combo = COMBOS.find((c) => c.key === tower.comboKey);
    name.textContent = combo ? combo.name.toUpperCase() : 'COMBO';
    quality.textContent = `Lv.${tower.quality} · ${combo?.stats.blurb ?? ''}`;
  } else {
    name.textContent = GEM_PALETTE[tower.gem].name.toUpperCase();
    quality.textContent = `Lv.${tower.quality} · ${QUALITY_NAMES[tower.quality]}`;
  }
  title.append(name, quality);
  headRow.appendChild(title);
  body.appendChild(headRow);

  const stats = effectiveStatsFor(tower);
  const sBlock = document.createElement('div');
  sBlock.className = 'inspector-stats';
  sBlock.innerHTML = `
    <div><span class="stat-key">DMG </span><span class="stat-val">${stats.dmgMin}-${stats.dmgMax}</span></div>
    <div><span class="stat-key">RNG </span><span class="stat-val">${stats.range.toFixed(1)}</span></div>
    <div><span class="stat-key">SPD </span><span class="stat-val">${stats.atkSpeed.toFixed(2)}/s</span></div>
  `;
  body.appendChild(sBlock);

  if (stats.effects.length > 0 && stats.effects[0].kind !== 'none') {
    const sp = document.createElement('div');
    sp.className = 'inspector-special';
    sp.textContent = stats.effects.map(effectSummary).filter(Boolean).join(' · ');
    body.appendChild(sp);
  }

  const actions = document.createElement('div');
  actions.className = 'inspector-actions';

  const sell = document.createElement('button');
  sell.className = 'px-btn';
  sell.style.flex = '1';
  sell.style.fontSize = '8px';
  const refundDisplay = tower.comboKey ? '?' : Math.floor(gemStats(tower.gem, tower.quality).cost * 0.75);
  sell.textContent = `SELL (${refundDisplay}g)`;
  sell.disabled = game.state.phase !== 'build';
  sell.addEventListener('click', () => game.cmdSell(tower.id));

  const isCurrentDraw = game.state.draws.some((d) => d.placedTowerId === tower.id);
  const isKeep = game.state.designatedKeepTowerId === tower.id;

  const upgrade = document.createElement('button');
  upgrade.className = 'px-btn px-btn-primary';
  upgrade.style.flex = '1';
  upgrade.style.fontSize = '8px';
  if (isCurrentDraw) {
    upgrade.textContent = isKeep ? '★ KEEPING' : 'MARK KEEP';
    upgrade.disabled = game.state.phase !== 'build' || isKeep;
    upgrade.addEventListener('click', () => game.cmdDesignateKeep(tower.id));
  } else {
    upgrade.textContent = 'COMBINE';
    upgrade.disabled = game.state.phase !== 'build';
    upgrade.addEventListener('click', () => {
      const sameColor = game.state.towers.filter((t) => t.gem === tower.gem && t.quality === tower.quality && !game.state.draws.some((d) => d.placedTowerId === t.id));
      if (sameColor.length >= 2) {
        game.cmdCombine(sameColor.slice(0, 2).map((t) => t.id));
      } else {
        game.bus.emit('toast', { kind: 'info', text: 'Need 2 same-color, same-quality (this round).' });
      }
    });
  }
  actions.append(sell, upgrade);
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
