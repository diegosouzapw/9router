# 🐳 Docker Deployment Guide

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — at minimum change JWT_SECRET and INITIAL_PASSWORD

# 2. Choose a profile and start
docker compose --profile cli up -d      # Recommended: CLIs inside container
```

---

## Profiles Overview

9Router ships three Docker Compose profiles for different use cases:

| Profile | Image Target  | CLI Tools                                        | Best For                                                 |
| ------- | ------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `base`  | `runner-base` | ❌ None                                          | Proxy-only mode, smallest image, no CLI runtime needed   |
| `cli`   | `runner-cli`  | ✅ Bundled (codex, claude-code, droid, openclaw) | Docker Desktop, VPS, portability — **recommended**       |
| `host`  | `runner-base` | 🔗 Mounted from host via volumes                 | Linux power users who want to use their own CLI installs |

### Decision Guide

```
Do you need CLI tools (auto-config for Claude, Codex, Droid, OpenClaw)?
├─ No  → Use profile: base
├─ Yes → Are you on Linux with CLIs already installed on the host?
│   ├─ Yes → Use profile: host
│   └─ No  → Use profile: cli
```

---

## Profile Usage

### Profile: `base` (Minimal)

No CLI tools. Smallest image. Dashboard and API proxy work normally.

```bash
docker compose --profile base up -d
```

### Profile: `cli` (Portable — Recommended)

CLIs pre-installed inside the container: `codex`, `claude`, `droid`, `openclaw`.

```bash
docker compose --profile cli up -d
```

### Profile: `host` (Host-Mounted CLIs — Linux)

Uses `runner-base` image but mounts host CLI binaries and configs.

> ⚠️ **Linux-first.** On Docker Desktop (Mac/Windows), prefer `cli` profile.

**Before starting**, edit `docker-compose.yml` to match your host paths:

```yaml
volumes:
  # Adjust to YOUR node/nvm path:
  - ~/.nvm/versions/node/v22.16.0/bin:/host-node/bin:ro
  # Adjust per-tool overrides in environment section as needed:
  # - CLI_CURSOR_BIN=agent
```

Then:

```bash
docker compose --profile host up -d
```

---

## Building Images Manually

If you prefer `docker build` without Compose:

```bash
# Build minimal image (no CLIs)
docker build --target runner-base -t 9router:base .

# Build with bundled CLIs (default target)
docker build -t 9router:cli .

# Explicit CLI target
docker build --target runner-cli -t 9router:cli .
```

---

## Environment Variables

Copy `.env.example` to `.env` and edit. Key variables:

| Variable                  | Default         | Description                                     |
| ------------------------- | --------------- | ----------------------------------------------- |
| `JWT_SECRET`              | `change-me-...` | **⚠️ Change in production!** JWT signing secret |
| `INITIAL_PASSWORD`        | `123456`        | First login password                            |
| `PORT`                    | `20128`         | Service port                                    |
| `DATA_DIR`                | `/app/data`     | Data directory (Docker default)                 |
| `CLI_MODE`                | `auto`          | CLI runtime: `auto`, `host`, `container`        |
| `CLI_EXTRA_PATHS`         | empty           | Extra PATH entries for CLI detection            |
| `CLI_CONFIG_HOME`         | `os.homedir()`  | Base dir for CLI config files                   |
| `CLI_ALLOW_CONFIG_WRITES` | `true`          | Block config writes if `false`                  |
| `REQUIRE_API_KEY`         | `false`         | Enforce API key on `/v1/*` routes               |

Per-tool binary overrides: `CLI_CLAUDE_BIN`, `CLI_CODEX_BIN`, `CLI_DROID_BIN`, `CLI_OPENCLAW_BIN`, `CLI_CURSOR_BIN`, `CLI_CLINE_BIN`, `CLI_KILO_BIN`, `CLI_CONTINUE_BIN`.

See `.env.example` for the full list.

> **Note:** `.env` is NOT baked into the Docker image. It's injected at runtime via `env_file` in Compose or `--env-file` with `docker run`.

---

## Runtime Validation

After starting, verify CLI detection:

```bash
# Check specific CLI tools
curl -s http://localhost:20128/api/cli-tools/codex-settings | jq '{installed,runnable,commandPath,runtimeMode}'
curl -s http://localhost:20128/api/cli-tools/claude-settings | jq '{installed,runnable,commandPath,runtimeMode}'
curl -s http://localhost:20128/api/cli-tools/openclaw-settings | jq '{installed,runnable,commandPath,runtimeMode}'

# Check guide/runtime-only tools
curl -s http://localhost:20128/api/cli-tools/runtime/cursor | jq '{installed,runnable,command,commandPath,runtimeMode}'
curl -s http://localhost:20128/api/cli-tools/runtime/cline | jq '{installed,runnable,commandPath,runtimeMode}'
```

Expected results by profile:

| Tool           | `base`                 | `cli`                             | `host`                 |
| -------------- | ---------------------- | --------------------------------- | ---------------------- |
| codex          | `installed: false`     | `installed: true, runnable: true` | Depends on host mount  |
| claude         | `installed: false`     | `installed: true, runnable: true` | Depends on host mount  |
| droid          | `installed: false`     | `installed: true, runnable: true` | Depends on host mount  |
| openclaw       | `installed: false`     | `installed: true, runnable: true` | Depends on host mount  |
| cursor         | `installed: false`     | `installed: false`                | Depends on host mount  |
| cline/continue | `reason: not_required` | `reason: not_required`            | `reason: not_required` |

---

## Useful Commands

```bash
# View logs
docker compose logs -f

# Restart service
docker compose restart

# Stop and remove
docker compose --profile cli down

# Rebuild after code changes
docker compose --profile cli build
docker compose --profile cli up -d
```

---

## Data Persistence

All application data is stored in the named volume `9router-data`:

| File         | Purpose                                    |
| ------------ | ------------------------------------------ |
| `db.json`    | Providers, combos, aliases, keys, settings |
| `usage.json` | Usage history                              |
| `log.txt`    | Application log                            |
| `call_logs/` | Individual API call logs                   |

```bash
# Backup data volume
docker run --rm -v 9router-data:/data -v $(pwd):/backup alpine tar czf /backup/9router-backup.tar.gz -C /data .

# Restore data volume
docker run --rm -v 9router-data:/data -v $(pwd):/backup alpine tar xzf /backup/9router-backup.tar.gz -C /data
```

---

## Security Hardening

For internet-exposed deployments:

```bash
# In .env:
REQUIRE_API_KEY=true          # Enforce API key on /v1/* routes
AUTH_COOKIE_SECURE=true       # Secure cookie (requires HTTPS)
JWT_SECRET=<long-random>      # Strong JWT secret
```

Run the hardening test suite:

```bash
bash tester/security/test-docker-hardening.sh
```

---

## Automated Tests

```bash
# Test all 3 Docker profiles + write policy + host mount + regression
bash tester/security/test-cli-runtime.sh

# Test security hardening
bash tester/security/test-docker-hardening.sh
```

---

## Troubleshooting

**CLI tool shows "not installed" inside Docker**

- Using `base` profile? CLIs are not included. Switch to `cli` or `host`.
- Using `host` profile? Check `CLI_EXTRA_PATHS` and volume mounts.
- Check runtime: `curl -s http://localhost:20128/api/cli-tools/codex-settings | jq '{installed,runnable,reason}'`

**Container doesn't start**

- Check logs: `docker compose logs`
- Verify `.env` exists and has valid values.
- Ensure port 20128 is not already in use.

**Host mount mode: CLI found but not runnable**

- `reason: "not_executable"` → binary lacks execute permission.
- `reason: "healthcheck_failed"` → binary found but `--version` failed. May need additional deps.

**Docker Desktop (Mac/Windows) with host mode**

- Docker Desktop runs a Linux VM, so host paths don't map directly. Use `cli` profile instead.

**Building takes too long**

- The `runner-cli` target installs npm packages globally. This layer is cached unless `package.json` changes.
- Use `docker compose build` to leverage BuildKit cache.
