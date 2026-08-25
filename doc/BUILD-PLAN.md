# Build Plan

Status: Draft  
Last updated: August 24, 2026

This plan defines the initial delivery sequence for West Wiki. Each milestone should produce a demonstrable vertical slice of the campaign workflow rather than isolated infrastructure work.

## Milestone 1: Configure Campaign and Manage Characters

Establish the application foundation needed to represent campaign membership, character ownership, character lifecycle, location, commitments, downtime, and derived availability.

Scope includes:

- campaign settings and game-system configuration;
- users, campaign membership, and overlapping roles;
- character creation and player ownership;
- lifecycle states: `DRAFT`, `ACTIVE`, `MISSING`, `RETIRED`, `DEAD`, `ARCHIVED`;
- configurable active-character roster limit;
- activation from draft into a permitted starting location;
- retirement into persistent world state;
- character current location;
- generic character commitments;
- Shadowdark downtime types and scheduling;
- one-real-day-equals-one-campaign-day behavior;
- prevention of overlapping blocking commitments;
- automatic commitment state transitions;
- derived character availability;
- natural-language interaction for common character-management actions where practical.

End-state demonstration:

> Given a player and one of their characters, the application can answer: "Is this character active, where are they, what are they doing, and are they available on this date?"

## Milestone 2: Publish Opportunities and GM Availability

Make adventure opportunities visible and allow GMs to publish when and where they are available to run them.

Scope includes:

- adventure opportunities, rumors, hooks, threats, and known adventure locations;
- public/player-visible and GM-only opportunity information;
- region and departure-location associations;
- adventure board browsing;
- initial map/region browsing;
- GM availability windows;
- GM regional authorization;
- optional session-duration and party-size constraints;
- natural-language creation and querying of GM availability and opportunities where practical.

End-state demonstration:

> A player can browse available adventure opportunities and the system knows which GMs are willing and authorized to run each region, and when.

## Milestone 3: Schedule and Recruit Expeditions

Connect player characters, adventure opportunities, and GM availability into the core West Marches scheduling loop.

Scope includes:

- selecting the acting character for an adventure request;
- geographic eligibility checks;
- character availability checks for requested dates;
- matching adventure region with GM authorization and availability;
- valid date/time selection;
- creating a Call to Adventure on behalf of a character;
- recording organizer user and organizer character;
- recruitment of additional players through eligible characters;
- party-size constraints;
- conflict checks against downtime and other expeditions;
- expedition participation commitments;
- call/expedition lifecycle and status handling;
- natural-language creation and joining of expeditions where practical.

End-state demonstration:

> A player can choose an adventure, act through an eligible character, find a valid GM time slot, issue a Call to Adventure, and recruit a legal party without creating scheduling conflicts.

## Milestone 4: Process Reports and Update Campaign Knowledge

Close the campaign loop by turning completed expeditions into reviewed, persistent world changes.

Scope includes:

- natural-language expedition reports;
- linking reports to expedition, participants, authors, and locations;
- retaining the original report unchanged;
- LLM extraction of proposed campaign changes;
- application validation of proposed changes;
- GM moderation and approval;
- updates to characters, locations, NPCs, opportunities, and other campaign state;
- visibility and redaction handling through the KB boundary;
- player-safe recaps;
- provenance and history for accepted changes;
- correction and retraction workflows.

End-state demonstration:

> After an expedition, a report can be submitted in natural language, converted into proposed campaign changes, reviewed by a GM, and accepted into persistent campaign knowledge with provenance intact.

## Milestone Relationship

The milestones build on one another:

```text
1. Characters and Availability
          |
          v
2. Opportunities and GM Capacity
          |
          v
3. Expeditions and Recruitment
          |
          v
4. Reports and Living World Updates
```

Together they support the initial product objective:

> Help a player choose an adventure, act through an eligible character, find a valid GM time slot, organize the expedition, and then record the outcome.

## Planning Notes

- Detailed product behavior belongs in `doc/app/REQUIREMENTS.md`.
- Application architecture belongs in `doc/app/ARCHITECTURE.md`.
- Internal application mechanics belong in `doc/app/SPECS.md`.
- Durable decisions belong in the appropriate ADR directory.
- GitHub issues should carry an `area:*` label so work can be routed to app, KB, or contract ownership as defined in `doc/REPO-STRUCTURE.md`.
