# Application Architecture

Status: Draft  
Last updated: September 14, 2026

## Scope

This document describes the West Wiki application layer. The application owns UI, use cases, domain validation, scheduling, expeditions, authentication/permissions orchestration, and LLM-assisted interaction. It consumes and changes campaign state only through the KB boundary.

The KB event log is the authoritative source of truth for campaign state. The application does not maintain a second authoritative mutable store for characters, locations, campaign state, expeditions, or other campaign assets.

See `doc/adr/001-event-sourced-fact-store.md`.

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

Examples:

- create character -> `CHARACTER_CREATED` event(s);
- edit character -> correction/fact event(s);
- activate character -> `CHARACTER_ACTIVATED` event(s);
- retire character -> retirement event(s);
- travel -> commitment/travel event(s), followed by location-changing event(s) when resolved;
- join expedition -> participation/commitment event(s).

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

Successful scheduling commands result in appropriate expedition/participation/commitment events in the KB rather than application-owned mutable records.

### GM Availability Service

Validates GM availability commands and exposes projected valid scheduling capacity. The authoritative history/state of availability belongs in the KB unless a later ADR explicitly creates an app-owned operational exception.

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

### KB-owned authoritative state

The KB event log is authoritative for campaign world/narrative assets and their histories,
including current state derived from those histories.
[`doc/contract/KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md) is the single source of truth
for which entities this covers - see that document rather than a restated list here.

### Application-owned durable state

`doc/contract/KB-PROJECTIONS.md`'s ownership table also names entities `app-be` owns directly
rather than sourcing from the KB.
[ADR 002](../adr/002-application-owned-identity-and-scheduling-state.md) records why the split
falls where it does: KB ownership earns its keep where retraction and provenance matter
(narrative/world facts); identity and scheduling state don't need that model. Unlike the
transient/operational state below, these records must persist; they are not discardable or
rebuildable from the KB.

A KB-owned entity may reference a user as a plain fact (`Character.ownerUserId` today, and
potentially similar fields on app-owned entities later) without the KB owning, validating, or
modeling the `User` record itself.

### Application-owned transient/operational state

`app-be` may also own transient technical state that is not canonical campaign state, such as:

- authentication/session implementation details (the session token itself, not the `User` it authenticates);
- request correlation IDs;
- short-lived orchestration state;
- caches that can be discarded and rebuilt;
- infrastructure telemetry.

Any durable app-owned state beyond the entities named above must be explicitly justified so that a
second source of truth is not created accidentally.

## Character State Authority

Application workflows enforce two complementary decisions:

> Campaign state changes through actions, not arbitrary edits.

and

> The KB event log is the source of truth; current Character state is a projection.

Thus activation does not update a Character row from `DRAFT` to `ACTIVE`. The application validates the activation command and causes an accepted activation event to enter the KB. The next Character projection reflects the new lifecycle state and location.

## Calendar-Driven Processing

Because one campaign day equals one real-world day, the system needs reliable processing of date-driven state transitions such as scheduled downtime starting and active downtime completing.

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
