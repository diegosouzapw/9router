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

### API Key Providers (DeepSeek, Groq, xAI, Mistral, Perplexity, Together, Fireworks, Cerebras, Cohere, NVIDIA)

- All use OpenAI-compatible format and DefaultExecutor
- Translations follow the standard OpenAI hub format path
- No provider-specific Responses API support; only Chat Completions format

## Additional Endpoints

### Embeddings (`/v1/embeddings`)

OpenAI-compatible embedding generation endpoint. Supported providers:

| Provider     | Auth    | Models                                           |
| ------------ | ------- | ------------------------------------------------ |
| Nebius       | API Key | BAAI/bge-en-icl, Qwen/Qwen3-Embedding-8B         |
| OpenAI       | API Key | text-embedding-3-small, text-embedding-3-large   |
| Mistral      | API Key | mistral-embed                                    |
| Together AI  | API Key | BAAI/bge-large-en-v1.5, togethercomputer/m2-bert |
| Fireworks AI | API Key | nomic-ai/nomic-embed-text-v1.5                   |
| NVIDIA NIM   | API Key | nvidia/nv-embedqa-e5-v5                          |

### Image Generation (`/v1/images/generations`)

OpenAI-compatible image generation endpoint. Supported providers:

| Provider     | Auth    | Models                                          |
| ------------ | ------- | ----------------------------------------------- |
| OpenAI       | API Key | dall-e-3, dall-e-2                              |
| xAI (Grok)   | API Key | grok-2-image                                    |
| Together AI  | API Key | FLUX.1-schnell, FLUX.1-dev, FLUX.1.1-pro        |
| Fireworks AI | API Key | FLUX-1-schnell, FLUX-1-dev, stable-diffusion-xl |

### Enhanced Models Endpoint (`/v1/models`)

Now returns chat, embedding, and image models in a unified list. Each model includes:

- `type` field: `"chat"`, `"embedding"`, or `"image"`
- Embedding models include `dimensions` metadata
- Image models include `sizes` metadata
