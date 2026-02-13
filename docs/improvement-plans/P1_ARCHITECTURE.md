# P1 — Refatoração Arquitetural e Qualidade de Código

> **Prioridade:** ⚠️ Importante — Próximo sprint
> **Esforço estimado:** ~2 semanas
> **Pré-requisitos:** P0 concluído
> **Referência:** [Análise Técnica](../TECHNICAL_ANALYSIS.md)

---

## Checklist Geral

- [ ] 6. Decompor `sqliteDb.js` em repositórios por domínio
- [ ] 7. Migrar `usageDb.js` de LowDB para SQLite
- [ ] 8. Decompor componentes React > 500 linhas
- [ ] 9. Implementar logger estruturado (Pino)
- [ ] 10. Auditoria WCAG 2.1 AA — ARIA, focus, acessibilidade
- [ ] 11. Extrair funções duplicadas para `shared/utils/`
- [ ] 12. Criar página `/dashboard/settings` unificada

---

## 6. Decompor `sqliteDb.js` em Repositórios por Domínio

**Severidade:** ⚠️ Importante — God Object com 1500 linhas  
**Esforço:** 3 dias  
**Arquivo atual:** `src/lib/sqliteDb.js` (1500 linhas, 80+ funções)

### Problema

Um único arquivo concentra toda a lógica de acesso a dados: schema, migrations, CRUD para 5 entidades, backup/restore, column mapping. Violação de SRP (Single Responsibility Principle).

### Arquitetura Proposta

```
src/lib/db/
├── index.js                  # Re-export público (backward-compatible)
├── connection.js             # Singleton DB, schema, migrations
├── columnMapper.js           # toSnakeCase, toCamelCase, objToSnake, rowToCamel
├── repositories/
│   ├── providerRepository.js # CRUD provider_connections
│   ├── nodeRepository.js     # CRUD provider_nodes
│   ├── apiKeyRepository.js   # CRUD api_keys
│   ├── comboRepository.js    # CRUD combos
│   └── settingsRepository.js # KV store (key_value table)
├── backup.js                 # backupDbFile, listDbBackups, restoreDbBackup
└── migration.js              # migrateFromJson
```

### Passos de Implementação

1. **Criar** `src/lib/db/connection.js`:
   - Mover `getDbInstance()`, `SCHEMA_SQL`, variáveis de path
   - Exportar `getDb()` como singleton

2. **Criar** `src/lib/db/columnMapper.js`:
   - Mover `toSnakeCase`, `toCamelCase`, `objToSnake`, `rowToCamel`, `cleanNulls`

3. **Criar repositórios** (um por entidade):
   - Cada repositório importa `getDb()` de `connection.js`
   - Cada repositório importa helpers de `columnMapper.js`
   - Mantém **exatamente as mesmas assinaturas** das funções exportadas

4. **Criar** `src/lib/db/index.js` — Re-export todas as funções:

   ```javascript
   export { getProviderConnections, createProviderConnection, ... } from './repositories/providerRepository.js';
   export { getApiKeys, createApiKey, ... } from './repositories/apiKeyRepository.js';
   // ... etc
   ```

5. **Atualizar imports** em todos os consumers:
   - Opção A: Manter import de `@/lib/sqliteDb` que agora re-exporta de `db/`
   - Opção B: Atualizar cada import individualmente (preferível para clareza)

### Regras

- **Não alterar assinaturas** de funções. É refatoração, não feature.
- **Manter compatibilidade** do `index.js` como alias
- **Cada repositório** deve ter `< 200 linhas`

### Verificação

- [ ] Build continua passando (`npm run build`)
- [ ] Testes existentes continuam passando (`npm run test:plan3`)
- [ ] Testes de `sqliteDb.test.mjs` (criados na P0) continuam passando
- [ ] Nenhuma API route quebrou
- [ ] Dashboard funciona normalmente no browser

---

## 7. Migrar `usageDb.js` de LowDB para SQLite

**Severidade:** ⚠️ Importante — Dual DB inconsistente  
**Esforço:** 2 dias  
**Arquivo atual:** `src/lib/usageDb.js` (932 linhas)

### Problema

`usageDb.js` ainda usa LowDB (JSON files) enquanto o restante do projeto usa SQLite. LowDB não é ACID, não suporta queries complexas, e tem problemas de performance com grandes datasets.

### Implementação

1. **Adicionar tabelas** ao `SCHEMA_SQL` em `connection.js`:

   ```sql
   CREATE TABLE IF NOT EXISTS usage_history (
     id TEXT PRIMARY KEY,
     provider TEXT NOT NULL,
     model TEXT NOT NULL,
     connection_id TEXT,
     api_key_id TEXT,
     api_key_name TEXT,
     prompt_tokens INTEGER DEFAULT 0,
     completion_tokens INTEGER DEFAULT 0,
     total_tokens INTEGER DEFAULT 0,
     cost REAL DEFAULT 0,
     status TEXT,
     created_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_history(created_at);
   CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_history(provider);

   CREATE TABLE IF NOT EXISTS call_logs (
     id TEXT PRIMARY KEY,
     method TEXT,
     path TEXT,
     status INTEGER,
     model TEXT,
     provider TEXT,
     connection_id TEXT,
     combo_name TEXT,
     api_key_id TEXT,
     api_key_name TEXT,
     source_format TEXT,
     target_format TEXT,
     duration_ms INTEGER,
     prompt_tokens INTEGER DEFAULT 0,
     completion_tokens INTEGER DEFAULT 0,
     request_body TEXT,
     response_body TEXT,
     error_message TEXT,
     created_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_calls_created ON call_logs(created_at);
   ```

2. **Reescrever funções** para usar SQLite em vez de LowDB
3. **Criar migração** de JSON → SQLite para dados existentes
4. **Remover** dependência `lowdb` do `package.json`

### Verificação

- [ ] `saveRequestUsage()` salva no SQLite
- [ ] `getUsageHistory()` lê do SQLite com filtros
- [ ] `getUsageStats()` retorna dados corretos
- [ ] `saveCallLog()` salva no SQLite
- [ ] Dados existentes migrados corretamente
- [ ] Dashboard de usage mostra dados corretos
- [ ] `lowdb` removido do `package.json`

---

## 8. Decompor Componentes React > 500 Linhas

**Severidade:** ⚠️ Importante — Manutenibilidade  
**Esforço:** 3 dias

### Componentes a Decompor

| Componente                        | Linhas | Meta  |
| --------------------------------- | ------ | ----- |
| `UsageAnalytics.js` (870 linhas)  | 870    | < 250 |
| `RequestLoggerV2.js` (823 linhas) | 823    | < 250 |
| `UsageStats.js` (~800 linhas)     | ~800   | < 250 |
| `ProxyLogger.js` (~700 linhas)    | ~700   | < 250 |
| `OAuthModal.js` (~600 linhas)     | ~600   | < 300 |

### Estratégia: `UsageAnalytics.js` (exemplo)

Decompor de 1 arquivo de 870 linhas em:

```
src/shared/components/usage-analytics/
├── index.js                  # Re-export do UsageAnalytics
├── UsageAnalytics.js         # Main container (~200 linhas)
├── StatCard.js               # Stat card component
├── ActivityHeatmap.js        # GitHub-style heatmap
├── DailyTrendChart.js        # Bar chart
├── AccountDonut.js           # Donut chart - accounts
├── ApiKeyDonut.js            # Donut chart - API keys
├── ApiKeyTable.js            # API key breakdown table
├── WeeklyPattern.js          # Weekly bar chart
├── ModelTable.js             # Model breakdown table
├── UsageDetail.js            # Usage detail card
└── helpers.js                # fmt, fmtFull, fmtCost, getModelColor
```

### Regras de Decomposição

1. **Cada sub-componente** deve ser independente e renderizável isoladamente
2. **Props explícitas** — sem dependência de estado global
3. **Helpers** movidos para arquivo separado (DRY)
4. **Re-export** via `index.js` para manter compatibilidade de imports
5. **Mesma renderização** — pixel-perfect match com o componente original

### Verificação

- [ ] Build passa
- [ ] Dashboard renderiza identicamente ao original
- [ ] Nenhum componente tem > 300 linhas
- [ ] Props tipadas com JSDoc ou comentários

---

## 9. Implementar Logger Estruturado (Pino)

**Severidade:** ⚠️ Importante — Observabilidade  
**Esforço:** 1 dia

### Problema

Todo o backend usa `console.log`/`console.error` sem níveis, sem formato estruturado, sem rotação.

### Implementação

1. **Instalar** `pino`:

   ```bash
   npm install pino
   ```

2. **Criar** `src/lib/logger.js`:

   ```javascript
   import pino from "pino";

   const logger = pino({
     level: process.env.LOG_LEVEL || "info",
     transport:
       process.env.NODE_ENV !== "production"
         ? { target: "pino/file", options: { destination: 1 } }
         : undefined,
   });

   export default logger;
   ```

3. **Substituir progressivamente** `console.log` → `logger.info`, `console.error` → `logger.error` nos módulos core:
   - `src/lib/sqliteDb.js` (ou novos repositórios)
   - `src/lib/usageDb.js`
   - `src/server-init.js`
   - `src/lib/tokenHealthCheck.js`
   - `src/sse/services/`

### Verificação

- [ ] Logs em formato JSON em produção
- [ ] Logs legíveis em dev
- [ ] LOG_LEVEL funciona (info, debug, warn, error)
- [ ] Não quebrou nenhum handler de SSE/proxy

---

## 10. Auditoria WCAG 2.1 AA

**Severidade:** ⚠️ Importante — Acessibilidade  
**Esforço:** 2 dias

### Checklist de Implementação

#### 10.1 — Landmarks ARIA

- [ ] Layout principal: `role="main"`, `role="navigation"`, `role="banner"`
- [ ] Sidebar: `role="navigation"`, `aria-label="Main navigation"`
- [ ] Footer: `role="contentinfo"`

#### 10.2 — Skip-to-Content

- [ ] Adicionar link "Skip to main content" no topo de `layout.js`

#### 10.3 — Focus Indicators

- [ ] Adicionar `:focus-visible` em `globals.css` para todos elementos interativos
- [ ] Garantir outline visível com contraste suficiente

#### 10.4 — Formulários

- [ ] Associar `label` com `htmlFor` em todos os inputs
- [ ] Adicionar `aria-describedby` para mensagens de erro/ajuda
- [ ] Adicionar `aria-required` em campos obrigatórios

#### 10.5 — Conteúdo Dinâmico

- [ ] `aria-live="polite"` em notificações/toasts
- [ ] `aria-live="assertive"` em mensagens de erro
- [ ] `aria-busy` em containers com loading

#### 10.6 — Tabelas

- [ ] `<caption>` em tabelas de dados
- [ ] `scope="col"` em headers de tabela

### Verificação

- [ ] axe DevTools — 0 violações críticas
- [ ] Navegação completa por teclado (Tab, Enter, Escape)
- [ ] Screen reader (NVDA/VoiceOver) — fluxo principal funcional

---

## 11. Extrair Funções Duplicadas para `shared/utils/`

**Severidade:** ⚠️ Importante — DRY  
**Esforço:** 2 horas

### Funções Duplicadas Identificadas

| Função                                  | Localização 1           | Localização 2                |
| --------------------------------------- | ----------------------- | ---------------------------- |
| `maskSegment`                           | `RequestLoggerV2.js:91` | `UsageAnalytics.js:37`       |
| `formatApiKeyLabel` / `maskApiKeyLabel` | `RequestLoggerV2.js:97` | `UsageAnalytics.js:43`       |
| `formatDuration`                        | `RequestLoggerV2.js:72` | Similares em `UsageStats.js` |

### Implementação

1. **Criar** `src/shared/utils/formatting.js`:

   ```javascript
   export function maskSegment(value, start = 2, end = 2) { ... }
   export function formatApiKeyLabel(apiKeyName, apiKeyId) { ... }
   export function formatDuration(ms) { ... }
   export function formatTime(isoString) { ... }
   ```

2. **Atualizar imports** nos componentes

### Verificação

- [ ] Build passa
- [ ] Funcionalidade de masking idêntica no UI

---

## 12. Criar Página `/dashboard/settings` Unificada

**Severidade:** ⚠️ Importante — UX  
**Esforço:** 2 dias

### Problema

Configurações dispersas entre API routes e modals. Não há página central de settings.

### Implementação

Criar `src/app/(dashboard)/dashboard/settings/page.js` com seções:

1. **Geral** — Nome da instância, tema, idioma
2. **Segurança** — Alterar senha, require login, API key obrigatória
3. **Proxy** — Timeout, CORS, rate limiting
4. **Logging** — Habilitar request logs, log level
5. **Backup** — Backup manual, restauração, agendamento
6. **Cloud Sync** — Configuração de sincronização

### Verificação

- [ ] Todas as settings acessíveis pela nova página
- [ ] Alterações persistem após reload
- [ ] Link no sidebar aponta para nova página
