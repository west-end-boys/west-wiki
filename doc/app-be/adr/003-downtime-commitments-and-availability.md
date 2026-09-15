# ADR 003: Downtime Commitments and Availability

Status: Accepted  
Date: August 13, 2026

## Context

In the West Wiki campaign model, character availability is central to scheduling expeditions. Shadowdark treats most between-adventure activity as downtime, including travel, carousing, crafting, training, recovery, and similar actions.

The system needs a consistent way to represent these activities, prevent scheduling conflicts, enforce campaign-specific downtime limits, and preserve the one-real-day-equals-one-campaign-day rule.

## Decision

### Downtime definition

Downtime is any character activity between expeditions that makes the character unavailable for adventuring for a defined period of campaign time.

Examples include `TRAVEL`, `CAROUSING`, `CRAFTING`, `TRAINING`, `RECOVERY`, and `OTHER` campaign-defined downtime types.

`EXPEDITION` is also a blocking character commitment, but it is not downtime.

### Character commitments

Time-bound character activity is represented by `CharacterCommitment` records.

A commitment should include enough information to determine at least character, commitment type, start date, end date, status, location/destination when applicable, source action, and activity-specific data when needed.

For the initial implementation, all downtime commitments block expedition participation while they are active or scheduled to overlap an expedition.

### No overlapping blocking commitments

A request to create a downtime activity fails when its requested period overlaps another blocking commitment for that character.

The application should explain the conflict so the player can cancel or reschedule the existing activity before retrying.

This same conflict rule should apply when scheduling expeditions.

### Future scheduling

Downtime does not need to begin immediately when requested.

A player may schedule a future activity, for example:

> Tordek starts a seven-day crafting activity on September 15.

The scheduled commitment reserves that period immediately, while leaving the character eligible for adventures before the start date.

For a seven-day activity beginning September 15, the commitment blocks September 15 through September 21 and the character becomes available again on September 22, assuming nothing else blocks them.

### Commitment status lifecycle

Initial downtime status transitions are:

- `SCHEDULED` - future commitment; calendar is reserved, but no downtime allowance has been consumed;
- `ACTIVE` - commitment has begun and blocks normal adventure participation;
- `COMPLETED` - commitment reached its normal end;
- `CANCELLED` - scheduled commitment was cancelled before starting;
- `ENDED_EARLY` - commitment began but the player voluntarily terminated it before its planned end.

Transitions based on campaign date are automatic.

On the start date, a valid `SCHEDULED` commitment automatically becomes `ACTIVE`.

After the end date, a normally resolved `ACTIVE` commitment becomes `COMPLETED` and the character becomes available again if no other condition blocks them.

### Downtime allowance between expeditions

A campaign or game-system configuration may limit the number of downtime activities a character may take between adventures.

For Shadowdark, the expected default is one downtime activity between adventures, but the value should be configurable.

The system should derive the number of downtime activities used since the character's most recent completed expedition rather than maintaining a mutable counter on the Character record.

A downtime activity consumes one allowance when it **starts**, not when it is scheduled.

Therefore:

- scheduling a future activity does not consume an allowance;
- cancelling it before its start date does not consume an allowance;
- when it automatically becomes `ACTIVE`, the allowance is consumed;
- ending an already-active activity early does not refund the allowance.

### Early termination

A player may voluntarily end one of their own active downtime activities early.

When this happens:

- the commitment becomes `ENDED_EARLY`;
- the downtime allowance remains consumed;
- the commitment's effective end becomes the date of termination;
- the character becomes available after that effective end date, assuming no other blocking state exists;
- activity-specific rules determine whether any partial benefit, loss, cost, or consequence applies;
- the original planned duration and early-termination history remain auditable.

### Activity-specific resolution

The core campaign engine manages time, conflicts, ownership, availability, and commitment state.

The game-system or campaign-specific layer determines the mechanics of individual downtime types, such as carousing results, crafting inputs/completion effects, training requirements, travel consequences/location changes, recovery requirements, and effects of early termination.

This preserves a generic scheduling model while allowing Shadowdark-specific rules and future support for other game systems.

## Consequences

- Character availability can be derived consistently from commitments.
- Players can reserve future downtime around known expeditions.
- Overlapping blocking commitments are rejected rather than silently reconciled.
- Downtime limits remain historically accurate because usage is derived from started activities.
- Cancelling future downtime is cheap; interrupting active downtime has a real cost because the allowance is already spent.
- Calendar-driven transitions support the campaign's one-day-equals-one-day principle.
- The application needs a reliable mechanism to process date-based commitment transitions automatically.

## Guiding Principle

**Future downtime is a reservation; started downtime is history.**
