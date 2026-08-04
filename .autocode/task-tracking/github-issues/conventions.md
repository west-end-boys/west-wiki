# Task Tracking: github-issues adapter — Conventions

Label scheme, naming, prerequisites, and declared properties for the github-issues adapter.
Operation-by-operation mechanics are in `operations.md`.

---

## Concurrency Property: multi-writer

**This adapter supports several concurrent writers.**

Status lives in GitHub, not in the repository, so two agents or two developers working at the same
time do not produce merge conflicts. Task status is also visible to people who never clone the
repo.

**What multi-writer does *not* mean.** GitHub offers no compare-and-swap on issue state, so
`task.claim` is **advisory**, not atomic. Two writers calling `task.next()` within the same second
can select the same issue. The mitigation is claim-then-verify:

1. `gh issue edit <n> --add-assignee "@me" --add-label "status:in-progress"`
2. Re-read the assignee list
3. If more than one assignee is present, the lowest-numbered login keeps it; everyone else removes
   themselves and picks another task

This is a convention, not a lock. It narrows the race to the width of two API calls; it does not
close it. For genuinely contended work, partition by milestone or assign tasks up front instead of
racing for them.

**The autonomous harness assumes a single runner.** Its state file tracks one active phase and one
session. Running two harness processes against the same repository is not supported by any adapter,
including this one — multi-writer describes humans and agents sharing a tracker, not parallel
harness instances.

---

## Prerequisites

- **`gh`** — the GitHub CLI, authenticated: `gh auth login`
- **`jq`** — used by `phase-status.sh`
- **Scopes:** `repo` for private repositories, `public_repo` for public ones. Both cover issues,
  labels and milestones. `gh auth status` shows the current scopes.
- The working directory must be inside a clone with a GitHub remote, so `gh` can infer
  `{owner}/{repo}`. Otherwise pass `--repo owner/name` explicitly.

Install these in the dev container image, not ad hoc — the harness shells out to `gh` on every
session boundary and a missing binary halts autonomous execution.

---

## Milestones — the phase

```
Phase <N>: <Name>
```

Examples: `Phase 1: Foundation`, `Phase 2: Core Features`.

The `Phase <N>` prefix is load-bearing: `phase-status.sh` parses `N` from it, and the harness uses
`N` as its phase identifier. A milestone that does not match is ignored by autocode entirely, which
is the supported way to keep non-autocode work in the same repo.

Closing the milestone is `phase.complete`. Closed milestones are the archive.

---

## Issues — the task

```
Task <planId>: <Description>
```

Examples: `Task 1.2: Add email validation`.

- The **plan ID** (`1.2`) is the canonical task ID. It comes from `doc/BUILD-PLAN.md`, is stable
  across digest re-runs, and is what `plan.digest` matches on for idempotence.
- The **issue number** (`#42`) is the commit-referenceable handle. GitHub cross-links it
  automatically, so `feat(scope): ... (#42)` produces a navigable trail in both directions.

Both are stable and the mapping between them never changes, which satisfies invariant 2.

### Body format

```markdown
**Test:** [What test proves this works]
**Files:** [Files to create/modify]
**Depends:** #41, #43
**Verify:** [How this is verified]
```

- `Test:` is the acceptance criterion. Required.
- `Files:` is the file list. Required.
- `Depends:` drives `task.next()` ordering. Uses issue numbers, not plan IDs, so GitHub renders
  them as links. Omit when there are no dependencies.
- `Verify:` marks how the task is verified; text matching a manual marker (e.g. "manual test",
  "real API", "real credentials") tells the autonomous harness this task needs a human.

The body is the only part `plan.digest` rewrites on re-run. Labels and state are never touched by
digest.

---

## Labels

| Label | Meaning |
|---|---|
| `autocode:task` | Managed by autocode. Applied to every task issue; unlabelled issues are invisible to this adapter. |
| `status:in-progress` | Claimed, being worked |
| `status:implemented` | Implemented, pending verification — the equivalent of markdown's `[o]` |
| `status:deferred` | Intentionally not being done autonomously, e.g. requires manual verification |
| `priority:low` | Deferred reflection items added by `task.add` |

There is deliberately **no `status:open` or `status:verified` label.** Absence of a `status:*` label
means open; closed means verified. Encoding a fact twice — once in issue state, once in a label —
is exactly the mirroring invariant 1 forbids.

Create the labels once per repository:

```bash
gh label create "autocode:task"      --color 0e8a16 --description "Managed by autocode"
gh label create "status:in-progress" --color fbca04 --description "Claimed, being worked"
gh label create "status:implemented" --color 1d76db --description "Implemented, pending verification"
gh label create "status:deferred"    --color d93f0b --description "Requires manual action"
gh label create "priority:low"       --color c2e0c6 --description "Deferred learning / low priority"
```

---

## Status mapping

| Issue state | Normalized status | Counts as remaining? |
|---|---|---|
| open, no `status:*` label | `open` | Yes |
| open + `status:in-progress` | `in_progress` | No |
| open + `status:implemented` | `done` | No |
| closed | `done` | No |
| open + `status:deferred` | `deferred` | No |

If an issue somehow carries several `status:*` labels, precedence is
`deferred` > `implemented` > `in-progress`, and closed beats every label. `phase-status.sh`
implements exactly this order.

Only `open` counts as remaining work for phase selection, matching every other adapter.

---

## What does not belong here

Issue **bodies** hold the task definition. They do not hold execution history — no mini-plans, no
TDD progress, no review results, no commit lists. Those are comments. Editing the body to record
progress would break invariant 4 and destroy the append-only thread.

---

## Invariant Compliance

| Invariant | How this adapter satisfies it |
|---|---|
| 1. Single home for status | Issue state plus `status:*` labels. No label duplicates a fact that state already carries; the comment thread holds no status field. |
| 2. Stable IDs | Plan ID in the title (stable across digests); issue number for commit references. |
| 3. Plan carries no status; plan links to queue | `doc/BUILD-PLAN.md` links to the milestone and holds no status. Different systems entirely, so they cannot collapse into one document. |
| 4. Records append-only | Each `record.*` call posts a new comment. Comments are never edited. |
| 5. Commit traceability | Commit messages reference `#<issue>`; GitHub cross-links both directions. Phase-level commits reference the milestone. |
| 6. Declared concurrency | Multi-writer, with the advisory-claim caveat stated above. |
| 7. Machine interface | `harness.json` + `phase-status.sh` — see `harness.md`. |

---

## Related Files

- `core/workflow/task-tracking.md` — the contract
- `operations.md` — operation-by-operation mechanics
- `harness.md` — machine interface for the autonomous harness
