Process to retrofit an existing codebase into the autocode 

(prereq: run the autocode setup script)

goal state:

...list out things like: linting rules, lint check commands, tdd+test check commands + cycle enforcement



- config rules for deterministic tools (like eslint config rules) should be created appropriate to the needs of each project, e.g. language (typescript) and use case (be vs fe). once established, project guidelines should reference them and include examples when needed.
  these kind of file paths should probably be part of the global read context
- 

# TO DO

- Workflow for adding autocode to existing codebases mid-stream
- do gap analysis with bootstrap and plan a closure phase
- Tracker preflight: retrofit needs the same check as `bootstrap.md` step 0 — verify the bound
  adapter's `conventions.md` Prerequisites are installed in the dev container. An existing codebase
  is *more* likely to need this, since its container image predates the adapter binding.
- Existing trackers: a retrofitted project may already track work somewhere (GitHub issues, Jira, a
  TODO file). Decide whether to bind an adapter to the existing tracker or digest it into a new one
  — do not end up running two, which violates Single Source of Truth (`core/workflow/task-tracking.md`
  invariant 1).
- Could reference `core/principles/opinions.md` and lead into planning
- Deterministic tool config per project (eslint, prettier, etc.)
  - Config rules for tools like ESLint should be created appropriate to language and use case (BE vs FE)
  - Once established, project guidelines should reference them with examples
  - File paths for these configs should probably be in the global read context
  - Use progressive disclosure to keep context tight and targeted
