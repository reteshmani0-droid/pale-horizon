/**
 * The opening. Five beats, no dialogue box: approach from orbit, the nosedive
 * that tears the hull open, the long scrape across the surface, waking in the
 * pod, and the navigation read-out that tells you exactly how far from home you
 * are. The last beat hands control over to the ship interior, which is where
 * the game actually starts.
 *
 * The planet is drawn as a curved limb rather than a flat slab, so the crash
 * reads as a ship biting into a world instead of sliding along a wall; the
 * trench behind it is recorded where the hull actually touches.
 *
 * Extras (ESC or the pause key) skip a beat; the whole thing is under thirty
 * seconds and rewatchable from the test deck.
 */
import { IMG } from "./assets.js";
import { input, Particles, text, drawBackdrop, drawPlanetGround, groundAt, drawVignette, VIEW_W, VIEW_H } from "./engine.js";
import { sfx, startAmbience, stopAmbience, stopMusic } from "./audio.js";
import { showHud, hideTouch, flash } from "./ui.js";

const STARFIELD = { x: 0 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const HORIZON = 300;   // the surface the ship ends up on
const DROP = 26;       // how far that surface falls away at the frame edges

export class IntroScene {
  constructor(game, onDone) {
    this.game = game;
    this.onDone = onDone;
    this.index = 0;
    this.t = 0;
    this.shake = 0;
    this.done = false;
    this.left = false;
    this.particles = new Particles(200);
    this.trail = [];             // where the hull has actually touched down
    stopMusic();
    stopAmbience();
    startAmbience("space");
    showHud(false);
    hideTouch();
    flash(false);
    this.stages = [
      { name: "APPROACH", dur: 6.4 },
      { name: "NOSEDIVE", dur: 5.2 },
      { name: "SURFACE SKID", dur: 4.8 },
      { name: "WAKE", dur: 4.6 },
      { name: "STATUS", dur: 9.0 },
    ];
  }

  skip() {
    this.index += 1;
    this.t = 0;
    sfx("ui");
    if (this.index >= this.stages.length) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    flash(false);
    this.onDone();
  }

  leave() { this.left = true; flash(false); }

  update(dt) {
    if (this.done || this.left) return;
    this.t += dt;
    this.particles.update(dt);
    // The nosedive: compressed air burning off the leading edge, every frame.
    if (this.index === 1) {
      const d = this.divePose(this.t);
      // velocities are per frame at 60fps: Particles.update scales by dt*60
      for (let i = 0; i < 2; i++) {
        this.particles.add({
          x: d.x + 150 + Math.random() * 120, y: d.y + 30 + Math.random() * 60,
          vx: 1 + Math.random() * 1.6, vy: -.5 - Math.random() * 1.1,
          color: i ? "#e08c50" : "#fff0d0", life: .32, size: 1, gravity: 0,
        });
      }
    }
    // The skid: sparks off the nose, a dust plume, and gravel thrown clear.
    if (this.index === 2 && this.t < 3.9) {
      const pose = this.crashPose(this.t);
      const nose = pose.x + 250;
      this.trail.push({ x: nose, y: groundAt(nose, HORIZON, DROP) });
      if (this.trail.length > 400) this.trail.shift();
      const fast = this.t < 3.2;
      this.shake = Math.max(this.shake, fast ? .12 : 0);
      const n = fast ? 4 : 1;
      for (let i = 0; i < n; i++) {
        const x = nose - 160 + Math.random() * 200;
        this.particles.add({
          x, y: groundAt(x, HORIZON, DROP) - Math.random() * 14,
          vx: fast ? -(0.5 + Math.random() * 1.8) : (Math.random() - .5) * .5,
          vy: -.25 - Math.random() * 1.3,
          life: .6 + Math.random() * .8, size: i === 0 && fast ? 1 : 2 + (i % 2),
          color: i === 0 && fast ? "#ffd6a0" : (i % 2 ? "#9aa08c" : "#6f7360"),
          gravity: .1,
        });
      }
    }
    this.shake = Math.max(0, this.shake - dt);
    if (input.pressed("use") || input.pressed("jump") || input.pressed("pause")) { this.skip(); return; }
    const stage = this.stages[this.index];
    if (!stage) return;
    if (this.index === 1 && Math.random() < 0.5) this.shake = 0.35;
    if (this.t >= stage.dur) {
      if (this.index >= this.stages.length - 1) this.finish();
      else this.skip();
    }
  }

  /* --------------------------------------------------------------- drawing */
  draw(ctx) {
    const t = this.t;
    switch (this.index) {
      case 0: this.drawApproach(ctx, t); break;
      case 1: this.drawDive(ctx, t); break;
      case 2: this.drawImpact(ctx, t); break;
      case 3: this.drawWake(ctx, t); break;
      default: this.drawStatus(ctx, t); break;
    }
    const stage = this.stages[Math.min(this.index, this.stages.length - 1)];
    text(ctx, stage.name, 16, VIEW_H - 18, "#8B93A1", "left", 9);
    text(ctx, "ESC / SPACE to skip", VIEW_W - 16, VIEW_H - 18, "#5b6472", "right", 9);
    drawVignette(ctx, 0.85);
  }

  /** Orbit: the wreck still flying, one warm engine against a cold planet. */
  drawApproach(ctx, t) {
    drawBackdrop(ctx, "space", { x: t * 12, y: 0 }, t);
    const r = 220;
    const cx = VIEW_W * 0.62;
    const cy = VIEW_H + 190 - t * 10;
    ctx.fillStyle = "#14211c";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1d3229";
    ctx.beginPath();
    ctx.arc(cx - 26, cy - 16, r - 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#233b31";
    ctx.beginPath();
    ctx.arc(cx - 54, cy - 40, r - 70, 0, Math.PI * 2);
    ctx.fill();

    const drift = Math.min(1, t / 5.4);
    const x = 40 + drift * 180;
    const y = 74 + drift * 42 + Math.sin(t * 0.8) * 1.5;
    this.drawHull(ctx, x, y, .08 + drift * .12);
    // the engine, the only lit thing on screen
    ctx.fillStyle = "#E8A05C";
    ctx.fillRect(Math.round(x - 8), Math.round(y + 16), 8, 5);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.round(x - 14), Math.round(y + 18), 6, 2);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = "rgba(232,160,92,0.20)";
      ctx.fillRect(Math.round(x - 20 - i * 9), Math.round(y + 18 + Math.sin(t * 3 + i) * 2), 7, 2);
    }
    text(ctx, "SURVEY LANDER 04 - DESCENT BURN", 40, 56, "#E7E4DC", "left", 10);
    text(ctx, "approach vector locked", 40, 300, "#8B93A1", "left", 9);
  }

  drawHull(ctx, x, y, angle = 0, damaged = false) {
    const ship = damaged ? IMG.spr_ship : IMG.spr_ship_fly;
    if (!ship) return;
    ctx.save();
    ctx.translate(x + 144, y + 72);
    ctx.rotate(angle);
    ctx.drawImage(ship, -144, -72, 288, 144);
    ctx.restore();
  }

  /** Where the hull is during the dive: nose down, surface rising to meet it. */
  divePose(t) {
    const q = ease(t / 4.2);
    const horizon = VIEW_H + 250 - q * 300;
    const lowest = (angle) => 144 * Math.sin(angle) + 72 * Math.cos(angle);
    const angle = .30 + q * .55;
    const y = 10 + (horizon - lowest(angle) - 22 - 10) * q * q;
    return { x: 240 - q * 150, y, angle, q, horizon, alt: 96 - q * 92 };
  }

  /**
   * Nosedive: the hull is already through the worst of it, driving at the
   * surface nose-first with the air burning off its leading edge.
   */
  drawDive(ctx, t) {
    const d = this.divePose(t);
    drawBackdrop(ctx, "space", { x: t * 26, y: 0 }, t);
    // the sky it is falling into fades in over the last third of the drop
    ctx.globalAlpha = clamp01(d.q * 1.5);
    drawBackdrop(ctx, "jungle", { x: t * 20, y: 0 }, t);
    ctx.globalAlpha = 1;
    drawPlanetGround(ctx, { horizon: d.horizon, drop: DROP, fill: "#203529", edge: "#65785e", rim: "#e8b07a" });
    // Bow shock on the leading face: an oval of compressed air at the nose and
    // streaks peeled back over the hull, never a floating rectangle.
    const nx = d.x + 144 + Math.cos(d.angle) * 150;
    const ny = d.y + 72 + Math.sin(d.angle) * 150;
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(d.angle);
    ctx.fillStyle = `rgba(232,140,80,${.10 + d.q * .18})`;
    ctx.beginPath(); ctx.ellipse(12, 0, 44, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,228,190,${.06 + d.q * .12})`;
    ctx.beginPath(); ctx.ellipse(8, 0, 24, 12, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = (.18 - i * .03) * (1 + d.q);
      ctx.fillStyle = i < 2 ? "#ffe9c4" : "#c9773f";
      ctx.fillRect(-70 - i * 34 + Math.sin(t * 22 + i) * 4, -34 + i * 16, 46 + i * 10, 2 + (i % 2));
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const jitter = this.shake * 4;
    this.drawHull(ctx, d.x + Math.sin(t * 11) * jitter, d.y + Math.cos(t * 9) * jitter, d.angle);
    ctx.fillStyle = "#CF5B45";
    ctx.fillRect(Math.round(d.x + 60), Math.round(d.y + 8), 3, 3);
    text(ctx, "HULL TEMPERATURE CRITICAL", VIEW_W / 2, 60, "#CF5B45", "center", 11);
    text(ctx, `ALT ${Math.round(d.alt)} km · NOSE DOWN · BRACE`, VIEW_W / 2, 78, "#e0b6a4", "center", 9);
  }

  /**
   * Contact and the long scrape: the nose digs in, the hull skips once, then it
   * grinds along the curve shedding sparks, dust and gravel until it stops.
   */
  crashPose(t) {
    const q = Math.min(1, t / 3.6);
    const slowdown = 1 - Math.pow(1 - q, 3);
    const settle = Math.max(0, Math.min(1, (t - 3.1) / .7));
    const x = -40 + slowdown * 300;
    const gy = groundAt(x + 150, HORIZON, DROP);
    const skip = Math.abs(Math.sin(t * 16)) * 7 * Math.max(0, 1 - t / 1.3);
    return {
      x, gy, skip,
      y: gy - 136 + skip - settle * 6,
      angle: .26 * Math.max(0, 1 - t / 1.5) - .03 - Math.sin(t * 12) * .02 * (1 - q),
    };
  }

  /** The trench, its thrown berm, and the gravel the hull left along it. */
  drawTrench(ctx) {
    if (this.trail.length < 2) return;
    const line = (dy, width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      this.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy)));
      ctx.stroke();
    };
    line(6, 11, "#3c4a38");        // jungle soil turned over by 288px of hull
    line(7, 3, "#131a15");         // the cut the nose ploughed
    line(-6, 3, "#7d8a6b");        // berm thrown up on the trailing side
    ctx.fillStyle = "#4d5347";
    for (let i = 0; i < this.trail.length; i += 9) {
      const p = this.trail[i];
      ctx.fillRect(Math.round(p.x), Math.round(p.y - 10 - (i % 5)), 2 + (i % 3), 2);
    }
    ctx.fillStyle = "#83907a";
    for (let i = 4; i < this.trail.length; i += 13) {
      const p = this.trail[i];
      ctx.fillRect(Math.round(p.x - 22 - (i % 9)), Math.round(p.y + 9 + (i % 3)), 3, 2);
    }
  }

  drawImpact(ctx, t) {
    const p = this.crashPose(t);
    drawBackdrop(ctx, "jungle", { x: p.x * .6, y: 0 }, t);
    drawPlanetGround(ctx, { horizon: HORIZON, drop: DROP, fill: "#203529", edge: "#65785e", rim: "#e8b07a" });
    this.drawTrench(ctx);
    this.drawHull(ctx, p.x, p.y, p.angle, t >= 3.6);
    this.particles.draw(ctx, { x: 0, y: 0 });
    // Heat haze and dust fade after the ship has stopped; no full-screen whiteout.
    ctx.globalAlpha = Math.max(0, 1 - t / 4.8) * .22;
    ctx.fillStyle = "#b2ad86";
    ctx.fillRect(0, HORIZON - 30, Math.max(0, p.x + 260), 30);
    ctx.globalAlpha = 1;
    if (t > 3.6) text(ctx, "DESCENT ENDED · EMERGENCY CRYO RELEASE", 320, 60, "#c9d4c9", "center", 11);
  }

  /** Wake: dark, one rectangle of light, and a line of type. */
  drawWake(ctx, t) {
    ctx.fillStyle = "#04060a";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const open = Math.min(1, t / 2.6);
    const w = 260 * open;
    const h = 96 * open;
    ctx.fillStyle = "#101519";
    ctx.fillRect(VIEW_W / 2 - w / 2, VIEW_H / 2 - h / 2, w, h);
    ctx.fillStyle = a("#8FB6D6", Math.min(0.38, t * 0.24));
    ctx.fillRect(VIEW_W / 2 - w / 2 + 14, VIEW_H / 2 - h / 2 + 12, w * 0.36, h - 24);
    ctx.globalAlpha = 1;
    // the cracked pane, drawn over everything like it is in front of you
    ctx.strokeStyle = "rgba(231,228,220,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 + 30, VIEW_H / 2 - h / 2);
    ctx.lineTo(VIEW_W / 2 - 6, VIEW_H / 2 + 6);
    ctx.lineTo(VIEW_W / 2 + 34, VIEW_H / 2 + h / 2);
    ctx.stroke();
    const lines = ["you are awake.", "nothing else aboard is."];
    const shown = Math.min(lines.length, Math.floor(Math.max(0, t - 1) / 1.1));
    for (let i = 0; i < shown; i += 1) text(ctx, lines[i], 34, VIEW_H - 74 + i * 16, "#E7E4DC", "left", 11);
  }

  /** Status: out of the pod, reading the only instrument still working. */
  drawStatus(ctx, t) {
    drawBackdrop(ctx, "metal", STARFIELD, t);
    // the cabin, abstract: deck, bulkhead, one lamp
    ctx.fillStyle = "#1a2029";
    ctx.fillRect(0, VIEW_H - 120, VIEW_W, 120);
    ctx.fillStyle = "#2a323d";
    ctx.fillRect(0, VIEW_H - 124, VIEW_W, 4);
    ctx.fillStyle = "#e8a05c";
    ctx.fillRect(VIEW_W - 96, 34, 26, 4);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#e8a05c";
    ctx.fillRect(VIEW_W - 150, 38, 134, 66);
    ctx.globalAlpha = 1;

    const pods = IMG.spr_cryo_pod;
    if (pods) ctx.drawImage(pods, 60, VIEW_H - 164);

    const rows = [
      ["POSITION", "142,000,000 LY FROM EARTH"],
      ["LANDING", "UNCHARTED - THREE WORLDS IN RANGE"],
      ["FUEL TANKS", "EMPTY - 0 / 9 CELLS"],
      ["HULL PLATING", "TORN - REPAIR REQUIRED"],
      ["CRYO LOOP", "DRY - COOLANT LOST"],
      ["BIO REACTOR", "COLD - NO RATIONS"],
    ];
    const per = 0.85;
    const shown = Math.min(rows.length, Math.floor(Math.max(0, t - 0.6) / per));
    ctx.fillStyle = "rgba(13,16,21,0.9)";
    ctx.fillRect(230, 92, 356, 178);
    ctx.strokeStyle = "#2F3742";
    ctx.strokeRect(230.5, 92.5, 355, 177);
    text(ctx, "NAVIGATION", 246, 110, "#8FB6D6", "left", 10);
    ctx.fillStyle = "#232a33";
    ctx.fillRect(238, 118, 340, 1);
    for (let i = 0; i < shown; i += 1) {
      const y = 136 + i * 22;
      const part = Math.min(1, (t - 0.6 - i * per) * 4);
      ctx.globalAlpha = part;
      text(ctx, rows[i][0], 246, y, "#8B93A1", "left", 9);
      text(ctx, rows[i][1], 374, y, i === 0 ? "#E8A05C" : "#E7E4DC", "left", 9);
      ctx.globalAlpha = 1;
    }
    if (shown >= rows.length) {
      const blink = Math.sin(t * 4) > -0.2;
      if (blink) text(ctx, "hold RIGHT to step out of the pod", VIEW_W / 2, 292, "#E7E4DC", "center", 10);
    }
  }
}

/** Tiny colourize helper so the wake-up light can fade in. */
function a(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
