/**
 * Scenes: title/menu, the Cryo Bay hub, the three missions, the asteroid route,
 * cutscenes and endings. Owns progression (save data) and the difficulty wiring.
 */
import { IMG } from "./assets.js";
import {
  input, Camera, Particles, Ghosts, drawBackdrop, drawVignette, drawStatic, bakeTileMap,
  text, overlap, hitStop, time, VIEW_W, VIEW_H, CAM_W, CAM_H, ZOOM, TILE, moveEntity,
} from "./engine.js";
import { TileMap } from "./core/tilemap.js";
import { DIFFICULTY, difficultyOf } from "./core/config.js";
import {
  Player, makeEntity, Block, Plate, Door, Pickup, Beacon, Relay, Orb, Moria, MovingPlatform, Processor,
  Deposit, Transmission,
} from "./entities.js";
import {
  UI, showMenu, hideMenu, showPanel, hidePanel, dialogue, panelOpen,
  setHud, showHud, setMasks, toast, flash, setAlert, showTouch, hideTouch, showOptions,
} from "./ui.js";
import {
  sfx, startMusic, stopMusic, startAmbience, stopAmbience, setMusicIntensity,
} from "./audio.js";
import { MISSIONS } from "./levels.js";
import { transmissionById } from './journal.js';
import { openProcessor, processorOpen, processorUpdate } from "./minigame.js";
import { MATERIALS, loadSlot, writeSlot, SLOTS_KEY } from "./save.js";

/** The live save now lives in one of three slots; this is where they are kept. */
export const SAVE_KEY = SLOTS_KEY;

/**
 * Each world mints its own salvage from solved puzzles and called-off hunts. It is
 * a score, not a currency: the movement kit is built at the research bench out of
 * material refined from the worlds, and the levels are authored so those builds
 * are what open the way on. */
export const WORLDS = {
  m1: {
    id: "m1",
    name: "Exxos",
    currency: "Amber",
    curKey: "amber",
  },
  m2: {
    id: "m2",
    name: "The World of Regrets",
    currency: "Remembrance",
    curKey: "remembrance",
  },
  m3: {
    id: "m3",
    name: "The Hollow Signal",
    currency: "Cinders",
    curKey: "cinders",
    // the pod cannot put down on the glacier shelf without the impulse boot
    needs: "doubleJump",
  },
};


/* The save shape itself lives in save.js: slots, materials and the systems the
   ship needs. These two functions are the only way the rest of the game reads
   or writes it, so nothing else has to know about slots. */
export function loadSave(slot = 0) {
  const save = loadSlot(slot);
  if (!DIFFICULTY[save.difficulty]) save.difficulty = "standard";
  return save;
}

export function persist(save) {
  writeSlot(save.slot || 0, save);
}

export const totalFuel = (s) => Object.values(s.collected).reduce((n, c) => n + (c.fuel || 0), 0) + (s.bonusFuel || 0);
/** How much of the ship's nine-unit repair job is done. */
export const totalSystems = (s) => Object.values(s.systems || {}).reduce((n, v) => n + (v || 0), 0);
export const totalParts = totalSystems;
/** The pod can only fly when the tanks, the plating, the loop and the reactor are all full. */
export const shipReady = (s) => totalFuel(s) >= 9 && totalSystems(s) >= 9;

const THEME_AMBIENCE = { jungle: "jungle", ruins: "ruins", storm: "storm", ice: "storm", metal: "hub" };

/* ============================================================= level scene */
export class LevelScene {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.difficulty = difficultyOf(game.save.difficulty);
    // aboard the lander: no hazards, no EVA suit, and stations instead of puzzles
    this.interior = Boolean(def.interior);
    // aboard the ship (and on the training deck) the pilot is out of the suit
    this.suitless = Boolean(def.suitless || def.interior);
    this.map = new TileMap(def);
    this.rebake = () => bakeTileMap(this.map);

    // placeholder collections so doors can resolve their power source while building
    this.blocks = [];
    this.plates = [];
    this.relays = [];
    this.entities = def.entities.map((cfg) => makeEntity(cfg, this)).filter(Boolean);
    // the lab's tech tree is what the pilot can actually do, plus the suit
    // colour chosen in Options
    this.tech = { ...(game.save.abilities || {}), ...(game.save.tech || {}) };
    this.player = new Player(def.start.x * TILE, def.start.y * TILE, this.difficulty, this.tech, {
      suitless: this.suitless,
      style: game.save.style || "",
    });
    this.entityList = [...this.entities, this.player];
    this.blocks = this.entities.filter((e) => e instanceof Block);
    this.plates = this.entities.filter((e) => e instanceof Plate);
    this.doors = this.entities.filter((e) => e instanceof Door);
    this.relays = this.entities.filter((e) => e instanceof Relay);
    this.pickups = this.entities.filter((e) => e instanceof Pickup);
    this.beacons = this.entities.filter((e) => e instanceof Beacon);
    this.enemies = this.entities.filter((e) => typeof e.state === "string");
    this.moving = this.entities.filter((e) => e instanceof MovingPlatform);
    this.orbs = this.entities.filter((e) => e instanceof Orb);
    this.morias = this.entities.filter((e) => e instanceof Moria);
    this.processors = this.entities.filter((e) => e instanceof Processor);
    this.seams = this.entities.filter((e) => e instanceof Deposit);
    this.transmissions = this.entities.filter((e) => e instanceof Transmission);
    for (const e of this.transmissions) e.read = (game.save.journal || []).includes(e.id);
    /** one restart per catch, so a frame with two hunters cannot stack them */
    this.caughtAlready = false;
    /** group -> whether the puzzle has already paid out its currency */
    this.paidGroups = new Set();
    /** enemies whose hunt already paid out, so one chase cannot be farmed */
    this.escaped = new Set();

    this.camera = new Camera();
    this.camera.setBounds(this.map.pxW, this.map.pxH);
    this.particles = new Particles();
    this.ghosts = new Ghosts();

    for (const b of this.blocks) b.settle(this);
    for (const d of this.doors) d.refresh(this);
    this.rebake();

    this.checkpoint = { x: def.start.x * TILE, y: def.start.y * TILE };
    this.player.spawn = { ...this.checkpoint };
    this.lastSafe = { ...this.checkpoint };
    this.got = { fuel: 0, mat: 0 };
    this.alertTimer = 0;
    this.windDir = 1;
    this.windPower = 0;
    this.windTimer = 3;
    this.paused = false;
    this.pauseOwnsPanel = false;
    this.complete = false;
    this.frozen = false;
    this.elapsed = 0;
    this.carryingOrb = false;
    this.fused = false;

    startMusic(def.music || "hub");
    startAmbience(THEME_AMBIENCE[def.theme] || "hub");
    showHud(true);
    showTouch(true);
    setMasks(this.player.masks, this.player.maxMasks);
    this.refreshHud();

    const save = game.save;
    if (!save.seenIntro[def.id] && def.intro) {
      save.seenIntro[def.id] = true;
      persist(save);
      this.frozen = true;
      dialogue(def.intro, () => { this.frozen = false; });
    } else {
      toast(`${def.name}: ${def.objective}`, 3200);
    }
  }

  leave() {
    clearTimeout(this.restartTimer);
    flash(false);
    this.game.caughtOverlay(false);
  }

  /* ------------------------------------------------------------- helpers -- */
  refreshHud() {
    const save = this.game.save;
    setHud({
      fuel: Math.min(9, totalFuel(save)),
      systems: save.systems,
      suitless: this.interior,
      objective: this.interior
        ? `Hull ${save.systems.hull}/3 - cryo ${save.systems.cryo}/3 - bio ${save.systems.bio}/3 - fuel ${Math.min(9, totalFuel(save))}/9`
        : this.def.objective,
      difficulty: this.difficulty.name,
    });
  }

  ready() {
    // the tutorial is a one-cell room, so its exit opens on one cell
    return this.got.fuel >= (this.def.exitFuel ?? 3);
  }

  onAlert() {
    this.alertTimer = 2.6;
  }

  /**
   * A hunt that gives up pays the world's salvage: on the organics world the quiet
   * income comes from being good at hiding rather than from being fast.
   */
  onEnemyCalm(enemy) {
    if (this.def.id !== "m1" || this.escaped.has(enemy)) return;
    this.escaped.add(enemy);
    this.earn(8, "hunt called off");
  }

  /**
   * There is no combat in this game and there is no health bar either: if
   * something catches you, the descent restarts. Everything already banked at
   * a beacon stays banked, so a catch costs you the attempt, not the run.
   */
  onEnemyContact(enemy) {
    if (this.interior || this.game.godMode) return;
    this.caught(`${enemy.constructor.name.toUpperCase()} CONTACT`);
  }

  caught(why = "CAUGHT") {
    if (this.caughtAlready || this.complete) return;
    this.caughtAlready = true;
    const save = this.game.save;
    save.catches += 1;
    this.game.catches = (this.game.catches || 0) + 1;
    setAlert(false);
    sfx("downed");
    hitStop(0.08);
    this.camera.shake = 1.2;
    flash(true);
    this.frozen = true;
    this.game.caughtOverlay(true, why);
    // kept on the scene so the self-test can take ownership of the restart
    this.restartTimer = setTimeout(() => {
      flash(false);
      this.game.caughtOverlay(false);
      this.game.startLevel(this.def.id);
    }, 800);
  }

  onPickup(p) {
    const save = this.game.save;
    // only the three worlds bank into the save: the training deck is practice,
    // and a fourth slot would inflate the 9-cell total the ship needs
    const bank = save.collected[this.def.id];
    if (p.type === "fuel") {
      this.got.fuel += 1;
      if (bank) bank.fuel = Math.max(bank.fuel, this.got.fuel);
      toast(`Fuel cell ${this.got.fuel}/${this.def.exitFuel ?? 3} collected`, 1500);
    } else if (MATERIALS[p.type]) {
      // raw material goes into the hold; it is only useful once processed, and
      // the rig that processes it is always somewhere further in
      const m = MATERIALS[p.type];
      save.raw[m.key] = (save.raw[m.key] || 0) + 1;
      this.got.mat += 1;
      toast(`${m.name} secured (${save.raw[m.key]} in the hold) - run it through the processor`, 2600);
      this.earn(6, `${m.name} logged`);
    }
    persist(save);
    this.refreshHud();
  }

  /**
   * Salvage: each world keeps its own tally. It is a score, not a currency - the
   * only spending in the game is at the research bench, and its price is material.
   */
  earn(amount, why) {
    const world = WORLDS[this.def.id];
    if (!world || amount <= 0) return;
    const save = this.game.save;
    save.coins = save.coins || { amber: 0, remembrance: 0, cinders: 0 };
    save.coins[world.curKey] = (save.coins[world.curKey] || 0) + amount;
    persist(save);
    this.refreshHud();
    if (why) toast(`+${amount} ${world.currency} salvaged - ${why}`, 2000);
    sfx("pickup");
  }

  pushBlocks(step) {
    for (const b of this.blocks) {
      if (!overlap(b, this.player)) continue;
      const ox = Math.min(this.player.x + this.player.w, b.x + b.w) - Math.max(this.player.x, b.x);
      const oy = Math.min(this.player.y + this.player.h, b.y + b.h) - Math.max(this.player.y, b.y);
      if (ox <= 0 || oy <= 0) continue;
      if (oy < ox - 1) {
        if (this.player.y + this.player.h / 2 < b.y + b.h / 2) {
          this.player.y = b.y - this.player.h;
          this.player.vy = 0;
          this.player.grounded = true;
        } else {
          this.player.y = b.y + b.h;
          this.player.vy = Math.max(this.player.vy, 0);
        }
        continue;
      }
      const dir = this.player.x + this.player.w / 2 < b.x + b.w / 2 ? 1 : -1;
      const shove = Math.min(0.95, Math.max(0.35, Math.abs(this.player.vx)));
      const before = b.x;
      moveEntity(this.map, b, dir * shove * step, 0);
      if (this.blocks.some((other) => other !== b && overlap(b, other))) b.x = before;
      if (b.x !== before) {
        // keep the pilot flush with the face they are pushing, otherwise their
        // centre can overtake the block and shove it from the wrong side
        if (dir > 0) this.player.x = Math.min(this.player.x, b.x - this.player.w);
        else this.player.x = Math.max(this.player.x, b.x + b.w);
        if (Math.random() < 0.12) sfx("step_stone", { vol: 0.5 });
      } else {
        const face = dir > 0 ? b.x - this.player.w : b.x + b.w;
        if (dir > 0) this.player.x = Math.min(this.player.x, face);
        else this.player.x = Math.max(this.player.x, face);
        this.player.vx = 0;
      }
    }
  }

  /* -------------------------------------------------------------- update -- */
  update(dt) {
    if (this.paused) {
      this.handlePauseInput();
      return;
    }
    if (input.pressed('journal') && !panelOpen() && !this.frozen) { this.game.showJournal(); return; }
    const step = dt * 60;
    this.elapsed += dt;
    this.game.save.timePlayed = (this.game.save.timePlayed || 0) + dt;

    if (input.pressed("pause") && !panelOpen()) {
      this.openPause();
      return;
    }
    const dialogueOpen = !UI.dialogueEl.classList.contains("hidden");
    if (input.pressed("use") && !panelOpen() && !dialogueOpen) this.interact();
    if (this.game.scene !== this) return;
    if (input.pressed("freeze") && this.player.freezeGun && this.player.freezeCool <= 0) this.fireFreeze();

    const frozen = this.frozen || panelOpen();
    this.player.frozen = frozen;
    if (!frozen) this.player.update(dt, this);
    this.pushBlocks(step);
    this.ghosts.update(dt);

    // remember somewhere safe to put the player back after a swim
    if (this.player.grounded && !frozen) {
      this.lastSafe = { x: this.player.x, y: this.player.y };
    }

    // wind gusts (World 3, scaled by difficulty)
    if (this.def.wind) {
      this.windTimer -= dt;
      if (this.windTimer <= 0) {
        this.windDir = Math.random() < 0.5 ? -1 : 1;
        this.windTimer = 4 + Math.random() * 3;
        this.windPower = 0.75 * this.difficulty.windStrength;
        if (!frozen) sfx("windgust");
      }
      this.windPower = Math.max(0, this.windPower - dt * 0.32);
      if (!frozen) {
        this.player.vx += this.windDir * this.windPower * dt * 1.5;
        if (Math.random() < 0.35) {
          this.particles.burst(
            this.camera.x + (this.windDir > 0 ? 0 : CAM_W),
            this.camera.y + Math.random() * CAM_H, "#8FB6D6", 1, 0.2, 0.7, 0
          );
        }
      }
    }

    if (!frozen) for (const e of this.entities) if (e.update) e.update(dt, this);

    // solving a plate puzzle mints this world's currency, once per group
    for (const d of this.doors) {
      if (d.source !== "plate" || this.paidGroups.has(d.group)) continue;
      if (d.powered(this)) {
        this.paidGroups.add(d.group);
        this.earn(15, "seal opened");
      }
    }

    // water: a soak, a knock back to solid ground, and (unless Explorer) a scratch
    const p = this.player;
    const inWater = this.map.isWater(Math.floor((p.x + p.w / 2) / TILE), Math.floor((p.y + p.h * 0.7) / TILE));
    if (inWater && !frozen) {
      sfx("splash");
      this.particles.ring(p.x + p.w / 2, p.y + p.h / 2, "#8FB6D6", 14, 2.4, 0.5);
      this.camera.shake = Math.max(this.camera.shake, 0.5);
      if (this.difficulty.waterDamage > 0) {
        p.damage(p.x, this.difficulty.waterDamage);
        setMasks(p.masks, p.maxMasks);
        if (p.masks <= 0) this.caught("SUIT BREACH");
      }
      p.x = this.lastSafe.x;
      p.y = this.lastSafe.y;
      p.vx = 0;
      p.vy = 0;
      this.refreshHud();
    }
    if (p.y > this.map.pxH + 40) {
      p.x = this.lastSafe.x;
      p.y = this.lastSafe.y;
      p.vx = 0;
      p.vy = 0;
    }

    // a rig owns the frame while it is open: the world waits, not you
    if (processorOpen()) {
      processorUpdate(dt);
      this.refreshHud();
      return;
    }

    // carried soul reaches Moria
    if (this.carryingOrb && this.morias.length) {
      const m = this.morias[0];
      if (Math.abs(p.x - m.x) < 34 && Math.abs(p.y - m.y) < 60) this.fuseSoul(m);
    }

    // alert state drives the HUD badge and the music layer
    const anyAlert = this.enemies.some((e) => e.state === "alert");
    if (this.alertTimer > 0) this.alertTimer -= dt;
    setAlert(anyAlert || this.alertTimer > 0);
    setMusicIntensity(anyAlert);

    this.particles.update(dt);
    this.camera.follow(p, dt);
    if (this.player.masks !== this.lastMasks) {
      this.lastMasks = this.player.masks;
      setMasks(this.player.masks, this.player.maxMasks);
    }
    this.refreshHud();
  }

  fuseSoul(moria) {
    this.carryingOrb = false;
    this.player.ember = false;
    this.fused = true;
    moria.fused = true;
    for (const p of this.pickups) if (p.locked) p.locked = false;
    this.particles.ring(moria.x + 18, moria.y + 20, "#8FB6D6", 26, 3, 0.9);
    sfx("unlock");
    this.frozen = true;
    dialogue(this.def.onFuse || [], () => { this.frozen = false; });
  }

  interact() {
    const target = this.player.interactTarget(this);
    if (!target) return;

    if (target instanceof Transmission) {
      const entry = transmissionById(target.id);
      if (!entry) return;
      const ids = this.game.save.journal || (this.game.save.journal = []);
      if (!ids.includes(target.id)) {
        ids.push(target.id);
        persist(this.game.save);
        sfx('unlock');
      }
      target.read = true;
      showPanel(entry.title, `<p class="journal-location">${entry.location}</p><p>${entry.text}</p><p class="blurb">Saved in your field journal. Press J or open it from pause.</p>`, [{ label: 'Keep exploring', primary: true }]);
      return;
    }

    if (target instanceof Beacon) {
      if (target.exit) {
        if (this.ready()) this.finish();
        else toast(`Beacon locked: needs ${(this.def.exitFuel ?? 3) - this.got.fuel} more fuel cell(s)`, 2200);
        return;
      }
      // benches: set the checkpoint AND restore the suit
      target.active = true;
      this.checkpoint = { x: target.x, y: target.y + 8 };
      this.player.spawn = { ...this.checkpoint };
      const healed = this.player.heal();
      sfx("bench");
      this.particles.ring(target.x + 8, target.y + 10, "#C9843F", 16, 2.4, 0.8);
      toast(healed > 0 ? `Beacon lit - suit restored (+${healed})` : "Beacon lit - checkpoint set", 1900);
      setMasks(this.player.masks, this.player.maxMasks);
      return;
    }

    if (target instanceof Relay) {
      if (target.role === "charger") {
        if (this.player.ember) toast("Already carrying an ember charge", 1600);
        else {
          this.player.ember = true;
          target.active = true;
          sfx("charger");
          toast("Ember charge acquired - deliver it to a relay", 2400);
        }
        return;
      }
      if (target.role === "relay") {
        if (!this.player.ember) {
          toast("This relay is dead. Bring an ember charge.", 2000);
          return;
        }
        this.player.ember = false;
        target.active = true;
        sfx("relay");
        this.particles.ring(target.x + 8, target.y, "#C9843F", 22, 2.6, 0.8);
        this.camera.shake = Math.max(this.camera.shake, 0.3);
        toast(`${target.label} online`, 2000);
        this.earn(12, `${target.label} lit`);
        return;
      }
      this.game.hubAction(target.role);
      return;
    }

    if (target instanceof Processor) {
      this.useProcessor(target);
      return;
    }

    if (target instanceof Orb) {
      target.taken = true;
      this.carryingOrb = true;
      this.player.ember = true;
      sfx("sparkle");
      toast("Moria's soul in tow. Carry it to his body to the east.", 3000);
      return;
    }

    if (target instanceof Moria) {
      if (this.player.ember) this.fuseSoul(target);
      else if (!this.fused) toast("Moria's chest is empty. His soul is somewhere west.", 2400);
      return;
    }

    if (target instanceof Deposit) {
      const armed = this.game.save.tech && this.game.save.tech.extractor;
      if (armed) {
        this.frozen = false;
        toast("Extractor engaged - hold USE until it bites through", 2600);
        sfx("ui");
      } else {
        sfx("back");
        toast("Solid rock. The extractor rig would open this - build one at the research bench.", 3000);
      }
      return;
    }

    if (target instanceof Pickup && !target.locked) {
      target.taken = true;
      this.onPickup(target);
    }
  }

  /**
   * The cryo projector. It is a tool, not a weapon: it cannot damage anything,
   * it only freezes what is about to catch you. Hunters stop dead, vent
   * pitchers close up, and both wake up a few seconds later.
   */
  fireFreeze() {
    const p = this.player;
    p.freezeCool = 1.4;
    p.controlLock = 0.08;
    sfx("freeze");
    const dir = p.dir || 1;
    const ox = p.x + p.w / 2;
    const oy = p.y + p.h / 2;
    this.particles.ring(ox + dir * 14, oy, "#A6CCE2", 14, 2.0, 0.4);
    let frozen = 0;
    for (const e of this.entities) {
      if (typeof e.freeze !== "function") continue;
      const dx = (e.x + e.w / 2) - ox;
      const dy = (e.y + e.h / 2) - oy;
      if (dx * dir < -6) continue;                    // behind the pilot
      if (Math.hypot(dx, dy) > 76) continue;           // out of range
      e.freeze(7);
      frozen += 1;
      this.particles.burst(e.x + e.w / 2, e.y + e.h / 2, "#A6CCE2", 8, 1.6, 0.5, 0);
    }
    toast(frozen ? `${frozen} thing${frozen > 1 ? "s" : ""} frozen solid for 7s` : "Nothing in range to freeze", 1300);
  }

  /**
   * A seam the extractor rig has finished biting through. Raw material goes
   * into the hold; the world keeps the rest. This is the only source that needs
   * a build out of the bench, which is exactly why it is the richest one.
   */
  onExtract(seam) {
    const save = this.game.save;
    const mat = MATERIALS[seam.material] || MATERIALS.ore;
    save.raw[mat.key] = (save.raw[mat.key] || 0) + seam.amount;
    this.got.mat += seam.amount;
    persist(save);
    this.particles.ring(seam.x + 10, seam.y + 10, "#E8A05C", 22, 2.6, 0.8);
    this.particles.dust(seam.x + 10, seam.y + 16, "#8B93A1", 7);
    sfx("unlock");
    this.camera.shake = Math.max(this.camera.shake, 0.35);
    toast(`Extractor: ${seam.amount} ${mat.name} out of the seam - run it through the field processor`, 3000);
    this.earn(15, "seam extracted");
    this.refreshHud();
  }

  /**
   * The field processor. Raw material goes in, refined material comes out, and
   * the rig's mini-game is what stands in between. A ruined batch costs time
   * and nothing else - the material stays in the hopper.
   */
  useProcessor(rig) {
    const save = this.game.save;
    const mat = MATERIALS[rig.material] || MATERIALS.biomass;
    if (!save.raw[mat.key]) {
      toast(`The hopper is empty. Bring ${mat.name} from further in.`, 2400);
      sfx("back");
      return;
    }
    this.frozen = true;
    sfx("ui");
    openProcessor(rig.kind, (won) => {
      this.frozen = false;
      if (!won) {
        toast("Batch ruined. The material is still in the hopper - try again.", 2600);
        sfx("back");
        return;
      }
      save.raw[mat.key] -= 1;
      save.refined[mat.refined] = (save.refined[mat.refined] || 0) + 1;
      persist(save);
      this.particles.ring(this.player.x + 7, this.player.y + 10, "#E8A05C", 20, 2.4, 0.7);
      sfx("unlock");
      toast(`${mat.refinedName} produced (${save.refined[mat.refined]} ready) - install it aboard the ship`, 3000);
      this.earn(10, `${mat.refinedName} produced`);
      this.refreshHud();
    });
  }

  /**
   * The beacon at the far end of a world does not teleport you home: the pod
   * lifts off, flies the return leg, and the lander comes up under it. The
   * trip is authored per world in travel.js.
   */
  flyHome() {
    this.game.travelBack(this.def.id);
  }

  finish() {
    this.complete = true;
    const save = this.game.save;
    save.done[this.def.id] = true;
    persist(save);
    stopMusic();
    stopAmbience();
    sfx("win");
    if (this.def.onComplete && !save.seenIntro[`${this.def.id}_outro`]) {
      save.seenIntro[`${this.def.id}_outro`] = true;
      persist(save);
      dialogue(this.def.onComplete, () => this.flyHome());
      return;
    }
    this.flyHome();
  }

  /* --------------------------------------------------------------- pause -- */
  openPause() {
    this.paused = true;
    this.pauseOwnsPanel = true;
    sfx("pause");
    showPanel("PAUSED", `
      <div class="keys">
        <span>&larr; &rarr; / A D</span><span>run</span>
        <span>SPACE / W / &uarr;</span><span>jump (hold higher, works off walls)</span>
        <span>Q / SHIFT</span><span>dash (also once per airtime)</span>
        <span>F</span><span>cryo projector - freezes what is in front of you</span>
        <span>&darr; / S</span><span>sneak - quiet, hidden in grass</span>
        <span>E / ENTER</span><span>use beacons, relays, consoles</span>
        <span>TAB / ESC</span><span>pause &middot; F3 debug</span>
      </div>
      <p>Objective: <b>${this.def.objective}</b></p>
      <p>Fuel here <b>${this.got.fuel}/${this.def.exitFuel ?? 3}</b> &middot; raw material in the hold <b>${this.got.mat}</b>
      &middot; difficulty <b>${this.difficulty.name}</b></p>
      <p>A catch restarts this descent from the last beacon. Nothing already banked is lost.</p>`,
      [
        { label: "Resume", primary: true, onClick: () => this.closePause() },
        { label: "Field journal", sub: "transmissions, materials and field notes", onClick: () => this.game.showJournal(() => this.openPause()) },
        ...(this.game.save.tech && this.game.save.tech.map ? [{ label: "Survey chart", sub: "the chart you built", onClick: () => this.showMap() }] : []),
        { label: "Options", sub: "difficulty & volume", onClick: () => this.game.showOptions(() => this.openPause()) },
        ...(!this.interior && this.def.id !== 'tut' ? [{ label: "Fly back to ship", sub: "keep collected materials; replay this world later", onClick: () => { hidePanel(); this.paused = false; this.flyHome(); } }] : []),
        { label: "Restart mission", onClick: () => { hidePanel(); this.paused = false; this.game.startLevel(this.def.id); } },
        { label: "Back to menu", onClick: () => { hidePanel(); this.paused = false; this.game.toMenu(); } },
      ]);
  }

  closePause() {
    hidePanel();
    this.paused = false;
    this.pauseOwnsPanel = false;
    sfx("unpause");
  }

  /** TAB/ESC closes our own pause panel; it never steals another panel's keys. */
  handlePauseInput() {
    if (!input.pressed("pause")) return;
    if (this.pauseOwnsPanel || !panelOpen()) this.closePause();
  }

  /**
   * The survey chart (built at the research bench). Drawn from the live tile
   * grid, so it is always accurate: rock, water, beacons, the exit, relays and
   * the pilot.
   */
  showMap() {
    const map = this.map;
    const px = 4;                          // chart pixels per tile
    showPanel(`${this.def.name.toUpperCase()} - SURVEY CHART`, `
      <p><b>Gold</b> exit &middot; <b>ochre</b> beacons and relays &middot;
      <b>white</b> you &middot; <b>blue</b> water</p>`,
      [{ label: "Close", primary: true, onClick: () => hidePanel() }],
      (root) => {
        const cv = document.createElement("canvas");
        cv.width = map.w * px;
        cv.height = map.h * px;
        cv.style.width = "100%";
        cv.style.imageRendering = "pixelated";
        const c = cv.getContext("2d");
        c.fillStyle = "#0B0E13";
        c.fillRect(0, 0, cv.width, cv.height);
        for (let y = 0; y < map.h; y += 1) {
          for (let x = 0; x < map.w; x += 1) {
            let col = null;
            if (map.isWall(x, y)) col = "#2A323D";
            else if (map.isPlatform(x, y)) col = "#3E4A58";
            else if (map.isWater(x, y)) col = "#1E4356";
            if (!col) continue;
            c.fillStyle = col;
            c.fillRect(x * px, y * px, px, px);
          }
        }
        const dot = (tx, ty, col) => { c.fillStyle = col; c.fillRect(tx * px - 2, ty * px - 2, px + 4, px + 4); };
        for (const b of this.beacons) dot(Math.round(b.x / TILE), Math.round(b.y / TILE), b.exit ? "#E8A05C" : "#C9843F");
        for (const r of this.relays) dot(Math.round(r.x / TILE), Math.round(r.y / TILE), "#C9843F");
        for (const p of this.pickups) if (!p.taken) dot(Math.round(p.x / TILE), Math.round(p.y / TILE), "#E7E4DC");
        dot(Math.round(this.player.x / TILE), Math.round(this.player.y / TILE), "#ffffff");
        root.appendChild(cv);
      });
  }

  /* ---------------------------------------------------------------- draw -- */
  /**
   * The world is drawn through a ZOOM scale so the pilot fills a readable part
   * of the frame, then the overlay (vignette, flash) is painted in screen space.
   */
  draw(ctx) {
    // Shake is a render offset, never a mutation of the following camera.
    const cam = { x: this.camera.x + this.camera.ox, y: this.camera.y + this.camera.oy };

    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    drawBackdrop(ctx, this.def.theme, cam, performance.now() / 1000);
    drawStatic(ctx, this.map, cam);
    if (this.interior) {
      for (const [label, x, y] of [['01 · CRYO BAY', 7, 14], ['02 · WORKSHOP', 18, 14], ['03 · SPINE', 28, 11], ['04 · BRIDGE', 37, 16], ['RESEARCH DECK', 37, 8], ['05 · CREW QUARTERS', 56, 11], ['06 · ENGINEERING', 70, 10], ['07 · OBSERVATION', 89, 9]]) {
        text(ctx, label, x * TILE - cam.x, y * TILE - cam.y, '#8fb6d6', 'center', 8, '700');
      }
      for (const x of [12, 24, 32, 40]) {
        ctx.fillStyle = '#8fb6d6'; ctx.fillRect(x * TILE - cam.x, 18 * TILE - cam.y, 2, 3);
      }
    }
    for (const e of this.moving) e.draw(ctx, cam);
    for (const e of this.enemies) if (e.drawCone) e.drawCone(ctx, cam);
    for (const e of this.entities) {
      if (e instanceof MovingPlatform || this.enemies.includes(e)) continue;
      if (e.draw) e.draw(ctx, cam);
    }
    for (const e of this.enemies) e.draw(ctx, cam);
    this.ghosts.draw(ctx, cam);
    this.player.draw(ctx, cam);
    this.particles.draw(ctx, cam);

    if (this.def.wind && this.windPower > 0.05) {
      ctx.strokeStyle = `rgba(190,215,255,${0.12 + this.windPower * 0.2})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i += 1) {
        const y = (i * 21 + (performance.now() / 6) % CAM_H) % CAM_H;
        const x = this.windDir > 0 ? 0 : CAM_W;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + this.windDir * (18 + i * 3), y + 2);
        ctx.stroke();
      }
    }

    // station nameplates
    for (const r of this.relays) {
      if (Math.abs(r.x - this.player.x) > 90) continue;
      text(ctx, r.label || "RELAY", Math.round(r.x + 8 - cam.x), Math.round(r.y - 16 - cam.y), r.active ? "#E8A05C" : "#C9843F", "center", 7);
    }

    // Pixel light pools from actual lamps/screens; keep silhouettes readable.
    for (const e of [...this.relays, ...this.processors, ...this.transmissions]) {
      const x = Math.round(e.x + e.w / 2 - cam.x), y = Math.round(e.y + 8 - cam.y);
      if (x < -30 || x > CAM_W + 30) continue;
      ctx.fillStyle = e instanceof Processor ? '#ffc68b' : '#8be3db';
      ctx.globalAlpha = .06;
      ctx.fillRect(x - 22, y - 10, 44, 28);
      ctx.globalAlpha = .08;
      ctx.fillRect(x - 12, y - 6, 24, 18);
      ctx.globalAlpha = 1;
    }

    // interaction prompt
    const target = this.player.interactTarget(this);
    if (target && !panelOpen()) {
      const px = target.x + target.w / 2 - cam.x;
      const py = target.y - cam.y - 12;
      const label = target instanceof Deposit ? (this.game.save.tech.extractor ? 'HOLD E · EXTRACT' : 'EXTRACTOR REQUIRED') : target instanceof Transmission ? 'E · READ SIGNAL' : target instanceof Processor ? 'E · PROCESS' : target instanceof Beacon ? (target.exit ? 'E · RETURN' : 'E · SAVE') : `E · ${target.label || 'USE'}`;
      const w = Math.min(160, label.length * 4.4 + 10);
      ctx.fillStyle = '#121e35';
      ctx.fillRect(Math.round(px - w / 2), Math.round(py - 7), w, 13);
      ctx.fillStyle = '#8be3db'; ctx.fillRect(Math.round(px - w / 2), Math.round(py - 7), 2, 13);
      text(ctx, label, px, py - 5, '#ebf6dd', 'center', 7);
    }
    if (this.player.hidden) {
      text(ctx, "HIDDEN", this.player.x + 7 - cam.x, this.player.y - 14 - cam.y, "#E8A05C", "center", 7);
    }
    if (this.fused && this.def.id === "m2") {
      text(ctx, "Moria's soul is home - his fuel is yours", CAM_W / 2, 26, "#8FB6D6", "center", 8);
    }
    if (time.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${time.flash})`;
      ctx.fillRect(0, 0, CAM_W, CAM_H);
    }
    ctx.restore();

    drawVignette(ctx, 0.8, VIEW_W, VIEW_H);
  }

  /** Data for the F3 overlay. */
  debugInfo() {
    return {
      scene: `${this.def.id} (${this.def.name})`,
      difficulty: this.difficulty.name,
      masks: `${this.player.masks}/${this.player.maxMasks}`,
      player: `x=${this.player.x.toFixed(1)} y=${this.player.y.toFixed(1)} vx=${this.player.vx.toFixed(2)} vy=${this.player.vy.toFixed(2)}`,
      state: this.player.state,
      enemies: this.enemies.map((e) => `${e.constructor.name}:${e.state}`).join(" "),
      entities: this.entities.length,
      particles: this.particles.items.length,
      alerted: this.enemies.filter((e) => e.state === "alert").length,
      got: `${this.got.fuel}/3 fuel, ${this.got.mat} raw material`,
    };
  }
}

/* ========================================================== asteroid scene */
export class AsteroidScene {
  constructor(game) {
    this.game = game;
    this.difficulty = difficultyOf(game.save.difficulty);
    this.t = 0;
    this.duration = 45;
    this.shields = this.difficulty.asteroidShields;
    this.salvage = 0;
    this.ship = { x: 90, y: VIEW_H / 2, w: 28, h: 12, vy: 0, inv: 0 };
    this.asteroids = [];
    this.cans = [];
    this.spawnT = 0;
    this.over = false;
    this.particles = new Particles();
    this.ghosts = new Ghosts();
    this.cam = { x: 0, y: 0 };
    this.camera = { shake: 0, get ox() { return 0; }, get oy() { return 0; } };
    startMusic("space");
    startAmbience("space");
    showHud(false);
    showTouch(true);
    toast(`Asteroid Run (${this.difficulty.name}): survive 45 seconds. Arrow keys to steer, Q to boost.`, 3600);
  }

  debugInfo() {
    return {
      scene: "asteroid run",
      difficulty: this.difficulty.name,
      shields: this.shields,
      salvage: this.salvage,
      rocks: this.asteroids.length,
      time: this.t.toFixed(1),
    };
  }

  update(dt) {
    if (this.over) {
      if (input.pressed("use")) this.game.toHub();
      return;
    }
    const d = this.difficulty.asteroidSpeed;
    this.t += dt;
    const s = this.ship;
    const acc = 0.9;
    if (input.down("up")) s.vy -= acc * dt * 60;
    if (input.down("down")) s.vy += acc * dt * 60;
    const boost = input.down("dash") ? 1.8 : 1;
    if (input.down("left")) s.x -= 2.2 * boost * dt * 60;
    if (input.down("right")) s.x += 2.2 * boost * dt * 60;
    if (input.pressed("jump")) s.vy -= 5;
    s.vy = Math.max(-5, Math.min(5, s.vy * Math.pow(0.94, dt * 60)));
    s.y += s.vy * dt * 60;
    s.y = Math.max(40, Math.min(VIEW_H - 40, s.y));
    s.x = Math.max(30, Math.min(VIEW_W - 180, s.x));
    if (s.inv > 0) s.inv -= dt;

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(0.16, 0.6 - this.t * 0.008) / d;
      const roll = Math.random();
      const size = roll < 0.4 ? "spr_ast_s" : roll < 0.78 ? "spr_ast_m" : "spr_ast_l";
      const img = IMG[size];
      const speed = (2.6 + this.t * 0.06 + Math.random() * 1.4) * d;
      this.asteroids.push({
        x: VIEW_W + 20, y: 30 + Math.random() * (VIEW_H - 60),
        vx: -speed, vy: (Math.random() - 0.5) * 1.2,
        w: img.width, h: img.height, spr: size,
      });
      if (Math.random() < 0.22) this.cans.push({ x: VIEW_W + 30, y: 40 + Math.random() * (VIEW_H - 80), vx: -speed * 0.9, w: 12, h: 16 });
    }

    for (const a of this.asteroids) {
      a.x += a.vx * dt * 60;
      a.y += a.vy * dt * 60;
    }
    for (const c of this.cans) c.x += c.vx * dt * 60;

    for (const a of this.asteroids) {
      if (s.inv <= 0 && a.x < s.x + s.w && a.x + a.w > s.x && a.y < s.y + s.h && a.y + a.h > s.y) {
        s.inv = 1.4;
        this.shields -= 1;
        this.particles.burst(s.x + s.w / 2, s.y + s.h / 2, "#CF5B45", 20, 2.6, 0.7);
        sfx("shield");
        hitStop(0.05);
        if (this.shields <= 0) this.fail();
      }
    }
    for (const c of this.cans) {
      if (!c.taken && c.x < s.x + s.w && c.x + c.w > s.x && c.y < s.y + s.h && c.y + c.h > s.y) {
        c.taken = true;
        this.salvage += 25;
        sfx("fuel");
      }
    }
    this.asteroids = this.asteroids.filter((a) => a.x > -60);
    this.cans = this.cans.filter((c) => c.x > -40 && !c.taken);
    this.particles.update(dt);
    this.ghosts.update(dt);
    if (Math.random() < 0.5) this.particles.burst(s.x - 4, s.y + 6, "#CF5B45", 1, 0.4, 0.3, 0);

    if (this.t >= this.duration) this.succeed();
  }

  succeed() {
    this.over = true;
    stopMusic();
    stopAmbience();
    const save = this.game.save;
    save.asteroid.best = Math.max(save.asteroid.best, this.salvage);
    save.asteroid.cleared = true;
    persist(save);
    sfx("win");
    showPanel("ROUTE CLEARED", `
      <p>The asteroid belt is mapped and the hull survived.</p>
      <p>Salvage value: <b>${this.salvage}</b> &middot; best: <b>${save.asteroid.best}</b> &middot; difficulty: <b>${this.difficulty.name}</b></p>
      <p>Developer practice only—no fuel awarded. Normal belt crossings are part of planet travel.</p>`,
      [{ label: "Return to the ship", primary: true, onClick: () => { hidePanel(); this.game.toHub(); } }]);
  }

  fail() {
    this.over = true;
    stopMusic();
    stopAmbience();
    sfx("lose");
    showPanel("HULL BREACH", `<p>${this.difficulty.asteroidShields} impacts on ${this.difficulty.name}. The shuttle limps back to the Cryo Bay.</p>`,
      [
        { label: "Fly again", primary: true, onClick: () => { hidePanel(); this.game.startAsteroids(); } },
        { label: "Back to the ship", onClick: () => { hidePanel(); this.game.toHub(); } },
      ]);
  }

  draw(ctx) {
    drawBackdrop(ctx, "space", { x: this.t * 30, y: 0 }, this.t);
    for (const a of this.asteroids) ctx.drawImage(IMG[a.spr], Math.round(a.x), Math.round(a.y));
    for (const c of this.cans) ctx.drawImage(IMG.spr_fuel, Math.round(c.x), Math.round(c.y));
    const s = this.ship;
    if (s.inv <= 0 || Math.floor(this.t * 12) % 2 === 0) ctx.drawImage(IMG.spr_pod, Math.round(s.x), Math.round(s.y), 34, 30);
    ctx.fillStyle = "rgba(120,200,255,0.35)";
    ctx.fillRect(Math.round(s.x - 10), Math.round(s.y + 4), 10, 4);
    this.particles.draw(ctx, this.cam);
    text(ctx, `SHIELDS ${"[]".repeat(Math.max(0, this.shields))}`, 14, 12, "#E8A05C", "left", 10);
    text(ctx, `SALVAGE ${this.salvage}`, 14, 28, "#C9843F", "left", 10);
    text(ctx, this.difficulty.name.toUpperCase(), VIEW_W - 14, 28, "#8B93A1", "right", 10);
    text(ctx, `T-${Math.max(0, this.duration - this.t).toFixed(0)}s`, VIEW_W - 14, 12, "#E7E4DC", "right", 10);
    drawVignette(ctx, 0.7);
  }
}

/* ========================================================== cutscene scene */
export class CutsceneScene {
  constructor(game, cards, onDone) {
    this.game = game;
    this.cards = cards;
    this.index = 0;
    this.t = 0;
    this.onDone = onDone;
    stopMusic();
    stopAmbience();
    showHud(false);
    hideTouch();
  }

  update(dt) {
    this.t += dt;
    if (input.pressed("use") || input.pressed("jump") || this.t > 4.6) {
      this.index += 1;
      this.t = 0;
      sfx("ui");
      if (this.index >= this.cards.length) this.onDone();
    }
  }

  draw(ctx) {
    drawBackdrop(ctx, "space", { x: this.index * 90, y: 0 }, performance.now() / 1000);
    const card = this.cards[this.index];
    if (!card) return;
    ctx.globalAlpha = Math.min(1, this.t * 2);
    card.split("\n").forEach((l, i) => {
      text(ctx, l, VIEW_W / 2, VIEW_H / 2 - 20 + i * 18, i === 0 ? "#E7E4DC" : "#C7C3B8", "center", i === 0 ? 13 : 10);
    });
    ctx.globalAlpha = 1;
    text(ctx, "[ space to skip ]", VIEW_W - 14, VIEW_H - 20, "#6A7280", "right", 9);
    drawVignette(ctx, 0.6);
  }
}

/* ============================================================= ending scene */
export class EndingScene {
  constructor(game, choice) {
    this.game = game;
    this.choice = choice;
    this.t = 0;
    this.creditsShown = false;
    stopMusic();
    stopAmbience();
    showHud(false);
    hideTouch();
    startAmbience(choice === "return" ? "storm" : "space");
    if (choice === "return") {
      this.lines = [
        "You route the final cell back into the three worlds.",
        "Exxos' herds return to the vents. Moria's people breathe easy. World 3's lights come on for the first time in a century.",
        "The ship stays. Nobody is left to be caught in the fact that the ship's log is nearly empty.",
      ];
    } else {
      this.lines = [
        "You take the fuel and burn for home.",
        "Behind you, Exxos' herds scatter. Moria's people go dark. World 3's bridges fall back into the sea.",
        "The log ends with a single line: destination in 12,000,000 light-years. Arrival not expected.",
      ];
    }
  }

  update(dt) {
    this.t += dt;
    if (this.creditsShown) return;
    if (input.pressed("use") || this.t > 12) {
      this.creditsShown = true;
      this.showCredits();
    }
  }

  showCredits() {
    const s = this.game.save;
    const minutes = Math.floor((s.timePlayed || 0) / 60);
    showPanel("PALE HORIZON", `
      <p><b>Thank you for playing.</b></p>
      <p>Fuel recovered: <b>${Math.min(9, totalFuel(s))}/9</b> &middot; ship systems restored: <b>${totalSystems(s)}/9</b>
      &middot; times downed: <b>${s.downs}</b> &middot; play time: <b>${minutes} min</b> &middot; difficulty: <b>${difficultyOf(s.difficulty).name}</b></p>
      <p>Ending seen: <b>${s.ending === "return" ? "Homecoming Deferred" : "The Long Way Home"}</b></p>
      <p style="margin-top:12px"><b>Team</b><br>
      Avaneesh - main coder &middot; Retesh - debugger / main guy &middot; Angad - designer &middot; Niko - designer<br>
      Nihaan - documentation / side designer &middot; Arjun - documentation</p>
      <p><b>Design revision note</b>: planet "Exxon" was renamed <b>Exxos</b> to avoid a trademark clash,
      and World 3 (left blank in the design doc) was filled in as <b>The Hollow Signal</b>.</p>
      <p>Pixel art, code, levels and sound were generated with AI assistance, then reviewed and tuned by the team.
      GenAI use is permitted for TSA Video Game Design - see the AI reflection page in the documentation portfolio.</p>`,
      [
        { label: "Play again", primary: true, onClick: () => { hidePanel(); this.game.toMenu(); } },
        { label: "Chapter select", onClick: () => { hidePanel(); this.game.showChapters(); } },
      ]);
  }

  draw(ctx) {
    drawBackdrop(ctx, this.choice === "return" ? "storm" : "space", { x: this.t * 40, y: 0 }, this.t);
    const idx = Math.min(this.lines.length - 1, Math.floor(this.t / 4));
    ctx.globalAlpha = Math.min(1, (this.t % 4) * 1.5);
    const words = this.lines[idx].split(" ");
    let line = "";
    const out = [];
    for (const w of words) {
      if ((line + w).length > 62) {
        out.push(line.trim());
        line = "";
      }
      line += `${w} `;
    }
    out.push(line.trim());
    out.forEach((l, i) => text(ctx, l, VIEW_W / 2, VIEW_H / 2 - 16 + i * 16, "#D8D4CA", "center", 10));
    ctx.globalAlpha = 1;
    text(ctx, this.choice === "return" ? "ENDING: HOMECOMING DEFERRED" : "ENDING: THE LONG WAY HOME", VIEW_W / 2, 60, "#C9843F", "center", 11);
    drawVignette(ctx, 0.7);
  }
}
