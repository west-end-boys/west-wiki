# ADR 002: KB/App Ownership Boundary and Trust Model

**Scope:** System-wide (entity ownership; contract surface; deployment shape; trust boundary)
**Status:** Accepted
**Authors:** @deastland0423, @benjaminbradley
**Reviewers:** @benjaminbradley, @deastland0423
**Date:** 2026-09-14; consolidated 2026-11-17

> **Consolidated.** This ADR originally recorded the application side of the ownership split
> (identity and scheduling). The former ADR 003, accepted 2026-09-15, recorded the same split from
> the KB side together with the deployment and trust model. The two were merged here on 2026-11-17
> so the reasoning lives in one place; `003-kb-app-ownership-boundary.md` is now a pointer. Both
> originals remain in git history.

---

## Context

[ADR 001](001-event-sourced-fact-store.md) established that the KB is an event-sourced fact store
and the wiki is a projection of it. It did not say which entities the KB is responsible for.

Without that line drawn, `doc/app-be/ARCHITECTURE.md` and `doc/contract/API.md` had both drifted
toward "the KB owns all campaign state." `API.md` stated that `app-be` "does not own mutable
canonical Character, Location, Campaign, Expedition, or similar campaign-state records." That would
have made the KB responsible for scheduling records -- GM availability windows, calls to adventure,
participation -- that have no history requirement, no provenance requirement, and no redaction
requirement. Carrying those through an event log would have imposed the KB's operational cost on
data that is simply current-state.

Separately, [ADR 004 (app)](../app-be/adr/004-role-based-permission-tiers.md) and
[ADR 005 (app)](../app-be/adr/005-email-and-password-authentication.md) assume `User` and
`CampaignMembership` exist as application concepts for login and role assignment.

The split was worked out in the boundary session of 2026-08-25, recorded as the ownership table in
[`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md), and approved by both owners.

---

## Decision

### The KB owns the state of the world; the app owns identity and coordinates play

**The mental model:** the KB owns what is true about the campaign world and the complete history of
how it came to be true. The application is an interface onto that state and the coordination layer
for the adventures that generate change. Expeditions produce expedition reports; expedition reports
are the change records that feed the KB.

The ownership table in [`KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md) is the ratified split
and the single source of truth for it. This ADR records why the split falls where it does and does
not restate the table.

The dividing line: KB ownership earns its keep where the event-sourcing model's value --
retraction, provenance, "what did we believe was true and when" -- actually matters. That is true
for a character's identity, a location's lore, a GM's region authorization, and a submitted report
and the claims extracted from it. It adds little for scheduling bookkeeping -- a commitment's date
range, a published availability window, a call to adventure's status -- which behaves like ordinary
transactional application state, not history that needs retracting.

Placements that follow from that line and were worth stating explicitly:

- `Region` is KB-owned, as the parent of `Location` and the subject of `GMRegionAuthorization`.
- `Campaign` is app-owned. It is configuration -- timezone, roster limits, downtime rules,
  activation policy -- not world state.
- `CallToAdventure` is app-owned. The expedition is the coordination record; its *outcome* reaches
  the KB as an `ExpeditionReport`.
- `GMRegionAuthorization` is KB-owned because the KB applies it at write time when deciding whether
  a GM may assert facts about a given part of the world. The application reads the same policy when
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
[ADR 004 (app)](../app-be/adr/004-role-based-permission-tiers.md) and
[ADR 005 (app)](../app-be/adr/005-email-and-password-authentication.md)).

What the KB still enforces at write time is *domain* authority, not identity: whether the asserted
role tier is sufficient for the fact type, and whether a GM is authorized for the region the fact
concerns. It checks what the caller is allowed to say, having accepted the caller's word for who
they are.

### Cross-layer references

Application records reference KB entity identifiers. KB entities may also reference application
identifiers where the domain requires it -- `Character.ownerUserId`, `ExpeditionReport`'s links to
its expedition and participants. Both directions are permitted.

The KB stores such a reference as an opaque fact, not an owned relation. It does not own, validate,
or model the `User` record a `userId` points at, stores identifiers rather than foreign keys, and
enforces no referential integrity against the application's database. This is safe because both
layers are inside one trust boundary and the application guarantees that the identifiers it issues
are persistent and stable: once issued, an application identifier is never reused and never
changes. Referential integrity for those identifiers is an application concern.

---

## Consequences

- `doc/app-be/ARCHITECTURE.md`'s Data Ownership section defers to `KB-PROJECTIONS.md`'s table rather
  than restating the split. The app may hold durable operational state without special
  justification, provided it is not world state.
- `doc/contract/API.md`'s statement that `app-be` owns no canonical Campaign or Expedition record is
  corrected to distinguish world state from coordination records, and points at `KB-PROJECTIONS.md`
  instead of enumerating entities inline, so the two documents cannot drift apart again.
- `KnowledgeBaseGateway.getCampaign()` no longer belongs on the KB gateway; `Campaign` needs its own
  app-owned store.
- None of the app-owned entities inherit the KB's history, retraction, or provenance model for
  free. Any audit trail they need -- "who created this account, and when" -- must be built by the
  application itself.
- The app needs its own authorization filtering for the app-owned entities. This is work that the
  earlier "redaction is handled KB-side" framing had obscured.
- A cross-layer operation -- create a blocking commitment *and* assert in-transit to the KB -- spans
  two stores with no shared transaction. Failure semantics for partial completion need a decision;
  see Open Questions.
- Because the KB is a service rather than a library, the boundary has real latency and real failure
  modes. `KB_UNAVAILABLE` exists in the app's error codes for that reason.

---

## Open Questions

1. **Cross-boundary failure semantics.** When the app commits a scheduling record and the subsequent
   KB assertion fails, what reconciles them? Options: outbox with retry, compensating command,
   or accepting eventual repair through a periodic reconciliation pass.
2. **Who serves `Region` before it enters the contract.** `Location.regionId` exists in the KB
   projection while `Region` is deliberately absent from the initial app contract.
3. **The attribute lists in `KB-PROJECTIONS.md` are drafts**, not yet re-validated against the KB's
   fact model.

Region ownership and whether the KB records application-computed availability were both open when
this decision was drafted. Both were settled on 2026-09-15 and are recorded under
`KB-PROJECTIONS.md`'s Resolved section.

---

## Guiding Principle

**The KB is the system of record for the campaign world; the application is the system of record
for who's allowed to touch it, and for when things are scheduled to happen.** Event-sourcing pays
for itself where retraction and provenance matter; it isn't a default applied to every entity.

---

## References

- `doc/adr/001-event-sourced-fact-store.md` -- the event-sourcing decision this scopes
- `doc/adr/004-fact-model-veracity-and-visibility.md` -- what the KB records, and how it is seen
- `doc/contract/KB-PROJECTIONS.md` -- the authoritative ownership table, and the projection shapes
  this ownership produces
- `doc/contract/API.md` -- corrected alongside this decision
- `doc/app-be/adr/004-role-based-permission-tiers.md`,
  `doc/app-be/adr/005-email-and-password-authentication.md` -- the role tiers the KB is handed, and
  the app-scoped identity decisions this makes concrete
- `doc/app-be/ARCHITECTURE.md` -- Data Ownership section, updated alongside this decision
