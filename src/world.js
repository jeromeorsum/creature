// Glorp's world: an island with places, resources to scavenge, and things Glorp builds.
// Each activity changes Glorp's needs. Glorp can invent new hobbies, which get
// added to state.hobbies and work just like these built-in activities.
// Positions are in metres on the island (x east, z south). The 3D page uses the same numbers.

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
  burrow: "Glorp's cosy burrow dug into a mound, with a sock-shaped bed and a shelf of collected treasures",
  kitchen: "a tiny kitchen hut with a cupboard Glorp has to keep stocked with berries",
  workshop: "a cluttered workshop shed with paper, paint, string, a toy keyboard and a broken radio",
  garden: "a messy garden with berry bushes, bugs, a pond and one suspicious pigeon",
  window: "a little tower with a big round window looking out at the island road where tiny cars go by",
  hill: "a grassy lookout hill where you can see trains cross the sea bridge in the distance",
  forest: "a small wobbly forest of trees you can collect wood from (they slowly regrow)",
  quarry: "a rocky quarry full of stones to collect (they come back very slowly)",
  beach: "a sandy beach where the tide washes up shells",
  junkpile: "a heap of washed-up junk by the road: bolts, cans, springs, mystery parts",
};

// Where each place is on the island.
export const PLACE_POS = {
  burrow: { x: -14, z: 6 },
  kitchen: { x: -6, z: 15 },
  workshop: { x: 7, z: 12 },
  garden: { x: 15, z: -1 },
  window: { x: 2, z: 27 },
  hill: { x: 30, z: 20 },
  forest: { x: -30, z: -12 },
  quarry: { x: 27, z: -21 },
  beach: { x: -6, z: -37 },
  junkpile: { x: 19, z: 32 },
};

// Building materials and food you can scavenge. Each resource lives on nodes (a tree, a rock...)
// that run out when collected and slowly grow back.
export const MATERIALS = ["wood", "stone", "shells", "scrap"];
export const RESOURCES = {
  wood: { node: "tree", place: "forest", count: 14, spread: 11, max: 4, regrowPerHour: 0.15 },
  stone: { node: "rock", place: "quarry", count: 9, spread: 8, max: 5, regrowPerHour: 0.05 },
  shells: { node: "shell", place: "beach", count: 10, spread: 10, max: 2, regrowPerHour: 0.2 },
  scrap: { node: "junk", place: "junkpile", count: 6, spread: 5, max: 3, regrowPerHour: 0.08 },
  berries: { node: "bush", place: "garden", count: 6, spread: 6, max: 4, regrowPerHour: 0.3 },
};

// Built-in activities. effects are need changes; minutes is how long it takes.
// gather: which resource it collects. build: places blocks of a project.
export const ACTIVITIES = {
  nap: { place: "burrow", minutes: 60, effects: { energy: 35, calm: 10, fullness: -5 }, about: "curl up in the sock bed" },
  sort_treasures: { place: "burrow", minutes: 20, effects: { calm: 15, joy: 5, energy: -3 }, about: "arrange the treasure shelf" },
  snack: { place: "kitchen", minutes: 10, effects: { fullness: 35, joy: 5 }, about: "eat berries from the cupboard (uses 1 cupboard berry; almost nothing to eat if the cupboard is empty)" },
  cook_experiment: { place: "kitchen", minutes: 30, effects: { fullness: 25, curiosity: 10, joy: 8, energy: -8 }, about: "invent a recipe (uses 2 cupboard berries)" },
  make_something: { place: "workshop", minutes: 45, effects: { joy: 20, curiosity: 10, energy: -12, fullness: -5 }, about: "make a creation (poem, song, drawing, invention, story, plan...)" },
  explore_garden: { place: "garden", minutes: 30, effects: { curiosity: 25, joy: 8, energy: -10, fullness: -5 }, about: "poke around the garden" },
  spy_on_pigeon: { place: "garden", minutes: 15, effects: { curiosity: 15, calm: -5, joy: 5 }, about: "investigate the pigeon" },
  people_watch: { place: "window", minutes: 20, effects: { curiosity: 15, calm: 10, energy: -2 }, about: "watch the cars on the road" },
  watch_trains: { place: "hill", minutes: 30, effects: { calm: 20, joy: 10, curiosity: 5, energy: -6 }, about: "count trains from the hill" },
  wander: { place: null, minutes: 15, effects: { curiosity: 10, energy: -4 }, about: "walk somewhere on the island" },
  pick_berries: { place: "garden", minutes: 25, gather: "berries", effects: { fullness: 5, joy: 3, energy: -5 }, about: "pick berries from the bushes and put them in the kitchen cupboard" },
  chop_wood: { place: "forest", minutes: 35, gather: "wood", effects: { energy: -12, curiosity: 4, joy: 3, fullness: -4 }, about: "collect wood from the trees" },
  dig_stone: { place: "quarry", minutes: 40, gather: "stone", effects: { energy: -15, calm: 5, fullness: -5 }, about: "dig stones out of the quarry" },
  comb_beach: { place: "beach", minutes: 25, gather: "shells", effects: { curiosity: 12, calm: 10, energy: -5 }, about: "collect shells on the beach" },
  scavenge_junk: { place: "junkpile", minutes: 30, gather: "scrap", effects: { curiosity: 18, joy: 4, energy: -8, calm: -3 }, about: "rummage in the junk heap for scrap" },
  build: { place: null, minutes: 45, build: true, effects: { joy: 12, curiosity: 5, energy: -14, fullness: -5 }, about: "work on one of your building projects (places blocks if you have the materials)" },
};

// Limits on a hobby that Glorp invents, so it can't make itself invincible.
export const HOBBY_LIMITS = { maxGain: 25, maxLoss: -20, maxHobbies: 30 };

// Limits on building.
export const BUILD_LIMITS = { maxBlocks: 24, blocksPerTick: 5, maxOpenProjects: 3, maxStructures: 60, maxSize: 3, maxOffset: 4, maxHeight: 8 };
export const SHAPES = ["box", "cylinder", "cone", "sphere"];

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

// A small seeded random number generator so the island is the same every time.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (v) => Math.round(v * 10) / 10;

export function newWorld() {
  const rand = seeded(1234);
  const nodes = [];
  for (const [res, r] of Object.entries(RESOURCES)) {
    const c = PLACE_POS[r.place];
    for (let i = 0; i < r.count; i++) {
      const a = rand() * Math.PI * 2;
      const d = 1.5 + Math.sqrt(rand()) * r.spread;
      nodes.push({ id: `${r.node}${i + 1}`, res, x: round1(c.x + Math.cos(a) * d), z: round1(c.z + Math.sin(a) * d), left: r.max });
    }
  }
  return {
    weather: "sunny",
    pantry: 6, // berries in the kitchen cupboard
    inventory: { wood: 0, stone: 0, shells: 0, scrap: 0 },
    nodes,
    structures: [],
  };
}

// Resources grow back as time passes.
export function regrow(world, hours) {
  for (const n of world.nodes) {
    const r = RESOURCES[n.res];
    n.left = Math.min(r.max, Math.round((n.left + r.regrowPerHour * hours) * 100) / 100);
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Collect a resource from the nodes nearest its place. Returns { got, spot }.
export function gather(world, res, rand = Math.random) {
  const r = RESOURCES[res];
  const want = 2 + Math.floor(rand() * 3); // 2-4
  const center = PLACE_POS[r.place];
  const nodes = world.nodes.filter((n) => n.res === res && n.left >= 1).sort((a, b) => dist(a, center) - dist(b, center));
  let got = 0;
  let spot = null;
  for (const n of nodes) {
    while (got < want && n.left >= 1) {
      n.left = Math.round((n.left - 1) * 100) / 100;
      got++;
      spot = { x: n.x, z: n.z };
    }
    if (got >= want) break;
  }
  if (res === "berries") world.pantry += got;
  else world.inventory[res] = (world.inventory[res] ?? 0) + got;
  return { got, spot };
}

// How many of a resource are left to collect on the island right now.
export function resourceLeft(world, res) {
  return world.nodes.filter((n) => n.res === res).reduce((s, n) => s + Math.floor(n.left), 0);
}

// Materials a block costs: bigger blocks cost more.
export function blockCost(b) {
  const vol = b.w * b.h * b.d * (b.shape === "box" ? 1 : 0.6);
  return Math.max(1, Math.min(4, 1 + Math.floor(vol / 2)));
}

const clamp = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, round1(n))) : dflt;
};

function pickFrom(value, options, dflt) {
  const v = String(value ?? "").toLowerCase().trim();
  return options.find((o) => o === v) ?? options.find((o) => v.includes(o)) ?? dflt;
}

// Clean up a block plan from Claude so it can't be enormous or nonsensical.
export function tidyBlocks(blocks) {
  const L = BUILD_LIMITS;
  return (Array.isArray(blocks) ? blocks : []).slice(0, L.maxBlocks).map((b) => ({
    shape: pickFrom(b.shape, SHAPES, "box"),
    material: pickFrom(b.material, MATERIALS, "wood"),
    x: clamp(b.x, -L.maxOffset, L.maxOffset, 0),
    y: clamp(b.y, 0, L.maxHeight, 0),
    z: clamp(b.z, -L.maxOffset, L.maxOffset, 0),
    w: clamp(b.w, 0.2, L.maxSize, 1),
    h: clamp(b.h, 0.2, L.maxSize, 1),
    d: clamp(b.d, 0.2, L.maxSize, 1),
    placed: false,
  }));
}

// Find a free spot for a new building near a place.
export function findBuildSpot(world, place) {
  const c = PLACE_POS[place] ?? PLACE_POS.burrow;
  const n = world.structures.length;
  for (let i = 0; i < 80; i++) {
    const a = (n * 2.4 + i * 0.9) % (Math.PI * 2);
    const d = 6 + (i % 8) * 1.5;
    const p = { x: round1(c.x + Math.cos(a) * d), z: round1(c.z + Math.sin(a) * d) };
    if (Math.hypot(p.x, p.z) > 42) continue; // stay on the island
    const nearPlace = Object.values(PLACE_POS).some((q) => dist(q, p) < 4.5);
    const nearBuild = world.structures.some((s) => dist(s, p) < 7);
    const nearNode = world.nodes.some((q) => dist(q, p) < 2.5);
    if (!nearPlace && !nearBuild && !nearNode) return p;
  }
  return { x: round1(c.x + 5), z: round1(c.z + 5) };
}

export function startProject(world, plan, now) {
  const L = BUILD_LIMITS;
  const open = world.structures.filter((s) => !s.finished);
  if (open.length >= L.maxOpenProjects || world.structures.length >= L.maxStructures) return null;
  const blocks = tidyBlocks(plan.blocks);
  if (!blocks.length) return null;
  blocks.sort((a, b) => a.y - b.y);
  const place = PLACE_POS[plan.near] ? plan.near : "burrow";
  const spot = findBuildSpot(world, place);
  const s = {
    id: world.structures.length + 1,
    name: String(plan.name || "Untitled Thing").slice(0, 60),
    purpose: String(plan.purpose || "").slice(0, 300),
    place,
    x: spot.x,
    z: spot.z,
    rot: Math.round(((world.structures.length * 1.7) % (Math.PI * 2)) * 100) / 100,
    blocks,
    started: now.toISOString(),
    finished: null,
  };
  world.structures.push(s);
  return s;
}

export function missingFor(world, s) {
  const need = {};
  for (const b of s.blocks.filter((b) => !b.placed)) need[b.material] = (need[b.material] ?? 0) + blockCost(b);
  const missing = {};
  for (const [m, n] of Object.entries(need)) if (n > (world.inventory[m] ?? 0)) missing[m] = n - (world.inventory[m] ?? 0);
  return { need, missing };
}

// Place as many blocks of a project as materials allow.
export function buildOn(world, s, now) {
  let placed = 0;
  let stuck = null;
  for (const b of s.blocks) {
    if (b.placed) continue;
    if (placed >= BUILD_LIMITS.blocksPerTick) break;
    const cost = blockCost(b);
    if ((world.inventory[b.material] ?? 0) < cost) {
      stuck = { material: b.material, short: cost - (world.inventory[b.material] ?? 0) };
      break;
    }
    world.inventory[b.material] -= cost;
    b.placed = true;
    placed++;
  }
  if (s.blocks.every((b) => b.placed)) s.finished = s.finished ?? now.toISOString();
  return { placed, stuck, finished: !!s.finished };
}

// Little things that happen on the island whether Glorp likes it or not.
export function worldEvents(world, rand = Math.random) {
  const events = [];
  if (rand() < 0.15) {
    const w = ["sunny", "sunny", "cloudy", "rainy", "windy"][Math.floor(rand() * 5)];
    if (w !== world.weather) {
      world.weather = w;
      events.push(`The weather changed: it is now ${w}.`);
    }
  }
  if (rand() < 0.12) {
    const loot = ["scrap", "shells", "wood"].find((m) => (world.inventory[m] ?? 0) > 0);
    if (loot) {
      world.inventory[loot] -= 1;
      events.push(`The pigeon swooped down and stole 1 ${loot} from your pile, then stared at you.`);
    }
  }
  const windy = world.weather === "windy" || world.weather === "rainy";
  if (rand() < (windy ? 0.2 : 0.05)) {
    const built = world.structures.filter((s) => s.blocks.some((b) => b.placed));
    if (built.length) {
      const s = built[Math.floor(rand() * built.length)];
      const placedBlocks = s.blocks.filter((b) => b.placed);
      const b = placedBlocks[placedBlocks.length - 1];
      b.placed = false;
      s.finished = null;
      events.push(`A gust knocked a ${b.material} ${b.shape} off "${s.name}". It needs repairing (build on it again).`);
    }
  }
  if (rand() < 0.06) {
    world.inventory.scrap = (world.inventory.scrap ?? 0) + 1;
    events.push("A beetle left a shiny bit of scrap on your doorstep. A gift? A bribe?");
  }
  if (world.pantry > 0 && rand() < 0.05) {
    world.pantry -= 1;
    events.push("Something nibbled a berry from the cupboard in the night. Suspicious.");
  }
  return events;
}

// Problems Glorp should know about, worked out from the state of the world.
export function problems(state) {
  const w = state.world;
  const out = [];
  if (w.pantry === 0) out.push("The kitchen cupboard is EMPTY. Snacks will barely feed you until you pick berries.");
  else if (w.pantry <= 2) out.push(`Only ${w.pantry} berries left in the cupboard.`);
  for (const res of Object.keys(RESOURCES)) {
    const left = resourceLeft(w, res);
    if (left === 0) out.push(`There is no ${res} left to collect right now. It will grow back slowly.`);
    else if (left <= 3) out.push(`Only ${left} ${res} left to collect on the island.`);
  }
  for (const s of w.structures.filter((s) => !s.finished)) {
    const { missing } = missingFor(w, s);
    const m = Object.entries(missing).map(([k, v]) => `${v} ${k}`).join(", ");
    if (m) out.push(`To finish "${s.name}" you still need: ${m}.`);
  }
  for (const n of NEEDS) if (state.needs[n] < 25) out.push(`Your ${n} is very low (${state.needs[n]}).`);
  return out;
}
