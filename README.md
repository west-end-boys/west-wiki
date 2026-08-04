# Living LLM Wiki

## Mission

Build a private, LLM-assisted campaign management and knowledge system for our West Marches Shadowdark campaign.

A West Marches campaign is player-driven. It is organized around a persistent world map, a changing list of known locations and possible adventures, and a way for players to organize their own expeditions by issuing calls to adventure.

The system should help players discover opportunities, share knowledge, form adventuring parties, and initiate expeditions. It should help GMs maintain a consistent living world, process the consequences of play, and control what information becomes canonical or visible.

Natural language should be a primary interface, allowing players and GMs to search, contribute, organize, and update the campaign without needing to understand the underlying data model.

## Core Principles

- Natural language is a primary interface.
- The LLM interprets and proposes; the application validates and authorizes.
- GMs control canonical world truth.
- Players can contribute without directly overwriting canon.
- Accepted changes retain their source and history.
- Users only see information permitted for their role and viewpoint.
- Conventional interfaces remain available for browsing, review, and correction.
- The initial product serves our private campaign before attempting broader generalization.

## Initial MVP

A player or GM submits an expedition report in plain language. The system extracts proposed campaign updates. A GM reviews and approves those changes. The accepted information updates linked campaign records and produces an appropriate player-facing summary.

## Out of Scope for Initial Release

- Universal world-building ontology
- Fully autonomous changes by the LLM
- Complex fact-level permissions for individual characters
- Public multi-tenant hosting
- Local or offline LLM support
- Advanced campaign simulation
