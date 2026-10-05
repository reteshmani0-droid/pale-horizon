/**
 * Pure tile-grid logic: storage, queries and AABB collision resolution.
 * Deliberately free of canvas/DOM so the node test runner can exercise it.
 */
import { TILE, PLATFORM_H } from "./config.js";

export const EMPTY = 0;
export const SOLID = 1;
export const PLATFORM = 2;
export const WATER = 3;
export const TUFT = 4;

export class TileMap {
  constructor(def) {
    this.def = def;
    this.w = def.w;
    this.h = def.h;
    this.pxW = this.w * TILE;
    this.pxH = this.h * TILE;
    this.grid = new Uint8Array(this.w * this.h);
    // rects are [x, y, w, h]; platforms may be written as [x, y, length]
    for (const rect of def.solids || []) this.fill(rect[0], rect[1], rect[2], rect[3] ?? 1, SOLID);
    for (const rect of def.platforms || []) this.fill(rect[0], rect[1], rect[2], rect[3] ?? 1, PLATFORM);
    for (const rect of def.water || []) this.fill(rect[0], rect[1], rect[2], rect[3] ?? 1, WATER);
    for (const p of def.decor || []) if (p.t === "tuft") this.set(p.x, p.y, TUFT);
    /** baked canvas, filled in by the renderer when a DOM is available */
    this.staticLayer = null;
  }

  fill(x, y, w, h, v) {
    for (let ty = y; ty < y + h; ty += 1) {
      for (let tx = x; tx < x + w; tx += 1) this.set(tx, ty, v);
    }
  }

  set(x, y, v) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.grid[y * this.w + x] = v;
  }

  at(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) {
      // outside the horizontal edges behaves as a wall, above/below is open air
      return tx < 0 || tx >= this.w ? SOLID : EMPTY;
    }
    return this.grid[ty * this.w + tx];
  }

  isWall(tx, ty) {
    return this.at(tx, ty) === SOLID;
  }

  isPlatform(tx, ty) {
    return this.at(tx, ty) === PLATFORM;
  }

  isWater(tx, ty) {
    return this.at(tx, ty) === WATER;
  }

  isTuft(tx, ty) {
    return this.at(tx, ty) === TUFT;
  }

  /** Tile-space rect helper used by the validator. */
  rectSolid(tx, ty, w = 1, h = 1) {
    for (let y = ty; y < ty + h; y += 1) {
      for (let x = tx; x < tx + w; x += 1) if (this.isWall(x, y)) return true;
    }
    return false;
  }
}

/**
 * Move an entity by (dx, dy) and resolve tile collisions on each axis.
 * Returns what happened so callers can react (grounded, water, tuft, head bump).
 */
export function moveEntity(map, e, dx, dy) {
  const res = { hitX: false, hitY: false, grounded: false, water: false, tuft: false, tx: 0, ty: 0 };

  if (dx !== 0) {
    e.x += dx;
    const y0 = Math.floor(e.y / TILE);
    const y1 = Math.floor((e.y + e.h - 1) / TILE);
    if (dx > 0) {
      const tx = Math.floor((e.x + e.w - 1) / TILE);
      for (let ty = y0; ty <= y1; ty += 1) {
        if (map.isWall(tx, ty)) {
          e.x = tx * TILE - e.w;
          e.vx = 0;
          res.hitX = true;
          break;
        }
      }
    } else {
      const tx = Math.floor(e.x / TILE);
      for (let ty = y0; ty <= y1; ty += 1) {
        if (map.isWall(tx, ty)) {
          e.x = (tx + 1) * TILE;
          e.vx = 0;
          res.hitX = true;
          break;
        }
      }
    }
  }

  if (dy !== 0) {
    const prevBottom = e.y + e.h;
    e.y += dy;
    const x0 = Math.floor(e.x / TILE);
    const x1 = Math.floor((e.x + e.w - 1) / TILE);
    if (dy > 0) {
      const ty = Math.floor((e.y + e.h - 1) / TILE);
      for (let tx = x0; tx <= x1; tx += 1) {
        const solid = map.isWall(tx, ty);
        const plat = map.isPlatform(tx, ty) && prevBottom <= ty * TILE + PLATFORM_H + 1;
        if (solid || plat) {
          e.y = ty * TILE - e.h;
          e.vy = 0;
          res.grounded = true;
          res.hitY = true;
          break;
        }
      }
    } else {
      const ty = Math.floor(e.y / TILE);
      for (let tx = x0; tx <= x1; tx += 1) {
        if (map.isWall(tx, ty)) {
          e.y = (ty + 1) * TILE;
          e.vy = 0;
          res.hitY = true;
          break;
        }
      }
    }
  }

  const cx = Math.floor((e.x + e.w / 2) / TILE);
  const cy = Math.floor((e.y + e.h * 0.7) / TILE);
  res.water = map.isWater(cx, cy);
  res.tuft = map.isTuft(cx, cy);
  res.tx = cx;
  res.ty = cy;
  return res;
}

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** DDA-ish sampling across the tile grid. False when a solid tile blocks the segment. */
export function sightClear(map, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (map.isWall(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
  }
  return true;
}

/** Is the entity standing on something? Used for coyote time and the validator. */
export function supported(map, e, probe = 2) {
  const ty = Math.floor((e.y + e.h + probe) / TILE);
  const x0 = Math.floor((e.x + 1) / TILE);
  const x1 = Math.floor((e.x + e.w - 2) / TILE);
  for (let tx = x0; tx <= x1; tx += 1) {
    if (map.isWall(tx, ty) || map.isPlatform(tx, ty)) return true;
  }
  return false;
}

/**
 * Can the entity reach `target` from `from` with one step of the movement kit?
 * A deliberately generous approximation used by the level validator: it checks
 * the horizontal gap and the climb height are inside jump/dash range.
 */
export function reachableInOneStep(from, to, kit) {
  const dx = Math.abs(to.x - from.x);
  const dy = from.y - to.y; // positive when climbing
  if (dx > kit.maxStepX) return false;
  if (dy > kit.maxStepUp) return false;
  if (to.y - from.y > kit.maxDrop) return false;
  return true;
}
