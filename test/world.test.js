import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CREATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "glorp-world-"));
const { tick, config } = await import("../src/life.js");
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
