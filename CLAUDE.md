# West Wiki — Project Guide for Claude

This file is loaded automatically by Claude Code. It supplements `.claude/CLAUDE.md` (which loads
the autocode workflow) with project-specific context, conventions, and guidelines.

---

## What This Project Is

A private, LLM-assisted campaign management and knowledge system for a West Marches Shadowdark
campaign. Two layers, one monorepo:

- **`packages/kb/`** — Knowledge base: event-sourced fact store, provenance, redaction.
  Owner: @benjaminbradley
- **`packages/app/`** — Application: scheduling, expeditions, player-facing UI.
  Owner: @deastland0423
- **`packages/contract/`** — Shared TypeScript types + fixtures. The seam. Both owners required.

See `doc/REPO-STRUCTURE.md` for the full layout and ownership table.

---

## Key Commands

No code exists yet. This section will be filled in as packages are initialised.

---

## Document Routing by Area

Tasks carry an `area:*` label. Route documentation reads accordingly:

| Label | Read these docs |
|---|---|
| `area:kb` | `doc/kb/REQUIREMENTS.md`, `doc/kb/ARCHITECTURE.md`, `doc/kb/SPECS.md` |
| `area:app` | `doc/app/REQUIREMENTS.md`, `doc/app/ARCHITECTURE.md`, `doc/app/SPECS.md` |
| `area:contract` | `doc/contract/API.md`, both apps' `SPECS.md` |

When area is ambiguous, ask rather than guess.

---

## GitHub Linking — Required on Every Record

All issues, PRs, commits, and comments must be cross-linked so that the trail is navigable in
both directions. This is a hard requirement, not a best-effort guideline.

### Commits → Issues

Every commit message that implements, documents, or closes a task must reference the issue number:

```
feat(kb): implement event log schema (#12)
docs(adr): add ADR 001 event-sourced fact store (#8)
```

GitHub auto-links the commit in the issue thread. The issue number must appear in the commit
message body at minimum; in the subject line is preferred for visibility.

### PRs → Issues

Every PR description must list the issues it addresses, using GitHub's closing keywords so that
merging the PR closes the issue automatically:

```
Closes #8
Closes #12
```

If the PR partially addresses an issue, use `Addresses #N` instead.

### Issues → Dependencies

When creating an issue, set `**Depends:** #N` in the body for any upstream blockers, following the
adapter convention in `.autocode/task-tracking/github-issues/conventions.md`. The `task.next()`
operation uses these links to determine ordering.

### Comments → Context

When leaving a comment that references another issue, PR, or commit, include the number or SHA.
GitHub renders them as links; prose references do not.

### Milestone Assignment

Every `autocode:task` issue must be assigned to a milestone (Phase). Issues without a milestone
are invisible to `task.next()` and `task.status()`.

---

## Architectural Decisions

ADRs live in `doc/adr/` (system-wide), `doc/kb/adr/` (KB-internal), or `doc/app/adr/`
(app-internal). See `doc/REPO-STRUCTURE.md §ADR scopes` for which scope a decision belongs in.

Current ADRs:
- `doc/adr/001-event-sourced-fact-store.md` — KB stores facts as an append-only event log;
  the wiki is a projection. Editing = appending a correcting fact, not mutating a record.

---

## Roles

- **Player** — campaign participant; can create characters, browse opportunities, join expeditions
- **GM** — runs sessions; controls canon; approves fact proposals; publishes availability
- **Administrator** — configures campaign settings, character limits, regions
- **Viewer** — public read-only access to non-private content

Redaction is resolved KB-side. The app never receives content it must hide.

---

## Prior-Art References

Collected in the project Google Doc. Has not been formally evaluated yet (deferred; tracked as
a `status:deferred` issue). Do not assume any of these projects are unsuitable or suitable
without investigation.
