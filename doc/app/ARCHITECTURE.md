# Application Architecture

Status: Draft  
Last updated: August 24, 2026

## Scope

This document describes the architecture of the West Wiki application layer. The application owns UI, use cases, scheduling, expeditions, character workflows, authentication/permissions orchestration, and LLM-assisted interaction. It consumes campaign knowledge through the shared KB/app contract rather than reaching into KB internals.

System-wide boundaries and deployment concerns belong in `doc/ARCHITECTURE.md`; KB internals belong in `doc/kb/ARCHITECTURE.md`.

## Responsibilities

The application layer is responsible for:

- authenticated user and campaign context;
- role/capability checks;
- character lifecycle workflows;
- character commitments and derived availability;
- GM availability and regional authorization;
- adventure-opportunity browsing and scheduling;
- Calls to Adventure and expedition participation;
- post-session report intake and moderation workflows;
- natural-language intent interpretation and domain-action orchestration;
- conventional UI for all important operations;
- audit metadata for application-owned state changes.

The application layer is not the authoritative store for KB facts, provenance, or redaction rules across the KB boundary.

## High-Level Components

```text
Web Client
    |
Application API
    |
    +-- Authentication & Campaign Membership
    +-- Character Service
    +-- Commitment / Availability Service
    +-- Scheduling / Expedition Service
    +-- GM Availability Service
    +-- LLM Orchestration Service
    +-- Report / Moderation Workflow
    +-- Audit Service
    |
    +-- Shared Contract --> KB Layer
    |
Application Relational Database
    |
LLM Provider
```

## Domain Services

### Character Service

Owns validated lifecycle transitions and character core campaign state. Direct player edits are limited to player-managed character data; authoritative state transitions occur through domain actions.

### Commitment and Availability Service

Owns blocking commitments, downtime scheduling, automatic date-based transitions, conflict detection, and availability calculations for a requested date/date range.

Availability is derived, never persisted as a user-controlled field.

### Scheduling and Expedition Service

Matches:

- eligible characters;
- adventure opportunities;
- required departure locations;
- GM availability windows;
- GM regional authorization;
- expedition party constraints.

It creates Calls to Adventure, participant records, and expedition commitments through validated workflows.

### GM Availability Service

Stores GM availability windows and any app-owned regional/session constraints, then exposes valid scheduling capacity to the expedition service.

### LLM Orchestration Service

The LLM is an interpreter, not a privileged database agent. The orchestration flow is:

```text
Natural-language input
    -> intent/entity/date interpretation
    -> structured proposed domain operation
    -> permission checks
    -> entity resolution
    -> domain validation
    -> confirmation when consequential
    -> application operation
```

The LLM never receives unrestricted database-write access.

### Report and Moderation Workflow

Stores the original report, requests structured proposed changes from the LLM, validates those proposals, presents them to a GM, and sends accepted canonical updates through the shared KB/app contract.

## Data Ownership

Application-owned state includes operational records such as:

- campaign membership and app permissions;
- characters and player-editable game data;
- lifecycle state;
- current location references used by scheduling;
- commitments;
- GM availability windows;
- Calls to Adventure;
- expedition participation;
- app-side moderation workflow state;
- audit records for app operations.

Knowledge-base-owned state includes facts, events, provenance, redaction, and knowledge visibility as defined by the shared contract and KB documentation.

When a concept spans both sides, the shared contract is authoritative for the interface between them.

## Character State Authority

Application workflows enforce the principle from ADR 001:

> Campaign state changes through actions, not arbitrary edits.

Examples:

- travel action -> travel commitment -> location update;
- activation request -> validation -> `DRAFT` to `ACTIVE`;
- retirement request -> lifecycle change + world-person linkage workflow;
- join expedition -> participation record + blocking commitment.

GM/Admin direct corrections are exceptional overrides and should be auditable.

## Calendar-Driven Processing

Because one campaign day equals one real-world day, the application needs reliable processing of date-based transitions such as:

- `SCHEDULED` downtime becoming `ACTIVE` on its start date;
- `ACTIVE` downtime becoming `COMPLETED` after its end date;
- resulting availability changes;
- activity-specific completion hooks.

Implementation may use scheduled jobs, request-time reconciliation, or both, but externally observed state must be correct for the current campaign date even if a background job was delayed.

## Security

The application must enforce:

- server-side authorization;
- campaign-membership isolation;
- role/capability checks for every protected operation;
- no leakage of GM-only knowledge into player-visible LLM context;
- secure storage of LLM/API credentials;
- input and upload limits;
- audit logging for important state changes;
- treatment of player-authored documents as untrusted data rather than instructions.

Redaction across the KB boundary must happen before protected content reaches the app client.

## Error and Conflict Handling

The application should preserve user intent and explain conflicts rather than silently rewriting state. Examples include:

- attempted overlapping commitments;
- character becoming ineligible after joining an expedition;
- GM availability being removed;
- opportunity region changing;
- two players competing for the last party slot;
- ambiguous natural-language references;
- exceptional lifecycle overrides.

Where safe, failed operations should be retryable after the conflict is resolved.

## Extensibility

Shadowdark is the first supported game system, but game-specific mechanics should live behind game-system/campaign-specific resolvers where possible.

The core application engine should understand generic concepts such as:

- time;
- commitments;
- lifecycle;
- location;
- ownership;
- eligibility;
- scheduling;
- domain-action state transitions.

Game-system adapters may determine details such as travel duration, carousing outcomes, crafting rules, recovery effects, or character-sheet validation.