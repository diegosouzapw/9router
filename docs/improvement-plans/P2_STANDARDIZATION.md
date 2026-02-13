# P2 — TypeScript, API Docs e Padronização

> **Prioridade:** 🟡 Moderado — Próximo mês
> **Esforço estimado:** ~3 semanas
> **Pré-requisitos:** P0 e P1 concluídos
> **Referência:** [Análise Técnica](../TECHNICAL_ANALYSIS.md)

---

## Checklist Geral

- [ ] 13. Adotar TypeScript progressivamente
- [ ] 14. Gerar documentação OpenAPI para APIs
- [ ] 15. Criar ADRs para decisões técnicas
- [ ] 16. Consolidar estrutura de diretórios (`doc/`, `tester/`, `tests/`)
- [ ] 17. Adicionar Prettier + husky pre-commit hooks
- [ ] 18. Implementar first-run wizard / onboarding
- [ ] 19. Substituir estilos inline por Tailwind classes

---

## 13. Adotar TypeScript Progressivamente

**Severidade:** 🟡 Moderado — Sem type safety  
**Esforço:** 2 semanas (progressivo)

### Estratégia

Adotar TypeScript **progressivamente** — converter arquivos um a um, começando pelos módulos mais críticos. O Next.js 16 suporta `.ts`/`.tsx` nativamente sem configuração extra.

### Fase 1 — Fundação (Dia 1-2)

1. **Instalar** TypeScript e types:

   ```bash
   npm install -D typescript @types/node @types/react @types/react-dom @types/better-sqlite3
   ```

2. **Criar** `tsconfig.json`:

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "lib": ["dom", "dom.iterable", "esnext"],
       "allowJs": true,
       "checkJs": false,
       "skipLibCheck": true,
       "strict": false,
       "noEmit": true,
       "esModuleInterop": true,
       "module": "esnext",
       "moduleResolution": "bundler",
       "resolveJsonModule": true,
       "isolatedModules": true,
       "jsx": "preserve",
       "incremental": true,
       "paths": {
         "@/*": ["./src/*"]
       }
     },
     "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
     "exclude": ["node_modules", "open-sse"]
   }
   ```

   > **Nota:** `strict: false` e `allowJs: true` permite migração gradual.

### Fase 2 — Tipos Core (Dia 3-5)

Criar tipos para entities em `src/types/`:

```
src/types/
├── provider.ts        # ProviderConnection, ProviderNode
├── apiKey.ts          # ApiKey
├── combo.ts           # Combo
├── usage.ts           # UsageEntry, UsageStats, CallLog
├── settings.ts        # Settings, KVPair
└── index.ts           # Re-exports
```

### Fase 3 — Converter Módulos Core (Dia 6-10)

Ordem de conversão:

1. `src/lib/db/columnMapper.js` → `.ts`
2. `src/lib/db/repositories/*.js` → `.ts`
3. `src/shared/utils/*.js` → `.ts`
4. `src/shared/validation/schemas.js` → `.ts`
5. `src/store/*.js` → `.ts`

### Fase 4 — Converter Componentes (Semana 2)

Começar pelos componentes menores/primitivos:

1. `Button.js`, `Card.js`, `Badge.js`, `Input.js`, `Select.js` → `.tsx`
2. `Modal.js`, `Toggle.js`, `Loading.js` → `.tsx`
3. Componentes maiores gradualmente

### Regras

- **Nunca converter** `open-sse/` — é tratado como pacote externo
- **Um arquivo por PR** — cada conversão deve ser revisável isoladamente
- **Manter `strict: false`** até 80% dos arquivos estarem convertidos
- **Não usar `any`** — usar `unknown` e narrowing

### Verificação

- [ ] Build continua passando a cada conversão
- [ ] `npx tsc --noEmit` — sem erros de tipo
- [ ] Dashboard funciona normalmente

---

## 14. Gerar Documentação OpenAPI para APIs

**Severidade:** 🟡 Moderado  
**Esforço:** 3 dias

### Implementação

1. **Criar** `docs/api/openapi.yaml` com spec OpenAPI 3.1
2. Documentar os 24 grupos de API routes:

   | Grupo             | Endpoints                  |
   | ----------------- | -------------------------- |
   | `/api/auth`       | Login, logout, verify      |
   | `/api/providers`  | CRUD providers             |
   | `/api/keys`       | CRUD API keys              |
   | `/api/models`     | List models                |
   | `/api/usage`      | Stats, logs, history       |
   | `/api/settings`   | Get/set settings           |
   | `/api/translator` | Translate, detect, history |
   | `/api/combos`     | CRUD combos                |
   | `/api/oauth`      | OAuth flows                |
   | `/api/v1`         | Proxy endpoints            |

3. **Adicionar** Swagger UI como página:
   ```bash
   npm install swagger-ui-react
   ```
   Criar `src/app/docs/page.js` renderizando a spec

### Verificação

- [ ] `/docs` mostra Swagger UI
- [ ] Todas as rotas documentadas
- [ ] Exemplos de request/response inclusos

---

## 15. Criar ADRs (Architecture Decision Records)

**Severidade:** 🟡 Moderado  
**Esforço:** 2 dias

### ADRs a Criar

```
docs/adr/
├── 001-sqlite-over-postgres.md
├── 002-lowdb-dual-storage.md
├── 003-nextjs-app-router.md
├── 004-open-sse-architecture.md
├── 005-oauth-provider-pattern.md
├── 006-javascript-over-typescript.md
└── 007-tailwindcss-v4-adoption.md
```

### Formato (Template)

```markdown
# ADR-001: SQLite over PostgreSQL for Local Storage

## Status

Accepted

## Context

[Descrever o contexto e problema]

## Decision

[Descrever a decisão tomada]

## Consequences

[Descrever consequências positivas e negativas]
```

---

## 16. Consolidar Estrutura de Diretórios

**Severidade:** 🟡 Moderado  
**Esforço:** 2 horas

### Ações

| Ação    | De                        | Para                                    |
| ------- | ------------------------- | --------------------------------------- |
| Mover   | `doc/*`                   | `docs/` e remover `doc/`                |
| Mover   | `tester/*`                | `tests/integration/` ou `tests/tester/` |
| Mover   | `PLAN3.md`                | `docs/planning/PLAN3.md`                |
| Remover | `src/models/` (1 arquivo) | Inline ou merge em `src/types/`         |

### Verificação

- [ ] Build não quebrou
- [ ] Nenhum import aponta para paths antigos
- [ ] `doc/` removido

---

## 17. Adicionar Prettier + Husky Pre-commit

**Severidade:** 🟡 Moderado  
**Esforço:** 1 hora

### Implementação

```bash
npm install -D prettier lint-staged husky
npx husky init
```

**`prettier.config.mjs`:**

```javascript
export default {
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 100,
};
```

**`package.json` — lint-staged:**

```json
"lint-staged": {
  "*.{js,jsx,ts,tsx}": ["prettier --write", "eslint --fix"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
}
```

**`.husky/pre-commit`:**

```bash
npx lint-staged
```

### Verificação

- [ ] Commit com arquivo mal formatado → prettier corrige automaticamente
- [ ] ESLint roda no pre-commit

---

## 18. Implementar First-Run Wizard

**Severidade:** 🟡 Moderado  
**Esforço:** 3 dias

### Implementação

Criar tela de onboarding que aparece na primeira execução (quando não há providers configurados).

**Steps do wizard:**

1. **Boas-vindas** — Apresentação do 9Router
2. **Senha** — Configurar senha do dashboard
3. **Primeiro provider** — Adicionar OAuth ou API key
4. **Teste** — Testar a conexão
5. **Concluído** — Ir para o dashboard

**Arquivo:** `src/app/(dashboard)/dashboard/onboarding/page.js`

**Lógica:** Verificar em `layout.js` se `getProviderConnections()` retorna vazio. Se sim, redirecionar para `/dashboard/onboarding`.

### Verificação

- [ ] Primeira execução → mostra wizard
- [ ] Após configurar provider → não mostra mais
- [ ] Skip disponível em todos os steps

---

## 19. Substituir Estilos Inline por Tailwind

**Severidade:** 🟡 Moderado  
**Esforço:** 1 semana

### Problema

Centenas de `style={{}}` inline nos componentes. TailwindCSS 4 já está instalado mas subutilizado.

### Estratégia

Converter progressivamente, começando pelos componentes recém decompostos (item 8):

1. Identificar padrões de estilo recorrentes
2. Criar classes utilitárias em `globals.css` para padrões sem equivalente Tailwind
3. Substituir `style={{}}` por `className`

### Exemplo

```javascript
// ANTES
<div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: 20 }}>

// DEPOIS
<div className="bg-secondary rounded-xl p-5">
```

### Verificação

- [ ] Visual idêntico ao original
- [ ] Nenhum `style={{}}` em componentes convertidos
- [ ] Bundle CSS menor
