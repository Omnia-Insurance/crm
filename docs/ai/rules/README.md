# Shared AI Rule Index

These markdown files are the shared source of truth for repo-specific AI
guidance.

Cursor reads generated `.cursor/rules/*.mdc` wrappers. Codex reads
`AGENTS.md`. Claude Code reads `CLAUDE.md`. Detailed rule content lives here.

## Rule Index

- `architecture.md`: Project overview, stack, package structure, and core
  development principles
- `nx-guidelines.md`: Nx workspace navigation and preferred task execution
- `code-style.md`: Naming, formatting, imports, comments, and error-handling
  conventions
- `file-structure.md`: Directory layout and file organization patterns
- `typescript-guidelines.md`: Strict typing and TypeScript-specific conventions
- `react-general-guidelines.md`: Component patterns and React-specific rules
- `react-state-management.md`: Jotai and component state guidance
- `testing-guidelines.md`: Testing strategy, naming, and structure
- `server-migrations.md`: TypeORM migration requirements for `twenty-server`
- `sdk-esm-dependencies.md`: ESM dependency constraints for published SDK
  packages
- `creating-syncable-entity.md`: Workflow for workspace syncable entities
- `translations.md`: Translation and i18n workflow
- `changelog-process.md`: Release changelog instructions
- `feedback-incorporation.md`: How to fold repeated feedback back into the rule
  set

## Which Rules To Read

- For any change: `architecture.md`, `nx-guidelines.md`, `code-style.md`, and
  `file-structure.md`
- For `.ts` and `.tsx` work: `typescript-guidelines.md`
- For React UI work: `react-general-guidelines.md` and
  `react-state-management.md`
- For tests: `testing-guidelines.md`
- For `twenty-server` entities or TypeORM files: `server-migrations.md`
- For `packages/twenty-sdk/**` and `packages/create-twenty-app/**`:
  `sdk-esm-dependencies.md`
- For metadata and workspace migration work:
  `creating-syncable-entity.md`
- For translation files: `translations.md`
- For release notes: `changelog-process.md`

## Maintenance Workflow

1. Edit `docs/ai/rules/*.md`
2. Update `docs/ai/cursor-rule-manifest.json` if you add, remove, or retarget a
   rule
3. Run `yarn sync:ai-instructions`
4. Commit the shared docs and generated `.cursor/rules/*.mdc` files together

## Tool-Specific Notes

- Cursor uses the generated rule wrappers and their glob metadata
- Codex and Claude Code should open the relevant shared rule files directly
- `.cursor/environment*.json`, `.cursor/worktrees.json`, `.cursor/skills/**`,
  `.claude/settings*.json`, and `.claude/skills/**` remain tool-specific
