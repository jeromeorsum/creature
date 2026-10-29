// One "tick" of Glorp's life: let time pass, think, act, write it down.
import fs from "node:fs";
import path from "node:path";
import { think, isLastMoment, dayKey } from "./brain.js";
import {
  allActivities, clampHobbyEffects, HOBBY_LIMITS, ACTIVITIES, PLACE_POS, regrow, gather, worldEvents, startProject, buildOn,
  invent, bonus, tend, plant,
} from "./world.js";

// Where Glorp lives: the nest, or a building it chose as its home.
export function homeOf(world) {
  const s = world.structures.find((x) => x.id === world.home);
  return s ? { place: s.place, spot: { x: s.x, z: s.z }, name: s.name } : { place: "nest", spot: { ...PLACE_POS.nest }, name: "the nest" };
}
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
    // Glorp is nocturnal: asleep 11am to 7pm, awake through the night.
    sleepFrom: Number(env.SLEEP_FROM_HOUR ?? 11),
    sleepUntil: Number(env.SLEEP_UNTIL_HOUR ?? 19),
    tickMinutes: Number(env.TICK_MINUTES ?? 30),
  };
}

export function isSleepTime(now, from, until) {
  const h = now.getHours();
  if (from === until) return false;
  return from > until ? h >= from || h < until : h >= from && h < until;
}



function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "untitled";
}

export async function tick({ now = new Date(), cfg = config(), client, rand = Math.random } = {}) {
  const state = loadState(now);
  regrow(state.world, Math.max(0, (now - new Date(state.lastUpdate)) / 3_600_000), now);
  if (state.spend.day !== dayKey(now, cfg.sleepUntil)) state.spend = { ...state.spend, day: dayKey(now, cfg.sleepUntil), usd: 0, ticks: 0 };

  if (isSleepTime(now, cfg.sleepFrom, cfg.sleepUntil)) {
    decayNeeds(state, now, { asleep: true });
    const home = homeOf(state.world);
    state.place = home.place;
    state.spot = home.spot;
    state.doing = `asleep in ${home.name.startsWith("the ") ? home.name : `"${home.name}"`}`;
    state.busyUntil = null;
    saveState(state);
    return { state, result: "asleep" };
  }

  decayNeeds(state, now);
  let collapsed = false;
  if (state.health <= 0) {
    // Glorp collapses, sleeps it off, and wakes up weak. It doesn't die, but it remembers.
    collapsed = true;
    state.health = 25;
    state.needs.energy = 10;
    state.needs.joy = Math.min(state.needs.joy, 20);
  }

  // Glorp always gets its last moment before bed to reflect on the day, even if busy.
  const bedtimeReflection = isLastMoment(now, cfg) && !(state.days ?? []).some((x) => x.date === dayKey(now, cfg.sleepUntil));
  if (state.busyUntil && new Date(state.busyUntil) > now && !bedtimeReflection) {
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
  if (collapsed) events.unshift("You collapsed from hunger and thirst and lay on the ground for a long time. You feel very weak and scared.");
  const diary = readDiary(12);
  const { decision: d, usd } = await think(state, diary, now, { ...cfg, client, events });
  const acts = allActivities(state);
  const act = acts[d.activity];

  // What actually happened, told to Glorp next time so it can learn from it.
  const outcome = [];
  const result = {};

  // A new building project appears in the world straight away.
  let project = null;
  if (d.new_project) {
    const p = startProject(world, d.new_project, now);
    if (p.structure) project = p.structure;
    else outcome.push(`You couldn't start "${d.new_project.name}": ${p.error}.`);
  }

  // Move and act.
  const home = homeOf(world);
  state.place = act.place === "home" ? home.place : act.place ?? d.go_to ?? state.place;
  let spot = act.place === "home" ? home.spot : null;
  let effects = { ...act.effects };
  if (d.activity === "nap" && bonus(world, "better_sleep")) effects.energy += 15;
  if (act.gather) {
    const g = gather(world, act.gather, rand);
    result.gathered = { [act.gather]: g.got };
    spot = g.spot;
    if (g.got === 0) {
      effects = { ...effects, joy: -5, calm: -5 };
      outcome.push(`You found no ${act.gather} at all: it had all been taken. It grows back slowly.`);
    } else outcome.push(`You collected ${g.got} ${act.gather}${g.ate ? ` and ate ${g.ate} on the spot` : ""}.`);
    if (g.ate) effects.fullness = (effects.fullness ?? 0) + g.ate * 12;
    if (g.seeds) outcome.push(`You also saved ${g.seeds} ${act.gather === "wood" ? "tree" : "berry"} seeds.`);
    if (g.first) outcome.push(`That was the first ${act.gather} you ever held.`);
  }
  if (act.tend) {
    const n = tend(world, state.place, now);
    result.tended = n;
    outcome.push(n ? `You looked after ${n} plants around the ${state.place}. They'll grow for about a day.` : `There were no living plants near the ${state.place} to look after.`);
  }
  if (act.plant) {
    const p = plant(world, state.place, now, rand);
    const total = p.tree + p.berry;
    result.planted = p;
    outcome.push(total ? `You planted ${p.tree} tree seeds and ${p.berry} berry seeds near the ${state.place}. Seedlings need tending to grow.` : "You had no seeds to plant (collecting wood and berries sometimes gives seeds).");
    if (!total) effects.joy = -3;
  }
  if (act.eat) {
    const n = Math.min(world.food, 2);
    world.food -= n;
    effects.fullness = (effects.fullness ?? 0) + n * 14;
    result.ate = n;
    outcome.push(n ? `You ate ${n} berries from your food.` : "You went to eat, but you had no food kept. Your tummy rumbled.");
    if (!n) effects.joy = -4;
  }
  if (act.experiment && d.discovery) {
    state.knowledge = [...(state.knowledge ?? []), { text: String(d.discovery).slice(0, 300), made: now.toISOString() }].slice(-60);
    result.discovery = d.discovery;
  }
  if (d.new_invention) {
    if (!act.experiment && d.activity !== "build") {
      outcome.push(`You didn't make "${d.new_invention.name}": inventing things takes 'experiment' (or 'build') time.`);
    } else {
      const r = invent(world, d.new_invention, now);
      if (r.invention) {
        result.invention = r.invention.name;
        outcome.push(`You made "${r.invention.name}". ${r.invention.helps === "nothing_yet" ? "It doesn't actually help with anything yet." : "It works!"}`);
      } else outcome.push(`Your attempt to make "${d.new_invention.name}" failed: ${r.error}.`);
    }
  }
  if (d.make_home != null) {
    const s = world.structures.find((x) => x.id === d.make_home);
    if (s?.finished) { world.home = s.id; outcome.push(`"${s.name}" is now your home. You'll sleep there.`); }
    else if (s) outcome.push(`"${s.name}" isn't finished, so it can't be your home yet.`);
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
      outcome.push(b.placed
        ? `You placed ${b.placed} blocks on "${target.name}"${b.finished ? " and FINISHED it" : ""}.${b.stuck ? ` Then you ran out: you need ${b.stuck.short} more ${b.stuck.material} for the next block.` : ""}`
        : `You couldn't place anything on "${target.name}": you need ${b.stuck?.short} more ${b.stuck?.material}.`);
    } else outcome.push("You went to build, but you had no building project. Design one first (new_project).");
  }
  state.spot = spot ?? { ...(PLACE_POS[state.place] ?? PLACE_POS.nest) };
  state.lastOutcome = outcome;
  applyEffects(state, effects);
  state.busyUntil = new Date(now.getTime() + act.minutes * 60_000).toISOString();
  state.doing = `${d.activity.replace(/_/g, " ")} at the ${state.place}`;
  state.mood = d.mood;
  state.thought = d.thought;
  state.face = d.face;

  if (d.concern) {
    state.concerns.push({ text: d.concern, made: now.toISOString(), resolved: null });
    if (state.concerns.length > 60) state.concerns.shift();
  }
  const c = state.concerns[(d.concern_solved ?? 0) - 1];
  if (c && !c.resolved) c.resolved = now.toISOString();
  if (d.plan) state.plan = d.plan;
  if (d.lesson) {
    state.lessons = [...(state.lessons ?? []), d.lesson].slice(-40);
  }

  // The shape of Glorp's day: a plan made in the morning, ticked off, and a reflection at bedtime.
  const day = dayKey(now, cfg.sleepUntil);
  if (d.day_plan?.length && (state.today?.date !== day || d.day_plan.join() !== state.today.plan.join())) {
    const keep = state.today?.date === day ? state.today.done : [];
    state.today = { date: day, plan: d.day_plan.slice(0, 10).map((x) => String(x).slice(0, 140)), done: keep };
  }
  if (state.today?.date === day) {
    for (const n of d.plan_done ?? []) if (n >= 1 && n <= state.today.plan.length && !state.today.done.includes(n)) state.today.done.push(n);
  }
  if (d.day_summary) {
    state.days = (state.days ?? []).filter((x) => x.date !== day);
    state.days.push({ date: day, summary: d.day_summary, plan: state.today?.date === day ? state.today : null });
    if (state.days.length > 60) state.days.shift();
  }

  // Keep anything it made.
  let creationFile = null;
  if (d.creation?.content) {
    fs.mkdirSync(CREATIONS_DIR(), { recursive: true });
    const name = `${now.toLocaleDateString("en-CA")}-${slugify(d.creation.title)}.md`;
    creationFile = path.join(CREATIONS_DIR(), name);
    fs.writeFileSync(creationFile, `# ${d.creation.title}\n\n_${d.creation.kind}, made by Glorp on ${now.toLocaleDateString("en-CA")}_\n\n${d.creation.content}\n`);
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
    face: d.face,
    needs: { ...state.needs },
    creation: creationFile ? path.basename(creationFile) : null,
    hobby: hobby?.id ?? null,
    wish: d.new_wish,
    spot: state.spot,
    events,
    concern: d.concern,
    day_plan: d.day_plan,
    day_summary: d.day_summary,
    lesson: d.lesson,
    discovery: result.discovery ?? null,
    invention: result.invention ?? null,
    outcome,
    project: project ? project.name : null,
    gathered: result.gathered,
    tended: result.tended,
    planted: result.planted,
    built: result.built,
  });
  saveState(state);
  return { state, result: "acted", decision: d, usd, hobby, creationFile, events, project, ...result };
}
