# ADR-003: Next.js App Router as Full-Stack Framework

## Status

Accepted

## Context

9Router needs both a **dashboard UI** and **API proxy endpoints**. We needed to decide between:

- **Separate frontend + backend** — React + Express (or Fastify) as independent services
- **Next.js Pages Router** — Mature, well-tested, but older API patterns
- **Next.js App Router** — Modern React Server Components, route handlers, middleware

## Decision

Use **Next.js App Router** (v16) as the full-stack framework for both UI and API.

## Consequences

### Positive

- **Single deployment unit** — one `npm start` serves both UI and API
- **React Server Components** — reduced client bundle size for server-rendered content
- **File-based routing** — intuitive route structure in `src/app/`
- **Middleware** — proxy routing, auth, and SSE handled in Next.js middleware
- **Hot reload** — rapid development with `next dev`

### Negative

- **Cold start** — Next.js server takes ~3-5s to start vs Express ~200ms
- **API route limitations** — no WebSocket support (mitigated by `open-sse/` Express sidecar)
- **Complexity** — `"use client"` / `"use server"` boundaries require careful thinking
- **Opinionated** — locked into Next.js conventions for routing, layouts, data fetching
