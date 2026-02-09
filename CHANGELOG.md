# v0.2.73 (2026-02-09)

## Features

- Expanded provider registry from 18 → 28 providers:
  - **Phase 1:** DeepSeek, Groq, xAI (Grok), Mistral, Perplexity — high-priority API Key providers.
  - **Phase 4:** Together AI, Fireworks AI, Cerebras, Cohere, NVIDIA NIM — medium-priority API Key providers.
  - All use `DefaultExecutor` with OpenAI-compatible format.
- Added `/v1/embeddings` endpoint with 6 providers and 9 embedding models:
  - Nebius, OpenAI, Mistral, Together AI, Fireworks AI, NVIDIA NIM.
  - New handler (`open-sse/handlers/embeddings.js`), registry (`open-sse/config/embeddingRegistry.js`), and Next.js route.
- Added `/v1/images/generations` endpoint with 4 providers and 9 image models:
  - OpenAI (DALL-E), xAI (Grok Image), Together AI (FLUX), Fireworks AI.
  - New handler (`open-sse/handlers/imageGeneration.js`), registry (`open-sse/config/imageRegistry.js`), and Next.js route.
- Added `<think>` tag parser (`open-sse/utils/thinkTagParser.js`) for reasoning models (DeepSeek, Qwen).
  - Supports both full-text extraction and streaming delta processing.
- Enhanced `/v1/models` endpoint to list chat, embedding, and image models with type metadata.
- Updated `open-sse/index.js` with exports for new handlers, registries, and utilities.

## Frontend

- Added "Available Endpoints" card to the Endpoint page with collapsible sections for Chat Completions (127 models), Embeddings (9 models), and Image Generation (9 models), grouped by provider.
- Added Nebius AI to `providers.js` with icon, color, and text icon.
- Generated 11 provider PNG icons (128×128) from SVG for all new providers.
- Added auto-open of Add Connection modal when a provider detail page has zero connections.
- Updated Translator debug page with all 28 providers (was missing 12).

# v0.2.72 (2026-02-08)

## Features

- Split Kimi into dual providers: `kimi` (OpenAI-compatible) and `kimi-coding` (legacy Moonshot API), with separate model catalogs, icons, and routing (`f40ab34`).
- Added hybrid CLI runtime support with Docker profiles: `runner-base` (minimal) and `runner-cli` (bundled CLIs), host-mount mode, per-tool env overrides (`CLI_*_BIN`, `CLI_EXTRA_PATHS`), and generic `/api/cli-tools/runtime/[toolId]` endpoint (`871db97`).
- Hardened cloud sync/auth flow with SSE fallback for non-streaming calls, added security test scripts for Docker hardening, cloud endpoint compatibility, and end-to-end sync validation (`6c87ba3`).

# v0.2.66 (2026-02-06)

## Features

- Added Cursor provider end-to-end support, including OAuth import flow and translator/executor integration (`137f315`, `0a026c7`).
- Enhanced auth/settings flow with `requireLogin` control and `hasPassword` state handling in dashboard/login APIs (`249fc28`).
- Improved usage/quota UX with richer provider limit cards, new quota table, and clearer reset/countdown display (`32aefe5`).
- Added model support for custom providers in UI/combos/model selection (`a7a52be`).
- Expanded model/provider catalog:
  - Codex updates: GPT-5.3 support, translation fixes, thinking levels (`127475d`)
  - Added Claude Opus 4.6 model (`e8aa3e2`)
  - Added MiniMax Coding (CN) provider (`7c609d7`)
  - Added iFlow Kimi K2.5 model (`9e357a7`)
  - Updated CLI tools with Droid/OpenClaw cards and base URL visibility improvements (`a2122e3`)
- Added auto-validation for provider API keys when saving settings (`b275dfd`).
- Added Docker/runtime deployment docs and architecture documentation updates (`5e4a15b`).

## Fixes

- Improved local-network compatibility by allowing auth cookie flow over HTTP deployments (`0a394d0`).
- Improved Antigravity quota/stream handling and Droid CLI compatibility behavior (`3c65e0c`, `c612741`, `8c6e3b8`).
- Fixed GitHub Copilot model mapping/selection issues (`95fd950`).
- Hardened local DB behavior with corrupt JSON recovery and schema-shape migration safeguards (`e6ef852`).
- Fixed logout/login edge cases:
  - Prevent unintended auto-login after logout (`49df3dc`)
  - Avoid infinite loading on failed `/api/settings` responses (`01c9410`)

# v0.2.56 (2026-02-04)

## Features

- Added Anthropic-compatible provider support across providers API/UI flow (`da5bdef`).
- Added provider icons to dashboard provider pages/lists (`60bd686`, `8ceb8f2`).
- Enhanced usage tracking pipeline across response handlers/streams with buffered accounting improvements (`a33924b`, `df0e1d6`, `7881db8`).

## Fixes

- Fixed usage conversion and related provider limits presentation issues (`e6e44ac`).

# v0.2.52 (2026-02-02)

## Features

- Implemented Codex Cursor compatibility and Next.js 16 proxy migration updates (`e9b0a73`, `7b864a9`, `1c6dd6d`).
- Added OpenAI-compatible provider nodes with CRUD/validation/test coverage in API and UI (`0a28f9f`).
- Added token expiration and key-validity checks in provider test flow (`686585d`).
- Added Kiro token refresh support in shared token refresh service (`f2ca6f0`).
- Added non-streaming response translation support for multiple formats (`63f2da8`).
- Updated Kiro OAuth wiring and auth-related UI assets/components (`31cc79a`).

## Fixes

- Fixed cloud translation/request compatibility path (`c7219d0`).
- Fixed Kiro auth modal/flow issues (`85b7bb9`).
- Included Antigravity stability fixes in translator/executor flow (`2393771`, `8c37b39`).

# v0.2.43 (2026-01-27)

## Fixes

- Fixed CLI tools model selection behavior (`a015266`).
- Fixed Kiro translator request handling (`d3dd868`).

# v0.2.36 (2026-01-19)

## Features

- Added the Usage dashboard page and related usage stats components (`3804357`).
- Integrated outbound proxy support in Open SSE fetch pipeline (`0943387`).
- Improved OpenAI compatibility and build stability across endpoint/profile/providers flows (`d9b8e48`).

## Fixes

- Fixed combo fallback behavior (`e6ca119`).
- Resolved SonarQube findings, Next.js image warnings, and build/lint cleanups (`7058b06`, `0848dd5`).

# v0.2.31 (2026-01-18)

## Fixes

- Fixed Kiro token refresh and executor behavior (`6b22b1f`, `1d481c2`).
- Fixed Kiro request translation handling (`eff52f7`, `da15660`).

# v0.2.27 (2026-01-15)

## Features

- Added Kiro provider support with OAuth flow (`26b61e5`).

## Fixes

- Fixed Codex provider behavior (`26b61e5`).

# v0.2.21 (2026-01-12)

## Changes

- README updates.
- Antigravity bug fixes.
