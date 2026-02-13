# Plano de Implementacao: Habilitar SOCKS5 de ponta a ponta no 9Router

## Resumo

- Objetivo: habilitar `socks5` no fluxo completo de proxy (configuracao, teste, persistencia e trafego outbound real), mantendo politica `fail-closed`.
- Estado atual de referencia: `socks5` bloqueado em runtime e APIs de proxy, com UI/tipos exibindo opcao.
- Entrega: habilitacao controlada por feature flags backend/frontend com cobertura de testes e rollout gradual.

## Escopo

1. Reativar suporte SOCKS5 para proxy hierarquico (`key -> combo -> provider -> global`).
2. Preservar comportamento atual para HTTP/HTTPS.
3. Preservar sem fallback para conexao direta quando proxy configurado falhar.
4. Incluir cobertura de testes automatizados e validacao manual operacional.

## Fora de escopo

1. Suporte SOCKS4.
2. Troca do modelo de armazenamento de credenciais de proxy.
3. Alteracoes de logs/analytics fora do necessario para distinguir SOCKS5.

## Decisoes fechadas

1. Protocolos suportados: `http`, `https`, `socks5`.
2. Politica de falha: `fail-closed` obrigatoria para qualquer proxy configurado.
3. Implementacao SOCKS5: `fetch-socks` com dispatcher compativel com `fetch/undici`.
4. HTTP/HTTPS continuam com `undici.ProxyAgent`.
5. Rollout com flags:
   - Backend: `ENABLE_SOCKS5_PROXY` (default `false`).
   - Frontend: `NEXT_PUBLIC_ENABLE_SOCKS5_PROXY` (default `false`).
6. Configuracao legada `socks5` com backend flag desabilitada: erro explicito e bloqueio da requisicao (sem fallback).
7. Sem migracao de banco; `proxyConfig.type` ja comporta `socks5`.

## Mudancas de implementacao

### 1) Modulo compartilhado de dispatcher

- Criar `open-sse/utils/proxyDispatcher.js`.
- Exportar:
  - `normalizeProxyUrl(proxyUrl, source, { allowSocks5 })`
  - `proxyConfigToUrl(proxyConfig, { allowSocks5 })`
  - `createProxyDispatcher(proxyUrl)`
- Regras:
  - `http/https` -> `new ProxyAgent(proxyUrl)`.
  - `socks5` -> `socksDispatcher({ type: 5, host, port, userId, password })`.
  - Erros de parsing/protocolo retornam erro explicito.
- Cache compartilhado de dispatcher por `proxyUrl`.
- Nunca logar senha; logar apenas `type://host:port`.

### 2) Runtime de fetch

- Refatorar `open-sse/utils/proxyFetch.js` para reutilizar `proxyDispatcher`.
- Remover bloqueio hardcoded de `socks5`.
- Resolver proxy por contexto (`runWithProxyContext`) e por ambiente (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`).
- Aplicar dispatcher com `createProxyDispatcher`.
- Manter `fail-closed` para qualquer falha de proxy configurado.
- Garantir que com proxy explicito nao exista tentativa de conexao direta.

### 3) API de configuracao de proxy

- Atualizar `src/app/api/settings/proxy/route.js`.
- Validacao:
  - `ENABLE_SOCKS5_PROXY=false`: rejeitar `socks5` com `400`.
  - `ENABLE_SOCKS5_PROXY=true`: aceitar `socks5` alem de `http/https`.
- Normalizacao:
  - `type` sempre em lowercase.
  - manter padrao de armazenamento de `port` como string.
- Erros no formato `{ error: { message, type } }`.

### 4) API de teste de proxy

- Atualizar `src/app/api/settings/proxy/test/route.js`.
- Reutilizar `proxyDispatcher` compartilhado.
- Com `ENABLE_SOCKS5_PROXY=false`, rejeitar `socks5` com `400`.
- Com flag habilitada, testar via `undiciRequest` com dispatcher SOCKS5.
- Timeout de `10s` para cabecalho e corpo.
- Respostas:
  - sucesso: `{ success, publicIp, latencyMs, proxyUrl }`
  - falha: `{ success:false, error, latencyMs, proxyUrl }`

### 5) UI de configuracao

- Atualizar `src/shared/components/ProxyConfigModal.js`.
- Exibir opcao SOCKS5 apenas com `NEXT_PUBLIC_ENABLE_SOCKS5_PROXY=true`.
- Placeholder de porta:
  - `1080` para `socks5`
  - `8080` para `http/https`
- Quando backend rejeitar, exibir mensagem clara na UI.

### 6) Tipos e contrato

- Manter contrato em `src/types/settings.ts`: `type: "http" | "https" | "socks5"`.
- Documentar variaveis:
  - `ENABLE_SOCKS5_PROXY`
  - `NEXT_PUBLIC_ENABLE_SOCKS5_PROXY`

### 7) Dependencias

- Adicionar `fetch-socks` em `dependencies`.
- Remover `socks-proxy-agent` apenas se nao houver uso residual.

## Mudancas em APIs/interfaces

1. `PUT /api/settings/proxy`:
   - aceita `proxy.type="socks5"` quando `ENABLE_SOCKS5_PROXY=true`.
   - retorna `400` quando flag `false`.
2. `POST /api/settings/proxy/test`:
   - testa `socks5` quando habilitado.
   - rejeita com `400` quando desabilitado.
3. Novas variaveis operacionais:
   - `ENABLE_SOCKS5_PROXY`
   - `NEXT_PUBLIC_ENABLE_SOCKS5_PROXY`

## Plano de testes automatizados

### Unitarios de dispatcher

1. `normalizeProxyUrl` aceita `socks5://` com `allowSocks5=true`.
2. `normalizeProxyUrl` rejeita `socks5://` com `allowSocks5=false`.
3. `createProxyDispatcher` cria dispatcher para `http`, `https`, `socks5`.

### Unitarios de runtime

1. `runWithProxyContext` aceita SOCKS5 quando habilitado.
2. SOCKS5 em contexto com flag desabilitada falha explicitamente.
3. Proxy invalido falha sem fallback direto.

### Unitarios/API routes

1. `PUT /api/settings/proxy`:
   - `socks5` retorna `400` com flag `false`.
   - `socks5` retorna `200` com flag `true`.
2. `POST /api/settings/proxy/test`:
   - `socks5` retorna `400` com flag `false`.
   - `socks5` executa teste com flag `true`.

### Regressao

1. Atualizar `tests/unit/fixes-p1.test.mjs` para cenarios condicionais por flag.
2. Garantir `npm run test:plan3` verde.
3. Garantir `npm run test:fixes` verde com cobertura SOCKS5.

## Validacao manual funcional

1. `ENABLE_SOCKS5_PROXY=false`:
   - salvar SOCKS5 via UI/API retorna `400` explicito.
2. `ENABLE_SOCKS5_PROXY=true`:
   - configurar proxy global SOCKS5 valido e validar trafego em `/api/v1/chat/completions`.
3. Falha controlada:
   - derrubar proxy SOCKS5 e confirmar erro imediato (sem fallback direto).
4. Hierarquia:
   - SOCKS5 em nivel `key` deve prevalecer sobre `global`.

## Rollout e observabilidade

1. Fase 1: merge com flags em default `false`.
2. Fase 2: habilitar em staging (`true`) e monitorar por 24h.
3. Fase 3: canario em producao com subconjunto de nos.
4. Fase 4: habilitacao geral apos estabilidade.
5. Logs minimos:
   - tipo aplicado (`http|https|socks5`)
   - nivel de resolucao (`key|combo|provider|global|env`)
   - erros de handshake/autenticacao SOCKS sem credenciais sensiveis

## Criterios de aceite

1. SOCKS5 funcional no trafego outbound real quando habilitado.
2. Sem fallback direto quando proxy SOCKS5 falhar.
3. API/UI coerentes com flags.
4. Testes automatizados para HTTP/HTTPS/SOCKS5 aprovados.
5. Sem regressao em rotas e testes existentes.

## Assumptions e defaults

1. SOCKS4 nao suportado.
2. Porta default de `socks5`: `1080`.
3. Flags default `false`.
4. Sem migracao de dados.
5. Configuracao legada SOCKS5 com flag desabilitada deve falhar explicitamente.
