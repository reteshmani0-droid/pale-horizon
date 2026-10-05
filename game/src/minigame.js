/**
 * The field processors. Every world hands you one raw material and the ship
 * cannot use any of it until it has been through a rig. Three rigs, three
 * different kinds of attention - they are puzzles, not timers:
 *
 *   purify  rhythm      stop the filtration needle inside the band, three times
 *   smelt   memory      repeat the smelter's firing order, twice
 *   melt    regulation  hold the crucible inside the melt band for six seconds
 *
 * The rigs run on the same input map as the game (space/E to act, arrows to
 * answer, Q to dump heat) so nothing has to be relearned, and the level is
 * frozen behind them: a rig is a station, not a hazard.
 */
import { input } from "./engine.js";
import { sfx } from "./audio.js";

const $ = (id) => document.getElementById(id);

const INK = '#101a30';
const PANEL = '#213650';
const LINE = '#4b6980';
const TEXT = '#fff4d6';
const DIM = '#a5bdc9';
const LAMP = '#f6c38a';
const BLUE = '#8be3db';
const DANGER = "#cf5b45";
const BIO = "#86c098";
const ICE = "#a6cce2";

const RIGS = {
  purify: {
    title: "Filtration rig",
    brief: "The needle sweeps the column. Press SPACE when it crosses the lit band. Three clean pulls and the batch is food.",
    accent: BIO,
  },
  smelt: {
    title: "Induction smelter",
    brief: "Watch the firing order, then repeat it with the arrow keys. Two orders, or the crucible cracks.",
    accent: LAMP,
  },
  melt: {
    title: "Thermal crucible",
    brief: "Hold SPACE to bring the crucible up, release to let it fall. Keep the needle inside the band for six seconds. Q dumps heat.",
    accent: ICE,
  },
};

let active = null;
let ctx = null;

export const processorOpen = () => Boolean(active);

export function processorUpdate(dt) {
  if (!active) return;
  const rig = active;
  rig.update(dt);
  if (active === rig) rig.draw();
}

export function closeProcessor(success = false) {
  if (!active) return;
  const cb = active.onDone;
  active = null;
  if ($('minigame').contains(document.activeElement)) document.activeElement.blur();
  $("minigame").classList.add("hidden");
  input.reset();
  if (cb) cb(success);
}

export function openProcessor(kind, onDone) {
  if (active) return;
  const rig = RIGS[kind];
  if (!rig) return;
  ctx = $("mg-canvas").getContext("2d");
  ctx.imageSmoothingEnabled = false;
  $("mg-title").textContent = rig.title;
  $("mg-brief").textContent = rig.brief;
  $("minigame").classList.remove("hidden");
  active = make(kind, onDone, rig.accent);
  active.draw();
}

function make(kind, onDone, accent) {
  const base = { kind, accent, onDone, t: 0, flash: 0, message: "", won: false };
  if (kind === "purify") return buildPurify(base);
  if (kind === "smelt") return buildSmelt(base);
  return buildMelt(base);
}

/* ------------------------------------------------------------------ shared */
function frame(title, accent, progress) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, 398, 150);
  ctx.fillStyle = PANEL;
  ctx.fillRect(10, 10, 378, 130);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(10.5, 10.5, 377, 129);
  ctx.fillStyle = accent;
  ctx.fillRect(10, 10, 3, 130);
  ctx.font = "500 10px 'JetBrains Mono', monospace";
  ctx.fillStyle = DIM;
  ctx.textAlign = "left";
  ctx.fillText(title.toUpperCase(), 22, 26);
  if (progress !== undefined) {
    ctx.textAlign = "right";
    ctx.fillStyle = accent;
    ctx.fillText(progress, 376, 26);
  }
}

function bar(x, y, w, h, pct, color) {
  ctx.fillStyle = "#0b0e13";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, pct))), h);
  ctx.strokeStyle = LINE;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function readout(left, right, colour = DIM) {
  $("mg-left").textContent = left;
  $("mg-right").textContent = right;
  $("mg-right").style.color = colour;
}

/* ------------------------------------------------------------------ purify */
function buildPurify(base) {
  const rig = {
    ...base,
    marker: 0.5,
    dir: 1,
    speed: 0.62,
    band: 0.34,
    bandW: 0.17,
    hits: 0,
    need: 3,
    jolt: 0,
  };

  rig.update = (dt) => {
    rig.t += dt;
    rig.marker += rig.dir * rig.speed * dt;
    if (rig.marker > 1) { rig.marker = 1; rig.dir = -1; }
    if (rig.marker < 0) { rig.marker = 0; rig.dir = 1; }
    rig.jolt = Math.max(0, rig.jolt - dt * 2.4);
    rig.flash = Math.max(0, rig.flash - dt * 2);

    if (!(input.pressed("jump") || input.pressed("use"))) return;
    const inside = rig.marker >= rig.band && rig.marker <= rig.band + rig.bandW;
    if (inside) {
      rig.hits += 1;
      rig.flash = 1;
      sfx("unlock");
      rig.band = 0.08 + Math.random() * (0.75 - rig.bandW);
      rig.speed = Math.min(1.5, rig.speed + 0.14);
      if (rig.hits >= rig.need) {
        rig.won = true;
        sfx("win");
        closeProcessor(true);
      }
    } else {
      rig.hits = Math.max(0, rig.hits - 1);
      rig.jolt = 1;
      sfx("back");
    }
  };

  rig.draw = () => {
    frame("Filtration rig", BIO, `${rig.hits}/${rig.need}`);
    const x = 26;
    const y = 54;
    const w = 346;
    const h = 26;
    // the column
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // the lit band
    ctx.fillStyle = rig.flash > 0.4 ? "#a8dcb8" : BIO;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x + rig.band * w, y + 1, rig.bandW * w, h - 2);
    ctx.globalAlpha = 1;
    // tick marks
    ctx.fillStyle = LINE;
    for (let i = 0; i <= 10; i += 1) ctx.fillRect(x + (i / 10) * w, y + h - 3, 1, 3);
    // the needle
    const nx = x + rig.marker * w;
    ctx.fillStyle = rig.jolt > 0.4 ? DANGER : TEXT;
    ctx.fillRect(Math.round(nx), y - 6, 2, h + 12);
    // shots
    for (let i = 0; i < rig.need; i += 1) {
      ctx.fillStyle = i < rig.hits ? BIO : "#2b3340";
      ctx.fillRect(26 + i * 16, 100, 12, 6);
    }
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillStyle = DIM;
    ctx.textAlign = "left";
    ctx.fillText(rig.jolt > 0.5 ? "off the band - pressure lost" : "SPACE at the lit band", 26, 124);
    readout(`clean pulls ${rig.hits}/${rig.need}`, rig.jolt > 0.5 ? "PRESSURE LOSS" : "READY", rig.jolt > 0.5 ? DANGER : DIM);
  };

  return rig;
}

/* ------------------------------------------------------------------- smelt */
const DIRS = ["left", "right", "up", "down"];
const GLYPH = { left: "\u2190", right: "\u2192", up: "\u2191", down: "\u2193" };

function buildSmelt(base) {
  const rig = {
    ...base,
    round: 0,
    rounds: 2,
    seq: [],
    showIndex: -1,
    inputIndex: 0,
    phase: "show",
    timer: 1,
    fails: 0,
    wrong: 0,
  };

  const newSequence = () => {
    rig.seq = Array.from({ length: 4 }, () => DIRS[Math.floor(Math.random() * DIRS.length)]);
    rig.phase = "show";
    rig.showIndex = -1;
    rig.timer = 0.7;
    rig.inputIndex = 0;
  };
  newSequence();

  rig.update = (dt) => {
    rig.t += dt;
    rig.wrong = Math.max(0, rig.wrong - dt * 2);
    if (rig.phase === "show") {
      rig.timer -= dt;
      if (rig.timer <= 0) {
        rig.showIndex += 1;
        if (rig.showIndex >= rig.seq.length) {
          rig.phase = "input";
          rig.inputIndex = 0;
        } else {
          rig.timer = 0.52;
          sfx("ui");
        }
      }
      return;
    }
    if (rig.phase === 'wait') {
      rig.timer -= dt;
      if (rig.timer <= 0) newSequence();
      return;
    }
    if (rig.phase !== "input") return;
    for (const d of DIRS) {
      if (!input.pressed(d)) continue;
      if (d === rig.seq[rig.inputIndex]) {
        rig.inputIndex += 1;
        sfx("step_stone", { vol: 0.6 });
        if (rig.inputIndex >= rig.seq.length) {
          rig.round += 1;
          if (rig.round >= rig.rounds) {
            rig.won = true;
            sfx("win");
            closeProcessor(true);
            return;
          }
          sfx("relay");
          rig.phase = "wait";
          rig.timer = 0.9;
        }
      } else {
        rig.fails += 1;
        rig.wrong = 1;
        sfx("hurt");
        if (rig.fails >= 3) {
          closeProcessor(false);
          return;
        }
        newSequence();
      }
      return;
    }
  };

  rig.draw = () => {
    frame("Induction smelter", LAMP, `order ${Math.min(rig.rounds, rig.round + 1)}/${rig.rounds}`);
    const cell = 54;
    const gap = 12;
    const total = rig.seq.length * cell + (rig.seq.length - 1) * gap;
    const x0 = (398 - total) / 2;
    for (let i = 0; i < rig.seq.length; i += 1) {
      const x = x0 + i * (cell + gap);
      const y = 46;
      ctx.fillStyle = "#0b0e13";
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = LINE;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      const showing = rig.phase === "show" && i <= rig.showIndex;
      const answered = rig.phase !== "show" && i < rig.inputIndex;
      if (showing || answered) {
        ctx.fillStyle = rig.phase === "show" ? LAMP : "#4a5a6d";
        ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      }
      if (showing || answered || rig.phase === "input") {
        ctx.font = "22px 'Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = rig.phase === "show" ? INK : answered ? TEXT : DIM;
        ctx.fillText(GLYPH[rig.seq[i]], x + cell / 2, y + cell / 2 + 8);
      }
    }
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = rig.wrong > 0.4 ? DANGER : DIM;
    ctx.fillText(
      rig.phase === "show" ? "watch the firing order" : rig.phase === "wait" ? "order logged - recharging" : "repeat it with the arrow keys",
      199, 126
    );
    readout(`cracks ${rig.fails}/3`, rig.phase === "show" ? "READING" : "YOUR TURN", rig.wrong > 0.4 ? DANGER : DIM);
  };

  return rig;
}

/* -------------------------------------------------------------------- melt */
function buildMelt(base) {
  const rig = {
    ...base,
    temp: 20,
    band: 46,
    bandH: 20,
    bandDir: 1,
    bandSpeed: 7,
    held: 0,
    need: 6,
    vented: false,
    scorch: 0,
  };

  rig.update = (dt) => {
    rig.t += dt;
    rig.band += rig.bandDir * rig.bandSpeed * dt;
    if (rig.band > 74) { rig.band = 74; rig.bandDir = -1; }
    if (rig.band < 22) { rig.band = 22; rig.bandDir = 1; }
    rig.scorch = Math.max(0, rig.scorch - dt);

    rig.temp += (input.down("jump") ? 36 : -24) * dt;
    rig.temp = Math.max(0, Math.min(100, rig.temp));

    if (input.pressed("dash") && !rig.vented) {
      rig.vented = true;
      rig.temp = Math.max(0, rig.temp - 42);
      sfx("windgust");
    }

    const inside = rig.temp >= rig.band && rig.temp <= rig.band + rig.bandH;
    if (inside) {
      rig.held += dt;
      if (Math.floor(rig.held * 2) !== Math.floor((rig.held - dt) * 2)) sfx("ui", { vol: 0.3 });
      if (rig.held >= rig.need) {
        rig.won = true;
        sfx("win");
        closeProcessor(true);
      }
    } else if (rig.temp > rig.band + rig.bandH) {
      rig.held = Math.max(0, rig.held - dt * 0.7);
      rig.scorch = 1;
    } else if (rig.held > 0) {
      rig.held = Math.max(0, rig.held - dt * 0.25);
    }
  };

  rig.draw = () => {
    frame("Thermal crucible", ICE, `${rig.held.toFixed(1)} / ${rig.need.toFixed(1)}s`);
    const x = 60;
    const y = 40;
    const w = 26;
    const h = 84;
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = LINE;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // the crucible fill: rises from the bottom
    const fill = (rig.temp / 100) * h;
    ctx.fillStyle = rig.scorch > 0.4 ? "#b4603c" : ICE;
    ctx.fillRect(x + 1, y + h - fill, w - 2, Math.max(0, fill - 1));
    // the band it has to sit in
    const by = y + h - ((rig.band + rig.bandH) / 100) * h;
    const bh = (rig.bandH / 100) * h;
    ctx.fillStyle = ICE;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x + 1, by, w - 2, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ICE;
    ctx.beginPath();
    ctx.moveTo(x - 5, by);
    ctx.lineTo(x + w + 5, by);
    ctx.moveTo(x - 5, by + bh);
    ctx.lineTo(x + w + 5, by + bh);
    ctx.stroke();
    // the needle
    const ny = y + h - (rig.temp / 100) * h;
    ctx.fillStyle = rig.scorch > 0.4 ? DANGER : TEXT;
    ctx.fillRect(x + w + 2, Math.round(ny), 16, 2);
    // read-outs
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = DIM;
    ctx.fillText("CRUCIBLE", x - 26, y - 8);
    ctx.fillText(`${Math.round(rig.temp)}\u00b0`, x + w + 24, Math.round(ny) + 3);
    bar(160, 52, 200, 12, rig.held / rig.need, ICE);
    ctx.fillStyle = DIM;
    ctx.fillText("melt inside the band", 160, 44);
    ctx.fillText(rig.vented ? "coolant dumped" : "Q - dump coolant (once)", 160, 82);
    ctx.fillStyle = rig.scorch > 0.4 ? DANGER : DIM;
    ctx.fillText(rig.scorch > 0.4 ? "scorching - back it off" : "hold SPACE to heat", 160, 98);
    readout(`crucible ${Math.round(rig.temp)}%`, rig.scorch > 0.4 ? "SCORCH" : "NOMINAL", rig.scorch > 0.4 ? DANGER : DIM);
  };

  return rig;
}
