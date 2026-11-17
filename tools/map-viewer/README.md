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

## It never writes to the map

The viewer stages corrections and prints them in `map-import`'s text format for
you to paste into a corrections file. It does not edit the JSON. `map-import`
stays the single validated path for changing hex data, so its checks - hex
exists, no double assignment, no uncovered rows, undeclared region id - cannot
be bypassed by clicking.

## Using it

| | |
|---|---|
| pan / zoom | drag, mouse wheel, double-click to fit |
| select a hex | click |
| select a run | shift-click a second hex in the same column |
| stage a change | choose terrain or region, press **Assign** |
| get the text | **Copy**, then paste into a corrections file |

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

## Region corrections are emitted as whole columns

`map-import` rejects a column with an uncovered row, so staging a region change
emits that column's **complete** run-length line - existing assignments folded
together with the staged edits - rather than just the hexes clicked. If the
column still contains unassigned hexes the output carries a `#` comment saying
so, because `UNKNOWN` is not a declared region id and the import would fail.

## Geometry

The stagger, adjacency and ref notation live in `geometry.js`, separate from
the page, and are covered by `geometry.test.js` in the normal `npm test` run -
including a check that every neighbour is exactly one hex away (a stagger error
breaks this), that each edge is paired with the neighbour across it, and that
the islands named during transcription come out contiguous.

`data/maps/README.md` is authoritative for the coordinate system; this module
must agree with it.
