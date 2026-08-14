# West Wiki Design

Status: Draft  
Authors: Daniel and collaborators  
Last updated: August 13, 2026

## Purpose

This document describes the proposed design for West Wiki, a private, LLM-assisted campaign management and knowledge system for a West Marches Shadowdark campaign.

It focuses on the initial MVP:

- campaign and character management;
- adventure opportunities;
- GM availability;
- expedition scheduling and recruitment;
- post-session report processing;
- permission-aware campaign knowledge.

## Goals

- Support the complete West Marches expedition cycle.
- Make character availability date-sensitive.
- Allow players to initiate expeditions through their characters.
- Match adventures with qualified and available GMs.
- Use natural language for search and common operations.
- Preserve GM control over canonical information.
- Track provenance for accepted campaign changes.
- Keep the campaign world persistent and synchronized with real-world time.

## Non-Goals for the Initial Release

- Fully autonomous world simulation.
- Exact geographic pathfinding.
- Universal support for every RPG system.
- Public multi-tenant hosting.
- Character-specific knowledge modeling.
- Fully automated acceptance of LLM-generated changes.
- Universal world-building ontology.
- Local or offline LLM support.

## Core Invariants

### Players operate the system; characters act in the world

A logged-in player may control multiple characters. Expedition participation, travel, downtime, purchases, discoveries, and other in-world actions belong to characters rather than directly to players.

### Campaign state changes through actions, not arbitrary edits

Players express what their characters intend to do. Validated domain workflows create commitments, resolve consequences, and update authoritative campaign state when those actions complete.

Players should not normally directly edit authoritative values such as current location, commitments, expedition participation, or lifecycle state. GMs and Administrators may override these values when necessary, with an audit record.

See [ADR 0001](decisions/0001-campaign-state-changes-through-actions.md).

### One day equals one day

Campaign dates correspond directly to real-world dates. A commitment covering two weeks of campaign time also makes the character unavailable for two weeks of real-world time.

### Availability is derived

Character availability is calculated from:

- active status;
- location;
- time-bound commitments;
- expedition participation;
- travel feasibility.

Availability is not a manually edited Boolean field.

### Players initiate play; GMs publish capacity

GMs declare when and where they are available to run games. Players select opportunities through their characters, and the system matches those opportunities with valid GM time slots.

### The LLM proposes; the application validates

The LLM may interpret requests and suggest changes, but it cannot bypass authorization, domain validation, confirmation requirements, or persistence rules.

### GMs control canon

Player submissions may propose facts, corrections, rumors, and updates. Canonical world state changes only after an authorized GM accepts them.

### Accepted changes retain provenance

Important campaign information should remain linked to its source, author, expedition, approving GM, and revision history.

## Actors and Permissions

### Anonymous Visitor

Can read explicitly public campaign content.

### Player

Can:

- manage player-editable data for owned characters;
- request in-world actions for owned characters, such as travel or downtime;
- browse permitted campaign knowledge;
- create calls to adventure through eligible characters;
- join expeditions with eligible characters;
- submit reports, corrections, and other contributions;
- view their characters' locations, commitments, and availability.

Players do not normally directly edit authoritative campaign state such as current location or derived availability.

### GM

Can:

- do everything available to a Player when also acting as a player;
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
- define or manage regions and safe locations;
- manage GM regional assignments;
- configure system integrations and LLM settings;
- correct or override authoritative character state when necessary.

Roles may overlap. A user may be both a Player and GM, or both a GM and Administrator.

## Initial Domain Model

The first implementation is expected to include entities similar to the following.

### User

Represents a person who can authenticate to the application.

### Campaign

Represents one West Marches campaign and its global configuration.

Possible attributes include:

- name;
- timezone;
- maximum active characters per player;
- default session duration;
- public visibility settings;
- gameSystem.

### CampaignMembership

Connects a User to a Campaign and stores campaign-level permissions.

Possible attributes:

- userId;
- campaignId;
- isPlayer;
- isGM;
- isAdministrator;
- status.

### Character

Represents a player character.

Possible core attributes include:

- id;
- campaignId;
- ownerUserId;
- name;
- lifecycleStatus;
- readinessStatus;
- currentLocationId;
- gameSystem;
- gameData;
- createdAt;
- retiredAt.

The character model separates generic campaign state from game-system-specific character data.

Core campaign state should be modeled explicitly because the campaign engine must query and enforce it. Examples include ownership, lifecycle status, current location, and commitments.

Game-system-specific mechanics should be stored in a flexible `gameData` JSON structure. Shadowdark is the first supported game system, but this approach leaves room for other systems such as Call of Cthulhu or Cyberpunk without redesigning the core character model.

Possible lifecycle status values include:

- active;
- retired;
- dead;
- missing;
- archived.

A character may exist before it is ready for play. Readiness should therefore be treated separately from lifecycle state. A draft or incomplete character can be stored without being eligible for campaign actions.

Player-owned `gameData` is primarily editable by the owning player, subject to game-system validation. Campaign-controlled state is changed through domain workflows or explicit GM/Admin overrides.

### CharacterCommitment

Represents a time-bound activity that may affect availability.

Possible attributes:

- id;
- characterId;
- type;
- startDate;
- endDate;
- locationId;
- blocksExpeditions;
- description;
- sourceType;
- sourceId.

Examples include:

- downtime;
- travel;
- recovery;
- training;
- crafting;
- expedition participation.

Commitments should normally be created or changed through validated domain actions rather than arbitrary character field edits.

### Region

Represents a map area associated with locations, adventure opportunities, and GM authority.

### Location

Represents a named place in the campaign world.

Possible attributes:

- id;
- regionId;
- name;
- type;
- isSafe;
- visibility.

Possible types include:

- settlement;
- dungeon;
- landmark;
- route;
- wilderness site.

### AdventureOpportunity

Represents a known location, rumor, hook, request, threat, or other potential adventure.

Possible attributes:

- id;
- title;
- regionId;
- departureLocationId;
- description;
- status;
- estimatedDurationMinutes;
- visibility.

### GMAvailabilityWindow

Represents a period during which a GM is willing to run a game.

Possible attributes:

- id;
- gmUserId;
- startDateTime;
- endDateTime;
- maximumSessionMinutes;
- minimumPlayers;
- maximumPlayers;
- status.

### GMRegionAuthorization

Connects a GM to one or more regions they are authorized to run.

### CallToAdventure

Represents a player-created expedition proposal issued on behalf of a character.

Possible attributes:

- id;
- opportunityId;
- organizerUserId;
- organizerCharacterId;
- scheduledStart;
- scheduledEnd;
- gmUserId;
- status;
- description.

### ExpeditionParticipant

Associates a participating character and controlling player with a call to adventure.

Possible attributes:

- callToAdventureId;
- characterId;
- playerUserId;
- status;
- joinedAt.

### ExpeditionReport

Stores the human-submitted account of a completed session. The original submission should be retained unchanged.

### ProposedChange

Stores one structured campaign change extracted or suggested by the LLM before GM approval.

### AcceptedFact

Represents an approved addition or alteration to campaign knowledge with provenance and visibility metadata.

## Character Data Authority

Character data is divided into two broad categories.

### Player-managed game data

The player who owns a character is the primary editor of that character's game-system-specific data, subject to validation.

Examples may include:

- ability scores;
- class and level;
- talents and abilities;
- spells;
- equipment;
- description and notes;
- other system-specific sheet values.

Some game-system fields may later require stronger controls if campaign workflows also modify them.

### Campaign-controlled state

The following are authoritative campaign state and should not normally be directly editable by players:

- owner;
- current location;
- lifecycle/readiness state;
- commitments;
- expedition participation;
- other state used to enforce shared campaign rules.

Players may cause these values to change by initiating valid in-world actions. For example, a player may request travel to another location. The application can translate that request into a travel commitment, apply game-system-specific travel rules, and update the character's location when the action resolves.

GMs and Administrators may directly correct or override these values when necessary. Such overrides should be auditable.

Availability is never directly edited by any actor; it is always derived.

## Key Workflows

### Character Requests Travel

1. The player chooses an owned character and requests travel to a destination, using either natural language or a conventional UI.
2. The application verifies that the destination is valid and that the character can begin the travel action.
3. The game-system layer determines travel duration and any required consequence or encounter rolls.
4. The application shows the proposed action and consequences for confirmation when appropriate.
5. The application creates a blocking travel commitment.
6. While the commitment is active, the character is unavailable for conflicting expeditions.
7. When travel resolves successfully, the application updates the authoritative current location.
8. The action and resulting state change remain auditable.

### GM Publishes Availability

1. The GM enters availability using a form or natural-language request.
2. The system identifies the date, time window, regions, and optional player-count limits.
3. The application validates the GM's regional authorization.
4. The interpreted availability is shown for confirmation when needed.
5. The system saves one or more availability windows.

Example natural-language request:

> I can run Marin's Hold or the Northern Fen Saturday from 10 to 5.

### Player Creates a Call to Adventure

1. The player selects an owned character.
2. The player selects an adventure opportunity.
3. The system validates that the character is in the required departure location or otherwise geographically eligible.
4. The system finds GM availability for the relevant region.
5. Dates that conflict with the character's commitments are removed.
6. The player selects a valid slot.
7. The system creates the call on behalf of the selected character.

The call records both the human player who created it and the character who issued it in the game world.

### Player Joins an Expedition

1. The player opens a call to adventure.
2. The system evaluates each owned character against the expedition date and location.
3. Each character is shown as eligible or ineligible.
4. The system explains any conflicts.
5. The player chooses an eligible character.
6. The system records expedition participation and creates any required blocking commitment.

### Process an Expedition Report

1. A player or GM submits natural-language session notes.
2. The application stores the original report unchanged.
3. The LLM extracts proposed entities and campaign changes.
4. The application validates the proposal against known entity types, permissions, and domain rules.
5. A GM reviews the proposed changes.
6. Approved changes update campaign state.
7. A player-safe recap is generated or published.
8. Accepted changes remain linked to their source report and approving GM.

## Availability and Scheduling Rules

A character is eligible for an expedition when all required conditions are satisfied:

- the character is active and ready for play;
- the character is at the required departure location or otherwise geographically eligible;
- the character has no overlapping blocking commitment;
- the character is not committed to another expedition at the same time;
- the expedition falls within a valid GM availability window;
- the selected GM is authorized for the opportunity's region.

Availability should be calculated for a specific date or date range rather than stored directly.

### Commitment Date Convention

For day-based commitments, the initial convention should be:

> A commitment ending on a given date blocks the character through the end of that date. The character becomes available the following day.

Exact datetime overlap rules may be introduced where needed for session scheduling.

### Initial Geographic Rule

For the MVP, avoid exact pathfinding. Each adventure opportunity may specify a required departure location or nearby safe settlement. A character must already be at that location unless a later travel model explicitly allows otherwise.

## Natural-Language Interaction Model

Natural language is a primary interface, but the LLM acts as an interpreter rather than a direct database agent.

Possible intent categories include:

- QUERY;
- CREATE_DRAFT;
- PROPOSE_CHANGE;
- SCHEDULE_ACTION;
- REQUEST_TRAVEL;
- CREATE_CALL_TO_ADVENTURE;
- JOIN_EXPEDITION;
- SUBMIT_REPORT;
- ADMIN_ACTION.

Example interpretation:

```json
{
  "intent": "CREATE_CALL_TO_ADVENTURE",
  "actingCharacterId": "char_123",
  "opportunityId": "opp_456",
  "requestedDateRange": {
    "start": "2026-08-15",
    "end": "2026-08-22"
  }
}
```

The application then:

1. checks permissions;
2. resolves referenced entities;
3. validates domain rules;
4. requests confirmation where appropriate;
5. performs the operation.

The LLM should never receive unrestricted database-write access.

## Visibility Model

The initial visibility model should remain simple:

- `PUBLIC` - visible to anonymous visitors;
- `CAMPAIGN` - visible to authenticated campaign members;
- `GM_ONLY` - visible only to authorized GMs.

Possible future visibility levels include selected users or selected characters, but these are outside the initial release.

Administrative and scheduling records may use separate access rules rather than the campaign-knowledge visibility model.

## Canon and Provenance

Campaign knowledge should flow through a reviewable process:

```text
Source document or report
        |
        v
LLM-proposed changes
        |
        v
GM review
        |
        v
Accepted changes
        |
        v
Current campaign state
```

Each accepted change should retain enough metadata to answer questions such as:

- What source established this information?
- Who submitted it?
- Was an LLM involved in interpreting it?
- Which GM approved it?
- When was it approved?
- Did it replace or retract an earlier fact?
- Who is allowed to see it?

The original source should not be silently overwritten.

## Architecture Overview

The exact technology stack is still undecided, but the initial architecture is expected to resemble:

```text
Web Client
    |
Application API
    |
    +-- Authentication and Permissions
    +-- Campaign Domain Services
    +-- Scheduling and Availability Engine
    +-- Knowledge and Provenance Service
    +-- LLM Orchestration Service
    |
Relational Database
    |
LLM Provider
```

A relational database is a reasonable initial system of record because the MVP contains highly structured, transactional data. Semantic search or embeddings may be added later without becoming the source of truth.

## Security Considerations

The design should account for:

- server-side authorization;
- preventing GM-only information from entering player-visible LLM context;
- protection of LLM API keys and other secrets;
- input and upload limits;
- audit logging for important administrative and canonical changes;
- prompt-injection risks from player-authored documents and other untrusted content.

Player-authored content should always be treated as campaign data, not as trusted instructions to the LLM or application.

## Error and Conflict Handling

The system should provide clear and reversible behavior for cases such as:

- a character becoming unavailable after joining an expedition;
- a GM removing an availability window;
- an opportunity changing regions;
- two players attempting to claim the final party slot;
- an LLM referencing an ambiguous character or location;
- a report contradicting accepted canon.

Where possible, the application should preserve the affected call or submission while explaining what must be resolved.

## Audit and History

At minimum, important changes should track:

- who created or changed the record;
- when the change occurred;
- previous value where relevant;
- source of the change;
- whether an LLM was involved;
- who approved a canonical change.

## Open Questions

- Does a GM own a region, or merely receive authorization to run it?
- Can multiple GMs run the same region?
- Can an opportunity have more than one valid departure location?
- Does joining an expedition immediately create a blocking commitment?
- Can a player withdraw from an expedition without GM approval?
- When does a call to adventure become confirmed?
- How should sessions that cross midnight be dated?
- Can downtime be interrupted?
- What happens if a character fails to return to safety at the end of a session?
- Are recurring GM availability windows part of the MVP?
- How interactive does the map need to be for the initial release?
- When should travel feasibility become more sophisticated than a required departure location?
- Which game-system fields, if any, should be promoted from `gameData` into stronger campaign-controlled state?

## Milestone Mapping

| Milestone | Main design areas |
|---|---|
| Configure Campaign and Manage Characters | Users, memberships, characters, regions, commitments, availability |
| Publish Opportunities and GM Availability | Opportunities, map locations, GM availability, regional authority |
| Schedule and Recruit Expeditions | Calls to adventure, eligibility, date matching, participants, conflicts |
| Process Reports and Update Campaign Knowledge | Reports, LLM extraction, moderation, provenance, visibility |

## Future Design Documents

As individual areas become complex enough to justify separate treatment, this document may be split into focused documents such as:

- `docs/domain-model.md`;
- `docs/permissions.md`;
- `docs/scheduling.md`;
- `docs/llm-workflows.md`.

Architectural decisions that need a durable record may be captured separately under `docs/decisions/` as Architecture Decision Records (ADRs).
