# SQLite Migration Evaluation

> Decision document for migrating from LowDB (JSON file) to SQLite.

## Current Approach

9router uses LowDB with a `withWriteLock` wrapper for data persistence:

- **File:** `src/lib/localDb.js`
- **Storage:** `data/db.json` (single JSON file)
- **Concurrency:** Custom write lock prevents race conditions
- **Data:** Provider connections, API keys, usage stats, settings

## Evaluation

### Pros of SQLite Migration

| Benefit           | Impact                                         |
| ----------------- | ---------------------------------------------- |
| ACID transactions | Eliminates write lock complexity               |
| Query performance | O(log n) lookups via indexes vs O(n) JSON scan |
| Concurrent reads  | No read blocking during writes                 |
| Data integrity    | Schema enforcement, foreign keys               |
| Scalability       | Handles millions of rows efficiently           |

### Cons of SQLite Migration

| Cost                  | Impact                                       |
| --------------------- | -------------------------------------------- |
| Migration complexity  | Must migrate existing `db.json` data         |
| Dependency            | `better-sqlite3` requires native compilation |
| Docker build          | Native addon needs build tools in container  |
| Next.js compatibility | Edge runtime doesn't support native modules  |
| Current scale         | Dataset is small (<1000 records typically)   |

## Data Volume Assessment

Typical 9router installation:

| Table                | Est. Rows  | Growth Rate |
| -------------------- | ---------- | ----------- |
| Provider connections | 5-20       | Static      |
| API keys             | 1-5        | Static      |
| Combos               | 5-15       | Static      |
| Usage logs           | 100-10,000 | ~100/day    |
| Settings             | 1          | Static      |

**Total:** Under 10,000 rows for most deployments.

## Recommendation

**Defer migration. Keep LowDB.**

### Rationale

1. **Scale doesn't justify it** — With <10K rows and write lock already in place, LowDB handles the load fine.

2. **Native dependency risk** — `better-sqlite3` requires `node-gyp` and C++ compiler in Docker builds, adding build complexity and image size.

3. **Write lock works** — Phase 2.2 already solved the concurrency issue with `withWriteLock`.

4. **Usage data is the only growth concern** — If usage logs grow large, a targeted solution (e.g., periodic cleanup, separate usage file) is simpler than full migration.

### When to Reconsider

- If usage logs exceed 100K records and queries slow down
- If multiple server instances need shared database access
- If complex queries (joins, aggregations) are needed for analytics
- If `better-sqlite3` gains WASM support for Edge runtime
