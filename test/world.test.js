import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CREATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "glorp-world-"));
const { tick, config } = await import("../src/life.js");
const W = await import("../src/world.js");
const { upgradeState, saveState } = await import("../src/state.js");

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
  thought: "Hmm.", activity: "chop_wood", go_to: null, diary: "Did a thing.", mood: "busy",
  creation: null, new_hobby: null, new_wish: null, wish_done: null, remember: null,
  concern: null, concern_solved: null, plan: null, build_target: null, new_project: null,
};

test("an old Glorp without an island gets one", () => {
  const s = upgradeState({ place: "garden", needs: {}, hobbies: [] });
  assert.ok(s.world.nodes.length > 30);
  assert.deepEqual(s.spot, W.PLACE_POS.garden);
  assert.deepEqual(s.concerns, []);
});

test("the island is the same every time", () => {
  assert.deepEqual(W.newWorld(), W.newWorld());
});

test("chopping wood collects wood and moves Glorp to a tree", async () => {
  const r = await tick({ now: new Date("2026-11-02T10:00:00"), cfg, client: client({ ...base, concern: "trees might run out" }), rand: noEvents });
  assert.ok(r.gathered.wood >= 2);
  assert.equal(r.state.world.inventory.wood, r.gathered.wood);
  assert.equal(r.state.place, "forest");
  assert.ok(r.state.world.nodes.some((n) => n.x === r.state.spot.x && n.z === r.state.spot.z && n.res === "wood"));
  assert.equal(r.state.concerns[0].text, "trees might run out");
});

test("a project is designed, placed on the island and built block by block", async () => {
  const blocks = [
    { shape: "box", material: "wood", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 },
    { shape: "pyramid??", material: "glitter", x: 99, y: -5, z: 0, w: 50, h: 1, d: 1 },
    { shape: "cone", material: "stone", x: 0, y: 2, z: 0, w: 1, h: 1, d: 1 },
  ];
  const d = { ...base, activity: "build", new_project: { name: "Pigeon Watchtower", purpose: "see the pigeon coming", near: "Garden", blocks } };
  const r = await tick({ now: new Date("2026-11-02T12:00:00"), cfg, client: client(d), rand: noEvents });
  const s = r.state.world.structures[0];
  assert.equal(s.name, "Pigeon Watchtower");
  assert.equal(s.place, "garden");
  assert.equal(s.blocks[1].shape, "box");
  assert.equal(s.blocks[1].material, "wood");
  assert.equal(s.blocks[1].x, W.BUILD_LIMITS.maxOffset);
  assert.equal(s.blocks[1].w, W.BUILD_LIMITS.maxSize);
  // Has wood but no stone: places the wood blocks, then gets stuck on stone.
  assert.ok(r.built.placed >= 1);
  assert.equal(r.built.stuck.material, "stone");
  assert.equal(r.built.finished, false);
  assert.deepEqual(r.state.spot, { x: s.x, z: s.z });
});

test("an empty cupboard means a poor snack", async () => {
  const st = (await import("../src/state.js")).loadState();
  st.world.pantry = 0;
  st.busyUntil = null;
  saveState(st);
  st.needs.fullness = 20;
  st.lastUpdate = new Date("2026-11-02T14:00:00").toISOString();
  saveState(st);
  const r = await tick({ now: new Date("2026-11-02T14:00:00"), cfg, client: client({ ...base, activity: "snack" }), rand: noEvents });
  assert.equal(r.state.world.pantry, 0);
  assert.equal(r.state.needs.fullness, 25);
});

test("the problems list notices an empty cupboard and missing materials", () => {
  const w = W.newWorld();
  w.pantry = 0;
  W.startProject(w, { name: "Hut", near: "burrow", blocks: [{ shape: "box", material: "stone", w: 1, h: 1, d: 1 }] }, new Date());
  const p = W.problems({ world: w, needs: { fullness: 50, energy: 50, curiosity: 50, joy: 50, calm: 50 } });
  assert.ok(p.some((x) => /cupboard is EMPTY/.test(x)));
  assert.ok(p.some((x) => /"Hut".*1 stone/.test(x)));
});

test("wind can knock a block off and the pigeon steals", () => {
  const w = W.newWorld();
  w.inventory.scrap = 2;
  w.weather = "windy";
  const s = W.startProject(w, { name: "Tower", near: "hill", blocks: [{ shape: "box", material: "scrap", w: 1, h: 1, d: 1 }] }, new Date());
  w.inventory.scrap = 5;
  W.buildOn(w, s, new Date());
  assert.ok(s.finished);
  const ev = W.worldEvents(w, () => 0.01);
  assert.ok(ev.some((e) => /pigeon/.test(e)));
  assert.ok(ev.some((e) => /gust/.test(e)));
  assert.equal(s.finished, null);
});

test("resources grow back but not past their maximum", () => {
  const w = W.newWorld();
  const tree = w.nodes.find((n) => n.res === "wood");
  tree.left = 0;
  W.regrow(w, 10);
  assert.ok(tree.left > 1 && tree.left <= W.RESOURCES.wood.max);
  W.regrow(w, 1000);
  assert.equal(tree.left, W.RESOURCES.wood.max);
});
