# Task Tracking: github-issues adapter — Operations

Implements the eleven operations in `core/workflow/task-tracking.md` against GitHub Issues via the
`gh` CLI.

It reads, but does not own, `doc/BUILD-PLAN.md` — the phase plan is a core planning artifact.

See `conventions.md` in this directory for the label scheme, milestone naming, required auth
scopes, and the multi-writer concurrency property.

## Concept mapping

| Contract concept | GitHub |
|---|---|
| Task queue | Issues labelled `autocode:task` |
| Task | One issue |
| Task ID | Plan ID (`1.2`) in the issue title; the issue number is the commit-referenceable handle |
| Phase | Milestone titled `Phase N: Name` |
| Task record | The issue's comment thread |
| Archive | Closed milestone |

---

## Planning

### `plan.digest(phasePlan)`

Read `doc/BUILD-PLAN.md`. For each phase, find or create a milestone. For each task, find or create
an issue in that milestone.

```bash
# One milestone per phase
gh api repos/{owner}/{repo}/milestones \
  -f title="Phase 1: Foundation" \
  -f description="Digested from doc/BUILD-PLAN.md"
```

```bash
# One issue per task. The plan ID goes in the title; everything else in the body.
gh issue create \
  --title "Task 1.2: Add email validation" \
  --milestone "Phase 1: Foundation" \
  --label "autocode:task" \
  --body "$(cat <<'EOF'
**Test:** Validate email format with regex
**Files:** src/validators/email.ts, tests/validators/email.test.ts
**Depends:** #41
**Verify:** unit test
EOF
)"
```

**Idempotence.** Look the task up by its plan ID before creating:

```bash
gh issue list --search "in:title \"Task 1.2:\"" --label "autocode:task" \
  --state all --json number,title --jq '.[0].number'
```

If it exists, update the body only — never the labels or state. Re-running digest after a plan
amendment adds new issues and refreshes descriptions; work already done stays done.

Then write the back-link into the plan, directly under its title:

```markdown
> **Tasks scoped to:** [milestone `Phase 1: Foundation`](../../milestone/1) — that is where task
> status lives. This plan is frozen after approval and carries no status.
```

```bash
git add doc/BUILD-PLAN.md
git commit -m "docs: digest phase plan into GitHub issues"
```

**Strip status markers from the plan.** If the approved plan was authored with `- [ ]` checkboxes,
remove them during digest. Status lives in the issue; a checkbox in the plan is a second copy that
nothing updates.

No record surface needs initializing — an issue's comment thread exists as soon as the issue does.

**Invariant 3 in this adapter.** `doc/BUILD-PLAN.md` holds the frozen breakdown and links to the
milestone. The milestone holds status. They are different systems, so they cannot drift into one
document.

---

## Task queue

### `task.next()`

List open, unclaimed tasks in the active milestone, in plan-ID order, and return the first whose
dependencies are all satisfied.

```bash
gh issue list \
  --milestone "Phase 1: Foundation" \
  --label "autocode:task" \
  --state open \
  --json number,title,body,labels,assignees \
  --jq 'map(select((.labels | map(.name)) | (index("status:in-progress") or index("status:implemented") or index("status:deferred")) | not))'
```

- A task is a candidate only if it is open and carries none of the `status:*` labels.
- Parse `**Depends:** #41, #42` from the body. A dependency is satisfied when that issue is closed
  or carries `status:implemented`.
- Sort by plan ID, not issue number — issue numbers reflect creation order, which digest does not
  guarantee matches plan order.
- Before starting, check `doc/LESSONS.md` Deferred Opportunities for items whose domain matches
  this task. Recurrence >= 2 escalates its priority; recurrence >= 3 means resolve the deferred
  learning first.

**Multi-writer caveat:** claim immediately, then re-read (see `task.claim`).

### `task.get(id)`

```bash
gh issue view <number> --json number,title,body,labels,milestone
```

The body carries `**Test:**` (acceptance criterion), `**Files:**` (file list), `**Depends:**`
(dependencies), and optionally `**Verify:**` (how it is verified).

### `task.claim(id)`

Assign yourself and apply the in-progress label, then confirm you won the race:

```bash
gh issue edit <number> --add-assignee "@me" --add-label "status:in-progress"

# Re-read. If someone else is also assigned, back off and pick another task.
gh issue view <number> --json assignees --jq '.assignees | map(.login)'
```

GitHub offers no compare-and-swap, so claiming is advisory. See `conventions.md` §Concurrency for
what this does and does not guarantee.

### `task.complete(id, commits)`

Implemented but not yet verified — the equivalent of the markdown adapter's `[o]`:

```bash
gh issue edit <number> --remove-label "status:in-progress" --add-label "status:implemented"
```

Verified — the equivalent of `[x]`:

```bash
gh issue close <number> --reason completed
```

Commits are linked by referencing the issue number in the commit message, which GitHub cross-links
automatically:

```bash
git commit -m "feat(validators): implement email validation (#42)"
```

The commit list also goes into the outcome comment written by `record.close`.

### `task.add(task)`

```bash
gh issue create \
  --title "Task 1.9: Handle unicode local-parts in email validator" \
  --milestone "Phase 1: Foundation" \
  --label "autocode:task" \
  --body "**Test:** Validator accepts RFC-6531 addresses
**Files:** src/validators/email.ts"
```

For deferred reflection items, add the `priority:low` label and reference `doc/LESSONS.md` in the
body.

The new issue does **not** get written back into `doc/BUILD-PLAN.md`; the plan is frozen after
approval.

### `task.status()`

```bash
gh issue list --milestone "Phase 1: Foundation" --label "autocode:task" \
  --state all --json number,title,state,labels
```

| Issue state | Normalized status | Counts as remaining? |
|---|---|---|
| open, no `status:*` label | `open` | Yes |
| open + `status:in-progress` | `in_progress` | No |
| open + `status:implemented` | `done` | No |
| closed | `done` | No |
| open + `status:deferred` | `deferred` | No |

The active phase is the lowest-numbered open milestone containing at least one `open` task.

The machine-readable form of this operation is `phase-status.sh` — see `harness.md`.

---

## Task record

The task record is the issue's comment thread. Each `record.*` call posts a **new comment**; no
comment is ever edited. That is what makes invariant 4 structural here rather than a discipline.

### `record.open(id, plan)`

```bash
gh issue comment <number> --body "$(cat <<'EOF'
### Mini-Plan
- **Goal:** [One sentence - what does success look like?]
- **Approach:**
  - [Step 1]
  - [Step 2]
- **Tests:** [What tests will prove this works]
- **Files:** [Files to create/modify]
EOF
)"
```

The record carries **no status field** — status is the issue's state and labels, and nowhere else
(invariant 1).

Nothing to commit: the record lives in GitHub, not the repo.

### `record.append(id, note)`

One comment per event. TDD phase transitions:

```bash
gh issue comment <number> --body "**RED:** test written and failing"
gh issue comment <number> --body "**GREEN:** implementation passes"
gh issue comment <number> --body "**REFACTOR:** extracted validator helper"
```

Blockers, discoveries, and reflection signals are comments too:

```bash
gh issue comment <number> --body "**Blocker:** test won't pass after 10 min, requesting help"
gh issue comment <number> --body "**Signals noted:** [corrections, extra steps]
**Reflection:** [Applied: .autocode/[file] — [change]] | [Deferred: to LESSONS.md] | [None]"
```

Never `gh issue comment --edit-last`. Append the correction as a new comment instead — the wrong
turn is often the useful signal.

### `record.close(id, outcome)`

```bash
gh issue comment <number> --body "$(cat <<'EOF'
### Review Results
**Quick Review:**
- [x] Tests pass (3 new, 47 total)
- [x] No linting errors
- [x] No debug code left
- [x] Naming is clear

**Issues Found:** None

### Outcome
**Completed:** 2026-08-04 14:32
**Duration:** 12 minutes
**Commits:**
- `def5678` - test(validators): add email validation tests (#42)
- `ghi9012` - feat(validators): implement email validation (#42)

**Learnings:** Regex approach simpler than parser library
EOF
)"
```

Then `task.complete(id, commits)`.

---

## Phase

### `phase.complete(phaseId)`

Close the milestone. Its closed issues and their comment threads are the archive — there is nothing
to rotate.

```bash
# Milestone numbers are not phase numbers; look it up by title
number=$(gh api repos/{owner}/{repo}/milestones --jq \
  '.[] | select(.title | startswith("Phase 1:")) | .number')

gh api -X PATCH repos/{owner}/{repo}/milestones/$number -f state=closed
```

**Precondition:** no `open` tasks remain in the milestone. Tasks at `status:deferred` may remain —
those are intentionally not being done autonomously.

If the next phase's milestone does not exist yet, `plan.digest` creates it.

---

## Related Files

- `core/workflow/task-tracking.md` — the contract these operations implement
- `conventions.md` — labels, milestone naming, auth scopes, concurrency property
- `harness.md` — machine interface for the autonomous harness
