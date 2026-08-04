# Implementation Workflow

All task-tracking operations below (`task.*`, `record.*`, `phase.*`) are defined in
`core/workflow/task-tracking.md` and implemented by the bound adapter. Core never names a tracker
file.

## The Implementation Cycle

```
┌─────────────────────────────────────────────────┐
│  1. task.next()                                 │
│  2. record.open(id, plan)                       │
│  3. Write failing test (RED)                    │
│  4. Implement (GREEN)                           │
│  5. Refactor (if needed)                        │
│  6. Quick review                                │
│  7. record.close(id, outcome) + task.complete() │
│  8. Commit (implementation + docs atomically)   │
│  9. Loop until the phase is complete            │
└─────────────────────────────────────────────────┘
```

## Cycle Sizing

Each cycle should be sized similarly to a single "ticket" assigned to a human developer:
- **Target:** 5-15 minutes per task
- **Grouping:** Tiny similar tasks may be grouped for efficiency
- **Balance:** Small enough for early issue detection, large enough to avoid excessive overhead
- **Commits:** At least one commit per cycle, potentially more (e.g., refactor → feature)

## Step Details

### 1. Pick Task — `task.next()`
- `task.next()` returns the next unblocked task, respecting dependencies (don't skip ahead)
- `task.get(id)` gives the description, acceptance criteria, and file list
- `task.claim(id)` marks it in progress
- If blocked, `record.append(id, note)` the blocker and pick another
- Verify prerequisites are met
- **Check `doc/LESSONS.md` Deferred Opportunities** for any items whose domain matches this task. If a match exists with recurrence ≥ 2, escalate its priority before starting. If recurrence ≥ 3, consider resolving the deferred learning first.

### 2. Create Mini-Plan — `record.open(id, plan)`
Open the task record with a mini-plan:

```markdown
### Mini-Plan
- **Goal:** [One sentence - what does success look like?]
- **Approach:**
  - [Step 1]
  - [Step 2]
  - [Step 3]
- **Tests:** [What tests will prove this works]
- **Files:** [Files to create/modify]
```

Do this before writing any code. Whether opening a record produces a commit is adapter-specific —
a file-backed adapter commits the mini-plan; an adapter backed by an external tracker has nothing
to commit. See the bound adapter's `operations.md`.

### 3. Write Failing Test (RED)
- Describe the expected behavior
- Run test, confirm it fails
- Failure must be meaningful (not syntax error)
- **`record.append(id, ...)`:** Mark RED phase complete

**Example verification:**
```
✓ Expected calculateTotal([10, 20]) to equal 30, got undefined
✗ Good failure - function returns undefined instead of sum

✗ calculateTotal is not defined
✗ Bad failure - syntax error, not behavioral failure
```

**If refactoring needed first:**
Refactor existing code to support the new feature, commit separately:
```bash
git add [refactored-files]
git commit -m "refactor(scope): prepare for [feature]"
```
Then write test.

**Commit test:**
```bash
git add [test-files]
git commit -m "test(scope): add test for [behavior]"
```

### 4. Implement (GREEN)
- Write the MINIMUM code to pass the test
- Don't optimize yet
- Don't handle edge cases not covered by tests
- Run tests frequently
- **`record.append(id, ...)`:** Mark GREEN phase complete

**Guidelines:**
- Ugly code that passes > elegant code that doesn't exist
- Feature creep is not allowed - stick to task scope
- If you discover additional needs, `task.add(...)`

**Commit implementation:**
```bash
git add [implementation-files]
git commit -m "feat(scope): implement [behavior]"
```

### 5. Refactor (if needed)
- Only refactor when tests are GREEN
- Run tests after each small change
- If tests break, undo immediately
- Improve readability, remove duplication
- Extract functions if clarity improves
- **`record.append(id, ...)`:** Mark REFACTOR phase complete or N/A

**Commit refactoring:**
```bash
git add [refactored-files]
git commit -m "refactor(scope): extract [what] for clarity"
```

### 6. Quick Review
Run pre-commit checks while the implementation is fresh in mind — before touching docs.

**Quick Review Checklist:**
- [ ] All tests pass (X new, Y total)
- [ ] No linting errors
- [ ] No debug code left (console.log, print statements)
- [ ] Naming is clear and descriptive
- [ ] No type errors (if applicable)

**If any check fails:** Fix before proceeding. Quick review **blocks commits** — maintain TDD rigor.

See: `core/workflow/review.md` for full review process

### 7. Close the Record and Complete the Task
With review complete and the work still fresh, `record.close(id, outcome)` then
`task.complete(id, commits)`.

**Documentation update rules — where each fact belongs:**

| What changed | Update here | Do NOT add to CLAUDE.md |
|---|---|---|
| Task completed | `task.complete(id, commits)`, `record.close(id, outcome)` | Phase status, task counts |
| New source file created | `ARCHITECTURE.md` (if layout section exists) | Source file tree |
| New convention discovered | `DEVELOPMENT.md` or `doc/LESSONS.md` | Convention rationale |
| New stable rule or codebase gotcha | `CLAUDE.md` ← only case | — |

`CLAUDE.md` receives additions only for **stable rules and codebase-specific gotchas** that are not documented anywhere else. Progress, source layouts, and rationale belong in their authoritative homes. See `principles/best-practices.md` §Documentation for the full volatility/scope model.

`record.close(id, outcome)` captures:

```markdown
### Review Results
**Quick Review:**
- [x] Tests pass (3 new, 47 total)
- [x] No linting errors
- [x] No debug code left
- [x] Naming is clear

**Issues Found:** None

### Outcome
**Completed:** [timestamp]
**Duration:** 12 minutes
**Commits:**
- `abc1234` - docs(tasklog): add plan for task 1.2
- `def5678` - test(validators): add email validation tests
- `ghi9012` - feat(validators): implement [behavior]

**Learnings:** Regex approach simpler than parser library
```

Then `task.complete(id, commits)` marks the task implemented and links its commits. How that is
represented — a status glyph, an issue transition — is adapter detail.

### 8. Commit
Commit implementation and docs atomically — they travel together so rollback always leaves docs and code in sync:

```bash
git add [implementation-files] [test-files]
git commit -m "feat(scope): implement [behavior]"
```

If the bound adapter keeps tracker state in the repo, stage it in this same commit — its
`operations.md` names the files. An adapter backed by an external tracker stages nothing extra; the
commit message alone carries the task reference.

### 8.5. Lightweight Reflection Scan

While the task's conversation is fresh, scan for signals that may indicate a guideline gap. ~1 minute when signals found, ~10 seconds when not.

**Scan conversation history for:** approach pivots, multi-edit files (corrective, not refactoring), unplanned steps, error → fix sequences, multiple attempts at the same goal.

**Triage each signal:** lesson clear + target file obvious → apply in-place, commit, notify if autocode-level. Otherwise → defer to `doc/LESSONS.md`, and `task.add(...)` a low-priority item.

**`record.append(id, ...)`:** Add `Signals noted` and `Reflection` fields.

For full signal definitions, triage process, and output formats see: `core/workflow/reflection.md`

### 9. Loop
Return to step 1, `task.next()`

## Phase Completion — `phase.complete(phaseId)`

When `task.next()` returns nothing for the current phase, the phase is finished. Call
`phase.complete(phaseId)`.

This closes the phase, archives its task records, and readies the record surface for the next
phase. The mechanics are entirely adapter-internal. Core does not need to know.

Archive commits reference a phase ID rather than a task ID. This is permitted by contract invariant
5.

See the bound adapter's `conventions.md` for archiving behavior and any mid-phase subdivision
thresholds.

## Verification Checkpoints

Before moving to next task, verify:
- [ ] All tests pass
- [ ] All code is committed
- [ ] Task record is complete (`record.close` ran)
- [ ] Task is marked done (`task.complete` ran)
- [ ] No uncommitted changes (unless intentional WIP)
- [ ] No new linting errors
- [ ] No type errors (if applicable)

## Handling Failures

### Test Won't Pass
1. Re-read the test - is it correct?
2. Re-read requirements - understood correctly?
3. Check for typos, off-by-one errors
4. Add debug output to understand behavior
5. If stuck > 10 minutes, ask for help

**`record.append(id, ...)`:**
```markdown
### TDD Cycle
- RED: ✅ Test written and failing
- GREEN: ⚠️ Issue: Test won't pass after 10 min, requesting help
```

### Unexpected Behavior
1. Don't just "fix it"
2. Understand WHY it happened
3. Add test that catches the issue
4. Then fix
5. `record.append(id, ...)` the discovery under learnings

### Scope Creep
If you notice something else that needs fixing:
1. `task.add(...)` it
2. `record.append(id, ...)` a note in the current task record
3. Don't fix it now - stay focused on current task

## Status Check

At session start, verify:

### Code State
- [ ] Working directory clean (or changes understood)
- [ ] On correct branch
- [ ] Tests passing
- [ ] No uncommitted work (check git status)

### Documentation State
- [ ] `task.status()` reflects the approved phase plan
- [ ] The task record surface exists and is up to date
- [ ] HANDOFF.md reviewed (if exists)

### Alignment
- [ ] Next task is clear
- [ ] No blockers
- [ ] Dependencies satisfied

## Anomaly Detection

Flag when:
- Task duration exceeds estimate by 2x
- Tests decreasing instead of increasing
- Many tasks added mid-implementation (scope creep)
- Frequent blockers on simple tasks
- Pattern of TDD violations

**`record.append(id, ...)`** under learnings and report to human.

## Just-In-Time TDD Verification

After GREEN phase, before REFACTOR, quick check:

### Quick TDD Validation
- [ ] Test file existed before implementation (check git log)
- [ ] Test failed before implementation (you verified this)
- [ ] Test now passes

**❌ If any fail:** Stop, fix the workflow violation immediately.

This catches TDD violations early, before full commit-time verification.

## Full TDD Compliance Verification

Before every commit with production code changes.

### Verification Checklist

#### 1. Test Existence
For every production code change:
- [ ] Corresponding test exists
- [ ] Test was written BEFORE implementation (check git history)
- [ ] Test file follows naming convention

#### 2. Test Quality
For each test:
- [ ] Tests behavior, not implementation
- [ ] Has clear, descriptive name
- [ ] Contains meaningful assertions
- [ ] Tests one concept per test
- [ ] Uses arrange-act-assert pattern

#### 3. Red-Green-Refactor Cycle
Check git history for evidence of:
- [ ] Test commits before implementation commits
- [ ] Small, incremental commits
- [ ] Refactoring commits separate from feature commits

#### 4. Coverage
- [ ] New code paths have tests
- [ ] Edge cases are tested
- [ ] Error conditions are tested

### TDD Violations

**Critical (Block Commit)**
- Production code without tests
- Tests added after implementation
- Tests that pass without implementation (false positives)

**Warning (Note for Review)**
- Tests that mock too much
- Tests coupled to implementation details
- Large test methods

### Recovery Actions

If TDD violations found:

1. **Missing tests**: Write tests for the code
2. **Tests after code:**
   - Stash implementation
   - Write tests that fail
   - Reapply implementation
   - Verify tests pass
3. **Poor test quality:**
   - Refactor tests to test behavior
   - Remove implementation coupling

## Related Files

- `workflow/task-tracking.md` - Task tracking contract (the operations used above)
- `workflow/tdd.md` - Detailed TDD process
- `workflow/planning.md` - Planning and mini-planning
- `workflow/review.md` - Full review process
