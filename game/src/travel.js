/** Planet routes: cinematic beats may be skipped; belt gameplay may not. */
import { IMG } from "./assets.js";
import { input, Particles, drawBackdrop, drawPlanetGround, groundAt, drawVignette, text, VIEW_W, VIEW_H } from "./engine.js";
import { sfx, startAmbience, stopMusic } from "./audio.js";
import { showHud, hideTouch, showTouch, flash, toast } from "./ui.js";

export const TRAVEL = {
  m1: { name: "Exxos", tint: "jungle", color: "#86C098", belt: false, out: "CANOPY APPROACH", back: "SPORE TRAIL", detail: "Green air and drifting spores. Skim the canopy, then settle." },
  m2: { name: "The World of Regrets", tint: "ruins", color: "#C9A05F", belt: true, out: "THE BROKEN RING", back: "DUST OF THE DIG", detail: "Cross the iron belt, then bank between the abandoned towers." },
  m3: { name: "The Hollow Signal", tint: "ice", color: "#A6CCE2", belt: true, dense: true, out: "AURORA DESCENT", back: "ICE-SHELF ESCAPE", detail: "Thread the outer belt. Follow the aurora through the white-out." },
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
/** How far the planet limb falls away at the frame edges, and where it sits. */
const DROP = 34;
const GROUND = VIEW_H - 50;
const POD_HALF = 34;          // the pod lies on its back once it is skimming
const POD_UP = 30;            // and stands on its legs the rest of the time

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
    // Every route ends in two beats now: the dive from orbit, then the scrape
    // that puts the pod on the surface. Both are cinematic and skippable.
    this.legs = ["ignite", "climb", ...(this.route.belt ? ["belt"] : []), "fold", "dive", this.homeward ? "taxi" : "settle"];
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
    this.skid = [];           // contact points the scrape has already cut
    stopMusic();
    startAmbience("space");
    showHud(false);
    showTouch(true);
    flash(false);
    sfx("launch");
  }
  get phaseDur() { return { ignite: 3.2, climb: 3.6, belt: this.route.dense ? 12 : 9, fold: 3.4, dive: 3.8, settle: 4.6, taxi: 4.4 }[this.phase]; }
  advance() {
    if (this.done) return;
    this.index += 1;
    this.phaseT = 0;
    if (this.index >= this.legs.length) { this.finish(); return; }
    this.phase = this.legs[this.index];
    input.reset();
    if (this.phase === "belt") toast("Cross the belt: arrows / WASD to steer; DOWN / S or the touch buttons also work.", 4500);
    if (this.phase === "fold") sfx("fold");
    if (this.phase === "dive") { this.skid = []; sfx("shield"); }
  }
  finish() {
    if (this.done || this.left) return;
    this.done = true;
    completeTravel(this.game, this.to);
  }
  leave() { this.left = true; flash(false); }

  /* ------------------------------------------------------- pod poses by beat */

  /**
   * Where the pod is, how it is pointing and how hard it is burning during the
   * beats that move it. One source of truth: the dust the update step throws is
   * emitted at the same contact point the renderer draws.
   */
  podPose(t = this.phaseT) {
    if (this.phase === "ignite") {
      const lift = ease((t - .8) / 2.1);
      const horizon = GROUND + lift * lift * 430;
      const startY = groundAt(326, GROUND, DROP) - 62;
      return { x: 326 - lift * 40, y: startY - lift * lift * (startY - 46), scale: 2, angle: -.08 * lift, burn: clamp(t / .8), horizon, lift, alt: lift * lift * 2600 };
    }
    if (this.phase === "dive") {
      const q = clamp(t / 3.2);
      // Held high, then dropped: the hull falls hard for most of the beat and
      // only flattens out in the last fifth, which is what reads as a flare.
      const drop = Math.pow(q, 1.7);
      const flare = ease(clamp((q - .55) / .45));
      const horizon = VIEW_H + 300 - ease(q) * 320;
      const x = 500 - ease(q) * 250;
      const y = 34 + (groundAt(x, horizon, DROP) - 44 - 34) * drop;
      return { x, y, scale: 2, angle: -2.45 + flare * 1.1, burn: 1, horizon, q, flare, speed: 2.4 + q * 7.6, alt: 180 - q * 176 };
    }
    if (this.phase === "settle" || this.phase === "taxi") {
      const q = clamp(t / 3.4);
      const skid = 1 - Math.pow(1 - q, 3);          // quick first contact, long tail
      const from = this.homeward ? 560 : 312;
      const to = this.homeward ? 470 : 126;
      const x = from + (to - from) * skid;
      // The pod lies on its back while it slides, so the sprite's half-width is
      // what has to clear the ground, not its half-height.
      const gy = groundAt(x + POD_HALF / 2, GROUND, DROP);
      const skip = Math.abs(Math.sin(t * 22)) * 9 * Math.max(0, 1 - t / 1.2);
      return {
        x, y: gy - POD_HALF - POD_UP - 3 + skip, scale: 2,
        angle: -Math.PI / 2 + .05 + Math.max(0, .36 - t * .3),
        burn: clamp(1 - t / 2), gy, q, skip,
        speed: Math.abs(to - from) * 3 * Math.pow(1 - q, 2) / 3.4,
      };
    }
    return null;
  }

  /* ----------------------------------------------------------- simulation */

  update(dt) {
    if (this.done || this.left) return;
    this.t += dt;
    this.phaseT += dt;
    if (input.pressed("pause")) { this.game.toHub(); return; }
    if (this.phase !== "belt" && (input.pressed("use") || input.pressed("jump"))) { this.advance(); return; }
    if (this.phase === "belt") this.updateBelt(dt);
    else this.emit(dt);
    this.particles.update(dt);
    if (this.phaseT >= this.phaseDur) this.advance();
  }

  /** Dust, sparks and gravel. Never called from draw(). */
  emit(dt) {
    const pose = this.podPose();
    // Velocities here are per frame at 60fps: Particles.update scales by dt*60.
    if (this.phase === "ignite" && pose && this.phaseT < 1.7) {
      for (let i = 0; i < 3; i++) {
        const x = 326 + (Math.random() - .5) * 150;
        this.particles.add({
          x, y: groundAt(x, pose.horizon, DROP) - Math.random() * 6,
          vx: (Math.random() - .5) * 1.2, vy: -.3 - Math.random() * .9,
          color: i === 0 ? this.route.color : "#8b8574", life: .9, size: 2, gravity: .03,
        });
      }
    }
    if (this.phase === "dive" && pose) {
      // heat: the hull is coming in hot, so the streaks run back up the dive line
      for (let i = 0; i < 2; i++) {
        this.particles.add({
          x: pose.x + 12 + Math.random() * 46, y: pose.y + 8 + Math.random() * 30,
          vx: 1.2 + Math.random() * 2.4, vy: -.6 - Math.random() * 1.4,
          color: i ? "#ffcf8f" : "#fff3d9", life: .3, size: 1, gravity: 0,
        });
      }
    }
    if ((this.phase === "settle" || this.phase === "taxi") && pose) {
      // the scrape: sparks off the skid plate, a plume of dust behind the tail
      this.skid.push({ x: pose.x + POD_HALF, y: pose.gy });
      if (this.skid.length > 220) this.skid.shift();
      const fast = pose.speed > 22;
      const n = fast ? 3 : 1;
      for (let i = 0; i < n; i++) {
        this.particles.add({
          x: pose.x + 20 + Math.random() * 70, y: pose.gy - Math.random() * 10,
          vx: .3 + Math.random() * 1.5, vy: -.15 - Math.random() * .8,
          color: i === 0 && fast ? "#ffd6a0" : "#9d9a8a", life: .5 + Math.random() * .5,
          size: i === 0 && fast ? 1 : 3, gravity: .07,
        });
      }
    }
    if (this.phase === "fold") {
      const a = Math.random() * Math.PI * 2;
      this.particles.add({ x: 320 + Math.cos(a) * 230, y: 180 + Math.sin(a) * 140, vx: -Math.cos(a) * 4, vy: -Math.sin(a) * 3, color: "#80cfff", life: .7 });
    }
  }

  updateBelt(dt) {
    const p = this.pod;
    p.x = clamp(p.x + input.axisX() * 170 * dt, 35, 260);
    p.y = clamp(p.y + ((input.down("down") ? 1 : 0) - (input.down("up") || input.down("jump") ? 1 : 0)) * 180 * dt, 16, VIEW_H - 68);
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

  /* -------------------------------------------------------------- drawing */

  /** The surface: one curved limb, nothing on screen that reads as a wall. */
  surface(ctx, theme, t, horizon = GROUND) {
    drawBackdrop(ctx, theme, { x: t * 35, y: 0 }, this.t);
    drawPlanetGround(ctx, { horizon, drop: DROP, fill: "#131b20", edge: this.route.color, rim: "#e8b07a" });
    if (theme === "ruins") {
      for (let i = 0; i < 7; i++) {
        const x = ((i * 113 - t * 85) % 800 + 800) % 800 - 70;
        const gy = groundAt(x, horizon, DROP);
        ctx.fillStyle = "#362c25"; ctx.fillRect(x, gy - 55 - i % 3 * 20, 18, 75);
        ctx.fillStyle = "#9a7948"; ctx.fillRect(x + 4, gy - 42, 3, 12);
      }
    } else if (theme === "ice") {
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = `rgba(110,220,200,${.12 + i * .03})`; ctx.lineWidth = 7;
        ctx.beginPath();
        for (let x = 0; x <= VIEW_W; x += 10) { const y = 85 + i * 12 + Math.sin(x / 70 + t + i) * 20; if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.fillStyle = "#b8d5e6";
      for (let i = 0; i < 36; i++) ctx.fillRect((i * 73 - t * 140 + 2000) % VIEW_W, (i * 41 + t * 35) % (horizon - 20), 5, 1);
    } else {
      // grass standing on the curve, so the ground reads as ground
      ctx.fillStyle = "#a7d3a0";
      for (let i = 0; i < 30; i++) {
        const x = (i * 79 - t * 40 + 2000) % VIEW_W;
        const h = 7 + (i % 5) * 4;
        ctx.fillRect(x, groundAt(x, horizon, DROP) - h, 2, h);
      }
      ctx.fillStyle = "#c9e8b4";
      for (let i = 0; i < 18; i++) ctx.fillRect((i * 97 - t * 40 + 2000) % VIEW_W, 80 + (i * 43 + t * 12) % (horizon - 110), 2, 2);
    }
    return horizon;
  }

  /**
   * The groove, berm and gravel the landing scrape leaves behind it: the cut
   * soil reads lighter than the untouched ground it was gouged out of.
   */
  drawSkid(ctx) {
    if (this.skid.length < 2) return;
    const line = (dy, width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      this.skid.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy)));
      ctx.stroke();
    };
    line(4, 6, "#2b3128");          // soil turned over along the whole slide
    line(5, 2, "#171d19");          // the cut itself
    line(-4, 2, "#4e5844");         // berm thrown up on the trailing side
    ctx.fillStyle = "#6c7561";
    for (let i = 0; i < this.skid.length; i += 5) {
      const p = this.skid[i];
      ctx.fillRect(Math.round(p.x), Math.round(p.y - 7 - (i % 4)), 2, 1);
      if (i % 3 === 0) ctx.fillRect(Math.round(p.x + 3 + (i % 6)), Math.round(p.y + 8), 2, 1);
    }
  }

  draw(ctx) {
    const t = this.phaseT;
    const route = this.route;
    if (this.phase === "ignite") {
      // Launch: engines, dust, then the ground drops away under the ship.
      const pose = this.podPose();
      const theme = this.homeward ? route.tint : "jungle";
      this.surface(ctx, theme, t, pose.horizon);
      if (!this.homeward && IMG.spr_ship) {
        const gx = 150;
        ctx.drawImage(IMG.spr_ship, 16, groundAt(gx, pose.horizon, DROP) - 144, 288, 144);
      }
      if (pose.lift > .45) {
        ctx.globalAlpha = clamp((pose.lift - .45) / .55);
        drawBackdrop(ctx, "space", { x: t * 30, y: 0 }, this.t);
        ctx.globalAlpha = 1;
      }
      drawPod(ctx, pose.x, pose.y, pose.scale, pose.angle, pose.burn, this.t);
      text(ctx, "LIFT-OFF", 16, 54, route.color, "left", 10, "700");
      text(ctx, `ALT ${Math.round(pose.alt)} m · CLIMB VECTOR LOCKED`, 16, 68, "#bac8d3", "left", 9);
    } else if (this.phase === "climb") {
      // The planet we left, seen from above it at last: a ball that keeps
      // shrinking while the pod climbs away from it.
      drawBackdrop(ctx, "space", { x: t * 30, y: 0 }, this.t);
      const q = ease(t / 3.4);
      // The planet stays in frame while it shrinks, so the climb reads as
      // height gained rather than as a starfield with nothing else in it.
      const r = 300 - q * 180, cx = 300 - q * 40, cy = VIEW_H + 190 - q * 140;
      for (const [radius, color] of [[r, "#101b18"], [r * .9, "#16261f"], [r * .78, "#1b2c23"]]) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
      }
      // the world's own atmosphere, so each route looks like its destination
      ctx.globalAlpha = .10;
      ctx.fillStyle = route.color;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(232,160,92,0.22)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      ctx.strokeStyle = "rgba(150,205,225,0.13)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r + 9, Math.PI * 1.16, Math.PI * 1.84); ctx.stroke();
      // climbing: the pod is well above the surface now and still rising
      const py = 150 - q * 104;
      drawPod(ctx, 250 + q * 96, py, 2 - q * .55, .14, 1, this.t);
      text(ctx, "ATMOSPHERE CLEARED", 16, 54, route.color, "left", 10, "700");
      text(ctx, `ALT ${Math.round(2.6 + q * 237)} km · ${Math.round(1.6 + q * 4.4)} km/s`, 16, 68, "#bac8d3", "left", 9);
    } else if (this.phase === "belt") {
      drawBackdrop(ctx, "space", { x: t * 45, y: 0 }, this.t);
      for (const r of this.rocks) ctx.drawImage(IMG[r.spr], Math.round(r.x), Math.round(r.y));
      if (!this.pod.inv || Math.floor(this.t * 16) % 2) drawPod(ctx, this.pod.x, this.pod.y, 1, Math.PI / 2, 1, this.t);
      text(ctx, `INTEGRITY ${this.shields}/${this.maxShields}  ·  ${Math.ceil(Math.max(0, this.phaseDur - t))}s TO CLEAR`, 16, 18, "#9ddcff", "left", 11, "700");
      text(ctx, "ARROWS / WASD steer · SPACE climbs · ESC turn back", 16, VIEW_H - 20, "#c2d2e0", "left", 10);
    } else if (this.phase === "fold") {
      drawBackdrop(ctx, "space", { x: t * 80, y: 0 }, this.t);
      for (let i = 9; i > 0; i--) {
        ctx.strokeStyle = i % 2 ? "#7dbaff" : route.color;
        ctx.globalAlpha = .3; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(390, 175, i * 20 * ease(t), i * 13 * ease(t), t * .2 + i * .08, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const q = ease((t - .7) / 2.7);
      drawPod(ctx, 100 + q * 280, 155, 2 * (1 - q) + .1, Math.PI / 2, 1, this.t);
      text(ctx, "MASS FOLD · WORMHOLE LOCKED", 320, 290, "#b3deff", "center", 12, "700");
    } else if (this.phase === "dive") {
      // The nosedive: from high orbit straight down at the planet, nose first,
      // shedding heat, with the surface rushing up to meet it.
      const pose = this.podPose();
      drawBackdrop(ctx, "space", { x: t * 40, y: 0 }, this.t);
      ctx.globalAlpha = clamp(pose.q * 1.6);
      drawBackdrop(ctx, route.tint, { x: t * 35, y: 0 }, this.t);
      ctx.globalAlpha = 1;
      drawPlanetGround(ctx, { horizon: pose.horizon, drop: DROP, fill: "#131b20", edge: route.color, rim: "#e8b07a" });
      // The heat trail: streaks running back up the dive line from the tail,
      // longest while the hull is still coming in hard.
      ctx.save();
      ctx.translate(pose.x + 34, pose.y + 30);
      ctx.rotate(pose.angle);
      // local +y is behind the tail: the sprite's nose points up
      for (let i = 0; i < 7; i++) {
        const width = 20 - i * 2;
        const len = (26 + i * 15) * (1 - pose.flare * .8);
        ctx.globalAlpha = (.20 - i * .024) * (1 - pose.flare * .6);
        ctx.fillStyle = i < 2 ? "#ffe9c4" : i < 4 ? "#e8a05c" : "#a85a34";
        ctx.fillRect(-width / 2, 13 + i * 4, width, len);
      }
      ctx.restore();
      // a thin lit edge on the leading face, plus the nose glow
      ctx.fillStyle = `rgba(255,214,160,${.10 + pose.q * .22})`;
      ctx.fillRect(pose.x + 2, pose.y + 2, 40, 34);
      drawPod(ctx, pose.x, pose.y, pose.scale, pose.angle, pose.burn, this.t);
      text(ctx, `DESCENT · ${Math.round(pose.alt)} km · ${pose.speed.toFixed(1)} km/s`, 16, 54, route.color, "left", 10, "700");
      text(ctx, "TERMINAL VELOCITY · SURFACE IN 4 SECONDS", 16, 68, "#e0b6a4", "left", 9);
    } else {
      // Touchdown and the long scrape across the surface. No walls: the pod
      // slides as far as it slides, and the planet curves away underneath.
      const pose = this.podPose();
      this.surface(ctx, route.tint, t, GROUND);
      this.drawSkid(ctx);
      if (this.homeward && IMG.spr_ship) {
        const gx = 150;
        ctx.drawImage(IMG.spr_ship, -6, groundAt(gx, GROUND, DROP) - 192, 384, 192);
      }
      drawPod(ctx, pose.x, pose.y, pose.scale, pose.angle, pose.burn, this.t);
      if (this.phaseT < .9) {
        const flashAlpha = 1 - this.phaseT / .9;
        ctx.fillStyle = `rgba(255,214,160,${flashAlpha * .5})`;
        ctx.beginPath(); ctx.arc(pose.x + POD_HALF, pose.gy - 6, 30 + this.phaseT * 90, 0, Math.PI * 2); ctx.fill();
      }
      const settled = pose.speed < 4;
      text(ctx, settled ? (this.homeward ? "DOCKED BESIDE HORIZON-04" : "DESCENT ENDED") : "TOUCHDOWN", 16, 54, route.color, "left", 10, "700");
      text(ctx, settled
        ? `SURFACE SECURED · ${this.homeward ? "the wreck is still where you left it" : "hull intact, salvage stowed"}`
        : `GROUND SPEED ${Math.round(pose.speed * 1.3)} km/h · BLEEDING SPEED`, 16, 68, "#bac8d3", "left", 9);
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
