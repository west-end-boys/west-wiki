# Application Requirements

Scope for the application layer. This document owns MVP scope; `README.md` owns mission and
principles and does not restate scope.

**Status:** MVP scope only. Use cases and user stories are not yet written -- see Next Steps item 2
in the session handoff.

---

## MVP objective

Help a player choose an adventure, act through an eligible character, find a valid GM time slot,
organize the expedition, and then record the outcome.

The first version supports one complete West Marches play cycle end to end. Everything below is
required for that cycle to close; anything not required for it is out of scope.

Campaign time advances at the same rate as real time (see `README.md`, Core Principles). Downtime,
travel, and recovery therefore consume real-world days, and character availability is **calculated
from commitments, never manually toggled**. That single rule drives most of the scheduling
behaviour below.

---

## 1. Campaign setup

An administrator can configure:

- Maximum active characters per player, initially 3
- Campaign time zone
- Session duration defaults
- Regions or map areas
- Which GMs can run each region
- Public versus campaign-member access

## 2. Player and character management

A player can:

- Create and manage characters
- See each character's current safe location
- See current and future commitments
- See when a character becomes available
- Retire or archive a character

## 3. Adventure opportunities

Players can browse known map locations, rumors, adventure hooks, and open calls to adventure.

Each opportunity carries at least:

- Name
- Region
- Nearby departure location
- Public description
- Status
- Estimated session duration

An interactive map is not required for the MVP. A location list grouped by region satisfies it.

## 4. GM availability

A GM can publish:

- Available date and time windows
- Regions they are willing or authorized to run
- Maximum session duration
- Optional party-size limits (minimum and maximum)

## 5. Create a call to adventure

A player selects one of their characters and an adventure opportunity, and receives valid dates
derived from:

- Character location
- Character commitments
- Travel feasibility
- GM availability
- GM regional authorization

The player selects a valid time and publishes the call to adventure.

The call records both the player who created it and the character issuing it in the world.

## 6. Join an expedition

Other players choose a character to join. The system explains eligibility in terms of:

- Available
- Occupied by downtime
- Already committed elsewhere
- Too far away
- Dead, retired, missing, or otherwise inactive

## 7. Record the outcome

After the session:

1. A player or GM submits a natural-language expedition report.
2. The LLM proposes structured updates.
3. A GM reviews and approves them.
4. Character locations, commitments, discoveries, opportunities, and wiki entries are updated.
5. A player-safe recap is published.

---

## Out of scope for the initial release

- Universal world-building ontology
- Fully autonomous changes by the LLM
- Complex fact-level permissions for individual characters
- Public multi-tenant hosting
- Local or offline LLM support
- Advanced campaign simulation

The first and third of these are KB-layer exclusions and should move to `doc/kb/REQUIREMENTS.md`
when that document is drafted, leaving one statement of each here.
