# ADR-004: Open-SSE Express Sidecar Architecture

## Status

Accepted

## Context

9Router needs to **stream responses** (SSE / Server-Sent Events) from upstream AI providers to clients. Next.js App Router has limited SSE support:

- Response streaming works but has edge cases with middleware
- No native WebSocket support
- Route handlers can't run alongside the proxy middleware for long-lived connections

## Decision

Create **`open-sse/`** as an Express-based sidecar that runs alongside the Next.js server, handling:

- SSE proxy streaming
- Request logging / live monitoring
- Provider health checks via long-lived connections

## Consequences

### Positive

- **Full streaming control** — Express handles chunked responses natively
- **Decoupled** — Next.js manages UI + REST API; Express manages proxy + streaming
- **Performance** — Express handles concurrent streams more efficiently
- **Flexibility** — can add WebSocket support later without touching Next.js

### Negative

- **Two processes** — need to start both Next.js and Express (mitigated by `start` script)
- **Port management** — Next.js on 20128, Express sidecar on separate port
- **Shared state** — both processes access SQLite (safe with WAL mode)
- **Complexity** — developers must understand the dual-server architecture
