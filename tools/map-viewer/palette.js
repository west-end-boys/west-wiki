/**
 * Region appearance for the surface map.
 *
 * A region's appearance is a hue from the validated 8-slot categorical palette
 * plus a solid/hatched texture. Eight hues cannot give fifteen regions distinct
 * appearances, so texture is the second channel: 8 x 2 = 16 combinations.
 *
 * Hue alone cannot resolve every border on this map, and that is structural
 * rather than a tuning failure. `last-sea`, `montmar`, `lowland` and
 * `rimespire` all border one another, so telling them apart by hue needs four
 * mutually separable hues — and the largest mutually separable set this palette
 * has is three. Texture is therefore load-bearing rather than decorative, which
 * is the condition under which it may carry meaning.
 *
 * The assignment below was computed against the border graph of the real hex
 * data: it puts 16 of the 18 borders then present onto hue (worst CVD dE 8.4,
 * worst normal-vision dE 19.3 — both gates cleared) and leaves only the two
 * shortest borders resting on texture.
 *
 * That graph is not fixed. It grows with every column transcribed, and four of
 * the fifteen regions have no hexes at all yet, so a pair that does not touch
 * today may touch tomorrow. `paletteProblems` re-derives the graph from the
 * data and names anything this assignment no longer resolves; the viewer runs
 * it on every load and the test suite runs it against the committed map.
 *
 * Plain JS with no DOM dependency so the browser viewer and the tests can both
 * load it.
 */
import { edgeNeighbours } from "./geometry.js";

/** The eight validated categorical slots, light and dark steps. */
export const HUE = {
  blue:    { light: "#2a78d6", dark: "#3987e5" },
  orange:  { light: "#eb6834", dark: "#d95926" },
  aqua:    { light: "#1baf7a", dark: "#199e70" },
  yellow:  { light: "#eda100", dark: "#c98500" },
  magenta: { light: "#e87ba4", dark: "#d55181" },
  green:   { light: "#008300", dark: "#008300" },
  violet:  { light: "#6250d6", dark: "#9085e9" },
  red:     { light: "#e34948", dark: "#e66767" },
};

/**
 * The 16 of 28 hue pairs that clear BOTH gates — CVD dE >= 8 and
 * normal-vision dE >= 15 — in light and dark mode alike, measured on the
 * steps above. Any pair absent from this set is not separable by hue and must
 * be carried by texture instead.
 */
export const HUE_SEPARABLE = new Set([
  "aqua|yellow", "aqua|orange", "blue|magenta", "green|magenta", "magenta|yellow",
  "magenta|violet", "aqua|violet", "blue|red", "red|violet", "aqua|blue",
  "blue|orange", "orange|violet", "blue|green", "green|violet", "violet|yellow",
  "blue|yellow",
]);

/** Can these two hues be told apart on their own? */
export const separable = (a, b) => a !== b && HUE_SEPARABLE.has([a, b].sort().join("|"));

/**
 * Fill for a region id with no palette entry. Loud on purpose: silently
 * greying an unstyled region is how the previous palette hid eight newly
 * declared regions for a whole work session.
 */
export const MISSING_FILL = "#ff35b0";

/**
 * UNKNOWN is deliberately a low-chroma grey rather than a categorical slot —
 * unassigned is the absence of a region, not another one of them.
 */
export const REGION_STYLE = {
  "gloaming":  { hue: "blue",    texture: "solid" },
  "last-sea":  { hue: "violet",  texture: "hatch" },
  "andrik":    { hue: "red",     texture: "solid" },
  "tal-yool":  { hue: "magenta", texture: "hatch" },
  "bastion":   { hue: "yellow",  texture: "hatch" },
  "montmar":   { hue: "aqua",    texture: "hatch" },
  "lowland":   { hue: "orange",  texture: "hatch" },
  "rimespire": { hue: "yellow",  texture: "solid" },
  "sablewood": { hue: "magenta", texture: "solid" },
  "myre":      { hue: "orange",  texture: "solid" },
  "dhalpurna": { hue: "green",   texture: "hatch" },
  "kyzian":    { hue: "red",     texture: "hatch" },
  "djurum":    { hue: "aqua",    texture: "solid" },
  "gilzai":    { hue: "blue",    texture: "hatch" },
  "silent":    { hue: "violet",  texture: "solid" },
  "UNKNOWN":   { hue: null, texture: "solid", light: "#cfcdc6", dark: "#403f3b" },
};

/** Fill colour for a region id in the given mode. */
export const regionColour = (id, mode) => {
  const st = REGION_STYLE[id];
  if (!st) return MISSING_FILL;
  return st.hue ? HUE[st.hue][mode] : st[mode];
};

export const regionTexture = (id) => REGION_STYLE[id]?.texture ?? "solid";

/** Mix a hex colour toward black, for the inked tone-on-tone hatch line. */
export const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - k)));
  return `rgb(${ch.join(",")})`;
};

/**
 * Region pairs that share at least one hex edge, as `"a|b" -> shared edges`.
 * Each border is counted once per side, so the value is twice the number of
 * shared edges; only the ordering matters to callers.
 */
export function regionBorders(hexes) {
  const by = new Map(hexes.map((h) => [`${h.x / 100}/${h.y}`, h]));
  const border = new Map();
  for (const h of hexes) {
    if (h.regionId === "UNKNOWN") continue;
    for (const [nc, nr] of edgeNeighbours(h.x / 100, h.y)) {
      const o = by.get(`${nc}/${nr}`);
      if (!o || o.regionId === "UNKNOWN" || o.regionId === h.regionId) continue;
      const k = [h.regionId, o.regionId].sort().join("|");
      border.set(k, (border.get(k) ?? 0) + 1);
    }
  }
  return border;
}

/**
 * Everything the palette no longer resolves for this map, worst first. Empty
 * means every declared region has an appearance and every border that exists
 * is carried by hue or by texture.
 */
export function paletteProblems(map) {
  const problems = [];
  const styled = new Set(Object.keys(REGION_STYLE));

  for (const r of map.regions) {
    if (!styled.has(r.id)) problems.push(`region "${r.id}" declared in the map has no palette entry`);
  }
  const declared = new Set(map.regions.map((r) => r.id));
  for (const id of new Set(map.hexes.map((h) => h.regionId))) {
    if (!styled.has(id) && !declared.has(id)) problems.push(`hexes carry undeclared region "${id}"`);
  }

  const unresolved = [];
  for (const [k, w] of regionBorders(map.hexes)) {
    const [a, b] = k.split("|");
    const sa = REGION_STYLE[a], sb = REGION_STYLE[b];
    if (!sa || !sb) continue;                  // already reported above
    if (separable(sa.hue, sb.hue)) continue;   // carried by hue
    if (sa.texture !== sb.texture) continue;   // carried by texture
    unresolved.push([w, a, b, sa.hue === sb.hue ? "same hue and texture" : "hue pair below the gate"]);
  }
  for (const [w, a, b, why] of unresolved.sort((x, y) => y[0] - x[0])) {
    problems.push(`${a} | ${b} now border (${w / 2} hexes) and are not separable — ${why}`);
  }
  return problems;
}
