# ADR 002: Character Lifecycle and Retirement

Status: Accepted  
Date: August 13, 2026

## Context

West Wiki allows each player to maintain multiple characters, but only a configurable number may be part of the active roster at one time. Characters also need to support long-term campaign outcomes such as death, disappearance, retirement, and persistence in the living world after they cease being playable PCs.

The system should allow players to prepare replacement characters in advance without consuming active roster slots, while still preventing a player from exceeding the campaign's configured number of potentially playable characters.

## Decision

### Lifecycle states

Characters use a single lifecycle state rather than separate readiness and lifecycle fields.

Initial lifecycle states are:

- `DRAFT` - character exists but has not yet entered normal play;
- `ACTIVE` - character is part of the playable roster;
- `MISSING` - character's fate or whereabouts are unresolved and the character cannot currently be selected for normal play;
- `RETIRED` - character has permanently left player-controlled adventuring but remains part of the campaign world;
- `DEAD` - character is permanently dead and out of normal play;
- `ARCHIVED` - historical record no longer relevant to active campaign operations.

### Roster limit

A character counts against the campaign's active-character limit when its lifecycle state is `ACTIVE` or `MISSING`.

`DRAFT`, `RETIRED`, `DEAD`, and `ARCHIVED` characters do not count against the limit.

`MISSING` counts because the character may return to normal play without being recreated.

### Draft characters and location

`DRAFT` characters may have `currentLocationId = null` because they have not necessarily entered the campaign world yet.

Characters in `ACTIVE` or `MISSING` state must have a valid campaign location.

When a character becomes `RETIRED` or `DEAD`, the system preserves the character's last meaningful location rather than clearing it, so campaign history remains intact.

### Activation

A player may request activation of one of their own `DRAFT` characters when they have room under the campaign's configured roster limit.

Standard activation validates that:

- the player has an available roster slot;
- the character contains the game-system data required for play;
- the player selects a permitted starting location;
- the character otherwise satisfies campaign validation rules.

If validation succeeds, the system transitions the character from `DRAFT` to `ACTIVE` and assigns the selected starting location.

Campaigns may eventually support an activation policy such as `AUTOMATIC` or `GM_APPROVAL`. The initial Shadowdark campaign uses automatic activation for standard permitted starting locations. Exceptional starting-location requests may require GM approval.

### Retirement

A player may retire one of their own characters at any time through a retirement domain action.

The retirement request should include a retirement location and may include narrative intentions, resources committed, businesses, titles, relationships, or other details relevant to the character's future.

A game-system or campaign-specific retirement resolver may optionally determine additional consequences or a long-term fate.

After retirement:

- lifecycle state becomes `RETIRED`;
- the character no longer counts against the roster limit;
- the retirement location is preserved;
- the complete character history and game data are preserved;
- the retired character becomes or links to a persistent world-facing Person/NPC entity;
- future changes to that individual are managed as part of the living campaign world rather than ordinary player-controlled character play.

Retirement is not normally reversible by the player. A GM or Administrator may restore a retired character only as an explicit exceptional override, with audit history.

## Consequences

- Players may keep any number of `DRAFT` characters waiting in the wings without consuming active roster slots.
- The application must validate `DRAFT -> ACTIVE` transitions rather than treating activation as a direct field edit.
- Missing characters remain meaningful campaign assets and continue to occupy roster capacity.
- Retired characters naturally feed the campaign's world model and may become NPCs, patrons, shopkeepers, faction members, or other persistent entities.
- The eventual world model needs a way to preserve identity/provenance between a former PC and its world-facing Person/NPC representation.
- Lifecycle transitions should be auditable domain actions.

## Guiding Principle

**Characters leave play without leaving the world.** Draft characters wait outside normal play, active and missing characters occupy roster space, and retired characters continue as persistent people in the campaign setting.
