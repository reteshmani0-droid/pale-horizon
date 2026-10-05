/**
 * Rendering + runtime layer: input, camera, particles, baked tile drawing.
 * Pure game maths lives in ./core/*; this file is the only browser-facing part.
 */
import { IMG } from "./assets.js";
import { TILE, VIEW_W, VIEW_H, CAM_W, CAM_H, ZOOM, PLATFORM_H } from "./core/config.js";
import {
  TileMap, moveEntity, overlap, sightClear, supported,
  EMPTY, SOLID, PLATFORM, WATER, TUFT,
} from "./core/tilemap.js";

export { TILE, VIEW_W, VIEW_H, CAM_W, CAM_H, ZOOM, PLATFORM_H, TileMap, moveEntity, overlap, sightClear, supported, EMPTY, SOLID, PLATFORM, WATER, TUFT };

/** Global time modifiers so "juice" effects never touch game logic. */
export const time = { hitStop: 0, flash: 0 };

export function hitStop(seconds) {
  time.hitStop = Math.max(time.hitStop, seconds);
}

/* -------------------------------------------------------------------- input */
const KEYMAP = {
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
  ArrowUp: "jump", w: "jump", W: "jump",
  ArrowDown: "down", s: "down", S: "down",
  " ": "jump", z: "jump", Z: "jump",
  e: "use", E: "use", Enter: "use",
  Tab: "pause", Escape: "pause", p: "pause", P: "pause",
  m: "mute", M: "mute",
  j: "journal", J: "journal",
  q: "dash", Q: "dash", Shift: "dash",
  f: "freeze", F: "freeze",
  F3: "debug", f3: "debug",
};

class Input {
  constructor() {
    this.state = {};
    this.prev = {};
    this.virtual = {};
    this.tapped = new Set();
    this.anyKey = false;
    window.addEventListener("keydown", (e) => {
      if (e.target?.matches?.('input, textarea, select, button')) return;
      const a = KEYMAP[e.key];
      if (a) {
        if (!e.repeat) this.tapped.add(a);
        this.state[a] = true;
        // UP jumps during platforming and remains a directional answer in rigs.
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          this.state.up = true;
          if (!e.repeat) this.tapped.add('up');
        }
        if (a === "jump" || a === "pause" || a === "use" || a === "dash") e.preventDefault();
      }
      this.anyKey = true;
    });
    window.addEventListener("keyup", (e) => {
      const a = KEYMAP[e.key];
      if (a) this.state[a] = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.state.up = false;
    });
    window.addEventListener("blur", () => {
      this.state = {};
      this.virtual = {};
    });
  }

  reset() {
    this.state = {};
    this.prev = {};
    this.virtual = {};
    this.tapped.clear();
  }

  setVirtual(action, down) {
    if (down && !this.virtual[action]) this.tapped.add(action);
    this.virtual[action] = down;
  }

  down(a) {
    return Boolean(this.state[a] || this.virtual[a]);
  }

  /** True on the first frame a key/button goes down (taps are buffered). */
  pressed(a) {
    return this.tapped.has(a) || (this.down(a) && !this.prev[a]);
  }

  released(a) {
    return !this.down(a) && this.prev[a];
  }

  /** -1 / 0 / +1 horizontal axis, the shape most platformers want. */
  axisX() {
    return (this.down("right") ? 1 : 0) - (this.down("left") ? 1 : 0);
  }

  endFrame() {
    this.tapped.clear();
    this.prev = { ...this.state, ...this.virtual };
  }
}

export const input = new Input();

/* ------------------------------------------------------------------ canvas */
const THEME_TILES = {
  jungle: { top: "tile_grass", fill: "tile_dirt", plat: "tile_grass_platform", water: "tile_water", waterDeep: "tile_water_deep" },
  metal: { top: "tile_metal", fill: "tile_metal", plat: "tile_platform", water: "tile_water", waterDeep: "tile_water_deep" },
  ruins: { top: "tile_ancient", fill: "tile_ancient", plat: "tile_ancient", water: "tile_water", waterDeep: "tile_water_deep" },
  storm: { top: "tile_crystal", fill: "tile_stone", plat: "tile_platform", water: "tile_water", waterDeep: "tile_water_deep" },
  ice: { top: "tile_crystal", fill: "tile_stone", plat: "tile_platform", water: "tile_water", waterDeep: "tile_water_deep" },
};

export function themeOf(name) {
  return THEME_TILES[name] || THEME_TILES.jungle;
}

/**
 * Rasterise the static parts of a level (terrain + decor) into one canvas.
 * Doors rewrite tiles and then call this again — levels are small, so a full
 * rebake stays well under a frame.
 */
export function bakeTileMap(map) {
  const c = document.createElement("canvas");
  c.width = map.pxW;
  c.height = map.pxH;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const theme = themeOf(map.def.theme);
  const img = (n) => IMG[n];
  const decors = {
    tuft: "tile_grass_tuft", plant: "spr_plant", rock: "spr_rock",
    crystal: "spr_crystal", rune: "tile_ancient_rune", vent: "tile_vent",
    // the escape pod parked where it came down
    pod: "spr_pod", podOpen: "spr_pod_open",
    ship: "spr_ship", orb: "spr_orb",
  };

  for (let ty = 0; ty < map.h; ty += 1) {
    for (let tx = 0; tx < map.w; tx += 1) {
      const v = map.at(tx, ty);
      const px = tx * TILE;
      const py = ty * TILE;
      if (v === SOLID) {
        const openAbove = map.at(tx, ty - 1) !== SOLID;
        const t = img(openAbove ? theme.top : theme.fill);
        if (t) g.drawImage(t, px, py);
        // Deterministic large pixel clusters break up terrain repetition.
        if (!openAbove && map.def.theme !== 'metal' && (tx * 13 + ty * 7) % 9 === 0) {
          g.fillStyle = map.def.theme === 'ice' ? '#6a7f9c' : map.def.theme === 'ruins' ? '#d49379' : '#694059';
          g.fillRect(px + 3, py + 5, 5, 2);
          g.fillRect(px + 5, py + 7, 5, 1);
        }
        if (openAbove) {
          g.fillStyle = map.def.theme === 'ice' ? '#e1f3ea' : map.def.theme === 'ruins' ? '#f3cea0' : map.def.theme === 'metal' ? '#b0d6d9' : '#a0e3ac';
          g.fillRect(px, py, TILE, 1);
        }
      } else if (v === PLATFORM) {
        const p = img(theme.plat);
        if (p) g.drawImage(p, px, py);
      } else if (v === WATER) {
        const top = map.at(tx, ty - 1) !== WATER;
        const w = img(top ? theme.water : theme.waterDeep);
        if (w) g.drawImage(w, px, py);
      }
    }
  }

  for (const p of map.def.decor || []) {
    const sprite = decors[p.t];
    const s = sprite && img(sprite);
    if (!s) continue;
    const x = p.x * TILE + (p.dx || 0);
    const y = p.y * TILE + (16 - s.height) + (p.dy || 0);
    g.drawImage(s, x, y);
  }

  map.staticLayer = c;
  return c;
}

export function drawStatic(ctx, map, cam) {
  if (!map.staticLayer) return;
  const sx = Math.max(0, Math.floor(cam.x));
  const sy = Math.max(0, Math.floor(cam.y));
  const sw = Math.min(map.pxW - sx, CAM_W + 2);
  const sh = Math.min(map.pxH - sy, CAM_H + 2);
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(map.staticLayer, sx, sy, sw, sh, sx - cam.x, sy - cam.y, sw, sh);
}

/* ------------------------------------------------------------------ camera */
/**
 * Zoomed follow camera. The visible world window is CAM_W x CAM_H world pixels,
 * so the player reads large on screen and the view scrolls on both axes. A
 * dead-zone plus smoothed look-ahead keeps the frame calm while running, and a
 * falling bias keeps the landing spot visible.
 */
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.maxX = 0;
    this.maxY = 0;
    this.shake = 0;
    this.lookAhead = 0;
    this.lookY = 0;
    this.deadX = 10;
    this.deadY = 12;
  }

  setBounds(pxW, pxH) {
    this.maxX = Math.max(0, pxW - CAM_W);
    this.maxY = Math.max(0, pxH - CAM_H);
  }

  follow(t, dt, snap = false) {
    // Hollow-Knight-ish look-ahead: the camera leans the way you are moving
    const wantX = Math.max(-30, Math.min(30, (t.vx || 0) * 11));
    const wantY = Math.max(-14, Math.min(20, (t.vy || 0) * 2.4));
    const k = snap ? 1 : Math.min(1, dt * 6);
    this.lookAhead += (wantX - this.lookAhead) * Math.min(1, dt * 2.4);
    this.lookY += (wantY - this.lookY) * Math.min(1, dt * 3.2);

    const cx = t.x + t.w / 2 + this.lookAhead;
    const cy = t.y + t.h / 2 + this.lookY;

    // dead-zone: only move once the player drifts past the inner rectangle
    const dzX = Math.abs(cx - (this.x + CAM_W / 2)) - this.deadX;
    const dzY = Math.abs(cy - (this.y + CAM_H / 2)) - this.deadY;
    if (dzX > 0) this.x += (cx - CAM_W / 1.94 - this.x) * k;
    if (dzY > 0) this.y += (cy - CAM_H / 1.94 - this.y) * k;

    this.x = Math.max(0, Math.min(this.maxX, this.x));
    this.y = Math.max(0, Math.min(this.maxY, this.y));
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  get ox() {
    return this.shake <= 0 ? 0 : (Math.random() * 2 - 1) * this.shake * 4;
  }

  get oy() {
    return this.shake <= 0 ? 0 : (Math.random() * 2 - 1) * this.shake * 4;
  }
}

/* --------------------------------------------------------------- particles */
export class Particles {
  constructor(limit = 420) {
    this.items = [];
    this.limit = limit;
  }

  burst(x, y, color, count = 8, spread = 1.4, life = 0.5, gravity = 0.06) {
    for (let i = 0; i < count; i += 1) {
      if (this.items.length >= this.limit) break;
      this.items.push({
        x, y,
        vx: (Math.random() * 2 - 1) * spread,
        vy: (Math.random() * 2 - 1) * spread - 0.3,
        gravity, life, max: life, color, size: Math.random() < 0.3 ? 3 : 2,
      });
    }
  }

  /** A shaped burst (rings, dust, sparks) — keeps the game's feedback readable. */
  ring(x, y, color, count = 12, radius = 1.8, life = 0.4) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      this.items.push({
        x, y,
        vx: Math.cos(a) * radius, vy: Math.sin(a) * radius,
        gravity: 0, life, max: life, color, size: 2,
      });
    }
  }

  dust(x, y, color = "#C7C3B8", count = 5) {
    this.burst(x, y, color, count, 0.9, 0.3, 0.02);
  }

  /** A single authored particle (cutscenes need exact control, not bursts). */
  add(p) {
    if (this.items.length >= this.limit) return null;
    this.items.push({ gravity: 0, size: 1, ...p, max: p.max || p.life || 0.5 });
    return p;
  }

  update(dt) {
    for (const p of this.items) {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += p.gravity * dt * 60;
      p.life -= dt;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  draw(ctx, cam) {
    for (const p of this.items) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}

/** Ghost trail used by the dash. Cheap: draws a few tinted sprite copies. */
export class Ghosts {
  constructor() {
    this.items = [];
  }

  push(sprite, x, y, flip, life = 0.26) {
    this.items.push({ sprite, x, y, flip, life, max: life });
    if (this.items.length > 24) this.items.shift();
  }

  update(dt) {
    for (const g of this.items) g.life -= dt;
    this.items = this.items.filter((g) => g.life > 0);
  }

  draw(ctx, cam) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const g of this.items) {
      const src = IMG[g.flip ? g.sprite + "_flip" : g.sprite] || IMG[g.sprite];
      if (!src) continue;
      ctx.globalAlpha = (g.life / g.max) * 0.35;
      ctx.drawImage(src, Math.round(g.x - cam.x), Math.round(g.y - cam.y));
    }
    ctx.restore();
  }
}

/* ----------------------------------------------------------------- helpers */
export function drawSprite(ctx, name, x, y, flipX = false, cam = null) {
  const src = IMG[flipX ? name + "_flip" : name] || IMG[name];
  if (!src) return;
  ctx.drawImage(src, Math.round(x - (cam ? cam.x : 0)), Math.round(y - (cam ? cam.y : 0)));
}

/**
 * All in-world type is set in the same two faces the UI uses: the console face
 * for anything stencilled, the read-out face for numbers and labels. If the
 * webfonts are still loading the canvas falls back to the system mono for a
 * frame or two, which nobody has ever noticed.
 */
export function text(ctx, str, x, y, color = "#E7E4DC", align = "left", size = 8, face = "500") {
  ctx.font = `${face} ${size}px "JetBrains Mono", "Plex Mono", ui-monospace, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#000";
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.textAlign = "left";
}

/**
 * Per-world palettes. Every planet gets its own hue family so the three worlds
 * never look like the same level recoloured: Exxos is humid green, the World of
 * Regrets is bleached bone and dust amber, the Hollow Signal is cold slate blue.
 * Surfaces stay flat (no glow) and each palette keeps its own accent color.
 * A safety orange is reserved across the game for real warnings only.
 */
export const THEME_PALETTE = {
  // organics world: humid teal canopy over red-brown soil
  jungle: { sky: ["#08120f", "#123028", "#1c4034"], far: "#0d2019", near: "#16352b", accent: "#8FBFA4", name: "Verdant" },
  // rare-earth dig: bleached ochre, rust dust, one tired sun
  ruins: { sky: ["#12100d", "#241d15", "#382c1e"], far: "#191612", near: "#2a231a", accent: "#C9A05F", name: "Rare-earth camp" },
  // glacier world: slate blue, white-out, no horizon
  ice: { sky: ["#080f18", "#142740", "#20395c"], far: "#0b1622", near: "#152536", accent: "#9DC4E0", name: "Glacier" },
  // aboard the lander: brushed panels under a warm cabin lamp
  metal: { sky: ["#0b0e13", "#161c25", "#1e2530"], far: "#101620", near: "#1a2029", accent: "#E8A05C", name: "Lander" },
  space: { sky: ["#04060a", "#090e15", "#0f1620"], far: "#06090f", near: "#0b111a", accent: "#8FB6D6", name: "Deep space" },
};

/** Deterministic pseudo-random so scenery never shimmers between frames. */
function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return (Math.sin(x) + 1) * 0.5;
}

/**
 * Sky + parallax scenery. Drawn in world space at ZOOM, so all coordinates are
 * in logical pixels. Three depth layers move at 0.15x, 0.4x and 1x the camera,
 * which is what sells the sense of place while you run.
 */
export function drawBackdrop(ctx, theme, cam, t) {
  theme = theme === 'storm' ? 'ice' : theme;
  const sky = IMG[`bg_${theme}_sky`];
  if (sky?.naturalWidth) {
    const transformScale = Math.abs(ctx.getTransform().a) || 1;
    const W = ctx.canvas.width / transformScale;
    const H = ctx.canvas.height / transformScale;
    const scale = W / 320;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sky, 0, 0, W, H);
    for (const [layer, speed] of [['far', .16], ['near', .38]]) {
      const image = IMG[`bg_${theme}_${layer}`];
      if (!image?.naturalWidth) continue;
      const width = image.width * scale;
      const offset = ((cam.x * speed) % width + width) % width;
      const y = theme === 'metal' ? 0 : Math.round(-cam.y * .08);
      for (let x = -offset; x < W; x += width) ctx.drawImage(image, Math.floor(x), y, width, H);
    }
    // Sparse, integer-aligned ambient motes. No particles emitted during draw.
    const color = { jungle: '#b3e89a', ruins: '#f5cf9e', ice: '#d1edf5', space: '#9fe4e9' }[theme];
    if (color) {
      ctx.fillStyle = color;
      ctx.globalAlpha = .45;
      for (let i = 0; i < (theme === 'ice' ? 25 : 12); i++) {
        const x = ((hash(i + 80) * W + t * (theme === 'ice' ? -30 : 3) - cam.x * .2) % W + W) % W;
        const y = (hash(i + 95) * H + Math.sin(t + i) * 3) % H;
        ctx.fillRect(Math.floor(x), Math.floor(y), theme === 'ice' ? 3 : 1, 1);
      }
    }
    ctx.restore();
    return;
  }
  const p = THEME_PALETTE[theme] || THEME_PALETTE.jungle;
  // Work out the logical window from the live transform: level scenes draw inside
  // a ZOOM scale (CAM_W x CAM_H) while menus and cutscenes draw unscaled
  // (VIEW_W x VIEW_H). Getting this wrong leaves part of the canvas unpainted.
  const scale = (ctx.getTransform && ctx.getTransform().a) || 1;
  const W = ctx.canvas.width / scale;
  const H = ctx.canvas.height / scale;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, p.sky[0]);
  grad.addColorStop(0.62, p.sky[1]);
  grad.addColorStop(1, p.sky[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // stars: two parallax depths, only for open sky
  if (theme === "space") {
    for (let i = 0; i < 80; i += 1) {
      const depth = i % 3 === 0 ? 0.3 : 0.12;
      let x = (hash(i) * W * 4 - cam.x * depth) % W;
      if (x < 0) x += W;
      const y = hash(i + 99) * H * 0.74;
      const tw = (Math.sin(t * 1.7 + i) + 0.5) / 2;
      if (tw > 0.34) {
        ctx.fillStyle = `rgba(217,221,226,${tw > 0.85 ? 0.9 : 0.4})`;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  if (theme === "ice") {
    // blizzard: long driving snow bands and a pale wind-blown haze
    for (let i = 0; i < 12; i += 1) {
      const y = 14 + hash(i + 4) * (H - 30);
      let off = (cam.x * 0.4 + t * 26 + i * 41) % (W + 200);
      if (off < 0) off += W + 200;
      ctx.fillStyle = `rgba(157,196,224,${0.04 + hash(i) * 0.05})`;
      ctx.fillRect(Math.round(off - 90), Math.round(y), 150 + hash(i + 3) * 60, 2);
    }
    ctx.fillStyle = "rgba(157,196,224,0.05)";
    ctx.fillRect(0, H - 26, W, 26);
  }

  if (theme === "metal") {
    // ship interior: riveted panels, vertical seams, and horizontal deck lines
    ctx.fillStyle = p.far;
    ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W + 40; x += 34) {
      const px = x - ((cam.x * 0.4) % 34);
      ctx.fillStyle = "rgba(140,158,164,0.06)";
      ctx.fillRect(Math.round(px), 0, 1, H);
      ctx.fillStyle = "rgba(8,12,12,0.35)";
      ctx.fillRect(Math.round(px + 2), 0, 3, H);
    }
    ctx.fillStyle = "rgba(140,158,164,0.05)";
    for (let y = 22; y < H; y += 36) ctx.fillRect(0, y, W, 1);
  } else if (theme === "jungle") {
    // canopy silhouettes: two ridges of foliage at different depths
    ctx.fillStyle = p.far;
    for (let i = 0; i < 16; i += 1) {
      const span = 48;
      const wx = i * span - ((cam.x * 0.4) % (span * 16));
      const h = 40 + hash(i) * 26;
      ctx.beginPath();
      ctx.ellipse(wx, H + 6, 30, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = p.near;
    for (let i = 0; i < 14; i += 1) {
      const span = 62;
      const wx = i * span - ((cam.x * 0.62) % (span * 14));
      const h = 22 + hash(i + 7) * 18;
      ctx.beginPath();
      ctx.ellipse(wx, H + 10, 34, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === "ruins") {
    // a low bleached sun, bone-white columns, like an old survey photograph
    ctx.fillStyle = "rgba(176,141,87,0.09)";
    ctx.beginPath();
    ctx.ellipse(W * 0.64, 40, 26, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.far;
    for (let i = 0; i < 14; i += 1) {
      const span = 54;
      const wx = i * span - ((cam.x * 0.4) % (span * 14));
      const h = 30 + hash(i) * 60;
      ctx.fillRect(Math.round(wx), Math.round(H - h), 10, h);
      ctx.fillRect(Math.round(wx - 3), Math.round(H - h - 5), 16, 5);
    }
  }
}

/**
 * Height of a planet limb at x. The surface is a shallow arc instead of a slab:
 * it falls away toward both frame edges, so a horizon never reads as a wall and
 * a landing never looks like it happens inside a box. Ground clutter, furrows
 * and landing ships are all placed against this curve, and every movement bound
 * in a surface beat stays invisible.
 */
export function groundAt(x, horizon = VIEW_H - 50, drop = 34, width = VIEW_W) {
  const q = (x - width / 2) / (width / 2);
  return horizon + q * q * drop;
}

/**
 * Fill the planet below its limb and light the crossing edge. `rim` paints a
 * soft band of reflected light just above the horizon. Nothing here draws a
 * vertical face or a straight slab: the curve is the planet.
 */
export function drawPlanetGround(ctx, { horizon = VIEW_H - 50, drop = 34, fill = "#131b20", edge = null, rim = null } = {}) {
  const scale = Math.abs(ctx.getTransform().a) || 1;
  const W = Math.max(VIEW_W, ctx.canvas.width / scale);
  const H = Math.max(VIEW_H, ctx.canvas.height / scale);
  const limb = () => {
    ctx.beginPath();
    for (let x = -40; x <= W + 40; x += 8) {
      const y = groundAt(x, horizon, drop);
      if (x === -40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  limb();
  ctx.lineTo(W + 40, H + 40);
  ctx.lineTo(-40, H + 40);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (rim) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    limb();
    ctx.strokeStyle = rim;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }
  if (edge) {
    limb();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Vignette + scanline feel drawn on the canvas itself (keeps the DOM light). */
export function drawVignette(ctx, strength = 0.5) {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${0.5 * strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
