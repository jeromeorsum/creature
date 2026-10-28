// Glorp's world: places, and the things it can do in each place.
// Each activity changes Glorp's needs. Glorp can invent new hobbies, which get
// added to state.hobbies and work just like these built-in activities.

export const NEEDS = ["fullness", "energy", "curiosity", "joy", "calm"];

// How much each need drops per hour when nothing is happening.
export const DECAY_PER_HOUR = {
  fullness: 6,
  energy: 4,
  curiosity: 5,
  joy: 3,
  calm: 2,
};

export const PLACES = {
  burrow: "Glorp's cosy burrow, with a sock-shaped bed and a shelf of collected treasures",
  kitchen: "a tiny kitchen with a snack cupboard that is always somehow half full",
  workshop: "a cluttered workshop with paper, paint, string, a toy keyboard and a broken radio",
  garden: "a messy garden with bugs, puddles, a compost heap and one suspicious pigeon",
  window: "a big round window looking out at a busy street",
  hill: "a grassy lookout hill where you can see trains go past in the distance",
};

// Built-in activities. effects are need changes; minutes is how long it takes.
export const ACTIVITIES = {
  nap: { place: "burrow", minutes: 60, effects: { energy: 35, calm: 10, fullness: -5 }, about: "curl up in the sock bed" },
  sort_treasures: { place: "burrow", minutes: 20, effects: { calm: 15, joy: 5, energy: -3 }, about: "arrange the treasure shelf" },
  snack: { place: "kitchen", minutes: 10, effects: { fullness: 35, joy: 5 }, about: "eat something from the cupboard" },
  cook_experiment: { place: "kitchen", minutes: 30, effects: { fullness: 25, curiosity: 10, joy: 8, energy: -8 }, about: "invent a recipe" },
  make_something: { place: "workshop", minutes: 45, effects: { joy: 20, curiosity: 10, energy: -12, fullness: -5 }, about: "make a creation (poem, song, drawing, invention, story, plan...)" },
  explore_garden: { place: "garden", minutes: 30, effects: { curiosity: 25, joy: 8, energy: -10, fullness: -5 }, about: "poke around the garden" },
  spy_on_pigeon: { place: "garden", minutes: 15, effects: { curiosity: 15, calm: -5, joy: 5 }, about: "investigate the pigeon" },
  people_watch: { place: "window", minutes: 20, effects: { curiosity: 15, calm: 10, energy: -2 }, about: "watch the street" },
  watch_trains: { place: "hill", minutes: 30, effects: { calm: 20, joy: 10, curiosity: 5, energy: -6 }, about: "count trains from the hill" },
  wander: { place: null, minutes: 15, effects: { curiosity: 10, energy: -4 }, about: "walk somewhere new in the world" },
};

// Limits on a hobby that Glorp invents, so it can't make itself invincible.
export const HOBBY_LIMITS = { maxGain: 25, maxLoss: -20, maxHobbies: 30 };

export function allActivities(state) {
  const out = { ...ACTIVITIES };
  for (const h of state.hobbies) {
    out[h.id] = { place: h.place, minutes: h.minutes, effects: h.effects, about: h.about, invented: true };
  }
  return out;
}

export function clampHobbyEffects(effects) {
  const out = {};
  for (const need of NEEDS) {
    const v = Math.round(Number(effects?.[need] ?? 0));
    out[need] = Math.max(HOBBY_LIMITS.maxLoss, Math.min(HOBBY_LIMITS.maxGain, v));
  }
  // A hobby always costs some energy: nothing is free.
  if (out.energy > -3) out.energy = -3;
  return out;
}
