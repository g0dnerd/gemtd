import { Application } from 'pixi.js';
import { Game } from './game/Game';
import { mountUI } from './ui/Shell';

async function boot() {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app root missing');

  const app = new Application();
  await app.init({
    background: '#2a2238',
    resizeTo: window,
    antialias: false,
    autoDensity: true,
    resolution: 1,
    roundPixels: true,
  });

  const game = new Game(app);
  mountUI(root, app, game);

  game.start();
}

boot().catch((err) => {
  console.error(err);
});
