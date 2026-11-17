# Knowledge Base Requirements

Status: Draft  
Last updated: November 17, 2026

## Purpose

The knowledge base (KB) is the system of record for the persistent entities of the campaign world and for every change those entities undergo. It records what is claimed, who claimed it, when, and on whose authority. It resolves what a viewer in a given role is permitted to see. It presents a derived current-state view of each entity to the application layer.

The KB does not schedule play, validate gameplay rules, or drive workflows. Those belong to the application layer. See [`doc/app-be/REQUIREMENTS.md`](../app-be/REQUIREMENTS.md).

The KB is implemented as an event-sourced fact store. See [ADR 001](../adr/001-event-sourced-fact-store.md).

The KB runs as a service exposing an API that `app-be` calls. It is not an in-process library of the application. Both sit inside a single trust boundary: the KB accepts the actor context the application supplies rather than independently re-establishing identity. See [ADR 003](../adr/003-kb-app-ownership-boundary.md).

## Scope and Boundary

### The KB owns

- The persistent identity of campaign entities, beginning with Characters and Locations.
- The complete, append-only record of changes to those entities.
- Provenance for every recorded change: author, source, and timestamp.
- Visibility resolution, deciding what content a viewer in a given role may receive.
- Current-state and derived values computed from the record.

### The application layer owns

- Users, campaign membership, and role assignment.
- Character lifecycle for play purposes, commitments, downtime, and derived availability.
- Scheduling, GM capacity, Calls to Adventure, and expeditions.
- Natural-language intent interpretation and domain workflow validation.

### The two keep separate records

The application maintains its own operational records that reference KB entity identifiers. An application character record and a KB character entity are not the same record and do not share a shape. The application holds what it needs in order to schedule; the KB holds what is true about the world.

[`doc/app-be/SPECS.md`](../app-be/SPECS.md) describes the shape the application expects to consume. It is the consumer-side statement of the projection surface and serves as an input to the normative boundary specification in [`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md). It is not itself the contract. See [`doc/REPO-STRUCTURE.md`](../REPO-STRUCTURE.md) for why the wire contract does not live in either application's specifications.

## Goals

- Preserve a complete and permanent record of every claim made about the campaign world.
- Make every current value traceable to the change that produced it.
- Support correction and retraction without destroying the record of what was previously believed.
- Resolve visibility inside the KB so that the application never receives content it must hide.
- Present current state to the application in a stable, derived form that hides the KB's internal shape.
- Recompute derived values from the corrected record rather than from a last-write-wins snapshot.
- Allow the fact vocabulary to grow without changing the storage or projection machinery.

## Out of Scope for the Initial Release

Not priorities for the first release. Several are directions the design deliberately leaves open rather than things ruled out permanently; where that is the case it is noted.

- **Runtime-defined fact types and entity types.** The fact-type registry is a deployment artifact for the initial release -- every fact type is known to the codebase. Emergent definition of new fact and entity types at runtime, and the ontology-as-configuration model that would follow from it, is the direction this design is built to allow. See [ADR 004](../adr/004-fact-model-veracity-and-visibility.md).
- **A universal world-building ontology.** The generic case is a longer-term ambition, not an initial deliverable.
- **Retraction at sub-sentence or implied-fact granularity.** The event model supports it; the curation UI for selecting individual implied facts does not exist. Revisit once the curation workflow exists.
- **Hierarchical and multi-subject facts.** The initial release supports facts about a single subject entity.
- **LLM-asserted canon.** The LLM is never an authorized author and cannot assert `CANON`; this is not expected to change. Its extractions are recorded as `RUMOR` under the submitting human's authorship -- see Authority Requirements.
- **Natural-language interpretation**, which belongs to the application layer.
- **Scheduling, availability calculation, or any gameplay rule enforcement**, which belong to the application layer.
- **Public multi-tenant hosting.**
- **Local or offline model support.**

## Core Principles

### The record is the truth; current state is derived

Every accepted change is recorded as a new entry in an append-only log. No entry is ever modified or deleted. Character sheets, location pages, campaign history, and every other readable view are projections computed from that log, and must be rebuildable from it.

### Facts are typed, and the type carries the rules

A recorded change identifies the kind of fact it asserts. The fact type determines the shape of its payload, how the projection folds it into current state, what visibility it permits, and what authority is required to assert it. Adding a new kind of fact means registering a new fact type, not extending the event machinery.

For the initial release the registry is a deployment artifact: all fact types are known to the codebase and ship with it. See [ADR 004](../adr/004-fact-model-veracity-and-visibility.md).

### Recorded claims carry a veracity qualifier

Not everything recorded is authoritative. A claim enters the log with a veracity qualifier saying how much weight it carries: `CANON` for something a GM asserted or accepted, `RUMOR` for something players learned and shared that has no authoritative source.

Rumors are recorded, not withheld. A player's claim about the world enters the log immediately and is attributed; a GM promotes it by asserting canon that supersedes it, or contradicts it by asserting something else. Players trading information of uncertain provenance is the characteristic form of West Marches knowledge, and a system that discarded it until blessed would lose it.

Veracity is orthogonal to visibility. Visibility says who may see an entry; veracity says how much it can be relied on. A rumor may be public; a canonical fact may be GM-only.

### Visibility is per entry, and the effect and the detail are resolved separately

Visibility is a property of the individual recorded change, not of the entity as a whole. A single character may simultaneously carry public content and GM-only content.

For a given viewer, each entry resolves to one of three states:

- **Fully visible** -- the viewer sees the entry, what it changed, its detail, and its provenance.
- **Effect visible, detail redacted** -- the viewer sees that the entry exists, when, and what it changed, but not who asserted it, on what authority, or the narrative behind it. A GM curses a character and its description now reads "your body is covered with feathers": the player sees that the description changed and what it now says, but not the GM-only note explaining the curse.
- **Hidden** -- the viewer sees nothing of it, in current state or in history. A GM records that a character is cursed and the curse is meant to stay secret: the player's projection shows no trace of it.

An entry therefore carries two visibility levels: **effect visibility**, saying who may see that it exists and what it changed, and **detail visibility**, saying who may also see its detail and provenance. Detail visibility is never wider than effect visibility.

The fact type constrains both. A fact type contributing to a value that must reconcile across viewers pins its effect visibility to every viewer who can see the subject, so a player and a GM always compute the same total for a character's gold. Such an entry may have its detail redacted but cannot be hidden.

A hidden entry is absent from that viewer's history as well as from current state. History stays truthful because it is a correct projection of what the viewer may see, not because it is complete for every viewer.

See [ADR 004](../adr/004-fact-model-veracity-and-visibility.md) and its 2026-11-17 amendment.

### The application directs; the KB records

The KB does not decide that a character has moved, become unavailable, or spent gold. The application owns business logic -- including the computation of travel duration and downtime -- and resolves those outcomes through its own validated workflows, then asserts the result to the KB. The KB validates that the assertion is well-formed, authorized, and consistent with the fact type, and records it.

The KB never computes availability. It records the location and status changes the application pushes to it.

### Provenance is not optional

Every projected value must be traceable to the recorded change that produced it, and through it to the author and the source.

## Entity and Fact Requirements

- The KB holds entities. An entity has a stable identifier, a type, and a history. It has no directly editable fields.
- All change to an entity occurs by recording a fact about it.
- A fact identifies its subject entity, its fact type, a payload conforming to that fact type, and a veracity qualifier.
- A player holds direct authority over entities they own. Facts a player asserts about their own character enter the record without moderation.
- Fact types are registered rather than hard-coded into projection logic. The registry defines, for each type, the payload shape, the permitted visibility, and how the projection incorporates it.
- Facts are hierarchical and relational in the longer term. The initial release supports facts about a single subject entity only.
- Entity creation is recorded distinctly from assertions about an existing entity, because creation establishes the identifier rather than describing a subject that already exists.

## Recording Requirements

Every recorded change must carry enough information to answer, without consulting any other system:

- what kind of fact is being asserted, and about which entity;
- the asserted content;
- who asserted it;
- when it was recorded;
- its effect visibility -- who may see that it exists and what it changed -- and its detail visibility -- who may also see its detail and provenance;
- its veracity -- `CANON` or `RUMOR`;
- what produced it -- direct GM action, player submission, expedition report, or application workflow;
- which prior entries, if any, it supersedes.

Records are never modified after being written.

## Correction and Retraction Requirements

- A correction is a new recorded fact that supersedes an earlier one. The earlier fact remains in the record and remains visible as history.
- A retraction is a recorded entry that marks one or more prior entries as superseded without asserting a replacement.
- Projections skip superseded entries when computing current state. Retracting a correction restores the value the prior fact established.
- Retraction never removes anything from the record.
- Retraction must be authorized. A retraction is subject to the same authority rules as the assertion it supersedes.
- History is visible to every viewer as a projection of the entries that viewer may see. An entry whose effect is visible appears in history with its effect, even when its detail and provenance are redacted. A hidden entry does not appear.

## Visibility and Redaction Requirements

- Initial visibility levels are `PUBLIC`, `CAMPAIGN`, and `GM_ONLY`, matching the application's levels.
- Viewer roles are the tiers defined in [ADR 004 (app)](../app-be/adr/004-role-based-permission-tiers.md): `ANONYMOUS` < `PLAYER` < `GM` < `ADMINISTRATOR`, each including everything below it. An Administrator therefore sees everything a GM sees.
- Viewer role is a parameter of every read. There is no unfiltered read that the application then filters.
- Redaction is the KB's mechanism for world knowledge. It is not the application's mechanism for its own current-state records; the application authorizes queries against those by role tier. See [ADR 003](../adr/003-kb-app-ownership-boundary.md).
- Redaction is resolved inside the KB. Content the viewer may not see never crosses the boundary. Client-side filtering is a data leak and is out of scope by design.
- A projection for a given viewer is computed from the subset of the record that viewer may see. Two viewers with different roles may legitimately see different current states for the same entity.
- Each entry carries an effect visibility and a detail visibility, as described in Core Principles. Detail visibility is never wider than effect visibility.
- Fact types that back a value required to reconcile across viewers pin their effect visibility and cannot carry hidden entries.

## Projection Requirements

- The KB exposes projections. It does not expose the raw record across the contract boundary.
- A projection is deterministic: the same record and the same viewer role always produce the same result.
- Projections are rebuildable from the record in full. No projection may hold state that cannot be recomputed.
- When an entry is superseded, every projection and derived value affected by it must recompute from the corrected sequence rather than being patched in place.
- Projections expose the provenance and veracity of each value they present.
- A projection distinguishes three states for an entry: fully visible, effect visible with detail and provenance redacted, and hidden. The middle state is an explicit shape, not an omission. A hidden entry is omitted entirely.
- Projection storage and caching are internal concerns and must not appear in the contract.

## Authority Requirements

- A GM may assert facts directly, as `CANON`, within the regions they are authorized for.
- The application may assert facts on behalf of its own validated workflows, identified as such in the record.
- A player may assert facts directly about entities they own -- their own characters.
- A player may record claims about the world directly; those enter the record as `RUMOR`.
- The KB checks domain authority, not identity. It accepts the application's statement of who the caller is and what tier they hold, and decides whether that caller may assert this fact type about this subject.
- Canonical world state is established only by a GM asserting `CANON` -- directly, or by promoting a rumor. Curation (promoting, contradicting, retracting) is an application workflow; the KB records each resulting assertion with its author. No GM approval is required for a player's assertions within their own scope.
- The LLM is never an authorized author, but it does not require a separate approval step. An LLM extraction from a human submission is recorded as `RUMOR` under the submitting human's authorship, with the LLM's involvement noted. The LLM cannot originate a fact with no human submission behind it, and cannot assert `CANON`.

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
- The name pins the visibility of its effect: every viewer sees the same current name. Its provenance may still be redacted.
- The note permits per-event visibility across all three levels, including hidden: a GM-only note leaves no trace in a player projection.
- All facts in this increment are `CANON`; the rumor path is exercised in a later increment.
- A current-state character projection resolved for a viewer role.
- Provenance exposed on every projected value.

Out of scope for this increment: locations, numeric or derived values, relationships between entities, the curation workflow, and any application integration.

End-state demonstration:

> A character can be created, renamed, and annotated with a GM-only note. The rename can be retracted, after which the projection shows the original name while the record still shows both. A GM projection and a player projection of the same character differ correctly, and every projected value can be traced to the entry that asserted it.

## Subsequent Increments

**Character gold.** Introduces a derived numeric value accumulated across a sequence of facts. This is the increment that tests recomputation from a corrected sequence, and the first application of pinned visibility to a value that must reconcile across viewers.

**Locations.** Introduces a second entity type, parent and child relationships between entities, and the application-directed movement sequence described above.

## Open Questions

1. **Fact type versioning.** How does a registered fact type evolve once facts of that type exist in the record? This is ADR 001's first open question, narrowed to the registry.
2. **Retraction of a fact that others depend on.** When a superseded fact was the basis for later facts, does retraction cascade, invalidate, or merely recompute?
3. **Is `ProposedChange` still a KB entity** now that player world-claims enter the log as rumors, or does the GM review queue become an application-side view? See [`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md) Open Item 1.
4. **Veracity beyond two values.** `RUMOR` and `CANON` may prove too coarse -- a GM-corroborated player report is neither.
5. **Cross-boundary failure semantics.** An application write plus a KB assertion spans two stores with no shared transaction. See [ADR 003](../adr/003-kb-app-ownership-boundary.md) Open Question 1.
6. **Hidden entries with observable effects.** A hidden entry may change something the viewer can otherwise observe -- a secret curse that lowers a stat the player reads. Either that fact type pins its effect, and the curse cannot be hidden, or the player sees a value they cannot reconcile with the history they are shown. Which fact types may carry hidden entries, and what the viewer sees of a value a hidden entry contributes to, needs a rule before the first such fact type is registered.

## Resolved Questions

Settled 2026-09-15 unless dated otherwise; recorded so they are not re-opened.

- **Visible effect, hidden cause** -- resolved by the visibility rule above. The effect is visible; the detail and provenance may be withheld.
- **Hidden entries** -- settled 2026-11-17. An entry may be hidden from a viewer entirely, effect included, unless its fact type pins its effect. See [ADR 004](../adr/004-fact-model-veracity-and-visibility.md) Amendments.
- **Who registers fact types, and when** -- the registry is a deployment artifact for the initial release. Runtime definition is deferred, not rejected.
- **Availability in the KB** -- the application computes availability and pushes the resulting location and status changes to the KB. The KB records them and never computes availability itself. This does not conflict with [ADR 003 (app)](../app-be/adr/003-downtime-commitments-and-availability.md): availability remains derived, and the KB holds a record of what was asserted rather than a second authority for computing it.
- **Pending facts** -- player world-claims enter the record immediately as `RUMOR` rather than waiting outside it.
- **LLM extractions** -- an extraction from a player's report is recorded directly as `RUMOR`, with no human approval step. The posture is trust but verify: everyone may contribute, and the tracked history plus retraction is the safety net rather than pre-moderation. The submitting human remains the author; the LLM is an interpreter whose involvement is noted, and it can never assert `CANON`. See [ADR 004](../adr/004-fact-model-veracity-and-visibility.md).
