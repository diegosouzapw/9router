/**
 * Extract usage from non-streaming response body
 * Handles different provider response formats
 */
export function extractUsageFromResponse(responseBody, provider) {
  if (!responseBody || typeof responseBody !== 'object') return null;

  // OpenAI format (has prompt_tokens / completion_tokens)
  if (responseBody.usage && typeof responseBody.usage === 'object' && responseBody.usage.prompt_tokens !== undefined) {
    return {
      prompt_tokens: responseBody.usage.prompt_tokens || 0,
      completion_tokens: responseBody.usage.completion_tokens || 0,
      cached_tokens: responseBody.usage.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: responseBody.usage.completion_tokens_details?.reasoning_tokens
    };
  }

  // Claude format
  if (responseBody.usage && typeof responseBody.usage === 'object' && (responseBody.usage.input_tokens !== undefined || responseBody.usage.output_tokens !== undefined)) {
    return {
      prompt_tokens: responseBody.usage.input_tokens || 0,
      completion_tokens: responseBody.usage.output_tokens || 0,
      cache_read_input_tokens: responseBody.usage.cache_read_input_tokens,
      cache_creation_input_tokens: responseBody.usage.cache_creation_input_tokens
    };
  }

  // Gemini format
  if (responseBody.usageMetadata && typeof responseBody.usageMetadata === 'object') {
    return {
      prompt_tokens: responseBody.usageMetadata.promptTokenCount || 0,
      completion_tokens: responseBody.usageMetadata.candidatesTokenCount || 0,
      reasoning_tokens: responseBody.usageMetadata.thoughtsTokenCount
    };
  }

  return null;
}
