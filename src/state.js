// Loading, saving and updating Glorp's state on disk.
import fs from "node:fs";
import path from "node:path";
import { NEEDS, DECAY_PER_HOUR, PLACE_POS, newWorld } from "./world.js";

export const DATA_DIR = process.env.CREATURE_DATA_DIR || path.resolve("data");
const STATE_FILE = () => path.join(DATA_DIR, "state.json");
const DIARY_FILE = () => path.join(DATA_DIR, "diary.jsonl");
export const CREATIONS_DIR = () => path.join(DATA_DIR, "creations");

export function newState(now = new Date()) {
  return {
    born: now.toISOString(),
    lastUpdate: now.toISOString(),
    place: "burrow",
    spot: { ...PLACE_POS.burrow }, // exact spot on the island
    doing: "just woke up for the very first time",
    busyUntil: null,
    needs: { fullness: 70, energy: 80, curiosity: 60, joy: 70, calm: 70 },
    mood: "confused but optimistic",
    memories: [], // long-term notes Glorp chooses to keep
    wishes: [], // { text, made, done }
    hobbies: [], // hobbies Glorp invented
    creations: [], // { title, kind, file, made }
    concerns: [], // { text, made, resolved } things Glorp is worried about
    plan: null, // what Glorp is currently trying to do, in its own words
    world: newWorld(), // resources, inventory, buildings
    ticks: 0,
    spend: { day: null, usd: 0, totalUsd: 0, ticks: 0 },
  };
}

// Older Glorps didn't have an island yet: give them one.
export function upgradeState(state) {
  state.world ??= newWorld();
  state.concerns ??= [];
  state.plan ??= null;
  state.spot ??= { ...(PLACE_POS[state.place] ?? PLACE_POS.burrow) };
  return state;
}

export function loadState(now = new Date()) {
  try {
    return upgradeState(JSON.parse(fs.readFileSync(STATE_FILE(), "utf8")));
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
export function decayNeeds(state, now, { asleep = false } = {}) {
  const hours = Math.max(0, (now - new Date(state.lastUpdate)) / 3_600_000);
  for (const need of NEEDS) {
    let delta = -DECAY_PER_HOUR[need] * hours;
    if (asleep) {
      if (need === "energy") delta = 12 * hours;
      else if (need === "calm") delta = 4 * hours;
      else delta = delta / 2;
    }
    state.needs[need] = clampNeed(state.needs[need] + delta);
  }
  state.lastUpdate = now.toISOString();
}

export function applyEffects(state, effects) {
  for (const need of NEEDS) {
    if (effects[need]) state.needs[need] = clampNeed(state.needs[need] + effects[need]);
  }
}
