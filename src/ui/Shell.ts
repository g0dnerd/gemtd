/**
 * Top-level UI shell. Mounts either the title screen or the in-game HUD,
 * with the Pixi canvas placed in the HUD's center column.
 */

import type { Application } from 'pixi.js';
import { Game } from '../game/Game';
import { mountTitle } from './Title';
import { mountHud } from './Hud';
import { mountToasts } from './Toasts';

export function mountUI(root: HTMLElement, app: Application, game: Game): void {
  const container = document.createElement('div');
  container.className = 'px-root';
  root.innerHTML = '';
  root.appendChild(container);

  let dispose: (() => void) | null = null;
  const showTitle = () => {
    if (dispose) dispose();
    container.innerHTML = '';
    dispose = mountTitle(container, () => {
      game.newGame();
      showHud();
    });
  };

  const showHud = () => {
    if (dispose) dispose();
    container.innerHTML = '';
    dispose = mountHud(container, app, game, showTitle);
  };

  // Toasts overlay sits above everything.
  mountToasts(root, game);

  game.bus.on('phase:enter', ({ phase }) => {
    if (phase === 'title') {
      // already at title
    }
  });

  showTitle();
}
