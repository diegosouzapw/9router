# Plano de Implementação: P0 + Deltas GitHub (Issues #73 e #102)

## Resumo

Implementar uma correção fechada para o bloco crítico de roteamento/modelos, com escopo já decidido:

1. Corrigir fallback implícito de modelo sem prefixo para evitar roteamento incorreto para OpenAI (`#73`).
2. Suportar `/responses` para modelos GitHub Copilot que exigem esse endpoint (`#102`), incluindo `stream=true` e `stream=false`.
3. Atualizar catálogo GitHub com correções críticas e modelos extras aprovados (`GPT-4o mini`, `GPT-4`, `GPT-3.5 Turbo`), mantendo compatibilidade via aliases.

## Escopo Fechado

1. Implementar apenas `P0 + deltas GitHub`.
2. Política de fallback sem prefixo:
   `resolver por provedor único` e `retornar erro em caso ambíguo`.
3. Estratégia `/responses` GitHub:
   `lista explícita + metadata`.
4. Cobrir também `non-stream` (`stream=false`) para modelos GitHub em `/responses`.

## Mudanças Técnicas (Decision Complete)

### 1. Resolução de Modelo e Política de Ambiguidade (#73)

1. Arquivo: `open-sse/services/model.js`
2. Adicionar resolução canônica provider/model com duas camadas:
   - `PROVIDER_MODEL_ALIASES` para aliases legados por provider (inicialmente `github`).
   - índice reverso `modelId -> [providers]` derivado de `PROVIDER_MODELS`.
3. Alterar `getModelInfoCore()`:
   - Manter comportamento atual para `provider/model` explícito, aplicando canonicalização de alias de modelo.
   - Para modelo sem prefixo não resolvido em aliases de usuário:
     - Se existir no catálogo de `openai`: manter fallback para `openai`.
     - Se existir em exatamente 1 provider não-openai: resolver para esse provider.
     - Se existir em 2+ providers não-openai: retornar `provider: null` com erro semântico de ambiguidade.
     - Se não existir em catálogo: manter fallback para `openai` (compatibilidade).
4. Arquivo: `src/sse/services/model.js`
   - Propagar metadados de erro retornados por `getModelInfoCore()` sem apagar contexto.
5. Arquivo: `src/sse/handlers/chat.js`
   - Quando `provider` vier nulo por ambiguidade, retornar `400` com mensagem explícita:
     `Ambiguous model '<id>'. Use provider/model prefix (ex: gh/<id> or cc/<id>).`

### 2. Endpoint Dinâmico `/chat/completions` vs `/responses` para GitHub (#102)

1. Arquivo: `open-sse/config/providerRegistry.js`
2. Em `github.models`, marcar modelos Codex com metadata explícita:
   `targetFormat: "openai-responses"`.
3. Modelos inicialmente marcados como `openai-responses`:
   - `gpt-5-codex`
   - `gpt-5.1-codex`
   - `gpt-5.1-codex-mini`
   - `gpt-5.1-codex-max`
   - `gpt-5.2-codex`
4. Adicionar `responsesBaseUrl` em `github`:
   - `baseUrl`: `https://api.githubcopilot.com/chat/completions`
   - `responsesBaseUrl`: `https://api.githubcopilot.com/responses`
5. Arquivo: `open-sse/config/providerRegistry.js` (gerador)
   - Em `generateLegacyProviders()`, copiar `responsesBaseUrl` para `PROVIDERS.github`.
6. Arquivo: `open-sse/executors/github.js`
   - `buildUrl(model, stream, urlIndex)` deve:
     - usar `getModelTargetFormat("gh", model)`;
     - se `openai-responses`, usar `responsesBaseUrl`;
     - caso contrário, usar `baseUrl`.

### 3. Deltas de Catálogo GitHub (Críticos + Extras aprovados)

1. Arquivo: `open-sse/config/providerRegistry.js` (`github.models`)
2. Aplicar correções críticas:
   - `raptor-mini` -> `oswe-vscode-prime` (nome exibido: Raptor Mini).
   - `gemini-3-pro` -> `gemini-3-pro-preview`.
   - `gemini-3-flash` -> `gemini-3-flash-preview`.
   - adicionar `claude-opus-4.6`.
   - adicionar `gpt-4o`.
3. Aplicar extras aprovados:
   - adicionar `gpt-4o-mini`.
   - adicionar `gpt-4`.
   - adicionar `gpt-3.5-turbo`.
4. Manter compatibilidade retroativa via `PROVIDER_MODEL_ALIASES` no `open-sse/services/model.js`:
   - `github: claude-4.5-opus -> claude-opus-4-5-20251101`
   - `github: claude-opus-4.5 -> claude-opus-4-5-20251101`
   - `github: gemini-3-pro -> gemini-3-pro-preview`
   - `github: gemini-3-flash -> gemini-3-flash-preview`
   - `github: raptor-mini -> oswe-vscode-prime`

### 4. Suporte Non-Stream para Respostas GitHub em `/responses`

1. Arquivo: `open-sse/handlers/responseTranslator.js`
2. Adicionar branch para `targetFormat === FORMATS.OPENAI_RESPONSES`:
   - Converter resposta `Responses API` não-stream para objeto `chat.completion` OpenAI.
   - Extrair `message content` do array `output`.
   - Mapear `function_call` para `tool_calls` quando houver.
   - Mapear usage (`input_tokens/output_tokens`) para `prompt_tokens/completion_tokens/total_tokens`.
3. Arquivo: `open-sse/handlers/usageExtractor.js`
   - Adicionar extração de usage para payload `Responses API` (`responseBody.usage.input_tokens/output_tokens`).

## Mudanças Importantes em APIs/Interfaces/Tipos

1. Interface interna de resolução de modelo:
   - `getModelInfoCore()` passa a poder retornar erro semântico de ambiguidade (provider nulo + mensagem contextual).
2. Metadata de modelo no registry:
   - uso de `targetFormat` em modelos GitHub para guiar tradução e seleção de endpoint.
3. Config do provider legado:
   - `PROVIDERS.github.responsesBaseUrl` disponível para executor.
4. Comportamento público:
   - modelos sem prefixo ambíguos passam a retornar `400` com instrução de prefixo.
   - modelos GH Codex passam a usar `/responses` automaticamente.

## Testes e Cenários de Validação

### Testes de Unidade/Smoke (determinísticos)

1. `open-sse/services/model.js`:
   - `claude-haiku-4-5-20251001` sem prefixo resolve provider único (`claude`).
   - `gpt-4o` sem prefixo continua resolvendo para `openai`.
   - modelo ambíguo sem prefixo retorna erro de ambiguidade.
   - `gh/claude-4.5-opus` canonicaliza para `claude-opus-4-5-20251101`.
2. `open-sse/executors/github.js`:
   - `gpt-5.1-codex` usa `/responses`.
   - `gpt-5` usa `/chat/completions`.
3. `open-sse/handlers/responseTranslator.js`:
   - payload non-stream `Responses API` converte para `chat.completion` válido com `usage`.
4. `open-sse/handlers/usageExtractor.js`:
   - usage de `Responses API` é extraído corretamente.

### Validação de Integração

1. `POST /v1/chat/completions` com `model=gh/gpt-5.1-codex`, `stream=true`:
   - sem erro de endpoint.
2. Mesmo teste com `stream=false`:
   - retorno final no formato OpenAI chat completion.
3. `POST /v1/chat/completions` com `model=claude-haiku-4-5-20251001` sem prefixo:
   - não roteia para OpenAI.
4. `POST /v1/chat/completions` com modelo ambíguo sem prefixo:
   - recebe `400` com mensagem para usar prefixo.

### Check final de qualidade

1. `npm run lint`
2. `npm run build`

## Rollout e Observabilidade

1. Rollout direto em branch de feature (sem migration de DB).
2. Logar warning quando ocorrer ambiguidade de modelo sem prefixo.
3. Registrar no changelog interno:
   - breaking behavior controlado para modelos ambíguos sem prefixo.
   - correção de endpoint GH Codex.

## Riscos e Mitigações

1. Risco: mudança de comportamento para usuários que dependiam de fallback implícito errado.
   - Mitigação: erro 400 explícito e instrução de prefixo.
2. Risco: regressão em modelos GH não-Codex.
   - Mitigação: regra explícita por metadata, não por heurística global.
3. Risco: diferenças de payload `Responses API` non-stream.
   - Mitigação: converter apenas campos estáveis e fallback seguro para conteúdo vazio quando necessário.

## Assumptions e Defaults

1. `Codex` no provider `gh` deve usar `/responses` por padrão.
2. `fallback openai` permanece para modelos desconhecidos não catalogados (compatibilidade).
3. Para ambiguidade sem prefixo, política é fail-with-message (não autoescolher provider).
4. Catálogo GH incluirá correções críticas + extras aprovados nesta mesma entrega.
