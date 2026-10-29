import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CREATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "glorp-"));
const { tick, isSleepTime, config } = await import("../src/life.js");
const { tidyDecision } = await import("../src/brain.js");

const cfg = { ...config({}), sleepFrom: 23, sleepUntil: 7 };

// A pretend Claude client that records the request and returns a canned decision.
function fakeClient(decision, usage = { input_tokens: 2000, output_tokens: 500 }) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => {
      calls.push(params);
      return { model: params.model, stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(decision) }] };
    } } },
  };
}

const base = {
  thought: "Hmm.", activity: "make_something", go_to: null, diary: "I wrote a poem.", mood: "proud",
  creation: { kind: "poem", title: "Ode to a Bottle Cap", content: "Shiny circle,\nyou are mine." },
  new_hobby: { id: "Pebble Museum", place: "Nest", about: "curate pebbles", minutes: 500, effects: { fullness: 0, water: 0, energy: 10, curiosity: 90, joy: 10, calm: 5 } },
  new_wish: "ride a train", wish_done: null, remember: "I was born on a Thursday.",
  concern: "the pigeon is watching me", concern_solved: null, plan: "make things, then build a tower", build_target: null, new_project: null, day_plan: null, plan_done: null, day_summary: null, lesson: null, face: "happy", discovery: null, new_invention: null, make_home: null,
};

test("sleep window wraps past midnight", () => {
  assert.equal(isSleepTime(new Date("2026-10-29T23:30:00"), 23, 7), true);
  assert.equal(isSleepTime(new Date("2026-10-29T03:00:00"), 23, 7), true);
  assert.equal(isSleepTime(new Date("2026-10-29T12:00:00"), 23, 7), false);
});

test("a tick sends a well-formed request and applies the decision", async () => {
  const client = fakeClient(base);
  const r = await tick({ now: new Date("2026-10-29T10:00:00"), cfg, client });
  const req = client.calls[0];
  assert.equal(req.model, "claude-opus-5-5");
  assert.equal(req.output_config.effort, "low");
  assert.equal(req.output_config.format.type, "json_schema");
  assert.equal(req.fallbacks, "default");
  assert.match(req.messages[0].content, /What do you do next\?/);

  assert.equal(r.result, "acted");
  assert.equal(r.state.place, "meadow");
  assert.ok(fs.existsSync(r.creationFile));
  // Invented hobby is cleaned up and limited.
  const h = r.state.hobbies[0];
  assert.equal(h.id, "pebble_museum");
  assert.equal(h.place, "nest");
  assert.equal(h.minutes, 120);
  assert.equal(h.effects.curiosity, 25);
  assert.ok(h.effects.energy <= -3);
  assert.equal(r.state.wishes[0].text, "ride a train");
  assert.ok(r.usd > 0);
});

test("busy, asleep and out-of-budget ticks make no AI call", async () => {
  const client = fakeClient({ ...base, new_hobby: null, creation: null, activity: "eat_food" });
  const busy = await tick({ now: new Date("2026-10-29T10:10:00"), cfg, client });
  assert.equal(busy.result, "busy");
  const asleep = await tick({ now: new Date("2026-10-29T23:30:00"), cfg, client });
  assert.equal(asleep.result, "asleep");
  const broke = await tick({ now: new Date("2026-10-30T10:00:00"), cfg: { ...cfg, dailyBudget: 0 }, client });
  assert.equal(broke.result, "out-of-budget");
  assert.equal(client.calls.length, 0);
});

test("invented hobbies show up as choices next time", async () => {
  const client = fakeClient({ ...base, activity: "pebble museum", new_hobby: null, creation: null });
  const r = await tick({ now: new Date("2026-10-30T12:00:00"), cfg, client });
  assert.match(client.calls[0].messages[0].content, /pebble_museum \(your own hobby\)/);
  assert.equal(r.decision.activity, "pebble_museum");
  assert.equal(r.state.place, "nest");
});

test("unknown activity names fall back to wandering", () => {
  const d = tidyDecision({ ...base, activity: "fly to the moon", go_to: "Hill" }, ["wander", "nap"]);
  assert.equal(d.activity, "wander");
  assert.equal(d.go_to, "hill");
});

test("subscription brain calls the Claude Code CLI with a JSON schema", async () => {
  const { think } = await import("../src/brain.js");
  const { newState } = await import("../src/state.js");
  let seen;
  const runClaude = async (args) => {
    seen = args;
    return { stdout: JSON.stringify({ is_error: false, structured_output: { ...base, activity: "eat_food", creation: null, new_hobby: null } }) };
  };
  const { decision, usd } = await think(newState(), [], new Date(), { brain: "claude-code", runClaude });
  assert.equal(decision.activity, "eat_food");
  assert.equal(usd, 0);
  assert.ok(seen.includes("--json-schema"));
  assert.equal(seen[seen.indexOf("--tools") + 1], "");
});

test("config picks the subscription brain when only an OAuth token is set", () => {
  assert.equal(config({ CLAUDE_CODE_OAUTH_TOKEN: "x" }).brain, "claude-code");
  assert.equal(config({ ANTHROPIC_API_KEY: "x" }).brain, "api");
});
