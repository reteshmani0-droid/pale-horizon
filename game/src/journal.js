/** Stable IDs are stored in save.journal; prose and placement may change freely. */
export const TRANSMISSIONS = [
  { id: 'ship-crew', world: 'ship', x: 56, y: 19, title: '01 · A name before the horizon', location: 'Crew quarters', text: 'The crew painted STARFALL on the first test hull. When the mission changed, the name changed too. Someone left a note: old names still open little doors. Try the old name in the corner code reader.' },
  { id: 'ship-engine', world: 'ship', x: 69, y: 12, title: '02 · Three engines, one promise', location: 'Engineering gallery', text: 'Horizon-04 carried laboratories, sleeping quarters and enough tools to rebuild a small town. The carrier will never lift again. Its three engines are silent, but the smaller escape pod in the launch bay can still carry one person home.' },
  { id: 'ship-observe', world: 'ship', x: 89, y: 13, title: '03 · The sky still answers', location: 'Observation deck', text: 'A thousand empty frequencies. Then a faint signal from the glacier. The last operator signed off with a single word: AURORA. Some secrets are not locked away; they are just waiting for someone to look up.' },
  { id: 'm1-canopy', world: 'm1', x: 10, y: 19, title: '04 · The breathing forest', location: 'Exxos · landing grove', text: 'The blue leaves open when the warm air arrives. The lights between their roots are living things, not navigation beacons. Walk quietly. A hunter can hear your boots long before it can see your lamp.' },
  { id: 'm2-memory', world: 'm2', x: 44, y: 19, title: '05 · Nothing is forgotten', location: 'Regrets · west smelter', text: 'The galleries were built to hold memories, not treasure. Two weights, one promise: both must stay. Further east a gate runs on borrowed seconds. Beyond that, a soul waits to be carried back to MORIA. His name still echoes in the code reader.' },
  { id: 'm3-signal', world: 'm3', x: 16, y: 19, title: '06 · A light for whoever follows', location: 'Glacier · first relay', text: 'The relay crews kept a lamp burning through the last winter. Nobody knew who would come after them. Bring an ember to their bridges. A working machine can be a monument, too.' },
];
export const FIELD_NOTES = [
  ['Survive', 'Nothing can be fought. Move quietly, hide in tall grass, freeze hazards once you have the projector, and light beacons.'],
  ['Build', 'Gather loose materials first. Process biomass into rations, ore into alloy, and crystal into coolant. Research builds the tools that open new routes.'],
  ['Extract', 'Build an extractor from one alloy plate and one ration. Hold E at a glowing seam for 1.5 seconds. A broken hold loses drilling progress, not materials.'],
  ['Navigate', 'The carrier stays on Exxos. The escape pod flies the routes. Regrets and the glacier require asteroid crossings; ESC returns to the ship.'],
  ['Discover', 'Recover antenna-marked recorders with E. Your journal keeps them across revisits and save reloads. Clues may reveal codes, but never grant free progress.'],
];
export const transmissionById = (id) => TRANSMISSIONS.find((entry) => entry.id === id);
