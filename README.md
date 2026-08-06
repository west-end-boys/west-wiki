# Living LLM Wiki

## Mission

Build a private, LLM-assisted campaign management and knowledge system for our West Marches Shadowdark campaign.

A West Marches campaign is player-driven. It is organized around a persistent world map, a changing list of known locations and possible adventures, and a way for players to organize their own expeditions by issuing calls to adventure.

The system should help players discover opportunities, share knowledge, form adventuring parties, and initiate expeditions. It should help GMs maintain a consistent living world, process the consequences of play, and control what information becomes canonical or visible.

Natural language should be a primary interface, allowing players and GMs to search, contribute, organize, and update the campaign without needing to understand the underlying data model.

## Documentation

See [`doc/REPO-STRUCTURE.md`](doc/REPO-STRUCTURE.md) for the repository layout, the KB/application
boundary, document ownership, and how this project maps onto the autocode workflow. That document is
the map -- start there rather than browsing directories.

MVP scope lives in [`doc/app/REQUIREMENTS.md`](doc/app/REQUIREMENTS.md), not here. Scope changes far
faster than mission does, so the two are kept apart.

Development process lives in `.autocode/`. Task status lives in GitHub issues, not in this repo.

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
- **Traditional interfaces remain available.** Maps, lists, forms, timelines, and wiki pages should support browsing, review, and correction alongside the conversational interface.
