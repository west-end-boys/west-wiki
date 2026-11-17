# ADR 001: Event-Sourced Fact Store

**Scope:** System-wide (KB layer internals; contract surface; application editing model)
**Status:** Accepted
**Authors:** @benjaminbradley
**Reviewers:** @deastland0423
**Date:** 2026-08-05

---

## Context

The KB layer carries several requirements that together place unusual demands on the storage model:

1. **History must always be visible.** Every fact's origin, author, and revision trail should be
   accessible to all viewers (subject to content-level redaction, not structural suppression).

2. **Retraction must be possible at any granularity.** A GM must be able to retract a submission,
   a section, a sentence, or an individual implied fact — without destroying the historical record
   of what was claimed and when.

3. **Derived values depend on the full historical sequence.** Some values (a character's current
   gold, faction standing, or location) are the result of every prior event involving that entity.
   If any earlier event is retracted or corrected, those derived values must recompute from the
   updated sequence, not from a last-write-wins snapshot.

4. **Provenance must be first-class.** Every fact must carry a link back to its source document,
   author, expedition, and any approvals or rejections it has gone through.

5. **The LLM proposes; the application validates.** The KB receives structured proposals from the
   LLM and applies them only after GM review. A proposal that is later found to be wrong must be
   retractable without corrupting the record.

A conventional mutable store (create / update / delete) was considered first. It fails requirements
2 and 3: soft-delete with an audit table recovers history but does not naturally support derived
value recomputation from a corrected sequence, and retraction at fact granularity inside a document
is not modelled at all.

A temporal (bitemporal) relational model was considered next. It handles versioned records well but
still requires custom logic for cross-entity derived values that span a sequence of events, and
retraction within a document remains out-of-model.

---

## Decision

**The KB layer is implemented as an event-sourced fact store. The wiki is a projection of that
store.**

Concretely:

- **Events are append-only.** Every accepted GM action — a new fact, a correction, a retraction —
  is written as a new event record. No event is ever deleted or updated in place.

- **The event log is the source of truth.** Derived values, wiki pages, character state, faction
  summaries, and all other read representations are projections computed from the log. Projections
  are rebuilt from scratch when the log changes.

- **Retraction is an event, not a deletion.** A retraction event marks one or more prior events as
  superseded. Projections skip superseded events when rendering canonical content, but the events
  remain in the log and are visible to viewers with appropriate access.

- **Corrections are new events, not edits.** A correcting fact replaces a prior fact in the
  projection. The original fact remains in the log, showing what was believed and when.

- **Viewer role is a parameter of every projection query.** The KB resolves redaction at
  projection time; the app receives only content the viewer is permitted to see. Client-side
  filtering is explicitly out of scope.

---

## Consequences

### For the KB layer

- The KB exposes projections to the app via the contract, never raw events.
- Projections must be deterministic and rebuildable from the full event log.
- Projection performance may require materialised views or caches; those are KB internal details
  and do not cross the contract boundary.
- The event schema must capture: event type, payload, author, timestamp, source document or
  expedition reference, and the set of prior event IDs it supersedes (if any).

### For the contract surface

- Read operations accept a `viewerRole` parameter on every call. The KB handles the redaction.
- There are no update or delete endpoints. The equivalent is a write endpoint that accepts a
  correcting or retracting event.
- The contract should expose the provenance chain of any projected fact (source event ID, author,
  timestamp) for display in the UI.

### For the application layer

- **Editing is "propose a correction," not "change the field."** Every edit form in the UI
  produces a new event proposal, not a mutation of an existing record. This is a fundamental UI
  design constraint that must be understood before any screens are built.
- History views are cheap: the event log is the history.
- The GM review workflow is event-level: approve or reject a proposed event before it enters the
  log.

### Tradeoffs accepted

- **Operational complexity is higher than a CRUD store.** Projection logic, event schema
  migrations, and cache invalidation require more careful design. This is accepted because the
  requirements for retraction and derived value recomputation cannot be satisfied simply without it.
- **The "one source of truth" is the event log, not the wiki page.** Teams accustomed to editing a
  record in place will need to adjust. This should be communicated early, before any application
  screens are designed.

---

## Open Questions

1. **Event schema versioning.** How will we migrate old events when the schema evolves? Options:
   upcasting at read time, a migration event type, or a versioned envelope. Decide before the
   first schema stabilises.

2. **Projection storage.** Will projections be materialised in a database, computed on-demand, or
   cached in a layer between the event log and the contract? This is a KB-internal decision
   (`doc/kb/adr/`), but the choice affects contract latency guarantees.

3. **Partial retraction UX.** The requirements call for retraction at the granularity of a single
   implied fact within a sentence. The event model supports this, but the GM review UI for
   selecting individual implied facts is complex. Consider deferring sub-sentence retraction to a
   post-MVP milestone.

---

## Amendments

**2026-09-15.** Two of this ADR's open questions and one of its stated requirements have moved.

- **Requirement 2, retraction at any granularity.** Sub-sentence and implied-fact retraction is now
  explicitly out of scope for the initial release (`doc/kb/REQUIREMENTS.md`). The event model still
  supports it; the review UI is what is deferred. The decision below is unchanged, but note that
  requirement 3 — derived-value recomputation from a corrected sequence — is now doing most of the
  work of ruling out a mutable store.
- **Open question 1, event schema versioning**, is carried forward to
  `doc/adr/004-fact-model-veracity-and-visibility.md` as fact-type versioning, and is still open.
- **Open question 3, partial retraction UX**, is resolved as deferred per the first bullet.

`doc/adr/002-application-owned-identity-and-scheduling-state.md` scopes which entities this store is responsible for, and
`doc/adr/004-fact-model-veracity-and-visibility.md` defines the entry structure this ADR left open.

**2026-11-17.** Two parts of this ADR have been overtaken by
`doc/adr/004-fact-model-veracity-and-visibility.md`.

- **Requirement 5 and the event-level GM review it implies.** No longer holds. A player's
  assertions about their own characters, a player's claims about the world (as `RUMOR`), and LLM
  extractions from a human's submission (as `RUMOR`, under that human's authorship) all enter the
  log without GM approval. A GM curates continuously -- promoting a rumor by asserting canon,
  contradicting it, or retracting it -- rather than approving entries before they are recorded. The
  consequence "The GM review workflow is event-level: approve or reject a proposed event before it
  enters the log" is withdrawn. The LLM still never asserts `CANON`.
- **Requirement 1, history always visible.** Narrowed by ADR 004's 2026-11-17 amendment: an entry
  may be hidden from a viewer entirely, in which case it does not appear in that viewer's history.
  Content-level redaction remains the mechanism for everything short of that.

The decision itself -- an event-sourced fact store with the wiki as a projection -- is unchanged.

## References

- `doc/REPO-STRUCTURE.md` — contract boundary, redaction policy, ADR scope rules
- `doc/adr/002-application-owned-identity-and-scheduling-state.md` — entity ownership, trust model, KB as a service
- `doc/adr/004-fact-model-veracity-and-visibility.md` — entry kinds, registry, veracity, visibility
- `doc/kb/REQUIREMENTS.md` — KB-layer requirements
- `doc/contract/KB-PROJECTIONS.md` — normative KB/app boundary: entity ownership and projection shapes
- Google Doc: "Living LLM Wiki" — original requirements including retraction, provenance, derived
  values
