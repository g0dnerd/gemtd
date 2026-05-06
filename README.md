# GemTD

Browser clone of the SC2 Gem Tower Defense custom map.

- TypeScript + PixiJS v8
- Vite dev/build
- Vitest unit tests
- Pixel-art "Cozy Twilight" theme

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

## Architecture

- **Game canvas** (PixiJS): board, gems, creeps, projectiles, FX.
- **HUD chrome** (HTML/CSS): title screen, stat chips, stash, combine modal.
- **Pure-data game content** under `src/data/` (gems, combos, waves, creeps, map).
- **Sim** is fixed-step 60 Hz; render is decoupled.
