/**
 * The test deck (corner code: admin). Every feature of the game is one press away, which is
 * what makes it quick to demo: jump straight to any world, hand yourself the
 * movement kit, fill the ship, watch an ending, or wipe the slot and start
 * clean. It writes to the active save slot exactly like normal play does, so
 * anything done here is visible in the slot list afterwards.
 */
import { sfx } from "./audio.js";
import { input } from "./engine.js";
import { persist } from "./scenes.js";
import { showPanel, hidePanel } from "./ui.js";
import { MATERIALS, SYSTEMS, summarize, clearSlot } from "./save.js";
import { codeList } from "./codes.js";

const $ = (id) => document.getElementById(id);
let game = null;
let built = false;

export const adminOpen = () => !$("admin").classList.contains("hidden");

export function openAdmin() {
  if (!game) return;
  $("admin").classList.remove("hidden");
  refresh();
}

export function closeAdmin() {
  if ($("admin").contains(document.activeElement)) document.activeElement.blur();
  $("admin").classList.add("hidden");
  input.reset();
}

export function toggleAdmin() {
  if (adminOpen()) closeAdmin();
  else openAdmin();
}

function press(label, sub, onClick, danger = false) {
  const b = document.createElement("button");
  if (danger) b.classList.add("danger");
  b.innerHTML = `${label}<small>${sub}</small>`;
  b.addEventListener("click", () => {
    sfx("select");
    onClick();
    refresh();
  });
  return b;
}

function grid(title) {
  const h = document.createElement("h4");
  h.textContent = title;
  const g = document.createElement("div");
  g.className = "grid";
  $("admin-body").append(h, g);
  return g;
}

export function initAdmin(theGame) {
  game = theGame;
  if (built) return;
  built = true;

  const body = $("admin-body");
  body.innerHTML = "";

  /* ---------------------------------------------------------------- travel */
  const travel = grid("Travel");
  const jump = (label, sub, fn) => travel.appendChild(press(label, sub, () => { closeAdmin(); fn(); }));
  jump("Ship interior", "the lander: wake up, save, install", () => game.toHub());
  jump("Training deck", "the playable tutorial", () => game.startTutorial());
  // worlds fly their travel cutscene on the way in, which is also how the
  // team reviews them; the toggle below cuts the flying short when needed
  for (const w of Object.values(game.worlds)) {
    jump(w.name, `fly out: ${w.material.name} and fuel`, () => game.travelTo(w.id));
  }
  jump("Belt drill", "the rock belt on its own, straight to the end", () => game.startAsteroids());
  jump("Replay the crash", "intro cutscene from orbit", () => game.startIntro());
  jump("Main menu", "back to the title", () => game.toMenu());

  /* ---------------------------------------------------------------- unlock */
  const unlock = grid("Grant");
  unlock.appendChild(press("Full tech tree", "dash, boot, grip, cryo projector, thruster, extractor, chart", () => {
    game.save.tech = { dash: true, doubleJump: true, wallSlide: true, jetpack: true, freezeGun: true, map: true, extractor: true };
    game.save.abilities = { ...game.save.tech };
    persist(game.save);
    game.afterAdmin("every piece of kit built");
  }));
  unlock.appendChild(press("Impulse boot only", "unlocks the glacier world", () => {
    game.save.tech.doubleJump = true;
    game.save.abilities.doubleJump = true;
    persist(game.save);
    game.afterAdmin("impulse boot fitted");
  }));
  unlock.appendChild(press("Materials for everything", "raw and refined, enough to build out the tree", () => {
    game.save.raw = { biomass: 9, ore: 9, crystal: 9 };
    game.save.refined = { rations: 6, plates: 6, coolant: 6 };
    persist(game.save);
    game.afterAdmin("material delivered to the hold");
  }));
  unlock.appendChild(press("+3 fuel in every world", "fills the tanks to 9", () => {
    for (const id of ["m1", "m2", "m3"]) game.save.collected[id].fuel = 3;
    persist(game.save);
    game.afterAdmin("fuel tanks filled");
  }));
  unlock.appendChild(press("+3 raw of each material", "one world's worth each", () => {
    for (const m of Object.values(MATERIALS)) game.save.raw[m.key] += 3;
    persist(game.save);
    game.afterAdmin("raw material delivered");
  }));
  unlock.appendChild(press("+3 refined of each", "processor output, no puzzle", () => {
    for (const m of Object.values(MATERIALS)) game.save.refined[m.refined] += 3;
    persist(game.save);
    game.afterAdmin("refined material delivered");
  }));
  unlock.appendChild(press("Install every system", "hull, cryo loop and bio reactor", () => {
    for (const s of Object.values(SYSTEMS)) game.save.systems[s.key] = 3;
    persist(game.save);
    game.afterAdmin("ship repaired");
  }));
  unlock.appendChild(press("Clear every world", "marks all three as finished", () => {
    for (const id of ["m1", "m2", "m3"]) game.save.done[id] = true;
    persist(game.save);
    game.afterAdmin("worlds marked cleared");
  }));

  /* --------------------------------------------------------------- salvage */
  // the raw and refined counts have their own buttons under Grant; these are the
  // clean-play score, which only the menu read-out shows
  const money = grid("Salvage");
  money.appendChild(press("+50 of each", "the clean-play score", () => {
    game.save.coins = { amber: (game.save.coins.amber || 0) + 50, remembrance: (game.save.coins.remembrance || 0) + 50, cinders: (game.save.coins.cinders || 0) + 50 };
    persist(game.save);
    game.afterAdmin("salvage credited");
  }));
  money.appendChild(press("Clear the salvage", "all three worlds back to zero", () => {
    game.save.coins = { amber: 0, remembrance: 0, cinders: 0 };
    persist(game.save);
    game.afterAdmin("salvage cleared");
  }));
  money.appendChild(press("Forget every build", "back to run, sneak and jump", () => {
    game.save.tech = { dash: false, doubleJump: false, wallSlide: false, jetpack: false, freezeGun: false, map: false, extractor: false };
    game.save.abilities = { dash: false, doubleJump: false, wallSlide: false, map: false };
    persist(game.save);
    game.afterAdmin("tech cleared");
  }));

  /* --------------------------------------------------------------- toggles */
  const toggles = grid("Toggles");
  toggles.appendChild(press("Catch-proof pilot", "nothing can grab you (demo mode)", () => {
    game.godMode = !game.godMode;
    game.afterAdmin(game.godMode ? "pilot is catch-proof" : "pilot can be caught again");
  }));
  toggles.appendChild(press("Debug overlay", "the old F3 read-out", () => {
    game.debug = !game.debug;
  }));
  toggles.appendChild(press("Skip the flight legs", "straight to the world instead of flying the cutscene", () => {
    game.travelInstant = !game.travelInstant;
  }));
  toggles.appendChild(press("Instant launch", "fills everything the pod needs", () => {
    for (const id of ["m1", "m2", "m3"]) game.save.collected[id].fuel = 3;
    for (const s of Object.values(SYSTEMS)) game.save.systems[s.key] = 3;
    persist(game.save);
    game.afterAdmin("the ship is ready to burn for home");
  }));

  /* ------------------------------------------------------------------ save */
  const saves = grid("Save");
  saves.appendChild(press("Write this slot now", "in case you want to come back", () => {
    persist(game.save);
    game.afterAdmin("slot written");
  }));
  saves.appendChild(press("Reload this slot", "discard anything not saved", () => {
    game.reloadSlot();
  }));
  saves.appendChild(press("Save slots", "switch flight or start a new one", () => {
    closeAdmin();
    hidePanel();
    game.showSlots(() => game.toMenu());
  }));
  saves.appendChild(press("Wipe this slot", "delete the flight and start fresh", () => {
    clearSlot(game.save.slot || 0);
    game.reloadSlot();
  }, true));

  /* ----------------------------------------------------------------- codes */
  // The reader in the corner is how the test deck is opened now, so the codes
  // are listed here - this panel is the only place they are written down.
  const codes = grid("Codes (type them in the corner reader)");
  for (const c of codeList()) {
    codes.appendChild(press(c.code, c.blurb, () => {
      const field = document.getElementById("codes-input");
      if (field) {
        field.value = c.code;
        field.dispatchEvent(new Event("input"));
      }
      closeAdmin();
      showPanel("CODE", `
        <p><b>${c.code}</b> - ${c.label}<br>${c.blurb}</p>
        <p>Type it into the reader in the bottom-right corner of the screen and press Enter.</p>`,[{ label: "Close", primary: true, onClick: () => hidePanel() }]);
    }));
  }

  $("admin-close").addEventListener("click", () => { sfx("select"); closeAdmin(); });
  $("admin-reset").addEventListener("click", () => {
    closeAdmin();
    showPanel("WIPE THIS SLOT", `
      <p>This deletes the flight in <b>slot ${(game.save.slot || 0) + 1}</b> and reloads a fresh one.
      Other slots are untouched.</p>`,
      [
        { label: "Wipe it", primary: true, onClick: () => { clearSlot(game.save.slot || 0); hidePanel(); closeAdmin(); game.reloadSlot(); } },
        { label: "Keep it", onClick: () => hidePanel() },
      ]);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && adminOpen()) {
      e.preventDefault();
      closeAdmin();
    }
  });
}

function refresh() {
  if (!game) return;
  const s = game.save;
  const sum = summarize(s);
  const fuel = sum.fuel;
  const scene = game.scene && game.scene.def ? game.scene.def.id : game.scene ? game.scene.constructor.name : "menu";
  const lines = [
    `slot ${(s.slot || 0) + 1}/${3}    scene ${scene}    fps ${game.fps ? game.fps.toFixed(0) : "-"}`,
    `fuel ${fuel}/9    systems hull ${s.systems.hull}/3  cryo ${s.systems.cryo}/3  bio ${s.systems.bio}/3`,
    `raw  bio ${s.raw.biomass}  ore ${s.raw.ore}  cryo ${s.raw.crystal}      refined  rations ${s.refined.rations}  plates ${s.refined.plates}  coolant ${s.refined.coolant}`,
    `tech built: ${Object.entries(s.tech).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}    shell ${s.style || "ivory"}`,
    `catch-proof ${game.godMode ? "ON" : "off"}    travel ${game.travelInstant ? "cut short" : "full cutscenes"}    catches ${s.catches}    play time ${Math.floor((s.timePlayed || 0) / 60)}m`,
    `difficulty ${s.difficulty}    intro seen ${s.started ? "yes" : "no"}    ending ${s.ending || "none"}`,
  ];
  if (game.runtime && game.runtime.errors.length) {
    lines.push("-- recent errors --");
    lines.push(...game.runtime.errors);
  }
  $("admin-state").textContent = lines.join("\n");
}
