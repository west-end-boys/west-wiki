# Map Viewer

A local, read-only browser view of a surface map, for verifying the
transcription against the painted poster. Zero dependencies - it is a static
page plus a small `node:http` server.

```bash
npm run map:view                                    # http://localhost:7380
npm run map:view -- --port 8080 --map data/maps/other.json
```

The map file is re-read on every request, so after applying corrections with
`tools/map-import.ts` a browser refresh shows the new state. There is also a
**Reload map.json** button in the panel.

## Writing goes through map-import, always

**Preview** and **Apply** hand the staged text to `tools/map-import.ts` on the
server and show you its output verbatim. The viewer itself never touches the
JSON, so every check `map-import` performs - hex exists, no double assignment,
no uncovered rows, undeclared region id is a hard error - applies exactly as if
you had written the corrections file by hand. A block that fails validation is
refused and nothing is written.

**Preview** is the dry run. **Apply** writes, then re-reads the map from disk so
what you see is the file. **Copy** is still there if you would rather keep the
corrections file yourself.

Git is the undo. Apply writes straight to a tracked file, so check `git diff`
before committing - and prefer applying a column at a time, which keeps the
diff reviewable.

## Using it

| | |
|---|---|
| pan / zoom | drag, mouse wheel, double-click to fit |
| select a hex | click |
| select a run | shift-click a second hex in the same column |
| stage a change | choose terrain or region, press **Assign** |
| check it | **Preview** - a `map-import` dry run, output shown below |
| write it | **Apply** - runs `map-import --apply`, then reloads from disk |
| do it by hand instead | **Copy**, then paste into a corrections file |

**Colour by terrain** uses mimetic colours - water blue, forest green - so the
map reads as a map. **Colour by region** uses a palette chosen by maximising
separation across the region pairs that actually *border* each other, computed
from the hex data rather than assumed. Region identity is additionally carried
by boundary strokes, direct labels, the hover readout and the legend, so it
never rests on hue alone; the **Focus** control dims every region but one when
a border is still hard to read.

`Flag UNKNOWN` hatches hexes that have no value yet - the to-do list, in both
terrain and region mode. The **Progress** box counts what is left.

### Deep links

A view can be bookmarked or pasted into an issue:

```
http://localhost:7380/?mode=region&focus=gloaming&col=33&refs=1
```

`mode` is `terrain` or `region`; `focus` is a region id; `col` is 0-63; `refs=1`
turns on hex reference labels (they appear once zoomed in far enough).

## Only the hexes you changed are emitted

A region correction covers the rows you actually assigned, as runs, and nothing
else. A column left partly unassigned is fine: `map-import` treats an uncovered
row as a warning, not an error, and reports the rows still lacking a region so
a gap cannot pass silently.

Restating the whole column would be worse than unnecessary - it would emit the
column's existing `UNKNOWN` runs, and `UNKNOWN` is not a declared region id,
which *is* a hard error. Every column mid-pass would be unapplicable.

## Geometry

The stagger, adjacency and ref notation live in `geometry.js`, separate from
the page, and are covered by `geometry.test.js` in the normal `npm test` run -
including a check that every neighbour is exactly one hex away (a stagger error
breaks this), that each edge is paired with the neighbour across it, and that
the islands named during transcription come out contiguous.

`data/maps/README.md` is authoritative for the coordinate system; this module
must agree with it.

## Region colours

`palette.js` holds the region appearances, and `palette.test.js` pins them.

A region's appearance is a **hue plus a texture** — solid or hatched. There are
only eight validated categorical hues and fifteen regions, so hue alone cannot
give each region its own look; 8 x 2 = 16 combinations can.

Texture is not decoration here, it is load-bearing, and the map forces that
rather than it being a style choice. Two independent reasons:

- Fifteen regions over eight hues means seven hue pairs are shared, and a
  shared-hue pair that borders can only be told apart by texture.
- Four regions that all border one another need four mutually distinguishable
  hues, and the largest mutually distinguishable set the palette has is three.

So some border was always going to come down to texture. The assignment picks
*which*. Against the complete border graph it puts 28 of the 31 borders on hue,
each clearing both separation gates, and leaves the three shortest to texture —
18 shared hexes between them, 1.6% of the map's total border length.

**The check that keeps it honest.** `paletteProblems()` re-derives the border
graph from the data and names anything the palette no longer resolves. The
viewer runs it on every load and prints the result under the key in red;
`palette.test.js` runs it against the committed map, so `npm test` fails rather
than the map quietly becoming harder to read. It earned its keep once already:
it caught four unresolvable borders the moment the last regions were assigned.

Region borders are settled now, so it should stay quiet — it is there for a
region being added, split or redrawn later. If it does report a pair, recompute
the assignment rather than hand-patching one entry; the constraint is global,
and moving one region can break a border somewhere else.

A region that is declared in the map but missing from `palette.js` renders in a
loud magenta, not a grey. Greying it is how eight newly declared regions once
went unnoticed for a whole session.
