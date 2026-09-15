# API Contract

Status: Draft  
Last updated: August 24, 2026

## Purpose

This document defines the conventions for the HTTP API exposed by `packages/app-be` and its interaction with the event-sourced Knowledge Base (KB).

The KB event log is the source of truth for campaign state. The application backend exposes viewer-safe projections for reads and explicit domain commands for writes.

See `doc/adr/001-event-sourced-fact-store.md`.

## Contract Philosophy

### Read projections; command meaningful state changes

The API uses a hybrid resource/command style.

Reads use conventional resource-oriented HTTP operations and return current projections derived by the KB.

Examples:

```text
GET /campaign
GET /characters
GET /characters/{characterId}
GET /locations
```

Writes use explicit operations on resources.

Examples:

```text
POST /characters
POST /characters/{characterId}/edit
POST /characters/{characterId}/activate
POST /characters/{characterId}/retire
POST /characters/{characterId}/travel
POST /characters/{characterId}/downtime
```

The convention is:

> Use resource-shaped GETs for current projections and `<resource>/<operation>` commands for changes that produce new KB events.

The application API does not expose arbitrary persistence mutation.

### The KB event log is authoritative

The application backend does not own mutable canonical Character, Location, Campaign, Expedition, or similar campaign-state records.

For reads:

1. `app-be` resolves authenticated user and viewer context.
2. `app-be` requests the appropriate projection from the KB.
3. The KB applies redaction and returns only viewer-permitted projected data.
4. `app-be` maps that projection into the HTTP response DTO.

For writes:

1. the caller submits a domain command;
2. `app-be` authenticates and authorizes the caller;
3. `app-be` retrieves current projections needed for validation;
4. `app-be` validates campaign/domain rules;
5. a successful command produces one or more structured event proposals/writes for the KB;
6. the KB appends accepted events rather than mutating prior events;
7. the resulting current state is observed through projections.

Corrections and retractions are events, never in-place changes or deletions.

### Queries and commands are conceptually distinct

Queries ask what is currently true and do not change authoritative state.

Commands express user intent and are validated against authorization, campaign rules, current projected state, and conflicts.

West Wiki does not require a full CQRS framework to preserve this distinction.

### The caller does not control authoritative context

Authenticated identity, campaign membership, permissions, and viewer role are resolved server-side.

A caller must not be able to declare that it is a GM, Administrator, character owner, or other privileged actor merely by supplying fields in a request body.

Ordinary player requests must not directly assign authoritative values such as lifecycle status, current location, commitments, expedition participation, ownership, or derived availability. Those values change only through validated commands that result in KB events, or explicit audited GM/Administrator override commands.

### Player-managed character edits are still events

Even apparently ordinary character edits such as name, description, ability scores, or other `gameData` changes are not mutable PATCH operations against a stored Character row.

The HTTP API may offer an ergonomic command such as:

```text
POST /characters/{characterId}/edit
```

but the backend treats that request as a proposed correction/new fact and records the accepted change through the KB event model.

### The LLM uses the same domain operations as conventional UI

Natural language is an input adapter, not a privileged control plane.

For example:

> Tordek starts crafting armor next Tuesday.

must ultimately resolve to the same structured downtime command that a conventional form submits.

The LLM does not receive unrestricted KB or database write access.

### Domain failures are normal API outcomes

Expected rule failures use stable machine-readable error codes and useful human-readable messages.

Examples include roster-limit reached, commitment conflict, invalid starting location, character not eligible, and downtime allowance exhausted.

Server or KB faults are distinct from expected domain rejection.

### API DTOs are projections, not persistence entities

Contract types are designed for client use cases. They represent current viewer-safe projections and command inputs/results, not raw KB events or database structures.

Raw KB event shapes do not leak through the public application API unless a dedicated history/provenance use case explicitly requires them.

### Knowledge redaction occurs in the KB

Viewer context is part of every relevant KB read. GM-only content must be filtered by the KB before it reaches `app-be` or the frontend.

Client-side filtering is never a security boundary.

## Contract Locations

The application HTTP contract currently lives under `packages/app-be`.

- TypeScript contract types: `packages/app-be/src/index.ts`
- OpenAPI description: `packages/app-be/openapi.yaml`

The KB/app boundary is a separate contract concern. Entity ownership and the shape of the projections the KB provides to `app-be` are documented in [`doc/contract/KB-PROJECTIONS.md`](KB-PROJECTIONS.md).

## Initial Slice

The first slice proves campaign and character management through the event-sourced KB.

It should allow a player to:

1. read the current Campaign projection;
2. list owned Character projections;
3. read a Character projection;
4. create a draft character through a command/event;
5. edit player-managed character data through a command/event;
6. list permitted starting Location projections;
7. activate a draft character through a validated command/event;
8. query date-specific derived availability;
9. retire a character through a validated command/event.

### Initial endpoints

```text
GET  /campaign
GET  /characters
POST /characters
GET  /characters/{characterId}
POST /characters/{characterId}/edit
GET  /locations?startingLocation=true
POST /characters/{characterId}/activate
GET  /characters/{characterId}/availability?date=YYYY-MM-DD
POST /characters/{characterId}/retire
```

`Region` is intentionally not part of this initial contract. A character has a `Location` once active. Region may be introduced when adventure opportunities, geographic Call-to-Adventure eligibility, and GM regional authorization require it.

## Initial Shared Types

The executable app contract should define at least:

- stable IDs for Campaign, User, Character, Location, and Commitment;
- ISO local-date representation;
- Character lifecycle states;
- Campaign, Character, and Location projection DTOs;
- character create/edit command requests;
- activation command request/result;
- retirement command request/result;
- availability result and reason codes;
- standard API/domain error shape.

## Error Semantics

Initial HTTP conventions:

- `200` - successful read or command returning a representation;
- `201` - successful creation command;
- `400` - malformed request or syntactic validation failure;
- `401` - unauthenticated;
- `403` - authenticated but unauthorized;
- `404` - requested resource not visible/found;
- `409` - valid request rejected because current projected state conflicts with the requested command;
- `422` - request is structurally valid but fails other domain validation;
- `500` - unexpected application or KB failure.

Expected command rejection returns a stable `ApiError` body.

## Versioning

No HTTP API version prefix is required for the initial monorepo implementation. Introduce explicit versioning when separately deployed consumers or independent release schedules require compatibility management.
