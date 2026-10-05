/**
 * Audio: a small WebAudio studio.
 *  - mixer with separate master / music / sfx / ambience buses
 *  - music is scheduled ahead of the audio clock (no setInterval drift) and has
 *    a calm layer plus an "alert" layer for when the wildlife starts looking
 *  - each world gets a procedural ambience bed (insects, drips, thunder, hum)
 *  - every sound in the game is synthesised: there are no audio files
 */

const state = {
  ctx: null,
  master: null,
  musicBus: null,
  sfxBus: null,
  ambBus: null,
  vols: { master: 0.9, music: 0.5, sfx: 0.8, ambience: 0.6 },
  muted: false,
};

/** Browsers start an AudioContext suspended until the first real gesture. */
export function resumeAudio() {
  if (state.ctx && state.ctx.state === "suspended") {
    state.ctx.resume().catch(() => {});
  }
  return state.ctx ? state.ctx.state : "none";
}

export function initAudio() {
  if (state.ctx) return state.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  state.ctx = ctx;
  const unlock = () => resumeAudio();
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  state.master = ctx.createGain();
  state.master.gain.value = state.muted ? 0 : state.vols.master;
  state.master.connect(ctx.destination);
  state.musicBus = ctx.createGain();
  state.musicBus.gain.value = state.vols.music;
  state.musicBus.connect(state.master);
  state.sfxBus = ctx.createGain();
  state.sfxBus.gain.value = state.vols.sfx;
  state.sfxBus.connect(state.master);
  state.ambBus = ctx.createGain();
  state.ambBus.gain.value = state.vols.ambience;
  state.ambBus.connect(state.master);
  return ctx;
}

export function isMuted() {
  return state.muted;
}

export function setMuted(muted) {
  state.muted = muted;
  if (state.master) state.master.gain.value = muted ? 0 : state.vols.master;
  return muted;
}

export function toggleMute() {
  return setMuted(!state.muted);
}

/** kind: master | music | sfx | ambience */
export function setVolume(kind, value) {
  if (!(kind in state.vols)) return;
  state.vols[kind] = Math.max(0, Math.min(1, value));
  const bus = { master: state.master, music: state.musicBus, sfx: state.sfxBus, ambience: state.ambBus }[kind];
  if (bus && kind !== "master") bus.gain.value = state.vols[kind];
  if (bus && kind === "master") bus.gain.value = state.muted ? 0 : state.vols.master;
}

export function getVolumes() {
  return { ...state.vols };
}

/* ------------------------------------------------------------------ synth -- */
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function tone(freq, dur, type = "square", vol = 0.16, slide = 0, when = 0, bus = null) {
  const ctx = state.ctx;
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(bus || state.sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noiseBurst(dur, vol = 0.12, freq = 900, q = 1, when = 0, type = "bandpass") {
  const ctx = state.ctx;
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(state.sfxBus);
  src.start(t0);
}

const jitter = (v) => v * (0.96 + Math.random() * 0.08);

/** The whole sound bank. */
export function sfx(name, opt = {}) {
  if (!state.ctx || state.muted) return;
  const v = opt.vol ?? 1;
  switch (name) {
    case "launch": noiseBurst(1.8, .18 * v, 240, .5, 0, "lowpass"); tone(70, 1.8, "sawtooth", .08 * v, 160); break;
    case "fold": tone(180, 1.2, "sine", .15 * v, 1000); noiseBurst(.8, .08 * v, 1800); break;
    case "jump": tone(jitter(300), 0.13, "square", 0.15 * v, 240); break;
    case "walljump": tone(jitter(360), 0.12, "square", 0.15 * v, 180); noiseBurst(0.06, 0.08, 1400); break;
    case "dash": noiseBurst(0.18, 0.13 * v, 700, 0.8); tone(520, 0.1, "sawtooth", 0.1 * v, -260); break;
    case "wallslide": noiseBurst(0.05, 0.05 * v, 2400, 2); break;
    case "land": noiseBurst(0.08, 0.1 * v, 500); break;
    case "step_grass": noiseBurst(0.045, 0.05 * v, 700, 1.2); break;
    case "step_stone": noiseBurst(0.04, 0.055 * v, 1500, 2); break;
    case "step_metal": noiseBurst(0.05, 0.05 * v, 2200, 3); tone(220, 0.04, "square", 0.03 * v); break;
    case "hurt":
      tone(220, 0.22, "sawtooth", 0.2 * v, -140);
      noiseBurst(0.16, 0.14 * v, 400);
      break;
    case "downed": [0, -2, -5, -9].forEach((n, i) => tone(midi(60 + n), 0.35, "square", 0.15 * v, 0, i * 0.13)); break;
    case "heal": [0, 4, 7].forEach((n, i) => tone(midi(69 + n), 0.3, "triangle", 0.13 * v, 0, i * 0.09)); break;
    case "bench":
      [64, 69, 76, 81].forEach((n, i) => tone(midi(n), 0.5, "triangle", 0.12 * v, 0, i * 0.12));
      break;
    case "checkpoint": tone(520, 0.12, "triangle", 0.14 * v, 90); tone(880, 0.22, "triangle", 0.12 * v, 60, 0.1); break;
    case "pickup": tone(880, 0.08, "square", 0.14 * v, 240); tone(1320, 0.1, "square", 0.12 * v, 0, 0.07); break;
    case "fuel": tone(520, 0.09, "triangle", 0.18 * v, 180); tone(780, 0.12, "triangle", 0.15 * v, 120, 0.08); break;
    case "part": tone(660, 0.1, "sawtooth", 0.13 * v, 100); tone(990, 0.16, "sawtooth", 0.11 * v, 60, 0.09); break;
    case "plate": tone(190, 0.2, "square", 0.17 * v, 120); noiseBurst(0.1, 0.07 * v, 300); break;
    case "door": tone(140, 0.4, "sawtooth", 0.13 * v, 80); noiseBurst(0.3, 0.07 * v, 200); break;
    case "relay": tone(440, 0.45, "triangle", 0.16 * v, 520); tone(660, 0.5, "sine", 0.1 * v, 200, 0.1); break;
    case "charger": tone(330, 0.25, "triangle", 0.14 * v, 220); break;
    case "splash": noiseBurst(0.35, 0.16 * v, 600, 0.7); tone(300, 0.2, "sine", 0.08 * v, -180); break;
    case "alarm": tone(300, 0.2, "square", 0.18 * v, -80); tone(240, 0.28, "square", 0.16 * v, -60, 0.19); break;
    case "alertOff": tone(420, 0.18, "square", 0.1 * v, -160); break;
    case "caught": tone(170, 0.5, "sawtooth", 0.15 * v, -120); noiseBurst(0.3, 0.1 * v, 300); break;
    case "ui": tone(jitter(700), 0.05, "square", 0.08 * v); break;
    case "select": tone(500, 0.06, "square", 0.11 * v, 200); break;
    case "back": tone(400, 0.07, "square", 0.1 * v, -120); break;
    case "pause": tone(600, 0.08, "triangle", 0.1 * v, -200); break;
    case "unpause": tone(500, 0.08, "triangle", 0.1 * v, 260); break;
    case "unlock": [0, 5, 9, 12].forEach((n, i) => tone(midi(67 + n), 0.34, "triangle", 0.13 * v, 0, i * 0.1)); break;
    case "win": [0, 4, 7, 12, 16].forEach((n, i) => tone(midi(72 + n), 0.34, "triangle", 0.14 * v, 0, i * 0.13)); break;
    case "lose": [0, -3, -7].forEach((n, i) => tone(midi(60 + n), 0.3, "square", 0.13 * v, 0, i * 0.15)); break;
    case "shield": tone(900, 0.18, "square", 0.15 * v, -300); noiseBurst(0.2, 0.12 * v, 700); break;
    case "freeze": noiseBurst(0.34, 0.11 * v, 2600, 1.4); tone(1180, 0.3, "sine", 0.1 * v, 420); break;
    case "thunder": {
      const t = noiseBurst(1.1, 0.16, 180, 0.5);
      tone(60, 0.9, "sine", 0.12 * v, -20, 0.05);
      return t;
    }
    case "windgust": noiseBurst(0.9, 0.06 * v, 500, 0.6); break;
    case "sparkle": [0, 7, 14].forEach((n, i) => tone(midi(84 + n), 0.18, "sine", 0.07 * v, 0, i * 0.05)); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ music -- */
const THEMES = {
  menu: { bpm: 92, bass: [45, null, 45, null, 43, null, 43, null, 41, null, 41, null, 38, null, 38, null],
          lead: [69, 76, 72, 76, 67, 74, 71, 74, 65, 72, 69, 72, 62, 69, 66, 69], wave: "triangle", perc: true },
  hub: { bpm: 84, bass: [41, null, 48, null, 41, null, 48, null, 39, null, 46, null, 39, null, 46, null],
         lead: [69, 72, 76, 72, 69, 72, 76, 79, 67, 70, 74, 70, 67, 70, 74, 77], wave: "triangle", perc: false },
  jungle: { bpm: 108, bass: [40, 40, null, 40, 43, 43, null, 43, 38, 38, null, 38, 41, 41, null, 41],
            lead: [64, null, 67, 71, null, 74, null, 71, 62, null, 65, 69, null, 72, null, 69], wave: "square", perc: true },
  ruins: { bpm: 76, bass: [36, null, null, 41, null, null, 44, null, 36, null, null, 39, null, null, 43, null],
           lead: [60, 63, 67, 63, 62, 65, 69, 65, 60, 63, 67, 72, 71, 67, 63, 60], wave: "triangle", perc: false },
  storm: { bpm: 124, bass: [38, null, 38, 41, null, 38, null, 36, 38, null, 38, 43, null, 41, null, 38],
           lead: [74, 73, 71, 69, 71, 73, 74, 76, 74, 73, 71, 69, 67, 69, 71, 73], wave: "sawtooth", perc: true },
  space: { bpm: 132, bass: [33, 33, null, 33, 40, null, 33, null, 35, 35, null, 35, 42, null, 35, null],
           lead: [81, 79, 76, 79, 81, 84, 81, 79, 77, 76, 74, 76, 77, 81, 77, 76], wave: "square", perc: true },
};

const music = {
  name: null,
  theme: null,
  step: 0,
  nextTime: 0,
  timer: null,
  intensity: 0,
  ducked: false,
  baseGain: null,
};

function playStep(step, time) {
  const th = music.theme;
  if (!th) return;
  const bus = state.musicBus;
  const bass = th.bass[step % 16];
  const lead = th.lead[step % 16];
  const bar = Math.floor(step / 16) % 4;
  if (bass !== null && bass !== undefined) {
    tone(midi(bass - 12), 0.24, "triangle", bar === 0 ? 0.17 : 0.1, 0, time - state.ctx.currentTime, bus);
  }
  if (lead !== null && lead !== undefined) {
    tone(midi(lead), 0.17, th.wave, (music.intensity ? 0.075 : 0.06), 0, time - state.ctx.currentTime, bus);
  }
  if (music.intensity && th.perc) {
    // tension layer: a heartbeat kick on the beat and an off-beat tick
    if (step % 4 === 0) tone(midi(33), 0.16, "sine", 0.2, -8, time - state.ctx.currentTime, bus);
    if (step % 8 === 6) tone(midi(84), 0.06, "square", 0.05, 0, time - state.ctx.currentTime, bus);
  }
}

function scheduleMusic() {
  const th = music.theme;
  if (!th || !state.ctx) return;
  if (state.ctx.state !== "running") {
    resumeAudio();
    return;
  }
  const stepDur = 60 / th.bpm / 4;
  if (music.nextTime < state.ctx.currentTime) music.nextTime = state.ctx.currentTime + 0.05;
  while (music.nextTime < state.ctx.currentTime + 0.25) {
    playStep(music.step, music.nextTime);
    music.step += 1;
    music.nextTime += stepDur;
  }
}

export function startMusic(name) {
  if (!state.ctx || music.name === name) return;
  stopMusic();
  music.name = name;
  music.theme = THEMES[name] || THEMES.hub;
  music.step = 0;
  music.nextTime = state.ctx.currentTime + 0.06;
  music.timer = setInterval(scheduleMusic, 60);
}

export function stopMusic() {
  if (music.timer) clearInterval(music.timer);
  music.timer = null;
  music.name = null;
  music.theme = null;
  music.intensity = 0;
}

/** 0 = calm, 1 = something has noticed you. */
export function setMusicIntensity(level) {
  music.intensity = level ? 1 : 0;
}

export function duckMusic(on) {
  if (!state.musicBus || music.ducked === on) return;
  music.ducked = on;
  const target = on ? state.vols.music * 0.35 : state.vols.music;
  state.musicBus.gain.cancelScheduledValues(state.ctx.currentTime);
  state.musicBus.gain.linearRampToValueAtTime(target, state.ctx.currentTime + 0.25);
}

/* -------------------------------------------------------------- ambience -- */
const ambience = { name: null, timers: [], nodes: [], eventTimer: null };

function noiseBed(freq, gain, type = "lowpass") {
  const ctx = state.ctx;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02; // brownish, less hissy
    d[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(state.ambBus);
  src.start();
  ambience.nodes.push({ src, g });
  return g;
}

const AMB_FNS = {
  jungle() {
    noiseBed(700, 0.05);
    return () => {
      const roll = Math.random();
      if (roll < 0.5) {
        // insect chirr
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i += 1) {
          const f = 2600 + Math.random() * 1400;
          const t = i * 0.05;
          const o = state.ctx.createOscillator();
          const g = state.ctx.createGain();
          o.type = "square";
          o.frequency.value = f;
          g.gain.value = 0.02;
          g.gain.setValueAtTime(0.02, state.ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.0001, state.ctx.currentTime + t + 0.04);
          o.connect(g);
          g.connect(state.ambBus);
          o.start(state.ctx.currentTime + t);
          o.stop(state.ctx.currentTime + t + 0.05);
        }
      } else if (roll < 0.8) {
        // distant call: two falling tones
        tone(900 + Math.random() * 300, 0.22, "sine", 0.03, -320, 0, state.ambBus);
        tone(700 + Math.random() * 200, 0.3, "sine", 0.025, -180, 0.22, state.ambBus);
      } else {
        noiseBurst(0.25, 0.03, 3000, 3);
      }
    };
  },
  ruins() {
    noiseBed(280, 0.06);
    return () => {
      if (Math.random() < 0.6) {
        // water drip
        const f = 1200 + Math.random() * 900;
        tone(f, 0.1, "sine", 0.05, -600, 0, state.ambBus);
      } else {
        // far-off stone shift
        noiseBurst(0.5, 0.05, 140, 0.6);
      }
    };
  },
  storm() {
    noiseBed(420, 0.1);
    return () => {
      if (Math.random() < 0.35) {
        // thunder
        const t = state.ctx.currentTime + Math.random() * 0.4;
        const o = state.ctx.createOscillator();
        const g = state.ctx.createGain();
        o.type = "sine";
        o.frequency.value = 48 + Math.random() * 20;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        o.connect(g);
        g.connect(state.ambBus);
        o.start(t);
        o.stop(t + 1.4);
        noiseBurst(1.2, 0.09, 160, 0.5);
      } else {
        noiseBurst(0.7, 0.05, 640, 0.7);
      }
    };
  },
  hub() {
    noiseBed(180, 0.05);
    return () => {
      const roll = Math.random();
      if (roll < 0.4) tone(1800 + Math.random() * 600, 0.06, "square", 0.02, 0, 0, state.ambBus);
      else if (roll < 0.6) tone(320, 0.4, "sine", 0.03, -40, 0, state.ambBus);
      else noiseBurst(0.12, 0.02, 900, 2);
    };
  },
  space() {
    noiseBed(140, 0.04);
    return () => {
      if (Math.random() < 0.5) tone(1200, 0.5, "sine", 0.03, -900, 0, state.ambBus);
      else tone(180, 0.8, "triangle", 0.02, 20, 0, state.ambBus);
    };
  },
};

export function startAmbience(name) {
  if (!state.ctx || ambience.name === name) return;
  stopAmbience();
  const factory = AMB_FNS[name];
  if (!factory) return;
  ambience.name = name;
  const fire = factory();
  const loop = () => {
    if (ambience.name !== name) return;
    if (!state.muted && state.ctx.state === "running") fire();
    ambience.eventTimer = setTimeout(loop, 1200 + Math.random() * 3200);
  };
  ambience.eventTimer = setTimeout(loop, 800);
}

export function stopAmbience() {
  if (ambience.eventTimer) clearTimeout(ambience.eventTimer);
  ambience.eventTimer = null;
  for (const n of ambience.nodes) {
    try { n.src.stop(); n.src.disconnect(); n.g.disconnect(); } catch (e) { /* already gone */ }
  }
  ambience.nodes = [];
  ambience.name = null;
}

export function currentAmbience() {
  return ambience.name;
}
