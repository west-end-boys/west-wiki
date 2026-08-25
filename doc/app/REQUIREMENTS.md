# Application Requirements

Status: Draft  
Last updated: August 24, 2026

## Purpose

West Wiki is a private, LLM-assisted campaign management application for a West Marches campaign. The application should help a player choose an adventure, act through an eligible character, find a valid GM time slot, organize an expedition, and record the outcome.

## Goals

- Support the complete West Marches expedition cycle.
- Make character availability date-sensitive.
- Allow players to initiate expeditions through their characters.
- Match adventures with qualified and available GMs.
- Use natural language as a primary interface while retaining conventional UI.
- Preserve GM control over canonical information.
- Track provenance for accepted campaign changes.
- Keep campaign time synchronized with real-world time.
- Keep the application game-system-flexible, with Shadowdark as the first supported system.

## Non-Goals for the Initial Release

- Fully autonomous world simulation.
- Exact geographic pathfinding.
- Universal support for every RPG system.
- Public multi-tenant hosting.
- Character-specific knowledge modeling.
- Fully automated acceptance of LLM-generated changes.
- Universal world-building ontology.
- Local or offline LLM support.

## Core Principles

### Players operate the system; characters act in the world

A logged-in player may control multiple characters. Expedition participation, travel, downtime, purchases, discoveries, and other in-world actions belong to characters rather than directly to players.

### Campaign state changes through actions

Players express what their characters intend to do. Validated domain workflows create commitments, resolve consequences, and update authoritative campaign state. Players should not normally directly edit authoritative values such as current location, commitments, expedition participation, or lifecycle state.

See [ADR 001](adr/001-campaign-state-changes-through-actions.md).

### One day equals one day

Campaign dates correspond directly to real-world dates. A commitment covering two weeks of campaign time also makes the character unavailable for two weeks of real-world time.

### Availability is derived

Character availability is calculated for a specific date or date range from lifecycle state, location, commitments, expedition participation, and travel feasibility. Availability is never a manually editable Boolean.

### Players initiate play; GMs publish capacity

GMs declare when and where they are available to run games. Players choose adventure opportunities and valid time slots through eligible characters.

### The LLM proposes; the application validates

The LLM may interpret requests and suggest structured operations, but it cannot bypass authorization, domain validation, confirmation requirements, or persistence rules.

### GMs control canon

Player submissions may propose facts, corrections, rumors, and updates. Canonical world-state changes require authorized GM acceptance.

### Accepted changes retain provenance

Important campaign information remains linked to its source, author, expedition, approving GM, and revision history.

## Actors

### Anonymous Visitor

Can read explicitly public campaign content.

### Player

Can:

- manage player-editable data for owned characters;
- create and maintain draft characters;
- request activation, travel, downtime, retirement, and other permitted in-world actions;
- browse permitted campaign knowledge;
- create calls to adventure through eligible characters;
- join expeditions with eligible characters;
- submit reports, corrections, and other contributions;
- view owned characters' locations, commitments, and availability.

### GM

Can:

- perform Player actions when also acting as a player;
- view GM-only campaign information;
- create and manage adventure opportunities;
- publish availability;
- run adventures in authorized regions;
- review and approve proposed campaign changes;
- manage canonical world state;
- correct or override authoritative character state when necessary.

### Administrator

Can:

- configure campaign settings;
- manage users and permissions;
- configure active-character limits;
- define or manage regions, safe locations, and valid starting locations;
- manage GM regional assignments;
- configure system integrations and LLM settings;
- correct or override authoritative character state when necessary.

Roles may overlap.

## Character Requirements

- Character core campaign state is separate from game-system-specific `gameData`.
- If the application must enforce a value, that value should normally be modeled explicitly rather than buried in `gameData`.
- Players are the primary editors of their own game-system-specific character data, subject to validation.
- Authoritative campaign state changes through validated domain actions or explicit GM/Admin overrides.
- Character lifecycle uses a single lifecycle state: `DRAFT`, `ACTIVE`, `MISSING`, `RETIRED`, `DEAD`, or `ARCHIVED`.
- `ACTIVE` and `MISSING` characters count against the campaign's configured roster limit.
- `DRAFT`, `RETIRED`, `DEAD`, and `ARCHIVED` characters do not count against the roster limit.
- Draft characters may have no current location.
- Active and missing characters must have a valid campaign location.
- Retired and dead characters preserve their last meaningful location for history.
- Standard activation is automatic after validation when the player has an open roster slot and selects a permitted starting location.
- Retired characters remain part of the campaign world and may persist as NPCs, patrons, business owners, faction members, or other world entities.

See [ADR 002](adr/002-character-lifecycle-and-retirement.md).

## Downtime and Commitment Requirements

- Downtime is any between-expedition character activity that makes the character unavailable for adventuring for a defined period.
- Examples include travel, carousing, crafting, training, recovery, and campaign-defined activity types.
- Expeditions are also blocking commitments but are not downtime.
- All initial downtime types block expedition participation for their scheduled duration.
- Blocking commitments may not overlap.
- Downtime may be scheduled for a future date.
- Scheduled downtime reserves the calendar immediately but consumes a downtime allowance only when it starts.
- Calendar-driven status transitions occur automatically.
- A player may cancel scheduled downtime before it starts without consuming the allowance.
- A player may voluntarily end active downtime early; the allowance remains consumed.
- The number of downtime activities used between adventures is derived from started activities since the most recent completed expedition rather than stored as a mutable counter.
- Campaign/game-system configuration may limit the number of downtime activities between expeditions; Shadowdark's expected default is one.

See [ADR 003](adr/003-downtime-commitments-and-availability.md).

## Scheduling Requirements

A character is eligible for an expedition only when all applicable rules pass, including:

- lifecycle state permits normal play;
- the character is geographically eligible;
- no blocking commitment overlaps the expedition;
- no conflicting expedition participation exists;
- the expedition falls within a valid GM availability window;
- the selected GM is authorized for the opportunity's region.

For the MVP, exact pathfinding is out of scope. An adventure opportunity may specify a required departure location or nearby safe settlement, and the character must already be there unless a travel workflow changes that state.

For day-based commitments, a commitment ending on date X blocks through the end of X. The character becomes available the following day.

## Adventure and Expedition Requirements

- Adventure opportunities remain browsable and may be associated with a region and required departure location.
- GMs publish availability windows and the regions they are willing/authorized to run.
- A player creates a Call to Adventure on behalf of a specific owned character.
- The system shows only valid scheduling choices after character and GM availability checks.
- Other players join using specific eligible characters.
- Calls and participation records preserve both the human user and acting character.

## Report and Canon Requirements

- Post-session reports may be submitted in natural language.
- The original human submission is retained unchanged.
- The LLM may extract proposed entities and campaign changes.
- The application validates proposed changes before GM review.
- A GM accepts or rejects canonical changes.
- Accepted changes preserve provenance and visibility metadata.
- Corrections and retractions should preserve history rather than silently overwrite sources.

## Visibility Requirements

Initial campaign-knowledge visibility levels are:

- `PUBLIC` - visible to anonymous visitors;
- `CAMPAIGN` - visible to authenticated campaign members;
- `GM_ONLY` - visible only to authorized GMs.

The application must never rely on client-side filtering to protect GM-only knowledge received from the KB layer.

## Natural-Language Interaction Requirements

Natural language is a primary interface for operations such as:

- querying campaign knowledge;
- creating or editing draft characters;
- requesting activation or retirement;
- requesting travel or downtime;
- publishing GM availability;
- creating a Call to Adventure;
- joining an expedition;
- submitting expedition reports;
- proposing administrative or canonical changes.

The application must resolve natural-language input into structured domain operations and perform permission checks, entity resolution, validation, confirmation where appropriate, and persistence.

## Audit Requirements

Important changes should retain enough information to determine:

- who created or changed the record;
- when the change occurred;
- previous value where relevant;
- source of the change;
- whether an LLM was involved;
- who approved a canonical change.

## Open Product Questions

- Does a GM own a region or merely receive authorization to run it?
- Can multiple GMs run the same region?
- Can an opportunity have multiple valid departure locations?
- At what point does joining a Call to Adventure create an expedition commitment?
- Can a player withdraw from an expedition without GM approval?
- When is a Call to Adventure considered confirmed?
- How should sessions crossing midnight interact with day-based campaign time?
- Should recurring GM availability be part of the MVP?
- How interactive must the first map experience be?
- When should travel feasibility become more sophisticated than a departure-location check?
- Which game-system fields, if any, should eventually be promoted out of `gameData`?
