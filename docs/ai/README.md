# AI Instructions

This directory makes the repository's AI guidance portable across Cursor,
Codex, and Claude Code.

## Source of Truth

- Shared rule content lives in `docs/ai/rules/*.md`
- Shared skill content lives in `docs/ai/skills/*`
- Cursor reads generated `.cursor/rules/*.mdc` files
- Cursor skill wrappers are mirrored into `.cursor/skills/*`
- Codex reads `AGENTS.md`
- Claude Code reads `CLAUDE.md`
- Claude skill wrappers are mirrored into `.claude/skills/*`

## Workflow

1. Edit `docs/ai/rules/*.md`, `docs/ai/skills/*`, and, if needed,
   `docs/ai/cursor-rule-manifest.json`
2. Run `yarn sync:ai-instructions`
3. Commit the shared docs and the generated or mirrored tool-specific files
   together

## Tool-Specific Files

These stay tool-specific and are not part of the shared instruction source:

- `.cursor/environment*.json`
- `.cursor/worktrees.json`
- `.claude/settings*.json`
