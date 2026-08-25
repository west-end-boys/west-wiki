# TypeScript Tooling

## Essential Tools

### TypeScript Compiler
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### ESLint
```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/strict-type-checked"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json"
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

### Prettier
```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```

## Testing

### Vitest (Recommended)
```bash
npm install --save-dev vitest @vitest/coverage-v8
```

```json
// package.json scripts
{
  "test": "vitest",
  "test:coverage": "vitest --coverage",
  "test:watch": "vitest --watch"
}
```

### Jest (Alternative)
```bash
npm install --save-dev jest ts-jest @types/jest
```

## Package Management

Recommended: **pnpm**
```bash
pnpm install
pnpm add <package>
pnpm add -D <dev-package>
```

Always commit lock files.

## Build Tools

### For Applications
```bash
pnpm add -D tsx esbuild
```

### For Libraries
```bash
pnpm add -D tsup
```

## Development Scripts

```json
// package.json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write src",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "validate": "pnpm typecheck && pnpm lint && pnpm test"
  }
}
```

## Pre-commit Hooks

```bash
pnpm add -D husky lint-staged
npx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"]
  }
}
```

## Recommended VS Code Extensions

- ESLint
- Prettier
- TypeScript Importer
- Error Lens

## Project Init Checklist

1. `pnpm init`
2. `pnpm add -D typescript @types/node`
3. `npx tsc --init`
4. Configure tsconfig.json (strict mode)
5. Add ESLint + Prettier
6. Add Vitest
7. Add husky + lint-staged
8. Create src/ directory
9. Add .gitignore (node_modules, dist)
