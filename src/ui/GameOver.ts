/**
 * End-of-run overlay (victory / defeat).
 */

import { Game } from '../game/Game';

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
  overlay.append(title, sub, buttons);
  root.appendChild(overlay);
}
