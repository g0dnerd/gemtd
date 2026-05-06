/**
 * Combine modal — pick towers from the board and preview the result.
 *
 * Two flows:
 *   - Quality upgrade: pick 5 same-gem same-quality towers.
 *   - Recipe: pick 2..7 distinct gems (same quality) that match a recipe.
 */

import { Game } from '../game/Game';
import { GEM_PALETTE, GemType, QUALITY_NAMES, Quality } from '../render/theme';
import { htmlGem } from '../render/htmlSprites';
import { COMBOS, findCombo } from '../data/combos';
import { effectSummary, gemStats } from '../data/gems';
import { TowerState } from '../game/State';

export function mountCombineModal(root: HTMLElement, game: Game): () => void {
  if (game.state.phase !== 'build') {
    game.bus.emit('toast', { kind: 'error', text: 'Combine outside of build phase' });
    return () => {};
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const card = document.createElement('div');
  card.className = 'px-panel modal-card';
  backdrop.appendChild(card);

  const head = document.createElement('div');
  head.className = 'modal-head';
  const title = document.createElement('div');
  title.className = 'title px-h';
  title.textContent = '★ COMBINE ★';
  const close = document.createElement('button');
  close.className = 'px-btn';
  close.style.fontSize = '9px';
  close.style.padding = '6px 10px';
  close.textContent = 'X';
  head.append(title, close);
  card.appendChild(head);

  const desc = document.createElement('div');
  desc.className = 'modal-desc';
  desc.innerHTML = 'Level-up: 2 (or 4) same gem+quality from this round → +1 (or +2) quality.<br/>Recipe: exact (gem, quality) tuples — uses any placed tower.';
  card.appendChild(desc);

  const selected: TowerState[] = [];

  const slotsFrame = document.createElement('div');
  slotsFrame.className = 'px-panel-inset combine-equation';
  card.appendChild(slotsFrame);

  const previewFrame = document.createElement('div');
  previewFrame.className = 'stats-grid';
  card.appendChild(previewFrame);

  const pickerLabel = document.createElement('div');
  pickerLabel.className = 'panel-h px-h';
  pickerLabel.style.marginTop = '4px';
  pickerLabel.textContent = 'PICK TOWERS (CLICK TO TOGGLE)';
  card.appendChild(pickerLabel);

  const picker = document.createElement('div');
  picker.style.display = 'grid';
  picker.style.gridTemplateColumns = 'repeat(7, 1fr)';
  picker.style.gap = '4px';
  picker.style.maxHeight = '200px';
  picker.style.overflowY = 'auto';
  card.appendChild(picker);

  const actions = document.createElement('div');
  actions.className = 'cost-actions';
  const cost = document.createElement('div');
  cost.className = 'cost';
  cost.textContent = '— —';
  const buttons = document.createElement('div');
  buttons.className = 'actions';
  const cancel = document.createElement('button');
  cancel.className = 'px-btn';
  cancel.style.fontSize = '9px';
  cancel.textContent = 'CANCEL';
  const confirm = document.createElement('button');
  confirm.className = 'px-btn px-btn-primary';
  confirm.style.fontSize = '9px';
  confirm.textContent = '★ COMBINE';
  confirm.disabled = true;
  buttons.append(cancel, confirm);
  actions.append(cost, buttons);
  card.appendChild(actions);

  function refresh(): void {
    // Slots
    slotsFrame.innerHTML = '';
    if (selected.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'modal-desc';
      placeholder.textContent = 'No towers selected';
      slotsFrame.appendChild(placeholder);
    } else {
      selected.forEach((t, i) => {
        const slot = document.createElement('div');
        slot.className = 'combine-slot';
        const frame = document.createElement('div');
        frame.className = 'px-panel-inset combine-slot-frame';
        frame.appendChild(htmlGem(t.gem, 36, t.quality > 2));
        const label = document.createElement('div');
        label.className = 'combine-slot-label';
        label.textContent = `L${t.quality}`;
        slot.append(frame, label);
        slotsFrame.appendChild(slot);
        if (i < selected.length - 1) {
          const plus = document.createElement('div');
          plus.className = 'combine-arrow';
          plus.style.fontSize = '14px';
          plus.textContent = '+';
          slotsFrame.appendChild(plus);
        }
      });
      // Preview output
      const preview = previewOutput();
      if (preview) {
        const arrow = document.createElement('div');
        arrow.className = 'combine-arrow';
        arrow.style.fontSize = '12px';
        arrow.textContent = '►';
        slotsFrame.appendChild(arrow);
        const out = document.createElement('div');
        out.className = 'combine-slot';
        const outFrame = document.createElement('div');
        outFrame.className = 'px-panel-inset combine-slot-frame';
        outFrame.style.boxShadow = 'inset 2px 2px 0 0 var(--px-border-dark), inset -2px -2px 0 0 var(--px-panel-2), 0 0 0 2px var(--px-accent)';
        outFrame.appendChild(htmlGem(preview.gem, 44, true));
        const lbl = document.createElement('div');
        lbl.className = 'combine-slot-label';
        lbl.style.color = 'var(--px-accent)';
        lbl.textContent = preview.label;
        out.append(outFrame, lbl);
        slotsFrame.appendChild(out);
      }
    }

    // Preview stats
    previewFrame.innerHTML = '';
    if (selected.length > 0) {
      const before = document.createElement('div');
      before.className = 'px-panel-inset';
      const beforeH = document.createElement('div');
      beforeH.className = 'panel-h px-h';
      beforeH.style.color = 'var(--px-ink-dim)';
      beforeH.textContent = 'BEFORE (avg)';
      before.appendChild(beforeH);
      const avg = averageStats(selected);
      const beforeBody = document.createElement('div');
      beforeBody.className = 'stat-line';
      beforeBody.innerHTML = `
        <div>DMG <span class="v">${avg.dmgMin}-${avg.dmgMax}</span></div>
        <div>RNG <span class="v">${avg.range.toFixed(1)}</span></div>
        <div>SPD <span class="v">${avg.atkSpeed.toFixed(2)}/s</span></div>
      `;
      before.appendChild(beforeBody);

      const after = document.createElement('div');
      after.className = 'px-panel-inset after';
      const afterH = document.createElement('div');
      afterH.className = 'panel-h px-h';
      afterH.style.color = 'var(--px-accent)';
      afterH.textContent = 'AFTER';
      after.appendChild(afterH);
      const out = previewOutput();
      const afterBody = document.createElement('div');
      afterBody.className = 'stat-line';
      if (out) {
        afterBody.innerHTML = `
          <div>DMG <span class="v">${out.stats.dmgMin}-${out.stats.dmgMax}</span></div>
          <div>RNG <span class="v">${out.stats.range.toFixed(1)}</span></div>
          <div>SPD <span class="v">${out.stats.atkSpeed.toFixed(2)}/s</span></div>
        `;
      } else {
        afterBody.innerHTML = `<div class="v">No matching combine.</div>`;
      }
      after.appendChild(afterBody);

      previewFrame.append(before, after);
    }

    // Confirm enabled if preview exists
    confirm.disabled = !previewOutput();
    cost.textContent = previewOutput() ? '0g (free)' : '—';
  }

  function previewOutput(): { gem: GemType; quality: Quality; label: string; stats: { dmgMin: number; dmgMax: number; range: number; atkSpeed: number; effects: ReturnType<typeof gemStats>['effects'] } } | null {
    if (selected.length < 2) return null;

    const currentRoundIds = new Set(
      game.state.draws.map((d) => d.placedTowerId).filter((id): id is number => id !== null),
    );
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
        stats: s,
      };
    }

    const inputs = selected.map((t) => ({ gem: t.gem, quality: t.quality }));
    const combo = findCombo(inputs);
    if (combo) {
      const outputQ = (Math.max(...selected.map((t) => t.quality))) as Quality;
      return {
        gem: combo.visualGem,
        quality: outputQ,
        label: combo.name.toUpperCase(),
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
    // All non-combo towers are eligible (recipe path takes any; level-up
    // requires current-round, validated server-side).
    const towers = game.state.towers.filter((t) => !t.comboKey);
    for (const t of towers) {
      const isCurrent = drawTowerIds.has(t.id);
      const cell = document.createElement('button');
      cell.className = 'px-panel-inset stash-cell';
      cell.style.cursor = 'pointer';
      cell.style.position = 'relative';
      cell.style.padding = '6px';
      cell.style.background = selected.includes(t) ? 'var(--px-panel-2)' : 'var(--px-bg)';
      cell.appendChild(htmlGem(t.gem, 24, t.quality > 2));
      const lvl = document.createElement('div');
      lvl.className = 'lvl';
      lvl.textContent = `L${t.quality}`;
      cell.appendChild(lvl);
      const tag = document.createElement('div');
      tag.style.position = 'absolute';
      tag.style.top = '2px';
      tag.style.left = '2px';
      tag.style.fontSize = '6px';
      tag.style.padding = '0 2px';
      tag.style.color = isCurrent ? '#58c850' : 'var(--px-ink-dim)';
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
void QUALITY_NAMES;
void effectSummary;
