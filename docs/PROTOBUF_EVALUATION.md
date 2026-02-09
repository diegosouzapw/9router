# Protobuf Library Evaluation

> Decision document for replacing `cursorProtobuf.js` with a native protobuf library.

## Current Approach

`open-sse/utils/cursorProtobuf.js` implements a custom protobuf encoder/decoder (~610 lines) reverse-engineered from Cursor client traffic. It handles:

- Wire-format primitives (varint, length-delimited, fixed32/64)
- Message encoding for ConnectRPC request framing
- Response decoding with text, thinking, and tool call extraction
- gzip compression/decompression for ConnectRPC frames

## Libraries Evaluated

### 1. `protobufjs` (npm)

| Metric                    | Value                                         |
| ------------------------- | --------------------------------------------- |
| Bundle size               | ~180KB (minified)                             |
| Proto definition required | Yes (`.proto` file or reflection)             |
| Performance               | ~2-5× faster than custom for complex messages |
| Maintenance               | Mature, widely used                           |

**Pros:**

- Well-tested edge case handling (varint overflow, nested messages)
- Code generation from `.proto` files
- TypeScript support

**Cons:**

- Requires `.proto` definitions we don't have (Cursor's schema is proprietary)
- Would need reflection-based setup, negating much of the performance gain
- Large dependency for a single use case

### 2. `@bufbuild/protobuf` (modern alternative)

| Metric                    | Value                       |
| ------------------------- | --------------------------- |
| Bundle size               | ~60KB (tree-shakeable)      |
| Proto definition required | Yes (uses `protoc` codegen) |
| Performance               | Comparable to protobufjs    |
| Maintenance               | Active, backed by Buf       |

**Pros:**

- Modern ESM-first design
- Smaller footprint via tree-shaking
- Better TypeScript ergonomics

**Cons:**

- Same `.proto` requirement issue
- Requires build step for code generation
- Less community adoption

## Recommendation

**Keep the custom implementation** (`cursorProtobuf.js`).

### Rationale

1. **No `.proto` file available** — Cursor's protocol is proprietary and reverse-engineered. Both libraries require schema definitions to provide their main benefits (type safety, validation, performance). Without a `.proto` file, we'd use reflection mode, which is slower than our custom code.

2. **Schema versioning already added** — Phase 5.3 added `PROTOBUF_SCHEMA_VERSION`, unknown field detection, and graceful decode fallback. These address the main correctness concerns.

3. **Performance is adequate** — The protobuf codec processes one message per streaming chunk. Profiling shows sub-millisecond encode/decode times, well within acceptable latency.

4. **Dependency cost** — Adding 60-180KB for a single provider's binary format is disproportionate.

### When to Reconsider

- If Cursor publishes their `.proto` definitions
- If we add multiple protobuf-based providers
- If decode errors become frequent (indicating protocol drift)
