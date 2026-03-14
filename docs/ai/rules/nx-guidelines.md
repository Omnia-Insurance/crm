# Nx Guidelines

## Core Rules

- Prefer running repo tasks through `npx nx` instead of calling the underlying
  tool directly
- Use `nx run`, `nx run-many`, or `nx affected` when they fit the task
- Prefer targeted commands first, then broader workspace commands only when
  needed
- Check `npx nx --help` or the target help output before guessing flags

## Preferred Commands

```bash
# Lint only the relevant workspace delta first
npx nx lint:diff-with-main twenty-front
npx nx lint:diff-with-main twenty-server

# Type check specific projects
npx nx typecheck twenty-front
npx nx typecheck twenty-server

# Run a project target
npx nx run twenty-server:test:integration:with-db-reset
```

## Workspace Navigation

- Start from `nx.json`, `package.json`, `tsconfig.base.json`, and the relevant
  `project.json` files before making workspace-level changes
- When a task is package-specific, identify the owning Nx project before editing
- Prefer repo conventions already encoded in project targets over ad hoc shell
  commands
