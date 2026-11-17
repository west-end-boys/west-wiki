/**
 * Terrain vocabulary for the surface map.
 *
 * `data/maps/terrain-types.json` is the source of truth; this module is the
 * lookup over it plus the integrity checks. Nothing here hardcodes a terrain
 * name, which is the point: the vocabulary used to live in three places - the
 * README's table, the viewer's own colour map, and whatever values happened to
 * be present in the map data - and all three had drifted apart.
 *
 * Terrain colours are mimetic rather than categorical, so the dataviz
 * categorical gates do not apply to the scheme as a whole: three blues for
 * water and three greens for vegetation are deliberate. What does apply is that
 * a new type must not be confusable with one already on the map, so new colours
 * are measured against the existing set. See data/maps/README.md.
 *
 * Plain JS with no DOM dependency so the browser viewer and the tests can both
 * load it, matching ./geometry.js and ./palette.js.
 */

/** The intrinsic land/water classification. `unknown` is only for UNKNOWN. */
export const TERRAIN_SURFACES = ["land", "water", "unknown"];

/**
 * Fill for a terrain value with no registry entry.
 *
 * Deliberately not a grey: the previous viewer fell back to `#777`, which reads
 * as legitimate map colour, so an undeclared terrain was invisible. It is also
 * deliberately not UNKNOWN's magenta - terrain inverts the region palette and
 * makes UNKNOWN the loud one, since UNKNOWN is the transcription to-do list, so
 * "not transcribed yet" and "nobody declared this type" need different colours.
 */
export const MISSING_FILL = "#7b00ff";

const HEX_COLOUR = /^#[0-9a-f]{6}$/;

/**
 * A lookup over a registry document, with fallbacks that stay truthful about
 * what is actually stored on the hex.
 */
export function makeTerrain(registry) {
  const byId = new Map(registry.terrainTypes.map((t) => [t.id, t]));
  return {
    entries: registry.terrainTypes,
    ids: registry.terrainTypes.map((t) => t.id),
    has: (id) => byId.has(id),
    colour: (id) => byId.get(id)?.colour ?? MISSING_FILL,
    label: (id) => byId.get(id)?.label ?? id,
    surface: (id) => byId.get(id)?.surface ?? "unknown",
  };
}

/** Structural problems with the registry itself, independent of any map. */
export function registryProblems(registry) {
  const problems = [];
  const seenId = new Map();
  const seenColour = new Map();

  for (const t of registry.terrainTypes) {
    const where = t.id === "" || t.id === undefined ? "(blank id)" : `"${t.id}"`;

    if (!t.id) problems.push(`a terrain type has no id`);
    else if (seenId.has(t.id)) problems.push(`terrain ${where} is declared twice`);
    else seenId.set(t.id, true);

    if (!t.label) problems.push(`terrain ${where} has no label`);

    if (!HEX_COLOUR.test(t.colour ?? "")) {
      problems.push(`terrain ${where} has colour "${t.colour}", not a 6-digit #rrggbb in lower case`);
    } else if (seenColour.has(t.colour)) {
      problems.push(
        `terrain ${where} shares colour ${t.colour} with "${seenColour.get(t.colour)}" ` +
          `- the two would be indistinguishable on the map`,
      );
    } else {
      seenColour.set(t.colour, t.id);
    }

    if (!TERRAIN_SURFACES.includes(t.surface)) {
      problems.push(
        `terrain ${where} has surface "${t.surface}", not one of ${TERRAIN_SURFACES.join(", ")}`,
      );
    }
  }
  return problems;
}

/**
 * Everything the registry does not account for in this map, worst first. Empty
 * means the registry is well-formed and every terrain value on a hex is
 * declared.
 *
 * Carries `registryProblems` through, so one call at viewer startup cannot show
 * a clean map over a broken registry.
 */
export function terrainProblems(registry, map) {
  const problems = registryProblems(registry);
  const declared = new Set(registry.terrainTypes.map((t) => t.id));

  const undeclared = new Map();
  for (const h of map.hexes) {
    if (declared.has(h.terrain)) continue;
    undeclared.set(h.terrain, (undeclared.get(h.terrain) ?? 0) + 1);
  }
  for (const [id, count] of [...undeclared].sort((a, b) => b[1] - a[1])) {
    problems.push(
      `${count} hex(es) carry terrain "${id}", which data/maps/terrain-types.json does not declare`,
    );
  }
  return problems;
}
