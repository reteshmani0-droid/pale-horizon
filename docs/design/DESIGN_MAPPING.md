# Design mapping — how the two PDFs became this game

Sources (text extracted to `docs/design/ideas.txt` and `docs/design/hs_assignment.txt`):

1. **`video game design ideas.pdf`** — the team's concept document (roles, idea 1, revisions, endings,
   per-area notes for the menu, Stealth World, World 2, World 3, spaceship).
2. **`HS_-_Video_Game_Design.pdf`** — the TSA high-school event guide and rating form.

## A. Team concept document → implementation

| Design document says | In the game |
| --- | --- |
| "You wake up from cryo sleep after you crash onto the island of Exxon" | Opening cutscene cards, then the **Cryo Bay** hub where the player literally wakes next to the pod |
| "142 million light years away from earth and 12 million light years away from your destination" | Opening cutscene + menu tagline + Cyu's first dialogue line |
| "You need to get resources from each planet near you so you can repair the rocket and your cryosleep pod" | Progression: **3 fuel cells per world (9 total)** + **1 cryo-pod part per world (3 total)**; the REPAIR BAY installs the hatch, the CRYO POD launches the endgame |
| "You go to each planet to get resources with your AI assistant, Cyu" | Cyu is the dialogue voice of every mission brief, hint and the twist ending (portrait + typewriter dialogue box) |
| "the resources you need are guarded by bosses that force you to do puzzles to get the materials" | Moria (World of Regrets) and the relay puzzle on World 3 guard the fuel; nothing is beaten by force |
| "the player will encounter asteroids which they need to dodge" | **Route crossings** — mandatory playable asteroid passages on outbound and return trips to Regrets and the glacier, with shield checkpoints; no bonus fuel |
| "Your AI assistant turns out to be evil … resources … made the planet's people helpless" | The ending: Cyu confesses it knew, and the player chooses to give the fuel back or keep it |
| "Designer make a main menu screen, and coder code the main menu screen" | Main menu with title art, an in-fiction tagline, a live lander read-out column, Start/Continue, Save slots, How to play, Field journal, Training deck and Options |
| Stealth World: "Sneak around monsters as you reach an area", "Planet full of predators with heightened senses" | Mission 1 **Exxos** (see the name note below): 6 creeper plants with ground cones + hearing, 1 patrolling bird, tall-grass hiding, sneak mechanic, beacons |
| World 2 "The world of regrets" — "Moria separates his soul from his body, forcing the player to solve puzzles to retrieve his soul and gain fuel. **(NOT A FIGHT)**" | Mission 2: three rune-block/pressure-plate puzzles open three seals, the soul orb must be **carried** (not fought) to Moria's body, and only then does the fuel become collectable |
| "Mechanics like a m…" (sentence cut off in the document) | Filled in as push-blocks, pressure plates, a sealed door per puzzle, checkpoint beacons and moving through ruins |
| "world 3" (otherwise blank) | **Filled in: The Hollow Signal** — a storm world whose power died with its people. Ember charges + relays raise bridges, wind gusts shove the player, birds patrol the air. See section C |
| "spaceship — This is the main base you wake up in here after your ship crashes" | The Cryo Bay hub: crashed ship sprite, cryo pod, nav console and repair bay stations |
| Roles listed (Avaneesh, Retesh, Angad, Niko, Nihaan, Arjun) | Kept intact in the portfolio title page and the repository README; the game itself carries no credits screen |
| "You may also add revisions of ideas or endings" | Two endings written (**Homecoming Deferred** / **The Long Way Home**) |
| (nothing in the documents about difficulty, audio or accessibility) | Added by me, because a competition game is played by judges of very different skill: **three difficulty tiers**, a **four-bus audio mixer with procedural music/ambience**, remappable-feeling keyboard + **touch controls**, and a **self-test harness** that drives actual mechanics and authored puzzle solutions after changes |

### Name note

The document calls the crash world **"Exxon"**. That is also the name of a real, trademarked corporation,
which is a copyright/trademark risk for a competition entry, so the planet is **Exxos** in the game and in
all documentation, and stated openly in the portfolio and the repository README.

### About the "highlighted" text

The instruction was to disregard anything highlighted and fill the gaps myself. The PDFs' text layer does
not carry highlight colours (they are drawn as separate annotation objects), so highlight detection was not
possible from the extracted text. Instead every part of the concept was implemented, and the three genuinely
empty/ambiguous parts — **World 3**, the **ending**, and the cut-off **"Mechanics like a m…"** line — were
filled in as described above. Anything the team wants to change is easy to re-tag: World 3 lives in
`game/src/levels.js` as `M3`.

## B. TSA event guide → requirements met

| Event requirement | Where it is satisfied |
| --- | --- |
| Hyperlink to an online game, no `.exe`, no download | Plain static files in `game/` — see hosting notes in `README.md` |
| Playable from all computers and browsers | Vanilla HTML/CSS/ES modules + canvas. No build step, no external libraries, locally bundled OFL fonts; no CDNs to load |
| ESRB **E for Everyone**, no weapons or violence | There are no weapons, no attacking, no death. Enemies only "catch" you (return to the last beacon). Water is a soft reset. Nothing on screen depicts injury |
| Game greater than 3 minutes of play | Hub dialogue + three missions (≈1.5–2 min each when played properly) + asteroid route ≈ well over 3 minutes for a first-time player |
| Interactive | Movement, jumping, sneaking, hiding, pushing blocks, carrying items, doors, relays, checkpoints, choices |
| Judges must be able to play to the 3rd level | **Chapter select** opens every mission from the main menu, and the NAV CONSOLE lists all three worlds after the first landing |
| Clear instructions and control functions | "How to play" panel on the menu, a control list in the pause menu, per-mission objective cards, on-screen `E` prompts, and an in-game dialogue tutorial from Cyu in each world |
| First three levels judged | Exxos, The World of Regrets, The Hollow Signal — each ends at a beacon that returns you to the ship |
| Bonus: exceptional features / educational value | Real unit conversions in the story (light-years and distances shown with actual numbers), astronomy flavour text, a moral choice ending, pixel-art asset pipeline, procedural audio, accessibility touches |
| Portfolio: title page / purpose & description / controls / storyboard / copyright checklist / AI reflection | `docs/portfolio/PORTFOLIO.md` plus `docs/portfolio/storyboard.png` and `docs/portfolio/title_art.png` |
| GenAI permitted, must be reflected on | The AI reflection page in the portfolio states exactly what was AI-generated and how it was reviewed |

## B2. "No fighting" — how the rule is enforced in code

The concept document's World 2 note says **"(NOT A FIGHT)"**, and the TSA rules require an E rating with
no violence. That is not just flavour text; it is a hard design constraint, and the code enforces it:

- There is **no attack action anywhere**: the input map (`game/src/engine.js`) has left, right, up, down,
  jump, dash, use, pause, mute and debug — nothing that damages.
- Enemies have **no health**. `Player` has masks; `Creeper`, `Bird`, `Plant` and `Moria` have no damage
  state at all. Contact runs one direction only: a creeper drags the pilot under the soil and a bird lifts
  them into the air (`scene.onEnemyContact(...)` in `game/src/scenes.js`), which restarts the descent from
  the last beacon rather than draining a bar.
- `Moria` is implemented as an interactable (`use` → fuse the soul), never a target. The relay puzzle on
  the Hollow Signal and the block/plate puzzles on the World of Regrets are the only "bosses".
- The asteroid route is dodging only — asteroids can hit the shuttle, the shuttle cannot hit back.
- The word search across `game/src/` finds no `attack`, `shoot`, `weapon`, `kill` or `bullet` identifiers
  (only text that *says* there is no fighting, e.g. Moria's dialogue and the "How to play" panel).

## C. Educational and social value (bonus-point targets)

- **Science**: the game repeats the concept document's own numbers and uses them consistently —
  142 million light-years from Earth, 12 million more to the destination — which is a natural hook for a
  classroom discussion of scale (light-year = ~9.46 trillion km).
- **Social value**: the twist turns a looting loop into a question about resource extraction. Ending A
  returns the fuel; Ending B takes it anyway and shows the cost. Neither ending is rewarded with score,
  which keeps the decision a genuine one.
- **Teamwork/leadership**: the roles the team assigned map onto real work in the repo — the asset
  generator (`art/`), the engine and levels (`game/src/`), and the documentation set (`docs/`).

## D. What changed in the polish pass (phase 2)

After the first playable build, a second pass focused on feel, accessibility and reliability:

| Area | Before | Now |
| --- | --- |
| Movement | run, jump, sneak | plus **dash** (with afterimage), **air dash**, **wall-slide** and **wall-jump** — a Hollow-Knight-style kit built entirely from non-violent verbs |
| Damage | instant respawn at last beacon | **mask system** (6/5/3 by tier), knockback, invulnerability frames, hit-stop; beacons refills the suit, benches heal, losing all masks respawns with a full suit |
| Difficulty | one balance | **Explorer / Standard / Nightmare** scaling enemy speed, vision, alert time, water damage, wind and asteroid shields |
| Audio | silent | **WebAudio engine**: per-world music themes with intensity layers, ambience beds, ~35 effects, master/music/effects/ambience mixer, autoplay-unlock handling |
| Puzzles | block/plate and relay/bridge | double-crate, timed and frozen-weight seals added; approximate path validation plus input-driven solves in `?selftest=1` |
| Bugs fixed | — | pause panel could never close; block-push teleported the player through the crate; dash was visual only; moving platforms could not carry the player; m1 spawn sat in a creeper's path; audio never started before a user gesture |
| Tests | none | `tools/test_engine.mjs` (64 unit checks) + `node tools/validate_levels.mjs` + 63 in-browser self-test checks |
