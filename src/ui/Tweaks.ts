import type { Game } from "../game/Game";

export function mountTweaks(root: HTMLElement, game: Game): void {
  const panel = document.createElement("div");
  panel.className = "px-tweaks";
  panel.style.cssText = `
    position: fixed; bottom: 8px; right: 8px; z-index: 9999;
    background: #3d3252; border: 2px solid #1a1428;
    padding: 8px 12px; font-family: 'VT323', monospace;
    font-size: 16px; color: #f4e4c1; display: none;
    box-shadow: 2px 2px 0 #1a1428;
  `;

  const title = document.createElement("div");
  title.textContent = "Tweaks";
  title.style.cssText = `
    font-family: 'Press Start 2P', monospace; font-size: 8px;
    color: #f0a040; margin-bottom: 6px; letter-spacing: 1px;
  `;
  panel.appendChild(title);

  addToggle(panel, "Cursor-local grid", game.cursorGridEnabled, (v) => {
    game.cursorGridEnabled = v;
  });

  root.appendChild(panel);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "F9") {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });
}

function addToggle(
  parent: HTMLElement,
  label: string,
  initial: boolean,
  onChange: (v: boolean) => void,
): void {
  const row = document.createElement("label");
  row.style.cssText = "display: flex; align-items: center; gap: 6px; cursor: pointer;";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = initial;
  cb.addEventListener("change", () => onChange(cb.checked));
  row.appendChild(cb);
  row.appendChild(document.createTextNode(label));
  parent.appendChild(row);
}
