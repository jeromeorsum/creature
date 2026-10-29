// Glorp's world: an untouched island of raw nature. Nothing here is made by anyone.
// Everything Glorp owns, it collected, figured out or built itself.
// Positions are in metres on the island (x east, z south). The 3D page uses the same numbers.

export const NEEDS = ["fullness", "water", "energy", "curiosity", "joy", "calm"];

// How much each need drops per hour when nothing is happening.
export const DECAY_PER_HOUR = {
  fullness: 6,
  water: 7,
  energy: 4,
  curiosity: 5,
  joy: 3,
  calm: 2,
};

export const PLACES = {
  nest: "the hollow between the roots of a huge old tree, where you hatched. Dry leaves on the ground. Nothing else",
  meadow: "an open grassy meadow full of wildflowers and bugs",
  thicket: "a tangled thicket of berry bushes (food!) where a wild pigeon hangs around",
  pond: "a still pond with tall reeds (good fibre) and a bank of sticky clay",
  forest: "a forest of trees with fallen branches and wood (trees slowly regrow)",
  rocks: "a rocky outcrop with loose stones of all sizes",
  beach: "a sandy beach where the waves wash up shells",
  hill: "a grassy hill, the highest point, where you can see the whole island and the sea",
  tidepools: "rock pools by the shore with crabs, seaweed and shells",
  // Hidden places: Glorp doesn't know these exist until it goes exploring and finds them.
  spring: "a cold spring bubbling up between mossy stones and ferns: the clearest water on the island",
  glade: "a hushed glade where a giant hollow log lies across the ferns, with mushrooms growing on it",
  grotto: "a mossy grotto under a rock arch, dry even in the rain, where little mushrooms glow in the dark",
  cliffs: "windswept sea cliffs on a headland, with seabirds nesting on the ledges and a view over the whole sea",
};
export const START_KNOWN = ["nest", "meadow", "pond", "thicket"]; // what a newborn can see from where it hatched
const FIRST_ISLAND = ["nest", "meadow", "thicket", "pond", "forest", "rocks", "beach", "hill", "tidepools"];

// Places Glorp knows about. (A Glorp from before hidden places existed knows the original island.)
export function knownPlaces(world) {
  return world.known ?? FIRST_ISLAND;
}
export function unknownPlaces(world) {
  const known = knownPlaces(world);
  return Object.keys(PLACES).filter((p) => !known.includes(p));
}

// Exploring: head for the nearest place Glorp hasn't found yet. Returns its name, or null if it knows everywhere.
export function discoverPlace(world, from) {
  const left = unknownPlaces(world);
  if (!left.length) return null;
  const near = left.sort((a, b) => dist(PLACE_POS[a], from) - dist(PLACE_POS[b], from))[0];
  world.known = [...knownPlaces(world), near];
  return near;
}

// Where each place is on the island.
export const PLACE_POS = {
  nest: { x: -14, z: 6 },
  meadow: { x: 6, z: 10 },
  thicket: { x: 15, z: -3 },
  pond: { x: -4, z: 21 },
  forest: { x: -30, z: -12 },
  rocks: { x: 27, z: -21 },
  beach: { x: -6, z: -37 },
  hill: { x: 30, z: 18 },
  tidepools: { x: 18, z: 34 },
  spring: { x: -24, z: 22 },
  glade: { x: -12, z: -20 },
  grotto: { x: 8, z: -22 },
  cliffs: { x: -35, z: 4 },
};

// Is Glorp living somewhere with a roof (a finished building it made its home)?
export function hasShelter(world) {
  return !!world.structures.find((s) => s.id === world.home && s.finished);
}

// Raw materials. Each lives on nodes (a tree, a rock...) that run out when collected.
// The island is finite. Living plants (trees, berry bushes, reeds) only grow back when Glorp tends them,
// and a tree cut right down to nothing dies for good. New plants come only from seeds Glorp plants.
// Stone never comes back. Clay seeps back slowly in the rain. The tide brings a few shells.
// tended: growth per hour while tended. natural: growth per hour on its own. rain: extra growth per hour while raining.
export const MATERIALS = ["wood", "stone", "clay", "fibre", "shells"];
export const RESOURCES = {
  wood: { node: "tree", place: "forest", count: 16, spread: 11, max: 4, living: true, diesWhenEmpty: true, tended: 0.12, natural: 0, seed: "tree" },
  stone: { node: "rock", place: "rocks", count: 10, spread: 8, max: 5, natural: 0 },
  clay: { node: "clay patch", place: "pond", count: 5, spread: 5, max: 4, natural: 0, rain: 0.15, side: { x: -4, z: -4 } },
  fibre: { node: "reed clump", place: "pond", count: 7, spread: 6, max: 3, living: true, tended: 0.3, natural: 0, side: { x: 4, z: 3 } },
  shells: { node: "shell", place: "beach", count: 10, spread: 10, max: 2, natural: 0.03 },
  berries: { node: "berry bush", place: "thicket", count: 8, spread: 6, max: 4, living: true, tended: 0.4, natural: 0, seed: "berry" },
};
export const TEND_HOURS = 24; // how long one round of tending keeps plants growing

// Things Glorp can do from day one. effects are need changes; minutes is how long it takes.
// gather: which resource it collects. build: places blocks of a project.
export const ACTIVITIES = {
  drink: { place: "pond", minutes: 10, effects: { water: 50, calm: 3 }, about: "drink fresh water from the pond" },
  tend_plants: { place: null, minutes: 35, tend: true, effects: { calm: 10, joy: 5, energy: -8, water: -4 }, about: "water and look after the living plants (trees, berry bushes, reeds) around a place (use go_to) so they grow back for a day" },
  plant_seeds: { place: null, minutes: 30, plant: true, effects: { calm: 8, joy: 8, energy: -8 }, about: "plant up to 3 seeds you have saved near a place (use go_to): tree seeds become new trees, berry seeds new berry bushes. Seedlings only grow while tended" },
  nap: { place: "home", minutes: 60, effects: { energy: 30, calm: 10, fullness: -5 }, about: "sleep for a while at home (your nest, or a shelter you built and made your home)" },
  forage_berries: { place: "thicket", minutes: 25, gather: "berries", effects: { joy: 3, energy: -4 }, about: "pick berries: eat some straight away (fullness), keep the rest as food" },
  eat_food: { place: null, minutes: 10, eat: true, effects: { joy: 4 }, about: "eat berries from the food you are keeping" },
  collect_wood: { place: "forest", minutes: 35, gather: "wood", effects: { energy: -12, curiosity: 3, fullness: -4 }, about: "gather fallen branches and wood" },
  collect_stone: { place: "rocks", minutes: 35, gather: "stone", effects: { energy: -14, calm: 4, fullness: -4 }, about: "pick up loose stones" },
  dig_clay: { place: "pond", minutes: 30, gather: "clay", effects: { energy: -10, joy: 4, calm: -2 }, about: "scoop sticky clay from the pond bank" },
  pull_reeds: { place: "pond", minutes: 25, gather: "fibre", effects: { energy: -6, calm: 6 }, about: "pull reeds for fibre (stringy, bendy)" },
  collect_shells: { place: "beach", minutes: 25, gather: "shells", effects: { curiosity: 10, calm: 10, energy: -5 }, about: "collect shells on the beach" },
  explore: { place: null, minutes: 30, explore: true, effects: { curiosity: 18, energy: -8 }, about: "go exploring: set go_to to a place you know to look closely at it, or to \"somewhere_new\" to head off into parts of the island you have never been and maybe find a new place" },
  do_anything: { place: null, minutes: 30, free: true, effects: {}, about: "ANYTHING else you can imagine that your body and the island allow (climb the old tree, dig a hole, talk to the crabs, invent a game, drink from a spring, hide from the rain, a ritual...). Describe it in free_action" },
  experiment: { place: null, minutes: 40, experiment: true, effects: { curiosity: 15, joy: 8, energy: -8, calm: -2 }, about: "try things out with what you have and see what happens (can lead to a discovery or an invention)" },
  make_something: { place: "meadow", minutes: 40, effects: { joy: 18, curiosity: 8, energy: -8 }, about: "make a creation: a song, a story, a drawing in the sand, names for things, a dance" },
  build: { place: null, minutes: 45, build: true, effects: { joy: 12, curiosity: 5, energy: -14, fullness: -5 }, about: "work on one of your building projects (places blocks if you have the materials)" },
  watch_the_sky: { place: "hill", minutes: 30, effects: { calm: 22, joy: 6, curiosity: 4, energy: -2 }, about: "sit on the hill and watch clouds, sea and birds" },
  splash_in_pond: { place: "pond", minutes: 20, effects: { joy: 18, calm: 4, energy: -5 }, about: "splash about in the pond" },
  spy_on_pigeon: { place: "thicket", minutes: 15, effects: { curiosity: 15, calm: -5, joy: 5 }, about: "watch the wild pigeon very carefully" },
};

// Limits on a hobby that Glorp invents, so it can't make itself invincible.
export const HOBBY_LIMITS = { maxGain: 25, maxLoss: -20, maxHobbies: 30 };

// Limits on building.
export const BUILD_LIMITS = { maxBlocks: 24, blocksPerTick: 5, maxOpenProjects: 3, maxStructures: 60, maxSize: 3, maxOffset: 4, maxHeight: 8 };
export const SHAPES = ["box", "cylinder", "cone", "sphere"];

// What an invention can do for Glorp. Each one can only be gained once.
export const INVENTION_HELPS = {
  more_wood: "collect 2 more wood each time",
  more_stone: "collect 2 more stone each time",
  more_clay: "collect 2 more clay each time",
  more_fibre: "collect 2 more fibre each time",
  more_shells: "collect 2 more shells each time",
  more_berries: "pick 2 more berries each time",
  better_sleep: "naps give 15 more energy",
  carry_more_food: "keep 8 more food",
  nothing_yet: "nothing useful yet, it's just a thing",
};
export const FOOD_CAP = 8;

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
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function newWorld() {
  const rand = seeded(4321);
  const nodes = [];
  for (const [res, r] of Object.entries(RESOURCES)) {
    const p = PLACE_POS[r.place];
    const c = { x: p.x + (r.side?.x ?? 0), z: p.z + (r.side?.z ?? 0) };
    for (let i = 0; i < r.count; i++) {
      const a = rand() * Math.PI * 2;
      const d = 1.5 + Math.sqrt(rand()) * r.spread;
      let x = round1(c.x + Math.cos(a) * d), z = round1(c.z + Math.sin(a) * d);
      if (res === "shells" && i >= 6) { // a few shells in the tide pools too
        x = round1(PLACE_POS.tidepools.x + Math.cos(a) * 3.5);
        z = round1(PLACE_POS.tidepools.z + Math.sin(a) * 2.5);
      }
      nodes.push({ id: `${res}${i + 1}`, res, x, z, left: r.max });
    }
  }
  return {
    weather: "sunny",
    food: 0, // berries Glorp is keeping
    seeds: { tree: 0, berry: 0 }, // saved from collecting wood and berries
    inventory: Object.fromEntries(MATERIALS.map((m) => [m, 0])),
    discovered: [], // materials Glorp has found and handled
    inventions: [], // { name, about, helps, cost, made }
    home: null, // id of a structure Glorp made its home (null = the nest)
    known: [...START_KNOWN], // places Glorp has found
    nodes,
    structures: [],
  };
}

const nodeMax = (n) => n.max ?? RESOURCES[n.res].max;

// Is this plant being looked after right now?
export const isTended = (n, now) => !!n.tendedUntil && new Date(n.tendedUntil) > now;

// Things grow back only for a reason: tending, rain, or the tide.
export function regrow(world, hours, now = new Date()) {
  for (const n of world.nodes) {
    if (n.dead) continue;
    const r = RESOURCES[n.res];
    let rate = r.natural ?? 0;
    if (r.living && isTended(n, now)) rate += r.tended;
    if (r.rain && world.weather === "rainy") rate += r.rain;
    if (rate > 0) n.left = Math.min(nodeMax(n), Math.round((n.left + rate * hours) * 100) / 100);
  }
}

// Look after every living plant near a place for the next day.
export function tend(world, place, now) {
  const c = PLACE_POS[place] ?? PLACE_POS.nest;
  const until = new Date(now.getTime() + TEND_HOURS * 3_600_000).toISOString();
  let count = 0;
  for (const n of world.nodes) {
    if (n.dead || !RESOURCES[n.res].living || dist(n, c) > 14) continue;
    n.tendedUntil = until;
    count++;
  }
  return count;
}

// Plant saved seeds near a place. Returns how many of each were planted.
export function plant(world, place, now, rand = Math.random) {
  const c = PLACE_POS[place] ?? PLACE_POS.nest;
  const planted = { tree: 0, berry: 0 };
  for (let i = 0; i < 3; i++) {
    const kind = world.seeds.tree > 0 && (world.seeds.berry === 0 || i % 2 === 0) ? "tree" : world.seeds.berry > 0 ? "berry" : null;
    if (!kind) break;
    let spot = null;
    for (let k = 0; k < 30 && !spot; k++) {
      const a = rand() * Math.PI * 2, d = 3 + rand() * 9;
      const p = { x: round1(c.x + Math.cos(a) * d), z: round1(c.z + Math.sin(a) * d) };
      const clear = Math.hypot(p.x, p.z) < 40 && !world.nodes.some((n) => !n.dead && dist(n, p) < 1.8) && !world.structures.some((s) => dist(s, p) < 5);
      if (clear) spot = p;
    }
    if (!spot) break;
    world.seeds[kind]--;
    planted[kind]++;
    const res = kind === "tree" ? "wood" : "berries";
    world.nodes.push({ id: `planted${world.nodes.length + 1}`, res, ...spot, left: 0, max: RESOURCES[res].max, planted: now.toISOString(), tendedUntil: null });
  }
  return planted;
}

export function bonus(world, helps) {
  return world.inventions.some((i) => i.helps === helps);
}

export function foodCap(world) {
  return FOOD_CAP + (bonus(world, "carry_more_food") ? 8 : 0);
}

// Collect a resource from the nodes nearest its place. Returns { got, ate, spot, first }.
export function gather(world, res, rand = Math.random) {
  const r = RESOURCES[res];
  const want = 2 + Math.floor(rand() * 3) + (bonus(world, `more_${res}`) ? 2 : 0);
  const center = PLACE_POS[r.place];
  const nodes = world.nodes.filter((n) => n.res === res && !n.dead && n.left >= 1).sort((a, b) => dist(a, center) - dist(b, center));
  let got = 0;
  let spot = null;
  for (const n of nodes) {
    while (got < want && n.left >= 1) {
      n.left = Math.round((n.left - 1) * 100) / 100;
      got++;
      spot = { x: n.x, z: n.z };
    }
    if (r.diesWhenEmpty && n.left < 1) n.dead = true; // cut right down: this tree is gone
    if (got >= want) break;
  }
  // Cutting a tree right down kills it. Collecting from plants can give seeds.
  let seeds = 0;
  if (r.seed && got) {
    seeds = Math.floor(rand() * (res === "berries" ? 3 : 2));
    world.seeds[r.seed] = Math.min(20, (world.seeds[r.seed] ?? 0) + seeds);
  }
  let ate = 0;
  let first = false;
  if (res === "berries") {
    ate = Math.min(got, 2);
    world.food = Math.min(foodCap(world), world.food + got - ate);
  } else {
    world.inventory[res] = (world.inventory[res] ?? 0) + got;
    if (got && !world.discovered.includes(res)) {
      world.discovered.push(res);
      first = true;
    }
  }
  return { got, ate, spot, first, seeds };
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
// Glorp can only build with materials it has discovered.
export function tidyBlocks(blocks, known = MATERIALS) {
  const L = BUILD_LIMITS;
  const allowed = known.length ? known : [];
  return (Array.isArray(blocks) ? blocks : []).slice(0, L.maxBlocks).map((b) => ({
    shape: pickFrom(b.shape, SHAPES, "box"),
    material: pickFrom(b.material, allowed, allowed[0]),
    x: clamp(b.x, -L.maxOffset, L.maxOffset, 0),
    y: clamp(b.y, 0, L.maxHeight, 0),
    z: clamp(b.z, -L.maxOffset, L.maxOffset, 0),
    w: clamp(b.w, 0.2, L.maxSize, 1),
    h: clamp(b.h, 0.2, L.maxSize, 1),
    d: clamp(b.d, 0.2, L.maxSize, 1),
    placed: false,
  })).filter((b) => b.material);
}

// Find a free spot for a new building near a place.
export function findBuildSpot(world, place) {
  const c = PLACE_POS[place] ?? PLACE_POS.nest;
  const n = world.structures.length;
  for (let i = 0; i < 80; i++) {
    const a = (n * 2.4 + i * 0.9) % (Math.PI * 2);
    const d = 6 + (i % 8) * 1.5;
    const p = { x: round1(c.x + Math.cos(a) * d), z: round1(c.z + Math.sin(a) * d) };
    if (Math.hypot(p.x, p.z) > 40) continue; // stay on the island
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
  if (open.length >= L.maxOpenProjects || world.structures.length >= L.maxStructures) return { error: "you already have too many unfinished projects" };
  if (!world.discovered.length) return { error: "you don't know any materials yet, so you couldn't plan how to build it" };
  const blocks = tidyBlocks(plan.blocks, world.discovered);
  if (!blocks.length) return { error: "the design had no usable blocks" };
  blocks.sort((a, b) => a.y - b.y);
  const place = PLACE_POS[plan.near] ? plan.near : "nest";
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
  return { structure: s };
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

// Make an invention: it costs materials, and some inventions really help.
export function invent(world, idea, now) {
  const cost = {};
  for (const m of MATERIALS) {
    const n = Math.max(0, Math.min(6, Math.round(Number(idea.materials?.[m] ?? 0))));
    if (n) cost[m] = n;
  }
  if (!Object.keys(cost).length) return { error: "an invention has to be made out of something" };
  const unknown = Object.keys(cost).filter((m) => !world.discovered.includes(m));
  if (unknown.length) return { error: `you haven't discovered ${unknown.join(" or ")} yet` };
  const short = Object.entries(cost).filter(([m, n]) => (world.inventory[m] ?? 0) < n).map(([m, n]) => `${n - (world.inventory[m] ?? 0)} more ${m}`);
  if (short.length) return { error: `you didn't have enough: you needed ${short.join(", ")}` };
  let helps = Object.keys(INVENTION_HELPS).includes(idea.helps) ? idea.helps : "nothing_yet";
  if (helps !== "nothing_yet" && bonus(world, helps)) helps = "nothing_yet"; // you already have something that does that
  for (const [m, n] of Object.entries(cost)) world.inventory[m] -= n;
  const inv = { name: String(idea.name || "Thing").slice(0, 60), about: String(idea.about || "").slice(0, 300), helps, cost, made: now.toISOString() };
  world.inventions.push(inv);
  if (world.inventions.length > 40) world.inventions.shift();
  return { invention: inv };
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
  if (rand() < 0.1) {
    if (world.food > 0) {
      world.food -= 1;
      events.push("The pigeon swooped down, stole one of your berries, and stared at you while eating it.");
    } else {
      const loot = ["shells", "fibre"].find((m) => (world.inventory[m] ?? 0) > 0);
      if (loot) {
        world.inventory[loot] -= 1;
        events.push(`The pigeon snatched 1 ${loot} from your pile and flew off with it.`);
      }
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
  if (world.weather === "rainy" && (world.inventory.clay ?? 0) > 0 && rand() < 0.25) {
    world.inventory.clay -= 1;
    events.push("The rain turned 1 of your clay into runny mud. It washed away.");
  }
  if (rand() < 0.05) {
    world.inventory.shells = (world.inventory.shells ?? 0) + 1;
    if (!world.discovered.includes("shells")) world.discovered.push("shells");
    events.push("A crab left a shiny shell right next to you. A gift? A trade? A threat?");
  }
  return events;
}

// Problems Glorp should know about, worked out from the state of the world.
export function problems(state) {
  const w = state.world;
  const out = [];
  if ((w.weather === "rainy" || w.weather === "windy") && !hasShelter(w)) out.push(`It is ${w.weather} and you have no roof over your head: you get soaked and cold, you feel less calm, and you sleep badly in the open nest. A shelter or house you build (and make your home) would fix that.`);
  if (state.needs.water < 30) out.push("You are thirsty. Water is at the pond.");
  if (w.food === 0 && state.needs.fullness < 60) out.push("You have no food kept. You'll need to forage berries to eat.");
  if ((state.health ?? 100) < 70) out.push(`Your health is ${state.health}/100 because you went without food or water. Eat, drink and rest.`);
  for (const res of Object.keys(RESOURCES)) {
    const left = resourceLeft(w, res);
    const r = RESOURCES[res];
    const comesBack = r.living ? "it only grows back where you tend the plants" : r.natural || r.rain ? "very little comes back by itself" : "it will never come back";
    if (left === 0) out.push(`There is no ${res} left to collect: ${comesBack}.`);
    else if (left <= 6) out.push(`Only ${left} ${res} left to collect on the island (${comesBack}).`);
  }
  const deadTrees = w.nodes.filter((n) => n.dead).length;
  if (deadTrees) out.push(`${deadTrees} trees have been cut right down and died. Only planted seeds make new trees.`);
  for (const s of w.structures.filter((s) => !s.finished)) {
    const { missing } = missingFor(w, s);
    const m = Object.entries(missing).map(([k, v]) => `${v} ${k}`).join(", ");
    if (m) out.push(`To finish "${s.name}" you still need: ${m}.`);
  }
  if (w.home == null) out.push("You still sleep in the open nest under the old tree. Rain and wind get in.");
  for (const n of NEEDS) if (state.needs[n] < 25) out.push(`Your ${n} is very low (${state.needs[n]}).`);
  return out;
}
