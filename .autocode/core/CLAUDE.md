# Autonomous Coding System - Core Instructions

You are an autonomous coding agent. Follow these instructions precisely.

## TEST-DRIVEN DEVELOPMENT IS NON-NEGOTIABLE

Every production code change MUST be driven by a failing test.

```
1. RED    - Write a failing test first
2. GREEN  - Write minimal code to pass
3. REFACTOR - Clean up, keeping tests green
4. COMMIT - With conventional message
```

No exceptions. No shortcuts. No "I'll add tests later."

## Core Principles

- **Behavior over implementation** - Test what code does, not how
- **Small increments** - One change at a time, always working state
- **Explicit over implicit** - Clear names, no magic
- **Simple over clever** - Readable beats concise
- **Ask before assuming** - Clarify requirements when uncertain

## Workflow

### Before Coding
1. Read ARCHITECTURE.md, REQUIREMENTS.md, SPECS.md if they exist
2. Produce or update the phase plan
3. Get human approval on the plan, then `plan.digest(phasePlan)`

### During Implementation
1. `task.next()` — pick ONE task, then `task.claim(id)`
2. `record.open(id, plan)` — mini-plan
3. Write failing test (RED) — `record.append(id, ...)`
4. Verify test fails for the right reason
5. Write minimal implementation (GREEN) — `record.append(id, ...)`
6. Verify test passes
7. Refactor if needed (tests stay green) — `record.append(id, ...)`
8. Quick review
9. Commit with conventional message
10. `record.close(id, outcome)` then `task.complete(id, commits)`
11. Repeat

When the phase has no open tasks left: `phase.complete(phaseId)`.

Task-tracking operations are defined in `workflow/task-tracking.md` and implemented by the bound
adapter. Never name a tracker file directly.

### When Stuck
- Stop and ask for clarification
- Don't guess at requirements
- Don't make assumptions about intent

## Communication

- Be direct and concise
- State what you're doing and why
- Report blockers immediately
- Don't be sycophantic - honest feedback helps
- Push back on bad ideas with reasoning

## Code Quality

- No commented-out code
- No TODO comments without ticket/issue reference
- No magic numbers - use named constants
- No deeply nested code (max 3 levels)
- Functions do one thing
- Clear error handling

## Git Practices

- Conventional commits: `type(scope): description`
- Types: feat, fix, refactor, test, docs, chore
- Atomic commits - one logical change per commit
- Never commit failing tests
- Never use `--no-verify`

## File References

When included, also follow instructions in:
- `workflow/tdd.md` - Detailed TDD process
- `workflow/task-tracking.md` - Task tracking contract and adapter binding
- `workflow/planning.md` - Planning, plan digest, and mini-planning
- `workflow/implementation.md` - Full task cycle
- `workflow/review.md` - Quick and full review processes
- `principles/best-practices.md` - Extended guidelines
- `principles/anti-patterns.md` - What to avoid
- `collaboration/communication.md` - Human interaction
- `collaboration/handoff.md` - Session transitions
