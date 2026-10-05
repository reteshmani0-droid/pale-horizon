/**
 * Central tuning table. Nothing in here touches the DOM, so the node test
 * runner and the level validator can import it directly.
 */

export const TILE = 16;
/** Final canvas size in device pixels (the DOM canvas). */
export const VIEW_W = 640;
export const VIEW_H = 368;
/**
 * Camera zoom. The world is drawn into a VIEW_W/zoom x VIEW_H/zoom window and
 * then scaled up, so the character fills a readable chunk of the screen the way
 * a close-up 2D platformer does. Integer zoom keeps every pixel crisp.
 */
export const ZOOM = 2;
/** Logical (world-space) size of the visible window. */
export const CAM_W = VIEW_W / ZOOM;
export const CAM_H = VIEW_H / ZOOM;
/** One-way platforms only occupy the top of their tile. */
export const PLATFORM_H = 6;

/** Player tuning. Values are per 1/60s step so the feel is frame-rate independent. */
export const PHYSICS = {
  runSpeed: 2.45,
  sneakSpeed: 0.95,
  accelGround: 0.38,
  accelAir: 0.24,
  friction: 0.19,
  gravity: 0.55,
  maxFall: 9,
  jumpSpeed: 7.3,
  sneakJumpSpeed: 5.6,
  jumpReleaseCut: 0.45,
  coyoteFrames: 8,
  jumpBufferFrames: 8,
  dashSpeed: 6.4,
  dashFrames: 10,
  dashCooldownFrames: 32,
  airDashLimit: 1,
  wallSlideSpeed: 1.7,
  wallJumpX: 3.3,
  wallJumpY: 6.9,
  wallJumpLockFrames: 9,
  hitInvulnSeconds: 1.3,
  knockbackX: 3.1,
  knockbackY: 3.4,
};

export const PLAYER = {
  w: 14,
  h: 22,
  startMasks: 5,
};

/**
 * Difficulty tiers. `enemySpeed` / `vision` / `hearing` scale the stealth
 * challenge; `masks` is how many hits the suit absorbs before a downed respawn.
 */
export const DIFFICULTY = {
  explorer: {
    id: "explorer",
    name: "Explorer",
    blurb: "More suit integrity, slower wildlife, forgiving cones. Best for a first run or a demo.",
    masks: 6,
    enemySpeed: 0.75,
    vision: 0.8,
    hearing: 0.8,
    alertSeconds: 2.8,
    invuln: 1.8,
    waterDamage: 0,
    asteroidSpeed: 0.8,
    asteroidShields: 4,
    windStrength: 0.6,
    showConeAlways: true,
    hintCooldown: 6,
  },
  standard: {
    id: "standard",
    name: "Standard",
    blurb: "The intended balance: predators notice you, puzzles bite, fuel is earned.",
    masks: 5,
    enemySpeed: 1,
    vision: 1,
    hearing: 1,
    alertSeconds: 3.4,
    invuln: 1.3,
    waterDamage: 1,
    asteroidSpeed: 1,
    asteroidShields: 3,
    windStrength: 1,
    showConeAlways: true,
    hintCooldown: 10,
  },
  nightmare: {
    id: "nightmare",
    name: "Nightmare",
    blurb: "Three masks, wide cones, fast hunters, no room for a lazy jump. Do you have the guts?",
    masks: 3,
    enemySpeed: 1.28,
    vision: 1.22,
    hearing: 1.3,
    alertSeconds: 5.2,
    invuln: 0.9,
    waterDamage: 1,
    asteroidSpeed: 1.25,
    asteroidShields: 2,
    windStrength: 1.35,
    showConeAlways: true,
    hintCooldown: 16,
  },
};

export const DIFFICULTY_ORDER = ["explorer", "standard", "nightmare"];

export function difficultyOf(id) {
  return DIFFICULTY[id] || DIFFICULTY.standard;
}

/** Colour palette shared by the debug overlay and UI. */
export const UI_COLORS = {
  mask: "#f66060",
  maskEmpty: "#3a3550",
  alert: "#f2c65e",
  hidden: "#7ef47e",
  soul: "#b0e4ff",
};
