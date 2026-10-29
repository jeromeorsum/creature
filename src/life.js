// One "tick" of Glorp's life: let time pass, then either act on instinct and passion,
// or (only when something calls for it) stop and really think, act, and write it down.
import fs from "node:fs";
import path from "node:path";
import { think, isLastMoment, dayKey } from "./brain.js";
import {
  allActivities, clampHobbyEffects, HOBBY_LIMITS, ACTIVITIES, PLACE_POS, regrow, gather, worldEvents, startProject, buildOn,
  invent, bonus, tend, plant, missingFor, blockCost, resourceLeft,
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
    tickMinutes: Number(env.TICK_MINUTES ?? 10), // how often the island moves on; Glorp only thinks when something calls for it
  };
}

export function isSleepTime(now, from, until) {
  const h = now.getHours();
  if (from === until) return false;
  return from > until ? h >= from || h < until : h >= from && h < until;
}



// An empty decision: what Glorp does on instinct or habit, without stopping to think.
const QUIET = {
  thought: null, go_to: null, mood: null, face: null, creation: null, new_hobby: null, new_wish: null, wish_done: null,
  remember: null, concern: null, concern_solved: null, plan: null, build_target: null, new_project: null, day_plan: null,
  plan_done: null, day_summary: null, lesson: null, discovery: null, new_invention: null, make_home: null,
};

// Instinct (drink, eat, sleep when needed) and passion (keep at an unfinished project) need no thinking.
export function autopilot(state) {
  const n = state.needs, w = state.world, acts = allActivities(state);
  const pick = (activity, diary, extra = {}) => (acts[activity] ? { ...QUIET, activity, diary, ...extra } : null);
  if (n.water < 40) return pick("drink", "I was thirsty, so I went for a drink at the pond without really thinking about it.");
  if (n.fullness < 40 && w.food > 0) return pick("eat_food", "My tummy rumbled, so I ate some of the berries I kept.");
  if (n.energy < 20) return pick("nap", "Too tired to think. I curled up for a nap.");
  for (const s of w.structures.filter((x) => !x.finished)) {
    const next = s.blocks.find((b) => !b.placed);
    if (next && (w.inventory[next.material] ?? 0) >= blockCost(next)) return pick("build", `I kept working on "${s.name}". I can't stop thinking about it.`, { build_target: s.id });
    for (const m of Object.keys(missingFor(w, s).missing)) {
      const act = Object.entries(acts).find(([, a]) => a.gather === m);
      if (act && w.discovered.includes(m) && resourceLeft(w, m) > 0) return pick(act[0], `I went to get more ${m} for "${s.name}".`);
    }
  }
  return null;
}

// Does anything call for a real thought right now? Returns why, or null.
export function reasonToThink(state, now, cfg, { events = [], collapsed = false, bedtime = false, busyWithPassion = false, rand = Math.random } = {}) {
  const n = state.needs, w = state.world;
  if (collapsed) return "you collapsed and have just come round";
  if (bedtime) return "it's your last moment before sleep";
  if (state.today?.date !== dayKey(now, cfg.sleepUntil)) return "you have just woken up to a new day";
  if (events.length) return "something just happened";
  if (state.health < 60) return `your health is low (${state.health})`;
  if (n.fullness < 30 && w.food < 1) return "you're hungry and you have no food kept";
  for (const k of ["curiosity", "joy", "calm"]) if (n[k] < 20) return `your ${k} is very low`;
  // Ideas strike now and then, more often the longer it's been, and less while you're absorbed in a project.
  const since = state.lastThought ? (now - new Date(state.lastThought)) / 60_000 : Infinity;
  if (since >= (busyWithPassion ? 180 : 60)) return busyWithPassion ? "you've been busy a long time and want to take stock" : "you're free and wondering what to do";
  const chance = Math.min(0.5, (since / (busyWithPassion ? 600 : 150)) * (0.5 + n.curiosity / 100));
  if (rand() < chance) return busyWithPassion ? "an idea struck you while you were working" : "an idea is forming";
  return null;
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

  const world = state.world;
  // Island events happen at the same rate however often the island is checked.
  const events = rand() < Math.min(1, cfg.tickMinutes / 30) ? worldEvents(world, rand) : [];
  if (collapsed) events.unshift("You collapsed from hunger and thirst and lay on the ground for a long time. You feel very weak and scared.");

  // Only stop to think when something calls for it; otherwise follow instinct and passion.
  const habit = autopilot(state);
  const outOfThoughts = !cfg.fake && (state.spend.usd >= cfg.dailyBudget || (state.spend.ticks ?? 0) >= cfg.maxTicksPerDay);
  const why = outOfThoughts ? null : reasonToThink(state, now, cfg, { events, collapsed, bedtime: bedtimeReflection, busyWithPassion: habit?.activity === "build" || !!habit?.build_target || /^(collect|dig|pull)/.test(habit?.activity ?? ""), rand });
  let d, usd = 0;
  if (why) {
    ({ decision: d, usd } = await think(state, readDiary(12), now, { ...cfg, client, events, why }));
    state.lastThought = now.toISOString();
  } else if (habit) {
    d = habit;
  } else {
    state.doing = outOfThoughts ? `pottering about at the ${state.place} (all thought out for today)` : `pottering about at the ${state.place}`;
    state.busyUntil = null;
    saveState(state);
    return { state, result: "pottering", events };
  }
  const auto = !why;
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
  if (!auto) {
    state.mood = d.mood;
    state.thought = d.thought;
    state.face = d.face;
  }

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
  if (!auto) {
    state.spend.usd += usd;
    state.spend.ticks = (state.spend.ticks ?? 0) + 1;
    state.spend.totalUsd += usd;
  }

  appendDiary({
    time: now.toISOString(),
    place: state.place,
    activity: d.activity,
    thought: d.thought,
    diary: d.diary,
    mood: d.mood ?? state.mood,
    face: d.face ?? state.face,
    auto: auto || undefined, // done on instinct or habit, without stopping to think
    why: why ?? undefined,
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
  return { state, result: auto ? "auto" : "acted", decision: d, usd, hobby, creationFile, events, project, why, ...result };
}
