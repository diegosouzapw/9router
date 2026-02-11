import test from "node:test";
import assert from "node:assert/strict";

import { FORMATS } from "../open-sse/translator/formats.js";
import { getModelInfoCore } from "../open-sse/services/model.js";
import { GithubExecutor } from "../open-sse/executors/github.js";
import { translateNonStreamingResponse } from "../open-sse/handlers/responseTranslator.js";
import { extractUsageFromResponse } from "../open-sse/handlers/usageExtractor.js";

test("getModelInfoCore resolves unique non-openai unprefixed model", async () => {
  const info = await getModelInfoCore("claude-haiku-4-5-20251001", {});
  assert.equal(info.provider, "claude");
  assert.equal(info.model, "claude-haiku-4-5-20251001");
});

test("getModelInfoCore keeps openai fallback for gpt-4o", async () => {
  const info = await getModelInfoCore("gpt-4o", {});
  assert.equal(info.provider, "openai");
  assert.equal(info.model, "gpt-4o");
});

test("getModelInfoCore returns explicit ambiguity metadata for ambiguous unprefixed model", async () => {
  const info = await getModelInfoCore("claude-haiku-4.5", {});
  assert.equal(info.provider, null);
  assert.equal(info.errorType, "ambiguous_model");
  assert.match(info.errorMessage, /Ambiguous model/i);
  assert.ok(Array.isArray(info.candidateProviders));
  assert.ok(info.candidateProviders.length >= 2);
});

test("getModelInfoCore canonicalizes github legacy alias with explicit provider prefix", async () => {
  const info = await getModelInfoCore("gh/claude-4.5-opus", {});
  assert.equal(info.provider, "github");
  assert.equal(info.model, "claude-opus-4-5-20251101");
});

test("GithubExecutor routes codex-family model to /responses", () => {
  const executor = new GithubExecutor();
  const url = executor.buildUrl("gpt-5.1-codex", true);
  assert.match(url, /\/responses$/);
});

test("GithubExecutor keeps non-codex model on /chat/completions", () => {
  const executor = new GithubExecutor();
  const url = executor.buildUrl("gpt-5", true);
  assert.match(url, /\/chat\/completions$/);
});

test("translateNonStreamingResponse converts Responses API payload to OpenAI chat.completion", () => {
  const responseBody = {
    id: "resp_123",
    object: "response",
    created_at: 1739370000,
    model: "gpt-5.1-codex",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: "Hello from responses API." }
        ]
      },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "sum",
        arguments: "{\"a\":1,\"b\":2}"
      }
    ],
    usage: {
      input_tokens: 11,
      output_tokens: 7
    }
  };

  const translated = translateNonStreamingResponse(
    responseBody,
    FORMATS.OPENAI_RESPONSES,
    FORMATS.OPENAI
  );

  assert.equal(translated.object, "chat.completion");
  assert.equal(translated.model, "gpt-5.1-codex");
  assert.equal(translated.choices[0].message.role, "assistant");
  assert.equal(translated.choices[0].message.content, "Hello from responses API.");
  assert.equal(translated.choices[0].finish_reason, "tool_calls");
  assert.equal(translated.choices[0].message.tool_calls.length, 1);
  assert.equal(translated.usage.prompt_tokens, 11);
  assert.equal(translated.usage.completion_tokens, 7);
  assert.equal(translated.usage.total_tokens, 18);
});

test("extractUsageFromResponse reads usage from Responses API payload", () => {
  const responseBody = {
    object: "response",
    usage: {
      input_tokens: 20,
      output_tokens: 9,
      cache_read_input_tokens: 4,
      reasoning_tokens: 3
    }
  };

  const usage = extractUsageFromResponse(responseBody, "github");
  assert.equal(usage.prompt_tokens, 20);
  assert.equal(usage.completion_tokens, 9);
  assert.equal(usage.cached_tokens, 4);
  assert.equal(usage.reasoning_tokens, 3);
});
