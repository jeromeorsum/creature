// Build a static copy of the web view in site/ (used for GitHub Pages).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot } from "./server.js";
import { CREATIONS_DIR } from "./state.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || "site");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "api", "creation"), { recursive: true });
fs.copyFileSync(path.join(here, "..", "web", "index.html"), path.join(out, "index.html"));
fs.writeFileSync(path.join(out, "api", "state.json"), JSON.stringify(snapshot()));
if (fs.existsSync(CREATIONS_DIR())) {
  for (const f of fs.readdirSync(CREATIONS_DIR())) {
    fs.copyFileSync(path.join(CREATIONS_DIR(), f), path.join(out, "api", "creation", f));
  }
}
console.log(`Static site written to ${out}`);
