// One "tick" of Glorp's life: let time pass, think, act, write it down.
import fs from "node:fs";
import path from "node:path";
import { think } from "./brain.js";
import {
  allActivities, clampHobbyEffects, HOBBY_LIMITS, ACTIVITIES, PLACE_POS, regrow, gather, worldEvents, startProject, buildOn,
} from "./world.js";
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

export async function tick({ now = new Date(), cfg = config(), client, rand = Math.random } = {}) {
  const state = loadState(now);
  regrow(state.world, Math.max(0, (now - new Date(state.lastUpdate)) / 3_600_000));
  if (state.spend.day !== localDay(now)) state.spend = { ...state.spend, day: localDay(now), usd: 0, ticks: 0 };

  if (isSleepTime(now, cfg.sleepFrom, cfg.sleepUntil)) {
    decayNeeds(state, now, { asleep: true });
    state.place = "burrow";
    state.spot = { ...PLACE_POS.burrow };
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

  const world = state.world;
  const events = worldEvents(world, rand);
  const diary = readDiary(8);
  const { decision: d, usd } = await think(state, diary, now, { ...cfg, client, events });
  const acts = allActivities(state);
  const act = acts[d.activity];

  // A new building project appears in the world straight away.
  let project = null;
  if (d.new_project) project = startProject(world, d.new_project, now);

  // Move and act.
  state.place = act.place ?? d.go_to ?? state.place;
  let spot = null;
  let effects = { ...act.effects };
  const result = {};
  if (act.gather) {
    const g = gather(world, act.gather, rand);
    result.gathered = { [act.gather]: g.got };
    spot = g.spot;
    if (g.got === 0) effects = { ...effects, joy: -5, calm: -5 };
  }
  if (d.activity === "snack" || d.activity === "cook_experiment") {
    const want = d.activity === "snack" ? 1 : 2;
    if (world.pantry >= want) world.pantry -= want;
    else effects = { ...effects, fullness: 5, joy: -3 };
  }
  if (act.build) {
    const open = world.structures.filter((s) => !s.finished);
    const target = world.structures.find((s) => s.id === d.build_target && !s.finished) ?? project ?? open[0];
    if (target) {
      const b = buildOn(world, target, now);
      result.built = { id: target.id, name: target.name, ...b };
      state.place = target.place;
      spot = { x: target.x, z: target.z };
      if (b.placed === 0) effects = { ...effects, joy: -4 };
      if (b.finished && b.placed) effects = { ...effects, joy: (effects.joy ?? 0) + 10 };
    }
  }
  state.spot = spot ?? { ...(PLACE_POS[state.place] ?? PLACE_POS.burrow) };
  applyEffects(state, effects);
  state.busyUntil = new Date(now.getTime() + act.minutes * 60_000).toISOString();
  state.doing = `${d.activity.replace(/_/g, " ")} at the ${state.place}`;
  state.mood = d.mood;
  state.thought = d.thought;

  if (d.concern) {
    state.concerns.push({ text: d.concern, made: now.toISOString(), resolved: null });
    if (state.concerns.length > 60) state.concerns.shift();
  }
  const c = state.concerns[(d.concern_solved ?? 0) - 1];
  if (c && !c.resolved) c.resolved = now.toISOString();
  if (d.plan) state.plan = d.plan;

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
    spot: state.spot,
    events,
    concern: d.concern,
    project: project ? project.name : null,
    ...result,
  });
  saveState(state);
  return { state, result: "acted", decision: d, usd, hobby, creationFile, events, project, ...result };
}
