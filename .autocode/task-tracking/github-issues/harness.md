# Task Tracking: github-issues adapter — Machine Interface

Satisfies invariant 7 of `core/workflow/task-tracking.md`.

The autonomous harness (`agents/claude-code/scripts/auto-resume-harness.js`) runs outside the model
and cannot act on prose. It needs a machine-readable view of the queue. This adapter provides one.

---

## Declaration

`harness.json` in this directory:

```json
{
  "adapter": "github-issues",
  "phaseStatusCommand": ["sh", "phase-status.sh"],
  "concurrency": "multi-writer"
}
```

The harness resolves the active adapter from `.autocode/task-tracking/ACTIVE`, reads this
`harness.json`, and executes `phaseStatusCommand` with:

- **cwd:** the project root — `gh` infers `{owner}/{repo}` from the git remote there
- **`$AUTOCODE_ADAPTER_DIR`:** the absolute path to this adapter directory

Relative entries in `phaseStatusCommand` are resolved against `$AUTOCODE_ADAPTER_DIR`.

---

## `phase-status.sh`

Lists every issue labelled `autocode:task` and prints the normalized phase model as a single JSON
object on stdout.

```bash
sh .autocode/task-tracking/github-issues/phase-status.sh
```

Output:

```json
{
  "phases": [
    {
      "number": "3",
      "header": "Phase 3: Notify",
      "tasks": [
        {
          "id": "3.1",
          "status": "deferred",
          "description": "Task 3.1: Needs a human",
          "verify": "real Discord webhook test",
          "issue": 46
        }
      ]
    }
  ]
}
```

`issue` is an extra field beyond the contract's required shape. The harness ignores unknown fields;
it is there so a human reading harness logs can jump straight to the issue.

### Status mapping

| Issue state | Normalized status | Counts as remaining |
|---|---|---|
| open, no `status:*` label | `open` | Yes |
| open + `status:in-progress` | `in_progress` | No |
| open + `status:implemented` | `done` | No |
| closed | `done` | No |
| open + `status:deferred` | `deferred` | No |

Precedence when several labels are present: closed beats every label, then
`deferred` > `implemented` > `in-progress`.

### Filtering and ordering

- Issues without the `autocode:task` label are never fetched.
- Issues with no milestone, or whose milestone does not match `^Phase <N>`, are dropped. This is
  the supported way to keep non-autocode work in the same repository.
- Phases are sorted numerically; tasks are sorted by plan ID **segment-wise**, so `1.10` follows
  `1.9` rather than `1.1`.

### Manual-task detection

The script emits `verify`; the harness classifies it against its own marker list. The markers
describe what the *harness* cannot do, so they are not a property of GitHub. Same split as every
other adapter.

### Failure behavior

- Missing `gh` or `jq` → exit non-zero with a pointer to `conventions.md` §Prerequisites.
- `gh issue list` failure (auth, no remote, rate limit) → exit non-zero with a pointer to
  `gh auth status`. The harness treats a non-zero exit as an unreadable tracker and counts the
  session as a failure, tripping its circuit breaker after three consecutive occurrences rather
  than looping against a broken credential.
- No matching issues → `{"phases":[]}`. Not an error; the harness reports no further phases to run.

### Testing without network

`GH` and `JQ` are overridable:

```bash
GH=./fake-gh sh phase-status.sh
```

The harness test suite uses this to exercise the mapping against a fixture, with no GitHub access
and no credentials.

---

## Division of Responsibility

The adapter answers **"what does the tracker say?"** The harness decides **"what do I do about
it?"**

| Concern | Owner |
|---|---|
| Querying GitHub, parsing issues | Adapter (`phase-status.sh`) |
| Normalizing status values | Adapter |
| Selecting the next phase to run | Harness |
| Deciding a phase is blocked | Harness |
| Classifying a task as manual | Harness (marker list) |
| Post-session state detection | Harness |

---

## Related Files

- `core/workflow/task-tracking.md` §Machine Interface — the contract
- `phase-status.sh` — the implementation
- `harness.json` — the declaration
- `conventions.md` §Prerequisites — required binaries and auth scopes
- `agents/claude-code/scripts/auto-resume-harness.js` — the consumer
