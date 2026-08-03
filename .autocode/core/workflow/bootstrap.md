# Bootstrap Workflow

## META-to be incorporated below

- config rules for deterministic tools (like eslint config rules) should be created appropriate to the needs of each project, e.g. language (typescript) and use case (be vs fe). once established, project guidelines should reference them when creating/editing code, and include examples when needed.

## Purpose

Take a project from zero to a working, committed "hello world" baseline — with all infrastructure in place — before beginning the implementation cycle.

Bootstrap is the bridge between planning and autonomous implementation. It is intentionally narrow: get the scaffolding right, prove the toolchain works end-to-end, and make the first real commit. Feature work starts after bootstrap.

## Prerequisites

Before starting bootstrap, verify:

- [ ] Dev container is running and `autocode` setup has been run inside it
- [ ] `.autocode/` is present (run `setup.sh` from the host if not)
- [ ] Planning docs exist: `REQUIREMENTS.md`, `ARCHITECTURE.md`, `SPECS.md`, `doc/BUILD-TODO.md`
- [ ] Git is initialized (`git init` or cloned from remote)
- [ ] Remote is configured (`git remote add origin <url>`)
- [ ] `npm install` has been run in `.autocode/scripts/` (harness dependency)

## Steps

### 1. Secrets & API Keys

Create the secrets directory structure and environment files:

```bash
mkdir -p secrets
```

Ensure `.gitignore` covers secrets (setup.sh does this, verify):
```
secrets/
.env
*.key
```

Create `.env.example` (committed — template only, no real values):
```bash
# Copy to .env and fill in real values. Never commit .env.
API_KEY=your-api-key-here
DATABASE_URL=postgresql://user:pass@localhost/dbname
```

Create `.env` (gitignored — real values):
```bash
cp .env.example .env
# Edit .env with real credentials
```

For file-based secrets (e.g. webhook URLs used at runtime), write to `secrets/`:
```bash
echo "https://hooks.example.com/..." > secrets/my_webhook_url
```

**Verify nothing sensitive will be committed:**
```bash
git status            # confirm .env and secrets/ are untracked
git diff --cached     # confirm nothing sensitive is staged
```

---

### 2. Linting Configuration

Configure the linter appropriate for the project language. The goal is a clean baseline with zero warnings from an empty/scaffold state.

#### Python

Create `ruff.toml` in the project root:
```toml
line-length = 88
target-version = "py311"

[lint]
select = ["E", "F", "I", "N", "W", "UP"]
ignore = []

[lint.isort]
known-first-party = ["your_package_name"]
```

Verify clean run:
```bash
ruff check . && ruff format --check .
```

If using mypy, create `mypy.ini` or add to `pyproject.toml`:
```toml
[tool.mypy]
python_version = "3.11"
strict = true
```

#### TypeScript

Verify `tsconfig.json` and `eslint.config.js` exist (typically scaffolded by project template). If not, initialize them. Verify clean run:
```bash
npx tsc --noEmit
npx eslint .
```

Add a lint script to `package.json` if not present:
```json
"scripts": {
  "lint": "eslint . && tsc --noEmit",
  "test": "vitest run"
}
```

**Target: zero linting errors on a clean checkout.** Fix any config issues now — don't carry suppressions into the codebase.

---

### 3. TDD Hello World

Prove the test infrastructure works end-to-end with a trivial RED → GREEN cycle. This is not about the feature — it is about confirming the test runner, imports, and module resolution all work before implementing anything real.

#### Python

Write a failing test first:
```python
# tests/test_hello.py
def test_hello_returns_greeting():
    from src.hello import say_hello
    assert say_hello("world") == "Hello, world!"
```

Run to confirm meaningful failure (not a config error):
```bash
pytest tests/test_hello.py
# Expected: FAILED — ModuleNotFoundError or ImportError
```

Implement the minimum to pass:
```python
# src/hello.py
def say_hello(name: str) -> str:
    return f"Hello, {name}!"
```

Run to confirm green:
```bash
pytest tests/test_hello.py
# Expected: 1 passed
```

#### TypeScript

Write a failing test:
```typescript
// src/hello.test.ts
import { sayHello } from './hello';

test('sayHello returns greeting', () => {
  expect(sayHello('world')).toBe('Hello, world!');
});
```

```bash
npm test
# Expected: FAIL — cannot find module
```

Implement:
```typescript
// src/hello.ts
export function sayHello(name: string): string {
  return `Hello, ${name}!`;
}
```

```bash
npm test
# Expected: 1 passed
```

---

### 4. Boundary Inventory & Integration Harness

The hello-world above proves your *unit* runner works. It does not prove your code works across its **boundaries** — the database, external SDKs, native modules, or the seams between your own components. Those are where integration bugs hide, and a mock at a boundary can stay green forever while the real boundary disagrees. Establish the integration tier **now**, at bootstrap, so it exists before any feature is built — not after a seam bug costs you the most expensive feedback loop you have (a real device, a deploy, a manual QA pass).

See `core/workflow/tdd.md` → *Test Tiers: Beyond Unit Tests* for the reasoning.

#### 4a. Inventory the boundaries

List every seam the project crosses. For each, record what's on the other side, how you'll exercise it locally, and the contract that must hold.

| Boundary | Other side | Local exercise | Contract that must hold |
|---|---|---|---|
| Persistence | DB / emulator | local emulator / in-memory / disposable container | paths, schema, query shape |
| External SDK | vendor API | sandbox creds / recorded fixtures | method signatures, return shapes |
| Native module | platform runtime | device / emulator smoke | API present, async timing |
| Internal seam | another module you own | contract test (no real boundary) | shared types / paths agree |

Commit this inventory (a short table in `ARCHITECTURE.md` or `doc/TESTING.md`). It is the checklist the integration suite must eventually cover.

#### 4b. Stand up the integration harness

Pick the lightest *real* exercise per boundary and wire it to run locally with one command:

- **Databases:** local emulator or a disposable container, seeded by the **real** seed code (not hand-written fixtures that drift from production).
- **External SDKs:** sandbox credentials or recorded fixtures; assert real response shapes.
- **Internal seams:** contract tests in the unit tier (no infrastructure) asserting producer and consumer agree.

Keep integration tests on a **separate command/config** so they don't slow the unit loop:
```json
"scripts": {
  "test": "vitest run",
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

#### 4c. Prove one real boundary smoke

Before moving on, prove the harness end-to-end with **one** real boundary crossing — the integration-tier equivalent of the hello-world unit test. Example: write a record through the real persistence layer to the emulator and read it back via the production read path, with **no mock between them**.

Confirm it passes — and confirm it *fails* when you point the reader at the wrong path/shape. A smoke that can't fail has no teeth. This is the integration tier's RED → GREEN.

---

### 5. All Checks Passing

Run the full quality suite — linter, type checker, tests — and resolve every issue before proceeding.

#### Python
```bash
ruff check .           # must exit 0
ruff format --check .  # must exit 0
mypy .                 # must exit 0 (if configured)
pytest                 # must exit 0, all tests green
```

#### TypeScript
```bash
npx eslint .                # must exit 0
npx tsc --noEmit            # must exit 0
npm test                    # must exit 0, all unit tests green
npm run test:integration    # must exit 0, boundary smoke green (if configured in step 4)
```

**All must be clean** — linter, type checker, unit tests, and the integration smoke from step 4. Do not carry suppressions (`# noqa`, `// eslint-disable`) into the initial commit.

---

### 6. Configure Pre-commit Hook

The placeholder installed by `setup.sh` blocks all commits with a warning until this step is done. Replace it with real checks now.

Find the hook:
```bash
# The path was printed during setup.sh — typically:
cat $(git rev-parse --git-dir)/hooks/pre-commit
# Should show the placeholder warning
```

Replace the file body with project-specific checks:

#### Python
```bash
#!/usr/bin/env bash
set -euo pipefail
ruff check .
ruff format --check .
pytest --tb=short -q
```

#### TypeScript
```bash
#!/usr/bin/env bash
set -euo pipefail
npx eslint .
npx tsc --noEmit
npm test -- --passWithNoTests
```

Ensure it is executable and test it directly:
```bash
chmod +x "$(git rev-parse --git-dir)/hooks/pre-commit"
"$(git rev-parse --git-dir)/hooks/pre-commit"
# Must exit 0 with no warning
```

---

### 7. Initial Commit

With all checks passing and the hook configured:

```bash
git add -A
git status          # review what will be committed
git commit -m "chore: bootstrap project"
```

The pre-commit hook runs automatically. If it fails, fix the issue and retry.

The commit should include:
- Project source scaffold and hello world implementation
- Test(s) covering hello world
- Linting config files
- `.env.example` (not `.env`)
- `.gitignore`
- Planning docs (`REQUIREMENTS.md`, `ARCHITECTURE.md`, `SPECS.md`, `doc/BUILD-TODO.md`)
- `.autocode/` (if using `--copy` mode) or symlinks
- `.claude/` (commands, `CLAUDE.md`, `settings.json`)
- Configured `.git/hooks/pre-commit`

---

### 8. Push to Remote

```bash
git push -u origin main
```

Verify the push succeeded and the remote shows the bootstrap commit.

---

## Done ✓

Track these exit criteria with `templates/BOOTSTRAP-CHECKLIST.md.template` — copy it to `doc/BOOTSTRAP-CHECKLIST.md` and mark each item as you go: [ ] Planned → [~] In progress (when relevant) → [o] Implemented → [x] Verified.

Bootstrap is complete when:

- [ ] `git log --oneline` shows the bootstrap commit on main
- [ ] Remote is up to date (`git status` shows "Your branch is up to date")
- [ ] Pre-commit hook runs without the placeholder warning
- [ ] All linting and tests pass on a clean run
- [ ] Boundary inventory committed (step 4a)
- [ ] Integration harness runs (`npm run test:integration` / `make test-integration`) with at least one real boundary smoke green (step 4c)
- [ ] No swallowed async failures — startup/boot errors land in an observable sink

The project is now ready for the implementation cycle. Next:
1. Review `doc/BUILD-TODO.md` with the agent — confirm phase 1 tasks are clear
2. Initialize the TASKLOG: see `core/workflow/planning.md` → *Initializing TASKLOG*
3. Start the harness (autonomous) or `/project:task-cycle` (supervised)

## Related Files

- `core/workflow/planning.md` — full planning workflow and TASKLOG initialization
- `core/workflow/implementation.md` — task execution cycle
- `core/workflow/tdd.md` — *Test Tiers: Beyond Unit Tests* (the reasoning behind step 4)
- `templates/BOOTSTRAP-CHECKLIST.md.template` — copyable acceptance checklist with status indicators
- `core/principles/best-practices.md` — secrets management, security patterns
- `agents/claude-code/scripts/auto-resume-harness.js` — autonomous execution harness
