/**
 * The location vocabulary for the surface map.
 *
 * One array, discriminated by `kind` - the shape
 * doc/adr/005-map-data-ownership-and-location-taxonomy.md specifies. The map
 * JSON briefly staged places in two arrays, `settlements` and `locations`, and
 * that is what this module exists to prevent recurring: the viewer iterated
 * `locations` only, so the one settlement on the map silently stopped drawing
 * and the whole suite stayed green. Terrain had the same failure in triplicate.
 *
 * ADR 005 splits the arms by affordance, not appearance. A settlement is
 * somewhere a character can perform downtime, shop, and travel from; a point of
 * interest is somewhere to explore or raise a call to adventure about. A hostile
 * orc town looks like a settlement and is a point of interest, because it offers
 * neither.
 *
 * Scale applies only to settlements, so it lives in the arm rather than as an
 * optional field - a flat `{ type, scale? }` would permit a dungeon with a
 * population. `locationProblems` enforces that here, since JSON cannot.
 *
 * `visibleTo` is a **floor**, and it is campaign-wide. It cannot express that
 * one party has found a ruin and another has not - both are PLAYER - which is
 * the West Marches case and the KB's job per
 * doc/adr/004-fact-model-veracity-and-visibility.md. The two compose rather than
 * compete: this floor decides who may *ever* see the place, and per-viewer
 * resolution decides who sees it *yet*.
 *
 * Plain JS with no DOM dependency so the browser viewer and the tests can both
 * load it, matching ./geometry.js, ./palette.js and ./terrain.js.
 */

/**
 * The two arms, each with its own silhouette so a kind is never carried by
 * colour alone. `scaled` says whether the arm takes a `SETTLEMENT_SCALES` value.
 *
 * Adding a kind means adding an entry here, a mark branch in the viewer's
 * `drawLocationMark`, and a row in data/maps/README.md - the table is pinned by
 * locations.test.js, so the documentation cannot drift behind the code.
 */
export const LOCATION_KINDS = [
  { id: "settlement", label: "Settlement", mark: "circle", scaled: true },
  { id: "point-of-interest", label: "Point of Interest", mark: "diamond", scaled: false },
];

/** Settlement scale, largest first. Only the settlement arm carries one. */
export const SETTLEMENT_SCALES = ["city-state", "city", "town", "village"];

/**
 * Viewer tiers in ascending rank - `ViewerRole` in packages/app-be/src/index.ts,
 * and the hierarchy doc/app-be/adr/004-role-based-permission-tiers.md defines.
 *
 * A location's `visibleTo` is the **minimum** tier that may see it, never an
 * exact match: `visibleTo: "GM"` is seen by GMs and administrators and by nobody
 * below, and `"ANONYMOUS"` is public. ADR 004 is explicit that authorization is
 * a rank comparison against a required minimum, which is why this is an ordered
 * list rather than a set.
 */
export const VIEWER_ROLES = ["ANONYMOUS", "PLAYER", "GM", "ADMINISTRATOR"];

/**
 * A tier's rank. An undeclared tier ranks above every real one, so a typo
 * conceals a place rather than publishing it - the one direction this must
 * never fail in.
 */
export function rankOf(role) {
  const i = VIEWER_ROLES.indexOf(role);
  return i === -1 ? VIEWER_ROLES.length : i;
}

/**
 * Mark for a kind with no entry above.
 *
 * Deliberately distinct from every declared mark, for the same reason terrain's
 * MISSING_FILL is not a grey: an undeclared value has to look wrong rather than
 * plausible. A cross reads as a defect at any size.
 */
export const MISSING_MARK = "cross";

/** Fields this shape does not use, mapped to what replaced them. */
const RETIRED_FIELDS = {
  type: "`kind` for the arm, `scale` for a settlement's size - `type` did both jobs",
  hidden: "`visibleTo`, a viewer tier - a boolean collapsed ADR 004's four tiers into two",
};

const byKind = new Map(LOCATION_KINDS.map((k) => [k.id, k]));

/** The kind's display label, or the raw value when nothing declares it. */
export function kindLabel(kind) {
  return byKind.get(kind)?.label ?? kind;
}

/** The kind's silhouette, or MISSING_MARK when nothing declares it. */
export function markOf(kind) {
  return byKind.get(kind)?.mark ?? MISSING_MARK;
}

/**
 * How a location reads in one line: "Marin's Hold (settlement, village)".
 * Used by the hover readout, so it stays truthful about an undeclared kind.
 */
export function describe(location) {
  const parts = [kindLabel(location.kind).toLowerCase()];
  if (location.scale) parts.push(location.scale);
  // Only worth saying when it is not public - every other place would carry it.
  if (rankOf(location.visibleTo) > 0) parts.push(`${location.visibleTo}+ only`);
  return `${location.name} (${parts.join(", ")})`;
}

/**
 * Everything wrong with this map's locations, re-derived from the data rather
 * than trusted. Empty means every location is a declared kind, carries a scale
 * exactly when its arm takes one, is uniquely identified, and sits on a hex that
 * exists.
 *
 * Reports every problem rather than the first, so one malformed entry cannot
 * hide the rest.
 */
export function locationProblems(map) {
  const problems = [];

  // A second array is the failure this module was written for, so it is checked
  // before anything in `locations` - a map carrying both would otherwise report
  // clean while half its places were invisible.
  for (const key of ["settlements", "pointsOfInterest"]) {
    const extra = map[key];
    if (Array.isArray(extra)) {
      problems.push(
        `the map has a separate \`${key}\` array of ${extra.length} - locations live in ` +
          `\`locations\`, discriminated by \`kind\`, so every consumer has one list to read`,
      );
    }
  }

  const present = new Set(map.hexes.map((h) => `${h.x}/${h.y}`));
  const seenId = new Set();

  for (const l of map.locations ?? []) {
    const where = l.id ? `location "${l.id}"` : `location "${l.name || "(unnamed)"}"`;

    if (!l.id) problems.push(`a location has no id (name: "${l.name ?? ""}")`);
    else if (seenId.has(l.id)) problems.push(`${where} is declared twice`);
    else seenId.add(l.id);

    if (!l.name) problems.push(`${where} has no name`);

    const kind = byKind.get(l.kind);
    if (!kind) {
      const had = l.kind === undefined ? "no kind" : `kind "${l.kind}"`;
      problems.push(
        `${where} has ${had}; it must be one of ${LOCATION_KINDS.map((k) => k.id).join(", ")}`,
      );
    } else if (kind.scaled && !SETTLEMENT_SCALES.includes(l.scale)) {
      const had = l.scale === undefined ? "no scale" : `scale "${l.scale}"`;
      problems.push(
        `${where} is a ${kind.id} with ${had}; it must be one of ${SETTLEMENT_SCALES.join(", ")}`,
      );
    } else if (!kind.scaled && l.scale !== undefined) {
      problems.push(
        `${where} is a ${kind.id} and carries scale "${l.scale}" - scale applies only to a ` +
          `settlement`,
      );
    }

    if (!VIEWER_ROLES.includes(l.visibleTo)) {
      const had = l.visibleTo === undefined ? "no visibleTo" : `visibleTo "${l.visibleTo}"`;
      problems.push(
        `${where} has ${had}; it must be one of ${VIEWER_ROLES.join(", ")} - the lowest tier ` +
          `that may see it. There is no default, because defaulting would publish a GM-only ` +
          `place by omission`,
      );
    }

    for (const [field, replacement] of Object.entries(RETIRED_FIELDS)) {
      if (l[field] !== undefined) problems.push(`${where} carries \`${field}\`; use ${replacement}`);
    }

    if (!l.hex || !present.has(`${l.hex.x}/${l.hex.y}`)) {
      problems.push(
        `${where} sits at hex ${l.hex?.x}/${l.hex?.y}, which this map does not have`,
      );
    }
  }
  return problems;
}
