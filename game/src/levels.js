/**
 * Level data. All coordinates are in tiles; the world is 23 tiles tall (368px).
 * Fill-ins for the parts the design doc left blank are marked with NOTES.
 */

import { TRANSMISSIONS } from './journal.js';
const GROUND = 20;

/* --------------------------------------------------------------- tutorial --
 * A short guided room reachable from the main menu. Every mechanic is taught
 * by a sign you walk past, and the stepped climb in the middle is the one place
 * a fresh pilot can feel the limits of the starting kit.
 */
export const TUTORIAL = {
  id: "tut",
  name: "Training Deck",
  theme: "metal",
  // the training deck is part of the ship, so no EVA suit and no hazards
  suitless: true,
  w: 64,
  h: 23,
  music: "hub",
  objective: "Walk right, read the signs, climb for the cell, process the pod, then reach the beacon",
  // the training room only has one cell to find, so its exit opens on one
  exitFuel: 1,
  solids: [
    [0, 20, 20, 3],
    [24, 20, 10, 3],
    [38, 20, 26, 3],
    [0, 0, 2, 23],
    [62, 0, 2, 23],
    [0, 0, 64, 2],
    [20, 17, 3, 1],
    [34, 16, 3, 1],
    [46, 14, 5, 1],
  ],
  platforms: [
    [12, 15, 3],
    [30, 18, 3],
    [41, 17, 3],
    [55, 17, 3],
  ],
  decor: [
    { t: "vent", x: 6, y: 19 }, { t: "vent", x: 28, y: 19 },
    { t: "rock", x: 36, y: 19 }, { t: "vent", x: 52, y: 19 },
    { t: "plant", x: 33, y: 19 }, { t: "plant", x: 44, y: 19 },
  ],
  entities: [
    { t: "beacon", x: 3, y: 19 },
    { t: "pickup", x: 13, y: 13, type: "fuel" },
    // a practice hopper: one pod in, one ration out, so the field processors
    // are not met for the first time under pressure on a real world
    { t: "pickup", x: 57, y: 15, type: "biomass" },
    { t: "processor", x: 58, y: 19, kind: "purify", material: "biomass", label: "PRACTICE RIG" },
    // one crate and one plate: the seal puzzle, taught with nothing at stake
    { t: "block", x: 50, y: 18 },
    { t: "plate", x: 53, y: 19, group: 1 },
    { t: "door", x: 60, y: 17, h: 3, group: 1 },
    { t: "beacon", x: 60, y: 19, exit: true },
  ],
  start: { x: 4, y: 18 },
  intro: [
    { name: "SIGN 1", text: "RUN with ARROWS or A/D. JUMP with SPACE - hold it to jump higher, tap it for a short hop." },
    { name: "SIGN 2", text: "HOLD DOWN to sneak. Sneaking is slower but quiet, and it hides you in tall grass on the worlds below." },
    { name: "SIGN 3", text: "Nothing in this game can be fought. If a creeper takes your feet or a bird takes you off the ground, the descent restarts at the last beacon - so light the beacons." },
    { name: "SIGN 4", text: "The PRACTICE RIG ahead processes a nutrient pod into a ration. Press USE at the rig and run the filtration puzzle. That is the whole economy of the game." },
    { name: "SIGN 5", text: "The DASH, DOUBLE JUMP and GRIP GLOVES are not free: the RESEARCH BENCH aboard the ship builds them, and it is paid in material - raw stuff off the worlds, refined at the field processors." },
  ],
};

/* -------------------------------------------------------------------- hub -- */
/**
 * Aboard the lander. Four compartments on the cabin deck and a research deck
 * above the aft half, joined by a spine ladder the pilot climbs by hand: the
 * only "parkour" aboard, and the reason the bench feels like a place you go
 * rather than a menu you open.
 *
 *   deck A   cryo bay | workshop | spine | bridge
 *   deck B                        [research deck]
 *
 * Every station is still reachable with the starting kit - the bench cannot be
 * behind a build you would need the bench to afford - but the climb is a real
 * climb, three jumps tall, and the hull reads as a ship instead of a corridor.
 */
export const SHIP = {
  id: "ship",
  name: "Horizon-04 · Expedition Carrier",
  theme: "metal",
  interior: true,
  w: 96,
  h: 23,
  music: "hub",
  objective: "Work the stations in each compartment, climb the spine to the research bench, then choose a world at navigation",
  solids: [
    [0, 20, 96, 3],            // 1,536px expedition deck (over twice the old ship)
    [0, 0, 2, 23],             // bow
    [94, 0, 2, 23],            // stern
    [0, 0, 96, 2],             // outer hull
    [0, 3, 96, 3],             // inner hull / roof of the research deck
    // bulkheads: they stop short of the research deck so the catwalk runs over
    // the top of them, and they leave a two-tile doorway at the deck below
    [12, 14, 1, 4],
    [24, 14, 1, 4],
    [32, 14, 1, 4],
    [40, 14, 1, 4],
    // the research deck itself: the floor the bench stands on
    [33, 13, 15, 1],
    // New habitable compartments and raised engineering/observation decks.
    [49, 12, 1, 6],
    [63, 12, 1, 6],
    [78, 12, 1, 6],
    [85, 14, 9, 1],
  ],
  platforms: [
    // the spine: three rungs zig-zagging up the open well between the workshop
    // and the bridge, then out onto the research deck. Every step is a two-tile
    // climb, so the starting kit can make the trip and the trip still costs you
    // three real jumps - the only parkour aboard.
    [26, 18, 4],
    [29, 16, 4],
    [29, 14, 4],
    [54, 17, 5], [58, 15, 5], [65, 13, 10],
    [80, 18, 4], [82, 16, 4],
  ],
  decor: [
    { t: "vent", x: 6, y: 19 }, { t: "vent", x: 19, y: 19 },
    { t: "vent", x: 37, y: 19 }, { t: "rune", x: 29, y: 18 },
    { t: "rock", x: 16, y: 19 },
    // the escape pod, parked in the aft bay where it belongs
    { t: "pod", x: 42, y: 19 },
    { t: "vent", x: 52, y: 19 }, { t: "vent", x: 60, y: 19 },
    { t: "vent", x: 70, y: 19 }, { t: "vent", x: 88, y: 13 },
  ],
  entities: [
    ...TRANSMISSIONS.filter((e) => e.world === 'ship').map((e) => ({ t: 'transmission', ...e })),
    // cryo bay, at the bow: the pod the pilot woke in, and the loop that keeps
    // it cold, side by side. The recorder sits with them.
    { t: "beacon", x: 3, y: 19 },
    { t: "relay", x: 5, y: 19, role: "pod", label: "CRYO POD" },
    { t: "relay", x: 8, y: 19, role: "cryo", label: "CRYO CHAMBER" },
    { t: "relay", x: 10, y: 19, role: "save", label: "FLIGHT RECORDER" },
    // workshop: the framing and the cooking
    { t: "relay", x: 15, y: 19, role: "repair", label: "FABRICATOR" },
    { t: "relay", x: 21, y: 19, role: "bio", label: "GALLEY" },
    // research deck, above the bridge: the bench everything gets built at
    { t: "relay", x: 36, y: 12, role: "lab", label: "RESEARCH BENCH" },
    // bridge: navigation and the pod bay
    { t: "relay", x: 38, y: 19, role: "console", label: "NAVIGATION" },
  ],
  start: { x: 4, y: 18 },
  intro: [
    { name: "LOG 001", text: "Cryo-sleep interrupted. The pane on the pod is cracked. Hull breach logged forty hours ago, and the crew did not wake." },
    { name: "LOG 002", text: "Position: 142,000,000 light-years from Earth, on an uncharted world the charts call nothing at all." },
    { name: "BRIEF", text: "The lander is not going anywhere: it is stuck here for good. What flies now is the escape pod in the aft bay - one seat, three worlds in range." },
    { name: "BRIEF", text: "Horizon-04 is an expedition carrier. Cryo and the workshop are forward. Research is up the spine; navigation is below it. Beyond the launch bay: crew quarters, the reactor gallery, and a raised observation deck. There may still be transmissions worth recovering." },
    { name: "BRIEF", text: "Each world carries fuel, and each carries one raw material this wreck can be rebuilt from. The pod brings it back; the FABRICATOR, the CRYO CHAMBER and the GALLEY bolt it on." },
    { name: "BRIEF", text: "Anything else you need down there gets built at the RESEARCH BENCH - up the spine ladder, on the deck over the bridge. Bring it material and it prints the kit; the impulse boot is what lets the pod reach the glacier at all." },
  ],
};

/* --------------------------------------------------- mission 1: stealth -- */
export const M1 = {
  id: "m1",
  name: "Exxos - Organics World",
  theme: "jungle",
  w: 150,
  h: 23,
  music: "jungle",
  objective: "Take 3 fuel cells and 3 nutrient pods to the far beacon",
  sub: "Vent gardens, tall grass, and creepers that feel your footsteps",
  solids: [
    [0, GROUND, 40, 3],
    [44, GROUND, 26, 3],
    [74, GROUND, 30, 3],
    [110, GROUND, 40, 3],
    [0, 0, 2, 23],
    [148, 0, 2, 23],
    // a sealed cache room off the last stretch, past the exit beacon. The cold
    // plate is the only key to it, which is why it holds material and not fuel.
    [144, 13, 1, 6],
  ],
  water: [
    [40, 21, 4, 2],
    [70, 21, 4, 2],
    [104, 21, 6, 2],
  ],
  platforms: [
    [8, 17, 4], [13, 15, 3], [18, 13, 4],
    [24, 17, 5], [30, 15, 3],
    [46, 17, 5], [52, 15, 3], [58, 17, 4],
    [78, 17, 5], [84, 15, 3],
    [92, 17, 6],
    [112, 17, 5], [118, 15, 4], [124, 17, 4],
    [132, 17, 6],
  ],
  decor: [
    // the escape pod, parked where it set down: the lander never comes here
    { t: "pod", x: 1, y: 19 },
    { t: "tuft", x: 5, y: 19 }, { t: "tuft", x: 9, y: 19 }, { t: "tuft", x: 11, y: 19 },
    { t: "tuft", x: 16, y: 19 }, { t: "tuft", x: 21, y: 19 }, { t: "tuft", x: 26, y: 19 },
    { t: "tuft", x: 28, y: 19 }, { t: "tuft", x: 34, y: 19 }, { t: "tuft", x: 37, y: 19 },
    { t: "tuft", x: 47, y: 19 }, { t: "tuft", x: 50, y: 19 }, { t: "tuft", x: 56, y: 19 },
    { t: "tuft", x: 64, y: 19 }, { t: "tuft", x: 66, y: 19 }, { t: "tuft", x: 80, y: 19 },
    { t: "tuft", x: 82, y: 19 }, { t: "tuft", x: 88, y: 19 }, { t: "tuft", x: 90, y: 19 },
    { t: "tuft", x: 96, y: 19 }, { t: "tuft", x: 99, y: 19 }, { t: "tuft", x: 114, y: 19 },
    { t: "tuft", x: 117, y: 19 }, { t: "tuft", x: 121, y: 19 }, { t: "tuft", x: 126, y: 19 },
    { t: "tuft", x: 129, y: 19 }, { t: "tuft", x: 136, y: 19 }, { t: "tuft", x: 140, y: 19 },
    { t: "plant", x: 3, y: 19 }, { t: "plant", x: 14, y: 19 }, { t: "plant", x: 23, y: 19 },
    { t: "plant", x: 31, y: 19 }, { t: "plant", x: 49, y: 19 }, { t: "plant", x: 57, y: 19 },
    { t: "plant", x: 63, y: 19 }, { t: "plant", x: 79, y: 19 }, { t: "plant", x: 89, y: 19 },
    { t: "plant", x: 97, y: 19 }, { t: "plant", x: 113, y: 19 }, { t: "plant", x: 123, y: 19 },
    { t: "plant", x: 131, y: 19 }, { t: "plant", x: 139, y: 19 },
    { t: "rock", x: 7, y: 19 }, { t: "rock", x: 21, y: 19 }, { t: "rock", x: 33, y: 19 },
    { t: "rock", x: 45, y: 19 }, { t: "rock", x: 55, y: 19 }, { t: "rock", x: 61, y: 19 },
    { t: "rock", x: 77, y: 19 }, { t: "rock", x: 87, y: 19 }, { t: "rock", x: 95, y: 19 },
    { t: "rock", x: 111, y: 19 }, { t: "rock", x: 127, y: 19 }, { t: "rock", x: 137, y: 19 },
  ],
  entities: [
    ...TRANSMISSIONS.filter((e) => e.world === 'm1').map((e) => ({ t: 'transmission', ...e })),
    { t: "beacon", x: 6, y: 19 },
    { t: "beacon", x: 143, y: 19, exit: true },
    { t: "creeper", x: 18, y: 18, range: 4, dir: -1, vision: 120, hearing: 110 },
    { t: "creeper", x: 26, y: 18, range: 5, dir: 1, vision: 130, hearing: 120 },
    { t: "creeper", x: 50, y: 18, range: 4, dir: -1, vision: 140, hearing: 130 },
    { t: "creeper", x: 82, y: 18, range: 6, dir: 1, vision: 140, hearing: 140 },
    { t: "creeper", x: 96, y: 18, range: 4, dir: -1, vision: 130, hearing: 120 },
    { t: "creeper", x: 126, y: 18, range: 5, dir: 1, vision: 140, hearing: 130 },
    { t: "bird", x: 36, y: 13, range: 7, vision: 150 },
    { t: "pickup", x: 19, y: 12, type: "fuel" },
    { t: "pickup", x: 53, y: 13, type: "fuel" },
    { t: "pickup", x: 123, y: 15, type: "fuel" },
    // nutrient pods grow on the vents: one in the open, one high, one sealed
    { t: "pickup", x: 24, y: 19, type: "biomass" },
    { t: "pickup", x: 85, y: 13, type: "biomass" },
    { t: "processor", x: 33, y: 19, kind: "purify", material: "biomass", label: "FILTRATION RIG" },
    { t: "block", x: 55, y: 18 },
    { t: "plate", x: 58, y: 19, group: 4 },
    { t: "door", x: 64, y: 17, h: 3, group: 4 },
    { t: "pickup", x: 66, y: 19, type: "biomass" },
    // vent pitchers: the organics world's own hazard, and the reason the cryo
    // projector exists. They sit in the grass on the way to the rig and the pod.
    { t: "plant", x: 30, y: 19, reach: 24 },
    { t: "plant", x: 38, y: 19, reach: 24 },
    { t: "plant", x: 47, y: 19, reach: 28 },
    { t: "plant", x: 71, y: 19, reach: 26 },
    { t: "plant", x: 79, y: 19, reach: 26 },
    { t: "plant", x: 100, y: 19, reach: 28 },
    { t: "plant", x: 116, y: 19, reach: 26 },
    { t: "plant", x: 133, y: 19, reach: 26 },
    // the cold seal: freeze a creeper while it is lying over the plate and
    // the cache past the beacon opens. Nothing on the path to the exit depends
    // on it - the cryo projector is the key, and that is a build.
    { t: "plate", x: 140, y: 19, group: 5, wants: "frozen" },
    { t: "door", x: 144, y: 18, h: 2, group: 5 },
    { t: "creeper", x: 137, y: 18, range: 4, dir: 1, vision: 130, hearing: 120 },
    { t: "seam", x: 145, y: 19, material: "biomass", amount: 3, label: "VENT SEAM" },
    // deep seams: the extractor rig at the research bench is what opens these
    { t: "seam", x: 67, y: 19, material: "biomass", amount: 3, label: "ROOT SEAM" },
    { t: "seam", x: 19, y: 12, material: "biomass", amount: 2, label: "CANOPY SEAM" },
  ],
  start: { x: 4, y: 18 },
  intro: [
    { name: "BRIEF", text: "Exxos - breathable air, aggressive flora and fauna. The creepers feel footsteps through the soil and fold whatever they reach under the roots; the birds hunt by sight from above. There is nothing aboard this ship that can answer either of them." },
    { name: "BRIEF", text: "Sneaking (hold DOWN) keeps you quiet. Tall grass hides you completely, if you stay still inside it. If one reaches you, the descent restarts at your last beacon." },
    { name: "BRIEF", text: "Three fuel cells are scattered here, and the vent gardens are covered in nutrient pods - the bio reactor aboard the ship runs on them once the FILTRATION RIG has cleaned them." },
    { name: "BRIEF", text: "One pod is sealed behind a ridge of old growth. Push the boulder onto the plate to open it." },
    { name: "BRIEF", text: "Raw material also hides in deep seams - solid rock to a hand. The EXTRACTOR RIG built at the research bench bites through them: stand on the seam and hold USE." },
    { name: "BRIEF", text: "The frost-blue plate beyond the exit only responds to something frozen. Let a creeper crawl far enough to lie over it, then use the cryo projector to open the optional seam cache." },
    { name: "BRIEF", text: "Watch the ground: the vent pitchers sit flush with it until something warm walks over them, and then they take it under. The cryo projector freezes one solid." },
  ],
};

/* --------------------------------------------- mission 2: world of regrets */
export const M2 = {
  id: "m2",
  name: "The World of Regrets",
  theme: "ruins",
  w: 120,
  h: 23,
  music: "ruins",
  objective: "Open the sealed galleries, carry Moria's soul home, and smelt 3 lots of rare earth",
  sub: "An abandoned dig site, three flooded channels, and Moria - this is NOT a fight",
  solids: [
    [0, GROUND, 36, 3],
    [40, GROUND, 40, 3],
    // the basin has opened up into three channels: two you can jump, and one
    // right before Moria that has to be stepped over carefully
    [84, GROUND, 20, 3],
    [108, GROUND, 12, 3],
    [0, 0, 2, 23],
    [118, 0, 2, 23],
    [25, 15, 11, 1],          // low gallery roof: the double seal cannot be hopped
    [65, 13, 12, 1],          // timed gallery roof
  ],
  water: [
    [36, 21, 4, 2],
    [80, 21, 4, 2],
    [104, 21, 4, 2],
  ],
  platforms: [
    [30, 17, 4],
    [44, 17, 5],
    [52, 15, 4],
    [66, 17, 4],
    [72, 17, 4],
    [88, 17, 5],
    [94, 15, 4],
    [102, 17, 5],
    // the tower: the last cell sits four tiles above the ledge below it, which
    // is one tile too many for a single jump - the bought double jump is the key
    [52, 11, 3],
  ],
  decor: [
    { t: "pod", x: 0, y: 19 },
    { t: "rune", x: 4, y: 18 }, { t: "rune", x: 12, y: 18 }, { t: "rune", x: 20, y: 18 },
    { t: "rune", x: 46, y: 18 }, { t: "rune", x: 56, y: 18 }, { t: "rune", x: 70, y: 18 },
    { t: "rune", x: 86, y: 18 }, { t: "rune", x: 100, y: 18 }, { t: "rune", x: 112, y: 18 },
    { t: "rock", x: 8, y: 19 }, { t: "rock", x: 22, y: 19 }, { t: "rock", x: 42, y: 19 },
    { t: "rock", x: 62, y: 19 }, { t: "rock", x: 90, y: 19 }, { t: "rock", x: 106, y: 19 },
    { t: "crystal", x: 26, y: 19 }, { t: "crystal", x: 50, y: 19 }, { t: "crystal", x: 74, y: 19 },
    { t: "crystal", x: 96, y: 19 }, { t: "crystal", x: 116, y: 19 },
  ],
  entities: [
    ...TRANSMISSIONS.filter((e) => e.world === 'm2').map((e) => ({ t: 'transmission', ...e })),
    { t: "beacon", x: 4, y: 19 },
    { t: "beacon", x: 116, y: 19, exit: true },
    // puzzle A
    { t: "plate", x: 16, y: 19, group: 1 },
    { t: "block", x: 12, y: 18 },
    { t: "door", x: 24, y: 17, h: 3, group: 1 },
    // puzzle B
    { t: "plate", x: 52, y: 19, group: 2 },
    { t: "block", x: 48, y: 18 },
    { t: "door", x: 60, y: 17, h: 3, group: 2 },
    // puzzle C
    { t: "plate", x: 88, y: 19, group: 3 },
    { t: "block", x: 84, y: 18 },
    { t: "door", x: 96, y: 17, h: 3, group: 3 },
    // puzzle D: a double seal. Two plates, two crates, one door - and the
    // seal only lifts while both plates are held at the same time.
    { t: "plate", x: 29, y: 19, group: 6 },
    { t: "plate", x: 33, y: 19, group: 6 },
    { t: "block", x: 26, y: 18 },
    { t: "block", x: 31, y: 18 },
    { t: "door", x: 35, y: 16, h: 4, group: 6, needs: 2 },
    // puzzle E: a gate on a clock. The plate holds the seal open for three
    // seconds after you step off it, so the run to the door is part of the
    // puzzle. Carry the soul through before the countdown runs out.
    { t: "plate", x: 66, y: 19, group: 7, solo: true },
    { t: "door", x: 76, y: 14, h: 6, group: 7, hold: 3 },
    { t: "orb", x: 70, y: 18 },
    { t: "moria", x: 108, y: 19 },
    // gated: the one cell the starting kit cannot reach
    // rare earth: one in the open, one behind a seal, one Moria is keeping
    { t: "pickup", x: 9, y: 19, type: "ore" },
    { t: "pickup", x: 62, y: 19, type: "ore" },
    { t: "pickup", x: 112, y: 19, type: "ore", locked: true },
    // rare earth still in the rock: the extractor rig opens these, and there is
    // more here than in the loose seams, which is the point of building it
    { t: "seam", x: 34, y: 19, material: "ore", amount: 3, label: "DEEP SEAM" },
    { t: "seam", x: 74, y: 19, material: "ore", amount: 3, label: "GALLERY SEAM" },
    { t: "seam", x: 102, y: 19, material: "ore", amount: 2, label: "CIST SEAM" },
    { t: "processor", x: 42, y: 19, kind: "smelt", material: "ore", label: "INDUCTION SMELTER" },
    { t: "pickup", x: 53, y: 9, type: "fuel", gate: "doubleJump" },
    { t: "pickup", x: 92, y: 14, type: "fuel" },
    { t: "pickup", x: 110, y: 18, type: "fuel", locked: true },
    { t: "pickup", x: 114, y: 18, type: "fuel", locked: true },
  ],
  start: { x: 3, y: 18 },
  intro: [
    { name: "BRIEF", text: "The World of Regrets: an old dig, picked clean by whoever was here before you. No hostile life. One native, Moria, and Moria is broken." },
    { name: "BRIEF", text: "He tore his own soul out of his body. Push the rune blocks onto the plates to open the seals - one gallery here needs two plates held at the same time, and another gate only stays open for three seconds after you step off its plate." },
    { name: "BRIEF", text: "The hull plating your ship needs is rare earth, and the ore is still in the ground. The INDUCTION SMELTER is west; it will fire alloy plate out of it." },
    { name: "BRIEF", text: "One seam of ore is behind a sealed door and one is in Moria's keeping. Carry his soul home and he will tell you what that costs." },
    { name: "BRIEF", text: "The eastern tower is taller than one jump, and the impulse boot is what clears it. Build it at the research bench out of what you smelt here and what the pod can fetch from Exxos - the bench lists the exact price." },
  ],
  onFuse: [
    { name: "MORIA", text: "...you brought it back. All this time I thought the regret was leaving. It was staying." },
    { name: "MORIA", text: "The fuel you need is in my chest cavity. Take it. Take the part too - your pod is cracked." },
    { name: "MORIA", text: "My people needed that fuel to live. I am telling you now, because you should know what you carry." },
  ],
};

/* ------------------------------- mission 3: world 3 (filled in by me) ----- */
export const M3 = {
  id: "m3",
  name: "The Hollow Signal - Glacier",
  theme: "ice",
  w: 140,
  h: 23,
  music: "storm",
  objective: "Light the relays, gather 3 fuel cells and 3 cryo crystals, and melt them at the crucible",
  sub: "A glacier world whose power grid died with its people, under a storm that never stopped",
  solids: [
    [0, GROUND, 34, 3],
    [38, GROUND, 30, 3],
    [72, GROUND, 26, 3],
    [102, GROUND, 38, 3],
    [0, 0, 2, 23],
    [138, 0, 2, 23],
  ],
  water: [
    [34, 21, 4, 2],
    [68, 21, 4, 2],
    [98, 21, 4, 2],
  ],
  platforms: [
    [8, 17, 4], [14, 15, 3], [20, 17, 5],
    [42, 17, 5], [48, 15, 4], [54, 17, 5], [62, 17, 4],
    [76, 17, 5], [83, 15, 4], [90, 17, 5],
    [104, 17, 5], [110, 15, 4], [118, 17, 6], [126, 17, 5],
  ],
  decor: [
    { t: "podOpen", x: 0, y: 19 },
    { t: "crystal", x: 10, y: 19 }, { t: "crystal", x: 18, y: 19 }, { t: "crystal", x: 30, y: 19 },
    { t: "crystal", x: 44, y: 19 }, { t: "crystal", x: 58, y: 19 }, { t: "crystal", x: 78, y: 19 },
    { t: "crystal", x: 92, y: 19 }, { t: "crystal", x: 108, y: 19 }, { t: "crystal", x: 124, y: 19 },
    { t: "crystal", x: 134, y: 19 },
    { t: "rock", x: 6, y: 19 }, { t: "rock", x: 26, y: 19 }, { t: "rock", x: 50, y: 19 },
    { t: "rock", x: 66, y: 19 }, { t: "rock", x: 86, y: 19 }, { t: "rock", x: 106, y: 19 },
    { t: "rock", x: 130, y: 19 },
  ],
  entities: [
    ...TRANSMISSIONS.filter((e) => e.world === 'm3').map((e) => ({ t: 'transmission', ...e })),
    { t: "beacon", x: 4, y: 19 },
    { t: "beacon", x: 136, y: 19, exit: true },
    { t: "relay", x: 8, y: 19, role: "charger", label: "EMBER" },
    { t: "relay", x: 26, y: 19, role: "relay", group: 1, label: "RELAY A" },
    { t: "relay", x: 52, y: 19, role: "charger", label: "EMBER" },
    { t: "relay", x: 64, y: 19, role: "relay", group: 2, label: "RELAY B" },
    { t: "door", x: 34, y: 19, w: 4, h: 1, group: 1, source: "relay", invert: true },
    { t: "door", x: 68, y: 19, w: 4, h: 1, group: 2, source: "relay", invert: true },
    { t: "door", x: 90, y: 16, h: 4, group: 2, source: "relay" },
    { t: "bird", x: 44, y: 13, range: 6, vision: 150 },
    { t: "bird", x: 78, y: 12, range: 5, vision: 150 },
    { t: "bird", x: 112, y: 13, range: 6, vision: 155 },
    { t: "platform", x: 121, y: 18, tx: 121, ty: 12, len: 2, speed: 0.5 },
    { t: "pickup", x: 21, y: 16, type: "fuel" },
    { t: "pickup", x: 84, y: 14, type: "fuel" },
    { t: "pickup", x: 121, y: 12, type: "fuel" },
    // cryo crystal: one off the shelf ice, one across the melt, one behind the
    // bridge that only the third relay can lift
    { t: "pickup", x: 12, y: 19, type: "crystal" },
    { t: "pickup", x: 76, y: 19, type: "crystal" },
    { t: "processor", x: 30, y: 19, kind: "melt", material: "crystal", label: "THERMAL CRUCIBLE" },
    { t: "relay", x: 84, y: 19, role: "charger", label: "EMBER" },
    { t: "relay", x: 88, y: 19, role: "relay", group: 3, label: "RELAY C" },
    { t: "door", x: 114, y: 17, h: 3, group: 3, source: "relay" },
    { t: "pickup", x: 118, y: 19, type: "crystal" },
    // crystal still in the shelf ice, for the extractor rig
    { t: "seam", x: 40, y: 19, material: "crystal", amount: 2, label: "SHELF SEAM" },
    { t: "seam", x: 96, y: 19, material: "crystal", amount: 2, label: "MELT SEAM" },
  ],
  start: { x: 3, y: 18 },
  wind: true,
  intro: [
    { name: "BRIEF", text: "Unnamed on every chart - the Hollow Signal, on a glacier that has not thawed in a century. Its power grid died and the storms moved in." },
    { name: "BRIEF", text: "Carry an ember charge (USE) to a relay and the dormant bridges wake. Winds will shove you - lean into them." },
    { name: "BRIEF", text: "Three birds still ride the thermals over the ice, hunting anything that moves against the white." },
    { name: "BRIEF", text: "The cryo crystals the pod needs are in the ice. Cut three, then hold the THERMAL CRUCIBLE in its band until they run." },
  ],
  onComplete: [
    { name: "BRIEF", text: "Last fuel cell recovered. The people here left their machines running for a rescue that never came." },
    { name: "BRIEF", text: "Three worlds have been emptied for one ship. Log it and bring it home." },
  ],
};

export const MISSIONS = [M1, M2, M3];
export const ALL_LEVELS = [TUTORIAL, SHIP, M1, M2, M3];
/** The old id for the ship interior, kept so older saves and links still work. */
export const HUB = SHIP;

export function levelById(id) {
  return ALL_LEVELS.find((l) => l.id === id) || (id === "hub" ? SHIP : undefined);
}
