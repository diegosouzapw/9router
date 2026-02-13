# ADR-002: LowDB Dual-Storage (Legacy → SQLite Migration)

## Status

Accepted — Superseded (LowDB removed in P1.2)

## Context

The project originally used LowDB (JSON file-based) for usage tracking (`usageDb.js`) while provider/combo data had already migrated to SQLite. This created a **dual-storage** situation with two different persistence mechanisms.

## Decision

Migrate LowDB usage data to SQLite (completed in P1.2), maintaining the same public API surface.

## Consequences

### Positive

- **Single storage engine** — all data in one SQLite database
- **Atomic operations** — usage writes participate in transactions
- **Better performance** — SQLite WAL mode handles concurrent reads/writes
- **Auto-migration** — existing JSON data migrated transparently on first run

### Negative

- **LowDB still in package.json** — kept as dependency for potential backward compat (can be removed)
- **Migration code** — one-time migration logic adds complexity (but runs only once)
