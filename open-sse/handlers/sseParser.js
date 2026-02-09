/**
 * Convert OpenAI-style SSE chunks into a single non-streaming JSON response.
 * Used as a fallback when upstream returns text/event-stream for stream=false.
 */
export function parseSSEToOpenAIResponse(rawSSE, fallbackModel) {
  const lines = String(rawSSE || "").split("\n");
  const chunks = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      chunks.push(JSON.parse(payload));
    } catch {
      // Ignore malformed SSE lines and continue best-effort parsing.
    }
  }

  if (chunks.length === 0) return null;

  const first = chunks[0];
  const contentParts = [];
  const reasoningParts = [];
  let finishReason = "stop";
  let usage = null;

  for (const chunk of chunks) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta || {};

    if (typeof delta.content === "string" && delta.content.length > 0) {
      contentParts.push(delta.content);
    }
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      reasoningParts.push(delta.reasoning_content);
    }
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    if (chunk?.usage && typeof chunk.usage === "object") {
      usage = chunk.usage;
    }
  }

  const message = {
    role: "assistant",
    content: contentParts.join("")
  };
  if (reasoningParts.length > 0) {
    message.reasoning_content = reasoningParts.join("");
  }

  const result = {
    id: first.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: first.created || Math.floor(Date.now() / 1000),
    model: first.model || fallbackModel || "unknown",
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason
      }
    ]
  };

  if (usage) {
    result.usage = usage;
  }

  return result;
}
