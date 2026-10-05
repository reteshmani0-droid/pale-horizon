/**
 * Unit tests for the DOM-free core. Run with:  node tools/test_engine.mjs
 * No dependencies — a tiny assert harness keeps this runnable anywhere.
 */
import { TileMap, moveEntity, overlap, sightClear, supported, PLATFORM } from "../game/src/core/tilemap.js";
import { PHYSICS, DIFFICULTY, DIFFICULTY_ORDER, TILE } from "../game/src/core/config.js";
import { ALL_LEVELS } from "../game/src/levels.js";
import { TRANSMISSIONS } from '../game/src/journal.js';
import { TECH, MATERIALS, freshSave, writeSlot, loadSlot, SLOTS_KEY } from "../game/src/save.js";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failed += 1;
    failures.push(`${name} ${detail}`);
    process.stdout.write(`  FAIL ${name} ${detail}\n`);
  }
}

const box = (x, y, w = 14, h = 22) => ({ x, y, w, h, vx: 0, vy: 0 });

function group(title, fn) {
  process.stdout.write(`\n${title}\n`);
  fn();
}

/* ------------------------------------------------------------------ suites */
group("tile grid", () => {
  const map = new TileMap({
    w: 20, h: 12, theme: "jungle",
    solids: [[0, 10, 20, 2], [4, 6, 1, 4]],
    platforms: [[10, 8, 3, 1]],
    water: [[15, 11, 3, 1]],
    decor: [{ t: "tuft", x: 2, y: 9 }],
  });
  check("solid tile is a wall", map.isWall(5, 10));
  check("empty tile is not a wall", !map.isWall(5, 9));
  check("platform is not a wall", map.isPlatform(11, 8) && !map.isWall(11, 8));
  check("water tile flagged", map.isWater(16, 11));
  check("tuft tile flagged", map.isTuft(2, 9));
  check("outside left edge acts as a wall", map.isWall(-1, 5));
  check("outside right edge acts as a wall", map.isWall(25, 5));
  check("rectSolid finds a wall in a rect", map.rectSolid(4, 6, 1, 4));
  check("rectSolid ignores empty rect", !map.rectSolid(0, 0, 3, 3));
});

group("collision: floors and walls", () => {
  const map = new TileMap({
    w: 20, h: 12, theme: "jungle",
    solids: [[0, 10, 20, 2], [8, 5, 1, 5], [6, 3, 4, 1]], // floor, pillar and ceiling
  });

  const walker = box(20, 100);
  let hitX = false;
  for (let i = 0; i < 20; i += 1) hitX = moveEntity(map, walker, 6, 0).hitX || hitX;
  check("walking into a wall stops at the tile edge", Math.abs(walker.x - (8 * TILE - 14)) < 0.001, `x=${walker.x}`);
  check("the wall reported hitX", hitX);

  const faller = box(40, 10); // left of the ceiling, straight down to the floor
  for (let i = 0; i < 40; i += 1) moveEntity(map, faller, 0, 6);
  check("falling lands on the floor top", Math.abs(faller.y - (10 * TILE - 22)) < 0.001, `y=${faller.y}`);
  check("landing reports grounded", moveEntity(map, faller, 0, 6).grounded);

  const jumper = box(100, 10 * TILE - 22);
  const up = moveEntity(map, jumper, 0, -90);
  check("ceiling stops an upward move", up.hitY && Math.abs(jumper.y - 4 * TILE) < 0.001, `y=${jumper.y}`);
});

group("collision: one-way platforms", () => {
  const map = new TileMap({ w: 20, h: 12, theme: "jungle", solids: [[0, 11, 20, 1]], platforms: [[5, 8, 4, 1]] });

  const fromAbove = box(5 * TILE + 4, 8 * TILE - 60);
  for (let i = 0; i < 30; i += 1) moveEntity(map, fromAbove, 0, 6);
  check("lands on a platform from above", Math.abs(fromAbove.y - (8 * TILE - 22)) < 0.001, `y=${fromAbove.y}`);

  const fromBelow = box(5 * TILE + 4, 8 * TILE - 2);
  const r = moveEntity(map, fromBelow, 0, -8);
  check("jumping up through a platform is allowed", !r.hitY, `hitY=${r.hitY}`);
});

group("collision: hazards and cover", () => {
  const map = new TileMap({ w: 20, h: 12, theme: "jungle", solids: [[0, 11, 20, 1]], water: [[6, 10, 2, 1]], decor: [{ t: "tuft", x: 3, y: 10 }] });
  const swimmer = box(6 * TILE + 2, 10 * TILE - 10);
  const r = moveEntity(map, swimmer, 0, 0);
  check("standing in water reports hazard", r.water, `tx=${r.tx} ty=${r.ty}`);
  const hider = box(3 * TILE + 1, 10 * TILE);
  check("standing in a tuft reports cover", moveEntity(map, hider, 0, 0).tuft);
});

group("sight and support", () => {
  const map = new TileMap({ w: 20, h: 12, theme: "jungle", solids: [[0, 11, 20, 1], [8, 8, 1, 3]] });
  check("clear line of sight over open ground", sightClear(map, 10, 10 * TILE, 100, 10 * TILE));
  check("wall blocks line of sight", !sightClear(map, 100, 9 * TILE, 150, 9 * TILE));
  const grounded = box(60, 11 * TILE - 22);
  check("supported() detects the floor", supported(map, grounded));
  const airborne = box(60, 6 * TILE);
  check("supported() is false in the air", !supported(map, airborne));
});

group("overlap", () => {
  check("touching edges do not overlap", !overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }));
  check("intersecting boxes overlap", overlap({ x: 5, y: 5, w: 10, h: 10 }, { x: 10, y: 10, w: 10, h: 10 }));
});

group("physics tuning sanity", () => {
  const jumpHeightPx = (PHYSICS.jumpSpeed ** 2) / (2 * PHYSICS.gravity);
  check("jump clears at least 2 tiles", jumpHeightPx >= 2 * TILE, `height=${jumpHeightPx.toFixed(1)}px`);
  check("jump does not clear 5 tiles (tuning is not absurd)", jumpHeightPx < 5 * TILE);
  check("dash covers more ground than a run step", PHYSICS.dashSpeed > PHYSICS.runSpeed * 2);
  check("sneak is slower than running", PHYSICS.sneakSpeed < PHYSICS.runSpeed);
  check("wall jump pushes away from the wall", PHYSICS.wallJumpX > 0 && PHYSICS.wallJumpY > 0);
  check("coyote and buffer windows are frames, not seconds", PHYSICS.coyoteFrames > 0 && PHYSICS.coyoteFrames < 30);
});

group("difficulty table", () => {
  check("three tiers defined", DIFFICULTY_ORDER.length === 3);
  for (const id of DIFFICULTY_ORDER) {
    const d = DIFFICULTY[id];
    check(`${id}: has all tuning fields`, ["masks", "enemySpeed", "vision", "hearing", "invuln", "waterDamage", "asteroidShields"].every((k) => d[k] !== undefined));
  }
  check("explorer is the most forgiving", DIFFICULTY.explorer.masks > DIFFICULTY.standard.masks && DIFFICULTY.explorer.vision < DIFFICULTY.standard.vision);
  check("nightmare is the harshest", DIFFICULTY.nightmare.masks < DIFFICULTY.standard.masks && DIFFICULTY.nightmare.enemySpeed > DIFFICULTY.standard.enemySpeed);
  check("explorer water is harmless", DIFFICULTY.explorer.waterDamage === 0);
});

group("level data integrity", () => {
  for (const def of ALL_LEVELS) {
    const map = new TileMap(def);
    const sx = def.start.x;
    const sy = def.start.y;
    check(`${def.id}: start is not inside a wall`, !map.isWall(sx, sy) && !map.isWall(sx, sy - 1));
    check(`${def.id}: start has ground within 3 tiles`, (() => {
      for (let dy = 1; dy <= 3; dy += 1) if (map.isWall(sx, sy + dy) || map.isPlatform(sx, sy + dy)) return true;
      return false;
    })());
    check(`${def.id}: width/height positive`, def.w > 0 && def.h > 0);
    const exits = (def.entities || []).filter((e) => e.t === "beacon" && e.exit);
    // the ship interior is a room, not a mission: it has no exit beacon
    if (!def.interior && def.id !== "hub") check(`${def.id}: has an exit beacon`, exits.length === 1);
  }
});

/* ------------------------------------------------------- progression gates */
group("progression gates", () => {
  /* The glacier carries the gate (WORLDS.m3.needs in scenes.js, and the m2 fuel
     cell at 53,9), so a glacier material in the boot's cost makes the run
     unfinishable: the world it unlocks would be the only source of something
     needed to unlock it. */
  const source = {};
  for (const m of Object.values(MATERIALS)) {
    source[m.key] = m.world;
    source[m.refined] = m.world;
  }
  const cost = Object.entries(TECH.doubleJump.cost);
  check(
    "impulse boot costs nothing from the glacier it unlocks",
    cost.every(([k]) => source[k] !== "m3"),
    `costs ${cost.map(([k, n]) => `${n} ${k} (${source[k]})`).join(", ")}`
  );
  check(
    "every tech cost names a material the game defines",
    Object.values(TECH).every((t) => Object.keys(t.cost).every((k) => source[k])),
    "an unknown cost key can never be paid, so the bench would offer the part forever"
  );
});

group('discovery journal and expanded carrier', () => {
  const ship = ALL_LEVELS.find((level) => level.id === 'ship');
  check('carrier is at least twice the original 46-tile ship width', ship.w >= 92);
  check('transmission IDs are unique', new Set(TRANSMISSIONS.map((e) => e.id)).size === TRANSMISSIONS.length);
  check('every transmission is actually placed in its world', TRANSMISSIONS.every((e) => ALL_LEVELS.find((l) => l.id === e.world)?.entities.some((cfg) => cfg.t === 'transmission' && cfg.id === e.id)));
  check('new saves start with an empty journal', freshSave().journal.length === 0);
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  values.set(SLOTS_KEY, JSON.stringify([{ v: 3, tech: {} }]));
  check('old saves acquire a journal without gaining tech', loadSlot(0).journal.length === 0 && !loadSlot(0).tech.extractor);
  const s = freshSave(); s.journal = ['ship-crew', 'ship-crew', 42]; writeSlot(0, s);
  check('save reload deduplicates journal IDs and rejects invalid entries', JSON.stringify(loadSlot(0).journal) === '["ship-crew"]');
  delete globalThis.localStorage;
});

/* ------------------------------------------------------------------ report */
process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed) {
  process.stdout.write("\nfailures:\n");
  for (const f of failures) process.stdout.write(` - ${f}\n`);
  process.exit(1);
}
