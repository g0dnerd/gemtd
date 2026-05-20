import { htmlCoin, htmlHeart } from "../render/htmlSprites";
import { RUNES_ENABLED } from "../game/constants";

interface Section {
  title: string;
  body: HTMLElement;
}

export function mountTutorialModal(root: HTMLElement): () => void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop tutorial-backdrop";

  const card = document.createElement("div");
  card.className = "px-panel modal-card tutorial-card";
  backdrop.appendChild(card);

  const head = document.createElement("div");
  head.className = "modal-head";
  const title = document.createElement("div");
  title.className = "title px-h";
  title.textContent = "HOW TO PLAY";
  const closeBtn = document.createElement("button");
  closeBtn.className = "px-btn modal-close";
  closeBtn.textContent = "✕";
  head.append(title, closeBtn);
  card.appendChild(head);

  const tabsEl = document.createElement("div");
  tabsEl.className = "tutorial-tabs";
  card.appendChild(tabsEl);

  const body = document.createElement("div");
  body.className = "tutorial-body px-panel-inset";
  card.appendChild(body);

  const sections: Section[] = [
    { title: "GOAL", body: goalBody() },
    { title: "BUILD", body: buildBody() },
    { title: "COMBINE", body: combineBody() },
    ...(RUNES_ENABLED ? [{ title: "RUNES", body: runesBody() }] : []),
    { title: "KEYS", body: keysBody() },
    { title: "CHANGES", body: changesBody() },
  ];

  let active = 0;
  let switching = false;

  const tabButtons: HTMLButtonElement[] = sections.map((s, i) => {
    const b = document.createElement("button");
    b.className = "px-btn tutorial-tab";
    if (i === 0) b.classList.add("tutorial-tab-active");
    b.textContent = s.title;
    b.addEventListener("click", () => switchTab(i));
    tabsEl.appendChild(b);
    return b;
  });

  body.appendChild(sections[0].body);

  function switchTab(index: number, direction?: "left" | "right"): void {
    if (index === active) return;

    const dir = direction ?? (index > active ? "right" : "left");
    const shift = dir === "right" ? -4 : 4;

    tabButtons[active].classList.remove("tutorial-tab-active");
    tabButtons[index].classList.add("tutorial-tab-active");
    active = index;

    if (switching) {
      body.style.transition = "none";
      body.innerHTML = "";
      body.appendChild(sections[active].body);
      body.style.opacity = "1";
      body.style.transform = "translateX(0)";
      void body.offsetHeight;
      body.style.transition = "";
      return;
    }

    switching = true;
    body.style.opacity = "0";
    body.style.transform = `translateX(${shift}px)`;

    setTimeout(() => {
      body.style.transition = "none";
      body.innerHTML = "";
      body.appendChild(sections[active].body);
      body.style.transform = `translateX(${-shift}px)`;
      void body.offsetHeight;
      body.style.transition = "";
      body.style.opacity = "1";
      body.style.transform = "translateX(0)";
      switching = false;
    }, 120);
  }

  const footer = document.createElement("div");
  footer.className = "modal-head";
  const hint = document.createElement("div");
  hint.className = "tutorial-hint";
  hint.textContent = "ESC or click outside to close";
  const okBtn = document.createElement("button");
  okBtn.className = "px-btn px-btn-primary modal-ok";
  okBtn.textContent = "GOT IT";
  footer.append(hint, okBtn);
  card.appendChild(footer);

  let closing = false;
  function close_(): void {
    if (closing) return;
    closing = true;
    window.removeEventListener("keydown", onKey);
    backdrop.classList.remove("modal-visible");
    backdrop.addEventListener("transitionend", () => backdrop.remove(), {
      once: true,
    });
    setTimeout(() => {
      if (backdrop.parentNode) backdrop.remove();
    }, 200);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close_();
    else if (e.key === "ArrowRight") {
      switchTab((active + 1) % sections.length, "right");
    } else if (e.key === "ArrowLeft") {
      switchTab((active - 1 + sections.length) % sections.length, "left");
    }
  };
  window.addEventListener("keydown", onKey);

  closeBtn.addEventListener("click", close_);
  okBtn.addEventListener("click", close_);
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close_();
  });

  root.appendChild(backdrop);
  void backdrop.offsetHeight;
  backdrop.classList.add("modal-visible");

  return close_;
}

function p(html: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "tutorial-p";
  d.innerHTML = html;
  return d;
}

function note(html: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "tutorial-note";
  d.innerHTML = html;
  return d;
}

function stepList(
  items: Array<{ marker: HTMLElement | string; html: string }>,
): HTMLElement {
  const ol = document.createElement("ol");
  ol.className = "tutorial-step-list";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "tutorial-step-item";
    const iconEl = document.createElement("span");
    if (typeof item.marker === "string") {
      iconEl.className = "tutorial-step-marker";
      iconEl.textContent = item.marker;
    } else {
      iconEl.className = "tutorial-step-icon";
      iconEl.appendChild(item.marker);
    }
    const text = document.createElement("span");
    text.innerHTML = item.html;
    li.append(iconEl, text);
    ol.appendChild(li);
  }
  return ol;
}

function goalBody(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.append(
    p(
      `Survive <b>50 waves</b> of creeps. They follow the <b>shortest path</b> through 6 checkpoints. Place towers to create <b>longer detours</b> - more time in range means more damage.`,
    ),
    stepList([
      {
        marker: htmlHeart(18),
        html: `Each leak costs a <b>life</b>. You start with <b>50</b> (or <b>1</b> in Hardcore). Lose them all and the run ends.`,
      },
      {
        marker: htmlCoin(18),
        html: `Kills earn <b>gold</b> for chance-tier upgrades, combines, and rock removal.`,
      },
    ]),
    note(
      `A placement is rejected if it would block the path entirely. <b>Air</b> creeps fly straight between checkpoints and ignore the maze.`,
    ),
  );
  return wrap;
}

function buildBody(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.append(
    p(
      `Each build phase you can upgrade your <b>chance tier</b>, then press <kbd>SPACE</kbd> to roll <b>5 random gems</b>.`,
    ),
    stepList([
      {
        marker: "1",
        html: `<b>Place</b> - select a draw slot, click a grass tile.`,
      },
      {
        marker: "2",
        html: `<b>Cycle</b> - <kbd>TAB</kbd> to switch between unplaced slots.`,
      },
      {
        marker: "3",
        html: `<b>Undo</b> - <kbd>U</kbd> to reverse your last placement.`,
      },
    ]),
    note(
      `Once all 5 are placed, press <kbd>SPACE</kbd> to start the wave. After it ends, <b>keep one</b> tower (<kbd>K</kbd>) - the other four become <b>rocks</b>. That's how you build your maze.`,
    ),
  );
  return wrap;
}

function combineBody(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.append(
    p(
      `<b>Right-click</b> a placed gem to open the <b>radial menu</b> with Keep, Combine, and Special actions.`,
    ),
    stepList([
      {
        marker: "↑",
        html: `<b>Level up:</b> 2 same gems -> +1 quality. 4 same gems -> +2 quality.<br><span style="color:var(--px-ink-dim);font-size:13px">Chipped -> Flawed -> Normal -> Flawless -> Perfect</span>`,
      },
      {
        marker: "⚗",
        html: `<b>Recipes:</b> specific gem + quality combos form a <b>special tower</b>. See the RECIPES panel for all combinations.`,
      },
    ]),
    note(
      `Only <b>kept</b> towers from previous rounds are eligible. The full combine menu (<kbd>C</kbd>) lets you pick towers manually.`,
    ),
  );
  return wrap;
}

function runesBody(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.append(
    p(
      `<b>Runes</b> are special recipe combos that act as <b>traps</b>. Unlike towers, they don't block pathing - creeps walk over them and trigger their effect.`,
    ),
    p(`<b>Rune of Holding</b> - stuns creeps briefly.`),
    p(`<b>Rune of Damage</b> - deals burst damage on contact.`),
    p(`<b>Rune of Teleportation</b> - knocks creeps back along the path.`),
    p(`<b>Rune of Slow</b> - applies a heavy slow.`),
    note(
      `Runes have a cooldown between triggers. Place them on the creep path for maximum effect.`,
    ),
  );
  return wrap;
}

type ChangeTag = "new" | "buff" | "nerf" | "bal" | "fix";

interface ChangeNote {
  tag: ChangeTag;
  text: string;
}

interface VersionEntry {
  ver: string;
  notes: Array<ChangeNote | string>;
}

const TAG_LABELS: Record<ChangeTag, string> = {
  new: "NEW",
  buff: "BUFF",
  nerf: "NERF",
  bal: "BAL",
  fix: "FIX",
};

const CHANGELOG_PREVIEW = 5;

function changesBody(): HTMLElement {
  const wrap = document.createElement("div");

  const versions: VersionEntry[] = [
    {
      ver: "1.5.1",
      notes: [
        {
          tag: "nerf",
          text: "Chrysalids: awakened now have 80% resistance to slows, stuns, and poison instead of full immunity.",
        },
        {
          tag: "nerf",
          text: "Living Diamond: crit 12->9%, focus crit 7->6%/hit (max 18%), execute bonus 0.5->0.4.",
        },
        {
          tag: "nerf",
          text: "Lucky Asian Jade: crit chance 15->12%.",
        },
        {
          tag: "bal",
          text: "Wave 50: retuned coral/boss/healer counts.",
        },
        {
          tag: "fix",
          text: "Stun resistance now reduces duration instead of chance.",
        },
      ],
    },
    {
      ver: "1.5.0",
      notes: [
        {
          tag: "new",
          text: "Chrysalid creeps (wave 31+): at 50% HP, awakens - immune to debuffs and blocks every 10th hit.",
        },
        { tag: "new", text: "Gestation boss (wave 50)" },
        {
          tag: "new",
          text: "Gem weakness system: each wave has a weakness to one gem type. Matching gems deal 1.5× damage.",
        },
        {
          tag: "new",
          text: "Bloodstone rework: splash replaced with eruption mechanic. Every 8 hits triggers an AoE burst. Ancient Bloodstone erupts every 6 hits with afterburn.",
        },
        {
          tag: "new",
          text: "Dark Emerald rework: 17.5% stun, 2× damage to stunned creeps. Venomous Emerald: 23% stun, poison 340/s, plague on death.",
        },
        {
          tag: "new",
          text: "Red Crystal rework: no longer air-only. Armor shred removed. Every 20th hit grounds air units. Damage reduced 15%.",
        },
        {
          tag: "new",
          text: "Background music with mute toggle. Credit: hundredsense.",
        },
        {
          tag: "bal",
          text: "Tower level-up scaling tapered: +5% per level -> diminishing returns via 5%×L/(1+6%×L) formula.",
        },
        {
          tag: "bal",
          text: "Flawless/Perfect base gem damage reduced (quality multipliers: 11/22 -> 9/17). Ruby retains its own curve (9/18 -> 8.2/16).",
        },
        {
          tag: "bal",
          text: "Waves 31–49 reworked: clearer per-wave identity with 2–3 creep groups max. Chrysalids are a central late-game threat.",
        },
        {
          tag: "bal",
          text: "Late-game bounties sharply reduced across waves 26–50 to curb gold surplus.",
        },
        {
          tag: "bal",
          text: "Global spawn intervals increased by 50%, spreading creep waves out more.",
        },
        {
          tag: "bal",
          text: "Container creeps (Vessel, Coral, etc.) move much slower with higher HP. Spawn interval 2.5s.",
        },
        {
          tag: "bal",
          text: "Armored creeps: default armor 7 -> 12, HP multiplier 1.6 -> 1.49.",
        },
        {
          tag: "bal",
          text: "Tunneler HP multiplier 0.8 -> 1.35. Burrow duration 3.5s -> 2.5s, cooldown 12s -> 15s.",
        },
        {
          tag: "nerf",
          text: "Silver Knight: freeze removed, nova every 7th -> 9th attack, damage 320–360 -> 250–290.",
        },
        {
          tag: "nerf",
          text: "Pharaoh's Gold crit reduced: 28% ×3.5 -> 18% ×2.5.",
        },
        { tag: "nerf", text: "Solar Core death nova radius 2.0 -> 1.0." },
        {
          tag: "nerf",
          text: "Healer creeps: speed 1.55 -> 1.4, HP multiplier 0.9 -> 0.85.",
        },
        { tag: "nerf", text: "Wave 49: all creep HP reduced by 20%." },
        {
          tag: "buff",
          text: "Stargem reworked: +splash, +15% crit ×3, poison 400 -> 500/s, slow 40% -> 45%, stun 12% -> 15%, damage 550–750 -> 600–800.",
        },
        { tag: "buff", text: "Aquamarine base damage 2 -> 3." },
        {
          tag: "buff",
          text: "Silver base: damage 24–31 -> 34–37, atk speed 1.25 -> 1.5. Splash slow 20% -> 25%.",
        },
        {
          tag: "buff",
          text: "Living Diamond: focus crit per hit 3% -> 7%, max bonus 15% -> 21%.",
        },
        {
          tag: "buff",
          text: "Rose Quartz Crystal: range 5.5/6.0 -> 6.5/8.0, armor aura radius matches.",
        },
        { tag: "buff", text: "Lucky Asian Jade: poison 50 -> 75 dps." },
        {
          tag: "fix",
          text: "Combine/downgrade during build no longer auto-starts the wave before all gems are placed.",
        },
        {
          tag: "fix",
          text: "Expired stun/slow/poison debuffs now properly cleared from creep state.",
        },
        {
          tag: "fix",
          text: "Opal shimmer no longer crashes when the tower is selected.",
        },
        {
          tag: "fix",
          text: "Draw panel now shows correct gem sprites after restarting a run.",
        },
        {
          tag: "fix",
          text: "Poison damage now properly attributed to the source tower in stats and the damage leaderboard.",
        },
      ],
    },
    {
      ver: "1.4.3",
      notes: [
        {
          tag: "buff",
          text: "Venomous Emerald: poison DPS 90 -> 112, death spread 2 -> 5 targets.",
        },
        { tag: "buff", text: "Solar Core: prox burn ramp DPS 95 -> 105." },
        {
          tag: "nerf",
          text: "Ancient Bloodstone: max damage 540 -> 500, splash radius 2.5 -> 2.",
        },
        {
          tag: "buff",
          text: "Lucky Asian Jade: crit 10% -> 15%, stun 3% -> 8%, bonus gold 5% -> 10%.",
        },
      ],
    },
    {
      ver: "1.4.2",
      notes: [{ tag: "bal", text: "Wave 30 healer count 3 -> 2, HP −30%." }],
    },
    {
      ver: "1.4.1",
      notes: [{ tag: "bal", text: "Wave 40 boss HP −30%, healer HP −40%." }],
    },
    {
      ver: "1.4.0",
      notes: [
        {
          tag: "new",
          text: "Container creeps: 4 new types (Vessel, Gazer, Coral, Anemone) that split into smaller creeps on death.",
        },
        "Container waves at 15, 25, 35, 45 with 1–4 nesting layers.",
      ],
    },
    {
      ver: "1.3.4",
      notes: [
        { tag: "bal", text: "Slightly buff Ruby's damage scaling curve." },
      ],
    },
    {
      ver: "1.3.3",
      notes: [
        {
          tag: "nerf",
          text: "Ruby damage −15–40% (Flawless/Perfect hit hardest).",
        },
        { tag: "bal", text: "Wave 40 boss + healer HP −20%." },
      ],
    },
    {
      ver: "1.3.2",
      notes: [
        {
          tag: "bal",
          text: "Star Ruby range reduced by 35% across all tiers.",
        },
        { tag: "bal", text: "Wave 24 air creep armor reduced from 3 to 2." },
      ],
    },
    {
      ver: "1.3.1",
      notes: [
        { tag: "bal", text: "Air units move 15% slower (2.0 -> 1.7 tiles/s)." },
        {
          tag: "fix",
          text: "Wave preview now shows actual HP after archetype multiplier.",
        },
      ],
    },
    {
      ver: "1.3.0",
      notes: [{ tag: "bal", text: "Healer buffs no longer stack." }],
    },
    {
      ver: "1.2.8",
      notes: [
        {
          tag: "buff",
          text: "Lucky Asian Jade damage range +50% (200–300 -> 300–450).",
        },
      ],
    },
    {
      ver: "1.2.7",
      notes: [
        { tag: "nerf", text: "Wave 34 air creep HP reduced by 20%." },
        {
          tag: "nerf",
          text: "Pink Diamond base damage reduced (350–450 -> 250–350).",
        },
        {
          tag: "nerf",
          text: "Living Diamond cost increased (175 -> 250) and damage reduced.",
        },
        {
          tag: "buff",
          text: "Silver Knight damage increased (120–160 -> 320–360).",
        },
        {
          tag: "nerf",
          text: "Solar Core death nova reduced (10% -> 8% max HP).",
        },
        {
          tag: "buff",
          text: "Red Crystal Facet damage increased (120–200 -> 160–250).",
        },
        {
          tag: "buff",
          text: "Rose Quartz Crystal damage increased (160–250 -> 240–300).",
        },
      ],
    },
    {
      ver: "1.2.6",
      notes: [
        {
          tag: "nerf",
          text: "Ancient Bloodstone damage (400–620 -> 320–540).",
        },
        { tag: "nerf", text: "Solar Core death nova (15% -> 10% max HP)." },
      ],
    },
    {
      ver: "1.2.5",
      notes: [
        {
          tag: "bal",
          text: "Remove poison from base Bloodstone (splash-only now).",
        },
        {
          tag: "nerf",
          text: "Diamond crit at higher qualities: reduced chance scaling (+3%/tier instead of +5%) and multiplier (1.8× at Normal+).",
        },
      ],
    },
    {
      ver: "1.2.4",
      notes: [
        {
          tag: "new",
          text: "Anonymous telemetry for balance tuning (no personal data collected).",
        },
      ],
    },
    {
      ver: "1.2.3",
      notes: [
        { tag: "bal", text: "Nerfed wave 15 air creep HP (1710 -> 1510)." },
      ],
    },
    {
      ver: "1.2.2",
      notes: [
        { tag: "bal", text: "Remove poison from Ancient Bloodstone entirely." },
        {
          tag: "buff",
          text: "Buff stargem damage floor and ceiling by 200 each.",
        },
      ],
    },
    {
      ver: "1.2.1",
      notes: [
        {
          tag: "fix",
          text: "Wave bonus gold is now only awarded when no creeps leak.",
        },
      ],
    },
    {
      ver: "1.2.0",
      notes: [
        {
          tag: "new",
          text: "Top 5 damage-dealing towers shown on game over screen.",
        },
      ],
    },
    {
      ver: "1.1.0",
      notes: [
        {
          tag: "bal",
          text: "Boss wave bounties reduced by 40% across all boss waves (10, 20, 30, 40, 50).",
        },
        {
          tag: "bal",
          text: "Armor now scales across all ground creep waves from wave 11 onward.",
        },
        {
          tag: "bal",
          text: "Air waves nerfed slightly but compensated with armor; difficulty shifts toward ground waves.",
        },
      ],
    },
    {
      ver: "1.0.0",
      notes: [
        {
          tag: "new",
          text: "Armor system - numeric armor replaces the armored flag. WC3 damage formula.",
        },
        {
          tag: "new",
          text: "Special gem upgrade rework - all 9 combo upgrade tiers replaced with identity-defining mechanics.",
        },
        {
          tag: "bal",
          text: "Silver T1 buffed: damage 20–26 -> 24–31, atk speed 1.1 -> 1.25.",
        },
        {
          tag: "bal",
          text: "Amethyst base damage 18 -> 21. Aquamarine beam ramp 0.18 -> 0.21/hit.",
        },
        {
          tag: "bal",
          text: "Yellow Sapphire base damage 80–120 -> 120–180, slow 25% for 2.5s.",
        },
        {
          tag: "bal",
          text: "Paraiba base dmgMin 60 -> 120. Ancient Paraiba damage nearly doubled.",
        },
        {
          tag: "buff",
          text: "Lucky Asian Jade damage/poison/crit significantly buffed.",
        },
        {
          tag: "bal",
          text: "Uranium base burn 190 -> 85/s, rebalanced around new upgrade tiers.",
        },
        {
          tag: "bal",
          text: "Solar Core burn 70 -> 95/s, ramp 10% -> 12%, death nova 10% -> 15% HP.",
        },
        {
          tag: "bal",
          text: "Silver Knight freeze 20% -> 15%, nova every 4 -> 7 attacks.",
        },
        {
          tag: "new",
          text: "50-wave format with armor progression across all waves.",
        },
        {
          tag: "new",
          text: "Creep inspector - click a creep to see HP, speed, bounty, debuffs.",
        },
        {
          tag: "new",
          text: "Redesigned T2 gem sprites and palettes for most gem types.",
        },
        { tag: "new", text: "Hardcore mode restyled with skull & bone theme." },
      ],
    },
    {
      ver: "0.12.0",
      notes: [
        {
          tag: "bal",
          text: "First chance tier upgrade cost reduced: 30g -> 25g.",
        },
        {
          tag: "bal",
          text: "Waves 11, 16, 18 slightly nerfed; wave 20 boss HP 14k -> 9k.",
        },
      ],
    },
    {
      ver: "0.11.0",
      notes: [
        {
          tag: "bal",
          text: "Runes temporarily disabled due to UX/balance issues.",
        },
      ],
    },
    {
      ver: "0.10.0",
      notes: [
        {
          tag: "new",
          text: "Malachite now fires independent projectiles at multiple enemies.",
        },
        {
          tag: "new",
          text: "Star Ruby and Uranium radiate passive damage to all nearby enemies.",
        },
        {
          tag: "new",
          text: "Uranium slows all enemies in range without attacking.",
        },
        { tag: "new", text: "Gold applies an armor reduction debuff on hit." },
        {
          tag: "new",
          text: "Lucky Asian Jade has a 5% chance to double kill bounty.",
        },
        {
          tag: "new",
          text: "Black Opal now grants a damage aura instead of attack speed aura.",
        },
      ],
    },
    {
      ver: "0.9.0",
      notes: [
        {
          tag: "new",
          text: "Downgrade - reduce a gem's tier by 1 to keep it. One use per round.",
        },
      ],
    },
    {
      ver: "0.8.2",
      notes: [
        {
          tag: "nerf",
          text: "Healer buff: duration 3s -> 2s, heal rate 0.1%/tick -> 0.075%/tick.",
        },
      ],
    },
    {
      ver: "0.8.1",
      notes: [
        {
          tag: "nerf",
          text: "Mighty Malachite: damage 100–150 -> 70–100, chain falloff 1.0 -> 0.85.",
        },
        {
          tag: "buff",
          text: "Star Ruby line: damage and poison up across all tiers.",
        },
        {
          tag: "nerf",
          text: "Lucky Asian Jade: splash falloff 0.6 -> 0.5, poison 80 -> 50 / 120 -> 80.",
        },
        {
          tag: "bal",
          text: "Boss W10 HP 3500 -> 3000, W11 healers HP 1000 -> 800, W50 healers 5 -> 2.",
        },
      ],
    },
    {
      ver: "0.8.0",
      notes: [
        {
          tag: "nerf",
          text: "Diamond: base damage 30 -> 25, crit multiplier 2.5 -> 2.0.",
        },
        { tag: "buff", text: "Sapphire: base damage 12 -> 15." },
        {
          tag: "buff",
          text: "Emerald: base damage 10 -> 13, poison DPS 8 -> 11.",
        },
        { tag: "buff", text: "Aquamarine: base range 2.5 -> 3.0." },
      ],
    },
    {
      ver: "0.7.2",
      notes: [
        {
          tag: "fix",
          text: "Special combine with 1 current-round gem now works correctly.",
        },
      ],
    },
    {
      ver: "0.7.0",
      notes: [
        {
          tag: "new",
          text: "Aquamarine rework - ramping beam replaces rapid-fire projectiles.",
        },
      ],
    },
    {
      ver: "0.6.1",
      notes: [
        {
          tag: "new",
          text: "Amethyst rework - targets all units with air damage bonus.",
        },
      ],
    },
    {
      ver: "0.6.0",
      notes: [
        { tag: "new", text: "Hardcore + Creative mode." },
        {
          tag: "new",
          text: "Runes - walkable trap towers triggered by creep proximity.",
        },
        {
          tag: "new",
          text: "Tower kill leveling - towers gain +5% damage per 10 kills.",
        },
        {
          tag: "new",
          text: "8× speed mode - press <kbd>8</kbd> to fast-forward.",
        },
        {
          tag: "new",
          text: "Healer, Wizard, Tunneler creep types and wave groups.",
        },
        {
          tag: "new",
          text: "Radial menu - right-click towers for Keep / Combine / Special.",
        },
        {
          tag: "new",
          text: "Path overlay - press <kbd>P</kbd> to see the creep route.",
        },
        {
          tag: "new",
          text: "Recipe hints - tower inspector shows “Forges Into” recipes.",
        },
        {
          tag: "new",
          text: "Stargem - apex gem from 4× Perfect same-type recipe.",
        },
        {
          tag: "bal",
          text: "Increased aura/proximity radii, bosses cost 8 lives.",
        },
      ],
    },
  ];

  const versionEls: HTMLElement[] = [];
  for (const { ver, notes } of versions) {
    const section = document.createElement("div");
    const hdr = document.createElement("div");
    hdr.className = "changelog-ver";
    hdr.textContent = `v${ver}`;
    section.appendChild(hdr);
    const list = document.createElement("ul");
    list.className = "changelog-list";
    for (const n of notes) {
      const li = document.createElement("li");
      li.className = "changelog-item";
      if (typeof n === "string") {
        li.style.paddingLeft = "28px";
        li.innerHTML = n;
      } else {
        const tag = document.createElement("span");
        tag.className = `changelog-tag changelog-tag-${n.tag}`;
        tag.textContent = TAG_LABELS[n.tag];
        li.appendChild(tag);
        const span = document.createElement("span");
        span.innerHTML = n.text;
        li.appendChild(span);
      }
      list.appendChild(li);
    }
    section.appendChild(list);
    wrap.appendChild(section);
    versionEls.push(section);
  }

  if (versions.length > CHANGELOG_PREVIEW) {
    for (let i = CHANGELOG_PREVIEW; i < versionEls.length; i++) {
      versionEls[i].hidden = true;
    }
    const showOlder = document.createElement("button");
    showOlder.className = "px-btn changelog-show-older";
    showOlder.textContent = `SHOW ${versions.length - CHANGELOG_PREVIEW} OLDER`;
    showOlder.addEventListener("click", () => {
      for (let i = CHANGELOG_PREVIEW; i < versionEls.length; i++) {
        versionEls[i].hidden = false;
      }
      showOlder.remove();
    });
    wrap.appendChild(showOlder);
  }

  return wrap;
}

function keysBody(): HTMLElement {
  const wrap = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "tutorial-keys";

  type KeyEntry = [string, string] | "sep";
  const keys: KeyEntry[] = [
    ["SPACE", "Start placement / next wave"],
    ["TAB", "Cycle draw slot (Shift = back)"],
    ["K", "Keep hovered or selected tower"],
    ["C", "Open Combine menu"],
    "sep",
    ["U", "Undo last placement"],
    ["R", "Remove selected rock"],
    ["P", "Toggle path overlay"],
    "sep",
    ["1/2/4/8", "Sim speed"],
    ["H / ?", "This help screen"],
    ["Ctrl+R", "Restart run"],
    ["ESC", "Deselect / close menu"],
  ];
  for (const entry of keys) {
    if (entry === "sep") {
      const sep = document.createElement("div");
      sep.className = "tutorial-key-sep";
      grid.appendChild(sep);
      continue;
    }
    const [k, label] = entry;
    const r = document.createElement("div");
    r.className = "tutorial-key-row";
    const kb = document.createElement("kbd");
    kb.textContent = k;
    const lbl = document.createElement("div");
    lbl.className = "tutorial-key-label";
    lbl.textContent = label;
    r.append(kb, lbl);
    grid.appendChild(r);
  }
  wrap.appendChild(grid);
  return wrap;
}
