# Agent Rules - Cross-Tool Compatible Instructions

> This file follows the AGENTS.md standard (agent-rules.org) for cross-tool compatibility.
> Works with: Claude Code, Aider, Cursor, VS Code AI, Zed, and other compatible tools.

## Test-Driven Development

All production code changes require a failing test first.

Process:
1. Write failing test
2. Write minimal code to pass
3. Refactor with tests green
4. Commit

## Code Standards

- Test behavior, not implementation
- One change at a time
- Clear naming over comments
- Simple over clever
- Max 3 levels of nesting
- Functions do one thing
- No magic numbers

## Workflow

1. Read project docs (ARCHITECTURE.md, REQUIREMENTS.md, SPECS.md)
2. Produce the phase plan
3. Get approval before coding, then `plan.digest(phasePlan)`
4. For each task:
   - `task.next()`, then `task.claim(id)`
   - `record.open(id, plan)` — mini-plan
   - Execute TDD cycle (RED-GREEN-REFACTOR), `record.append(id, ...)` at each phase
   - Quick review
   - `record.close(id, outcome)` then `task.complete(id, commits)`
   - Commit with conventional messages
5. When the phase has no open tasks left: `phase.complete(phaseId)`

Task-tracking operations are defined in `workflow/task-tracking.md` and implemented by the bound
adapter. Never name a tracker file directly.

## Communication

- Be direct and concise
- Ask when uncertain
- Report blockers immediately
- Provide honest feedback

## Git

- Conventional commits: type(scope): description
- Atomic commits
- Never commit failing tests
