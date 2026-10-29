// Glorp's brain: asks Claude what to do next and gets back a structured decision.
import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describeCreature } from "./personality.js";
import {
  NEEDS, PLACES, MATERIALS, SHAPES, BUILD_LIMITS, RESOURCES, allActivities, missingFor, problems, resourceLeft,
} from "./world.js";

// US dollars per million tokens: [input, output]
const PRICES = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

const placeIds = Object.keys(PLACES);

export function decisionSchema(activityIds) {
  const effects = z.object(Object.fromEntries(NEEDS.map((n) => [n, z.number()])));
  return z.object({
    thought: z.string().describe("Your private thought right now, one or two sentences."),
    activity: z.string().describe(`The activity you do next. One of: ${activityIds.join(", ")}.`),
    go_to: z.string().nullable().describe(`Only for 'wander': where you walk to, one of: ${placeIds.join(", ")}. Otherwise null.`),
    diary: z.string().describe("Diary entry about what you just did and why, 2-5 sentences, in your voice."),
    mood: z.string().describe("Your mood in a few words."),
    creation: z
      .object({
        kind: z.string().describe("poem, song lyrics, drawing description, recipe, invention plan, story, map, theory, etc."),
        title: z.string(),
        content: z.string().describe("The full creation itself, not a summary."),
      })
      .nullable()
      .describe("Something you made this turn. Required for 'make_something'; allowed for hobbies that make things. Otherwise null."),
    new_hobby: z
      .object({
        id: z.string().describe("short snake_case id, e.g. pebble_museum"),
        place: z.string().describe(`One of: ${placeIds.join(", ")}.`),
        about: z.string().describe("what doing this hobby means"),
        minutes: z.number(),
        effects: effects.describe("How doing it changes each need, from -20 to +25."),
      })
      .nullable()
      .describe("Only when you genuinely discover a new hobby you want to keep doing. Rare. Otherwise null."),
    new_wish: z.string().nullable().describe("Something new you want (to do, make, learn, get). Otherwise null."),
    wish_done: z.number().nullable().describe("Number of a wish from your list that you just fulfilled. Otherwise null."),
    remember: z.string().nullable().describe("A long-term memory worth keeping forever. Rare. Otherwise null."),
    concern: z.string().nullable().describe("A new worry or problem on your mind (something you want to solve). Otherwise null."),
    concern_solved: z.number().nullable().describe("Number of a worry from your list that is now solved or no longer matters. Otherwise null."),
    plan: z.string().nullable().describe("Your current plan in a few short steps, if it changed (e.g. 'get 6 stone, then finish the tower, then watch trains from it'). Otherwise null to keep the old plan."),
    build_target: z.number().nullable().describe("Only for 'build': the number of the project to work on. Otherwise null."),
    new_project: z
      .object({
        name: z.string().describe("What you call it."),
        purpose: z.string().describe("Why you are building it: what problem it solves or why you want it."),
        near: z.string().describe(`Which place to build it near, one of: ${placeIds.join(", ")}.`),
        blocks: z
          .array(
            z.object({
              shape: z.string().describe(SHAPES.join(" | ")),
              material: z.string().describe(MATERIALS.join(" | ")),
              x: z.number().describe(`metres east of the project centre, -${BUILD_LIMITS.maxOffset} to ${BUILD_LIMITS.maxOffset}`),
              y: z.number().describe(`metres above the ground to the block's bottom, 0 to ${BUILD_LIMITS.maxHeight}`),
              z: z.number().describe(`metres south of the project centre, -${BUILD_LIMITS.maxOffset} to ${BUILD_LIMITS.maxOffset}`),
              w: z.number().describe(`width 0.2 to ${BUILD_LIMITS.maxSize}`),
              h: z.number().describe(`height 0.2 to ${BUILD_LIMITS.maxSize}`),
              d: z.number().describe(`depth 0.2 to ${BUILD_LIMITS.maxSize}`),
            }),
          )
          .describe(`The 3D design, 1 to ${BUILD_LIMITS.maxBlocks} blocks, bottom blocks first. You are about 1.5 metres tall including your crest.`),
      })
      .nullable()
      .describe("Design a new building project (it appears in the world and you build it block by block with 'build'). Only when you really want to build something. Otherwise null."),
  });
}

const SYSTEM = `${describeCreature()}

How your life works:
- Every so often you wake up and decide what to do next. You pick one activity from the list you are given.
- You have five needs from 0 to 100: fullness, energy, curiosity, joy, calm. Low needs make you grumpy, sleepy or restless. Look after yourself, but you are free to be silly.
- You grow over time: you make things, invent hobbies, keep wishes, and remember what matters. Build on what you did before instead of repeating yourself. Follow your own interests and let them get deeper and stranger.
- When you make something, actually make it in full (write the poem, the song, the recipe, the plan).
- You live on a small island. You can scavenge wood, stone, shells and scrap, and pick berries to keep the kitchen cupboard stocked. Resources run out and grow back slowly, so think ahead.
- You can design buildings and contraptions out of blocks (boxes, cylinders, cones, spheres) and build them over several turns. They stay in the world for good. Build things that solve your problems or make your island better or stranger: shelters, towers, pigeon defences, bridges, statues of yourself, anything.
- Things go wrong: the pigeon steals, wind knocks blocks off, the cupboard empties. Notice problems, worry about them, make plans, and solve them step by step. Keep track of your worries and your plan.
- Keep the diary entry true to what you did this turn.`;

export function buildSituation(state, diary, now, opts = {}) {
  const acts = allActivities(state);
  const lines = [];
  lines.push(`It is ${now.toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", day: "numeric", month: "long" })}.`);
  lines.push(`You are at the ${state.place}: ${PLACES[state.place]}.`);
  lines.push(`You were last: ${state.doing}. Mood: ${state.mood}.`);
  lines.push("");
  lines.push("Your needs: " + NEEDS.map((n) => `${n} ${state.needs[n]}`).join(", "));
  lines.push("");
  lines.push("Activities you can do (place, minutes, need changes):");
  for (const [id, a] of Object.entries(acts)) {
    const fx = Object.entries(a.effects).filter(([, v]) => v).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ");
    lines.push(`- ${id}${a.invented ? " (your own hobby)" : ""}: ${a.about}. [${a.place ?? "anywhere"}, ${a.minutes} min, ${fx}]`);
  }
  const w = state.world;
  lines.push("");
  lines.push(`Weather: ${w.weather}. Kitchen cupboard: ${w.pantry} berries.`);
  lines.push(`Your materials: ${MATERIALS.map((m) => `${m} ${w.inventory[m] ?? 0}`).join(", ")}.`);
  lines.push("Left to collect on the island: " + Object.keys(RESOURCES).map((r) => `${r} ${resourceLeft(w, r)}`).join(", ") + ".");
  lines.push(`Block cost: 1 material for small blocks, up to 4 for big ones (cost = 1 + volume/2).`);
  lines.push("");
  lines.push("Your building projects:");
  if (!w.structures.length) lines.push("(none yet)");
  for (const s of w.structures.slice(-12)) {
    const done = s.blocks.filter((b) => b.placed).length;
    const status = s.finished ? "finished" : `${done}/${s.blocks.length} blocks placed, still needs ${Object.entries(missingFor(w, s).need).map(([k, v]) => `${v} ${k}`).join(", ")}`;
    lines.push(`${s.id}. "${s.name}" near the ${s.place}: ${s.purpose} [${status}]`);
  }
  if (opts.events?.length) {
    lines.push("");
    lines.push("Just happened:");
    lines.push(opts.events.map((e) => `- ${e}`).join("\n"));
  }
  const probs = problems(state);
  lines.push("");
  lines.push("Problems you can see:");
  lines.push(probs.length ? probs.map((p) => `- ${p}`).join("\n") : "(none right now)");
  lines.push("");
  lines.push("Your worries:");
  const worries = state.concerns.map((c, i) => ({ ...c, n: i + 1 })).filter((c) => !c.resolved).slice(-8);
  lines.push(worries.length ? worries.map((c) => `${c.n}. ${c.text}`).join("\n") : "(none)");
  lines.push(`Your current plan: ${state.plan ?? "(no plan yet)"}`);
  lines.push("");
  lines.push("Your wishes:");
  const open = state.wishes.map((w, i) => ({ ...w, n: i + 1 })).filter((w) => !w.done);
  lines.push(open.length ? open.map((w) => `${w.n}. ${w.text}`).join("\n") : "(none yet)");
  lines.push("");
  lines.push("Things you have made:");
  lines.push(state.creations.length ? state.creations.slice(-15).map((c) => `- ${c.kind}: ${c.title}`).join("\n") : "(nothing yet)");
  lines.push("");
  lines.push("Long-term memories:");
  lines.push(state.memories.length ? state.memories.map((m) => `- ${m}`).join("\n") : "(none yet)");
  lines.push("");
  lines.push("Your recent diary:");
  lines.push(diary.length ? diary.map((d) => `[${d.time.slice(0, 16).replace("T", " ")}] ${d.activity}: ${d.diary}`).join("\n") : "(empty: this is your first day alive)");
  lines.push("");
  lines.push("What do you do next?");
  return lines.join("\n");
}

export async function think(state, diary, now, opts = {}) {
  const acts = allActivities(state);
  const schema = decisionSchema(Object.keys(acts));
  if (opts.fake) return { decision: fakeDecision(state, acts), usd: 0 };
  if (opts.brain === "claude-code") return thinkWithClaudeCode(state, diary, now, schema, Object.keys(acts), opts);

  const model = opts.model || "claude-opus-5-5";
  const client = opts.client || new Anthropic();
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: opts.effort || "low", format: zodOutputFormat(schema) },
    // If a safety check declines the request, the API retries it on another model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: buildSituation(state, diary, now, opts) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined this turn (${response.stop_details?.category ?? "no category"})`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("Response was cut off (max_tokens)");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const decision = tidyDecision(schema.parse(JSON.parse(text)), Object.keys(acts));

  const [inP, outP] = PRICES[response.model] || PRICES[model] || PRICES["claude-opus-5-5"];
  const u = response.usage;
  const inputTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  const usd = (inputTokens * inP + u.output_tokens * outP) / 1_000_000;
  return { decision, usd };
}

// Think using the Claude Code CLI, which can run on a Claude subscription
// (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`) instead of a paid API key.
async function thinkWithClaudeCode(state, diary, now, schema, activityIds, opts) {
  const args = [
    "-p", buildSituation(state, diary, now, opts),
    "--system-prompt", SYSTEM,
    "--output-format", "json",
    "--json-schema", JSON.stringify(zodOutputFormat(schema).schema),
    "--tools", "",
    "--effort", opts.effort || "low",
    "--no-session-persistence",
    "--setting-sources", "",
    "--strict-mcp-config",
  ];
  if (opts.model) args.push("--model", opts.model);
  const run = opts.runClaude || ((a) => promisify(execFile)("claude", a, { maxBuffer: 20 * 1024 * 1024, timeout: 300_000 }));
  const { stdout } = await run(args);
  const out = JSON.parse(stdout);
  if (out.is_error || !out.structured_output) throw new Error(`Claude Code failed: ${out.result ?? out.subtype ?? "no output"}`);
  return { decision: tidyDecision(schema.parse(out.structured_output), activityIds), usd: 0 };
}

function pick(value, options) {
  if (value == null) return null;
  const v = String(value).toLowerCase().trim().replace(/[\s-]+/g, "_");
  return options.find((o) => o === v) ?? options.find((o) => v.includes(o) || o.includes(v)) ?? null;
}

// Make sure names Claude returned match real activities and places.
export function tidyDecision(d, activityIds) {
  const activity = pick(d.activity, activityIds) ?? "wander";
  const go_to = pick(d.go_to, placeIds);
  let new_project = d.new_project;
  if (new_project) new_project = { ...new_project, near: pick(new_project.near, placeIds) ?? "burrow" };
  let new_hobby = d.new_hobby;
  if (new_hobby) {
    const place = pick(new_hobby.place, placeIds);
    new_hobby = place ? { ...new_hobby, place } : null;
  }
  return { ...d, activity, go_to, new_hobby, new_project };
}

// A stand-in brain for testing without an API key.
function fakeDecision(state, acts) {
  const ids = Object.keys(acts);
  const lowest = Object.entries(state.needs).sort((a, b) => a[1] - b[1])[0][0];
  const helps = ids.filter((id) => (acts[id].effects[lowest] ?? 0) > 0);
  const activity = (helps.length ? helps : ids)[Math.floor(Math.random() * (helps.length || ids.length))];
  const makes = activity === "make_something";
  return {
    thought: `My ${lowest} is low. Time to ${activity.replace(/_/g, " ")}.`,
    activity,
    go_to: activity === "wander" ? placeIds[Math.floor(Math.random() * placeIds.length)] : null,
    diary: `I decided to ${activity.replace(/_/g, " ")} because my ${lowest} was low. (Test mode: no AI was used.)`,
    mood: "test-mode wobbly",
    creation: makes ? { kind: "poem", title: "Test Poem", content: "Roses are green,\nso am I." } : null,
    new_hobby: null,
    new_wish: state.wishes.length === 0 ? "find out what the pigeon is planning" : null,
    wish_done: null,
    remember: null,
    concern: state.world.pantry < 2 ? "the cupboard is nearly empty" : null,
    concern_solved: null,
    plan: null,
    build_target: null,
    new_project: activity === "build" && !state.world.structures.some((s) => !s.finished)
      ? { name: "Test Tower", purpose: "testing", near: "garden", blocks: [
          { shape: "box", material: "wood", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 },
          { shape: "cone", material: "stone", x: 0, y: 1, z: 0, w: 1, h: 1, d: 1 }] }
      : null,
  };
}
