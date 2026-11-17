# ADR 005: Map Data Ownership and the Location Taxonomy

**Scope:** System-wide (entity ownership; contract surface; map presentation)
**Status:** Proposed
**Authors:** @deastland0423
**Reviewers:** @benjaminbradley
**Date:** 2026-11-15

> **Draft.** This records a design direction reached while transcribing the surface map, not a
> settled boundary. Ownership of the baseline grid is provisional and turns on an unanswered
> question about fog of war (Open Question 1); its physical storage is undecided; and the taxonomy
> below is expected to move as locations are actually populated.

---

## Context

The hex map is one of the campaign's major foci -- players will interact with it constantly -- and
transcribing it into `data/maps/western-reaches-surface.json` surfaced three questions that
[`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md) does not answer:

1. **`Hex` is absent from the ownership table entirely.** Terrain, inter-hex connections and
   region extents have no owner on either side of the boundary.
2. **`Location` carries no position.** Nothing in the projected shape connects a location to the
   map it sits on, so "what is at hex 40/29" is unanswerable through the contract.
3. **Two location vocabularies already disagree.** `packages/app-be/src/index.ts` defines a
   `LocationType` enum of `city-state | city | town | village | keyed-location`, while
   `KB-PROJECTIONS.md` says "settlement, dungeon, landmark, route, and wilderness site". Neither
   list is a partition of the other, and both mix two independent ideas.

The map JSON is a stopgap. The transcription has to go *somewhere* while it is being verified
column by column, but where this data lives in its final form is a separate question from who owns
it -- and getting the ownership right now keeps the stopgap from hardening into an architecture.

---

## Decision

### The map is three kinds of data, not one

"The map" conflates a static board, the things standing on it, and the rules governing what you
can do at them. Applying the test from
[ADR 002](002-application-owned-identity-and-scheduling-state.md) -- *does this need history, provenance, and
redaction?* -- splits it three ways:

| Data | Owner | Why |
|---|---|---|
| **The baseline board** -- the grid as transcribed from the poster | **app** (provisional -- see Open Question 1) | One-time bulk import. Total: every hex has terrain, always. Uniform provenance, no historical interest. |
| **Changes to the board** -- terrain, connections or borders altered by play | **KB** | Singular, attributed, datable. May be rumoured before confirmed, and known to some viewers and not others. |
| **The contents** -- that a location exists, where it sits, what is known about it | **KB** | Changes through play. Attributed, retractable, redacted per viewer. |
| **The affordances** -- what the rules let a character do there | **app**, as campaign configuration | Campaign rules, not world facts. Nobody retracts them or asks who asserted them. |

### The board is a baseline, not a constant

An earlier draft of this ADR called the grid "static reference data" and justified app ownership on
the grounds that it was painted before play began. That does not survive contact with the campaign.
Volcanoes erupt and valleys flood, so **terrain** changes. Bridges are built and passes collapse,
so **connections** change. Territory is taken and settlements are destroyed, so **region extents**
change. Every component of what this ADR calls the board is mutable.

What is actually true is narrower, and it is a distinction of *shape* rather than of permanence.
The transcription is a one-time bulk import: total, uniform in provenance -- one person reading a
poster -- and of no historical interest. A change to it during play is the opposite: singular,
attributed, datable, possibly reported as a rumour before a GM confirms it, and possibly known to
some players and not others.

Those are the properties of a seed and a log, which is the shape the KB already has. A hex's
current terrain is therefore the baseline value with any recorded changes applied and resolved for
the viewer -- [ADR 001](001-event-sourced-fact-store.md)'s projection with a non-empty initial
state.

**This part is decided, not sketched.** Whatever holds the board must have a write path from the
day it ships. A map baked into a front-end asset that no back-end write can reach is the one
genuinely irreversible mistake available here; where the baseline lives and who composes it with
its changes are both movable later.

**The affordances are already misfiled, and the code shows it.** `allowsCharacterActivation` is
consumed by `CharacterService.activateCharacter` (`packages/app-be/src/services/character-service.ts:83`)
-- app logic, character lifecycle -- but it arrives from the KB gateway, which filters on it in
`packages/app-be/src/kb/in-memory-knowledge-base-gateway.ts:83`. "This settlement permits character
activation" is the same category of fact as `maxRosterSize`, which
[ADR 002](002-application-owned-identity-and-scheduling-state.md) placed on the app side. The app
is currently asking the KB about its own rules.

So: the KB owns *this place exists, here, and here is what is known about it*; the app owns *and
here is what the rules let you do there*.

### A location carries its position

The `Location` projection gains a hex reference. The location entity stays KB-owned; the hex it
names belongs to the app-owned board, so the reference crosses the boundary.

[ADR 002](002-application-owned-identity-and-scheduling-state.md) §Cross-layer references already permits this, and in
the direction already in use -- `Character.ownerUserId` is a KB entity referencing an app
identifier. The requirement it imposes is that board coordinates are stable and never reused,
which holds trivially: they are grid positions on a painted poster.

### Location kind and settlement scale are two axes

The current vocabularies mix them. `city-state`/`city`/`town`/`village` is a *scale*, and it
applies only to settlements; `dungeon` and `landmark` are *kinds*. `keyed-location` is neither --
it records that a place is numbered on the poster, which is a transcription detail, not a property
of the place.

**The split is by affordance, not appearance:**

- a **settlement** is somewhere a character can perform downtime, shop, and use as a travel origin
  or destination -- a safe harbour of some scale;
- a **point of interest** is somewhere to explore, investigate, or raise a call to adventure about.

This classifies correctly on the awkward case: a hostile orc town *looks* like a settlement but
offers no downtime and no shopping, so it is a point of interest that happens to have residents.
A visual taxonomy would have got that wrong.

Because scale applies only to one arm, it belongs in the type rather than as an optional field:

```ts
export type SettlementScale = "city-state" | "city" | "town" | "village";

export type Location =
  | { kind: "settlement"; scale: SettlementScale; /* … */ }
  | { kind: "point-of-interest"; /* … */ };
```

A flat `{ type, scale? }` would permit a dungeon with a population. The discriminated union does
not, and there is precedent in the same file -- `AvailabilityReason` is a union where
`BLOCKING_COMMITMENT` carries a `commitmentId` the other variants lack
(`packages/app-be/src/index.ts:190`).

This also brings the vocabulary into line with the project's own convention. `LocationType` is the
only `enum` among roughly ten closed vocabularies in `index.ts`; every other one is a string union.

**Two values from the contract's list are dropped:**

- **`route`** is redundant with `connections`, which already model paths and fordable rivers --
  and model them better, since a route sits *between* hexes rather than on one.
- **`landmark`** and **`wilderness site`** collapse into point-of-interest. A point of interest
  with nothing in it yet is a legitimate state, and in a West Marches campaign it is arguably the
  most interesting one: it may become something.

---

## Consequences

- **`KB-PROJECTIONS.md`'s `Location` shape changes.** It gains a hex reference, loses
  `allowsCharacterActivation` (and possibly `isSafe` -- see Open Questions) to the app side, and
  its `type` becomes the two-armed union. This is the table's own territory, so it needs
  @benjaminbradley's agreement before the contract is edited.
- **`LocationType` is replaced** in `packages/app-be/src/index.ts`, and `LocationSummary` stops
  carrying an affordance the KB supplies. The starting-location filtering in
  `in-memory-knowledge-base-gateway.ts` moves app-side, which overlaps the work already filed as
  issue #36.
- **The board needs a home.** Declaring it app-owned static reference data does not say whether it
  lives in a file, a table, or a served asset. The JSON stays the source of truth meanwhile.
- **`data/maps/README.md` needs correcting.** Its "Locations" section currently says `Location` is
  KB-owned per ADR 002 full stop, which this ADR refines into a three-way split.
- **The `locations` array in the map JSON is a staging format**, not a canonical record -- the
  README already says so, and this ADR is the reason why.
- **Reading a hex is a composition, not a lookup.** Every consumer of terrain, connections or
  region extent sees baseline-plus-changes resolved for a viewer, never the raw baseline. Code
  written against the transcription directly will be wrong the first time the world changes.
- **A terrain-change fact type is needed** in the KB's registry
  ([ADR 004](004-fact-model-veracity-and-visibility.md)), and it carries veracity like any other:
  a party reporting that a valley has flooded is a `RUMOR` until a GM asserts canon.

---

## Open Questions

1. **Who owns the baseline, and therefore who composes it with its changes.** This is the live
   question and the ownership table above is provisional on it. Two coherent answers:

   - **App baseline, KB changes.** The app holds the transcription and layers KB-recorded changes
     over it. Keeps 4,736 provenance-free hexes out of the fact store, and lets an anonymous
     viewer be served a map without a KB projection.
   - **KB seed.** The transcription seeds the KB and terrain is projected like any other fact.
     One owner for "what is the terrain at 4029", no join, and viewer resolution comes free.

   **It turns on whether fog of war covers terrain or only contents.** If players see the whole
   landform up front -- the painted poster is on the wall -- terrain is common knowledge and the
   first answer is clean. If players fill in terrain as they travel, the map *is* viewer-resolved
   world knowledge, which is the KB's job description, and the second is right. Decide the table
   question first; this follows from it.

2. **Where the baseline physically lives.** File, database table, or served asset; and whether the
   app serves it through the API or the front end fetches it directly. Independent of ownership,
   and the current JSON is explicitly a stopgap.
3. **Hex identity in the contract.** The map JSON stores `x` as the column multiplied by 100, a
   transcription convenience. A contract-level hex reference should probably be a single opaque id
   or a plain `{column, row}` pair rather than inheriting that artifact.
4. **Does `isSafe` move with the affordances?** "You can perform downtime here" is clearly a rule.
   "This place is dangerous" is closer to a world fact, and may be something players *learn*. The
   two may need separating before either moves.

---

## References

- `doc/adr/002-application-owned-identity-and-scheduling-state.md` -- the ownership boundary this extends, the test
  applied to the board, and the cross-layer reference rule a positioned location relies on
- `doc/adr/004-fact-model-veracity-and-visibility.md` -- how KB-owned location knowledge is
  recorded and redacted
- `doc/contract/KB-PROJECTIONS.md` -- the ownership table this proposes amending
- `data/maps/README.md` -- the transcription format and the grid's geometry
