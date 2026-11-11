# Campaign Maps

Hex data transcribed from the painted campaign posters. One JSON file per map;
`western-reaches-surface.json` is the surface world.

The full-resolution poster art is deliberately not tracked here - see the
`.gitignore` entry for why. The JSON is the authoritative machine-readable
form, and is what the application reads.

---

## Coordinate system

`x` is the column multiplied by 100; `y` is the row. The surface map is 64
columns (`x` 0-6300) by 75 rows (`y` 0-74).

### The grid is staggered

Columns are offset by half a hex: **an even column sits half a hex higher than
an odd column at the same `y`**. Writing the physical latitude of a hex as
`lat`:

```
lat = y - 0.5   for even columns
lat = y         for odd columns
```

Two consequences, both present in the data and both correct:

- **even columns have no `y = 0`** - it would fall above the map edge
- **odd columns have no `y = 74`** - it would fall below it

So every column holds 74 hexes and the complete map is
`64 x 75 - 32 - 32 = 4736` hexes. A count other than that means hexes are
missing or spare.

### Adjacency

Because of the stagger, a hex's six neighbours depend on its column parity:

```
odd  column (c, r):  (c, r-1) (c, r+1) (c-1, r)   (c-1, r+1) (c+1, r)   (c+1, r+1)
even column (c, r):  (c, r-1) (c, r+1) (c-1, r-1) (c-1, r)   (c+1, r-1) (c+1, r)
```

Using the wrong parity rule silently produces plausible-looking but wrong
results, so prefer the helper in `tools/map-import.ts` over rewriting this.

### Hex reference shorthand

In conversation and in correction files a hex is written as column followed by
a **two-digit** row:

| ref | means |
|---|---|
| `868` | column 8, row 68 |
| `304` | column 3, row 4 - note the padded row |
| `24` | column 0, row 24 |
| `6374` | column 63, row 74 |

The row is always two digits, so `34` is column 0 row 34, never column 3
row 4.

### A straight coastline looks checkered

An east-west feature at a single physical latitude is sampled by odd columns at
one `y` and by even columns at the next, so in row-index space it alternates
between consecutive columns. **Alternation along a row is the expected
appearance of a straight horizontal boundary**, not evidence of a
transcription error. Treat a checkerboard run as a question, never as a bug.

---

## Terrain

One value per hex, from this vocabulary:

| terrain | notes |
|---|---|
| `ocean` | open sea south of the arctic line; also inland water, pending a `lake` type |
| `arctic sea` | frozen sea. The arctic line is `y <= 20`; everything south is `ocean` |
| `grassland` | |
| `forest` | |
| `jungle` | |
| `swamp` | |
| `desert` | |
| `mountain` | |
| `volcano` | some volcanoes will be ringed by `lava` once that type is added |
| `river` | a **major** waterway filling the whole hex - impassable without aid |
| `UNKNOWN` | terrain not yet transcribed, or hidden beneath a map symbol |

### `UNKNOWN` carries two distinct meanings

Both are legitimate and neither should be guessed at:

- a hex in an area not yet transcribed
- a hex whose terrain is **hidden on the poster** by the symbol drawn over it,
  typically a village or a keyed location. The terrain under such a symbol is
  not recoverable from the art, so `UNKNOWN` records "land, type unknown"
  rather than inventing a plausible value

### Inland water has no distinct type yet

Lakes and inland seas are currently typed `ocean`. A flood fill from the map
border separates them from open sea - a substantial number of hexes across many
bodies, from single hexes up to inland seas of thirty or more. Introducing a
`lake` type would make that distinction explicit; until then, "is this hex
connected to the open sea" is a topological question, not one the terrain value
answers.

The arctic rule interacts with this: it applies to **open sea only**. A
mountain lake at `y = 8` is a lake, not arctic sea, so latitude alone must not
be used to retype water.

---

## Rivers are modelled two ways, deliberately

These are different things with different consequences for travel, and both
are correct:

| representation | meaning |
|---|---|
| `terrain: "river"` on a hex | **major** waterway. Cannot be crossed without aid |
| entry in `connections` with `type: "river"` | **smaller** river. Fordable, and navigable by boat |

Code that reads only one of them will miss the other. When adding travel or
expedition-eligibility logic, handle both.

---

## Regions

`regions` declares each region's `id` and `name`; every hex carries a
`regionId` referencing one of them, or `UNKNOWN` where not yet assigned.

- A region **spans both land and water**. `The Last Sea` is open ocean
  including its islands; `Bastion Mountains` reaches into its coastal waters.
  So a region's name does not constrain the terrain of its hexes.
- Conversely, region and terrain **cross-check each other**: water typed inside
  a land region, or land typed inside open sea, is worth a second look. This
  catches first-pass terrain errors that are invisible in isolation.
- Every `regionId` must appear in `regions`. `tools/map-import.ts` rejects an
  undeclared id rather than writing a dangling reference.

---

## Connections

Edges between two hexes, with a `type` of `river` (see above) or `path`.
Connections sit *between* hexes rather than on them, which is why a fordable
river is an edge while a major river is a hex.

---

## Locations

Villages, keyed locations, and other points of interest belong in `locations`,
not in `terrain`. The array is currently empty.

Note before populating it: `Location` is **KB-owned** per
[ADR 002](../../doc/adr/002-application-owned-identity-and-scheduling-state.md),
and its shape is defined in
[`doc/contract/KB-PROJECTIONS.md`](../../doc/contract/KB-PROJECTIONS.md). How
this transcription feeds the knowledge base is an open design question, so the
array's eventual contents may be a staging format rather than the canonical
record.

---

## Editing

Prefer `tools/map-import.ts` over editing the JSON by hand - a 4736-hex file
makes a mistake in the middle of a column effectively invisible. It is a dry
run unless passed `--apply`.

```bash
npx tsx tools/map-import.ts --dump-regions 0-8   # current state, as runs
npx tsx tools/map-import.ts corrections.txt      # preview
npx tsx tools/map-import.ts corrections.txt --apply
```

Region data compresses heavily - one line per column rather than one entry per
hex - and the importer validates that a column is covered completely, so a
skipped row cannot pass silently:

```
[regions]
0: andrik 1-10, last-sea 11-74
7: andrik 0-10, last-sea 11-39, montmar 40-41, bastion 42-46, tal-yool 47-68, last-sea 69-73

[terrain]
forest:   224, 327, 427
mountain: 323, 424
```

See the header comment in `tools/map-import.ts` for the full format and the
complete list of validations.

### Transcription proceeds column by column, west to east

Columns are verified in order, so at any time there is a boundary with
carefully checked data to the west and crude first-pass data to the east.
First-pass data is recognisable: impoverished terrain vocabulary, missing
islands, and large water areas that later turn out to be land. Current
progress is tracked in the GitHub issues, not here.
