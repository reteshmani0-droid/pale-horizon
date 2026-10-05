/**
 * Level validator: approximates reachability with the game's physics tuning.
 * Real input-driven puzzle solves are covered by game/dev/selftest.js. Run with:  node tools/validate_levels.mjs
 *
 * It builds the tile grid, finds every tile the player can stand on, runs a
 * jump/dash-aware flood fill, and then checks:
 *   - ability-gated items are out of reach for the starting kit and in reach
 *     once the bought ability is unlocked (gates must be real, and passable)
 *   - all pickups, the exit beacon and the exit path are reachable
 *   - every plate is reachable and has a pushable block within corridor range
 *   - every door is wired to a plate or relay of its group
 *   - relays and chargers are reachable BEFORE their own bridges exist (no soft-lock)
 *   - nothing important is buried inside a wall
 */
import { TileMap } from "../game/src/core/tilemap.js";
import { PHYSICS, TILE } from "../game/src/core/config.js";
import { ALL_LEVELS } from "../game/src/levels.js";

const SOLID = 1;
const PLATFORM = 2;

const jumpTiles = (PHYSICS.jumpSpeed ** 2) / (2 * PHYSICS.gravity) / TILE;
const KIT = {
  climb: Math.max(1, Math.floor(jumpTiles)),
  gap: 8,        // running jump / dash reach in tiles
  fall: 40,      // tiles you may drop
};

/**
 * The double jump adds roughly one jump-height to a climb. A gate is authored
 * as a ledge the starting kit cannot mount, so `climb` is the only difference
 * that matters when proving a gate is real and passable.
 */
const KIT_JUMPED = { ...KIT, climb: KIT.climb + Math.max(2, Math.floor(jumpTiles)) };

const problems = [];
const notes = [];
const fail = (level, msg) => problems.push(`${level}: ${msg}`);
const note = (level, msg) => notes.push(`${level}: ${msg}`);

/* ------------------------------------------------------------- grid helpers */
function standable(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
  if (map.isWall(tx, ty) || map.isWall(tx, ty - 1)) return false;
  if (map.isWater(tx, ty) || map.isWater(tx, ty - 1)) return false;
  const below = map.at(tx, ty + 1);
  return below === SOLID || below === PLATFORM;
}

function standingSet(map) {
  const out = [];
  for (let ty = 0; ty < map.h; ty += 1) {
    for (let tx = 0; tx < map.w; tx += 1) if (standable(map, tx, ty)) out.push({ x: tx, y: ty });
  }
  return out;
}

/** Does the jump/walk arc between two standing tiles stay clear of walls? */
function arcClear(map, a, b) {
  const ax = a.x * TILE + TILE / 2;
  const ay = a.y * TILE + TILE;
  const bx = b.x * TILE + TILE / 2;
  const by = b.y * TILE + TILE;
  const climb = ay - by;
  const apex = climb > 0 ? climb + 26 : 14;
  const steps = 26;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t - Math.sin(Math.PI * t) * apex;
    // the player body is 14x22, feet at y
    for (const [ox, oy] of [[-6, -4], [6, -4], [-6, -18], [6, -18], [0, -11]]) {
      if (map.isWall(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE))) return false;
    }
  }
  return true;
}

function reachable(set, startTiles, map, kit = KIT) {
  const index = new Map();
  for (const s of set) index.set(`${s.x},${s.y}`, s);
  const seen = new Set();
  const queue = [];
  for (const st of startTiles) {
    const key = `${st.x},${st.y}`;
    if (index.has(key)) {
      seen.add(key);
      queue.push(index.get(key));
    }
  }
  while (queue.length) {
    const a = queue.pop();
    for (const b of set) {
      const dx = b.x - a.x;
      const dy = a.y - b.y; // positive when climbing
      if (Math.abs(dx) > kit.gap) continue;
      if (dy > kit.climb) continue;
      if (-dy > kit.fall) continue;
      const key = `${b.x},${b.y}`;
      if (seen.has(key)) continue;
      if (!arcClear(map, a, b)) continue;
      seen.add(key);
      queue.push(b);
    }
  }
  return seen;
}

/** Which tiles can currently be stood on, given the door power state. */
function withDoors(def, powered) {
  const map = new TileMap(def);
  for (const cfg of def.entities || []) {
    if (cfg.t !== "door") continue;
    const solid = cfg.invert ? powered : !powered;
    const w = cfg.w || 1;
    const h = cfg.h || 3;
    for (let iy = 0; iy < h; iy += 1) {
      for (let ix = 0; ix < w; ix += 1) map.set(cfg.x + ix, cfg.y + iy, solid ? SOLID : 0);
    }
  }
  return map;
}

function nearTiles(def, tx, ty, radius = 2) {
  const out = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) out.push({ x: tx + dx, y: ty + dy });
  }
  return out;
}

function itemTile(cfg, map) {
  if (cfg.t === "pickup" || cfg.t === "orb" || cfg.t === "seam" || cfg.t === "deposit" || cfg.t === 'transmission') {
    // pickups and the soul orb float; find the standable tile closest to them
    let best = null;
    let bestDist = 99;
    for (let ty = Math.max(0, cfg.y - 6); ty < Math.min(map.h, cfg.y + 8); ty += 1) {
      for (let dx = -6; dx <= 6; dx += 1) {
        const tx = cfg.x + dx;
        if (!standable(map, tx, ty)) continue;
        const d = Math.abs(tx - cfg.x) + Math.abs(ty - cfg.y) * 1.4;
        if (d < bestDist) {
          bestDist = d;
          best = { x: tx, y: ty };
        }
      }
    }
    return best;
  }
  return { x: cfg.x, y: cfg.y };
}

/* ------------------------------------------------------------------- checks */
/** Blocks are authored mid-air and settle onto the ground at load: find their resting row. */
function settleRow(map, block) {
  for (let ty = block.y; ty < map.h; ty += 1) {
    const below = map.at(block.x, ty + 1);
    if (below === SOLID || below === PLATFORM) return ty;
  }
  return map.h - 1;
}

function pushCorridor(map, block, plate) {
  const row = settleRow(map, block);
  if (row !== plate.y) return { ok: false, why: `block settles on row ${row} != plate row ${plate.y}` };
  const dir = Math.sign(plate.x - block.x) || 1;
  for (let x = block.x + dir; x !== plate.x + dir; x += dir) {
    if (map.isWall(x, row) || map.isWall(x, row - 1)) return { ok: false, why: `wall at column ${x}` };
    if (map.isWater(x, row)) return { ok: false, why: `water at column ${x}` };
  }
  return { ok: true };
}

const hasTile = (set, tile) => tile && set.has(`${tile.x},${tile.y}`);

function validate(def) {
  const map = withDoors(def, false);       // gates shut, bridges down
  const openMap = withDoors(def, true);    // everything powered
  const base = standingSet(map);
  const open = standingSet(openMap);

  const startTiles = nearTiles(def, def.start.x, def.start.y, 2);
  const reachBase = reachable(base, startTiles, map);
  const reachOpen = reachable(open, startTiles, openMap);
  const reachJumped = reachable(open, startTiles, openMap, KIT_JUMPED);
  // Resolve galleries in order, never open a seal before all of its controls
  // are reachable and distinct crates can be assigned to the weight plates.
  let reachProgress = reachBase;
  const solved = new Set();
  for (let pass = 0; pass < (def.entities || []).length; pass++) {
    let changed = false;
    for (const gate of (def.entities || []).filter((e) => e.t === 'door' && e.source !== 'relay')) {
      if (solved.has(gate.group)) continue;
      const plates = def.entities.filter((e) => e.t === 'plate' && e.group === gate.group);
      if (!plates.length || !plates.every((p) => hasTile(reachProgress, itemTile(p, map)))) continue;
      const used = new Set();
      const assign = (at) => {
        if (at === plates.length) return true;
        const p = plates[at];
        if (p.solo || p.wants === 'frozen') return assign(at + 1);
        for (const b of def.entities.filter((e) => e.t === 'block')) {
          if (used.has(b) || !hasTile(reachProgress, itemTile({ ...b, t: 'plate', y: settleRow(map, b) }, map)) || !pushCorridor(map, b, p).ok) continue;
          used.add(b);
          if (assign(at + 1)) return true;
          used.delete(b);
        }
        return false;
      };
      if (!assign(0)) continue;
      solved.add(gate.group);
      for (const d of def.entities.filter((e) => e.t === 'door' && e.group === gate.group && e.source !== 'relay')) {
        for (let y = 0; y < (d.h || 3); y++) for (let x = 0; x < (d.w || 1); x++) map.set(d.x + x, d.y + y, d.invert ? SOLID : 0);
      }
      reachProgress = reachable(standingSet(map), startTiles, map);
      changed = true;
    }
    if (!changed) break;
  }
  for (const gate of (def.entities || []).filter((e) => e.t === 'door' && e.source !== 'relay')) {
    if (!solved.has(gate.group)) fail(def.id, `gate group ${gate.group} cannot be solved in progression order with distinct crates`);
  }

  if (reachBase.size === 0) fail(def.id, "nothing is reachable from the start tile - blocked spawn?");
  if (def.id !== "hub" && reachOpen.size === 0) fail(def.id, "exit is unreachable even with every door open");

  const has = (set, tile) => tile && set.has(`${tile.x},${tile.y}`);

  for (const cfg of def.entities || []) {
    const tile = itemTile(cfg, map);
    if (!tile) {
      if (["pickup", "plate", "relay", "beacon", "processor", "seam", "deposit", "transmission"].includes(cfg.t)) fail(def.id, `${cfg.t} at ${cfg.x},${cfg.y} has no standing tile nearby`);
      continue;
    }

    // a field processor is where a world's material becomes useful: if the rig
    // itself cannot be reached, that world's whole chain is dead
    if (cfg.t === "processor") {
      if (!has(reachBase, tile)) fail(def.id, `processor (${cfg.kind}) at ${cfg.x},${cfg.y} is unreachable`);
    }

    if (cfg.t === 'transmission') {
      if (!has(reachOpen, tile)) fail(def.id, `transmission ${cfg.id} is unreachable with the starter kit`);
      if (map.isWall(cfg.x, cfg.y) || map.isWall(cfg.x, cfg.y - 1)) fail(def.id, `transmission ${cfg.id} is buried in terrain`);
    }

    if (cfg.t === "pickup") {
      const set = cfg.gate === "doubleJump" ? reachJumped : reachOpen;
      if (!has(set, tile)) fail(def.id, `${cfg.type} at ${cfg.x},${cfg.y} is unreachable (nearest stand ${tile.x},${tile.y})`);
      const inWall = map.isWall(cfg.x, cfg.y) || map.isWall(cfg.x, cfg.y - 1);
      if (inWall) fail(def.id, `${cfg.type} at ${cfg.x},${cfg.y} is buried inside a wall`);
      if (cfg.gate === "doubleJump") {
        // the gate must be real: the starting kit cannot get there
        if (has(reachOpen, tile)) fail(def.id, `${cfg.type} at ${cfg.x},${cfg.y} is marked gate=${cfg.gate} but a single jump already reaches it`);
        else note(def.id, `${cfg.type} at ${cfg.x},${cfg.y} is gated behind ${cfg.gate}: unreachable without it, reachable with it`);
      }
    }

    if (cfg.t === "plate") {
      if (!has(reachProgress, tile)) fail(def.id, `plate (group ${cfg.group}) at ${cfg.x},${cfg.y} is unreachable`);
      if (cfg.wants === "frozen") {
        // a cold plate is held by an ice-locked hunter, so what it needs is
        // something that can be frozen while it is standing on the plate
        const near = (def.entities || []).filter((e) => ["predator", "drone", "plant"].includes(e.t)
          && Math.abs(e.x - cfg.x) <= 4 && Math.abs((e.y || 0) - cfg.y) <= (e.t === "drone" ? 8 : 2));
        if (!near.length) fail(def.id, `cold plate at ${cfg.x},${cfg.y} has no hunter that ever stands on it`);
        else note(def.id, `cold plate at ${cfg.x},${cfg.y} is held by ${near[0].t} at ${near[0].x}`);
      } else if (cfg.solo) {
        // held down by the pilot: the door it opens must be a timed one, close
        // enough that running to it is possible inside the hold
        const gate = (def.entities || []).filter((e) => e.t === "door" && e.group === cfg.group)[0];
        if (!gate) fail(def.id, `pilot-held plate at ${cfg.x},${cfg.y} has no door`);
        else if (!gate.hold) fail(def.id, `pilot-held plate at ${cfg.x},${cfg.y} opens an untimed door, so it can never be used`);
        else {
          const reach = gate.hold * PHYSICS.runSpeed * 60 * 0.7;
          const dist = Math.abs(gate.x - cfg.x) * TILE;
          if (dist > reach) fail(def.id, `plate at ${cfg.x},${cfg.y} is ${(dist / TILE).toFixed(0)} tiles from its door, too far for a ${gate.hold}s hold`);
          else note(def.id, `timed gate group ${cfg.group}: ${(dist / TILE).toFixed(0)} tiles on a ${gate.hold}s hold`);
        }
      } else {
        const blocks = (def.entities || []).filter((e) => e.t === "block");
        if (!blocks.length) fail(def.id, `plate group ${cfg.group} has no pushable block at all`);
        else {
          const usable = blocks
            .map((b) => ({ b, res: pushCorridor(map, b, cfg) }))
            .filter((x) => x.res.ok);
          if (!usable.length) {
            const why = blocks.map((b) => pushCorridor(map, b, cfg).why).join("; ");
            fail(def.id, `no block can be pushed onto plate group ${cfg.group} (${why})`);
          }
        }
      }
    }

    if (cfg.t === "seam" || cfg.t === "deposit") {
      // A deep seam is a material source behind a gate of some kind (a cold
      // plate, a timed gate, plain rock), so it is checked the way the exit is:
      // reachable once everything is open. Whatever holds the gate has its own
      // check above.
      if (!has(reachOpen, tile)) fail(def.id, `seam (${cfg.material}) at ${cfg.x},${cfg.y} is unreachable even with every gate open`);
      else note(def.id, `seam ${cfg.material} x${cfg.amount} at ${cfg.x},${cfg.y}`);
    }

    if (cfg.t === "relay" || cfg.t === "beacon" || cfg.t === "orb" || cfg.t === "moria") {
      const set = cfg.t === "beacon" && cfg.exit ? reachOpen : (['moria', 'orb'].includes(cfg.t) ? reachProgress : reachBase);
      if (!has(set, tile)) fail(def.id, `${cfg.t}${cfg.label ? ` ${cfg.label}` : ""} at ${cfg.x},${cfg.y} is unreachable`);
    }

    if (cfg.t === "charger" || (cfg.t === "relay" && cfg.role === "charger")) {
      if (!has(reachBase, tile)) fail(def.id, `charger at ${cfg.x},${cfg.y} is unreachable before its bridges exist`);
    }
  }

  // every door needs a power source of its group
  for (const cfg of (def.entities || []).filter((e) => e.t === "door")) {
    const pool = (def.entities || []).filter((e) => (cfg.source === "relay" ? e.t === "relay" && e.role === "relay" : e.t === "plate") && e.group === cfg.group);
    if (!pool.length) fail(def.id, `door at ${cfg.x},${cfg.y} (group ${cfg.group}, source ${cfg.source}) has nothing to power it`);
  }

  // enemies should start on ground, not in walls or water
  for (const cfg of (def.entities || []).filter((e) => e.t === "predator" || e.t === "drone")) {
    if (cfg.t === "predator") {
      const below = map.at(cfg.x, cfg.y + 1);
      const groundBelow = below === SOLID || below === PLATFORM || map.at(cfg.x, cfg.y + 2) === SOLID;
      if (!groundBelow) fail(def.id, `predator at ${cfg.x},${cfg.y} starts over a hole (falls into water)`);
      if (map.isWall(cfg.x, cfg.y)) fail(def.id, `predator at ${cfg.x},${cfg.y} starts inside a wall`);
    } else if (map.isWall(cfg.x, cfg.y)) {
      fail(def.id, `drone at ${cfg.x},${cfg.y} starts inside a wall`);
    }
  }

  note(def.id, `${reachBase.size} standing tiles reachable at start, ${reachOpen.size} with everything open`);
}

/* --------------------------------------------------------------------- main */
console.log("Pale Horizon level validator\n");
for (const def of ALL_LEVELS) {
  const before = problems.length;
  validate(def);
  const status = problems.length === before ? "PASS" : "FAIL";
  console.log(`  ${status}  ${def.id.padEnd(5)} ${def.name}`);
}
console.log("");
for (const n of notes) console.log(`  note ${n}`);
if (problems.length) {
  console.log("\nproblems:");
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nall levels reachable: pickups, plates, relays and exits verified");
