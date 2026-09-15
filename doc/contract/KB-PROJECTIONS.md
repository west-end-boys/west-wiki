# KB Projection Contract

Status: Draft  
Last updated: August 25, 2026

## Purpose

This document defines the campaign-world entities the Knowledge Base owns and the shape of the projections it provides to the application backend.

It is normative prose for the KB/app boundary. Executable types live under `packages/`; this document describes what they mean and who owns them. [`doc/contract/API.md`](API.md) covers the HTTP conventions `app-be` exposes to its own clients, which is a separate concern.

The KB is an event-sourced fact store. Nothing described here is a mutable record. Each shape below is a current-state projection derived from the event log and resolved for a specific viewer role. See [ADR 001](../adr/001-event-sourced-fact-store.md) and [`doc/kb/REQUIREMENTS.md`](../kb/REQUIREMENTS.md).

## Ownership

| Entity | Owner | Note |
|---|---|---|
| Character | KB | Projection; lifecycle and location asserted by app workflows |
| Region | KB | Inferred -- see Open Items |
| Location | KB | Projection; parent of adventure geography |
| GMRegionAuthorization | KB | Write-authority policy: which regions a GM may assert facts about |
| ExpeditionReport | KB | Original human submission, retained unchanged |
| ProposedChange | KB | Structured changes awaiting GM acceptance |
| User | app | Identity and authentication |
| CampaignMembership | app | Role assignment |
| Campaign | app | Configuration and campaign rules -- see Open Items |
| CharacterCommitment | app | Scheduling state; blocking periods |
| AdventureOpportunity | app | Adventure board entry |
| GMAvailabilityWindow | app | Published GM capacity |
| CallToAdventure | app | Scheduled expedition |
| ExpeditionParticipant | app | Participation record |

Application records reference KB entity identifiers. The reverse does not hold except where noted below.

## Projections

### Character

The KB is authoritative for a character's identity, name, world-facing state, and current location. The application asserts lifecycle transitions and location changes through validated workflows; the KB records and projects them.

Possible attributes:

- `id`
- `campaignId`
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

Because the KB entity persists beyond play, a retired character does not need to be copied into a separate world-facing Person or NPC record. The KB entity was always the person; the application's playable-character concern simply ends. See [ADR 002](../app/adr/002-character-lifecycle-and-retirement.md).

### Region

Represents a map area associated with locations, opportunities, and GM authorization.

`Region` is intentionally absent from the initial application contract. A character has a `Location` once active. Region is introduced when adventure opportunities, geographic Call-to-Adventure eligibility, and GM regional authorization require it.

### Location

Possible attributes:

- `id`
- `regionId`
- `name`
- `type`
- `isSafe`
- `allowsCharacterActivation`
- `visibility`

Possible types include settlement, dungeon, landmark, route, and wilderness site.

A location carries both public and GM-only knowledge. `visibility` on the projection reflects the entity's own discoverability; individual facts about a location carry their own visibility and are resolved per viewer, so two viewers may receive different descriptions of the same location.

### GMRegionAuthorization

Associates a GM with one or more regions they are authorized to run and to modify.

This is KB-owned because the KB must be able to decide, at write time, whether a GM is permitted to assert facts about a given part of the world. The application reads the same policy when validating GM availability and adventure scheduling.

### ExpeditionReport

Stores the original human-submitted account unchanged and links it to the relevant expedition, authors, participants, and locations as appropriate.

The report is the source document from which proposed changes are extracted. It is never rewritten; corrections to what it claimed are recorded as new facts that supersede the ones it produced.

### ProposedChange

Stores structured campaign changes extracted or suggested by an LLM before GM approval.

Whether a proposed change is held inside the event log in a pending state or outside it until accepted is an open question in [`doc/kb/REQUIREMENTS.md`](../kb/REQUIREMENTS.md).

## Open Items

1. **Region ownership is inferred, not stated.** Location and GMRegionAuthorization are both KB-owned and both reference Region, so placing Region on the application side would leave KB entities pointing at application identifiers. It is listed as KB-owned here on that basis. Confirm.

2. **Campaign ownership conflicts with [`API.md`](API.md).** That document states that `app-be` "does not own mutable canonical Character, Location, Campaign, Expedition, or similar campaign-state records," while the ownership table above places Campaign on the application side. Campaign is largely configuration -- timezone, roster limits, downtime rules, activation policy -- which reads as application concern, but the conflict is real and unresolved. The same tension applies more weakly to CharacterCommitment.

3. **Whether the KB records application-computed availability** at all, or only location and in-transit status. [ADR 003](../app/adr/003-downtime-commitments-and-availability.md) holds that availability is always derived and never stored; recording it in the KB risks a second source of truth for a value the application owns.

4. **Attribute lists above are inherited as drafts.** They were written as "possible attributes" before the ownership split and have not been re-validated against the KB's fact-type model. Expect them to change as fact types are registered.
