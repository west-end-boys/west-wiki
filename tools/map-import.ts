/**
 * Apply hex terrain and region corrections to a surface map from a plain-text
 * list.
 *
 * Usage:
 *   npx tsx tools/map-import.ts <corrections-file> [--apply] [--map <path>]
 *   npx tsx tools/map-import.ts --dump-regions [cols] [--map <path>]
 *
 * Without --apply it reports what would change and exits (dry run).
 * --map overrides the surface map; it defaults to DEFAULT_MAP_PATH below.
 * tools/map-viewer drives this script over HTTP so that clicking a correction
 * in the browser runs exactly these validations.
 * --dump-regions prints the map's current region assignment in the run
 * notation below, for verification or to use as a starting template.
 *
 * ---------------------------------------------------------------------------
 * Corrections file format
 * ---------------------------------------------------------------------------
 * Optional [terrain] / [regions] section headers select the mode. Without a
 * header the file is read as terrain. Blank lines and # comments are ignored.
 *
 *   [terrain]
 *   # one terrain per line, comma-separated hex refs
 *   forest:    224, 327, 427, 428
 *   mountain:  323, 424
 *   grassland: <none>
 *
 *   [regions]
 *   # one column per line: "<col>: <region> <row-range>, ..."
 *   0: andrik 1-10, last-sea 11-74
 *   7: andrik 0-10, last-sea 11-39, montmar 40-41, bastion 42-46
 *
 * Hex ref notation (terrain mode): the LAST TWO digits are the row, anything
 * before them is the column (which is x/100, matching the `x` field). Rows are
 * always two digits, so column 3 row 4 is "304". A bare two-digit ref means
 * column 0.
 *
 * Row ranges (regions mode) are inclusive; a single row may be given bare
 * ("montmar 42").
 *
 * ---------------------------------------------------------------------------
 * Validation, performed before anything is written
 * ---------------------------------------------------------------------------
 *   - every referenced hex exists (catches typos, and refs landing on the
 *     staggered top/bottom edges where no hex exists)
 *   - no hex is assigned twice, including under two different values
 *   - terrain names are checked against data/maps/terrain-types.json and an
 *     undeclared name is a hard error; region ids are checked against
 *     regions[], likewise a hard error, since it would break referential
 *     integrity
 *   - refs that already hold the requested value are reported as no-ops
 *   - regions mode reports rows in a named column that still have no region
 *     after the change, so a gap in the middle of a column cannot pass
 *     silently. A correction may cover only part of a column - that is normal
 *     mid-pass - so rows already assigned are not reported
 *   - terrain mode reports contiguous clusters among the changed hexes, so an
 *     island that comes out in two pieces is visible rather than silent
 */
import { readFileSync, writeFileSync } from "node:fs";

interface Hex {
  x: number;
  y: number;
  regionId: string;
  terrain: string;
}

interface MapDoc {
  map: { id: string; name: string };
  regions: { id: string; name: string }[];
  hexes: Hex[];
  connections: unknown[];
  locations: unknown[];
}

type Field = "terrain" | "regionId";

interface Change {
  hex: Hex;
  col: number;
  row: number;
  field: Field;
  from: string;
  to: string;
}

const DEFAULT_MAP_PATH = "data/maps/western-reaches-surface.json";

/**
 * The terrain vocabulary, shared by every map, so this is not overridable with
 * --map. Declaring a type here is what makes it assignable; see the file's own
 * header and data/maps/README.md.
 */
const TERRAIN_REGISTRY_PATH = "data/maps/terrain-types.json";

/** Placeholder regionId/terrain for a hex not yet transcribed. */
const UNASSIGNED = "UNKNOWN";

/** Cap on row numbers listed in a warning, so one column cannot bury the rest. */
const MAX_ROWS_LISTED = 12;

/** Overridden by --map, so the surface map is not the only one importable. */
let mapPath = DEFAULT_MAP_PATH;

/** Even columns sit half a hex higher - they lack y=0 and keep y=74. */
function neighbours(col: number, row: number): [number, number][] {
  return col % 2 === 1
    ? [
        [col, row - 1],
        [col, row + 1],
        [col - 1, row],
        [col - 1, row + 1],
        [col + 1, row],
        [col + 1, row + 1],
      ]
    : [
        [col, row - 1],
        [col, row + 1],
        [col - 1, row - 1],
        [col - 1, row],
        [col + 1, row - 1],
        [col + 1, row],
      ];
}

function loadMap(): MapDoc {
  return JSON.parse(readFileSync(mapPath, "utf8")) as MapDoc;
}

/**
 * The declared terrain ids, in declaration order so a refusal lists them the
 * way the registry and the README do.
 */
function loadTerrainIds(): string[] {
  const doc = JSON.parse(readFileSync(TERRAIN_REGISTRY_PATH, "utf8")) as {
    terrainTypes: { id: string }[];
  };
  return doc.terrainTypes.map((t) => t.id);
}

function dumpRegions(colSpec: string | undefined): void {
  const doc = loadMap();
  const byCol = new Map<number, [number, string][]>();
  for (const hex of doc.hexes) {
    const col = hex.x / 100;
    if (!byCol.has(col)) byCol.set(col, []);
    (byCol.get(col) as [number, string][]).push([hex.y, hex.regionId]);
  }
  let cols = [...byCol.keys()].sort((a, b) => a - b);
  if (colSpec) {
    const match = /^(\d+)-(\d+)$/.exec(colSpec);
    if (match) {
      const lo = Number(match[1]);
      const hi = Number(match[2]);
      cols = cols.filter((c) => c >= lo && c <= hi);
    }
  }
  console.log("[regions]");
  for (const col of cols) {
    const rows = (byCol.get(col) as [number, string][]).sort((a, b) => a[0] - b[0]);
    const runs: [string, number, number][] = [];
    for (const [row, region] of rows) {
      const last = runs.at(-1);
      if (last && last[0] === region && last[2] === row - 1) last[2] = row;
      else runs.push([region, row, row]);
    }
    const body = runs
      .map(([r, a, b]) => (a === b ? `${r} ${a}` : `${r} ${a}-${b}`))
      .join(", ");
    console.log(`${col}: ${body}`);
  }
}

function parseRef(ref: string): { col: number; row: number } | null {
  if (!/^\d{2,}$/.test(ref)) return null;
  const row = Number(ref.slice(-2));
  const colPart = ref.slice(0, -2);
  return { col: colPart === "" ? 0 : Number(colPart), row };
}

function main(): void {
  const argv = process.argv.slice(2);

  // Pull --map <path> out first so it may appear anywhere, leaving the
  // positional corrections file as args[0] regardless of flag order.
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--map") {
      const next = argv[i + 1];
      if (next === undefined) {
        console.error("--map requires a path");
        process.exit(2);
      }
      mapPath = next;
      i++;
      continue;
    }
    args.push(arg);
  }

  if (args[0] === "--dump-regions") {
    dumpRegions(args[1]);
    return;
  }

  const correctionsPath = args[0];
  if (!correctionsPath) {
    console.error(
      "usage: npx tsx tools/map-import.ts <corrections-file> [--apply] [--map <path>]\n" +
        "       npx tsx tools/map-import.ts --dump-regions [lo-hi] [--map <path>]",
    );
    process.exit(2);
  }
  const apply = args.includes("--apply");

  const doc = loadMap();
  const byKey = new Map<string, Hex>();
  for (const hex of doc.hexes) byKey.set(`${hex.x / 100},${hex.y}`, hex);
  const terrainIds = loadTerrainIds();
  const declaredTerrain = new Set(terrainIds);
  const declaredRegions = new Set(doc.regions.map((r) => r.id));
  const rowsByCol = new Map<number, Set<number>>();
  for (const hex of doc.hexes) {
    const col = hex.x / 100;
    if (!rowsByCol.has(col)) rowsByCol.set(col, new Set());
    (rowsByCol.get(col) as Set<number>).add(hex.y);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const changes: Change[] = [];
  const claimed = new Map<string, string>();

  const assign = (
    col: number,
    row: number,
    field: Field,
    value: string,
    lineNo: number,
    token: string,
  ): void => {
    const key = `${field}:${col},${row}`;
    const previous = claimed.get(key);
    if (previous !== undefined) {
      errors.push(
        `line ${lineNo}: ${token} (col ${col}/y ${row}) assigned twice ` +
          `- already claimed as "${previous}"`,
      );
      return;
    }
    claimed.set(key, value);
    const hex = byKey.get(`${col},${row}`);
    if (!hex) {
      errors.push(
        `line ${lineNo}: ${token} -> col ${col}/y ${row} does not exist ` +
          `(off-grid, or on a staggered edge)`,
      );
      return;
    }
    if (hex[field] === value) {
      warnings.push(`line ${lineNo}: ${token} is already "${value}" - no change`);
      return;
    }
    changes.push({ hex, col, row, field, from: hex[field], to: value });
  };

  let mode: Field = "terrain";
  const lines = readFileSync(correctionsPath, "utf8").split("\n");
  for (const [index, rawLine] of lines.entries()) {
    const lineNo = index + 1;
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    if (/^\[terrain\]$/i.test(line)) {
      mode = "terrain";
      continue;
    }
    if (/^\[regions?\]$/i.test(line)) {
      mode = "regionId";
      continue;
    }

    const split = line.indexOf(":");
    if (split === -1) {
      errors.push(`line ${lineNo}: expected "<key>: <values>", got "${line}"`);
      continue;
    }
    const key = line.slice(0, split).trim();
    const body = line.slice(split + 1).trim();
    if (!body || body === "<none>") continue;

    if (mode === "terrain") {
      if (!declaredTerrain.has(key)) {
        // A hard error, not a warning. Deriving the vocabulary from values
        // already present in the map made a typo and a genuinely new type
        // indistinguishable, and both got written.
        errors.push(
          `line ${lineNo}: "${key}" is not a declared terrain. ` +
            `Declare it in ${TERRAIN_REGISTRY_PATH} first, or use one of: ` +
            `${terrainIds.join(", ")}`,
        );
        continue;
      }
      for (const token of body.split(",").map((t) => t.trim()).filter(Boolean)) {
        const parsed = parseRef(token);
        if (!parsed) {
          errors.push(`line ${lineNo}: "${token}" is not a valid hex ref`);
          continue;
        }
        assign(parsed.col, parsed.row, "terrain", key, lineNo, token);
      }
      continue;
    }

    // regions mode: "<col>: <region> <lo>-<hi>, <region> <row>, ..."
    if (!/^\d+$/.test(key)) {
      errors.push(`line ${lineNo}: expected a column number before ":", got "${key}"`);
      continue;
    }
    const col = Number(key);
    const existingRows = rowsByCol.get(col);
    if (!existingRows) {
      errors.push(`line ${lineNo}: column ${col} does not exist in the map`);
      continue;
    }
    const covered = new Set<number>();
    for (const token of body.split(",").map((t) => t.trim()).filter(Boolean)) {
      const match = /^([A-Za-z][\w-]*)\s+(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
      if (!match) {
        errors.push(
          `line ${lineNo}: "${token}" is not "<region> <row>" or "<region> <lo>-<hi>"`,
        );
        continue;
      }
      const region = match[1] as string;
      const lo = Number(match[2]);
      const hi = match[3] === undefined ? lo : Number(match[3]);
      if (!declaredRegions.has(region)) {
        errors.push(
          `line ${lineNo}: region "${region}" is not declared in regions[] ` +
            `(declared: ${[...declaredRegions].sort().join(", ")})`,
        );
        continue;
      }
      if (hi < lo) {
        errors.push(`line ${lineNo}: "${token}" has an inverted range`);
        continue;
      }
      for (let row = lo; row <= hi; row += 1) {
        covered.add(row);
        assign(col, row, "regionId", region, lineNo, `${col}/y${row}`);
      }
    }
    // Rows this line does not cover AND that still have no region afterwards.
    //
    // Reporting every uncovered row buries real warnings: a correction may
    // legitimately touch part of a column, which is the normal case during an
    // in-progress pass and when tools/map-viewer emits only the hexes changed.
    // A row left UNKNOWN is the signal worth acting on, and a row skipped by
    // mistake in a full-column line still surfaces here because it stays
    // UNKNOWN.
    const stillUnknown = [...existingRows]
      .filter((r) => !covered.has(r) && byKey.get(`${col},${r}`)?.regionId === UNASSIGNED)
      .sort((a, b) => a - b);
    if (stillUnknown.length > 0) {
      const shown = stillUnknown.slice(0, MAX_ROWS_LISTED).join(", ");
      const rest = stillUnknown.length - MAX_ROWS_LISTED;
      warnings.push(
        `line ${lineNo}: column ${col} still has ${stillUnknown.length} row(s) ` +
          `with no region: ${shown}${rest > 0 ? `, and ${rest} more` : ""}`,
      );
    }
  }

  for (const warning of warnings) console.log(`WARN  ${warning}`);
  for (const error of errors) console.log(`ERROR ${error}`);

  const terrainChanges = changes.filter((c) => c.field === "terrain");
  const regionChanges = changes.filter((c) => c.field === "regionId");

  if (terrainChanges.length > 0) {
    console.log(`\n${terrainChanges.length} terrain change(s):`);
    for (const c of terrainChanges) {
      console.log(
        `  col ${String(c.col).padEnd(2)}/y ${String(c.row).padEnd(2)} ` +
          `(x=${c.col * 100})  ${c.from} -> ${c.to}`,
      );
    }
    const pending = new Set(terrainChanges.map((c) => `${c.col},${c.row}`));
    const sizes: number[] = [];
    while (pending.size > 0) {
      const seed = pending.values().next().value as string;
      pending.delete(seed);
      const queue = [seed];
      let size = 1;
      while (queue.length > 0) {
        const [col, row] = (queue.pop() as string).split(",").map(Number);
        for (const [nc, nr] of neighbours(col as number, row as number)) {
          const nKey = `${nc},${nr}`;
          if (pending.has(nKey)) {
            pending.delete(nKey);
            size += 1;
            queue.push(nKey);
          }
        }
      }
      sizes.push(size);
    }
    console.log(
      `  contiguous clusters among changed hexes: ${sizes.length} (${sizes.join(", ")} hexes)`,
    );
  }

  if (regionChanges.length > 0) {
    const perCol = new Map<number, number>();
    for (const c of regionChanges) perCol.set(c.col, (perCol.get(c.col) ?? 0) + 1);
    console.log(`\n${regionChanges.length} region change(s) across ${perCol.size} column(s):`);
    for (const col of [...perCol.keys()].sort((a, b) => a - b)) {
      console.log(`  col ${String(col).padEnd(2)} (x=${col * 100}): ${perCol.get(col)} hex(es)`);
    }
  }

  if (errors.length > 0) {
    console.log("\nrefusing to write - fix the errors above");
    process.exit(1);
  }
  if (changes.length === 0) {
    console.log("\nnothing to change");
    return;
  }
  if (!apply) {
    console.log("\ndry run - pass --apply to write these changes");
    return;
  }

  for (const c of changes) c.hex[c.field] = c.to;
  writeFileSync(mapPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`\nwrote ${changes.length} change(s) to ${mapPath}`);
}

main();
