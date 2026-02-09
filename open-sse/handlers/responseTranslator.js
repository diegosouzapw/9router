import { FORMATS } from "../translator/formats.js";

/**
 * Translate non-streaming response to OpenAI format
 * Handles different provider response formats (Gemini, Claude, etc.)
 */
export function translateNonStreamingResponse(responseBody, targetFormat, sourceFormat) {
  // If already in source format (usually OpenAI), return as-is
  if (targetFormat === sourceFormat || targetFormat === FORMATS.OPENAI) {
    return responseBody;
  }

  // Handle Gemini/Antigravity format
  if (targetFormat === FORMATS.GEMINI || targetFormat === FORMATS.ANTIGRAVITY || targetFormat === FORMATS.GEMINI_CLI) {
    const response = responseBody.response || responseBody;
    if (!response?.candidates?.[0]) {
      return responseBody; // Can't translate, return raw
    }

    const candidate = response.candidates[0];
    const content = candidate.content;
    const usage = response.usageMetadata || responseBody.usageMetadata;

    // Build message content
    let textContent = "";
    const toolCalls = [];
    let reasoningContent = "";

    if (content?.parts) {
      for (const part of content.parts) {
        // Handle thinking/reasoning
        if (part.thought === true && part.text) {
          reasoningContent += part.text;
        }
        // Regular text
        else if (part.text !== undefined) {
          textContent += part.text;
        }
        // Function calls
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${part.functionCall.name}_${Date.now()}_${toolCalls.length}`,
            type: "function",
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {})
            }
          });
        }
      }
    }

    // Build OpenAI format message
    const message = { role: "assistant" };
    if (textContent) {
      message.content = textContent;
    }
    if (reasoningContent) {
      message.reasoning_content = reasoningContent;
    }
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }
    // If no content at all, set content to empty string
    if (!message.content && !message.tool_calls) {
      message.content = "";
    }

    // Determine finish reason
    let finishReason = (candidate.finishReason || "stop").toLowerCase();
    if (finishReason === "stop" && toolCalls.length > 0) {
      finishReason = "tool_calls";
    }

    const result = {
      id: `chatcmpl-${response.responseId || Date.now()}`,
      object: "chat.completion",
      created: Math.floor(new Date(response.createTime || Date.now()).getTime() / 1000),
      model: response.modelVersion || "gemini",
      choices: [{
        index: 0,
        message,
        finish_reason: finishReason
      }]
    };

    // Add usage if available (match streaming translator: add thoughtsTokenCount to prompt_tokens)
    if (usage) {
      result.usage = {
        prompt_tokens: (usage.promptTokenCount || 0) + (usage.thoughtsTokenCount || 0),
        completion_tokens: usage.candidatesTokenCount || 0,
        total_tokens: usage.totalTokenCount || 0
      };
      if (usage.thoughtsTokenCount > 0) {
        result.usage.completion_tokens_details = {
          reasoning_tokens: usage.thoughtsTokenCount
        };
      }
    }

    return result;
  }

  // Handle Claude format
  if (targetFormat === FORMATS.CLAUDE) {
    if (!responseBody.content) {
      return responseBody; // Can't translate, return raw
    }

    let textContent = "";
    let thinkingContent = "";
    const toolCalls = [];

    for (const block of responseBody.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "thinking") {
        thinkingContent += block.thinking || "";
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {})
          }
        });
      }
    }

    const message = { role: "assistant" };
    if (textContent) {
      message.content = textContent;
    }
    if (thinkingContent) {
      message.reasoning_content = thinkingContent;
    }
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }
    if (!message.content && !message.tool_calls) {
      message.content = "";
    }

    let finishReason = responseBody.stop_reason || "stop";
    if (finishReason === "end_turn") finishReason = "stop";
    if (finishReason === "tool_use") finishReason = "tool_calls";

    const result = {
      id: `chatcmpl-${responseBody.id || Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: responseBody.model || "claude",
      choices: [{
        index: 0,
        message,
        finish_reason: finishReason
      }]
    };

    if (responseBody.usage) {
      result.usage = {
        prompt_tokens: responseBody.usage.input_tokens || 0,
        completion_tokens: responseBody.usage.output_tokens || 0,
        total_tokens: (responseBody.usage.input_tokens || 0) + (responseBody.usage.output_tokens || 0)
      };
    }

    return result;
  }

  // Unknown format, return as-is
  return responseBody;
}
