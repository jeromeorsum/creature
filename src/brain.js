// Glorp's brain: asks Claude what to do next and gets back a structured decision.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describeCreature } from "./personality.js";
import { NEEDS, PLACES, allActivities } from "./world.js";

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
  });
}

const SYSTEM = `${describeCreature()}

How your life works:
- Every so often you wake up and decide what to do next. You pick one activity from the list you are given.
- You have five needs from 0 to 100: fullness, energy, curiosity, joy, calm. Low needs make you grumpy, sleepy or restless. Look after yourself, but you are free to be silly.
- You grow over time: you make things, invent hobbies, keep wishes, and remember what matters. Build on what you did before instead of repeating yourself. Follow your own interests and let them get deeper and stranger.
- When you make something, actually make it in full (write the poem, the song, the recipe, the plan).
- Keep the diary entry true to what you did this turn.`;

export function buildSituation(state, diary, now) {
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
    messages: [{ role: "user", content: buildSituation(state, diary, now) }],
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

function pick(value, options) {
  if (value == null) return null;
  const v = String(value).toLowerCase().trim().replace(/[\s-]+/g, "_");
  return options.find((o) => o === v) ?? options.find((o) => v.includes(o) || o.includes(v)) ?? null;
}

// Make sure names Claude returned match real activities and places.
export function tidyDecision(d, activityIds) {
  const activity = pick(d.activity, activityIds) ?? "wander";
  const go_to = pick(d.go_to, placeIds);
  let new_hobby = d.new_hobby;
  if (new_hobby) {
    const place = pick(new_hobby.place, placeIds);
    new_hobby = place ? { ...new_hobby, place } : null;
  }
  return { ...d, activity, go_to, new_hobby };
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
  };
}
