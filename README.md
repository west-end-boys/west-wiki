# Living LLM Wiki

## Mission

Build a private, LLM-assisted campaign management and knowledge system for our West Marches Shadowdark campaign.

A West Marches campaign is player-driven. It is organized around a persistent world map, a changing list of known locations and possible adventures, and a way for players to organize their own expeditions by issuing calls to adventure.

The system should help players discover opportunities, share knowledge, form adventuring parties, and initiate expeditions. It should help GMs maintain a consistent living world, process the consequences of play, and control what information becomes canonical or visible.

Natural language should be a primary interface, allowing players and GMs to search, contribute, organize, and update the campaign without needing to understand the underlying data model.

## Core Principles

- **Player agency drives play**. The system should help players decide where to go, why to go there, and who will join them.
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

A player or GM submits an expedition report in plain language. The system extracts proposed campaign updates. A GM reviews and approves those changes. The accepted information updates linked campaign records and produces an appropriate player-facing summary.

## Out of Scope for Initial Release

- Universal world-building ontology
- Fully autonomous changes by the LLM
- Complex fact-level permissions for individual characters
- Public multi-tenant hosting
- Local or offline LLM support
- Advanced campaign simulation
