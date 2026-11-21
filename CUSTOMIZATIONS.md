# Omnia CRM Customizations

This file is the registry of every Omnia change on top of upstream [twentyhq/twenty](https://github.com/twentyhq/twenty). It describes the fork as it stands on **upstream v2.58** (merge branch `merge/upstream-2026-11-14`, merged from the `upstream/v2.58` tag). Production still runs upstream v2.6 plus Omnia until the cutover below; nothing in this file is live until that cutover.

- **Check script.** `bash scripts/check-customizations.sh` runs every check in this registry and exits 1 on any `MISSING`, `OVERWRITTEN`, `REVERTED`, `PRESENT`, `UNEXPECTED` or `NOT A SYMLINK` line. Every pattern is a literal (`grep -F`) match. A "must not contain" check on a missing file fails; it is never skipped. Run it before and after every upstream merge and before every deploy.
- **Markers.** Every Omnia hunk in an upstream file carries a short `// OMNIA-CUSTOM: <why>` comment (`#` in YAML and shell, `{/* */}` in JSX). The "Upstream files with Omnia hunks" tables below are built from those markers, so the marker text is the "why".
- **New Omnia-only files** get a `check_file_exists`; Omnia hunks get a pattern check; anything that must never come back gets a `check_file_not_contains` or `check_file_not_exists`.
- **Adding a customization.** Update the area's section here and add the checks in the same change (playbook: `.claude/skills/customization-tracking/SKILL.md`). Register server code only through the three Omnia modules (C7).
- **HIPAA.** The CRM stores PHI. No customization may weaken row-level security, field permissions, authentication or PHI handling. User-initiated reads and writes run with the requester's auth context through permission-checked repositories; `shouldBypassPermissionChecks` and `getRepositoryWithoutPermissionChecks` are for system work only, with a one-line comment saying why.

Contract ids such as `C1` or `(contract C5)` appear in code comments and in this file; the glossary is under "How Omnia plugs into upstream". Ids such as `R-INSERT` (a safety decision), `Q16` (a product question) or `U15` (a work unit) come from the v2.58 merge plan and also appear in code comments.

---

## Deploy gates

Read these before any deploy of this branch.

### Gate 1: maintenance-window cutover (production 2.7 → 2.58)

Production's upgrade cursor is in the 2.7 workspace segment (`APP_VERSION` 2.6.1); the v2.19 merge was never deployed, so the first deploy jumps 2.7 → 2.58. Merging to `main` runs `.github/workflows/deploy-eks.yaml`. If that runs before the window, the Helm pre-upgrade job attempts the whole jump inside its deadline while old pods keep serving. **Keep this merge off `main` (or pause Actions) until the window below has run the jump out of band.**

**P0, preparation (days before; read-only on a fresh production snapshot, then on production):**
1. Fix GitHub Actions (no runs since 2026-10-08; the first v2.58 image build is untested and the front build uses an 8 GB heap).
2. Pre-flight SQL: RLS shapes (expect Member/Agent × Policy WRITE-only and one READ dashboard predicate per gated role; any mixed-scope pair blocks the deploy), cross-role or cross-object groups and parents, API keys or agents whose role carries predicates, installed apps (Brokerage, call-recording `4daa5147-7e70-4e43-b091-c27e1e8a32e3`, payment-reconciliation v1 `d11726da-5de9-4482-a2b0-68dc18d25181`, compliance-qa) with registration owners, the compliance-qa `DEEPGRAM_API_KEY` registration variable, the `core."upgradeMigration"` cursor, `rolePermissionFlag` rows with NULL `permissionFlagId` or no catalog key, `core._typeorm_migrations` against the 206 legacy files, the person `avatarFile` column, `core."keyValuePair"` rows (`AI_PROVIDERS`, `AI_MODEL_PREFERENCES`, `AI_MODELS_DEFAULT_%`, `TELEMETRY_ENABLED`, `REFRESH_TOKEN_EXPIRES_IN`, `%RATE_LIMITING%`, `STORAGE_S3_*`, `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`, `IS_BILLING_ENABLED`, `ADDRESS_AUTOCOMPLETE_DRIVER`, `IS_MULTIWORKSPACE_ENABLED`), command-menu split rows and PHI-egress expressions, ONE_TO_MANY `viewFilter` rows, the `requiredCondition` inventory, `nameSingular` `lead` and `callRecording` absent, the peak webhook calls per minute to omniaagent.com, and the feature flags `IS_ACCESS_GROUPS_ENABLED`, `IS_RECORD_LEVEL_SHARING_ENABLED`, `IS_PRIVATE_RECORDS_ENABLED`, `IS_RELATED_RECORD_PATHS_ENABLED` (all false). Confirm no webhook or workflow trigger subscribes to `reviewItem`, `reconciliation`, `carrierConfig` or `reconciliationDecisionRule`. Every role holding relation-hop rules (Member) must have `agentProfile` update off or `agentProfile.workspaceMember` read-only, and no `agentProfile` soft delete or destroy; W9 fails otherwise, so fix it in Settings before the window.
3. Uninstall payment-reconciliation v1 with `scripts/drop-payrecon-v1-app.sh`. Export call-recording data, then uninstall it if installed (uninstalling deletes its objects; it avoids the 2-10 rename).
4. Compliance QA: the `DEEPGRAM_API_KEY` registration server variable must exist and be set, or pause the "Compliance Call Pipeline" for the window. Set `LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS` to compliance-qa's registration id and block pod access to IMDS.
5. Rehearse on the snapshot with `scripts/replicate-db-to-local.sh` and the P1 steps. `upgrade --dry-run` cannot reach W1 or W9, so the rehearsal is a real `upgrade`, then `upgrade:status` and `workspace:omnia-verify-permissions`. W9 must pass; the upstream backfill `1794337540466` must create 0 rules for translated workspaces. Smoke-test as an agent (sees all policies, edits own, denied others', sees own leads only, search shows no foreign leads, policy create fills the agent) and as an admin; EXPLAIN the Leads and Policies index and the kanban with the hop `EXISTS`; time the `upgrade` (search-vector recomputes on about 258k calls and 63k persons).
6. `packages/twenty-docker/helm/twenty/omnia-values.yaml` ready (rate limits, `AI_MODELS_DEFAULT_*` Bedrock ids, `LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS`, `TELEMETRY_ENABLED=false`, service account, probes, `DISABLE_DB_MIGRATIONS`).
7. Rotate the ui.sh MCP token: the deleted `.codex/config.toml` committed it, and the repository is public.
8. Announce a forced re-login (httpOnly cookie sessions replace the JS-readable token pair).

**P1, the window:**
1. RDS snapshot; announce downtime.
2. Scale `twenty-server` and `twenty-worker` to 0.
3. Cancel stale jobs: `UPDATE core."exportJob" SET status='cancelled' WHERE status IN ('pending','processing');` and `UPDATE core."importJob" SET status='failed' WHERE status IN ('uploading','pending','processing');`, then delete only the `bull:export-queue:*` and `bull:import-queue:*` keys (never `FLUSHALL`).
4. One-off pod on the new image with the server env, `serviceAccountName: twenty-bedrock` and the storage env: `yarn command:prod omnia:run-legacy-typeorm-migrations` (expected no-op), `yarn command:prod cache:flush`, `yarn command:prod:background upgrade`, follow the logs to `EXIT=0`, then `yarn command:prod upgrade:status`. W9 runs last inside `upgrade`; if it fails, stop: pods stay at 0 and the RLS state is fail-closed. A failed step's stored error (`upgrade:status` output, `core."upgradeMigration"."errorMessage"`) keeps the Postgres detail, which can quote record values (`Key (...)=(...)`, `Failing row contains (...)`): treat it as PHI, never paste it into Linear or reports unredacted, and null `errorMessage` on the failed rows once the failure is resolved. On a mixed-scope abort, only after sign-off: `yarn command:prod upgrade:2-58:omnia-translate-scoped-row-level-permissions -w <ws> --merge-mixed-scopes-fail-closed` (dry run first), then re-run `upgrade`.
5. Revoke legacy refresh tokens: `UPDATE core."appToken" SET "revokedAt"=now() WHERE type='REFRESH_TOKEN' AND "revokedAt" IS NULL AND "createdAt" < '<cutover ts>';` (check the v2.58 column names first).
6. `cache:flush`, then `helm upgrade` (the job's `upgrade` is a no-op). Both deployments must run with `serviceAccountName: twenty-bedrock`.
7. Smoke checks (post-merge checklist items 7-11 below), then re-open traffic.

**P2, same day:** set the workspace AI data policy (`IS_AI_DATA_POLICY_ENABLED` on, `isProductImprovementDataSharingEnabled: false`, `isZeroDataRetentionRequired: false`, `requiredDataResidencyRegion: null`); rewrite or delete the `AI_MODELS_DEFAULT_{FAST,SMART,RECOMMENDED}` rows that the 2-9 `MigrateAiModelPreferences` step creates from `AI_MODEL_PREFERENCES` (they beat the Bedrock env pins and list non-Bedrock ids; keep Bedrock ids only) and confirm no non-Bedrock provider keys exist; check that the BullMQ schedulers exist and run `cron:register:all` (it also re-registers every enabled pull pipeline's cron and registers the ingestion log retention sweep); confirm the omniaagent.com webhook role reads its objects; Compliance QA end to end; exports as an admin and as an agent; dashboard SSO; delete the `deepgram-credentials` secret only after transcription works.

**Later releases:** compliance-qa 1.2.0 (`defineWorkflow` plus the `COMPLIANCE_QA_AUTOMATIC_PROCESSING_ENABLED` kill switch); S3 through Pod Identity (a separate deploy: delete the `STORAGE_S3_*` keyValuePair rows, grant a scoped S3 policy, smoke-test, then remove the static key); an instance command dropping `rowLevelPermissionPredicate(Group).scope`, their enum types and `core."exportJob"` (kept now for rollback); OAuth for the dashboard; validation rules for hard invariants only; the curated-tree sidebar.

### Gate 2: Brokerage is not installable on v2.58

Brokerage (`packages/twenty-apps/internal/brokerage/`) is not installed in production. **Do not install, sync or adopt it on v2.58** until the Brokerage project lands (units sap U15-U17) and its README gate clears:
- SDK 2.58 with `SystemPermissionFlag` (a 2.3.0 build's `permissionFlags` are ignored by v2.58).
- The Agent role follows contract C1: no object-level all-records grant, read included, for any operation an Agent rule restricts. On v2.58 an object grant wins over every rule, so today's role-wide `canReadAllObjectRecords` and the Person read grant would reopen data; a sync would also reset the edit window.
- The Agent Policy row-level writer moves off the post-install into a server or adoption command: app tokens cannot write roles (`ROLE_WRITE_ACCESS_POLICY` has `application: false`), and lifecycle hooks run without the installing user by design (R-INSTALL).
- `workspace:adopt-brokerage-app` is rewritten to copy rules (its apply path was removed; it only dry-runs).
- Manifest `isSearchable` on `policy.policyNumber` and `policy.applicationId`, `isUnique` where production relies on it, and `displayAs: 'audio'` on `call.recording`.
- A v2.58 CLI rebuild with `twenty app plan --remote <non-prod>` first, a page-layout re-sync after the first v2.58 sync, and `workspace:omnia-verify-permissions` after every install or sync.

Why it matters: the post-install runs synchronously, and a failed or never-completed install is rolled back by `uninstallApplication`, which deletes the app's objects and data. For an adopted Brokerage that is Lead and Policy data.

### Gate 3: other one-time actions and behaviour changes to announce

- **Translations.** Upstream catalogs were taken during the merge; run `lingui:extract` and `lingui:compile` (front and server) once, in a dedicated `chore(i18n)` commit. The check script warns until then.
- **Rate limits.** Code defaults are upstream (100/s, 100/min); production values live in `omnia-values.yaml` `extraEnv`. `WEBHOOK_CALL_RATE_LIMITING_LIMIT` (600/min until the P0 peak is measured) silently drops webhook calls above the cap, so bulk imports over the cap lose deliveries to omniaagent.com unless it is raised. Omnia scripts do not handle 429/`Retry-After`.
- **Access tokens.** The server sets `ACCESS_TOKEN_EXPIRES_IN=30m` (the chart default was 7d). A `core."keyValuePair"` row would override it.
- **Dashboard SSO.** The omniaagent.com dashboard must accept the access-only sibling cookie (no refresh token) and send `omniaSignOut=1` to end the CRM session, navigating with its default referrer policy (the CRM ignores the flag when the referrer is not a sibling app); every host under `.omniaagent.com` must stay Omnia-controlled.
- **Behaviour changes for users:** agents stop seeing other agents' leads in search; creating a policy for another agent (or with no agent) is rejected; on create the API no longer sets fields the role cannot edit except the agent relation, the hop relation and `submittedDate`; CSV imports run as the requester (RLS applies; one export per workspace, cancelled when the tab closes); the edit window also applies to upserts and merges; workflow `IS_NOT_RELATIVE` no longer matches empty or invalid dates; forced re-login.
- **Webhook role.** v2.58 filters events by the reader's permissions, so the omniaagent.com webhook's API key role needs read on its objects.

---

## How Omnia plugs into upstream

### Registration points (contract C7)

Exactly three Omnia modules hook into upstream registration files. New server modules join `OmniaModulesModule`, CLI commands join `OmniaCommandModule`, upgrade commands join `OmniaUpgradeVersionCommandModule`. Never add Omnia entries to `core-engine.module.ts`, `jobs.module.ts`, `metadata-engine.module.ts`, `workspace-query-hook.module.ts`, `role.module.ts` or `role.service.ts` (the check script guards each).

| Upstream file | Omnia lines | Why |
| --- | --- | --- |
| `packages/twenty-server/src/modules/modules.module.ts` | imports `OmniaModulesModule` | v2.58 loads `ModulesModule` in the app, the worker and the `/metadata` schema include, so this one line registers Omnia query hooks, `@MetadataResolver`s, the ingestion webhook controller, processors and listeners |
| `packages/twenty-server/src/database/commands/database-command.module.ts` | imports `OmniaCommandModule` | every Omnia CLI command; through it `CronRegisterAllCommand` reaches the Omnia cron commands |
| `packages/twenty-server/src/database/commands/upgrade-version-command/workspace-command-provider.module.ts` | imports `OmniaUpgradeVersionCommandModule` | the server, the CLI and the worker see the same upgrade sequence |
| `packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts` and `message-queue-worker-config.constant.ts` | three queues and their worker config (C9) | below |
| `packages/twenty-server/src/database/commands/cron-register-all.command.ts` | three cron entries: `agent-rollups` (always on), `ImportJobValidatedRowsRetention` (Q22: clears staged import rows, PHI, 30 days after the job ends) and `ingestion-pull-schedules` (re-registers every enabled pull pipeline's cron, so a wiped BullMQ scheduler heals on deploy) | the scheduler has no boot-time re-sync; the server entrypoint runs `cron:register:all` on every pod start |

`packages/twenty-server/src/modules/omnia/omnia-modules.module.ts` imports `PolicyQueryHookModule`, `CallQueryHookModule`, `PersonQueryHookModule` (renamed from `LeadQueryHookModule`; the `lead.*` hooks were dropped), `AgentProfileModule`, `ReconciliationModule` (with `CarrierConfigQueryHookModule` and the lockdown listener), `DashboardAudienceModule`, `AgentRollupModule`, `RoleObjectSettingsModule`, `IngestionPipelineModule` (with its pull and push processors), `ImportJobModule`, `ImportJobProcessorModule`, `ImportJobValidatedRowsRetentionModule` and `OmniaSiblingSessionModule`.

`packages/twenty-server/src/database/commands/custom/omnia-command.module.ts` provides `AdoptBrokerageAppCommand`, `BackfillReconciliationDecisionRulesCommand`, `BackfillTimeCardsCommand`, `ComputeAgentRollupsCommand`, `OmniaVerifyPermissionsCommand` (`workspace:omnia-verify-permissions`), `RunLegacyTypeOrmMigrationsCommand` (`omnia:run-legacy-typeorm-migrations`), `SeedAmbetterCarrierConfigCommand`, `SeedCarrierConfigCommand`, `SeedConvosoCallPipelineCommand`, `SeedConvosoTimeCardPipelineCommand`, `SeedHealthSherpaPipelineCommand`, `SeedReconciliationObjectsCommand` and `SyncDashboardAudienceCommand`, and re-exports `AgentRollupModule` and `IngestionPipelineModule` for the cron commands. It imports `ReconciliationCoreModule` instead of re-providing the reconciliation services.

### Message queues (contract C9)

| Queue (Redis key prefix) | Worker config | Notes |
| --- | --- | --- |
| `importQueue = 'import-queue'` | `concurrency: 1`, `globalConcurrency: 1`, `lockDuration: 300_000`, `maxStalledCount: 1`, `boundedShutdownDrain: false` | CSV import job (runs as the requester) |
| `ingestionQueue = 'ingestion-queue'` | `concurrency: 1`, `lockDuration: 120_000`, `maxStalledCount: 1`, `boundedShutdownDrain: false` | ingestion pull and push jobs |
| `reconciliationQueue = 'reconciliation-queue'` | `concurrency: 1`, `lockDuration: 300_000`, `maxStalledCount: 0`, `boundedShutdownDrain: false` | parse and match jobs; stuck runs recover through `recoverIfStuck` |

There is no Omnia `exportQueue`: exports use upstream `recordExportQueue`. Every `messageQueueService.add(...)` passes a scope (`{ isWorkspaceJob: true, workspaceId }` or `{ isSystemJob: true }`). `WORKER_EXCLUDED_QUEUES` must not exclude these queues. The string values are the prefixes production already has in Redis.

### Omnia upgrade commands (`packages/twenty-server/src/database/commands/upgrade-version-command/omnia/`)

Schema and data changes ship as upgrade commands, never as TypeORM migrations. Every command is idempotent, supports `--dry-run`, logs counts and ids only (never record values), invalidates the caches it changes, and is provided by `omnia-upgrade-version-command.module.ts`; the check script fails on any command file the module does not provide. A new command goes in the then-current version with a timestamp above every existing command of its kind in that version, or `upgrade` resumes past it and never runs it. Two deliberate exceptions: I1 at `2.8.0` (catch-up for production's skipped 2.7 Finalize) and W1 inside upstream's 2.58 range (safe only because no Omnia database has run a 2.58 command; development databases must be restored from a production snapshot). Deploys run `upgrade`, never `run-instance-commands --force`.

| Id | Registration | Class | Purpose |
| --- | --- | --- | --- |
| I1 | instance fast, `('2.8.0', 1798100000000)` | `OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand` | Runs only if `core."rolePermissionFlag"."flag"` still exists: backfills `permissionFlagId`, sets it NOT NULL, drops `flag`. Production's cursor skips upstream's 2.7 Finalize; a no-op on fresh installs |
| I2 | instance fast, `('2.58.0', 1794500000000)` | `OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand` | `core."importJob"."userWorkspaceId"` (the import job runs as, and is visible to, its requester) |
| W1 | workspace, `('2.58.0', 1794337540400)` | `OmniaTranslateScopedRowLevelPermissionsCommand` | Translates Omnia's scoped predicates into v2.58 rules (one rule per role and object) and converts "Agent is Me" into the C2 relation hop. Runs before upstream's scope-blind backfill `1794337540466`; aborts before any write on mixed scopes, parent cycles, partial links or cross-app trees. Without it agents lose all Policy access (fails closed) |
| W2 | workspace, `('2.58.0', 1794500001000)` | `OmniaBackfillCustomObjectSearchFieldsCommand` | `searchFieldMetadata` rows for every active searchable-type field of custom objects (skips read-restricted fields). A database upgraded without it skips it for good |
| W3 | workspace, `('2.58.0', 1794500002000)` | `OmniaSetRecordingFieldDisplayAsAudioCommand` | `displayAs: 'audio'` on `call.recording` so LinksDisplay renders the audio player |
| W4 | workspace, `('2.58.0', 1794500003000)` | `OmniaConsolidateStandardDeleteCommandMenuItemsCommand` | Replaces the 6 legacy split delete/restore/destroy rows with the upstream unified items, pins `deleteRecords` through a workspace override and sets the `Create {objectLabelSingular}` shortLabel override |
| W5 | workspace, `('2.58.0', 1794500004000)` | `OmniaMigrateOneToManyViewFiltersCommand` | Moves ONE_TO_MANY `viewFilter` rows to `relationTargetFieldMetadataId`, deletes ones that can never validate, reports chart and workflow JSON filters |
| W6 | workspace, `('2.58.0', 1794500005000)` | `OmniaSyncDashboardAudienceCommand` | Normalizes dashboard audience rules to C1 (rule grants; dashboard object grants false for gated roles) |
| W7 | workspace, `('2.58.0', 1794500006000)` | `OmniaReconciliationObjectLockdownCommand` | Re-locks every non-admin role out of the reconciliation objects (fixes roles created through the UI race) |
| W8 | workspace, `('2.58.0', 1794500007000)` | `OmniaPurgeLegacyExportFilesCommand` | Deletes the legacy `export/exports/*` CSVs (PHI) and their `core.file` rows |
| W9 | workspace, `('2.58.0', 1794500009000)` | `OmniaVerifyPermissionsUpgradeCommand` | **Fails the upgrade** on any permission state that leaks PHI. Also the CLI `workspace:omnia-verify-permissions` (in `OmniaCommandModule`), run after every app install or sync |

### Legacy TypeORM migrations (frozen)

`packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/` is frozen. Omnia's 24 files there stay byte-identical (they build fresh and local databases; all have run in production); add none. `omnia:run-legacy-typeorm-migrations` replays them with `transaction: 'each'` and runs first in the Helm migration job. The 7 upstream files Omnia once made idempotent are upstream again.

### Cross-domain contracts (glossary)

| Id | Contract |
| --- | --- |
| C1 | RLS writer contract: code that writes row-level permissions for a role and object sets every operation flag explicitly, turns off the object-level grants for the operations the rule restricts, and never creates a second rule on the same pair |
| C2 | "Agent is Me" is always the relation hop `policy.agent → agentProfile.workspaceMember IS workspaceMember.id` (`relationFieldMetadataId`) |
| C3 | Edit window: `editWindowMinutes` on role (default) and objectPermission (override), resolved by `resolveEditWindowMinutes`; never on `rolesPermissions` or `ObjectPermissions` |
| C4 | Sidebar visibility: `showInSidebar` / `showAllObjectsInSidebar` columns, exposed as `UserWorkspace.objectSidebarVisibility` |
| C5 | `requiredCondition`: a soft, UI-only required rule (never an upstream validation rule) |
| C6 | Relation sub-field columns: `viewField.subFieldName` |
| C7 | Registration points (above) |
| C8 | `RECONCILIATION` settings permission flag (SystemPermissionFlag `091125f0-bdb5-4c67-944f-8c4c66de4a76`), never in `TOOL_PERMISSION_FLAGS` |
| C9 | Message queues (above) |
| C10 | Omnia services act as the user for user-initiated work |
| C11 | Upgrade-command rules (above) |
| C12 | Enterprise and billing: the self-hosted force-unlock; `IS_BILLING_ENABLED` stays false |
| C13 | Dashboard SSO sibling cookie |
| C14 | Import job API (requester-scoped `importJob`) |
| C15 | AI: Bedrock only, telemetry content never recorded |

---

## Server infrastructure: deploy, Helm, scripts, hardening and CLI

- **Deploy workflow** (`.github/workflows/deploy-eks.yaml`, Omnia-only): builds the Dockerfile `twenty` stage (`target: twenty`), derives `APP_VERSION` from `packages/twenty-server/src/engine/core-modules/upgrade/constants/twenty-current-version.constant.ts`, passes `--set-string server.image.tag=…` and `worker.image.tag=…`, keeps `concurrency.cancel-in-progress: false` and a 65-minute Helm timeout, and never uses `--atomic`, `--install` or `helm rollback`: a `pending-*` release stops the workflow so a deploy is fixed forward. `deploy_only` deploys the commit's SHA tag after an `aws ecr batch-get-image` check. `scripts/deploy-local.sh` mirrors it and never pushes or deploys `:latest`.
- **Helm** (`packages/twenty-docker/helm/twenty/`): upstream v2.58 chart (service-account helper, values-driven probes) plus rollout knobs whose empty defaults keep upstream behaviour: server `strategy`, `minReadySeconds` and topology spread, worker `strategy`, a server PodDisruptionBudget, Redis ping probes and tolerations, db-internal root tolerations, and `helm.sh/resource-policy: keep` on the Redis PVC. The Omnia-only `templates/job-migration.yaml` pre-upgrade hook runs `omnia:run-legacy-typeorm-migrations`, `cache:flush`, `upgrade`, `cache:flush` with the server env and service account and `activeDeadlineSeconds: 3600`; server pods run with `DISABLE_DB_MIGRATIONS=true`. It never runs `run-instance-commands --force` (that would skip every 2.7→2.57 slow and workspace command). A first install needs the one-off upgrade pod (Gate 1).
- **`omnia-values.yaml`**: top-level `serviceAccount: { create: false, name: twenty-bedrock }` (EKS Pod Identity for Bedrock, Amazon Translate and the S3 QA artifacts); API, application and webhook rate limits; `AI_MODELS_DEFAULT_*` pinned to Bedrock ids; `LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS` (empty fails closed); `TELEMETRY_ENABLED=false` (upstream telemetry sends sign-up names and emails out); `ACCESS_TOKEN_EXPIRES_IN: "30m"`; `REFRESH_TOKEN_EXPIRES_IN=5m` (cookie sessions replaced refresh tokens, yet every sign-in still returns one to page JavaScript, sign-out never revokes it, and `renewToken` would trade it for new sessions; nothing in the front, the dashboard or the CLI uses it); shared `NODE_OPTIONS` heap headroom; startup probe 60 × 10 s; `maxUnavailable: 0`, `minReadySeconds: 15`, worker `Recreate`; no ingress cache snippet and no Deepgram env (the key is a compliance-qa registration variable). `db.enabled: false` stays.
- **AWS runtime IAM (managed outside the repo).** Role `twenty-bedrock-runtime` also has inline policy `ComplianceQaTranscribeS3Artifacts`: `transcribe:StartTranscriptionJob` / `transcribe:GetTranscriptionJob` (unused since the 2026-06-10 Deepgram swap; safe to remove), `translate:TranslateText` in `us-east-1`, prefix-scoped `s3:ListBucket`, and `s3:GetObject` / `s3:PutObject` only under `s3://twenty-crm-storage-189365142140/compliance-qa/input/*` and `/compliance-qa/output/*`. S3 through Pod Identity for the server itself is a separate deploy after the merge (Gate 1, later releases).
- **Local prod restore** (`scripts/replicate-db-to-local.sh`): runs `upgrade` only (never `database:migrate --include-slow`, which is `run-instance-commands --force`), deletes production's `core."signingKey"` rows right after the restore so local mints its own key, re-encrypts only DB-backed sensitive config (`--site=sensitive-config-storage`) when the keys differ, warns when the local key equals production's, then `cache:flush`. Every server command runs through `run_local_server_command`, pinned to the restored database, local Redis and the local key.
- **Server hardening** (upstream files with Omnia hunks): the enterprise force-unlock is one switch, `isCachedValidityPayloadValid()` returns `true` in `enterprise-plan.service.ts` (RLS management, validation rules, custom AI providers, SSO guard; `hasValidSignedEnterpriseKey()` stays false and `ENTERPRISE_KEY` unset, so no outbound enterprise calls; buying a license would replace it, Q24). With `IS_BILLING_ENABLED` false, `isEntitlementActive` returns `hasValidEnterprisePlan || …`, so the RLS settings gate follows the unlock; never run `billing:sync-entitlements` (with billing on it deletes every RLS predicate group). `auth.service.ts` sends every forwarded `returnToPath` through `getSafeReturnToPath` (an app path, or an https URL on the front host or its parent domain) and marks password-less social-SSO users email-verified before `/verify`. `FrontendModule` serves `/assets/` with `public, max-age=31536000, immutable` and returns 404 for a missing `/assets/` or `/images/` file (HTML `no-store` and the CDN headers are upstream). `UnhandledExceptionFilter` answers non-`HttpException`s with `{ statusCode: 500, message: 'Internal server error' }` because database errors can quote PHI. `instrument.ts` sets `Sentry.vercelAIIntegration({ recordInputs: false, recordOutputs: false })` plus `dataCollection: { genAI: { inputs: false, outputs: false } }` so a re-enabled Sentry never receives prompts or responses. Invitation and approved-access-domain emails send without "(via Twenty)".
- **Small hunks kept:** email trim before lowercasing (`transform-emails-value.util.ts`), the workflow `IS_NOT_RELATIVE` date filter, `nest-cli.json` watch ignores and `CHOKIDAR_USEPOLLING` in `project.json` (dev only), the shared `slow-path-observer.util.ts` (call sites: metadata cache miss, workspace-cache resolution and recompute; production has no `METER_DRIVER`), and two config variables (`LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS`, env-only; the `SEARCH_ILIKE_FALLBACK_TIMEOUT_MS` description).
- **Upgrade-command hunks in upstream files** (G7 exceptions): the 2-6 rename tolerates missing legacy FK and index names (KEEP, for pre-2.6 snapshots and replicas), the 2-7 Finalize self-heals unlinked rows (plus I1), and the 2-10 and 2-23 legacy `FlatFieldMetadata` literals carry `requiredCondition: null`.
- **Endpoint permission snapshot** (`packages/twenty-server/test/integration/endpoint-permissions/__snapshots__/…snap`): Omnia lines for the reconciliation resolver, the sibling-session refresh and the ingestion resolvers (`ingestionLogs` accepts user sessions only). Re-add them after an upstream snapshot refresh; the integration spec fails without them.
- **Ops scripts:** `scripts/export-convoso-recordings.mjs` (resumable Convoso-to-S3 recording exporter; Convoso purges audio on a ~155-day window and recordings are 10-year retention artifacts; keep it until the telephony cutover) and `scripts/backfill-calls.{sh,py}`.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- Google Workspace domain-wide delegation: the provisioner command, the DWD branches in the OAuth client manager, the `'SERVICE_ACCOUNT'` refresh-token sentinel, `messaging-account-authentication.service.ts` and `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`. Revoke the Google Admin DWD grant, delete the GCP key and the config row, and remove provisioner-created connected accounts.
- Event-origin plumbing (`origin`, `eventEmissionPolicy`, the import-origin skip in the workflow trigger listener): it never ran. Imports keep emitting CREATED and UPDATED; never use `shouldSkipEventEmission` for imports.
- `FileFolder.Export` and the Omnia export queue (`exportQueue`, its lock-duration and priority constants): exports use upstream record-export.
- The `app.module.ts` ServeStatic asset hunk and the ingress `immutable` snippet (FrontendModule owns caching), the session-storage Redis `error` listener and the geo-map per-request config read (both upstream-native now).
- `message-queue-priority.constant.ts`, `message-queue-worker-options.constant.ts` and `message-queue-concurrency.constant.ts`.
- `core.datasource.ts` `migrationsTransactionMode` (no `typeorm` CLI calls remain), the 1-21 command-menu compat edits, the 2-18 normalize drift edit and the 7 upstream legacy-migration idempotency edits.
- Helm: per-component `serviceAccountName` keys, the `run-migrations` init container (`npx` is not in the v2.58 image), the db-init rewrite, the `_helpers.tpl` tag and SSL edits, and `packages/twenty-docker/twenty/Dockerfile.ci`.
- The never-registered commands `seed-insurance-navigation`, `sync-policy-status-from-csv`, `sync-agent-workspace-members` and `provision-google-workspace-accounts`.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-docker/helm/twenty/templates/deployment-db-internal.yaml` | root tolerations only reach the in-cluster Postgres pod. |
| `packages/twenty-docker/helm/twenty/templates/deployment-redis-internal.yaml` | keep the old Redis serving until the new pod passes its ping probes. Redis runs on the tainted production node pool. redis-cli ping probes gate traffic and restart a hung Redis. |
| `packages/twenty-docker/helm/twenty/templates/deployment-server.yaml` | strategy/minReadySeconds knobs for zero-downtime rollouts; unset keeps upstream. spread server replicas across nodes. |
| `packages/twenty-docker/helm/twenty/templates/deployment-worker.yaml` | worker.strategy knob (Recreate keeps one worker generation); unset keeps upstream. |
| `packages/twenty-docker/helm/twenty/templates/pvc-redis-internal.yaml` | never delete queued BullMQ data on helm uninstall or rollback. |
| `packages/twenty-docker/helm/twenty/values.yaml` | rollout knobs. Empty strategy keeps upstream's (Recreate with persistence, else RollingUpdate maxSurge 1 / maxUnavailable 1). empty keeps upstream's RollingUpdate (maxSurge 1 / maxUnavailable 1) scheduling tolerations for the in-cluster Redis pod. tolerations for the in-cluster Postgres pod only; every other component reads its own <component>.tolerations. |
| `packages/twenty-server/src/database/commands/cron-register-all.command.ts` | Omnia cron commands, exported through OmniaCommandModule. Omnia cron commands. agent leaderboard rollups, always on. Q22 retention, clears staged import rows (PHI) 30 days after the job ends. re-registers every enabled pull pipeline's cron, so a wiped BullMQ scheduler heals on deploy. clears the records vendors push (PHI) from ingestion logs. |
| `packages/twenty-server/src/database/commands/database-command.module.ts` | single registration point for every Omnia CLI command. also exports the Omnia cron commands CronRegisterAllCommand injects. |
| `packages/twenty-server/src/database/commands/upgrade-version-command/2-10/2-10-workspace-command-1799000055000-sync-call-recording-standard-objects.command.ts` | FlatFieldMetadata carries Omnia's requiredCondition column. |
| `packages/twenty-server/src/database/commands/upgrade-version-command/2-23/utils/build-legacy-workflow-core-workflow-id-flat-field-metadata.util.ts` | FlatFieldMetadata carries the requiredCondition column (contract C5) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/2-6/2-6-instance-command-fast-1778235340020-rename-permission-flag-to-role-permission-flag.ts` | production snapshots may already be missing some legacy permissionFlag constraint/index names from prior schema drift. |
| `packages/twenty-server/src/database/commands/upgrade-version-command/2-7/2-7-instance-command-fast-1779600000000-finalize-role-permission-flag-cutover.ts` | guarded cutover shared with the Omnia 2.8 catch-up command. self-heal rows the 2.6 link step left unlinked, and no-op when the Omnia 2.8 catch-up already ran (prod's cursor skips this step). |
| `packages/twenty-server/src/database/commands/upgrade-version-command/workspace-command-provider.module.ts` | single registration point for every Omnia upgrade command. the server, worker and CLI build one upgrade sequence from here (C7) |
| `packages/twenty-server/src/engine/core-modules/approved-access-domain/services/approved-access-domain.service.ts` | sender name without the upstream "via Twenty" suffix. |
| `packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts` | getSafeReturnToPath trusts sibling https redirects. also forwards trusted sibling URLs (omniaagent.com dashboard) an app path, or an https URL on the front host or its parent domain (isExternalRedirectTrusted). "//host", "/\host" and the rest are dropped. same returnToPath policy as computeRedirectURI. the provider proved the email, so /verify must not fail on EMAIL_NOT_VERIFIED; password accounts are skipped, as for enterprise SSO. |
| `packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts` | self-hosted force-unlock ALL Enterprise-gated features (RLS mgmt, validation rules, custom AI providers, SSO guard). isValid and isValidWithFreshToken both read this; ENTERPRISE_KEY stays unset. |
| `packages/twenty-server/src/engine/core-modules/frontend/frontend.module.ts` | Vite names /assets/ files by content hash, so browsers and Cloudflare can keep them for a year. a missing /assets/ or /images/ file must 404, never fall back to index.html (clients that send no Sec-Fetch-Dest would get the app shell). |
| `packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts` | one job at a time, as prod runs today; long locks cover multi-minute imports and reconciliation runs. A stalled reconciliation job fails rather than re-running (the orchestrator's recoverIfStuck path). |
| `packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts` | CSV import, ingestion pipelines and payment reconciliation. The values are the Redis key prefixes prod already uses; never rename them. |
| `packages/twenty-server/src/engine/core-modules/record-transformer/utils/__tests__/transform-emails-value.util.spec.ts` | upstream only lowercases; Omnia also trims (pasted and imported emails) |
| `packages/twenty-server/src/engine/core-modules/record-transformer/utils/transform-emails-value.util.ts` | trim pasted/imported emails so lookups and dedup match. same trim for additional emails. |
| `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts` | Pod Identity allowlist for LOCAL logic functions (HIPAA). Env-only, so the admin panel cannot widen it. digit fragments also trigger the fallback (search/utils/should-run-ilike-fallback.ts) |
| `packages/twenty-server/src/engine/core-modules/workspace-invitation/services/workspace-invitation.service.ts` | sender name without the upstream "via Twenty" suffix. |
| `packages/twenty-server/src/filters/unhandled-exception.filter.ts` | database errors can quote PHI ("Key (phone)=(...)"), so only HttpExceptions echo their body to the client. |
| `packages/twenty-server/src/instrument.ts` | prompts and responses carry PHI. Integration options win over the per-call telemetry flags, which allow recording by default. same PHI rule for every other Sentry AI integration. |
| `packages/twenty-server/src/modules/modules.module.ts` | the one registration point for every Omnia server module. loads Omnia in the API, the worker and both GraphQL schemas (C7) |
| `packages/twenty-server/src/modules/workflow/workflow-executor/workflow-actions/filter/utils/evaluate-filter-conditions.util.ts` | workflow "is not within" relative date window. |
| `packages/twenty-server/src/utils/__test__/get-field-metadata-entity.mock.ts` | Omnia's requiredCondition fieldMetadata column. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-docker/helm/twenty/templates/job-migration.yaml` | Pre-upgrade migration job must exist: server pods set DISABLE_DB_MIGRATIONS, so nothing else upgrades the schema |
| `packages/twenty-docker/helm/twenty/templates/pdb-server.yaml` | Server PodDisruptionBudget keeps one pod up through node drains |
| `packages/twenty-docker/helm/twenty/tests/omnia_rollout_test.yaml` | helm unittest coverage for the Omnia rollout knobs, migration job and PDB |
| `packages/twenty-server/src/database/commands/custom/backfill-time-cards.command.ts` | Time Card backfill command |
| `packages/twenty-server/src/database/commands/custom/compute-agent-rollups.command.ts` | Agent rollup CLI command |
| `packages/twenty-server/src/database/commands/custom/omnia-command.module.ts` | OmniaCommandModule provides every Omnia CLI command |
| `packages/twenty-server/src/database/commands/custom/run-legacy-typeorm-migrations.command.ts` | Standalone legacy TypeORM migration command used by the Helm migration job |
| `packages/twenty-server/src/database/commands/custom/seed-convoso-call-pipeline.command.ts` | Convoso call pipeline seed command (registered, Q18) |
| `packages/twenty-server/src/database/commands/custom/seed-healthsherpa-pipeline.command.ts` | Health Sherpa pipeline seed command (registered, Q18) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util.ts` | Guarded rolePermissionFlag cutover shared by upstream 2.7 Finalize and Omnia I1 |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command.ts` | W3 sets settings.displayAs='audio' on the call recording LINKS field (AudioLink renders only then) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-8-instance-command-fast-1798100000000-omnia-finalize-role-permission-flag-cutover-catch-up.ts` | I1: prod's cursor is past upstream 2.7 Finalize; this 2.8.0 fast command finishes the rolePermissionFlag cutover |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts` | OmniaUpgradeVersionCommandModule provides every Omnia upgrade command (§4.0.3) |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1769300000000-add-external-policy-fields.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1770854400000-use-template-for-standard-view-names.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771284860000-add-ingestion-pipeline-entities.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771400000000-add-ingestion-log-incoming-payload.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771500000000-add-show-in-sidebar-permission.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771700000000-add-call-recording-url.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771700000000-add-convoso-list-id-to-lead-source.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771800000000-set-recording-field-display-as-audio.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1772000000000-add-ltv-to-policy.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1772591146793-add-edit-window-minutes.ts` | Edit window migration |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1772600000000-change-submitted-date-to-datetime.ts` | SubmittedDate datetime migration |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1773069763255-add-field-metadata-required.ts` | Required fields migration |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1773079000000-add-scope-to-row-level-permission-predicates.ts` | Frozen legacy migration; v2.58 leaves the scope columns unmapped until the next-release drop |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1774200000000-configure-role-sidebar-permissions.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1774300000000-add-import-job-entity.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1774400000000-add-export-job-entity.ts` | Frozen legacy migration that created core.exportJob; prod's _typeorm_migrations lists it (the table is dropped next release) |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1774500000000-add-view-field-sub-field-name.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1775250175000-addUploadingToImportJobStatusEnum.ts` | Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1775300000000-dedup-calls-and-add-unique-index.ts` | Call dedup migration + unique index on convosoCallId |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1776000000000-add-ingestion-pipeline-dedup-field-names.ts` | Composite dedup migration (dedupFieldNames array column) |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1776100000000-add-time-card-unique-index.ts` | Time Card composite unique index migration |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1778000000000-reconcile-time-card-agent-relation.ts` | Time Card agent relation metadata reconciliation migration |
| `packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1779200635935-add-call-analytics-indexes.ts` | Call analytics covering indexes migration |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module.ts` | Ingestion pipeline server module |
| `packages/twenty-server/src/modules/omnia/omnia-modules.module.ts` | OmniaModulesModule registers every Omnia server module (hooks, resolvers, controllers, processors, listeners) |
| `scripts/backfill-calls.py` | Sequential Convoso call backfill (day by day) through the ingestion pipeline |
| `scripts/backfill-calls.sh` | Parallel Convoso call backfill through the ingestion pipeline |
| `scripts/export-convoso-recordings.mjs` | Convoso recording exporter must exist until the telephony cutover completes (recordings are CMS 10-yr retention artifacts; Convoso purges audio on a ~155-day rolling window) |

Plus 11 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Permissions and row-level security (HIPAA)

- **Engine.** v2.58 enforces row-level permissions in `packages/twenty-server/src/engine/permissions/**` with per-operation rules (`rowLevelPermissionRule`) next to object-level all-records grants. An object grant wins over every rule, so a role restricted by a rule must have that operation's object grant off (contract C1). RLS now also applies to API keys, applications and joined relations; create and update RLS are enforced (Omnia's old check was never awaited). Omnia keeps only small hunks there: the relation-hop gate patch (hops work with the hop flag on and access groups off), the narrowed create exemption (R-INSERT: creators may set the agent relation, a hop's relation join column and `submittedDate`, which their role locks afterwards; every other uneditable field is still rejected), the parent-group ownership guard (R-RLS-PARENT: a group whose parent belongs to another role or object would compile to match-all) and the `rowLevelRestrictedObjectMetadataIds` read restriction used by the timeline rules below. Deny-by-default (`UNSATISFIABLE_RECORD_FILTER`) is upstream.
- **Policy target (C1, C2).** Member and Brokerage Agent on Policy: object grants create/read/update/soft delete/destroy = false/true/false/false/false, and one rule grants create and update (create follows update) through the C2 hop `policy.agent → agentProfile.workspaceMember IS workspaceMember.id`, with read false. Former ALL pairs (Member on person) and the dashboard audience pairs: object grants all false and one rule holding the previous access. Per workspace, `IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED` is on and access groups, record-level sharing, private records and related record paths are off. Result: agents search and view every policy but create, update, delete or restore only their own; "Agent is Me" is evaluated live in SQL.
- **W1 and W9** (`upgrade-version-command/omnia/translate-scoped-row-level-permissions/`, `verify-permissions/`): W1 translates the pre-merge `scope` model into one rule per role and object and converts "Agent is Me" into the hop (the hop target is the agentProfile relation named `workspaceMember`; production's agentProfile also has `manager`). It aborts before writing on mixed scopes, parent cycles, partial links or cross-app trees, removes pairs that would grant nothing, and always refreshes caches. W9 fails the upgrade (and `workspace:omnia-verify-permissions` reports) on any leak: the Policy hop shape, hop target writes (a role holding relation-hop rules must not be able to edit the hop's member field, `agentProfile.workspaceMember`, or soft delete or destroy `agentProfile` records, since the hop reads that row live), the PHI invariant (no object-level all-records grant for an operation a person, policy or call rule restricts), reconciliation reach (`canReachSomeRecords` for all five operations; only the standard admin is exempt, by universal identifier, never by label), navigation command activation, PHI-egress command-menu rows without `permissionFlags`, and read-restricted searchable fields. Both share one record-access feature-flag list and abort while access groups, sharing, private records or related record paths are on.
- **Role and object settings (C3, C4).** `editWindowMinutes` (role default, objectPermission override) and `showInSidebar` / `showAllObjectsInSidebar` are Omnia columns on `role` and `objectPermission`, carried by the DTOs, inputs, flat-role builders, the object-permission upsert (preserve when omitted) and the app-manifest importer and exporter. `packages/twenty-server/src/modules/role-object-settings/` resolves them from the flat caches (`resolveEditWindowMinutes`: override, then role default, then none; `resolveShowInSidebar`; the `UserWorkspace.objectSidebarVisibility` field resolver on `/metadata`). The upstream `rolesPermissions` cache, `ObjectPermissions` type, `RoleService` and `RoleModule` stay upstream verbatim.
- **`RECONCILIATION` flag (C8):** the enum member, SystemPermissionFlag `091125f0-bdb5-4c67-944f-8c4c66de4a76` and the standard flag definition; defaults derive from the enum; never in `TOOL_PERMISSION_FLAGS`.
- **Timeline activity row-level security (HIPAA).** `timelineActivity` is a system object whose `properties.diff`, `linkedRecordCachedName` and `searchVector` carry values of the records an activity describes. Omnia (`packages/twenty-server/src/modules/timeline/`) redacts those three fields on activities describing records the reader cannot read (batched `filterGrantedRecordIds` with the requester's principals, fail closed), refuses filtering, ordering or grouping by them for restricted readers (including readers held only by row-level rules, and when restriction information is missing), drops events whose `before` or `after` snapshot describes an unreadable record (SSE, webhooks, workflow, agent and logic-function triggers), and refuses non-system writers that would re-target, unlink or rename an activity, merge activities, or create one on records they cannot update. Search excludes timeline activities. **Drop when** upstream ties timeline activities to their records without related record paths, or Omnia turns related record paths on; re-run `omnia-timeline-activity-row-level-security.spec.ts` either way. Deferred: delete, destroy and restore of timeline rows (integrity only).

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The action-scoped `scope` model (`ALL` / `READ` / `WRITE`) everywhere: twenty-shared types, entities, DTOs, inputs, converters, GraphQL, the front builders. The database columns stay one more release for rollback (Gate 1, later releases).
- The v1 ORM and Omnia's RLS plumbing: `WorkspaceEntityManager`, `GlobalWorkspaceOrmManager`, the v1 insert and update query builders, `permissions.utils.ts`, the Omnia filter builder, the request-scoped RLS cache and the create/update validator.
- Mixed-scope tree validation (replaced by the ownership guard), the Omnia one-to-many matcher branch (never re-add), the RLS feature-gate override in the predicate services (the enterprise unlock covers it) and the broad insert skip of field-level checks (narrowed to the agent, `submittedDate` and RLS fields).
- The raw-SQL upsert connect tolerance and `IMPORT_PARTIAL_SUCCESS` (relation connects now go through upstream's permission-checked nested queries).
- `editWindowMinutes` in the `rolesPermissions` cache and in `ObjectPermissions`, and the `RoleService.createRole` lockdown hook (a listener replaces it).

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-server/src/engine/api/common/common-query-runners/common-group-by-query-runner.service.ts` | group keys would return a timeline activity's cached name, so grouping obeys the filter rule. |
| `packages/twenty-server/src/engine/core-modules/application/application-grant-role/utils/build-application-grant-role-from-to-flat-entity-maps.util.ts` | apps have no sidebar or user edit window (C3, C4) |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/__tests__/from-flat-object-permission-to-object-permission-manifest.util.spec.ts` | sidebar visibility and edit window round-trip too (C3, C4) unset overrides are omitted and imported back as null. |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/__tests__/from-flat-role-to-role-manifest.util.spec.ts` | the sidebar default and edit window round-trip too (C3, C4) an unset edit window is omitted and imported back as null. |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-flat-object-permission-to-object-permission-manifest.util.ts` | per-object sidebar visibility and edit window (C3, C4) |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-flat-role-to-role-manifest.util.ts` | role-wide sidebar default and policy edit window (C3, C4) |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-object-permission-manifest-to-universal-flat-object-permission.util.ts` | per-object sidebar visibility and edit window (C3, C4); the manifest is the source of truth for app-owned roles. |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-role-manifest-to-universal-flat-role.util.ts` | role-wide sidebar default and policy edit window (C3, C4) |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/utils/__tests__/export-covers-compared-properties.spec.ts` | exported only when set, so the fixture sets them (C3, C4) the edit window is exported only when set (C3) requiredCondition is workspace-owned (contract C5) relation sub-field columns (contract C6) navigation target FKs are compared, so the rename counts. |
| `packages/twenty-server/src/engine/metadata-modules/flat-object-permission/utils/from-create-object-permission-input-to-universal-flat-object-permission.util.ts` | per-object sidebar visibility and edit window (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/flat-role/utils/build-workspace-custom-application-flat-role.util.ts` | sidebar and edit window only apply to users (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/flat-role/utils/from-create-role-input-to-flat-role-to-create.util.ts` | role sidebar default and policy edit window. |
| `packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/create-object-permission.input.ts` | per-object sidebar visibility and policy edit window (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/object-permission.dto.ts` | per-object sidebar visibility and edit window (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/upsert-object-permissions.input.ts` | per-object sidebar visibility and edit window overrides; omitted means unchanged, null clears the override (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.entity.ts` | per-object sidebar visibility and edit window (C3, C4); created by legacy migrations, so no upgrade decorator. |
| `packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.service.ts` | sidebar visibility and edit window (C3, C4) omitted sidebar visibility and edit window stay unchanged, so callers that never send them cannot erase them. sidebar visibility and edit window changes count too. |
| `packages/twenty-server/src/engine/metadata-modules/object-permission/utils/from-flat-object-permission-to-object-permission-dto.util.ts` | per-object sidebar visibility and edit window (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/permission-flag/constants/__tests__/standard-permission-flag-definitions.constant.spec.ts` | the 2-6 and 2-53 backfills seed this flag from the definitions. |
| `packages/twenty-server/src/engine/metadata-modules/permission-flag/constants/standard-permission-flag-definitions.constant.ts` | gates the reconciliation pipeline mutations. |
| `packages/twenty-server/src/engine/metadata-modules/role/dtos/create-role.input.ts` | role-wide sidebar default and policy edit window (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/role/dtos/role.dto.ts` | role-wide sidebar default and policy edit window (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/role/dtos/update-role.input.ts` | role-wide sidebar default and policy edit window (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/role/role.entity.ts` | role-wide sidebar default; created by legacy migration 1771500000000, so no upgrade decorator. role-wide policy edit window in minutes (null = no limit); created by legacy migration 1772591146793, so no upgrade decorator. |
| `packages/twenty-server/src/engine/metadata-modules/role/utils/fromFlatRoleToRoleDto.util.ts` | role-wide sidebar default and policy edit window (C3, C4) getRoles/getRole build every Role DTO here; without the window the settings save sends null and clears it. |
| `packages/twenty-server/src/engine/metadata-modules/role/utils/fromRoleEntityToRoleDto.util.ts` | role-wide sidebar default and policy edit window (C3, C4) |
| `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/utils/__tests__/validate-row-level-permission-rule-ownership.util.spec.ts` | a parent outside this role and object, or a parent cycle, leaves the rule without a root group, so it would compile to {} and match every record. |
| `packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/utils/validate-row-level-permission-rule-ownership.util.ts` | a group whose parent chain leaves this role and object or loops back has no root group, so its rule compiles to {} and matches every record. |
| `packages/twenty-server/src/engine/permissions/constants/no-record-read-restrictions.constant.ts` | no row-level rule restricts this reader. |
| `packages/twenty-server/src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util.ts` | hop RLS (policy.agent → agentProfile.workspaceMember = Me) evaluated live as SQL EXISTS; access groups (materialized, stale windows) stay off in prod. |
| `packages/twenty-server/src/engine/permissions/internal/role/utils/__tests__/build-record-read-restrictions.util.spec.ts` | row-level restricted objects gate timeline value queries. |
| `packages/twenty-server/src/engine/permissions/internal/role/utils/__tests__/resolve-user-workspace-ids-with-permission-flag.util.spec.ts` | FlatRole carries the Omnia sidebar and edit window columns. |
| `packages/twenty-server/src/engine/permissions/internal/role/utils/build-record-read-restrictions.util.ts` | objects readable only in part, so timeline values can be refused to readers held to row-level rules. |
| `packages/twenty-server/src/engine/permissions/internal/role/utils/validate-operation-is-permitted-or-throw.util.ts` | creators also set the few fields their role locks afterwards (R-INSERT, Q16); every other uneditable field is still rejected on create. policy creators set the agent (directly or through an RLS hop) and submittedDate, which their role cannot edit afterwards; RLS create validation still runs on these values. |
| `packages/twenty-server/src/engine/permissions/types/record-read-restrictions.type.ts` | objects the reader reaches only through row-level rules. |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-flat-role-metadata.util.ts` | Admin sees every object in the sidebar (C4) |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-role-flat-metadata.util.ts` | role-wide sidebar default (C4) role-wide sidebar default and policy edit window (C3, C4) |
| `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/__tests__/flat-role-permission-flag-validator.service.spec.ts` | FlatRole carries the Omnia sidebar and edit window columns. |
| `packages/twenty-server/src/modules/timeline/query-hooks/apply-timeline-activities-visibility-restrictions.service.ts` | row-level security of the records an activity describes. the values an activity carries show only to readers of every record it describes. described records the reader cannot read leave nothing to filter field by field. system work reads everything; a reader whose permissions cannot be resolved reads none of it. |
| `packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-create-many.pre-query-hook.ts` | entries about a record are written only by those who may edit it. |
| `packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-create-one.pre-query-hook.ts` | entries about a record are written only by those who may edit it. |
| `packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-update-many.pre-query-hook.ts` | moving or unlinking an activity would hand its diff to readers of the new record. |
| `packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-update-one.pre-query-hook.ts` | moving or unlinking an activity would hand its diff to readers of the new record. |
| `packages/twenty-server/src/modules/timeline/query-hooks/timeline-query-hook.module.ts` | the visibility handler and write checks use the described records' row-level security. only system work merges timeline activities; writers must be able to edit what they describe. |
| `packages/twenty-server/src/modules/timeline/utils/add-timeline-activity-object-columns-to-select.util.ts` | linkedRecordId lets the row-level security check reach the linked record. the cached name and its search vector are checked against the same records as the diff. |
| `packages/twenty-server/src/modules/timeline/utils/assert-timeline-activity-properties-are-queryable-or-throw.util.ts` | the cached name and its search vector are other records' labels; ordering by either puts them in cursors. row-level rules hide records too; restrictions built without them count as restricted. |
| `packages/twenty-server/src/modules/timeline/utils/omit-restricted-fields-from-timeline-activity.util.ts` | exported for the row-level security check on the records an activity describes. |
| `packages/twenty-shared/src/constants/PermissionFlagType.ts` | gates the reconciliation pipeline (start runs, batch approve/apply review items). Admin passes via canUpdateAllSettings; grant explicitly to any non-admin reconciliation operator role. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794337540400-omnia-translate-scoped-row-level-permissions.command.ts` | W1 must translate Omnia ALL/READ/WRITE predicates before upstream's scope-blind 2.58 backfill, which would otherwise restrict Policy reads, widen dashboard writes and OR trees that v2.19 ANDed |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500009000-omnia-verify-permissions.command.ts` | W9 must fail the upgrade when RLS rules, PHI object grants, the reconciliation lockdown or PHI-egress command gates break the Omnia access contract |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/constants/omnia-row-level-permission-translation-namespace.constant.ts` | W1 namespace for deterministic rule, root group and id UUIDs; changing it breaks re-run idempotency |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-plan.type.ts` | W1 plan shape (rules, root groups, links, soft deletes, object grants) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type.ts` | W1 raw-SQL source rows, including the legacy scope column |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/convert-workspace-member-predicate-to-relation-hop.util.ts` | W1 converts policy.agent -> agentProfile.workspaceMember 'Me' predicates (both v2.19 shapes) into the C2 relation hop |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/format-scoped-row-level-permission-translation-report.util.ts` | W1 per-pair report: ids, labels and counts only, never predicate values (PHI) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/brokerage-agent-role-universal-identifier.constant.ts` | W9 checks Brokerage Agent on Policy by universal identifier, never by label |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/layout-engine-component-keys.constant.ts` | W9 warns (does not fail) on ungated layout commands |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/object-records-operation-types.constant.ts` | W9 operation list for the PHI and reconciliation reach checks |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant.ts` | W9 check names printed with each violation |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/synthetic-workspace-member-id.constant.ts` | Stand-in member W9 uses to compile rules outside a request |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/omnia-verify-permissions.command.ts` | CLI to rerun the W9 checks after every app install or sync |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts` | Shared W9/CLI verification service |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type.ts` | W9 violation shape: metadata ids and messages only |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/build-synthetic-member-field-values.util.ts` | W9 member values that let 'Me' predicates compile, so an empty filter is not misreported |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-read-restricted-searchable-field-violations.util.ts` | HIPAA: W9 must fail on a searchable field some role cannot read; search matches searchVector in WHERE, so that role finds records by the hidden value |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-relation-hop-target-write-violations.util.ts` | W9: a role holding relation-hop rules can neither edit the hop's member field (agentProfile.workspaceMember) nor delete the hop target records |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-without-grant-violations.util.ts` | W9 check 2: no rule grants nothing (a zeroed scope-blind translation) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-tree-integrity-violations.util.ts` | W9 check 4: no group or predicate hangs off a deleted group or one of another role, object or rule |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-unlinked-row-level-permission-violations.util.ts` | W9 check 1: every live predicate and group is linked to a rule of its own role and object |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/get-enforced-operation-types.util.ts` | W9 maps create onto update while create permissions are off, as the engine does |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/is-policy-agent-relation-hop-predicate.util.ts` | W9 matcher for the C2 hop policy.agent -> agentProfile.workspaceMember IS Me |
| `packages/twenty-server/src/modules/role-object-settings/dtos/object-sidebar-visibility.dto.ts` | ObjectSidebarVisibility GraphQL type (contract C4) must exist |
| `packages/twenty-server/src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver.ts` | UserWorkspace.objectSidebarVisibility field resolver (contract C4) must exist |
| `packages/twenty-server/src/modules/role-object-settings/role-object-settings.module.ts` | RoleObjectSettingsModule must exist; it registers the UserWorkspace.objectSidebarVisibility resolver |
| `packages/twenty-server/src/modules/role-object-settings/utils/resolve-edit-window-minutes.util.ts` | Edit window resolution util (contract C3) must exist; PolicyWriteAuthorizationService imports it |
| `packages/twenty-server/src/modules/role-object-settings/utils/resolve-show-in-sidebar.util.ts` | Sidebar visibility resolution util (contract C4) must exist |
| `packages/twenty-server/src/modules/timeline/constants/timeline-activity-described-record-value-field-names.constant.ts` | Omnia list of timeline fields that carry described records' values (diff, cached name, search vector) |
| `packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-merge-many.pre-query-hook.ts` | Omnia: only system work merges timeline activities (a merge fills an empty diff from another activity, dry runs included) |
| `packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-write-authorization.service.ts` | Omnia: non-system writers add timeline activities only about records they may update |
| `packages/twenty-server/src/modules/timeline/query-hooks/utils/assert-timeline-activity-description-is-not-updated.util.ts` | Omnia: non-system writers cannot change a timeline activity's targets, linked record, cached name or diff |
| `packages/twenty-server/src/modules/timeline/utils/filter-timeline-activity-events-describing-readable-records.util.ts` | Omnia timeline event filter used by filterReadableEvents |
| `packages/twenty-server/src/modules/timeline/utils/find-timeline-activities-describing-unreadable-records.util.ts` | Omnia timeline row-level check: one read check per described object, batched filterGrantedRecordIds with the requester's principals, fail closed |
| `packages/twenty-server/src/modules/timeline/utils/omit-described-record-values-from-timeline-activity.util.ts` | Omnia timeline redaction: empty diff and null cached name |

Plus 26 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## twenty-shared

Omnia additions in `packages/twenty-shared/src/` (barrels are generated by `nx run twenty-shared:generateBarrels`; the checks only assert the generated output still exports the Omnia symbols):
- `RequiredCondition` (C5) and the `requiredCondition` field type; role manifest `showInSidebar?: boolean | null` and `editWindowMinutes?: number | null` (C3, C4; the strict zod grant schema is untouched).
- `ViewFilterOperand.IS_NOT_RELATIVE` and its filter conversions, currency filter null safety, canonical one-to-many emptiness serialization.
- `utils/auth/derive-trusted-redirect-domain.ts` (`isExternalRedirectTrusted`, `deriveTrustedParentDomain`; https only, front host or its parent domain), used by the server sanitizer, the front redirect and the sibling cookie.
- `utils/address/normalizeUsState.ts` (export and import state normalization).
- Reconciliation helpers shared by server and front: `promotePrimaryToAdditional` (accepting a BOB phone or email keeps the old primary in `additional*`), `coerceFieldDiffValueForRecordUpdate`, `ReconciliationAutoApplyBlockingFlags`, `ReconciliationDefaultAutoMatchThreshold`.
- `SidePanelPages.ReviewItemComments`, the `RECONCILIATION` permission flag and its SystemPermissionFlag id (C8), and the ingestion pipeline settings paths.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- `RowLevelPermissionPredicateScope` and the predicate and group `scope` fields; `editWindowMinutes` on `ObjectPermissions` (C3); `FileFolder.Export` (R-EXPORT); the person `phonesUniqueIndex` key rename (R-PERSON-KEY: upstream `emailsUniqueIndex` is back).

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-shared/src/application/roleManifestType.ts` | sidebar visibility and edit window ride on the manifest by intersection; the strict grant schema is shared with AI run scopes. role-wide sidebar default and edit window (see above). |
| `packages/twenty-shared/src/constants/SystemPermissionFlag.ts` | reconciliation flag; this id is already stored in prod rows. |
| `packages/twenty-shared/src/types/FieldMetadataMultiItemSettings.ts` | LINKS fields holding call recordings render an audio player. |
| `packages/twenty-shared/src/types/SettingsPath.ts` | ingestion pipeline settings pages; URLs kept for bookmarks. |
| `packages/twenty-shared/src/types/ViewFilterOperand.ts` | workflow date filter "is not within the relative window"; never offered on view filters. |
| `packages/twenty-shared/src/utils/filter/__tests__/computeRecordGqlOperationFilter.test.ts` | one-to-many relation filters (traversal plus the canonical "has any / has no" emptiness shapes). |
| `packages/twenty-shared/src/utils/filter/__tests__/isRecordFilterOperandExpectingValue.test.ts` | workflow-only operand, takes a relative date like IS_RELATIVE. |
| `packages/twenty-shared/src/utils/filter/turnRecordFilterIntoGqlOperationFilter.ts` | relation direction for one-to-many emptiness. Loosely typed so front field items (generated enum) and server flat fields both fit. a to-many relation has no join column to null-check, so "has any / has no" goes through the related records' id instead. |
| `packages/twenty-shared/src/utils/filter/utils/__tests__/isMatchingCurrencyFilter.test.ts` | null-safety for unloaded currency values. |
| `packages/twenty-shared/src/utils/filter/utils/convert-view-filter-operand-to-core-operand.util.ts` | workflow-only operand; the map is exhaustive over the enum. |
| `packages/twenty-shared/src/utils/filter/utils/isMatchingCurrencyFilter.ts` | unloaded currency values reach here from the front matcher; only an IS NULL check can match them, instead of throwing. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-shared/src/constants/ReconciliationAutoApplyBlockingFlags.ts` | Shared blocking-flag list (client/server parity for batch apply scope) |
| `packages/twenty-shared/src/constants/ReconciliationDefaultAutoMatchThreshold.ts` | Shared reconciliation auto-match threshold (client/server parity) |
| `packages/twenty-shared/src/types/RequiredCondition.ts` | Shared soft requiredCondition type (contract C5) |
| `packages/twenty-shared/src/utils/address/normalizeUsState.ts` | Single shared US state normalizer (export column layer, front import, server import job) |
| `packages/twenty-shared/src/utils/composite/promotePrimaryToAdditional.ts` | Shared helper used by frontend + backend reconciliation Accept paths |
| `packages/twenty-shared/src/utils/reconciliation/coerceFieldDiffValueForRecordUpdate.ts` | Shared helper must coerce reconciliation diff strings before numeric record updates |

Plus 2 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Server metadata: requiredCondition, view-field sub-fields, navigation targets, ingestion pipelines

- **`requiredCondition` (C5).** `fieldMetadata.requiredCondition` (JSONB; `always`, `fieldEmpty`, `fieldNotEmpty` with a field id) with its DTO, inputs, editable and workspace-owned property configs (app syncs keep it) and `requiredCondition: null` in upstream flat-field builders, literals and mocks. It is a soft, UI-only rule: converting it to upstream validation rules would hard-block every ORM write, including ingestion, imports, workflows, reconciliation apply and edits to legacy rows with blanks (R-REQ).
- **View-field sub-fields (C6).** `viewField.subFieldName` with the `(fieldMetadataId, subFieldName)` unique index, DTO, inputs, flat builders and validator; upstream side-effect handlers and upserts set it only for user-added sub-field columns.
- **Navigation menu item target FKs** (`viewId`, `targetObjectMetadataId`, `pageLayoutId`) are compared in app manifest diffs (`toCompare: true`), so apps can switch a sidebar item between object, view and page-layout targets.
- **Field searchability on create and update** transpilers (with search U2): custom fields join search by default (Q14) and deactivated fields leave it.
- **Pinned Delete:** the standard command-menu constant is upstream; W4 consolidates production's legacy split rows and pins `deleteRecords` through a workspace override.
- **Workspace cache slow-path warnings** (resolution and per-provider recompute, including the batched rows load), because production runs without a `METER_DRIVER`.
- **Ingestion pipelines** (`packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/`, Omnia-only): configurable pull and push pipelines with field mappings, preprocessors (old CRM policies with `parseDateTimeAsEastern()`, HealthSherpa policies, Convoso calls with system-agent inbound calls forced non-billable, Convoso leads, Convoso time cards N→M per agent and day), scheduling and logs. On v2.58 it runs on `WorkspaceOrmManager` (`save()` returns arrays, duplicates surface as `isDuplicateEntryError`), `AccessPolicyGuard` with `API_KEYS_AND_WEBHOOKS`, scoped queue jobs, a required push webhook secret read from a header only and compared in constant time, SSRF-safe outbound calls, a pull-auth allowlist (a server env var such as `CONVOSO_API_TOKEN` is sent only for an allowlisted name, over https, to that name's host) and no record values in logs. The processors live in `IngestionPipelineModule`; pull crons re-register from `cron:register:all` (there is no `onModuleInit` re-sync). Logs keep a push's raw records (`incomingPayload`, PHI) only for debugging: the daily `IngestionLogRetention` cron clears them from completed runs, and the records and errors of every run older than 30 days (minimum necessary, as Q22); `ingestionLogs` accepts user sessions only (API keys, OAuth clients and applications are refused, since logs bypass record permissions) and returns at most 100 rows. The seeds are `workspace:seed-convoso-call-pipeline`, `workspace:seed-healthsherpa-pipeline` and `workspace:seed-convoso-time-card-pipeline`; `workspace:backfill-time-cards` enqueues chunked pulls.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The app-build system-field sanitizer (the v2.58 SDK no longer emits system fields; rebuild apps with the v2.58 tooling instead).
- The person uniqueness flip (emails not unique, phones unique): upstream definitions apply to new workspaces only. Never push a phones-unique index onto production (about 695 duplicate phones); production has neither index.
- Minimal-metadata cache priming (upstream treats a missing hash as stale), the nav-item validator's remaining maps, the field DTO `relationTargetObjectMetadataId`, the exported searchable tsvector column helper, and Omnia registrations in `metadata-engine.module.ts`.
- The pinned Delete edit in the standard command-menu constant (W4 replaces it).

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-server/src/database/commands/agent-history/utils/get-legacy-agent-history-flat-field-metadatas.util.ts` | FlatFieldMetadata carries the requiredCondition column (contract C5) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/2-26/2-26-workspace-command-1785255690000-demote-and-backfill-application-index-view.command.ts` | type-only; Omnia's FlatViewField has subFieldName. |
| `packages/twenty-server/src/engine/core-modules/application/application-content/utils/__tests__/build-application-content-from-flat-entity-maps.util.spec.ts` | FlatViewField carries the relation sub-field column. |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/__tests__/from-flat-view-field-to-view-field-manifest.util.spec.ts` | FlatViewField carries the relation sub-field column. |
| `packages/twenty-server/src/engine/metadata-modules/field-metadata/dtos/field-metadata.dto.ts` | soft, UI-only required rule (contract C5); inherited by Create/UpdateFieldInput. |
| `packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts` | soft, UI-only required rule (contract C5); the server never enforces it. No upgrade decorator: legacy migration 1773069763255 created the column. |
| `packages/twenty-server/src/engine/metadata-modules/field-metadata/utils/from-field-metadata-entity-to-field-metadata-dto.util.ts` | soft required rule (contract C5); the field(s) queries and REST read it from here. |
| `packages/twenty-server/src/engine/metadata-modules/flat-entity/constant/all-entity-properties-configuration-by-metadata-name.constant.ts` | soft required rule (contract C5) relation sub-field table columns (contract C6) sidebar visibility and edit window columns (contracts C3, C4) app manifests must diff navigation target FKs. |
| `packages/twenty-server/src/engine/metadata-modules/flat-entity/constant/workspace-owned-properties-by-metadata-name.constant.ts` | a workspace's required rule survives app and standard syncs (contract C5) |
| `packages/twenty-server/src/engine/metadata-modules/flat-entity/types/__tests__/flat-entity-update.type-test.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-editable-properties.constant.ts` | soft required rule (contract C5) soft required rule (contract C5); Lead is the standard person object. |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-relation-properties-to-compare.constant.ts` | Policy relation fields take a required rule (contract C5) |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-create-field-input-to-flat-field-metadatas-to-create.util.ts` | searchable-type fields added to an application's own searchable object join search by default (upstream: opt-in), so identifiers like policy numbers stay findable. |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-flat-field-metadata-to-field-metadata-dto.util.ts` | soft required rule (contract C5); the fieldsList API reads it from here. |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-update-field-input-to-flat-field-metadata.util.ts` | deactivating a field also takes it out of search so retired PHI stops matching (HIPAA); reactivation leaves it out. System and label-identifier fields keep upstream rules. |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/get-default-flat-field-metadata-from-create-field-input.util.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/metadata-modules/flat-object-metadata/utils/recompute-view-field-identifier-after-flat-object-identifier-update.util.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/metadata-modules/flat-view-field/utils/from-create-view-field-input-to-flat-view-field-to-create.util.ts` | relation sub-field column (e.g. "Lead / Date of Birth") |
| `packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/field-metadata/services/field-index-view-field-on-create-side-effect-handler.service.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/field-metadata/services/field-record-page-view-field-on-create-side-effect-handler.service.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/utils/compute-record-page-view-field-for-existing-object.util.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/utils/compute-system-view-fields-to-create.util.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/metadata-modules/object-metadata/constants/partial-system-flat-field-metadatas.constant.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/metadata-modules/object-metadata/utils/build-name-flat-field-metadata-for-custom-object.util.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/metadata-modules/view-field-group/services/fields-widget-upsert.service.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/metadata-modules/view-field/dtos/inputs/create-view-field.input.ts` | validates the relation sub-field column input. relation sub-field column (e.g. "Lead / Date of Birth") |
| `packages/twenty-server/src/engine/metadata-modules/view-field/dtos/view-field.dto.ts` | relation sub-field column (e.g. "Lead / Date of Birth") |
| `packages/twenty-server/src/engine/metadata-modules/view-field/entities/view-field.entity.ts` | the real index (legacy migration 1774500000000) is on COALESCE("subFieldName", ''); never generate a migration from this decorator. relation sub-field column, e.g. "dateOfBirth" on the "lead" relation; column created by legacy migration 1774500000000. |
| `packages/twenty-server/src/engine/metadata-modules/view/services/view-widget-upsert.service.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/metadata-modules/view/utils/__tests__/compute-missing-initial-object-view-operations.util.spec.ts` | relation sub-field columns. an INDEX view with a plain relation column and its sub-field columns must seed without identifier collisions. |
| `packages/twenty-server/src/engine/metadata-modules/view/utils/build-initial-view-field-flat-entity.util.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/metadata-modules/view/utils/compute-missing-initial-object-view-operations.util.ts` | distinct ids for copied relation sub-field columns. relation sub-field columns are copied with their sub-field. a relation sub-field column keeps its sub-field and gets its own id; sharing the plain column's id fails the whole seed. |
| `packages/twenty-server/src/engine/workspace-cache/services/workspace-cache.service.ts` | slow-path logs, since prod sets no METER_DRIVER for the cache metrics. slow-path log thresholds. logs slow resolutions (key names and stage durations, never values) rows load timer (the per-provider recompute timer starts after it) slow rows-load log (key names only), also covers invalidateAndRecompute. per-provider slow recompute log, also covers invalidateAndRecompute. |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/create-standard-field-flat-metadata.util.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/create-standard-relation-field-flat-metadata.util.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/__tests__/universal-flat-entity-update.test-type.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/metadata-universal-flat-entity-properties-to-compare.type.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/workspace-manager/workspace-migration/universal-flat-entity/utils/__tests__/add-universal-flat-entity-to-universal-flat-entity-and-related-entity-maps-through-mutation-or-throw.util.spec.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/workspace-manager/workspace-migration/universal-flat-entity/utils/__tests__/delete-universal-flat-entity-from-universal-flat-entity-and-related-entity-maps-through-mutation-or-throw.util.spec.ts` | soft required rule (contract C5) |
| `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-view-field-validator.service.ts` | a relation sub-field column is unique per subFieldName. |
| `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/__tests__/flat-entity-to-scalar-flat-entity.util.spec.ts` | fieldMetadata carries requiredCondition (contract C5) |
| `packages/twenty-server/test/integration/metadata/suites/field-metadata/create-and-delete-field-metadata-search-vector-side-effect.integration-spec.ts` | custom fields join search by default (Q14), so this field opts out. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-server/src/database/commands/custom/seed-convoso-time-card-pipeline.command.ts` | Time Card ingestion seed command |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500003000-omnia-consolidate-standard-delete-command-menu-items.command.ts` | W4 upgrade command replacing the legacy split delete/restore/destroy command menu items |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/legacy-split-record-command-menu-item-universal-identifiers.constant.ts` | Universal identifiers of the six legacy split command menu items W4 deletes |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-log-read-access-policy.constant.ts` | Ingestion logs (raw pushed records, PHI) are readable by user sessions only, never API keys, OAuth clients or applications |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-auth-env-vars.constant.ts` | Allowlist of server env vars a pull pipeline may send as query_param auth, with the hosts each may reach |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/commands/ingestion-log-retention.cron.command.ts` | `cron:ingestion-log:retention`, registered by `cron:register:all` |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/constants/ingestion-log-retention-cron-pattern.constant.ts` | Daily pattern for the ingestion log retention sweep |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/jobs/ingestion-log-retention.cron.job.ts` | Clears pushed records from completed runs, and records and errors from runs older than 30 days (PHI retention) |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-webhook-secret-header.constant.ts` | Push webhook secret header name (x-webhook-secret, header only per Q19) |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/filters/ingestion-pipeline-rest-api-exception.filter.ts` | REST exception filter for the push webhook (403 bad secret or disabled, 404 unknown pipeline) |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/time-card.preprocessor.ts` | TimeCardPreprocessor (N→M batch aggregation of Convoso productivity events) |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-error-log-label.util.ts` | Logs only the ORM error code (messages can echo a rejected value such as a DOB) |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-pipeline-exception-status-code.util.ts` | Maps ingestion exception codes to the webhook's HTTP status codes |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/is-allowed-ingestion-pipeline-auth-env-var.util.ts` | Decides whether a pipeline may send an env var to its source URL |
| `packages/twenty-server/src/engine/metadata-modules/view/utils/get-relation-sub-field-view-field-universal-identifier.util.ts` | Deterministic id helper for copied relation sub-field columns |

Plus 14 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Server query API: nested relations, metadata cache, events, one-to-many filters

- **Runners are upstream.** An explicit selection of a hidden field fails loudly and the UI never over-selects, so Omnia's restricted-field strip is gone (R-STRIP). Upstream merge-many has its own hidden-value guard.
- **Nested relations, depth 2** (`process-nested-relations.helper.ts`): many-to-one rows are assigned after the nested recursion, or depth-2 columns such as Policy / Lead / Lead Source come back empty. The bug is still upstream.
- **Metadata response cache:** upstream's dependency-hash cache plus Omnia operations in `metadata-graphql-operations-to-cache.constant.ts` (`FindFieldsWidgetViews` per userWorkspace, `FindAllRecordPageLayouts` per workspace); `FindManyLogicFunctions` is never cached (its response is filtered per calling application); API keys and applications skip the cache. `use-cached-metadata.ts` logs slow misses with ids and flags only.
- **Record events:** upstream `filterReadableEvents` scopes SSE and webhook events by the reader's permissions; Omnia copies event records per subscriber so enrichment never leaks relations loaded with another subscriber's permissions. Webhooks therefore need an API key role with read on their objects.
- **One-to-many relation filters** use upstream's to-many `EXISTS` with target RLS and field-read checks; W5 migrates stored view filters.
- **Query hooks** register only through `OmniaModulesModule`; none in `workspace-query-hook.module.ts`.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The restricted-field strip, the one-to-many filter input-type cache (a misplaced merge artifact), the workspace-schema build timing (off the request path in v2.58), the metadata event emitter import, the import event fan-out skip, the group-by RLS `await` fix (native now), the `EXPORT_JOB_PROGRESS` / `IMPORT_JOB_PROGRESS` subscription channels, `FileFolder.Export` in the file guard, and the app-scoped SDL workspace-custom inclusion (upstream walks relation targets).

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-server/src/engine/api/common/common-nested-relations-processor/process-nested-relations.helper.ts` | many-to-one assignment copies rows, so it waits for the recursion or depth-2 data such as policy.lead.leadSource is lost; one-to-many groups by a join column the recursion can null. |
| `packages/twenty-server/src/engine/api/graphql/graphql-config/constants/metadata-graphql-operations-to-cache.constant.ts` | boot metadata ops. The logic-functions op stays uncached: its response is filtered per calling application. |
| `packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts` | slow cache-miss log. Omnia runs without Sentry (HIPAA), so slow misses are logged with ids and flags only, never query text, variables or response data. API keys and applications share the undefined userWorkspace segment and widget fields resolve per application, so they skip the cache; with no key stored, onResponse cannot write for them either. |
| `packages/twenty-server/src/engine/permissions/record-event-permissions-read.service.ts` | a timeline activity event carries the diff and name of the records it describes, so it reaches only readers of those records (Omnia runs without related record paths). carrier book-of-business attachments (PHI). a reconciliation source file reaches only readers of the reconciliation objects, as in query results (restrictReconciliationAttachments) |
| `packages/twenty-server/src/engine/subscriptions/object-record-event/object-record-event-publisher.ts` | enrichment writes relations onto the records it is given, so each subscriber gets its own copies and never sends relations loaded with another subscriber's permissions. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500004000-omnia-migrate-one-to-many-view-filters.command.ts` | W5: moves Omnia one-to-many view filters (target field name in subFieldName) onto relationTargetFieldMetadataId |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/build-one-to-many-relation-filter-lookup.util.ts` | W5 lookup of one-to-many relation fields and active target fields (effective isActive) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/get-one-to-many-record-filter-fix.util.ts` | W5 classifier shared by view filters and the chart/workflow report |
| `packages/twenty-server/src/engine/subscriptions/object-record-event/utils/copy-event-records.util.ts` | Per-subscriber shallow copies of an event's before/after records for SSE relation enrichment |

Plus 6 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Search and AI (HIPAA)

- **Global search runs as the requester.** Upstream's auth-context search (RLS, field permissions) replaced Omnia's own search permission handling. Omnia hunks in `search.service.ts`: an object the caller cannot read is skipped (HTTP 200, no errors) instead of failing the search; formatted phone input collapses to digits; digit fragments of 3 or more digits (phone endings, policy-number middles) also use the guarded substring fallback; timeline activities are never searched (their label is another record's cached name).
- **Search surface:** upstream per-field `isSearchable` with its side-effect handlers; Omnia adds the create-time default for custom fields (Q14), de-indexing on deactivation, and the one-time W2 backfill for existing custom objects. Read-restricted fields are never indexed (W2 skips them; W9 fails on one).
- **AI telemetry ceiling:** `buildAiTelemetry` never records prompt or response content whatever the workspace AI data policy allows, and the evaluation runner and Sentry options follow the same rule (contract C15).
- **Bedrock** (`ai-providers.json`): the built-in `bedrock` catalog entry (native `@ai-sdk/amazon-bedrock`, role auth, `us-east-1`) is the only BAA-covered AI route. `AI_PROVIDERS` must not exist in config (it is admin-deletable, can be shadowed by a `core.keyValuePair` row and is enterprise-gated). The AI catalog sync script keeps the hand-maintained Bedrock route; `AI_MODELS_DEFAULT_*` in `omnia-values.yaml` pin Bedrock ids, so a dropped id silently empties a tier.
- **Policy search:** a policy's `name` is derived from carrier and product, so policy-number search relies on the `policyNumber` text column and the search coverage above.
- **No third-party egress from AI chat (HIPAA, no BAA):** `search_help_center` gets no descriptor and is not preloaded, so it can neither load nor run (it posted a model-written query, which can quote PHI, to docs.twenty.com); AI markdown renders only images served by the app or the server origin (`isMarkdownImageSourceAllowed`), so planted markdown cannot make the browser send PHI to another host. Links still need a click.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The Omnia all-field ILIKE fallback, the custom-object search-field helper and the 2-18 backfill copy (now W2), the person avatar image-identifier hunk (upstream is data-driven), and the `database-tool.provider.spec.ts` fixture.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-server/scripts/ai-catalog-sync/__tests__/self-host-projection.spec.ts` | the hand-maintained Bedrock route is outside the projection. |
| `packages/twenty-server/scripts/ai-catalog-sync/index.ts` | carry the hand-maintained Bedrock route over, since the projection never produces it. |
| `packages/twenty-front/src/modules/ai/components/MarkdownRenderer.tsx` | first-party image sources only (PHI). only first-party images, so planted markdown cannot send PHI to another host. |
| `packages/twenty-server/src/engine/core-modules/search/services/search.service.ts` | phones are indexed as bare digits, so collapse a pasted, formatted phone number before tokenizing. skip an object the caller cannot read instead of failing the whole search. a timeline activity's search label is another record's cached name, which search cannot hold to that record's row-level security. digit fragments (phone endings, policy number middles) also need the substring fallback. strip() drops tsvector positions, so a digit fragment matches indexed words only. |
| `packages/twenty-server/src/engine/core-modules/tool-provider/constants/common-preload-tools.const.ts` | search_help_center is not offered (third-party egress, no BAA) |
| `packages/twenty-server/src/engine/core-modules/tool-provider/providers/action-tool.provider.ts` | no search_help_center. It posts a model-written query (which can quote PHI) to docs.twenty.com, which has no BAA; without a descriptor the tool can neither load nor run. |
| `packages/twenty-server/src/engine/metadata-modules/ai/ai-evaluation/services/ai-evaluation.service.ts` | evaluation spans go through the HIPAA ceiling in buildAiTelemetry. |
| `packages/twenty-server/src/engine/metadata-modules/ai/ai-evaluation/services/native-evaluation.runner.ts` | context for the HIPAA telemetry ceiling in buildAiTelemetry. upstream passes no telemetry, and AI SDK defaults record evaluated state (PHI) whenever a telemetry integration is registered. |
| `packages/twenty-server/src/engine/metadata-modules/ai/ai-models/__tests__/ai-sdk-call-sites.spec.ts` | a model call without buildAiTelemetry falls back to AI SDK defaults, which record PHI. |
| `packages/twenty-server/src/engine/metadata-modules/ai/ai-models/constants/ai-telemetry.constant.ts` | prompts/responses contain PHI (HIPAA) — never record content, only timing/token spans. Upstream defaults both to true. |
| `packages/twenty-server/src/engine/metadata-modules/ai/ai-models/utils/__tests__/build-ai-telemetry.util.spec.ts` | upstream expects recording here; prompts and responses carry PHI. |
| `packages/twenty-server/src/engine/metadata-modules/ai/ai-models/utils/build-ai-telemetry.util.ts` | ignored, the HIPAA ceiling below never records content. never record PHI prompt/response content (HIPAA), whatever the workspace AI data policy allows. |
| `packages/twenty-server/test/integration/ai/suites/mcp-tool-catalog.integration-spec.ts` | search_help_center is not offered (third-party egress, no BAA). the docs search would send a model-written query to docs.twenty.com. |
| `packages/twenty-server/test/integration/metadata/suites/field-metadata/searchable-field/update-one-searchable-field-metadata.integration-spec.ts` | custom fields join search by default (Q14), so start opted out. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-server/scripts/ai-catalog-sync/constants/omnia-hand-maintained-provider-names.constant.ts` | Provider names the AI catalog sync carries over by hand (the Bedrock route) |
| `packages/twenty-front/src/modules/ai/utils/isMarkdownImageSourceAllowed.ts` | AI markdown loads images only from the app or the server origin (no click needed, so a foreign host could receive PHI) |
| `packages/twenty-server/scripts/ai-catalog-sync/utils/split-omnia-hand-maintained-providers.util.ts` | Splits the hand-maintained Bedrock provider out of the generated catalog so a sync keeps it |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.ts` | W2: one-time backfill restoring the all-searchable-fields search surface of workspace custom objects (policy numbers, application ids) |
| `packages/twenty-server/src/engine/core-modules/search/utils/normalize-search-input.ts` | Phone-number search input normalization (phone-shaped input only) |
| `packages/twenty-server/src/engine/core-modules/search/utils/should-run-ilike-fallback.ts` | Omnia substring-fallback trigger (CJK or digit fragment) |

Plus 8 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Omnia server modules: policy, call and person hooks, agent profile, dashboards, rollups, reconciliation

All of these are Omnia-only modules registered through `OmniaModulesModule`. They run on ORM v2: `getRepository` (permission-checked) for anything a user initiated, `getRepositoryWithoutPermissionChecks` only for system work with a one-line reason; `save()` returns an array; unique violations surface as `isDuplicateEntryError`.

- **Agent profile** (`modules/agent-profile/`): `AgentProfileResolverService` resolves the caller's Agent Profile from the flat metadata maps (the agentProfile relation named `workspaceMember`, else the only many-to-one relation to workspaceMember, the same rule as the W1/W9 hop). `AgentProfileAssignmentService` stamps `agentId` on new rows for user contexts only and is upsert-aware: an upserted row that matches a stored record keeps its owner (`modules/omnia/utils/find-upsert-matching-record-ids.util.ts`).
- **Policy hooks** (`modules/policy/`): create hooks stamp the agent and the derived "Carrier - Product" name and date `submittedDate` before the insert, for user contexts only, on rows the runner inserts. The post-save enrichment stamps LTV from the CarrierProduct commission. Update hooks delegate to `PolicyWriteAuthorizationService.assertUserMayUpdatePolicies`: engine RLS through `RecordPermissionsReadService.filterGrantedRecordIds` with user principals, then the configurable edit window (C3), with the RLS denial first. `updateMany` with a non-id filter resolves targets through the permission-checked repository (this closed a filter bypass). Upserts that match stored policies and `policy.mergeMany` are checked as edits.
- **Call and person hooks** (`modules/call/`, `modules/lead/`): agent auto-assign on create (user contexts only, upsert-aware). `PersonQueryHookModule` replaces `LeadQueryHookModule`; the `lead.*` hooks were dropped because there is no `lead` object.
- **Dashboard role-gating** (`modules/dashboard/dashboard-audience/`): a per-workspace **custom** MULTI_SELECT `audience` field on `dashboard` holds one option per gated role (value `ROLE_<roleIdHex>`, label the role name). A gated role is editable and lacks all-records access (`canUpdateAllSettings` roles see everything). Each gated role holds exactly one row-level rule on `dashboard` (C1) and its dashboard object grants are false, so the role sees, edits and deletes only dashboards tagged for it. `DashboardAudienceRoleSyncService` writes the rule first, then the dashboard denial (a failed denial leaves the previous access and a retry reads the grants back). A listener on `metadata.role.*` and `metadata.objectPermission.*` re-syncs (it waits until the upgrade has created the 2.58 rule table; W6 syncs every role afterwards). Create hooks tag a gated creator's new dashboard with its token (Q2), including upstream inserts that skip the hooks (dashboard duplication and the AI dashboard tool, through the `@Global()` `DashboardAudienceQueryHookModule`). The field stays custom because the standard-object sync would reset per-workspace options; option changes go through `FieldMetadataService.updateOneField` so the enum migrates. Manual re-sync: `workspace:sync-dashboard-audience`.
- **Agent rollups** (`modules/agent-rollup/`): per-agent `totalPolicies`, `placementRate6mo`, `billableHours` and `offPhoneHours` on `agentProfile`, recomputed hourly at :30 from `cron:register:all` (always on) with change-detecting writes; `workspace:compute-agent-rollups` runs it by hand.
- **Reconciliation** (`modules/reconciliation/`): a native NestJS module for carrier book-of-business (BOB) reconciliation with the custom objects `reconciliation`, `carrierConfig`, `reviewItem` and `reconciliationDecisionRule`. The core logic is unchanged (see "Reconciliation engine history" below); the data access runs on ORM v2 with transactions and a compare-and-swap state machine. The resolver is gated by `AccessPolicyGuard(RECONCILIATION_ACCESS_POLICY)`: user sessions only plus the `RECONCILIATION` flag (C8). Batch apply runs on the user's permission-checked repositories, one transaction per item, pre-checks with `findPolicyUpdateDenials` (`filterGrantedRecordIds`) and treats `affected === 0` as a skip. `ReconciliationObjectLockdownService` keeps every non-admin role out of the four reconciliation objects, from a listener on role and objectPermission events plus W7; it writes only the reconciliation rows and exempts only the standard admin. Bookkeeping writes (review items, run status, learned rules) skip event emission, so BOB values (names, DOBs, phones) never reach timeline activities or webhooks; CRM writes keep their events. Attachments that point at a reconciliation object are blanked for readers who cannot read it (a hunk in upstream `apply-attachments-visibility-restrictions.service.ts`), and their record events (SSE, webhooks, workflow, agent and logic-function triggers) are dropped for those readers (`filterReconciliationAttachmentEvents`, a hunk in `record-event-permissions-read.service.ts`). A pre-query hook blocks carrier renames while learned rules or review items reference the carrier.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The `lead.*` query hooks, the lockdown hook in `RoleService.createRole` and `role.module.ts`, `SettingsPermissionGuard` / `NoPermissionGuard` on the reconciliation resolver and `allowUndefined` user context, per-command registrations in `database-command.module.ts` (only the `OmniaCommandModule` import remains), Omnia registrations in `core-engine.module.ts` and `jobs.module.ts`, and the reconciliation services re-provided by the command module.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-server/src/modules/dashboard/services/dashboard-duplication.service.ts` | dashboard audience token for gated creators. tags a gated creator's copy with its dashboard audience token. create follows update, so a gated creator's audience rule needs its token on the copy. |
| `packages/twenty-server/src/modules/dashboard/tools/__tests__/create-complete-dashboard.tool.spec.ts` | {} is what admins and non-user contexts get, so the upstream cases keep their behaviour. a gated creator's audience rule refuses a new dashboard without the creator's token. |
| `packages/twenty-server/src/modules/dashboard/tools/create-complete-dashboard.tool.ts` | tags a gated creator's dashboard with its audience token. create follows update, so a gated creator's audience rule needs its token on the new dashboard. |
| `packages/twenty-server/src/modules/dashboard/tools/services/dashboard-tool.workspace-service.ts` | dashboard audience token for gated creators. tags a gated creator's dashboard with its audience token. |
| `packages/twenty-server/src/modules/dashboard/tools/types/dashboard-tool-dependencies.type.ts` | dashboard audience token for gated creators. tags a gated creator's dashboard with its audience token. |
| `packages/twenty-server/src/modules/messaging/common/query-hooks/attachment/apply-attachments-visibility-restrictions.service.ts` | reconciliation source files (PHI) read by the reconciliation source-file restriction below (renamed: the body declares its own flatFieldMetadataMaps) carrier book-of-business files (PHI) stay as admin-only as the reconciliation objects. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `docs/reconciliation/status-engine-authoring.md` | Status-engine author playbook (the documented engine contract) |
| `packages/twenty-server/src/database/commands/custom/backfill-reconciliation-decision-rules.command.ts` | Backfill command for learned reconciliation decision rules |
| `packages/twenty-server/src/database/commands/custom/seed-carrier-config.command.ts` | Generic carrier-config seed command with pre-flight validation |
| `packages/twenty-server/src/database/commands/custom/seed-reconciliation-objects.command.ts` | Seed command that creates the Reconciliation + CarrierConfig custom workspace objects |
| `packages/twenty-server/src/database/commands/custom/sync-dashboard-audience.command.ts` | Dashboard audience bootstrap/re-sync command must exist |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500005000-omnia-sync-dashboard-audience.command.ts` | W6: normalizes the dashboard audience rules (contract C1) during the 2.58 upgrade, before the W9 verify step |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500006000-omnia-reconciliation-object-lockdown.command.ts` | W7: re-locks every non-admin role, app role and grant role out of the reconciliation objects in the 2.58 upgrade |
| `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/commands/ingestion-pull-schedules.cron.command.ts` | cron:ingestion-pull-schedules command (run by cron:register:all) |
| `packages/twenty-server/src/modules/agent-profile/agent-profile.module.ts` | AgentProfile module registration |
| `packages/twenty-server/src/modules/agent-profile/services/agent-profile-assignment.service.ts` | Agent profile assignment service (stamps the caller's agent profile on rows that will be inserted) |
| `packages/twenty-server/src/modules/agent-profile/services/agent-profile-resolver.service.ts` | AgentProfile resolver service |
| `packages/twenty-server/src/modules/agent-rollup/crons/compute-agent-rollups.cron.job.ts` | Agent rollup cron job must exist |
| `packages/twenty-server/src/modules/agent-rollup/jobs/compute-agent-rollups.job.ts` | Per-workspace agent rollup job (workspaceQueue) |
| `packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts` | Agent rollup compute service must exist |
| `packages/twenty-server/src/modules/call/query-hooks/call-query-hook.module.ts` | Call query hook module registration |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-denied-object-permission-grants.constant.ts` | Dashboard object grants of a gated role: all false, the audience rule decides (C1) |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-field-name.constant.ts` | Name of the custom audience MULTI_SELECT field on dashboard |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-inherited-object-permission-grants.constant.ts` | Rule grants a gated role carries over from its former dashboard object grants |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-option-colors.constant.ts` | Colors for audience options |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-predicate-id-namespace.constant.ts` | uuidv5 namespace for deterministic audience predicate ids |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-many.pre-query.hook.ts` | Dashboard audience auto-tag hook (createMany) must exist |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-one.pre-query.hook.ts` | Dashboard audience auto-tag hook (createOne) must exist: gated roles cannot create dashboards without their own token |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts` | Dashboard audience role-sync service must exist |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/types/dashboard-audience-grants.type.ts` | Dashboard audience role sync types (grants) |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/types/dashboard-audience-object-permission-grants.type.ts` | Dashboard audience role sync types (object-permission grants) |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-rows.type.ts` | Dashboard audience role sync types (a role's stored rows) |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-sync-plan.type.ts` | Dashboard audience role sync types (sync plan) |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/append-dashboard-audience-token.util.ts` | Appends a gated creator's role token to a dashboard's audience, without duplicates |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/are-dashboard-audience-options-equal.util.ts` | Skips the field update when the audience options are unchanged |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/compute-dashboard-audience-options.util.ts` | Audience options from the gated roles; surviving options keep their id, color and order |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util.ts` | Encodes a role id as the ROLE_<hex> option value |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/find-dashboard-audience-field.util.ts` | Finds the audience field in the flat metadata maps |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/find-dashboard-audience-role-rows.util.ts` | Loads a role's dashboard object permission and audience rule rows |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/find-dashboard-flat-object-metadata.util.ts` | Finds the dashboard object in the flat metadata maps |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/find-object-permission-event-role-and-object-ids.util.ts` | Reads role and object ids from objectPermission metadata events for the listener re-sync |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-option-color.util.ts` | Picks the color of a new audience option |
| `packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-predicate-ids.util.ts` | Deterministic audience predicate ids per role and dashboard |
| `packages/twenty-server/src/modules/omnia/utils/find-upsert-matching-record-ids.util.ts` | Shared upsert matching: which upserted rows update a stored record (agent stamping, dashboard audience, policy edit window) |
| `packages/twenty-server/src/modules/omnia/utils/is-row-level-permission-rule-schema-available.util.ts` | Omnia permission listeners must know when an upgrade has not created the 2.58 rule table yet |
| `packages/twenty-server/src/modules/policy/query-hooks/policy-create-many.pre-query.hook.ts` | Policy create-many pre-query hook |
| `packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts` | Policy create pre-query hook (agentId auto-assign) |
| `packages/twenty-server/src/modules/policy/query-hooks/policy-merge-many.pre-query.hook.ts` | policy.mergeMany must not bypass the edit window |
| `packages/twenty-server/src/modules/policy/query-hooks/policy-query-hook.module.ts` | Policy query hook module registration |
| `packages/twenty-server/src/modules/policy/query-hooks/policy-update-one.pre-query.hook.ts` | Policy update pre-query hook (edit window enforcement) |
| `packages/twenty-server/src/modules/policy/query-hooks/types/policy-update-target-record.type.ts` | PolicyUpdateTargetRecord type (update target plus stored carrier and product) |
| `packages/twenty-server/src/modules/policy/query-hooks/utils/find-policy-update-targets.util.ts` | Resolves the stored policies (id, createdAt, carrier, product) a policy update will write |
| `packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts` | Shared policy update authorization (engine RLS via filterGrantedRecordIds, then the edit window), used by the policy update hooks and reconciliation batch apply |
| `packages/twenty-server/src/modules/policy/types/policy-update-denial.type.ts` | PolicyUpdateDenial type (row-level-security or edit-window per policy) |
| `packages/twenty-server/src/modules/policy/types/policy-update-target.type.ts` | PolicyUpdateTarget type (id, createdAt) for policy update authorization |
| `packages/twenty-server/src/modules/policy/utils/stamp-submitted-date-on-new-policies.util.ts` | Policy submittedDate is stamped before the insert, only on rows a create or upsert inserts |
| `packages/twenty-server/src/modules/reconciliation/constants/reconciliation-access-policy.constant.ts` | Reconciliation access policy (user sessions only, RECONCILIATION permission flag) |
| `packages/twenty-server/src/modules/reconciliation/constants/reconciliation-bookkeeping-repository-options.constant.ts` | Reconciliation bookkeeping writes must skip event emission |
| `packages/twenty-server/src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener.ts` | Reconciliation lockdown listener re-locks roles after metadata changes (settings role flow, app syncs, RLS rules) |
| `packages/twenty-server/src/modules/reconciliation/query-hooks/carrier-config-update-one.pre-query.hook.ts` | carrierConfig rename guard (learned rules/overrides join on carrierName) |
| `packages/twenty-server/src/modules/reconciliation/reconciliation-core.module.ts` | Reconciliation services shared by ReconciliationModule (API, worker) and OmniaCommandModule (CLI) |
| `packages/twenty-server/src/modules/reconciliation/reconciliation-object-lockdown.module.ts` | Reconciliation lockdown module (service + listener), imported by ReconciliationCoreModule and OmniaUpgradeVersionCommandModule |
| `packages/twenty-server/src/modules/reconciliation/services/carrier-config-validation.service.ts` | validateCarrierConfig pre-run validation service (dry-run the fail-fast chain) |
| `packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts` | Learned reconciliation decision rule service |
| `packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts` | Shared reconciliation object lockdown service (seed command, W7 upgrade command, metadata-event listener) |
| `packages/twenty-server/src/modules/reconciliation/services/review-item-reconcile.util.ts` | Non-destructive re-run reconcile planner (decided review items must survive match re-runs) |
| `packages/twenty-server/src/modules/reconciliation/types/carrier-config.ts` | Validated carrier pipeline config boundary (parseCarrierPipelineConfig) |
| `packages/twenty-server/src/modules/reconciliation/utils/build-reconciliation-job-options.util.ts` | Single source of the reconciliation enqueue scope and per-phase deduplication id |
| `packages/twenty-server/src/modules/reconciliation/utils/filter-reconciliation-attachment-events.util.ts` | Drops reconciliation source-file attachment events for readers who cannot read the reconciliation objects (events skip the query runners' restriction) |
| `packages/twenty-server/src/modules/reconciliation/utils/restrict-reconciliation-attachments.util.ts` | Carrier book-of-business attachments (PHI) must be hidden from readers who cannot read the reconciliation objects |

Plus 34 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

### Reconciliation engine history (still current)

The v2.58 merge ported the reconciliation data access to ORM v2 and the permission engine but kept the engine logic (merge plan: reconciliation-core-logic KEEP). These tables record what that logic guarantees and why. File names are relative to `packages/twenty-server/src/modules/reconciliation/` unless they say otherwise.

Behaviour pinned since the v2 rewrite (`feature/reconciliation-v2`): batch Apply and Undo write policy and person diffs with the same semantics as the per-item actions, coerce numeric diff strings from the column mapping (no "Invalid number" on NUMBER fields), and cancel a previous policy version only when its id differs from the matched policy and it passes `resolveCancelTargetPolicy` (same lead, or same carrier and normalized policy number). Learned status rules (`decision-rule.service.ts`) auto-apply only strict status signatures and never reinstatement, broker-effective audit, multi-match or name-mismatch cases; undo deactivates a rule. A matched policy already in a `PAYMENT_ERROR_*` status that BOB cancels becomes `PAYMENT_ERROR_CANCELED`. Ambetter payment errors use current-month paid-through coverage (paid through the last day of the current month; missing paid-through data on an active policy is `PAYMENT_ERROR_ACTIVE_APPROVED`; BOB paid-through dates before the effective date count as missing). Effective-date diffs that would move a continuous prior-year policy to a January 1 rollover date are suppressed. Background: `docs/audits/reconciliation-audit-2026-06-10.md`, `docs/audits/reconciliation-remediation-plan.md`, `docs/audits/multi-carrier-readiness-audit-2026-06-11.md`, `docs/reconciliation/carrier-onboarding.md` and `docs/reconciliation/status-engine-authoring.md`.

#### Reconciliation audit remediation (2026-06-10 → 2026-06-11)

Full background: `docs/audits/reconciliation-audit-2026-06-10.md` (65 findings) and
`docs/audits/reconciliation-remediation-plan.md` (5 phases, all implemented). Linear:
project "Reconciliation remediation", OMN-5…OMN-9. Grouped entries below; the check
script pins the load-bearing invariants.

| File(s) | What | Why |
| --- | --- | --- |
| `twenty-server .../reconciliation/services/review-item-reconcile.util.ts` (new) + `review-item.service.ts` + `jobs/match.job.ts` | Non-destructive match re-runs: `reconcileMatchResults` preserves decided review items by stable identity (carrierPolicyNumber/crmPolicyId), refreshes PENDING in place, deletes stale PENDING, all in one transaction. `deleteByReconciliation`+`batchCreate` are gone. | Re-runs (REVIEW→MATCHING) previously hard-deleted every reviewer decision, the audit trail, and the override-learning source (audit Phase 1). |
| `seed-reconciliation-objects.command.ts` (reviewItem fields) + `match.job.ts` + `review-item.service.ts` | First-class reviewItem columns: `carrierPolicyNumber`, `carrierName`, `cancelPreviousPolicyId`, `cancelPriorStatus`, `cancelPriorExpirationDate`; `fetchOverrides` is a typed carrier-scoped query (snapshot-key guessing removed, legacy fallback kept). Cancels capture prior state on APPLY and restore it on UNDO. | Overrides were silently lost to header-shape drift and stamped with the wrong carrier; auto-cancels were unrecoverable (audit Phase 1). |
| `services/decision-rule.service.ts` + `review-item.service.ts` + `backfill-reconciliation-decision-rules.command.ts` | Rule-learning safety: `hasCancelAction` excludes cancel-bearing items from signatures and auto-apply; auto-rule applies never execute cancels; undo of an auto-applied item deactivates the rule (`deactivatedAt`/`deactivationReason`) and leaves a human-veto marker (PENDING + retained `decisionRuleSignatureHash`); backfill learns only from human approvals (`isHumanApprovedReviewItem`), never resurrects deactivated rules, idempotent counts. | Learned rules could silently cancel other policies with no review and undone items re-applied themselves (audit Phase 1). |
| `services/state-machine.service.ts` + `services/mutation.service.ts` + `orchestrator.service.ts` + both jobs | Compare-and-swap state machine: `updateReconciliationIfStatus` conditional updates, `TransitionConflictError`, jobs re-read status at start and exit cleanly on stale delivery, `setFailed` skips post-step states, stuck-run recovery (stats `parsingStartedAt`/`matchingStartedAt` + 30-min threshold, FAILED-then-restart), `REVIEW→COMPLETED` terminal transition (fired by review-item service when the last item is decided). | Concurrent triggers could duplicate review items and stale retries stomped healthy runs to FAILED; crashed workers stranded runs forever (audit 3.19). |
| `twenty-front .../reconciliation/components/MatchedDiffView.tsx` + `ReconciliationReviewBody.tsx` + `SidePanelReviewItemCommentsPage.tsx` + `utils/getBatchActionCandidates.ts` (new) | One write path: server `batchApplyReviewItems` does all CRM writes (prefetched IN-query, per-item transactions); client write mirror, `enrichFieldDiffs` INFO_ONLY→UPDATE promotion, and the view-triggered auto-approve effect are deleted; explicit "Mark approved" button; comments no longer clobber decisions; full pagination (no 1000 cap) with truncation guard; error snackbars on all decision actions. | Viewing a stale item used to trigger server writes with a rule-learning cascade and an infinite retry loop; batch scope diverged from the visible list (audit Phase 2). |
| `twenty-shared/src/constants/ReconciliationAutoApplyBlockingFlags.ts` + `ReconciliationDefaultAutoMatchThreshold.ts` (new) | Blocking-flag list + auto-match threshold shared by server and frontend. | Client/server copies drifted independently (audit 2.7). |
| `engines/matching.ts` + `services/data.service.ts` | Best-candidate Tier 7/8 selection (deterministic tie-breaks, DOB corroboration, ties → NEEDS_REVIEW), `POLICY_NUMBER_NARROWED_RECENT` method with capped confidence for recency-narrowed winners (narrowing restricted to all-terminal candidate sets), normalized policy numbers both sides, ordered pagination, DOB normalization, empty-name guards; null `carrierId` is a hard error and `MAX_POLICIES_FOR_MATCHING` caps the corpus. | First-above-threshold matching attached one person's payments to another's policy; unordered LIMIT/OFFSET pages skipped/duplicated policies (audit Phase 3). |
| `engines/diff.ts` | Shared guard chain for column + computed loops (computed loop gained the don't-clear-on-empty-BOB, unpopulated-field, amountMicros, stale-paid-through guards); subscriber-mismatch suppression extended to lead email/phone/state; Jan-1 rollover suppression for any later year; negative-to-negative suppression also gates the companion expirationDate diff; ''/null symmetry. | Blank BOB dates proposed nulling effectiveDate on the live Ambetter path; the spouse-overwrite incident fix missed contact fields (audit Phase 3). |
| `engines/status.ts` + `types/field-config.ts` + `types/policy-statuses.ts` (new) | Cancel signals checked before the missing-effective-date default; reinstatement gate uses the shared negative-terminal set; UTC date math in `subtractDays`; one `deriveBrokerEffAudit` implementation used by both matched and unmatched branches; one shared home for status sets; `deriveCategory` treats null derived status as no assertion. | DST off-by-one expirations, payment-error reinstatements bypassing review, and three divergent copies of Jackie's rule (audit Phase 3/4). |
| `parsers/transforms.ts` + `jobs/parse.job.ts` + `parsers/xlsx.ts` | Hardened transforms: calendar validation (no fabricated dates), two-digit-year pivot, Excel-serial decoding only for numeric cells, `TransformError` feeding the per-cell error machinery so `stats.parseErrors` works; `buildTransforms(rules)` per-carrier vocabulary (dateFormats incl. DD/MM, boolean vocab, currency strip, pivot); status-role header validation fails runs with unresolvable required roles; source attachment pinned on the reconciliation (`sourceAttachmentId`). | `12/30/63` DOBs became 2063, DD/MM files silently swapped month/day, and parse errors were structurally unreachable (audit Phase 3/4). |
| `types/carrier-config.ts` (new) + `match.job.ts` + `parse.job.ts` + `engines/status.ts` registry | One validated `parseCarrierPipelineConfig` boundary (zod, partial+defaults merge, actionable per-key errors); status engine keyed by `statusConfig.engineId` with fail-fast on unknown ids (`isKnownStatusEngine`); thresholds live on StatusConfig only; per-carrier `startDate` (sole remaining default documents the Omnia onboarding date); skip counters in run stats. | Partial config JSON crashed the match job; a second carrier either flooded review with empty items or silently got Ambetter payment semantics (audit Phase 4). |
| Deleted: `parsers/generic.ts`, `parsers/registry.ts`, `parsers/ambetter.ts`, `config/ambetter.field-config.ts`, `buildStatusInput`/`buildMatchInput`/`FieldConfigEntry` | The never-wired "unified FieldConfigEntry" parser stack removed after porting its real-data fixtures to the live path (`transforms.spec.ts`) and its data into the seed command. | Two parallel config models; the dead one was the only tested one (audit 4.1). |
| `seed-ambetter-carrier-config.command.ts` | Seeds live-shape `ColumnMappingEntry` mapping + explicit `transformRules`; update path merges (never overwrites user-captured columnMapping/statusConfig); never-read statusRules/explanationRules dropped; exports the Ambetter constants consumed by the e2e acceptance test. | Re-running the seed destroyed user-captured mappings and broke import-dialog prefill (audit 4.6). |
| `twenty-front .../reconciliation/utils/invertColumnMapping.ts` (new) + `UnmatchedView.tsx` + `buildSyntheticPolicyRecord.ts` | BOB values resolved through inverted columnMapping (+computed keys), Ambetter literals only as legacy fallback. | UnmatchedView hardcoded Ambetter headers, breaking any second carrier (audit 4.7). |
| `engines/__tests__/pipeline-real-data.spec.ts` | Stub replaced with the two-carrier e2e acceptance test (real Ambetter rows + fictional DD/MM "Oscar" carrier, carrier isolation + registry fail-fast). | Phase 4 exit criterion: a second carrier is pure config. |

#### Multi-carrier readiness (2026-06-12)

Implements all 32 endorsed proposals from `docs/audits/multi-carrier-readiness-audit-2026-06-11.md`
(Linear OMN-10/11/12) in six waves. Operator guide: `docs/reconciliation/carrier-onboarding.md`;
engine contract: `docs/reconciliation/status-engine-authoring.md`. Invariant held throughout:
every knob defaults to bit-for-bit current (Ambetter) behavior.

| File(s) | What | Why |
| --- | --- | --- |
| `engines/status.ts` + `parsers/transforms.ts` + `types/carrier-config.ts` + both jobs + `docs/reconciliation/status-engine-authoring.md` (new) | Self-describing status-engine registry (`STATUS_ENGINES` id → descriptor with `requiredRoles`/`knownRoles`/`paramsSchema`), per-engine required-role PRESENCE validation, `statusConfig.engineParams` channel validated by the engine's own schema, `StatusInput.extraRoles` bag for non-standard columns, exported generic ACA mechanics, authoring playbook. | "Reusing Ambetter's logic" was copy-paste with no contract; a missing role mapping silently produced blanket statuses (audit, status-engines lens). |
| `twenty-front .../hooks/useOpenReconciliationWizard.ts` + `components/ReconciliationCarrierPickerModal.tsx` (new) + `utils/resolveCarrierConfigSelection.ts` (new) + `RecordIndexContainer.tsx` (mount line) | Carrier picker: wizard routes 0 configs → guidance, 1 → unchanged direct open, 2+ → sorted picker modal; selected config drives creation + columnMapping prefill. | The wizard hardcoded the FIRST carrierConfig record — a second carrier's runs could not be started at all (the audit's headline blocker). |
| `seed-carrier-config.command.ts` (new) + `custom/omnia-command.module.ts` (registration) | Generic `workspace:seed-carrier-config --file <json> [--validate-only] [--dry-run]` with pre-flight refusals (explicit startDate + engineId required, unknown engine/tier/method, carrier resolution) and merge-don't-replace semantics bit-identical to the Ambetter seed; UHO example fixture. | Carrier onboarding required an engineer to hand-author JSON or copy the Ambetter seed (audit, domain-ui lens). |
| `components/ReconciliationRunSummaryBanner.tsx` (new) + `utils/getRunSummary.ts` (new) + `ReconciliationReviewBody.tsx` (mount) | Review-page run banner: status/errorMessage, stats incl. parseErrors + skip counters, collapsible `stats.warnings`, config fingerprint chip. | Config warnings and parse-error detail were server-log-only; the review UI rendered neither stats nor errors (audit, operability lens). |
| `types/carrier-config.ts` + `engines/matching.ts` | Config honesty: `enabledTiers` validated against `MATCH_TIER_IDS` (typo = hard fail), unknown keys warn at every object level, unknown computed methods hard-fail, startDate-inheritance warning, dead `paymentErrorAgeDays` removed (warn when stored ≠ default); `matchingConfig.tierTuning` exposes per-tier confidences, tier-6 weights (+30 agent bonus, 70 cap) and date-proximity bands with byte-identical defaults (parity corpus pins it). | Validated-but-dead knobs made the config object lie; tier internals were unreachable literals (audit, config-surface lens). |
| `services/carrier-config-validation.service.ts` (new) + `dtos/validate-carrier-config.dto.ts` (new) + `utils/config-fingerprint.util.ts` (new) + `query-hooks/carrier-config-update-one.pre-query.hook.ts` (new) + resolver + state machine + both jobs | `validateCarrierConfig` query replays the full fail-fast chain against the latest parsed run's real headers without enqueuing; runs persist deduped boundary warnings + a sha256-12 config fingerprint into `stats`; `REVIEW→PARSING` makes `startReconciliationParsing` the re-parse path (reviewer decisions survive via reconcile); pre-query hook blocks carrierName renames while learned rules/review items reference it. | "Tweak on the fly" previously meant burning a real run to test an edit, and renames silently orphaned learned rules (audit, operability lens). |
| `parsers/transforms.ts` + `parsers/xlsx.ts` + `jobs/parse.job.ts` + `types/carrier-config.ts` | Parse vocabulary: `parseSettings` (1-based `headerRow`, declarative `rowFilters`, `skipFooterRows` + `skippedByRowFilter` stat), `dateFormats` widened to 8 validated tokens incl. written months, computed methods + `params`: `firstNonEmpty`/`concat`/`conditional`/`arithmetic` (safe evaluator, no eval). | Header-below-row-1, footer rows, written dates, and richer computed fields each previously required code (audit, parse-transform lens). |
| `engines/diff.ts` + `types/policy-statuses.ts` + `types/field-config.ts` + `twenty-front .../utils/buildSyntheticPolicyRecord.ts` + `UnmatchedView.tsx` | Per-carrier `diffConfig` (6 suppression knobs incl. the agent-of-record skip and lead-identity field set; data-safety guards deliberately not exposed) and `statusVocabulary` (terminal/active sets, unknown statuses warn) threaded through diff/flags; UnmatchedView's client status fallback reads `placedThresholdDays` + vocabulary from the loaded config. | Diff suppression policy and the status vocabulary were cross-carrier law baked in code (audit, config-surface + domain-ui lenses). |
| `engines/matching.ts` + `jobs/match.job.ts` + `services/data.service.ts` + `services/review-item-reconcile.util.ts` + `types/carrier-config.ts` | BCBS identity unlock: `identifierRoles` (memberId/subscriberId/groupNumber → validated CRM snapshot fields) with an index-backed `IDENTIFIER_EXACT` tier gated on configuration; capture-group canonicalization in `policyNumberPattern` + `identifierNormalization` (leading zeros / prefix / suffix) applied symmetrically; `dedupStrategy` (`keepAll` appends `#ROW<n>` to review-item identity) and ordered `narrowingStrategies`; statusVocabulary threaded into narrowing. | Identity was single-role policy-number-shaped and dedup encoded Ambetter renewal semantics — member-ID carriers had to masquerade (audit, matching lens). |
| `jobs/match.job.ts` + `engines/matching.ts` + `types/carrier-config.ts` + `services/review-item-reconcile.util.ts` | Missing-from-BOB + policy-number discovery ported from the v1 app behind default-off knobs (`enableMissingFromBob` consuming `statusVocabulary.activeStatuses`; `enableDiscovery` + 0–1 thresholds, suggestions expressed as normal policyNumber diffs, sub-auto capped below the batch sweep); `stats.missingFromBob` real; items excluded from rule learning/auto-apply via existing category gates. | The knobs validated but drove nothing — the config object overpromised (audit, matching + config-surface lenses). |
| `seed-reconciliation-objects.command.ts` | New carrierConfig RAW_JSON fields seeded: `parseSettings`, `diffConfig`, `statusVocabulary`; `IDENTIFIER_EXACT` matchMethod option; statusConfig description rewritten (engineParams, no dead knob). | New knobs need fields on existing workspaces; SELECT enums fail inserts for unseeded values. |

---

## Apps platform and internal apps (Compliance QA, Brokerage)

- **Logic-function AWS credentials (HIPAA).** v2.58's LOCAL driver runs app code under Node's `--permission` model with an env allowlist, so pod credentials no longer reach app code. An Omnia hook in the LOCAL driver gives `AWS_CONTAINER_CREDENTIALS_FULL_URI` and `AWS_CONTAINER_AUTHORIZATION_TOKEN` only to registrations listed in `LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS` (env-only, comma-separated `core."applicationRegistration".id` values; empty grants none). Every LOCAL child gets `AWS_EC2_METADATA_DISABLED=true`; the pod env is never passed wholesale (`PG_DATABASE_URL`, `APP_SECRET`, `CONVOSO_API_TOKEN` never reach app code). Before go-live infra blocks pod access to IMDS (`HttpTokens: required` with hop limit 1, or a NetworkPolicy). LOCAL children also run without `--allow-addons`: native code is outside Node's permission model and could read the token file and `/proc/<server pid>/environ`; compliance-qa and Brokerage load no addons (an app that ships one fails to load). Follow-up: a per-app STS role for compliance-qa.
- **App manifests:** `requiredCondition` (C5), `subFieldName` (C6) and the role and object-permission `showInSidebar`, `showAllObjectsInSidebar` and `editWindowMinutes` (C3, C4) are added by type intersection plus importer and exporter lines. Lifecycle hooks run without a user by design (R-INSTALL): do not "fix" a failing hook by forwarding the installer; grant the app role what it needs.
- **App development:** v2.58 has no `DevelopmentGuard`. Production deploys use the global `twenty` CLI pinned to the server version (`npm install -g twenty@2.58.0`): `twenty app plan`, then `twenty app publish --private` and `twenty app install`, always with `--remote`, after a non-production rehearsal. Never `app dev` against production; check `~/.twenty/config.json`, whose default profile is production.
- **Compliance QA** (`packages/twenty-apps/internal/compliance-qa/`, v1.1.3 live in production): AI QA scoring of sales calls. Calls pass the eligibility filter (duration, rollout date, direction, sale dispositions, queue, lead source), the recording is copied to S3, transcribed by Deepgram (`nova-3`, `language=multi`, `diarize=true`, and `mip_opt_out=true` on every request as a BAA/PHI requirement; deterministic `dg-v1` transcript cache and an S3 conditional-put claim so overlapping polls never double-bill), Spanish is translated with Bedrock (Amazon Translate fallback), and Bedrock scores the transcript. `FAIL` is reserved for a confirmed (high-confidence) compliance red flag; the compliance-criteria average gates `PASS` vs `NEEDS_REVIEW`; sales effectiveness is coaching only. QA Manager follow-up tasks are created only for `FAIL` with a red flag. On v2.58:
  - `DEEPGRAM_API_KEY` reaches the app only as an encrypted **registration server variable** (Settings > Developers > Apps > Compliance > Config, or the admin panel's app registration page); it must belong to the BAA-covered Deepgram Enterprise project. Pod env no longer reaches app code. The `deepgram-credentials` Kubernetes secret is unused after the cutover; delete it only after the P2 smoke test shows transcription working (v2.6 pods reference it until the Helm upgrade).
  - Never reinstall or upgrade 1.1.x on v2.58: its post-install creates the "Compliance Call Pipeline" through the workspace Workflow API, which 2.58 drops, and hooks get no installing user. The upgrade migrates the existing pipeline to a core workflow with a new id (the 1.1.x id survives as `core."workflow"."workspaceWorkflowId" = '32ef78c2-f7f2-4e07-96b0-8b35e57b2d13'`), which keeps calling the 1.1.3 actions; P2 smoke-tests it.
  - 1.2.0 (follow-up release) replaces the post-install with `defineWorkflow`, adds the `COMPLIANCE_QA_AUTOMATIC_PROCESSING_ENABLED` kill switch and deactivates the legacy core workflow found by the lookup above at cut-over. Rebuild with the v2.58 CLI and SDK before any sync (system-field `NON_UPDATABLE_PROPERTY_DIVERGENCE` otherwise).
  - `.env.example` lists local-only variables; production AWS access comes from the Pod Identity container credentials above, never `AWS_PROFILE`.
- **Brokerage** (`packages/twenty-apps/internal/brokerage/`, not in production): the core brokerage model as an app (Agent `agentProfile`, Call, Carrier, Carrier Product, Product Type, Product, Family Member, Policy, Lead Source; Lead and Workspace Member extension fields; Agent and Manager role templates; curated sidebar, views and record page layouts; lead-status automation). **Deploy-gated (Gate 2).** Its post-install writer `ensureAgentPolicyOwnershipRls` follows C1 (Policy read-only at object level; one rule grants create and update through the C2 hop; no `scope`; other object permissions re-sent without touching `showInSidebar`/`editWindowMinutes`; a pair holding predicates it did not write is skipped with a message), but app tokens cannot write roles on v2.58, so it moves server-side with the Brokerage project. `workspace:adopt-brokerage-app` only dry-runs on v2.58 (only an explicit `--dry-run` is accepted). `docs/brokerage-app-spec.md` and `docs/brokerage-app-test-plan.md` describe the pre-v2.58 adoption path and `scope` model; the README gate governs until the project refreshes them.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- `packages/twenty-apps/internal/call-recording/` (superseded by the upstream standard `callRecording` object; SDK 0.7.0 cannot build on v2.58): export its data and uninstall it before the deploy (P0); uninstalling deletes its objects and records.
- `packages/twenty-apps/internal/payment-reconciliation/` (v1, app `d11726da-5de9-4482-a2b0-68dc18d25181`; superseded by the native reconciliation module): uninstall with `scripts/drop-payrecon-v1-app.sh` before the deploy.
- Installer user context in lifecycle hooks (R-INSTALL), the workspace-custom manifest dependency hunk (upstream `computeAllInvolvedApplicationIds`), the page-layout widget order hunk (upstream `normalizePageLayoutTabManifest`; needs one app re-sync after the upgrade), the system-field sync sanitizer, dead manifest utils and the orphan `create-application.input.ts`.
- The Brokerage adoption apply path (`syncAgentRoleFromMemberRole`, manifest identity stamping, app-shell creation): removed until the Brokerage project rewrites it to copy rules.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/__tests__/from-flat-field-metadata-to-field-manifest.util.spec.ts` | the workspace owns the required rule; exports omit it (C5) |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-field-manifest-to-universal-flat-field-metadata.util.ts` | manifests may carry the soft required rule (contract C5) soft required rule (contract C5) |
| `packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-view-field-manifest-to-universal-flat-view-field.util.ts` | only user-added relation sub-field columns set this. |
| `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local.driver.spec.ts` | the Pod Identity hook must reach a real sandboxed child, and only for allowlisted registrations (HIPAA). |
| `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local.driver.ts` | hands the AWS container-credentials allowlist to the child runner. |
| `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-child-process-runner.service.ts` | Pod Identity credentials for allowlisted app registrations (HIPAA). logger and registration allowlist for the AWS container-credentials hook in runChildWithEnv (env-only LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS). spread last so the pod's credentials win over same-named function variables. logs the error code only, because the message names the token file. |
| `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/types/local-driver.type.ts` | registrations whose functions get the pod's AWS container credentials. |
| `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/__tests__/build-local-child-process-node-flags.util.spec.ts` | native addons stay blocked (they bypass the permission model). an app's native addon could read the server's secrets. |
| `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-local-child-process-node-flags.util.ts` | no --allow-addons. Native code escapes the permission model and could read the pod's secrets and Pod Identity token; Omnia's apps (AWS SDK, twenty-sdk) load no addons. |
| `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/logic-function-driver.factory.ts` | Pod Identity allowlist (HIPAA). Env-only, so the LOCAL cache key stays the driver type and a restart applies a change. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `docs/brokerage-app-spec.md` | Brokerage app implementation spec must exist |
| `docs/brokerage-app-test-plan.md` | Brokerage production-readiness test plan must exist |
| `packages/twenty-apps/internal/brokerage/package.json` | Brokerage app package must exist |
| `packages/twenty-apps/internal/brokerage/src/constants/field-options.ts` | Brokerage shared field options must exist |
| `packages/twenty-apps/internal/brokerage/src/constants/universal-identifiers.ts` | Brokerage universal identifiers must stay stable |
| `packages/twenty-apps/internal/brokerage/src/fields/agent-profile-on-workspace-member.field.ts` | Brokerage Workspace Member must expose related Agent profile |
| `packages/twenty-apps/internal/brokerage/src/fields/assigned-agent-on-lead.field.ts` | Brokerage Lead must expose Assigned Agent |
| `packages/twenty-apps/internal/brokerage/src/fields/calls-on-lead.field.ts` | Brokerage Lead must expose related Calls |
| `packages/twenty-apps/internal/brokerage/src/fields/family-members-on-lead.field.ts` | Brokerage Lead must expose related Family Members |
| `packages/twenty-apps/internal/brokerage/src/fields/policies-on-lead.field.ts` | Brokerage Lead must expose related Policies |
| `packages/twenty-apps/internal/brokerage/src/navigation-menu-items/carriers-folder.navigation-menu-item.ts` | Brokerage Carrier/Product setup must stay grouped in the sidebar |
| `packages/twenty-apps/internal/brokerage/src/objects/agent-profile.ts` | Brokerage Agent object must exist |
| `packages/twenty-apps/internal/brokerage/src/objects/call.ts` | Brokerage Call object must exist |
| `packages/twenty-apps/internal/brokerage/src/objects/lead-source.ts` | Brokerage Lead Source object must exist |
| `packages/twenty-apps/internal/brokerage/src/objects/policy.ts` | Brokerage Policy object must exist |
| `packages/twenty-apps/internal/brokerage/src/views/call-record-page-fields.view.ts` | Brokerage Call record page must use a curated fields-widget view |
| `packages/twenty-apps/internal/brokerage/src/views/calls-mtd.view.ts` | Brokerage Calls must include an MTD view |
| `packages/twenty-apps/internal/brokerage/src/views/calls-today.view.ts` | Brokerage Calls must include a Today view |
| `packages/twenty-apps/internal/brokerage/src/views/lead-record-page-fields.view.ts` | Brokerage Lead record page must use a curated fields-widget view |
| `packages/twenty-apps/internal/brokerage/src/views/leads-mtd.view.ts` | Brokerage Leads must include an MTD view |
| `packages/twenty-apps/internal/brokerage/src/views/leads-today.view.ts` | Brokerage Leads must include a Today view |
| `packages/twenty-apps/internal/brokerage/src/views/policies-mtd.view.ts` | Brokerage Policies must include an MTD view |
| `packages/twenty-apps/internal/brokerage/src/views/policies-today.view.ts` | Brokerage Policies must include a Today view |
| `packages/twenty-apps/internal/brokerage/src/views/policy-record-page-fields.view.ts` | Brokerage Policy record page must use a curated fields-widget view |
| `packages/twenty-apps/internal/compliance-qa/.nvmrc` | Compliance app deploy action must have a local Node version file |
| `packages/twenty-apps/internal/compliance-qa/.oxlintrc.json` | Compliance app linting must use the standard Twenty app oxlint config |
| `packages/twenty-apps/internal/compliance-qa/src/constants/universal-identifiers.ts` | Compliance QA relation object and field identifiers must stay stable |
| `packages/twenty-apps/internal/compliance-qa/src/fields/qa-managers-on-workspace-member.field.ts` | Compliance QA manager records must be selectable workspace members |
| `packages/twenty-apps/internal/compliance-qa/src/fields/qa-scorecards-on-agent-profile.field.ts` | Compliance QA scorecards must relate back to Agent Profile records |
| `packages/twenty-apps/internal/compliance-qa/src/fields/qa-scorecards-on-call.field.ts` | Compliance QA scorecards must relate back to source Call records |
| `packages/twenty-apps/internal/compliance-qa/src/fields/qa-scorecards-on-lead.field.ts` | Compliance QA scorecards must relate back to source Lead records |
| `packages/twenty-apps/internal/compliance-qa/src/fields/qa-scorecards-on-task.field.ts` | Compliance QA scorecards must relate back to follow-up Task records |
| `packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts` | Compliance QA must create its visible workflow during app install |
| `packages/twenty-apps/internal/compliance-qa/src/navigation-menu-items/quality-assurance-folder-navigation-menu-item.ts` | Compliance QA sidebar views must stay nested under the Quality Assurance folder |
| `packages/twenty-apps/internal/compliance-qa/src/objects/qa-manager.ts` | Compliance QA app-owned manager assignment object must exist |
| `packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts` | Compliance QA scorecard app object must exist |
| `packages/twenty-apps/internal/compliance-qa/src/utils/aws-config.ts` | Compliance QA AWS clients must share one typed config helper |
| `packages/twenty-apps/internal/compliance-qa/src/utils/aws-translate.ts` | Compliance QA Spanish-to-English transcript translation helper must exist |
| `packages/twenty-apps/internal/compliance-qa/src/utils/error-message.ts` | Compliance QA must use explicit unknown error narrowing helpers |
| `packages/twenty-apps/internal/compliance-qa/src/utils/qa-call-eligibility.ts` | Compliance QA call eligibility filters must stay centralized |
| `packages/twenty-apps/internal/compliance-qa/src/utils/transcript.ts` | Compliance QA provider-neutral transcript domain (types/formatting/language helpers) must exist |
| `packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts` | Brokerage metadata adoption planner (dry run only on v2.58) must exist for existing Omnia workspaces |
| `packages/twenty-server/src/database/commands/custom/constants/brokerage-app-adoption.constants.ts` | Brokerage adoption constants must exist |
| `packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-aws-container-credentials-env.util.ts` | LOCAL logic functions get Pod Identity credentials only through this registration-bound hook (compliance-qa S3, Bedrock, Translate) |

Plus 7 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Export and import

- **Export is upstream record-export** (requester RLS, the `EXPORT_CSV` permission, streaming, a 60-second single-use session-bound download), replacing the Omnia export job. Omnia keeps a thin layer (`relationSubFields`): the view's relation sub-field columns (C6) become export columns; every to-one relation group gets a `<Relation> / Id` column filled from the root join column, so a re-import reconnects the exact record (without it, two August 2026 imports silently re-pointed 168 policies to blank duplicate leads, OMN-465); label columns for to-one relations; ONE_TO_MANY cells use upstream's LATERAL cap plus an Omnia grouped COUNT through the RLS repository (`+N more`, newest first); ONE_TO_MANY back-references to the exported object are skipped (a "Product / Policies" column on a policy export fanned out to ~43M labels and crash-looped the worker on 2026-08-22); composite fields export a simplified subset and US states are normalized. The front `ExportRecordsCommand` always uses the server job (`downloadAsync` / `cancelAsync`), with the sub-field split in `useRecordIndexExportParameters.ts`. W8 purges the legacy `export/exports/*` CSVs (PHI).
- **Import is a server job** (`packages/twenty-server/src/engine/core-modules/import-job/`, Omnia-only) that runs as the requester: RLS and field permissions apply, the `IMPORT_CSV` permission is checked, `importJob` rows carry `userWorkspaceId` (I2) and the `importJob` query returns only the requester's jobs (C14). Row ids are pre-assigned; each batch splits into `insert` (CREATED) and `updateMany` (UPDATED with before/after diffs), never a blind upsert, so re-imports leave timeline history. Relation resolution reconnects by explicit id and does fuzzy lead matching server-side. A job found `PROCESSING` at start is marked `FAILED` ("worker restarted"). A cron clears staged `validatedRows` (PHI) 30 days after the job ends (Q22).
- **Import front:** the spreadsheet dialog submits to the server job (relation update fields, reconciliation carrier-config pre-fill through `precomputedMatches`, whitespace trim, `= 0` means no row limit); a 3-second poller and `BackgroundJobIndicator` (import only) mounted in `WorkspaceAppProviders.tsx` show progress (R-IMPORT-UI); sign-out clears `activeImportJobId`. A queue-job/toast swap is a follow-up.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The Omnia export engine (`engine/core-modules/export-job/`, `exportQueue`, `FileFolder.Export`, the front poller `useExportJobProgress` and `ExportJobRecoveryEffect`, the `EXPORT_JOB_PROGRESS` channel, `json-2-csv`, client-side CSV relation labels). `core."exportJob"` stays one release for rollback.
- The upsert connect tolerance and `IMPORT_PARTIAL_SUCCESS`, the import event-emission policy, and the front fuzzy-match utilities (`ImportResultsSummary`, `generateProblemRowsCsv`, `scoreLeadMatch`, `findLeadCandidates`, `applyLeadResolutions`).

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-front/src/modules/auth/utils/clearSessionLocalStorageKeys.ts` | the next user on a shared machine must not re-attach to another user's import progress and row errors (CSV PHI). |
| `packages/twenty-front/src/modules/command-menu-item/engine-command/record/components/ExportRecordsCommand.tsx` | every index export runs as the server job, which re-checks the requester's permissions on PHI and keeps one CSV shape at any row count, sub-field columns included. |
| `packages/twenty-front/src/modules/command-menu-item/engine-command/record/components/__tests__/ExportRecordsCommand.test.tsx` | index exports always run as the server job; the local first-page CSV is never used. the server job starts once through StrictMode remounts and is cancelled on unmount. |
| `packages/twenty-front/src/modules/object-record/record-index/export/hooks/__tests__/useRecordIndexExportParameters.test.ts` | relation sub-field columns travel separately (contract C6) relation sub-field columns ("Lead / Date of Birth") travel as relationSubFields (contract C6) |
| `packages/twenty-front/src/modules/object-record/record-index/export/hooks/useRecordIndexExportParameters.ts` | a relation sub-field column ("Lead / Date of Birth", contract C6) goes in relationSubFields and sends its relation id once, at the relation's first column, where the server lays out that relation's "<Rel> / Id, <Rel> / <Label>, <Rel> / <Sub>" group. |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/__tests__/useBuildSpreadSheetImportFields.test.tsx` | plus the relation label field and a read-only "Additional Emails" field. relation label, update and read-only fields let an exported CSV re-import column for column. |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/__tests__/useOpenObjectRecordsSpreadsheetImportDialog.test.ts` | the dialog submits rows to the server import job instead of creating records in the browser. |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields.ts` | fields of the related record, so a re-imported export updates them through the relation column; columns the import must not change still match, as read-only fields. matches the export's "<Relation>" column, so a re-import can look the record up by name. upstream exports this id as "<Relation> Id"; matching it reconnects by id (OMN-465) see handleRelationUpdateFields. |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts` | rows go to the server import job, which writes them as the requester. Larger imports are uploaded in chunks of SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE, a few at a time. the import job is served by the metadata API, the default client. tracks the job after the dialog closes, or cancels it when the submit is cancelled. person-like targets (phones or emails) are matched and updated, others looked up by name. finalize is idempotent per job, so one retry learns whether a lost response had queued it; a job still in doubt is cancelled, so it can never run alongside the user's retry. up to one chunk is queued in a single call; more are uploaded, then queued by finalize. A cancel during the upload stops it before finalize, so that job is never queued. connect keys are renamed to "update:" keys so the server reads every relation column alike, and composite keys such as "Amount (premium)" are never mistaken for relation keys. set only while a submit runs, because the dialog also calls onAbortSubmit when it closes after a successful submit. the server resolves relations from dot-notation keys and relation labels, so the built connect objects are dropped and those keys are taken from the raw structured rows. the server import job writes the rows and the import poller refreshes the list when it ends, so there is no batch create and no finally eviction. Cancel discards or cancels the job. the submit checks this signal between upload rounds. |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow.ts` | relation label, update and read-only fields share the relation's fieldMetadataItemId. imported files often spell out the state ("Florida"); records store the 2-letter code. |
| `packages/twenty-front/src/modules/spreadsheet-import/constants/SpreadsheetMaxRecordImportCapacity.ts` | 0 = no row cap (steps check maxRecords > 0); the server import job handles files over upstream's 10k limit. |
| `packages/twenty-front/src/modules/spreadsheet-import/hooks/useComputeColumnSuggestionsAndAutoMatch.ts` | precomputedMatches for reconciliation. a carrier's saved column map is applied before Fuse. |
| `packages/twenty-front/src/modules/spreadsheet-import/steps/components/MatchColumnsStep/MatchColumnsStep.tsx` | allowDuplicateFieldMatching for reconciliation. reconciliation maps one field to several columns, so the column that already has the field keeps it. |
| `packages/twenty-front/src/modules/spreadsheet-import/steps/components/SelectSheetStep/SelectSheetStep.tsx` | onSheetSelected callback for reconciliation. reconciliation records which sheet each run read. |
| `packages/twenty-front/src/modules/spreadsheet-import/steps/components/UploadStep/UploadStep.tsx` | onSheetSelected callback for reconciliation. single-sheet files never reach SelectSheetStep. |
| `packages/twenty-front/src/modules/spreadsheet-import/steps/components/UploadStep/components/DropZone.tsx` | capacity 0 means no row cap, so there is no limit to show. |
| `packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportDialogOptions.ts` | payment reconciliation lets two columns share a field, gets the chosen sheet back, and pre-fills matches from the carrier's saved header -> SpreadsheetImportField.key map before Fuse runs. |
| `packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportField.ts` | relation update columns write targetFieldMetadataItem on the related record; read-only columns only match exported headers and are dropped before import. |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/dataMutations.ts` | validate the trimmed value that gets imported. |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/getMatchedColumnsWithFuse.ts` | reconciliation's saved header -> field key map. stricter than upstream's 0.3 so carrier headers do not auto-match loosely related fields. a saved match wins and gets no suggestions; the dropdown still lists every field. long relation labels share prefixes ("Lead / Phones / …") and tie, so a near-exact match wins outright; otherwise the best match must lead the next one by 0.05. |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/normalizeTableData.ts` | stray spaces in spreadsheet cells must not reach the record or defeat duplicate matching. |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/setColumn.ts` | precomputed matches pass a ReadonlyDeep field from SpreadsheetImportFields; `field` is only read, so either type is safe. |
| `packages/twenty-server/src/engine/core-modules/record-export/dtos/create-record-export.input.ts` | relation sub-field columns such as "Lead / Date of Birth" (contract C6) |
| `packages/twenty-server/src/engine/core-modules/record-export/services/record-export-query.service.ts` | requester-scoped reads for the relation sub-field layer. relationSubFields feeds the relation sub-field layer below. requester exports get Omnia's relation sub-field columns and composite subset (CUSTOMIZATIONS.md "Record export"); the system-context workspace data export keeps upstream's lossless columns. keeps the page to fill its relation sub-field cells (Lead / Id, labels, one-to-many lists) |
| `packages/twenty-server/src/engine/core-modules/record-export/types/record-export-parameters.type.ts` | relation sub-field columns (contract C6) |
| `packages/twenty-server/src/engine/core-modules/record-export/types/record-export-query-context.type.ts` | how readPage fills the relation sub-field cells. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/relationImportTypes.ts` | RelationBehavior type, mirrors the server's relation-resolution.types.ts |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldKey.ts` | Key format for relation update fields |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldLabel.ts` | Label format for relation update fields |
| `packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/transformRowsForServerImport.ts` | Dialog keys to the import job's dot-notation relation keys |
| `packages/twenty-front/src/modules/spreadsheet-import/components/ImportJobRecoveryEffect.tsx` | Recovers and polls the tracked import; mounted in WorkspaceAppProviders |
| `packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/appendImportJobRows.ts` | appendImportJobRows mutation (chunked upload) |
| `packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/cancelImportJob.ts` | cancelImportJob mutation |
| `packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/createImportJob.ts` | createImportJob mutation (chunked upload) |
| `packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/finalizeImportJob.ts` | finalizeImportJob mutation (chunked upload) |
| `packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/startImportJob.ts` | startImportJob mutation (single request) |
| `packages/twenty-front/src/modules/spreadsheet-import/graphql/queries/importJob.ts` | importJob progress query |
| `packages/twenty-front/src/modules/spreadsheet-import/hooks/useCancelImportJob.ts` | Cancel action for the import progress card |
| `packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobPoller.ts` | 3-second import progress poller |
| `packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobProgress.ts` | startTracking for a server import job (used by the import dialog) |
| `packages/twenty-front/src/modules/spreadsheet-import/states/activeImportJobState.ts` | Tracked import job atom |
| `packages/twenty-front/src/modules/spreadsheet-import/types/ImportJobSummary.ts` | Shape of the importJob query result |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/getImportJobErrorMessages.ts` | Error messages shown on a finished import card |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/getImportJobLabel.ts` | Translated label for the import progress card |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/readStoredActiveImportJob.ts` | Reads and validates the stored import job |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/toBackgroundJobStatus.ts` | Maps server import statuses to the card status |
| `packages/twenty-front/src/modules/spreadsheet-import/utils/writeStoredActiveImportJob.ts` | Stores or clears the tracked import job |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-instance-command-fast-1794500000000-omnia-add-user-workspace-id-to-import-job.ts` | I2: adds core.importJob.userWorkspaceId, which scopes every import job query to its requester (C14) |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.ts` | W8: deletes the PHI CSVs and core.file rows the removed Omnia export job left under export/exports/ |
| `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-add-user-workspace-id-to-import-job-upgrade-command-name.constant.ts` | I2 step name, which the upgrade-aware ImportJobEntity.userWorkspaceId column points at |
| `packages/twenty-server/src/engine/core-modules/import-job/constants/import-job-processor-name.constant.ts` | Queue job name the import service enqueues and the processor handles |
| `packages/twenty-server/src/engine/core-modules/import-job/constants/import-job-summary-select.constant.ts` | Columns the import job API returns (never validatedRows) |
| `packages/twenty-server/src/engine/core-modules/import-job/crons/commands/import-job-validated-rows-retention.cron.command.ts` | cron:import-job:validated-rows-retention registers the retention cron |
| `packages/twenty-server/src/engine/core-modules/import-job/crons/constants/import-job-validated-rows-retention-cron-pattern.constant.ts` | Daily schedule of the import retention cron |
| `packages/twenty-server/src/engine/core-modules/import-job/crons/import-job-validated-rows-retention.module.ts` | Provides the retention cron job and exports its registration command |
| `packages/twenty-server/src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job.ts` | Daily cron that clears staged import rows (PHI) 30 days after an import ends or stalls |
| `packages/twenty-server/src/engine/core-modules/import-job/enums/import-job-status.enum.ts` | Import job status enum (uploading, pending, processing, completed, failed, cancelled) |
| `packages/twenty-server/src/engine/core-modules/import-job/import-job.module.ts` | Import job API module, registered only through OmniaModulesModule |
| `packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job-processor.module.ts` | Import job worker module, registered only through OmniaModulesModule |
| `packages/twenty-server/src/engine/core-modules/import-job/types/import-job-data.type.ts` | Import job queue payload { importJobId, workspaceId } |
| `packages/twenty-server/src/engine/core-modules/import-job/types/import-job-requester.type.ts` | Requester scope { workspaceId, userWorkspaceId } of every import job read and write |
| `packages/twenty-server/src/engine/core-modules/import-job/utils/assign-missing-import-row-ids.util.ts` | Assigns a uuid to every uploaded import row that has none |
| `packages/twenty-server/src/engine/core-modules/import-job/utils/from-import-job-entity-to-dto.util.ts` | Maps an import job row to its GraphQL DTO (no staged rows) |
| `packages/twenty-server/src/engine/core-modules/import-job/utils/relation-resolution.types.ts` | Relation behaviours and resolution plan types of the import job |
| `packages/twenty-server/src/engine/core-modules/import-job/utils/score-record-match.util.ts` | Person match scoring used by SMART_UPDATE relation resolution |
| `packages/twenty-server/src/engine/core-modules/record-export/dtos/record-export-relation-sub-field.input.ts` | RecordExportRelationSubFieldInput { fieldMetadataId, subFieldName } (contract C6) |
| `packages/twenty-server/src/engine/core-modules/record-export/types/record-export-relation-sub-field-plan.type.ts` | Plan of the synthetic relation sub-field cells |
| `packages/twenty-server/src/engine/core-modules/record-export/utils/build-relation-sub-field-export-context.util.ts` | Relation sub-field groups (<Rel> / Id, <Rel> / <Label>, <Rel> / <Sub>), to-one label columns and the Q11 composite subset |
| `packages/twenty-server/src/engine/core-modules/record-export/utils/flatten-relation-sub-field-export-values.util.ts` | Fills the relation sub-field cells of each export page |
| `packages/twenty-server/src/engine/core-modules/record-export/utils/format-one-to-many-export-list.util.ts` | One-to-many list format: Name • Type • MM/DD/YY items, +N more |
| `packages/twenty-server/src/engine/core-modules/record-export/utils/get-record-export-label.util.ts` | Related record label for export (FULL_NAME as First Last) |

Plus 17 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Front: roles and permissions settings

- **Record-level rules:** upstream rule storage, draft and save path, plus an Omnia per-operation "All records / Matching records" selector with invariant tests. Saves follow C1: an operation restricted by a rule has its object grant off.
- **"Agent is Me" hop authoring (C2):** the field picker offers relations to member-owned records (Policy ▸ Agent), the Me select writes the hop predicate, and ungrouped filters are wrapped in (and unwrapped from) a root group.
- **Create-time prefill and select options:** on upstream's single create rule, with a hop-aware AgentProfile prefill that skips unresolvable predicates without throwing.
- **Object-level form:** the edit window row (No limit, 5 minutes to 7 days; C3) and the sidebar visibility row (C4); role fragments and the default draft role carry `editWindowMinutes`, `showInSidebar` and `showAllObjectsInSidebar`. The current-user selectors (`objectShowInSidebarByObjectMetadataIdSelector`, `useIsObjectShownInSidebar`, which no production code consumes yet) read `currentUserWorkspace.objectSidebarVisibility`.
- **Marketplace permission summary** labels the `RECONCILIATION` flag (C8).

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The three scoped builders (`Read + write`, `Read only`, `Write only`) and every `scope` field, the Omnia type extensions (codegen replaces them), the organization-plan gate removal (the upstream entitlement gate passes through the enterprise unlock), the `useObjectPermissions` memo (upstream memoized selector), the dead cache `ObjectPermissions` type and the app-permissions tab synthetic role.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-front/src/modules/object-core/agents/utils/buildCoreAgentNewRole.ts` | agent roles have no sidebar. |
| `packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts` | the C2 hop prefill resolves its relation target and fetches the member's own record. contract C2 hop (policy.agent ▸ agentProfile.workspaceMember IS Me). Its create default is the member's own target record, their AgentProfile, never the raw member id. hooks cannot run inside the builder, so the hop target of the hook-level object is fetched here; the fallback object keeps the unconditional fetch valid when skipped. a hop predicate's field lives on the target object; it prefills below. C2 hop prefill, below direct predicates. Omitted while unresolved and for a call-time object (junction path, no prefetch); the policy create hook then stamps agentId. |
| `packages/twenty-front/src/modules/settings/members/components/__tests__/MemberPermissionsTab.test.tsx` | generated Role.showAllObjectsInSidebar is non-null (contract C4) |
| `packages/twenty-front/src/modules/settings/roles/constants/DefaultSettingsDraftRole.ts` | new roles show every object in the sidebar (contract C4) |
| `packages/twenty-front/src/modules/settings/roles/graphql/fragments/objectPermissionFragment.ts` | sidebar visibility and edit window per object (contracts C3/C4) |
| `packages/twenty-front/src/modules/settings/roles/graphql/fragments/roleFragment.ts` | role-wide edit window default (contract C3) role-wide sidebar default (contract C4) |
| `packages/twenty-front/src/modules/settings/roles/graphql/hooks/useUpsertRowLevelPermissionPredicatesMutation.ts` | the Agent is Me hop field the role save sends (contract C2) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/field-permissions/utils/__tests__/getRoleWithRemovedFieldPermission.test.ts` | generated Role.showAllObjectsInSidebar is non-null (contract C4) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/field-permissions/utils/__tests__/getRoleWithUpsertedFieldPermission.test.ts` | generated Role.showAllObjectsInSidebar is non-null (contract C4) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelObjectFormObjectLevel.tsx` | sidebar visibility and edit window rows (contracts C3/C4) own rows, kept out of the record-permission keys so they never grant read. |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionFieldSelectFieldMenu.tsx` | relations to member-owned records (contract C2) targets of relations to member-owned records (contract C2) a relation to a record owned by one workspace member (Policy ▸ Agent), so "Agent is Me" can be saved as the C2 hop. |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilderContent.tsx` | rows stored without a group (the C2 hop) render under a root group that the sync leaves unsaved. see initialization above (contract C2) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionMeValueSelect.tsx` | relations to member-owned records (contract C2) targets of relations to member-owned records (contract C2) "Me" on Policy ▸ Agent, saved as the C2 hop. |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelSection.tsx` | All records or Matching records per operation (contract C1) All records or Matching records per operation, so a role can read all and edit its own (contract C1) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionFilterInitialization.ts` | id of the root group for rows stored without a group (contract C2) "<Relation> is Me" hop rows (contract C2) rows stored without a group load under a root group (contract C2) the draft sync stores these rows back without a group while they are unchanged. same metadata as the draft sync, which owns the hops loaded here. the builder edits the C2 hops it writes; other hops stay hidden and untouched. a hop row sits on its relation field. hop rows depend on the hop metadata (contract C2) without a root group, rows stored without a group (the C2 hop) would not render, and "Add filter" would save a second rule that the engine ORs with them. read by the draft sync (contract C2) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionSyncToDraftRole.ts` | "<Relation> is Me" hop rows (contract C2) rows loaded without a group are stored back without one while unchanged (contract C2) root group that initialization added for rows stored without a group (contract C2) same metadata as initialization, so only hops it loaded are replaced. opening a rule stored without a group (the C2 hop) keeps it as stored. C2 hops are builder rows and are replaced with the filters, so none is duplicated or left stale. stored shape of the rows (contract C2) "Me" on a relation to a member-owned record is saved as the C2 hop. stored shape of the groups (contract C2) hop rows and rows stored without a group (contract C2) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion.ts` | "<Relation> is Me" hop (contract C2) a C2 hop row sits on its relation field (Policy ▸ Agent) set when the row is "Me" on a relation to a member-owned record. saved as the relation hop (contract C2), never as the legacy relation-to-member-id comparison, which matches nothing (IS) or everything (IS_NOT) |
| `packages/twenty-front/src/modules/settings/roles/role/components/SettingsRoleCreateEffect.tsx` | new roles show every object in the sidebar (contract C4) |
| `packages/twenty-front/src/modules/settings/roles/role/components/__tests__/SettingsRole.test.tsx` | generated Role.showAllObjectsInSidebar is non-null (contract C4) |
| `packages/twenty-front/src/modules/settings/roles/role/hooks/__tests__/useSaveDraftRoleToDB.test.tsx` | the rule upsert carries the Matching records grants (contract C1) folds saved rules into the draft as the role page does (contract C1) predicate, rule and object-permission documents for the C1 round trips. captures the object-level and rule grants sent on save (contract C1) role-wide edit window and sidebar defaults are sent on create and update (contracts C3, C4) Omnia role columns; generated Role.showAllObjectsInSidebar is non-null (contracts C3, C4) record-level rule grants on Policy (contract C1) |
| `packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts` | save-time All records / Matching records resolver (contract C1) role-wide edit window and sidebar defaults (contracts C3, C4) the draft rule holds the All records / Matching records choice (contract C1) re-sent rows keep their sidebar visibility and edit window (contracts C3, C4) operations on all records keep their object-level grant and matching ones are an explicit false, so agents keep reading every Policy while editing their own (contract C1) sidebar visibility and edit window survive the filter removal (contracts C3, C4) the rule grants only the operations restricted to matching records, every flag explicit (contract C1) every rule flag explicit, create follows update (contract C1) |
| `packages/twenty-front/src/modules/settings/roles/role/utils/__tests__/getRoleDirtyFields.test.ts` | predicates for the per-operation dirty check (contract C1) rules only hold the All records / Matching records choice of filtered objects (contract C1) |
| `packages/twenty-front/src/modules/settings/roles/role/utils/getRoleDirtyFields.ts` | per-operation choice of filtered objects (contract C1) rules only hold the All records / Matching records choice of filtered objects (contract C1) |
| `packages/twenty-front/src/modules/settings/roles/role/utils/withRowLevelPermissionRuleGrants.ts` | the fold reads the object-level all-records grants (contract C1) rule operation keys of isGrantedByEveryRule (contract C1) the API gives every rule of an object one grant set; folding keeps what all of them grant, so a rule written outside it never widens access on the next save (contract C1) an all-records object grant wins over the rule, so the toggle is on when either grants (contract C1) one draft rule per object; true marks an operation without an object-level grant, which reaches matching records only (revoked ones too, so granting them later starts there) (contract C1) |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-front/src/modules/object-metadata/hooks/useIsObjectShownInSidebar.ts` | useIsObjectShownInSidebar hook must exist (contract C4 names it; no production code consumes it yet) |
| `packages/twenty-front/src/modules/object-metadata/states/objectShowInSidebarByObjectMetadataIdSelector.ts` | Current-user sidebar visibility selector must exist (contract C4) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelEditWindowRow.tsx` | Edit window duration selector row |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelShowInSidebarRow.tsx` | Per-object Show in Sidebar row (writes only showInSidebar, contract C4) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect.tsx` | Per-operation All records / Matching records select for filtered objects (contract C1) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useWorkspaceMemberHopMetadata.ts` | Record-level initialization and draft sync must share one hop metadata source |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/findWorkspaceMemberHop.ts` | Record-level builder must resolve 'Me' on a member-owned relation to the C2 hop |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/hasRelationToWorkspaceMember.ts` | Record-level builder must keep the hop target finder (policy.agent ▸ agentProfile.workspaceMember) |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/isWorkspaceMemberHopPredicate.ts` | Record-level builder must recognise the C2 hops it owns |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/unwrapUngroupedRecordFiltersFromRootGroup.ts` | Record-level draft sync must store unchanged ungrouped rows back without a group |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/wrapUngroupedRecordFiltersInRootGroup.ts` | Record-level builder must show predicates stored without a group (the C2 hop) as rows |
| `packages/twenty-front/src/modules/settings/roles/role/utils/getMatchingRecordsOperations.ts` | Per-operation choice used by the role dirty check |
| `packages/twenty-front/src/modules/settings/roles/role/utils/getRoleWithMatchingRecordsOperation.ts` | Draft update behind the per-operation select (new rule starts on Matching records) |
| `packages/twenty-front/src/modules/settings/roles/role/utils/resolveObjectRecordsAccessForFilteredObject.ts` | Save-time resolver: a Matching operation is an explicit object-level false, rule grants are explicit |

Plus 18 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Front: record creation form and command menu

- **Record creation** is upstream's Record Creation Form (side panel), which replaced Omnia's draft store; records are not persisted before Create. Omnia seams: agent prefill (`useOmniaRecordCreationDefaults`: member-scoped AgentProfile lookup, a stale-member guard, and only the record's own `agent` relation, never `call.managing`), the reconciliation intercept in `useCreateNewRecord` (a reconciliation create opens the carrier picker and import wizard on the reconciliation index), the `requiredCondition` bridge (blocks Create with Omnia messages, checks related MANY_TO_ONE records through the permission-checked query on readable fields only, and exempts server-filled `submittedDate`), a `beforeunload` prompt for a pending dirty form, and the Carrier → Product filter on relation inputs.
- **Command menu:** upstream metadata-driven items (primary "Create" CTA, NAVIGATION "Go to" items, permission expressions). W4 consolidates the delete items and sets the `Create {objectLabelSingular}` short label; W9 asserts PHI-egress commands carry `permissionFlags`. The review-item comments side-panel page is Omnia's.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The draft store and its Create button (`draftRecordIdsState`, `usePersistDraftRecord`, `useDraftRecordDefaults`, `RecordShowSidePanelCreateRecordButton`, `getMissingRequiredFieldsMessage`), the close-validation modal and its hooks, the create CTA styling and label resolvers, the pinned-button layout workaround, the Go To label resolver, the batch-create partial-success handling and inline creation of an unsaved parent.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-front/src/modules/object-record/hooks/useCreateNewRecord.ts` | reconciliation create opens the run wizard. reconciliation runs start from the carrier import wizard, never a blank record. the wizard's carrier picker is mounted on the reconciliation index only. Commands run outside the side panel's router, so its routed page is read from the store. reconciliation intercept dependencies. |
| `packages/twenty-front/src/modules/object-record/record-form/components/RecordCreationFormProvider.tsx` | ask before the tab unloads while a pending creation form holds unsaved input. |
| `packages/twenty-front/src/modules/object-record/record-form/components/RecordFormFieldInput.tsx` | Carrier -> Product junction bridge. Carrier -> Product junction bridge, so the form's Product picker offers only the selected Carrier's products, like the relation card. |
| `packages/twenty-front/src/modules/object-record/record-form/components/RecordFormFieldInputs.tsx` | Carrier -> Product junction bridge. |
| `packages/twenty-front/src/modules/object-record/record-form/components/__tests__/RecordCreationFormProvider.test.tsx` | leaving the tab with unsaved creation form input asks first. |
| `packages/twenty-front/src/modules/side-panel/constants/SidePanelPagesConfig.tsx` | audit-task comments for a reconciliation review item. |
| `packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/SidePanelRecordCreationFormPage.tsx` | renamed so the Omnia creation defaults below can wrap it. prefill Agent on the initial draft and each reset; caller and RLS values win. soft requiredCondition rules, checked in the browser only (contract C5). a draft edited before the AgentProfile loaded gets the Agent too; user clears stay. requiredCondition violations render like validation rule ones. requiredCondition rules need the pre-check even without validation rules. block Create while a linked record misses its required fields (Q4). Kept with the server violations so they stay up until the next Create. loads the member's AgentProfile id for the Agent prefill. |
| `packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/__tests__/SidePanelRecordCreationFormPage.test.tsx` | the Omnia creation-form seams stay inert unless an Omnia case below sets them. Agent prefill and requiredCondition wiring of the creation form. |
| `packages/twenty-shared/src/types/SidePanelPages.ts` | audit-task comments for a reconciliation review item. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-front/src/modules/object-record/record-form/components/OmniaCurrentAgentProfileIdEffect.tsx` | Effect loading the member's AgentProfile id for the Agent prefill must exist |
| `packages/twenty-front/src/modules/object-record/record-form/components/RecordFormRelationToOneFieldInput.tsx` | Creation form to-one input with the Carrier -> Product junction allowlist must exist |
| `packages/twenty-front/src/modules/object-record/record-form/constants/AgentProfileObjectNameSingular.ts` | agentProfile object name constant must exist |
| `packages/twenty-front/src/modules/object-record/record-form/constants/RequiredConditionRuleIdPrefix.ts` | requiredCondition violation id prefix must exist |
| `packages/twenty-front/src/modules/object-record/record-form/hooks/useOmniaRecordCreationDefaults.ts` | Creation form Agent prefill hook must exist |
| `packages/twenty-front/src/modules/object-record/record-form/hooks/useRequiredConditionViolations.ts` | requiredCondition bridge for the creation form must exist |
| `packages/twenty-front/src/modules/object-record/record-form/states/omniaCurrentAgentProfileState.ts` | AgentProfile id state (keyed by workspace member) must exist |
| `packages/twenty-front/src/modules/object-record/record-form/types/RelatedRecordRequiredConditionCheck.ts` | Related-record check type must exist |
| `packages/twenty-front/src/modules/object-record/record-form/utils/applyAgentProfileJoinColumnDefaults.ts` | Agent prefill fill rule must exist |
| `packages/twenty-front/src/modules/object-record/record-form/utils/computeDraftRequiredConditionViolations.ts` | Draft requiredCondition evaluation must exist |
| `packages/twenty-front/src/modules/object-record/record-form/utils/computeRelatedRecordRequiredConditionCheckViolations.ts` | Related-record requiredCondition evaluation must exist |
| `packages/twenty-front/src/modules/object-record/record-form/utils/getAgentProfileJoinColumnNames.ts` | Agent relation join column lookup must exist |
| `packages/twenty-front/src/modules/object-record/record-form/utils/getRelatedRecordRequiredConditionChecks.ts` | Related-record requiredCondition lookup must exist |
| `packages/twenty-front/src/modules/object-record/record-form/utils/getRequiredConditionViolationMessage.ts` | requiredCondition message wording must exist |
| `packages/twenty-front/src/modules/object-record/record-form/utils/normalizeRequiredConditionRecord.ts` | Join column normalization for the requiredCondition evaluator must exist |

Plus 12 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Front: navigation shell and sidebar

- **Shell:** upstream mode switcher, plus a labeled Search row (no header search icon, Q6), no Documentation link, an inline Log out in the single-workspace dropdown and no Invite user (Q7).
- **Member sidebar (R-NAV):** users without `LAYOUTS` get the Omnia member object list (every active, non-system object the role can read with `showInSidebar` on), ordered Dashboards, Leads, Calls, Policies, Notes, Tasks, then custom objects newest first; nothing renders until visibility loads. One hunk in `WorkspaceSectionDispatcher.tsx` switches to it; `LAYOUTS` users get upstream's curated tree. The curated-tree swap is a follow-up (Q5).
- **Landing and Opened section:** members land on the first sidebar object and never on one hidden from the sidebar; the Opened section hides an object the sidebar already lists (VIEW items included).
- **App root:** a lazy, development-only Agentation toolbar; the import poller and progress card; `LegacyTokenPairCookieCleanupEffect` and `OmniaSiblingSessionRefreshEffect`; the page-change effect keeps a signed-in user on `/welcome` or `/verify` while a trusted sibling redirect runs and drops a `returnToPath` to a deactivated or deleted object's index.
- **Ingestion pipeline settings pages** (routes, settings path and nav item, UI module; the push webhook secret is sent as a header, never in a URL), the deactivated-object redirect and the Omnia default workspace logo.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The sidebar edit gating (upstream `LAYOUTS` gate), the admin last-visited landing (upstream deleted the state), the mobile nav home guard, the signed-out shell hooks, the twenty-ui link constants and the invite-team credit hunk.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-front/src/modules/app/components/App.tsx` | dev-only Agentation annotation toolbar. Production builds fold the condition to null, so the package is never bundled or loaded. |
| `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx` | Ingestion pipeline settings pages. Ingestion pipeline settings pages, gated like the server resolvers. |
| `packages/twenty-front/src/modules/app/components/WorkspaceAppProviders.tsx` | resumes an in-flight CSV import after reload; shows its progress. drops the v2.6 JS-readable tokenPair cookie (it holds a refresh token) on every route, signed in or out. keeps the omniaagent.com dashboard cookie fresh while logged in (C13) |
| `packages/twenty-front/src/modules/app/hooks/__tests__/usePageChangeEffectNavigateLocation.test.ts` | the hook reads the trusted sibling return URL from window.location. the hook skips deactivated objects, so mocks carry isActive. an object returnToPath is only followed when the object exists and is active. deactivated or deleted objects never become a landing or return path. a signed-in user sent by the omniaagent.com dashboard stays on the auth page while the trusted sibling redirect runs, instead of landing in the CRM. |
| `packages/twenty-front/src/modules/app/hooks/usePageChangeEffectNavigateLocation.ts` | a saved path to a deactivated or deleted object's index (e.g. a stale /objects/companies from before sign-in) must not become the landing page. judged once metadata is ready; before that, the index guards below catch an unavailable object after the navigation. stay while useRedirectToTrustedExternalReturnUrl sends the user to the trusted sibling URL in the query; it navigates to / itself if that fails. a deactivated object's index (e.g. Companies from a stale link or browser history) sends the user home instead of an unusable page. |
| `packages/twenty-front/src/modules/app/routing/utils/__tests__/createWorkspaceRouteObjects.test.tsx` | the reconciliation review page is a CORE_OBJECT_SHOW_PAGES entry; a dedicated route would drop objectNameSingular and break the route context store. |
| `packages/twenty-front/src/modules/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection.tsx` | hide Opened when the sidebar already lists the object through any OBJECT, VIEW or RECORD item (upstream misses other views), or for members through their list, hidden until it loads. the sidebar de-dup described above. |
| `packages/twenty-front/src/modules/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher.tsx` | users without LAYOUTS get their role's object list (showInSidebar), not the curated tree. |
| `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerContent.tsx` | labeled Search row replaces the header search icon. |
| `packages/twenty-front/src/modules/navigation/components/MultiWorkspaceDropdown/__stories__/MultiWorkspaceDropdownButton.stories.tsx` | the workspace menu has no Invite user item. single-workspace mode shows Log out inline, without More options. |
| `packages/twenty-front/src/modules/navigation/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx` | single-workspace mode inlines Log out below instead of this menu. no Invite user shortcut; members are invited from Settings. inline Log out, one click away in single-workspace mode. |
| `packages/twenty-front/src/modules/navigation/components/NavigationDrawerHeader.tsx` | no search button in the header; Search is a labeled sidebar row in MainNavigationDrawerContent. |
| `packages/twenty-front/src/modules/navigation/hooks/__tests__/useDefaultHomePagePath.test.ts` | upstream scenarios run as a LAYOUTS holder; members get the Omnia landing. member landing (MEMBER_LANDING_OBJECT_ORDER over the role's sidebar list). |
| `packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts` | users without LAYOUTS land on their role's sidebar list, never on a hidden object. members land on Leads (then the next MEMBER_LANDING_OBJECT_ORDER object) even though their sidebar lists Dashboards first. members never get the nav-tree or alphabetical fallback; wait for their list. |
| `packages/twenty-front/src/modules/page-layout/components/DashboardPageLayoutEditModeProvider.tsx` | widget writes require LAYOUTS server-side, so without it the dashboard stays read-only instead of showing edit controls that fail. |
| `packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx` | Ingestion pipeline settings, same permission as the server resolvers. |
| `packages/twenty-front/src/modules/ui/navigation/navigation-drawer/constants/DefaultWorkspaceLogo.ts` | Omnia logo is the fallback workspace avatar and favicon. |
| `packages/twenty-front/src/pages/settings/data-model/SettingsObjectFieldEdit.tsx` | soft Required rule (UI-only), saved through formatFieldMetadataItemInput. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-front/public/images/icons/omnia/logo.png` | Omnia logo used as DEFAULT_WORKSPACE_LOGO |
| `packages/twenty-front/src/modules/navigation-menu-item/display/constants/MemberSidebarFirstObjectNames.ts` | Member sidebar first-object order constant must exist |
| `packages/twenty-front/src/modules/navigation-menu-item/display/dnd/components/OmniaMemberWorkspaceNavigationMenuItems.tsx` | Omnia member workspace section must exist |
| `packages/twenty-front/src/modules/navigation-menu-item/display/hooks/useMemberSidebarObjectMetadataItems.ts` | Member sidebar object list hook must exist |
| `packages/twenty-front/src/modules/navigation-menu-item/display/testing/memberSidebarTestFixtures.ts` | Member sidebar test fixtures must exist |
| `packages/twenty-front/src/modules/navigation-menu-item/display/utils/sortMemberSidebarObjectMetadataItems.ts` | Member sidebar sort util must exist |
| `packages/twenty-front/src/modules/navigation/constants/MemberLandingObjectOrder.ts` | Member landing order constant must exist |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionFieldMappingEditor.component.tsx` | Ingestion pipeline field mapping editor |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionLogTable.component.tsx` | Ingestion pipeline run history table |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionPipelineForm.component.tsx` | Ingestion pipeline form |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionTestSection.component.tsx` | Ingestion pipeline test section |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-field-mapping.mutations.ts` | Ingestion field mapping mutations (codegen source) |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-field-mapping.queries.ts` | Ingestion field mapping queries (codegen source) |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-log.queries.ts` | Ingestion log queries (codegen source) |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-pipeline.mutations.ts` | Ingestion pipeline mutations (codegen source) |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-pipeline.queries.ts` | Ingestion pipeline queries (codegen source) |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionFieldMappings.ts` | Ingestion field mappings hook |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionPipeline.ts` | Ingestion pipeline hook |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionPipelineLogs.ts` | Ingestion pipeline logs hook |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionPipelineTest.ts` | Ingestion pipeline test hook |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionPipelines.ts` | Ingestion pipelines list hook |
| `packages/twenty-front/src/modules/settings/ingestion-pipeline/types/IngestionPipelineFormValues.ts` | Ingestion pipeline form values type |
| `packages/twenty-front/src/pages/settings/ingestion-pipelines/SettingsIngestionPipelineDetail.tsx` | Ingestion pipeline detail page |
| `packages/twenty-front/src/pages/settings/ingestion-pipelines/SettingsIngestionPipelineNew.tsx` | Ingestion pipeline create page |
| `packages/twenty-front/src/pages/settings/ingestion-pipelines/SettingsIngestionPipelines.tsx` | Ingestion pipelines list page |

Plus 4 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Front: auth, sessions and branding

- **Sessions** are upstream httpOnly cookie sessions (hard-reload logout, server `signOut`). Omnia also wipes the IndexedDB metadata store and the sibling cookie on sign-out, and `LegacyTokenPairCookieCleanupEffect` removes the v2.6 JS-readable `tokenPair` cookie (it held a 60-day refresh token) on every route, signed in or out. Legacy refresh tokens are revoked at the cutover.
- **Dashboard SSO sibling cookie (C13):** the server issues an httpOnly, `Secure`, `SameSite=Lax` cookie on the parent domain (`.omniaagent.com`) carrying only a 30-minute CRM access JWT (`modules/omnia-sibling-session/` plus hunks in the upstream user-session, session-cookie and impersonation services). It is set when a session is issued, refreshed by `refreshOmniaSiblingSession` (a 10-minute visible-tab refresh), and cleared on sign-out, revoke, dead-session cleanup and the impersonation fallback. A revoked session's sibling token lives until it expires. The dashboard signs the CRM out with `omniaSignOut=1`, honoured only when a trusted sibling app other than the CRM opened the page (`document.referrer`), so a link on any other site, or inside the CRM, cannot sign a user out; the dashboard must keep its default referrer policy for that navigation. An OAuth flow for the dashboard is a follow-up (Q12).
- **Trusted external redirect:** after sign-in, `returnToPath` (and the legacy `postSignInRedirect`) may send the user to an https URL on the front host or its parent domain only (`isTrustedExternalReturnUrl`, the shared `useRedirectToTrustedExternalReturnUrl`; the server sanitizes with `getSafeReturnToPath`).
- **Cache bust on app version change** (`resetStaleClientStateOnAppVersionChange`): a new `clientConfig.appVersion` wipes localStorage except the preserve list for the v2.58 keys, including orphan `metadataStoreState__*` keys left by v2.6 browsers. Sign-out clears `activeImportJobId`.
- **Current user (C4):** the user fragment and both writers carry `objectSidebarVisibility` with no `?? []` default, so the member sidebar fails closed until it loads.
- **Branding:** `index.html`, the manifest, icons and the Omnia page title (`doNotTranslate('Omnia')`); the workspace logo as the primary sign-in logo and the workspace name as the sign-in title; `AudioLink` lives in twenty-front (`modules/ui/navigation/link/components/AudioLink/`); `index.tsx` activates English first so module-scope `i18n._()` calls never throw.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The JS-readable SSO token-pair cookie mirror (`ssoTokenPairCookie`, `deriveCookieDomain`, `tokenPairState`, `getTokenPair`), the soft logout, the signed-out lead background mock (`sign-in-background-mock` Omnia hunks), the mock metadata deactivation, the Jotai cookie legacy attributes and custom family storage, the lz-string compressed metadata store (upstream IndexedDB store) and the Apollo cache persist and devtools hunks (upstream now).

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-front/index.html` | Omnia favicon, apple-touch icon, og/twitter titles and page title. |
| `packages/twenty-front/src/index.tsx` | keep first. Activates English before module-scope i18n._() calls (PasswordReset zod schema) and silences graphql-tag fragment warnings. |
| `packages/twenty-front/src/modules/auth/components/Logo.tsx` | styles the workspace logo promoted to the main logo (below). Omnia brands sign-in with its own logo, so a workspace logo replaces the Twenty icon and its corner overlay. |
| `packages/twenty-front/src/modules/auth/hooks/__tests__/useAuth.test.tsx` | sign-out must finish wiping the IndexedDB metadata store. RLS predicates, roles and view filters must not stay at rest. trusted https sibling URL (omniaagent.com dashboard) |
| `packages/twenty-front/src/modules/auth/hooks/__tests__/useRedeemSsoExchangeToken.test.ts` | trusted sibling redirect after the exchange (omniaagent.com dashboard) |
| `packages/twenty-front/src/modules/auth/hooks/__tests__/useVerifyLogin.test.ts` | trusted sibling redirect after /verify (omniaagent.com dashboard) |
| `packages/twenty-front/src/modules/auth/hooks/useAuth.ts` | RLS predicates, roles and view filters must not stay at rest on shared workstations; awaited because clearSession's reload aborts IndexedDB work. trusted https sibling URL (omniaagent.com dashboard) a trusted https sibling URL wins over an app path and rides through SSO to /verify; returnToPathState never holds absolute URLs. trusted sibling URL, validated in buildRedirectUrl. |
| `packages/twenty-front/src/modules/auth/hooks/useRedeemSsoExchangeToken.ts` | the redeemed session sends the user on to a trusted sibling URL (omniaagent.com dashboard) carried in the query. |
| `packages/twenty-front/src/modules/auth/hooks/useVerifyLogin.ts` | /verify can carry a trusted sibling URL (omniaagent.com dashboard) through SSO; it is read before the token swap, which may navigate away. |
| `packages/twenty-front/src/modules/auth/sign-in-up/hooks/__tests__/useSignInWithGoogle.test.ts` | trusted sibling URL (omniaagent.com dashboard) |
| `packages/twenty-front/src/modules/auth/sign-in-up/hooks/__tests__/useSignInWithMicrosoft.test.ts` | trusted sibling URL (omniaagent.com dashboard) |
| `packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInWithGoogle.ts` | carries a trusted sibling URL (omniaagent.com dashboard) through SSO. |
| `packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInWithMicrosoft.ts` | carries a trusted sibling URL (omniaagent.com dashboard) through SSO. |
| `packages/twenty-front/src/modules/auth/states/currentUserWorkspaceState.ts` | role-driven sidebar visibility (contract C4). Undefined means not loaded, including values persisted before the field existed; never default it to []. |
| `packages/twenty-front/src/modules/client-config/hooks/useClientConfig.ts` | a new deploy resets stale persisted client state. The HTML bootstrap and the fetch path both land here; the new version is stored before the reload, so it reloads once. |
| `packages/twenty-front/src/modules/metadata-store/effect-components/UserMetadataProviderInitialEffect.tsx` | role-driven sidebar visibility (contract C4). No [] default: a missing value must keep meaning "not loaded". |
| `packages/twenty-front/src/modules/users/graphql/fragments/userQueryFragment.ts` | role-driven sidebar visibility (contract C4) |
| `packages/twenty-front/src/modules/users/hooks/useLoadCurrentUser.ts` | role-driven sidebar visibility (contract C4). No [] default: a missing value must keep meaning "not loaded". |
| `packages/twenty-front/src/pages/auth/SignInUp.tsx` | the workspace name alone, not "Welcome, <name>.". a signed-in user sent by the omniaagent.com dashboard goes back there. |
| `packages/twenty-front/src/testing/mock-data/roles/roles-mock.ts` | generated Role.showAllObjectsInSidebar is non-null (contract C4) |
| `packages/twenty-front/src/testing/mock-data/users.ts` | a loaded user always carries sidebar visibility (contract C4); the member sidebar renders nothing without it. |
| `packages/twenty-front/src/utils/__tests__/title-utils.test.ts` | the default page title is the Omnia brand. |
| `packages/twenty-front/src/utils/i18n/initialI18nActivate.ts` | activate English synchronously so module-scope i18n._() never throws before the async locale detection completes. |
| `packages/twenty-front/src/utils/title-utils.ts` | Omnia default page title (brand name, never translated) |
| `packages/twenty-server/src/engine/core-modules/impersonation/services/impersonation.service.ts` | omniaagent.com dashboard sibling cookie (C13) the impersonated user's dashboard cookie must not outlive impersonation; the front re-issues the impersonator's on the reload that follows (C13) |
| `packages/twenty-server/src/engine/core-modules/user-session/services/user-session-cookie.service.ts` | omniaagent.com dashboard sibling cookie (C13) sign-out, revoke, impersonation fallback and dead-session cleanup all end here, so the dashboard cookie dies with the session (C13) |
| `packages/twenty-server/src/engine/core-modules/user-session/services/user-session.service.ts` | omniaagent.com dashboard sibling cookie (C13) mirror a short-lived access token into the dashboard's httpOnly parent-domain cookie (C13) |
| `packages/twenty-server/src/engine/middlewares/cookie-session-csrf.middleware.spec.ts` | UserSessionCookieService clears the dashboard sibling cookie (C13) |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-front/public/images/icons/omnia/192.png` | Omnia apple-touch icon referenced by index.html |
| `packages/twenty-front/public/images/icons/omnia/favicon.png` | Omnia favicon referenced by index.html |
| `packages/twenty-front/src/modules/auth/components/LegacyTokenPairCookieCleanupEffect.tsx` | Cutover cleanup of the v2.6 JS-readable tokenPair cookie (60-day refresh token) must exist |
| `packages/twenty-front/src/modules/auth/effect-components/OmniaSiblingSessionRefreshEffect.tsx` | OmniaSiblingSessionRefreshEffect must exist (keeps the 30-minute dashboard cookie fresh while a CRM tab is open) |
| `packages/twenty-front/src/modules/auth/hooks/useRefreshOmniaSiblingSession.ts` | useRefreshOmniaSiblingSession must exist (shared by the refresh effect and the trusted external redirect) |
| `packages/twenty-front/src/modules/auth/sign-in-up/components/internal/SignInUpExternalRedirectEffect.tsx` | SignInUpExternalRedirectEffect must exist to send a signed-in user back to a trusted sibling URL |
| `packages/twenty-front/src/modules/auth/sign-in-up/constants/OmniaSignOutSearchParam.ts` | OMNIA_SIGN_OUT_SEARCH_PARAM must exist (the omniaagent.com dashboard's Sign out flag) |
| `packages/twenty-front/src/modules/auth/sign-in-up/states/isTrustedExternalRedirectInProgressState.ts` | isTrustedExternalRedirectInProgressState must exist: it keeps the three redirect call sites to one attempt at a time |
| `packages/twenty-front/src/modules/auth/sign-in-up/utils/assignWindowLocation.ts` | assignWindowLocation must exist: the trusted sibling redirect leaves the CRM through it |
| `packages/twenty-front/src/modules/auth/sign-in-up/utils/consumeTrustedSiblingSignOutRequest.ts` | consumeTrustedSiblingSignOutRequest must exist (one-shot dashboard sign-out request) |
| `packages/twenty-front/src/modules/auth/sign-in-up/utils/isTrustedSiblingSignOutRequest.ts` | isTrustedSiblingSignOutRequest must exist (dashboard sign-out flag plus a trusted return URL, honoured only when a sibling app other than the CRM opened the page) |
| `packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts` | App-version cache-bust util must exist (resets stale persisted client state once per deploy) |
| `packages/twenty-front/src/modules/ui/navigation/link/components/AudioLink/AudioLink.tsx` | AudioLink component for call recording playback (moved from twenty-ui into twenty-front in the v2.58 merge) |
| `packages/twenty-server/src/modules/omnia-sibling-session/constants/omnia-sibling-session-cookie-name.constant.ts` | The sibling cookie name constant must exist |
| `packages/twenty-server/src/modules/omnia-sibling-session/constants/omnia-sibling-session-token-lifetime.constant.ts` | The sibling token lifetime constant must exist |
| `packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.module.ts` | OmniaSiblingSessionModule must exist (global provider of the omniaagent.com dashboard cookie) |
| `packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.resolver.ts` | refreshOmniaSiblingSession resolver must exist (re-mints the dashboard cookie from the live session) |
| `packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.service.ts` | OmniaSiblingSessionService must exist (issues and clears the httpOnly tokenPair sibling cookie) |
| `packages/twenty-shared/src/utils/auth/derive-trusted-redirect-domain.ts` | Trusted external redirect helpers must exist (shared by server + frontend) |

Plus 14 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Front: table views, relation sub-field columns and filters

- **Relation sub-field columns (C6):** columns such as "Lead / Date of Birth" or "Agent / NPN" are view fields with `subFieldName`. Omnia adds the column key (`getRecordFieldColumnKey`, used everywhere, including the v2.58 header drag and drop), the GraphQL expansion (`mergeRelationSubFieldsIntoRecordGqlFields`), the field-definition override in the generic cell, cell actions (copy reads the related record), the header (label and icon; filter and sort off), the aggregate footer (a sub-field column saves its aggregate on its own view field), the options-dropdown picker page (readable fields only, never a ONE_TO_MANY back-reference to the view's own object, not on Kanban) and view duplication (copies `subFieldName`). Cards, lists and calendar cards skip sub-field columns.
- **One-to-many relation filters** use upstream relation traversal (`relationTargetFieldMetadataId`) with a canonical emptiness serialization; W5 migrates stored filters.
- **Filters:** the `IS_NOT_RELATIVE` operand, currency null safety, advanced-filter relation-target initialization, the advanced-filter button guard when there is no current view, and filter options read from `RecordIndexContext` (both needed by the reconciliation review page).
- **Performance:** memoized `FieldContext` values per cell, the scroll effect reads the store with `store.get()`, and the initial table fetch uses `no-cache` (the table reads from Jotai; Apollo's cache never evicts).

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The view-field `isOverridden` artifact, type-cast artifacts, the cell click `useCallback`, the cell-wrapper and row memos (upstream now), the depth GQL readable-fields hunk (upstream readable-only fragments), the sign-in mock record index and the object-permission test fixtures.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-front/src/modules/object-metadata/graphql/fragment.ts` | soft required-field rules (contract C5) |
| `packages/twenty-front/src/modules/object-metadata/graphql/mutations.ts` | soft required-field rule (contract C5) |
| `packages/twenty-front/src/modules/object-metadata/types/FieldMetadataItem.ts` | typed below; the generated JSON scalar is any. soft required-field rule, checked in the browser only; the server never enforces it. |
| `packages/twenty-front/src/modules/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition.ts` | soft required-field rule, read by the required indicators and the creation form. |
| `packages/twenty-front/src/modules/object-metadata/utils/formatFieldMetadataItemInput.ts` | soft required-field rule saved from the Settings "Required" form. soft required-field rule. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterFieldSelectMenu.tsx` | one-to-many relations are filterable in the advanced filter only; the shared list also feeds the RLS predicate builder. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterRecordFilterOperandSelect.tsx` | the filtered field is the target one when traversing; a one-to-many relation without a target only offers has any / has no. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterRelationTargetFieldSelectMenu.tsx` | one-to-many sources traverse too, with has any / has no on top; the target list stays many-to-one only (the server caps depth at 1) has any / has no, saved as IS_NOT_EMPTY / IS_EMPTY. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/hooks/useApplyAdvancedFilterSourceField.ts` | the one-to-many has any / has no items pick their operand. explicit operand first; one-to-many defaults to emptiness. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/hooks/useSetAdvancedFilterDropdownAllRowsStates.ts` | value pickers read the traversal target from here; it is otherwise only set once a row's field menu opens. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/side-panel/components/AdvancedFilterSidePanelRecordFilterOperandSelect.tsx` | the filtered field is the target one when traversing; a one-to-many relation without a target only offers has any / has no. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/utils/__tests__/getDefaultAdvancedFilterOperand.test.ts` | one-to-many relation filters only check emptiness. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/utils/getAdvancedFilterFieldSubPage.ts` | one-to-many relations pick has any / has no or a target field; the server evaluates the traversal as EXISTS with the target's RLS. |
| `packages/twenty-front/src/modules/object-record/advanced-filter/utils/getDefaultAdvancedFilterOperand.ts` | one-to-many relation filters only offer emptiness operands. |
| `packages/twenty-front/src/modules/object-record/object-filter-dropdown/components/ObjectFilterDropdownInnerSelectOperandDropdown.tsx` | emptiness-only for a one-to-many relation itself, never for a target field reached through it. |
| `packages/twenty-front/src/modules/object-record/object-filter-dropdown/hooks/useOptionsForSelect.ts` | RecordIndexContext instead of the URL, because the reconciliation review route has no :objectNamePlural param. |
| `packages/twenty-front/src/modules/object-record/object-filter-dropdown/utils/configurableViewFilterOperands.ts` | workflow-only date operand with a relative window value. |
| `packages/twenty-front/src/modules/object-record/object-filter-dropdown/utils/getOperandLabel.ts` | workflow-only date operand. |
| `packages/twenty-front/src/modules/object-record/object-options-dropdown/components/ObjectOptionsDropdownContent.tsx` | relation sub-field picker, opened from the hidden fields page. |
| `packages/twenty-front/src/modules/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard.ts` | a sub-field column kept from a table view shares fieldMetadataItemId with its relation; board options toggle the plain column only. |
| `packages/twenty-front/src/modules/object-record/object-options-dropdown/types/ObjectOptionsContentId.ts` | a relation's target fields, added as sub-field columns ("Lead / Date of Birth") |
| `packages/twenty-front/src/modules/object-record/record-board/record-board-card/components/RecordBoardCardBody.tsx` | sub-field columns are table-only (contract C6). Skipped here, not filtered out, so hover and edit positions still index the list useRecordBoardCardMetadataFromPosition reads. |
| `packages/twenty-front/src/modules/object-record/record-field/hooks/useChangeRecordFieldVisibility.ts` | subFieldName targets a relation sub-field column ("Lead / DOB"). It shares fieldMetadataId with the relation column, so columns match on the pair and the local update goes by record field id. |
| `packages/twenty-front/src/modules/object-record/record-field/hooks/useMoveRecordField.ts` | by record field id; sub-field columns ("Lead / DOB") share fieldMetadataItemId with their relation. |
| `packages/twenty-front/src/modules/object-record/record-field/hooks/useRelevantRecordsGqlFields.ts` | relation sub-field columns ("Lead / Date of Birth") need their field inside the relation selection. |
| `packages/twenty-front/src/modules/object-record/record-field/hooks/useReorderVisibleRecordFields.ts` | by record field id, so dragging "Lead / DOB" does not move the "Lead" column. |
| `packages/twenty-front/src/modules/object-record/record-field/hooks/useUpdateRecordField.ts` | sub-field columns share fieldMetadataItemId with their relation, so match the record field id first. Callers still passing a field id (board options, record-table widget settings) mean the plain column. |
| `packages/twenty-front/src/modules/object-record/record-filter/utils/__tests__/getRecordFilterOperands.test.ts` | one-to-many relation filters without a target field. |
| `packages/twenty-front/src/modules/object-record/record-filter/utils/getRecordFilterOperands.ts` | a one-to-many relation has no single related record to pick, so without a target field it only filters on has any / has no. |
| `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexContainer.tsx` | carrier picker step for the reconciliation run wizard. carrier picker for the reconciliation run wizard. |
| `packages/twenty-front/src/modules/object-record/record-index/hooks/useRecordIndexTableLazyQuery.ts` | the table reads records from Jotai, and Apollo 4's InMemoryCache never evicts on its own, so caching every list page grew memory until mobile browsers ran out (OOM) |
| `packages/twenty-front/src/modules/object-record/record-table/components/RecordTableScrollAndZIndexEffect.tsx` | the flags go through store.get/set so the listener is attached once. Re-attaching it on every flag flip crash-looped mobile Safari during momentum scrolling. |
| `packages/twenty-front/src/modules/object-record/record-table/hooks/useMoveTableColumn.ts` | moves by record field id; sub-field columns share fieldMetadataItemId with their relation. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellEditButton.tsx` | read-only relation sub-field columns act on the related record instead of editing. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextGeneric.tsx` | relation sub-field column ("Lead / Date of Birth"); null when the role cannot read the field. memoized (one value per cell), so every hook runs before upstream's early return. the checks above use the base relation, so an unreadable target shows "Not shared". |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextLabelIdentifier.tsx` | memoized (one value per row), so every hook runs before upstream's early return. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellHoveredPortalContent.tsx` | read-only relation sub-field columns keep their related-record buttons, unless "Not shared". |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellWrapper.tsx` | sub-field columns share fieldMetadataItemId with their relation. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-footer/components/RecordTableAggregateFooter.tsx` | column key; a relation sub-field column shares fieldMetadataItemId with its relation. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-footer/components/RecordTableAggregateFooterCell.tsx` | by view field id; a relation sub-field column shares fieldMetadataId with its relation. per column; a relation sub-field column shares fieldMetadataId with its relation. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-footer/components/RecordTableColumnAggregateFooterWithDropdown.tsx` | per column; a relation sub-field column shares fieldMetadataId with its relation. the aggregate is saved on this column's own view field. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-footer/hooks/useViewFieldAggregateOperation.tsx` | by view field id, or a relation sub-field column saves its aggregate on the relation column. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-footer/types/RecordTableColumnAggregateFooterDropdownContextValue.ts` | a relation sub-field column shares fieldMetadataId with its relation; the view field id does not. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHead.tsx` | a relation sub-field column ("Lead / Date of Birth") takes the target field's label, icon and description. A target field the role cannot read, or a missing one, shows its raw name and nothing more. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHeadDropdownMenu.tsx` | compared by record field id: a relation sub-field column ("Lead / DOB") shares fieldMetadataItemId with its relation column. move by record field id and hide the (field, sub-field) pair, for the same reason. Filter and Sort would act on the relation, not on the sub-field a sub-field column shows. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHeadWithDropdown.tsx` | column key, or a relation and its sub-field columns share one open state. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderCell.tsx` | column key; a relation sub-field column shares fieldMetadataItemId with its relation. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderDnd.tsx` | column keys: a relation and its sub-field columns share fieldMetadataItemId, and a. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderPlusButtonContent.tsx` | only plain columns count, so "Lead" can still be added while only "Lead / DOB" is visible. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderResizeHandler.tsx` | the resize state holds the column key, which is fieldMetadataItemId for a plain column; a relation sub-field column shares that id with its relation. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-header/hooks/useResizeTableHeader.ts` | the resize state holds the column key; a relation sub-field column shares fieldMetadataItemId with its relation. by record field id; the column key of a sub-field column is not one. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-row/components/RecordTableFieldsCells.tsx` | sub-field columns share fieldMetadataItemId with their relation. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-row/components/RecordTableFieldsCellsLoading.tsx` | sub-field columns share fieldMetadataItemId with their relation. |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-row/hooks/useGetRecordTableRowIndex.ts` | stable, so the memoized label-identifier FieldContext keeps its identity across renders. |
| `packages/twenty-front/src/modules/object-record/record-table/virtualization/components/RecordTableColumnVirtualizationEffect.tsx` | the resize state holds the column key; a relation sub-field column shares fieldMetadataItemId with its relation. |
| `packages/twenty-front/src/modules/views/components/ViewBarFilterDropdownAdvancedFilterButton.tsx` | the reconciliation review page reuses this filter UI without a current view. Render nothing there instead of throwing below: advanced filter groups are saved on a view. |
| `packages/twenty-front/src/modules/views/components/ViewFieldsHiddenDropdownSection.tsx` | a sub-field column ("Lead / Date of Birth") shares its relation's fieldMetadataItemId, so only a plain column takes a field off the hidden list. many-to-one relations open the relationSubFields page to add target fields as columns. Table views only: board, calendar and list cards render visible fields by field id and cannot show a sub-field. visible relations, to add their sub-field columns. opens the relationSubFields page. |
| `packages/twenty-front/src/modules/views/components/ViewFieldsSearchDropdownSection.tsx` | a sub-field column ("Lead / Date of Birth") shares its relation's fieldMetadataItemId, so only a plain column marks the field visible here; the toggle acts on the plain column. |
| `packages/twenty-front/src/modules/views/components/ViewFieldsVisibleDropdownSection.tsx` | the board handlers find a field by fieldMetadataItemId, which a sub-field column shares with its relation, so a sub-field column (kept when a table view becomes a board) always uses the record-field hooks. a sub-field column is hidden by its (field, sub-field) pair, for the same reason. sub-field columns share fieldMetadataItemId with their relation, so they are keyed by column key and labelled "Lead / Date of Birth" like the table header. |
| `packages/twenty-front/src/modules/views/graphql/fragments/viewFieldFragment.ts` | relation sub-field columns (contract C6) |
| `packages/twenty-front/src/modules/views/hooks/useCreateViewFromCurrentView.ts` | without it, sub-field columns copy as duplicate plain relation columns and the server rejects the batch (contract C6) |
| `packages/twenty-front/src/modules/views/hooks/useSaveCurrentViewFields.ts` | a sub-field column is its own view field on the relation field (contract C6) a relation column and its sub-field columns share fieldMetadataId, so match on the pair. |
| `packages/twenty-front/src/modules/views/types/ViewField.ts` | target field name of a relation sub-field column (C6) |
| `packages/twenty-front/src/modules/views/utils/__tests__/viewMapFunctions.test.ts` | relation sub-field columns (contract C6) |
| `packages/twenty-front/src/modules/views/utils/mapRecordFieldToViewField.ts` | saves match on (fieldMetadataId, subFieldName), contract C6. |
| `packages/twenty-front/src/modules/views/utils/mapViewFieldToRecordField.ts` | sub-field columns render from RecordField (contract C6) |
| `packages/twenty-front/src/modules/views/utils/mapViewFieldsToColumnDefinitions.ts` | sub-field columns are table-only (they render from RecordField); these definitions only feed Kanban options (contract C6) |
| `packages/twenty-front/src/pages/settings/data-model/__stories__/SettingsObjectNewField/SettingsObjectNewFieldConfigure.stories.tsx` | createOneField selects the soft required-field rule (contract C5) |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-front/src/modules/object-metadata/utils/getOneToManyRelationFilterFieldMetadataItems.ts` | Advanced-filter-only list of one-to-many relations whose target object the role can read |
| `packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterOneToManyEmptinessItems.tsx` | Has any / Has no items of the one-to-many relation page |
| `packages/twenty-front/src/modules/object-record/graphql/record-gql-fields/utils/mergeRelationSubFieldsIntoRecordGqlFields.ts` | Merges relation sub-field columns ("Lead / Date of Birth") into the relation's GraphQL selection |
| `packages/twenty-front/src/modules/object-record/object-options-dropdown/components/ObjectOptionsDropdownRelationSubFieldsContent.tsx` | Options dropdown page that adds a relation's target fields as sub-field columns |
| `packages/twenty-front/src/modules/object-record/object-options-dropdown/states/objectOptionsDropdownExpandedRelationFieldIdComponentState.ts` | Relation whose target fields the relationSubFields page lists |
| `packages/twenty-front/src/modules/object-record/record-field/types/RelationSubFieldMetadata.ts` | Field metadata type of a relation sub-field column definition |
| `packages/twenty-front/src/modules/object-record/record-field/utils/buildRelationSubFieldDefinition.ts` | Builds the read-only field definition of a sub-field column (replaces buildRelationSubFieldColumnDefinition) |
| `packages/twenty-front/src/modules/object-record/record-field/utils/getRecordFieldColumnKey.ts` | Column key for React keys, dnd-kit ids and dropdown ids; sub-field columns share fieldMetadataItemId with their relation |
| `packages/twenty-front/src/modules/object-record/record-field/utils/getRelationSubFieldMetadataItem.ts` | Resolves a sub-field on the relation target from readableFields (active only) |
| `packages/twenty-front/src/modules/object-record/record-field/utils/isRelationSubFieldDefinition.ts` | Type guard for sub-field column definitions (replaces metadata casts) |
| `packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableRelationSubFieldCellButtons.tsx` | Hover buttons of a sub-field cell (open related record, copy/call/mail on the related record) |
| `packages/twenty-front/src/modules/views/utils/getRelationSubFieldColumnLabel.ts` | One 'Relation / Sub-field' label for the header, field lists and picker (matches export headers) |
| `packages/twenty-front/src/modules/views/utils/isOneToManyBackReferenceSubField.ts` | Shared back-reference predicate for picker + export |

Plus 24 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Front: record pages, fields, pickers, timeline and reconciliation review

- **Fields widget:** upstream `useFieldsWidgetFields` shows readable fields only (the 2-57 recompute must run).
- **Timeline:** upstream relation diff values plus Omnia inline before-values (struck through, then the arrow) for every field type, and normalization of legacy bare-uuid relation diffs.
- **Relation chips** offer Detach only (no Delete; deletion happens from the object's own page).
- **Pickers:** shared `additionalFilter` (`combineFilters`), the lead → policy allowlist (policies with no lead or the current lead), and the Carrier → Product junction bridge filter on the relation card, the creation form and the inline `RelationManyToOneFieldInput` (which offers no Add New there).
- **Required fields (C5):** the Settings "Required" form on the v2.58 field cards (zod schemas keep the rule) and red indicators on the field widget, header and inline cells (`useIsFieldRequired`).
- **Display guards:** address coordinates normalize invalid strings instead of throwing, date-time display guards invalid instants, LINKS fields with `displayAs: 'audio'` render `AudioLink`, and relation sub-field columns route to the related record's field (C6).
- **Dashboard edit gate:** `LAYOUTS` (widget writes require it server-side; upstream checks the wrong permission). Offset fetches use `no-cache`; SSE dispatch keeps upstream's `store.get()` snapshot.
- **Workflow filters** offer `IS_NOT_RELATIVE`; the background job indicator is import-only; chart-bucket filters carry the relation type.
- **Reconciliation review UI** (`packages/twenty-front/src/modules/reconciliation/`, Omnia-only): the review page is a `CORE_OBJECT_SHOW_PAGES` entry (the native route context store sets page type Record); the inline BOB diff overlay lives in Omnia files with one value-slot branch in `RecordInlineCellContainer.tsx` (accept and undo, primary phone/email promotion, numeric coercion, null-safe); a relation name diff chip; matched and unmatched views, the toolbar's batch Apply and Undo through the server, the run summary banner, the carrier picker and import wizard, the review-item comments side panel and audit tasks created through `requestRecordCreation`.

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- Cascading field dependencies (dormant since March; follow-up issue), the junction-config null-relation fallback, the draft violation plumbing, the draft guards in field editors and the draft record-show rendering, the deleted-record detail sections, the attach-target cache edge, `FileFolder.Export`, the person phone unique-index key, type-conformance noise and dead orphans.

### Upstream files with Omnia hunks

| File | Omnia change (from the `OMNIA-CUSTOM` markers) |
| --- | --- |
| `packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx` | record store entry of the previous value. previous value, muted and struck through. Its value wrapper sets the primary color, so the wrapper inherits ours instead. older history rows store relation diffs as bare uuids. the values render the struck-through previous record and the arrow. previous value, shown before the arrow. no previous value to show (field was empty) previous value ahead of the arrow. |
| `packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiffContainer.tsx` | separate store id for the before-value preview so it hydrates independently of the after-value's record store entry. |
| `packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventRelationFieldDiffValues.tsx` | timeline rows show the previous record inline, then the arrow. previous related record, muted and struck through. previous record (when there was one) and the arrow, then the value. |
| `packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/__tests__/EventRelationFieldDiffValues.test.tsx` | timeline rows show the previous record struck through, then the arrow. |
| `packages/twenty-front/src/modules/marketplace/constants/PermissionFlagSummaryConfigs.ts` | reconciliation flag (contract C8); this Record needs a label for every flag. |
| `packages/twenty-front/src/modules/object-core/constants/CoreObjectShowPages.ts` | string keys so a workspace object (reconciliation) can register its page. the reconciliation review page replaces the default record page. |
| `packages/twenty-front/src/modules/object-record/hooks/useLazyFindManyRecordsWithOffset.ts` | the table reads rows from jotai; also caching them in Apollo (no automatic cache GC) grew memory until mobile crashed. |
| `packages/twenty-front/src/modules/object-record/record-calendar/record-calendar-card/components/RecordCalendarCardBody.tsx` | sub-field columns are table-only (contract C6). Skipped, not filtered out, so hover and edit positions keep indexing useRecordCalendarCardMetadataFromPosition's list. |
| `packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem.tsx` | the reconciliation review annotates relation chips and the expanded record with BOB diffs; null everywhere else. name diff (old -> new, Accept/Undo) on the review page. Delete intentionally omitted. Admins deleted the. re-roots `<relation>.*` review diffs on the related record. |
| `packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToMany.tsx` | Lead -> Policies allowlist. Lead -> Policies offers only policies with no lead or this lead. |
| `packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToOne.tsx` | Carrier -> Product junction bridge. a Policy's Product picker offers only products its Carrier sells. no Add New under the junction allowlist, which a new record would bypass. |
| `packages/twenty-front/src/modules/object-record/record-field/types/RecordField.ts` | set on relation sub-field columns such as "Lead / Date of Birth". |
| `packages/twenty-front/src/modules/object-record/record-field/ui/components/FieldDisplay.tsx` | relation sub-field columns ("Lead / Date of Birth") render the related record's field through RelationSubFieldDisplay. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/components/FormFieldInput.tsx` | Carrier -> Product allowlist (U6) Carrier -> Product allowlist (U6), to-one relations only. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/form-types/components/FormRelationToOneFieldInput.tsx` | Carrier -> Product allowlist (U6) |
| `packages/twenty-front/src/modules/object-record/record-field/ui/form-types/components/FormSingleRecordPicker.tsx` | Carrier -> Product allowlist (U6) Carrier -> Product allowlist from the record creation form (U6) |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/display/components/LinksFieldDisplay.tsx` | call recordings set displayAs to 'audio' to play inline. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/AddressFieldInput.tsx` | legacy coordinates can be non-numeric strings, on which castAsNumberOrNull throws and takes the record layout down. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationManyToOneFieldInput.tsx` | Carrier -> Product junction bridge. a Policy's Product picker offers only products its Carrier sells. no Add New under the junction allowlist, which a new record would bypass. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationOneToManyFieldInput.tsx` | Lead -> Policies allowlist. Lead -> Policies offers only policies with no lead or this lead. the initial search lives here, not in the open hook, so Lead -> Policies waits for its allowlist; junction openers search themselves. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/hooks/useOpenRelationFromManyFieldInput.tsx` | RelationOneToManyFieldInput runs the initial search so Lead -> Policies can wait for its allowlist; never search here. |
| `packages/twenty-front/src/modules/object-record/record-field/ui/types/FieldDefinition.ts` | soft required-field rule (contract C5) |
| `packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCell.tsx` | opt-in red placeholder for empty required fields (contract C5) |
| `packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellContainer.tsx` | on the reconciliation review a BOB diff replaces the value slot; context-only, so other inline cells pay nothing. reconciliation diff value slot. |
| `packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellContext.tsx` | opt-in red placeholder for empty required fields (contract C5) |
| `packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellDisplayMode.tsx` | soft required-field indicator (contract C5) width 100% so the hover and click target spans the whole value column. red placeholder for an empty required field. Only cells that opt in through showRequiredIndicator mount RequiredEmptyField: 900+ store subscriptions in tables crashed mobile Safari. |
| `packages/twenty-front/src/modules/object-record/record-list/components/RecordListRow.tsx` | sub-field columns are table-only (contract C6); a row would repeat their relation. |
| `packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker.tsx` | picker-wide additional filter. narrows every search of this picker (Lead -> Policies allowlist) typing, load-more and create search with the stored filter, so it must follow the prop while an async allowlist loads. |
| `packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts` | picker-wide additional filter. stored so typing and load-more keep the opener's filter. the search API filters only ids and dates, so object-specific picker filters arrive as id allowlists and narrow both searches. |
| `packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/components/SingleRecordPicker.tsx` | forwarded to the search (Carrier -> Product bridge) |
| `packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/components/SingleRecordPickerMenuItemsWithSearch.tsx` | forwarded to the search (Carrier -> Product bridge) |
| `packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerPerformSearch.ts` | narrows the selectable records (Carrier -> Product bridge) the search API filters only ids and dates, so an object-specific filter arrives as an id allowlist; the current value stays listed. |
| `packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerRecords.ts` | narrows the selectable records (Carrier -> Product bridge) |
| `packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/types/SingleRecordPickerMenuItemsWithSearchProps.ts` | narrows the selectable records (Carrier -> Product bridge) |
| `packages/twenty-front/src/modules/page-layout/widgets/components/WidgetCardShell.tsx` | FIELD widgets pass their field so the header can flag an empty required field. red title for an empty required field widget (contract C5) |
| `packages/twenty-front/src/modules/page-layout/widgets/fields/components/FieldsWidgetFieldItem.tsx` | record page fields flag empty required fields (contract C5) |
| `packages/twenty-front/src/modules/page-layout/widgets/graph/utils/buildFilterFromChartBucket.ts` | one-to-many relations only offer emptiness operands. |
| `packages/twenty-front/src/modules/page-layout/widgets/widget-card/components/PageLayoutWidgetCardHeader.tsx` | red title for an empty required field widget (contract C5) set for FIELD widgets, whose title turns red when the field is required and empty. |
| `packages/twenty-front/src/modules/page-layout/widgets/widget-card/components/WidgetCardHeader.tsx` | red title for an empty required field widget (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/address/components/SettingsDataModelFieldAddressSettingsFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/boolean/components/SettingsDataModelFieldBooleanSettingsFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/components/SettingsDataModelFieldSettingsFormCard.tsx` | soft Required rule (contract C5) soft Required rule (C5); some types hide the unique toggle. |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/components/text/SettingsDataModelFieldTextSettingsFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/currency/components/SettingsDataModelFieldCurrencySettingsFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/date/components/SettingsDataModelFieldDateSettingsFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/morph-relation/components/SettingsDataModelFieldRelationFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/number/components/SettingsDataModelFieldNumberSettingsFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/phones/components/SettingsDataModelFieldPhonesSettingsFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/select/components/SettingsDataModelFieldSelectSettingsFormCard.tsx` | soft Required rule (contract C5) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldSettingsFormSchema.ts` | call-recording displayAs. keep the call-recording displayAs through Settings saves. |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/settingsFieldFormSchema.ts` | soft Required rule (contract C5) soft Required rule (contract C5); zod strips keys the schema does not list. |
| `packages/twenty-front/src/modules/ui/field/display/components/DateTimeDisplay.tsx` | date-only or malformed values must not crash the cell. |
| `packages/twenty-front/src/modules/ui/field/display/components/LinksDisplay.tsx` | 'audio' renders each link as an inline player (call recordings) call recordings play inline instead of opening a link. |
| `packages/twenty-front/src/modules/workflow/workflow-steps/filters/components/WorkflowStepFilterOperandSelect.tsx` | IS_NOT_RELATIVE takes the same relative-date value. |
| `packages/twenty-front/src/modules/workflow/workflow-steps/filters/components/WorkflowStepFilterValueInput.tsx` | IS_NOT_RELATIVE takes the same relative-date value. |

### Omnia-only files

| File | Purpose |
| --- | --- |
| `packages/twenty-front/src/modules/activities/timeline-activities/utils/normalizeLegacyRelationDiffValue.ts` | Legacy bare-uuid relation diff normalizer must exist |
| `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useIsFieldRequired.ts` | useIsFieldRequired hook |
| `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useJunctionBridgeFilter.ts` | Carrier -> Product junction bridge filter hook |
| `packages/twenty-front/src/modules/object-record/record-field/ui/utils/getRecordRequiredFieldViolations.ts` | requiredCondition evaluator (creation-form bridge and record-page indicators) |
| `packages/twenty-front/src/modules/object-record/record-picker/hooks/useFindAllRecordPages.ts` | Picker id allowlists page through every find-many result (the server caps a page at QUERY_MAX_RECORDS) |
| `packages/twenty-front/src/modules/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter.ts` | Lead policy picker allowlist helper |
| `packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerAdditionalFilterComponentState.ts` | Multiple record picker shared additionalFilter state |
| `packages/twenty-front/src/modules/page-layout/widgets/widget-card/hooks/useWidgetCardIsRequiredEmpty.ts` | Required-empty title hook for FIELD widgets |
| `packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx` | Inline diff value (old -> new, Accept/Undo, highlight, note tooltip) |
| `packages/twenty-front/src/modules/reconciliation/components/ReconciliationRecordRelationSection.tsx` | Review page relation section (title, All (N) link, reassign dropdown, list items) |
| `packages/twenty-front/src/modules/reconciliation/components/ReconciliationRecordRelationsList.tsx` | Review page relations list (readable relation fields, reassign dropdown, auto-expanding pending diffs) |
| `packages/twenty-front/src/modules/reconciliation/components/ReconciliationRelationDiffsScope.tsx` | Re-provides ReconciliationDiffsContext with one relation's diffs, prefix stripped |
| `packages/twenty-front/src/modules/reconciliation/components/ReconciliationRelationNameDiffChip.tsx` | Relation chip with name diff and Accept/Undo (reconciliation review) |
| `packages/twenty-front/src/modules/reconciliation/components/ReconciliationRunSummaryBanner.tsx` | Review page must surface run stats/errors/warnings to operators |
| `packages/twenty-front/src/modules/reconciliation/contexts/ReconciliationDiffsContext.ts` | Reconciliation diffs context (contract with the review page) |
| `packages/twenty-front/src/modules/reconciliation/hooks/useReconciliationFieldDiff.ts` | Context-only hook giving each inline cell its reconciliation diff |
| `packages/twenty-front/src/modules/reconciliation/types/FieldDiffOverlay.ts` | Reconciliation inline diff overlay type (moved out of FieldContext) |
| `packages/twenty-front/src/modules/reconciliation/utils/getFieldDiffOverlay.ts` | FieldDiff -> FieldDiffOverlay mapping (moved out of RecordFieldList) |
| `packages/twenty-front/src/modules/reconciliation/utils/getRelationFieldNamesWithPendingDiffs.ts` | Relations auto-expand while their BOB diffs are pending and collapse once resolved |
| `packages/twenty-front/src/modules/reconciliation/utils/getRelationScopedFieldDiffs.ts` | Relation-scoped diff helper |
| `packages/twenty-front/src/modules/reconciliation/utils/invertColumnMapping.ts` | Frontend must resolve BOB values via inverted columnMapping, not hardcoded Ambetter headers |
| `packages/twenty-front/src/modules/reconciliation/utils/normalizeDiffComparableValue.ts` | Null-safe diff comparison helper (moved out of RecordInlineCellContainer) |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm.tsx` | Required field form component |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/utils/settingsDataModelFieldLinksDisplayAsSchema.ts` | LINKS settings schema entry for the call-recording displayAs |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldRequiredFormSchema.ts` | Required form zod schema |
| `packages/twenty-front/src/modules/ui/feedback/background-job-indicator/hooks/useBackgroundJob.ts` | Import progress card API (upsertJob/removeJob) used by the import poller |
| `packages/twenty-front/src/modules/ui/feedback/background-job-indicator/states/backgroundJobState.ts` | Import progress card state (backgroundJobsState, BackgroundJobData) |
| `packages/twenty-front/src/modules/ui/field/display/utils/toTemporalInstantOrNull.ts` | Safe instant parser for DATE_TIME display must exist |

Plus 28 Omnia specs and tests for this area, each pinned by a `check_file_exists`.

---

## Repository tooling, AI instructions and CI

- **AI instructions:** upstream `CLAUDE.md` plus an appended `## Omnia fork` section; `AGENTS.md` is a symlink to it; Omnia skills live in `.claude/skills/` (referenced by explicit paths for Codex); `.claude/settings.json` is upstream's attribution block plus Omnia plugins and env. There is no `docs/ai` mirror, no `.cursor/` rules and no `.codex/` config (the committed one held a token).
- **Toolchain:** Node 26.13.1, yarn 4.18.1 and upstream's `.yarnrc.yml` with `enableScripts: false`.
- **Dependencies:** `packages/twenty-front/package.json` is upstream plus `agentation`; `packages/twenty-server/package.json` is upstream plus `jaro-winkler-typescript` and `xlsx` (SheetJS CDN tarball 0.20.3). A knip baseline is pending before knip can run in CI.
- **CI:** `.github/workflows/` holds only `deploy-eks.yaml` (an optional lean `omnia-ci.yaml` may join it); the upstream workflows, the auto-merging `upstream-sync.yml` cron and the Anthropic-direct `claude.yml` are deleted. Nothing runs the front jest suite automatically.
- **Merge playbook:** `.claude/skills/upstream-merge.md` (tag-based merges, `upgrade` only, never `run-instance-commands --force`).

**Swapped to upstream or dropped in the v2.58 merge (do not re-add):**
- The `docs/ai` generator (`scripts/sync-ai-instructions.mjs`, root `sync:ai-instructions`), `.cursor/` rules, `.codex/config.toml`, the `upstream-sync.yml` and `claude.yml` workflows, `@pierre/diffs`, `diff`, `@types/react-datepicker`, `json-2-csv` and `vite-tsconfig-paths`.

---

## Post-merge checklist

After every upstream merge (playbook: `.claude/skills/upstream-merge.md`):

1. Merge a release tag (`upstream/vX.Y`), never upstream `main`. Run `bash scripts/check-customizations.sh` before and after; every failure is either restored or recorded here with its reason.
2. `npx nx build twenty-shared --skip-nx-cache`, then `npx tsgo -p tsconfig.json --noEmit` in `packages/twenty-server` and `packages/twenty-front` (the nx cache can serve a stale pass).
3. Regenerate front codegen from the merged server (`npx nx run twenty-front:graphql:generate`, plus `--configuration=metadata`); never hand-merge `generated-metadata/` or `generated/`. Confirm no `scope` or `RowLevelPermissionPredicateScope` comes back.
4. Run `lingui:extract` and `lingui:compile` (front and server) in a dedicated `chore(i18n)` commit; the check script warns until the Omnia strings are back.
5. Upgrade a database restored from a production snapshot with `upgrade` only (never `run-instance-commands --force`). Confirm W9 passed (`upgrade:status`) and run `workspace:omnia-verify-permissions` after every app install or sync.
6. Rebuild every internal app with the global `twenty` CLI matching the server version and the matching `twenty-sdk`; `twenty app plan --remote <non-prod>` must show no system-field operations before any sync. Brokerage stays uninstalled (Gate 2).
7. Smoke-test as an agent: sees every policy, edits only their own, is denied others', and a new policy fills the agent; search shows no other agent's leads; the sidebar shows Dashboards, Leads, Calls, Policies, Notes, Tasks and lands on the first; workspace sidebar editing is absent; editing another agent's Agent Profile (its workspace member) is refused.
8. Settings: Roles > Member > Policy shows "Matching records" for create and update, the edit window row saves, and there is no upgrade gate on record-level permissions; Data model > any field shows the "Required" form.
9. UI: index pages show the primary "Create <Object>" button with Delete pinned on records; Cmd+K shows "Go to Leads"; relation sub-field columns render, sort and filter off, and export.
10. Export as an admin and as an agent (sub-field columns and `<Relation> / Id` columns present); import a CSV as an agent.
11. Dashboard SSO from omniaagent.com, and sign-out from the dashboard ends the CRM session, while a link carrying `omniaSignOut=1` from any other site does not. A refresh token copied from a sign-in response is refused by `renewToken` after 5 minutes. Compliance QA end to end.
12. `npx nx lint:diff-with-main twenty-server` and `twenty-front`; the 24 frozen legacy migrations fail oxfmt by design and stay byte-identical.
13. After a deploy: `cache:flush`, then check that the BullMQ schedulers exist and run `cron:register:all`.
