# Brokerage

Barebones insurance brokerage CRM data model for Twenty workspaces.

Brokerage owns the foundational objects needed to run an insurance brokerage:
Agents, Leads, Policies, Calls, Carriers, Products, Carrier Products, Product
Types, Family Members, and Lead Sources.

Provider ingestion, payment reconciliation, compliance QA, and time tracking are
separate apps that should depend on this model instead of being bundled into
the brokerage foundation.

## Deploy Gate (Twenty v2.58)

**Do not install, sync or adopt Brokerage on Twenty v2.58 until every item
below has landed.** Brokerage is not installed in production, and this package
is still built with SDK 2.3.0.

Why the gate matters: the post-install runs synchronously, so Twenty records
the install only after the post-install succeeds. When it fails on a fresh
install, or on an app whose version was never recorded (an adopted app shell),
Twenty rolls back with `uninstallApplication`, which deletes the app's objects
and their data. For an adopted Brokerage, that is Omnia's Lead and Policy data.
Today the post-install cannot succeed on v2.58: v2.58 ignores the permission
flags of a 2.3.0 build, and app tokens cannot write roles, so the Agent Policy
rule write is refused.

- [ ] **SDK 2.58.** `twenty-sdk` and `twenty-client-sdk` 2.58 as
      `devDependencies`, with `SystemPermissionFlag` instead of `PermissionFlag`
      in `src/roles/default-function.role.ts`. v2.58 reads role flags from
      `permissionFlagUniversalIdentifiers` and ignores the 2.3.0
      `permissionFlags`, so the default function role would hold none.
- [ ] **Agent role per contract C1.** No object-level all-records grant,
      read included, for any operation an Agent rule restricts: on v2.58 that
      grant wins over the rule. Policy is done (read all at object level,
      writes only through its rule). Person is not: Member reads only its own
      leads, but Agent reads and updates every Person record, so every adopted
      agent would read every lead (PHI). When the own-leads rule is adopted,
      pass `canReadObjectRecords: false` for Person, and
      `canUpdateObjectRecords: false` if the rule also restricts updates. The
      role-wide `canReadAllObjectRecords: true` covers every object without its
      own row, so set it to false and list every object agents read, or give
      each object with an Agent read rule an explicit read `false`. Dashboard
      has one already: every operation is `false`, and the audience rule
      grants access.
- [ ] **Edit window in the manifest.** Every v2.58 sync sets the Agent role's
      `editWindowMinutes`, on the role and on each object row, to the manifest
      value and resets an omitted one to null. Agent declares none, so the
      first sync after adoption would turn off the policy edit window for
      agents. Declare Member's values in `src/roles/agent.role.ts`
      (`editWindowMinutes` on the role and on the Policy
      `memberObjectPermission`), and change them there: a Settings edit does
      not survive the next sync.
- [ ] **Row-level setup off the post-install.** App tokens cannot write roles
      (`ROLE_WRITE_ACCESS_POLICY` sets `application: false`), so on a fresh
      install `ensureAgentPolicyOwnershipRls` is refused and the install rolls
      back. A server or adoption command writes the Agent Policy rule per C1:
      one rule granting create and update, the C2 hop predicate
      `policy.agent -> agentProfile.workspaceMember IS workspaceMember.id`,
      object-level Policy writes off, and
      `IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED` on for the workspace. The
      post-install already sends that shape; reuse it as the reference. The
      same command seeds the Agent dashboard audience rule with Member's
      dashboard grants. The manifest denies dashboards at object level, so the
      audience sync finds no grant to move into a rule, and without the seed
      agents see no dashboard. Write it the way the sync does (predicate id
      from `getDashboardAudiencePredicateIds`, value
      `["ROLE_<agentRoleIdHex>"]`), or the next sync deletes it.
- [ ] **Adoption rewritten.** `workspace:adopt-brokerage-app` copies row-level
      permission rules, not only predicates, with v2.58 universal identifiers.
      Until then it refuses to run without `--dry-run`, and `--dry-run` prints
      the adoption plan.
- [ ] **Search.** Manifest `isSearchable: true` on `policy.policyNumber` and
      `policy.applicationId` only, with one check-customizations entry per
      field. v2.58 treats an omitted flag as not searchable (except the label
      identifier), so the first sync would remove those fields from search.
      Never declare it on a field that a `fieldPermissions` entry in
      `src/roles/*.role.ts` makes unreadable, such as `agentProfile.email` and
      `npn`: search matches the hidden value, so agents could find agents by
      it. The upgrade's search backfill leaves those fields out too.
- [ ] **Manifest declarations.** `isUnique` wherever production relies on it,
      `displayAs: 'audio'` on `call.recording`, and Notes, Tasks and
      Dashboards navigation items if the curated sidebar is adopted later.
- [ ] **Rebuild.** Build with the `twenty` CLI pinned to 2.58.0 and always
      pass an explicit `--remote`. The 2.3.0 build writes every system field
      (`id`, `createdAt`, `createdBy` and the rest) into the manifest, and
      v2.58 fails the sync on them instead of sanitizing them. Keep the sources
      free of system-field declarations, run
      `twenty app plan --remote <non-prod>` first, and confirm the plan changes
      no system field.
- [ ] **Verify after every install or sync.** Run
      `workspace:omnia-verify-permissions` and treat any violation as a failed
      deploy.
- [ ] **Re-sync after the upgrade.** Widget positions now come from
      `normalizePageLayoutTabManifest` (array order in vertical-list tabs).
      After the first v2.58 sync, re-sync every app that owns page layouts so
      existing widgets get their positions.

## Included

- Agent profiles linked optionally to workspace members
- Lead fields on the standard Person object
- Policies linked to leads, agents, carriers, and products
- Calls linked to leads, agents, and lead sources
- Carrier/product catalog objects
- Policy Product pickers filtered through Carrier Product offerings once a
  Carrier is selected
- Lead sources and family members
- Agent and Manager role definitions
- Brokerage sidebar navigation
- Today/MTD views plus post-install sorting for default workspace views. Locked
  views are skipped if the install context cannot modify them.
- Required Lead entry fields for name, address, email, phone, and date of birth.
  These are soft, UI-only rules: the post-install writes `requiredCondition`
  after every install and upgrade, the server never enforces it, and app syncs
  keep it because it is a workspace-owned property.
- Lead status automation that sets Status to Assigned when an assigned Agent is
  present and the Lead is still idle
- Agent role named `Agent`, aligned to Omnia's `Member` permissions and sidebar
  visibility. Agents read every Policy and create or edit only the Policies
  assigned to them, through one row-level permission rule. For an existing
  Omnia-shaped workspace, copying the Member role's object permissions, field
  restrictions, permission flags, edit window and row-level rules onto Agent
  is part of the adoption rewrite (see Deploy Gate): on v2.58
  `workspace:adopt-brokerage-app` is dry-run only.

## Excluded

- Provider-specific fields such as Convoso IDs
- Reconciliation objects and carrier config
- Compliance QA scorecards and managers
- Time card/payroll tracking
- Legacy import IDs

## Production Migration

Do not install this app into Omnia by creating duplicate objects. Omnia already
has production data behind workspace-custom versions of these objects. The safe
production path is an adoption migration that preserves existing object IDs,
field IDs, relation IDs, table names, record IDs, notes, tasks, files, views,
and timeline activity while assigning the metadata to this application.

Run the server-side adoption command in dry-run mode before a full app sync on
an existing Omnia-shaped workspace:

```bash
npx nx command twenty-server -- workspace:adopt-brokerage-app --workspace-id <workspace-id> --dry-run
```

On v2.58 the command only plans. Without `--dry-run` it refuses before reading
or writing anything. The v2.58 merge removed its apply path (app-shell
bootstrap, metadata re-pointing and the Member to Agent role copy); the old code
is in git at `fd612463624`, and the rewrite brings it back on v2.58 primitives.

After the rewrite, apply only once the dry-run reports the expected
metadata-only object, field, navigation, and row-level rule changes. The apply
creates an empty Brokerage app shell if the workspace does not have one yet,
then repoints the existing Omnia metadata to that shell without recreating
records or tables. Run the Brokerage app sync after the adoption apply so the
manifest upgrades the adopted metadata instead of trying to create duplicate
objects.

## Install Safety

Once the deploy gate clears, fresh workspaces can install Brokerage directly.
The app creates the Brokerage objects, lead fields, roles, navigation, views,
record layouts, and post-install required-field/view-sort normalization from an
empty state.

Existing Omnia-shaped workspaces with live data must not be refreshed by
uninstalling and reinstalling Brokerage. Once Brokerage owns the workspace
metadata, uninstalling the app removes the app-owned objects and their physical
workspace tables, including records in objects such as Policies, Calls, Agents,
Carriers, Products, Lead Sources, and related catalog objects. Reinstalling
after that creates fresh empty app-owned tables; it does not reattach the
deleted data.

For live Omnia workspaces, treat Brokerage as a metadata adoption/upgrade path:
take a database backup, run the adoption command in dry-run mode before a full
app sync, apply only after reviewing the metadata-only plan, sync the app
package, and use app upgrade/post-install syncs for later changes. Do not use
uninstall/reinstall as an upgrade or migration strategy after adoption.

## Production Readiness

Use `docs/brokerage-app-test-plan.md` before considering Brokerage production
ready. The plan gates fresh install, destructive uninstall characterization,
existing Omnia adoption, post-adoption upgrade, production metadata parity,
user-facing flows, permissions, companion-app compatibility, rollback, and
launch rehearsal.
