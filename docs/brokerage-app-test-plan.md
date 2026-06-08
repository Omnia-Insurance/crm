# Brokerage App Test Plan

This plan defines the validation required before the Brokerage app can be
considered production ready for Omnia. It covers both supported install modes:

- Fresh workspace install, where Brokerage creates an empty brokerage model.
- Existing Omnia adoption, where Brokerage must preserve live workspace data and
  take ownership of existing Omnia-shaped metadata without recreating objects or
  tables.

The existing Omnia adoption path is the highest-risk area. A fresh install can
pass while the product is still not production ready for Omnia.

## Readiness Gates

Production is blocked until every P0 test passes on a production-like database
snapshot and every P1 test has either passed or has an explicitly accepted
deviation.

P0 blockers:

- Any live-data row count changes outside explicitly expected test record
  creation.
- Any object ID, field ID, relation ID, table name, record ID, task/note/file
  target, timeline target, or application ID change that is not part of the
  reviewed adoption plan.
- Any direct uninstall/reinstall path proposed for an adopted or live Omnia
  workspace.
- App sync that attempts to create duplicate Brokerage objects in an existing
  Omnia workspace because adoption was skipped or could not run first.
- Required Lead or Policy fields/defaults that differ from production parity.
- Lead, Policy, Call, Agent, Carrier, Product, Lead Source, task, note, file,
  export, or Compliance relation flows broken after adoption.
- Failed rollback restore, cache clear, app sync, or post-install idempotence.

P1 blockers:

- Sidebar, views, field order, record layouts, or relation cards materially
  differ from production without sign-off.
- Agent or Manager role behavior differs from the intended permission model.
- Required-field UX allows closing or saving incomplete records where it should
  block.
- App upgrade requires manual metadata edits that are not documented.

P2 follow-ups:

- Cosmetic UI differences.
- Performance improvements that do not affect data integrity or core workflows.
- Additional automation around already-passing manual checks.
- Legacy policy edit-window behavior, if the business decides to keep that
  platform customization outside Brokerage readiness.

## Test Environments

Use four environments. Do not reuse one environment for every scenario.

1. Local fresh workspace

   - Empty or newly created workspace.
   - Used to validate first install and create-flow behavior.
   - Uninstall/reinstall testing is allowed here only because the data is
     disposable.

2. Local prod-like Omnia snapshot

   - Database restored from a recent production or staging backup.
   - Used for dry-run adoption, apply adoption on a copy, upgrade, rollback, and
     parity checks.
   - External ingestion jobs should be disabled unless a test explicitly needs
     them.

3. Staging Omnia

   - Production-like infrastructure and user roles.
   - Used for final adoption rehearsal and UI workflow validation.
   - Must start from a backup that can be restored.

4. Production
   - Dry-run and read-only parity checks only until all prior gates pass.
   - Apply only after the launch checklist is approved.

## Common Setup

Run from the repo root unless a command says otherwise.

```bash
git status --short --branch
npx nx start twenty-front
NX_DAEMON=false npx nx run twenty-server:start --excludeTaskDependencies
curl -s -o /dev/null -w 'front:%{http_code}\n' http://localhost:3001
curl -s -o /dev/null -w 'server:%{http_code}\n' http://localhost:3000/healthz
```

Set the workspace values used by SQL checks:

```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/default'
export WORKSPACE_ID='<workspace-id>'
export BROKERAGE_APP_UNIVERSAL_IDENTIFIER='ddc5e4cf-d4d7-4fa6-ae1d-d86e878661c9'
export WORKSPACE_SCHEMA="$(
  psql "$DATABASE_URL" -Atc \
    "select \"databaseSchema\" from core.workspace where id = '$WORKSPACE_ID'"
)"
```

Create a backup before every destructive or adoption apply test:

```bash
export BACKUP_PATH="/tmp/twenty-brokerage-test-$(date +%Y%m%d%H%M%S).dump"
pg_dump -Fc "$DATABASE_URL" -f "$BACKUP_PATH"
```

Clear restored-workspace caches after database restore or after intentionally
testing uninstall/reinstall:

```bash
redis-cli --scan --pattern "*$WORKSPACE_ID*" | xargs -r redis-cli del
```

Restart the backend after cache clearing:

```bash
pgrep -f 'nx run twenty-server:start|nest start --watch|packages/twenty-server/dist/main' |
  xargs -r kill
NX_DAEMON=false npx nx run twenty-server:start --excludeTaskDependencies
```

## Common Evidence Queries

Capture these before and after adoption, upgrade, rollback, and any destructive
test. Save outputs in the test report. Run SQL examples with
`psql "$DATABASE_URL" -v workspace_id="$WORKSPACE_ID" -P pager=off` so the
`:workspace_id` references resolve correctly.

### Application Ownership

```sql
select
  id,
  name,
  "universalIdentifier",
  "workspaceId",
  version,
  "sourcePath",
  "deletedAt"
from core.application
where "workspaceId" = :'workspace_id'
order by name;
```

### Brokerage Object Metadata

```sql
select
  om.id,
  om."nameSingular",
  om."namePlural",
  om."targetTableName",
  om."universalIdentifier",
  om."applicationId",
  app.name as app_name,
  app."universalIdentifier" as app_universal_identifier,
  om."isActive"
from core."objectMetadata" om
join core.application app on app.id = om."applicationId"
where om."workspaceId" = :'workspace_id'
  and om."nameSingular" in (
    'agentProfile',
    'call',
    'carrier',
    'carrierProduct',
    'familyMember',
    'leadSource',
    'person',
    'policy',
    'product',
    'productType'
  )
order by om."nameSingular";
```

Expected after adoption or app-owned install:

- `agentProfile`, `call`, `carrier`, `carrierProduct`, `familyMember`,
  `leadSource`, `policy`, `product`, and `productType` are owned by Brokerage.
- `person` remains owned by Twenty Standard, with Brokerage-owned Lead extension
  fields.
- There is exactly one object metadata row per listed `nameSingular`.

### Brokerage Row Counts

```sql
with tables(name) as (
  values
    ('_agentProfile'),
    ('_call'),
    ('_carrier'),
    ('_carrierProduct'),
    ('_familyMember'),
    ('_leadSource'),
    ('_policy'),
    ('_product'),
    ('_productType'),
    ('person')
)
select
  tables.name,
  (
    xpath(
      '/row/count/text()',
      query_to_xml(
        format(
          'select count(*) as count from %I.%I',
          w."databaseSchema",
          tables.name
        ),
        false,
        true,
        ''
      )
    )
  )[1]::text::bigint as row_count
from tables
cross join core.workspace w
where w.id = :'workspace_id'
order by tables.name;
```

Expected:

- Fresh install starts with zero rows in Brokerage-created custom object tables.
- Existing Omnia adoption and upgrade preserve pre-test counts exactly, unless a
  test case explicitly creates records and accounts for them.

### Required Fields And Defaults

```sql
select
  om."nameSingular",
  fm.name,
  fm."requiredCondition",
  fm."defaultValue"
from core."fieldMetadata" fm
join core."objectMetadata" om on om.id = fm."objectMetadataId"
where om."workspaceId" = :'workspace_id'
  and (
    (om."nameSingular" = 'person' and fm.name in (
      'name',
      'addressCustom',
      'emails',
      'phones',
      'dateOfBirth',
      'leadStatus'
    ))
    or
    (om."nameSingular" = 'policy' and fm.name in (
      'premium',
      'carrier',
      'lead',
      'effectiveDate',
      'agent',
      'product',
      'applicantCount',
      'policyNumber',
      'applicationId',
      'status'
    ))
  )
order by om."nameSingular", fm.name;
```

Expected:

- Lead `name`, `addressCustom`, `emails`, `phones`, and `dateOfBirth` are always
  required.
- Lead `leadStatus` defaults to `Assigned`.
- Policy `premium`, `carrier`, `lead`, `effectiveDate`, `agent`, `product`, and
  `applicantCount` are always required.
- Policy `applicationId` is required when `policyNumber` is empty.
- Policy `policyNumber` is required when `applicationId` is empty.
- Policy `status` defaults to `Submitted`.

## Test Cases

### T00 - Baseline Safety And Backup

Priority: P0

Purpose:

- Prove every test starts from a known state and has a restore point.

Steps:

1. Record branch, commit SHA, dirty status, Node version, database URL target,
   and workspace ID.
2. Capture application ownership, Brokerage object metadata, required-field
   metadata, and Brokerage row counts.
3. Create a compressed database backup.
4. Verify the backup exists and is non-empty.
5. Confirm frontend and backend are healthy.

Expected result:

- Backup path is recorded in the test report.
- All baseline SQL outputs are attached.
- No tests proceed without a backup for non-disposable data.

Fail conditions:

- Backup cannot be created.
- Workspace ID or schema cannot be resolved.
- Frontend/backend are not healthy.

### T01 - Fresh Workspace Install

Priority: P0

Purpose:

- Prove Brokerage is a drop-in app for a new workspace.

Steps:

1. Start from a brand-new workspace or a reset local database with no Omnia
   custom Brokerage data.
2. Authenticate the SDK CLI to the local server:

   ```bash
   yarn twenty remote add --as localhost --api-url http://localhost:3000 --api-key '<workspace-api-key>'
   ```

3. Sync Brokerage:

   ```bash
   cd packages/twenty-apps/internal/brokerage
   yarn twenty -r localhost dev --once --verbose
   ```

4. Run post-install twice:

   ```bash
   yarn twenty -r localhost exec --postInstall --payload '{}'
   yarn twenty -r localhost exec --postInstall --payload '{}'
   ```

5. Capture application ownership, object metadata, required-field metadata, and
   row counts.
6. Open the app at `http://localhost:3001`.

Expected result:

- Brokerage application exists exactly once for the workspace.
- Brokerage custom objects are app-owned and active.
- Standard `person` remains standard.
- Brokerage physical tables exist and are empty.
- Required fields and defaults match the expectations in this plan.
- The second post-install run is idempotent:
  - `requiredFields.updated` is `0`.
  - `requiredFields.skipped` is empty.
  - Existing locked default view sort skips are acceptable only if they match the
    known "view modification is not permitted" reason.
- Sidebar shows the expected Brokerage workspace entries:
  - Leads
  - Policies
  - Calls
  - Lead Sources
  - Agents
  - Carrier/Product setup entries
- There are no duplicate `All Leads`, `All Policies`, or `All Calls` app-owned
  default views.

Fail conditions:

- Sync creates duplicate object names.
- Post-install is not idempotent on the second run.
- Any required field/default is missing.
- Fresh install breaks standard objects such as `person`, `task`, or `note`.

### T02 - Fresh Workspace Record Creation

Priority: P0

Purpose:

- Prove a new Brokerage workspace can run the core operational flow.

Steps:

1. In the fresh workspace from T01, create supporting setup records:
   - Agent
   - Carrier
   - Product Type
   - Product
   - Carrier Product
   - Lead Source
2. Create a Lead with all required Lead fields.
3. Verify Lead Status defaults to `Assigned`.
4. Create a Policy with `policyNumber` filled and `applicationId` empty.
5. Create a Policy with `applicationId` filled and `policyNumber` empty.
6. Attempt to create a Policy with both `policyNumber` and `applicationId`
   empty.
7. Select a Carrier on a Policy and open the Product picker.
8. Verify the Product picker only shows Products offered through Carrier Product
   records for that Carrier.
9. Create a Call linked to Lead, Agent, and Lead Source.
10. Open each record page and verify relation cards render:

- Lead: Policies, Lead Source, Assigned Agent, Calls, Family Members
- Policy: Lead, Agent, Carrier, Product
- Call: Lead, Agent, Lead Source

Expected result:

- Lead can be created only when required fields are complete.
- Policy can be created when either Policy Number or Application ID is present.
- Policy creation is blocked when both identifiers are empty.
- Policy Status defaults to `Submitted`.
- Policy Product picker is filtered by the selected Carrier's Carrier Product
  offerings.
- Call creation succeeds and reverse relations are visible.
- Record page Home tabs show curated field order instead of dumping every field.

Fail conditions:

- Required field validation is bypassed.
- Defaults are missing on newly created records.
- Relation cards are missing or point to the wrong object.
- Any side panel gets stuck or cannot be closed after valid save.

### T03 - Disposable Uninstall/Reinstall Characterization

Priority: P0 documentation validation

Purpose:

- Confirm and document that uninstall/reinstall is destructive for app-owned
  Brokerage data and must not be used for live Omnia upgrades.

Allowed environment:

- Disposable fresh workspace or backed-up local copy only.

Steps:

1. Create a backup.
2. Create at least one record in each Brokerage-owned custom object table.
3. Capture application ownership, object metadata, and row counts.
4. Uninstall:

   ```bash
   cd packages/twenty-apps/internal/brokerage
   yarn twenty -r localhost uninstall --yes
   ```

5. Capture application ownership, object metadata, physical table existence,
   and row counts.
6. Reinstall/sync Brokerage and run post-install.
7. Capture metadata and row counts again.
8. Restore from backup.
9. Clear workspace Redis keys and restart the backend.
10. Re-sync Brokerage and run post-install twice.

Expected result:

- After uninstall, the Brokerage application row is removed.
- Brokerage-owned object metadata is removed.
- Brokerage-owned physical workspace tables are dropped.
- Standard `person` remains.
- After reinstall, Brokerage tables are recreated empty.
- After restore, original row counts and application ID return.
- After cache clear and backend restart, app sync succeeds.
- Second post-install after restore is idempotent.

Fail conditions:

- Documentation does not warn against uninstall/reinstall for live data.
- Restore cannot recover the pre-uninstall state.
- Stale app token/cache state prevents re-sync after restore.

### T04 - Existing Omnia Adoption Dry Run

Priority: P0

Purpose:

- Prove the current production rollout sequence can inspect an existing
  Omnia-shaped workspace without changing data.

Environment:

- Local or staging database restored from a production-like Omnia backup where
  Brokerage ownership has not yet been adopted.

Steps:

1. Disable worker jobs and external ingestion for the test workspace.
2. Create a database backup.
3. Capture baseline evidence queries.
4. Run the documented Brokerage adoption sequence in dry-run mode before any
   full app package sync.
5. Run:

   ```bash
   npx nx command twenty-server -- workspace:adopt-brokerage-app --workspace-id "$WORKSPACE_ID" --dry-run
   ```

6. Capture application ownership, object metadata, and row counts again.
7. Diff the before/after outputs.

Expected result:

- Dry-run prints a metadata-only plan.
- Dry-run does not change application ownership, object metadata, field metadata,
  navigation metadata, row counts, or workspace tables.
- Dry-run works even if the Brokerage app shell does not exist yet.
- The plan maps existing Omnia metadata to stable Brokerage universal
  identifiers.
- The plan does not include table drops, record deletes, object recreation, or
  relation recreation.

Fail conditions:

- Any metadata or row count changes during dry-run.
- Dry-run requires a normal app package sync before adoption can run.
- Dry-run cannot resolve expected objects, fields, or relations.
- Dry-run proposes destructive operations.

Note:

- If the current sequence cannot get to dry-run before app sync without
  duplicate object-name conflicts, that is a P0 rollout blocker. The adoption
  command or install sequence must be adjusted before production.

### T05 - Existing Omnia Adoption Apply On Copy

Priority: P0

Purpose:

- Prove adoption preserves live Omnia data while switching metadata ownership to
  Brokerage.

Environment:

- Disposable restored copy of a production-like Omnia database.

Steps:

1. Complete T04 successfully. Do not run full Brokerage app sync before the
   adoption apply on an existing Omnia-shaped workspace.
2. Capture baseline evidence queries plus any object/field/relation ID exports
   needed for comparison.
3. Apply adoption:

   ```bash
   npx nx command twenty-server -- workspace:adopt-brokerage-app --workspace-id "$WORKSPACE_ID"
   ```

4. Clear workspace Redis keys and restart backend if the command does not do so.
5. Run Brokerage app sync after adoption apply:

   ```bash
   cd packages/twenty-apps/internal/brokerage
   yarn twenty -r localhost dev --once --verbose
   ```

6. Run post-install twice.
7. Capture evidence queries again.
8. Verify application access token points at the adopted Brokerage application
   ID, not a temporary reinstall ID.

Expected result:

- Existing Brokerage-shaped custom objects become Brokerage-owned.
- If missing, an empty Brokerage application shell is created and reused by the
  later app sync.
- Existing object IDs, field IDs, relation IDs, target table names, and record
  IDs are unchanged.
- Existing row counts are unchanged.
- Existing notes, tasks, files, timeline activities, views, and page layouts
  remain attached.
- Provider-specific fields remain workspace-custom until their owning app is
  ready.
- App sync updates the adopted Brokerage app and attaches registration/package
  metadata instead of creating duplicate objects.
- First post-install may update required metadata; second post-install is
  idempotent.

Fail conditions:

- Any unexpected ID changes.
- Any row count changes.
- Any physical table drops/recreates.
- Duplicate object names or views appear.
- App token points at a stale or temporary application ID.

### T06 - App Upgrade After Adoption

Priority: P0

Purpose:

- Prove later Brokerage package changes can be shipped without uninstalling or
  damaging an adopted workspace.

Environment:

- Adopted copy from T05.

Steps:

1. Capture baseline evidence queries.
2. Make or use a harmless manifest change in the test branch, such as a view or
   layout-only change.
3. Run Brokerage sync.
4. Run post-install twice.
5. Capture evidence queries.
6. Open the app and verify the changed metadata appears.

Expected result:

- Sync completes without duplicate-object creation.
- Row counts are unchanged.
- Object IDs, field IDs, relation IDs, target table names, and application ID
  are unchanged.
- Intended metadata changes appear.
- Second post-install is idempotent.
- No uninstall/reinstall is needed.

Fail conditions:

- Sync requires uninstall.
- Sync creates duplicate metadata.
- App upgrade resets required conditions/defaults incorrectly.
- App upgrade changes live data rows.

### T07 - Production Metadata Parity

Priority: P0

Purpose:

- Catch drift between local Brokerage metadata and production Omnia behavior.

Steps:

1. Export normalized metadata from production in read-only mode.
2. Export normalized metadata from the adopted test workspace.
3. Compare these categories:
   - Required conditions
   - Default values
   - Select options and option IDs
   - Field names and labels
   - Relation targets and join column names
   - Navigation entries
   - View names, filters, fields, groups, and sorts
   - Record page layouts, tabs, widgets, and fields-widget views
   - Roles, object permissions, field permissions, and permission flags
4. Record every difference as one of:
   - Required parity
   - Intentional Brokerage cleanup
   - Deferred provider-app ownership
   - Bug

Expected result:

- Required Lead fields match production.
- Required Policy fields match production, including reciprocal
  Policy Number/Application ID requirements.
- Lead Status default is `Assigned`.
- Policy Status default is `Submitted`.
- Layout and navigation differences are intentional and signed off.

Fail conditions:

- Any unclassified metadata difference.
- Required fields/defaults differ from production.
- Roles or permissions differ in a way that changes user access unexpectedly.

### T08 - User-Facing Lead, Policy, And Call UX

Priority: P1

Purpose:

- Validate the real browser workflows users will touch first.

Viewports:

- Desktop: 1440 x 1000
- Narrow desktop/tablet: 1024 x 768
- Mobile-width responsive sanity check if supported by the app shell

Steps:

1. Create Lead from the list page button.
2. Try to close the side panel with missing required fields.
3. Fill required Lead fields and save.
4. Verify Lead Status is prefilled/defaulted to `Assigned`.
5. Open the Lead record page and verify field order matches the intended Home
   layout.
6. Create a related Policy from the Lead.
7. Verify Policy required fields and reciprocal identifier behavior.
8. Select a Carrier and confirm the Product relation picker narrows to that
   Carrier's Carrier Product offerings.
9. Create a related Call.
10. Use Timeline, Tasks, Notes, Files, Emails, and Calendar tabs on Lead.
11. Refresh the page and repeat key checks to catch cache-only success.

Expected result:

- Required-field modal/validation blocks unsafe close/save.
- Create buttons, relation pickers, and side panels are usable.
- Text does not overflow important controls.
- Field order and relation cards match the production-inspired layout.
- Refresh does not lose metadata or draft state in unexpected ways.

Fail conditions:

- User can silently lose an incomplete required record.
- Required field validation blocks valid records.
- Relation picker cannot find newly created records.
- Layout renders relation fields as raw fields instead of relation cards.

### T09 - Lead Status Automation

Priority: P1

Purpose:

- Validate Brokerage app runtime automation around Lead assignment.

Steps:

1. Create a Lead with an Assigned Agent and no explicit status.
2. Create a Lead with an Assigned Agent and status `IDLE` if the UI/API allows
   that state.
3. Create a Lead with status `CONTACTED`; then add Assigned Agent.
4. Create a Lead with status `SOLD`; then add Assigned Agent.
5. Update an idle Lead's Assigned Agent.
6. Remove an Assigned Agent from a Lead.

Expected result:

- New Leads default to `Assigned`.
- Automation sets idle Leads to `Assigned` when an Assigned Agent is present.
- Automation does not overwrite `CONTACTED` or `SOLD`.
- Removing Assigned Agent does not incorrectly reset status.
- Automation failures are visible in logs and do not corrupt the Lead record.

Fail conditions:

- Automation overwrites non-idle statuses.
- Automation loops on update events.
- Automation depends on a stale app token or wrong application ID.

### T10 - Roles And Permissions

Priority: P0 for data access, P1 for UI polish

Purpose:

- Validate the intended Agent and Manager role behavior.

Personas:

- Workspace admin
- Brokerage Manager
- Brokerage Agent
- User with no Brokerage role
- Brokerage default function role, which should not be user-assignable

Steps:

1. Assign each persona to a test user.
2. Confirm Brokerage `Agent` is the role label shown to users, not `Member` or
   `Brokerage Agent`.
3. Compare Brokerage `Agent` against Omnia `Member` for role flags, object
   permissions, field permissions, permission flags, and RLS predicates.
4. For each persona, test list, read, create, update, and delete behavior for:
   Leads, Policies, Calls, Agents, Lead Sources, Carriers, Products, Product
   Types, Carrier Products, Family Members, Notes, and Tasks.
5. Confirm Agent sidebar parity with Omnia `Member`: Leads, Policies, Notes, and
   Tasks are visible; Calls and support/configuration objects are hidden.
6. Test Agent policy create/update ownership behavior.
7. Confirm Manager can perform expected operational work without workspace admin
   settings access.
8. Confirm default function role is not assignable to users.
9. Confirm relation pickers only show records the user can access.

Expected result:

- Agents can do expected sales work.
- Brokerage Agent has zero permission-shape diffs from Omnia Member, except for
  the visible role label/description.
- Managers can manage Brokerage operations.
- Users without Brokerage access do not see or mutate Brokerage data.
- Policy ownership rules prevent Agents from editing another Agent's policies
- while preserving the exact Omnia Member read behavior.
- No role gains broad workspace settings access accidentally.

Fail conditions:

- Agents can see or update records outside intended scope.
- Managers lack required operational access.
- Non-Brokerage users can access Brokerage objects.
- Function role is user-assignable.

### T11 - Companion App Compatibility

Priority: P0

Purpose:

- Prove other Omnia customizations still work after Brokerage ownership changes.

Areas:

- Compliance QA
- Telephony/Calls
- Tasks
- Notes
- Files
- Exports
- Spreadsheet import
- Provider ingestion, with external calls disabled unless explicitly tested
- Payment reconciliation relations where still present

Steps:

1. On an adopted copy, open existing Compliance scorecards linked to Calls,
   Leads, Agent Profiles, and Tasks.
2. Create a new QA Scorecard linked to an adopted Call.
3. Verify Call recording links still render.
4. Create Notes, Tasks, and Files linked to Lead, Policy, and Call.
5. Export Leads, Policies, and Calls from existing views.
6. Run a spreadsheet import dry run or small controlled import against Leads and
   Policies.
7. Run ingestion dry-run or isolated ingestion jobs that reference Brokerage
   relations.
8. Check timeline events before and after relation changes.

Expected result:

- Relations resolve across app ownership boundaries.
- Existing related records remain attached.
- New related records can be created.
- Exports include expected relation fields.
- Import/ingestion can match and connect existing Leads and Policies.
- Timeline relation diffs still render.

Fail conditions:

- Compliance relations break after adoption.
- Tasks, notes, files, or timeline targets detach.
- Export/import cannot resolve Brokerage relation fields.
- Provider-specific fields are deleted before companion apps own them.

### T12 - Data Integrity Deep Checks

Priority: P0

Purpose:

- Catch subtle adoption damage that row counts alone miss.

Steps:

1. Compare before/after IDs for object metadata, field metadata, views, page
   layouts, roles, and navigation entries.
2. Compare relation field pairs and join column names.
3. Sample existing records from each Brokerage object and verify:
   - Primary display field still renders.
   - Relation IDs still point at existing records.
   - Search and list views can load them.
4. Sample tasks, notes, files, and timeline activities linked to Brokerage
   records.
5. Run any available integrity checks or relation count queries for known
   high-volume relations.

Expected result:

- Metadata IDs are preserved unless explicitly listed in the adoption plan.
- Relation pairs are intact.
- Sample records open in UI and via API.
- Linked activity data remains attached.

Fail conditions:

- Orphaned relation IDs appear.
- Existing records fail to open.
- Search/list queries fail for adopted objects.
- Timeline/tasks/notes/files lose targets.

### T13 - Cache, Token, And Restore Behavior

Priority: P0

Purpose:

- Prove rollback and local/staging restore do not leave stale application
  metadata in Redis, backend memory, or SDK CLI config.

Steps:

1. Restore a database backup over an environment that previously had a different
   Brokerage app install state.
2. Decode the SDK CLI localhost `appAccessToken` and record its `applicationId`.
3. Clear workspace Redis keys.
4. Restart backend.
5. Run Brokerage sync.
6. Decode the app token again.
7. Run post-install twice.
8. Capture row counts and application ownership.

Expected result:

- Stale Redis keys for the old workspace/application state are removed.
- Backend starts cleanly.
- SDK CLI app token points at the restored Brokerage application ID.
- App sync succeeds.
- Post-install is idempotent on the second run.
- Row counts match the restored backup.

Fail conditions:

- Sync uses a stale temporary reinstall app ID.
- Backend cache causes duplicate-object creation.
- Restore requires manual database surgery beyond documented cache clearing and
  backend restart.

### T14 - Performance And Operational Safety

Priority: P1

Purpose:

- Ensure adoption and upgrade can run during an acceptable operational window.

Steps:

1. Measure dry-run duration.
2. Measure adoption apply duration on a production-like copy.
3. Measure app sync duration after adoption.
4. Measure post-install duration.
5. Monitor PostgreSQL locks during adoption and sync.
6. Monitor backend logs for workspace schema rebuild, cache recompute, and
   migration errors.

Expected result:

- Dry-run and apply durations fit the planned maintenance window.
- No long-running table locks affect live records unexpectedly.
- Backend logs show cache refresh/recompute without repeated failures.
- App sync does not start destructive workspace migrations.

Fail conditions:

- Adoption blocks high-volume tables longer than the accepted window.
- Migration errors require manual cleanup.
- Post-install repeatedly updates the same metadata.

### T15 - Production Launch Rehearsal

Priority: P0

Purpose:

- Prove the exact production runbook before touching production.

Steps:

1. Restore the latest production backup into staging.
2. Run every P0 test in this plan.
3. Run selected P1 UI tests with real user roles.
4. Produce a signed test report with:
   - Commit SHA
   - Database backup timestamp
   - Workspace ID
   - Dry-run output
   - Adoption output
   - Before/after metadata snapshots
   - Before/after row counts
   - Known deviations
   - Rollback evidence
5. Repeat the run from a clean restore if any P0 failure occurred.

Expected result:

- Rehearsal passes without manual, undocumented repairs.
- Rollback has been demonstrated.
- Every known deviation is signed off.

Fail conditions:

- Rehearsal cannot be repeated cleanly.
- P0 failure remains unresolved.
- Rollback is untested.

## Production Launch Checklist

Do not start production apply until all items are checked.

- P0 tests passed on a production-like snapshot.
- P1 deviations are accepted in writing.
- Current production backup is complete and restore-tested.
- External ingestion and worker jobs are paused or accounted for.
- Users are notified of maintenance window if required.
- Brokerage app package commit SHA is recorded.
- Adoption dry-run output from production has been reviewed.
- Rollback owner and decision deadline are assigned.
- Cache clear and backend restart commands are ready.
- Post-launch smoke test users are available.

Production apply sequence:

1. Take final production backup.
2. Run production dry-run and compare with staging rehearsal output.
3. Apply adoption only if the dry-run matches expectations.
4. Clear workspace cache if not already handled by the command.
5. Sync Brokerage app package.
6. Run post-install twice.
7. Run smoke checks:
   - App loads.
   - Leads list loads.
   - Policies list loads.
   - Calls list loads.
   - One existing Lead opens with relations.
   - One existing Policy opens with relations.
   - One existing Call opens with relations.
   - Required fields/defaults match expected metadata.
   - Compliance linked records open.
8. Monitor backend logs, Redis, database locks, and high-volume object queries.
9. Decide go/no-go before the rollback deadline.

## Test Report Template

Use this template for each run.

```md
# Brokerage App Test Report

- Date:
- Tester:
- Branch:
- Commit SHA:
- Environment:
- Workspace ID:
- Workspace schema:
- Database backup path:
- Brokerage app id:
- Brokerage app universal identifier:

## Summary

- P0 result:
- P1 result:
- Production readiness recommendation:

## Evidence

- Baseline application ownership:
- Baseline object metadata:
- Baseline row counts:
- Baseline required fields/defaults:
- Dry-run output:
- Apply output:
- Post-install first run:
- Post-install second run:
- Final application ownership:
- Final object metadata:
- Final row counts:
- Final required fields/defaults:

## Results

| Test | Priority | Result | Evidence | Notes |
| ---- | -------- | ------ | -------- | ----- |
| T00  | P0       |        |          |       |
| T01  | P0       |        |          |       |
| T02  | P0       |        |          |       |
| T03  | P0       |        |          |       |
| T04  | P0       |        |          |       |
| T05  | P0       |        |          |       |
| T06  | P0       |        |          |       |
| T07  | P0       |        |          |       |
| T08  | P1       |        |          |       |
| T09  | P1       |        |          |       |
| T10  | P0/P1    |        |          |       |
| T11  | P0       |        |          |       |
| T12  | P0       |        |          |       |
| T13  | P0       |        |          |       |
| T14  | P1       |        |          |       |
| T15  | P0       |        |          |       |

## Deviations

| Area | Expected | Actual | Disposition | Owner |
| ---- | -------- | ------ | ----------- | ----- |
|      |          |        |             |       |

## Rollback Evidence

- Restore command:
- Cache clear:
- Backend restart:
- App sync:
- Post-install idempotence:
- Row-count comparison:
```
