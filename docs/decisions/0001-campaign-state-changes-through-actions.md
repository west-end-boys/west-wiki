# ADR 0001: Campaign State Changes Through Actions

Status: Accepted  
Date: August 13, 2026

## Context

A West Wiki character contains both player-managed game-system data and authoritative campaign state.

Players should normally control the mechanical and descriptive data for characters they own. However, values such as current location, time-bound commitments, lifecycle state, ownership, and expedition participation affect the shared campaign world and cannot safely be treated as arbitrary player-editable fields.

At the same time, players must be able to cause legitimate changes to campaign state through play. For example, a player may decide that their character travels from one settlement to another. In Shadowdark, this may be represented as a downtime activity that consumes real-world/campaign time and may require a roll for travel consequences.

Because West Wiki follows the principle that one real-world day equals one campaign-world day, these actions can also affect character availability for future expeditions.

## Decision

### Players manage game-system data

The player who owns a character may primarily edit that character's game-system-specific data, stored in the character's `gameData` structure, subject to game-system validation.

Examples include:

- ability scores;
- class and level;
- talents and abilities;
- spells;
- equipment;
- character description and notes;
- other game-system-specific character-sheet values.

Some game-system values may later require stronger controls if campaign workflows also modify them.

### Campaign state is authoritative

The following kinds of data are campaign-controlled rather than ordinary player-editable character-sheet data:

- character owner;
- current location;
- lifecycle/readiness status;
- time-bound commitments;
- expedition participation;
- other shared campaign-state values used to enforce domain rules.

GMs and Administrators may directly correct or override authoritative campaign state when necessary. Such changes should be auditable.

### Players request actions rather than directly editing campaign state

Normal gameplay changes to authoritative campaign state should occur through validated domain workflows.

A player expresses what their character intends to do. The application interprets and validates that action, creates any required commitments or intermediate state, resolves consequences, and updates authoritative campaign state when appropriate.

For example, a player might request:

> Bran travels from Marin's Hold to Dunwold.

The application may translate this into a Travel activity with:

- an origin and destination;
- a start date;
- a travel duration;
- a blocking character commitment;
- any required Shadowdark travel/consequence roll;
- a final location update when the travel activity resolves successfully.

The player therefore causes the location change through an in-world action but does not directly assign `currentLocationId`.

The same model applies to actions such as:

- travel;
- downtime;
- crafting;
- training;
- recovery;
- joining an expedition;
- retirement;
- other activities that alter shared campaign state.

### Availability remains derived

Availability is never directly edited by Players, GMs, or Administrators. It is derived from authoritative character state, including lifecycle status, location, commitments, expedition participation, and travel feasibility for the date or date range being evaluated.

## Authority Summary

| Data | Player | GM | Administrator | Domain workflow |
|---|---|---|---|---|
| Game-system `gameData` | Primarily own character | Yes | Yes | Sometimes |
| Character name/description | Own character | Yes | Yes | Rarely |
| Owner | No direct edit | Yes | Yes | Possibly |
| Current location | Request action | Yes, as override | Yes, as override | Primary mechanism |
| Commitments | Request permitted activities | Yes | Yes | Primary mechanism |
| Lifecycle state | Limited actions | Yes | Yes | Often |
| Expedition participation | Join/withdraw through workflow | Yes | Yes | Primary mechanism |
| Availability | No | No | No | Derived only |

## Consequences

- The application must distinguish player-editable game data from authoritative campaign state.
- Domain services must own state transitions for travel, downtime, expeditions, and similar activities.
- Natural-language requests should resolve to domain actions rather than unrestricted field edits.
- GM and Administrator direct overrides should create audit history.
- Character availability must be recalculated from state rather than stored as a user-controlled value.
- Game-system-specific workflows, such as Shadowdark travel downtime, can plug into the generic action model without changing the core character structure.

## Guiding Principle

**Campaign state changes through actions, not arbitrary edits.** Players express what their characters intend to do; validated domain workflows create commitments and update authoritative campaign state when those actions resolve.
