# ADR 002: KB/App Ownership Boundary and Trust Model

**Scope:** System-wide (entity ownership; deployment shape; trust boundary)
**Status:** Accepted
**Authors:** @benjaminbradley
**Reviewers:** @deastland0423
**Date:** 2026-09-15

---

## Context

[ADR 001](001-event-sourced-fact-store.md) established that the KB is an event-sourced fact store
and the wiki is a projection of it. It did not say which entities the KB is responsible for.

Without that line drawn, `doc/app-be/ARCHITECTURE.md` and `doc/contract/API.md` had both drifted
toward "the KB owns all campaign state," which would have made the KB responsible for scheduling
records -- GM availability windows, calls to adventure, participation -- that have no history
requirement, no provenance requirement, and no redaction requirement. Carrying those through an
event log would have imposed the KB's operational cost on data that is simply current-state.

The split below was worked out in the boundary session of 2026-08-25 and approved by both owners.

---

## Decision

### The KB owns the state of the world; the app coordinates play

**The mental model:** the KB owns what is true about the campaign world and the complete history of
how it came to be true. The application is an interface onto that state and the coordination layer
for the adventures that generate change. Expeditions produce expedition reports; expedition reports
are the change records that feed the KB.

| Entity | Owner |
|---|---|
| Character | KB |
| Region | KB |
| Location | KB |
| GMRegionAuthorization | KB |
| ExpeditionReport | KB |
| ProposedChange | KB |
| User | app |
| CampaignMembership | app |
| Campaign | app |
| CharacterCommitment | app |
| AdventureOpportunity | app |
| GMAvailabilityWindow | app |
| CallToAdventure | app |
| ExpeditionParticipant | app |

`Region` is KB-owned as the parent of `Location`. `Campaign` is app-owned: it is configuration --
timezone, roster limits, downtime rules, activation policy -- not world state. `CallToAdventure` is
app-owned: the expedition is the coordination record, and its *outcome* reaches the KB as an
`ExpeditionReport`.

`GMRegionAuthorization` is KB-owned because the KB applies it at write time when deciding whether a
GM may assert facts about a given part of the world. The application reads the same policy when
validating GM availability and adventure scheduling.

### The two layers have different persistence requirements

**The KB is event-sourced.** Append-only log, provenance on every entry, correction and retraction
as new entries, viewer-resolved projections.

**The application is not.** The application is operation-focused. It uses ordinary database
persistence and stores current state only. An `AdventureOpportunity` or a `GMAvailabilityWindow` is
a row that gets updated; there is no requirement to reconstruct what a GM's availability was three
weeks ago, and no reason to pay for the machinery that would allow it.

This is the reason the ownership split exists at all. Data whose history matters lives in the KB.
Data that only needs to be correct right now lives in the app.

### Redaction is a KB concern; access control is an app concern

These are different mechanisms and the distinction is load-bearing.

**Redaction** is the KB resolving a viewer-specific projection out of a fact history -- deciding,
per recorded entry, what this viewer may see, and computing current state from only that subset.
It exists to support revisionist history and re-projection. Redaction happens only in the KB.

**Access control** is the application filtering its own current-state rows by the requesting
member's role tier before returning them -- not showing a `GM_ONLY` adventure opportunity to a
player. It is an ordinary authorization check on a query, not a projection.

The rule "the app never receives KB content it must hide" remains absolute for KB-owned world
knowledge. It was never a claim that the app has no authorization responsibilities of its own.
Client-side filtering is not a security boundary in either layer.

### The KB is a service

The KB is a separate service exposing an API that `app-be` calls. It is not an in-process library
of `app-be`. `packages/app-be/src/kb/knowledge-base-gateway.ts` is the client-side seam.

### Both layers sit inside one trust boundary

The KB and `app-be` are the same system, written and deployed by the same people, and there is no
independent authority boundary between them. The KB trusts the actor context `app-be` supplies --
authenticated identity and role tier -- rather than independently re-establishing it. `app-be` is
responsible for authentication, session management, and role resolution (see
[ADR 004](../app-be/adr/004-role-based-permission-tiers.md) and
[ADR 005](../app-be/adr/005-email-and-password-authentication.md)).

What the KB still enforces at write time is *domain* authority, not identity: whether the asserted
role tier is sufficient for the fact type, and whether a GM is authorized for the region the fact
concerns. It checks what the caller is allowed to say, having accepted the caller's word for who
they are.

### Cross-layer references

Application records reference KB entity identifiers. KB entities may also reference application
identifiers where the domain requires it -- `Character.ownerUserId`, `ExpeditionReport`'s links to
its expedition and participants. Both directions are permitted.

This is safe because both layers are inside one trust boundary and the application guarantees that
the identifiers it issues are persistent and stable: an application identifier, once issued, is
never reused and never changes. The KB stores identifiers, not foreign keys, and does not enforce
referential integrity against the application's database.

---

## Consequences

- `doc/app-be/ARCHITECTURE.md`'s "Data Ownership" section is replaced by this table. The app may
  hold durable operational state without special justification, provided it is not world state.
- `doc/contract/API.md`'s statement that `app-be` owns no canonical Campaign or Expedition record is
  wrong as written and is corrected to distinguish world state from coordination records.
- The app needs its own authorization filtering for the eight app-owned entities. This is new work
  that the previous "redaction is handled KB-side" framing had obscured.
- A cross-layer operation -- create a blocking commitment *and* assert in-transit to the KB -- spans
  two stores with no shared transaction. Failure semantics for partial completion need a decision;
  see Open Questions.
- Because the KB is a service rather than a library, the boundary has real latency and real failure
  modes. `KB_UNAVAILABLE` already exists in the app's error codes.

---

## Open Questions

1. **Cross-boundary failure semantics.** When the app commits a scheduling record and the subsequent
   KB assertion fails, what reconciles them? Options: outbox with retry, compensating command,
   or accepting eventual repair through a periodic reconciliation pass.
2. **Who serves `Region` before it enters the contract.** `Location.regionId` exists in the KB
   projection while `Region` is deliberately absent from the initial app contract.

---

## References

- `doc/adr/001-event-sourced-fact-store.md` -- the event-sourcing decision this scopes
- `doc/adr/003-fact-model-veracity-and-visibility.md` -- what the KB records, and how it is seen
- `doc/contract/KB-PROJECTIONS.md` -- the projection shapes this ownership produces
- `doc/app-be/adr/004-role-based-permission-tiers.md` -- the role tiers the KB is handed
