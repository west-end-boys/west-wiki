/**
 * Serve tools/map-viewer against the live map JSON.
 *
 *   npm run map:view            # http://localhost:7380
 *   npm run map:view -- --port 8080 --map data/maps/other.json
 *
 * The map file is re-read on every /map.json request, so editing the JSON (or
 * applying corrections with tools/map-import.ts) and refreshing the browser
 * always shows current data. Nothing is cached and nothing is written.
 *
 * Read-only by design: the viewer stages corrections and emits them in
 * map-import's text format for you to paste into a corrections file. It never
 * writes to the map itself, so map-import stays the single validated path for
 * changing hex data.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..", "..");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PORT = Number(flag("port", 7380));
const MAP_REL = flag("map", join("data", "maps", "western-reaches-surface.json"));
const MAP_PATH = resolve(ROOT, MAP_REL);

if (!MAP_PATH.startsWith(ROOT + sep)) {
  console.error(`--map must point inside the repository: ${MAP_REL}`);
  process.exit(2);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const NO_STORE = { "cache-control": "no-store" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname === "/" ? "/index.html" : url.pathname;

  try {
    if (path === "/map.json") {
      const body = await readFile(MAP_PATH);
      res.writeHead(200, { ...NO_STORE, "content-type": TYPES[".json"] });
      res.end(body);
      return;
    }

    // Only ever serve files from this directory.
    const target = resolve(HERE, `.${path}`);
    if (!target.startsWith(HERE)) {
      res.writeHead(403, NO_STORE).end("forbidden");
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, { ...NO_STORE, "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
    res.end(body);
  } catch (err) {
    const code = err.code === "ENOENT" ? 404 : 500;
    if (code === 500) console.error(err);
    res.writeHead(code, NO_STORE).end(code === 404 ? "not found" : "server error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`map-viewer   http://localhost:${PORT}`);
  console.log(`serving      ${MAP_REL}`);
  console.log(`stop         ctrl-c`);
});
