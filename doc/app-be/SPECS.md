# Application Specifications

Status: Draft  
Last updated: September 15, 2026

## Purpose

This document records application-internal models and workflow semantics for West Wiki. Shared KB/app API contracts belong in [`doc/contract/API.md`](../contract/API.md) and [`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md), not here.

The entities in this document are application-owned current-state records held in an ordinary database. They are not event-sourced and carry no provenance chain -- see [ADR 003](../adr/003-kb-app-ownership-boundary.md). Which entities the KB owns instead is tabulated in [`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md); those are consumed as projections, and summarized under "KB-owned entities" below.

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
- `role` -- `PLAYER`, `GM`, or `ADMINISTRATOR`
- `status`

`role` is a single rank, not a set of independent flags: each tier includes every capability and all visibility of the tiers below it, so `ADMINISTRATOR` implies `GM` implies `PLAYER`. `ANONYMOUS` is the absence of a membership record and is never stored. Authorization compares rank against a required minimum tier rather than testing for a role by name. Role is scoped to a single campaign. See [ADR 004](adr/004-role-based-permission-tiers.md).

`status` and `role` are independent: status says whether a membership is currently in force, role says what tier it grants when it is.

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

Visibility on this entity is enforced by application access control -- filtering rows by the caller's role tier at query time -- not by KB redaction. See [ADR 003](../adr/003-kb-app-ownership-boundary.md).

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

Entities owned by the Knowledge Base rather than the application are listed in
[`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md), which is the single source of
truth for the split. The application holds no canonical record of them; it consumes viewer-resolved
projections across the KB/app boundary.

That document also defines their shapes. The workflows below reference them but do not restate
them.

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
5. The application asserts the lifecycle change and the starting location to the KB. It does not update a Character row -- there is none. The next Character projection reflects `ACTIVE` and the selected location.
6. The assertion carries the application workflow as its source, and is audited.

Exceptional starting-location requests, or campaigns configured for `GM_APPROVAL`, may enter a GM-approval path.

## Character Retirement Workflow

1. Player requests retirement for an owned character.
2. Request includes a retirement location and may include narrative intentions/resources.
3. Application validates the action.
4. Optional campaign/game-system retirement resolver determines additional consequences.
5. The application asserts the retirement to the KB; the projection then reports `RETIRED`.
6. Retirement location and complete character history remain preserved in the log.
7. No linkage to a separate Person/NPC record is needed. The KB entity was always the person, and it persists beyond play -- the application's playable-character concern simply ends. See [ADR 002 (app)](adr/002-character-lifecycle-and-retirement.md) and [`KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md).
8. Character no longer counts against roster limits.
9. Player cannot normally reverse retirement; GM/Admin override is exceptional and audited.

## Travel Workflow

1. Player chooses an owned character and destination.
2. Application validates that travel can begin and destination is valid.
3. Game-system/campaign resolver determines duration and required consequences.
4. Application creates a blocking travel commitment.
5. While the commitment overlaps a date, the character is unavailable for conflicting expeditions.
6. On successful resolution, the application asserts the new location to the KB. The application computes the duration and decides when the period has elapsed; the KB records what it is told.
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

Day boundaries are measured in the campaign's configured timezone (`Campaign.timezone`), not the server's or the caller's.

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
2. The original report is persisted unchanged, as a KB-owned `ExpeditionReport`.
3. LLM extracts structured changes from the report.
4. Application validates permissions, entity references, and domain constraints.
5. Valid extractions are asserted to the KB as `RUMOR`, attributed to the submitting human, with the LLM's involvement noted. There is no approval gate here.
6. A GM may later promote a rumor to `CANON` by asserting it, contradict it, or retract it. This is ongoing curation, not a step in report submission.
7. Player-safe recap may be generated/published.
8. Provenance remains linked to the report and, where canon was asserted, to the GM who asserted it.

Steps 5 and 6 reflect a trust-but-verify posture: contributions are recorded rather than queued, and the tracked history is what makes that safe. See [ADR 004](../adr/004-fact-model-veracity-and-visibility.md).

Players asserting facts about their own characters, and recording world claims as rumors, do not pass through this workflow at all. Whether the GM's promotion queue is a KB `ProposedChange` entity or a view over rumor-tagged facts is still open.

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