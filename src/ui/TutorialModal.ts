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
    { title: 'RUNES', body: runesBody() },
    { title: 'KEYS', body: keysBody() },
    { title: 'CHANGES', body: changesBody() },
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
    p(`Survive <b>50 waves</b> of creeps. They walk from <b>Start</b> to <b>End</b> through 6 checkpoints.`),
    row(htmlHeart(18), `Each leak costs a <b>life</b>. Lose all 50 and the run ends.`),
    row(htmlCoin(18), `Kills earn <b>gold</b>. Spend it on chance-tier upgrades and combines.`),
  );
  return wrap;
}

function buildBody(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(
    p(`Each build phase: upgrade your <b>chance tier</b> if you like, then press <b>START PLACEMENT</b> (<kbd>SPACE</kbd>) to roll <b>5 random gems</b>.`),
    row(htmlGem('emerald', 22, true), `<b>PLACE</b> — select a draw slot, then click a grass tile.`),
    row(htmlGem('sapphire', 22), `<b>CYCLE</b> — <kbd>TAB</kbd> cycles unplaced slots.`),
    row(htmlGem('topaz', 22), `<b>UNDO</b> — <kbd>U</kbd> reverses placements.`),
    p(`Once all 5 are placed, press <b>NEXT WAVE</b> (<kbd>SPACE</kbd>). After the wave, <b>keep one</b> tower (<kbd>K</kbd>); the other four become <b>rocks</b> that block creep paths — that's how you build your maze.`),
  );
  return wrap;
}

function mazeBody(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(
    p(`Creeps take the <b>shortest walkable path</b> through 6 <b>checkpoints</b>. Place towers to <b>force longer detours</b> — more time in range means more damage.`),
    p(`A placement is <b>rejected</b> if it would fully block the path. <b>Air</b> creeps ignore the maze and fly straight between checkpoints.`),
    p(`Each wave, 4 of your 5 gems become <b>rocks</b> when you pick a keeper. Rocks can be removed later for increasing gold cost.`),
  );
  return wrap;
}

function combineBody(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(
    p(`<b>Right-click</b> a placed gem to open the <b>radial menu</b> — it shows Keep, Combine (level up), and Special (recipe) actions for that tower.`),
    p(`<b>Level up:</b> 2 same gems → +1 quality; 4 same gems → +2 quality (Chipped → Flawed → Normal → Flawless → Perfect).`),
    p(`<b>Recipes:</b> specific gem + quality combos form a <b>special tower</b>. Check the RECIPES panel for all combinations.`),
    p(`Only <b>kept</b> towers from previous rounds are eligible for recipes. The full ★ COMBINE menu (<kbd>C</kbd>) lets you pick towers manually.`),
  );
  return wrap;
}

function runesBody(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(
    p(`<b>Runes</b> are special recipe combos that act as <b>traps</b>. Unlike towers, they don't block pathing — creeps walk over them and trigger their effect.`),
    p(`<b>Rune of Holding</b> — stuns creeps briefly.`),
    p(`<b>Rune of Damage</b> — deals burst damage on contact.`),
    p(`<b>Rune of Teleportation</b> — knocks creeps back along the path.`),
    p(`<b>Rune of Slow</b> — applies a heavy slow.`),
    p(`Runes have a cooldown between triggers. Place them on the creep path for maximum effect.`),
  );
  return wrap;
}

function changesBody(): HTMLElement {
  const wrap = document.createElement('div');

  const versions: Array<{ ver: string; notes: string[] }> = [
    {
      ver: '0.8.1',
      notes: [
        '<b>Balance</b> — Mighty Malachite nerfed: damage 100-150→70-100, chain falloff 1.0→0.85.',
        '<b>Balance</b> — Star Ruby line buffed: damage and poison up across all tiers.',
        '<b>Balance</b> — Lucky Asian Jade line nerfed: splash falloff 0.6→0.5, poison 80→50 / 120→80.',
        '<b>Balance</b> — Boss W10 HP 3500→3000, W11 healers HP 1000→800, W50 healers 5→2.',
      ],
    },
    {
      ver: '0.8.0',
      notes: [
        '<b>Balance</b> — Diamond nerfed: base damage 30→25, crit multiplier 2.5→2.0.',
        '<b>Balance</b> — Sapphire buffed: base damage 12→15.',
        '<b>Balance</b> — Emerald buffed: base damage 10→13, poison DPS 8→11.',
        '<b>Balance</b> — Aquamarine buffed: base range 2.5→3.0.',
      ],
    },
    {
      ver: '0.7.2',
      notes: [
        '<b>Fix</b> — special combine with 1 current-round gem now works correctly.',
      ],
    },
    {
      ver: '0.7.0',
      notes: [
        '<b>Aquamarine rework</b> — ramping beam replaces rapid-fire projectiles.',
      ],
    },
    {
      ver: '0.6.1',
      notes: [
        '<b>Amethyst rework</b> — targets all units with air damage bonus.',
      ],
    },
    {
      ver: '0.6.0',
      notes: [
        '<b>Hardcore + Creative mode</b> — new game modes.',
        '<b>Runes</b> — walkable trap towers triggered by creep proximity (Holding, Damage, Teleportation, Slow).',
        '<b>Tower kill leveling</b> — towers gain +5% damage per 10 kills.',
        '<b>8× speed mode</b> — press <kbd>8</kbd> to fast-forward.',
        '<b>Healer, Wizard, Tunneler</b> — new creep types and wave groups.',
        '<b>Radial menu</b> — right-click towers for Keep / Combine / Special.',
        '<b>Path overlay</b> — press <kbd>P</kbd> to see the creep route.',
        '<b>Recipe hints</b> — tower inspector shows "Forges Into" recipes.',
        '<b>Stargem</b> — apex gem from 4× Perfect same-type recipe.',
        '<b>Balance</b> — increased aura/proximity radii, bosses cost 8 lives.',
      ],
    },
  ];

  for (const { ver, notes } of versions) {
    const hdr = document.createElement('div');
    hdr.className = 'tutorial-p changelog-ver';
    hdr.innerHTML = `<b>v${ver}</b>`;
    wrap.appendChild(hdr);
    const list = document.createElement('ul');
    list.className = 'changelog-list';
    for (const n of notes) {
      const li = document.createElement('li');
      li.className = 'tutorial-p changelog-item';
      li.innerHTML = n;
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }
  return wrap;
}

function keysBody(): HTMLElement {
  const wrap = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'tutorial-keys';
  const keys: Array<[string, string]> = [
    ['SPACE', 'Start placement / next wave'],
    ['TAB', 'Cycle draw slot (Shift = back)'],
    ['K', 'Keep hovered or selected tower'],
    ['C', 'Open Combine menu'],
    ['U', 'Undo last placement'],
    ['1/2/4/8', 'Sim speed'],
    ['P', 'Toggle path overlay'],
    ['R', 'Restart game'],
    ['ESC', 'Deselect / close menu'],
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
