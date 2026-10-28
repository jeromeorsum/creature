// One "tick" of Glorp's life: let time pass, think, act, write it down.
import fs from "node:fs";
import path from "node:path";
import { think } from "./brain.js";
import { allActivities, clampHobbyEffects, HOBBY_LIMITS, ACTIVITIES } from "./world.js";
import {
  loadState, saveState, appendDiary, readDiary, decayNeeds, applyEffects, CREATIONS_DIR,
} from "./state.js";

export function config(env = process.env) {
  // "claude-code" runs on a Claude subscription; "api" uses a paid API key.
  const brain = env.CREATURE_BRAIN || (env.CLAUDE_CODE_OAUTH_TOKEN && !env.ANTHROPIC_API_KEY ? "claude-code" : "api");
  return {
    brain,
    model: env.CREATURE_MODEL || (brain === "api" ? "claude-opus-5-5" : ""),
    effort: env.CREATURE_EFFORT || "low",
    fake: env.CREATURE_FAKE === "1",
    dailyBudget: Number(env.DAILY_BUDGET_USD ?? 1),
    maxTicksPerDay: Number(env.MAX_TICKS_PER_DAY ?? 40),
    sleepFrom: Number(env.SLEEP_FROM_HOUR ?? 23),
    sleepUntil: Number(env.SLEEP_UNTIL_HOUR ?? 7),
    tickMinutes: Number(env.TICK_MINUTES ?? 30),
  };
}

export function isSleepTime(now, from, until) {
  const h = now.getHours();
  if (from === until) return false;
  return from > until ? h >= from || h < until : h >= from && h < until;
}

function localDay(now) {
  return now.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "untitled";
}

export async function tick({ now = new Date(), cfg = config(), client } = {}) {
  const state = loadState(now);
  if (state.spend.day !== localDay(now)) state.spend = { ...state.spend, day: localDay(now), usd: 0, ticks: 0 };

  if (isSleepTime(now, cfg.sleepFrom, cfg.sleepUntil)) {
    decayNeeds(state, now, { asleep: true });
    state.place = "burrow";
    state.doing = "asleep in the sock bed";
    state.busyUntil = null;
    saveState(state);
    return { state, result: "asleep" };
  }

  decayNeeds(state, now);

  if (state.busyUntil && new Date(state.busyUntil) > now) {
    saveState(state);
    return { state, result: "busy" };
  }

  if (!cfg.fake && (state.spend.usd >= cfg.dailyBudget || (state.spend.ticks ?? 0) >= cfg.maxTicksPerDay)) {
    state.doing = "daydreaming (used up today's thinking budget)";
    saveState(state);
    return { state, result: "out-of-budget" };
  }

  const diary = readDiary(8);
  const { decision: d, usd } = await think(state, diary, now, { ...cfg, client });
  const acts = allActivities(state);
  const act = acts[d.activity];

  // Move and act.
  state.place = act.place ?? d.go_to ?? state.place;
  applyEffects(state, act.effects);
  state.busyUntil = new Date(now.getTime() + act.minutes * 60_000).toISOString();
  state.doing = `${d.activity.replace(/_/g, " ")} at the ${state.place}`;
  state.mood = d.mood;

  // Keep anything it made.
  let creationFile = null;
  if (d.creation?.content) {
    fs.mkdirSync(CREATIONS_DIR(), { recursive: true });
    const name = `${localDay(now)}-${slugify(d.creation.title)}.md`;
    creationFile = path.join(CREATIONS_DIR(), name);
    fs.writeFileSync(creationFile, `# ${d.creation.title}\n\n_${d.creation.kind}, made by Glorp on ${localDay(now)}_\n\n${d.creation.content}\n`);
    state.creations.push({ title: d.creation.title, kind: d.creation.kind, file: name, made: now.toISOString() });
  }

  // A new hobby becomes a permanent activity.
  let hobby = null;
  if (d.new_hobby && state.hobbies.length < HOBBY_LIMITS.maxHobbies) {
    const id = slugify(d.new_hobby.id).replace(/-/g, "_");
    if (id && !acts[id] && !ACTIVITIES[id]) {
      hobby = {
        id,
        place: d.new_hobby.place,
        about: d.new_hobby.about,
        minutes: Math.max(10, Math.min(120, Math.round(d.new_hobby.minutes))),
        effects: clampHobbyEffects(d.new_hobby.effects),
        invented: now.toISOString(),
      };
      state.hobbies.push(hobby);
    }
  }

  if (d.new_wish) state.wishes.push({ text: d.new_wish, made: now.toISOString(), done: null });
  const w = state.wishes[(d.wish_done ?? 0) - 1];
  if (w && !w.done) w.done = now.toISOString();
  if (d.remember) {
    state.memories.push(d.remember);
    if (state.memories.length > 40) state.memories.shift();
  }

  state.ticks += 1;
  state.spend.usd += usd;
  state.spend.ticks = (state.spend.ticks ?? 0) + 1;
  state.spend.totalUsd += usd;

  appendDiary({
    time: now.toISOString(),
    place: state.place,
    activity: d.activity,
    thought: d.thought,
    diary: d.diary,
    mood: d.mood,
    needs: { ...state.needs },
    creation: creationFile ? path.basename(creationFile) : null,
    hobby: hobby?.id ?? null,
    wish: d.new_wish,
  });
  saveState(state);
  return { state, result: "acted", decision: d, usd, hobby, creationFile };
}
