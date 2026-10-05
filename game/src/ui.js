import { IMG, flip } from "./assets.js";
import { input } from "./engine.js";
import { sfx } from "./audio.js";
import { DIFFICULTY, DIFFICULTY_ORDER } from "./core/config.js";

const $ = (id) => document.getElementById(id);

export const UI = {
  menu: null,
  panel: null,
  dialogueEl: null,
  queue: [],
  onDone: null,
  typing: null,
  touchVisible: false,
};

export function initUI() {
  UI.menu = $("menu");
  UI.panel = $("panel");
  UI.dialogueEl = $("dialogue");
  window.addEventListener("keydown", (e) => {
    if (e.target?.matches?.('input, textarea') || document.getElementById('codes').classList.contains('open') || !document.getElementById('admin').classList.contains('hidden')) return;
    if (UI.dialogueEl.classList.contains("hidden")) return;
    if (e.key === " " || e.key === "Enter" || e.key === "e" || e.key === "Escape") {
      e.preventDefault();
      advanceDialogue();
    }
  });
  UI.dialogueEl.addEventListener("click", advanceDialogue);
  initMenuKeys();
  detectTouch();
}

function detectTouch() {
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const small = Math.min(window.innerWidth, window.innerHeight) < 720;
  if (touch || small) {
    $("touch").classList.remove("hidden");
    UI.touchVisible = true;
    const map = { left: 'left', right: 'right', down: 'down', jump: 'jump', use: 'use', dash: 'dash', freeze: 'freeze', pause: 'pause', journal: 'journal' };
    for (const btn of document.querySelectorAll("#touch button")) {
      const key = map[btn.dataset.key];
      const release = () => input.setVirtual(key, false);
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        input.setVirtual(key, true);
      });
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
    }
  }
}

/* ------------------------------------------------------------------ menu -- */
/**
 * The title screen list. It takes real rows and two kinds of furniture:
 *   { group: "PLAY" }   a stencilled section heading
 *   { hint: "..." }     a line of small print under the heading
 * so the menu can be grouped instead of being eight equal-looking rows.
 *
 * Menus are also driven by the keyboard - up/down move the cursor, ENTER picks
 * - because a title screen you cannot use with the arrow keys is a title
 * screen most players will click at random.
 */
export function showMenu(items, { tagline, status } = {}) {
  const box = UI.menu.querySelector(".menu-buttons");
  box.innerHTML = "";
  if (tagline !== undefined) UI.menu.querySelector(".tagline").innerHTML = tagline;
  if (status) {
    // the read-out column: [label, value, class] rows, filled from the save
    $("menu-status").innerHTML = status
      .map((row) => `<li><span>${row[0]}</span><b class="${row[2] || ""}">${row[1]}</b></li>`)
      .join("");
  }
  UI.menuButtons = [];
  for (const it of items) {
    if (it.group || it.hint) {
      const row = document.createElement("p");
      row.className = it.group ? "group" : "hint";
      row.textContent = it.group || it.hint;
      box.appendChild(row);
      continue;
    }
    const b = document.createElement("button");
    // the label is its own grid cell so the sub-line can span the whole row
    b.innerHTML = it.sub
      ? `<span class="label">${it.label}</span><span class="sub">${it.sub}</span>`
      : `<span class="label">${it.label}</span>`;
    if (it.primary) b.classList.add("primary");
    b.disabled = Boolean(it.disabled);
    b.addEventListener("click", () => {
      sfx("select");
      it.onClick();
    });
    b.addEventListener("focus", () => {
      UI.menuIndex = UI.menuButtons.indexOf(b);
      paintMenuCursor();
    });
    b.addEventListener("mouseenter", () => {
      sfx("ui");
      UI.menuIndex = UI.menuButtons.indexOf(b);
      paintMenuCursor();
    });
    box.appendChild(b);
    UI.menuButtons.push(b);
  }
  // land the cursor on the first row that can actually be picked
  UI.menuIndex = Math.max(0, UI.menuButtons.findIndex((b) => !b.disabled));
  UI.menu.classList.remove("hidden");
  paintMenuCursor();
}

function paintMenuCursor() {
  const rows = UI.menuButtons || [];
  rows.forEach((b, i) => b.classList.toggle("cursor", i === UI.menuIndex));
}

/** Keyboard use of the menu, and of the panels that sit over it. */
function menuKey(e) {
  if (e.target?.matches?.('input, textarea, select') || !document.getElementById('admin').classList.contains('hidden') || !UI.dialogueEl.classList.contains('hidden')) return;
  const open = !UI.menu.classList.contains("hidden");
  const panel = !UI.panel.classList.contains("hidden");
  if (!open && !panel) return;
  if (panel) {
    // inside a panel, up/down walk the action row and ENTER presses it
    const acts = [...document.querySelectorAll("#panel button")].filter((b) => !b.disabled);
    if (!acts.length) return;
    const focused = acts.indexOf(document.activeElement);
    const at = focused >= 0 ? focused : Math.max(0, acts.findIndex((b) => b.classList.contains("cursor")));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (at + (e.key === "ArrowDown" ? 1 : -1) + acts.length) % acts.length;
      acts.forEach((b, i) => b.classList.toggle("cursor", i === next));
      acts[next].focus();
    } else if (e.key === "Enter" && at >= 0 && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      acts[at].click();
    }
    return;
  }
  const rows = (UI.menuButtons || []).filter((b) => !b.disabled);
  if (!rows.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const at = rows.indexOf(UI.menuButtons[UI.menuIndex]);
    const step = e.key === "ArrowDown" ? 1 : -1;
    UI.menuIndex = UI.menuButtons.indexOf(rows[(at + step + rows.length) % rows.length]);
    paintMenuCursor();
    UI.menuButtons[UI.menuIndex].focus();
    sfx("ui");
  } else if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
    e.preventDefault();
    const b = UI.menuButtons[UI.menuIndex];
    if (b) b.click();
  }
}

/** Called once from initUI so the menu keys are only wired in one place. */
export function initMenuKeys() {
  window.addEventListener("keydown", menuKey);
}

export function hideMenu() {
  UI.menu.classList.add("hidden");
}

/* ----------------------------------------------------------------- panel -- */
export function showPanel(title, body, actions, onMount) {
  $("panel-title").textContent = title;
  $("panel-body").innerHTML = body;
  const box = $("panel-actions");
  box.innerHTML = "";
  for (const a of actions || [{ label: "Back" }]) {
    const b = document.createElement("button");
    b.innerHTML = a.sub ? `${a.label}<span class="sub">${a.sub}</span>` : a.label;
    if (a.primary) b.classList.add("primary");
    b.addEventListener("click", () => {
      sfx("select");
      if (a.onClick) a.onClick();
      else hidePanel();
    });
    box.appendChild(b);
  }
  UI.panel.classList.remove("hidden");
  if (onMount) onMount($("panel-body"));
  UI.panel.querySelector('button:not(:disabled)')?.classList.add('cursor');
}

export function hidePanel() {
  if (UI.panel.contains(document.activeElement)) document.activeElement.blur();
  UI.panel.classList.add("hidden");
  input.reset();
}

export function panelOpen() {
  return !UI.panel.classList.contains("hidden");
}

/* --------------------------------------------------------------- dialogue -- */
export function dialogue(lines, onDone) {
  UI.queue = [...lines];
  UI.onDone = onDone || null;
  UI.dialogueEl.classList.remove("hidden");
  nextLine();
}

function nextLine() {
  if (!UI.queue.length) {
    UI.dialogueEl.classList.add("hidden");
    const cb = UI.onDone;
    UI.onDone = null;
    if (cb) cb();
    return;
  }
  const line = UI.queue.shift();
  $("speaker-name").textContent = line.name;
  drawPortrait(line.name);
  const full = line.text;
  UI.currentFull = full;
  const target = $("dialogue-text");
  let i = 0;
  clearInterval(UI.typing);
  target.textContent = "";
  UI.typing = setInterval(() => {
    i += 2;
    target.textContent = full.slice(0, i);
    if (i % 6 === 0) sfx("ui");
    if (i >= full.length) {
      target.textContent = full;
      clearInterval(UI.typing);
      UI.typing = null;
    }
  }, 16);
}

export function advanceDialogue() {
  if (UI.typing) {
    clearInterval(UI.typing);
    UI.typing = null;
    $("dialogue-text").textContent = UI.currentFull || "";
    return;
  }
  nextLine();
}

export function drawPortrait(name) {
  const c = $("portrait");
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "#151A21";
  g.fillRect(0, 0, c.width, c.height);
  const key = name === "MORIA" ? "spr_moria" : name === "ASTRONAUT" ? "p_idle0" : "d_hover1";
  const src = IMG[key] || IMG.d_hover1;
  if (!src) return;
  const scale = Math.max(1, Math.floor(Math.min(c.width / src.width, c.height / src.height)));
  const w = src.width * scale;
  const h = src.height * scale;
  g.drawImage(src, Math.floor((c.width - w) / 2), Math.floor((c.height - h) / 2), w, h);
}

/* ------------------------------------------------------------- hud/toast -- */
export function showHud(v) {
  $("hud").classList.toggle("hidden", !v);
}

export function setHud({ fuel, systems, suitless, objective, difficulty }) {
  if (fuel !== undefined) $("hud-fuel").textContent = fuel;
  if (systems) {
    // the three things the wreck still needs: hull, cryo loop, bio reactor
    for (const [id, value] of [
      ["hud-hull", systems.hull || 0],
      ["hud-cryo", systems.cryo || 0],
      ["hud-bio", systems.bio || 0],
    ]) {
      const el = $(id);
      if (!el) continue;
      el.querySelector("b").textContent = value;
      el.classList.toggle("done", value >= 3);
    }
  }
  if (suitless !== undefined) {
    const box = $("hud-suit");
    if (box) {
      box.classList.toggle("unsealed", Boolean(suitless));
      $("hud-suit-text").textContent = suitless ? "FLIGHT SUIT" : "EVA SEALED";
    }
  }
  if (objective !== undefined) $("hud-objective").textContent = objective;
  if (difficulty !== undefined) $("hud-diff").textContent = difficulty;
}

/** Debug overlay (F3): live state, frame budget and the last runtime error. */
export function setDebug(visible, lines) {
  const box = $("debug");
  box.classList.toggle("hidden", !visible);
  if (visible) $("debug-text").textContent = lines.join("\n");
}

export function setAlert(on) {
  $("hud-alert").classList.toggle("hidden", !on);
}

/** Suit integrity: filled masks flash while they are being lost. */
export function setMasks(current, max) {
  const box = $("hud-masks");
  if (!box) return;
  if (box.childElementCount !== max) {
    box.innerHTML = "";
    for (let i = 0; i < max; i += 1) {
      const s = document.createElement("span");
      s.className = "mask";
      box.appendChild(s);
    }
  }
  [...box.children].forEach((el, i) => {
    el.classList.toggle("empty", i >= current);
    el.classList.toggle("low", current <= 1 && i < current);
  });
}

/** Shared options screen: difficulty + volumes. Used by the menu and the pause. */
export function showOptions({ difficulty, volumes, onDifficulty, onVolume, onMute, muted, onBack, style = "", onStyle }) {
  const body = `
    <p><b>Suit difficulty</b> — changing it applies when the next level starts.</p>
    <div class="diff-row" id="diff-row"></div>
    <p style="margin-top:14px"><b>Pilot</b> — the shell colour, applied the next time a world loads.</p>
    <div class="diff-row" id="style-row"></div>
    <p style="margin-top:14px"><b>Volume</b></p>
    <label class="slider"><span>Music</span><input id="vol-music" type="range" min="0" max="100" value="${Math.round(volumes.music * 100)}"></label>
    <label class="slider"><span>Effects</span><input id="vol-sfx" type="range" min="0" max="100" value="${Math.round(volumes.sfx * 100)}"></label>
    <label class="slider"><span>Ambience</span><input id="vol-ambience" type="range" min="0" max="100" value="${Math.round(volumes.ambience * 100)}"></label>
    <label class="slider"><span>Master</span><input id="vol-master" type="range" min="0" max="100" value="${Math.round(volumes.master * 100)}"></label>
    <p style="margin-top:10px"><button id="mute-btn" class="inline">${muted ? "Unmute all sound" : "Mute all sound"}</button></p>`;
  showPanel("OPTIONS", body, [{ label: "Back", primary: true, onClick: onBack }], (root) => {
    const row = root.querySelector("#diff-row");
    for (const id of DIFFICULTY_ORDER) {
      const d = DIFFICULTY[id];
      const b = document.createElement("button");
      b.className = `diff-btn${id === difficulty ? " active" : ""}`;
      b.innerHTML = `${d.name}<span class="sub">${d.masks} masks</span>`;
      b.title = d.blurb;
      b.addEventListener("click", () => {
        sfx("select");
        onDifficulty(id);
        [...row.children].forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
        root.querySelector("#diff-blurb").textContent = d.blurb;
      });
      row.appendChild(b);
    }
    const blurb = document.createElement("p");
    blurb.id = "diff-blurb";
    blurb.className = "blurb";
    blurb.textContent = DIFFICULTY[difficulty].blurb;
    row.after(blurb);

    // pilot suit colours: three swaps of the same 26x32 sprite set
    const styleRow = root.querySelector("#style-row");
    const STYLES = [
      ["", "Issue ivory", "the original EVA shell, amber visor"],
      ["B", "Slate", "cold blue shell, ice visor"],
      ["C", "Ochre", "dust-world shell, canopy-green visor"],
    ];
    for (const [id, name, note] of STYLES) {
      const b = document.createElement("button");
      b.className = `diff-btn${id === style ? " active" : ""}`;
      b.innerHTML = `${name}<span class="sub">${note}</span>`;
      b.addEventListener("click", () => {
        sfx("select");
        [...styleRow.children].forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
        if (onStyle) onStyle(id);
      });
      styleRow.appendChild(b);
    }

    for (const kind of ["music", "sfx", "ambience", "master"]) {
      root.querySelector(`#vol-${kind}`).addEventListener("input", (e) => onVolume(kind, e.target.value / 100));
    }
    root.querySelector("#mute-btn").addEventListener("click", (e) => {
      const nowMuted = onMute();
      e.target.textContent = nowMuted ? "Unmute all sound" : "Mute all sound";
    });
  });
}

export function toast(msg, ms = 1800) {
  const t = $("toast");
  $("toast-text").textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(UI.toastTimer);
  UI.toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}

export function flash(on) {
  const f = $("flash");
  f.style.opacity = on ? "1" : "0";
}

/** The CAUGHT card: a catch ends the descent, so it has to read instantly. */
export function showCaught(on, why = "RESTARTING THE DESCENT") {
  const box = $("caught");
  if (!box) return;
  $("caught-line").textContent = why;
  box.classList.toggle("hidden", !on);
  box.classList.toggle("on", Boolean(on));
}

export function hideTouch() {
  $("touch").classList.add("hidden");
}

export function showTouch(v) {
  if (!UI.touchVisible) return;
  $("touch").classList.toggle("hidden", !v);
}
