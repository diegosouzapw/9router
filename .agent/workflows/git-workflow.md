---
description: Git workflow — NEVER commit directly to main. Always use feature branches.
---

# Git Workflow

## ⚠️ CRITICAL RULE: NEVER commit directly to `main`

## Steps

1. **Before starting any work**, create a feature branch from `main`:

   ```bash
   git checkout main && git pull origin main
   git checkout -b feature/<feature-name>
   ```

2. **During development**, commit to the feature branch:

   ```bash
   git add -A && git commit -m "<type>(<scope>): <description>"
   ```

3. **When the feature is complete and verified**, push the branch and STOP:

   ```bash
   git push origin feature/<feature-name>
   ```

4. **DO NOT** create a PR, merge, or push to `main`. Let the user handle that.

## Branch naming convention

- `feature/<name>` — new features
- `fix/<name>` — bugfixes
- `refactor/<name>` — refactoring

## Commit types

- `feat` — new feature
- `fix` — bugfix
- `refactor` — code refactoring
- `docs` — documentation
- `chore` — maintenance
