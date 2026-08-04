# Living LLM Wiki

## Mission

Build a private, LLM-assisted campaign management and knowledge system for our West Marches Shadowdark campaign.

A West Marches campaign is player-driven. It is organized around a persistent world map, a changing list of known locations and possible adventures, and a way for players to organize their own expeditions by issuing calls to adventure.

The system should help players discover opportunities, share knowledge, form adventuring parties, and initiate expeditions. It should help GMs maintain a consistent living world, process the consequences of play, and control what information becomes canonical or visible.

Natural language should be a primary interface, allowing players and GMs to search, contribute, organize, and update the campaign without needing to understand the underlying data model.

**Objective**: Help a player choose an adventure, act through an eligible character, find a valid GM time slot, organize the expedition, and then record the outcome.

## Core Principles

- **Player agency drives play**. The system should help players decide where to go, why to go there, and who will join them.
- **Players initiate play; GMs publish capacity.** GMs declare when and where they are available to run games. Players select opportunities through their characters, and the system matches those opportunities with valid GM time slots.
- **One day equals one day**. Campaign time advances at the same rate as real-world time. If a character is committed to two weeks of downtime, travel, recovery, or another activity, that character is unavailable for two weeks of real-world time.
- **Characters, not players, are committed in time.** A player may continue participating through another eligible character while one character is traveling, recovering, or performing downtime.
- **The world map is central**. Locations, routes, regions, hazards, discoveries, and expeditions should connect back to the campaign map.
- **Adventure opportunities remain visible.** Known locations, rumors, unresolved threats, patron requests, and calls to adventure should be easy to find.
- **Players organize expeditions.** Players should be able to propose an objective, recruit participants, choose a date, and issue a call to adventure.
- **Natural language is a primary interface.** Users should be able to ask questions and describe actions in ordinary language.
- **The LLM proposes; the application validates.** The LLM may interpret requests and suggest changes, but permissions, validation, and persistence remain controlled by the application.
- **GMs control canon.** Players may contribute reports, rumors, corrections, and ideas without directly overwriting established world truth.
- **The world changes through play.** Expeditions should update locations, characters, factions, threats, rumors, and available opportunities.
- **Accepted changes retain provenance.** Important information should remain linked to its source, author, expedition, and revision history.
- **Knowledge is permission-aware.** Users should only receive information appropriate to their role and current viewpoint.
- T**raditional interfaces remain available.** Maps, lists, forms, timelines, and wiki pages should support browsing, review, and correction alongside the conversational interface.

## Initial MVP

The first version should support a basic West Marches play cycle:

**1. Campaign setup**

An administrator can configure:

- Maximum active characters per player, initially 3
- Campaign time zone
- Session duration defaults
- Regions or map areas
- Which GMs can run each region
- Public versus campaign-member access

**2. Player and character management**

A player can:

- Create and manage characters
- See each character’s current safe location
- See current and future commitments
- See when a character becomes available
- Retire or archive a character

Character availability is calculated, not manually toggled.

**3. Adventure opportunities**

Players can browse:

- Known map locations
- Rumors
- Adventure hooks
- Open calls to adventure

Each opportunity needs at least:

- Name
- Region
- Nearby departure location
- Public description
- Status
- Estimated session duration

You do not necessarily need a sophisticated interactive map yet. A location list grouped by region could satisfy the MVP.

**4. GM availability**

A GM can publish:

- Available date and time windows
- Regions they are willing or authorized to run
- Maximum session duration
- Optional party-size limits (minimum and maximum)

**5. Create a call to adventure**

A player:

- Selects one of their characters.
- Selects an adventure opportunity.
- Receives valid dates based on:
- Character location
- Character commitments
- Travel feasibility
- GM availability
- GM regional authorization
- Selects a valid time.
- Publishes the call to adventure.

The call records both:

- The player who created it
- The character issuing it in the world

**6. Join an expedition**

Other players can choose a character to join.

The system explains eligibility:

- Available
- Occupied by downtime
- Already committed elsewhere
- Too far away
- Dead, retired, missing, or otherwise inactive

**7. Record the outcome**

After the session:

- A player or GM submits a natural-language expedition report.
- The LLM proposes structured updates.
- A GM reviews and approves them.
- Character locations, commitments, discoveries, opportunities, and wiki entries are updated.
- A player-safe recap is published.

## Out of Scope for Initial Release

- Universal world-building ontology
- Fully autonomous changes by the LLM
- Complex fact-level permissions for individual characters
- Public multi-tenant hosting
- Local or offline LLM support
- Advanced campaign simulation


Alternate, simple MVP
## Initial MVP

The first version will support the complete scheduling and resolution cycle for a West Marches expedition.

1. Administrators configure the campaign, character limit, regions, and GM regional assignments.
2. Players create characters, each with a current location and time-bound commitments.
3. GMs publish the dates, times, and regions in which they are available to run games.
4. Players browse known adventure opportunities and map locations.
5. A player selects an eligible character and an adventure opportunity.
6. The system presents dates when that character is available and an authorized GM can run the adventure.
7. The player selects a date and publishes a call to adventure on behalf of the character.
8. Other players join using characters who are available and in the correct location.
9. After the session, a player or GM submits an expedition report in natural language.
10. The system proposes structured campaign updates for GM review.
11. Approved updates change character locations, commitments, discovered locations, adventure opportunities, and campaign knowledge.

The MVP follows the principle that one real-world day equals one campaign-world day. Downtime, travel, recovery, and other commitments therefore affect character availability on corresponding real-world dates.

