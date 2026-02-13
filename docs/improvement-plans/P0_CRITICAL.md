# P0 — Correções Críticas de Segurança e Infraestrutura

> **Prioridade:** 🔴 Crítica — Fazer imediatamente
> **Esforço estimado:** ~1.5 semana
> **Pré-requisitos:** Nenhum
> **Referência:** [Análise Técnica](../TECHNICAL_ANALYSIS.md)

---

## Checklist Geral

- [ ] 1. Remover JWT secret hardcoded
- [ ] 2. Criar pipeline CI/CD com GitHub Actions
- [ ] 3. Criar páginas de erro personalizadas (404, 500, error boundary)
- [ ] 4. Corrigir script `test` no `package.json`
- [ ] 5. Expandir testes unitários para módulos core

---

## 1. Remover JWT Secret Hardcoded

**Severidade:** 🔴 Crítico — Vulnerabilidade de segurança  
**Esforço:** 30 minutos  
**Arquivo:** `src/proxy.js`

### Problema

```javascript
// src/proxy.js — ATUAL (INSEGURO)
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "9router-default-secret-change-me"
);
```

Se `JWT_SECRET` não estiver definida no ambiente, qualquer atacante pode forjar tokens JWT com o secret padrão, obtendo acesso total ao dashboard.

### Implementação

```javascript
// src/proxy.js — CORRIGIDO
if (!process.env.JWT_SECRET) {
  throw new Error(
    "[9router] FATAL: JWT_SECRET environment variable is not set. " +
      "Please set it in your .env file. Aborting for security."
  );
}
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
```

### Arquivos a Modificar

| Arquivo          | Alteração                                         |
| ---------------- | ------------------------------------------------- |
| `src/proxy.js`   | Remover fallback, lançar erro                     |
| `.env.example`   | Documentar que JWT_SECRET é **obrigatório**       |
| `docs/DOCKER.md` | Garantir que instrução de setup inclui JWT_SECRET |

### Verificação

- [ ] Iniciar sem JWT_SECRET → deve lançar erro fatal
- [ ] Iniciar com JWT_SECRET definido → deve funcionar normalmente
- [ ] Tokens existentes continuam funcionando se o secret não mudou

### Itens Relacionados

Verificar também se há outros secrets com fallback inseguro:

- `src/lib/oauth/constants/oauth.js` — OAuth client IDs com fallback hardcoded
  - **Ação:** Esses são credentials do aplicativo (não do usuário), então o fallback é aceitável, mas documentar claramente no `.env.example`
- `src/shared/utils/apiKey.js` — Verificar `API_KEY_SECRET`

---

## 2. Criar Pipeline CI/CD com GitHub Actions

**Severidade:** 🔴 Crítico — Nenhuma verificação automática  
**Esforço:** 2 horas  
**Diretório:** `.github/workflows/`

### Problema

O único workflow existente (`codex-review.yml`) apenas adiciona um comentário `@codex review` em PRs. Não há verificação de build, testes ou lint.

### Implementação

Criar `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci --no-audit --no-fund

      - name: Lint
        run: npm run lint

      - name: Run unit tests
        run: npm run test:plan3

      - name: Build
        run: npm run build
        env:
          JWT_SECRET: ci-test-secret-not-for-production

      - name: Security audit
        run: npm audit --audit-level=high
        continue-on-error: true
```

### Arquivos a Criar/Modificar

| Arquivo                              | Ação                           |
| ------------------------------------ | ------------------------------ |
| `.github/workflows/ci.yml`           | **CRIAR** — Pipeline principal |
| `.github/workflows/codex-review.yml` | Manter (complementar)          |
| `package.json`                       | Adicionar script `test:all`    |

### Verificação

- [ ] Push para branch → workflow executa
- [ ] PR para main → workflow executa
- [ ] Lint errors → workflow falha
- [ ] Test failures → workflow falha
- [ ] Build failure → workflow falha

---

## 3. Criar Páginas de Erro Personalizadas

**Severidade:** 🔴 Crítico — UX quebrada em erros  
**Esforço:** 2 horas  
**Diretório:** `src/app/`

### Problema

Sem páginas customizadas, o Next.js 16 mostra páginas de erro genéricas sem branding 9Router.

### Arquivos a Criar

#### 3.1 — `src/app/not-found.js` (Página 404)

```javascript
export default function NotFound() {
  return (
    <div className="error-page">
      <div className="error-container">
        <h1 className="error-code">404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <a href="/dashboard" className="error-link">
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
```

#### 3.2 — `src/app/error.js` (Error Boundary)

```javascript
"use client";

export default function Error({ error, reset }) {
  return (
    <div className="error-page">
      <div className="error-container">
        <h1 className="error-code">500</h1>
        <h2>Something went wrong</h2>
        <p>{error?.message || "An unexpected error occurred."}</p>
        <button onClick={reset} className="error-button">
          Try Again
        </button>
        <a href="/dashboard" className="error-link">
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
```

#### 3.3 — `src/app/global-error.js` (Root Error Boundary)

```javascript
"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body>
        <div
          style={
            {
              /* inline styles for when CSS fails */
            }
          }
        >
          <h1>Critical Error</h1>
          <p>9Router encountered a critical error.</p>
          <button onClick={reset}>Retry</button>
        </div>
      </body>
    </html>
  );
}
```

### Estilos

Adicionar em `globals.css`:

```css
.error-page {
  /* fullscreen centered dark container */
}
.error-code {
  /* large gradient number */
}
.error-link {
  /* styled link back to dashboard */
}
.error-button {
  /* retry button */
}
```

### Verificação

- [ ] Acessar `/uma-pagina-que-nao-existe` → mostra 404 customizada
- [ ] Forçar erro em componente → mostra error boundary
- [ ] Botão "Try Again" no error boundary → tenta re-render

---

## 4. Corrigir Script `test` no `package.json`

**Severidade:** 🔴 Crítico — CI/CD confuso  
**Esforço:** 15 minutos  
**Arquivo:** `package.json`

### Problema

```json
// ATUAL — "test" executa build, não testes
"test": "npm run build",
"test:plan3": "node --test tests/plan3-p0.test.mjs"
```

### Implementação

```json
// CORRIGIDO
"test": "node --test tests/**/*.test.mjs",
"test:plan3": "node --test tests/plan3-p0.test.mjs",
"test:ci": "npm run lint && npm run test && npm run build",
"check": "npm run test:ci"
```

### Verificação

- [ ] `npm test` → executa testes reais
- [ ] `npm run test:ci` → executa lint + test + build
- [ ] CI pipeline usa `npm run test:ci`

---

## 5. Expandir Testes Unitários para Módulos Core

**Severidade:** 🔴 Crítico — Cobertura < 2%  
**Esforço:** 1 semana  
**Diretório:** `tests/`

### Problema

Apenas 14 testes em 1 arquivo (`tests/plan3-p0.test.mjs`) cobrindo apenas o `open-sse/` translator. Zero testes para:

- `sqliteDb.js` (1500 linhas, 80+ funções)
- `usageDb.js` (932 linhas)
- API routes (24 grupos)
- OAuth flows

### Plano de Testes

#### 5.1 — `tests/sqliteDb.test.mjs` (Prioridade máxima)

Testar:

- [ ] `getDbInstance()` — inicialização e singleton
- [ ] CRUD `providerConnections` — create, read, update, delete
- [ ] CRUD `providerNodes`
- [ ] CRUD `apiKeys`
- [ ] CRUD `combos`
- [ ] KV store — `getKV`, `setKV`, `deleteKV`
- [ ] `backupDbFile` e `restoreDbBackup`
- [ ] `migrateFromJson` — migração JSON → SQLite
- [ ] Column mapping — `toSnakeCase`, `toCamelCase`, `objToSnake`, `rowToCamel`

#### 5.2 — `tests/usageDb.test.mjs`

Testar:

- [ ] `saveRequestUsage` — salvar uso
- [ ] `getUsageHistory` — filtros por data, provider, model
- [ ] `getUsageStats` — agregações
- [ ] `saveCallLog` — structured logs
- [ ] `getCallLogs` — filtros
- [ ] `calculateCost` — cálculo de custos

#### 5.3 — `tests/api-routes.test.mjs`

Testar rotas críticas:

- [ ] `POST /api/auth` — login
- [ ] `GET /api/settings` — get settings
- [ ] `GET /api/providers` — list providers
- [ ] `POST /api/keys` — create API key
- [ ] `GET /api/usage/stats` — usage stats
- [ ] `GET /api/models` — list models

#### 5.4 — `tests/utils.test.mjs`

Testar:

- [ ] `maskSegment` — masking de strings
- [ ] `cors` — CORS headers
- [ ] `apiKey` — validation, hashing
- [ ] `machineId` — geração de ID

### Estrutura de Testes Resultante

```
tests/
├── plan3-p0.test.mjs       # (existente) Translator/executor tests
├── sqliteDb.test.mjs        # CRUD + backup + migration
├── usageDb.test.mjs         # Usage tracking + cost calculation
├── api-routes.test.mjs      # API route integration tests
└── utils.test.mjs           # Shared utility tests
```

### Meta de Cobertura

| Módulo        | Cobertura Atual | Meta P0  | Meta P1  |
| ------------- | --------------- | -------- | -------- |
| `open-sse/`   | ~15%            | ~15%     | ~40%     |
| `sqliteDb.js` | 0%              | ~50%     | ~80%     |
| `usageDb.js`  | 0%              | ~30%     | ~60%     |
| API routes    | 0%              | ~20%     | ~50%     |
| Utils         | 0%              | ~60%     | ~90%     |
| **Total**     | **<2%**         | **~25%** | **~50%** |

### Verificação

- [ ] Todos os novos testes passam com `npm test`
- [ ] CI pipeline valida testes automaticamente
- [ ] Nenhum teste flaky (rodar 3x consecutivas)
