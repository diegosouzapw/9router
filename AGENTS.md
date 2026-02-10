# 9router — Codex Review Guidelines

## Project

AI API proxy/router with multi-provider support (OpenAI, Anthropic, Gemini, Fireworks, etc.)

## Stack

- Next.js 16 (App Router)
- Node.js, ES Modules
- lowdb (JSON file-based database)
- SSE streaming for chat completions

## Review Focus

### Security

- No hardcoded API keys or secrets
- Auth middleware on all API routes
- Input validation on user-facing endpoints

### Architecture

- Provider requests go through `open-sse/handlers/chatCore.js`
- Translations between formats use `translator/` modules
- Provider connections persist via `src/lib/localDb.js`
- New providers register in `src/shared/constants/providers.js`

### Code Quality

- Consistent error handling with try/catch
- Proper HTTP status codes
- No memory leaks in SSE streams (abort signals, cleanup)
- Rate limit headers must be parsed correctly

### Review Mode

- Provide analysis and suggestions only
- Focus on bugs, security, performance, and best practices
