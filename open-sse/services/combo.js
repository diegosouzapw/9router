/**
 * Shared combo (model combo) handling with fallback support
 * Supports: priority (sequential) and weighted (probabilistic) strategies
 */

import { checkFallbackError, formatRetryAfter } from "./accountFallback.js";
import { unavailableResponse } from "../utils/error.js";
import { recordComboRequest } from "./comboMetrics.js";

/**
 * Normalize a model entry to { model, weight }
 * Supports both legacy string format and new object format
 */
function normalizeModelEntry(entry) {
  if (typeof entry === "string") return { model: entry, weight: 0 };
  return { model: entry.model, weight: entry.weight || 0 };
}

/**
 * Get combo models from combos data (for open-sse standalone use)
 * @param {string} modelStr - Model string to check
 * @param {Array|Object} combosData - Array of combos or object with combos
 * @returns {Object|null} Full combo object or null if not a combo
 */
export function getComboFromData(modelStr, combosData) {
  const combos = Array.isArray(combosData) ? combosData : (combosData?.combos || []);
  const combo = combos.find(c => c.name === modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo;
  }
  return null;
}

/**
 * Legacy: Get combo models as string array (backward compat)
 */
export function getComboModelsFromData(modelStr, combosData) {
  const combo = getComboFromData(modelStr, combosData);
  if (!combo) return null;
  return combo.models.map(m => normalizeModelEntry(m).model);
}

/**
 * Select a model using weighted random distribution
 * @param {Array} models - Array of { model, weight } entries
 * @returns {string} Selected model string
 */
function selectWeightedModel(models) {
  const entries = models.map(m => normalizeModelEntry(m));
  const totalWeight = entries.reduce((sum, m) => sum + m.weight, 0);

  if (totalWeight <= 0) {
    // All weights are 0 → uniform random
    return entries[Math.floor(Math.random() * entries.length)].model;
  }

  let random = Math.random() * totalWeight;
  for (const entry of entries) {
    random -= entry.weight;
    if (random <= 0) return entry.model;
  }
  return entries[entries.length - 1].model; // safety fallback
}

/**
 * Order models for weighted fallback (selected first, then by descending weight)
 */
function orderModelsForWeightedFallback(models, selectedModel) {
  const entries = models.map(m => normalizeModelEntry(m));
  const selected = entries.find(e => e.model === selectedModel);
  const rest = entries.filter(e => e.model !== selectedModel)
    .sort((a, b) => b.weight - a.weight); // highest weight first for fallback

  return [selected, ...rest].filter(Boolean).map(e => e.model);
}

/**
 * Handle combo chat with fallback
 * Supports priority (sequential) and weighted (probabilistic) strategies
 * @param {Object} options
 * @param {Object} options.body - Request body
 * @param {Object} options.combo - Full combo object { name, models, strategy, config }
 * @param {Function} options.handleSingleModel - Function: (body, modelStr) => Promise<Response>
 * @param {Function} [options.isModelAvailable] - Optional pre-check: (modelStr) => Promise<boolean>
 * @param {Object} options.log - Logger object
 * @returns {Promise<Response>}
 */
export async function handleComboChat({ body, combo, handleSingleModel, isModelAvailable, log }) {
  const strategy = combo.strategy || "priority";
  const models = combo.models || [];
  const config = combo.config || {};
  const maxRetries = config.maxRetries ?? 1;
  const retryDelayMs = config.retryDelayMs ?? 2000;

  let orderedModels;

  if (strategy === "weighted") {
    const selected = selectWeightedModel(models);
    orderedModels = orderModelsForWeightedFallback(models, selected);
    log.info("COMBO", `Weighted selection: ${selected} (from ${models.length} models)`);
  } else {
    // Priority: use array order
    orderedModels = models.map(m => normalizeModelEntry(m).model);
  }

  let lastError = null;
  let earliestRetryAfter = null;
  let lastStatus = null;
  const startTime = Date.now();
  let resolvedByModel = null;
  let fallbackCount = 0;

  for (let i = 0; i < orderedModels.length; i++) {
    const modelStr = orderedModels[i];

    // Pre-check: skip models where all accounts are in cooldown
    if (isModelAvailable) {
      const available = await isModelAvailable(modelStr);
      if (!available) {
        log.info("COMBO", `Skipping ${modelStr} (all accounts in cooldown)`);
        if (i > 0) fallbackCount++;
        continue;
      }
    }

    // Retry loop for transient errors
    for (let retry = 0; retry <= maxRetries; retry++) {
      if (retry > 0) {
        log.info("COMBO", `Retrying ${modelStr} in ${retryDelayMs}ms (attempt ${retry + 1}/${maxRetries + 1})`);
        await new Promise(r => setTimeout(r, retryDelayMs));
      }

      log.info("COMBO", `Trying model ${i + 1}/${orderedModels.length}: ${modelStr}${retry > 0 ? ` (retry ${retry})` : ""}`);

      const result = await handleSingleModel(body, modelStr);

      // Success — return response
      if (result.ok) {
        resolvedByModel = modelStr;
        const latencyMs = Date.now() - startTime;
        log.info("COMBO", `Model ${modelStr} succeeded (${latencyMs}ms, ${fallbackCount} fallbacks)`);
        recordComboRequest(combo.name, modelStr, { success: true, latencyMs, fallbackCount, strategy });
        return result;
      }

      // Extract error info from response
      let errorText = result.statusText || "";
      let retryAfter = null;
      try {
        const cloned = result.clone();
        try {
          const errorBody = await cloned.json();
          errorText = errorBody?.error?.message || errorBody?.error || errorBody?.message || errorText;
          retryAfter = errorBody?.retryAfter || null;
        } catch {
          try {
            const text = await result.text();
            if (text) errorText = text.substring(0, 500);
          } catch { /* Body consumed */ }
        }
      } catch { /* Clone failed */ }

      // Track earliest retryAfter
      if (retryAfter && (!earliestRetryAfter || new Date(retryAfter) < new Date(earliestRetryAfter))) {
        earliestRetryAfter = retryAfter;
      }

      // Normalize error text
      if (typeof errorText !== "string") {
        try { errorText = JSON.stringify(errorText); } catch { errorText = String(errorText); }
      }

      const { shouldFallback } = checkFallbackError(result.status, errorText);

      if (!shouldFallback) {
        log.warn("COMBO", `Model ${modelStr} failed (no fallback)`, { status: result.status });
        return result;
      }

      // Check if this is a transient error worth retrying on same model
      const isTransient = [408, 429, 500, 502, 503, 504].includes(result.status);
      if (retry < maxRetries && isTransient) {
        continue; // Retry same model
      }

      // Done retrying this model
      lastError = errorText || String(result.status);
      if (!lastStatus) lastStatus = result.status;
      if (i > 0) fallbackCount++;
      log.warn("COMBO", `Model ${modelStr} failed, trying next`, { status: result.status });
      break; // Move to next model
    }
  }

  // All models failed
  const latencyMs = Date.now() - startTime;
  recordComboRequest(combo.name, null, { success: false, latencyMs, fallbackCount, strategy });

  const status = lastStatus || 406;
  const msg = lastError || "All combo models unavailable";

  if (earliestRetryAfter) {
    const retryHuman = formatRetryAfter(earliestRetryAfter);
    log.warn("COMBO", `All models failed | ${msg} (${retryHuman})`);
    return unavailableResponse(status, msg, earliestRetryAfter, retryHuman);
  }

  log.warn("COMBO", `All models failed | ${msg}`);
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
