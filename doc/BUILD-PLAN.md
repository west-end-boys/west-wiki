# Build Plan

Status: Draft -- iterated as work proceeds  
Last updated: September 15, 2026

This plan defines the initial delivery sequence for West Wiki.

## Two tracks

The two layers build on independent milestone tracks:

- **A1-A4, the application track.** Each milestone produces a demonstrable vertical slice of the campaign workflow. The application track is owned by @deastland0423 and carries the `area:app-be` / `area:app-fe` labels.
- **K1-K3, the KB track.** Each milestone establishes fact-store machinery on the smallest surface that proves it. Owned by @benjaminbradley, labelled `area:kb`.

The tracks run in parallel. The application track develops against a gateway interface standing in for the KB (`packages/app-be/src/kb/knowledge-base-gateway.ts`, currently backed by an in-memory implementation), so it is not blocked waiting on KB milestones.

**Integration may happen anywhere along the way, or after A3, depending on how the two tracks go.** It is not scheduled here. Replacing the in-memory gateway with a real KB service call is the integration step, and the shared fixtures in the contract package are what make it verifiable from both sides.

Milestone numbering changed on 2026-09-15. The four application milestones were previously numbered 1-4 with all KB work implicitly folded into what is now A4; GitHub milestones should be renamed to match.

---

# Application Track

## Milestone A1: Configure Campaign and Manage Characters

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

## Milestone A2: Publish Opportunities and GM Availability

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

## Milestone A3: Schedule and Recruit Expeditions

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

## Milestone A4: Process Reports and Update Campaign Knowledge

Close the campaign loop by turning completed expeditions into reviewed, persistent world changes.

Scope includes:

- natural-language expedition reports;
- linking reports to expedition, participants, authors, and locations;
- retaining the original report unchanged;
- LLM extraction of structured changes, recorded as `RUMOR` under the submitting human's authorship;
- application validation of extracted changes;
- GM curation: promoting a rumor to canon, contradicting it, or retracting it;
- surfacing veracity to readers, so unverified content is legible as such;
- updates to characters, locations, NPCs, opportunities, and other campaign state;
- visibility and redaction handling through the KB boundary;
- player-safe recaps;
- provenance and history for accepted changes;
- correction and retraction workflows.

End-state demonstration:

> After an expedition, a report can be submitted in natural language, converted into recorded claims that appear immediately as unverified, and later promoted to canon by a GM -- with provenance and history intact throughout.

---

# Knowledge Base Track

## Milestone K1: Establish the Fact Store

Prove the event-sourced machinery end to end on the smallest possible surface, per the thin slice in [`doc/kb/REQUIREMENTS.md`](kb/REQUIREMENTS.md).

Scope includes:

- the fact-type registry as a deployment artifact -- payload shape, permitted visibility, required authority, and projection folding per type;
- the three entry kinds: entity creation, fact assertion, fact retraction;
- one entity type, Character, and two fact types: name (pinned effect visibility) and a free-text note (per-event visibility);
- append-only storage and deterministic projection;
- viewer-resolved projection across the role tiers;
- provenance exposed on every projected value;
- retraction, with the projection recomputing from the corrected sequence.

End-state demonstration:

> A character can be created, renamed, and annotated with a GM-only note. The rename can be retracted, after which the projection shows the original name while the record still shows both. A GM projection and a player projection of the same character differ correctly, and every projected value traces to the entry that asserted it.

## Milestone K2: Derived Values and Hybrid Visibility

Introduce a value accumulated across a sequence of facts, and the visibility rule that keeps it consistent between viewers.

Scope includes:

- character gold as a derived numeric value;
- pinned effect visibility, so a player and a GM compute the same total;
- redacted detail and provenance on an entry whose effect is visible -- the three-state projected value;
- recomputation from a corrected sequence after retraction of a contributing fact;
- the veracity qualifier: `CANON` and `RUMOR`, and direct player assertion within their own scope.

End-state demonstration:

> A GM-only event changes a player-visible value. The player sees the entry, the date, and the new total, and cannot see who caused it or why. A GM retracts an earlier contributing fact and both viewers' totals recompute correctly.

## Milestone K3: A Second Entity Type and the Service Boundary

Scope includes:

- Location and Region as entities, with parent/child relationships;
- application-directed movement: in-transit assertion, then a location assertion when the period elapses;
- the KB exposed as a service API rather than an in-process interface;
- shared fixtures in the contract package covering a GM view and a player view of the same facts, a retraction, and a recomputed derived value.

End-state demonstration:

> The application asserts a character's travel and arrival across the service boundary, and both sides test against the same fixtures.

---

## Milestone Relationship

```text
Application track                      KB track

A1. Characters and Availability        K1. Establish the Fact Store
          |                                      |
          v                                      v
A2. Opportunities and GM Capacity      K2. Derived Values and Hybrid Visibility
          |                                      |
          v                                      v
A3. Expeditions and Recruitment        K3. Second Entity Type and Service Boundary
          |                                      |
          +------------> integration <-----------+
          |
          v
A4. Reports and Living World Updates
```

A4 is the milestone that genuinely requires both tracks: it turns expedition reports into recorded facts with provenance, veracity, and viewer-resolved visibility. Integration should not wait until then, but that is the point at which it must have happened.

Together they support the initial product objective:

> Help a player choose an adventure, act through an eligible character, find a valid GM time slot, organize the expedition, and then record the outcome.

## Planning Notes

- Detailed product behavior belongs in `doc/app-be/REQUIREMENTS.md`.
- Application architecture belongs in `doc/app-be/ARCHITECTURE.md`.
- Internal application mechanics belong in `doc/app-be/SPECS.md`.
- KB-layer requirements belong in `doc/kb/REQUIREMENTS.md`.
- Durable decisions belong in the appropriate ADR directory.
- GitHub issues should carry an `area:*` label so work can be routed to app, KB, or contract ownership as defined in `doc/REPO-STRUCTURE.md`.
