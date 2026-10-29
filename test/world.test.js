import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CREATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "glorp-world-"));
const { tick, config, autopilot, reasonToThink } = await import("../src/life.js");
const W = await import("../src/world.js");
const { loadState, saveState, newState, decayNeeds } = await import("../src/state.js");
const { surroundings, dayKey, isLastMoment, timeOfDay } = await import("../src/brain.js");

const cfg = { ...config({}), sleepFrom: 23, sleepUntil: 7 };
const noEvents = () => 0.99; // a random source that never triggers world events

function client(decision) {
  const calls = [];
  return { calls, beta: { messages: { create: async (p) => {
    calls.push(p);
    return { model: p.model, stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: "text", text: JSON.stringify(decision) }] };
  } } } };
}

const base = {
  thought: "Hmm.", activity: "collect_wood", go_to: null, diary: "Did a thing.", mood: "busy", face: "curious",
  creation: null, new_hobby: null, new_wish: null, wish_done: null, remember: null,
  concern: null, concern_solved: null, plan: null, build_target: null, new_project: null,
  day_plan: null, plan_done: null, day_summary: null, lesson: null, discovery: null, new_invention: null, make_home: null,
  free_action: null,
};

function ready() {
  const st = loadState();
  st.busyUntil = null;
  saveState(st);
  return st;
}

test("an old Glorp is reborn as a newborn and its past life is kept", () => {
  const dir = process.env.CREATURE_DATA_DIR;
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ place: "garden", needs: {}, hobbies: [] }));
  fs.writeFileSync(path.join(dir, "diary.jsonl"), '{"time":"x"}\n');
  const s = loadState();
  assert.equal(s.place, "nest");
  assert.deepEqual(s.world.discovered, []);
  assert.ok(fs.existsSync(path.join(dir, "past-life", "diary.jsonl")));
  assert.ok(!fs.existsSync(path.join(dir, "diary.jsonl")));
  saveState(s);
});

test("the island is the same every time and has no man-made things", () => {
  assert.deepEqual(W.newWorld(), W.newWorld());
  for (const p of ["kitchen", "workshop", "window", "junkpile"]) assert.equal(W.PLACES[p], undefined);
});

test("collecting wood discovers it and moves Glorp to a tree", async () => {
  ready();
  const c = client({ ...base, concern: "trees might run out" });
  const r = await tick({ now: new Date("2026-11-02T10:00:00"), cfg, client: c, rand: noEvents });
  assert.match(c.calls[0].messages[0].content, /Materials you have discovered: none yet/);
  assert.ok(r.gathered.wood >= 2);
  assert.deepEqual(r.state.world.discovered, ["wood"]);
  assert.equal(r.state.place, "forest");
  assert.ok(r.state.world.nodes.some((n) => n.x === r.state.spot.x && n.z === r.state.spot.z && n.res === "wood"));
  assert.match(r.state.lastOutcome.join(" "), /first wood you ever held/);
});

test("Glorp can only build with materials it has discovered", async () => {
  ready();
  const blocks = [
    { shape: "box", material: "wood", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 },
    { shape: "pyramid??", material: "stone", x: 99, y: -5, z: 0, w: 50, h: 1, d: 1 },
  ];
  const d = { ...base, activity: "build", new_project: { name: "Rain Hat", purpose: "keep rain off", near: "Nest", blocks } };
  const r = await tick({ now: new Date("2026-11-02T12:00:00"), cfg, client: client(d), rand: noEvents });
  const s = r.state.world.structures[0];
  assert.equal(s.place, "nest");
  assert.ok(s.blocks.every((b) => b.material === "wood")); // stone isn't known yet
  assert.equal(s.blocks[1].x, W.BUILD_LIMITS.maxOffset);
  assert.ok(r.built.placed >= 1);
  assert.deepEqual(r.state.spot, { x: s.x, z: s.z });
});

test("inventions cost materials and really help", async () => {
  const st = ready();
  st.world.inventory.wood = 5;
  saveState(st);
  const d = { ...base, activity: "experiment", discovery: "Sticks are better when there are two of them.",
    new_invention: { name: "Poking Stick", about: "a stick for knocking branches down", materials: { wood: 2, stone: 0, clay: 0, fibre: 0, shells: 0 }, helps: "more_wood" } };
  const r = await tick({ now: new Date("2026-11-02T14:00:00"), cfg, client: client(d), rand: noEvents });
  assert.equal(r.state.world.inventions[0].helps, "more_wood");
  assert.equal(r.state.world.inventory.wood, 3);
  assert.equal(r.state.knowledge.at(-1).text, "Sticks are better when there are two of them.");
  const st2 = ready(); st2.world.inventory.wood = 0; saveState(st2);
  const d2 = { ...d, discovery: null, new_invention: { ...d.new_invention, name: "Big Stick", helps: "better_sleep" } };
  const r2 = await tick({ now: new Date("2026-11-02T15:00:00"), cfg, client: client(d2), rand: noEvents });
  assert.equal(r2.state.world.inventions.length, 1);
  assert.match(r2.state.lastOutcome.join(" "), /failed: you didn't have enough/);
});

test("eating with no food kept barely helps", async () => {
  const st = ready();
  st.world.food = 0; st.needs.fullness = 20; st.lastUpdate = new Date("2026-11-02T16:00:00").toISOString();
  saveState(st);
  const r = await tick({ now: new Date("2026-11-02T16:00:00"), cfg, client: client({ ...base, activity: "eat_food" }), rand: noEvents });
  assert.equal(r.state.needs.fullness, 20);
  assert.match(r.state.lastOutcome.join(" "), /no food kept/);
});

test("plants only grow back when tended, stone never, and a tree cut to nothing dies", () => {
  const w = W.newWorld();
  const now = new Date("2026-11-05T10:00:00");
  const bush = w.nodes.find((n) => n.res === "berries");
  bush.left = 0;
  W.regrow(w, 10, now);
  assert.equal(bush.left, 0);
  W.tend(w, "thicket", now);
  W.regrow(w, 5, now);
  assert.ok(bush.left >= 1);
  const rock = w.nodes.find((n) => n.res === "stone"); rock.left = 0;
  W.tend(w, "rocks", now); W.regrow(w, 100, now);
  assert.equal(rock.left, 0);
  for (let i = 0; i < 40; i++) W.gather(w, "wood", () => 0.99);
  assert.ok(w.nodes.filter((n) => n.res === "wood").every((n) => n.dead));
  W.tend(w, "forest", now); W.regrow(w, 100, now);
  assert.equal(W.resourceLeft(w, "wood"), 0);
});

test("planted seeds become seedlings that grow only while tended", () => {
  const w = W.newWorld();
  const now = new Date("2026-11-05T10:00:00");
  w.seeds = { tree: 2, berry: 1 };
  const p = W.plant(w, "meadow", now, W.seeded(5));
  assert.equal(p.tree + p.berry, 3);
  const seedlings = w.nodes.filter((n) => n.planted);
  assert.equal(seedlings.length, 3);
  W.regrow(w, 20, now);
  assert.ok(seedlings.every((n) => n.left === 0));
  W.tend(w, "meadow", now);
  W.regrow(w, 20, now);
  assert.ok(seedlings.every((n) => n.left >= 1));
});

test("going without food or water hurts health", () => {
  const s = newState(new Date("2026-11-05T08:00:00"));
  s.needs.fullness = 0; s.needs.water = 0;
  decayNeeds(s, new Date("2026-11-05T13:00:00"));
  assert.equal(s.health, 70);
});

test("the problems list notices thirst, no food and missing materials", () => {
  const w = W.newWorld();
  w.discovered = ["stone"];
  W.startProject(w, { name: "Hut", near: "nest", blocks: [{ shape: "box", material: "stone", w: 1, h: 1, d: 1 }] }, new Date());
  const p = W.problems({ world: w, health: 100, needs: { fullness: 30, water: 10, energy: 50, curiosity: 50, joy: 50, calm: 50 } });
  assert.ok(p.some((x) => /thirsty/.test(x)));
  assert.ok(p.some((x) => /no food kept/.test(x)));
  assert.ok(p.some((x) => /"Hut".*1 stone/.test(x)));
});

test("wind can knock a block off and the pigeon steals food", () => {
  const w = W.newWorld();
  w.discovered = ["fibre"];
  w.weather = "windy";
  w.food = 2;
  const { structure: s } = W.startProject(w, { name: "Tower", near: "hill", blocks: [{ shape: "box", material: "fibre", w: 1, h: 1, d: 1 }] }, new Date());
  w.inventory.fibre = 5;
  W.buildOn(w, s, new Date());
  assert.ok(s.finished);
  const ev = W.worldEvents(w, () => 0.01);
  assert.ok(ev.some((e) => /pigeon/.test(e)));
  assert.equal(w.food, 1);
  assert.ok(ev.some((e) => /gust/.test(e)));
  assert.equal(s.finished, null);
});

test("Glorp plans its day in the morning, ticks things off, and reflects at bedtime", async () => {
  ready();
  const c1 = client({ ...base, activity: "drink", day_plan: ["drink", "find food", "build a shelter", "watch the sky"], plan_done: [1] });
  const r1 = await tick({ now: new Date("2026-11-03T07:30:00"), cfg, client: c1, rand: noEvents });
  assert.match(c1.calls[0].messages[0].content, /first moment awake today/);
  assert.match(c1.calls[0].messages[0].content, /just woke up/);
  assert.equal(r1.state.today.plan.length, 4);
  assert.deepEqual(r1.state.today.done, [1]);
  const st2 = loadState(); st2.busyUntil = new Date("2026-11-03T23:59:00").toISOString(); saveState(st2);
  const c2 = client({ ...base, activity: "nap", plan_done: [2, 9], day_summary: "A good day. The pigeon remains a mystery." });
  const r2 = await tick({ now: new Date("2026-11-03T22:35:00"), cfg, client: c2, rand: noEvents });
  assert.match(c2.calls[0].messages[0].content, /LAST moment before sleep/);
  assert.match(c2.calls[0].messages[0].content, /2\. \[ \] find food/);
  assert.deepEqual(r2.state.today.done, [1, 2]);
  assert.equal(r2.state.days.at(-1).summary, "A good day. The pigeon remains a mystery.");
  const r3 = await tick({ now: new Date("2026-11-03T22:50:00"), cfg, client: c2, rand: noEvents });
  assert.equal(r3.result, "busy");
});

test("Glorp knows what is around it, keeps lessons, and sleeps at home", async () => {
  const st = ready();
  st.place = "forest"; st.spot = { ...W.PLACE_POS.forest };
  saveState(st);
  assert.match(surroundings(st), /tree/);
  const c = client({ ...base, activity: "collect_wood", lesson: "Don't cut a tree all the way down." });
  const r = await tick({ now: new Date("2026-11-04T10:00:00"), cfg, client: c, rand: noEvents });
  assert.match(c.calls[0].messages[0].content, /Around you: .*tree/);
  assert.equal(r.state.lessons.at(-1), "Don't cut a tree all the way down.");
  const asleep = await tick({ now: new Date("2026-11-04T23:30:00"), cfg, client: c, rand: noEvents });
  assert.equal(asleep.state.place, "nest");
  assert.match(asleep.state.doing, /asleep in the nest/);
});

test("Glorp is nocturnal by default: its day runs through the night", () => {
  const owl = config({});
  assert.equal(owl.sleepFrom, 11);
  assert.equal(owl.sleepUntil, 19);
  // 3am belongs to the day that started the evening before
  assert.equal(dayKey(new Date("2026-11-04T03:00:00"), 19), "2026-11-03");
  assert.equal(dayKey(new Date("2026-11-04T20:00:00"), 19), "2026-11-04");
  assert.ok(isLastMoment(new Date("2026-11-04T10:30:00"), owl));
  assert.ok(!isLastMoment(new Date("2026-11-04T22:30:00"), owl));
  assert.match(timeOfDay(new Date("2026-11-04T19:30:00"), owl), /just woke up.*nocturnal/);
});

test("Glorp only stops to think when something calls for it, and otherwise acts on instinct", async () => {
  const now = new Date("2026-11-05T21:00:00");
  const owl = { ...cfg, sleepFrom: 11, sleepUntil: 19 };
  const st = ready();
  st.today = { date: "2026-11-05", plan: ["drink"], done: [] };
  st.lastThought = new Date(now - 10 * 60_000).toISOString();
  st.lastUpdate = now.toISOString();
  st.health = 100;
  Object.assign(st.needs, { fullness: 80, water: 30, energy: 80, curiosity: 60, joy: 60, calm: 60 });
  saveState(st);
  const c = client({ ...base });
  const r = await tick({ now, cfg: owl, client: c, rand: noEvents });
  assert.equal(c.calls.length, 0); // thirst is handled by instinct, no thinking needed
  assert.equal(r.result, "auto");
  assert.equal(r.decision.activity, "drink");
  assert.ok(r.state.needs.water > 30);
  assert.equal(r.state.spend.ticks, 0); // instinct uses none of the daily thoughts
  // Nothing to do and nothing on its mind: it just potters about.
  const st2 = ready(); st2.lastThought = now.toISOString(); st2.world.structures = []; saveState(st2);
  const r2 = await tick({ now: new Date(now.getTime() + 20 * 60_000), cfg: owl, client: c, rand: noEvents });
  assert.equal(r2.result, "pottering");
  assert.equal(c.calls.length, 0);
  // After a long quiet spell, or when something happens, it thinks.
  assert.match(reasonToThink(st2, new Date(now.getTime() + 90 * 60_000), owl, { rand: noEvents }), /free/);
  assert.match(reasonToThink(st2, now, owl, { events: ["The pigeon stole a berry."], rand: noEvents }), /happened/);
  // Passion: an unfinished building with materials keeps it busy.
  const w = W.newWorld(); w.discovered = ["wood"]; w.inventory.wood = 5;
  W.startProject(w, { name: "Perch", near: "nest", blocks: [{ shape: "box", material: "wood", w: 1, h: 1, d: 1 }] }, now);
  const habit = autopilot({ ...st2, needs: { fullness: 80, water: 80, energy: 80, curiosity: 60, joy: 60, calm: 60 }, world: w });
  assert.equal(habit.activity, "build");
});

test("Glorp can do anything it imagines, within honest limits", async () => {
  const st = ready();
  st.place = "nest"; st.needs = { ...st.needs, energy: 80, water: 80, fullness: 80, joy: 50 };
  saveState(st);
  const r = await tick({ now: new Date("2026-11-02T10:00:00"), cfg, client: client({ ...base, activity: "do_anything", go_to: "meadow",
    free_action: { what: "Teach the crabs a dance.", minutes: 999, effects: { fullness: 0, water: 0, energy: 0, curiosity: 0, joy: 100, calm: 0 } } }), rand: noEvents });
  assert.equal(r.state.place, "meadow");
  assert.match(r.state.doing, /^teach the crabs a dance/i);
  assert.equal(r.state.needs.joy, 75); // clamped to +25
  assert.ok(new Date(r.state.busyUntil) - new Date("2026-11-02T10:00:00") <= 120 * 60_000);
});

test("exploring finds hidden places, and Glorp can only go where it knows", async () => {
  const st = ready();
  st.world.known = ["nest", "meadow", "pond", "thicket"];
  st.place = "nest"; st.spot = { ...W.PLACE_POS.nest }; st.needs = { ...st.needs, energy: 80, water: 80, fullness: 80, curiosity: 30 };
  saveState(st);
  const a = await tick({ now: new Date("2026-11-03T10:00:00"), cfg, client: client({ ...base, activity: "explore", go_to: "cliffs" }), rand: noEvents });
  const found = a.state.world.known.at(-1);
  assert.equal(a.state.world.known.length, 5);
  assert.equal(a.state.place, found); // couldn't head for the unknown cliffs by name, so explored instead
  assert.ok(!["nest", "meadow", "pond", "thicket"].includes(found));
  a.state.needs = { fullness: 80, water: 80, energy: 80, curiosity: 60, joy: 60, calm: 60 }; a.state.health = 100;
  a.state.today = { date: dayKey(new Date("2026-11-03T10:40:00"), 7), plan: [], done: [] };
  assert.equal(reasonToThink(a.state, new Date("2026-11-03T10:40:00"), cfg, { rand: noEvents }), `you just found somewhere new: the ${found}`);
  // Restless curiosity makes Glorp go exploring on its own.
  a.state.needs.curiosity = 30; a.state.world.structures = [];
  assert.equal(autopilot(a.state).activity, "explore");
  a.state.world.known = Object.keys(W.PLACES);
  assert.equal(autopilot(a.state), null);
});

test("rain is miserable without a roof and cosy in a home Glorp built", () => {
  const st = newState(new Date("2026-11-04T10:00:00"));
  st.world.weather = "rainy";
  assert.ok(W.problems(st).some((p) => /no roof/.test(p)));
  const wet = structuredClone(st);
  decayNeeds(wet, new Date("2026-11-04T12:00:00"), { asleep: true });
  st.world.structures.push({ id: 1, name: "Hut", finished: "x", blocks: [] }); st.world.home = 1;
  decayNeeds(st, new Date("2026-11-04T12:00:00"), { asleep: true });
  assert.ok(st.needs.energy > wet.needs.energy && st.needs.calm > wet.needs.calm);
  assert.ok(!W.problems(st).some((p) => /no roof/.test(p)));
});
