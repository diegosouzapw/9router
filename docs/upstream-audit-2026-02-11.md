# Auditoria Upstream vs Fork Local — 9router

Data de referência: **11/02/2026**  
Snapshot UTC: **2026-02-11T06:25:03Z**  
Fork local analisado: `main` @ `61fa9a5`  
Upstream analisado: `decolua/9router` `master` @ `c090bb0`

## Sumário Executivo
- Escopo auditado com snapshot congelado:
  - **35 issues abertas**
  - **8 PRs abertas**
  - **22 commits no upstream/master desde 08/02/2026**
- Divergência de histórico: `main...upstream/master = 84/18` (fork muito afastado).
- Conclusão principal: **não recomenda merge/cherry-pick direto em bloco**; recomenda **backport seletivo por tema**.
- Principais riscos pendentes no fork:
  - roteamento de modelo com fallback implícito para `openai` (issue #73)
  - GitHub Copilot com modelos que exigem `/responses` (issue #102)
  - inconsistências de IDs/model mapping no provedor `github` (issues #3, #94, #95, #96, #97, #98)
  - persistência de usage fora de `DATA_DIR`/XDG (issues #37, #53)

## Metodologia e Critérios
- Fontes congeladas em `docs/upstream-audit-data/2026-02-11/`:
  - `snapshot-meta.json`
  - `issues-open.json`
  - `pulls-open.json`
  - `commits-since-2026-02-08.json`
- Limitação operacional:
  - o GitHub API público sem autenticação aplicou rate limit em parte da coleta detalhada de comentários/arquivos; para manter consistência, a classificação foi baseada no snapshot congelado + inspeção direta do fork local + dados de PR/commit já capturados na sessão.
- Critérios usados por item:
  - `status no fork`: `Resolvida`, `Parcial`, `Não resolvida`, `Não aplicável`
  - recomendação: `Backport upstream`, `Reimplementar no desenho atual`, `Descartar`
- Priorização aplicada:
  - `score = Impacto(1-5) x Urgência(1-5) x Risco(1-5) / Esforço(1-5)`
  - `P0 >= 12`, `P1 6-11.9`, `P2 3-5.9`, `Won’t do < 3`

## Mudanças de API/Interface com Impacto (propostas)
1. Endpoints OpenAI compatíveis:
- tratar seleção dinâmica `/chat/completions` vs `/responses` para modelos GitHub Copilot específicos.

2. Mapeamento de modelos/aliases:
- revisar `open-sse/config/providerRegistry.js` e resolver aliases legados em `open-sse/services/model.js`.

3. Persistência:
- alinhar `usageDb` com `DATA_DIR` e considerar suporte `XDG_CONFIG_HOME` para Linux/macOS.

4. Métricas de uso:
- adicionar agregação por API key além de `connectionId`.

5. Validação:
- reforçar contratos em `src/shared/validation/schemas.js` para novas chaves de config/metrics.

## Matriz Completa de Issues (35/35)

### #2 — 翻译？渲染还有点问题
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/2
- categoria: `DX/UX` | severidade: `Baixa`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: não há correção explícita rastreável; base apenas em relato UI i18n/render.
- recomendação: `Reimplementar no desenho atual`
- prós: melhora UX internacional.
- contras: baixa reprodutibilidade do bug original.
- risco se ignorar: ruído de UX em idiomas não-en.
- esforço: `M`
- prioridade: `P2`

### #3 — How to use raptor mini ?
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/3
- categoria: `Bug` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: `open-sse/config/providerRegistry.js:275` mantém `raptor-mini`; upstream aponta correção para ID real (`oswe-vscode-prime`).
- recomendação: `Backport upstream` (adaptado ao registry atual)
- prós: reduz 400 em GitHub provider.
- contras: precisa validar catálogo real do endpoint.
- risco se ignorar: modelos continuam falhando em produção.
- esforço: `S`
- prioridade: `P0`

### #4 — AmpCode doesn't appear in the CLI Tools panel
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/4
- categoria: `Feature` | severidade: `Baixa`
- status upstream: `Aberta`
- status no fork: `Não aplicável`
- evidência: não há `ampcode` no catálogo de ferramentas: `src/shared/constants/cliTools.js`.
- recomendação: `Descartar` (ou backlog P2 se virar alvo do produto)
- prós: evita aumentar escopo sem demanda clara local.
- contras: oportunidade de adoção perdida para esse cliente.
- risco se ignorar: baixo.
- esforço: `M`
- prioridade: `Won’t do`

### #5 — unified json response not separate data
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/5
- categoria: `DX/UX` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: `open-sse/handlers/chatCore.js:57`, `open-sse/handlers/chatCore.js:257` (suporte não-stream com `stream=false`).
- recomendação: `Descartar` (já coberto)
- prós: compatibilidade com clientes que não consomem SSE chunkado.
- contras: nenhum relevante.
- risco se ignorar: nulo (já resolvido).
- esforço: `-`
- prioridade: `-`

### #8 — REQ: Kiro IDE/CLI
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/8
- categoria: `Feature` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: `open-sse/config/providerRegistry.js:279`, `open-sse/executors/kiro.js:28`, `src/lib/oauth/providers.js:609`.
- recomendação: `Descartar` (já coberto)
- prós: suporte direto ao ecossistema Kiro.
- contras: manutenção contínua de OAuth proprietário.
- risco se ignorar: nulo (já resolvido).
- esforço: `-`
- prioridade: `-`

### #9 — OpenAI Not Working
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/9
- categoria: `Bug` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: bypass restrito ao `claude-cli` em `open-sse/utils/bypassHandler.js:22`; integração via `open-sse/handlers/chatCore.js:44`.
- recomendação: `Descartar` (já coberto)
- prós: evita falso bypass em clientes OpenAI-like.
- contras: depende de `user-agent` correto.
- risco se ignorar: regressão de roteamento.
- esforço: `-`
- prioridade: `-`

### #10 — Login OpenAI Codex fails due to incorrect callback URL
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/10
- categoria: `Bug` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: callback dedicado com porta fixa em `src/lib/oauth/providers.js:85`; servidor de callback em `src/app/api/oauth/[provider]/[action]/route.js:77`, `src/app/api/oauth/[provider]/[action]/route.js:96`.
- recomendação: `Descartar` (já coberto)
- prós: fluxo OAuth Codex consistente.
- contras: porta fixa pode conflitar em ambientes restritos.
- risco se ignorar: quebra de login Codex.
- esforço: `-`
- prioridade: `-`

### #11 — Only 'checking for updates' appears and does not run
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/11
- categoria: `DX/UX` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: há melhorias de runtime/CLI no fork, porém sem correlação direta comprovada com esse sintoma.
- recomendação: `Reimplementar no desenho atual` (teste e telemetria específica)
- prós: reduz tickets de bootstrap travado.
- contras: difícil reproduzir sem ambiente do reportante.
- risco se ignorar: onboarding quebrado para subset de usuários.
- esforço: `M`
- prioridade: `P2`

### #13 — Can this tool not be used in cherry studio?
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/13
- categoria: `Bug` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: suporte a `/v1/responses` e tradução multi-formato em `src/app/api/v1/responses/route.js:25`, `open-sse/handlers/responsesHandler.js:11`.
- recomendação: `Reimplementar no desenho atual` (teste de compatibilidade com Cherry Studio)
- prós: amplia compatibilidade cliente.
- contras: exige suíte de contratos externa.
- risco se ignorar: erro 500 em integrações específicas.
- esforço: `M`
- prioridade: `P1`

### #23 — failed to load usage statistics
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/23
- categoria: `Bug` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: endpoints ativos `src/app/api/usage/history/route.js:6`, `src/app/api/usage/logs/route.js:6`, `src/app/api/usage/analytics/route.js:10`.
- recomendação: `Descartar` (já coberto)
- prós: dashboard de uso funcional.
- contras: ainda depende de path de usage local.
- risco se ignorar: baixo.
- esforço: `-`
- prioridade: `-`

### #24 — 500 error when integrating with Claude Code
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/24
- categoria: `Bug` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: tratamento robusto de tradução/erros em `open-sse/handlers/chatCore.js` (blocos de try/catch e `createErrorResult`).
- recomendação: `Reimplementar no desenho atual` com cenário de regressão automatizado.
- prós: reduz 500 e melhora confiança do roteador.
- contras: demanda fixture real de Claude Code.
- risco se ignorar: falha intermitente em fluxo principal.
- esforço: `M`
- prioridade: `P1`

### #25 — API Error:400 github copilot
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/25
- categoria: `DX/UX` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: retorno explícito de credencial ausente em `src/sse/handlers/chat.js:160`.
- recomendação: `Reimplementar no desenho atual` (mensagens guiadas de setup)
- prós: menos erro de configuração por usuário final.
- contras: não corrige falhas reais de backend.
- risco se ignorar: suporte sobrecarregado por erro de setup.
- esforço: `S`
- prioridade: `P2`

### #27 — Consider to add Microsoft Copilot
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/27
- categoria: `Feature` | severidade: `Baixa`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: ausência de provider Microsoft no registry (`open-sse/config/providerRegistry.js`).
- recomendação: `Descartar` (fora do escopo atual)
- prós: evita expansão sem validação de ROI.
- contras: perde demanda potencial.
- risco se ignorar: baixo.
- esforço: `L`
- prioridade: `Won’t do`

### #33 — Support third-party APIs compatible with OpenAI Responses API
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/33
- categoria: `Feature` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: suporte a `apiType=responses` em `src/app/api/provider-nodes/route.js:43`, `open-sse/services/provider.js:29`, `src/lib/providers/validation.js:39`.
- recomendação: `Descartar` (já coberto)
- prós: amplia compatibilidade com provedores third-party.
- contras: depende de validação por endpoint externo.
- risco se ignorar: nulo (já resolvido).
- esforço: `-`
- prioridade: `-`

### #36 — Add "OpenAI Compatible" API Key provider / custom base_url
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/36
- categoria: `Feature` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: CRUD de provider nodes e validação em `src/app/api/provider-nodes/route.js`, `src/app/api/provider-nodes/validate/route.js:3`.
- recomendação: `Descartar` (já coberto)
- prós: flexibilidade de integração (OpenRouter, Mistral etc).
- contras: heterogeneidade de compatibilidade por vendor.
- risco se ignorar: nulo (já resolvido).
- esforço: `-`
- prioridade: `-`

### #37 — use $XDG_CONFIG_HOME + UI bug path
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/37
- categoria: `Bug` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: `src/lib/localDb.js:35` e `src/lib/usageDb.js:40` usam `~/.9router`; documentação confirma `README.md:762`.
- recomendação: `Reimplementar no desenho atual`
- prós: aderência a padrão Linux/macOS, menos fricção operacional.
- contras: precisa migração de dados existente.
- risco se ignorar: confusão de path e suporte recorrente.
- esforço: `M`
- prioridade: `P1`

### #38 — Pre-fetch models from models.dev
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/38
- categoria: `Feature` | severidade: `Baixa`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: sem referência a `models.dev` no código.
- recomendação: `Descartar` (ou P2 opcional)
- prós: melhor UX em descoberta de modelos.
- contras: dependência externa + cache/invalidação.
- risco se ignorar: baixo.
- esforço: `M`
- prioridade: `Won’t do`

### #39 — Claude Code not auto /compact when using opus from ag
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/39
- categoria: `Bug` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: não há fluxo explícito de auto-compact para esse caso no pipeline atual.
- recomendação: `Reimplementar no desenho atual`
- prós: melhora continuidade de sessão para Claude Code + AG.
- contras: comportamento pode variar por cliente.
- risco se ignorar: sessões longas degradam/param.
- esforço: `M`
- prioridade: `P1`

### #42 — Add Dockerfile
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/42
- categoria: `Docs/Infra` | severidade: `Baixa`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: `Dockerfile:1` + seção Docker em `README.md:621`.
- recomendação: `Descartar` (já coberto)
- prós: deploy container pronto.
- contras: manutenção de multi-profile.
- risco se ignorar: nulo (já resolvido).
- esforço: `-`
- prioridade: `-`

### #45 — Task icon running service not terminal
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/45
- categoria: `Feature` | severidade: `Baixa`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: sem app desktop/tray no projeto (sem Electron/tray runtime dedicado).
- recomendação: `Descartar`
- prós: mantém foco no core proxy/router.
- contras: não atende cenário desktop-only.
- risco se ignorar: baixo.
- esforço: `L`
- prioridade: `Won’t do`

### #46 — Missing use case
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/46
- categoria: `Docs/Infra` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: documentação extensa no `README.md` e fluxo de combos/model switch no dashboard.
- recomendação: `Reimplementar no desenho atual` (guia curto in-app)
- prós: reduz curva de adoção.
- contras: exige manutenção contínua.
- risco se ignorar: dúvidas recorrentes de operação.
- esforço: `S`
- prioridade: `P2`

### #47 — Link documentation in webserver
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/47
- categoria: `DX/UX` | severidade: `Baixa`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: links ainda placeholder (`src/shared/components/Footer.js:13`, `src/shared/components/Footer.js:14`).
- recomendação: `Reimplementar no desenho atual`
- prós: melhora discoverability de docs.
- contras: ajuste simples, baixo impacto técnico.
- risco se ignorar: suporte manual aumenta.
- esforço: `XS`
- prioridade: `P2`

### #48 — Dashboard via LAN fica loading no login
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/48
- categoria: `Bug` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: cookie segura por `x-forwarded-proto` em `src/app/api/auth/login/route.js:34`; middleware em `src/proxy.js`.
- recomendação: `Reimplementar no desenho atual` com teste LAN/HTTP explícito.
- prós: reduz falhas de acesso remoto local.
- contras: requer matriz de teste por browser/reverse proxy.
- risco se ignorar: login pode ficar intermitente em rede local.
- esforço: `M`
- prioridade: `P1`

### #49 — Add Cursor IDE as OAuth Provider
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/49
- categoria: `Feature` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: `open-sse/config/providerRegistry.js:304`, `src/shared/constants/providers.js:17`, `src/lib/oauth/providers.js:728`.
- recomendação: `Descartar` (já coberto)
- prós: cobertura do ecossistema Cursor.
- contras: manutenção de mudanças no protocolo Cursor.
- risco se ignorar: nulo (já resolvido).
- esforço: `-`
- prioridade: `-`

### #53 — Data loss on container rebuild (DATA_DIR)
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/53
- categoria: `Bug` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: proteção de build e backup em `src/lib/localDb.js`; volumes documentados em `README.md:634`; porém usage segue independente de `DATA_DIR` (`README.md:762`).
- recomendação: `Reimplementar no desenho atual`
- prós: reduz risco de perda de dados em operação container.
- contras: migração de armazenamento de usage exige cuidado.
- risco se ignorar: perda parcial de histórico/telemetria.
- esforço: `M`
- prioridade: `P1`

### #54 — Auto Router / Smart Model Orchestrator
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/54
- categoria: `Feature` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: estratégias `priority/weighted` e retries em `open-sse/services/combo.js:3`, `open-sse/services/combo.js:156`, `open-sse/services/combo.js:216`; schema em `src/shared/validation/schemas.js:47`.
- recomendação: `Reimplementar no desenho atual` (falta heurística “smart” por tarefa)
- prós: base técnica já pronta para evolução.
- contras: ainda não há roteamento semântico automático.
- risco se ignorar: gap competitivo com orquestradores avançados.
- esforço: `L`
- prioridade: `P2`

### #72 — Codex Test Connection shows Access denied
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/72
- categoria: `Bug` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: modo `checkExpiry` para Codex em `src/app/api/providers/[id]/test/route.js:19`, `src/app/api/providers/[id]/test/route.js:22`.
- recomendação: `Descartar` (já coberto)
- prós: evita falso negativo no painel.
- contras: teste vira validade de token, não inferência completa.
- risco se ignorar: confusão operacional alta.
- esforço: `-`
- prioridade: `-`

### #73 — Claude Haiku routed to OpenAI provider
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/73
- categoria: `Bug` | severidade: `Crítica`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: fallback implícito para `openai` em `open-sse/services/model.js:105` e `open-sse/services/model.js:107`.
- recomendação: `Reimplementar no desenho atual`
- prós: elimina vazamento de requisições para provider errado.
- contras: precisa definir fallback seguro sem quebrar aliases livres.
- risco se ignorar: uso de credencial errada + respostas inválidas.
- esforço: `S`
- prioridade: `P0`

### #74 — Input/Output token counts always 0
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/74
- categoria: `Bug` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: extração e fallback de usage em `open-sse/utils/stream.js:133`, `open-sse/utils/stream.js:239`, `open-sse/utils/usageTracking.js:168`; persistência em `open-sse/handlers/chatCore.js:304`.
- recomendação: `Descartar` (já coberto)
- prós: analytics e logger confiáveis.
- contras: estimativa ainda heurística quando provider omite usage.
- risco se ignorar: decisões de custo/capacidade incorretas.
- esforço: `-`
- prioridade: `-`

### #76 — Subscription Tier Detection with Visual Badges
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/76
- categoria: `Feature` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: existe `plan` no painel de limites `src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.js:129`, `src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.js:370`; sem sistema universal de badges por tier.
- recomendação: `Reimplementar no desenho atual`
- prós: melhora gestão multi-conta.
- contras: APIs de tiers variam por provider.
- risco se ignorar: UX limitada para contas múltiplas.
- esforço: `M`
- prioridade: `P2`

### #82 — Why only one connection per compatible node?
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/82
- categoria: `Feature` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: bloqueio explícito em `src/app/api/providers/route.js:61`.
- recomendação: `Reimplementar no desenho atual` (feature flag por node)
- prós: habilita multi-account em nós compatíveis.
- contras: aumenta complexidade de seleção/fallback.
- risco se ignorar: limitação funcional para times.
- esforço: `M`
- prioridade: `P1`

### #85 — Usage history not showing
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/85
- categoria: `Bug` | severidade: `Média`
- status upstream: `Aberta`
- status no fork: `Resolvida`
- evidência: issue é duplicata de #74; rotas de usage ativas em `src/app/api/usage/history/route.js:6` e analytics em `src/app/api/usage/analytics/route.js:23`.
- recomendação: `Descartar` (já coberto)
- prós: clareza de observabilidade.
- contras: depende de persistência correta em disco.
- risco se ignorar: regressão visual de dados.
- esforço: `-`
- prioridade: `-`

### #90 — Website Pricing Section?
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/90
- categoria: `Docs/Infra` | severidade: `Baixa`
- status upstream: `Aberta`
- status no fork: `Não aplicável`
- evidência: questão de comunicação da landing, não do core proxy.
- recomendação: `Descartar`
- prós: evita desvio de foco técnico.
- contras: percepção comercial pode continuar ambígua.
- risco se ignorar: baixo.
- esforço: `XS`
- prioridade: `Won’t do`

### #93 — Gemini 3 Flash via Antigravity returns 400 invalid argument
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/93
- categoria: `Bug` | severidade: `Alta`
- status upstream: `Aberta`
- status no fork: `Parcial`
- evidência: filtragem de `thought/thoughtSignature` em `open-sse/executors/antigravity.js:36` e modelo `gemini-3-flash` registrado em `open-sse/config/providerRegistry.js:230`.
- recomendação: `Backport upstream` (testes de regressão AG específicos)
- prós: reduz 400 em compat mode.
- contras: ainda há relatos de 401/limits em cenários extremos.
- risco se ignorar: quebra de fluxo AG em IDEs.
- esforço: `S`
- prioridade: `P1`

### #102 — GitHub Copilot Codex models require /responses endpoint
- tipo: `Issue` | url: https://github.com/decolua/9router/issues/102
- categoria: `Bug` | severidade: `Crítica`
- status upstream: `Aberta`
- status no fork: `Não resolvida`
- evidência: URL fixa em `open-sse/config/providerRegistry.js:240` (`/chat/completions`) e executor sem roteamento por modelo em `open-sse/executors/github.js`.
- recomendação: `Reimplementar no desenho atual`
- prós: destrava modelos Codex do GitHub provider.
- contras: exige matriz de compat por modelo.
- risco se ignorar: 400 em modelos de maior valor.
- esforço: `M`
- prioridade: `P0`

### Itens adicionais (IDs 53,54,72,73,74,76,82,85,90,93,102) — Observações cruzadas
- #53/#37 estão acopladas: persistência e path policy.
- #73/#102/#3/#93 formam bloco de maior risco técnico no roteamento.
- #85 é efeito do #74 (já mitigado no fork).

## Matriz de PRs Abertas (8/8)

### PR #1 — Usage tab + Sticky round-robin + Auth + Logger +small fixes
- tipo: `PR` | url: https://github.com/decolua/9router/pull/1
- compatibilidade: `Já incorporado por caminho alternativo`
- evidência local: `src/lib/usageDb.js`, `src/proxy.js`, `src/app/api/auth/login/route.js`, `open-sse/utils/stream.js`.
- recomendação: `Não aplicar direto`
- prós: boa cobertura funcional histórica.
- contras: PR antiga, grande (29 arquivos, +10k), alto risco de regressão por conflito arquitetural.
- decisão: absorver apenas diffs faltantes específicos.

### PR #22 — outbound HTTP proxy support
- tipo: `PR` | url: https://github.com/decolua/9router/pull/22
- compatibilidade: `Já incorporado por caminho alternativo`
- evidência local: `open-sse/utils/proxyFetch.js`, `open-sse/utils/networkProxy.js`, `src/app/api/settings/proxy/route.js`, `README.md:747`.
- recomendação: `Não aplicar direto`
- prós: requisito enterprise/firewall já atendido no fork.
- contras: diferença de implementação (CLI flags) pode faltar edge case.
- decisão: validar apenas gaps de teste.

### PR #52 — GitHub Copilot model alias resolution (legacy)
- tipo: `PR` | url: https://github.com/decolua/9router/pull/52
- compatibilidade: `Adaptar`
- evidência local: fallback genérico em `open-sse/services/model.js:105` sem alias provider-específico.
- recomendação: `Backport seletivo`
- prós: reduz erro para nomes legados no provider `gh`.
- contras: se mal implementado, pode mascarar erro de model inexistente.
- decisão: implementar mapa explícito de aliases por provider.

### PR #99 — add GPT-4o mini to GitHub Copilot
- tipo: `PR` | url: https://github.com/decolua/9router/pull/99
- compatibilidade: `Adaptar`
- evidência local: `gh` sem `gpt-4o-mini` em `open-sse/config/providerRegistry.js:256`.
- recomendação: `Backport seletivo`
- prós: amplia cobertura de modelos.
- contras: requer validação real de disponibilidade no endpoint GitHub.
- decisão: incluir com feature flag/capability check.

### PR #100 — add GPT-4 to GitHub Copilot
- tipo: `PR` | url: https://github.com/decolua/9router/pull/100
- compatibilidade: `Adaptar`
- evidência local: `gh` não expõe `gpt-4`.
- recomendação: `Backport seletivo`
- prós: compat com clientes legados.
- contras: potencial de falso positivo se modelo não habilitado na conta.
- decisão: incluir após validação.

### PR #101 — add GPT-3.5 Turbo to GitHub Copilot
- tipo: `PR` | url: https://github.com/decolua/9router/pull/101
- compatibilidade: `Não recomendado`
- evidência local: estratégia atual prioriza catálogo moderno (GPT-4.1/5.x).
- recomendação: `Descartar` por padrão
- prós: retrocompatibilidade ampla.
- contras: possível depreciação e custo de suporte.
- decisão: só considerar sob demanda explícita.

### PR #103 — iflow support
- tipo: `PR` | url: https://github.com/decolua/9router/pull/103
- compatibilidade: `Já incorporado por caminho alternativo`
- evidência local: provider `iflow` presente em `open-sse/config/providerRegistry.js:167`.
- recomendação: `Não aplicar direto`
- prós: suporte já ativo no fork.
- contras: manter catálogo atualizado ainda é necessário.
- decisão: sincronizar apenas delta de modelos úteis.

### PR #104 — usage by api keys
- tipo: `PR` | url: https://github.com/decolua/9router/pull/104
- compatibilidade: `Adaptar`
- evidência local: analytics por `connectionId` em `src/lib/usageAnalytics.js:68` e `src/lib/usageDb.js`.
- recomendação: `Backport seletivo`
- prós: observabilidade real por consumidor/chave.
- contras: impacto de schema e migração de histórico.
- decisão: priorizar como P1.

## Matriz de Commits Upstream desde 08/02/2026 (22/22)

| Commit | Data | Classe | Situação no fork | Recomendação |
|---|---|---|---|---|
| `c090bb0` | 2026-02-11 | Pendentes relevantes | ausente | backport seletivo (GH model list) |
| `553346b` | 2026-02-11 | Pendentes relevantes | ausente | backport seletivo (Raptor ID) |
| `3d60597` | 2026-02-11 | Pendentes relevantes | ausente | backport seletivo (Claude Opus 4.6 GH) |
| `4ea9a9d` | 2026-02-10 | Pendentes relevantes | ausente | backport seletivo (Gemini 3 Flash ID GH) |
| `c3baf52` | 2026-02-10 | Cobertos localmente | ausente | manter implementação local (MITM já evoluiu no fork) |
| `b179dc2` | 2026-02-10 | Cobertos localmente | ausente | manter + validar regressão AG |
| `d36bd63` | 2026-02-10 | Pendentes relevantes | ausente | backport seletivo (Gemini 3 Pro ID GH) |
| `d3c3a4a` | 2026-02-10 | Cobertos localmente | ausente | adotar apenas deltas de erro úteis |
| `1d8251c` | 2026-02-10 | Cobertos localmente | ausente | já coberto no catálogo atual |
| `3df0a4d` | 2026-02-10 | Irrelevantes para o fork | ausente | não aplicar (workflow foi removido no upstream depois) |
| `4ad344e` | 2026-02-09 | Pendentes relevantes | ausente | revisar/update modelos iflow |
| `dd043f6` | 2026-02-09 | Cobertos localmente | ausente | manter fluxo OpenClaw local |
| `102c193` | 2026-02-09 | Pendentes relevantes | ausente | decidir estratégia Cloudflare Worker no fork |
| `c68b875` | 2026-02-09 | Pendentes relevantes | ausente | avaliar provider `glm-cn` (opcional P2) |
| `85b7a0b` | 2026-02-09 | Cobertos localmente | ausente | observabilidade já foi reimplementada no fork |
| `388389c` | 2026-02-09 | Irrelevantes para o fork | ausente | commit de revert não aplicável no desenho atual |
| `cbabf55` | 2026-02-09 | Cobertos localmente | ausente | já refeito por arquitetura diferente |
| `635d327` | 2026-02-09 | Irrelevantes para o fork | ausente | versão/chore sem ganho técnico direto |
| `bd0cebc` | 2026-02-08 | Cobertos localmente | presente no histórico | nenhum |
| `e7dfdc9` | 2026-02-08 | Cobertos localmente | presente no histórico | nenhum |
| `3d43983` | 2026-02-08 | Cobertos localmente | presente no histórico | nenhum |
| `2e854bd` | 2026-02-08 | Cobertos localmente | presente no histórico | nenhum |

Resumo commits:
- **4/22** já estão no histórico local.
- Dos **18 ausentes**:
  - **8** pendentes relevantes
  - **7** cobertos localmente por implementação alternativa
  - **3** irrelevantes ao desenho atual

## Roadmap Priorizado (P0/P1/P2)

### P0 — Corrigir já
1. Corrigir fallback implícito para `openai` em alias não resolvido (issue #73).
- score: `5x5x5/2 = 62.5`
- dependências: revisão de `open-sse/services/model.js` + testes de roteamento.

2. Suportar `/responses` para modelos GitHub Copilot que exigem endpoint específico (issue #102).
- score: `5x5x5/3 = 41.7`
- dependências: tabela de capability por modelo `gh`.

3. Atualizar IDs e catálogo do provider GitHub (issues #3/#94/#95/#96/#97/#98).
- score: `4x4x4/2 = 32`
- dependências: atualização `providerRegistry` + smoke tests reais.

### P1 — Próximo ciclo
1. Unificar persistência de usage com `DATA_DIR` e planejar migração/XDG (issues #37/#53).
- score: `4x4x4/3 = 21.3`

2. Implementar analytics por API key (PR #104).
- score: `4x3x4/3 = 16`

3. Melhorar compatibilidade LAN/login (issue #48) com suíte de regressão de cookie/reverse proxy.
- score: `3x4x4/3 = 16`

4. Regressão AG Gemini 3 Flash + erros residuais (issue #93).
- score: `4x3x4/3 = 16`

5. Rever limitação “1 conexão por node compatível” (issue #82).
- score: `3x3x4/3 = 12`

### P2 — Oportunidades
1. Melhorias de docs in-app e links reais (issues #46/#47).
2. Tier badges multi-provider completos (issue #76).
3. Smart router semântico além de weighted/priority (issue #54).
4. Compatibilidade específica Cherry Studio e cenários raros (issues #11/#13).

### Won’t do (por ora)
- #4 AmpCode panel
- #27 Microsoft Copilot
- #45 taskbar/tray app
- #90 pricing copy do website
- #38 prefetch `models.dev` (sem prioridade técnica atual)

## Top 10 Ações Recomendadas
1. Remover fallback automático para `openai` quando alias não resolve (`open-sse/services/model.js`).
2. Introduzir roteamento `/responses` por capacidade de modelo no executor GitHub.
3. Sincronizar mapa de modelos GitHub com IDs válidos atuais (incluindo Raptor e Gemini preview IDs).
4. Adicionar testes de contrato para `gh/*` e `ag/*` cobrindo 400/401 e fallback.
5. Migrar `usageDb` para seguir `DATA_DIR` (com migração automática de legado).
6. Opcionalmente suportar `XDG_CONFIG_HOME` no Linux/macOS.
7. Implementar visão de uso por API key (sem quebrar agregação por conexão).
8. Revisar política de “1 conexão por OpenAI-compatible node” com feature flag.
9. Fechar lacunas de UX/documentação (links de docs, guia rápido de roteamento/model switching).
10. Definir oficialmente backlog `Won’t do` para requests fora do core (desktop tray, AmpCode, Microsoft Copilot) e documentar.

## Itens Já Resolvidos no Fork
- #5 (resposta não-streaming)
- #8 (Kiro)
- #9 (bypass restrito)
- #10 (callback Codex)
- #23 (usage endpoints)
- #33/#36 (OpenAI-compatible + responses)
- #42 (Dockerfile)
- #49 (Cursor)
- #72 (Codex Test Connection)
- #74/#85 (usage tokens/history)

## Itens Críticos Ainda Pendentes
- #73
- #102
- #3 (e demais ajustes de catálogo GH vinculados)
- #37/#53 (persistência/path policy)

## Itens Não Aplicáveis ao Fork (estado atual)
- #4, #27, #45, #90

## Riscos e Trade-offs
- Prós da estratégia seletiva:
  - minimiza regressão em fork com arquitetura já divergente.
  - permite priorizar bugs de impacto real sem rebase massivo.
- Contras:
  - custo contínuo de curadoria manual do upstream.
  - risco de perda de pequenas correções indiretas em commits não backportados.

## Observações de Segurança e Qualidade (adicionais)
- Há defaults sensíveis que devem ser tratados em hardening:
  - `src/app/api/auth/login/route.js:8` (`JWT_SECRET` fallback)
  - `src/shared/utils/apiKey.js` (`API_KEY_SECRET` fallback)
  - `src/shared/utils/machineId.js` (`MACHINE_ID_SALT` fallback)
- Recomendado: fail-fast em produção quando segredos padrão estiverem ativos.

## Rastreabilidade
- Snapshot e insumos: `docs/upstream-audit-data/2026-02-11/`
- Escopo confirmado: 35 issues, 8 PRs, 22 commits (desde 08/02/2026)
- Relatório não altera runtime; apenas documentação/auditoria.
