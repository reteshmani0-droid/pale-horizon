/**
 * The pilot is drawn in six sets: EVA shell and flight suit, each in the three
 * shell colours the Options screen offers (p / pB / pC and c / cB / cC).
 */
const PILOT_FRAMES = ["idle0", "idle1", "walk0", "walk1", "walk2", "walk3", "jump", "sneak"];
const PILOT_SETS = ["p", "pB", "pC", "c", "cB", "cC"];
const PILOT_FILES = PILOT_SETS.flatMap((set) => PILOT_FRAMES.map((f) => `${set}_${f}`));

const FILES = [
  "tile_grass", "tile_dirt", "tile_stone", "tile_metal", "tile_platform",
  "tile_grass_platform", "tile_water", "tile_water_deep", "tile_crystal",
  "tile_ancient", "tile_ancient_rune", "tile_vent", "tile_grass_tuft",
  "tile_plate", "tile_plate_on", "spr_rock", "spr_plant", "spr_crystal",
  // the pilot: EVA shell on the surface, flight suit aboard the ship
  ...PILOT_FILES,
  "cr_walk0", "cr_walk1", "cr_walk2", "cr_walk3", "cr_snap",
  "b_fly0", "b_fly1", "b_swoop",
  "spr_moria", "spr_orb", "spr_shard", "spr_fuel", "spr_part",
  "spr_block", "spr_door", "spr_beacon", "spr_beacon_on",
  "spr_ship", "spr_ship_fly", "spr_seam", "spr_transmission",
  ...['jungle', 'ruins', 'ice', 'metal', 'space'].flatMap((theme) => ['sky', 'far', 'near'].map((layer) => `bg_${theme}_${layer}`)), "spr_ast_s", "spr_ast_m", "spr_ast_l",
  // ship fittings
  "spr_cryo_pod", "spr_nav_console", "spr_terminal", "spr_cryo_tank",
  "spr_galley", "spr_fabricator", "spr_crate", "spr_lab",
  "spr_pod", "spr_pod_open", "spr_plant_guard", "spr_plant_guard_open",
  // field processors and what they eat and make
  "spr_proc_purify", "spr_proc_smelt", "spr_proc_melt",
  "spr_biomass", "spr_ore", "spr_cryo", "spr_ration", "spr_plate", "spr_coolant",
  "ui_alert", "ui_fuel", "ui_shard", "ui_part",
  "ui_biomass", "ui_ore", "ui_cryo", "ui_ration", "ui_plate", "ui_coolant",
];

export const IMG = {};

export function loadAssets(onProgress) {
  let done = 0;
  return Promise.all(
    FILES.map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            IMG[name] = img;
            done += 1;
            if (onProgress) onProgress(done / FILES.length);
            resolve();
          };
          img.src = `assets/${name}.png`;
        })
    )
  );
}

/** Bake a horizontally flipped copy for left-facing sprites. */
export function flip(name) {
  if (IMG[name + "_flip"]) return IMG[name + "_flip"];
  const src = IMG[name];
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d");
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0);
  IMG[name + "_flip"] = c;
  return c;
}
