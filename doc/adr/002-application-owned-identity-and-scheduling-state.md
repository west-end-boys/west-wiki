# ADR 002: Application-Owned Identity and Scheduling State

**Scope:** System-wide (KB/app boundary; contract surface)
**Status:** Accepted
**Authors:** @deastland0423
**Reviewers:** @benjaminbradley
**Date:** 2026-09-14

---

## Context

`doc/adr/001-event-sourced-fact-store.md` established the KB as the authoritative, event-sourced
store for campaign assets. At the time of this decision, `doc/app-be/ARCHITECTURE.md`'s Data
Ownership section and `doc/contract/API.md` both assumed `Campaign` (and, by omission, everything
else) was a KB concern.

`doc/contract/KB-PROJECTIONS.md` already carried a full ownership table splitting entities between
the KB and the application - see that document, which is the single source of truth for the split.

That document also flagged a conflict this ADR resolves: `doc/contract/API.md` stated that
`app-be` "does not own mutable canonical Character, Location, Campaign, Expedition, or similar
campaign-state records," which contradicted placing `Campaign` (and everything below it) on the
application side.

Separately, `doc/app-be/adr/004-role-based-permission-tiers.md` and
`doc/app-be/adr/005-email-and-password-authentication.md` assume `User` and `CampaignMembership` exist
as application concepts for login and role assignment - neither is modeled in the KB today.

This ADR ratifies `KB-PROJECTIONS.md`'s ownership table as the decision, resolves its flagged
conflict with `API.md`, and records the reasoning so it doesn't need re-deriving later. Because it
changes what crosses the KB/app boundary, it belongs in `doc/adr/` per `doc/REPO-STRUCTURE.md`'s own
rule: a decision belongs here "if reversing it would require changes on both sides of the
boundary."

---

## Decision

### The KB owns world/narrative facts; the application owns identity and scheduling

`doc/contract/KB-PROJECTIONS.md`'s ownership table is the ratified split. The dividing line: KB
ownership earns its keep where the event-sourcing model's value - retraction, provenance, "what did
we believe was true and when" - actually matters. That's true for a character's identity, a
location's lore, a GM's region authorization, a submitted report, or a proposed canonical change.
It adds little for scheduling bookkeeping - a commitment's date range, a published availability
window, a call-to-adventure's status - which behaves like ordinary transactional application state,
not history that needs retracting.

`Region` is KB-owned, as the parent of `Location` and the subject of `GMRegionAuthorization`.
That placement was previously inferred from those references rather than decided; it is confirmed
here.

`KB-PROJECTIONS.md` is the single source of truth for the table itself. This ADR does not
duplicate it - it records why the split exists and resolves the one place it used to conflict with
another document.

### The KB stores references to app-owned entities as opaque facts, not owned relations

`KB-PROJECTIONS.md` states the rule: application records reference KB entity identifiers, and KB
entities may reference application identifiers where the domain requires it - `Character.ownerUserId`,
and `ExpeditionReport`'s links to its expedition and participants. Both directions are permitted.
The KB does not own, validate, or model the `User` record a `userId` reference points at;
referential integrity for these ids is an application concern.

---

## Consequences

- `doc/app-be/ARCHITECTURE.md`'s Data Ownership section is corrected to match this split rather than
  independently re-deriving it.
- `doc/contract/API.md`'s "does not own mutable canonical Character, Location, Campaign,
  Expedition" sentence is corrected to point at `KB-PROJECTIONS.md` instead of enumerating entities
  inline, so the two documents can't drift apart again.
- `KnowledgeBaseGateway.getCampaign()` in `packages/app-be/src/kb/knowledge-base-gateway.ts` no
  longer belongs on that interface - `Campaign` needs its own app-owned store. This is a real
  refactor of working, tested code (`CharacterService.activateCharacter` calls it today), and
  should be sequenced as its own task.
- None of `User`/`Campaign`/`CampaignMembership`/`CharacterCommitment`/`AdventureOpportunity`/
  `GMAvailabilityWindow`/`CallToAdventure`/`ExpeditionParticipant` inherit the KB's event-sourced
  history/retraction/provenance model for free. Any audit trail these need (e.g. "who created this
  account, and when") must be built by the application itself.
- This is a joint-boundary decision, confirmed by @benjaminbradley on 2026-09-15 alongside
  `003-kb-app-ownership-boundary.md`, which settles the same ownership split on the same terms.

---

## Open Questions

Carried forward from `KB-PROJECTIONS.md`'s own Open Items, still unresolved by this ADR:

- The attribute lists in `KB-PROJECTIONS.md` are drafts, not yet re-validated against the KB's fact
  model.

Region ownership and whether the KB records application-computed availability were both open when
this ADR was drafted. Both were settled on 2026-09-15 and are recorded under `KB-PROJECTIONS.md`'s
Resolved section.

---

## Guiding Principle

**The KB is the system of record for the campaign world; the application is the system of record
for who's allowed to touch it, and for when things are scheduled to happen.** Event-sourcing pays
for itself where retraction and provenance matter; it isn't a default applied to every entity.

---

## References

- `doc/adr/001-event-sourced-fact-store.md` - the KB ownership model this carves explicit
  exceptions out of
- `doc/contract/KB-PROJECTIONS.md` - the authoritative ownership table this ADR ratifies, and the
  flagged conflict it resolves
- `doc/contract/API.md` - corrected alongside this ADR
- `doc/app-be/adr/004-role-based-permission-tiers.md`,
  `doc/app-be/adr/005-email-and-password-authentication.md` - the app-scoped decisions this makes
  concrete
- `doc/app-be/ARCHITECTURE.md` - Data Ownership section, updated alongside this ADR
