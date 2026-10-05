/**
 * Gameplay entities. Movement is a small state machine (idle/run/jump/fall/
 * wallslide/dash/sneak) so animation, audio and physics stay in sync.
 */
import { IMG, flip } from "./assets.js";
import {
  input, moveEntity, overlap, sightClear, supported,
  TILE, PLATFORM_H,
} from "./engine.js";
import { PHYSICS, PLAYER } from "./core/config.js";
import { sfx } from "./audio.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));

/* =================================================================== player */
export class Player {
  /**
   * `abilities` is read from the save file: the double jump, the wall slide and
   * the survey chart are all bought with world currency, so a fresh pilot can
   * only run, sneak and jump. Levels are authored so the bought abilities are
   * what open the vertical sections.
   */
  constructor(x, y, diff, abilities = {}, opts = {}) {
    // `abilities` is really the lab's tech tree: every one of these is built
    // aboard the ship out of material taken off a world
    this.dash = Boolean(abilities.dash);
    this.doubleJump = Boolean(abilities.doubleJump);
    this.wall = Boolean(abilities.wallSlide);
    this.jetpack = Boolean(abilities.jetpack);
    this.freezeGun = Boolean(abilities.freezeGun);
    // aboard the ship the pilot is out of the EVA shell: a different sprite set
    this.suitless = Boolean(opts.suitless);
    // "" ivory, "B" slate, "C" ochre - chosen in Options
    this.style = opts.style || "";
    this.jetFuel = 1;
    this.freezeCool = 0;
    this.frozenSolid = 0;
    this.airJumps = 0;
    this.x = x;
    this.y = y;
    this.w = PLAYER.w;
    this.h = PLAYER.h;
    this.vx = 0;
    this.vy = 0;
    this.dir = 1;
    this.state = "idle";
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.anim = 0;
    this.speed = 0;
    this.hidden = false;
    this.noise = 0;
    this.ember = false;
    this.frozen = false;
    this.spawn = { x, y };
    this.difficulty = diff;

    this.maxMasks = diff.masks;
    this.masks = diff.masks;
    this.invuln = 0;
    this.downed = false;

    this.dashFrames = 0;
    this.dashCool = 0;
    this.airDashes = PHYSICS.airDashLimit;
    this.airJumps = 1;
    this.controlLock = 0;
    this.wallDir = 0;
    this.touchingWall = false;
    this.squash = 0;
    this.stretch = 0;
    this.surface = "stone";
    this.stepTimer = 0;
  }

  get dead() {
    return this.masks <= 0;
  }

  heal(amount = 999) {
    const before = this.masks;
    this.masks = clamp(this.masks + amount, 0, this.maxMasks);
    return this.masks - before;
  }

  damage(sourceX, amount = 1) {
    if (this.invuln > 0 || this.downed) return false;
    this.masks = clamp(this.masks - amount, 0, this.maxMasks);
    this.invuln = this.difficulty.invuln;
    const away = Math.sign(this.x + this.w / 2 - sourceX) || -this.dir;
    this.vx = away * PHYSICS.knockbackX;
    this.vy = -PHYSICS.knockbackY;
    this.dashFrames = 0;
    this.controlLock = 0.22;
    return true;
  }

  respawn() {
    this.x = this.spawn.x;
    this.y = this.spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.masks = this.maxMasks;
    this.invuln = 1.2;
    this.ember = false;
    this.dashFrames = 0;
    this.airJumps = 1;
    this.controlLock = 0;
    this.state = "idle";
  }

  /** Horizontal input, unless a wall jump or hurt knockback owns the stick. */
  inputX() {
    if (this.controlLock > 0 || this.dashFrames > 0) return 0;
    return input.axisX();
  }

  detectWall(map) {
    const probe = (px) => {
      const ty0 = Math.floor((this.y + 2) / TILE);
      const ty1 = Math.floor((this.y + this.h - 3) / TILE);
      const tx = Math.floor(px / TILE);
      for (let ty = ty0; ty <= ty1; ty += 1) if (map.isWall(tx, ty)) return true;
      return false;
    };
    this.wallDir = 0;
    if (probe(this.x - 1)) this.wallDir = -1;
    else if (probe(this.x + this.w + 1)) this.wallDir = 1;
    this.touchingWall = this.wallDir !== 0;
  }

  /** Which footstep sample fits the tile we are standing on. */
  surfaceUnder(map) {
    const theme = map.def.theme;
    if (theme === "metal") return "metal";
    if (theme === "jungle") return "grass";
    return "stone";
  }

  update(dt, level) {
    const step = dt * 60;
    const map = level.map;
    const P = PHYSICS;
    const wasGrounded = this.grounded;

    if (this.invuln > 0) this.invuln -= dt;
    if (this.dashCool > 0) this.dashCool -= dt * 60;
    if (this.controlLock > 0) this.controlLock -= dt;

    if (this.frozen) {
      this.vx *= 0.7;
      moveEntity(map, this, this.vx * step, P.gravity * step);
      this.state = "idle";
      return;
    }

    this.detectWall(map);
    const sneak = input.down("down") && this.grounded;
    const lockRun = this.controlLock > 0;

    /* ---- jump buffering / coyote time ---------------------------------- */
    if (input.pressed("jump")) this.buffer = P.jumpBufferFrames;
    else this.buffer = Math.max(0, this.buffer - step);
    this.coyote = this.grounded ? P.coyoteFrames : Math.max(0, this.coyote - step);

    /* ---- dash ---------------------------------------------------------- */
    const canDash = this.dash && this.dashCool <= 0 && this.dashFrames <= 0 && (this.grounded || this.airDashes > 0);
    if (input.pressed("dash") && canDash && !sneak) {
      this.dashFrames = P.dashFrames;
      this.dashCool = P.dashCooldownFrames;
      if (!this.grounded) this.airDashes -= 1;
      this.vx = this.dir * P.dashSpeed;
      this.vy = 0;
      sfx("dash");
      level.particles.burst(this.x + this.w / 2, this.y + this.h / 2, "#8FB6D6", 8, 1.1, 0.3, 0);
      level.camera.shake = Math.max(level.camera.shake, 0.25);
      level.ghosts.push(this.spriteKey(), this.x + this.w / 2 - 10, this.y + this.h - 24, this.dir < 0);
    }

    if (this.dashFrames > 0) {
      this.dashFrames -= step;
      this.vx = this.dir * P.dashSpeed;
      this.vy = 0;
      this.state = "dash";
      // the dash is a real horizontal translation: flat, gravity-free, stopped by walls
      const r = moveEntity(map, this, this.vx * step, 0);
      this.grounded = supported(map, this);
      if (this.grounded) this.airDashes = PHYSICS.airDashLimit;
      if (r.hitX) {
        this.dashFrames = 0;
        sfx("land");
        level.particles.dust(this.x + (this.dir > 0 ? this.w : 0), this.y + this.h, "#C7C3B8", 3);
      }
      if (Math.random() < 0.6) {
        level.particles.burst(this.x + this.w / 2, this.y + this.h / 2, "#8FB6D6", 1, 0.4, 0.25, 0);
      }
    } else {
      /* ---- horizontal movement ---------------------------------------- */
      const ax = this.inputX();
      const maxSpeed = sneak ? P.sneakSpeed : P.runSpeed;
      if (ax !== 0 && !lockRun) {
        this.dir = ax;
        this.vx = approach(this.vx, ax * maxSpeed, (this.grounded ? P.accelGround : P.accelAir) * step);
      } else if (this.grounded) {
        this.vx = approach(this.vx, 0, P.friction * step);
      } else {
        this.vx *= Math.pow(0.985, step);
      }
      if (Math.abs(this.vx) > P.runSpeed) this.vx = approach(this.vx, Math.sign(this.vx) * P.runSpeed, 0.12 * step);

      /* ---- wall slide -------------------------------------------------- */
      const pressingIntoWall = this.wall && this.touchingWall && ((this.wallDir < 0 && input.down("left")) || (this.wallDir > 0 && input.down("right")));
      if (!this.grounded && this.vy > 0 && pressingIntoWall) {
        this.vy = Math.min(this.vy, P.wallSlideSpeed);
        this.state = "wallslide";
        if (Math.random() < 0.25) {
          level.particles.burst(this.x + (this.wallDir > 0 ? this.w : 0), this.y + this.h * 0.6, "#C7C3B8", 1, 0.35, 0.3, 0.01);
        }
        if (Math.random() < 0.12) sfx("wallslide");
      }

      /* ---- jumping (ground, coyote, wall and the bought double jump) ---- */
      const wantJump = this.buffer > 0;
      const againstWall = !this.grounded && this.touchingWall && pressingIntoWall;
      if (wantJump && againstWall) {
        // wall jump first: it is the more specific move, and it must keep
        // working once the double jump is bought
        this.vy = -P.wallJumpY;
        this.vx = -this.wallDir * P.wallJumpX;
        this.dir = -this.wallDir;
        this.buffer = 0;
        this.controlLock = P.wallJumpLockFrames / 60;
        sfx("walljump");
        level.particles.burst(this.x + (this.wallDir > 0 ? this.w : 0), this.y + this.h / 2, "#E7E4DC", 7, 1.2, 0.35, 0.02);
      } else if (wantJump && !this.grounded && this.doubleJump && this.airJumps > 0) {
        // Impulse boot: one extra jump in mid-air, refreshes on landing
        this.airJumps -= 1;
        this.buffer = 0;
        this.vy = -P.jumpSpeed * 0.94;
      } else if (this.buffer > 0 && this.coyote > 0) {
        this.vy = sneak ? -P.sneakJumpSpeed : -P.jumpSpeed;
        this.buffer = 0;
        this.coyote = 0;
        this.stretch = 0.32;
        sfx("jump");
        level.particles.dust(this.x + this.w / 2, this.y + this.h, "#C7C3B8", 4);
      }
      if (!input.down("jump") && this.vy < -1.2) this.vy *= 1 - P.jumpReleaseCut * step * 0.5;

      /* ---- gravity + collision ---------------------------------------- */
      const gravity = this.vy < 0 && input.down("jump") ? P.gravity * 0.86 : P.gravity;
      this.vy = Math.min(this.vy + gravity * step, P.maxFall);

      const r = moveEntity(map, this, this.vx * step, this.vy * step);
      if (r.grounded) {
        this.airDashes = PHYSICS.airDashLimit;
        this.airJumps = 1;
        if (!wasGrounded) {
          sfx("land");
          this.squash = 0.38;
          const impact = Math.min(1, Math.abs(this.vy) / 9);
          level.particles.dust(this.x + this.w / 2, this.y + this.h, "#C7C3B8", 4 + Math.round(impact * 5));
          if (impact > 0.62) level.camera.shake = Math.max(level.camera.shake, 0.3 * impact);
        }
      }
      this.grounded = r.grounded;
      if (r.hitX && !this.grounded && this.touchingWall) this.vx = 0;

      /* ---- thruster pack ----------------------------------------------- */
      // a short burst of lift, refilled on the ground: enough to save a jump,
      // not enough to skip a level
      if (this.jetpack && !this.grounded && this.jetFuel > 0 && input.down("jump") && this.vy > -3.4) {
        this.vy -= 0.5 * step;
        this.jetFuel = Math.max(0, this.jetFuel - dt * 0.85);
        if (Math.random() < 0.6) {
          level.particles.burst(this.x + this.w / 2, this.y + this.h - 2, "#E8A05C", 1, 0.7, 0.3, 0);
        }
      }
      if (this.grounded) this.jetFuel = 1;
      if (this.freezeCool > 0) this.freezeCool -= dt;

      /* ---- state + animation ------------------------------------------ */
      if (!this.grounded) this.state = this.state === "wallslide" && pressingIntoWall && this.vy > 0 ? "wallslide" : this.vy < 0 ? "jump" : "fall";
      else if (sneak) this.state = "sneak";
      else if (Math.abs(this.vx) > 0.25) this.state = "run";
      else this.state = "idle";
    }

    this.speed = Math.abs(this.vx);
    this.hidden = Boolean(level.map.isTuft(Math.floor((this.x + this.w / 2) / TILE), Math.floor((this.y + this.h * 0.7) / TILE))) && this.speed < 0.9;
    this.noise = !this.grounded ? 0 : this.speed > 1.5 ? 1 : this.speed > 0.5 ? 0.35 : 0;
    this.anim += this.speed * step * 0.32 + (this.state === "run" ? step * 0.05 : 0);
    this.squash = Math.max(0, this.squash - dt * 2.6);
    this.stretch = Math.max(0, this.stretch - dt * 2.6);

    /* ---- footsteps ----------------------------------------------------- */
    if (this.grounded && this.speed > 0.6) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.26 - Math.min(0.12, this.speed * 0.03);
        sfx(`step_${this.surfaceUnder(level.map)}`, { vol: this.state === "sneak" ? 0.4 : 1 });
      }
    }
  }

  rect() {
    return this;
  }

  spriteKey() {
    const set = `${this.suitless ? "c" : "p"}${this.style}`;
    switch (this.state) {
      case "dash":
      case "wallslide":
      case "jump":
      case "fall":
        return `${set}_jump`;
      case "sneak":
        return `${set}_sneak`;
      case "run":
        return `${set}_walk${Math.floor(this.anim) % 4}`;
      default:
        return Math.floor(performance.now() / 420) % 2 ? `${set}_idle1` : `${set}_idle0`;
    }
  }

  interactTarget(level) {
    const px = this.x + this.w / 2;
    const py = this.y + this.h / 2;
    let best = null;
    let bestD = 30;
    for (const e of level.entityList) {
      if (!e.interactive || e.taken || e.drained) continue;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const d = Math.hypot(cx - px, cy - py);
      if (d < Math.max(30, e.w) && (!best || d < bestD)) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  draw(ctx, cam) {
    // invulnerability flicker
    if (this.invuln > 0 && Math.floor(performance.now() / 70) % 2 === 0) return;
    const key = this.spriteKey();
    const src = IMG[this.dir < 0 ? `${key}_flip` : key] || IMG[key];
    if (!src) return;

    const cx = this.x + this.w / 2;
    const feet = this.y + this.h;
    // squash & stretch around the feet
    const sx = 1 + this.squash * 0.5 - this.stretch * 0.25;
    const sy = 1 - this.squash * 0.45 + this.stretch * 0.35;
    const w = src.width * sx;
    const h = src.height * sy;

    if (this.grounded) {
      ctx.fillStyle = 'rgba(12,18,36,.4)';
      ctx.fillRect(Math.round(cx - 9 - cam.x), Math.round(feet - 1 - cam.y), 18, 2);
    }
    ctx.globalAlpha = this.hidden ? 0.55 : 1;
    ctx.drawImage(src, Math.round(cx - w / 2 - cam.x), Math.round(feet - h - cam.y), Math.round(w), Math.round(h));

    if (this.ember) {
      const e = IMG.spr_shard;
      const bob = Math.sin(performance.now() / 160) * 2;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#C9843F";
      ctx.fillRect(Math.round(cx - 9 - cam.x), Math.round(this.y - 18 + bob - cam.y), 18, 18);
      ctx.globalAlpha = 1;
      ctx.drawImage(e, Math.round(cx - 6 - cam.x), Math.round(this.y - 14 + bob - cam.y));
    }
    ctx.globalAlpha = 1;
  }
}

/* ================================================================== enemies */
export class Enemy {
  constructor(cfg, diff) {
    this.x = cfg.x * TILE;
    this.y = cfg.y * TILE;
    this.w = 22;
    this.h = 14;
    this.diff = diff;
    this.home = { x: this.x, y: this.y };
    this.range = (cfg.range || 3) * TILE;
    this.dir = cfg.dir || 1;
    this.baseSpeed = 0.7;
    this.state = "patrol";
    this.timer = 0;
    this.anim = 0;
    this.contactCool = 0;
    this.pauseTimer = 0;
    this.vision = (cfg.vision || 132) * diff.vision;
    this.hearing = (cfg.hearing || 96) * diff.hearing;
    this.alertSeconds = diff.alertSeconds;
    this.chaseSpeed = 1.45 * diff.enemySpeed;
    this.patrolPause = 0;
    // frozen solid by the cryo projector: no hunting, no contact
    this.frozen = 0;
  }

  /**
   * The cryo projector's effect. Frozen, a creeper cannot feel, hear, move or
   * catch anyone until it thaws - which is the only thing the projector does.
   */
  freeze(seconds) {
    this.frozen = Math.max(this.frozen, seconds);
    this.state = "patrol";
    this.timer = 0;
  }

  thawTick(dt) {
    if (this.frozen <= 0) return false;
    this.frozen -= dt;
    this.state = "patrol";
    return true;
  }

  get speed() {
    return this.baseSpeed * this.diff.enemySpeed;
  }

  reset() {
    this.x = this.home.x;
    this.y = this.home.y;
    this.state = "patrol";
    this.timer = 0;
    this.contactCool = 0;
    this.vision = (this.cfgVision || 132) * this.diff.vision;
    this.hearing = (this.cfgHearing || 96) * this.diff.hearing;
  }

  eye() {
    return { x: this.x + this.w / 2 + this.dir * 8, y: this.y + 5 };
  }

  canSee(player, level) {
    if (this.frozen > 0) return false;
    if (player.hidden) return false;
    const eye = this.eye();
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const dx = px - eye.x;
    const dy = py - eye.y;
    const dist = Math.hypot(dx, dy);
    let range = this.vision;
    if (player.speed < 0.9) range *= 0.55; // sneaking halves detection
    if (dist > range) return false;
    if (Math.abs(dy) > (this.fly ? 70 : 46)) return false;
    if (dx * this.dir < -6) return false;
    return sightClear(level.map, eye.x, eye.y, px, py);
  }

  hears(player) {
    if (this.frozen > 0) return false;
    if (!player.noise) return false;
    const d = Math.hypot(player.x - this.x, player.y - this.y);
    return d < this.hearing * (player.noise >= 1 ? 1 : 0.5);
  }

  chaseStep(dt, level) {
    const p = level.player;
    this.timer -= dt;
    const dirTo = Math.sign(p.x + p.w / 2 - (this.x + this.w / 2)) || this.dir;
    this.dir = dirTo;
    this.x += dirTo * this.chaseSpeed * (dt * 60);
    if (this.timer <= 0) {
      this.state = "patrol";
      sfx("alertOff");
      level.onEnemyCalm(this);
    }
  }

  contact(level) {
    const p = level.player;
    if (this.contactCool > 0) return;
    if (overlap(this, p)) {
      this.contactCool = 0.9;
      level.onEnemyContact(this);
    }
  }
}

export class Creeper extends Enemy {
  constructor(cfg, diff) {
    super(cfg, diff);
    this.cfgVision = cfg.vision || 132;
    this.cfgHearing = cfg.hearing || 96;
    this.w = 22;
    this.h = 14;
    this.fly = false;
    this.baseSpeed = 0.7;
    this.pullsUnder = true;          // a catch drags the pilot under the roots
    this.catchLine = "PULLED UNDER THE ROOTS";
  }

  update(dt, level) {
    const step = dt * 60;
    const p = level.player;
    this.anim += step * 0.12;
    if (this.contactCool > 0) this.contactCool -= dt;
    // frozen solid: it stands where it was until it thaws
    if (this.thawTick(dt)) return;

    const sees = this.canSee(p, level);
    const hears = this.hears(p);

    if (this.state === "patrol") {
      if (this.pauseTimer > 0) {
        this.pauseTimer -= dt;
        if (Math.random() < 0.08) level.particles.dust(this.x + this.w / 2, this.y + this.h);
      } else {
        this.x += this.dir * this.speed * step;
        if (Math.abs(this.x - this.home.x) > this.range) {
          this.dir *= -1;
          this.x = clamp(this.x, this.home.x - this.range, this.home.x + this.range);
          this.pauseTimer = 0.4 + Math.random() * 0.7;
        }
        const aheadX = this.x + (this.dir > 0 ? this.w + 2 : -2);
        const feet = Math.floor((this.y + this.h + 1) / TILE);
        if (level.map.isWall(Math.floor(aheadX / TILE), feet - 1) || !level.map.isWall(Math.floor(aheadX / TILE), feet)) {
          this.dir *= -1;
        }
      }
      if (sees || hears) {
        this.state = "alert";
        this.timer = this.alertSeconds;
        sfx("alarm");
        level.particles.ring(this.x + this.w / 2, this.y + 6, "#CF5B45", 10, 1.6, 0.45);
        level.onAlert(this);
      }
    } else {
      this.chaseStep(dt, level);
      moveEntity(level.map, this, 0, 0.42 * step);
    }
    moveEntity(level.map, this, 0, 0.5 * step);
    if (level.map.isWater(Math.floor((this.x + this.w / 2) / TILE), Math.floor((this.y + this.h) / TILE))) {
      this.reset();
    }
    this.contact(level);
  }

  /**
   * A creeper has no eyes. What is drawn here is its reach: a wedge of disturbed
   * soil running along the ground in front of the trap, which is exactly the
   * area the plant feels footsteps through. Sneaking shortens it; grass over
   * roots deadens it, which is why standing still in tall grass hides you.
   */
  drawCone(ctx, cam) {
    const range = this.state === "alert" ? this.vision * 0.8 : this.vision;
    const foot = this.y + this.h;
    ctx.fillStyle = this.state === "alert" ? "rgba(246,96,96,0.22)" : "rgba(150,220,130,0.13)";
    ctx.beginPath();
    ctx.moveTo(this.x + this.w / 2 - cam.x, foot - cam.y);
    const spread = 0.30;
    for (let i = 0; i <= 8; i += 1) {
      const a = -spread + (spread * 2 * i) / 8;
      const ang = this.dir > 0 ? a : Math.PI - a;
      ctx.lineTo(
        this.x + this.w / 2 + Math.cos(ang) * range - cam.x,
        foot + Math.sin(ang) * 14 - cam.y
      );
    }
    ctx.closePath();
    ctx.fill();
  }

  draw(ctx, cam) {
    const name = this.state === "alert" ? "cr_snap" : `cr_walk${Math.floor(this.anim) % 4}`;
    const spr = (this.dir < 0 ? flip(name) : IMG[name]) || IMG[name];
    if (!spr) return;
    ctx.drawImage(spr, Math.round(this.x + this.w / 2 - spr.width / 2 - cam.x), Math.round(this.y + this.h - spr.height + 2 - cam.y));
    if (this.state === "alert") {
      const a = IMG.ui_alert;
      const y = this.y - 16 - cam.y + Math.sin(performance.now() / 110) * 1.5;
      ctx.drawImage(a, Math.round(this.x + this.w / 2 - a.width / 2 - cam.x), Math.round(y));
    }
  }
}

export class Bird extends Enemy {
  constructor(cfg, diff) {
    super(cfg, diff);
    this.cfgVision = cfg.vision || 150;
    this.cfgHearing = 0;
    this.w = 20;
    this.h = 10;
    this.fly = true;
    this.baseSpeed = 0.62;
    this.hoverY = cfg.y * TILE;
    this.hearing = 0;
    this.shadowY = null;             // ground under the bird, found each moment
    this.shadowTick = 0;
    this.pullsUnder = false;         // a bird lifts the pilot instead
    this.catchLine = "TAKEN UP INTO THE AIR";
  }

  reset() {
    super.reset();
    this.y = this.home.y;
    this.hoverY = this.home.y;
  }

  update(dt, level) {
    const step = dt * 60;
    const p = level.player;
    this.anim += step * 0.22;
    if (this.contactCool > 0) this.contactCool -= dt;
    // find the ground underneath, so the shadow lands on something real
    this.shadowTick -= dt;
    if (this.shadowTick <= 0) {
      this.shadowTick = 0.12;
      const col = Math.floor((this.x + this.w / 2) / TILE);
      const from = Math.floor((this.y + this.h) / TILE);
      this.shadowY = null;
      for (let i = 0; i < 16 && this.shadowY === null; i += 1) {
        if (level.map.isWall(col, from + i)) this.shadowY = (from + i) * TILE;
      }
    }
    if (this.thawTick(dt)) return;
    const sees = this.canSee(p, level);

    if (this.state === "patrol") {
      this.path = this.path || 1;
      this.x += this.path * this.speed * step;
      this.y = this.hoverY + Math.sin(performance.now() / 420 + this.home.x) * 3;
      if (Math.abs(this.x - this.home.x) > this.range) {
        this.path *= -1;
        this.x = clamp(this.x, this.home.x - this.range, this.home.x + this.range);
      }
      this.dir = this.path;
      if (sees) {
        this.state = "alert";
        this.timer = this.alertSeconds;
        sfx("alarm");
        level.particles.ring(this.x + this.w / 2, this.y + 5, "#CF5B45", 10, 1.6, 0.45);
        level.onAlert(this);
      }
    } else {
      this.timer -= dt;
      const dirTo = Math.sign(p.x + p.w / 2 - (this.x + this.w / 2)) || this.dir;
      this.dir = dirTo;
      this.y += (p.y - 26 - this.y) * Math.min(1, dt * 1.4);
      this.x += dirTo * this.chaseSpeed * step;
      if (this.timer <= 0) {
        this.state = "patrol";
        sfx("alertOff");
        level.onEnemyCalm(this);
      }
    }
    this.contact(level);
  }

  /** The bird's own shadow, cast on whatever is underneath it. */
  drawShadow(ctx, cam) {
    if (this.shadowY === null) return;
    const diving = this.state === "alert";
    ctx.globalAlpha = diving ? 0.32 : 0.16;
    ctx.fillStyle = "#0b1014";
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2 - cam.x, this.shadowY - cam.y, diving ? 16 : 22, diving ? 5 : 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  draw(ctx, cam) {
    const name = this.state === "alert" ? "b_swoop" : `b_fly${Math.floor(this.anim) % 2}`;
    this.drawShadow(ctx, cam);       // under the bird, so the bird stays on top
    const spr = (this.dir < 0 ? flip(name) : IMG[name]) || IMG[name];
    if (!spr) return;
    ctx.drawImage(spr, Math.round(this.x + this.w / 2 - spr.width / 2 - cam.x), Math.round(this.y + this.h - spr.height - cam.y));
    if (this.state === "alert") {
      const a = IMG.ui_alert;
      ctx.drawImage(a, Math.round(this.x + this.w / 2 - a.width / 2 - cam.x), Math.round(this.y - 12 - cam.y));
    }
  }
}

/* ==================================================================== props */
export class Block {
  constructor(cfg) {
    this.x = cfg.x * TILE;
    this.y = cfg.y * TILE;
    this.w = 16;
    this.h = 16;
    this.home = { x: this.x, y: this.y };
  }

  reset() {
    this.x = this.home.x;
    this.y = this.home.y;
  }

  settle(level) {
    for (let i = 0; i < 40; i += 1) {
      const r = moveEntity(level.map, this, 0, 1.2);
      if (r.grounded) break;
    }
    this.x = Math.round(this.x / 4) * 4;
  }

  draw(ctx, cam) {
    ctx.drawImage(IMG.spr_block, Math.round(this.x - cam.x), Math.round(this.y - cam.y));
  }
}

export class Plate {
  constructor(cfg) {
    this.x = cfg.x * TILE;
    this.y = cfg.y * TILE + 10;
    this.w = 16;
    this.h = 6;
    this.group = cfg.group || 0;
    // "frozen": the plate reads weight only when whatever is standing on it is
    // frozen solid, which is what turns the cryo projector into a puzzle tool
    this.wants = cfg.wants || null;
    this.pressed = false;
  }

  /** Things that can hold a plate down: crates, creepers and vent pitchers. */
  weights(level) {
    const out = [...level.blocks];
    for (const e of level.entities) if (typeof e.frozen === "number" && !e.taken) out.push(e);
    return out;
  }

  update(dt, level) {
    const wasPressed = this.pressed;
    if (this.wants === "frozen") {
      // an ice-locked creeper: it has to be frozen while it is over the plate, so
      // the puzzle is where you shoot, not how fast you run
      this.pressed = this.weights(level).some((e) => e.frozen > 0 && !e.taken && overlap(this, e));
    } else {
      this.pressed = level.blocks.some((b) => overlap(this, b)) || overlap(this, level.player);
    }
    if (this.pressed && !wasPressed) {
      sfx("plate");
      level.particles.burst(this.x + 8, this.y, "#E8A05C", 8, 0.9, 0.4);
    }
  }

  draw(ctx, cam) {
    ctx.drawImage(this.pressed ? IMG.tile_plate_on : IMG.tile_plate, Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    if (this.wants === "frozen") {
      // a frost-blue pip so the plate reads as a different puzzle at a glance
      ctx.fillStyle = this.pressed ? "#A6CCE2" : "#3b4a58";
      ctx.fillRect(Math.round(this.x + 6 - cam.x), Math.round(this.y - 3 - cam.y), 4, 2);
    }
  }
}

export class Door {
  constructor(cfg, level) {
    this.tx = cfg.x;
    this.ty = cfg.y;
    this.hTiles = cfg.h || 3;
    this.tilesWide = cfg.w || 1;
    this.x = cfg.x * TILE;
    this.y = cfg.y * TILE;
    this.w = this.tilesWide * TILE;
    this.h = this.hTiles * TILE;
    this.group = cfg.group || 0;
    this.source = cfg.source || "plate";
    this.invert = Boolean(cfg.invert);
    // `needs`: how many plates of the group have to be held at once (a seal you
    // have to feed two crates). `hold`: seconds the gate stays open after the
    // last plate lets go, which is what makes a door a running problem.
    this.needs = cfg.needs || 0;
    this.hold = cfg.hold || 0;
    this.charge = 0;
    this.solid = false;
    this.level = level;
    this.refresh(level);
  }

  setSolid(v) {
    for (let iy = 0; iy < this.hTiles; iy += 1) {
      for (let ix = 0; ix < this.tilesWide; ix += 1) this.level.map.set(this.tx + ix, this.ty + iy, v);
    }
  }

  powered(level) {
    const pool = (this.source === "relay" ? level.relays : level.plates) || [];
    const mine = pool.filter((s) => s.group === this.group);
    if (!mine.length) return false;
    if (this.source === "relay") return mine.every((s) => s.active);
    const held = mine.filter((s) => s.pressed).length;
    return held >= (this.needs || mine.length);
  }

  /** Powered now, or still running on the few seconds a `hold` door carries. */
  live(level) {
    return this.powered(level) || (this.hold > 0 && this.charge > 0);
  }

  refresh(level) {
    const live = this.live(level);
    this.solid = this.invert ? live : !live;
    this.setSolid(this.solid ? 1 : 0);
    level.rebake();
  }

  update(dt, level) {
    if (this.powered(level)) this.charge = this.hold;
    else if (this.charge > 0) this.charge = Math.max(0, this.charge - dt);
    const live = this.live(level);
    let solid = this.invert ? live : !live;
    // Never materialise a closing gate inside the pilot or a movable crate.
    if (solid && !this.solid && [level.player, ...level.blocks].some((e) => overlap(this, e))) solid = false;
    if (solid === this.solid) return;
    this.solid = solid;
    this.setSolid(solid ? 1 : 0);
    level.rebake();
    sfx("door");
    level.camera.shake = Math.max(level.camera.shake, 0.4);
    level.particles.burst(this.x + this.w / 2, this.y + 8, "#E8A05C", 12, 1.4, 0.5);
  }

  draw(ctx, cam) {
    if (this.hold > 0) {
      const x = Math.round(this.x - cam.x);
      const y = Math.round(this.y - cam.y - 6);
      ctx.fillStyle = '#263442'; ctx.fillRect(x, y, this.w, 3);
      ctx.fillStyle = '#8fd0ff'; ctx.fillRect(x, y, Math.round(this.w * this.charge / this.hold), 3);
    }
    if (!this.solid) return;
    const spr = IMG.spr_door;
    for (let iy = 0; iy < this.hTiles; iy += 1) {
      for (let ix = 0; ix < this.tilesWide; ix += 1) {
        ctx.drawImage(spr, 0, (iy % 2) * TILE, TILE, TILE, Math.round(this.x + ix * TILE - cam.x), Math.round(this.y + iy * TILE - cam.y), TILE, TILE);
      }
    }
  }
}

export class MovingPlatform {
  constructor(cfg) {
    this.x0 = cfg.x * TILE;
    this.y0 = cfg.y * TILE;
    this.x1 = (cfg.tx ?? cfg.x + 3) * TILE;
    this.y1 = (cfg.ty ?? cfg.y) * TILE;
    this.w = (cfg.len || 3) * TILE;
    this.h = PLATFORM_H;
    this.t = 0;
    this.speed = cfg.speed || 0.35;
    this.x = this.x0;
    this.y = this.y0;
    this.prevX = this.x;
    this.prevY = this.y;
  }

  update(dt, level) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.t += dt * this.speed;
    const k = (Math.sin(this.t * Math.PI) + 1) / 2;
    this.x = this.x0 + (this.x1 - this.x0) * k;
    this.y = this.y0 + (this.y1 - this.y0) * k;
    const p = level.player;
    const feet = p.y + p.h;
    const onTop = p.x + p.w > this.x && p.x < this.x + this.w && Math.abs(feet - this.y) <= 6 && p.vy >= 0;
    if (onTop) {
      p.x += this.x - this.prevX;
      p.y = this.y - p.h;
      p.vy = 0;              // riding, not falling: otherwise gravity wins within a few frames
      p.grounded = true;
      p.coyote = PHYSICS.coyoteFrames;
      p.airDashes = PHYSICS.airDashLimit;
    }
  }

  draw(ctx, cam) {
    const spr = IMG.tile_platform;
    for (let i = 0; i < this.w / TILE; i += 1) {
      ctx.drawImage(spr, Math.round(this.x + i * TILE - cam.x), Math.round(this.y - cam.y));
    }
    ctx.fillStyle = "rgba(64,212,232,0.25)";
    ctx.fillRect(Math.round(this.x - cam.x), Math.round(this.y + this.h - cam.y), this.w, 1);
  }
}

/** Sprite and glow for every collectable the worlds hand out. */
const PICKUP_LOOK = {
  fuel: { sprite: "spr_fuel", glow: "#E8A05C" },
  shard: { sprite: "spr_shard", glow: "#8FB6D6" },
  biomass: { sprite: "spr_biomass", glow: "#86C098" },
  ore: { sprite: "spr_ore", glow: "#C9A05F" },
  crystal: { sprite: "spr_cryo", glow: "#A6CCE2" },
};

export class Pickup {
  constructor(cfg) {
    this.x = cfg.x * TILE + 2;
    this.y = cfg.y * TILE;
    this.w = 12;
    this.h = 16;
    this.type = cfg.type;
    this.taken = false;
    this.locked = Boolean(cfg.locked);
    this.bob = Math.random() * 6;
    this.look = PICKUP_LOOK[this.type] || PICKUP_LOOK.fuel;
    this.sprite = this.look.sprite;
    this.interactive = true;
  }

  reset() {
    this.taken = false;
  }

  update(dt, level) {
    if (this.taken || this.locked) return;
    this.bob += dt * 3;
    if (overlap(this, level.player)) {
      this.taken = true;
      sfx(this.type === "fuel" ? "fuel" : "pickup");
      level.particles.ring(this.x + 6, this.y + 8, this.look.glow, 12, 1.9, 0.5);
      level.onPickup(this);
    }
  }

  draw(ctx, cam) {
    if (this.taken) return;
    const y = this.y + Math.sin(this.bob) * 2;
    ctx.globalAlpha = this.locked ? 0.18 : 0.25;
    ctx.fillStyle = this.look.glow;
    ctx.fillRect(Math.round(this.x - 2 - cam.x), Math.round(y - 2 - cam.y), 16, 18);
    ctx.globalAlpha = 1;
    ctx.drawImage(IMG[this.sprite], Math.round(this.x - cam.x), Math.round(y - cam.y));
  }
}

export class Beacon {
  constructor(cfg) {
    this.x = cfg.x * TILE;
    this.y = cfg.y * TILE - 8;
    this.w = 16;
    this.h = 24;
    this.active = false;
    this.exit = Boolean(cfg.exit);
    this.interactive = true;
  }

  reset() {}

  update() {}

  draw(ctx, cam) {
    ctx.drawImage(this.active ? IMG.spr_beacon_on : IMG.spr_beacon, Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    if (this.exit) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 250);
      ctx.fillStyle = "#E8A05C";
      ctx.fillRect(Math.round(this.x - cam.x), Math.round(this.y - cam.y) - 6, 16, 2);
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * Aboard the ship a relay is a real fitting rather than a post: the cryo pod,
 * the lab bench, the galley. Each one is drawn as its own prop and its
 * interaction box grows to match, so the USE prompt sits on the machine.
 */
const STATION_SPRITES = {
  pod: "spr_cryo_pod",
  save: "spr_terminal",
  repair: "spr_fabricator",
  cryo: "spr_cryo_tank",
  bio: "spr_galley",
  console: "spr_nav_console",
  lab: "spr_lab",
};
const STATION_SIZES = {
  spr_cryo_pod: [40, 44],
  spr_terminal: [20, 30],
  spr_fabricator: [32, 32],
  spr_cryo_tank: [28, 44],
  spr_galley: [32, 30],
  spr_nav_console: [32, 30],
  spr_lab: [40, 32],
};

export class Relay {
  constructor(cfg) {
    this.x = cfg.x * TILE;
    this.y = cfg.y * TILE + 2;
    this.w = 16;
    this.h = 14;
    this.active = false;
    this.group = cfg.group || 0;
    this.role = cfg.role || "relay";
    this.label = cfg.label || "";
    this.interactive = true;
    this.station = STATION_SPRITES[this.role] || null;
    if (this.station) {
      const [w, h] = STATION_SIZES[this.station] || [16, 24];
      this.x = cfg.x * TILE + (TILE - w) / 2;
      this.y = (cfg.y + 1) * TILE - h;
      this.w = w;
      this.h = h;
    }
  }

  reset() {
    this.active = false;
  }

  update() {}

  draw(ctx, cam) {
    const img = this.station ? IMG[this.station] : IMG.spr_part;
    if (img) ctx.drawImage(img, Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    if (this.station) {
      // a small working lamp on every station, so a live ship reads as live
      const on = this.active || performance.now() % 1400 < 700;
      ctx.globalAlpha = on ? 0.9 : 0.4;
      ctx.fillStyle = this.active ? "#E8A05C" : "#8FB6D6";
      ctx.fillRect(Math.round(this.x + this.w - 6 - cam.x), Math.round(this.y + 2 - cam.y), 3, 3);
      ctx.globalAlpha = 1;
    }
    if (this.active) {
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(performance.now() / 160);
      ctx.fillStyle = "#CF5B45";
      ctx.fillRect(Math.round(this.x + 2 - cam.x), Math.round(this.y - 6 - cam.y), 12, 8);
      ctx.globalAlpha = 1;
    }
  }
}

export class Moria {
  constructor(cfg) {
    this.x = cfg.x * TILE;
    this.y = cfg.y * TILE - 12;
    this.w = 36;
    this.h = 44;
    this.fused = false;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
  }

  draw(ctx, cam) {
    ctx.drawImage(IMG.spr_moria, Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    if (this.fused) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 3);
      ctx.fillStyle = "#8FB6D6";
      ctx.fillRect(Math.round(this.x + 13 - cam.x), Math.round(this.y + 12 - cam.y), 10, 12);
      ctx.globalAlpha = 1;
    }
  }
}

export class Orb {
  constructor(cfg) {
    this.x = cfg.x * TILE;
    this.y = cfg.y * TILE;
    this.w = 14;
    this.h = 16;
    this.home = { x: this.x, y: this.y };
    this.target = null;
    this.taken = false;
    this.interactive = true;
  }

  reset() {
    this.x = this.home.x;
    this.y = this.home.y;
    this.taken = false;
    this.target = null;
  }

  update(dt) {
    if (this.target) {
      this.x += (this.target.x - this.x) * Math.min(1, dt * 2.2);
      this.y += (this.target.y - this.y) * Math.min(1, dt * 2.2);
    }
  }

  draw(ctx, cam) {
    if (this.taken) return;
    const y = this.y + Math.sin(performance.now() / 300) * 2;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#8FB6D6";
    ctx.fillRect(Math.round(this.x - 3 - cam.x), Math.round(y - 3 - cam.y), 20, 22);
    ctx.globalAlpha = 1;
    ctx.drawImage(IMG.spr_orb, Math.round(this.x - cam.x), Math.round(y - cam.y));
  }
}

/**
 * A deep seam: raw material still in the ground, under rock that a hand cannot
 * open. Built at the research bench, the extractor rig is what gets it out -
 * stand on the seam, hold USE, and the drill bites through. Extraction is a
 * one-shot per descent like every other source in the game, and what it yields
 * is raw material, so the field processor is still the only way to refine it.
 */
export class Deposit {
  constructor(cfg) {
    this.material = cfg.material || "ore";
    this.amount = cfg.amount || 2;
    this.label = cfg.label || `${MATERIAL_LABEL[this.material] || "SEAM"} SEAM`;
    this.x = cfg.x * TILE - 2;
    this.y = (cfg.y + 1) * TILE - 20;
    this.w = 20;
    this.h = 20;
    this.progress = 0;
    this.drained = false;
    this.interactive = true;
    this.t = 0;
  }

  reset() {
    this.progress = 0;
  }

  update(dt, level) {
    this.t += dt;
    if (this.drained) return;
    const armed = level.game.save.tech && level.game.save.tech.extractor;
    const here = level.player.interactTarget(level) === this;
    const biting = here && armed && input.down("use");
    if (biting) {
      this.progress = Math.min(1, this.progress + dt / 1.5);
      if (Math.random() < 0.5) {
        level.particles.burst(this.x + 10, this.y + 6, MATERIAL_GLOW[this.material] || "#C9A05F", 2, 0.9, 0.35, 0.05);
      }
      if (this.progress >= 1) {
        this.drained = true;
        this.interactive = false;
        level.onExtract(this);
      }
    } else if (this.progress > 0) {
      this.progress = Math.max(0, this.progress - dt * 0.7);
    }
  }

  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x);
    const y = Math.round(this.y - cam.y);
    const img = IMG.spr_seam;
    if (img) {
      ctx.globalAlpha = this.drained ? 0.4 : 1;
      ctx.drawImage(img, x - 2, y);
      ctx.globalAlpha = 1;
    }
    if (this.drained) return;
    // the veins that show what is in it
    ctx.fillStyle = MATERIAL_GLOW[this.material] || "#C9A05F";
    ctx.globalAlpha = 0.5 + Math.sin(this.t * 2.4) * 0.18;
    ctx.fillRect(x + 5, y + 9, 3, 2);
    ctx.fillRect(x + 12, y + 12, 4, 2);
    ctx.globalAlpha = 1;
    if (this.progress > 0) {
      ctx.fillStyle = "rgba(7,8,11,0.85)";
      ctx.fillRect(x - 4, y - 12, 28, 6);
      ctx.fillStyle = MATERIAL_GLOW[this.material] || "#C9A05F";
      ctx.fillRect(x - 2, y - 10, Math.round(24 * this.progress), 2);
    }
  }
}

const MATERIAL_LABEL = { biomass: "NUTRIENT", ore: "RARE EARTH", crystal: "CRYO" };
const MATERIAL_GLOW = { biomass: "#86C098", ore: "#C9A05F", crystal: "#A6CCE2" };

/**
 * A field processor: the rig a world's raw material has to go through before
 * the ship can use it. Standing at one and pressing USE opens its mini-game.
 */
export class Processor {
  constructor(cfg) {
    this.kind = cfg.kind || "purify";
    this.material = cfg.material || "biomass";
    this.label = cfg.label || this.kind.toUpperCase();
    this.sprite = `spr_proc_${this.kind}`;
    this.x = cfg.x * TILE - 8;
    // the rig stands on the ground of the row it is placed on
    this.y = (cfg.y + 1) * TILE - 36;
    this.w = 32;
    this.h = 36;
    this.interactive = true;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
  }

  draw(ctx, cam) {
    const img = IMG[this.sprite];
    if (img) ctx.drawImage(img, Math.round(this.x - cam.x), Math.round(this.y - cam.y));
  }
}

/**
 * A vent pitcher: the plant that hunts on the organics world. It waits flush
 * with the ground, opens when the pilot steps over it, and drags them under.
 * Getting taken is a catch, not damage - and the cryo projector makes one safe
 * for a few seconds, which is the whole reason to build it.
 */
export class Plant {
  constructor(cfg) {
    this.x = cfg.x * TILE - 4;
    this.y = (cfg.y + 1) * TILE - 22;
    this.w = 24;
    this.h = 22;
    this.label = "";
    this.state = "idle";
    this.timer = 0;
    this.frozen = 0;
    this.reach = cfg.reach || 26;
    this.bob = Math.random() * 6;
  }

  reset() {
    this.state = "idle";
    this.timer = 0;
  }

  /** The cryo projector's only effect: it sleeps. */
  freeze(seconds) {
    this.frozen = seconds;
    this.state = "idle";
  }

  update(dt, level) {
    this.bob += dt * 2;
    if (this.frozen > 0) {
      this.frozen -= dt;
      return;
    }
    const p = level.player;
    const dx = Math.abs((p.x + p.w / 2) - (this.x + this.w / 2));
    const dy = Math.abs((p.y + p.h) - (this.y + this.h));
    const near = dx < this.reach && dy < 22;
    if (this.state === "idle") {
      if (near) {
        this.state = "open";
        this.timer = 0.42;
        sfx("alert");
        level.particles.burst(p.x + p.w / 2, p.y + p.h - 4, "#86C098", 6, 1.4, 0.4, -0.6);
      }
      return;
    }
    if (this.state === "open") {
      if (!near) {
        this.state = "idle";
        return;
      }
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = "drag";
        this.timer = 0.4;
        sfx("hurt");
      }
      return;
    }
    // dragging: pull the pilot down into the pitcher, then take the run
    this.timer -= dt;
    p.controlLock = 0.3;
    p.vy = Math.max(p.vy, 1.6);
    p.y += 34 * dt;
    p.x += Math.sign(this.x + this.w / 2 - (p.x + p.w / 2)) * 22 * dt;
    level.camera.shake = Math.max(level.camera.shake, 0.35);
    if (this.timer <= 0) {
      this.state = "idle";
      level.caught("TAKEN BY A PITCHER");
    }
  }

  draw(ctx, cam) {
    const key = this.state === "idle" ? "spr_plant_guard" : "spr_plant_guard_open";
    const img = IMG[key];
    if (!img) return;
    const bob = this.state === "idle" ? Math.sin(this.bob) * 0.6 : 0;
    if (this.frozen > 0) ctx.globalAlpha = 0.7;
    ctx.drawImage(img, Math.round(this.x - cam.x), Math.round(this.y + bob - cam.y));
    ctx.globalAlpha = 1;
    if (this.frozen > 0) {
      ctx.fillStyle = "rgba(166,204,226,0.35)";
      ctx.fillRect(Math.round(this.x - cam.x), Math.round(this.y - cam.y), this.w, this.h);
    }
  }
}

export class Transmission {
  constructor(cfg) {
    this.id = cfg.id;
    this.label = 'TRANSMISSION';
    this.x = cfg.x * TILE;
    this.y = (cfg.y + 1) * TILE - 24;
    this.w = 18;
    this.h = 24;
    this.interactive = true;
    this.read = false;
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.drawImage(IMG.spr_transmission, x, y);
    ctx.fillStyle = this.read ? '#687f9d' : '#a9f0d0';
    ctx.fillRect(x + 6, y + 11, 6, 2);
    if (!this.read) {
      ctx.globalAlpha = .35;
      ctx.fillRect(x - 4, y - 7, 26, 1);
      ctx.fillRect(x - 1, y - 10, 20, 1);
      ctx.globalAlpha = 1;
    }
  }
}

export function makeEntity(cfg, level) {
  const diff = level.difficulty;
  switch (cfg.t) {
    case "transmission": return new Transmission(cfg);
    case "processor": return new Processor(cfg);
    case "seam": case "deposit": return new Deposit(cfg);
    case "plant": return new Plant(cfg);
    case "creeper": return new Creeper(cfg, diff);
    case "bird": return new Bird(cfg, diff);
    case "block": return new Block(cfg);
    case "plate": return new Plate(cfg);
    case "door": return new Door(cfg, level);
    case "pickup": return new Pickup(cfg);
    case "beacon": return new Beacon(cfg);
    case "relay": return new Relay(cfg);
    case "moria": return new Moria(cfg);
    case "orb": return new Orb(cfg);
    case "platform": return new MovingPlatform(cfg);
    default: return null;
  }
}
