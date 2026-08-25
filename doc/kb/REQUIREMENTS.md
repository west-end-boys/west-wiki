# Knowledge Base Requirements

Status: Draft  
Last updated: August 25, 2026

## Purpose

The knowledge base (KB) is the system of record for the persistent entities of the campaign world and for every change those entities undergo. It records what is claimed, who claimed it, when, and on whose authority. It resolves what a viewer in a given role is permitted to see. It presents a derived current-state view of each entity to the application layer.

The KB does not schedule play, validate gameplay rules, or drive workflows. Those belong to the application layer. See [`doc/app/REQUIREMENTS.md`](../app/REQUIREMENTS.md).

The KB is implemented as an event-sourced fact store. See [ADR 001](../adr/001-event-sourced-fact-store.md).

## Scope and Boundary

### The KB owns

- The persistent identity of campaign entities, beginning with Characters and Locations.
- The complete, append-only record of changes to those entities.
- Provenance for every recorded change: author, source, timestamp, and approval trail.
- Visibility resolution, deciding what content a viewer in a given role may receive.
- Current-state and derived values computed from the record.

### The application layer owns

- Users, campaign membership, and role assignment.
- Character lifecycle for play purposes, commitments, downtime, and derived availability.
- Scheduling, GM capacity, Calls to Adventure, and expeditions.
- Natural-language intent interpretation and domain workflow validation.

### The two keep separate records

The application maintains its own operational records that reference KB entity identifiers. An application character record and a KB character entity are not the same record and do not share a shape. The application holds what it needs in order to schedule; the KB holds what is true about the world.

[`doc/app/SPECS.md`](../app/SPECS.md) describes the shape the application expects to consume. It is the consumer-side statement of the projection surface and serves as an input to the normative boundary specification in `doc/contract/API.md`. It is not itself the contract. See [`doc/REPO-STRUCTURE.md`](../REPO-STRUCTURE.md) for why the wire contract does not live in either application's specifications.

## Goals

- Preserve a complete and permanent record of every claim made about the campaign world.
- Make every current value traceable to the change that produced it.
- Support correction and retraction without destroying the record of what was previously believed.
- Resolve visibility inside the KB so that the application never receives content it must hide.
- Present current state to the application in a stable, derived form that hides the KB's internal shape.
- Recompute derived values from the corrected record rather than from a last-write-wins snapshot.
- Allow the fact vocabulary to grow without changing the storage or projection machinery.

## Non-Goals for the Initial Release

- A universal world-building ontology.
- Retraction at sub-sentence or implied-fact granularity.
- Autonomous acceptance of changes proposed by an LLM.
- Natural-language interpretation, which belongs to the application layer.
- Scheduling, availability calculation, or any gameplay rule enforcement.
- Public multi-tenant hosting.
- Local or offline model support.

## Core Principles

### The record is the truth; current state is derived

Every accepted change is recorded as a new entry in an append-only log. No entry is ever modified or deleted. Character sheets, location pages, campaign history, and every other readable view are projections computed from that log, and must be rebuildable from it.

### Facts are typed, and the type carries the rules

A recorded change identifies the kind of fact it asserts. The fact type determines the shape of its payload, how the projection folds it into current state, and what visibility it permits. Adding a new kind of fact means registering a new fact type, not extending the event machinery.

### Visibility travels with the fact and is constrained by the field

Visibility is a property of the individual recorded change, not of the entity as a whole. A single character may simultaneously carry public facts and GM-only facts.

The fact type constrains which visibilities are legal for facts of that type:

- **Narrative fact types permit per-event visibility.** A curse laid on a character may be recorded as GM-only. A player projection of that character simply does not contain it. This is the intended behavior.
- **Fact types that contribute to a shared derived value pin their visibility.** If some contributions to a character's gold were hidden and others were not, a player and a GM would compute different totals for the same number, with no indication that they disagree. Fact types backing a value that must reconcile across viewers therefore declare a fixed visibility rather than accepting one per event.

### The application directs; the KB records

The KB does not decide that a character has moved, become unavailable, or spent gold. The application resolves those outcomes through its own validated workflows and then asserts the result to the KB. The KB validates that the assertion is well-formed, authorized, and consistent with the fact type, and records it.

### Provenance is not optional

Every projected value must be traceable to the recorded change that produced it, and through it to the author, the source, and any approval.

## Entity and Fact Requirements

- The KB holds entities. An entity has a stable identifier, a type, and a history. It has no directly editable fields.
- All change to an entity occurs by recording a fact about it.
- A fact identifies its subject entity, its fact type, and a payload conforming to that fact type.
- Fact types are registered rather than hard-coded into projection logic. The registry defines, for each type, the payload shape, the permitted visibility, and how the projection incorporates it.
- Facts are hierarchical and relational in the longer term. The initial release supports facts about a single subject entity only.
- Entity creation is recorded distinctly from assertions about an existing entity, because creation establishes the identifier rather than describing a subject that already exists.

## Recording Requirements

Every recorded change must carry enough information to answer, without consulting any other system:

- what kind of fact is being asserted, and about which entity;
- the asserted content;
- who asserted it;
- when it was recorded;
- what it is visible to;
- what produced it -- direct GM action, player submission, expedition report, or application workflow;
- which prior entries, if any, it supersedes.

Records are never modified after being written.

## Correction and Retraction Requirements

- A correction is a new recorded fact that supersedes an earlier one. The earlier fact remains in the record and remains visible as history.
- A retraction is a recorded entry that marks one or more prior entries as superseded without asserting a replacement.
- Projections skip superseded entries when computing current state. Retracting a correction restores the value the prior fact established.
- Retraction never removes anything from the record.
- Retraction must be authorized. A retraction is subject to the same authority rules as the assertion it supersedes.
- History remains visible to all viewers, subject to content-level visibility resolution rather than structural suppression. A viewer who may not see a fact does not see that fact in history either, but the existence of the record is not concealed by the mechanism itself.

## Visibility and Redaction Requirements

- Initial visibility levels are `PUBLIC`, `CAMPAIGN`, and `GM_ONLY`, matching the application's levels.
- Viewer role is a parameter of every read. There is no unfiltered read that the application then filters.
- Redaction is resolved inside the KB. Content the viewer may not see never crosses the boundary. Client-side filtering is a data leak and is out of scope by design.
- A projection for a given viewer is computed from the subset of the record that viewer may see. Two viewers with different roles may legitimately see different current states for the same entity.
- Fact types that back a value required to reconcile across viewers pin their visibility, as described in Core Principles.

## Projection Requirements

- The KB exposes projections. It does not expose the raw record across the contract boundary.
- A projection is deterministic: the same record and the same viewer role always produce the same result.
- Projections are rebuildable from the record in full. No projection may hold state that cannot be recomputed.
- When an entry is superseded, every projection and derived value affected by it must recompute from the corrected sequence rather than being patched in place.
- Projections expose the provenance of each value they present.
- Projection storage and caching are internal concerns and must not appear in the contract.

## Authority Requirements

- A GM may assert facts directly.
- The application may assert facts on behalf of its own validated workflows, identified as such in the record.
- Some player-originated facts may be asserted directly; others require moderation before entering the record.
- Canonical world state changes require authorized acceptance. The moderation workflow itself is owned by the application layer; the KB records the outcome and its approval trail.
- The LLM is never an authorized author. Content originating from an LLM enters the record only through an authorized human or application assertion, and the record notes the LLM's involvement.

## Interaction With the Application Layer

The KB is authoritative for a character's location, but that location changes at the application's direction. A representative sequence:

1. A player requests that a character travel to another location.
2. The application validates the request and creates a blocking travel commitment covering the required period.
3. The application asserts to the KB that the character is in transit and unavailable.
4. The commitment period elapses in real time.
5. The application asserts the character's new location and restored availability to the KB.

The KB records each assertion, and the projection reflects it. The KB does not compute travel duration, does not detect that the period has elapsed, and does not decide availability.

## Initial Thin Slice

The first increment establishes the machinery end to end on the smallest possible surface.

In scope:

- One entity type: Character.
- Three kinds of recorded entry: entity creation, fact assertion, and retraction.
- Two fact types: the character's name, and a free-text note about the character.
- The name is a pinned-visibility fact type. The note permits per-event visibility across all three levels.
- A current-state character projection resolved for a viewer role.
- Provenance exposed on every projected value.

Out of scope for this increment: locations, numeric or derived values, relationships between entities, the moderation workflow, and any application integration.

End-state demonstration:

> A character can be created, renamed, and annotated with a GM-only note. The rename can be retracted, after which the projection shows the original name while the record still shows both. A GM projection and a player projection of the same character differ correctly, and every projected value can be traced to the entry that asserted it.

## Subsequent Increments

**Character gold.** Introduces a derived numeric value accumulated across a sequence of facts. This is the increment that tests recomputation from a corrected sequence, and the first application of pinned visibility to a value that must reconcile across viewers.

**Locations.** Introduces a second entity type, parent and child relationships between entities, and the application-directed movement sequence described above.

## Open Questions

1. **Visible effect, hidden cause.** A GM-only fact may alter a value a player is permitted to see. Does visibility pin for any fact type feeding a player-visible value, or may a projection present an outcome while withholding its cause?
2. **Fact type versioning.** How does a registered fact type evolve once facts of that type exist in the record? This is ADR 001's first open question, narrowed to the registry.
3. **Who registers fact types, and when.** Is the registry a deployment artifact, or may a GM define a new kind of fact at runtime?
4. **Availability in the KB.** Should the KB record application-computed availability at all, or only location and in-transit status? [ADR 003](../app/adr/003-downtime-commitments-and-availability.md) holds that availability is always derived and never stored. Recording it here risks creating a second source of truth for a value the application owns.
5. **Retraction of a fact that others depend on.** When a superseded fact was the basis for later facts, does retraction cascade, invalidate, or merely recompute?
6. **Pending facts.** Does a player submission awaiting moderation enter the record in a pending state, or stay outside it until accepted?
7. **Sub-sentence granularity.** Deferred per ADR 001. Revisit once the moderation workflow exists.
