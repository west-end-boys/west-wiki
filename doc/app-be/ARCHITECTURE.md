# Application Architecture

Status: Draft  
Last updated: September 15, 2026

## Scope

This document describes the West Wiki application layer. The application owns UI, use cases, domain validation, scheduling, expeditions, authentication/permissions orchestration, and LLM-assisted interaction. It consumes and changes campaign state only through the KB boundary.

The KB event log is the authoritative source of truth for campaign **world** state -- characters, regions, locations, world knowledge, and the history of how any of it changed. The application maintains no second authoritative store for those.

The application *does* own its own coordination and configuration records, held as ordinary current-state rows. See [ADR 002](../adr/002-kb-app-ownership-boundary.md) and the Data Ownership section below.

See [ADR 001](../adr/001-event-sourced-fact-store.md), [ADR 002](../adr/002-kb-app-ownership-boundary.md), and [ADR 003](../adr/003-fact-model-veracity-and-visibility.md).

System-wide boundaries and deployment concerns belong in `doc/ARCHITECTURE.md`; KB internals belong in `doc/kb/ARCHITECTURE.md`.

## Responsibilities

The application layer is responsible for:

- authenticated user and campaign context;
- role/capability checks;
- character lifecycle workflows;
- commitment and availability validation;
- GM availability and regional authorization workflows;
- adventure-opportunity browsing and scheduling;
- Calls to Adventure and expedition participation workflows;
- post-session report intake and moderation workflows;
- natural-language intent interpretation and domain-action orchestration;
- conventional UI for important operations;
- constructing structured KB event proposals/writes after successful domain validation.

The application layer is not the authoritative store for campaign state, facts, provenance, history, or redaction.

## High-Level Components

```text
app-fe
   |
   v
app-be HTTP API
   |
   +-- Authentication & Campaign Membership
   +-- Character Domain Service
   +-- Commitment / Availability Service
   +-- Scheduling / Expedition Service
   +-- GM Availability Service
   +-- LLM Orchestration Service
   +-- Report / Moderation Workflow
   |
   v
KB Contract
   |
   +-- projection reads
   +-- event proposals / accepted writes
   |
   v
Event-Sourced KB
```

The KB is a separate service reached over an API, not an in-process library. `packages/app-be/src/kb/knowledge-base-gateway.ts` is the client-side seam. The boundary therefore has real latency and real failure modes; `KB_UNAVAILABLE` is an expected error condition, not an internal fault.

The KB may internally use materialized projections or caches for performance. Those are KB implementation details and do not change the application contract.

## Read Model

The application reads current state through viewer-safe KB projections.

Typical flow:

```text
HTTP GET
  -> authenticate caller
  -> resolve viewer/campaign context
  -> request projection from KB
  -> KB applies redaction
  -> app-be maps projection to response DTO
```

Examples of projected read models include Campaign, Character, Location, Opportunity, Expedition, and availability-related state.

The application should not reconstruct domain state by reading raw KB events unless a dedicated history/provenance use case explicitly requires event-level data.

## Write Model

Application writes are domain commands, not row mutations.

Typical flow:

```text
HTTP command
  -> authenticate / authorize
  -> fetch current projections needed for validation
  -> validate domain rules
  -> create structured event proposal(s)
  -> submit to KB
  -> KB appends accepted event(s)
  -> return resulting current projection
```

Examples that cross into the KB:

- create character -> entity creation;
- edit character -> fact assertion, or a correction superseding a prior fact;
- activate character -> lifecycle and location fact assertions;
- retire character -> lifecycle fact assertion;
- travel -> an application-owned blocking commitment, an in-transit fact assertion, and a location fact assertion when the period elapses.

Examples that do not:

- publish GM availability, create an adventure opportunity, issue a Call to Adventure, join an expedition. These write application rows. Joining an expedition creates an application-owned participation record and commitment; nothing reaches the KB until the expedition produces a report.

Corrections and retractions never update or delete prior KB events.

## Domain Services

### Character Domain Service

Validates character-related commands against current projections and campaign rules. It does not own a mutable Character record.

Responsibilities include:

- draft creation validation;
- player-managed character edit validation;
- roster-limit validation;
- activation eligibility;
- lifecycle transition validation;
- retirement workflow validation;
- construction of structured KB event proposals.

### Commitment and Availability Service

Evaluates projected commitments and campaign timing rules to determine conflicts and availability.

Responsibilities include:

- downtime scheduling validation;
- no-overlap enforcement;
- downtime allowance rules;
- automatic calendar-driven transition semantics;
- date-specific availability calculations.

If commitment transitions are represented as new events, the service coordinates the domain decision while the KB remains authoritative for the resulting history/state.

### Scheduling and Expedition Service

Matches eligible characters, adventure opportunities, required departure locations, GM availability windows, GM authorization, and party constraints.

Successful scheduling commands write application-owned expedition, participation, and commitment records. The expedition's *outcome* reaches the KB later, as an expedition report and the facts extracted from it.

### GM Availability Service

Validates GM availability commands and exposes valid scheduling capacity. `GMAvailabilityWindow` is an application-owned current-state record; the KB is not involved. The service reads KB-owned `GMRegionAuthorization` to validate that a GM may run the region they are offering.

### LLM Orchestration Service

The LLM is an interpreter, not a privileged data agent.

```text
Natural-language input
    -> intent/entity/date interpretation
    -> structured proposed domain operation
    -> permission checks
    -> projection reads
    -> domain validation
    -> confirmation when consequential
    -> same command path used by conventional UI
```

The LLM never receives unrestricted KB write access.

### Report and Moderation Workflow

Retains/submits reports according to the KB contract, requests structured proposed facts/events from the LLM, validates them, presents them for GM review, and submits accepted proposals to the KB.

## Data Ownership

Settled in the boundary session of 2026-08-25 and recorded as [ADR 002](../adr/002-kb-app-ownership-boundary.md), which is authoritative. Restated here because it determines what this layer may store.

**The mental model:** the KB owns the state of the world and the entities within it. The application is an interface onto that state and the coordination layer for the adventures that generate expedition reports, which are the change records feeding the KB.

### KB-owned world state

The KB event log is authoritative for the campaign world and its history:

- Characters, their game data, lifecycle state, and current location;
- Regions and Locations;
- GM regional authorization;
- expedition reports, as the original human submissions;
- campaign facts and wiki knowledge;
- provenance, veracity, corrections, and retractions.

The application reads these as viewer-resolved projections and changes them by asserting facts. It holds no canonical copy.

### Application-owned coordination and configuration

The application owns these outright, as ordinary mutable rows in its own database:

- `User` -- identity and authentication;
- `CampaignMembership` -- role assignment;
- `Campaign` -- configuration: timezone, roster limits, downtime rules, activation policy;
- `CharacterCommitment` -- scheduling state and blocking periods;
- `AdventureOpportunity` -- adventure board entries;
- `GMAvailabilityWindow` -- published GM capacity;
- `CallToAdventure` -- expedition coordination records;
- `ExpeditionParticipant` -- participation records.

**The application is operation-focused and is not event-sourced.** It persists current state only. There is no requirement to reconstruct what a GM's availability was three weeks ago, no provenance chain on an adventure opportunity, and no redaction machinery over a commitment's history. Ordinary database persistence is the right tool and paying the event-sourcing cost here would buy nothing.

This asymmetry is the reason the ownership split exists. Data whose history matters lives in the KB. Data that only needs to be correct right now lives here.

### Transient technical state

`app-be` also holds state that is not campaign data at all: session implementation details, request correlation ids, short-lived orchestration state, discardable caches, infrastructure telemetry.

### The rule that replaces "justify all durable state"

Earlier revisions of this document required any durable app-owned state to be specially justified, on the grounds that it risked creating a second source of truth. That framing predates the ownership split and is withdrawn. The rule now:

> The application may own durable state freely, provided it is not world state. Anything in the KB-owned list above must not be copied into an application table.

### Redaction and access control

Two mechanisms, and the application is responsible for one of them.

**Redaction** happens only in the KB. It is the resolution of a viewer-specific projection out of a fact history, and it exists to support revisionist history and re-projection. The application never receives KB world knowledge it must hide.

**Access control** is the application's own job for the eight entities it owns. Not returning a `GM_ONLY` adventure opportunity to a player is an authorization check on a query, filtered by the caller's role tier per [ADR 004](adr/004-role-based-permission-tiers.md). It is not redaction and does not involve the KB.

Client-side filtering is not a security boundary in either case.

### Cross-layer references and integrity

Application records reference KB entity identifiers, and KB entities may reference application identifiers -- `Character.ownerUserId`, an expedition report's links to its expedition and participants.

The application guarantees that identifiers it issues are persistent and stable: once issued, never reused and never changed. The KB stores identifiers, not foreign keys. Neither store enforces referential integrity against the other, and a cross-boundary operation spans two stores with no shared transaction; failure semantics are an open question in [ADR 002](../adr/002-kb-app-ownership-boundary.md).

## Character State Authority

Application workflows enforce two complementary decisions:

> Campaign state changes through actions, not arbitrary edits.

and

> The KB event log is the source of truth; current Character state is a projection.

Thus activation does not update a Character row from `DRAFT` to `ACTIVE`. The application validates the activation command and causes an accepted activation event to enter the KB. The next Character projection reflects the new lifecycle state and location.

## Calendar-Driven Processing

Because one campaign day equals one real-world day, the system needs reliable processing of date-driven state transitions such as scheduled downtime starting and active downtime completing.

**Day boundaries are measured in the campaign's configured timezone** (`Campaign.timezone`), not the server's and not the caller's. That timezone decides when a scheduled commitment becomes active, when an active one completes, and which day an availability query concerns.

The exact mechanism may involve app-be jobs, KB projection-time logic, event generation, request-time reconciliation, or a combination. Whatever implementation is chosen, externally observed projections must be correct for the campaign date and historical changes must remain event-backed.

A dedicated ADR should decide which component is responsible for emitting automatic time-based events.

## Security

The application must enforce:

- server-side authorization;
- campaign-membership isolation;
- role/capability checks for protected commands;
- no leakage of GM-only knowledge into player-visible LLM context;
- secure storage of credentials;
- input/upload limits;
- treatment of player-authored content as untrusted data.

The KB must resolve viewer-aware redaction before protected content crosses the boundary into the application.

## Error and Conflict Handling

The application should preserve user intent and explain domain conflicts rather than silently rewriting projected state.

Examples include overlapping commitments, roster-limit conflicts, invalid activation locations, character ineligibility, GM availability changes, party-capacity conflicts, and ambiguous natural-language references.

Failed commands create no authoritative state change unless an explicit failure/audit event is part of the domain design.

## Extensibility

Shadowdark is the first supported game system. Game-specific mechanics should live behind game-system/campaign-specific resolvers while the core application understands generic concepts such as time, commitments, lifecycle, location, ownership, eligibility, scheduling, and domain commands.
