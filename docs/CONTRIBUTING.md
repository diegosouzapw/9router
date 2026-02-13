# Contributing to 9router

Thank you for contributing! This guide covers conventions, naming rules, and standards to keep the codebase consistent.

## Language

All code, comments, variable names, function names, and documentation **must be in English**.

## Naming Conventions

### Provider Identifiers

| Term            | Format                   | Example                               | Used In                             |
| --------------- | ------------------------ | ------------------------------------- | ----------------------------------- |
| `providerId`    | Canonical long-form name | `"claude"`, `"codex"`, `"gemini-cli"` | Handlers, services, executors, DB   |
| `providerAlias` | Short 2-letter code      | `"cc"`, `"cx"`, `"gc"`                | Model strings (`"cc/opus-4-6"`), UI |

**Rules:**

- Use `providerId` internally (handlers, services, executors, database)
- Use `providerAlias` only in: model strings, UI display, `PROVIDER_MODELS` keys
- Function parameters: use `providerId`, never a bare `provider` when ambiguous

### Variables and Functions

- **camelCase** for variables and functions: `refreshToken`, `getAccessToken`
- **PascalCase** for classes: `BaseExecutor`, `CursorExecutor`
- **UPPER_SNAKE_CASE** for constants: `FETCH_TIMEOUT_MS`, `HTTP_STATUS`
- **Prefix boolean variables** with `is`, `has`, `should`: `isActive`, `hasToken`
- **Prefix async functions** that mutate state with the action: `createProviderNode`, `deleteCombo`

### Files

- **kebab-case** for filenames: `token-refresh.js`, `stream-helpers.js`
- Exception: existing files use camelCase (e.g., `tokenRefresh.js`) — don't rename for now, but prefer kebab-case for new files

## Module System

The project uses **ES Modules (ESM)** with `import`/`export`. Do **not** use `require()` except where interop with CommonJS is explicitly needed (e.g., some Next.js internals).

## Error Handling

### Executor Error Contract

All executors must return an `ExecutorResult` shape:

```js
{
  success: true,
  response: Response,  // HTTP Response object
}
// or on failure:
{
  success: false,
  status: 500,         // HTTP status code
  error: "message",    // Human-readable error
  retryAfterMs: 5000,  // Optional retry delay
}
```

### Token Refresh Errors

- Always return `null` on refresh failure (never throw)
- Log the error with the structured logger
- Let the caller decide how to handle the null result

## Logging

Use the structured logger from `open-sse/utils/logger.js`:

```js
import { logger } from "../utils/logger.js";
const log = logger("MY_TAG");
log.info("Something happened", { key: "value" });
```

For request-scoped logging with correlation:

```js
import { createLogger, generateRequestId } from "../utils/logger.js";
const reqLog = createLogger(generateRequestId());
reqLog.info("AUTH", "Token refreshed", { provider: "claude" });
```

**Log levels:** `debug`, `info`, `warn`, `error` — controlled by `LOG_LEVEL` env var.

## Environment Variables

- All configurable values should read from `process.env` with a fallback default
- Document new env vars in `.env.example`
- Sensitive values (secrets, tokens) must **never** be hardcoded in source

## Git Workflow

1. Create a feature branch: `fix/description` or `refactor/description`
2. Commit with clear messages: `fix: add fetch timeout to BaseExecutor`
3. One logical change per commit
4. Open a Pull Request with a summary of changes

## Testing

- **Unit tests** (Node.js test runner): `npm run test:plan3`
- **E2E tests** (Playwright): `npm run test:e2e`
- **Build check**: `npm test` (alias for `npm run build`)
- **Syntax checks**: `node --check <file>`
- **Manual streaming test**: `tester/translator/testFromFile.js`
- Test credentials with the dashboard UI or API endpoints

## Workspace

The `open-sse/` directory is an **npm workspace** published as `@9router/open-sse`. In source code, import it via:

```js
import { translateRequest } from "@9router/open-sse/translator";
```

Next.js transpiles the workspace via `transpilePackages` in `next.config.mjs`.
