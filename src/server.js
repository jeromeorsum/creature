// A tiny web server so you can watch Glorp live in your browser.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadState, readDiary, CREATIONS_DIR } from "./state.js";
import { allActivities, PLACES } from "./world.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, "..", "web", "index.html");

// Everything the web page needs, in one object.
export function snapshot() {
  const state = loadState();
  return {
    state,
    diary: readDiary(40).reverse(),
    places: Object.keys(PLACES),
    activities: allActivities(state),
    now: new Date().toISOString(),
  };
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

export function startServer(port = Number(process.env.PORT || 3000)) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/") return send(res, 200, fs.readFileSync(PAGE, "utf8"), "text/html; charset=utf-8");
      if (url.pathname === "/api/state.json") return send(res, 200, snapshot());
      if (url.pathname.startsWith("/api/creation/")) {
        const name = path.basename(decodeURIComponent(url.pathname.slice("/api/creation/".length)));
        const file = path.join(CREATIONS_DIR(), name);
        if (!name.endsWith(".md") || !fs.existsSync(file)) return send(res, 404, { error: "not found" });
        return send(res, 200, fs.readFileSync(file, "utf8"), "text/plain; charset=utf-8");
      }
      send(res, 404, { error: "not found" });
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  });
  server.listen(port, () => console.log(`Watch Glorp at http://localhost:${port}`));
  return server;
}
