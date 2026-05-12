/**
 * Title screen: floating gem logo, title, subtitle, menu buttons.
 * Recreates design's screen-title.jsx pixel-perfectly.
 */

import { GEM_TYPES } from "../render/theme";
import { htmlGem } from "../render/htmlSprites";

export function mountTitle(root: HTMLElement, onStart: () => void, onStartHardcore: () => void): () => void {
  const screen = document.createElement("div");
  screen.className = "title-screen";

  // Logo row
  const logo = document.createElement("div");
  logo.className = "title-logo";
  GEM_TYPES.forEach((g, i) => {
    const wrap = document.createElement("div");
    wrap.className = "title-logo-gem";
    wrap.style.animationDelay = `${i * 0.18}s`;
    wrap.appendChild(htmlGem(g, 40, true));
    logo.appendChild(wrap);
  });
  screen.appendChild(logo);

  // Title
  const titleH = document.createElement("div");
  titleH.className = "title-h1";
  titleH.innerHTML = `<div class="title-name px-h">GEM<br/>TOWER<br/>DEFENSE</div>`;
  screen.appendChild(titleH);

  // Subtitle
  const sub = document.createElement("div");
  sub.className = "title-subtitle";
  sub.innerHTML = `Dingel.<br/>Döngel.`;
  screen.appendChild(sub);

  // Menu
  const menu = document.createElement("div");
  menu.className = "title-menu";
  const btns: Array<[string, string, () => void, boolean]> = [
    ["▶ NEW GAME", "px-btn px-btn-primary", onStart, false],
    ["☠ NEW GAME (HARDCORE)", "px-btn", onStartHardcore, false],
    ["CONTINUE", "px-btn", () => {}, true],
    ["SCORES", "px-btn", () => {}, true],
    ["SETTINGS", "px-btn", () => {}, true],
  ];
  for (const [label, cls, fn, disabled] of btns) {
    const b = document.createElement("button");
    b.className = cls;
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener("click", fn);
    menu.appendChild(b);
  }
  screen.appendChild(menu);

  // Footer
  const footer = document.createElement("div");
  footer.className = "title-footer";
  footer.textContent = "v0.1 · PRESS START";
  screen.appendChild(footer);

  root.appendChild(screen);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      onStart();
    }
  };
  window.addEventListener("keydown", onKey);

  return () => {
    window.removeEventListener("keydown", onKey);
    screen.remove();
  };
}
