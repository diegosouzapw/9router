# ADR-001: SQLite over PostgreSQL for Local Storage

## Status

Accepted

## Context

9Router is a **local-first** API router proxy designed to run on a developer's machine. It needs persistent storage for provider configurations, API keys, combos, usage stats, and settings.

Options considered:

- **PostgreSQL** — Full-featured RDBMS, but requires separate server process, port, auth, and Docker or OS-level installation
- **SQLite** — Embedded, zero-config, single-file database with no external dependencies
- **LowDB/JSON** — Simple file-based storage (original approach)

## Decision

Use **SQLite** (via `better-sqlite3`) as the single storage backend.

## Consequences

### Positive

- **Zero configuration** — no server to install, no ports to open
- **Single file** (`~/.9router/storage.sqlite`) — easy to back up, copy, or reset
- **ACID transactions** — data integrity guarantees that JSON files can't provide
- **Performance** — faster than JSON file I/O for any non-trivial dataset
- **Portable** — works identically on Linux, macOS, and Windows

### Negative

- **No remote access** — can't connect from external tools (acceptable for local tool)
- **Native addon** — `better-sqlite3` requires node-gyp build step
- **Single-writer** — concurrent writes from multiple processes require WAL mode (enabled)
