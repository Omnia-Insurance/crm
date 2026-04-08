# Upstream Merge Skill

Merge upstream `twentyhq/twenty` commits into the Omnia fork. The goal is **synthesis, not preservation** — our customizations must evolve with upstream, adopting their improvements while maintaining our unique behavior.

## Core Philosophy

This is NOT "take ours vs take theirs." Every customized file requires deep comparison:

- **Upstream improved something we customized?** Adopt their improvement AND keep our custom behavior on top.
- **Upstream added a new API, helper, or pattern?** Refactor our custom code to use it.
- **Upstream fixed a bug in code we forked?** The fix must appear in our version too.
- **Upstream refactored the architecture around our customization?** Rewrite our customization to fit the new architecture — don't force old patterns into new code.
- **Upstream removed something our code depends on?** Find what replaced it and migrate our code.

The merged result should look like it was written by someone who had access to the latest upstream AND understood our business needs — not like two codebases stitched together.

## Phase 1: Preparation

### 1a. Run the customization check BEFORE starting

```bash
bash scripts/check-customizations.sh 2>&1 | tee /tmp/pre-merge-customizations.txt
```

Save this output. It is the **authoritative list** of every pattern that must survive. The script checks specific code patterns inside files — not just file existence.

### 1b. Read CUSTOMIZATIONS.md completely

Read ALL sections, not just the "Critical Files" table. Sections include:
- Critical Files (repeatedly wiped by upstream)
- Custom Server Modules (100% Omnia code)
- Custom Frontend (draft record creation)
- Relation Sub-Field Table Columns
- Export/Import customizations
- And more as they're added

### 1c. Build a customization map

For every file that `check-customizations.sh` validates, run:
```bash
grep -n "FILENAME_STEM" scripts/check-customizations.sh
```
This tells you exactly what patterns the script expects to find. These patterns ARE the customization — if they're gone, the customization is wiped.

### 1d. Fetch and merge

```bash
git fetch upstream main
git checkout origin/main -b merge/upstream-YYYY-MM-DD
git merge upstream/main --no-edit
```

## Phase 2: Conflict Resolution

### Classification — for EVERY conflicted file:

1. **Check the customization map** (from 1c). Is this file validated by the check script?
2. **Check CUSTOMIZATIONS.md**. Is this file listed in any section?
3. **Grep for `OMNIA-CUSTOM`** markers in the file.

This determines the resolution strategy:

### Strategy A: Auto-generated files (take upstream, regenerate later)

- `packages/twenty-front/src/locales/*.po` and `src/locales/generated/*.ts`
- `packages/twenty-front/src/generated-metadata/graphql.ts` — **CRITICAL: must be regenerated against OUR server after merge (step 3c), not upstream's. Our schema has custom columns like `subFieldName` on ViewField.**

```bash
git checkout --theirs <files> && git add <files>
```

### Strategy B: Files we own exclusively (take ours)

- `.claude/settings.json`
- `.github/workflows/ci-*.yaml` (we deleted upstream CI)
- `.yarn/releases/*`, `.yarnrc.yml`

```bash
git checkout --ours <files> && git add <files>
```

### Strategy C: Upstream-only files (take upstream)

Files where ALL of these are true:
- NOT in `CUSTOMIZATIONS.md` (any section)
- NOT validated by `check-customizations.sh`
- NO `OMNIA-CUSTOM` markers
- NOT imported/used by any customized file

```bash
git checkout --theirs <files> && git add <files>
```

**When in doubt, do NOT put a file in this category.** It's better to manually merge a file that didn't need it than to blindly take upstream on one that did.

### Strategy D: Deep merge (THE MOST IMPORTANT CATEGORY)

Every file that doesn't fit A/B/C gets a deep merge. This is the majority of real work.

For each file:

1. **Read the full conflict** — both sides, including context above and below markers.

2. **Understand upstream's changes:**
   - What did they add? (new features, parameters, imports)
   - What did they refactor? (renames, restructures, new patterns)
   - What did they fix? (bug fixes, edge cases, security)
   - What did they remove? (deprecated code, old patterns)

3. **Understand our customization:**
   - What behavior does it add? (from CUSTOMIZATIONS.md description)
   - What patterns does the check script look for? (from grep in 1c)
   - WHY does the customization exist? (the "Why" column in CUSTOMIZATIONS.md)

4. **Synthesize:**
   - Start with upstream's new structure as the foundation
   - Layer our custom behavior on top, adapted to the new structure
   - If upstream introduced a better way to do something we were doing manually, use their way
   - If upstream added new parameters, helpers, or APIs, use them in our custom code
   - If upstream renamed/moved imports, update our code to use the new names
   - If upstream changed a function signature, adapt our calls
   - The result should read like native code — not like a patch bolted on

5. **Verify the check script patterns will pass** on your merged result.

## Phase 3: Post-Merge Validation (ALL MANDATORY)

### 3a. Customization check

```bash
bash scripts/check-customizations.sh 2>&1 | tee /tmp/post-merge-customizations.txt
diff /tmp/pre-merge-customizations.txt /tmp/post-merge-customizations.txt
```

**Zero regressions allowed** (except features living on other branches). Any new failure = a customization that was wiped.

### 3b. Typechecks

```bash
npx nx typecheck twenty-front
npx nx typecheck twenty-server
```

Type errors after merge usually come from:
- Our custom code using APIs that upstream renamed/moved — find the new location
- New constructor args on classes we extend — add the new args
- Enum values we added that upstream restructured — re-add to new enum
- Our custom types extending upstream types that changed shape — update the extension

### 3c. Regenerate auto-generated files (CRITICAL)

```bash
npx nx run twenty-front:lingui:extract
npx nx run twenty-front:lingui:compile
npx nx run twenty-front:graphql:generate --configuration=metadata
```

**The metadata codegen MUST run against our local server** (which has custom schema columns like `subFieldName` on ViewField, `editWindowMinutes` on Role/ObjectPermission, etc.). If you take upstream's generated types, those columns will be missing from the TypeScript types, causing silent runtime failures (sub-field columns won't render, edit windows won't work) even though the GQL fragments request them.

### 3d. Database migrations

```bash
npx nx run twenty-server:database:migrate
APP_VERSION=<version> npx nx run twenty-server:command -- upgrade
```

Check `packages/twenty-server/src/engine/constants/upgrade-command-supported-versions.constant.ts` for the version. If `APP_VERSION` is not in `.env`, set it there permanently.

**Common upgrade issues and fixes:**

1. **`fieldPermission.universalIdentifier` contains null values** — backfill from parent role:
   ```sql
   UPDATE core."fieldPermission" fp
   SET "applicationId" = r."applicationId",
       "universalIdentifier" = COALESCE(fp."universalIdentifier", gen_random_uuid())
   FROM core."role" r WHERE fp."roleId" = r.id AND fp."applicationId" IS NULL;
   ```

2. **`BackfillPageLayoutsAndFieldsWidgetViewFieldsCommand` fails** — this is non-critical (dashboard widgets for objects we don't have). Mark as completed:
   ```sql
   UPDATE core."upgradeMigration" SET status = 'completed'
   WHERE "name" = 'BackfillPageLayoutsAndFieldsWidgetViewFieldsCommand'
   AND "workspaceId" = '<workspace_id>' AND status = 'failed'
   ORDER BY attempt DESC LIMIT 1;
   ```
   Then re-run the upgrade command.

3. **Split delete/restore/destroy menu items** — our `standard-command-menu-item.constant.ts` splits these into single/multiple variants. Upstream 1.21 upgrade commands reference the consolidated names. Update them to use our split key names (`deleteSingleRecord`, `deleteMultipleRecords`, etc.).

4. **Missing workspace columns after upgrade** — columns like `avatarFile` on `person` are created by workspace schema sync, which runs on server startup AFTER a successful upgrade. Restart the server after the upgrade completes.

### 3e. Smoke test

Start the app and verify:

**As Admin:**
- Sidebar: Settings at top, AI tabs (with spacing), no "Other" section, no Documentation
- "Opened" section only shows for objects NOT in workspace sidebar
- Sub-field columns: headers show "Agent / NPN", cells show correct values
- Global search finds Leads/Policies by name
- Command menu: "Create Policy" blue/primary, "Go to" labels correct, Delete pinned
- Export from filtered view exports only filtered records (not all)
- Policy → Product picker filters by selected Carrier
- Settings → Ingestion Pipelines page loads
- Draft record creation works

**As Member:**
- Login lands on Leads (first sidebar item), no 404 or settings flash
- AI tabs hidden (Home/Chat/New chat not visible)
- No blank screen or permission errors
- Command menu: no Import/Export/AI actions, Go To only shows sidebar objects
- Search only returns sidebar-visible non-system objects (no workspaceMember)

**As Investor (or other restricted role):**
- Login lands on first sidebar-visible object (Policies)
- Only permitted objects in sidebar, search, and command menu

### 3f. Production deploy

1. Run `database:migrate` before starting new server
2. Run `upgrade` command with correct `APP_VERSION`
3. If page layout backfill fails, mark as completed in `upgradeMigration` table
4. Verify `avatarFile` column exists on `person` table after upgrade
5. Restart server to trigger workspace schema sync
6. Flush Redis if permission caches seem stale
7. Re-run lingui extract/compile if locale strings changed

## Subagent Instructions

When delegating conflict resolution to subagents, you MUST provide:

1. The specific file list for that batch
2. For each file: what our customization does (from CUSTOMIZATIONS.md)
3. For each file: what patterns `check-customizations.sh` expects (grep the script, include the output)
4. The pre-merge version of each file from `origin/main` (so the agent can see exactly what we had)
5. This explicit instruction:

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

## Known Customization Areas (Quick Reference)

These are the areas most frequently affected by upstream merges. When upstream touches any of these systems, extra care is needed:

| Area | What We Changed | Watch For |
|------|----------------|-----------|
| Command menu | CTA styling, object-aware labels, Go To for custom objects, permission-gated actions (import/export/AI), pinned Delete, SIDEBAR_ORDER sorting | Upstream frequently restructures the item/config system. They moved from static configs to server-driven engine commands in 1.21. |
| RLS/permissions | Action-scoped predicates (READ/WRITE/ALL), edit window, showInSidebar, OmniaRoleExtensions, async filter building with DB queries | Upstream changes permission types, filter builders. Our `buildRowLevelPermissionRecordFilter` is async (theirs is sync) because Me predicates resolve through linked records. |
| Export/Import | Server-side jobs, sub-field column configs, ExportJobRecoveryEffect, view-filter-based export | Upstream moved to context-store-based export. Our export must use `findManyRecordsParams.filter` for view exports, not `computeContextStoreFilters`. |
| Search | Custom-object fallback (all-field ILIKE), search vector construction, permission-bypassed queries, member-scoped search (sidebar-visible non-system objects only) | Upstream may rewrite search service. Watch for new field references (like `avatarFile`) that don't exist in our schema yet. Search repository uses `shouldBypassPermissionChecks: true` because it reads internal fields. |
| Record table | FieldContext memoization, non-reactive scroll handlers, sub-field column override in RecordTableCellFieldContextGeneric | Upstream changes cell rendering. The sub-field override block (injects subFieldName into fieldDefinition.metadata) is critical and has been wiped twice. |
| Query builders | isUpsert flag passthrough in insert/update builders, async RLS in select/update builders | Upstream refactors ORM layer. Our select/update builders must be async because `applyRowLevelPermissionPredicates` is async. |
| Navigation | Sidebar: Settings at top, no Documentation/Other section, member fixed section, default home page from sidebar nav items, "Opened" section dedup via viewId→objectMetadataId resolution | Upstream adds new nav components. Watch for `NavigationDrawerOtherSection` being re-added, new tab rows (AI chat), and sidebar permission filtering. |
| AI features | AI tabs/chat hidden for roles without `PermissionFlagType.AI` (NOT `ASK_AI` — that's an EngineComponentKey), metadata load catches AI permission errors | Upstream gates by feature flag only, not role permission. We add role-level checks. |
| Draft creation | openDraftInSidePanel at all creation entry points | Upstream adds new entry points or refactors existing ones. `CreateRelatedRecordCommand` was deleted in 1.21 engine-command refactor — needs re-implementation. |
| Default home page | Non-admin roles wait for `sidebarVisibleObjectMetadataItems` (filtered by showInSidebar), returns `undefined` while loading to prevent premature redirect | Upstream may change `useDefaultHomePagePath` or `usePageChangeEffectNavigateLocation`. |
| Workspace schema | Slow-path observer timing instrumentation | Upstream refactors schema building |
| App module | SPA fallback exclusions, cache headers, ExportJobRecoveryEffect/ImportJobRecoveryEffect/BackgroundJobIndicator mounts | Upstream changes middleware, routing, app root |
| Settings routes | Ingestion Pipeline pages (lazy imports + routes) | Upstream rewrites SettingsRoutes.tsx frequently |
| Generated types | `subFieldName` on ViewField, `editWindowMinutes` on Role/ObjectPermission, `showInSidebar` on ObjectPermission | Upstream codegen overwrites with their schema. MUST regenerate against our server. |

## Lessons Learned (2026-04-07 merge)

1. **Never trust "take upstream" without checking the script.** 27 customizations were wiped because files were categorized as safe-to-take-upstream without cross-referencing `check-customizations.sh`.

2. **Generated types are a silent killer.** `generated-metadata/graphql.ts` from upstream's codegen is missing our custom columns. Sub-field columns, edit windows, and sidebar permissions all silently fail at runtime with no TypeScript errors.

3. **Enum values differ between `twenty-shared` and generated types.** `PermissionFlagType.ASK_AI` doesn't exist — the correct flag is `PermissionFlagType.AI`. `ASK_AI` is an `EngineComponentKey`. Always verify enum values exist at runtime, not just in the type definition.

4. **Permission system grants defaults to system objects.** `workspaceMember` gets `canReadObjectRecords: true` and `showInSidebar: true` by default for all roles, even when `canReadAllObjectRecords` is false. Filter by `isSystem` to exclude these from member-scoped features.

5. **Workspace schema sync doesn't run in dev mode on startup.** It runs as part of the upgrade command's workspace version bump. If the upgrade fails, columns like `avatarFile` won't be created until the upgrade completes successfully.

6. **Export architecture changed.** Upstream moved from view-filter-based export to context-store-based export. Use `findManyRecordsParams.filter` for view exports (which has the view's active filters), not `computeContextStoreFilters` (which may return empty selection filters).

7. **Async vs sync RLS.** Upstream made `buildRowLevelPermissionRecordFilter` sync and `applyRowLevelPermissionPredicates` sync. Ours are async because Me predicates resolve through linked records (policy.agent → agentProfile.workspaceMember) via DB queries. Callers (`validatePermissions` in select/update builders) must be async with await.

8. **Redis cache can hold stale permissions.** After changing role configurations, flush Redis (`redis-cli FLUSHALL`) and restart the server.
