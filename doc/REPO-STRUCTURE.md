# Repository Structure

Monorepo containing two applications separated by a shared, executable API contract.

This document defines where things live and who owns them. It does not duplicate content from the
documents it lists -- see each document for its own subject matter.

---

## Why a monorepo

Two developers, one API boundary, no external consumers yet.

- One issue tracker, one CI pipeline, one clone.
- Boundary changes are atomic: a contract change and both sides' adaptation land in one PR, so the
  repo is never in a state where the two apps disagree.
- No version negotiation between two people who talk to each other daily.

**The cost:** the boundary is enforced by convention and review, not by a repo wall. If we find
ourselves reaching across the boundary instead of through the contract, that is the signal to split.
Revisit if it happens twice.

---

## Layout

```
packages/
  contract/        Shared API types + fixtures. The seam. Jointly owned.
                   - openapi.yaml       OpenAPI schema for the KB/app-be interface
                   - src/index.ts       TypeScript type definitions
  kb/              Knowledge base layer. Facts, events, provenance, redaction.
  app-be/          Application backend. API routes, use cases, scheduling logic.
  app-fe/          Application frontend. UI, client-side routing, expedition views.

doc/
  REPO-STRUCTURE.md      This file. Layout, ownership, document map.
  DEVELOPMENT.md         Dev environment setup, git hooks, local workflow.
  BUILD-PLAN.md          Phase plan. Frozen after approval, links to milestone.
  LESSONS.md             Reflection triage.
  ARCHITECTURE.md        System level: the three layers, boundaries, deployment.
  adr/                   System + contract decisions.
  contract/
    API.md               Normative prose for the KB/app-be boundary. Points at packages/contract.
  kb/
    REQUIREMENTS.md
    ARCHITECTURE.md
    SPECS.md             KB internals: event log format, storage schema.
    adr/                 KB-scoped decisions.
  app-be/
    REQUIREMENTS.md
    ARCHITECTURE.md
    SPECS.md             App backend internals: API routes, data flow, session management.
    adr/                 Backend-scoped decisions.
  app-fe/
    REQUIREMENTS.md
    ARCHITECTURE.md
    SPECS.md             App frontend internals: view models, routing, UI interaction.
    adr/                 Frontend-scoped decisions.

.github/
  CODEOWNERS

.githooks/
  pre-commit       Tracked pre-commit hook. See doc/DEVELOPMENT.md.
```

---

## The boundary

`packages/contract` is the single source of truth for the KB/app interface, expressed as TypeScript
types rather than prose. The compiler enforces agreement; discipline does not have to.

**The contract does not live in either app's `SPECS.md`.** `doc/kb/SPECS.md` covers KB internals and
`doc/app/SPECS.md` covers app internals. Putting the wire contract in either one means copying it
into the other, and the copies diverge. `doc/contract/API.md` holds the normative prose and
references the types; it never restates them.

`packages/contract` also holds shared fixtures -- seeded request/response sets covering the cases
that matter (a GM view and a player view of the same facts, a retraction, a recalculated derived
value). Both sides test against the same fixtures, which is what lets the two of us work
independently without blocking on each other.

**Redaction is part of the contract.** Viewer role is a parameter of every read, resolved on the KB
side. The app never receives content it must hide. A client-side filter is a data leak.

---

## ADR scopes

Three scopes, one file per decision, append-only by new file so concurrent ADRs never conflict.

| Location | Scope |
|---|---|
| `doc/adr/` | System-wide and contract decisions -- anything affecting both apps or the boundary |
| `doc/kb/adr/` | Decisions internal to the KB layer |
| `doc/app/adr/` | Decisions internal to the application layer |

Naming: `NNN-short-title.md`, numbered per directory.

A decision belongs in `doc/adr/` if reversing it would require changes on both sides of the
boundary.

---

## Document ownership

Ownership means "writes without asking." Anyone may open a PR against any document; CODEOWNERS
determines whose review is required.

| Path | Owner | Cadence |
|---|---|---|
| `README.md` | joint | rare |
| `doc/REPO-STRUCTURE.md` | joint | rare |
| `doc/DEVELOPMENT.md` | joint | rare |
| `doc/ARCHITECTURE.md` | joint | rare |
| `doc/contract/**`, `packages/contract/**` | **both** | per boundary change |
| `doc/kb/**`, `packages/kb/**` | benjaminbradley | per task |
| `doc/app-be/**`, `packages/app-be/**` | deastland0423 | per task |
| `doc/app-fe/**`, `packages/app-fe/**` | deastland0423 | per task |
| `doc/BUILD-PLAN.md` | joint | per phase |
| `doc/LESSONS.md` | either | as reflected |

---

## Mapping onto autocode

autocode's core workflow names `REQUIREMENTS.md`, `ARCHITECTURE.md` and `SPECS.md` without a path,
assuming one application per repo. Three resolutions apply here:

**1. Per-layer documents resolve by the task's area.** A task labelled `area:kb` reads `doc/kb/*`; a
task labelled `area:app-be` reads `doc/app-be/*`; a task labelled `area:app-fe` reads `doc/app-fe/*`.
A task labelled `area:contract` reads `doc/contract/API.md` and both app layers' `SPECS.md`. When
area is ambiguous, ask rather than guess.

**2. `doc/BUILD-PLAN.md` stays singular.** The `github-issues` adapter reads that exact path, and
one plan per repo keeps phases as vertical slices spanning all three layers -- which is what we want,
since a phase that touches only one side cannot be demonstrated end to end. Tasks carry an `area:*`
label to route them.

Everything else follows `.autocode/` unmodified. Task status lives in GitHub issues; see
`.autocode/core/workflow/task-tracking.md` for the contract and
`.autocode/task-tracking/github-issues/` for the mechanics.
