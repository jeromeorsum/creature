// Loading, saving and updating Glorp's state on disk.
import fs from "node:fs";
import path from "node:path";
import { NEEDS, DECAY_PER_HOUR, PLACE_POS, newWorld, hasShelter } from "./world.js";

export const DATA_DIR = process.env.CREATURE_DATA_DIR || path.resolve("data");
const STATE_FILE = () => path.join(DATA_DIR, "state.json");
const DIARY_FILE = () => path.join(DATA_DIR, "diary.jsonl");
export const CREATIONS_DIR = () => path.join(DATA_DIR, "creations");

// Version 3 is the newborn Glorp on the raw-nature island. Older lives are archived, not lost.
export const STATE_VERSION = 3;

export function newState(now = new Date()) {
  return {
    version: STATE_VERSION,
    born: now.toISOString(),
    lastUpdate: now.toISOString(),
    place: "nest",
    spot: { ...PLACE_POS.nest }, // exact spot on the island
    doing: "just hatched",
    busyUntil: null,
    needs: { fullness: 55, water: 50, energy: 70, curiosity: 90, joy: 70, calm: 60 },
    health: 100, // drops when Glorp goes without food or water
    mood: "brand new and baffled",
    memories: [], // long-term notes Glorp chooses to keep
    wishes: [], // { text, made, done }
    hobbies: [], // hobbies Glorp invented
    creations: [], // { title, kind, file, made }
    concerns: [], // { text, made, resolved } things Glorp is worried about
    today: null, // { date, plan: [..], done: [item numbers] }
    lessons: [], // rules Glorp learned from experience
    days: [], // { date, summary } a reflection written at bedtime
    plan: null, // what Glorp is currently trying to do, in its own words
    knowledge: [], // facts Glorp worked out about its world
    world: newWorld(), // resources, inventory, buildings, inventions
    ticks: 0,
    spend: { day: null, usd: 0, totalUsd: 0, ticks: 0 },
  };
}

// A Glorp from before the raw-nature island is reborn as a newborn. Its old life is moved to past-life/.
function rebirth(now) {
  const past = path.join(DATA_DIR, "past-life");
  fs.mkdirSync(past, { recursive: true });
  for (const f of ["state.json", "diary.jsonl", "creations"]) {
    const from = path.join(DATA_DIR, f);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(past, f));
  }
  return newState(now);
}

export function loadState(now = new Date()) {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE(), "utf8"));
    if (state.version !== STATE_VERSION) return rebirth(now);
    return state;
  } catch (err) {
    if (err.code === "ENOENT") return newState(now);
    throw err;
  }
}

export function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE());
}

export function appendDiary(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(DIARY_FILE(), JSON.stringify(entry) + "\n");
}

export function readDiary(limit = Infinity) {
  let lines;
  try {
    lines = fs.readFileSync(DIARY_FILE(), "utf8").trim().split("\n").filter(Boolean);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  return lines.slice(-limit).map((l) => JSON.parse(l));
}

export function clampNeed(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// Needs drift down as real time passes. While asleep, energy recovers instead.
// Going without food or water hurts Glorp's health; being looked after heals it.
export function decayNeeds(state, now, { asleep = false } = {}) {
  const hours = Math.max(0, (now - new Date(state.lastUpdate)) / 3_600_000);
  const starving = state.needs.fullness <= 5 || state.needs.water <= 5;
  const fine = state.needs.fullness >= 40 && state.needs.water >= 40;
  state.health = clampNeed((state.health ?? 100) + (starving ? -6 : fine ? 3 : 0) * hours);
  // Bad weather is miserable without a roof; a home you built keeps you dry and cosy.
  const w = state.world;
  const wet = (w?.weather === "rainy" || w?.weather === "windy") && w && !hasShelter(w);
  const cosy = w && hasShelter(w);
  for (const need of NEEDS) {
    let delta = -DECAY_PER_HOUR[need] * hours;
    if (asleep) {
      if (need === "energy") delta = (wet ? 8 : cosy ? 14 : 12) * hours;
      else if (need === "calm") delta = (wet ? 1 : cosy ? 6 : 4) * hours;
      else delta = delta / 2;
    } else if (wet && (need === "calm" || need === "joy")) delta -= 2 * hours;
    state.needs[need] = clampNeed(state.needs[need] + delta);
  }
  state.lastUpdate = now.toISOString();
}

export function applyEffects(state, effects) {
  for (const need of NEEDS) {
    if (effects[need]) state.needs[need] = clampNeed(state.needs[need] + effects[need]);
  }
}
