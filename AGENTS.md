# AGENTS.md

This file is the Codex entrypoint for this repository. Shared repo-specific AI
guidance lives in `docs/ai/rules/*.md` and is also used by Cursor and Claude
Code.

## Shared Instruction Layer

- Source of truth: `docs/ai/rules/*.md`
- Shared skill playbooks live in `docs/ai/skills/*`
- Cursor wrappers are generated from that source into `.cursor/rules/*.mdc`
- Shared skills are mirrored into `.cursor/skills/*` and `.claude/skills/*`
- After editing `docs/ai/rules/*.md` or
  `docs/ai/skills/*` or `docs/ai/cursor-rule-manifest.json`, run
  `yarn sync:ai-instructions`
- Tool-specific files stay tool-specific:
  `.cursor/environment*.json`, `.cursor/worktrees.json`,
  `.claude/settings*.json`

## Start Here

Read these shared rules before making changes:

- `docs/ai/rules/architecture.md`
- `docs/ai/rules/nx-guidelines.md`
- `docs/ai/rules/code-style.md`
- `docs/ai/rules/file-structure.md`

Add these when relevant:

- `docs/ai/rules/typescript-guidelines.md` for `.ts` and `.tsx`
- `docs/ai/rules/react-general-guidelines.md` and
  `docs/ai/rules/react-state-management.md` for React UI work
- `docs/ai/rules/testing-guidelines.md` for tests
- `docs/ai/rules/server-migrations.md` for `twenty-server` entities and
  TypeORM files
- `docs/ai/rules/sdk-esm-dependencies.md` for `twenty-sdk` and
  `create-twenty-app`
- `docs/ai/rules/creating-syncable-entity.md` for metadata or workspace
  migration work
- `docs/ai/rules/translations.md` for i18n work
- `docs/ai/skills/README.md` and the `syncable-entity-*` skill folders for the
  step-by-step syncable entity playbooks

## Project Overview

Twenty is an open-source CRM in an Nx monorepo. This repo is an Omnia fork of
`twentyhq/twenty`.

- Frontend: React 18, TypeScript, Jotai, Linaria, Vite
- Backend: NestJS, TypeORM, PostgreSQL, Redis, GraphQL Yoga
- Monorepo: Nx workspace managed with Yarn 4

Primary packages:

- `packages/twenty-front`
- `packages/twenty-server`
- `packages/twenty-ui`
- `packages/twenty-shared`
- `packages/twenty-e2e-testing`

## Non-Negotiables

Whenever you modify an upstream file or add Omnia-specific code:

1. Update `CUSTOMIZATIONS.md`
2. Add or update the matching check in `scripts/check-customizations.sh`
3. Use `check_file_contains`, `check_file_not_contains`, or
   `check_file_exists` as appropriate

## Preferred Commands

Use Nx commands from the repo root:

```bash
# Development
yarn start
npx nx start twenty-front
npx nx start twenty-server
npx nx run twenty-server:worker

# Fast validation
npx nx lint:diff-with-main twenty-front
npx nx lint:diff-with-main twenty-server
npx nx typecheck twenty-front
npx nx typecheck twenty-server

# Tests
npx jest path/to/test.test.ts --config=packages/PROJECT/jest.config.mjs
npx nx test twenty-front
npx nx test twenty-server
npx nx run twenty-server:test:integration:with-db-reset

# GraphQL
npx nx run twenty-front:graphql:generate
npx nx run twenty-front:graphql:generate --configuration=metadata

# Migrations
npx nx run twenty-server:typeorm migration:generate src/database/typeorm/core/migrations/common/[name] -d src/database/typeorm/core/core.datasource.ts
```

## CI Environment

In GitHub Actions, the dev environment is not pre-configured.

- Before running tests, builds, lint, type checks, or DB operations, run
  `bash packages/twenty-utils/setup-dev-env.sh`
- Skip that setup for read-only tasks such as architecture questions, code
  review, and documentation updates

## Important Files

- `docs/ai/README.md`
- `docs/ai/rules/README.md`
- `docs/ai/skills/README.md`
- `nx.json`
- `tsconfig.base.json`
- `package.json`
