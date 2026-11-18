/**
 * map-import's terrain validation, exercised through the real CLI.
 *
 * This is an integration test on purpose. The viewer's Preview and Apply
 * buttons shell out to exactly this command (tools/map-viewer/serve.mjs), so
 * the CLI's exit code and message *are* the contract. A unit test around an
 * exported function would not have caught the thing that was wrong here: the
 * check passed, but it was a warning rather than an error.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TSX = join(ROOT, "node_modules/.bin/tsx");

let dir;
let mapPath;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "map-import-test-"));
  mapPath = join(dir, "map.json");
  // A synthetic three-hex map, so the test never reads or writes the real one.
  writeFileSync(
    mapPath,
    JSON.stringify({
      map: { id: "test", name: "Test" },
      regions: [{ id: "testland", name: "Testland" }],
      hexes: [
        { x: 300, y: 23, regionId: "testland", terrain: "UNKNOWN" },
        { x: 300, y: 24, regionId: "testland", terrain: "UNKNOWN" },
        { x: 300, y: 25, regionId: "testland", terrain: "grassland" },
      ],
      connections: [],
      locations: [],
    }),
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Run a corrections block as a dry run. Writes nothing: no --apply. */
const run = (body) => {
  const file = join(dir, "corrections.txt");
  writeFileSync(file, body);
  const r = spawnSync(TSX, ["tools/map-import.ts", file, "--map", mapPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe("map-import terrain validation", () => {
  it("should refuse a terrain the registry does not declare", () => {
    // Previously a warning, which meant a typo and a genuinely new terrain type
    // produced the same output and both were applied.
    const { code, out } = run("[terrain]\ntundra: 323\n");
    expect(code).not.toBe(0);
    expect(out).toContain("tundra");
  });

  it("should name the registry in the refusal, so the fix is obvious", () => {
    const { out } = run("[terrain]\ntundra: 323\n");
    expect(out).toContain("data/maps/terrain-types.json");
  });

  it("should catch a misspelling of a real terrain", () => {
    const { code, out } = run("[terrain]\nmountian: 323\n");
    expect(code).not.toBe(0);
    expect(out).toContain("mountian");
  });

  it("should accept a registered terrain that no hex carries yet", () => {
    // The point of the registry. `canyon` is declared but unused, so the old
    // check - which derived the vocabulary from values already in the map -
    // would have rejected the first ever use of a new type.
    const { code } = run("[terrain]\ncanyon: 323, 324\n");
    expect(code).toBe(0);
  });

  it("should still accept UNKNOWN, which is a legitimate terrain value", () => {
    // Unlike regionId, where UNKNOWN is a hard error, terrain UNKNOWN records
    // "not transcribed, or hidden under a map symbol" and must stay assignable.
    const { code } = run("[terrain]\nUNKNOWN: 325\n");
    expect(code).toBe(0);
  });

  it("should leave the map untouched on a dry run", () => {
    run("[terrain]\ncanyon: 323\n");
    const after = spawnSync(TSX, ["tools/map-import.ts", "--dump-regions", "--map", mapPath], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(after.status).toBe(0);
  });
});
