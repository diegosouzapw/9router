import { NextResponse } from "next/server";
import { getProviderConnectionById } from "@/models";
import { upsertCustomModels } from "@/lib/localDb";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";

// Provider models endpoints configuration
const PROVIDER_MODELS_CONFIG = {
  claude: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Content-Type": "application/json"
    },
    authHeader: "x-api-key",
    parseResponse: (data) => data.data || []
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authQuery: "key", // Use query param for API key
    parseResponse: (data) => data.models || []
  },
  "gemini-cli": {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.models || []
  },
  qwen: {
    url: "https://portal.qwen.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  antigravity: {
    url: "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:models",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    body: {},
    parseResponse: (data) => data.models || []
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  kimi: {
    url: "https://api.moonshot.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || []
  },
  "kimi-coding": {
    url: "https://api.kimi.com/coding/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "x-api-key",
    parseResponse: (data) => data.data || data.models || []
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    method: "GET",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Content-Type": "application/json"
    },
    authHeader: "x-api-key",
    parseResponse: (data) => data.data || []
  },
  deepseek: {
    url: "https://api.deepseek.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  xai: {
    url: "https://api.x.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  mistral: {
    url: "https://api.mistral.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  perplexity: {
    url: "https://api.perplexity.ai/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  together: {
    url: "https://api.together.xyz/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  fireworks: {
    url: "https://api.fireworks.ai/inference/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  cohere: {
    url: "https://api.cohere.com/v2/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  },
  nebius: {
    url: "https://api.tokenfactory.nebius.com/v1/models",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    parseResponse: (data) => data.data || data.models || []
  }
};

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeModelId(rawId) {
  if (!rawId) return "";
  const modelId = String(rawId).trim();
  if (!modelId) return "";
  if (modelId.startsWith("models/")) return modelId.slice("models/".length);
  return modelId;
}

function normalizeDiscoveredModels(rawModels = []) {
  const normalized = [];
  const seen = new Set();

  for (const model of Array.isArray(rawModels) ? rawModels : []) {
    const modelId = normalizeModelId(
      typeof model === "string"
        ? model
        : (model?.id || model?.name || model?.model || model?.displayName)
    );
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);

    const rawName = typeof model === "string"
      ? model
      : (model?.display_name || model?.displayName || model?.name || model?.model || model?.id || modelId);
    const modelName = String(rawName || modelId).trim() || modelId;
    normalized.push({ id: modelId, name: modelName });
  }

  return normalized;
}

async function fetchModelsFromConnection(connection) {
  if (isOpenAICompatibleProvider(connection.provider)) {
    const baseUrl = connection.providerSpecificData?.baseUrl;
    if (!baseUrl) {
      throw createHttpError(400, "No base URL configured for OpenAI compatible provider");
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${connection.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error fetching models from ${connection.provider}:`, errorText);
      throw createHttpError(response.status, `Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    return data.data || data.models || [];
  }

  if (isAnthropicCompatibleProvider(connection.provider)) {
    let baseUrl = connection.providerSpecificData?.baseUrl;
    if (!baseUrl) {
      throw createHttpError(400, "No base URL configured for Anthropic compatible provider");
    }

    baseUrl = baseUrl.replace(/\/$/, "");
    if (baseUrl.endsWith("/messages")) {
      baseUrl = baseUrl.slice(0, -9);
    }

    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": connection.apiKey,
        "anthropic-version": "2023-06-01",
        "Authorization": `Bearer ${connection.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error fetching models from ${connection.provider}:`, errorText);
      throw createHttpError(response.status, `Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    return data.data || data.models || [];
  }

  const config = PROVIDER_MODELS_CONFIG[connection.provider];
  if (!config) {
    throw createHttpError(400, `Provider ${connection.provider} does not support models listing`);
  }

  const token = connection.accessToken || connection.apiKey;
  if (!token) {
    throw createHttpError(401, "No valid token found");
  }

  let url = config.url;
  if (config.authQuery) {
    url += `?${config.authQuery}=${token}`;
  }

  const headers = { ...config.headers };
  if (config.authHeader && !config.authQuery) {
    headers[config.authHeader] = (config.authPrefix || "") + token;
  }

  const fetchOptions = {
    method: config.method,
    headers,
  };

  if (config.body && config.method === "POST") {
    fetchOptions.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    const errorText = await response.text();
    console.log(`Error fetching models from ${connection.provider}:`, errorText);
    throw createHttpError(response.status, `Failed to fetch models: ${response.status}`);
  }

  const data = await response.json();
  return config.parseResponse(data);
}

/**
 * GET /api/providers/[id]/models - Get models list from provider
 */
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const models = await fetchModelsFromConnection(connection);

    return NextResponse.json({
      provider: connection.provider,
      connectionId: connection.id,
      models
    });
  } catch (error) {
    if (error?.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.log("Error fetching provider models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

/**
 * POST /api/providers/[id]/models - Sync models from provider into local DB
 */
export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const fetchedModels = await fetchModelsFromConnection(connection);
    const normalizedModels = normalizeDiscoveredModels(fetchedModels);

    const syncResult = await upsertCustomModels(connection.provider, normalizedModels, {
      source: "sync",
      replaceSource: true,
    });

    return NextResponse.json({
      provider: connection.provider,
      connectionId: connection.id,
      fetchedCount: Array.isArray(fetchedModels) ? fetchedModels.length : 0,
      importedCount: syncResult.importedCount,
      totalStored: syncResult.models.length,
      models: normalizedModels,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.log("Error syncing provider models:", error);
    return NextResponse.json({ error: "Failed to sync models" }, { status: 500 });
  }
}
