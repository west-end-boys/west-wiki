# Best Practices

## Code Organization

### File Structure
- One concept per file
- Group related files in directories
- Keep files under 300 lines
- Separate concerns: data, logic, presentation

### Naming
- Variables: describe the value (`userCount`, not `n`)
- Functions: describe the action (`validateEmail`, not `check`)
- Booleans: use is/has/can prefix (`isValid`, `hasPermission`)
- Constants: SCREAMING_SNAKE_CASE

### Functions
- Do one thing
- Take few parameters (≤3 ideal, >5 is a smell)
- Return early to avoid deep nesting
- Pure when possible (same input → same output)

## Error Handling

### Principles
- Fail fast and explicitly
- Provide actionable error messages
- Don't swallow errors silently
- Log errors with context

### Pattern
```
// Good
if (!user) {
  throw new Error(`User not found: ${userId}`);
}

// Bad
if (!user) return null;  // Caller has no idea why
```

## Dependencies

- Minimize external dependencies
- Pin versions for reproducibility
- Evaluate security and maintenance status
- Prefer well-maintained, focused libraries

## Configuration

- No hardcoded values for environment-specific settings
- Use environment variables or config files
- Provide sensible defaults
- Document all configuration options

## Scripts Intended for the Permission Allowlist

Claude Code's permission system allowlists a *literal command string*, not a script's behavior. A
script that is safe to run unattended is still useless for the allowlist if it is never invoked the
same way twice.

- **Invoke it as a single bare command per call.** `script.sh --flag value ...` — no `set -e`
  wrapper, no `$(...)` capture, no `&&` chaining with other commands, no surrounding `echo`. A
  multi-line shell block never matches a clean `Bash(script.sh:*)` allowlist pattern, no matter how
  safe the script itself is.
- **Design the script's interface for this.** Fixed flags, explicit validation, a narrow set of
  permitted operations (e.g. `--body-file` instead of an inline string, so callers never need shell
  quoting gymnastics inside the command). The narrower the interface, the more confidently a human
  can allowlist it.
- **Chain values across calls by reading tool output, not shell variables.** If one invocation's
  result (a created resource's ID, say) is needed by a later call, read it from that call's returned
  output and pass it as a literal argument to the next call — do not thread it through a shell
  variable spanning multiple invocations, since that reintroduces the multi-command wrapping this
  practice exists to avoid.
- **Prefer the dedicated file-write tool over shell heredocs** (`cat > file <<EOF`) for any content
  the script will consume via a flag like `--body-file`. A heredoc is itself a multi-line shell
  invocation subject to the same allowlist problem; writing the file directly keeps the actual
  command call to the single bare invocation above.

## Documentation

### Code Comments
- Explain WHY, not WHAT
- Update comments when code changes
- Delete obsolete comments
- Use JSDoc/docstrings for public APIs

### README
- Quick start (get running in 5 minutes)
- Prerequisites
- Installation
- Usage examples
- Configuration options

### Project Documentation Practices

**Volatility separation** — Separate documents by how fast their contents change, not just by topic. A document that mixes facts with different half-lives (e.g., stable rules alongside task progress) will always be partially stale. Assign each fact to the document whose update cadence matches its own.

| Change frequency | Belongs in |
|---|---|
| Every few minutes / per task | Task record (`record.*`) |
| Every few hours / per task | Task queue (`task.*`), `PROJECT-TODO.md` |
| Every few tasks / phase | `USAGE.md` (how te use the project) |
| Rarely / never | Phase plan, `README.md` (project goals), ADR |

**Single Source of Truth** — Each fact lives in exactly one authoritative location. All other documents reference it with a link; they never copy it. Every duplicate is a future inconsistency.

- ✅ "See `doc/ARCHITECTURE.md` for the source layout."
- ❌ Copying the source tree into `CLAUDE.md` (will diverge within days)

**Scope clarity** — Every document has a job. Know what it is, and do not let it drift. Common jobs in a Claude Code project:

| Document | Job |
|---|---|
| `CLAUDE.md` | Stable process rules, non-negotiable constraints, codebase gotchas |
| `ARCHITECTURE.md` | Component map, source layout, data flow, security model |
| `DEVELOPMENT.md` | Code conventions, access patterns, rationale |
| `SPECS.md` | Normative schemas, contracts, env vars |
| Phase plan | Ordered task breakdown, acceptance criteria — human-approved, frozen, **no status** |
| Task queue | Task status, assignment, dependency state — the single home for status |
| Task record | Mini-plan, TDD progress, review results, outcome — append-only |
| `LESSONS.md` | Deferred learnings, project-specific patterns |

The last three are managed through the operations in `core/workflow/task-tracking.md`; which files
(if any) back them is the bound adapter's business. Splitting the plan from the queue is a direct
application of volatility separation: a frozen plan and a per-minute status field have no business
sharing a document.

**Minimum surface area** — Every line added to `CLAUDE.md` is a maintenance commitment. The correct default when information already exists in another document is a link, not a copy. A smaller `CLAUDE.md` is easier to keep accurate and easier to read cold.

**Lead with the correct action, not the wrong one** — A warning that opens with the mistake ("Don't do X") makes a skimming reader process X before the negation — the "don't think of a pink elephant" effect — so the named wrong action is often what sticks, not the prohibition on it. Put the correct action first and in the position/emphasis (bold, sentence-initial) a skimmer's eye lands on; demote the wrong action to a brief, unemphasized aside, and only name it at all when recognition requires it (e.g., it matches a command the reader might already have in their history). Where both convey the same fact, prefer describing the desired end state ("gateway's config has no KV binding") over an imperative prohibition ("don't add a KV binding").

## Performance

- Don't optimize prematurely
- Measure before optimizing
- Optimize the bottleneck, not everything
- Document performance-critical code

## Security

### Secrets Management
- **Never commit secrets** - use environment variables (`.env`)
- Template file: `_env.example` (committed, no real values). The leading underscore keeps the
  template visible in a default directory listing, and keeps it from matching the `.env*` ignore
  pattern so no negation rule is needed.
- Real secrets: `.env` (gitignored, never committed)
- Test setup: Use obviously fake placeholders with clear comments
  ```
  // FAKE-API-KEY-FOR-MOCKED-TESTS-ONLY (not real, external APIs mocked)
  ```
- Load from env: `process.env.API_KEY` or throw error if missing
- Rotate immediately if secret is accidentally exposed
- **Alert immediately on leakage** - if real secrets (not placeholders/variables) are EVER present in context window, ALERT the user IMMEDIATELY and recommend that the credentials be reset/rotated.

### Input Validation
- Validate all external inputs (user, API, file)
- Use parameterized queries (prevent SQL injection)
- Sanitize outputs (prevent XSS)
- Validate file uploads (type, size)

### Authentication & Authorization
- Require authentication for protected resources
- Check authorization before data access
- Use secure session management
- Follow OAuth/OIDC best practices

### Dependencies
- Use latest stable version for additions (search if needed)
- Keep dependencies updated
- Review security advisories
- Minimize attack surface
- Follow principle of least privilege

### Pre-commit Enforcement
- Add `.env*` patterns to `.gitignore`
- Use pre-commit hooks to scan for secrets
- Block commits containing secrets
- Run security linters in CI

### .gitignore Negation Pattern
To ignore a directory's contents but keep specific files (e.g., example configs):
```
config/*                  # ignores contents
!config/_*.example.*      # un-ignores examples
```
**Do not use `config/` (directory match) with negation** — git cannot un-ignore files inside a matched directory. Use `config/*` (glob matching contents) instead.

## Autonomous Operation & Runaway Prevention

Any system that runs autonomously (agents, scheduled jobs, retry loops, background workers) must be designed with hard limits to prevent runaway behavior and resource spikes.

### Circuit Breakers
- Define a maximum number of consecutive failures before halting entirely
- Distinguish transient failures (retry) from permanent ones (stop)
- Log clearly when the circuit opens; notify operators
- Require explicit human action to reset, not automatic re-enabling

### Exponential Backoff
On repeated failures, increase wait time between retries exponentially with a cap:
```
wait = min(BASE_SECS * 2^(attempt - 1), MAX_SECS)
```
- `BASE_SECS`: starting delay (e.g., 60s)
- `MAX_SECS`: ceiling to prevent infinite backoff (e.g., 600s)
- Add jitter (randomness) in high-concurrency systems to avoid thundering-herd

### Hard Session / Iteration Caps
- Define `MAX_ITERATIONS` for any loop that could run indefinitely
- When the cap is reached, stop and alert rather than continue silently
- Size caps conservatively; raise them deliberately, not by default

### Minimum Gaps Between Operations
- Enforce a minimum wall-clock delay between the end of one operation and the start of the next, when throughput is not a performance metric
- Prevents tight loops caused by operations that fail immediately

### Health Checks on Completion
- Verify that completed operations actually produced the expected result
- Flag suspiciously fast completions as potentially erroneous (e.g., an empty response exiting in < 1s)
- Track "healthy completion" vs "fast exit without signal" separately

### Suspend / Resume Controls
- Provide a clean pause mechanism that doesn't require killing the process (e.g., a sentinel file)
- Respect the pause before starting the next unit of work, not mid-operation
- Log suspension and resumption events

### State Persistence
- Persist enough state to resume after a crash without re-doing completed work
- Store state atomically (write to temp file, rename) to prevent corruption
- On startup, validate loaded state before trusting it

### Notifications on Human-Required Events
- Emit a notification whenever the system halts and needs human input
- Include enough context (phase, last session ID, reason) to act without reading logs
- Keep notification channels separate from the execution path — a notification failure must not crash the worker
