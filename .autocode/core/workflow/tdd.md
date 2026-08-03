# TDD Workflow - Detailed Process

## The TDD Cycle

### RED Phase
1. Write a test that describes desired behavior
2. Test MUST fail before writing implementation
3. Verify failure message is meaningful
4. Failure should be for the RIGHT reason (not syntax error)

```
Example of RIGHT failure:
  ✗ Expected calculateTotal([10, 20]) to equal 30, got undefined

Example of WRONG failure:
  ✗ calculateTotal is not defined
```

### GREEN Phase
1. Write the MINIMUM code to pass the test
2. Don't optimize yet
3. Don't handle edge cases not covered by tests
4. Ugly code that passes is better than elegant code that doesn't exist

### REFACTOR Phase
1. Only refactor when tests are GREEN
2. Run tests after each small change
3. If tests break, undo immediately
4. Improve readability, remove duplication
5. Extract functions if clarity improves

## Test Quality

### Good Tests
- Test one behavior per test
- Use descriptive test names: "should reject negative amounts"
- Test through public APIs
- Use factory functions for test data
- Independent - no test depends on another

### Bad Tests
- Testing implementation details
- Multiple assertions testing different behaviors
- Tests that depend on execution order
- Mocking everything
- Testing private methods directly

## Commit Points

Commit after:
- Each passing test + implementation (RED → GREEN)
- Each refactoring step (if tests still green)

Commit message format:
```
test(scope): add test for [behavior]
feat(scope): implement [behavior]
refactor(scope): extract [what] for clarity
```

## Pre-Commit Hooks and the RED Phase

**If the project has a pre-commit hook that runs the test suite, you cannot commit failing tests.** This is a fundamental conflict with the "commit the test first" TDD ideal.

**Resolution:** When a test-running pre-commit hook is present, batch the RED and GREEN commits — write the failing test, implement just enough to pass it, then commit test + implementation together:

```
test(scope): add test for [behavior]     ← written first, not committed yet
feat(scope): implement [behavior]         ← written second
# Both committed together as one or two commits after GREEN
```

This preserves the RED → GREEN discipline in code order, while respecting the constraint that committed tests must pass.

**Do not skip pre-commit hooks (`--no-verify`)** to force-commit failing tests. The hook is protecting the shared history. Accept the batching compromise instead.

## When Tests Are Hard to Write

If a test is hard to write, it usually means:
1. The code is doing too much → Split it
2. Dependencies are tangled → Inject them
3. Requirements are unclear → Ask for clarification

Never skip the test. Fix the design.

## Coverage

- Aim for behavior coverage, not line coverage
- 100% line coverage with bad tests is worthless
- 80% coverage with good behavioral tests is excellent
- Test edge cases: empty inputs, boundaries, errors

## Test Tiers: Beyond Unit Tests

Unit tests with mocks verify a module in isolation. They cannot verify the *seams* between modules — and seams are where integration bugs live. A module can have 100% green unit tests while the system is broken, because the mock at the boundary encoded an assumption that reality violates. **The mock is the wrong assumption made executable.**

### The Seam-Bug Class

A seam bug is a defect in the wiring *between* units, not inside any unit. Common forms:

- **Contract disagreement** — a writer stores at path A, a reader looks at path B; a serializer emits a shape the deserializer doesn't accept.
- **Missing wiring** — an orchestrator never calls a collaborator it was supposed to. The unit works perfectly; nothing invokes it.
- **Dependency drift** — a real SDK method was removed, renamed, or changed return shape; the mock still returns the old shape.
- **Lifecycle assumption** — a value read synchronously is only ready asynchronously (auth state, lazy init, hydration).

Every one of these passes its unit tests. They surface first in the most expensive environment you have — a real device, a deploy, a manual QA pass — unless a higher tier catches them.

### The Rule: When a Mock Encodes a False Assumption

A mock is a claim about how a boundary behaves. Before mocking any boundary, ask:

> "If the real thing on the other side of this mock changed or disagreed, would any test fail?"

If the answer is no, you have an **untested seam**. Mock *leaf* dependencies you own and fully understand. Do **not** mock the very boundary whose behavior you are unsure of — exercise it for real, or pin it with a contract.

### Choose the Tier by the Risk

| Risk you're guarding against | Tier |
|---|---|
| Logic inside one function | **Unit** (mock collaborators) |
| Producer & consumer agree on a shared shape/path/type | **Contract** (unit tier, do *not* mock the shared shape) |
| A real external boundary behaves as expected (DB, SDK, network, native) | **Integration** (real boundary / emulator, no mock at that seam) |
| An orchestrator actually invokes its collaborators, in order | **Wiring** (assert the calls happen, not just leaf behavior) |

- **Contract test** — assert producer and consumer of a shared interface agree (the path a writer writes is the path a reader reads; output of A parses in B). Cheap, runs in the unit tier, needs no infrastructure. This is the lowest-cost defense against the most common seam bug.
- **Integration test** — exercise the real boundary with no mock at that seam. Slower, but the only thing that catches "the real API doesn't behave like the mock."

A healthy suite has all four tiers. A suite that is *only* mocked unit tests has a hole exactly the size of its seams.

### Error Visibility Is a Testability Property

You can only test behavior you can observe. An error that is silently swallowed is, by definition, not an observable behavior — so it cannot be asserted, and it will surface first in the most expensive environment.

- Never discard a rejected promise (`void someAsync()`) without a `.catch` that records the failure somewhere observable — a log sink, an error event, a status field.
- Treat "the failure is visible" as part of the acceptance criteria, and write a test that asserts the failure path emits its observable signal.
- A swallowed error converts a cheap, local, testable failure into an expensive, remote, un-debuggable one.
