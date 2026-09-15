# West Wiki — Project Guide for Claude

This file is loaded automatically by Claude Code. It supplements `.claude/CLAUDE.md` (which loads
the autocode workflow) with project-specific context, conventions, and guidelines.

---

## What This Project Is

A private, LLM-assisted campaign management and knowledge system for a West Marches Shadowdark
campaign. Two layers, one monorepo:

- **`packages/kb/`** — Knowledge base: event-sourced fact store, provenance, redaction.
  Owner: @benjaminbradley
- **`packages/app-be/`** — Application back-end: implements business logic, coordinates with KB.
  Owner: @deastland0423
- **`packages/app-fe/`** — Application front-end: scheduling, expeditions, player-facing UI.
  Owner: @deastland0423
- **`packages/contract/`** — Shared TypeScript types + fixtures. The seam. Both owners required.

See `doc/REPO-STRUCTURE.md` for the full layout and ownership table.

---

## Key Commands

npm workspace at the repo root. `packages/app-be` is bootstrapped with TypeScript, Vitest and
ESLint; `packages/kb`, `packages/app-fe` and `packages/contract` do not exist yet.

```
npm install
npm test           # vitest
npm run lint
```

---

## Document Routing by Area

Tasks carry an `area:*` label. Route documentation reads accordingly:

| Label | Read these docs |
|---|---|
| `area:kb` | `doc/kb/REQUIREMENTS.md`, `doc/kb/ARCHITECTURE.md`, `doc/kb/SPECS.md` |
| `area:app-be` | `doc/app-be/REQUIREMENTS.md`, `doc/app-be/ARCHITECTURE.md`, `doc/app-be/SPECS.md` |
| `area:app-fe` | `doc/app-fe/*`, plus `doc/app-be/REQUIREMENTS.md` until product-level requirements are hoisted |
| `area:contract` | `doc/contract/API.md`, `doc/contract/KB-PROJECTIONS.md`, both apps' `SPECS.md` |

`doc/app-fe/` has no documents yet.

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

ADRs live in `doc/adr/` (system-wide), `doc/kb/adr/` (KB-internal), or `doc/app-be/adr/`
(app-internal). See `doc/REPO-STRUCTURE.md §ADR scopes` for which scope a decision belongs in.

Current ADRs:

System-wide (`doc/adr/`):
- `001-event-sourced-fact-store.md` — KB stores facts as an append-only event log; the wiki is a
  projection. Editing = appending a correcting fact, not mutating a record.
- `002-application-owned-identity-and-scheduling-state.md` — why identity and scheduling state sit
  on the app side: event-sourcing earns its keep only where retraction and provenance matter.
- `003-kb-app-ownership-boundary.md` — which layer owns which entity; the KB is a service; both
  layers share one trust boundary; the app is not event-sourced.
- `004-fact-model-veracity-and-visibility.md` — three entry kinds, the fact-type registry as a
  deployment artifact, `RUMOR`/`CANON` veracity, and hybrid visibility.

Application (`doc/app-be/adr/`):
- `001-campaign-state-changes-through-actions.md`
- `002-character-lifecycle-and-retirement.md`
- `003-downtime-commitments-and-availability.md`
- `004-role-based-permission-tiers.md`
- `005-email-and-password-authentication.md`

---

## Roles

`doc/app-be/adr/004-role-based-permission-tiers.md` is authoritative. Four ordered tiers, each
including everything below it:

```
ANONYMOUS (0) < PLAYER (1) < GM (2) < ADMINISTRATOR (3)
```

- **Anonymous** — no membership record; public read-only access to non-private content
- **Player** — manages own characters, browses opportunities, joins expeditions, records rumors
- **GM** — everything a Player can do, plus: controls canon, approves proposals, publishes
  availability, runs authorized regions
- **Administrator** — everything a GM can do, plus: campaign settings, roster limits, regions,
  role assignment

`CampaignMembership.role` is one rank per campaign, not a set of flags. Authorization is a rank
comparison against a required minimum tier, never an exact-match check.

Redaction of KB world knowledge is resolved KB-side; the app never receives KB content it must
hide. The app authorizes queries against its own eight owned entities itself — that is access
control, not redaction. See `doc/adr/003-kb-app-ownership-boundary.md`.

---

## Layer Boundary — the one-line version

The KB owns the state of the world and its history. The app is an interface onto that state and
coordinates the adventures that generate expedition reports, which are the change records feeding
the KB. The KB is event-sourced; the app is not, and stores current state in an ordinary database.
See `doc/adr/003-kb-app-ownership-boundary.md`.

## Prior-Art References

Collected in the project Google Doc. Not yet formally evaluated (tracked as a `status:deferred`
issue). Do not assume any of these projects are suitable or unsuitable without investigation.

The comparison axes have not been written down yet. The scan should evaluate against them rather
than sorting projects by impression.
