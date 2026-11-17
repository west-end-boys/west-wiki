import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MISSING_FILL,
  TERRAIN_SURFACES,
  makeTerrain,
  registryProblems,
  terrainProblems,
} from "./terrain.js";

const REGISTRY = JSON.parse(
  readFileSync(new URL("../../data/maps/terrain-types.json", import.meta.url), "utf8"),
);
const MAP = JSON.parse(
  readFileSync(new URL("../../data/maps/western-reaches-surface.json", import.meta.url), "utf8"),
);
const README = readFileSync(new URL("../../data/maps/README.md", import.meta.url), "utf8");

/** A registry built from scratch, so a teeth test cannot be fooled by the real one. */
const reg = (...terrainTypes) => ({ terrainTypes });
const entry = (overrides = {}) => ({
  id: "scrub",
  label: "Scrub",
  colour: "#aabb11",
  surface: "land",
  ...overrides,
});

describe("the terrain registry", () => {
  it("should have no structural problems", () => {
    expect(registryProblems(REGISTRY)).toEqual([]);
  });

  it("should declare the types the map actually uses", () => {
    // The live check. It fails when a terrain value reaches the map without
    // being declared first - the drift that let `lake` and `lava` into the data
    // while data/maps/README.md still called them pending.
    expect(terrainProblems(REGISTRY, MAP)).toEqual([]);
  });

  it("should declare every terrain named in the README's table", () => {
    // Three places used to hold this vocabulary and all three disagreed. The
    // registry is now the source of truth; this pins the prose to it.
    const section = README.slice(README.indexOf("## Terrain"));
    const table = section.slice(0, section.indexOf("\n### "));
    const documented = [...table.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);

    expect(documented.length, "no backticked terrain rows found in the README table").toBeGreaterThan(0);
    expect([...documented].sort()).toEqual(REGISTRY.terrainTypes.map((t) => t.id).sort());
  });

  it("should declare the two newest types", () => {
    // No hex carries either yet, so the map-driven check above cannot see them.
    const ids = REGISTRY.terrainTypes.map((t) => t.id);
    expect(ids).toContain("salt flat");
    expect(ids).toContain("canyon");
  });

  it("should keep the unknown-value fill distinguishable from an undeclared one", () => {
    // Terrain inverts the region palette: UNKNOWN is the loud one here, because
    // it is the transcription to-do list. So "not transcribed yet" and "nobody
    // declared this type" must not look alike.
    const unknown = REGISTRY.terrainTypes.find((t) => t.id === "UNKNOWN");
    expect(unknown, "UNKNOWN must be a declared type, not a fallback").toBeDefined();
    expect(MISSING_FILL).not.toBe(unknown.colour);
  });
});

describe("registryProblems", () => {
  it("should accept a minimal well-formed registry", () => {
    expect(registryProblems(reg(entry()))).toEqual([]);
  });

  it("should reject a duplicate id", () => {
    const problems = registryProblems(reg(entry(), entry({ colour: "#112233" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("scrub");
    expect(problems[0]).toContain("declared twice");
  });

  it("should reject two types sharing a colour", () => {
    // Two terrains the same colour is indistinguishable on the map, which is
    // the whole failure this registry exists to prevent.
    const problems = registryProblems(reg(entry(), entry({ id: "heath", label: "Heath" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("#aabb11");
  });

  it("should reject a malformed colour", () => {
    for (const colour of ["aabb11", "#abc", "#gggggg", "", "#aabb1"]) {
      expect(registryProblems(reg(entry({ colour }))), colour).not.toEqual([]);
    }
  });

  it("should reject a surface outside the permitted set", () => {
    const problems = registryProblems(reg(entry({ surface: "sky" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("sky");
  });

  it("should reject a missing label or id", () => {
    expect(registryProblems(reg(entry({ label: "" })))).not.toEqual([]);
    expect(registryProblems(reg(entry({ id: "" })))).not.toEqual([]);
  });

  it("should permit only the three documented surfaces", () => {
    expect(TERRAIN_SURFACES).toEqual(["land", "water", "unknown"]);
  });
});

describe("terrainProblems", () => {
  it("should name a terrain value the registry does not declare", () => {
    const map = { hexes: [{ x: 300, y: 10, terrain: "tundra" }] };
    const problems = terrainProblems(REGISTRY, map);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("tundra");
  });

  it("should report how many hexes carry an undeclared value, worst first", () => {
    const map = {
      hexes: [
        { x: 300, y: 10, terrain: "tundra" },
        { x: 300, y: 11, terrain: "steppe" },
        { x: 300, y: 12, terrain: "steppe" },
      ],
    };
    const problems = terrainProblems(REGISTRY, map);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("steppe");
    expect(problems[0]).toContain("2");
    expect(problems[1]).toContain("tundra");
  });

  it("should carry the registry's own problems through", () => {
    // One call at viewer startup has to surface both, or a broken registry
    // looks like a clean map.
    const problems = terrainProblems(reg(entry({ surface: "sky" })), { hexes: [] });
    expect(problems.some((p) => p.includes("sky"))).toBe(true);
  });
});

describe("makeTerrain", () => {
  it("should look up colour, label and surface by id", () => {
    const t = makeTerrain(REGISTRY);
    const ocean = REGISTRY.terrainTypes.find((x) => x.id === "ocean");
    expect(t.colour("ocean")).toBe(ocean.colour);
    expect(t.label("ocean")).toBe(ocean.label);
    expect(t.surface("ocean")).toBe("water");
  });

  it("should preserve registry order, which is the legend's order", () => {
    expect(makeTerrain(REGISTRY).ids).toEqual(REGISTRY.terrainTypes.map((t) => t.id));
  });

  it("should shout rather than quietly grey out an undeclared terrain", () => {
    // The failure being guarded: the old viewer fell back to #777, which reads
    // as legitimate map colour, so an undeclared type was invisible.
    const t = makeTerrain(REGISTRY);
    expect(t.colour("tundra")).toBe(MISSING_FILL);
    expect(t.has("tundra")).toBe(false);
  });

  it("should still name an undeclared terrain in the readout", () => {
    // Falling back to the raw id keeps the hover readout and the corrections
    // block truthful about what is actually stored on the hex.
    const t = makeTerrain(REGISTRY);
    expect(t.label("tundra")).toBe("tundra");
    expect(t.surface("tundra")).toBe("unknown");
  });
});
