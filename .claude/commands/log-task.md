# /project:log-task - Log Task Execution

Drive the task record through its lifecycle using the `record.*` operations.

This command is adapter-agnostic. It calls the operations defined in
`core/workflow/task-tracking.md`; the bound adapter decides where the record lives and what it
looks like.

## Purpose

Automate task record updates during the task execution cycle:
- Open the record with a mini-plan when starting a task
- Append TDD cycle progress
- Close with review results and outcome, then mark the task complete

## Usage

### Start Task
```
/project:log-task start [taskId]
```

Runs `task.claim(taskId)` and `record.open(taskId, ...)` with:
- Task ID and description (from `task.get(taskId)`)
- Timestamp
- Empty template sections for the mini-plan

`task.claim` sets status. The record carries none — see contract invariant 1.

### Update with Mini-Plan
```
/project:log-task plan [taskId]
```

Agent fills in, via `record.append(taskId, ...)`:
- Goal (one sentence)
- Approach (steps)
- Test strategy
- Files to modify

Commits: `docs(tasklog): add plan for task [taskId]`

### Update TDD Progress
```
/project:log-task tdd [taskId] [phase]
```

Where phase is: red | green | refactor

`record.append(taskId, ...)` updates the TDD Cycle section:
- Marks phase complete
- Notes issues if any

No commit (TDD commits are separate: test, feat, refactor)

### Finalize Task
```
/project:log-task complete [taskId]
```

Agent fills in via `record.close(taskId, outcome)`:
- Review results (runs quick review)
- Completion timestamp
- Duration calculation
- Commit hashes (from git log)
- Prompts for learnings (optional)

Then runs `task.complete(taskId, commits)`.

Commits: `docs: complete task [taskId] - [description]`

## Process

### 1. Confirm a Record Surface Exists

The bound adapter needs somewhere to write. If `record.open` reports no active record surface,
error: "No active task record surface. Run `plan.digest(phasePlan)` first — see
`core/workflow/planning.md`."

### 2. Extract Task Info

`task.get(taskId)` returns the description, acceptance criteria, and file list:

```
Task 1.2: Add email validation
  Test:  Validate email format with regex
  Files: src/validators/email.ts, tests/validators/email.test.ts
```

### 3. Populate the Record

Use the entry format documented in the bound adapter's `operations.md` (`record.open`).

Fill in:
- Task ID and description
- Timestamp (current)
- Sections based on command (start/plan/tdd/complete)

### 4. Open or Append

- If a record for this task exists → `record.append(taskId, ...)`
- If new → `record.open(taskId, plan)`

Records are append-only (contract invariant 4). Never rewrite an earlier note.

### 5. Auto-Capture Data

**For complete:**
- Run test suite: `npm test` or `pytest` (detect from project)
- Parse output for pass/fail counts
- Get recent commits: `git log --oneline -5`
- Calculate duration from start timestamp

## Output Format

### After Start
```
Task 1.2 record opened.
Ready for mini-planning.
```

### After Plan
```
Mini-plan added for task 1.2
Committed: docs(tasklog): add plan for task 1.2

Ready to begin TDD cycle.
```

### After TDD Update
```
TDD Cycle updated: RED complete
Continue to GREEN phase.
```

### After Complete
```
Task 1.2 completed!

Results:
- Duration: 12 minutes
- Tests: 3 new, 47 total passing
- Commits: 2 (test + feat)
- Issues: None

Updated:
- Task record closed (record.close)
- Task marked complete (task.complete)

Committed: docs: complete task 1.2 - email validation
```

## Integration with Task Cycle

Called automatically by `/project:task-cycle`:

```
/project:task-cycle
    ↓
/project:log-task start 1.2
    ↓
Agent creates mini-plan
    ↓
/project:log-task plan 1.2
    ↓
Agent executes TDD (RED)
    ↓
/project:log-task tdd 1.2 red
    ↓
Agent executes TDD (GREEN)
    ↓
/project:log-task tdd 1.2 green
    ↓
Agent executes TDD (REFACTOR if needed)
    ↓
/project:log-task tdd 1.2 refactor
    ↓
Agent runs review
    ↓
/project:log-task complete 1.2
```

## Error Handling

### No Record Surface
```
Error: No active task record surface.
Run plan.digest(phasePlan) before logging tasks — see core/workflow/planning.md.
```

### Task Not in the Queue
```
Error: task.get(1.2) returned nothing.
Verify the task ID, or task.add(...) it first.
```

### Task Already Complete
```
Warning: Task 1.2 is already complete.
Use 'tdd' or 'plan' to append to its record instead of 'start'.
```

## Manual Usage

Can also be called manually for fine-grained control:

```
# Start task, then manually create plan
/project:log-task start 1.2

# Update specific TDD phase
/project:log-task tdd 1.2 green

# Finalize after review
/project:log-task complete 1.2
```

## Notes

- Timestamps use ISO 8601 format: `YYYY-MM-DD HH:MM`
- Duration calculated from start to complete timestamps
- Git log filtered to commits since task start
- Test counts auto-detected from test runner output

## Related Files

- `core/workflow/task-tracking.md` - the `record.*` and `task.*` operations
- `task-tracking/<adapter>/operations.md` - concrete mechanics for the bound adapter
