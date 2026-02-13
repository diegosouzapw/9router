import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderConnections, getCombos, getAllCustomModels } from "@/lib/localDb";
import { getAllEmbeddingModels } from "open-sse/config/embeddingRegistry.js";
import { getAllImageModels } from "open-sse/config/imageRegistry.js";
import { getAllAudioModels } from "open-sse/config/audioRegistry.js";
import { getRegistryEntry } from "open-sse/config/providerRegistry.js";

const FALLBACK_ALIAS_TO_PROVIDER = {
  ag: "antigravity",
  cc: "claude",
  cl: "cline",
  cu: "cursor",
  cx: "codex",
  gc: "gemini-cli",
  gh: "github",
  if: "iflow",
  kc: "kilocode",
  kmc: "kimi-coding",
  kr: "kiro",
  qw: "qwen",
};

// ── Format-to-type mapping ─────────────────────────────────────────────
// Determines which endpoint type a provider format maps to.
const FORMAT_TO_TYPE = {
  "openai": "chat",
  "openai-responses": "responses",
  "claude": "anthropic",
  "gemini": "chat",
  "gemini-cli": "chat",
  "antigravity": "chat",
  "kiro": "chat",
  "cursor": "chat",
  "openrouter": "chat",
};

const TYPE_TO_ENDPOINT = {
  "chat": "/v1/chat/completions",
  "responses": "/v1/responses",
  "anthropic": "/v1/messages",
  "embedding": "/v1/embeddings",
  "image": "/v1/images/generations",
  "audio-tts": "/v1/audio/speech",
  "audio-stt": "/v1/audio/transcriptions",
  "combo": null,
};

/**
 * Resolve the type for a chat model based on its provider format and per-model targetFormat.
 */
function resolveModelType(alias, model) {
  // Per-model override (e.g. GitHub Copilot codex models → responses)
  if (model?.targetFormat === "openai-responses") return "responses";

  const entry = getRegistryEntry(alias);
  if (!entry) return "chat"; // fallback

  return FORMAT_TO_TYPE[entry.format] || "chat";
}

function buildAliasMaps() {
  const aliasToProviderId = {};
  const providerIdToAlias = {};

  // Canonical source for ID/alias pairs used across dashboard/provider config.
  for (const provider of Object.values(AI_PROVIDERS)) {
    const providerId = provider?.id;
    const alias = provider?.alias || providerId;
    if (!providerId) continue;
    aliasToProviderId[providerId] = providerId;
    aliasToProviderId[alias] = providerId;
    if (!providerIdToAlias[providerId]) {
      providerIdToAlias[providerId] = alias;
    }
  }

  for (const [left, right] of Object.entries(PROVIDER_ID_TO_ALIAS)) {
    if (PROVIDER_MODELS[left]) {
      aliasToProviderId[left] = aliasToProviderId[left] || right;
      continue;
    }
    if (PROVIDER_MODELS[right]) {
      aliasToProviderId[right] = aliasToProviderId[right] || left;
      continue;
    }
    aliasToProviderId[right] = aliasToProviderId[right] || left;
  }

  for (const alias of Object.keys(PROVIDER_MODELS)) {
    if (!aliasToProviderId[alias]) {
      aliasToProviderId[alias] = alias;
    }
  }

  for (const [alias, providerId] of Object.entries(aliasToProviderId)) {
    if (!providerIdToAlias[providerId]) {
      providerIdToAlias[providerId] = alias;
    }
  }

  for (const [alias, providerId] of Object.entries(FALLBACK_ALIAS_TO_PROVIDER)) {
    if (!aliasToProviderId[alias]) aliasToProviderId[alias] = providerId;
    if (!aliasToProviderId[providerId]) aliasToProviderId[providerId] = providerId;
    if (!providerIdToAlias[providerId]) providerIdToAlias[providerId] = alias;
  }

  return { aliasToProviderId, providerIdToAlias };
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * GET /v1/models - OpenAI compatible models list
 * Returns models from all active providers, combos, embeddings, images, and audio in OpenAI format.
 * Every model now includes `type`, `endpoint`, and `format` fields for UI categorization.
 */
export async function GET() {
  try {
    const { aliasToProviderId, providerIdToAlias } = buildAliasMaps();

    // Get active provider connections
    let connections = [];
    try {
      connections = await getProviderConnections();
      connections = connections.filter(c => c.isActive !== false);
    } catch (e) {
      console.log("Could not fetch providers, returning all models");
    }

    // Get combos
    let combos = [];
    try {
      combos = await getCombos();
    } catch (e) {
      console.log("Could not fetch combos");
    }

    // Build set of active provider aliases
    const activeAliases = new Set();
    for (const conn of connections) {
      const alias = providerIdToAlias[conn.provider] || conn.provider;
      activeAliases.add(alias);
      activeAliases.add(conn.provider);
    }

    const models = [];
    const timestamp = Math.floor(Date.now() / 1000);

    // ── Combos ─────────────────────────────────────────────────────────
    for (const combo of combos) {
      models.push({
        id: combo.name,
        object: "model",
        created: timestamp,
        owned_by: "combo",
        type: "combo",
        endpoint: null,
        permission: [],
        root: combo.name,
        parent: null,
      });
    }

    // ── Provider models (chat / responses / anthropic) ─────────────────
    for (const [alias, providerModels] of Object.entries(PROVIDER_MODELS)) {
      const providerId = aliasToProviderId[alias] || alias;
      const canonicalProviderId = FALLBACK_ALIAS_TO_PROVIDER[alias] || providerId;

      if (connections.length > 0 && !activeAliases.has(alias) && !activeAliases.has(canonicalProviderId)) {
        continue;
      }

      const entry = getRegistryEntry(alias);
      const providerFormat = entry?.format || "openai";

      for (const model of providerModels) {
        const modelType = resolveModelType(alias, model);
        const aliasId = `${alias}/${model.id}`;
        models.push({
          id: aliasId,
          object: "model",
          created: timestamp,
          owned_by: canonicalProviderId,
          type: modelType,
          endpoint: TYPE_TO_ENDPOINT[modelType] || "/v1/chat/completions",
          format: providerFormat,
          permission: [],
          root: model.id,
          parent: null,
        });

        if (canonicalProviderId !== alias) {
          models.push({
            id: `${canonicalProviderId}/${model.id}`,
            object: "model",
            created: timestamp,
            owned_by: canonicalProviderId,
            type: modelType,
            endpoint: TYPE_TO_ENDPOINT[modelType] || "/v1/chat/completions",
            format: providerFormat,
            permission: [],
            root: model.id,
            parent: aliasId,
          });
        }
      }
    }

    // ── Embedding models ───────────────────────────────────────────────
    for (const embModel of getAllEmbeddingModels()) {
      models.push({
        id: embModel.id,
        object: "model",
        created: timestamp,
        owned_by: embModel.provider,
        type: "embedding",
        endpoint: "/v1/embeddings",
        dimensions: embModel.dimensions,
      });
    }

    // ── Image models ──────────────────────────────────────────────────
    for (const imgModel of getAllImageModels()) {
      models.push({
        id: imgModel.id,
        object: "model",
        created: timestamp,
        owned_by: imgModel.provider,
        type: "image",
        endpoint: "/v1/images/generations",
        supported_sizes: imgModel.supportedSizes,
      });
    }

    // ── Audio models (TTS + STT) ──────────────────────────────────────
    for (const audioModel of getAllAudioModels()) {
      const audioType = audioModel.subtype === "tts" ? "audio-tts" : "audio-stt";
      models.push({
        id: audioModel.id,
        object: "model",
        created: timestamp,
        owned_by: audioModel.provider,
        type: audioType,
        endpoint: TYPE_TO_ENDPOINT[audioType],
        ...(audioModel.voices ? { voices: audioModel.voices } : {}),
      });
    }

    // ── Custom models (user-defined) ──────────────────────────────────
    try {
      const customModelsMap = await getAllCustomModels();
      for (const [providerId, providerCustomModels] of Object.entries(customModelsMap)) {
        const alias = providerIdToAlias[providerId] || providerId;
        const canonicalProviderId = FALLBACK_ALIAS_TO_PROVIDER[alias] || providerId;
        if (connections.length > 0 && !activeAliases.has(alias) && !activeAliases.has(canonicalProviderId)) continue;

        const entry = getRegistryEntry(alias) || getRegistryEntry(canonicalProviderId);
        const providerFormat = entry?.format || "openai";
        const baseType = FORMAT_TO_TYPE[providerFormat] || "chat";

        for (const model of providerCustomModels) {
          const aliasId = `${alias}/${model.id}`;
          if (models.some(m => m.id === aliasId)) continue;

          models.push({
            id: aliasId,
            object: "model",
            created: timestamp,
            owned_by: canonicalProviderId,
            type: baseType,
            endpoint: TYPE_TO_ENDPOINT[baseType] || "/v1/chat/completions",
            format: providerFormat,
            permission: [],
            root: model.id,
            parent: null,
            custom: true,
          });

          if (canonicalProviderId !== alias) {
            const providerPrefixedId = `${canonicalProviderId}/${model.id}`;
            if (models.some(m => m.id === providerPrefixedId)) continue;
            models.push({
              id: providerPrefixedId,
              object: "model",
              created: timestamp,
              owned_by: canonicalProviderId,
              type: baseType,
              endpoint: TYPE_TO_ENDPOINT[baseType] || "/v1/chat/completions",
              format: providerFormat,
              permission: [],
              root: model.id,
              parent: aliasId,
              custom: true,
            });
          }
        }
      }
    } catch (e) {
      console.log("Could not fetch custom models");
    }

    return Response.json({
      object: "list",
      data: models,
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.log("Error fetching models:", error);
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}
