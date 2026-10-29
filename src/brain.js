// Glorp's brain: asks Claude what to do next and gets back a structured decision.
import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describeCreature } from "./personality.js";
import {
  NEEDS, PLACES, PLACE_POS, INVENTION_HELPS, foodCap, isTended, MATERIALS, SHAPES, BUILD_LIMITS, RESOURCES, allActivities, missingFor, problems, resourceLeft,
} from "./world.js";

// US dollars per million tokens: [input, output]
const PRICES = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

const placeIds = Object.keys(PLACES);
export const FACES = ["happy", "excited", "proud", "curious", "determined", "worried", "grumpy", "sad", "sleepy", "suspicious"];

export function decisionSchema(activityIds) {
  const effects = z.object(Object.fromEntries(NEEDS.map((n) => [n, z.number()])));
  return z.object({
    thought: z.string().describe("Your full stream of thought right now, 3-6 sentences: what you notice, how you feel, what you want, what is bothering you, and how you are reasoning about what to do next and why. Think like a real someone in the middle of their day."),
    activity: z.string().describe(`The activity you do next. One of: ${activityIds.join(", ")}.`),
    go_to: z.string().nullable().describe(`Only for 'wander': where you walk to, one of: ${placeIds.join(", ")}. Otherwise null.`),
    diary: z.string().describe("Diary entry about what you just did, why, how it went and what you think about it, 3-6 sentences, in your voice."),
    mood: z.string().describe("Your mood in a few words."),
    face: z.string().describe(`The expression on your face right now, one of: ${FACES.join(", ")}.`),
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
    discovery: z.string().nullable().describe("Only with 'experiment': a new fact you worked out about your world by trying things (e.g. 'wet clay holds sticks together, then goes hard in the sun'). Otherwise null."),
    new_invention: z
      .object({
        name: z.string().describe("Your name for it"),
        about: z.string().describe("What it is and how you made it"),
        materials: z.object(Object.fromEntries(MATERIALS.map((m) => [m, z.number()]))).describe("How much of each material it uses (0 to 6 each). You must have them."),
        helps: z.string().describe(`What it is for, one of: ${Object.keys(INVENTION_HELPS).join(", ")}`),
      })
      .nullable()
      .describe("Only with 'experiment' or 'build': make a tool or object from your materials. Otherwise null."),
    make_home: z.number().nullable().describe("Number of a FINISHED building of yours to live and sleep in from now on. Otherwise null."),
    lesson: z.string().nullable().describe("Something you learned from how things went (a mistake, a surprise, a trick that worked), as a short rule for the future. Otherwise null."),
    concern: z.string().nullable().describe("A new worry or problem on your mind (something you want to solve). Otherwise null."),
    concern_solved: z.number().nullable().describe("Number of a worry from your list that is now solved or no longer matters. Otherwise null."),
    plan: z.string().nullable().describe("Your current plan in a few short steps, if it changed (e.g. 'get 6 stone, then finish the tower, then watch trains from it'). Otherwise null to keep the old plan."),
    day_plan: z.array(z.string()).nullable().describe("Required at your first moment of a new day (and allowed if your day changes a lot): your plan for today as 4-8 short items in rough time order, like a real day (breakfast, chores, work on a project, a hobby, lunch, drinking, foraging, tending plants, dinner, winding down). Otherwise null."),
    plan_done: z.array(z.number()).nullable().describe("Numbers of items from today's plan that you have now done. Otherwise null."),
    day_summary: z.string().nullable().describe("Only at your last moment before bed: an honest reflection on your whole day (what went well, what didn't, how you feel, what you want tomorrow), 3-6 sentences. Otherwise null."),
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
- You have six needs from 0 to 100: fullness, water, energy, curiosity, joy, calm. You also have health: going without food or water makes it drop, and if it hits zero you collapse. You must survive off the island: drink at the pond, find food, rest, and stay out of the weather.
- You grow over time: you make things, invent hobbies, keep wishes, and remember what matters. Build on what you did before instead of repeating yourself. Follow your own interests and let them get deeper and stranger.
- When you make something, actually make it in full (write the poem, the song, the recipe, the plan).
- You are a newborn. You start knowing nothing: not what wood is for, not how to build, not that plants need care. Learn by doing and experimenting. When you work something out, record it as a discovery. When you learn from a mistake, record a lesson. Only "know" what you have discovered or been told by experience.
- The island is all there is and it is finite. Stone never comes back. Trees, berry bushes and reeds only grow back while you tend them, a tree cut right down dies, and new plants only come from seeds you plant. A careless Glorp will strip the island bare and go hungry; a wise one looks after it.
- You can invent tools and objects from materials you have (an invention really helps if it fits one of the listed uses). You can design buildings out of blocks (boxes, cylinders, cones, spheres) and build them over several turns; they stay in the world for good. Think up genuinely new ideas to solve your problems: a shelter so rain stops getting in, a home, a seed garden, a water catcher, a lookout, anything.
- Things go wrong: the pigeon steals, wind knocks blocks off, rain melts clay, food runs out. Notice problems, worry about them, make plans, and solve them step by step. Keep track of your worries and your plan.
- After each decision the world tells you what really happened ("What happened last time"). Believe it over your own plans.
- Live a full, normal day like a real someone would: wake up and plan your day over breakfast, eat proper meals (breakfast, lunch, dinner), do chores and work on your projects, make time for hobbies and fun, have opinions and wants, and wind down in the evening before bed. Your day plan is a guide, not a cage: change it when something comes up.
- Your thoughts are real thoughts, not captions: notice things, feel things, weigh options, remember yesterday, look forward to tomorrow.
- Keep the diary entry true to what you did this turn.`;

// What Glorp can see near where it is standing.
export function surroundings(state) {
  const sp = state.spot ?? PLACE_POS[state.place] ?? { x: 0, z: 0 };
  const near = (p) => Math.hypot(p.x - sp.x, p.z - sp.z);
  const out = [];
  const nodes = state.world.nodes.filter((n) => near(n) < 14);
  const byType = {};
  for (const n of nodes) {
    const t = RESOURCES[n.res].node;
    byType[t] ??= { full: 0, empty: 0 };
    if (n.left >= 1) byType[t].full++; else byType[t].empty++;
  }
  for (const [t, c] of Object.entries(byType)) out.push(`${c.full} ${t}s with something on them${c.empty ? ` and ${c.empty} picked clean` : ""}`);
  for (const s of state.world.structures.filter((s) => near(s) < 16)) out.push(`your ${s.finished ? "" : "unfinished "}"${s.name}" ${Math.round(near(s))}m away`);
  const places = Object.entries(PLACE_POS).filter(([k, p]) => k !== state.place && near(p) < 20).map(([k, p]) => `the ${k} (${Math.round(near(p))}m)`);
  if (places.length) out.push(`nearby: ${places.join(", ")}`);
  return out.length ? out.join("; ") : "open grass";
}

// Where Glorp is in its day, with the kind of thing people usually do then.
// Glorp's "day" starts when it wakes up, so a night owl's day can run past midnight.
export function dayKey(now, wake = 7) {
  return new Date(now.getTime() - wake * 3_600_000).toLocaleDateString("en-CA");
}

export function isLastMoment(now, opts = {}) {
  const h = now.getHours() + now.getMinutes() / 60;
  const bed = opts.sleepFrom ?? 23;
  const left = (bed - h + 24) % 24;
  return bed !== (opts.sleepUntil ?? 7) && left <= 0.75 && left > 0;
}

const hourName = (h) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

export function timeOfDay(now, opts = {}) {
  const h = now.getHours() + now.getMinutes() / 60;
  const bed = opts.sleepFrom ?? 23, wake = opts.sleepUntil ?? 7;
  const awake = (h - wake + 24) % 24; // hours since you woke up
  let part;
  if (isLastMoment(now, opts)) part = "the end of your day, your LAST moment before sleep: wind down, get ready for bed, and write your day_summary";
  else if (awake < 2) part = "you just woke up: time for breakfast and planning your day";
  else if (awake < 5) part = "early in your day: a good time for proper work, gathering and building";
  else if (awake < 7) part = "the middle of your day: time for a meal";
  else if (awake < 10.5) part = "your afternoon: projects, hobbies, exploring";
  else if (awake < 13) part = "later in your day: dinner time, finish up the day's jobs";
  else part = "late in your day: relax, hobbies, chat with yourself, wind down";
  const light = h >= 20 || h < 6 ? "dark night outside (moon, stars and fireflies)" : h < 8 ? "dawn outside" : h < 17 ? "daylight outside" : "dusk outside";
  const owl = wake >= 15 || wake < 3 ? " You are nocturnal: you are awake through the night and sleep through the daytime, like an owl." : "";
  return `Part of your day: ${part}. It is ${light}. You wake at ${hourName(wake)} and go to sleep at ${hourName(bed)}.${owl}`;
}

export function buildSituation(state, diary, now, opts = {}) {
  const acts = allActivities(state);
  const lines = [];
  lines.push(`It is ${now.toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", day: "numeric", month: "long" })}.`);
  lines.push(timeOfDay(now, opts));
  lines.push(`You are at the ${state.place}: ${PLACES[state.place]}.`);
  lines.push(`Around you: ${surroundings(state)}.`);
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
  lines.push(`Health: ${state.health ?? 100}/100. Weather: ${w.weather}.`);
  lines.push(`Food you are keeping: ${w.food} berries (you can keep up to ${foodCap(w)}). Seeds saved: ${w.seeds.tree} tree, ${w.seeds.berry} berry.`);
  lines.push(`Materials you have discovered: ${w.discovered.length ? w.discovered.join(", ") : "none yet (you haven't picked anything up)"}.`);
  lines.push(`Your materials: ${MATERIALS.map((m) => `${m} ${w.inventory[m] ?? 0}`).join(", ")}.`);
  lines.push("Left to collect on the island: " + Object.keys(RESOURCES).map((r) => `${r} ${resourceLeft(w, r)}`).join(", ") + ".");
  const tendedNow = w.nodes.filter((n) => isTended(n, now)).length;
  const seedlings = w.nodes.filter((n) => n.planted && !n.dead && n.left < 1).length;
  lines.push(`Plants you are tending right now: ${tendedNow}. Seedlings you planted that are still growing: ${seedlings}.`);
  lines.push(`Your home: ${w.home == null ? "the nest under the old tree (open to the weather)" : `"${w.structures.find((s) => s.id === w.home)?.name}"`}.`);
  lines.push("");
  lines.push("Your inventions:");
  lines.push(w.inventions.length ? w.inventions.map((i) => `- ${i.name}: ${i.about} (${INVENTION_HELPS[i.helps]})`).join("\n") : "(none yet)");
  lines.push(`Uses an invention can have: ${Object.entries(INVENTION_HELPS).map(([k, v]) => `${k} (${v})`).join("; ")}.`);
  lines.push(`Block cost: 1 material for small blocks, up to 4 for big ones (cost = 1 + volume/2). You can only build and invent with materials you have discovered.`);
  lines.push("");
  lines.push("Things you have worked out about the world:");
  lines.push(state.knowledge?.length ? state.knowledge.slice(-25).map((k) => `- ${k.text}`).join("\n") : "(nothing yet: you are brand new)");
  lines.push("");
  lines.push("Your building projects:");
  if (!w.structures.length) lines.push("(none yet)");
  for (const s of w.structures.slice(-12)) {
    const done = s.blocks.filter((b) => b.placed).length;
    const status = s.finished ? "finished" : `${done}/${s.blocks.length} blocks placed, still needs ${Object.entries(missingFor(w, s).need).map(([k, v]) => `${v} ${k}`).join(", ")}`;
    lines.push(`${s.id}. "${s.name}" near the ${s.place}: ${s.purpose} [${status}]`);
  }
  if (state.lastOutcome?.length) {
    lines.push("");
    lines.push("What happened last time:");
    lines.push(state.lastOutcome.map((e) => `- ${e}`).join("\n"));
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
  const today = state.today;
  lines.push("");
  if (!today || today.date !== dayKey(now, opts.sleepUntil)) {
    lines.push("Today's plan: you haven't planned today yet. This is your first moment awake today: decide your day_plan.");
  } else {
    lines.push("Today's plan:");
    lines.push(today.plan.map((p, i) => `${i + 1}. [${today.done.includes(i + 1) ? "done" : " "}] ${p}`).join("\n"));
  }
  if (state.days?.length) {
    lines.push("");
    lines.push("How your last days went:");
    lines.push(state.days.slice(-3).map((d) => `- ${d.date}: ${d.summary}`).join("\n"));
  }
  lines.push("");
  lines.push("Your wishes:");
  const open = state.wishes.map((w, i) => ({ ...w, n: i + 1 })).filter((w) => !w.done);
  lines.push(open.length ? open.map((w) => `${w.n}. ${w.text}`).join("\n") : "(none yet)");
  lines.push("");
  lines.push("Things you have made:");
  lines.push(state.creations.length ? state.creations.slice(-15).map((c) => `- ${c.kind}: ${c.title}`).join("\n") : "(nothing yet)");
  lines.push("");
  lines.push("Lessons you have learned:");
  lines.push(state.lessons?.length ? state.lessons.slice(-15).map((m) => `- ${m}`).join("\n") : "(none yet)");
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
  if (opts.fake) return { decision: fakeDecision(state, acts, opts), usd: 0 };
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
  const run = opts.runClaude || ((a) => promisify(execFile)("claude", a, { maxBuffer: 20 * 1024 * 1024, timeout: 420_000 }));
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
  const face = pick(d.face, FACES) ?? "happy";
  return { ...d, activity, go_to, new_hobby, new_project, face };
}

// A stand-in brain for testing without an API key.
function fakeDecision(state, acts, opts = {}) {
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
    face: "curious",
    creation: makes ? { kind: "poem", title: "Test Poem", content: "Roses are green,\nso am I." } : null,
    new_hobby: null,
    new_wish: state.wishes.length === 0 ? "find out what the pigeon is planning" : null,
    discovery: activity === "experiment" ? "sticks float" : null,
    new_invention: null,
    make_home: null,
    wish_done: null,
    remember: null,
    concern: state.world.food < 1 ? "I have no food saved" : null,
    concern_solved: null,
    plan: null,
    day_plan: state.today?.date === dayKey(new Date(), opts.sleepUntil) ? null : ["breakfast", "gather wood", "lunch", "build something", "watch trains", "dinner"],
    plan_done: null,
    day_summary: null,
    lesson: null,
    build_target: null,
    new_project: activity === "build" && !state.world.structures.some((s) => !s.finished)
      ? { name: "Test Tower", purpose: "testing", near: "garden", blocks: [
          { shape: "box", material: "wood", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 },
          { shape: "cone", material: "wood", x: 0, y: 1, z: 0, w: 1, h: 1, d: 1 }] }
      : null,
  };
}
