/**
 * End-of-run overlay (victory / defeat).
 */

import { Game } from '../game/Game';
import { COMBO_BY_NAME } from '../data/combos';
import { gemStats } from '../data/gems';
import type { TowerState } from '../game/State';

function towerDisplayName(t: TowerState): string {
  if (t.comboKey) {
    const combo = COMBO_BY_NAME.get(t.comboKey);
    if (combo) {
      if (t.upgradeTier && t.upgradeTier > 0 && combo.upgrades[t.upgradeTier - 1]) {
        return combo.upgrades[t.upgradeTier - 1].name;
      }
      return combo.name;
    }
  }
  const stats = gemStats(t.gem, t.quality);
  return `${stats.qualityName} ${stats.name}`;
}

export function mountGameOver(
  root: HTMLElement,
  game: Game,
  phase: 'gameover' | 'victory',
  onTitle: () => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'game-over';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = phase === 'victory' ? 'VICTORY' : 'GAME OVER';
  const sub = document.createElement('div');
  sub.className = 'subtitle';
  sub.textContent = phase === 'victory'
    ? `Cleared all ${game.state.totalWaves} waves with ${game.state.lives} lives left.`
    : `You held until wave ${game.state.wave}. ${game.state.totalKills} kills.`;

  const table = buildLeaderboard(game.state.towers);

  const buttons = document.createElement('div');
  buttons.style.display = 'flex';
  buttons.style.gap = '12px';
  const restart = document.createElement('button');
  restart.className = 'px-btn px-btn-primary';
  restart.textContent = '▶ NEW GAME';
  restart.addEventListener('click', () => {
    overlay.remove();
    game.restartGame();
  });
  const titleBtn = document.createElement('button');
  titleBtn.className = 'px-btn';
  titleBtn.textContent = 'TITLE';
  titleBtn.addEventListener('click', () => {
    overlay.remove();
    onTitle();
  });
  buttons.append(restart, titleBtn);
  overlay.append(title, sub, table, buttons);
  root.appendChild(overlay);
}

function buildLeaderboard(towers: TowerState[]): HTMLTableElement {
  const sorted = [...towers].sort((a, b) => b.totalDamage - a.totalDamage);
  const top5 = sorted.slice(0, 5);

  const nameCounts = new Map<string, number>();
  for (const t of towers) {
    const name = towerDisplayName(t);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const table = document.createElement('table');
  table.className = 'leaderboard';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const text of ['#', 'Tower', 'Damage']) {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let i = 0; i < 5; i++) {
    const tr = document.createElement('tr');
    const tower = top5[i];
    if (tower) {
      const name = towerDisplayName(tower);
      const showCoords = (nameCounts.get(name) ?? 0) > 1;
      const label = showCoords ? `${name} (${tower.x}, ${tower.y})` : name;

      const tdRank = document.createElement('td');
      tdRank.textContent = `${i + 1}`;
      const tdName = document.createElement('td');
      tdName.textContent = label;
      const tdDmg = document.createElement('td');
      tdDmg.className = 'dmg';
      tdDmg.textContent = tower.totalDamage.toLocaleString();
      tr.append(tdRank, tdName, tdDmg);
    } else {
      for (const text of [`${i + 1}`, '—', '—']) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}
