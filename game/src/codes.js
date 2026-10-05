/** Add new easter eggs to CODES; only explicit submissions trigger them. */
import { sfx } from "./audio.js";
import { toast } from "./ui.js";
import { input } from "./engine.js";

export const CODES = [
  { code: "admin", label: "Test deck", blurb: "Developer tools (changes can affect the active save).", run: (g) => g.openTestDeck() },
  { code: "starfall", label: "The first sketch", blurb: "Reveal the game's original working title.", run: (g) => g.showCard("STARFALL", ["Before the horizon, there was a falling star.", "The original name lives on in this little corner."], 5) },
  { code: "moria", label: "A memory", blurb: "A message from the World of Regrets.", run: (g) => g.showCard("MORIA'S MEMORY", ["Some things can be carried home.", "Some things can only be forgiven."], 5) },
  { code: "aurora", label: "Northern lights", blurb: "A postcard from the glacier.", run: (g) => g.showCard("THE HOLLOW SIGNAL", ["Even a silent world still has a sky.", "Look for the ribbons of light above the ice."], 5) },
  { code: "xyzzy", label: "An old spell", blurb: "A nod to the first adventure games.", run: () => toast("Nothing happens. Somewhere, a very old cave smiles.", 3000) },
];
let game;
let open = false;
let built = false;
const $ = (id) => document.getElementById(id);
export const codesOpen = () => open;
export const codeList = () => CODES.map(({ code, label, blurb }) => ({ code, label, blurb }));
export function openCodes() {
  open = true;
  input.reset();
  $("codes").classList.add("open");
  $("codes-chip").setAttribute("aria-expanded", "true");
  $("codes-input").value = "";
  $("codes-typed").textContent = "—";
  $("codes-input").focus();
}
export function closeCodes() {
  open = false;
  $("codes")?.classList.remove("open");
  $("codes-chip")?.setAttribute("aria-expanded", "false");
  $("codes-input")?.blur();
  input.reset();
}
function submit() {
  const code = $("codes-input").value.trim().toLowerCase();
  const entry = CODES.find((c) => c.code === code);
  if (!entry) {
    $("codes-typed").textContent = "Unknown code";
    sfx("back");
    return;
  }
  closeCodes();
  sfx("unlock");
  entry.run(game);
}
export function initCodes(g) {
  game = g;
  if (built) return;
  built = true;
  $("codes-chip").addEventListener("click", () => open ? closeCodes() : openCodes());
  $("codes-close").addEventListener("click", closeCodes);
  $("codes-input").addEventListener("input", (e) => { $("codes-typed").textContent = e.target.value ? "Enter to unlock" : "—"; });
  $("codes-input").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") { e.preventDefault(); closeCodes(); }
  });
}
