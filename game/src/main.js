import { loadAssets, IMG } from "./assets.js";
import {
  input, drawBackdrop, drawVignette, text, time, VIEW_W, VIEW_H,
} from "./engine.js";

import {
  initUI, showMenu, hideMenu, showPanel, hidePanel, toast, dialogue,
  showHud, hideTouch, showTouch, setAlert, setDebug, showOptions,
} from "./ui.js";
import {
  initAudio, resumeAudio, toggleMute, isMuted, setMuted, setVolume, getVolumes,
  sfx, startMusic, stopMusic, startAmbience, stopAmbience, duckMusic,
} from "./audio.js";
import { DIFFICULTY, difficultyOf } from "./core/config.js";
import { MISSIONS, levelById } from "./levels.js";
import {
  LevelScene, AsteroidScene, CutsceneScene, EndingScene,
  loadSave, persist, totalFuel, totalSystems, shipReady, WORLDS,
} from "./scenes.js";
import {
  MATERIALS, SYSTEMS, SLOT_COUNT, TECH, LAB_PARTS, held, canBuild, spend,
  readSlots, clearSlot, migrateLegacy, summarize,
} from "./save.js";
import { IntroScene } from "./intro.js";
import { TRANSMISSIONS, FIELD_NOTES } from './journal.js';
import { TravelScene } from "./travel.js";
import { initAdmin, openAdmin, adminOpen } from "./admin.js";
import { initCodes, codeList, closeCodes, codesOpen } from "./codes.js";
import { showCaught } from "./ui.js";

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

/**
 * There is no shop any more. The lab aboard the ship builds kit out of the
 * material the worlds hand over, and the tech tree in save.js is the whole
 * progression: nothing can be bought, only built.
 */

/* ------------------------------------------------------------------ debug */
const runtime = { errors: [], fps: 60, lastFrame: performance.now() };
window.addEventListener("error", (e) => {
  runtime.errors.push(`${e.message} @ ${(e.filename || "").split("/").pop()}:${e.lineno}`);
  runtime.errors = runtime.errors.slice(-4);
  console.error("Pale Horizon runtime error:", e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  runtime.errors.push(`promise: ${e.reason}`);
  runtime.errors = runtime.errors.slice(-4);
});

/* ------------------------------------------------------------------- menu */
class MenuScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
  }

  /**
   * Deliberately spare: a dark green-black field, a few cold stars, the wreck
   * sitting low and slow, and a strip of instrument readouts along the bottom.
   * Flat fills only - nothing glows that is not a real light.
   */
  draw(g) {
    drawBackdrop(g, "space", { x: this.t * 5, y: 0 }, this.t);

    // the world the wreck is sitting on: one limb, lit from the engine side,
    // so the menu has a horizon instead of only type
    const pcx = VIEW_W * 0.5 + Math.sin(this.t * 0.05) * 8;
    const pcy = VIEW_H + 196;
    g.fillStyle = "#101b18";
    g.beginPath();
    g.arc(pcx, pcy, 250, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#16261f";
    g.beginPath();
    g.arc(pcx - 26, pcy - 18, 224, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1b2c23";
    g.beginPath();
    g.arc(pcx - 52, pcy - 40, 196, 0, Math.PI * 2);
    g.fill();
    // a thin warm rim where the planet catches the light
    g.strokeStyle = "rgba(232,160,92,0.22)";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(pcx, pcy, 250, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();

    const ship = IMG.spr_ship;
    if (ship) {
      // parked low and left: the menu type sits over the sky, not over the ship
      const x = 4;
      const y = VIEW_H - 200;
      g.drawImage(ship, x, y, 288, 144);
      g.fillStyle = "#CF5B45"; // only light source on screen: the cooling engine
      g.fillRect(Math.round(x) + 1, Math.round(y) + 30, 3, 2);
      g.globalAlpha = 0.55;
      g.fillRect(Math.round(x) + 4, Math.round(y) + 31, 2, 1);
      g.globalAlpha = 1;
    }

    const saved = this.game.save;
    const y = VIEW_H - 24;
    g.fillStyle = "rgba(17,23,19,0.92)";
    g.fillRect(0, y - 7, VIEW_W, 40);
    g.fillStyle = "#2F3742";
    g.fillRect(0, y - 7, VIEW_W, 1);
    g.fillStyle = "#1B222B";
    for (let x = 14; x < VIEW_W; x += 4) g.fillRect(x, y - 4, 2, 2);
    text(
      g,
      `FUEL ${Math.min(9, totalFuel(saved))}/9   SHIP ${totalSystems(saved)}/9   ${difficultyOf(saved.difficulty).name.toUpperCase()}   ${isMuted() ? "MUTED" : "AUDIO ON"}`,
      16, y, "#E8A05C", "left", 9
    );
    text(g, "DEEP SPACE - 142 MLY FROM HOME", VIEW_W - 16, y, "#8B93A1", "right", 9);

    drawVignette(g, 0.75);
  }
}

/* ------------------------------------------------------------------- game */
class Game {
  constructor() {
    // one-time lift of the old single-save format into slot 1
    migrateLegacy();
    const slots = readSlots();
    // resume the most recent flight, or fall through to the first empty slot
    let pick = 0;
    let newest = -1;
    slots.forEach((s, i) => {
      if (s && (s.updated || 0) > newest) {
        newest = s.updated || 0;
        pick = i;
      }
    });
    this.slot = pick;
    this.save = loadSave(this.slot);
    this.scene = null;
    this.time = 0;
    this.debug = false;
    this.godMode = false;
    this.catches = 0;
    this.fps = 60;
    this.runtime = runtime;
    this.worlds = {
      m1: { ...WORLDS.m1, material: MATERIALS.biomass },
      m2: { ...WORLDS.m2, material: MATERIALS.ore },
      m3: { ...WORLDS.m3, material: MATERIALS.crystal },
    };
    this.applyAudio();
    /** a big caption painted over any scene (the easter eggs use it) */
    this.card = null;
    /** tests and dev jumps skip the flight legs instead of flying them */
    this.travelInstant = false;
  }

  /**
   * A caption card over whatever is running. Cutscenes are the only place the
   * game talks in the second person, so the eggs borrow it.
   */
  showCard(title, lines, secs = 4.5) {
    this.card = { title, lines: lines || [], t: 0, secs };
  }

  /** The test deck is only opened by an explicit `admin` code submission. */
  openTestDeck() {
    openAdmin();
  }

  /**
   * Fly to a world. The leg is authored per destination in travel.js; the dev
   * jumps and the self-test turn it off with `travelInstant`.
   */
  travelTo(id) {
    if (!WORLDS[id]) return;
    if (WORLDS[id].needs && !this.save.tech[WORLDS[id].needs]) {
      toast("Build the impulse boot at the research bench before flying to the glacier.", 2800);
      return;
    }
    hidePanel();
    hideMenu();
    closeCodes();
    if (this.travelInstant) {
      this.startLevel(id);
      return;
    }
    this.setScene(new TravelScene(this, id, { from: "ship" }));
  }

  /** Fly home from a world: the return leg, then the lander's cabin. */
  travelBack(from) {
    hidePanel();
    hideMenu();
    closeCodes();
    if (this.travelInstant || !WORLDS[from]) {
      this.toHub();
      return;
    }
    this.setScene(new TravelScene(this, "ship", { from }));
  }

  /** `travel` code: fly the next world's leg, then land there. */
  replayTravel() {
    const order = ["m1", "m2", "m3"];
    const next = order.find((id) => !this.save.done[id]) || order[this.save.slot % order.length];
    this.travelTo(next);
  }

  /** `home` code: the ending, with the ship in whatever state it is in. */
  jumpToEnding() {
    hidePanel();
    hideMenu();
    const choice = this.save.ending === "return" ? "return" : "keep";
    this.save.ending = choice;
    persist(this.save);
    this.setScene(new EndingScene(this, choice));
  }

  /** `moria` code: what he says when the soul gets home. */
  replayMoria() {
    const m2 = MISSIONS.find((m) => m.id === "m2");
    if (m2 && m2.onFuse) dialogue(m2.onFuse);
  }

  /** Adopt a slot: used by the slot screen and by the test deck. */
  useSlot(i) {
    this.slot = Math.max(0, Math.min(SLOT_COUNT - 1, i));
    this.save = loadSave(this.slot);
    this.applyAudio();
  }

  reloadSlot() {
    this.useSlot(this.save.slot || 0);
    toast(`Slot ${this.slot + 1} reloaded`, 1400);
    if (this.scene instanceof LevelScene) this.startLevel(this.scene.def.id);
    else this.toMenu();
  }

  /** Called by the test deck after it edits the save, so the world catches up. */
  afterAdmin(msg) {
    persist(this.save);
    if (this.scene && this.scene.refreshHud) this.scene.refreshHud();
    if (msg) toast(msg, 1500);
  }

  applyAudio() {
    const a = this.save.audio;
    setVolume("master", a.master);
    setVolume("music", a.music);
    setVolume("sfx", a.sfx);
    setVolume("ambience", a.ambience);
    setMuted(Boolean(a.muted));
  }

  saveAudio() {
    this.save.audio = { ...getVolumes(), muted: isMuted() };
    persist(this.save);
  }

  setScene(scene) {
    if (this.scene && this.scene.leave) this.scene.leave();      this.scene = scene;
    document.body.classList.toggle('title-screen', scene instanceof MenuScene);
    document.activeElement?.blur?.();
    input.reset();
  }

  get difficulty() {
    return difficultyOf(this.save.difficulty);
  }

  setDifficulty(id) {
    if (!DIFFICULTY[id]) return;
    this.save.difficulty = id;
    persist(this.save);
    toast(`Difficulty: ${DIFFICULTY[id].name}`, 1500);
  }

  /**
   * Pilot shell colour. The sprite sets are baked for all three options, so
   * this is only a save flag - the pilot picks it up when a level next loads.
   */
  setStyle(id) {
    this.save.style = id || "";
    persist(this.save);
    const names = { "": "issue ivory", B: "slate", C: "ochre" };
    toast(`Flight shell: ${names[this.save.style] || "issue ivory"}`, 1500);
  }

  /* ---------------------------------------------------------------- flow -- */
  toMenu() {
    hidePanel();
    hideTouch();
    showHud(false);
    setAlert(false);
    stopMusic();
    stopAmbience();
    startMusic("menu");
    startAmbience("space");
    const s = this.save;
    const diff = difficultyOf(s.difficulty);
    const fuel = Math.min(9, totalFuel(s));
    const systems = s.systems;
    const salvage = (s.coins.amber || 0) + (s.coins.remembrance || 0) + (s.coins.cinders || 0);
    const fresh = !s.started;
    showMenu(
      [
        { hint: "\u2191 \u2193 select \u00b7 ENTER confirm" },
        { group: "Flight" },
        {
          label: fresh ? "Start game" : "Continue game",
          sub: fresh ? `slot ${this.slot + 1} \u00b7 no log yet` : `slot ${this.slot + 1} \u00b7 ${summarize(s).label}`,
          primary: true,
          onClick: () => (fresh ? this.startIntro() : this.toHub()),
        },
        { label: "Save slots", sub: `${SLOT_COUNT} logs kept aboard \u00b7 slot ${this.slot + 1} in play`, onClick: () => this.showSlots(() => this.toMenu()) },
        { group: "Reference" },
        { label: "How to play", sub: "keys, stealth, what the lander still needs", onClick: () => this.showHowTo() },
        { label: "Field journal", sub: `${(s.journal || []).length} / ${TRANSMISSIONS.length} signals recovered`, onClick: () => this.showJournal(() => this.toMenu()) },
        { label: "Training deck", sub: "practice room off the cryo bay", onClick: () => this.startTutorial() },
        { group: "System" },
        { label: "Options", sub: `${diff.name} \u00b7 volume \u00b7 pilot shell`, onClick: () => this.showOptions() },
      ],
      {
        tagline: `Down on Exxos with dry tanks.<br>
        Three worlds inside pod range. One way home.`,
        status: [
          ["Save slot", `${this.slot + 1} / ${SLOT_COUNT}`, ""],
          ["Fuel tanks", `${fuel} / 9`, fuel >= 9 ? "ok" : "off"],
          ["Hull plating", `${systems.hull} / 3`, systems.hull >= 3 ? "ok" : "off"],
          ["Cryo loop", `${systems.cryo} / 3`, systems.cryo >= 3 ? "ok" : "off"],
          ["Bio reactor", `${systems.bio} / 3`, systems.bio >= 3 ? "ok" : "off"],
          ["Signals", `${(s.journal || []).length} / ${TRANSMISSIONS.length}`, ""],
          ["Difficulty", diff.name, ""],
          ["Salvage", `${salvage}`, ""],
          ["Catches", `${s.catches}`, ""],
          ["Rated", "E \u00b7 Everyone", ""],
        ],
      }
    );
    this.setScene(new MenuScene(this));
  }

  /**
   * The slot screen. Used from the menu and from the flight recorder aboard the
   * ship, so a run can be parked or picked up from either end.
   */
  showSlots(back) {
    const rows = [];
    const slots = readSlots();
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const s = slots[i];
      const sum = summarize(s);
      const active = i === this.slot;
      rows.push({
        label: s ? `SLOT ${i + 1}${active ? " - PLAYING" : ""}` : `SLOT ${i + 1} - EMPTY`,
        sub: s ? `${sum.label} - ${sum.difficulty} - saved ${sum.when}` : "no flight here yet",
        primary: !s || active,
        onClick: () => {
          if (!s) {
            clearSlot(i);
            this.useSlot(i);
            this.save.started = false;
            persist(this.save);
            hidePanel();
            this.startIntro();
            return;
          }
          this.useSlot(i);
          hidePanel();
          if (this.save.started) this.toHub();
          else this.startIntro();
        },
      });
    }
    rows.push({
      label: this.save.started ? "Delete this flight" : "Clear this slot",
      sub: `empties slot ${this.slot + 1} and starts again`,
      onClick: () => {
        clearSlot(this.slot);
        this.useSlot(this.slot);
        persist(this.save);
        toast(`Slot ${this.slot + 1} cleared`, 1400);
        this.showSlots(back);
      },
    });
    rows.push({ label: "Back", onClick: () => { hidePanel(); if (back) back(); } });
    showPanel("SAVE SLOTS", `
      <p>Three flights are kept side by side, so a demo can be started without losing a
      run that is already going. Slots save whenever the game saves: beacons, pickups,
      installations and anything built at the bench.</p>`,
      rows);
  }

  /**
   * Progression. The glacier world is a shelf the escape pod cannot put down on
   * without a double jump, so the tech tree gates the last world rather than a
   * locked door in a level.
   */
  reachAllowed(id) {
    const gate = WORLDS[id] && WORLDS[id].needs;
    if (!gate) return true;
    return Boolean(this.save.tech && this.save.tech[gate]);
  }

  /** The opening beat: crash from orbit, wake up, read the nav console. */
  startIntro() {
    hidePanel();
    hideMenu();
    showHud(false);
    this.save.started = true;
    persist(this.save);
    this.setScene(new IntroScene(this, () => this.toHub()));
  }

  /** Aboard the lander: this is where the game starts and where it comes back to. */
  toHub() {
    hidePanel();
    hideMenu();
    showTouch(true);
    this.startLevel("ship");
  }

  /** A guided practice room, straight off the main menu. */
  startTutorial() {
    hidePanel();
    hideMenu();
    this.startLevel("tut");
  }

  /** The CAUGHT card a catch throws up before the level rebuilds itself. */
  caughtOverlay(on, why) {
    showCaught(on, why || "RESTARTING THE DESCENT");
  }

  startLevel(id) {
    hidePanel();
    hideMenu();
    showHud(true);
    showTouch(true);
    this.setScene(new LevelScene(this, levelById(id)));
  }

  startAsteroids() {
    hidePanel();
    hideMenu();
    this.setScene(new AsteroidScene(this));
  }

  showOptions(back) {
    duckMusic(true);
    sfx("ui");
    showOptions({
      difficulty: this.save.difficulty,
      volumes: getVolumes(),
      muted: isMuted(),
      style: this.save.style || "",
      onStyle: (id) => this.setStyle(id),
      onDifficulty: (id) => this.setDifficulty(id),
      onVolume: (kind, value) => {
        setVolume(kind, value);
        this.saveAudio();
      },
      onMute: () => {
        const m = toggleMute();
        this.saveAudio();
        return m;
      },
      onBack: () => {
        duckMusic(false);
        this.saveAudio();
        if (back) back();
        else this.toMenu();
      },
    });
  }

  showChapters() {
    const s = this.save;
    const rows = MISSIONS.map((m) => {
      const done = s.done[m.id];
      const fuel = s.collected[m.id].fuel;
      const w = this.worlds[m.id];
      const locked = !this.reachAllowed(m.id);
      return {
        label: locked ? `${m.name} - locked` : m.name,
          sub: locked
            ? "needs the impulse boot (double jump) built at the research bench"
            : `${done ? "CLEARED" : "not cleared"} - fuel ${fuel}/3 - ${w.material.name}: ${s.raw[w.material.key]} raw / ${s.refined[w.material.refined]} processed`,
          primary: !locked,
          disabled: locked,
          onClick: () => {
            if (locked) {
              sfx("back");
              toast("Build the impulse boot at the research bench first", 2600);
              return;
            }
            hidePanel();
            hideMenu();
            this.travelTo(m.id);
          },
      };
    });
    rows.push({ label: "Back", onClick: () => this.toMenu() });
    showPanel("CHAPTER SELECT", `
      <p>The pod can be flown to any world already in range, whatever the log says. The intended
      order is Exxos, then the World of Regrets, then the Hollow Signal - each one ends with a
      flight home to the lander.</p>
      <p>Flying to a world plays its travel leg. Difficulty is set in <b>Options</b> and applies
      the next time a world loads.</p>`,
      rows);
    hideMenu();
  }

  showJournal(onBack = () => hidePanel()) {
    const ids = this.save.journal || [];
    const entries = TRANSMISSIONS.filter((entry) => ids.includes(entry.id));
    const materials = Object.values(MATERIALS).map((m) => `<div class="journal-stock"><img src="assets/${m.icon}.png" alt=""><span>${m.name}<b>${this.save.raw[m.key]} raw · ${this.save.refined[m.refined]} ${m.refinedName}</b></span></div>`).join('');
    const archive = entries.length ? entries.map((e) => `<article class="journal-entry"><p class="journal-location">${e.location}</p><h4>${e.title}</h4><p>${e.text}</p></article>`).join('') : '<p class="blurb">No transmissions recovered yet. Look for antenna-marked recorders. Crew quarters and the observation deck are good places to start.</p>';
    showPanel('FIELD JOURNAL', `<p class="journal-location">ARCHIVE ${entries.length} / ${TRANSMISSIONS.length} · SAVED WITH THIS FLIGHT</p><div class="journal-inventory">${materials}</div><h4>Recovered transmissions</h4>${archive}<h4>Field guide</h4>${FIELD_NOTES.map(([title, body]) => `<details><summary>${title}</summary><p>${body}</p></details>`).join('')}`, [{ label: 'Back', primary: true, onClick: onBack }]);
  }

  showHowTo() {
    showPanel("HOW TO PLAY", `
      <p><b>Goal.</b> Your lander went down 142,000,000 light-years from Earth, and it never moves again -
      the <b>escape pod</b> is what travels, so pick a world at the navigation console and the pod takes you
      down. To fuel the escape pod's journey home you need <b>9 fuel cells</b>, <b>3 alloy plates</b> for the hull,
      <b>3 coolant</b> for the cryo loop and <b>3 rations</b> for the bio reactor - and every one of those
      materials comes off a world that would rather keep it.</p>
      <p><b>Raw in, refined out.</b> Each world hands you one raw material: nutrient pods on the organics
      world, rare earth in the dig, cryo crystal on the glacier. None of it is useful until it has been
      through the <b>field processor</b> out on that world - purify, smelt or melt, one small puzzle each -
      and then installed at the matching station aboard the ship.</p>
      <p><b>You start with only run, sneak and jump.</b> Everything else is <b>built</b>, never bought.
      The <b>research bench</b> in the lander lists what each part costs and tells you when the hold is short:
      the <b>impulse drive</b> (dash), the <b>grip gloves</b> (wall slide), the <b>impulse boot</b> (double jump),
      the <b>cryo projector</b>, the <b>thruster pack</b>, the <b>extractor rig</b> and the <b>survey chart</b>. The price is always material - what you carried out of the worlds and ran through their field processors.
      Nothing on the ship takes money, and the glacier world cannot even be landed on until the
      <b>impulse boot</b> is built.</p>
      <div class="keys">
        <span>&larr; &rarr; / A D</span><span>run (air control is strong - steer mid-jump)</span>
        <span>SPACE / W / &uarr;</span><span>jump: hold higher, tap short, jump again off walls</span>
        <span>SPACE in mid-air</span><span>impulse boot (second jump) and thruster pack (hold to burn), once built</span>
        <span>Q / SHIFT</span><span>impulse drive (dash, once built) - once per airtime, chains into long gaps</span>
        <span>F</span><span>cryo projector (once built) - freezes what is in front of you</span>
        <span>&darr; / S</span><span>sneak - slower and quieter, hides you in tall grass</span>
        <span>E / ENTER</span><span>use beacons, relays, consoles, Moria</span>
        <span>TAB / ESC</span><span>pause &middot; F3 debug overlay &middot; M mute</span>
      </div>
      <p><b>Getting caught.</b> There is no health bar and no fight: if a hunter or a drone reaches you,
      the descent restarts from the last beacon you lit. Nothing you already banked is lost - a catch
      costs you the attempt, not the run. <b>Beacons are benches</b>: light one to save your progress.</p>
      <p><b>No weapons.</b> Nothing in this game can be hurt. Predators and drones can only catch you.</p>
      <p><b>Stealth rules.</b> Predators see in a cone and hear you run. Sneaking halves the distance they
      notice you. Standing still in tall grass makes you invisible (the HUD says HIDDEN). Drones ignore
      grass but cannot see through walls or platforms. Exxos hides <b>vent pitchers</b> in that same grass:
      step over one and it opens, drags you under and takes the run - freeze it or walk around it.</p>
      <p><b>Field journal.</b> Press J or open it from pause. Antenna-marked recorders preserve transmissions,
      lore and hidden-code clues in your save. Your journal also tracks raw/refined materials.</p>
      <p><b>Explore the ship.</b> Your cryo pod and chamber share the forward bay. Walk through the workshop,
      then jump up the spine platforms to reach research. Navigation is on the lower bridge deck.
      Beyond the launch bay are crew quarters, engineering and a raised observation deck.</p>
      <p><b>Extraction.</b> Build the extractor for one plate and one ration. Hold E beside a glowing seam for
      1.5 seconds to extract a batch. Loose materials remain available to build your first rig.</p>
      <p><b>Puzzles.</b> Push distinct crates onto both plates in the dig's double seal; race the three-second
      gate; return Moria's soul. Freeze a hunter onto Exxos's blue plate for an optional cache.
      On the glacier carry ember charges to relays to raise bridges.</p>
      <p><b>Travel.</b> Every world has its own outbound and return shots. Regrets and the glacier require an
      asteroid crossing: steer with arrows or WASD. Space skips cinematic shots, never the belt.
      A depleted shield restarts that crossing without costing your materials.</p>
      <p><b>Difficulty.</b> Explorer is gentle (slower hunters, narrow cones, water is harmless).
      Standard is the intended game. Nightmare sends fast hunters with wide cones across the ice.</p>`,
      [{ label: "Close", primary: true, onClick: () => this.toMenu() }, { label: "Chapter select", sub: "any world, any time", onClick: () => this.showChapters() }]);
    hideMenu();
  }

  /* --------------------------------------------------------------- the lab -- */
  /**
   * The research bench. Every item is built from material: raw stuff off the
   * worlds and the refined output of the field processors. This is the only
   * place the pilot gets better, and the double jump in particular is what
   * opens the glacier world at all.
   */
  showLab(message) {
    const s = this.save;
    const bag = held(s);
    const rows = Object.values(TECH).map((tech) => {
      const owned = Boolean(s.tech[tech.key]);
      const affordable = canBuild(s, tech);
      const cost = Object.entries(tech.cost)
        .map(([k, n]) => `${n} ${LAB_PARTS[k]}`)
        .join(" + ");
      return {
        label: owned ? `${tech.name} - BUILT` : `${tech.name}`,
        sub: owned ? tech.blurb : `${cost}  -  ${affordable ? "ready to build" : "not enough material"}`,
        primary: !owned && affordable,
        disabled: owned,
        onClick: () => {
          if (owned) {
            sfx("back");
            return;
          }
          if (!affordable) {
            sfx("back");
            toast(`Missing material for the ${tech.name.toLowerCase()}`, 1800);
            return;
          }
          spend(s, tech);
          s.tech[tech.key] = true;
          if (tech.key in s.abilities) s.abilities[tech.key] = true;
          persist(s);
          sfx("unlock");
          toast(`${tech.name} built. It is fitted the next time you step outside.`, 3200);
          this.showLab();
        },
      };
    });
    rows.push({ label: "Close", onClick: () => hidePanel() });
    const heldLine = Object.entries(bag)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${LAB_PARTS[k]}`)
      .join(" &middot; ") || "nothing yet";
    showPanel("RESEARCH BENCH", `
      ${message ? `<p><b>${message}</b></p>` : ""}
      <p>The bench prints what the lander needs next. Material in the hold: <b>${heldLine}</b>.</p>
      <p>Raw material has to go through the <b>field processor</b> on the world it came from before
      it can be used - refine nutrient pods, rare earth and cryo crystal into rations, alloy plate
      and coolant.</p>
      <p>The <b>impulse boot</b> is the key to the third world: nothing else reaches the glacier's
      landing shelf.</p>`,
      rows);
  }

  /* -------------------------------------------------------- hub stations -- */
  hubAction(role) {
    const s = this.save;
    const fuel = Math.min(9, totalFuel(s));
    const diff = difficultyOf(s.difficulty);

    // the three repair stations work identically: refine it, deliver it, bolt it on
    if (role === "repair") return this.installStation("hull");
    if (role === "cryo") return this.installStation("cryo");
    if (role === "bio") return this.installStation("bio");
    if (role === "save") return this.showSlots(() => this.toHub());

    if (role === "console") {
      const rows = MISSIONS.map((m) => {
        const w = this.worlds[m.id];
        const done = s.done[m.id];
        const raw = s.raw[w.material.key] || 0;
        const made = s.refined[w.material.refined] || 0;
        const locked = !this.reachAllowed(m.id);
        return {
          label: locked ? `${m.name} - no landing site` : m.name,
          sub: locked
            ? "the pod cannot make this descent without the impulse boot - build it at the research bench"
            : `${done ? "cleared" : "not cleared"} - fuel ${s.collected[m.id].fuel}/3 - ${w.material.name}: ${raw} raw, ${made} processed`,
          primary: !locked,
          disabled: locked,
          onClick: () => {
            if (locked) {
              sfx("back");
              toast("The glacier world needs the impulse boot (double jump) first", 2600);
              return;
            }
            hidePanel();
            this.travelTo(m.id);
          },
        };
      });
      rows.push({ label: "Close", onClick: () => hidePanel() });
      showPanel("NAVIGATION CONSOLE", `
        <p>Three worlds in range, each holding <b>3 fuel cells</b> and one raw material your
        field processor can turn into something the ship can use. The course to the outer two
        crosses the <b>rock belt</b> - the pod flies it, and the pod takes knocks.</p>
        <p>Tanks <b>${fuel}/9</b> &middot; hull <b>${s.systems.hull}/3</b> &middot; cryo loop
        <b>${s.systems.cryo}/3</b> &middot; bio reactor <b>${s.systems.bio}/3</b> &middot; difficulty <b>${diff.name}</b></p>`,
        rows);
      return;
    }


    if (role === "lab" || role === "shop") {
      this.showLab();
      return;
    }

    if (role === "pod") {
      if (shipReady(s)) {
        showPanel("CRYO POD", `
          <p>The pod is sealed and the tanks are full. The ship is ready to burn for home.</p>
          <p><b>RECOVERED LOG 09</b> - the last entry from the survey team that came before you:
          "The fuel we are taking is what keeps these worlds alive. Exxos' herds graze the vents we drain.
          Moria's people warm themselves on his cells. World 3's machines are running on the last of it.
          We filed the reports. We took it anyway. We are telling whoever comes next, because somebody should."</p>
          <p>What do you do with nine cells of stolen fuel?</p>`,
          [
            {
              label: "Give the fuel back to the three worlds",
              sub: "ending: Homecoming Deferred",
              primary: true,
              onClick: () => {
                s.ending = "return";
                persist(s);
                hidePanel();
                this.setScene(new EndingScene(this, "return"));
              },
            },
            {
              label: "Keep it and fly home",
              sub: "ending: The Long Way Home",
              onClick: () => {
                s.ending = "keep";
                persist(s);
                hidePanel();
                this.setScene(new EndingScene(this, "keep"));
              },
            },
          ]);
        return;
      }
      showPanel("CRYO POD", `
        <p>Still broken. Four systems to bring back:</p>
        <ul>
          <li>fuel tanks: <b>${fuel}/9 cells</b> ${fuel >= 9 ? "(full)" : ""}</li>
          <li>hull plating: <b>${s.systems.hull}/3 alloy plates</b> - smelt rare earth at the dig on the World of Regrets</li>
          <li>cryo loop: <b>${s.systems.cryo}/3 coolant</b> - melt cryo crystal on the glacier world</li>
          <li>bio reactor: <b>${s.systems.bio}/3 rations</b> - purify nutrient pods on the organics world</li>
        </ul>
        <p>Refined material is installed at the <b>fabricator</b>, the <b>cryo tank</b> and the
        <b>galley</b> - all three are further along the cabin. Every station answers to USE (E).</p>`,
        [{ label: "Close", primary: true, onClick: () => hidePanel() }]);
    }
  }

  /**
   * One repair station, one refined unit at a time. This is the only place the
   * three materials are spent, so it is also where the ship visibly comes back
   * to life: every install changes what the cabin lights up.
   */
  installStation(key) {
    const s = this.save;
    const sys = SYSTEMS[key];
    const have = s.refined[sys.material] || 0;
    const done = s.systems[key] || 0;
    const full = done >= 3;
    const rows = [];
    if (!full) {
      rows.push({
        label: have > 0 ? `Install one ${sys.name.toLowerCase()} (${done + 1}/3)` : `No ${sys.material} aboard`,
        sub: have > 0
          ? `${have} ready - the rest stays aboard`
          : `process the raw material on the world it comes from`,
        primary: have > 0,
        disabled: have <= 0,
        onClick: () => {
          if (have <= 0) return;
          s.refined[sys.material] = have - 1;
          s.systems[key] = done + 1;
          persist(s);
          sfx("part");
          if (s.systems[key] >= 3) toast(`${sys.name} online.`, 2400);
          else toast(`${sys.name} ${s.systems[key]}/3 installed`, 1800);
          this.installStation(key);
        },
      });
    }
    rows.push({ label: "Close", onClick: () => hidePanel() });
    showPanel(sys.name.toUpperCase(), `
      <p><b>${sys.name}: ${done}/3 installed</b> ${full ? "- online" : ""}</p>
      <p>Refined ${sys.material} in the hold: <b>${have}</b></p>
      <p>${full
        ? "This system is finished. The pod checks all four before it will fly."
        : "Bring the refined material here and bolt it on. The raw stuff is still growing, digging or freezing somewhere on its world."}</p>`,
      rows);
  }

  /* --------------------------------------------------------------- update -- */
  update(dt) {
    this.time += dt;
    if (this.card) {
      this.card.t += dt;
      if (this.card.t >= this.card.secs) this.card = null;
    }
    if (input.pressed("mute")) {
      const muted = toggleMute();
      this.saveAudio();
      toast(muted ? "Sound muted" : "Sound on", 1100);
    }
    if (input.pressed("debug")) this.debug = !this.debug;
    if (codesOpen() || adminOpen()) return;

    if (this.debug) {
      const info = this.scene && this.scene.debugInfo ? this.scene.debugInfo() : { scene: "menu" };
      const lines = [
        "Pale Horizon debug (F3 to hide)",
        `fps ${runtime.fps.toFixed(0)}  hitstop ${time.hitStop.toFixed(2)}`,
      ];
      for (const [k, v] of Object.entries(info)) lines.push(`${k}: ${v}`);
      if (runtime.errors.length) {
        lines.push("-- recent errors --");
        for (const e of runtime.errors) lines.push(e);
      }
      setDebug(true, lines);
    } else {
      setDebug(false, []);
    }

    if (this.scene && this.scene.update) this.scene.update(dt);
  }

  draw() {
    ctx.fillStyle = "#0B0E13";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.scene && this.scene.draw) this.scene.draw(ctx);
    if (this.card) paintCard(ctx, this.card);
  }
}

/** The caption card a cutscene or an easter egg leaves on the glass. */
function paintCard(ctx, card) {
  const fadeIn = Math.min(1, card.t / 0.35);
  const fadeOut = Math.min(1, Math.max(0, card.secs - card.t) / 0.5);
  const alpha = Math.min(fadeIn, fadeOut);
  ctx.globalAlpha = alpha;
  const h = 46 + card.lines.length * 13;
  ctx.fillStyle = "rgba(7,8,11,0.88)";
  ctx.fillRect(0, VIEW_H / 2 - h / 2 - 8, VIEW_W, h + 16);
  ctx.fillStyle = "#2F3742";
  ctx.fillRect(0, VIEW_H / 2 - h / 2 - 8, VIEW_W, 1);
  ctx.fillRect(0, VIEW_H / 2 + h / 2 + 7, VIEW_W, 1);
  text(ctx, card.title, VIEW_W / 2, VIEW_H / 2 - h / 2 + 4, "#E8A05C", "center", 15, "700");
  card.lines.forEach((l, i) => text(ctx, l, VIEW_W / 2, VIEW_H / 2 - h / 2 + 28 + i * 13, "#b9c2cf", "center", 9));
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------- boot */
function fitCanvas() {
  const pad = 8;    const available = Math.min((window.innerWidth - pad * 2) / VIEW_W, (window.innerHeight - pad * 2) / VIEW_H);
  const scale = available >= 1 ? Math.floor(available) : Math.max(.1, available);
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
}

async function boot() {
  await loadAssets();
  // the type is local, so waiting for it costs nothing and stops the first
  // frame from flashing a fallback face
  if (document.fonts && document.fonts.ready) {
    await Promise.race([Promise.all([document.fonts.load('500 10px "JetBrains Mono"'), document.fonts.load('700 14px "Chakra Petch"'), document.fonts.ready]), new Promise((r) => setTimeout(r, 1500))]);
  }
  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  initUI();
  initAudio();
  const game = new Game();
  initAdmin(game);
  initCodes(game);
  // exposed for tooling and the dev self-test
  window.PALE_HORIZON = {
    game,
    input,
    runtime,
    scenes: { LevelScene, AsteroidScene, CutsceneScene, EndingScene, IntroScene, TravelScene },
    audio: { resumeAudio, isMuted, setMuted, setVolume, getVolumes, sfx, startMusic, stopMusic, startAmbience, stopAmbience },
    save: { readSlots, summarize, persist },
    codes: { list: codeList },
  };
  game.toMenu();

  // dev self-test: open index.html?selftest=1 to drive the whole game headlessly
  if (/[?&]selftest/.test(location.search)) {
    import("../dev/selftest.js")
      .then((m) => m.runSelfTest(window.PALE_HORIZON))
      .catch((err) => { console.error("Pale Horizon self-test crashed:", err); runtime.errors.push(`selftest: ${err && err.message}`); });
  }

  let last = performance.now();
  let acc = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  const STEP = 1 / 60;

  function frame(now) {
    requestAnimationFrame(frame); // always reschedule, even if a frame throws
    try {
      const real = Math.min(0.25, (now - last) / 1000);
      last = now;
      fpsAcc += real;
      fpsFrames += 1;
      if (fpsAcc >= 0.5) {
        runtime.fps = fpsFrames / fpsAcc;
        fpsAcc = 0;
        fpsFrames = 0;
      }

      // hit-stop: freeze the simulation for a few frames on impact, keep drawing
      if (time.hitStop > 0) {
        time.hitStop = Math.max(0, time.hitStop - real);
        game.draw();
        input.endFrame();
        return;
      }

      acc += real;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        game.update(STEP);
        acc -= STEP;
        steps += 1;
      }
      if (steps === 5) acc = 0; // never spiral
      game.draw();
      input.endFrame();
    } catch (err) {
      console.error("Pale Horizon frame error:", err);
      runtime.errors.push(String(err && err.stack ? err.stack.split("\n")[0] : err));
      runtime.errors = runtime.errors.slice(-4);
      acc = 0;
    }
  }
  requestAnimationFrame(frame);
  document.getElementById("loading").classList.add("hidden");
}

boot();
