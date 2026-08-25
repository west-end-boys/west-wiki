# Application Specifications

Status: Draft  
Last updated: August 25, 2026

## Purpose

This document records application-internal models and workflow semantics for West Wiki. Shared KB/app API contracts belong in [`doc/contract/API.md`](../contract/API.md) and [`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md), not here.

## Initial Domain Model

### User

Represents a person who can authenticate to the application.

### Campaign

Possible attributes:

- `id`
- `name`
- `timezone`
- `gameSystem`
- `characterRules`
  - `maxRosterSize`
  - `activationPolicy` (`AUTOMATIC` or `GM_APPROVAL`; see [ADR 002](adr/002-character-lifecycle-and-retirement.md))
- `downtimeRules`
  - `maxActivitiesBetweenExpeditions`
- `defaultSessionDuration`
- `publicVisibilitySettings`

### CampaignMembership

Possible attributes:

- `userId`
- `campaignId`
- `isPlayer`
- `isGM`
- `isAdministrator`
- `status`

### CharacterCommitment

Possible attributes:

- `id`
- `characterId`
- `type`
- `startDate`
- `endDate`
- `effectiveEndDate`
- `status`
- `locationId`
- `description`
- `sourceType`
- `sourceId`
- activity-specific data

Initial downtime types may include:

- `TRAVEL`
- `CAROUSING`
- `CRAFTING`
- `TRAINING`
- `RECOVERY`
- `OTHER`

`EXPEDITION` is a blocking commitment but is not downtime.

Initial downtime statuses:

- `SCHEDULED`
- `ACTIVE`
- `COMPLETED`
- `CANCELLED`
- `ENDED_EARLY`

### AdventureOpportunity

Possible attributes:

- `id`
- `title`
- `regionId`
- `departureLocationId`
- `description`
- `status`
- `estimatedDurationMinutes`
- `visibility`

### GMAvailabilityWindow

Possible attributes:

- `id`
- `gmUserId`
- `startDateTime`
- `endDateTime`
- `maximumSessionMinutes`
- `minimumPlayers`
- `maximumPlayers`
- `status`

### CallToAdventure

Possible attributes:

- `id`
- `opportunityId`
- `organizerUserId`
- `organizerCharacterId`
- `scheduledStart`
- `scheduledEnd`
- `gmUserId`
- `status`
- `description`

### ExpeditionParticipant

Possible attributes:

- `callToAdventureId`
- `characterId`
- `playerUserId`
- `status`
- `joinedAt`

### KB-owned entities

`Character`, `Region`, `Location`, `GMRegionAuthorization`, `ExpeditionReport`, and `ProposedChange`
are owned by the Knowledge Base, not by the application. The application holds no canonical record of
them; it consumes viewer-resolved projections across the KB/app boundary.

Their shapes are defined in [`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md). The
workflows below reference them but do not restate them.

## Character Activation Workflow

1. Player chooses an owned `DRAFT` character.
2. Player requests activation and selects a starting location.
3. Application validates:
   - the character exists and is owned by the requesting player;
   - player has fewer roster-counting characters than the configured limit;
   - required game-system data is present and valid;
   - selected location allows character activation;
   - the campaign's `characterRules.activationPolicy` is `AUTOMATIC`.
4. Standard activation succeeds automatically.
5. Character transitions `DRAFT -> ACTIVE`.
6. `currentLocation` is set to the selected location's projection.
7. The transition is audited.

Exceptional starting-location requests, or campaigns configured for `GM_APPROVAL`, may enter a GM-approval path.

## Character Retirement Workflow

1. Player requests retirement for an owned character.
2. Request includes a retirement location and may include narrative intentions/resources.
3. Application validates the action.
4. Optional campaign/game-system retirement resolver determines additional consequences.
5. Character transitions to `RETIRED`.
6. Retirement location and complete character history remain preserved.
7. Application initiates or records linkage to a persistent world-facing Person/NPC identity.
8. Character no longer counts against roster limits.
9. Player cannot normally reverse retirement; GM/Admin override is exceptional and audited.

## Travel Workflow

1. Player chooses an owned character and destination.
2. Application validates that travel can begin and destination is valid.
3. Game-system/campaign resolver determines duration and required consequences.
4. Application creates a blocking travel commitment.
5. While the commitment overlaps a date, the character is unavailable for conflicting expeditions.
6. On successful resolution, authoritative current location changes to the destination.
7. Action and resulting state change remain auditable.

## Downtime Scheduling Semantics

Downtime is a blocking between-expedition activity.

### Conflict rule

No two blocking commitments for the same character may overlap. A conflicting request fails with an explanation of the existing commitment.

### Future scheduling

Downtime may be created for a future start date. A scheduled commitment immediately reserves its date range but does not consume a downtime allowance until it starts.

Example: a seven-day activity starting September 15 blocks September 15 through September 21. The character is available again September 22 if otherwise eligible.

### Automatic transitions

- Before start: `SCHEDULED`
- On start date: automatically `ACTIVE`
- After normal end date: automatically `COMPLETED`

External reads should reconcile date-driven state even if scheduled processing has not run yet.

### Downtime allowance

The number of downtime activities used since the most recent completed expedition is derived from activity history.

An activity consumes allowance when it first becomes `ACTIVE`.

- Future scheduling does not consume allowance.
- Cancelling while `SCHEDULED` does not consume allowance.
- Ending an `ACTIVE` activity early does not refund allowance.

### Cancellation and early termination

`SCHEDULED -> CANCELLED` is permitted for the owning player, subject to campaign rules.

`ACTIVE -> ENDED_EARLY` is permitted for the owning player. The effective end date becomes the termination date. The character becomes available after that date if no other state blocks them. Activity-specific rules determine partial benefits, losses, or consequences.

## Availability Calculation

Availability is evaluated for a specific date/date range.

At minimum, an expedition eligibility check evaluates:

1. lifecycle state is `ACTIVE`;
2. geographic eligibility for the departure location;
3. no overlapping blocking commitment;
4. no conflicting expedition participation;
5. a valid GM availability window exists;
6. GM is authorized for the opportunity's region;
7. party/session constraints remain valid.

`MISSING` characters remain roster-counting but are not normally expedition-eligible.

### Day-based boundary convention

A commitment ending on date X blocks through the end of X. Availability resumes on X+1 day unless another condition blocks it.

## GM Availability Workflow

1. GM enters availability through form or natural language.
2. Application resolves date/time, regions, and optional party/session limits.
3. Regional authorization is validated.
4. Ambiguous or consequential interpretation is confirmed when necessary.
5. One or more availability windows are persisted.

## Call to Adventure Workflow

1. Player selects an owned character.
2. Player selects an adventure opportunity.
3. Application validates geographic eligibility.
4. Scheduling service finds appropriate GM availability.
5. Character-conflicting dates are excluded.
6. Player chooses a valid slot.
7. Application creates the Call to Adventure with both `organizerUserId` and `organizerCharacterId`.

## Join Expedition Workflow

1. Player opens a Call to Adventure.
2. Application evaluates each owned character against date, location, lifecycle, commitments, and party constraints.
3. Eligible/ineligible results include conflict explanations.
4. Player selects an eligible character.
5. Participation record is created.
6. Required expedition commitment is created at the appropriate lifecycle point for the Call to Adventure.

Exactly when a provisional call should create the blocking expedition commitment remains an open design question.

## Report Processing Workflow

1. Player or GM submits natural-language session notes.
2. Original report is persisted unchanged.
3. LLM extracts proposed structured entities/changes.
4. Application validates permissions, entity references, and domain constraints.
5. GM reviews proposals.
6. Accepted canonical changes cross the shared KB/app contract.
7. Player-safe recap may be generated/published.
8. Provenance remains linked to report and approving GM.

## Natural-Language Intents

Initial intent categories may include:

- `QUERY`
- `CREATE_DRAFT`
- `REQUEST_ACTIVATION`
- `REQUEST_RETIREMENT`
- `REQUEST_TRAVEL`
- `SCHEDULE_DOWNTIME`
- `CANCEL_DOWNTIME`
- `END_DOWNTIME_EARLY`
- `CREATE_CALL_TO_ADVENTURE`
- `JOIN_EXPEDITION`
- `SUBMIT_REPORT`
- `PROPOSE_CHANGE`
- `ADMIN_ACTION`

The LLM output is always treated as a proposed structured operation subject to normal authorization and validation.

## Audit Semantics

Important transitions should record actor, timestamp, source action, previous relevant state, resulting state, and whether LLM interpretation was involved. GM/Admin overrides should be distinguishable from normal domain workflows.