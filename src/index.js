#!/usr/bin/env node
// Command line for Glorp.
//   live    keep Glorp alive, thinking every TICK_MINUTES
//   tick    run one moment of Glorp's life
//   status  show needs, wishes, hobbies
//   diary   show the latest diary entries
import { tick, config } from "./life.js";
import { loadState, readDiary } from "./state.js";
import { NEEDS } from "./world.js";

function bar(v) {
  const n = Math.round(v / 10);
  return "#".repeat(n) + ".".repeat(10 - n);
}

function printStatus(state) {
  console.log(`Glorp is ${state.doing}. Mood: ${state.mood}.`);
  for (const need of NEEDS) console.log(`  ${need.padEnd(10)} ${bar(state.needs[need])} ${state.needs[need]}`);
  const open = state.wishes.filter((w) => !w.done);
  if (open.length) console.log(`Wishes: ${open.map((w) => w.text).join("; ")}`);
  if (state.hobbies.length) console.log(`Own hobbies: ${state.hobbies.map((h) => h.id).join(", ")}`);
  console.log(`Made ${state.creations.length} things. Spent today $${state.spend.usd.toFixed(3)} (total $${state.spend.totalUsd.toFixed(3)}).`);
}

async function runTick() {
  const { state, result, decision, usd, hobby, creationFile } = await tick();
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (result !== "acted") {
    console.log(`[${time}] Glorp is ${state.doing} (${result}).`);
    return;
  }
  console.log(`\n[${time}] ${decision.activity.replace(/_/g, " ")} at the ${state.place}  (${decision.mood}, $${usd.toFixed(4)})`);
  console.log(`  thinks: ${decision.thought}`);
  console.log(`  diary:  ${decision.diary}`);
  if (creationFile) console.log(`  made:   ${decision.creation.kind} "${decision.creation.title}" -> ${creationFile}`);
  if (hobby) console.log(`  NEW HOBBY: ${hobby.id} (${hobby.about})`);
  if (decision.new_wish) console.log(`  wishes: ${decision.new_wish}`);
  if (decision.remember) console.log(`  will remember: ${decision.remember}`);
}

const cmd = process.argv[2] || "tick";
const cfg = config();

if (!cfg.fake && !process.env.ANTHROPIC_API_KEY && (cmd === "tick" || cmd === "live")) {
  console.error("No ANTHROPIC_API_KEY found. Copy .env.example to .env and add your key, or set CREATURE_FAKE=1 to test without AI.");
  process.exit(1);
}

if (cmd === "tick") {
  await runTick();
} else if (cmd === "live") {
  console.log(`Glorp is alive. Thinking every ${cfg.tickMinutes} minutes. Press Ctrl+C to stop.`);
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
  console.error(`Unknown command "${cmd}". Use: live, tick, status, diary`);
  process.exit(1);
}
