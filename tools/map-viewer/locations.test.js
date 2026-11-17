import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCATION_KINDS,
  SETTLEMENT_SCALES,
  kindLabel,
  locationProblems,
  markOf,
} from "./locations.js";

const MAP = JSON.parse(
  readFileSync(new URL("../../data/maps/western-reaches-surface.json", import.meta.url), "utf8"),
);
const README = readFileSync(new URL("../../data/maps/README.md", import.meta.url), "utf8");

/**
 * A map built from scratch, so a teeth test cannot be fooled by the real one.
 * Two hexes exist; anything else is off the grid.
 */
const mapWith = (...locations) => ({
  hexes: [
    { x: 4000, y: 29, regionId: "montmar", terrain: "grassland" },
    { x: 4200, y: 29, regionId: "montmar", terrain: "swamp" },
  ],
  locations,
});

const settlement = (overrides = {}) => ({
  id: "fallow-ford",
  name: "Fallow Ford",
  kind: "settlement",
  scale: "village",
  hex: { x: 4000, y: 29 },
  hidden: false,
  ...overrides,
});

const poi = (overrides = {}) => ({
  id: "weeping-barrow",
  name: "The Weeping Barrow",
  kind: "point-of-interest",
  hex: { x: 4200, y: 29 },
  hidden: false,
  ...overrides,
});

describe("the location kind vocabulary", () => {
  it("should declare settlement and point-of-interest, the two arms ADR 005 names", () => {
    expect(LOCATION_KINDS.map((k) => k.id)).toEqual(["settlement", "point-of-interest"]);
  });

  it("should give each kind its own silhouette, so identity never rests on colour", () => {
    const marks = LOCATION_KINDS.map((k) => k.mark);
    expect(new Set(marks).size).toBe(marks.length);
  });

  it("should carry scale only on the settlement arm", () => {
    // The invariant the discriminated union exists to enforce: a dungeon cannot
    // have a population. See ADR 005 - a flat {type, scale?} would permit it.
    expect(LOCATION_KINDS.find((k) => k.id === "settlement").scaled).toBe(true);
    expect(LOCATION_KINDS.find((k) => k.id === "point-of-interest").scaled).toBe(false);
  });

  it("should order settlement scales largest first", () => {
    expect(SETTLEMENT_SCALES).toEqual(["city-state", "city", "town", "village"]);
  });

  it("should label an unknown kind with the raw value rather than inventing one", () => {
    expect(kindLabel("settlement")).toBe("Settlement");
    expect(kindLabel("planar-gate")).toBe("planar-gate");
  });

  it("should fall back to a distinct mark for an undeclared kind", () => {
    const declared = LOCATION_KINDS.map((k) => k.mark);
    expect(declared).not.toContain(markOf("planar-gate"));
  });
});

describe("the committed map's locations", () => {
  it("should have no problems", () => {
    // The live check. It fails when a location reaches the map in a shape
    // nothing declares - the drift that let Marin's Hold move into a second
    // `settlements` array and stop rendering, with the suite still green.
    expect(locationProblems(MAP)).toEqual([]);
  });

  it("should sit on hexes that exist", () => {
    const present = new Set(MAP.hexes.map((h) => `${h.x}/${h.y}`));
    for (const l of MAP.locations) {
      expect(present.has(`${l.hex.x}/${l.hex.y}`), `${l.id} is off the grid`).toBe(true);
    }
  });

  it("should keep every location in one array", () => {
    // Two arrays meant two lookups, and every consumer had to remember both.
    expect(MAP.settlements).toBeUndefined();
  });
});

describe("locationProblems", () => {
  it("should accept a well-formed settlement and point-of-interest", () => {
    expect(locationProblems(mapWith(settlement(), poi()))).toEqual([]);
  });

  it("should report an undeclared kind", () => {
    const problems = locationProblems(mapWith(poi({ kind: "planar-gate" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("planar-gate");
  });

  it("should report a settlement with no scale", () => {
    const noScale = settlement();
    delete noScale.scale;
    const problems = locationProblems(mapWith(noScale));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/scale/);
  });

  it("should report a settlement whose scale is not a declared one", () => {
    const problems = locationProblems(mapWith(settlement({ scale: "hamlet" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("hamlet");
  });

  it("should report a point-of-interest carrying a scale", () => {
    // The combination the union forbids and a flat shape would permit.
    const problems = locationProblems(mapWith(poi({ scale: "village" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/scale/);
  });

  it("should report a duplicate id", () => {
    const problems = locationProblems(mapWith(settlement(), poi({ id: "fallow-ford" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("fallow-ford");
  });

  it("should report a location with no id or no name", () => {
    expect(locationProblems(mapWith(settlement({ id: "" })))).toHaveLength(1);
    expect(locationProblems(mapWith(settlement({ name: "" })))).toHaveLength(1);
  });

  it("should report a location off the hex grid", () => {
    const problems = locationProblems(mapWith(settlement({ hex: { x: 9900, y: 3 } })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/9900\/3|hex/);
  });

  it("should report a leftover settlements array", () => {
    // The migration guard: this shape is what #47 replaced, and a map that
    // reintroduces it would otherwise look clean while half its places vanish.
    const doc = mapWith(poi());
    doc.settlements = [settlement()];
    const problems = locationProblems(doc);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("settlements");
  });

  it("should report a leftover type field", () => {
    // `type` did two jobs - scale on a settlement, kind on a dungeon - which is
    // the mixing ADR 005 diagnosed in both pre-existing vocabularies.
    const problems = locationProblems(mapWith(poi({ type: "dungeon" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("type");
  });

  it("should report a non-boolean hidden flag", () => {
    // `visibility: "?"` was a placeholder carrying no information. A staging
    // stand-in for ADR 004 effect visibility has to at least be answerable.
    const problems = locationProblems(mapWith(settlement({ hidden: "?" })));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/hidden/);
  });

  it("should report every problem, not just the first", () => {
    const problems = locationProblems(mapWith(settlement({ scale: "hamlet" }), poi({ kind: "x" })));
    expect(problems).toHaveLength(2);
  });

  it("should treat a map with no locations as fine", () => {
    expect(locationProblems(mapWith())).toEqual([]);
  });
});

describe("data/maps/README.md", () => {
  it("should document every declared kind, and no others", () => {
    const section = README.slice(README.indexOf("## Locations"));
    const table = section.slice(0, section.indexOf("\n### "));
    const documented = [...table.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);
    expect(documented.length, "no backticked kind rows found in the README table").toBeGreaterThan(
      0,
    );
    expect([...documented].sort()).toEqual(LOCATION_KINDS.map((k) => k.id).sort());
  });
});
