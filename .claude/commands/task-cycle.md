# /project:task-cycle - Complete Task Execution Cycle

Orchestrate full task execution following TDD workflow with planning and review.

## Purpose

Automate the complete task cycle from planning through completion:
1. `task.next()` — pick a task, `task.claim(id)`
2. `record.open(id, plan)` — mini-plan
3. Execute TDD cycle (RED-GREEN-REFACTOR)
4. Run quick review
5. Commit
6. Update documentation

## Usage

### Supervised Mode (Default)
```
/project:task-cycle [taskId]
```

Pauses for human approval after creating mini-plan.

**Context management:** Monitor context usage; run `/compact` when above 60%.

### Autonomous Mode (Harness-driven)

When running under the auto-resume harness (`node .autocode/scripts/auto-resume-harness.js`):
- Context compaction is handled automatically — the harness detects rate limits and resumes sessions with a fresh context window, injecting a reflection pass on resume.
- Phase boundaries trigger a phase-end reflection session before moving to the next phase.
- The harness reads phase status through the bound adapter's machine interface — see
  `core/workflow/task-tracking.md` §Machine Interface.
- No manual `/compact` needed; the harness owns the session lifecycle.

## Process

### 1. Pick Task

If taskId not specified, call `task.next()`:
- Respects dependencies
- Skips blocked tasks
- Returns the first available task

If taskId specified, `task.get(taskId)` and verify:
- Task exists in the queue
- Task not already complete
- Dependencies satisfied

Then `task.claim(taskId)`.

### 2. Create Mini-Plan

Call: `/project:log-task start [taskId]`

Agent calls `record.open(taskId, plan)` with:
```markdown
### Mini-Plan
- **Goal:** [One sentence outcome]
- **Approach:** 
  - [Step 1]
  - [Step 2]
  - [Step 3]
- **Tests:** [What tests will prove this works]
- **Files:** [Files to create/modify]
```

Call: `/project:log-task plan [taskId]`

**Supervised mode:** Present plan, wait for approval
**Autonomous mode:** Plan validator reviews, provides approval or feedback

### 3. Execute TDD Cycle

Follow RED-GREEN-REFACTOR workflow:

#### RED Phase
- Write failing test
- Verify meaningful failure (not syntax error)
- Call: `/project:log-task tdd [taskId] red` (`record.append`)
- Commit: `test(scope): add test for [behavior]`

#### GREEN Phase
- Write minimal implementation
- Run tests to verify pass
- Call: `/project:log-task tdd [taskId] green` (`record.append`)
- Commit: `feat(scope): implement [behavior]`

#### Just-In-Time TDD Check
Before REFACTOR:
- [ ] Test file existed before implementation
- [ ] Test failed before implementation
- [ ] Test now passes

**If any fail:** Stop, fix workflow violation

#### REFACTOR Phase (if needed)
- Improve code clarity
- Remove duplication
- Keep tests green
- Call: `/project:log-task tdd [taskId] refactor` (`record.append`)
- Commit: `refactor(scope): extract [what] for clarity`

**If refactoring needed before new code:**
Do it first in separate commit, then proceed with RED-GREEN

### 4. Quick Review

Run pre-commit checks:
- [ ] All tests pass (X new, Y total)
- [ ] No linting errors
- [ ] No debug code left
- [ ] Naming is clear
- [ ] No type errors (if applicable)

**If any fail:** Fix before proceeding. Quick review blocks commits.

See: `core/workflow/review.md` for full checklist

### 5. Finalize Task

Call: `/project:log-task complete [taskId]`

Updates:
- `record.close(taskId, outcome)` — review results and outcome
- `task.complete(taskId, commits)` — marks the task done and links its commits

Commit: `docs: complete task [taskId] - [description]`

### 6. Next Task

Prompt: "Task [taskId] complete. Continue with next task? (y/n)"

If yes, loop to step 1
If no, end cycle

When `task.next()` returns nothing for the current phase, call `phase.complete(phaseId)`.

## Modes

### Supervised Mode

Requires human approval at key points:
1. **After mini-plan:** "Mini-plan created. Approve? (y/n)"
2. **Before refactoring:** "Tests pass. Refactor? (y/n/skip)"
3. **After quick review:** "Review complete. Issues found: [X]. Proceed? (y/n)"

### Autonomous Mode (Future Enhancement)

Uses plan validator agent for automated approval:
- Validator checks mini-plan against:
  - Requirements alignment
  - Task scope (not too large)
  - Test strategy present
  - Files identified
- Outputs: APPROVE | FEEDBACK
- If FEEDBACK: Agent revises, resubmits

See: `doc/AUTONOMOUS-MODE.md` for design (when available)

## Output Format

### Start
```
Starting task cycle for: Task 1.2 - Add email validation

Step 1/5: Creating mini-plan...
```

### After Mini-Plan (Supervised)
```
Mini-plan created:
- Goal: Validate email format using regex
- Approach: Create validator function, test edge cases, integrate
- Tests: Valid emails pass, invalid formats fail
- Files: src/validators/email.ts, tests/validators/email.test.ts

Approve plan? (y/n/revise)
```

### During TDD
```
Step 2/5: RED phase
✅ Test written and failing correctly

Committing test...
Committed: test(validators): add email validation tests

Step 3/5: GREEN phase
✅ Implementation passes all tests

Committing implementation...
Committed: feat(validators): implement email validation
```

### After Quick Review
```
Step 4/5: Quick review
✅ Tests pass (3 new, 47 total)
✅ No linting errors
✅ No debug code
✅ Naming clear

Review: PASSED
```

### Completion
```
Step 5/5: Finalizing task

Task 1.2 completed successfully!

Summary:
- Duration: 12 minutes
- Tests: 3 new, 47 total
- Commits: 3 (plan, test, feat, docs)
- Issues: None

Updated:
- Task record closed (record.close)
- Task marked complete (task.complete)

Continue with next task? (y/n)
```

## Error Handling

### Task Not Found
```
Error: task.get(1.2) returned nothing.
Available tasks: [list from task.status()]
```

### Dependency Not Met
```
Error: Task 1.2 depends on Task 1.1 (not complete)
Complete Task 1.1 first, or specify different task
```

### TDD Violation
```
Error: TDD violation detected in GREEN phase
Test file was not created before implementation

Recovery:
1. Stash implementation: git stash
2. Write test that fails
3. Reapply implementation: git stash pop
4. Verify test passes
```

### Review Failure
```
Warning: Quick review failed
Issues:
- Linting errors: 2
- Debug code: console.log on line 42

Fix issues before committing? (y/abort)
```

## Integration

### With Other Commands

```bash
# Full workflow
/project:plan              # Produce the phase plan and digest it
/project:task-cycle 1.1    # Execute first task
/project:task-cycle 1.2    # Execute second task
...
/project:review            # Full review before PR
```

### With Manual Operations

Can interleave manual work:
```bash
/project:task-cycle 1.1    # Automated task
# Manual exploration, spike, etc.
/project:task-cycle 1.2    # Back to automated
```

## Notes

- Assumes the phase plan has been digested (`plan.digest`) and the queue is up to date
- Assumes a task record surface exists
- Uses `/project:log-task` internally for `record.*` updates
- Enforces TDD rigorously (no shortcuts)
- Quick review blocks commits (maintain quality)
- Git commits use conventional commit format

## Related Files

- `core/workflow/task-tracking.md` - Task tracking contract (the operations used above)
- `core/workflow/implementation.md` - Full task cycle details
- `core/workflow/tdd.md` - TDD process details
- `core/workflow/review.md` - Review checklists
- `agents/claude-code/commands/log-task.md` - task record automation
