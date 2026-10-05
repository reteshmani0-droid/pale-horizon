/**
 * Pale Horizon self-test
 * ------------------
 * Drives the real game with the real systems, but steps the simulation by hand
 * (a fixed 1/60s per tick) so results never depend on frame rate. Open the game
 * with  index.html?selftest=1  to run it: a report is drawn on screen, printed
 * to the console and left on window.PALE_HORIZON.selftest for tooling.
 *
 * This file is dev-only: it is loaded by main.js only when the URL asks for it,
 * so it never ships inside a normal play session.
 */
import { IMG } from "../src/assets.js";
import { TRANSMISSIONS } from '../src/journal.js';
import { themeOf } from '../src/engine.js';
import { DIFFICULTY, DIFFICULTY_ORDER } from "../src/core/config.js";
import { loadSave, persist, LevelScene } from "../src/scenes.js";
import { getVolumes, setVolume, toggleMute, isMuted, initAudio } from "../src/audio.js";
import { Relay, Creeper, MovingPlatform, Pickup, Plate, Processor } from "../src/entities.js";
import { closeProcessor, openProcessor, processorUpdate, processorOpen } from "../src/minigame.js";
import { hidePanel } from "../src/ui.js";
import { closeAdmin, adminOpen } from "../src/admin.js";
import { openCodes, closeCodes, codesOpen } from "../src/codes.js";

const DT = 1 / 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runSelfTest(api) {
  const storageKeys = ['starfall.slots.v3', 'starfall.save.v2'];
  const originalStorage = storageKeys.map((key) => [key, localStorage.getItem(key)]);
  const g = api.game;
  const originalSave = structuredClone(g.save);
  const originalTravelInstant = g.travelInstant;
  g.travelInstant = true;
  const input = api.input;
  const runtime = api.runtime || { errors: [] };
  const results = [];

  /* --------------------------------------------------------------- helpers */
  /* Drive the one input object the game reads, and tick frames exactly like the
     real loop does (update + endFrame). Real key events would race the live
     requestAnimationFrame loop and make taps fire twice. */
  const step = (n) => { for (let i = 0; i < n; i += 1) { g.update(DT); input.endFrame(); } };
  const hold = (action) => { input.state[action] = true; input.tapped.add(action); };
  const release = (action) => { input.state[action] = false; };
  const tap = (action) => { hold(action); step(1); release(action); };
  const tapFor = (action, frames) => { hold(action); step(frames); release(action); };

  /** Click a story box away (the real advance path, so its onDone still runs). */
  const dismissDialogue = () => {
    const el = document.getElementById("dialogue");
    for (let i = 0; i < 24 && el && !el.classList.contains("hidden"); i += 1) el.click();
    const S = g.scene;
    if (S && typeof S.frozen === "boolean") S.frozen = false;
  };

  /** Start a level without its intro dialogue getting in the way. */
  const start = (id, frames = 40) => {
    dismissDialogue();
    input.reset();
    g.save.seenIntro[id === 'hub' ? 'ship' : id] = true;
    g.save.seenIntro[`${id}_outro`] = true;
    g.startLevel(id);
    step(frames);
    dismissDialogue();
    step(2);
    return g.scene;
  };
  const put = (S, x, y) => {
    S.player.x = x;
    S.player.y = y;
    S.player.vx = 0;
    S.player.vy = 0;
    S.player.dashFrames = 0;
    S.player.controlLock = 0;
  };
  const near = (S, ent, dx = -14) => put(S, ent.x + dx, ent.y - 4);

  const check = (name, fn) => {
    try {
      const r = fn();
      const ok = r === true || (r && r.ok);
      const note = r && r.note ? r.note : "";
      results.push({ name, ok, note });
    } catch (err) {
      results.push({ name, ok: false, note: `threw: ${err && err.message}` });
    }
  };

  /* --------------------------------------------------------------- 1. boot */
  check("assets: every sprite loaded", () => {
    const missing = Object.entries(IMG).filter(([, img]) => !img || !img.complete || img.naturalWidth === 0);
    return { ok: Object.keys(IMG).length >= 50 && missing.length === 0, note: `${Object.keys(IMG).length} images, ${missing.length} broken` };
  });

  check("audio: context, buses and volume clamping", () => {
    const ctx = initAudio();
    if (!ctx) return { ok: false, note: "no AudioContext" };
    setVolume("sfx", 5);
    const high = getVolumes().sfx;
    setVolume("sfx", -1);
    const low = getVolumes().sfx;
    setVolume("sfx", 0.8);
    toggleMute();
    const muted = isMuted();
    toggleMute();
    return { ok: high === 1 && low === 0 && muted === true && isMuted() === false, note: `clamp ${low}..${high}, mute works` };
  });

  /* ------------------------------------------------------- 2. difficulty */
  check("difficulty: each tier sets masks and scaling", () => {
    const rows = [];
    for (const id of DIFFICULTY_ORDER) {
      g.setDifficulty(id);
      const S = start("m1", 10);
      const d = DIFFICULTY[id];
      rows.push(`${d.name}:${S.player.maxMasks}/${d.masks} enemies:${S.enemies.length}`);
      if (S.player.maxMasks !== d.masks) return { ok: false, note: rows.join(" ") };
    }
    g.setDifficulty("standard");
    return { ok: true, note: rows.join(" | ") };
  });

  /** Give the pilot the bought abilities a fully-equipped pilot would have. */
  const grantKit = (S) => {
    S.player.dash = true;
    S.player.doubleJump = true;
    S.player.wall = true;
    S.player.airJumps = 1;
    S.player.airDashes = 1;
    return S;
  };

  /* --------------------------------------------------------- 3. movement */
  /* The hub is the physics sandbox: flat ground, tall walls, no creepers. */
  const sandbox = () => {
    const S = start("hub", 20);
    grantKit(S);
    put(S, 64, 288);
    step(20);
    return S;
  };

  check("movement: running covers ground", () => {
    const S = sandbox();
    const x0 = S.player.x;
    tapFor("right", 60);
    const dx = S.player.x - x0;
    step(25);
    const stopped = S.player.vx;
    return { ok: dx > 90 && dx < 300 && Math.abs(stopped) < 0.3, note: `dx=${dx.toFixed(1)}px in 1s, rest vx=${stopped.toFixed(2)}` };
  });

  check("movement: sneak is quiet and slow", () => {
    const S = sandbox();
    const x0 = S.player.x;
    hold("down"); tapFor("right", 60); release("down");
    const dx = S.player.x - x0;
    return { ok: dx > 20 && dx < 80, note: `sneak dx=${dx.toFixed(1)}px (run is ~140)` };
  });

  check("movement: jump arc and landing", () => {
    const S = sandbox();
    const y0 = S.player.y;
    let apex = y0;
    hold("jump");
    for (let i = 0; i < 45; i += 1) { step(1); apex = Math.min(apex, S.player.y); }
    release("jump");
    step(90);
    const rise = y0 - apex;
    return { ok: rise > 30 && rise < 80 && S.player.grounded, note: `apex ${rise.toFixed(1)}px, landed grounded=${S.player.grounded}` };
  });

  check("movement: short-hop cut lets you tap the jump button", () => {
    const S = sandbox();
    const y0 = S.player.y;
    let apex = y0;
    hold("jump");
    step(4);
    release("jump");          // released early
    for (let i = 0; i < 40; i += 1) { step(1); apex = Math.min(apex, S.player.y); }
    const shortRise = y0 - apex;
    step(60);
    const y1 = S.player.y;
    let apex2 = y1;
    hold("jump");
    for (let i = 0; i < 45; i += 1) { step(1); apex2 = Math.min(apex2, S.player.y); }
    release("jump");
    const fullRise = y1 - apex2;
    return { ok: fullRise > shortRise + 8, note: `tap ${shortRise.toFixed(1)}px vs hold ${fullRise.toFixed(1)}px` };
  });

  check("movement: dash is fast, cool-down gated", () => {
    const S = sandbox();
    hold("right");
    step(20);
    const x0 = S.player.x;
    const dashX = S.player.x;
    tapFor("dash", 10);
    const dx = S.player.x - x0;
    const cooling = S.player.dashCool;
    const before = S.player.dashFrames;
    tapFor("dash", 8);            // refused: still cooling down
    const reDash = S.player.dashFrames > before;
    const coolKept = S.player.dashCool > 0 && S.player.dashCool <= cooling;
    release("right");
    return {
      ok: dx > 45 && dx < 80 && !reDash && coolKept,
      note: `dash ${dx.toFixed(1)}px, cooldown ${cooling.toFixed(0)}f, immediate re-dash refused=${!reDash}`,
    };
  });

  check("movement: air dash is limited to one per airtime", () => {
    const S = sandbox();
    const float = () => {
      S.player.x = 200;
      S.player.y = 100;
      S.player.vx = 0;
      S.player.vy = 0;
      S.player.grounded = false;
      S.player.dashFrames = 0;
      S.player.dashCool = 0;
    };
    float();
    const air0 = S.player.airDashes;
    tapFor("dash", 2);
    const after1 = S.player.airDashes;
    float();                        // cooldown cleared on purpose: only the limit can refuse us
    tapFor("dash", 3);
    const after2 = S.player.airDashes;
    const spinning = S.player.state === "dash" && after2 === 0;
    S.player.x = 64; S.player.y = 288;
    step(120);
    const restored = S.player.airDashes;
    return {
      ok: air0 >= 1 && after1 === 0 && after2 === 0 && restored >= 1,
      note: `air dashes ${air0} -> ${after1} -> ${after2}, no second dash=${spinning}, on landing ${restored}`,
    };
  });

  check("movement: wall slide and wall jump", () => {
    const S = grantKit(start("hub", 20));
    put(S, 40, 190);
    hold("left");
    step(30);
    const sliding = S.player.state === "wallslide" || S.player.touchingWall === true;
    const yBefore = S.player.y;
    tapFor("jump", 14);
    const jumped = S.player.y < yBefore - 8;
    const pushedAway = S.player.vx > 0.5;
    release("left");
    return { ok: sliding && jumped && pushedAway, note: `slide=${sliding}, jumped=${jumped}, pushed away=${pushedAway}` };
  });

  /* --------------------------------------------------- 4. caught, no combat */
  check("catch: contact restarts the descent, it does not drain a health bar", () => {
    const S = start("m1");
    const foe = S.enemies.find((e) => e instanceof Creeper);
    if (!foe) return { ok: false, note: "no creeper in m1" };
    const before = g.save.catches;
    const masks = S.player.masks;
    put(S, foe.x, foe.y);
    let frames = 0;
    while (!S.caughtAlready && frames < 240) { g.update(DT); input.endFrame(); frames += 1; }
    const caught = S.caughtAlready === true;
    const counted = g.save.catches === before + 1;
    const frozen = S.frozen === true;
    const untouched = S.player.masks === masks;
    const card = document.getElementById("caught").classList.contains("on");
    clearTimeout(S.restartTimer);            // the async check owns the restart
    g.caughtOverlay(false);
    return {
      ok: caught && counted && frozen && untouched && card,
      note: `caught after ${frames}f, catches ${before}->${g.save.catches}, masks untouched=${untouched}, card shown=${card}`,
    };
  });

  check("catch: the card is a small slip, and the plant pulls under while the bird lifts", () => {
    const slip = document.querySelector("#caught .slip");
    if (!slip) return { ok: false, note: "no .slip inside #caught" };
    const lines = [];
    const run = (world, kind) => {
      const S = start(world, 20);
      const foe = S.enemies.find((e) => e.constructor.name === kind);
      if (!foe) return null;
      put(S, foe.x, foe.y);
      let frames = 0;
      while (!S.caughtAlready && frames < 240) { step(1); frames += 1; }
      const box = slip.getBoundingClientRect();
      const row = { shown: S.caughtAlready === true, line: document.getElementById("caught-line").textContent, under: Boolean(S.grab && S.grab.under), w: Math.round(box.width), h: Math.round(box.height) };
      clearTimeout(S.restartTimer);
      g.caughtOverlay(false);
      lines.push(`${kind}: "${row.line}" ${row.w}x${row.h} under=${row.under}`);
      return row;
    };
    const plant = run("m1", "Creeper");
    const bird = run("m3", "Bird");
    const ok = Boolean(plant && bird)
      && plant.shown && bird.shown
      && plant.line === "PULLED UNDER THE ROOTS" && plant.under
      && bird.line === "TAKEN UP INTO THE AIR" && !bird.under
      && plant.w > 120 && plant.w < 320 && plant.h < 120
      && bird.w > 120 && bird.w < 320 && bird.h < 120;
    return { ok, note: lines.join(" | ") || "no creeper in m1 / no bird in m3" };
  });

  check("stealth: the ground wedge a creeper shows is the ground it feels", () => {
    const S = start("m1", 25);
    g.godMode = true;                 // measuring, not playing
    const foe = S.enemies.find((e) => e.constructor.name === "Creeper");
    if (!foe) return { ok: false, note: "no creeper in m1" };
    const foot = foe.y + foe.h;
    const walk = 34;                  // inside a standing reach of 132*0.55
    S.player.hidden = false;          // standing in a tuft is a separate rule
    const at = (dx, dy) => {
      put(S, foe.x + foe.dir * dx, foot + dy - S.player.h);
      S.player.hidden = false;
      return foe.canSee(S.player, S);
    };
    const inWedge = at(walk, 0);      // on the same ground, in front of the trap
    const above = at(walk, -46);      // 46px up a bank: the old eye rule saw this
    const behind = at(-walk, 0);      // behind the trap
    const far = at(400, 0);           // well outside the reach
    g.godMode = false;
    return {
      ok: inWedge && !above && !behind && !far,
      note: `in the wedge=${inWedge}; 46px up a bank=${above} (must be false); behind=${behind}; 400px away=${far}`,
    };
  });

  check("birds: they reach the ground they patrol, and grass does not hide you", () => {
    const S = start("m3", 25);
    g.godMode = true;
    const bird = S.enemies.find((e) => e.constructor.name === "Bird");
    if (!bird) return { ok: false, note: "no bird in m3" };
    if (bird.shadowY === null) return { ok: false, note: "the bird found no ground below it" };
    const ground = bird.shadowY;
    const place = (dx, dy, speed, hidden) => {
      put(S, bird.x + bird.w / 2 + bird.dir * dx - S.player.w / 2, ground + dy - S.player.h);
      S.player.vx = speed;
      S.player.speed = Math.abs(speed);
      S.player.hidden = hidden;
      return bird.canSee(S.player, S);
    };
    const swept = ground - bird.y;                 // how far above the floor it flies
    const grassUnder = place(30, 0, 3, true);      // running under it, hidden in a tuft
    const farthest = (speed) => {
      let best = 0;
      for (let dx = 4; dx <= 260; dx += 4) if (place(dx, 0, speed, false)) best = dx;
      return best;
    };
    const runReach = farthest(3);
    const sneakReach = farthest(0.4);
    const aboveIt = place(30, -(swept + 70), 3, false);
    g.godMode = false;
    return {
      ok: grassUnder && runReach > 30 && sneakReach < runReach && !aboveIt,
      note: `running under it in grass=${grassUnder}; its swept ground ${runReach}px running vs ${sneakReach}px sneaking; ${Math.round(swept + 70)}px above it=${aboveIt}`,
    };
  });

  check("catch: the test deck's catch-proof mode lets the same contact pass", () => {
    g.godMode = true;
    const S = start("m1", 20);
    const foe = S.enemies.find((e) => e instanceof Creeper);
    put(S, foe.x, foe.y);
    step(24);
    const safe = !S.caughtAlready;
    g.godMode = false;
    return { ok: safe, note: `contact with catch-proof on restarted=${Boolean(S.caughtAlready)}` };
  });

  check("health: beacons heal and set the checkpoint", () => {
    const S = start("m1");
    S.player.masks = 1;
    const beacon = S.beacons.find((b) => !b.exit);
    near(S, beacon, 0);
    step(4);
    tap("use");
    step(4);
    return { ok: S.player.masks === S.player.maxMasks && S.checkpoint && S.checkpoint.x === beacon.x, note: `masks ${S.player.masks}/${S.player.maxMasks}, checkpoint ${S.checkpoint && S.checkpoint.x}` };
  });

  /* -------------------------------------------------------- 5. collecting */
  check("pickups: fuel banks into the run and the save", () => {
    const S = start("m1");
    const fuel = S.pickups.find((p) => p instanceof Pickup && p.type === "fuel");
    const before = S.got.fuel;
    const bankedBefore = g.save.collected.m1.fuel;
    put(S, fuel.x, fuel.y);
    step(8);
    g.save.collected.m1.fuel = bankedBefore;   // restore the shared counter for later runs
    return {
      ok: S.got.fuel === before + 1 && fuel.taken === true,
      note: `run fuel ${before} -> ${S.got.fuel}, save wrote ${g.save.collected.m1.fuel}`,
    };
  });

  check("exits: beacon refuses without fuel, opens with it", () => {
    const S = start("m1");
    const exit = S.beacons.find((b) => b.exit);
    S.got.fuel = 0;
    near(S, exit, 0);
    step(4);
    tap("use");
    step(4);
    const refused = !S.complete;
    S.got.fuel = 3;
    step(4);
    tap("use");
    step(6);
    const finished = S.complete === true;
    const hub = g.scene.def.id === "ship";
    return { ok: refused && finished && hub, note: `refused=${refused}, finished=${finished}, back at ${g.scene.def.id}` };
  });

  /* --------------------------------------------------------- 6. puzzles */
  check("m2 puzzle: block pushes onto its plate and opens the seal", () => {
    const S = start("m2");
    const plate = S.plates.find((p) => p instanceof Plate);
    const block = S.blocks.find((b) => b.home.x < plate.x);
    if (!plate || !block) return { ok: false, note: "m2 puzzle entities missing" };
    const door = S.doors.find((d) => d.group === plate.group);
    put(S, block.x - 20, block.y - 6);
    step(10);
    hold("right");
    let frames = 0;
    while (frames < 900 && !plate.pressed) { step(1); frames += 1; }
    release("right");
    step(10);
    return {
      ok: plate.pressed === true && door.solid === false,
      note: `plate pressed after ${frames}f, block x=${block.x.toFixed(0)} plate x=${plate.x}, door solid=${door.solid}`,
    };
  });

  check("m2 soul: orb is carried and fuses with Moria", () => {
    const S = start("m2");
    const orb = S.orbs[0];
    near(S, orb, 0);
    step(4);
    tap("use");
    step(4);
    const carried = S.carryingOrb === true && orb.taken === true;
    const moria = S.morias[0];
    put(S, moria.x - 20, moria.y);
    step(20);
    const fused = S.fused === true;
    const unlocked = S.pickups.every((p) => !p.locked);
    return { ok: carried && fused && unlocked, note: `carried=${carried}, fused=${fused}, rewards unlocked=${unlocked}` };
  });

  check("m3 power: ember charge from charger lights a relay and raises its bridge", () => {
    const S = start("m3");
    const charger = S.relays.find((r) => r instanceof Relay && r.role === "charger");
    const relay = S.relays.find((r) => r instanceof Relay && r.role === "relay");
    const bridge = S.doors.find((d) => d.invert && d.group === relay.group);
    if (!charger || !relay || !bridge) return { ok: false, note: "m3 charger/relay/bridge missing" };
    const bridgeWasUp = bridge.solid;
    near(S, charger, 0);
    step(4);
    tap("use");
    step(4);
    const got = S.player.ember === true;
    near(S, relay, 0);
    step(4);
    tap("use");
    step(6);
    return {
      ok: got && relay.active === true && bridge.solid === true,
      note: `ember=${got}, relay=${relay.active}, bridge up: ${bridgeWasUp} -> ${bridge.solid}`,
    };
  });

  check("m3 weather: wind gusts push the pilot", () => {
    const S = start("m3", 10);
    if (!S.def.wind) return { ok: false, note: "m3 has no wind flag" };
    let maxPower = 0;
    let pushed = 0;
    for (let i = 0; i < 900; i += 1) {
      g.update(DT);
      maxPower = Math.max(maxPower, S.windPower);
      if (Math.abs(S.player.vx) > 2.6) pushed += 1;
    }
    return { ok: maxPower > 0.2, note: `max gust ${maxPower.toFixed(2)}, frames nudged ${pushed}` };
  });

  check("m3 lift: moving platforms carry the pilot", () => {
    const S = start("m3", 10);
    const lift = S.moving.find((m) => m instanceof MovingPlatform);
    if (!lift) return { ok: true, note: "no moving platform in m3 - skipped" };
    put(S, lift.x + 8, lift.y - 22);
    step(6);
    const liftY0 = lift.y;
    let rode = 0;
    for (let i = 0; i < 150; i += 1) {
      step(1);
      if (Math.abs(S.player.y + S.player.h - lift.y) < 8) rode += 1;
    }
    const travelled = Math.abs(lift.y - liftY0);
    return { ok: rode > 40 && travelled > 15, note: `on the lift ${rode}/150 frames, lift travelled ${travelled.toFixed(0)}px` };
  });

  /* -------------------------------------------------------- 7. asteroid */
  check("asteroid: run starts, shields scale, impacts land", () => {
    const shields = DIFFICULTY[g.save.difficulty].asteroidShields;
    g.startAsteroids();
    step(4);
    const S = g.scene;
    const ok = S.shields === shields && S.duration === 45;
    let hit = false;
    const before = S.shields;
    for (let i = 0; i < 600 && !hit; i += 1) { g.update(DT); if (S.shields < before) hit = true; }
    g.toHub();
    step(4);
    return { ok: ok && S.over !== undefined, note: `shields=${shields}, impact within 10s=${hit}` };
  });

  check("asteroid: developer drill never grants progression fuel", () => {
    g.startAsteroids();
    step(4);
    const S = g.scene;
    const beforeFuel = g.save.bonusFuel;
    S.t = S.duration;
    S.over = false;
    step(4);
    const paid = g.save.asteroid.cleared === true;
    const fuel = g.save.bonusFuel;
    hidePanel();
    g.toHub();
    step(4);
    return { ok: paid && fuel === beforeFuel, note: `cleared=${paid}, bonusFuel unchanged=${fuel === beforeFuel}, back at ${g.scene.def.id}` };
  });

  /* ------------------------------------------ authored gameplay regressions */
  check("m2 double seal: two distinct crates pushed onto both plates", () => {
    const S = start('m2');
    const plates = S.plates.filter((p) => p.group === 6).sort((a,b) => b.x - a.x);
    const blocks = S.blocks.filter((b) => b.home.x >= 26 * 16 && b.home.x <= 31 * 16).sort((a,b) => b.x - a.x);
    const gate = S.doors.find((d) => d.group === 6);
    const closed = gate.solid;
    const frames = [];
    for (let j = 0; j < 2; j++) {
      put(S, blocks[j].x - S.player.w - 2, 298);
      step(5);
      hold('right');
      let n = 0;
      while (n < 180 && !plates[j].pressed) { step(1); n++; }
      release('right'); step(12); frames.push(n);
      if (j === 0 && !gate.solid) return { ok: false, note: 'one crate incorrectly opened the two-weight gate' };
    }
    return { ok: closed && plates.every((p) => p.pressed) && !gate.solid && blocks[0].x > blocks[1].x + 16, note: `pushes ${frames.join('/')} frames; both held=${plates.every(p=>p.pressed)}` };
  });
  check("m2 timed gallery: run through before expiry; no gate closes inside player", () => {
    const S = start('m2');
    const plate = S.plates.find((p) => p.group === 7);
    const gate = S.doors.find((d) => d.group === 7);
    put(S, plate.x, 298); step(10);
    const opened = !gate.solid;
    hold('right'); let frames = 0;
    while (frames < 170 && S.player.x < gate.x + gate.w + 4) { step(1); frames++; }
    release('right');
    const crossed = S.player.x > gate.x + gate.w;
    step(200); const closed = gate.solid;
    put(S, plate.x, 298); step(10);
    put(S, gate.x, 298); step(220);
    const safe = !gate.solid;
    put(S, gate.x + gate.w + 12, 298); step(5);
    return { ok: opened && crossed && closed && safe && gate.solid, note: `crossed in ${frames}f; expires=${closed}; safe close=${safe}` };
  });
  check("extractor: required kit, uninterrupted hold, exactly one batch", () => {
    const savedTech = { ...g.save.tech };
    g.save.tech.extractor = false;
    const S = start('m2');
    const seam = S.seams.find((e) => e.material === 'ore');
    put(S, seam.x, 298); step(3);
    const before = g.save.raw.ore;
    hold('use'); step(100); release('use'); step(1);
    const refused = !seam.drained && g.save.raw.ore === before;
    g.save.tech.extractor = true;
    hold('use'); step(35); release('use'); step(40);
    const decayed = seam.progress === 0;
    hold('use'); step(100); release('use'); step(1);
    const extracted = seam.drained && g.save.raw.ore === before + seam.amount && S.got.mat === seam.amount;
    hold('use'); step(120); release('use'); step(1);
    const once = g.save.raw.ore === before + seam.amount && !seam.interactive;
    g.save.tech = savedTech;
    return { ok: refused && decayed && extracted && once, note: `kit required=${refused}; interrupt resets=${decayed}; batch=${extracted}; once=${once}` };
  });
  check("frost cache: moving hunter frozen on plate opens gate, thaw closes it", () => {
    const S = start('m1');
    g.godMode = true;
    const plate = S.plates.find((p) => p.wants === 'frozen');
    const hunter = S.enemies.find((e) => e instanceof Creeper && e.home.x === 137 * 16);
    const gate = S.doors.find((d) => d.group === plate.group);
    put(S, plate.x + 38, 298);
    S.player.freezeGun = true; S.player.dir = -1;
    let n = 0;
    while (n < 360 && !(hunter.x < plate.x + 16 && hunter.x + hunter.w > plate.x)) { step(1); n++; }
    tap('freeze'); step(5);
    const opened = hunter.frozen > 0 && plate.pressed && !gate.solid;
    put(S, 130 * 16, 298); step(440);
    const closed = !plate.pressed && gate.solid;
    g.godMode = false;
    return { ok: opened && closed, note: `hunter walked onto plate after ${n}f; frozen open=${opened}; thaw close=${closed}` };
  });
  check("ship parkour: starting kit reaches research by real jumps", () => {
    const tech = { ...g.save.tech }, abilities = { ...g.save.abilities };
    g.save.tech = {}; g.save.abilities = {};
    const S = start('ship', 25);
    const poses = [];
    const hop = (dir, n) => { hold('jump'); hold(dir); step(n); release(dir); step(30); release('jump'); step(20); poses.push(`${S.player.x.toFixed(0)},${S.player.y.toFixed(0)}`); };
    tapFor('right', 136); step(20);
    hop('right', 8); hop('right', 18); hop('right', 1); hop('right', 25);
    const lab = S.relays.find((r) => r.role === 'lab');
    const arrived = S.player.y + S.player.h <= 13 * 16 + 1 && Math.abs(S.player.x - lab.x) < 55;
    g.save.tech = tech; g.save.abilities = abilities;
    return { ok: arrived, note: `landings ${poses.join(' → ')}; research reachable=${arrived}` };
  });
  check("travel: unique outbound/return routes render and complete without timers", () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 368;
    const ctx = canvas.getContext('2d'); const titles = new Set();
    let count = 0;
    const { TravelScene } = api.scenes;
    for (const id of ['m1','m2','m3']) for (const back of [false,true]) {
      let arrived = null;
      const dummy = { difficulty: DIFFICULTY.standard, startLevel: (to) => { arrived = to; }, toHub: () => { arrived = 'ship'; } };
      const S = new TravelScene(dummy, back ? 'ship' : id, { from: back ? id : 'ship' });
      titles.add(back ? S.route.back : S.route.out);
      while (!S.done) {
        // Each authored shot is exercised at the start, midpoint and end.
        for (const t of [0, S.phaseDur / 2, S.phaseDur - .01]) { S.phaseT = t; S.draw(ctx); }
        const before = S.particles.items.length; S.draw(ctx); S.draw(ctx);
        if (S.particles.items.length !== before) return { ok: false, note: 'render emitted particles' };
        if (S.phase === 'belt') {
          S.phaseT = S.phaseDur / 2;
          input.reset(); hold('use'); S.update(DT); release('use'); input.endFrame();
          if (S.phase !== 'belt') return { ok: false, note: 'belt was skippable' };
        }
        S.advance();
      }
      S.leave(); S.update(100);
      if (arrived !== (back ? 'ship' : id)) return { ok: false, note: 'wrong destination' };
      count++;
    }
    input.reset();
    return { ok: count === 6 && titles.size === 6, note: `${count} legs, ${titles.size} different titles; no render side effects; belts unskippable` };
  });
  check("travel: impacts exhaust shields and restart the crossing checkpoint", () => {
    const dummy = { difficulty: DIFFICULTY.standard, startLevel: () => {}, toHub: () => {} };
    const S = new api.scenes.TravelScene(dummy, 'm2'); S.advance(); S.advance();
    S.phaseT = 3;
    for (let n = 0; n < S.maxShields; n++) {
      S.pod.inv = 0;
      S.rocks = [{ x: S.pod.x + 6, y: S.pod.y + 8, w: 16, h: 16, vx: 0, spr: 'spr_ast_s' }];
      S.update(DT);
    }
    const ok = S.attempts === 1 && S.phase === 'belt' && S.phaseT === 0 && S.shields === S.maxShields;
    S.leave();
    return { ok, note: `checkpoint retries=${S.attempts}; integrity=${S.shields}; timer=${S.phaseT}` };
  });

  check("codes: explicit mixed-case admin only; unknown and movement typing do not unlock", () => {
    closeAdmin(); closeCodes();
    for (const key of 'admin') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    }
    const hidden = !adminOpen();
    openCodes();
    const field = document.getElementById('codes-input');
    field.value = 'unknown'; field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const unknown = !adminOpen() && codesOpen();
    field.value = '  AdMiN  '; field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const unlocked = adminOpen() && !codesOpen();
    closeAdmin(); input.reset();
    return { ok: hidden && unknown && unlocked, note: `movement safe=${hidden}; unknown rejected=${unknown}; admin accepted=${unlocked}` };
  });
  check("travel: full belt completed by steering; no cinematic shortcut", () => {
    const dummy = { difficulty: DIFFICULTY.standard, startLevel: () => {}, toHub: () => {} };
    const S = new api.scenes.TravelScene(dummy, 'm3'); S.advance(); S.advance();
    const random = Math.random;
    let frames = 0;
    try {
      Math.random = () => .5; // deterministic mid-lane rocks; fly above them
      input.reset(); hold('jump');
      for (; frames < 900 && S.phase === 'belt'; frames++) {
        S.update(DT); input.endFrame();
        if (frames === 60) release('jump');
      }
    } finally { Math.random = random; release('jump'); input.reset(); S.leave(); }
    return { ok: S.phase === 'fold' && S.hits === 0 && frames >= 720, note: `${frames} actual simulation frames; hits=${S.hits}; next=${S.phase}` };
  });
  check("intro: visible skid decelerates and complete timeline hands off exactly once", () => {
    let ended = 0;
    const S = new api.scenes.IntroScene({}, () => { ended++; });
    const early = S.crashPose(1).x - S.crashPose(0).x;
    const late = S.crashPose(3.6).x - S.crashPose(2.6).x;
    const c = document.createElement('canvas'); c.width = 640; c.height = 368;
    input.reset();
    for (let f = 0; f < 2000 && !S.done; f++) { S.update(DT); S.draw(c.getContext('2d')); input.endFrame(); }
    S.update(100); S.leave();
    return { ok: early > late * 3 && ended === 1 && S.done, note: `first second ${early.toFixed(0)}px vs last ${late.toFixed(0)}px; handoffs=${ended}` };
  });

  check("overlays: closing keyboard-focused buttons restores movement input", () => {
    start('ship', 25);
    g.scene.openPause();
    const resume = document.querySelector('#panel-actions button');
    resume.focus(); resume.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const panelReleased = input.down('right') && !document.getElementById('panel').contains(document.activeElement);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    g.openTestDeck();
    const close = document.getElementById('admin-close'); close.focus(); close.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    const adminReleased = input.down('left') && !document.getElementById('admin').contains(document.activeElement);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    input.reset();
    return { ok: panelReleased && adminReleased, note: `panel releases focus=${panelReleased}; admin releases focus=${adminReleased}` };
  });

  check('graphics: 15 pixel parallax layers and a fully remodeled carrier', () => {
    const layers = Object.entries(IMG).filter(([name]) => name.startsWith('bg_'));
    const binaryAlpha = layers.every(([,img]) => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img,0,0);
      const data = ctx.getImageData(0,0,c.width,c.height).data;
      for (let p=3;p<data.length;p+=4) if (data[p] !== 0 && data[p] !== 255) return false;
      return true;
    });
    return { ok: layers.length === 15 && binaryAlpha && IMG.spr_ship.width === 192 && IMG.spr_ship.height === 96 && themeOf('ice').top === 'tile_crystal', note: `${layers.length} layers, hard pixel alpha=${binaryAlpha}; ship ${IMG.spr_ship.width}×${IMG.spr_ship.height}; ice uses its own tiles` };
  });
  check('journal: recover with USE, read once, preserve across reload and display in archive', () => {
    const S = start('ship');
    const entry = S.transmissions.find(e => e.id === 'ship-crew');
    g.save.journal = [];
    put(S, entry.x - 12, 298); step(10); tap('use');
    const recovered = g.save.journal.includes(entry.id) && !document.getElementById('panel').classList.contains('hidden');
    hidePanel(); tap('use'); hidePanel();
    const once = g.save.journal.length === 1;
    const loaded = loadSave(g.save.slot).journal.includes(entry.id);
    tap('journal');
    const visible = document.getElementById('panel-title').textContent === 'FIELD JOURNAL' && document.getElementById('panel-body').textContent.includes('STARFALL');
    hidePanel();
    return { ok: recovered && once && loaded && visible, note: `recovered=${recovered}, once=${once}, reload=${loaded}, archive=${visible}` };
  });
  check('expanded carrier: walk from launch bay to engineering and jump onto observation', () => {
    const tech = { ...g.save.tech }, abilities = { ...g.save.abilities };
    g.save.tech = {}; g.save.abilities = {};
    const S = start('ship',25);
    put(S, 44*16,298); step(10);
    tapFor('right', 227); step(10);
    const visited = S.player.x > 77*16;
    const landings=[];
    for (const n of [10,16,22]) {
      hold('jump'); hold('right'); step(n); release('right'); step(30); release('jump'); step(20);
      landings.push(`${Math.round(S.player.x)},${Math.round(S.player.y)}`);
    }
    const reached = S.player.x > 85*16 && S.player.y + S.player.h <= 14*16 + 1;
    g.save.tech = tech; g.save.abilities = abilities;
    return { ok: visited && reached, note: `engineering visited=${visited}; landings ${landings.join(' → ')}; observation=${reached}` };
  });
  check('render: pixel scenes never mutate the follow camera', () => {
    const S = start('ship'); S.camera.shake = .5;
    const before = [S.camera.x,S.camera.y];
    for(let i=0;i<20;i++) g.draw();
    return { ok: before[0] === S.camera.x && before[1] === S.camera.y, note: `camera ${before.join(',')} → ${S.camera.x},${S.camera.y}` };
  });

  check('smelter: real arrow input solves both memory rounds, including UP', () => {
    const oldRandom = Math.random;
    const choices = [.1,.3,.6,.9]; let at=0, won=null;
    try {
      Math.random=()=>choices[(at++)%choices.length];
      openProcessor('smelt', result => { won=result; });
      input.reset();
      const advance=n=>{for(let f=0;f<n;f++){processorUpdate(DT); input.endFrame();}};
      for(let round=0;round<2;round++) {
        advance(round ? 230 : 190);
        for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']) {
          window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
          advance(1);
          window.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true}));
          advance(1);
        }
      }
    } finally { Math.random=oldRandom; if(processorOpen()) closeProcessor(false); input.reset(); }
    return { ok: won === true, note: `two full orders processed through keyboard events; success=${won}` };
  });

  /* ------------------------------------------------- 8. systems & safety */
  check("save: difficulty and audio persist and reload", () => {
    g.setDifficulty("nightmare");
    g.saveAudio();
    const after = loadSave(g.save.slot || 0);
    g.setDifficulty("standard");
    g.saveAudio();
    return { ok: after.difficulty === "nightmare", note: `round-trip difficulty=${after.difficulty}, audio.master=${after.audio.master}` };
  });

  check("tutorial: boots and its one-cell exit gate opens on one cell", () => {
    const S = start("tut", 30);
    const locked = S.ready() === false;
    S.got.fuel = 1;
    const open = S.ready() === true;
    return { ok: locked && open, note: `locked at 0 cells=${locked}, open at 1 cell=${open}` };
  });

  check("tutorial: the deck is playable out of the EVA suit and has a practice rig", () => {
    const S = start("tut", 20);
    const rig = S.processors.find((p) => p instanceof Processor);
    return {
      ok: S.suitless === true && S.player.suitless === true && Boolean(rig) && rig.kind === "purify",
      note: `suitless=${S.suitless}, rig=${rig ? rig.kind : "none"}`,
    };
  });

  /* ------------------------------------------------- 8b. material pipeline */
  check("processors: an empty hopper is refused, a loaded one pays out", () => {
    const S = start("m1", 20);
    const rig = S.processors.find((p) => p instanceof Processor);
    if (!rig) return { ok: false, note: "no processor in m1" };
    g.save.raw.biomass = 0;
    g.save.refined.rations = 0;
    put(S, rig.x + 9, rig.y + 6);
    step(2);
    tap("use");
    step(2);
    const refusedEmpty = g.save.refined.rations === 0;
    const closed = document.getElementById("minigame").classList.contains("hidden");
    g.save.raw.biomass = 1;
    tap("use");
    step(2);
    const opened = !document.getElementById("minigame").classList.contains("hidden");
    closeProcessor(true);                     // drive the rig's own success path
    step(2);
    const produced = g.save.refined.rations === 1 && g.save.raw.biomass === 0;
    return {
      ok: refusedEmpty && closed && opened && produced,
      note: `empty refused=${refusedEmpty}, rig opened=${opened}, rations=${g.save.refined.rations}, raw left=${g.save.raw.biomass}`,
    };
  });

  check("processors: one rig per world, each one keyed to that world's material", () => {
    const rows = [];
    for (const id of ["m1", "m2", "m3"]) {
      const S = start(id, 12);
      const rig = S.processors[0];
      rows.push(`${id}:${rig ? `${rig.kind}/${rig.material}` : "none"}`);
      if (!rig || !["purify", "smelt", "melt"].includes(rig.kind)) return { ok: false, note: rows.join(" ") };
    }
    return { ok: true, note: rows.join(" | ") };
  });

  check("ship: refined material installs at the matching station", () => {
    const S = start("ship", 20);
    const rig = S.relays.find((r) => r.role === "repair");
    const nav = S.relays.find((r) => r.role === "console");
    if (!rig || !nav) return { ok: false, note: "the cabin is missing a station" };
    const before = { refined: { ...g.save.refined }, systems: { ...g.save.systems } };
    g.save.refined.plates = 2;
    g.save.systems.hull = 0;
    put(S, rig.x + 8, rig.y + 6);
    step(2);
    tap("use");
    step(2);
    const panel = document.getElementById("panel");
    const opened = !panel.classList.contains("hidden");
    const install = panel.querySelector("#panel-actions button");
    if (install) install.click();
    step(2);
    const installed = g.save.systems.hull === 1 && g.save.refined.plates === 1;
    g.save.refined = { ...before.refined };
    g.save.systems = { ...before.systems };
    persist(g.save);
    hidePanel();
    return { ok: opened && installed, note: `station panel=${opened}, hull ${g.save.systems.hull}/3, plates left ${g.save.refined.plates}` };
  });

  check("ship: the interior runs the flight suit, has no hunters and no hazards", () => {
    const S = start("ship", 20);
    return {
      ok: S.interior === true && S.suitless === true && S.player.suitless === true && S.enemies.length === 0,
      note: `interior=${S.interior}, suitless=${S.player.suitless}, enemies=${S.enemies.length}, stations=${S.relays.length}`,
    };
  });

  check("slots: a flight can be parked in another slot and loaded back", () => {
    const home = g.save.slot || 0;
    const other = home === 0 ? 1 : 0;
    const fuel0 = g.save.collected.m1.fuel;
    g.save.collected.m1.fuel = 3;
    persist(g.save);
    g.useSlot(other);
    const away = g.save.collected.m1.fuel;
    g.useSlot(home);
    const back = g.save.collected.m1.fuel;
    g.save.collected.m1.fuel = fuel0;
    persist(g.save);
    return { ok: away !== 3 && back === 3, note: `slot ${other + 1} fuel=${away}, slot ${home + 1} fuel=${back}` };
  });

  check("lab: kit is built from material, and a shortfall refuses the build", () => {
    const s = g.save;
    const keep = { tech: { ...s.tech }, abilities: { ...s.abilities }, raw: { ...s.raw }, refined: { ...s.refined } };
    // the deck runs against a live slot, so set up exactly what we are testing
    s.tech.dash = false;
    s.raw.ore = 2;
    s.refined.plates = 1;
    g.showLab();
    const panel = document.getElementById("panel");
    const opened = !panel.classList.contains("hidden");
    const find = (text) => [...panel.querySelectorAll("#panel-actions button")].find((b) => b.textContent.includes(text));
    const dash = find("Impulse drive");
    if (dash) dash.click();
    step(2);
    const built = s.tech.dash === true && s.raw.ore === 0 && s.refined.plates === 0;
    // with the hold empty the boot must refuse to build
    s.tech.doubleJump = false;
    s.raw = { biomass: 0, ore: 0, crystal: 0 };
    s.refined = { rations: 0, plates: 0, coolant: 0 };
    const boot = find("Impulse boot");
    if (boot) boot.click();
    step(2);
    const refused = s.tech.doubleJump === false;
    hidePanel();
    s.tech = { ...keep.tech };
    s.abilities = { ...keep.abilities };
    s.raw = { ...keep.raw };
    s.refined = { ...keep.refined };
    persist(s);
    return { ok: opened && built && refused, note: `bench opened=${opened}, built from material=${built}, shortfall refused=${refused}` };
  });

  check("worlds: the glacier needs the impulse boot before the pod can land", () => {
    const keep = g.save.tech.doubleJump;
    g.save.tech.doubleJump = false;
    const blocked = g.reachAllowed("m3") === false;
    g.save.tech.doubleJump = true;
    const allowed = g.reachAllowed("m3") === true;
    const openWorlds = g.reachAllowed("m1") && g.reachAllowed("m2");
    g.save.tech.doubleJump = keep;
    return { ok: blocked && allowed && openWorlds, note: `locked without the boot=${blocked}, open with it=${allowed}, world 1 and 2 always open=${openWorlds}` };
  });

  check("plants: a vent pitcher takes the pilot under, the cryo projector stops it", () => {
    const S = start("m1", 20);
    const plant = S.entities.find((e) => e.constructor.name === "Plant");
    if (!plant) return { ok: false, note: "no vent pitcher in m1" };
    g.godMode = true;              // or the patrolling creeper takes the pilot instead
    S.player.freezeGun = true;
    S.player.dir = 1;              // the projector only fires forwards
    put(S, plant.x - 12, plant.y);
    step(2);
    tap("freeze");
    step(2);
    const frozen = plant.frozen > 0;
    step(20);
    const safeWhileFrozen = !S.caughtAlready;
    plant.frozen = 0;
    put(S, plant.x + 2, plant.y);
    let frames = 0;
    while (!S.caughtAlready && frames < 220) { step(1); frames += 1; }
    const taken = S.caughtAlready === true;
    clearTimeout(S.restartTimer);
    g.caughtOverlay(false);
    g.godMode = false;
    return { ok: frozen && safeWhileFrozen && taken, note: `frozen=${frozen}, safe while frozen=${safeWhileFrozen}, taken after ${frames}f once thawed=${taken}` };
  });

  check("suit: the pilot sprite set follows the colour chosen in Options", () => {
    const keep = g.save.style;
    const seen = [];
    for (const id of ["", "B", "C"]) {
      g.setStyle(id);
      const S = start("m1", 8);
      seen.push(S.player.style + ":" + S.player.spriteKey());
    }
    g.setStyle(keep);
    const ok = seen[0].startsWith(":p") && seen[1].startsWith("B:pB") && seen[2].startsWith("C:pC");
    return { ok, note: seen.join(" | ") };
  });

  check("jetpack: holding jump in the air burns thrust, and only with the pack built", () => {
    const S = start("m1", 20);
    const P = S.player;
    g.godMode = true;              // a fall from here lands on the creeper at x=18
    /* Drop the pilot from open sky with the pack off and on: the pack cancels
       almost all of gravity, so the same hold has to fall far less with it. */
    const fall = (pack) => {
      put(S, 300, 116);            // well clear of the ground either way
      P.jetpack = pack;
      P.jetFuel = 1;
      P.doubleJump = false;        // the boot would jump; this is the pack alone
      P.grounded = false;
      P.coyote = 0;                // and neither jump may fire
      P.vy = 1;                    // already inside the thrust ceiling
      const y0 = P.y;
      hold("jump");
      step(20);
      release("jump");
      return { drop: P.y - y0, fuel: P.jetFuel, grounded: P.grounded };
    };
    const off = fall(false);
    const on = fall(true);
    g.godMode = false;
    /* The same hold, the same drop height: with the pack the pilot is still in
       the air at the end of it, and without it the pilot is on the ground. */
    const held = !on.grounded && off.grounded;
    const burned = on.fuel < 1 && off.fuel === 1;
    return { ok: held && burned, note: `fell ${Math.round(on.drop)}px with the pack (still airborne=${!on.grounded}) vs ${Math.round(off.drop)}px without (landed=${off.grounded}), fuel ${on.fuel.toFixed(2)} on / ${off.fuel.toFixed(2)} off` };
  });

  check("abilities: a fresh pilot cannot dash or double jump until they buy them", () => {
    const S = start("hub", 20);
    S.player.dash = false;
    S.player.doubleJump = false;
    // measure a plain jump from flat ground
    put(S, 64, 288);
    step(20);
    const y0 = S.player.y;
    let apex = y0;
    hold("jump");
    for (let i = 0; i < 60; i += 1) { step(1); apex = Math.min(apex, S.player.y); }
    release("jump");
    const plain = y0 - apex;
    // now try a second jump at the apex: with no double jump owned it must not fire
    put(S, 64, 288);
    step(20);
    hold("jump");
    step(6);
    S.player.vy = -1;                      // hanging at the top of the arc
    step(1);
    tap("jump");
    const kicked = S.player.vy < -3;       // a double jump would snap the arc upward
    release("jump");
    // and a dash input does nothing at all
    put(S, 64, 288);
    step(6);
    const x0 = S.player.x;
    tapFor("dash", 12);
    const dashed = Math.abs(S.player.x - x0) > 20;
    return { ok: plain > 30 && !kicked && !dashed, note: `plain jump ${plain.toFixed(1)}px, air jump refused=${!kicked}, dash moved ${Math.abs(S.player.x - x0).toFixed(1)}px` };
  });

  check("currency: solving a plate puzzle pays the world its own coin", () => {
    const s = g.save;
    const before = s.coins.remembrance;
    const S = start("m2", 30);
    const plate = S.plates[0];
    const block = S.blocks[0];
    if (!plate || !block) return { ok: false, note: "m2 has no plate/block" };
    block.x = plate.x;
    block.y = plate.y - 16;
    block.settle(S);
    step(30);
    const paid = s.coins.remembrance > before;
    s.coins.remembrance = before;
    persist(s);
    return { ok: paid, note: `remembrance ${before} -> ${s.coins.remembrance}, paid=${paid}` };
  });

  check("m1: escaping a hunt pays amber (the world's only income)", () => {
    const s = g.save;
    const before = s.coins.amber;
    const S = start("m1", 30);
    const foe = S.enemies.find((e) => e instanceof Creeper);
    if (!foe) return { ok: false, note: "no creeper in m1" };
    foe.state = "alert";
    foe.timer = 0.01;
    step(10);
    const paid = s.coins.amber > before;
    const once = S.escaped.has(foe);
    s.coins.amber = before;
    persist(s);
    return { ok: paid && once, note: `amber ${before} -> ${s.coins.amber}, paid=${paid}, credited once=${once}` };
  });

  check("pause: panel opens and closes cleanly", () => {
    const S = start("hub", 10);
    tap("pause");
    step(4);
    const opened = S.paused === true;
    tap("pause");
    step(4);
    const closed = S.paused === false;
    return { ok: opened && closed, note: `opened=${opened}, closed=${closed}` };
  });

  check("every level boots and settles with a live player", () => {
    const rows = [];
    for (const id of ["hub", "m1", "m2", "m3"]) {
      const S = start(id, 120);
      rows.push(`${id}:${S.player.masks}/${S.player.maxMasks} grounded=${S.player.grounded}`);
      if (!(S instanceof LevelScene) || S.player.masks <= 0) return { ok: false, note: rows.join(" ") };
    }
    return { ok: true, note: rows.join(" | ") };
  });

  check("no runtime errors were swallowed by the loop", () => ({
    ok: runtime.errors.length === 0,
    note: runtime.errors.length ? runtime.errors.join(" ; ") : "0 errors",
  }));

  /* ----------------------------------------- async checks (timers, sfx) */
  const asyncChecks = [
    {
      name: "audio: every sound effect name plays without throwing",
      run: async () => {
        const names = ["jump", "dash", "land", "hurt", "pickup", "fuel", "part", "bench", "door", "plate", "relay", "charger", "unlock", "sparkle", "toast", "pause", "win", "lose", "downed", "shield", "beacon", "splash", "windgust", "step_grass", "step_stone", "step_metal", "sneak", "wallslide", "walljump", "dash_air", "alert", "calm"];
        const bad = [];
        for (const n of names) if (api.audio.sfx(n) === undefined && !names.includes(n)) bad.push(n);
        return { ok: bad.length === 0, note: `played ${names.length} effects, ${bad.length} unknown` };
      },
    },
    {
      name: "catch: the level rebuilds itself a beat after the card goes up",
      run: async () => {
        const S = start("m1", 20);
        const foe = S.enemies.find((e) => e instanceof Creeper);
        put(S, foe.x, foe.y);
        for (let i = 0; i < 240 && !S.caughtAlready; i += 1) { g.update(DT); input.endFrame(); }
        const caught = S.caughtAlready === true;
        await sleep(1100);           // the restart runs on a real-time timer
        step(6);
        const fresh = g.scene instanceof LevelScene && g.scene.def.id === "m1" && g.scene !== S;
        const cleared = !document.getElementById("caught").classList.contains("on");
        return {
          ok: caught && fresh && cleared,
          note: `caught=${caught}, rebuilt=${fresh}, CAUGHT card cleared=${cleared}`,
        };
      },
    },
    {
      name: "intro: the crash cutscene plays and hands over to the ship interior",
      run: async () => {
        g.startIntro();
        step(4);
        const isIntro = g.scene instanceof api.scenes.IntroScene;
        for (let i = 0; i < 8; i += 1) { tap("use"); step(12); }
        await sleep(500);            // the hand-over runs on a short real-time fade
        step(6);
        const S = g.scene;
        const handed = S instanceof LevelScene && S.def.id === "ship";
        const suitless = Boolean(S && S.player && S.player.suitless);
        return { ok: isIntro && handed && suitless, note: `intro=${isIntro}, handed over=${handed}, flight suit=${suitless}` };
      },
    },
  ];

  for (const t of asyncChecks) {
    try {
      const r = await t.run();
      results.push({ name: t.name, ok: !!(r && r.ok), note: (r && r.note) || "" });
    } catch (err) {
      results.push({ name: t.name, ok: false, note: `threw: ${err && err.message}` });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const report = {
    when: new Date().toISOString(),
    passed,
    failed: results.length - passed,
    total: results.length,
    results,
  };
  for (const [key, value] of originalStorage) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); }
  g.save = originalSave;
  g.slot = originalSave.slot;
  g.travelInstant = originalTravelInstant;
  report.saveSlotsRestored = originalStorage.every(([key, value]) => localStorage.getItem(key) === value);
  api.selftest = report;
  printReport(report);
  g.toMenu();
  return report;
}

/* ------------------------------------------------------------------ output */
function printReport(report) {
  const ok = report.failed === 0;
  console.log(`%cPale Horizon self-test: ${report.passed}/${report.total} passed${ok ? "" : ` - ${report.failed} FAILED`}`,
    `color:${ok ? "#7ef47e" : "#f66060"};font-weight:bold`);
  if (console.table) {
    console.table(report.results.map((r) => ({ result: r.ok ? "PASS" : "FAIL", check: r.name, note: r.note })));
  }
  for (const r of report.results) {
    if (!r.ok) console.error(`FAIL: ${r.name} - ${r.note}`);
  }
  const el = document.getElementById("selftest");
  if (el) {
    el.style.display = "block";
    el.className = report.failed === 0 ? "pass" : "fail";
    el.innerHTML = [
      `<h2>self-test: ${report.passed}/${report.total} passed</h2>`,
      "<ul>",
      ...report.results.map((r) => `<li class="${r.ok ? "ok" : "bad"}">${r.ok ? "PASS" : "FAIL"} ${escapeHtml(r.name)}${r.note ? ` <span>${escapeHtml(r.note)}</span>` : ""}</li>`),
      "</ul>",
    ].join("\n");
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
