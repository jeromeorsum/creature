#!/usr/bin/env node
// Command line for Glorp.
//   live    keep Glorp alive, thinking every TICK_MINUTES, and serve the web view
//   watch   only serve the web view (no thinking)
//   tick    run one moment of Glorp's life
//   status  show needs, wishes, hobbies
//   diary   show the latest diary entries
import { tick, config } from "./life.js";
import { loadState, readDiary } from "./state.js";
import { NEEDS } from "./world.js";
import { startServer } from "./server.js";

function bar(v) {
  const n = Math.round(v / 10);
  return "#".repeat(n) + ".".repeat(10 - n);
}

function printStatus(state) {
  console.log(`Now: ${state.doing}. Mood: ${state.mood}.`);
  for (const need of NEEDS) console.log(`  ${need.padEnd(10)} ${bar(state.needs[need])} ${state.needs[need]}`);
  const open = state.wishes.filter((w) => !w.done);
  if (open.length) console.log(`Wishes: ${open.map((w) => w.text).join("; ")}`);
  if (state.hobbies.length) console.log(`Own hobbies: ${state.hobbies.map((h) => h.id).join(", ")}`);
  const w = state.world;
  console.log(`Has: ${Object.entries(w.inventory).map(([k, v]) => `${v} ${k}`).join(", ")}; ${w.food} food, health ${state.health}. Weather: ${w.weather}.`);
  if (w.structures.length) console.log(`Built: ${w.structures.map((s) => `${s.name}${s.finished ? "" : " (unfinished)"}`).join(", ")}`);
  const worries = state.concerns.filter((c) => !c.resolved);
  if (worries.length) console.log(`Worries: ${worries.map((c) => c.text).join("; ")}`);
  if (state.plan) console.log(`Plan: ${state.plan}`);
  console.log(`Made ${state.creations.length} things. Spent today $${state.spend.usd.toFixed(3)} (total $${state.spend.totalUsd.toFixed(3)}).`);
}

async function runTick() {
  const { state, result, decision, usd, hobby, creationFile, events, gathered, built, project, why } = await tick();
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (result === "auto") {
    console.log(`[${time}] (instinct) ${decision.activity.replace(/_/g, " ")} at the ${state.place}: ${decision.diary}`);
    return;
  }
  if (result !== "acted") {
    console.log(`[${time}] Glorp: ${state.doing} (${result}).`);
    return;
  }
  console.log(`\n[${time}] ${decision.activity.replace(/_/g, " ")} at the ${state.place}  (${decision.mood}, $${usd.toFixed(4)})`);
  console.log(`  why:    ${why ?? ""}`);
  console.log(`  thinks: ${decision.thought}`);
  console.log(`  diary:  ${decision.diary}`);
  for (const e of events) console.log(`  event:  ${e}`);
  if (gathered) console.log(`  found:  ${Object.entries(gathered).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  if (project) console.log(`  NEW PROJECT: ${project.name} (${project.blocks.length} blocks)`);
  if (built) console.log(`  built:  ${built.placed} blocks on "${built.name}"${built.finished ? " (finished!)" : built.stuck ? ` (needs ${built.stuck.short} more ${built.stuck.material})` : ""}`);
  if (decision.concern) console.log(`  worries: ${decision.concern}`);
  if (decision.plan) console.log(`  plan:   ${decision.plan}`);
  if (creationFile) console.log(`  made:   ${decision.creation.kind} "${decision.creation.title}" -> ${creationFile}`);
  if (hobby) console.log(`  NEW HOBBY: ${hobby.id} (${hobby.about})`);
  if (decision.new_wish) console.log(`  wishes: ${decision.new_wish}`);
  if (decision.remember) console.log(`  will remember: ${decision.remember}`);
}

const cmd = process.argv[2] || "tick";
const cfg = config();

if (!cfg.fake && cfg.brain === "api" && !process.env.ANTHROPIC_API_KEY && (cmd === "tick" || cmd === "live")) {
  console.error("No ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN found. See README, or set CREATURE_FAKE=1 to test without AI.");
  process.exit(1);
}

if (cmd === "tick") {
  await runTick();
} else if (cmd === "watch") {
  startServer();
} else if (cmd === "live") {
  startServer();
  console.log(`Glorp is alive. Checking in every ${cfg.tickMinutes} minutes; it thinks when something calls for it. Press Ctrl+C to stop.`);
  for (;;) {
    try {
      await runTick();
    } catch (err) {
      console.error(`Glorp had a confusing moment: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, cfg.tickMinutes * 60_000));
  }
} else if (cmd === "status") {
  printStatus(loadState());
} else if (cmd === "diary") {
  for (const e of readDiary(Number(process.argv[3] || 10))) {
    console.log(`\n[${e.time.slice(0, 16).replace("T", " ")}] ${e.activity} at the ${e.place} (${e.mood})\n  ${e.diary}`);
  }
} else {
  console.error(`Unknown command "${cmd}". Use: live, watch, tick, status, diary`);
  process.exit(1);
}
