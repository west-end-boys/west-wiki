# TypeScript Testing

## Framework

Recommended: **Vitest** or **Jest**

Vitest preferred for:
- Faster execution
- Native ESM support
- Compatible with Jest API

## Test Organization

### File Structure
```
src/
├── services/
│   ├── user-service.ts
│   └── user-service.test.ts    # Co-located
└── __tests__/                   # Or separate directory
    └── integration/
```

### Test File Structure
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from './user-service';

describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', () => {
      // Arrange
      // Act
      // Assert
    });

    it('should reject invalid email', () => {
      // ...
    });
  });
});
```

## Naming

```typescript
// Describe blocks: noun (the thing)
describe('UserService', () => {
  describe('createUser', () => {
    // It blocks: should + behavior
    it('should return user with generated id', () => {});
    it('should throw when email is invalid', () => {});
    it('should hash password before storing', () => {});
  });
});
```

## Arrange-Act-Assert

```typescript
it('should calculate total with tax', () => {
  // Arrange
  const items = [
    { price: 100, quantity: 2 },
    { price: 50, quantity: 1 },
  ];
  const taxRate = 0.1;

  // Act
  const total = calculateTotal(items, taxRate);

  // Assert
  expect(total).toBe(275);  // (200 + 50) * 1.1
});
```

## Factory Functions

```typescript
// Create test data factories
function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-id',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date(),
    ...overrides,
  };
}

// Usage
it('should update user name', () => {
  const user = createUser({ name: 'Original' });
  const updated = updateUser(user, { name: 'New Name' });
  expect(updated.name).toBe('New Name');
});
```

## Mocking

### Prefer Dependency Injection
```typescript
// Production
const service = new UserService(realDatabase);

// Test
const mockDb = { findById: vi.fn() };
const service = new UserService(mockDb);
```

### Mock Modules Sparingly
```typescript
vi.mock('./database', () => ({
  query: vi.fn(),
}));
```

### Spies for Verification
```typescript
const spy = vi.spyOn(logger, 'error');
await processWithError();
expect(spy).toHaveBeenCalledWith(expect.stringContaining('failed'));
```

### Don't Mock the Boundary You're Unsure About
A mock encodes a claim about how a boundary behaves. If that claim can be wrong — a real SDK, a database, another team's module — a green test built on it proves nothing. Mock *leaf* dependencies you own; for boundaries whose behavior you're unsure of, write a **contract test** (assert producer and consumer agree) or an **integration test** (exercise the real boundary / emulator). See `core/workflow/tdd.md` → *Test Tiers: Beyond Unit Tests*.

## Async Testing

```typescript
// Async/await (preferred)
it('should fetch user', async () => {
  const user = await userService.findById('123');
  expect(user.name).toBe('John');
});

// Error testing
it('should throw when user not found', async () => {
  await expect(userService.findById('missing'))
    .rejects.toThrow('User not found');
});
```

## Coverage

### Configuration (vitest.config.ts)
```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.test.ts', '**/types.ts'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### Focus on Behavior Coverage
- Don't chase 100% line coverage
- Test all behaviors, including edge cases
- Skip trivial getters/setters

## TDD Cycle

1. **RED**: Write test describing desired behavior
   ```typescript
   it('should reject empty name', () => {
     expect(() => createUser({ name: '' }))
       .toThrow('Name is required');
   });
   ```

2. **GREEN**: Minimal implementation
   ```typescript
   function createUser({ name }: CreateUserInput) {
     if (!name) throw new Error('Name is required');
     // ... rest
   }
   ```

3. **REFACTOR**: Clean up, tests stay green

## Anti-Patterns

- ❌ Testing implementation details
- ❌ Snapshot tests for logic (use for UI only)
- ❌ `any` in test types
- ❌ Shared mutable state between tests
- ❌ Skipped tests without issue reference
