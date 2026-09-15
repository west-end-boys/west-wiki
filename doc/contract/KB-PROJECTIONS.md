# KB Projection Contract

Status: Draft  
Last updated: September 15, 2026

## Purpose

This document defines the campaign-world entities the Knowledge Base owns and the shape of the projections it provides to the application backend.

It is normative prose for the KB/app boundary. Executable types live under `packages/`; this document describes what they mean and who owns them. [`doc/contract/API.md`](API.md) covers the HTTP conventions `app-be` exposes to its own clients, which is a separate concern.

The KB is an event-sourced fact store. Nothing described here is a mutable record. Each shape below is a current-state projection derived from the event log and resolved for a specific viewer role. See [ADR 001](../adr/001-event-sourced-fact-store.md), [ADR 002](../adr/002-kb-app-ownership-boundary.md), [ADR 003](../adr/003-fact-model-veracity-and-visibility.md), and [`doc/kb/REQUIREMENTS.md`](../kb/REQUIREMENTS.md).

## Ownership

Settled in the boundary session of 2026-08-25 and recorded as [ADR 002](../adr/002-kb-app-ownership-boundary.md). That ADR is authoritative; this table restates it because the projection shapes below are meaningless without it.

| Entity | Owner | Note |
|---|---|---|
| Character | KB | Projection; lifecycle and location asserted by app workflows |
| Region | KB | Parent of Location |
| Location | KB | Child of Region; adventure geography |
| GMRegionAuthorization | KB | Write-authority policy: which regions a GM may assert facts about |
| ExpeditionReport | KB | Original human submission, retained unchanged |
| ProposedChange | KB | Under review -- may be removed entirely; see Open Items |
| User | app | Identity and authentication |
| CampaignMembership | app | Role assignment; see [ADR 004](../app-be/adr/004-role-based-permission-tiers.md) |
| Campaign | app | Configuration and campaign rules, not world state |
| CharacterCommitment | app | Scheduling state; blocking periods |
| AdventureOpportunity | app | Adventure board entry |
| GMAvailabilityWindow | app | Published GM capacity |
| CallToAdventure | app | Expedition coordination record |
| ExpeditionParticipant | app | Participation record |

The mental model: the KB owns the state of the world and the entities within it. The app is an interface onto that state and the coordination layer for the adventures that generate expedition reports, which are the change records feeding the KB.

App-owned entities are ordinary current-state database rows. They are not event-sourced, carry no provenance chain, and are not projected through this contract.

### Cross-layer references

Application records reference KB entity identifiers, and KB entities may reference application identifiers where the domain requires it -- `Character.ownerUserId`, and `ExpeditionReport`'s links to its expedition and participants.

Both directions are permitted. The application guarantees that identifiers it issues are persistent and stable: once issued, an application identifier is never reused and never changes. The KB stores identifiers, not foreign keys, and enforces no referential integrity against the application's database. See [ADR 002](../adr/002-kb-app-ownership-boundary.md).

## Projection Conventions

These apply to every shape below.

**Viewer role is a parameter of every read.** Roles are the tiers defined in [ADR 004](../app-be/adr/004-role-based-permission-tiers.md): `ANONYMOUS` < `PLAYER` < `GM` < `ADMINISTRATOR`, each including everything below it. The KB accepts the actor context `app-be` supplies rather than re-establishing identity; both layers are inside one trust boundary.

**Every projected value carries provenance.** A projected attribute is not a bare value. It is a value plus the entry that produced it:

- the asserting entry's id;
- the fact type;
- the author, and whether an LLM was involved in producing the content;
- the timestamp;
- the veracity qualifier -- `CANON` or `RUMOR`;
- the source -- direct GM action, player submission, expedition report, or application workflow.

Provenance is required by [ADR 001](../adr/001-event-sourced-fact-store.md) and `doc/kb/REQUIREMENTS.md`. The attribute lists below name the *values* a projection carries; each arrives wrapped in this envelope. The executable types under `packages/` define the envelope once rather than repeating it per field.

**Redacted detail is present, not absent.** Under the hybrid visibility rule ([ADR 003](../adr/003-fact-model-veracity-and-visibility.md)), a viewer who may not see an entry's detail still sees that the entry exists and what it did. A projection therefore distinguishes three states for a value: fully visible, visible-with-redacted-provenance, and not visible. The middle state is a shape the contract must express, not an omission.

## Projections

### Character

The KB is authoritative for a character's identity, name, world-facing state, and current location. The application asserts lifecycle transitions and location changes through validated workflows; the KB records and projects them.

Values:

- `id`
- `campaignId` -- references an application-owned Campaign
- `ownerUserId` -- references an application-owned User
- `name`
- `lifecycleStatus`
- `currentLocation` -- embedded location projection, undefined for drafts
- `countsAgainstRosterLimit` -- derived from `lifecycleStatus`
- `gameSystem`
- `gameData`
- `createdAt`
- `retiredAt`

There is no separate readiness status. Lifecycle state carries draft/readiness semantics.

Initial lifecycle values:

- `DRAFT`
- `ACTIVE`
- `MISSING`
- `RETIRED`
- `DEAD`
- `ARCHIVED`

Roster-counting states are `ACTIVE` and `MISSING`; `countsAgainstRosterLimit` is derived from this rule rather than stored independently. The limit it is compared against is campaign configuration and lives on the application side.

A player has direct authority over characters they own: facts a player asserts about their own character enter the record without moderation ([ADR 003](../adr/003-fact-model-veracity-and-visibility.md)).

Because the KB entity persists beyond play, a retired character does not need to be copied into a separate world-facing Person or NPC record. The KB entity was always the person; the application's playable-character concern simply ends. See [ADR 002](../app-be/adr/002-character-lifecycle-and-retirement.md).

### Region

Represents a map area associated with locations, opportunities, and GM authorization. KB-owned, as the parent of Location.

`Region` is intentionally absent from the initial application contract. A character has a `Location` once active. Region is introduced when adventure opportunities, geographic Call-to-Adventure eligibility, and GM regional authorization require it.

Until then `Location.regionId` is populated KB-side but is not resolvable through the app contract.

### Location

Values:

- `id`
- `regionId`
- `name`
- `type`
- `isSafe`
- `allowsCharacterActivation`
- `visibility`

Possible types include settlement, dungeon, landmark, route, and wilderness site.

A location carries both public and GM-only knowledge. `visibility` on the projection reflects the entity's own discoverability; individual facts about a location carry their own visibility and veracity and are resolved per viewer, so two viewers may receive different descriptions of the same location.

### GMRegionAuthorization

Associates a GM with one or more regions they are authorized to run and to modify.

KB-owned because the KB applies it at write time when deciding whether a GM may assert facts about a given part of the world. The application reads the same policy when validating GM availability and adventure scheduling.

The KB is checking domain authority, not identity: it accepts `app-be`'s statement of who the caller is and what tier they hold, and decides whether that caller may say this thing about this region.

### ExpeditionReport

Stores the original human-submitted account unchanged and links it to the relevant expedition, authors, participants, and locations. The expedition and participant links are application identifiers.

The report is the source document from which proposed changes are extracted. It is never rewritten; corrections to what it claimed are recorded as new facts that supersede the ones it produced.

### ProposedChange

Under [ADR 003](../adr/003-fact-model-veracity-and-visibility.md), player claims about the world are no longer held outside the record awaiting approval -- they enter the log immediately with a `RUMOR` veracity qualifier, and a GM promotes them by asserting canon.

LLM extractions from expedition reports also enter directly as `RUMOR` rather than waiting for approval. Nothing is held pending review any more.

What remains is a GM's *view* of unverified claims awaiting promotion to canon, which looks like a query over rumor-tagged facts rather than a stored entity. Whether `ProposedChange` survives at all is Open Item 1.

## Open Items

1. **Is `ProposedChange` still an entity at all?** Nothing is held pending approval any more -- see above and [ADR 003](../adr/003-fact-model-veracity-and-visibility.md) Open Question 2. Listed as KB-owned in the table pending that decision; leaning toward removing it.

2. **Attribute lists above are inherited as drafts.** They were written as "possible attributes" before the ownership split and have not been re-validated against the KB's fact-type model. Expect them to change as fact types are registered.

3. **The redacted-detail projection shape is described but not designed.** The three-state value described under Projection Conventions needs a concrete type in `packages/contract` before the first viewer-differentiated projection is built.

4. **Cross-boundary failure semantics.** Carried from [ADR 002](../adr/002-kb-app-ownership-boundary.md) Open Question 1: an app write plus a KB assertion is two stores and no shared transaction.

## Resolved

Recorded so they are not re-litigated. All settled 2026-09-15.

- **Region ownership** -- KB, as the parent of Location. Previously inferred; now stated.
- **Campaign ownership** -- app. Campaign is configuration, not world state. `API.md` corrected.
- **Expedition ownership** -- app. `CallToAdventure` is the coordination record; its outcome reaches the KB as an `ExpeditionReport`.
- **Availability in the KB** -- the app owns business logic and computes travel and downtime. The app pushes the resulting location and availability changes into the KB. The KB records what it is told and never computes availability itself.
