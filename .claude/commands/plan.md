# /project:plan - Create Full Implementation Plan

Produce a complete phase plan (`doc/BUILD-PLAN.md`) for the project or phase, get it approved, and digest it into the bound task tracker.

**Note:** This creates a FULL plan. For individual task plans, see mini-planning (`record.open`) via `/project:task-cycle`.

## Instructions

1. Read requirements documentation:
   - ARCHITECTURE.md (if exists)
   - REQUIREMENTS.md (if exists)
   - SPECS.md (if exists)

2. If requirements are unclear or missing:
   - Ask the human for clarification
   - Offer to help create missing documentation

3. Follow the complete planning workflow:
   @.autocode/core/workflow/planning.md

4. Validate the plan using the checklist in planning.md before presenting

5. Present plan to human for approval before proceeding

6. After approval, `plan.digest(phasePlan)` — see @.autocode/core/workflow/task-tracking.md
   This generates the task queue and writes a back-link into the plan naming where its tasks were
   scoped. The plan keeps no status of its own.

## Output

Present the plan with:
- Overview of work
- Phased task breakdown (5-15 min tasks)
- Test requirements for each task
- Dependencies noted
- Open questions listed
- Validation status

Wait for explicit approval before digesting or implementing.

## Related Files

- `core/workflow/task-tracking.md` - the `plan.digest` operation and adapter binding
- `core/workflow/planning.md` - full planning workflow and validation checklist
