/**
 * Embedding Handler
 * 
 * Handles POST /v1/embeddings requests.
 * Proxies to upstream embedding providers using OpenAI-compatible format.
 * 
 * Request format (OpenAI-compatible):
 * {
 *   "model": "nebius/Qwen/Qwen3-Embedding-8B",
 *   "input": "text" | ["text1", "text2"],
 *   "dimensions": 4096,       // optional
 *   "encoding_format": "float" // optional
 * }
 */

import { getEmbeddingProvider, parseEmbeddingModel } from "../config/embeddingRegistry.js";

/**
 * Handle embedding request
 * @param {object} options
 * @param {object} options.body - Request body
 * @param {object} options.credentials - Provider credentials { apiKey, accessToken }
 * @param {object} options.log - Logger
 */
export async function handleEmbedding({ body, credentials, log }) {
  const { provider, model } = parseEmbeddingModel(body.model);

  if (!provider) {
    return {
      success: false,
      status: 400,
      error: `Invalid embedding model: ${body.model}. Use format: provider/model`,
    };
  }

  const providerConfig = getEmbeddingProvider(provider);
  if (!providerConfig) {
    return {
      success: false,
      status: 400,
      error: `Unknown embedding provider: ${provider}`,
    };
  }

  // Build upstream request
  const upstreamBody = {
    model: model,
    input: body.input,
  };

  // Pass optional parameters
  if (body.dimensions !== undefined) upstreamBody.dimensions = body.dimensions;
  if (body.encoding_format !== undefined) upstreamBody.encoding_format = body.encoding_format;

  // Build headers
  const headers = {
    "Content-Type": "application/json",
  };

  const token = credentials.apiKey || credentials.accessToken;
  if (providerConfig.authHeader === "bearer") {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (providerConfig.authHeader === "x-api-key") {
    headers["x-api-key"] = token;
  }

  if (log) {
    log.info("EMBED", `${provider}/${model} | input: ${Array.isArray(body.input) ? body.input.length + " items" : "1 item"}`);
  }

  try {
    const response = await fetch(providerConfig.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (log) {
        log.error("EMBED", `${provider} error ${response.status}: ${errorText.slice(0, 200)}`);
      }
      return {
        success: false,
        status: response.status,
        error: errorText,
      };
    }

    const data = await response.json();

    // Normalize response to OpenAI format
    return {
      success: true,
      data: {
        object: "list",
        data: data.data || data,
        model: `${provider}/${model}`,
        usage: data.usage || { prompt_tokens: 0, total_tokens: 0 },
      },
    };
  } catch (err) {
    if (log) {
      log.error("EMBED", `${provider} fetch error: ${err.message}`);
    }
    return {
      success: false,
      status: 502,
      error: `Embedding provider error: ${err.message}`,
    };
  }
}
