/**
 * Provider Registry — Single source of truth for all provider configuration.
 *
 * Adding a new provider? Just add an entry here. Everything else
 * (PROVIDERS, PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS, executor lookup)
 * is auto-generated from this registry.
 */

// ── Registry ──────────────────────────────────────────────────────────────

export const REGISTRY = {
  // ─── OAuth Providers ───────────────────────────────────────────────────
  claude: {
    id: "claude",
    alias: "cc",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.anthropic.com/v1/messages",
    urlSuffix: "?beta=true",
    authType: "oauth",
    authHeader: "x-api-key",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14,context-management-2025-06-27",
      "Anthropic-Dangerous-Direct-Browser-Access": "true",
      "User-Agent": "claude-cli/1.0.83 (external, cli)",
      "X-App": "cli",
      "X-Stainless-Helper-Method": "stream",
      "X-Stainless-Retry-Count": "0",
      "X-Stainless-Runtime-Version": "v24.3.0",
      "X-Stainless-Package-Version": "0.55.1",
      "X-Stainless-Runtime": "node",
      "X-Stainless-Lang": "js",
      "X-Stainless-Arch": "arm64",
      "X-Stainless-Os": "MacOS",
      "X-Stainless-Timeout": "60"
    },
    oauth: {
      clientIdEnv: "CLAUDE_OAUTH_CLIENT_ID",
      clientIdDefault: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
      tokenUrl: "https://console.anthropic.com/v1/oauth/token"
    },
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-opus-4-5-20251101", name: "Claude 4.5 Opus" },
      { id: "claude-sonnet-4-5-20250929", name: "Claude 4.5 Sonnet" },
      { id: "claude-haiku-4-5-20251001", name: "Claude 4.5 Haiku" },
    ],
  },

  gemini: {
    id: "gemini",
    alias: "gemini",
    format: "gemini",
    executor: "default",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    urlBuilder: (base, model, stream) => {
      const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
      return `${base}/${model}:${action}`;
    },
    authType: "apikey",
    authHeader: "x-goog-api-key",
    oauth: {
      clientIdEnv: "GEMINI_OAUTH_CLIENT_ID",
      clientIdDefault: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
      clientSecretEnv: "GEMINI_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "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",
    },
    models: [
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
    ],
  },

  "gemini-cli": {
    id: "gemini-cli",
    alias: "gc",
    format: "gemini-cli",
    executor: "gemini-cli",
    baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
    urlBuilder: (base, model, stream) => {
      const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
      return `${base}:${action}`;
    },
    authType: "oauth",
    authHeader: "bearer",
    oauth: {
      clientIdEnv: "GEMINI_CLI_OAUTH_CLIENT_ID",
      clientIdDefault: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
      clientSecretEnv: "GEMINI_CLI_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "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",
    },
    models: [
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
    ],
  },

  codex: {
    id: "codex",
    alias: "cx",
    format: "openai-responses",
    executor: "codex",
    baseUrl: "https://chatgpt.com/backend-api/codex/responses",
    authType: "oauth",
    authHeader: "bearer",
    headers: {
      "Version": "0.92.0",
      "Openai-Beta": "responses=experimental",
      "User-Agent": "codex-cli/0.92.0 (Windows 10.0.26100; x64)"
    },
    oauth: {
      clientIdEnv: "CODEX_OAUTH_CLIENT_ID",
      clientIdDefault: "app_EMoamEEZ73f0CkXaXp7hrann",
      clientSecretEnv: "CODEX_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "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",
      tokenUrl: "https://auth.openai.com/oauth/token"
    },
    models: [
      { id: "gpt-5.3-codex", name: "GPT 5.3 Codex" },
      { id: "gpt-5.3-codex-xhigh", name: "GPT 5.3 Codex (xHigh)" },
      { id: "gpt-5.3-codex-high", name: "GPT 5.3 Codex (High)" },
      { id: "gpt-5.3-codex-low", name: "GPT 5.3 Codex (Low)" },
      { id: "gpt-5.3-codex-none", name: "GPT 5.3 Codex (None)" },
      { id: "gpt-5.1-codex-mini", name: "GPT 5.1 Codex Mini" },
      { id: "gpt-5.1-codex-mini-high", name: "GPT 5.1 Codex Mini (High)" },
      { id: "gpt-5.2-codex", name: "GPT 5.2 Codex" },
      { id: "gpt-5.2", name: "GPT 5.2" },
      { id: "gpt-5.1-codex-max", name: "GPT 5.1 Codex Max" },
      { id: "gpt-5.1-codex", name: "GPT 5.1 Codex" },
      { id: "gpt-5.1", name: "GPT 5.1" },
      { id: "gpt-5-codex", name: "GPT 5 Codex" },
      { id: "gpt-5-codex-mini", name: "GPT 5 Codex Mini" },
    ],
  },

  qwen: {
    id: "qwen",
    alias: "qw",
    format: "openai",
    executor: "default",
    baseUrl: "https://portal.qwen.ai/v1/chat/completions",
    authType: "oauth",
    authHeader: "bearer",
    headers: {
      "User-Agent": "google-api-nodejs-client/9.15.1",
      "X-Goog-Api-Client": "gl-node/22.17.0"
    },
    oauth: {
      clientIdEnv: "QWEN_OAUTH_CLIENT_ID",
      clientIdDefault: "f0304373b74a44d2b584a3fb70ca9e56",
      tokenUrl: "https://chat.qwen.ai/api/v1/oauth2/token",
      authUrl: "https://chat.qwen.ai/api/v1/oauth2/device/code"
    },
    models: [
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { id: "qwen3-coder-flash", name: "Qwen3 Coder Flash" },
      { id: "vision-model", name: "Qwen3 Vision Model" },
    ],
  },

  iflow: {
    id: "iflow",
    alias: "if",
    format: "openai",
    executor: "default",
    baseUrl: "https://apis.iflow.cn/v1/chat/completions",
    authType: "oauth",
    authHeader: "bearer",
    headers: {
      "User-Agent": "iFlow-Cli"
    },
    oauth: {
      clientIdEnv: "IFLOW_OAUTH_CLIENT_ID",
      clientIdDefault: "10009311001",
      clientSecretEnv: "IFLOW_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "4Z3YjXycVsQvyGF1etiNlIBB4RsqSDtW",
      tokenUrl: "https://iflow.cn/oauth/token",
      authUrl: "https://iflow.cn/oauth"
    },
    models: [
      { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { id: "kimi-k2", name: "Kimi K2" },
      { id: "kimi-k2-thinking", name: "Kimi K2 Thinking" },
      { id: "kimi-k2.5", name: "Kimi K2.5" },
      { id: "deepseek-r1", name: "DeepSeek R1" },
      { id: "deepseek-v3.2-chat", name: "DeepSeek V3.2 Chat" },
      { id: "deepseek-v3.2-reasoner", name: "DeepSeek V3.2 Reasoner" },
      { id: "minimax-m2.1", name: "MiniMax M2.1" },
      { id: "glm-4.7", name: "GLM 4.7" },
    ],
  },

  antigravity: {
    id: "antigravity",
    alias: "ag",
    format: "antigravity",
    executor: "antigravity",
    baseUrls: [
      "https://daily-cloudcode-pa.googleapis.com",
      "https://cloudcode-pa.googleapis.com",
    ],
    urlBuilder: (base, model, stream) => {
      const path = stream ? "/v1internal:streamGenerateContent?alt=sse" : "/v1internal:generateContent";
      return `${base}${path}`;
    },
    authType: "oauth",
    authHeader: "bearer",
    headers: {
      "User-Agent": "antigravity/1.104.0 darwin/arm64"
    },
    oauth: {
      clientIdEnv: "ANTIGRAVITY_OAUTH_CLIENT_ID",
      clientIdDefault: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
      clientSecretEnv: "ANTIGRAVITY_OAUTH_CLIENT_SECRET",
      clientSecretDefault: "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",
    },
    models: [
      { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 Thinking" },
      { id: "claude-opus-4-5-thinking", name: "Claude Opus 4.5 Thinking" },
      { id: "claude-sonnet-4-5-thinking", name: "Claude Sonnet 4.5 Thinking" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { id: "gemini-3-pro-high", name: "Gemini 3 Pro High" },
      { id: "gemini-3-pro-low", name: "Gemini 3 Pro Low" },
      { id: "gemini-3-flash", name: "Gemini 3 Flash" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ],
  },

  github: {
    id: "github",
    alias: "gh",
    format: "openai",
    executor: "github",
    baseUrl: "https://api.githubcopilot.com/chat/completions",
    authType: "oauth",
    authHeader: "bearer",
    headers: {
      "copilot-integration-id": "vscode-chat",
      "editor-version": "vscode/1.107.1",
      "editor-plugin-version": "copilot-chat/0.26.7",
      "user-agent": "GitHubCopilotChat/0.26.7",
      "openai-intent": "conversation-panel",
      "x-github-api-version": "2025-04-01",
      "x-vscode-user-agent-library-version": "electron-fetch",
      "X-Initiator": "user",
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    models: [
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-5", name: "GPT-5" },
      { id: "gpt-5-mini", name: "GPT-5 Mini" },
      { id: "gpt-5-codex", name: "GPT-5 Codex" },
      { id: "gpt-5.1", name: "GPT-5.1" },
      { id: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
      { id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini" },
      { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
      { id: "gpt-5.2", name: "GPT-5.2" },
      { id: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
      { id: "claude-opus-4.1", name: "Claude Opus 4.1" },
      { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5 (Full ID)" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-3-flash", name: "Gemini 3 Flash" },
      { id: "gemini-3-pro", name: "Gemini 3 Pro" },
      { id: "grok-code-fast-1", name: "Grok Code Fast 1" },
      { id: "raptor-mini", name: "Raptor Mini" },
    ],
  },

  kiro: {
    id: "kiro",
    alias: "kr",
    format: "kiro",
    executor: "kiro",
    baseUrl: "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
    authType: "oauth",
    authHeader: "bearer",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/vnd.amazon.eventstream",
      "X-Amz-Target": "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
      "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
      "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0"
    },
    oauth: {
      tokenUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
      authUrl: "https://prod.us-east-1.auth.desktop.kiro.dev"
    },
    models: [
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
    ],
  },

  cursor: {
    id: "cursor",
    alias: "cu",
    format: "cursor",
    executor: "cursor",
    baseUrl: "https://api2.cursor.sh",
    chatPath: "/aiserver.v1.ChatService/StreamUnifiedChatWithTools",
    authType: "oauth",
    authHeader: "bearer",
    headers: {
      "connect-accept-encoding": "gzip",
      "connect-protocol-version": "1",
      "Content-Type": "application/connect+proto",
      "User-Agent": "connect-es/1.6.1"
    },
    clientVersion: "1.1.3",
    models: [
      { id: "default", name: "Auto (Server Picks)" },
      { id: "claude-4.5-opus-high-thinking", name: "Claude 4.5 Opus High Thinking" },
      { id: "claude-4.5-opus-high", name: "Claude 4.5 Opus High" },
      { id: "claude-4.5-sonnet-thinking", name: "Claude 4.5 Sonnet Thinking" },
      { id: "claude-4.5-sonnet", name: "Claude 4.5 Sonnet" },
      { id: "claude-4.5-haiku", name: "Claude 4.5 Haiku" },
      { id: "claude-4.5-opus", name: "Claude 4.5 Opus" },
      { id: "gpt-5.2-codex", name: "GPT 5.2 Codex" },
    ],
  },

  // ─── API Key Providers ─────────────────────────────────────────────────
  openai: {
    id: "openai",
    alias: "openai",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "o1", name: "O1" },
      { id: "o1-mini", name: "O1 Mini" },
    ],
  },

  anthropic: {
    id: "anthropic",
    alias: "anthropic",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.anthropic.com/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    headers: {
      "Anthropic-Version": "2023-06-01",
    },
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    ],
  },

  openrouter: {
    id: "openrouter",
    alias: "openrouter",
    format: "openai",
    executor: "default",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    headers: {
      "HTTP-Referer": "https://endpoint-proxy.local",
      "X-Title": "Endpoint Proxy"
    },
    models: [
      { id: "auto", name: "Auto (Best Available)" },
    ],
  },

  glm: {
    id: "glm",
    alias: "glm",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.z.ai/api/anthropic/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
    },
    models: [
      { id: "glm-4.7", name: "GLM 4.7" },
      { id: "glm-4.6v", name: "GLM 4.6V (Vision)" },
    ],
  },

  kimi: {
    id: "kimi",
    alias: "kimi",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.moonshot.ai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "kimi-k2.5", name: "Kimi K2.5" },
      { id: "kimi-k2.5-thinking", name: "Kimi K2.5 Thinking" },
      { id: "kimi-latest", name: "Kimi Latest" },
    ],
  },

  "kimi-coding": {
    id: "kimi-coding",
    alias: "kmc",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.kimi.com/coding/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
    },
    models: [
      { id: "kimi-k2.5", name: "Kimi K2.5" },
      { id: "kimi-k2.5-thinking", name: "Kimi K2.5 Thinking" },
      { id: "kimi-latest", name: "Kimi Latest" },
    ],
  },

  minimax: {
    id: "minimax",
    alias: "minimax",
    format: "claude",
    executor: "default",
    baseUrl: "https://api.minimax.io/anthropic/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
    },
    models: [
      { id: "MiniMax-M2.1", name: "MiniMax M2.1" },
    ],
  },

  "minimax-cn": {
    id: "minimax-cn",
    alias: "minimax-cn",   // unique alias (was colliding with minimax)
    format: "claude",
    executor: "default",
    baseUrl: "https://api.minimaxi.com/anthropic/v1/messages",
    urlSuffix: "?beta=true",
    authType: "apikey",
    authHeader: "x-api-key",
    headers: {
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14"
    },
    models: [
      // Keep parity with minimax to ensure model discovery works for minimax-cn connections.
      { id: "MiniMax-M2.1", name: "MiniMax M2.1" },
    ],
  },

  deepseek: {
    id: "deepseek",
    alias: "ds",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3.2 Chat" },
      { id: "deepseek-reasoner", name: "DeepSeek V3.2 Reasoner" },
    ],
  },

  groq: {
    id: "groq",
    alias: "groq",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" },
      { id: "qwen/qwen3-32b", name: "Qwen3 32B" },
      { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
    ],
  },

  xai: {
    id: "xai",
    alias: "xai",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.x.ai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "grok-4", name: "Grok 4" },
      { id: "grok-4-fast-reasoning", name: "Grok 4 Fast Reasoning" },
      { id: "grok-code-fast-1", name: "Grok Code Fast" },
      { id: "grok-3", name: "Grok 3" },
    ],
  },

  mistral: {
    id: "mistral",
    alias: "mistral",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "mistral-large-latest", name: "Mistral Large 3" },
      { id: "codestral-latest", name: "Codestral" },
      { id: "mistral-medium-latest", name: "Mistral Medium 3" },
    ],
  },

  perplexity: {
    id: "perplexity",
    alias: "pplx",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.perplexity.ai/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "sonar-pro", name: "Sonar Pro" },
      { id: "sonar", name: "Sonar" },
    ],
  },

  together: {
    id: "together",
    alias: "together",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.together.xyz/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo" },
      { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" },
      { id: "Qwen/Qwen3-235B-A22B", name: "Qwen3 235B" },
      { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", name: "Llama 4 Maverick" },
    ],
  },

  fireworks: {
    id: "fireworks",
    alias: "fireworks",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.fireworks.ai/inference/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "accounts/fireworks/models/deepseek-v3p1", name: "DeepSeek V3.1" },
      { id: "accounts/fireworks/models/llama-v3p3-70b-instruct", name: "Llama 3.3 70B" },
      { id: "accounts/fireworks/models/qwen3-235b-a22b", name: "Qwen3 235B" },
    ],
  },

  cerebras: {
    id: "cerebras",
    alias: "cerebras",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "llama-3.3-70b", name: "Llama 3.3 70B" },
      { id: "llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" },
      { id: "qwen-3-32b", name: "Qwen3 32B" },
    ],
  },

  cohere: {
    id: "cohere",
    alias: "cohere",
    format: "openai",
    executor: "default",
    baseUrl: "https://api.cohere.com/v2/chat",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "command-r-plus-08-2024", name: "Command R+ (Aug 2024)" },
      { id: "command-r-08-2024", name: "Command R (Aug 2024)" },
      { id: "command-a-03-2025", name: "Command A (Mar 2025)" },
    ],
  },

  nvidia: {
    id: "nvidia",
    alias: "nvidia",
    format: "openai",
    executor: "default",
    baseUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "nvidia/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
      { id: "meta/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
    ],
  },
};

// ── Generator Functions ───────────────────────────────────────────────────

/** Generate legacy PROVIDERS object shape for constants.js backward compatibility */
export function generateLegacyProviders() {
  const providers = {};
  for (const [id, entry] of Object.entries(REGISTRY)) {
    const p = { format: entry.format };

    // URL(s)
    if (entry.baseUrls) {
      p.baseUrls = entry.baseUrls;
    } else if (entry.baseUrl) {
      p.baseUrl = entry.baseUrl;
    }

    // Headers
    if (entry.headers) p.headers = { ...entry.headers };

    // OAuth
    if (entry.oauth) {
      if (entry.oauth.clientIdEnv) {
        p.clientId = process.env[entry.oauth.clientIdEnv] || entry.oauth.clientIdDefault;
      }
      if (entry.oauth.clientSecretEnv) {
        p.clientSecret = process.env[entry.oauth.clientSecretEnv] || entry.oauth.clientSecretDefault;
      }
      if (entry.oauth.tokenUrl) p.tokenUrl = entry.oauth.tokenUrl;
      if (entry.oauth.authUrl) p.authUrl = entry.oauth.authUrl;
    }

    // Cursor-specific
    if (entry.chatPath) p.chatPath = entry.chatPath;
    if (entry.clientVersion) p.clientVersion = entry.clientVersion;

    providers[id] = p;
  }
  return providers;
}

/** Generate PROVIDER_MODELS map (alias → model list) */
export function generateModels() {
  const models = {};
  for (const entry of Object.values(REGISTRY)) {
    if (entry.models && entry.models.length > 0) {
      const key = entry.alias || entry.id;
      // If alias already exists, don't overwrite (first wins)
      if (!models[key]) {
        models[key] = entry.models;
      }
    }
  }
  return models;
}

/** Generate PROVIDER_ID_TO_ALIAS map */
export function generateAliasMap() {
  const map = {};
  for (const entry of Object.values(REGISTRY)) {
    map[entry.id] = entry.alias || entry.id;
  }
  return map;
}

// ── Registry Lookup Helpers ───────────────────────────────────────────────

const _byAlias = new Map();
for (const entry of Object.values(REGISTRY)) {
  if (entry.alias && entry.alias !== entry.id) {
    _byAlias.set(entry.alias, entry);
  }
}

/** Get registry entry by provider ID or alias */
export function getRegistryEntry(provider) {
  return REGISTRY[provider] || _byAlias.get(provider) || null;
}

/** Get all registered provider IDs */
export function getRegisteredProviders() {
  return Object.keys(REGISTRY);
}
