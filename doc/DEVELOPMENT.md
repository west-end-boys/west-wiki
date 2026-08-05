# Development

Local environment setup and day-to-day dev workflow. See [`doc/REPO-STRUCTURE.md`](REPO-STRUCTURE.md)
for repo layout and document ownership.

---

## Setup

### Git hooks

Hooks live in `.githooks/` (tracked) instead of `.git/hooks/` (per-clone, untracked -- `git add`
silently ignores anything under `.git/`). Point git at the tracked directory once per clone:

```
git config core.hooksPath .githooks
```

Change hook behavior by editing the file under `.githooks/` and committing it like any other file.

`.githooks/pre-commit` skips checks entirely when every staged file is markdown (`.md` /
`.markdown`). Any other staged file -- alone or mixed with markdown -- runs the configured checks.
