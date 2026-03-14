# Shared AI Skills

These folders contain the shared source of truth for reusable repo-specific
skills and playbooks.

## How They Are Used

- Cursor skill wrappers are mirrored into `.cursor/skills/*`
- Claude Code skill wrappers are mirrored into `.claude/skills/*`
- Codex should read these files directly as detailed playbooks referenced from
  `AGENTS.md`

## Workflow

1. Edit `docs/ai/skills/*`
2. Run `yarn sync:ai-instructions`
3. Commit the shared skill folders and the mirrored `.cursor/skills/*` and
   `.claude/skills/*` folders together

## Current Shared Skills

- `syncable-entity-types-and-constants`
- `syncable-entity-cache-and-transform`
- `syncable-entity-builder-and-validation`
- `syncable-entity-runner-and-actions`
- `syncable-entity-integration`
- `syncable-entity-testing`
