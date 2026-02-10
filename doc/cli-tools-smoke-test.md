# Smoke Test — CLI Tools (9Router)

> Guia passo a passo para testar cada integração CLI. Execute na ordem abaixo.
> **Pré-requisito:** Servidor 9Router rodando em `http://localhost:20128` com pelo menos 1 provedor ativo.

---

## Status Atual das CLIs

| CLI              | Instalada  | Configurada com 9Router | Config Path                 |
| ---------------- | ---------- | ----------------------- | --------------------------- |
| Claude Code      | ✅         | ✅ Já configurada       | `~/.claude/settings.json`   |
| Codex CLI        | ✅         | ❌                      | `~/.codex/config.toml`      |
| Factory Droid    | ✅         | ✅ Já configurada       | `~/.factory/settings.json`  |
| Open Claw        | ✅         | ❌                      | `~/.openclaw/openclaw.json` |
| Cursor           | ✅ (agent) | ❌ Guide-based          | Manual                      |
| Cline            | ✅ (ext)   | ❌ Guide-based          | Manual                      |
| Roo              | ✅ (ext)   | ❌ Guide-based          | Manual                      |
| Continue         | ✅ (ext)   | ❌ Guide-based          | Manual                      |
| Antigravity MITM | ✅ (cert)  | ❌ Parado               | DNS + SSL                   |

---

## Teste 1: Claude Code (Automático)

### 1.1 — Verificar Configuração Atual

```bash
# Já está configurada. Verifique:
cat ~/.claude/settings.json | python3 -m json.tool | grep -A2 ANTHROPIC
```

**Esperado:** `ANTHROPIC_BASE_URL` apontando para `http://...20128/v1`

### 1.2 — Testar Reset

1. Abrir `http://localhost:20128/dashboard/cli-tools`
2. Expandir **Claude Code**
3. Clicar **Reset** → Confirmar
4. Verificar que env vars foram removidas:

```bash
cat ~/.claude/settings.json | python3 -m json.tool
```

**Esperado:** Sem `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, etc.

### 1.3 — Testar Apply

1. Na mesma tela, configurar:
   - Model mappings (Opus, Sonnet, Haiku)
   - Selecionar API Key
2. Clicar **Apply**
3. Verificar que env vars foram escritas:

```bash
cat ~/.claude/settings.json | python3 -m json.tool
```

**Esperado:** `ANTHROPIC_BASE_URL` apontando para 9Router com `/v1`

### 1.4 — Teste Funcional (Opcional)

```bash
claude --print "Diga apenas: teste ok"
```

**Esperado:** Resposta funcional passando pelo 9Router

---

## Teste 2: Codex CLI (TOML + Auth)

### 2.1 — Backup da Config Atual

```bash
cp ~/.codex/config.toml ~/.codex/config.toml.backup
cp ~/.codex/auth.json ~/.codex/auth.json.backup
```

### 2.2 — Testar Apply

1. Expandir **OpenAI Codex CLI**
2. Selecionar modelo (ex: `ag/claude-opus-4-5-thinking`)
3. Selecionar API Key
4. Clicar **Apply**
5. Verificar config:

```bash
cat ~/.codex/config.toml
```

**Esperado:** `model_provider = "9router"` e seção `[model_providers.9router]`

```bash
cat ~/.codex/auth.json | python3 -m json.tool | grep OPENAI_API_KEY
```

**Esperado:** Chave do 9Router

### 2.3 — Testar Reset

1. Clicar **Reset**
2. Verificar:

```bash
cat ~/.codex/config.toml
```

**Esperado:** Seção `[model_providers.9router]` removida, outras configs preservadas (profiles, features, etc.)

### 2.4 — Restaurar Config Original

```bash
cp ~/.codex/config.toml.backup ~/.codex/config.toml
cp ~/.codex/auth.json.backup ~/.codex/auth.json
```

---

## Teste 3: Factory Droid (customModels)

### 3.1 — Verificar Configuração Atual

```bash
cat ~/.factory/settings.json | python3 -m json.tool | grep -A5 "9Router"
```

**Esperado:** `custom:9Router-0` no array customModels

### 3.2 — Testar Reset

1. Expandir **Factory Droid**
2. Clicar **Reset**
3. Verificar:

```bash
cat ~/.factory/settings.json | python3 -m json.tool | grep "9Router"
```

**Esperado:** Sem referência ao 9Router

### 3.3 — Testar Apply

1. Selecionar modelo e API Key
2. Clicar **Apply**
3. Verificar que `custom:9Router-0` foi adicionado

---

## Teste 4: Open Claw (providers)

### 4.1 — Backup

```bash
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup 2>/dev/null || echo "Sem config anterior"
```

### 4.2 — Testar Apply

1. Expandir **Open Claw**
2. Selecionar modelo e API Key
3. Clicar **Apply**
4. Verificar:

```bash
cat ~/.openclaw/openclaw.json | python3 -m json.tool | grep -A8 "9router"
```

**Esperado:** Provider `9router` com baseUrl e apiKey

### 4.3 — Testar Reset

1. Clicar **Reset**
2. Verificar que provider `9router` foi removido

### 4.4 — Restaurar

```bash
cp ~/.openclaw/openclaw.json.backup ~/.openclaw/openclaw.json 2>/dev/null || echo "Nada para restaurar"
```

---

## Teste 5: Cursor (Guide)

### 5.1 — Verificar Detecção

1. Expandir **Cursor**
2. Confirmar que mostra **"Detected"** com caminho do binário

### 5.2 — Verificar Cloud Warning

**Esperado:** Aviso de que "Cursor routes requests through its own server"

### 5.3 — Verificar Guide Steps

**Esperado:** Instruções de 6 passos com Base URL (Cloud URL) e seletor de API Key

> ⚠️ Cursor requer Cloud Endpoint — não funciona com localhost!

---

## Teste 6: Cline (Guide)

### 6.1 — Verificar Guide

1. Expandir **Cline**
2. Confirmar 5 passos:
   - Open Settings
   - Select Provider → Ollama
   - Base URL copiável
   - API Key seletor
   - Model seletor

### 6.2 — Teste no VS Code (Opcional)

1. Abrir VS Code com extensão Cline
2. Seguir os passos do guia
3. Testar uma conversa

---

## Teste 7: Roo (Guide)

Idêntico ao Cline. Verificar que o guia exibe as instruções corretas com Base URL e model selector.

---

## Teste 8: Continue (Guide)

### 8.1 — Verificar Guide

1. Expandir **Continue**
2. Confirmar que mostra bloco JSON para `~/.continue/config.json`
3. Verificar que o JSON template tem os placeholders corretos

---

## Teste 9: Antigravity MITM

### 9.1 — Verificar Status

1. Expandir **Antigravity**
2. Verificar indicadores:
   - Certificado: ✅ Existe
   - DNS: ❌ Não configurado
   - Running: ❌ Parado

### 9.2 — Testar Start (⚠️ Requer Sudo)

1. Inserir senha sudo
2. Selecionar API Key
3. Clicar **Start**
4. Verificar:

```bash
# DNS configurado?
grep "daily-cloudcode-pa" /etc/hosts

# Processo rodando?
cat ~/.9router/mitm/.mitm.pid && ps aux | grep mitm
```

### 9.3 — Testar Stop

1. Clicar **Stop**
2. Verificar:

```bash
# DNS removido?
grep "daily-cloudcode-pa" /etc/hosts

# Processo parado?
cat ~/.9router/mitm/.mitm.pid 2>/dev/null || echo "PID file removed"
```

---

## Checklist Final

| #   | CLI           | Runtime    | Apply   | Reset  | Funcional |
| --- | ------------- | ---------- | ------- | ------ | --------- |
| 1   | Claude Code   | ☐          | ☐       | ☐      | ☐         |
| 2   | Codex CLI     | ☐          | ☐       | ☐      | ☐         |
| 3   | Factory Droid | ☐          | ☐       | ☐      | ☐         |
| 4   | Open Claw     | ☐          | ☐       | ☐      | ☐         |
| 5   | Cursor        | ☐ Guide OK | —       | —      | ☐         |
| 6   | Cline         | ☐ Guide OK | —       | —      | ☐         |
| 7   | Roo           | ☐ Guide OK | —       | —      | ☐         |
| 8   | Continue      | ☐ Guide OK | —       | —      | ☐         |
| 9   | Antigravity   | ☐          | ☐ Start | ☐ Stop | ☐         |
