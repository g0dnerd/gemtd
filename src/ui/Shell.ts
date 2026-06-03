/**
 * Top-level UI shell. Mounts either the title screen or the in-game HUD,
 * with the Pixi canvas placed in the HUD's center column.
 */

import type { Application } from 'pixi.js';
import { Game } from '../game/Game';
import { mountTitle } from './Title';
import { mountHud } from './Hud';
import { mountToasts } from './Toasts';
import { mountTweaks } from './Tweaks';
import { mountTutorialModal } from './TutorialModal';
import { checkVersion } from './versionCheck';

export function mountUI(root: HTMLElement, app: Application, game: Game): void {
  const container = document.createElement('div');
  container.className = 'px-root';
  root.innerHTML = '';
  root.appendChild(container);

  const version = checkVersion();

  let dispose: (() => void) | null = null;
  const showTitle = () => {
    if (dispose) dispose();
    container.innerHTML = '';
    dispose = mountTitle(container, () => {
      game.newGame();
      showHud();
      if (version.isNewPlayer) mountTutorialModal(container, undefined, game.seed);
    }, () => {
      game.newEndlessGame();
      showHud();
      if (version.isNewPlayer) mountTutorialModal(container, undefined, game.seed);
    }, version.hasUnseenUpdate);
  };

  const showHud = () => {
    if (dispose) dispose();
    container.innerHTML = '';
    dispose = mountHud(container, app, game, showTitle);
  };

  // Ctrl+0: debug mode — start with every gem/combo pre-placed.
  // Ctrl+A: AI spectator mode.
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && ev.key === '0') {
      ev.preventDefault();
      game.newDebugGame();
      showHud();
    } else if (ev.ctrlKey && ev.key === 'a') {
      ev.preventDefault();
      game.newGame(true);
      showHud();
    }
  });

  // Toasts overlay sits above everything.
  mountToasts(root, game);
  mountTweaks(root, game);

  game.bus.on('phase:enter', ({ phase }) => {
    if (phase === 'title') {
      // already at title
    }
  });

  showTitle();
}
