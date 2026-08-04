# Planning Workflow

## Two Levels of Planning

### Full Planning (Project/Phase Start)
Produce a **phase plan** — a complete task breakdown for the project or phase — get it approved,
then digest it into the tracker with `plan.digest(phasePlan)`.

### Mini-Planning (Task Start)
Produce a focused plan for a single task and open a task record with it: `record.open(id, plan)`.

## Before You Code

Never start coding without a plan. Even "quick fixes" benefit from 30 seconds of thought.

**Full plan** for projects/phases → phase plan → `plan.digest(phasePlan)`
**Mini-plan** for individual tasks → `record.open(id, plan)`

Task-tracking operations are defined in `core/workflow/task-tracking.md` and implemented by the
bound adapter.

## Input Documents

### Required
- **REQUIREMENTS.md** - What to build (features, user stories)

### Produced by this workflow
- **doc/BUILD-PLAN.md** - The phase plan. Human-approved, then frozen. Carries no task status; after
  `plan.digest` it carries a link to the queue where its tasks were scoped.

### Recommended
- **ARCHITECTURE.md** - System structure, components, data flow
- **SPECS.md** - API contracts, data schemas, interfaces

### If Missing
Ask the human to provide them, or offer to help create them.

## Full Planning: Producing the Phase Plan

Break work into small, testable tasks. Each task should:
- Take 5-15 minutes to complete
- Be independently testable
- Have clear acceptance criteria
- Follow dependency order

The phase plan is a **planning artifact**, not the tracker. It is human-approved and frozen after
approval. It carries no task status — after digest it carries a link to where its tasks have been
scoped, so status is always one hop away and never needs copying back.

The plan is a **core planning artifact**, not a tracker file: it lives at `doc/BUILD-PLAN.md`,
alongside `REQUIREMENTS.md`, `ARCHITECTURE.md` and `SPECS.md`. The adapter owns the queue and the
task records — not the plan.

### Format
```markdown
# Implementation Plan

## Overview
[Brief description of what we're building]

## Tasks

### Phase 1: Foundation
- Task 1.1: [Description]
  - Test: [What test proves this works]
  - Files: [Files to create/modify]
- Task 1.2: [Description]
  ...

### Phase 2: Core Features
- Task 2.1: [Description]
  ...

## Dependencies
- Task 1.2 depends on Task 1.1
- Phase 2 depends on Phase 1

## Open Questions
- [Any unclear requirements]
```

## Getting Approval

Before digesting or implementing:
1. Present the plan to human
2. Explain key decisions and tradeoffs
3. Ask if anything is missing or wrong
4. Get explicit "go ahead" before coding

Validate the plan against the checklist below **before** presenting it.

## Digesting the Plan — `plan.digest(phasePlan)`

Once the plan is approved, digest it into the tracker. This is the step that turns a frozen,
low-volatility planning artifact into a live, high-volatility task queue.

`plan.digest(phasePlan)` creates one queue entry per planned task, carrying:
- task ID (stable, referenceable from commit messages)
- description
- acceptance criteria (the `Test:` line)
- file list
- dependencies

It also writes a back-link into the phase plan naming where the tasks have been scoped, and
initializes the record surface for the first phase so `record.open` has somewhere to write.

**Digest is idempotent.** Re-running it after a plan amendment adds new tasks and updates
descriptions. It never resets status on work already done.

**After digest, the plan carries no status.** Status lives in exactly one place — the queue
(contract invariants 1 and 3). The plan links to the queue rather than repeating it. If the plan
was authored with `- [ ]` checkboxes, digest strips them; a second document carrying the same
checkbox is a guaranteed future inconsistency, and it is always the plan's copy that goes stale.

See the bound adapter's `operations.md` for the concrete mechanics.

## Mini-Planning: Task-Level Plans

Before executing each task, `record.open(id, plan)` with:

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

### Mini-Plan Guidelines

**Keep it lightweight:**
- Goal: Single sentence outcome
- Approach: 2-4 specific steps
- Tests: Clear verification criteria
- Files: Concrete file paths

**When to create:**
After `task.next()` and `task.claim(id)`, before writing any code

Whether opening the record produces a commit is adapter-specific — see the bound adapter's
`operations.md`.

## Starting a New Phase

When a phase finishes, `phase.complete(phaseId)` closes it and readies the next phase's record
surface. See `core/workflow/implementation.md` → *Phase Completion*.

If the next phase needs planning that has not been done yet, produce and approve its phase plan
first, then `plan.digest(phasePlan)` again — digest is idempotent and will add only the new tasks.

## Updating the Plan

Plans change. When they do:
1. Amend the phase plan with new/changed tasks
2. Re-run `plan.digest(phasePlan)` — existing status is preserved
3. For work discovered mid-flight, use `task.add(...)` instead; it enters the queue directly and
   does not amend the approved plan
4. Communicate changes to human

## For Existing Codebases

When adding to existing code:
1. Explore the codebase first
2. Understand current patterns and conventions
3. Note existing test patterns
4. Plan to follow existing style
5. Identify integration points

---

## Plan Validation

Run this against the **phase plan**, before approval and before digest. It validates the plan — not
the queue. Queue health is `task.status()`.

### Validation Checklist

#### 1. Completeness

**Required Sections**
- [ ] Overview/goal description
- [ ] Task breakdown
- [ ] Dependencies noted
- [ ] Open questions listed (if any)

**Task Requirements**
- [ ] Each task has clear description
- [ ] Each task has test criteria
- [ ] Each task has estimated scope (5-15 min)
- [ ] Files to modify are identified

#### 2. Task Quality

**Size**
- [ ] Tasks are small (5-15 minutes each)
- [ ] No task requires more than ~50 lines of code
- [ ] Complex tasks are broken down

**Clarity**
- [ ] Task can be understood without additional context
- [ ] Acceptance criteria is verifiable
- [ ] No ambiguous language ("maybe", "might", "could")

**Testability**
- [ ] Test approach is specified
- [ ] Expected behavior is clear
- [ ] Edge cases are considered

#### 3. Ordering

**Dependencies**
- [ ] Dependencies are explicit
- [ ] No circular dependencies
- [ ] Foundation tasks come first
- [ ] Tests can be written before implementation

**Logical Flow**
- [ ] Tasks build on each other
- [ ] Integration points are identified
- [ ] No orphan tasks

#### 4. Alignment

**With Requirements**
- [ ] All requirements are covered
- [ ] No scope creep (unrequested features)
- [ ] Priorities match stakeholder input

**With Architecture**
- [ ] Follows existing patterns
- [ ] Respects module boundaries
- [ ] Doesn't introduce unnecessary coupling

#### 5. Digestibility

- [ ] Every task has a stable, unique ID
- [ ] Dependencies reference task IDs, not prose descriptions
- [ ] No task carries a status field or checkbox — status is the queue's job

### Red Flags

**Critical Issues**
- Task too large: "Implement the entire feature"
- Vague criteria: "Make it work well"
- Missing tests: No test specification
- Skipped steps: Assumes undone work is done

**Warnings**
- Ambitious estimates
- Many open questions
- Dependencies unclear
- Missing error handling tasks

### Validation Output Format

```markdown
## Plan Validation Report

### Plan: [phase plan title]

### Structure Check
- Overview: ✅/❌
- Tasks: X defined
- Dependencies: ✅/❌
- Questions: X open

### Task Analysis
| Task | Size | Testable | Clear | Issues |
|------|------|----------|-------|--------|
| 1.1  | ✅   | ✅       | ✅    | None   |
| 1.2  | ⚠️   | ✅       | ❌    | Vague  |

### Issues Found

#### Critical
- [Task X]: [Issue description]

#### Warnings
- [Task Y]: [Issue description]

### Recommendations
1. [Specific action to fix critical issues]
2. [Specific action to address warnings]

### Verdict
READY / NEEDS_REVISION / MAJOR_ISSUES

[Explanation of verdict]
```

### Revision Guidance

When plan needs revision:

1. **Task too large**: Break into 2-3 smaller tasks
2. **Vague criteria**: Add specific, testable conditions
3. **Missing dependencies**: Trace what each task needs
4. **Scope creep**: Remove or defer unrequested items
5. **Missing tests**: Add test specification for each task

## Related Files

- `core/workflow/task-tracking.md` - Task tracking contract
- `core/workflow/implementation.md` - Task execution cycle and phase completion
