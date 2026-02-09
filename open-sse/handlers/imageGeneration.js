/**
 * Image Generation Handler
 * 
 * Handles POST /v1/images/generations requests.
 * Proxies to upstream image generation providers using OpenAI-compatible format.
 * 
 * Request format (OpenAI-compatible):
 * {
 *   "model": "openai/dall-e-3",
 *   "prompt": "a beautiful sunset over mountains",
 *   "n": 1,
 *   "size": "1024x1024",
 *   "quality": "standard",       // optional: "standard" | "hd"
 *   "response_format": "url"     // optional: "url" | "b64_json"
 * }
 */

import { getImageProvider, parseImageModel } from "../config/imageRegistry.js";

/**
 * Handle image generation request
 * @param {object} options
 * @param {object} options.body - Request body
 * @param {object} options.credentials - Provider credentials { apiKey, accessToken }
 * @param {object} options.log - Logger
 */
export async function handleImageGeneration({ body, credentials, log }) {
  const { provider, model } = parseImageModel(body.model);

  if (!provider) {
    return {
      success: false,
      status: 400,
      error: `Invalid image model: ${body.model}. Use format: provider/model`,
    };
  }

  const providerConfig = getImageProvider(provider);
  if (!providerConfig) {
    return {
      success: false,
      status: 400,
      error: `Unknown image provider: ${provider}`,
    };
  }

  // Route to format-specific handler
  if (providerConfig.format === "gemini-image") {
    return handleGeminiImageGeneration({ model, providerConfig, body, credentials, log });
  }

  return handleOpenAIImageGeneration({ model, provider, providerConfig, body, credentials, log });
}

/**
 * Handle Gemini-format image generation (Antigravity / Nano Banana)
 * Uses Gemini's generateContent API with responseModalities: ["TEXT", "IMAGE"]
 */
async function handleGeminiImageGeneration({ model, providerConfig, body, credentials, log }) {
  const url = `${providerConfig.baseUrl}/${model}:generateContent`;

  const geminiBody = {
    contents: [
      {
        parts: [{ text: body.prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const token = credentials.accessToken || credentials.apiKey;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  if (log) {
    const promptPreview = typeof body.prompt === "string"
      ? body.prompt.slice(0, 60)
      : String(body.prompt ?? "").slice(0, 60);
    log.info("IMAGE", `antigravity/${model} (gemini) | prompt: "${promptPreview}..." | format: gemini-image`);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(geminiBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (log) {
        log.error("IMAGE", `antigravity error ${response.status}: ${errorText.slice(0, 200)}`);
      }
      return { success: false, status: response.status, error: errorText };
    }

    const data = await response.json();

    // Extract image data from Gemini response
    const images = [];
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          images.push({
            b64_json: part.inlineData.data,
            revised_prompt: parts.find(p => p.text)?.text || body.prompt,
          });
        }
      }
    }

    return {
      success: true,
      data: {
        created: Math.floor(Date.now() / 1000),
        data: images,
      },
    };
  } catch (err) {
    if (log) {
      log.error("IMAGE", `antigravity fetch error: ${err.message}`);
    }
    return { success: false, status: 502, error: `Image provider error: ${err.message}` };
  }
}

/**
 * Handle OpenAI-compatible image generation (standard providers + Nebius fallback)
 */
async function handleOpenAIImageGeneration({ model, provider, providerConfig, body, credentials, log }) {
  // Build upstream request (OpenAI-compatible format)
  const upstreamBody = {
    model: model,
    prompt: body.prompt,
  };

  // Pass optional parameters
  if (body.n !== undefined) upstreamBody.n = body.n;
  if (body.size !== undefined) upstreamBody.size = body.size;
  if (body.quality !== undefined) upstreamBody.quality = body.quality;
  if (body.response_format !== undefined) upstreamBody.response_format = body.response_format;
  if (body.style !== undefined) upstreamBody.style = body.style;

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
    const promptPreview = typeof body.prompt === "string"
      ? body.prompt.slice(0, 60)
      : String(body.prompt ?? "").slice(0, 60);
    log.info("IMAGE", `${provider}/${model} | prompt: "${promptPreview}..." | size: ${body.size || "default"}`);
  }

  const requestBody = JSON.stringify(upstreamBody);

  // Try primary URL
  let result = await fetchImageEndpoint(providerConfig.baseUrl, headers, requestBody, provider, log);

  // Fallback for providers with fallbackUrl (e.g., Nebius)
  if (!result.success && providerConfig.fallbackUrl && [404, 410, 502, 503].includes(result.status)) {
    if (log) {
      log.info("IMAGE", `${provider}: primary URL failed (${result.status}), trying fallback...`);
    }
    result = await fetchImageEndpoint(providerConfig.fallbackUrl, headers, requestBody, provider, log);
  }

  return result;
}

/**
 * Fetch a single image endpoint and normalize response
 */
async function fetchImageEndpoint(url, headers, body, provider, log) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (log) {
        log.error("IMAGE", `${provider} error ${response.status}: ${errorText.slice(0, 200)}`);
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
        created: data.created || Math.floor(Date.now() / 1000),
        data: data.data || [],
      },
    };
  } catch (err) {
    if (log) {
      log.error("IMAGE", `${provider} fetch error: ${err.message}`);
    }
    return {
      success: false,
      status: 502,
      error: `Image provider error: ${err.message}`,
    };
  }
}
