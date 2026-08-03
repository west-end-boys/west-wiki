# TypeScript Coding Conventions

## Naming

### Variables & Functions
- camelCase: `userName`, `calculateTotal`
- Descriptive: `isUserAuthenticated` not `flag`
- Booleans: prefix with is/has/can/should

### Types & Interfaces
- PascalCase: `UserProfile`, `ApiResponse`
- Prefix interfaces with `I` only if project convention
- Prefer `type` for data, `interface` for contracts

### Constants
- SCREAMING_SNAKE_CASE: `MAX_RETRIES`, `API_BASE_URL`
- Or camelCase for object constants: `defaultConfig`

### Files
- kebab-case: `user-profile.ts`, `api-client.ts`
- Test files: `user-profile.test.ts` or `user-profile.spec.ts`
- Types: `types.ts` or `user.types.ts`

## Code Organization

### Imports
Order:
1. Node built-ins
2. External packages
3. Internal absolute imports
4. Relative imports

```typescript
import { readFile } from 'fs';
import express from 'express';
import { UserService } from '@/services';
import { formatDate } from '../utils';
```

### File Structure
```typescript
// 1. Imports
// 2. Types/Interfaces
// 3. Constants
// 4. Main exports (functions, classes)
// 5. Helper functions (private)
```

###  Member Ordering
```typescript
  class Service {
    // 1. Static fields
    // 2. Instance fields
    // 3. Constructor
    // 4. Static methods
    // 5. Public methods
    // 6. Private methods
  }
```

###  Function Size Limits
- Backend: 75 lines max
- Frontend: 150 lines max

## Types

### Prefer Type Inference
```typescript
// Let TS infer when obvious
const name = 'John';  // string inferred
const users = [];     // ❌ any[] - be explicit
const users: User[] = [];  // ✅
```

### Strict Types
- Enable `strict: true` in tsconfig
- Avoid `any` - use `unknown` if type truly unknown
- Use type guards for narrowing

### Type vs Interface
```typescript
// Use type for data shapes
type User = {
  id: string;
  name: string;
};

// Use interface for contracts/behaviors
interface UserRepository {
  findById(id: string): Promise<User>;
  save(user: User): Promise<void>;
}
```

### Readonly
```typescript
// Immutable by default
type Config = {
  readonly apiUrl: string;
  readonly timeout: number;
};
```

### Named Types for Special-Meaning Strings
When a string parameter or field can only have specific constant values, define a named union type and use it to DRY code, and enforce consistency:
```typescript
export type SortBy = 'alphabetical' | 'recent';
export type OwnershipFilter = 'owned' | 'shared' | 'all';
// Use the type in interfaces, function signatures, and state
interface FilterState {
  sortBy: SortBy;
  ownershipFilter: OwnershipFilter;
}
function setSortBy(newSort: SortBy): void { ... }
// Optional validation constants for runtime validation:
export const VALID_SORT_VALUES: ReadonlySet<SortBy> = new Set(['alphabetical', 'recent']);
```

## Error Handling

### Use Explicit Errors
```typescript
// Throw descriptive errors
throw new Error(`User not found: ${userId}`);

// Custom error classes for domains
class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### Handle Promises
```typescript
// Always handle rejections
try {
  await fetchUser(id);
} catch (error) {
  if (error instanceof NotFoundError) {
    return null;
  }
  throw error;  // Re-throw unexpected errors
}
```

## Documentation

### JSDoc for Public APIs
```typescript
/**
 * Calculates the total price including tax.
 * @param items - Cart items to sum
 * @param taxRate - Tax rate as decimal (e.g., 0.08 for 8%)
 * @returns Total price with tax applied
 */
export function calculateTotal(items: CartItem[], taxRate: number): number {
  // ...
}
```

## Formatting

- 2 spaces indentation
- Single quotes for strings
- Semicolons required
- Trailing commas in multiline
- Max line length: 100 characters

Use Prettier with:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```

## Patterns

### Prefer Nullish Coalescing
```typescript
  const count = input ?? 10;
  const name = user.name ?? 'Anonymous';
```

###  Prefer Optional Chaining
```typescript
  const city = user?.address?.city;
  const result = obj.callback?.();
```

###  Explicit Boolean Checks
```typescript
  if (user !== undefined) { ... }
  if (items.length > 0) { ... }
  if (name !== '') { ... }
```

###  Handle All Promises
```typescript
  await saveToDatabase(data);
  onClick={() => void handleSubmit()}
```

###  Await Only Promises
```typescript
  const sync = calculateSync(x);      // no await
  const async = await fetchAsync(x);  // await
```

###  Async Requires Await
```typescript
  // Remove async if no await needed
  function getData(): Promise<User> {
    return fetchFromCache();
  }
```

###  Explicit Return Types (Backend)
```typescript
  function getUser(id: string): Promise<User | null> {
    return userRepository.findById(id);
  }
```

### Early Returns
```typescript
function processUser(user: User | null) {
  if (!user) return null;
  if (!user.isActive) return null;
  // Main logic here
}
```

### Options Objects
```typescript
// For 3+ parameters
function createUser(options: {
  name: string;
  email: string;
  role?: UserRole;
}) { ... }
```

### Result Types
```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### JSX Conditional Rendering
```tsx
{count > 0 ? <Badge count={count} /> : null}
{Boolean(count) && <Badge count={count} />}
```

## Anti-Patterns

- ❌ `any` type
- ❌ Non-null assertions (`!`) without guards
- ❌ Type assertions without validation
- ❌ Nested ternaries
- ❌ Mutable exports
- ❌ Side effects in constructors

## React Coding Conventions

###  Hook Dependencies
```typescript
  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);  // All referenced values listed
```

###  useState Naming
```typescript
  const [data, setData] = useState<Data | null>(null);
  const [isOpen, setIsOpen] = useState(false);
```
