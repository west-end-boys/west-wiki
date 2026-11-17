import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SQRT3,
  centre,
  corners,
  edgeNeighbours,
  inHex,
  latOf,
  neighbours,
  refOf,
} from "./geometry.js";

const MAP = JSON.parse(
  readFileSync(new URL("../../data/maps/western-reaches-surface.json", import.meta.url), "utf8"),
);
const S = 10;
const sortPairs = (ps) => [...ps].map((p) => p.join("/")).sort();

describe("latOf", () => {
  it("should place an even column half a hex above an odd column at the same row", () => {
    expect(latOf(1, 10)).toBe(10);
    expect(latOf(2, 10)).toBe(9.5);
  });

  it("should put the even-column y=1 hex above the odd-column y=1 hex", () => {
    expect(latOf(0, 1)).toBeLessThan(latOf(1, 1));
  });
});

describe("refOf", () => {
  it("should pad the row to two digits so column 3 row 4 is 304, not 34", () => {
    expect(refOf(3, 4)).toBe("304");
    expect(refOf(0, 24)).toBe("024");
    expect(refOf(8, 68)).toBe("868");
    expect(refOf(63, 74)).toBe("6374");
  });
});

describe("centre", () => {
  it("should place all six neighbours exactly one hex away", () => {
    // Every neighbour of a flat-top hex is the same distance from it: the
    // column pitch is 1.5s and the stagger is sqrt(3)/2 s, so a diagonal
    // neighbour is sqrt(1.5^2 + (sqrt(3)/2)^2) = sqrt(3) s away, matching the
    // sqrt(3) s vertical pitch. A stagger error would break this.
    for (const [col, row] of [[10, 30], [11, 30], [0, 1], [63, 74]]) {
      const [cx, cy] = centre(col, row, S);
      for (const [nc, nr] of neighbours(col, row)) {
        const [nx, ny] = centre(nc, nr, S);
        expect(Math.hypot(nx - cx, ny - cy)).toBeCloseTo(SQRT3 * S, 6);
      }
    }
  });

  it("should not overlap two hexes in the same column", () => {
    const [, ay] = centre(4, 10, S);
    const [, by] = centre(4, 11, S);
    expect(Math.abs(by - ay)).toBeCloseTo(SQRT3 * S, 6);
  });
});

describe("corners", () => {
  it("should produce a flat-top hex two units wide and sqrt(3) units tall", () => {
    const p = corners(0, 0, S);
    const xs = p.map(([x]) => x);
    const ys = p.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * S, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(SQRT3 * S, 6);
  });
});

describe("edgeNeighbours", () => {
  it("should describe the same six neighbours as the documented adjacency rule", () => {
    for (const [col, row] of [[10, 30], [11, 30], [4, 7], [5, 7]]) {
      expect(sortPairs(edgeNeighbours(col, row))).toEqual(sortPairs(neighbours(col, row)));
    }
  });

  it("should order edges so each neighbour lies across the edge it is paired with", () => {
    // Edge i joins corner i to corner i+1; its midpoint must be the point
    // halfway between the two hex centres. This is what makes region borders
    // draw on the correct side.
    for (const [col, row] of [[10, 30], [11, 30]]) {
      const [cx, cy] = centre(col, row, S);
      const p = corners(cx, cy, S);
      const nbs = edgeNeighbours(col, row);
      for (let i = 0; i < 6; i++) {
        const edgeMid = [(p[i][0] + p[(i + 1) % 6][0]) / 2, (p[i][1] + p[(i + 1) % 6][1]) / 2];
        const [nx, ny] = centre(nbs[i][0], nbs[i][1], S);
        expect(edgeMid[0]).toBeCloseTo((cx + nx) / 2, 6);
        expect(edgeMid[1]).toBeCloseTo((cy + ny) / 2, 6);
      }
    }
  });
});

describe("inHex", () => {
  it("should accept the centre and reject a point beyond the width", () => {
    expect(inHex(0, 0, S)).toBe(true);
    expect(inHex(S * 1.01, 0, S)).toBe(false);
  });

  it("should accept a point just inside the flat bottom edge", () => {
    // Regression: an earlier form of this test demanded sqrt(3)(s-x) >= 2y,
    // which is too strict by a factor of two and made the bottom third of
    // every hex unclickable.
    expect(inHex(0, (SQRT3 / 2) * S * 0.98, S)).toBe(true);
    expect(inHex(0, (SQRT3 / 2) * S * 1.02, S)).toBe(false);
  });

  it("should reject the corner region outside a slanted edge", () => {
    expect(inHex(S * 0.95, (SQRT3 / 2) * S * 0.95, S)).toBe(false);
    expect(inHex(S * 0.6, (SQRT3 / 2) * S * 0.5, S)).toBe(true);
  });

  it("should assign every point of a small patch to exactly one hex", () => {
    // Build a generous patch, then sample only a window well inside it, so a
    // miss means a genuine gap or overlap rather than falling off the edge.
    const cells = [];
    for (let col = 3; col <= 9; col++) {
      for (let row = 8; row <= 18; row++) cells.push([col, row, ...centre(col, row, S)]);
    }
    for (let x = 85; x < 115; x += 1.3) {
      for (let y = 200; y < 230; y += 1.3) {
        const hits = cells.filter(([, , cx, cy]) => inHex(x - cx, y - cy, S));
        expect(hits.length).toBe(1);
      }
    }
  });
});

describe("against the transcribed map", () => {
  it("should find every hex in the file at a distinct position", () => {
    const seen = new Set();
    for (const h of MAP.hexes) {
      const key = centre(h.x / 100, h.y, S).map((v) => v.toFixed(4)).join(",");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(MAP.hexes.length);
  });

  it("should hold 4736 hexes across 64 columns", () => {
    expect(MAP.hexes.length).toBe(4736);
    expect(new Set(MAP.hexes.map((h) => h.x / 100)).size).toBe(64);
  });

  it("should treat the islands named during transcription as contiguous", () => {
    // Given by the campaign owner while verifying the western sea. If the
    // stagger or adjacency were wrong these would come out in pieces.
    const present = new Set(MAP.hexes.map((h) => `${h.x / 100}/${h.y}`));
    const islands = [
      [[2, 24], [3, 23], [3, 24], [4, 24]],
      [[3, 27], [4, 27], [4, 28], [5, 26], [5, 27], [6, 26], [6, 27], [6, 28]],
    ];
    for (const island of islands) {
      const want = new Set(island.map(([c, r]) => `${c}/${r}`));
      for (const k of want) expect(present.has(k)).toBe(true);

      const seen = new Set([[...want][0]]);
      const queue = [[...want][0]];
      while (queue.length) {
        const [c, r] = queue.pop().split("/").map(Number);
        for (const [nc, nr] of neighbours(c, r)) {
          const k = `${nc}/${nr}`;
          if (want.has(k) && !seen.has(k)) {
            seen.add(k);
            queue.push(k);
          }
        }
      }
      expect(seen.size).toBe(want.size);
    }
  });

  it("should resolve every connection endpoint and location hex", () => {
    const present = new Set(MAP.hexes.map((h) => `${h.x}/${h.y}`));
    for (const c of MAP.connections) {
      expect(present.has(`${c.from.x}/${c.from.y}`)).toBe(true);
      expect(present.has(`${c.to.x}/${c.to.y}`)).toBe(true);
    }
    for (const l of MAP.locations) expect(present.has(`${l.hex.x}/${l.hex.y}`)).toBe(true);
  });
});
