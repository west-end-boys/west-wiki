# Task Tracking Contract

Core never names a tracker file. It calls the operations below, and a bound **task-tracking
adapter** maps them onto concrete mechanics.

This document is the contract. It must make sense with zero adapters installed — the same way core
never depends on `lang/` existing. Implementations live in `task-tracking/<adapter>/`.

---

## The Four Jobs

Task tracking has four responsibilities with sharply different volatility. Keeping them separate is
the point of this contract.

| Job | Volatility | What it holds | Operations |
|---|---|---|---|
| **Phase plan** | Low — frozen after human approval | Ordered breakdown, acceptance criteria, dependencies | Not a tracker job. A planning artifact. |
| **Task queue** | Per task | Status, assignment, dependency state | `plan.digest`, `task.*` |
| **Task record** | Per minute | Mini-plan, TDD progress, review results, outcome | `record.*` |
| **Archive** | Append-only | Completed task records | `phase.complete` (adapter-internal effect) |

**The phase plan is not part of the tracker.** It is a core planning artifact
(`doc/BUILD-PLAN.md`), produced by planning, approved by a human, and then *consumed* by the tracker
through an explicit digest step (`plan.digest`). After digest the plan carries no task status — it
links to the queue instead. Adapters own the queue and the task records; they never own the plan.

This separation is why the contract exists. A single document holding both a frozen plan and a
per-minute status field is always partially stale, which
`core/principles/best-practices.md` §Documentation explicitly forbids.

---

## Operations

Eleven operations. Core documents, commands, and prompts call these by name. Do not invent
additional operations; if the loop needs something not listed here, that is a contract change, not
an adapter detail.

### Planning

#### `plan.digest(phasePlan)`
Create or refresh queue entries from the approved phase plan.

- **Input:** the approved phase plan (task IDs, descriptions, acceptance criteria, file lists,
  dependencies).
- **Effect:** every planned task exists in the queue with status *open*. Existing task status is
  preserved — digest is idempotent and never resets work already done.
- **Postcondition:** the plan carries no status of its own, and carries a link to where its tasks
  have been scoped (invariant 3).
- **When:** after plan approval, and again whenever the plan is amended.

The back-link is what makes the separation navigable. A reader who opens the plan must be one hop
from current status, or they will start keeping status in the plan again.

### Task queue

#### `task.next()`
Return the next unblocked task, respecting dependency order.

- **Returns:** a task ID, or nothing if no unblocked task remains in the current phase.
- **Must not** return a task whose dependencies are unsatisfied, or one already claimed.

#### `task.get(id)`
Return a task's description, acceptance criteria, and file list.

#### `task.claim(id)`
Mark the task in progress and record the assignee.

- Under a single-writer adapter, assignment is implicit and the operation only sets status.

#### `task.complete(id, commits)`
Mark the task done and link the commits that implemented it.

- **Input:** task ID and one or more commit references.
- Satisfies invariant 5 in one direction; the commit message satisfies the other.

#### `task.add(task)`
Add a task discovered mid-flight — scope creep, a deferred reflection item, a follow-up.

- The new task enters the queue at *open*. It does **not** get written back into the approved phase
  plan; the plan is frozen after approval.

#### `task.status()`
Return phase-level status: which phase is active, how many tasks are open / in progress / done /
deferred.

- Used at session start and by the autonomous harness.

### Task record

#### `record.open(id, plan)`
Create the task record and write the mini-plan into it.

- **Input:** task ID, mini-plan (goal, approach, tests, files).
- Called after `task.claim(id)`, before any code is written.

#### `record.append(id, note)`
Append to the task record: TDD phase transitions, blockers, discoveries, reflection signals.

- **Append-only** (invariant 4). Never rewrite or delete an earlier note.

#### `record.close(id, outcome)`
Finalize the record with review results, commit list, duration, and learnings.

- Called after quick review passes, before `task.complete(id, commits)`.

### Phase

#### `phase.complete(phaseId)`
Close the phase and ready the next one.

- **Precondition:** no *open* tasks remain in the phase (deferred and manual-only tasks may remain
  — see the adapter for how those are represented).
- **Effect:** completed task records move to the archive; a fresh record surface is prepared for
  the next phase.
- Archiving mechanics are entirely adapter-internal. Core never names an archive location.

---

## Invariants

Every adapter must satisfy all seven. These are what make this an abstraction rather than a rename.

1. **Single home for status.** Task status lives in exactly one place. No other document mirrors
   it.
2. **Stable IDs.** Task IDs are stable and referenceable from commit messages.
3. **Plan carries no status; plan links to queue.** After `plan.digest`, the phase plan holds no
   task status. It carries a link naming where its tasks have been scoped, so status is always one
   hop away and never needs to be copied back.
4. **Records are append-only.** `record.append` never rewrites history.
5. **Commit traceability.** Every task traces to at least one commit, and every commit references
   either a task ID or a phase ID. (Phase IDs cover archive and rotation commits.)
6. **Declared concurrency property.** Each adapter states in its `conventions.md` whether it is
   single-writer or multi-writer, and what follows from that. This must not be left implicit —
   teams should learn it by reading, not by hitting merge conflicts.
7. **Declared machine interface.** Each adapter either provides the harness interface below, or
   explicitly declares itself harness-incompatible.

---

## Machine Interface (autonomous harness)

`agents/claude-code/scripts/auto-resume-harness.js` runs *outside* the model. It cannot read prose
instructions and act on them, so an adapter that supports autonomous execution must expose a
machine-readable view of the queue.

**Contract:** the adapter directory contains `harness.json`:

```json
{
  "phaseStatusCommand": ["node", "phase-status.js"],
  "concurrency": "single-writer"
}
```

`phaseStatusCommand` is executed with the **project root** as its working directory and the adapter
directory available as `$AUTOCODE_ADAPTER_DIR`. It must print a single JSON object on stdout:

```json
{
  "phases": [
    {
      "number": "4",
      "header": "Phase 4 - Notifications",
      "tasks": [
        {
          "id": "4.1",
          "status": "open",
          "description": "Send Discord webhook on blocker",
          "verify": "unit test with mocked fetch",
          "manual": false
        }
      ]
    }
  ]
}
```

**Normalized task status values** — every adapter maps its native states onto exactly these:

| Value | Meaning |
|---|---|
| `open` | not started; counts as remaining work |
| `in_progress` | claimed, not finished; does **not** count as remaining work for phase selection |
| `done` | implemented and/or verified |
| `deferred` | intentionally not being done autonomously |

The active adapter is named in `task-tracking/ACTIVE` (a single line, written by `setup.sh`).

An adapter that cannot provide this declares `"phaseStatusCommand": null`, and the harness refuses
to run against it with a clear message rather than failing obscurely.

---

## Binding an Adapter

A project binds exactly one adapter. `setup.sh --tracker <name>` writes the binding.

**Claude Code** — `@`-includes appended to `.claude/CLAUDE.md`:

```markdown
<!-- Task tracking: markdown -->
@../.autocode/task-tracking/markdown/operations.md
@../.autocode/task-tracking/markdown/conventions.md
```

**Aider** — entries appended to the `.aider.conf.yml` read list:

```yaml
read:
  - .autocode/task-tracking/markdown/operations.md
  - .autocode/task-tracking/markdown/conventions.md
```

If no adapter is bound, core still reads correctly but the operations have no implementation. Stop
and ask the human to run `setup.sh --tracker <name>` rather than inventing a tracker.

---

## Available Adapters

| Adapter | Concurrency | Best for |
|---|---|---|
| `markdown` | single-writer | Solo work and small projects. The default. |
| `github-issues` | multi-writer | Teams, or projects already tracking work in GitHub. |

---

## Related Files

- `task-tracking/<adapter>/operations.md` — how this adapter implements each operation
- `task-tracking/<adapter>/conventions.md` — naming, layout, concurrency property
- `core/workflow/planning.md` — producing the phase plan, then digesting it
- `core/workflow/implementation.md` — the task cycle that calls these operations
- `core/principles/best-practices.md` §Documentation — the volatility model this encodes
