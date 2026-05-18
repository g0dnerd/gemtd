/**
 * Title screen: floating gem logo, title, subtitle, menu buttons.
 * Recreates design's screen-title.jsx pixel-perfectly.
 */

import { GEM_TYPES } from "../render/theme";
import { htmlGem } from "../render/htmlSprites";
import { mountTutorialModal } from "./TutorialModal";
import { isMuted, startMusic, toggleMute } from "./Audio";

export function mountTitle(
  root: HTMLElement,
  onStart: () => void,
  onStartHardcore: () => void,
): () => void {
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
  const btns: Array<[string, string, () => void]> = [
    ["▶ NEW GAME", "px-btn px-btn-primary", onStart],
    ["☠ NEW GAME (HARDCORE)", "px-btn", onStartHardcore],
    ["? HOW TO PLAY", "px-btn", () => mountTutorialModal(root)],
  ];
  for (const [label, cls, fn] of btns) {
    const b = document.createElement("button");
    b.className = cls;
    b.textContent = label;
    b.addEventListener("click", fn);
    menu.appendChild(b);
  }
  screen.appendChild(menu);

  // Footer
  const footer = document.createElement("div");
  footer.className = "title-footer";

  const footerTop = document.createElement("div");
  footerTop.className = "title-footer-top";
  const version = document.createElement("span");
  version.textContent = "v1.5.0-beta-2";
  footerTop.appendChild(version);

  const footerBottom = document.createElement("div");
  footerBottom.className = "title-footer-bottom";
  const muteBtn = document.createElement("button");
  muteBtn.className = "title-mute-btn";
  muteBtn.textContent = isMuted() ? "MUSIC OFF" : "MUSIC ON";
  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const nowMuted = toggleMute();
    muteBtn.textContent = nowMuted ? "MUSIC OFF" : "MUSIC ON";
  });
  const sep = document.createElement("span");
  sep.textContent = "·";
  const credit = document.createElement("span");
  credit.className = "title-footer-credit";
  credit.textContent = "Music by hundredsense";
  footerBottom.append(muteBtn, sep, credit);

  footer.append(footerTop, footerBottom);
  screen.appendChild(footer);

  root.appendChild(screen);

  startMusic();

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
