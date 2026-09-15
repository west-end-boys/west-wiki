# ADR 003: Fact Model, Veracity, and Hybrid Visibility

**Scope:** System-wide (KB record structure; contract surface; moderation model)
**Status:** Accepted
**Authors:** @benjaminbradley
**Reviewers:** @deastland0423
**Date:** 2026-09-15

---

## Context

[ADR 001](001-event-sourced-fact-store.md) decided that the KB is an append-only event log. It did
not decide what an entry looks like, how the vocabulary of recordable things grows, or how a
viewer-specific projection is resolved out of the log.

Three questions had to be answered together, because each constrains the others:

1. Does every kind of change get its own event verb, or is there a small fixed set of entry kinds
   with a typed payload?
2. When a player claims something about the world, does that claim wait outside the record until a
   GM approves it, or does it enter the record immediately?
3. When a viewer may not see the cause of a change, may they see its effect?

---

## Decision

### Three kinds of entry, not one verb per change

The log has exactly three entry kinds:

- **`EntityCreated`** -- establishes an identifier. Recorded distinctly because creation establishes
  a subject rather than describing one that already exists.
- **`FactAsserted`** -- carries a `factType` plus a payload conforming to that type.
- **`FactRetracted`** -- marks one or more prior entries superseded without asserting a replacement.

Entity-specific verbs (`CharacterRenamed`, `CharacterMoved`) were rejected. They grow the event
machinery every time the world model grows, and un-generalizing them later is harder than
generalizing a registry.

### The fact type carries the rules, and the registry is a deployment artifact

A registered fact type defines its payload shape, how a projection folds it into current state, what
visibility it permits, and what authority is required to assert it. Adding a new kind of fact means
registering a new fact type, not changing the log or the projection engine.

**For the initial release the registry is a deployment artifact.** Every fact type is known to the
codebase and ships with it. There is no runtime definition of new fact types.

Emergent definition -- a GM inventing a new kind of fact, or new entity types appearing, at runtime
-- is deliberately deferred. It is the direction the design is built to allow, not a thing the
initial release does.

### Players may assert directly within their own scope

A player has direct authority over their own characters. Facts a player asserts about a character
they own enter the record directly, with no moderation step.

### Claims about the world are recorded, with a veracity qualifier

A player may also record things about the *world* -- what they saw, what they were told, what they
believe about a location or an NPC. These are not held outside the record awaiting approval. They
enter the log immediately, carrying a **veracity qualifier** that marks them as unverified.

Initial veracity values:

- **`RUMOR`** -- recorded, attributed, not authoritative. Information players have learned and share
  with each other, which may or may not be true.
- **`CANON`** -- asserted or accepted by a GM. Authoritative campaign truth.

This models the campaign accurately: players genuinely do trade information of uncertain
provenance, and a system that discarded it until a GM blessed it would lose the most characteristic
kind of West Marches knowledge. A GM promotes a rumor to canon by asserting a canonical fact that
supersedes it, or contradicts it by asserting something else.

**Veracity is orthogonal to visibility.** Visibility says who may see an entry. Veracity says how
much weight it carries. A rumor may be public; a canonical fact may be GM-only.

### Visibility is hybrid: the effect is visible, the detail may not be

Visibility is a property of the individual recorded entry, constrained by its fact type. The
constraint is not all-or-nothing.

**A viewer who may not see an entry's detail still sees that the entry exists and what it did.**

Worked example. A GM curses a character. The character's description now reads "your body is covered
with feathers." The player logs in and views the character's history. They see:

- that the description changed, and when;
- the new description, because their character's description is something they may read.

They do not see:

- who asserted it, or on what authority;
- the narrative cause -- the curse, the entity that laid it, the GM-only note explaining why.

The effect is public; the provenance and the surrounding detail are redacted.

This resolves the "visible effect, hidden cause" question. It also generalizes the pinning rule
that derived values required: a fact type that contributes to a value which must reconcile across
viewers pins the visibility of its **effect**, so that a player and a GM always compute the same
number for a character's gold. The narrative detail and provenance attached to that same entry
remain independently redactable. There is one rule, with the effect and the detail treated
separately, rather than a general rule plus an exception for derived values.

The consequence accepted here is that the *shape* of the history is not concealed: a player can
tell that something happened to their character on a given date and that they are not being shown
why. That is intended. Concealing the existence of the entry would make the history a lie rather
than a redaction, and would break recomputation of any value the entry contributes to.

### LLM extraction records rumors directly; the human remains the author

An LLM extraction from a player's expedition report enters the log immediately as `RUMOR`. It does
not wait for a human to approve it.

This follows from a deliberate posture: **trust but verify.** Everyone can enter their own updates
to the wiki. Requiring a GM to approve each extracted claim before it is recorded would make the GM
a bottleneck on exactly the activity the system exists to encourage, and this campaign does not
need that much oversight. What makes it safe is not gatekeeping but the record: every entry is
attributed, every change is tracked, and anything wrong can be retracted or superseded without
losing the history of what was claimed.

Authorship is unchanged. The submitting human is the author; the LLM is an interpreter of that
human's submission, and its involvement is noted on the entry. The LLM cannot originate a fact with
no human submission behind it, and it cannot assert `CANON` -- only a GM does that. What it may do
is record its reading of something a human actually wrote, marked as unverified.

The consequence accepted here: an LLM that misreads a report will record a rumor attributed to a
player who did not quite make that claim. Retraction and correction cover it, and the report itself
is retained unchanged, so the misreading is always checkable against its source. The alternative --
holding every extraction for review -- was judged the more expensive error.

---

## Consequences

- Every recorded entry carries: entry kind, subject entity, fact type, payload, author, timestamp,
  visibility, veracity, source, and superseded entry ids.
- Projections resolve two things per entry, not one: whether the viewer sees the effect, and whether
  the viewer sees the detail and provenance.
- The contract must expose "an entry exists here that you cannot fully see" as a first-class
  projected shape, not as an absence. This is a real addition to the projection DTOs.
- `ProposedChange` may have nothing left to do. Neither player world-claims nor LLM extractions are
  held outside the log, so no submission waits for approval. What remains is a GM's view of
  rumor-tagged facts awaiting promotion, which is a query rather than a stored entity. Open question
  below.
- Curation becomes continuous rather than a gate. A GM's job is promoting, contradicting, and
  retracting claims already in the record, not clearing a queue before anything is visible. The UI
  needs to make unverified content legible to readers, since rumors are visible by default.
- The fact-type registry is the artifact the whole model depends on and does not exist yet. It
  blocks KB implementation.

---

## Open Questions

1. **Fact type versioning.** How does a registered fact type evolve once facts of that type exist in
   the log? Upcasting at read time, a migration entry kind, or a versioned envelope. Decide before
   the first fact type stabilises. (Inherited from ADR 001.)
2. **Is `ProposedChange` still an entity at all?** Player world-claims and LLM extractions both
   enter the log directly as `RUMOR`, so nothing is held pending approval any more. What remains is
   a GM's *view* of unverified claims awaiting promotion, which looks like a query over rumor-tagged
   facts rather than a stored entity. `doc/contract/KB-PROJECTIONS.md` still lists it as KB-owned.
   Leaning toward removing it.
3. **Retraction of a fact others depend on.** When a superseded fact was the basis for later facts,
   does retraction cascade, invalidate, or merely recompute?
4. **Veracity beyond two values.** `RUMOR` and `CANON` may prove too coarse -- a GM-corroborated
   player report is neither. Deferred until the report workflow shows whether it matters.

---

## References

- `doc/adr/001-event-sourced-fact-store.md` -- the log this structures
- `doc/adr/003-kb-app-ownership-boundary.md` -- what the KB records facts about
- `doc/kb/REQUIREMENTS.md` -- the requirements this satisfies
