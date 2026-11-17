/**
 * Hex grid geometry for the surface map.
 *
 * Flat-top hexes laid out in columns. An EVEN column sits half a hex higher
 * than an odd column at the same `y`, so a hex's physical latitude is
 *
 *   lat = y - 0.5   (even column)
 *   lat = y         (odd column)
 *
 * which is why even columns have no `y = 0` and odd columns have no `y = 74`.
 * See data/maps/README.md — that document is authoritative and this module
 * must agree with it.
 *
 * Plain JS with no DOM dependency so the browser viewer and the test suite can
 * both load it. Canvas convention: +y is south.
 */

export const SQRT3 = Math.sqrt(3);

/** Physical latitude of a hex, accounting for the column stagger. */
export const latOf = (col, row) => (col % 2 === 0 ? row - 0.5 : row);

/** Pixel centre of a hex, for a hex of circumradius `s`. */
export const centre = (col, row, s) => [
  col * 1.5 * s + s,
  (latOf(col, row) + 0.5) * SQRT3 * s,
];

/** The six corners of a flat-top hex, corner i at 60i degrees. */
export const corners = (cx, cy, s) => {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    p.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
  }
  return p;
};

/**
 * Hex reference as written in conversation and correction files: column
 * followed by a two-digit row. Column 8 row 68 is "868"; column 3 row 4 is
 * "304", never "34".
 */
export const refOf = (col, row) => `${col}${String(row).padStart(2, "0")}`;

/**
 * The six neighbours, in the same order as `corners` yields edges — edge i
 * joins corner i to corner i+1, so the faces run SE, S, SW, NW, N, NE.
 *
 * Used for drawing region boundaries, where an edge must be matched to the
 * neighbour across it. The *set* is the same as the adjacency rule in
 * data/maps/README.md; only the order is fixed to the edge order here.
 */
export const edgeNeighbours = (col, row) =>
  col % 2 === 1
    ? [
        [col + 1, row + 1], // SE
        [col, row + 1], // S
        [col - 1, row + 1], // SW
        [col - 1, row], // NW
        [col, row - 1], // N
        [col + 1, row], // NE
      ]
    : [
        [col + 1, row], // SE
        [col, row + 1], // S
        [col - 1, row], // SW
        [col - 1, row - 1], // NW
        [col, row - 1], // N
        [col + 1, row - 1], // NE
      ];

/**
 * The adjacency rule exactly as data/maps/README.md states it, order
 * unspecified. Kept separate from `edgeNeighbours` so the test suite can
 * assert the two agree as sets.
 */
export const neighbours = (col, row) =>
  col % 2 === 1
    ? [[col, row - 1], [col, row + 1], [col - 1, row], [col - 1, row + 1], [col + 1, row], [col + 1, row + 1]]
    : [[col, row - 1], [col, row + 1], [col - 1, row - 1], [col - 1, row], [col + 1, row - 1], [col + 1, row]];

/** Is a point, given relative to a flat-top hex's centre, inside it? */
export const inHex = (dx, dy, s) => {
  const x = Math.abs(dx);
  const y = Math.abs(dy);
  if (x > s || y > (SQRT3 / 2) * s) return false;
  if (x <= s / 2) return true;
  return SQRT3 * (s - x) >= y - 1e-9;
};
