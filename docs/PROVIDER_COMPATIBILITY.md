# Provider Compatibility — Responses API

9router translates between OpenAI Chat Completions, Claude, Gemini, and the OpenAI Responses API. This document lists known limitations when using the Responses API format.

## Supported Features

| Feature                                  | Status       | Notes                                     |
| ---------------------------------------- | ------------ | ----------------------------------------- |
| `input` messages (user/assistant)        | ✅ Supported | Translated to Chat Completions `messages` |
| `instructions` (system prompt)           | ✅ Supported | Mapped to `system` message                |
| `function_call` / `function_call_output` | ✅ Supported | Mapped to `tool_calls` / `tool` messages  |
| `reasoning` items                        | ✅ Supported | Preserved via `reasoning_content`         |
| `temperature`, `max_tokens`, `top_p`     | ✅ Supported | Passed through                            |
| Streaming                                | ✅ Supported | Full event-by-event translation           |

## Unsupported Features

These features are **not translatable** through the 9router proxy. Requests using them will return a `400` error with a clear message.

| Feature                        | Status           | Reason                                                 |
| ------------------------------ | ---------------- | ------------------------------------------------------ |
| `file_search` tool type        | ❌ Not supported | Requires OpenAI-specific vector store infrastructure   |
| `code_interpreter` tool type   | ❌ Not supported | Requires OpenAI-specific sandbox execution             |
| `web_search_preview` tool type | ❌ Not supported | Provider-specific search integration                   |
| `background` mode              | ❌ Not supported | Requires async job polling not available via proxy     |
| `previous_response_id`         | ⚠️ Ignored       | Multi-turn threading handled via `input` array instead |
| `store`                        | ⚠️ Ignored       | Response storage not available via proxy               |

## Error Format

Unsupported features return HTTP 400:

```json
{
  "error": {
    "message": "Unsupported Responses API feature: file_search tool type is not supported by 9router",
    "type": "unsupported_feature",
    "code": "unsupported_feature"
  }
}
```

## Provider-Specific Notes

### Claude (via 9router)

- `reasoning` items are translated to Claude's `thinking` blocks
- Tool call IDs may be remapped during translation

### Gemini (via 9router)

- `reasoning` items are translated to Gemini's `thought` parts
- Image content in messages uses a text placeholder (`[Image content]`)

### Codex (native Responses API)

- When Codex is the target provider, requests are forwarded natively without translation
- All Responses API features supported by Codex work directly
