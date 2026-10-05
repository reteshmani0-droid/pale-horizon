# Pale Horizon

A browser-playable stealth-puzzle adventure built from the team's two design documents
(`video game design ideas.pdf` and `HS_-_Video_Game_Design.pdf` — the TSA Video Game Design event guide).

The game opens with the crash: the lander comes down out of orbit, the hull gives out, and you wake in a
cracked cryo pod inside the wreck. The navigation console is the first thing that works, and it says
142,000,000 light-years. Three worlds are in shuttle range, and everything needed to fly home has to come
off them.

- **E for Everyone** — there is no combat at all: no attack button, no weapons, no enemies that can be
  defeated. Enemies can only *catch* you, and being caught restarts the descent from your last beacon.
  Every challenge is stealth, movement or a puzzle.
- **Five playable places**: the lander interior (you start here, in a flight suit rather than an EVA
  suit), the Training Deck tutorial, the organics world of Exxos, the rare-earth dig on the World of
  Regrets, and the glacier named the Hollow Signal. Asteroid crossings are required legs on the
  Regrets and glacier routes, not an extra bonus mode.
- **Materials, not just fuel.** Each world hands you one raw material — nutrient pods, rare earth, cryo
  crystal — and a **field processor** you have to run a small puzzle on (purify / smelt / melt) before the
  ship can use it. Refined material is installed at the fabricator, the cryo tank and the galley.
- **Six recoverable transmissions and a field journal.** Antenna markers hold the lost crew's logs — read
  one and it is filed in the journal along with materials and per-world field notes. Open it with `J` or
  from the menu and the pause panel.
- **Three difficulty tiers** (Explorer / Standard / Nightmare) that change enemy speed and vision range,
  alert duration, water damage, wind strength and asteroid shields.
- **3+ minutes of play**, three full missions, and chapter select so judges can reach level 3 immediately.
- **Procedural audio** — WebAudio music per world, ambience beds and ~35 sound effects, all synthesised at
  runtime with a master/music/effects/ambience mixer. No audio files, nothing to download.
- Runs in any modern browser. No download, no executable, no plugin, no internet needed once hosted.

## Run it locally

```bash
# from the project root
python3 -m http.server 8123 --directory game
# then open http://localhost:8123/
```

Any static file server works (`npx serve game`, `php -S localhost:8123 -t game`, VS Code Live Server, …).
Opening `game/index.html` straight from the file system will **not** work, because the game uses ES modules.

## Host it (for the TSA submission link)

The whole game is static files in `game/` — drop that folder on any static host and the URL is your entry:

- **GitHub Pages**: push the repo, set Pages to serve the branch root, and link `…/game/`.
- **Netlify Drop / Cloudflare Pages**: drag the `game` folder onto the dashboard.
- **itch.io**: upload `game/` as an HTML game with `index.html` as the entry point.

### Vercel (the repo is already configured)

`vercel.json` sets `"outputDirectory": "game"`, so Vercel serves `game/` at the site root with no build step.

1. Push this repo to GitHub.
2. On <https://vercel.com>, sign in with GitHub and choose **Add New → Project → Import** the repo.
3. Framework Preset: **Other**. Build Command: leave empty (turn the Override on and clear it).
   Output Directory: `game` (already read from `vercel.json`). No environment variables are needed.
4. **Deploy.** The site gets a URL like `https://pale-horizon.vercel.app`.

**How updates work:** the live site only changes when a commit is **pushed** to the production branch
(`main`). Editing files locally — including edits made by an AI assistant — does **not** redeploy;
`git push` does, automatically, in about a minute. Pushes to other branches get their own preview
URLs. To deploy the local folder without Git, run `npx vercel --prod` from the project root instead.

## Controls

| Key | Action |
| --- | --- |
| `←` `→` / `A` `D` | run left / right |
| `SPACE` / `W` / `↑` | jump (hold for a higher jump) |
| `↓` / `S` | sneak — slower, quieter, and hides you inside tall grass |
| `Q` / `SHIFT` | dash — a burst of speed with a brief afterimage; one extra dash in mid-air |
| `←`+`SPACE` against a wall | wall-slide, then wall-jump to climb |
| `E` / `ENTER` | use beacons, relays, consoles, Moria |
| `TAB` / `ESC` | pause (objective, counted materials, journal, options, restart) |
| `J` | field journal — materials, recovered transmissions, field notes |
| `M` | mute |
| `F3` | debug overlay (fps, scene, masks, enemy alert state) |
| Bottom-right code reader | enter `admin` to open the developer deck; no F-key shortcut |

Touch buttons appear automatically on tablets and phones (left/right, sneak, DASH, CRYO, JUMP, USE), with LOG and PAUSE tools in the top corner.

## Difficulty

Pick a tier in **Difficulty & options**; it applies the next time a world loads.

| Tier | Enemies | Vision | Alert time | Water | Asteroid shields |
| --- | --- | --- | --- | --- | --- |
| **Explorer** | slower (×0.75) | shorter (×0.8) | 2.8 s | harmless | 4 |
| **Standard** | normal | normal | 3.4 s | knock back only | 3 |
| **Nightmare** | faster (×1.28) | longer (×1.22) | 5.2 s | costs suit integrity | 2 |

## Rules of the world

- **Predators** have a vision cone and hearing. Sneaking halves the distance at which they see you,
  and standing still inside tall grass makes you invisible to them.
- **Drones** ignore grass but cannot see through walls, floors or platforms.
- **Getting caught** ends the run instantly: the CAUGHT card goes up and the level rebuilds itself from
  the last beacon you lit. Nothing banked is lost — a catch costs you the attempt, not the save.
- **Beacons** set your checkpoint; the lamp-coloured light is the one you want.
- **Plates and rune blocks** open sealed doors on the World of Regrets (and one sealed grove on Exxos).
- **Ember charges and relays** raise bridges and open seals on the glacier.
- **Field processors** turn a world's raw material into something the ship can bolt on: a sweeping-needle
  filtration puzzle, a firing-order memory puzzle, and a heat-regulation puzzle.
- **Water** is a soft reset back to your last solid footing.

## Ship, puzzles and hidden codes

The lander is **Horizon-04 · Expedition Carrier** — 96 tiles of hull, over 1,500 pixels wide: cryo bay, workshop, spine and
bridge, a research deck over the bridge, then crew quarters, the reactor gallery and the raised observation deck. Signs number every compartment 01–07, and the starter kit reaches the research deck on its own.
The lander stays crashed on Exxos; its intact and wrecked sprites share one hull design.
The smaller escape pod has the same design when parked and during every travel leg.

Each world has distinct departure and return shots, blue drive flames and a wormhole.
Every launch climbs clear of the planet — the ground falls away under the pod — and every
arrival is a nosedive from orbit followed by a long scrape to a standstill across the
surface, leaving a groove behind it. Exxos carries drifting spores; Regrets banks through
abandoned towers; the glacier has sleet and aurora. A planet is drawn as a curved limb,
never a flat wall: the pod's limits at the edges of a beat are invisible ones.
Space skips cinematic shots **but cannot skip an asteroid crossing**.
Losing all shields restarts the crossing checkpoint; ESC turns back without losing materials.

Regrets adds a two-crate seal under a low roof, a three-second running gate with a visible
countdown, and a third flooded channel. Exxos has an optional frost-plate cache: lure a
hunter onto the blue plate, then freeze it. Closing gates never appear inside the player.

Build the **extractor rig** at research for **one alloy plate + one ration**. Hold E beside a
seam for **1.5 seconds** to extract a batch. Seams exist on every world; process their raw
output at the field rigs. Loose resources still bootstrap your first tools; extraction is
required for the rich seams, not for every loose pickup.

Click the faint **CODE** button at bottom right, enter a code, and press Enter. `admin`
opens developer tools; `starfall`, `moria`, `aurora`, and `xyzzy` are harmless easter eggs.
Add more entries to `CODES` in `game/src/codes.js`. Codes never trigger from movement typing.
Admin grants and resets can change the active save; this is a hidden tool, not secure authentication.

Fonts are bundled locally: Chakra Petch headings, Space Grotesk body text, and JetBrains
Mono instruments/canvas text. Their SIL Open Font License files live beside the fonts.

## Development tools

The repo ships the checks used while building the game:

```bash
node tools/test_engine.mjs       # 64 unit checks: physics, tilemap, progression, difficulty
node tools/validate_levels.mjs   # approximate reachability and progression-order gate checks
```

Open `game/index.html?selftest=1` to run the in-browser self-test — 60 checks that drive the real game
(movement, catches, processors, installs, saves, intro, six travel legs, extraction,
actual double-crate/frost/timed puzzle solves, and the starter-kit climb to research) and
print a report on screen. The tests restore the player's original save slots afterward.
`game/dev/selftest.js` is dev-only and never loads during normal play.

## Project layout

```
game/                 the game itself (serve this folder)
  index.html          shell, overlays, touch controls
  style.css           pixel-styled UI
  src/                engine, entities, levels, scenes, journal, audio, ui
    core/             pure game maths: config, tilemap (no DOM)
  assets/             138 PNG sprites, tiles and parallax background layers
  dev/selftest.js     dev-only in-browser self-test (?selftest=1)
art/                  the Python generators that draw every asset
  generate_assets.py  sprites, tiles, characters, UI icons
  generate_storyboard.py  portfolio storyboard + title art
tools/pdf_extract.py  dependency-free PDF text extractor used to read the design docs
tools/test_engine.mjs    engine unit tests (node, no browser)
tools/validate_levels.mjs  level-completability checker
tools/serve.py        tiny no-cache static server for local play
docs/                 design mapping, portfolio pages, extracted briefs
```

## Rebuilding the art

Every pixel is generated code — edit the palette or shapes and re-run:

```bash
python3 art/generate_assets.py      # writes game/assets/*.png
python3 art/generate_storyboard.py  # writes docs/portfolio/storyboard.png
```
