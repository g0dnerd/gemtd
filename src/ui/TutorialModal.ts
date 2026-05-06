/**
 * In-game tutorial overlay. Re-readable from the HUD action bar.
 * Plain HTML/CSS — same modal pattern as CombineModal.
 */

import { htmlGem, htmlCoin, htmlHeart } from '../render/htmlSprites';

interface Section {
  title: string;
  body: HTMLElement;
}

export function mountTutorialModal(root: HTMLElement): () => void {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const card = document.createElement('div');
  card.className = 'px-panel modal-card tutorial-card';
  backdrop.appendChild(card);

  const head = document.createElement('div');
  head.className = 'modal-head';
  const title = document.createElement('div');
  title.className = 'title px-h';
  title.textContent = '? HOW TO PLAY ?';
  const close = document.createElement('button');
  close.className = 'px-btn';
  close.style.fontSize = '9px';
  close.style.padding = '6px 10px';
  close.textContent = 'X';
  head.append(title, close);
  card.appendChild(head);

  const tabs = document.createElement('div');
  tabs.className = 'tutorial-tabs';
  card.appendChild(tabs);

  const body = document.createElement('div');
  body.className = 'tutorial-body px-panel-inset';
  card.appendChild(body);

  const sections: Section[] = [
    { title: 'GOAL', body: goalBody() },
    { title: 'BUILD', body: buildBody() },
    { title: 'MAZE', body: mazeBody() },
    { title: 'COMBINE', body: combineBody() },
    { title: 'KEYS', body: keysBody() },
  ];

  let active = 0;
  function render(): void {
    tabs.innerHTML = '';
    sections.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'px-btn tutorial-tab';
      if (i === active) b.classList.add('tutorial-tab-active');
      b.textContent = s.title;
      b.addEventListener('click', () => {
        active = i;
        render();
      });
      tabs.appendChild(b);
    });
    body.innerHTML = '';
    body.appendChild(sections[active].body);
  }

  const footer = document.createElement('div');
  footer.className = 'cost-actions';
  const hint = document.createElement('div');
  hint.className = 'tutorial-hint';
  hint.textContent = 'Press ESC or click outside to close.';
  const okBtn = document.createElement('button');
  okBtn.className = 'px-btn px-btn-primary';
  okBtn.style.fontSize = '9px';
  okBtn.textContent = 'GOT IT';
  footer.append(hint, okBtn);
  card.appendChild(footer);

  function close_(): void {
    backdrop.remove();
    window.removeEventListener('keydown', onKey);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close_();
    else if (e.key === 'ArrowRight') {
      active = (active + 1) % sections.length;
      render();
    } else if (e.key === 'ArrowLeft') {
      active = (active - 1 + sections.length) % sections.length;
      render();
    }
  };
  window.addEventListener('keydown', onKey);

  close.addEventListener('click', close_);
  okBtn.addEventListener('click', close_);
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) close_();
  });

  root.appendChild(backdrop);
  render();

  return close_;
}

function p(html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'tutorial-p';
  d.innerHTML = html;
  return d;
}

function row(left: HTMLElement, text: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'tutorial-row';
  const l = document.createElement('div');
  l.className = 'tutorial-row-icon';
  l.appendChild(left);
  const r = document.createElement('div');
  r.className = 'tutorial-p';
  r.innerHTML = text;
  d.append(l, r);
  return d;
}

function goalBody(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(
    p(`Defend against <b>50 waves</b> of creeps. They march from the red <b>S</b> to the gold <b>E</b>.`),
    row(htmlHeart(18), `Each leak costs a <b>life</b>. Lose all lives and the run ends.`),
    row(htmlCoin(18), `Kills earn <b>gold</b>. Spend it on rerolls, gems and combines.`),
    p(`Survive every wave to win.`),
  );
  return wrap;
}

function buildBody(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(
    p(`Every build phase you draw <b>5 random gems</b>. You must place all 5 to start the wave.`),
    row(htmlGem('emerald', 22, true), `<b>PLACE</b> — click a slot in the DRAW panel to select it, then click a grass tile.`),
    row(htmlGem('sapphire', 22), `<b>CYCLE</b> — press <kbd>TAB</kbd> to cycle through unplaced slots, or click chips directly.`),
    row(htmlGem('topaz', 22), `<b>UNDO</b> — <kbd>U</kbd> reverses placements during build phase.`),
    p(`After the wave, you must <b>keep just one</b> of the 5 towers. The other four become permanent <b>rocks</b> that block creep paths — that's how you build your maze.`),
    p(`Older kept towers can be sold any time with <b>right-click</b> or <kbd>S</kbd> for 75% gold (also leaving a rock).`),
    p(`Click <b>NEXT WAVE</b> (or press <kbd>SPACE</kbd>) once all 5 are placed.`),
  );
  return wrap;
}

function mazeBody(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(
    p(`Creeps don't follow a fixed road. They take the <b>shortest walkable path</b> from start to end through the orange <b>checkpoints</b> (1 → 2 → 3 → 4).`),
    p(`Place towers between checkpoints to <b>force a longer path</b>. Longer mazes mean more time in tower range = more damage dealt.`),
    p(`A placement is rejected if it would <b>fully block</b> creeps from reaching the next checkpoint. Try alternative tiles if a build fails.`),
    p(`<b>Your maze comes from rocks</b> — every wave, 4 of your 5 placed gems become rocks when you pick a keeper. That's the canonical mazing rhythm: get more rocks each wave, refine the path each wave.`),
  );
  return wrap;
}

function combineBody(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(
    p(`Open the <b>★ COMBINE</b> menu (or press <kbd>C</kbd>) during build phase to merge towers:`),
    p(`<b>Quality upgrade:</b> 5 same-color, same-quality gems → 1 of next quality up (Chipped → Flawed → Normal → Flawless → Perfect).`),
    p(`<b>Recipes:</b> 2–7 distinct gems at the same quality form a <b>special tower</b>. The full RECIPES panel on the right shows every combination.`),
    p(`<b>Only kept gems</b> are eligible — the 5 you just drew this wave can't be combined until they survive a wave and you pick one to keep.`),
    p(`Combining is free, and the merged towers are replaced with a new tower at the first slot's tile.`),
  );
  return wrap;
}

function keysBody(): HTMLElement {
  const wrap = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'tutorial-keys';
  const keys: Array<[string, string]> = [
    ['SPACE', 'Start next wave (when all 5 placed)'],
    ['TAB', 'Cycle active draw slot (Shift = back)'],
    ['1 / 2 / 4', 'Sim speed'],
    ['U', 'Undo last action'],
    ['S', 'Sell selected tower (kept towers only)'],
    ['C', 'Open Combine menu'],
    ['ESC', 'Deselect / close menu'],
    ['Right-click', 'Sell tower under cursor'],
  ];
  for (const [k, label] of keys) {
    const r = document.createElement('div');
    r.className = 'tutorial-key-row';
    const kb = document.createElement('kbd');
    kb.textContent = k;
    const lbl = document.createElement('div');
    lbl.textContent = label;
    r.append(kb, lbl);
    grid.appendChild(r);
  }
  wrap.appendChild(grid);
  return wrap;
}
