# ADR-005: OAuth Provider Pattern for Cloud Integrations

## Status

Accepted

## Context

9Router connects to multiple AI cloud providers (OpenAI, Google, Anthropic, etc.). Each provider has different authentication mechanisms:

- **API Keys** — Simple bearer tokens (most providers)
- **OAuth 2.0** — Token exchange with refresh (Google, some enterprise)
- **Custom headers** — Provider-specific auth headers

## Decision

Implement a **unified OAuth provider pattern** where each cloud provider has:

1. A standardized `ProviderConnection` entity storing credentials
2. A callback-based OAuth flow for providers that support it
3. A fallback to API key auth for providers that don't

## Consequences

### Positive

- **Unified interface** — all providers accessed through the same API
- **Token refresh** — OAuth providers auto-refresh without user intervention
- **Extensible** — new providers follow the same pattern
- **Secure** — credentials stored in SQLite, never exposed to frontend

### Negative

- **Complexity** — OAuth flow requires callback URLs and state management
- **Provider-specific code** — each OAuth provider needs custom implementation
- **Local callback** — OAuth redirect requires local server on known port
