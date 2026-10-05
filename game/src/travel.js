/** Planet routes: cinematic beats may be skipped; belt gameplay may not. */
import { IMG } from "./assets.js";
import { input, Particles, drawBackdrop, drawVignette, text, VIEW_W, VIEW_H } from "./engine.js";
import { sfx, startAmbience, stopMusic } from "./audio.js";
import { showHud, hideTouch, showTouch, flash, toast } from "./ui.js";

export const TRAVEL = {
  m1: { name: "Exxos", tint: "jungle", color: "#86C098", belt: false, out: "CANOPY APPROACH", back: "SPORE TRAIL", detail: "Green air and drifting spores. Skim the canopy, then settle." },
  m2: { name: "The World of Regrets", tint: "ruins", color: "#C9A05F", belt: true, out: "THE BROKEN RING", back: "DUST OF THE DIG", detail: "Cross the iron belt, then bank between the abandoned towers." },
  m3: { name: "The Hollow Signal", tint: "ice", color: "#A6CCE2", belt: true, dense: true, out: "AURORA DESCENT", back: "ICE-SHELF ESCAPE", detail: "Thread the outer belt. Follow the aurora through the white-out." },
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** Same physical vehicle as the pod parked on every world. */
export function drawPod(ctx, x, y, scale = 1, angle = 0, burn = 0, t = 0) {
  const img = IMG.spr_pod;
  if (!img) return;
  ctx.save();
  ctx.translate(x + 17 * scale, y + 15 * scale);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  if (burn > 0) {
    const len = (12 + Math.sin(t * 32) * 3) * burn;
    for (const [color, width, length] of [["#2c6cae", 9, len], ["#63c5ff", 5, len * .75], ["#e1f7ff", 2, len * .5]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-width / 2, 13); ctx.lineTo(width / 2, 13); ctx.lineTo(0, 13 + length); ctx.fill();
    }
  }
  ctx.drawImage(img, -17, -15);
  ctx.restore();
}
export function completeTravel(game, to) {
  if (to === "ship") game.toHub();
  else game.startLevel(to);
}
export class TravelScene {
  constructor(game, to, { from = "ship" } = {}) {
    this.game = game;
    this.to = to;
    this.from = from;
    this.homeward = to === "ship";
    this.route = TRAVEL[this.homeward ? from : to];
    this.legs = ["ignite", "climb", ...(this.route.belt ? ["belt"] : []), "fold", this.homeward ? "dock" : "arrive"];
    this.index = 0;
    this.phase = this.legs[0];
    this.phaseT = 0;
    this.t = 0;
    this.done = false;
    this.left = false;
    this.particles = new Particles(240);
    this.rocks = [];
    this.rockT = .6;
    this.hits = 0;
    this.attempts = 0;
    this.maxShields = game.difficulty.asteroidShields;
    this.shields = this.maxShields;
    this.pod = { x: 125, y: 170, inv: 0 };
    stopMusic();
    startAmbience("space");
    showHud(false);
    showTouch(true);
    flash(false);
    sfx("launch");
  }
  get phaseDur() { return { ignite: 2.6, climb: 2.8, belt: this.route.dense ? 12 : 9, fold: 3.5, arrive: 4.5, dock: 4 }[this.phase]; }
  advance() {
    if (this.done) return;
    this.index += 1;
    this.phaseT = 0;
    if (this.index >= this.legs.length) { this.finish(); return; }
    this.phase = this.legs[this.index];
    input.reset();
    if (this.phase === "belt") toast("Cross the belt: arrows / WASD to steer; DOWN / S or the touch buttons also work.", 4500);
    if (this.phase === "fold") sfx("fold");
  }
  finish() {
    if (this.done || this.left) return;
    this.done = true;
    completeTravel(this.game, this.to);
  }
  leave() { this.left = true; flash(false); }
  update(dt) {
    if (this.done || this.left) return;
    this.t += dt;
    this.phaseT += dt;
    if (input.pressed("pause")) { this.game.toHub(); return; }
    if (this.phase !== "belt" && (input.pressed("use") || input.pressed("jump"))) { this.advance(); return; }
    if (this.phase === "belt") this.updateBelt(dt);
    else {
      // Emit only in simulation updates, never in rendering.
      if (this.phase === "ignite" || this.phase === "arrive" || this.phase === "dock") {
        const ground = VIEW_H - 50;
        this.particles.add({ x: 150 + Math.random() * 100, y: ground - Math.random() * 9, vx: (Math.random() - .5) * 2, vy: -.4 - Math.random(), color: this.route.color, life: .8, size: 2, gravity: .02 });
      }
      if (this.phase === "fold") {
        const a = Math.random() * Math.PI * 2;
        this.particles.add({ x: 320 + Math.cos(a) * 230, y: 180 + Math.sin(a) * 140, vx: -Math.cos(a) * 4, vy: -Math.sin(a) * 3, color: "#80cfff", life: .7 });
      }
    }
    this.particles.update(dt);
    if (this.phaseT >= this.phaseDur) this.advance();
  }
  updateBelt(dt) {
    const p = this.pod;
    p.x = clamp(p.x + input.axisX() * 170 * dt, 35, 260);
    p.y = clamp(p.y + ((input.down("down") ? 1 : 0) - (input.down("up") || input.down("jump") ? 1 : 0)) * 180 * dt, 38, VIEW_H - 68);
    p.inv = Math.max(0, p.inv - dt);
    this.rockT -= dt;
    if (this.rockT <= 0) {
      this.rockT = this.route.dense ? .32 : .46;
      const spr = Math.random() < .65 ? "spr_ast_s" : "spr_ast_m";
      const img = IMG[spr];
      this.rocks.push({ x: VIEW_W + 30, y: 35 + Math.random() * (VIEW_H - 95), vx: -(210 + Math.random() * 80), w: img.width, h: img.height, spr });
    }
    for (const r of this.rocks) {
      r.x += r.vx * dt;
      if (!r.hit && p.inv === 0 && r.x < p.x + 30 && r.x + r.w > p.x + 4 && r.y < p.y + 27 && r.y + r.h > p.y + 5) {
        r.hit = true;
        p.inv = 1;
        this.shields -= 1;
        this.hits += 1;
        this.particles.burst(p.x + 17, p.y + 15, "#ffe0ac", 16, 2, .6);
        sfx("shield");
        if (this.shields <= 0) {
          this.attempts += 1;
          this.phaseT = 0;
          this.shields = this.maxShields;
          this.rocks = [];
          this.rockT = 1;
          toast("Route checkpoint restored. Stay in the clear lanes—ESC returns to the ship.", 3000);
          break;
        }
      }
    }
    this.rocks = this.rocks.filter((r) => r.x > -40);
  }
  surface(ctx, theme, t) {
    drawBackdrop(ctx, theme, { x: t * 35, y: 0 }, this.t);
    const ground = VIEW_H - 50;
    ctx.fillStyle = "#131b20"; ctx.fillRect(0, ground, VIEW_W, 50);
    ctx.fillStyle = this.route.color; ctx.fillRect(0, ground, VIEW_W, 2);
    if (theme === "ruins") {
      for (let i = 0; i < 7; i++) {
        const x = ((i * 113 - t * 85) % 800 + 800) % 800 - 70;
        ctx.fillStyle = "#362c25"; ctx.fillRect(x, ground - 55 - i % 3 * 20, 18, 75);
        ctx.fillStyle = "#9a7948"; ctx.fillRect(x + 4, ground - 42, 3, 12);
      }
    } else if (theme === "ice") {
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = `rgba(110,220,200,${.12 + i * .03})`; ctx.lineWidth = 7;
        ctx.beginPath();
        for (let x = 0; x <= VIEW_W; x += 10) { const y = 85 + i * 12 + Math.sin(x / 70 + t + i) * 20; if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.fillStyle = "#b8d5e6";
      for (let i = 0; i < 36; i++) ctx.fillRect((i * 73 - t * 140 + 2000) % VIEW_W, (i * 41 + t * 35) % ground, 5, 1);
    } else {
      ctx.fillStyle = "#a7d3a0";
      for (let i = 0; i < 24; i++) ctx.fillRect((i * 97 - t * 40 + 2000) % VIEW_W, 80 + (i * 43 + t * 12) % 190, 2, 2);
    }
    return ground;
  }
  draw(ctx) {
    const t = this.phaseT;
    const route = this.route;
    if (this.phase === "ignite") {
      const theme = this.homeward ? route.tint : "jungle";
      const ground = this.surface(ctx, theme, t);
      if (!this.homeward) ctx.drawImage(IMG.spr_ship, 35, ground - 144, 288, 144);
      const lift = ease((t - .6) / 2) * 70;
      drawPod(ctx, 290, ground - 60 - lift, 2, -.1 * ease(t / 2), clamp(t), this.t);
    } else if (this.phase === "climb") {
      drawBackdrop(ctx, "space", { x: t * 30, y: 0 }, this.t);
      ctx.fillStyle = this.homeward ? route.color : "#285344";
      ctx.beginPath(); ctx.arc(320, 580 + t * 55, 300, 0, Math.PI * 2); ctx.fill();
      drawPod(ctx, 280 + t * 16, 240 - ease(t / 2.8) * 160, 2, .25 + t * .3, 1, this.t);
    } else if (this.phase === "belt") {
      drawBackdrop(ctx, "space", { x: t * 45, y: 0 }, this.t);
      for (const r of this.rocks) ctx.drawImage(IMG[r.spr], Math.round(r.x), Math.round(r.y));
      if (!this.pod.inv || Math.floor(this.t * 16) % 2) drawPod(ctx, this.pod.x, this.pod.y, 1, -Math.PI / 2, 1, this.t);
      text(ctx, `INTEGRITY ${this.shields}/${this.maxShields}  ·  ${Math.ceil(Math.max(0, this.phaseDur - t))}s TO CLEAR`, 16, 18, "#9ddcff", "left", 11, "700");
      text(ctx, "ARROWS / WASD steer · SPACE climbs · ESC turn back", 16, VIEW_H - 20, "#c2d2e0", "left", 10);
    } else if (this.phase === "fold") {
      drawBackdrop(ctx, "space", { x: t * 80, y: 0 }, this.t);
      for (let i = 9; i > 0; i--) {
        ctx.strokeStyle = i % 2 ? "#7dbaff" : route.color;
        ctx.globalAlpha = .3; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(390, 175, i * 20 * ease(t), i * 13 * ease(t), t * .2 + i * .08, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const q = ease((t - .7) / 2.7);
      drawPod(ctx, 100 + q * 280, 155, 2 * (1 - q) + .1, Math.PI / 2, 1, this.t);
      text(ctx, "MASS FOLD · WORMHOLE LOCKED", 320, 290, "#b3deff", "center", 12, "700");
    } else if (this.phase === "arrive") {
      const ground = this.surface(ctx, route.tint, t);
      const q = ease(t / 4);
      const bank = route.tint === "ruins" ? Math.sin(t * 2) * .3 * (1 - q) : route.tint === "ice" ? Math.sin(t * 4) * .12 * (1 - q) : -.2 * (1 - q);
      drawPod(ctx, 490 - q * 250, 90 + q * (ground - 150), 2, bank, 1 - q, this.t);
    } else {
      // The wreck is on Exxos, not floating in space.
      const ground = this.surface(ctx, "jungle", t);
      ctx.drawImage(IMG.spr_ship, 75, ground - 192, 384, 192);
      const q = ease(t / 3.5);
      drawPod(ctx, 500 - q * 145, 75 + q * (ground - 135), 2 * (1 - .3 * q), -.3 * (1 - q), 1 - q, this.t);
      text(ctx, `RETURN FROM ${route.name.toUpperCase()}`, 16, 68, route.color, "left", 11, "700");
    }
    this.particles.draw(ctx, { x: 0, y: 0 });
    if (this.phase !== "belt") {
      text(ctx, this.homeward ? route.back : route.out, 16, 17, route.color, "left", 13, "700");
      text(ctx, route.detail, 16, 35, "#bac8d3", "left", 9);
      text(ctx, "SPACE / E next shot · ESC return to ship", VIEW_W - 16, VIEW_H - 20, "#8a98a6", "right", 9);
    }
    drawVignette(ctx, .65);
  }
}
