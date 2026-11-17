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

One value per hex. **[`terrain-types.json`](terrain-types.json) is the source of truth for the
vocabulary** - this table is prose about it, and `tools/map-viewer/terrain.test.js` asserts the two
agree, so neither can drift from the other the way they did before it existed.

**To add a terrain type:** add an entry to `terrain-types.json`, then add its row here. That is the
whole procedure. `tools/map-import.ts` refuses a terrain value the registry does not declare, so a
new type and a typo can no longer look alike.

| terrain | surface | notes |
|---|---|---|
| `ocean` | water | open sea south of the arctic line. Also still carries inland water not yet retyped - see below |
| `arctic sea` | water | frozen sea. The arctic line is `y <= 20`; everything south is `ocean` |
| `lake` | water | inland water, with no connection to the open sea |
| `river` | water | a **major** waterway filling the whole hex - impassable without aid |
| `grassland` | land | |
| `forest` | land | |
| `jungle` | land | |
| `swamp` | land | |
| `desert` | land | |
| `salt flat` | land | |
| `canyon` | land | |
| `mountain` | land | |
| `volcano` | land | ringed by `lava` in places |
| `lava` | land | |
| `UNKNOWN` | unknown | terrain not yet transcribed, or hidden beneath a map symbol |

`surface` is the intrinsic land/water classification, which the arctic-sea rule and the
lake-vs-ocean distinction below both depend on. It is a property of the landform.

**Travel cost and terrain difficulty are deliberately not in the registry.**
[ADR 005](../../doc/adr/005-map-data-ownership-and-location-taxonomy.md) classifies what the rules
let a character do somewhere as app-owned campaign configuration rather than world data, so travel
rules key off these ids from the application side. A difficulty column here would put a rules
number in a world-data record.

### Colours are mimetic, and new ones are measured

Terrain colours imitate the thing - water blue, forest green - so the map reads as a map rather
than as a categorical chart. Three blues for water and three greens for vegetation are therefore
deliberate, and the categorical separation gates do not apply to the scheme as a whole.

What does apply is that a **new** type must not be confusable with one already on the map, so new
colours are measured rather than eyeballed. The existing palette's closest pair is `forest`/`swamp`
at ΔE 5.8 normal-vision and 2.0 under simulated CVD, and 11 of its 78 pairs fall below the
categorical floor of 15 - that is the bar a new colour has to clear, not the gates themselves.

- `salt flat` `#f7f3e8` - nearest neighbour `arctic sea`, ΔE 13.5 normal / 11.8 CVD. The two are
  also latitude-disjoint: arctic sea is `y <= 20` and salt flats are desert.
- `canyon` `#c98f6b` - nearest `mountain` at ΔE 10.0 normal, `grassland` at 6.2 CVD. Sandstone
  rather than the obvious terracotta: every red-brown candidate collided with `lava` under CVD, at
  worst ΔE 0.2, which a protanope would see as the same colour.

### `UNKNOWN` carries two distinct meanings

Both are legitimate and neither should be guessed at:

- a hex in an area not yet transcribed
- a hex whose terrain is **hidden on the poster** by the symbol drawn over it,
  typically a village or a keyed location. The terrain under such a symbol is
  not recoverable from the art, so `UNKNOWN` records "land, type unknown"
  rather than inventing a plausible value

### Inland water is mid-retype

`lake` exists and 43 hexes carry it, but the retyping is **not finished**. A flood fill over
`ocean` and `arctic sea` hexes, seeded from the map border, currently leaves **75 sea-typed hexes
in 21 disconnected bodies** - sizes 26, 14, 7, 6, 6 and sixteen single hexes, the largest around
col 44 / row 65.

Those are candidates, not confirmed lakes. A body can be cut off from the fill and still be
genuine sea: one hex of `river` across a strait disconnects everything behind it. So "is this hex
connected to the open sea" remains a topological question that wants a look at the poster, not a
retype that can be inferred from the data alone.

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

Settlements, dungeons and other places belong in `locations`, not in `terrain`.
**One array, discriminated by `kind`** - adding a kind means adding an entry to
`LOCATION_KINDS` in [`tools/map-viewer/locations.js`](../../tools/map-viewer/locations.js)
plus a row in the table below, and `locations.test.js` fails if the two
disagree.

| kind | What it is | Scale |
|---|---|---|
| `settlement` | Somewhere a character can perform downtime, shop, and travel to or from - a safe harbour of some scale | required |
| `point-of-interest` | Somewhere to explore, investigate, or raise a call to adventure about | never |

The split is **by affordance, not appearance**, which is what makes it decide
the awkward cases. A hostile orc town looks like a settlement and is a point of
interest, because it offers neither downtime nor shopping. A point of interest
with nothing in it yet is a legitimate state - arguably the most interesting
one in a West Marches campaign, since it may become something.

Scale (`city-state`, `city`, `town`, `village`, largest first) applies only to
settlements, so it lives in that arm rather than as an optional field: a flat
shape would permit a dungeon with a population. The check in `locations.js`
enforces this, since JSON cannot.

```json
{
  "id": "marins-hold",
  "name": "Marin's Hold",
  "kind": "settlement",
  "scale": "village",
  "hex": { "x": 4000, "y": 29 },
  "visibleTo": "ANONYMOUS",
  "isSafe": true,
  "allowsCharacterActivation": true
}
```

`isSafe` and `allowsCharacterActivation` are app-owned affordances, which is why
they sit on the settlement arm only.

### Who can see it

`visibleTo` names the **lowest viewer tier** that may see the place on the map.
The tiers are the ordered hierarchy of
[app-be ADR 004](../../doc/app-be/adr/004-role-based-permission-tiers.md),
spelled as `ViewerRole` in `packages/app-be/src/index.ts`:

| visibleTo | Who sees it |
|---|---|
| `ANONYMOUS` | everyone, including visitors who are not in the campaign |
| `PLAYER` | campaign members and above |
| `GM` | GMs and administrators |
| `ADMINISTRATOR` | administrators only |

It is a **floor, not a match** - a GM-only place is visible to an administrator
for the same reason a GM can do everything a player can. ADR 004 is explicit
that authorization is a rank comparison against a required minimum tier.

**There is no default.** A location with no `visibleTo` is an error rather than
a public one, because defaulting would publish a GM-only place by omission, and
that is the one direction this field must never fail in. For the same reason an
unrecognised tier ranks *above* administrator rather than below anonymous: a
typo conceals, it does not reveal.

**This is not the whole of visibility, and it cannot be.** A rank is
campaign-wide, so it cannot say that one party has found a ruin and another has
not - both are `PLAYER`. That is per-viewer world knowledge, which
[ADR 004](../../doc/adr/004-fact-model-veracity-and-visibility.md) resolves
KB-side, and it is the characteristic West Marches case. The two compose rather
than compete: `visibleTo` decides who may **ever** see a place, and the KB
decides who sees it **yet**.

### Where this is going

[ADR 005](../../doc/adr/005-map-data-ownership-and-location-taxonomy.md) splits
the map three ways: the baseline board is app-owned (provisionally), while **a
location's existence, position and what is known about it are KB-owned**, and
the affordances above are app-owned campaign configuration. So **this array is a
staging format, not a canonical record** - it is where the transcription lives
while it is being verified against the poster.

The kinds here are ADR 005's two arms, and the ADR writes them as a
discriminated union destined for `packages/contract`. It is still `Proposed` and
awaiting review (#41), so `packages/app-be`'s `LocationType` enum and
[`doc/contract/KB-PROJECTIONS.md`](../../doc/contract/KB-PROJECTIONS.md) still
carry the two older vocabularies it supersedes. Do not treat either as
authoritative for this file.

---

## Looking at it

`npm run map:view` serves a local browser view of the map for checking the
transcription against the poster - terrain or region colouring, a hover readout
giving each hex's ref, and hatching over everything still `UNKNOWN`. Hexes can
be selected and corrected there; the viewer hands the result to
`tools/map-import.ts` rather than writing the JSON itself, so the validations
below apply unchanged. See `tools/map-viewer/README.md`.

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
