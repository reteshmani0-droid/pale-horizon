/**
 * Save slots. Three flights are kept side by side in localStorage so a fresh
 * run never has to wipe the run being worked on - which is also what makes the
 * test deck (corner code: admin) safe to use while judging.
 *
 * The shape of a save is the contract between every other module, so it lives
 * here and nowhere else. Each world pays out fuel; each world also pays out one
 * raw material that has to be processed before the ship can use it.
 */
export const SLOTS_KEY = "starfall.slots.v3";
export const LEGACY_KEY = "starfall.save.v2";
export const SLOT_COUNT = 3;

export const MATERIALS = {
  biomass: { key: "biomass", name: "Nutrient pods", short: "BIO", refined: "rations", refinedName: "Rations", icon: "ui_biomass", world: "m1" },
  ore: { key: "ore", name: "Rare earth", short: "ORE", refined: "plates", refinedName: "Alloy plate", icon: "ui_ore", world: "m2" },
  crystal: { key: "crystal", name: "Cryo crystal", short: "CRYO", refined: "coolant", refinedName: "Coolant", icon: "ui_cryo", world: "m3" },
};

export const SYSTEMS = {
  hull: { key: "hull", name: "Hull plating", material: "plates", short: "HULL" },
  cryo: { key: "cryo", name: "Cryo loop", material: "coolant", short: "CRYO" },
  bio: { key: "bio", name: "Bio reactor", material: "rations", short: "BIO" },
};

export const freshSave = () => ({
  v: 3,
  started: false,
  seenIntro: {},
  journal: [],
  done: {},
  collected: { m1: { fuel: 0 }, m2: { fuel: 0 }, m3: { fuel: 0 } },
  bonusFuel: 0,
  // raw material taken off a world, and what the field processor made of it
  raw: { biomass: 0, ore: 0, crystal: 0 },
  refined: { rations: 0, plates: 0, coolant: 0 },
  // what has actually been bolted onto the ship
  systems: { hull: 0, cryo: 0, bio: 0 },
  podRepaired: false,
  asteroid: { best: 0, cleared: false },
  catches: 0,
  runs: 0,
  timePlayed: 0,
  ending: null,
  difficulty: "standard",
  // the old currency is kept as a score, but nothing is bought with it any more
  coins: { amber: 0, remembrance: 0, cinders: 0 },
  // tech is built in the lab out of materials taken off the worlds
  tech: { dash: false, doubleJump: false, wallSlide: false, jetpack: false, freezeGun: false, map: false, extractor: false },
  abilities: { dash: false, doubleJump: false, wallSlide: false, map: false },
  // pilot suit colour: "" ivory, "B" slate, "C" ochre
  style: "",
  audio: { master: 0.9, music: 0.5, sfx: 0.8, ambience: 0.6, muted: false },
});

/**
 * The lab's tech tree. Every item costs raw material and something refined out
 * of it, so building a new piece of kit means going back out to a world first.
 * `needs` is also the gate list: the glacier world cannot be reached without
 * the double jump, so the tree is the progression, not a shop.
 */
export const TECH = {
  dash: {
    key: "dash", name: "Impulse drive", short: "DASH",
    blurb: "A burst of speed, one extra use in mid-air.",
    cost: { ore: 2, plates: 1 },
  },
  wallSlide: {
    key: "wallSlide", name: "Grip gloves", short: "GRIP",
    blurb: "Slide down walls and kick off them to climb.",
    cost: { biomass: 2, rations: 1 },
  },
  doubleJump: {
    key: "doubleJump", name: "Impulse boot", short: "BOOT",
    blurb: "A second jump in mid-air. The glacier world needs this to be reachable at all.",
    // no cryo crystal or coolant here: those come off the glacier, which is what
    // this boot unlocks, so costing one would make the game impossible to finish.
    cost: { ore: 2, plates: 1, rations: 1 },
  },
  freezeGun: {
    key: "freezeGun", name: "Cryo projector", short: "CRYO",
    blurb: "Freezes hunters and vent pitchers solid for a few seconds. Lock one onto a frost plate and the seal opens.",
    cost: { biomass: 3, coolant: 2 },
  },
  extractor: {
    key: "extractor", name: "Extractor rig", short: "RIG",
    blurb: "Bites through the deep seams: stand on one and hold USE for a richer haul.",
    // plates and rations only: the rig is a mid-game tool, and costing it
    // anything from the glacier would put it behind the world it helps you run
    cost: { plates: 1, rations: 1 },
  },
  jetpack: {
    key: "jetpack", name: "Thruster pack", short: "THRUST",
    blurb: "Hold jump in mid-air to burn a short burst of thrust.",
    cost: { crystal: 3, plates: 2, coolant: 1 },
  },
  map: {
    key: "map", name: "Survey chart", short: "CHART",
    blurb: "World map on TAB: beacons, relays, the pod and you.",
    cost: { ore: 1, rations: 1 },
  },
};
/**
 * Material labels for the lab screen. Raw comes off the worlds, refined comes
 * out of the field processors.
 */
export const LAB_PARTS = {
  biomass: "nutrient pods",
  ore: "rare earth",
  crystal: "cryo crystal",
  rations: "rations",
  plates: "alloy plate",
  coolant: "coolant",
};
/** What the player is holding, raw and refined, in one lookup. */
export const held = (save) => ({
  biomass: save.raw.biomass || 0,
  ore: save.raw.ore || 0,
  crystal: save.raw.crystal || 0,
  rations: save.refined.rations || 0,
  plates: save.refined.plates || 0,
  coolant: save.refined.coolant || 0,
});
/** True when every line of a cost is covered. */
export const canBuild = (save, tech) => Object.entries(tech.cost).every(([k, n]) => (held(save)[k] || 0) >= n);
export const spend = (save, tech) => {
  for (const [k, n] of Object.entries(tech.cost)) {
    if (k in save.raw) save.raw[k] = Math.max(0, save.raw[k] - n);
    else save.refined[k] = Math.max(0, save.refined[k] - n);
  }
};

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (e) {
    return null;
  }
};

function normalize(parsed, slot) {
  const base = freshSave();
  const merged = { ...base, ...(parsed || {}), slot };
  merged.collected = { ...base.collected, ...(parsed.collected || {}) };
  for (const id of ["m1", "m2", "m3"]) {
    merged.collected[id] = { fuel: 0, ...(merged.collected[id] || {}) };
  }
  merged.raw = { ...base.raw, ...(parsed.raw || {}) };
  merged.refined = { ...base.refined, ...(parsed.refined || {}) };
  merged.systems = { ...base.systems, ...(parsed.systems || {}) };
  merged.coins = { ...base.coins, ...(parsed.coins || {}) };
  merged.abilities = { ...base.abilities, ...(parsed.abilities || {}) };
  merged.tech = { ...base.tech, ...(parsed.tech || {}) };
  // a save from before the lab existed keeps whatever it had already bought.
  // current saves always carry `tech`, so the old mirror is never read back into
  // it - otherwise anything that touches `abilities` could hand out built kit.
  if (!parsed.tech) for (const [k, had] of Object.entries(merged.abilities)) if (had) merged.tech[k] = true;
  merged.audio = { ...base.audio, ...(parsed.audio || {}) };
  merged.asteroid = { ...base.asteroid, ...(parsed.asteroid || {}) };
  merged.done = { ...(parsed.done || {}) };
  merged.seenIntro = { ...(parsed.seenIntro || {}) };
  merged.journal = Array.isArray(parsed.journal) ? [...new Set(parsed.journal.filter((id) => typeof id === 'string'))] : [];
  return merged;
}

/** All three slots, as stored. Empty slots come back as null. */
export function readSlots() {
  const raw = read(SLOTS_KEY);
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i += 1) out.push(list[i] ? normalize(list[i], i) : null);
  return out;
}

export function loadSlot(slot) {
  const slots = readSlots();
  const found = slots[slot] || null;
  if (found) return found;
  const save = freshSave();
  save.slot = slot;
  return save;
}

export function writeSlot(slot, save) {
  try {
    const slots = readSlots().map((s) => s || null);
    const stored = { ...save, slot, updated: Date.now() };
    slots[slot] = stored;
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    save.updated = stored.updated;
  } catch (e) { /* private mode: keep playing without saving */ }
}

export function clearSlot(slot) {
  try {
    const slots = readSlots();
    slots[slot] = null;
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots.map((s) => s || null)));
  } catch (e) { /* ignore */ }
}

/**
 * A one-time lift of the old single-save format into slot 1, so nobody loses a
 * run they were already playing when slots arrived.
 */
export function migrateLegacy() {
  try {
    if (localStorage.getItem(SLOTS_KEY)) return false;
    const old = read(LEGACY_KEY);
    if (!old) return false;
    writeSlot(0, normalize(old, 0));
    return true;
  } catch (e) {
    return false;
  }
}

/** Everything the slot list needs, in one call. */
export function summarize(save) {
  if (!save) return null;
  const fuel = Math.min(9, Object.values(save.collected).reduce((n, c) => n + (c.fuel || 0), 0) + (save.bonusFuel || 0));
  const systems = (save.systems.hull || 0) + (save.systems.cryo || 0) + (save.systems.bio || 0);
  const when = save.updated ? new Date(save.updated) : null;
  return {
    started: Boolean(save.started),
    fuel,
    systems,
    minutes: Math.floor((save.timePlayed || 0) / 60),
    difficulty: save.difficulty,
    when: when ? `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "not saved yet",
    label: save.started
      ? `Fuel ${fuel}/9 - systems ${systems}/9 - ${Math.floor((save.timePlayed || 0) / 60)} min`
      : "not launched yet",
  };
}
