# Upstream Merge Skill

Merge upstream `twentyhq/twenty` releases into the Omnia fork. The goal is **synthesis, not preservation** — our customizations must evolve with upstream, adopting their improvements while maintaining our unique behavior.

Companions: `CUSTOMIZATIONS.md`, `scripts/check-customizations.sh`, `.claude/skills/customization-tracking/SKILL.md`, `packages/twenty-server/docs/UPGRADE_COMMANDS.md`, and the cutover runbook of the last cross-version deploy (`docs/upstream-merge-2026-11-14-v2-58-runbook.md`).

## Core Philosophy

This is NOT "take ours vs take theirs." Every customized file requires deep comparison:

- **Upstream improved something we customized?** Adopt their improvement AND keep our custom behavior on top.
- **Upstream added a new API, helper, or pattern?** Refactor our custom code to use it.
- **Upstream fixed a bug in code we forked?** The fix must appear in our version too.
- **Upstream refactored the architecture around our customization?** Rewrite our customization to fit the new architecture — don't force old patterns into new code.
- **Upstream removed something our code depends on?** Find what replaced it and migrate our code.
- **Upstream now does the job natively?** Swap to it and delete our code, unless the swap weakens RLS, field permissions, auth or PHI handling.

The merged result should look like it was written by someone who had access to the latest upstream AND understood our business needs — not like two codebases stitched together.

## Phase 1: Preparation

### 1a. Toolchain

- Use upstream's `.nvmrc` (Node 26.13.1 for v2.58) and the yarn release named by `yarnPath` in `.yarnrc.yml`.
- Node 26 ships without corepack, so nothing puts `yarn` on PATH and tools that shell out to it fail (twenty-ui's build does). Put this shim first on PATH; the Docker image does the same:
  ```sh
  #!/bin/sh
  root=$(git rev-parse --show-toplevel)
  exec node "$root/$(sed -n 's/^yarnPath: //p' "$root/.yarnrc.yml")" "$@"
  ```

### 1b. Run the customization check BEFORE starting

```bash
bash scripts/check-customizations.sh 2>&1 | tee /tmp/pre-merge-customizations.txt
```

Save this output. It is the **authoritative list** of every pattern that must survive. The script checks specific code patterns inside files — not just file existence. Treat a SKIP as a failure: `check_file_not_contains` skips a missing file, which usually means upstream moved it (see 3a).

### 1c. Read CUSTOMIZATIONS.md completely

Read ALL sections, not just the "Critical Files" table. Every section describes behavior the merge must keep or swap deliberately.

### 1d. Build a customization map

For every file that `check-customizations.sh` validates, run:
```bash
grep -n "FILENAME_STEM" scripts/check-customizations.sh
```
This tells you exactly what patterns the script expects to find. These patterns ARE the customization — if they're gone, the customization is wiped.

### 1e. Check what prod runs

Plan the upgrade from prod's version and upgrade cursor, not from the last merge. The v2.19 merge never shipped, so the v2.58 merge jumped prod from 2.7. Also check that the deploy pipeline still runs: GitHub Actions had not run since 2026-10-08 when the v2.58 merge began.

```bash
kubectl -n twentycrm get deploy my-twenty-twenty-server -o jsonpath='{..image}'
# read-only on prod: SELECT name, status FROM core."upgradeMigration" ORDER BY "createdAt" DESC LIMIT 5;
```

### 1f. Fetch and merge a release

```bash
git fetch upstream --tags
git branch -r --list 'upstream/v*' | sort -V | tail -3   # Twenty cuts one release branch per minor
git describe --tags upstream/vX.Y                        # twenty/vX.Y.Z, the release you get
git checkout origin/main -b merge/upstream-YYYY-MM-DD
git merge upstream/vX.Y                                  # never upstream/main
```

Merge a release, never `upstream/main`: main carries unreleased work. If `git describe --tags --exact-match upstream/vX.Y` fails because the branch moved past its last tag, merge the tag itself (`git merge twenty/vX.Y.Z`).

### 1g. Plan the work in waves

A large merge (v2.58: 350 units across 16 domains) runs in waves. A wave starts only when the previous wave's gate passes.

| Wave | Work | Gate |
|---|---|---|
| 0 | Toolchain, `package.json` files, `yarn.lock`, AI layer (`CLAUDE.md`, `.claude/`), workflows. Take upstream for locale catalogs and generated files. | `yarn install` succeeds on upstream's Node and `.yarnrc.yml` |
| 1 | Server skeleton first: the three Omnia registration modules, queue enum and config, enterprise unlock, Helm. Then permissions and RLS, and metadata core. | `npx tsgo` clean for twenty-shared; the registration modules compile |
| 2 | Query API, search and AI, Omnia modules, the server halves of export/import and apps | `npx tsgo` clean for twenty-server; server specs green |
| 3 | Run the merged server locally and regenerate front codegen | generated files regenerated from the merged server |
| 4 | Front domains: auth, permissions UI, table views, record show, command menu, nav shell, the front half of export/import | `npx tsgo` clean for twenty-front; front jest green |
| 5 | `chore(i18n)` extract and compile, `lint:diff-with-main`, knip, `check-customizations.sh`, rehearsal on a fresh prod snapshot | the verification checklist is green |

- Each hot file has one owner (registration modules, `omnia-values.yaml`, `auth.service.ts`, generated files, shared front providers). Other domains send the owner a written request: file, exact hunk, reason. The orchestrator applies requests between waves.
- Each domain also reviews the files that merged cleanly. A clean merge is not a correct merge: Omnia orphans stop compiling and hunks drop silently.

## Generated Types (CRITICAL)

`packages/twenty-front/src/generated-metadata/graphql.ts`, `src/generated/graphql.ts` and `src/generated-admin/graphql.ts` are generated by GraphQL codegen from the server schema. `generated-metadata/` carries Omnia's custom schema, and upstream's version misses all of it. This causes **silent runtime failures** — fields are simply not fetched by Apollo, and features break without errors.

### Our Custom Fields

| Type | Field | Feature |
|------|-------|---------|
| `ViewField`, `CreateViewFieldInput` | `subFieldName` | Relation sub-field columns |
| `ObjectPermission` and its inputs | `showInSidebar`, `editWindowMinutes` | Role-based sidebar, edit window |
| `Role` and its inputs | `editWindowMinutes`, `showAllObjectsInSidebar` | Edit window, sidebar default |
| `UserWorkspace` | `objectSidebarVisibility { objectMetadataId showInSidebar }` | Member sidebar for the current user |
| `Field` and its create/update inputs | `requiredCondition` | Soft "Required" rules |
| Mutation | `refreshOmniaSiblingSession` (`RefreshOmniaSiblingSessionDocument`) | omniaagent.com dashboard cookie |
| `CreateRecordExportInput` | `relationSubFields` (in `schema.ts`) | Export of relation sub-field columns |
| `IngestionPipeline*` types and operations | — | Ingestion pipeline settings |

### Where Each Field Appears in the File

Each custom field appears in MULTIPLE locations (up to 10+ copies for frequently-used fragments). All copies must be present or the field silently disappears at runtime. The four categories:

1. **TypeScript type definitions** — e.g., `export type ViewField = { ... subFieldName?: ... }`
2. **Fragment type definitions** — e.g., `export type ViewFieldFragmentFragment = { ... subFieldName?: ... }`
3. **Inline types in query/mutation result types** — e.g., fields inlined in `GetRolesQuery`, `GetCurrentUserQuery`, `UserQueryFragmentFragment`, `UpsertObjectPermissionsMutation`
4. **DocumentNode AST objects** — JSON objects with `{"kind":"Field","name":{"kind":"Name","value":"subFieldName"}}` patterns. These are the actual GraphQL query ASTs that Apollo uses at runtime. Missing a field here means it is never requested from the server.

### Resolution Procedure

Never hand-merge or hand-edit these files: a hand edit always misses one of the copies above. Take upstream during conflict resolution, then regenerate in wave 3 from the merged server.

```bash
# 1. During conflict resolution: take upstream's version of each generated file
git checkout --theirs packages/twenty-front/src/generated-metadata/graphql.ts
git add packages/twenty-front/src/generated-metadata/graphql.ts

# 2. Wave 3: start the merged server, then regenerate all three schemas
npx nx run twenty-front:graphql:generate                           # generated/
npx nx run twenty-front:graphql:generate --configuration=metadata  # generated-metadata/
npx nx run twenty-front:graphql:generate --configuration=admin     # generated-admin/

# 3. Every custom field is present
for field in subFieldName showInSidebar editWindowMinutes showAllObjectsInSidebar \
  objectSidebarVisibility requiredCondition RefreshOmniaSiblingSessionDocument; do
  echo "$field $(grep -c "$field" packages/twenty-front/src/generated-metadata/graphql.ts)"
done
```

- Every count must be above 0, and at least the count on `origin/main` for fields that existed before (`git show origin/main:packages/twenty-front/src/generated-metadata/graphql.ts | grep -c subFieldName`). Upstream may add queries that include the fragments, so higher is fine.
- Codegen reads the running server. It only has to boot, so any local database works for this step. Restart it after every server-side GraphQL change, and run codegen one caller at a time.
- Under Vite a missing named export (for example `RefreshOmniaSiblingSessionDocument`) stops the whole app from loading; jest only degrades. If the server cannot start, fix that before touching the front.

## Phase 2: Conflict Resolution

### Classification — for EVERY conflicted file:

1. **Check the customization map** (from 1d). Is this file validated by the check script?
2. **Check CUSTOMIZATIONS.md**. Is this file listed in any section?
3. **Grep for `OMNIA-CUSTOM`** markers in the file.

This determines the resolution strategy:

### Strategy A: Auto-generated files (take upstream, regenerate later)

- Locale catalogs: `packages/twenty-front/src/locales/*.po`, `src/locales/generated/*` and the server's `packages/twenty-server/src/engine/core-modules/i18n/locales/`. Regenerate with lingui after all ports (3c).
- twenty-shared barrels (`src/*/index.ts`) are generated: run `npx nx run twenty-shared:generateBarrels`, never hand-edit them.
- `yarn.lock`: take theirs, run `yarn install`, then review `git diff upstream/vX.Y -- yarn.lock`. It may add only Omnia's own dependencies.

```bash
git checkout --theirs <files> && git add <files>
```

> **WARNING:** the generated GraphQL files are NOT plain auto-generated files. Taking upstream's version without regenerating wipes all our custom fields and causes silent runtime failures. See **Strategy E**.

### Strategy E: Generated types with custom fields (CRITICAL)

- `packages/twenty-front/src/generated-metadata/*`, `src/generated/*`, `src/generated-admin/*`

Take upstream's version, then regenerate from the merged server in wave 3 and verify the counts. See **"Generated Types (CRITICAL)"** above.

### Strategy B: Files we own exclusively (take ours)

- `.github/workflows/`: only `deploy-eks.yaml` survives. Delete every upstream workflow the merge brings back, and keep the deleted ones deleted.
- `packages/twenty-docker/helm/twenty/omnia-values.yaml` and other Omnia-only files.

```bash
git checkout --ours <files> && git add <files>
```

Toolchain files are **not** ours: take upstream's `.nvmrc`, `.yarnrc.yml`, `.yarn/releases/*` and `yarn.config.cjs`. Taking ours dropped upstream's `enableScripts: false` (supply-chain hardening) and kept an orphan yarn release.

The AI layer needs a real merge:
- `.claude/settings.json`: upstream's attribution block plus Omnia's `extraKnownMarketplaces`, `enabledPlugins` and `env`.
- `CLAUDE.md`: upstream verbatim plus the appended `## Omnia fork` section. `AGENTS.md` stays a symlink to `CLAUDE.md`.
- Upstream re-adds files Omnia deleted (`.cursor/`, `docs/ai/`, workflows): delete them again.

### Strategy C: Upstream-only files (take upstream)

Files where ALL of these are true:
- NOT in `CUSTOMIZATIONS.md` (any section)
- NOT validated by `check-customizations.sh`
- NO `OMNIA-CUSTOM` markers
- NOT imported/used by any customized file

```bash
git checkout --theirs <files> && git add <files>
```

**When in doubt, do NOT put a file in this category.** It's better to manually merge a file that didn't need it than to blindly take upstream on one that did. Omnia-added files that no customization keeps any more are deleted.

### Strategy D: Deep merge (THE MOST IMPORTANT CATEGORY)

Every file that doesn't fit A/B/C/E gets a deep merge. This is the majority of real work.

#### Special case: auth and client session storage

The signed-out auth shell (a lead-shaped mock table behind the sign-in modal, soft logout) was dropped in the v2.58 merge: sign-in is upstream's full page, mocked metadata is test-only, and sign-out reloads the page. Take upstream for `packages/twenty-front/src/modules/sign-in-background-mock/**` (only NotFound uses it), for `clearSession` in `useAuth.ts`, and for the context-store providers (`MainContextStoreProvider.tsx` no longer exists; `RouteContextStoreProviderEffect.tsx` is upstream). Do not re-add a signed-out view-type owner or a soft logout. Omnia's `useAuth.ts` hunks are the sign-out storage wipe and the trusted sibling `returnToPath`.

Before each merge, re-audit the `useLocalStorage: true` atoms under `packages/twenty-front/src/modules/auth/states/`, and any new auth-critical localStorage key, against the preserve list in `packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts`. A key missing from that list is wiped on the first boot after every deploy, and a deploy must never log users out or drop `isPendingServerSignOutState`.

#### Special case: registration points

Omnia server code registers through exactly three modules, each a single import in an upstream file:
- `OmniaModulesModule` (`packages/twenty-server/src/modules/omnia/omnia-modules.module.ts`) in `modules.module.ts`
- `OmniaCommandModule` (`src/database/commands/custom/omnia-command.module.ts`) in `database-command.module.ts`
- `OmniaUpgradeVersionCommandModule` (`src/database/commands/upgrade-version-command/omnia/`) in `workspace-command-provider.module.ts`

Beyond those, upstream registration files carry only Omnia's queues (`message-queue.constants.ts`, `message-queue-worker-config.constant.ts`) and cron entries (`cron-register-all.command.ts`). Take upstream for everything else in them, and never add Omnia hooks to `workspace-query-hook.module.ts` (they would register twice).

#### Special case: upgrade commands

- Omnia schema and data steps are upgrade commands in `upgrade-version-command/omnia/`, registered at the then-current `TWENTY_CURRENT_VERSION` with a real epoch-ms timestamp above every existing one in that version. A command that sorts before an already-applied step is silently skipped.
- Never edit committed upstream command logic beyond the existing `OMNIA-CUSTOM` hunks (today in 2-6, 2-7, 2-10, 2-23 and 2-26): re-apply those on upstream's new version of the file.
- When upstream skips one of its own commands for an environment (2.7 Finalize was added after prod passed 2.7), add an idempotent Omnia catch-up command instead of editing the cursor.

#### Special case: Helm

Prefer values in `omnia-values.yaml` over template edits: upstream's chart has knobs for the service account, probes and scheduling. The Omnia template hunks are the migration job (`job-migration.yaml`: `omnia:run-legacy-typeorm-migrations`, `cache:flush`, `upgrade`, `cache:flush`; never `run-instance-commands`), the rollout knobs with `pdb-server.yaml`, and the Redis probes and tolerations.

#### Special case: UI kit moves

twenty-ui was reorganized into `components/`, `primitives/`, `icon/` and `theme/` (#25948). `src/navigation/` is gone, and its link components moved into twenty-front (`packages/twenty-front/src/modules/ui/navigation/link/components/`, where Omnia's `AudioLink` now lives). Import from the new subpaths (`twenty-ui/theme`, `twenty-ui/primitives/*`, `twenty-ui/components/*`) and never recreate a path upstream removed.

For each file:

1. **Read the full conflict** — both sides, including context above and below markers.

2. **Understand upstream's changes:**
   - What did they add? (new features, parameters, imports)
   - What did they refactor? (renames, restructures, new patterns)
   - What did they fix? (bug fixes, edge cases, security)
   - What did they remove? (deprecated code, old patterns)

3. **Understand our customization:**
   - What behavior does it add? (from CUSTOMIZATIONS.md description)
   - What patterns does the check script look for? (from grep in 1d)
   - WHY does the customization exist? (the "Why" column in CUSTOMIZATIONS.md)

4. **Synthesize:**
   - Start with upstream's new structure as the foundation
   - Layer our custom behavior on top, adapted to the new structure
   - If upstream introduced a better way to do something we were doing manually, use their way
   - If upstream added new parameters, helpers, or APIs, use them in our custom code
   - If upstream renamed/moved imports, update our code to use the new names
   - If upstream changed a function signature, adapt our calls
   - Mark every surviving Omnia hunk with a short `// OMNIA-CUSTOM: <why>`
   - The result should read like native code — not like a patch bolted on

5. **Verify the check script patterns will pass** on your merged result.

## Phase 3: Post-Merge Validation (ALL MANDATORY)

### 3a. Customization check

```bash
bash scripts/check-customizations.sh 2>&1 | tee /tmp/post-merge-customizations.txt
diff /tmp/pre-merge-customizations.txt /tmp/post-merge-customizations.txt
```

**Zero regressions allowed** (except features living on other branches). Any new failure = a customization that was wiped.

When upstream moves or replaces a file, re-point its check to the live successor, or remove the check if upstream now does the job. A check on an orphaned copy stays green while the behaviour is gone: in the v2.58 merge, `pageLayoutWidgetIndex` was pinned on a dead `utils/` copy after the live service had already dropped it.

Every new Omnia hunk gets a `CUSTOMIZATIONS.md` row and a check (`check_file_contains` / `check_file_not_contains`); every new Omnia-only file gets a `check_file_exists`.

### 3b. Typechecks, lint, tests

Rebuild the workspace packages first. Their `dist` folders are per-branch state that nothing tracks, and a rebuild does not delete files from an older layout: after v2.58, 268 orphan files sat in `twenty-shared/dist`, `twenty-oxlint-rules/dist` dated from August, and server jest needed a fresh twenty-ui build.

```bash
for package in twenty-shared twenty-ui twenty-oxlint-rules; do
  rm -rf "packages/$package/dist" && npx nx build "$package" --skip-nx-cache
done
```

Then typecheck in each package directly (the nx cache can serve a stale pass), lint the diff and run the suites:

```bash
(cd packages/twenty-shared && npx tsgo -p tsconfig.json --noEmit --incremental false)
(cd packages/twenty-server && npx tsgo -p tsconfig.json --noEmit --incremental false)
(cd packages/twenty-front && npx tsgo -p tsconfig.json --noEmit --incremental false)
npx nx lint:diff-with-main twenty-server && npx nx lint:diff-with-main twenty-front
npx nx test twenty-server && npx nx test twenty-front
npx nx run-many -t knip   # record the baseline
```

Type errors after merge usually come from:
- Our custom code using APIs that upstream renamed/moved — find the new location (v2.58: `GlobalWorkspaceOrmManager` → `WorkspaceOrmManager`, `ActiveOrSuspendedWorkspaceCommandRunner` → `ProvisionedWorkspaceCommandRunner`, the old guards → `AccessPolicyGuard`)
- New constructor args on classes we extend — add the new args
- Enum values we added that upstream restructured — re-add to new enum
- Our custom types extending upstream types that changed shape — update the extension
- Changed return shapes that still compile in places: v2.58 `WorkspaceRepository.save()` returns an array

### 3c. Regenerate auto-generated files

```bash
# GraphQL types: see "Generated Types (CRITICAL)"; the merged server must be running
npx nx run twenty-front:graphql:generate
npx nx run twenty-front:graphql:generate --configuration=metadata
npx nx run twenty-front:graphql:generate --configuration=admin
# Translations: once, after every port, in a dedicated chore(i18n) commit
npx nx run twenty-front:lingui:extract && npx nx run twenty-front:lingui:compile
npx nx run twenty-server:lingui:extract && npx nx run twenty-server:lingui:compile
```

Upstream merges are the exception to CLAUDE.md's rule against committing catalogs: the merge took upstream's catalogs, so they lack Omnia's strings until this commit.

### 3d. Database upgrade

```bash
# needs a built server dist (the user owns server builds)
npx nx run twenty-server:command-no-deps -- upgrade
npx nx run twenty-server:command-no-deps -- upgrade:status
```

- `upgrade` only. Never `database:migrate` or `run-instance-commands --force` across versions: they record the fast commands for every workspace, so `upgrade` then skips every slow and workspace command in between. The legacy TypeORM folder is frozen; `omnia:run-legacy-typeorm-migrations` runs a pending legacy file without any instance command.
- `upgrade --dry-run` stops at the first instance step, so it never reaches Omnia's workspace commands. Prove them with a real run on a fresh prod copy (`scripts/replicate-db-to-local.sh`), never on a dev database with gaps in its upgrade history (lessons below).
- If `upgrade` fails, fix the cause and rerun: it resumes from the cursor in `core."upgradeMigration"`. Never mark a step completed by hand, because the cursor then skips it for good. A failed instance step right after a workspace segment leaves failed per-workspace rows that block a plain rerun: delete them by the step's name (the v2.58 runbook's contingencies show the query).
- `TWENTY_CURRENT_VERSION` (`packages/twenty-server/src/engine/core-modules/upgrade/constants/twenty-current-version.constant.ts`) is the upgrade version. `APP_VERSION` only stamps `executedByVersion` and drives the client refresh prompt; `deploy-eks.yaml` and `scripts/deploy-local.sh` derive it from that constant.
- A deploy that crosses many versions needs its own cutover runbook in `docs/`.
- ClickHouse (event logs, `infra/clickhouse/`): the pre-upgrade job applies upstream's ClickHouse migrations after `upgrade` and only warns on failure. After the deploy, grep the job log for `WARNING: ClickHouse migrations failed`; rehearse new ClickHouse migrations against a local copy first (runbook in `infra/clickhouse/README.md`).

### 3e. Smoke test

Start the app and verify:
- Sidebar: Home/AI/Settings mode switcher; labeled Search row at the top of Home and no search icon beside the workspace name; workspace dropdown with inline Log out and no Invite user. As a Member (no LAYOUTS), the Workspace section lists only the role's shown objects, the landing page is Leads, and Opened does not repeat a listed object.
- Record creation: upstream's creation form fills the Agent on Policy, and soft Required rules block Create
- RLS as an agent: sees every policy, edits only own, cannot create a policy for another agent; Settings shows the rule grants and edit window minutes
- Export: upstream record export, RLS-filtered, with the relation sub-field columns
- Search as an agent: no other agent's leads; a pasted policy number, the last 7 digits of a lead's phone and a formatted phone number each find the record
- Command menu: `Create <Object>` CTA, pinned Delete, Import/Export/AI hidden without their permission flags
- Logs: as an Admin, the Settings Logs switch opens the Logs console, and Record changes lists a change made a moment ago
- Auth: sign-in and sign-out, the omniaagent.com dashboard round trip (`/welcome?postSignInRedirect=…`) and dashboard Sign out (`/welcome?omniaSignOut=1&postSignInRedirect=…`)

## Subagent Instructions

When delegating conflict resolution to subagents, you MUST provide:

1. The specific file list for that batch
2. For each file: what our customization does (from CUSTOMIZATIONS.md)
3. For each file: what patterns `check-customizations.sh` expects (grep the script, include the output)
4. The pre-merge version of each file from `origin/main` (so the agent can see exactly what we had)
5. The global rules: the registration points, `OMNIA-CUSTOM` markers, no permission bypass on user paths, the upgrade-command rules, and the verification commands (`tsgo` in the package, `lint:diff-with-main`, the specs, the check script)
6. The ownership list: an agent edits only the files its domain owns and sends any other hunk to the owner as a written request (file, exact hunk, reason)
7. This explicit instruction:

> **Merge philosophy: You are not preserving old code — you are evolving it.**
>
> Read both sides of every conflict deeply. Understand what upstream improved, fixed, or refactored. Your merged result must:
> - Use upstream's new structure, patterns, APIs, and imports as the foundation
> - Incorporate upstream's bug fixes and improvements
> - Layer our custom behavior on top, adapted to fit the new code naturally
> - Pass the check-customization patterns listed above
> - Read like it was written natively for this version of the codebase
>
> Do NOT blindly take either side. Do NOT paste old code into new structures without adapting it. If upstream renamed a function our code calls, use the new name. If upstream added a parameter our code should pass, pass it. If upstream refactored the architecture, rewrite our customization for the new architecture.

## PR Merge Strategy (CRITICAL)

**Always use "Create a merge commit"** — never "Squash and merge" — when merging the upstream PR to main.

Squash merge creates a single commit that GitHub can't trace back to upstream's commit SHAs. This breaks the fork divergence counter (shows 400+ behind when we're actually caught up). A merge commit preserves both parents, letting GitHub track what's already incorporated.

If a squash merge was accidentally used, fix with a grafted merge:
```bash
# Find the upstream commit that was merged (check the merge branch)
UPSTREAM_COMMIT=$(git log merge/upstream-YYYY-MM-DD --merges -1 --format="%P" | awk '{print $2}')
# Create a no-op merge that records the upstream parent
git merge $UPSTREAM_COMMIT --strategy=ours --no-edit -m "Record upstream merge point"
git push origin main
```

Merging to main deploys to prod. When the upgrade crosses many versions, pause the workflow first (`gh workflow disable deploy-eks.yaml -R Omnia-Insurance/crm`) and follow the cutover runbook. Otherwise the push runs the whole upgrade in Helm's pre-upgrade job while the old pods still serve traffic.

## Docker Build Target (CRITICAL)

Our CI workflow (`.github/workflows/deploy-eks.yaml`) MUST specify `target: twenty` in the Docker build step. The Dockerfile has multiple stages — without an explicit target, Docker builds the LAST stage which may be `twenty-app-dev` (all-in-one with PostgreSQL/Redis/s6-overlay). Our Helm deployment needs the `twenty` stage (server-only, uses external RDS/Redis).

If upstream adds new stages after `twenty` in the Dockerfile, the build will silently produce the wrong image. The pod logs will show `Initializing PostgreSQL data directory... su-exec: setgroups: Operation not permitted`.

## Known Customization Areas (Quick Reference)

These are the areas most frequently affected by upstream merges. When upstream touches any of these systems, extra care is needed:

| Area | What We Changed | Watch For |
|------|----------------|-----------|
| Command menu | Upstream's metadata-driven items. Omnia keeps data, not code: the 2.58 command `omnia-consolidate-standard-delete-command-menu-items` replaced the legacy split delete/restore/destroy items, pins `deleteRecords` and sets the `Create {objectLabelSingular}` short label through workspace overrides. `ExportRecordsCommand.tsx` passes the relation sub-field columns. | "Reset to default" in Edit command menu removes the overrides. Export, import and AI items must keep their `permissionFlags.*` availability expressions; `workspace:omnia-verify-permissions` fails without them. |
| RLS/permissions | Upstream's rule-based RLS: per role and object `rowLevelPermissionRule` grants, "Agent is Me" as a relation hop behind `IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED`. Omnia patches the hop gate (`engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util.ts` reads the hop flag only) and the parent-group guard (`engine/metadata-modules/row-level-permission-predicate/utils/validate-row-level-permission-rule-ownership.util.ts`), and adds the edit window and sidebar visibility (`modules/role-object-settings/`). No `scope`, no Omnia filter builder or cache. | Upstream resets the hop util to require `IS_ACCESS_GROUPS_ENABLED`; every agent policy write then fails closed. Re-apply the OMNIA-CUSTOM line and run `omnia-read-all-write-own.spec.ts`. Writers set every grant explicitly and turn off the object-level grants a rule restricts, because an object-level grant beats any rule. Never re-add `scope`. |
| INSERT permissions | Narrowed create exemption in `engine/permissions/internal/role/utils/validate-operation-is-permitted-or-throw.util.ts`: on create, RLS predicate fields (the hop relation included), many-to-one agentProfile relations and `submittedDate` skip the uneditable-field check | Upstream edits to `case 'create'` conflict with the OMNIA-CUSTOM hunk. Keep upstream's read check, and never widen the list without product sign-off. |
| Export/Import | Upstream record export (`engine/core-modules/record-export/`) plus the relation sub-field layer: `relationSubFields` input, `<Rel> / <Sub>` headers, requester-scoped reads, `useRecordIndexExportParameters.ts`. Omnia import job (`engine/core-modules/import-job/`): runs as the requester, `ImportJobRecoveryEffect`, 30-day retention cron for staged rows. | Never port a custom export worker back, and never run export or import without the requester's permissions. |
| Search | Upstream permission-checked search (RLS, field permissions, shares) plus five OMNIA-CUSTOM hunks in `search.service.ts`: `normalizeSearchInput` (phone-shaped input only), `shouldRunIlikeFallback` (CJK or digit fragments reach the substring fallback), `strip()` on `searchVector` in that fallback (digits match words, not tsvector positions), a per-object `PermissionsException` skip, and no `timelineActivity` results (their labels are other records' names). Search surface = upstream `isSearchable` rows plus the one-time 2.58 backfill, which skips fields any role cannot read. | Never reintroduce the search permission bypass (`shouldBypassPermissionChecks`), a catch-all catch, or a `canAccessSomeRecords` pre-filter. The Brokerage manifest must declare `isSearchable` on policy number and application id before any app sync, and never on a field some role cannot read. Run `omnia-search-row-level-permissions.integration-spec.ts`. |
| Timeline activities | Record-level checks on the records an activity describes: Omnia utils `find-timeline-activities-describing-unreadable-records.util.ts` and `filter-timeline-activity-events-describing-readable-records.util.ts`, plus hunks in `add-timeline-activity-object-columns-to-select.util.ts`, `assert-timeline-activity-properties-are-queryable-or-throw.util.ts` and the timeline create/update pre-query hooks (`modules/timeline/`) | Upstream checks object readability only. A rewrite of the timeline readers or hooks drops the record check, and agents would see diffs of records they cannot read. |
| Record table | FieldContext memoization, non-reactive scroll handlers, sub-field column override in RecordTableCellFieldContextGeneric | Upstream changes cell rendering. The sub-field override block has been wiped twice. |
| Query builders | None: `engine/twenty-orm/` is upstream verbatim (v2.58 deleted the v1 builders) | Never re-add `isUpsert`, an async RLS builder, a request RLS cache or raw-SQL connect fallbacks; imports go through the server import job and upstream `RelationNestedQueries`. |
| Navigation | Upstream Home/AI/Settings mode switcher (AI gated on `PermissionFlagType.AI`). Labeled Search row at the top of Home (`MainNavigationDrawerContent.tsx`); no search button in `navigation/components/NavigationDrawerHeader.tsx`; workspace dropdown (`MultiWorkspaceDropdownDefaultComponents.tsx`) with inline Log out (single-workspace) and no Invite user. Users without LAYOUTS get `OmniaMemberWorkspaceNavigationMenuItems` through one hunk in `WorkspaceSectionDispatcher.tsx` (list from `useMemberSidebarObjectMetadataItems`: readable and `showInSidebar === true`, nothing until `objectSidebarVisibility` loads). "Opened" de-dup in `NavigationDrawerOpenedSection.tsx` (OBJECT/VIEW/RECORD items via `getObjectMetadataForNavigationMenuItem`, the member list for members). | Upstream restructures `navigation-menu-item/display/**` and the drawer often. `WorkspaceSectionDispatcher.tsx` merges cleanly while dropping the member hunk: check it by hand. Watch for `NavigationDrawerOtherSection` or a header search button coming back, and for the current-user writers (`useLoadCurrentUser.ts`, `UserMetadataProviderInitialEffect.tsx`) dropping `objectSidebarVisibility`, which empties the member sidebar. |
| AI features | AI gating is upstream's (`PermissionFlagType.AI`; there is no `ASK_AI`). Omnia adds the `bedrock` entry in `ai-models/ai-providers.json`, the HIPAA telemetry ceiling in `build-ai-telemetry.util.ts` (never record inputs or outputs, evaluation spans included), Sentry `vercelAIIntegration({ recordInputs: false, recordOutputs: false })` in `instrument.ts`, and Bedrock pins for `AI_MODELS_DEFAULT_*` in `omnia-values.yaml`. | Upstream catalog syncs can drop the bedrock entry, and new AI call sites must go through `buildAiTelemetry` (`ai-sdk-call-sites.spec.ts` catches them). `core."keyValuePair"` rows beat the env pins. |
| Record creation | Upstream Record Creation Form (`side-panel/pages/record-creation-form/`) plus Omnia hunks: Agent prefill from the member's AgentProfile, soft `requiredCondition` rules (block Create, also while a linked record misses required fields), the Carrier → Product bridge (`RecordFormFieldInputs.tsx`), and the unsaved-input unload prompt (`RecordCreationFormProvider.tsx`) | Upstream reworks the creation flow often: re-check the prefill and the Create block. |
| Default home page | Users without LAYOUTS land on the first `MEMBER_LANDING_OBJECT_ORDER` object (person, policy, note, task) in their member sidebar list, else the list's first object, else Settings > Profile; upstream's `AppPath.Index` sentinel until the list loads; mobile and LAYOUTS users keep upstream | Upstream may change `useDefaultHomePagePath`. Keep the member branch after the loading guard. Members must never reach the nav-tree or alphabetical fallback, and never get `AppPath.Home` on desktop (`/home` redirects back to the landing). |
| Workspace schema | Slow-path observer timing | Upstream refactors schema building |
| App module | SPA fallback exclusions and immutable `/assets/` headers in `engine/core-modules/frontend/frontend.module.ts` (upstream's FrontendModule replaced ServeStaticModule); `WorkspaceAppProviders.tsx` (replaced `AppRouterProviders.tsx` in v2.58) mounts ImportJobRecoveryEffect/BackgroundJobIndicator next to `<CommandRunner />` and LegacyTokenPairCookieCleanupEffect/OmniaSiblingSessionRefreshEffect after `<SignOutOnOtherTabSignOutEffect />`; export uses upstream record export (no export effect); `App.tsx` lazy-loads the dev-only Agentation toolbar | Upstream changes the app root and provider tree |
| Settings routes | Ingestion pipeline pages: 3 routes in `SettingsRoutes.tsx` inside the `API_KEYS_AND_WEBHOOKS` route guard, 3 `SettingsPath` entries in twenty-shared, and the "Ingestion pipelines" item after Developers in `useSettingsNavigationItems.tsx` | Upstream rewrites SettingsRoutes.tsx frequently. A clean merge of the nav item can bring back the old `permissionMap` name (v2.58 uses `permissionFlagMap`). Keep the routes, the nav item and the server resolvers on the same permission. |
| Sibling session cookie | `modules/omnia-sibling-session/` writes the httpOnly `tokenPair` cookie on the parent domain for the omniaagent.com dashboard (access token only, at most 30 minutes), with hunks in `user-session-cookie.service.ts`, `user-session.service.ts` and `impersonation.service.ts`. Front: `LegacyTokenPairCookieCleanupEffect`, `OmniaSiblingSessionRefreshEffect`, and the `omniaSignOut` sign-out (`consumeTrustedSiblingSignOutRequest`). | Upstream session and cookie refactors. CRM auth never reads this cookie, and it stays access-only and short-lived whatever `ACCESS_TOKEN_EXPIRES_IN` says. |
| Logic-function credentials | The LOCAL driver passes EKS Pod Identity container credentials only to allowlisted app registrations: `drivers/local/utils/build-aws-container-credentials-env.util.ts`, `local.driver.ts`, `logic-function-driver.factory.ts`, env-only `LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS` | Never pass the pod env wholesale or loosen upstream's `--permission` sandbox. Pod IMDS access stays blocked. |
| Registration and upgrade commands | `OmniaModulesModule`, `OmniaCommandModule`, `OmniaUpgradeVersionCommandModule`, plus the Omnia queue and cron entries (Strategy D special cases) | Upstream reorganizes these files; re-add the one-line imports and entries. |
| Enterprise unlock | `EnterprisePlanService.isCachedValidityPayloadValid()` returns true (`enterprise-plan.service.ts`); `ENTERPRISE_KEY` unset; billing off | Upstream adds gates that read other methods: check every new enterprise gate. Never run `billing:sync-entitlements`. |
| Reconciliation lockdown | The reconciliation objects are Admin-only: the lockdown service and `reconciliation-object-lockdown.listener.ts` in `modules/reconciliation/` (new roles), plus the source-file restriction in `apply-attachments-visibility-restrictions.service.ts` | Roles from the settings flow, app roles and upstream-created grant roles must all be locked; `workspace:omnia-verify-permissions` checks them. |
| Generated types (`generated-metadata/graphql.ts`, `generated/`, `generated-admin/`) | The fields in "Our Custom Fields". Each appears 3-10+ times across TS types, fragment types, inline query types, and DocumentNode ASTs. | NEVER take upstream's version as-is. Use Strategy E: take upstream, then regenerate from the merged server. Verify with grep counts. |
| Address fields | `AddressFieldInput.tsx` normalizes `addressLat`/`addressLng` (string or number) with `normalizeAddressCoordinate` | Upstream may tighten coordinate types |

## Lessons Learned (2026-04-07/08 merge)

1. **Never squash-merge the upstream PR.** Use "Create a merge commit" so GitHub tracks fork divergence correctly.

2. **Check the Docker build target.** Upstream adds Dockerfile stages — without `target: twenty`, the CI builds the wrong image.

3. **Generated types are a silent killer.** `generated-metadata/graphql.ts` from upstream's codegen is missing our custom columns. Sub-field columns, edit windows, and sidebar permissions all silently fail at runtime.

4. **Enum values differ between `twenty-shared` and generated types.** `PermissionFlagType.ASK_AI` doesn't exist — the correct flag is `PermissionFlagType.AI`. Always verify enum values exist at runtime.

5. **Permission system grants defaults to system objects.** `workspaceMember` gets `canReadObjectRecords: true` for all roles. Filter by `isSystem` to exclude from member-scoped features.

6. **The create exemption is narrow on purpose.** Creators set the agent (directly or through the RLS hop) and `submittedDate` that their role cannot edit afterwards, so only those skip the uneditable-field check on create. The pre-merge skip-all let the API set LTV on create.

7. **Export is upstream's since v2.58.** Upstream record export brings RLS, the `EXPORT_CSV` check and streaming; Omnia adds only the relation sub-field columns. Never port a custom export worker back.

8. **RLS compiles synchronously upstream.** Since v2.58 the row-level filter compiles once per request over cached maps and the "Agent is Me" hop renders as SQL `EXISTS`; there is no Omnia RLS builder to keep async.

9. **Redis cache can hold stale permissions.** Run `cache:flush` after role changes or deploys. Never `FLUSHALL`: it also wipes the BullMQ queues and schedulers.

10. **Never mark a failed upgrade step completed by hand.** The cursor then skips it for good. Fix the cause and rerun `upgrade`; on a dev database with gaps in its history, restore a fresh prod copy instead.

11. **Migration job paths.** The `twenty` image's WORKDIR is `/app/packages/twenty-server`, and Kubernetes keeps it when `command` is overridden. Hoisted dependencies live in `/app/node_modules`, so reach them by absolute path; `node dist/command/command.js` works from WORKDIR. An image built without `target: twenty` (lesson 2) has no such WORKDIR.

## Lessons Learned (2026-11-14 merge, v2.58)

1. **Merge releases, not upstream/main.** This merge took `upstream/v2.58` at `twenty/v2.58.1` (`6a8447bc842`). Prod was still at 2.7 because the v2.19 merge never shipped, so the deploy jumped 51 versions and needed its own runbook.

2. **Run big merges in waves** (1g), with one owner per hot file and written cross-domain requests. Parallel agents editing the same file lose hunks.

3. **Node 26 has no corepack.** Use the yarn shim (1a) and upstream's toolchain files; "take ours" on `.yarnrc.yml` had silently dropped `enableScripts: false`.

4. **Stale `dist` folders lie.** Rebuild twenty-shared, twenty-ui and twenty-oxlint-rules from a clean `dist` before trusting any typecheck, lint or test failure in a dependent package (3b).

5. **Upstream moves UI kit paths.** twenty-ui's `src/navigation/` disappeared and its link components moved into twenty-front; Omnia's `AudioLink` followed them (Strategy D, UI kit moves).

6. **Dev databases with gaps in their upgrade history are useless for upgrade work.**
   - Databases that ran the June merge branch carry two Omnia 2.18 cursor rows (`2.18.0_BackfillCustomObjectSearchFieldsCommand_1799200002000` and `2.18.0_SetRecordingFieldDisplayAsAudioCommand_1810000006000`) whose commands moved to 2.58, so `upgrade` refuses with "Step … not found in upgrade sequence". Deleting those two rows is a dev-only fix.
   - The same databases also skipped upstream's two 2.9 slow commands and 38 steps between 1.22 and 2.18, so the upgrade still stops later. Replicate a fresh prod copy instead.

7. **`upgrade --dry-run` proves little.** It stops at the first instance step. Omnia's 2.58 translation and verify commands only run in a real upgrade on a fresh prod copy.

8. **Database config rows beat env pins.** Non-env-only variables in `core."keyValuePair"` override Helm values. 2.9 turned `AI_MODEL_PREFERENCES` into `AI_MODELS_DEFAULT_*` rows holding non-Bedrock models, which shadowed the Bedrock pins. Inventory these rows before every cross-version deploy.

9. **Clean merges hide regressions.** `WorkspaceSectionDispatcher.tsx` merged without conflict and lost the member sidebar hunk, Omnia orphan utils stopped compiling, and a check stayed green on a dead copy (3a). Review every silently merged Omnia file.

10. **The repo is public.** Keep the wording of security fixes neutral in commits and PRs until they ship, and never commit tokens: a committed MCP token had to be rotated.
