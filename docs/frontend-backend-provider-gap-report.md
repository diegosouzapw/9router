# Frontend x Backend Provider Gap Report

## Scope
This report covers provider parity and related UX/API gaps across:
- Backend provider registry and provider-facing APIs
- Frontend dashboard pages where provider lists/statuses are rendered
- Nebius backend enablement without removing frontend support

Files analyzed and changed:
- `open-sse/config/providerRegistry.js`
- `src/lib/providers/validation.js` (new)
- `src/app/api/providers/validate/route.js`
- `src/app/api/providers/[id]/test/route.js`
- `src/app/api/providers/[id]/models/route.js`
- `src/lib/localDb.js`
- `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js`
- `src/shared/components/Header.js`
- `src/shared/components/ModelSelectModal.js`
- `src/app/(dashboard)/dashboard/translator/page.js`

## Matrix (Before vs After)

| Area | Before | After |
|---|---|---|
| Nebius in backend registry | Missing | Added in `providerRegistry` |
| API key validation logic | Duplicated and provider-specific switch drift | Centralized shared validation strategy |
| Connection test API key logic | Separate switch, divergent from `/validate` | Reuses shared validation helper |
| Provider `/models` coverage (new providers) | Partial | Expanded for deepseek, groq, xai, mistral, perplexity, together, fireworks, cerebras, cohere, nvidia, nebius |
| Pricing alias fallback | Hardcoded manual map | Registry-derived alias map + regional fallback |
| Endpoint page provider cards | Missing | Added provider overview cards with aggregated status |
| Header provider detail lookup | OAUTH + APIKEY only | Includes FREE + compatible provider prefixes |
| Model selector ordering | OAuth + API key only | Includes FREE providers in priority order |
| Translator provider source | Hardcoded static list | Dynamic list based on connections/provider nodes/catalog |

## Provider Parity Matrix (Backend x Frontend)

Legend:
- `OK`: implemented and wired
- `PARCIAL`: present but with caveat
- `N/A`: not applicable for provider auth/type

| Provider | Registry backend | `/validate` + `/test` | `/models` route | Front catalog/UI |
|---|---|---|---|---|
| openai | OK | OK | OK | OK |
| anthropic | OK | OK | OK | OK |
| gemini | OK | OK | OK | OK |
| openrouter | OK | OK | OK | OK |
| glm | OK | OK | OK | OK |
| kimi | OK | OK | OK | OK |
| kimi-coding | OK | OK | OK | OK |
| minimax | OK | OK | OK | OK |
| minimax-cn | OK | OK | PARCIAL (usa cobertura claude-like/compatível) | OK |
| deepseek | OK | OK | OK | OK |
| groq | OK | OK | OK | OK |
| xai | OK | OK | OK | OK |
| mistral | OK | OK | OK | OK |
| perplexity | OK | OK | OK | OK |
| together | OK | OK | OK | OK |
| fireworks | OK | OK | OK | OK |
| cerebras | OK | OK | OK | OK |
| cohere | OK | OK | OK | OK |
| nvidia | OK | OK | OK | OK |
| nebius | OK (adicionado) | OK | OK | OK (mantido) |
| iflow (free) | N/A (oauth/free flow) | N/A | N/A | OK |
| qwen (free) | N/A (oauth/free flow) | N/A | N/A | OK |
| claude (oauth) | N/A (oauth flow) | N/A | PARCIAL (depende do token/provider endpoint) | OK |
| codex (oauth) | N/A (oauth flow) | N/A | N/A | OK |
| antigravity (oauth) | N/A (oauth flow) | N/A | N/A | OK |
| gemini-cli (oauth) | N/A (oauth flow) | N/A | N/A | OK |
| github (oauth) | N/A (oauth flow) | N/A | N/A | OK |
| kiro (oauth) | N/A (oauth flow) | N/A | N/A | OK |
| cursor (oauth) | N/A (oauth flow) | N/A | N/A | OK |

## Gaps Found

### High
1. Backend did not register Nebius while frontend exposed it.
2. Validation/test logic drift risk due duplicated switches.

### Medium
1. `/api/providers/[id]/models` lacked coverage for several new providers.
2. Endpoint page did not show provider cards/status overview.

### Low
1. Header provider detail lookup missed Free/compatible classes.
2. Model selector ordering ignored Free providers.
3. Translator provider list required manual maintenance.

## Changes Applied

### Backend
1. Added Nebius provider in `open-sse/config/providerRegistry.js`.
2. Added shared provider API key validator: `src/lib/providers/validation.js`.
3. Refactored `src/app/api/providers/validate/route.js` to use shared validator.
4. Refactored `src/app/api/providers/[id]/test/route.js` to use shared validator for API key providers.
5. Expanded provider model listing map in `src/app/api/providers/[id]/models/route.js`.
6. Replaced manual alias map in `src/lib/localDb.js` with registry-derived mapping.

### Frontend
1. Added provider overview cards in `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js`.
2. Improved provider name/color resolution by alias in endpoint model groups.
3. Updated breadcrumb/provider detail lookup in `src/shared/components/Header.js`.
4. Included `FREE_PROVIDERS` in `src/shared/components/ModelSelectModal.js` ordering and lookup map.
5. Replaced hardcoded translator provider list with dynamic loading in `src/app/(dashboard)/dashboard/translator/page.js`.

## Evidence / Validation

### Executed
- Static code inspection and targeted diff verification for all changed files.
- Search verification for Nebius and shared validator integration.
- `npm run lint` completed successfully (`9router-app@0.2.73`).
- `npm run build` completed successfully with Next.js `16.1.6` (webpack), including route generation.

### Not executed
- Live endpoint smoke tests with real provider credentials.

## Remaining Risks / Pending
1. Live provider behavior can vary for `/models`; runtime smoke tests are still recommended with real keys.
2. Additional UX polishing may be desired for endpoint cards when provider count grows.

## Recommended Next Steps
1. Execute live smoke tests:
   - `POST /api/providers/validate` with `provider=nebius`
   - `POST /api/providers/[id]/test` for a Nebius API-key connection
   - `GET /api/providers/[id]/models` for Nebius and at least 2 other newly added providers
2. Confirm provider card UX with high-connection scenarios (>30 connections) to validate readability and sorting.
