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

### Current state of the layout

The tree above is the target. What exists today: `packages/app-be` only, with the KB/app seam expressed as a client-side interface at `packages/app-be/src/kb/knowledge-base-gateway.ts` rather than a shared `packages/contract`. `doc/ARCHITECTURE.md` and `doc/kb/ARCHITECTURE.md` / `doc/kb/SPECS.md` are not written. `doc/app-fe/` has no documents yet; the application-layer documents under `doc/app-be/` currently carry product-level requirements that span both application packages.

### The cost

The boundary is enforced by convention and review, not by a repo wall. If we find
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
  BUILD-PLAN.md          Retired placeholder. GitHub milestones are authoritative.
  LESSONS.md             Reflection triage.
  ARCHITECTURE.md        System level: the three layers, boundaries, deployment. NOT YET WRITTEN.
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
`doc/app-be/SPECS.md` covers app internals. Putting the wire contract in either one means copying it
into the other, and the copies diverge. `doc/contract/API.md` holds the normative prose and
references the types; it never restates them.

`packages/contract` also holds shared fixtures -- seeded request/response sets covering the cases
that matter (a GM view and a player view of the same facts, a retraction, a recalculated derived
value). Both sides test against the same fixtures, which is what lets the two of us work
independently without blocking on each other.

**Redaction is part of the contract.** Viewer role is a parameter of every KB read, resolved on the
KB side. The app never receives KB world knowledge it must hide.

This is specifically about KB-owned world state. The application owns eight coordination and
configuration entities of its own (see [ADR 003](adr/003-kb-app-ownership-boundary.md)) and is
responsible for authorizing queries against those itself, filtering by the caller's role tier. That
is access control, not redaction, and it does not involve the KB. A client-side filter is a data
leak in either case.

---

## ADR scopes

Three scopes, one file per decision, append-only by new file so concurrent ADRs never conflict.

| Location | Scope |
|---|---|
| `doc/adr/` | System-wide and contract decisions -- anything affecting both apps or the boundary |
| `doc/kb/adr/` | Decisions internal to the KB layer |
| `doc/app-be/adr/` | Decisions internal to the application layer |

Naming: `NNN-short-title.md`, numbered per directory.

A decision belongs in `doc/adr/` if reversing it would require changes on both sides of the
boundary.

An accepted ADR is not rewritten when circumstances change. Add a new ADR that supersedes it, or --
for a narrowing that does not reverse the decision -- an "Amendments" section at the end of the
existing file.

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
| `doc/BUILD-PLAN.md` | joint | retired -- placeholder only |
| `doc/app-be/**` product-level requirements | joint | rare |
| `doc/LESSONS.md` | either | as reflected |

---

## Mapping onto autocode

autocode's core workflow names `REQUIREMENTS.md`, `ARCHITECTURE.md` and `SPECS.md` without a path,
assuming one application per repo. Three resolutions apply here:

**1. Per-layer documents resolve by the task's area.** A task labelled `area:kb` reads `doc/kb/*`; a
task labelled `area:app` reads `doc/app-be/*`, or `doc/app-fe/*` for front-end work.
A task labelled `area:contract` reads `doc/contract/API.md` and both app layers' `SPECS.md`. When
area is ambiguous, ask rather than guess.

**2. The phase plan is retired; GitHub milestones are authoritative.** autocode's planning workflow
expects a phase plan at `doc/BUILD-PLAN.md`, and the `github-issues` adapter's `plan.digest` reads
that exact path. That plan has been digested and the project is now in build and iteration, so
milestone scope and task status live in GitHub instead: milestones `A1`-`A4` (application),
`K1`-`K3` (KB), and `INT` (integration). `doc/BUILD-PLAN.md` remains as a short pointer so the
documented path still resolves. **This is a deliberate deviation from `.autocode/`**: `plan.digest`
is no longer run, and re-running it would re-derive a plan the milestones already supersede.

Two consequences follow. Milestone titles no longer carry the `Phase <N>` prefix that
`.autocode/task-tracking/github-issues/phase-status.sh` matches on, so the autonomous harness
(`.autocode/scripts/auto-resume-harness.js`) sees no phases and cannot drive this repo -- it has
never been run here, and its strictly sequential phase model cannot express two parallel tracks
anyway. Tasks still carry an `area:*` label to route them.

Everything else follows `.autocode/` unmodified. Task status lives in GitHub issues; see
`.autocode/core/workflow/task-tracking.md` for the contract and
`.autocode/task-tracking/github-issues/` for the mechanics.
