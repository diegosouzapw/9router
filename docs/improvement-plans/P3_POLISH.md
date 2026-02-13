# P3 — Modularização, E2E e Compliance

> **Prioridade:** 🟢 Menor — Backlog
> **Esforço estimado:** ~2 semanas
> **Pré-requisitos:** P1 concluído (P2 pode ser paralelo)
> **Referência:** [Análise Técnica](../TECHNICAL_ANALYSIS.md)

---

## Checklist Geral

- [ ] 20. Extrair `open-sse/` como workspace package
- [ ] 21. Adicionar testes E2E com Playwright
- [ ] 22. Remover código morto (`RequestLogger.js` V1)
- [ ] 23. Adicionar Dependabot/Renovate
- [ ] 24. Implementar páginas `/terms` e `/privacy`
- [ ] 25. Adotar gráficos acessíveis (Recharts/Visx)

---

## 20. Extrair `open-sse/` como Workspace Package

**Severidade:** 🟢 Menor — Modularidade  
**Esforço:** 1 dia

### Problema

`open-sse/` (77 arquivos) já tem `.npmignore` e `types.d.ts` próprios, mas está diretamente acoplado ao projeto sem fronteira de API clara.

### Implementação

1. **Converter para npm workspace:**

   **Raiz `package.json`:**

   ```json
   {
     "workspaces": ["open-sse"]
   }
   ```

   **`open-sse/package.json`:**

   ```json
   {
     "name": "@9router/open-sse",
     "version": "1.0.0",
     "type": "module",
     "main": "index.js",
     "types": "types.d.ts"
   }
   ```

2. **Atualizar imports** no projeto principal:

   ```javascript
   // ANTES
   import { translateRequest } from "../open-sse/translator/index.js";
   // DEPOIS
   import { translateRequest } from "@9router/open-sse/translator";
   ```

3. **Atualizar `next.config.mjs`** para transpile o workspace:
   ```javascript
   transpilePackages: ['@9router/open-sse'],
   ```

### Verificação

- [ ] `npm install` resolve workspace corretamente
- [ ] Build passa
- [ ] Todos os testes passam
- [ ] Proxy funciona normalmente

---

## 21. Adicionar Testes E2E com Playwright

**Severidade:** 🟢 Menor — Qualidade avançada  
**Esforço:** 1 semana

### Setup

```bash
npx -y create-playwright@latest
```

### Fluxos Críticos a Testar

```
tests/e2e/
├── login.spec.ts            # Login flow
├── dashboard.spec.ts        # Dashboard navigation
├── providers.spec.ts        # Add/edit/delete provider
├── api-keys.spec.ts         # API key management
├── usage.spec.ts            # Usage page loads with data
├── settings.spec.ts         # Settings modification
├── error-pages.spec.ts      # 404 / error pages
└── proxy.spec.ts            # Proxy endpoint (v1/chat/completions)
```

### Exemplo — `login.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Login Flow", () => {
  test("should redirect to login when not authenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should login with correct password", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[data-testid="password-input"]', process.env.INITIAL_PASSWORD || "123456");
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("should show error with wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[data-testid="password-input"]', "wrong-password");
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  });
});
```

### CI Integration

Adicionar ao `.github/workflows/ci.yml`:

```yaml
e2e:
  runs-on: ubuntu-latest
  needs: quality
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: "npm"
    - run: npm ci
    - run: npx playwright install --with-deps
    - run: npm run build
      env:
        JWT_SECRET: ci-test-secret
    - run: npx playwright test
      env:
        JWT_SECRET: ci-test-secret
        INITIAL_PASSWORD: test-password
```

### Verificação

- [ ] Todos os testes E2E passam localmente
- [ ] CI executa testes E2E em PRs
- [ ] Fluxos críticos cobertos (login, CRUD, proxy)

---

## 22. Remover Código Morto

**Severidade:** 🟢 Menor — Limpeza  
**Esforço:** 30 minutos

### Arquivos a Remover/Avaliar

| Arquivo                                  | Razão                                   | Ação                                            |
| ---------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| `src/shared/components/RequestLogger.js` | V1 substituída por `RequestLoggerV2.js` | **Remover**                                     |
| `src/lib/localDb.js`                     | Substituída por `sqliteDb.js`           | **Avaliar** — pode ser necessário para fallback |
| `PLAN3.md`                               | Planejamento concluído                  | **Mover** para `docs/planning/`                 |

### Passos

1. Buscar imports de `RequestLogger.js` (não V2):
   ```bash
   grep -r "RequestLogger" --include="*.js" --exclude="RequestLoggerV2*" src/
   ```
2. Se nenhum import ativo → remover o arquivo
3. Repetir para `localDb.js`

### Verificação

- [ ] Build passa após remoção
- [ ] Nenhum import quebrado
- [ ] Dashboard funciona normalmente

---

## 23. Adicionar Dependabot/Renovate

**Severidade:** 🟢 Menor — Segurança de deps  
**Esforço:** 1 hora

### Implementação — Dependabot

Criar `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    commit-message:
      prefix: "deps"
    open-pull-requests-limit: 10
    groups:
      production:
        dependency-type: "production"
      development:
        dependency-type: "development"
    ignore:
      - dependency-name: "react"
        update-types: ["version-update:semver-major"]
      - dependency-name: "react-dom"
        update-types: ["version-update:semver-major"]
      - dependency-name: "next"
        update-types: ["version-update:semver-major"]

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

### Verificação

- [ ] Dependabot cria PRs de atualização semanalmente
- [ ] PRs passam no CI antes de merge

---

## 24. Implementar Páginas de Compliance

**Severidade:** 🟢 Menor — Legal  
**Esforço:** 1 dia

### Páginas a Criar

| Página                  | Arquivo                   |
| ----------------------- | ------------------------- |
| Termos de Uso           | `src/app/terms/page.js`   |
| Política de Privacidade | `src/app/privacy/page.js` |

### Conteúdo

- **Termos de Uso:** Descrever que o 9Router é uma ferramenta de proxy, o usuário é responsável pelas credenciais, e as API calls são roteadas através da ferramenta
- **Política de Privacidade:** Descrever que dados são armazenados localmente, não há telemetria, e logs podem ser configurados

### Links

- Adicionar link no `Footer.js`
- Adicionar link na `Landing` page
- Adicionar link na tela de `login`

### Verificação

- [ ] `/terms` renderiza corretamente
- [ ] `/privacy` renderiza corretamente
- [ ] Links funcionam no footer e landing

---

## 25. Adotar Gráficos Acessíveis

**Severidade:** 🟢 Menor — Acessibilidade avançada  
**Esforço:** 3 dias

### Problema

Todos os gráficos em `UsageAnalytics.js` (heatmap, donuts, bar charts) são implementados com **CSS puro** e `<div>`s. Isso significa:

- Zero acessibilidade para screen readers
- Sem tooltips interativos
- Sem animações suaves

### Implementação

1. **Instalar** Recharts:

   ```bash
   npm install recharts
   ```

2. **Substituir** gráficos CSS por componentes Recharts:
   - `ActivityHeatmap` → `<HeatMapGrid>` custom com Recharts `<Cell>`
   - `DailyTrendChart` → `<BarChart>` + `<Bar>` + `<Tooltip>`
   - `AccountDonut` → `<PieChart>` + `<Pie>` + `<Legend>`
   - `WeeklyPattern` → `<BarChart>` horizontal

3. **Configurar** tema dark no Recharts para match com design system

### Benefícios

- Tooltips nativos com dados ao hover
- Legendas automáticas e acessíveis
- Animações suaves
- SVG renderizado (melhor que divs para gráficos)
- Melhor responsividade

### Verificação

- [ ] Gráficos renderizam corretamente em dark mode
- [ ] Tooltips mostram dados ao hover
- [ ] Gráficos são responsivos em todas as viewports
- [ ] Screen reader consegue interpretar legendas
