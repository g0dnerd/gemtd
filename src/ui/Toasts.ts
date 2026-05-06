/**
 * Floating toast notifications. Subscribes to 'toast' events on the bus.
 */

import { Game } from '../game/Game';

export function mountToasts(root: HTMLElement, game: Game): void {
  const stack = document.createElement('div');
  stack.className = 'toast-stack';
  root.appendChild(stack);

  game.bus.on('toast', ({ kind, text }) => {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    stack.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.3s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 350);
    }, 1400);
  });
}
