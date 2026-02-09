# Task: Nebius Backend Enablement

## Goal
Enable `nebius` as a first-class backend provider so frontend support remains valid and end-to-end flows work.

## Scope
- Add Nebius to backend provider registry.
- Ensure provider model map and alias map include Nebius automatically.
- Support Nebius in API key validation and connection test flows.
- Support Nebius model listing endpoint where available.

## Technical Spec

### 1) Provider Registry
File: `open-sse/config/providerRegistry.js`

Provider entry implemented with:
- `id`: `nebius`
- `alias`: `nebius`
- `format`: `openai`
- `executor`: `default`
- `baseUrl`: `https://api.tokenfactory.nebius.com/v1/chat/completions`
- `authType`: `apikey`
- `authHeader`: `bearer`
- `models`: seed model list for first-run usability

### 2) Validation Endpoint
File: `src/app/api/providers/validate/route.js`

Implemented behavior:
- Nebius uses OpenAI-like validation strategy with `/models` preference.
- Shared strategy module used: `src/lib/providers/validation.js`.
- Consistent payload: `{ valid, error }`.

### 3) Test Endpoint
File: `src/app/api/providers/[id]/test/route.js`

Implemented behavior:
- API key connection test now reuses shared validation strategy.
- Reduced drift risk versus `/api/providers/validate`.

### 4) Models Listing Endpoint
File: `src/app/api/providers/[id]/models/route.js`

Implemented behavior:
- Nebius included in model listing config.
- New providers added with explicit unsupported behavior for missing configs.

## Acceptance Criteria
- [x] `nebius` appears in backend registry-derived maps.
- [x] `POST /api/providers/validate` supports `provider=nebius`.
- [x] `POST /api/providers/[id]/test` handles Nebius connections.
- [x] `GET /api/providers/[id]/models` handles Nebius.
- [x] No frontend removal of Nebius.

## Validation Notes
- `npm run lint` executed successfully with Node `v22.22.0`.
- `npm run build` executed successfully with Node `v22.22.0`.
- Code-level coverage for Nebius and new providers is in place.
- Live API smoke tests with real Nebius credential are still pending.

## Progress
- Status: done (implementation)
- Last update: backend enablement completed with shared validation logic
- Reference commit: n/a
