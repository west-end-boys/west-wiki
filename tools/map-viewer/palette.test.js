import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HUE,
  HUE_SEPARABLE,
  MISSING_FILL,
  REGION_STYLE,
  paletteProblems,
  regionBorders,
  regionColour,
  regionTexture,
  separable,
  shade,
} from "./palette.js";

const MAP = JSON.parse(
  readFileSync(new URL("../../data/maps/western-reaches-surface.json", import.meta.url), "utf8"),
);

describe("REGION_STYLE", () => {
  it("should give every region declared in the map an appearance", () => {
    // Regression: the palette held 7 regions after the map grew to 15, so the
    // 8 newest all fell through to one grey and were indistinguishable.
    for (const r of MAP.regions) {
      expect(REGION_STYLE[r.id], `no palette entry for "${r.id}"`).toBeDefined();
    }
  });

  it("should give every region a distinct hue-and-texture pair", () => {
    const seen = new Map();
    for (const [id, st] of Object.entries(REGION_STYLE)) {
      const key = `${st.hue}/${st.texture}`;
      expect(seen.has(key), `"${id}" looks identical to "${seen.get(key)}"`).toBe(false);
      seen.set(key, id);
    }
  });

  it("should name a real hue, or be the grey reserved for unassigned", () => {
    for (const [id, st] of Object.entries(REGION_STYLE)) {
      if (st.hue === null) {
        expect(id).toBe("UNKNOWN");
        expect(st.light).toMatch(/^#[0-9a-f]{6}$/);
        expect(st.dark).toMatch(/^#[0-9a-f]{6}$/);
      } else {
        expect(HUE[st.hue], `"${id}" names unknown hue "${st.hue}"`).toBeDefined();
      }
    }
    expect(REGION_STYLE.UNKNOWN.hue).toBe(null);
  });

  it("should use only solid and hatch", () => {
    for (const st of Object.values(REGION_STYLE)) {
      expect(["solid", "hatch"]).toContain(st.texture);
    }
  });
});

describe("separable", () => {
  it("should reject a hue against itself", () => {
    expect(separable("blue", "blue")).toBe(false);
  });

  it("should be symmetric", () => {
    for (const pair of HUE_SEPARABLE) {
      const [a, b] = pair.split("|");
      expect(separable(a, b)).toBe(true);
      expect(separable(b, a)).toBe(true);
    }
  });

  it("should reject the documented weak pairs", () => {
    // These are the measured failures that force texture to carry some
    // borders; see palette.js. blue<->violet and yellow<->orange in
    // particular sit below the normal-vision floor, not just the CVD gate.
    for (const [a, b] of [
      ["aqua", "magenta"], ["blue", "violet"], ["orange", "green"],
      ["orange", "yellow"], ["orange", "red"], ["aqua", "red"],
      ["yellow", "red"], ["yellow", "green"], ["green", "red"],
      ["magenta", "red"], ["orange", "magenta"], ["aqua", "green"],
    ]) {
      expect(separable(a, b), `${a}<->${b} should not be separable`).toBe(false);
    }
  });

  it("should hold 16 separable pairs of the 28 possible", () => {
    expect(HUE_SEPARABLE.size).toBe(16);
    expect(Object.keys(HUE).length).toBe(8);
  });

  it("should store every pair in sorted order so lookup cannot miss", () => {
    for (const pair of HUE_SEPARABLE) {
      const [a, b] = pair.split("|");
      expect([a, b]).toEqual([a, b].sort());
    }
  });
});

describe("regionColour", () => {
  it("should return the hue step for the requested mode", () => {
    // Read the hue from the table rather than naming one, so re-running the
    // assignment does not break a test about mode lookup.
    const hue = REGION_STYLE.gloaming.hue;
    expect(regionColour("gloaming", "light")).toBe(HUE[hue].light);
    expect(regionColour("gloaming", "dark")).toBe(HUE[hue].dark);
    expect(HUE[hue].light).not.toBe(HUE[hue].dark);
  });

  it("should return the reserved grey for unassigned hexes", () => {
    expect(regionColour("UNKNOWN", "light")).toBe("#cfcdc6");
    expect(regionColour("UNKNOWN", "dark")).toBe("#403f3b");
  });

  it("should shout rather than grey out an unstyled region", () => {
    // The failure mode being guarded: a region added to the map but not to the
    // palette must be obvious on screen, not quietly the colour of "unknown".
    expect(regionColour("not-a-region", "light")).toBe(MISSING_FILL);
    expect(regionColour("not-a-region", "light")).not.toBe(regionColour("UNKNOWN", "light"));
    expect(regionTexture("not-a-region")).toBe("solid");
  });
});

describe("shade", () => {
  it("should darken toward black without leaving the channel range", () => {
    expect(shade("#ffffff", 0)).toBe("rgb(255,255,255)");
    expect(shade("#ffffff", 1)).toBe("rgb(0,0,0)");
    expect(shade("#2a78d6", 0.45)).toBe("rgb(23,66,118)");
    expect(shade("#000000", 0.45)).toBe("rgb(0,0,0)");
  });
});

describe("regionBorders", () => {
  it("should find no borders in a single-region patch", () => {
    const hexes = [
      { x: 300, y: 10, regionId: "a" },
      { x: 300, y: 11, regionId: "a" },
    ];
    expect(regionBorders(hexes).size).toBe(0);
  });

  it("should ignore UNKNOWN, which is a frontier rather than a border", () => {
    const hexes = [
      { x: 300, y: 10, regionId: "a" },
      { x: 300, y: 11, regionId: "UNKNOWN" },
    ];
    expect(regionBorders(hexes).size).toBe(0);
  });

  it("should count a shared edge once from each side", () => {
    const hexes = [
      { x: 300, y: 10, regionId: "a" },
      { x: 300, y: 11, regionId: "b" },
    ];
    expect(regionBorders(hexes).get("a|b")).toBe(2);
  });

  it("should key pairs in sorted order regardless of hex order", () => {
    const hexes = [
      { x: 300, y: 11, regionId: "z" },
      { x: 300, y: 10, regionId: "a" },
    ];
    expect([...regionBorders(hexes).keys()]).toEqual(["a|z"]);
  });
});

describe("paletteProblems against the committed map", () => {
  it("should resolve every border that currently exists", () => {
    // This is the live check. It fails when transcription brings two regions
    // into contact that share both hue and texture, or whose hue pair is below
    // the separability gate — the signal that the assignment in palette.js
    // needs recomputing against the new border graph.
    expect(paletteProblems(MAP)).toEqual([]);
  });

  it("should name a region that the map declares but the palette does not style", () => {
    const map = { regions: [...MAP.regions, { id: "ghost", name: "Ghost" }], hexes: [] };
    expect(paletteProblems(map)).toEqual([
      'region "ghost" declared in the map has no palette entry',
    ]);
  });

  it("should name an undeclared region found on a hex", () => {
    const map = { regions: [], hexes: [{ x: 300, y: 10, regionId: "mystery" }] };
    expect(paletteProblems(map)).toContain('hexes carry undeclared region "mystery"');
  });

  it("should report a new border between two regions sharing hue and texture", () => {
    // andrik and kyzian are both red; andrik is solid and kyzian hatched, so
    // they are fine. Force the collision to prove the check has teeth.
    const map = {
      regions: [{ id: "andrik", name: "A" }, { id: "rimespire", name: "R" }],
      hexes: [
        { x: 300, y: 10, regionId: "andrik" },
        { x: 300, y: 11, regionId: "rimespire" },
      ],
    };
    // red <-> yellow measures CVD 6.7 / normal 13.0 — below both gates — and
    // both are solid, so nothing separates them.
    const problems = paletteProblems(map);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("andrik | rimespire");
    expect(problems[0]).toContain("hue pair below the gate");
  });

  it("should accept a border carried by texture alone", () => {
    // bastion and lowland are both green, so only texture separates them.
    // Fifteen regions over eight hues guarantees seven such pairs exist.
    expect(REGION_STYLE.bastion.hue).toBe(REGION_STYLE.lowland.hue);
    expect(REGION_STYLE.bastion.texture).not.toBe(REGION_STYLE.lowland.texture);
    const map = {
      regions: [{ id: "bastion", name: "B" }, { id: "lowland", name: "L" }],
      hexes: [
        { x: 300, y: 10, regionId: "bastion" },
        { x: 300, y: 11, regionId: "lowland" },
      ],
    };
    expect(paletteProblems(map)).toEqual([]);
  });

  it("should keep every shared-hue pair separated by texture", () => {
    // The structural floor: with 8 hues and 15 regions, seven pairs share a
    // hue. If such a pair ever shared a texture too they would be identical,
    // and any border between them would be invisible.
    const byHue = new Map();
    for (const [id, st] of Object.entries(REGION_STYLE)) {
      if (st.hue === null) continue;
      byHue.set(st.hue, [...(byHue.get(st.hue) ?? []), id]);
    }
    for (const [hue, ids] of byHue) {
      expect(ids.length, `hue "${hue}" is used by ${ids.length} regions`).toBeLessThanOrEqual(2);
      if (ids.length === 2) {
        expect(REGION_STYLE[ids[0]].texture).not.toBe(REGION_STYLE[ids[1]].texture);
      }
    }
  });
});
