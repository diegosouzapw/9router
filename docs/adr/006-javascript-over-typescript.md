# ADR-006: JavaScript-First (with TypeScript Path)

## Status

Accepted

## Context

The project started as pure JavaScript. As it grew, the lack of type safety caused:

- Runtime type errors in API handlers
- Difficult refactoring across modules
- Unclear function contracts between components

Options:

- **Stay JavaScript** — fast iteration, no build step overhead
- **Full TypeScript** — maximum safety, significant migration effort
- **Progressive TypeScript** — `allowJs: true`, migrate file by file

## Decision

Use **JavaScript-first with progressive TypeScript adoption**:

1. Add `tsconfig.json` with `allowJs: true`, `strict: false`
2. Create type definitions in `src/types/` for core entities
3. Convert files one at a time, starting with core modules

## Consequences

### Positive

- **No breaking changes** — existing JS files work unchanged
- **Gradual safety** — types added where they matter most first
- **IDE benefits** — IntelliSense and autocomplete immediately via JSDoc + `.d.ts`
- **No build step added** — Next.js handles TypeScript natively

### Negative

- **Inconsistency** — mix of `.js` and `.ts` files during migration
- **Partial coverage** — type errors may slip through untyped boundaries
- **Discipline** — team must follow convention to type new files
