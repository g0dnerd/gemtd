/**
 * Combine modal — pick towers from the board and preview the result.
 *
 * Two tabs:
 *   - LEVEL UP: 2 or 4 same gem+quality towers from the current round → +1/+2 quality.
 *   - RECIPE: exact (gem, quality) tuple, can use any placed (non-combo) tower.
 */

import { Game } from '../game/Game';
import { GEM_PALETTE, GemType, QUALITY_NAMES, Quality } from '../render/theme';
import { htmlCoin, htmlGemTier, htmlSpecial } from '../render/htmlSprites';
import { COMBOS, findCombo } from '../data/combos';
import { effectSummary, gemStats } from '../data/gems';
import { TowerState } from '../game/State';

type Tab = 'level' | 'recipe';

export function mountCombineModal(root: HTMLElement, game: Game, initialTab?: Tab): () => void {
  if (game.state.phase !== 'build' && initialTab === 'level') {
    game.bus.emit('toast', { kind: 'error', text: 'Level-up only during build phase' });
    return () => {};
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const card = document.createElement('div');
  card.className = 'px-panel modal-card';
  backdrop.appendChild(card);

  let activeTab: Tab = initialTab ?? 'recipe';
  const selected: TowerState[] = [];

  // Header
  const head = document.createElement('div');
  head.className = 'modal-head';
  const headTitle = document.createElement('div');
  headTitle.className = 'modal-head-title';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = '★';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = 'COMBINE';
  headTitle.append(badge, title);
  const close = document.createElement('button');
  close.className = 'px-btn';
  close.style.fontSize = '9px';
  close.style.padding = '8px 12px';
  close.textContent = '✕ CLOSE · ESC';
  head.append(headTitle, close);
  card.appendChild(head);

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'combine-tabs';
  const tabDefs: { id: Tab; label: string; sub: string }[] = [
    { id: 'level', label: 'LEVEL UP', sub: '2 OR 4 SAME GEM·QUALITY' },
    { id: 'recipe', label: 'RECIPE', sub: 'EXACT GEM·QUALITY TUPLE' },
  ];
  const tabBtns = new Map<Tab, HTMLButtonElement>();
  for (const t of tabDefs) {
    const b = document.createElement('button');
    b.className = 'combine-tab';
    const lbl = document.createElement('div');
    lbl.className = 'combine-tab-title';
    lbl.textContent = t.label;
    const sub = document.createElement('div');
    sub.className = 'combine-tab-sub';
    sub.textContent = t.sub;
    b.append(lbl, sub);
    b.addEventListener('click', () => {
      activeTab = t.id;
      // Clear selection when changing tabs since eligibility differs.
      selected.length = 0;
      renderTabs();
      refreshPicker();
      refresh();
    });
    tabs.appendChild(b);
    tabBtns.set(t.id, b);
  }
  card.appendChild(tabs);

  function renderTabs(): void {
    for (const [id, btn] of tabBtns) {
      btn.classList.toggle('active', id === activeTab);
    }
  }
  renderTabs();

  // Equation panel
  const equation = document.createElement('div');
  equation.className = 'px-panel-inset combine-equation';
  card.appendChild(equation);

  // Stat diff grid
  const diffGrid = document.createElement('div');
  diffGrid.className = 'combine-stats-diff';
  card.appendChild(diffGrid);

  // Picker
  const pickerWrap = document.createElement('div');
  const pickerHead = document.createElement('div');
  pickerHead.className = 'combine-picker-head';
  const pickerTitle = document.createElement('div');
  pickerTitle.className = 'panel-h px-h';
  pickerTitle.textContent = 'PICK TOWERS';
  const pickerStatus = document.createElement('div');
  pickerStatus.className = 'combine-picker-status';
  pickerHead.append(pickerTitle, pickerStatus);
  pickerWrap.appendChild(pickerHead);
  const picker = document.createElement('div');
  picker.className = 'combine-picker';
  pickerWrap.appendChild(picker);
  card.appendChild(pickerWrap);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'combine-footer';
  const cost = document.createElement('div');
  cost.className = 'combine-cost';
  cost.appendChild(htmlCoin(16));
  const costLabel = document.createElement('span');
  costLabel.className = 'combine-cost-free';
  costLabel.textContent = 'FREE';
  const costNote = document.createElement('span');
  costNote.className = 'combine-cost-note';
  costNote.textContent = '· no gold cost';
  cost.append(costLabel, costNote);
  const buttons = document.createElement('div');
  buttons.className = 'combine-actions';
  const cancel = document.createElement('button');
  cancel.className = 'px-btn';
  cancel.style.fontSize = '10px';
  cancel.textContent = 'CANCEL';
  const confirm = document.createElement('button');
  confirm.className = 'px-btn px-btn-primary';
  confirm.style.fontSize = '10px';
  confirm.textContent = '★ COMBINE';
  confirm.disabled = true;
  buttons.append(cancel, confirm);
  footer.append(cost, buttons);
  card.appendChild(footer);

  function refresh(): void {
    // Equation panel
    equation.innerHTML = '';
    if (selected.length === 0) {
      const ph = document.createElement('div');
      ph.className = 'modal-desc';
      ph.textContent = activeTab === 'level'
        ? 'Pick 2 or 4 towers of the same gem & quality from this round.'
        : 'Pick towers matching a recipe (exact gem·quality combo).';
      equation.appendChild(ph);
    } else {
      selected.forEach((t, i) => {
        const slot = document.createElement('div');
        slot.className = 'combine-slot';
        const frame = document.createElement('div');
        frame.className = 'combine-slot-frame in';
        frame.appendChild(
          t.comboKey
            ? htmlSpecial(t.comboKey, 44, true)
            : htmlGemTier(t.gem, t.quality, 44, true),
        );
        slot.appendChild(frame);
        const n = document.createElement('div');
        n.className = 'combine-slot-name';
        n.textContent = GEM_PALETTE[t.gem].name.toUpperCase();
        const q = document.createElement('div');
        q.className = 'combine-slot-q';
        q.textContent = `L${t.quality} · ${QUALITY_NAMES[t.quality].toUpperCase()}`;
        slot.append(n, q);
        equation.appendChild(slot);
        if (i < selected.length - 1) {
          const plus = document.createElement('div');
          plus.className = 'combine-plus';
          plus.textContent = '+';
          equation.appendChild(plus);
        }
      });

      const preview = previewOutput();
      if (preview) {
        const arrowCol = document.createElement('div');
        arrowCol.className = 'combine-arrow-col';
        const arrow = document.createElement('div');
        arrow.className = 'combine-arrow';
        arrow.textContent = '►';
        arrowCol.appendChild(arrow);
        equation.appendChild(arrowCol);

        const out = document.createElement('div');
        out.className = 'combine-slot';
        const frame = document.createElement('div');
        frame.className = 'combine-slot-frame out';
        frame.appendChild(
          preview.comboKey
            ? htmlSpecial(preview.comboKey, 56, true)
            : htmlGemTier(preview.gem, preview.quality, 56, true),
        );
        out.appendChild(frame);
        const n = document.createElement('div');
        n.className = 'combine-slot-name out';
        n.textContent = preview.label;
        out.appendChild(n);
        if (preview.blurb) {
          const blurb = document.createElement('div');
          blurb.className = 'combine-slot-blurb';
          blurb.textContent = preview.blurb;
          out.appendChild(blurb);
        }
        equation.appendChild(out);
      }
    }

    // Stat diff grid
    diffGrid.innerHTML = '';
    const out = previewOutput();
    if (selected.length > 0 && out) {
      const before = averageStats(selected);
      const after = out.stats;
      const rows: { lbl: string; before: string; after: string; good: boolean }[] = [
        {
          lbl: 'DAMAGE',
          before: `${before.dmgMin}–${before.dmgMax}`,
          after: `${after.dmgMin}–${after.dmgMax}`,
          good: after.dmgMax > before.dmgMax || after.dmgMin > before.dmgMin,
        },
        {
          lbl: 'RANGE',
          before: before.range.toFixed(1),
          after: after.range.toFixed(1),
          good: after.range > before.range,
        },
        {
          lbl: 'SPEED',
          before: `${before.atkSpeed.toFixed(2)}/s`,
          after: `${after.atkSpeed.toFixed(2)}/s`,
          good: after.atkSpeed > before.atkSpeed,
        },
      ];
      for (const r of rows) {
        const cell = document.createElement('div');
        cell.className = 'px-panel-inset';
        const lbl = document.createElement('div');
        lbl.className = 'combine-diff-label';
        lbl.textContent = r.lbl;
        const row = document.createElement('div');
        row.className = 'combine-diff-row';
        const beforeEl = document.createElement('span');
        beforeEl.className = 'combine-diff-before';
        beforeEl.textContent = r.before;
        const arrowEl = document.createElement('span');
        arrowEl.className = 'combine-diff-arrow' + (r.good ? ' good' : '');
        arrowEl.textContent = '→';
        const afterEl = document.createElement('span');
        afterEl.className = 'combine-diff-after' + (r.good ? ' good' : '');
        afterEl.textContent = r.after;
        row.append(beforeEl, arrowEl, afterEl);
        cell.append(lbl, row);
        diffGrid.appendChild(cell);
      }
    }

    pickerStatus.textContent = `${selected.length} selected · click to toggle`;
    confirm.disabled = !out;
  }

  function previewOutput(): { gem: GemType; quality: Quality; comboKey?: string; label: string; blurb: string; stats: { dmgMin: number; dmgMax: number; range: number; atkSpeed: number; effects: ReturnType<typeof gemStats>['effects'] } } | null {
    if (selected.length < 2) return null;

    const currentRoundIds = new Set(
      game.state.draws.map((d) => d.placedTowerId).filter((id): id is number => id !== null),
    );

    if (activeTab === 'level') {
      const allCurrentRound = selected.every((t) => currentRoundIds.has(t.id));
      const sameGem = selected.every((t) => t.gem === selected[0].gem);
      const sameQuality = selected.every((t) => t.quality === selected[0].quality);
      if (sameGem && sameQuality && (selected.length === 2 || selected.length === 4) && allCurrentRound) {
        const q = selected[0].quality;
        const bump = selected.length === 2 ? 1 : 2;
        const newQ = Math.min(5, q + bump) as Quality;
        if (newQ === q) return null;
        const s = gemStats(selected[0].gem, newQ);
        return {
          gem: selected[0].gem,
          quality: newQ,
          label: `${GEM_PALETTE[selected[0].gem].name.toUpperCase()} L${newQ}`,
          blurb: QUALITY_NAMES[newQ],
          stats: s,
        };
      }
      return null;
    }

    const inputs = selected.map((t) => ({ gem: t.gem, quality: t.quality }));
    const combo = findCombo(inputs);
    if (combo) {
      if (game.state.phase === 'build') {
        const currentCount = selected.filter((t) => currentRoundIds.has(t.id)).length;
        if (currentCount > 1 && currentCount < selected.length) return null;
      }
      const outputQ = (Math.max(...selected.map((t) => t.quality))) as Quality;
      return {
        gem: combo.visualGem,
        quality: outputQ,
        comboKey: combo.key,
        label: combo.name.toUpperCase(),
        blurb: combo.stats.blurb,
        stats: {
          dmgMin: combo.stats.dmgMin,
          dmgMax: combo.stats.dmgMax,
          range: combo.stats.range,
          atkSpeed: combo.stats.atkSpeed,
          effects: combo.stats.effects,
        },
      };
    }
    return null;
  }

  function refreshPicker(): void {
    picker.innerHTML = '';
    const drawTowerIds = new Set(
      game.state.draws.map((d) => d.placedTowerId).filter((id): id is number => id !== null),
    );

    let towers = game.state.towers.filter((t) => !t.comboKey);
    if (activeTab === 'level') {
      // Only this-round towers are eligible for level-up.
      towers = towers.filter((t) => drawTowerIds.has(t.id));
    }

    for (const t of towers) {
      const isCurrent = drawTowerIds.has(t.id);
      const cell = document.createElement('button');
      cell.className = 'px-panel-inset combine-pick-cell';
      if (selected.includes(t)) cell.classList.add('selected');
      cell.appendChild(htmlGemTier(t.gem, t.quality, 26, t.quality > 2));
      const q = document.createElement('div');
      q.className = 'pick-q';
      q.textContent = `L${t.quality}`;
      cell.appendChild(q);
      const tag = document.createElement('div');
      tag.className = 'pick-tag' + (isCurrent ? '' : ' kept');
      tag.textContent = isCurrent ? 'NEW' : 'KEPT';
      cell.appendChild(tag);
      cell.addEventListener('click', () => {
        const i = selected.indexOf(t);
        if (i >= 0) selected.splice(i, 1);
        else selected.push(t);
        refreshPicker();
        refresh();
      });
      picker.appendChild(cell);
    }
  }

  function close_() {
    backdrop.remove();
    window.removeEventListener('keydown', onKey);
  }

  cancel.addEventListener('click', close_);
  close.addEventListener('click', close_);
  confirm.addEventListener('click', () => {
    const ok = game.cmdCombine(selected.map((t) => t.id));
    if (ok) close_();
  });
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) close_();
  });
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close_();
    }
  };
  window.addEventListener('keydown', onKey);

  root.appendChild(backdrop);
  refreshPicker();
  refresh();

  return close_;
}

function averageStats(towers: TowerState[]): { dmgMin: number; dmgMax: number; range: number; atkSpeed: number } {
  let dmgMin = 0, dmgMax = 0, range = 0, atk = 0;
  for (const t of towers) {
    const s = gemStats(t.gem, t.quality);
    dmgMin += s.dmgMin;
    dmgMax += s.dmgMax;
    range += s.range;
    atk += s.atkSpeed;
  }
  const n = towers.length;
  return {
    dmgMin: Math.round(dmgMin / n),
    dmgMax: Math.round(dmgMax / n),
    range: range / n,
    atkSpeed: atk / n,
  };
}

// silence unused-import warnings on COMBOS in some bundler configs:
void COMBOS;
void effectSummary;
