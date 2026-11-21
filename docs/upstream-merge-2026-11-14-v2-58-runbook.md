# Prod cutover runbook: upstream v2.58 merge (2026-11-14)

Production runs upstream v2.6 plus Omnia. Its upgrade cursor sits in the 2.7 workspace segment, because the v2.19 merge never shipped. This merge (branch `merge/upstream-2026-11-14`, upstream `twenty/v2.58.1`, commit `6a8447bc842`) moves prod to 2.58 in one maintenance window: 51 versions of upstream instance and workspace commands, plus the Omnia commands in `packages/twenty-server/src/database/commands/upgrade-version-command/omnia/`. It replaces `upstream-merge-2026-06-30-deploy-runbook.md`.

## Rules for the whole cutover

- **Fix forward.** The RDS snapshot from P1 step 1 is the only way back to v2.6. A pre-2.58 image never runs on the upgraded database.
- **`helm upgrade` only.** No `--install` (an install skips the pre-upgrade job) and no `--atomic` (the job has already upgraded the database, so a rollback would run the old image on it). Always pass the image tags with `--set-string`; `omnia-values.yaml` says `latest`.
- **`upgrade` only.** Never `run-instance-commands --force` or `database:migrate`: they record the fast commands for every workspace, so `upgrade` then skips every slow and workspace command in between.
- Never `FLUSHALL` Redis: it wipes the BullMQ queues and schedulers. Use `cache:flush`.
- Never run `billing:sync-entitlements` (with billing on, it deletes every RLS predicate group), and never `twenty app apply` or `twenty app dev` against prod.
- The pre-flight SQL is read-only. All SQL here returns metadata, counts and ids, never record values (PHI), and every write reports a row count only.

## Names

| | |
|---|---|
| Namespace / Helm release | `twentycrm` / `my-twenty` |
| Deployments | `my-twenty-twenty-server`, `my-twenty-twenty-worker`, `my-twenty-twenty-redis` |
| Image | `$REPO:$TAG`, with `REPO=189365142140.dkr.ecr.us-east-1.amazonaws.com/twenty-crm` and `$TAG` the 7-character SHA of the `main` commit to deploy |
| AWS profile | `twenty-admin` (`.claude/skills/prod-k8s/SKILL.md`) |
| Workspace id and schema | `SELECT id, "databaseSchema" FROM core.workspace;` |

Read-only psql session on prod (P0):

```bash
kubectl -n twentycrm exec -i deploy/my-twenty-twenty-server -- \
  sh -c 'PGOPTIONS="-c default_transaction_read_only=on" psql "$PG_DATABASE_URL" -X' < preflight.sql
```

Omnia upgrade steps, in the order `upgrade` runs them:

| Step | Upgrade step or command | Does |
|---|---|---|
| I1 | `2.8.0` fast `1798100000000`, `OmniaFinalizeRolePermissionFlagCutoverCatchUp…` | Runs upstream's skipped 2.7 Finalize: relinks `rolePermissionFlag` rows, drops `flag`. Fails on orphan rows. |
| I2 | `2.58.0` fast `1794500000000` | Adds `core."importJob"."userWorkspaceId"` |
| W1 | `upgrade:2-58:omnia-translate-scoped-row-level-permissions` (`1794337540400`) | Translates `scope` predicates into rules and "Agent is Me" hops, before upstream's backfill `1794337540466` |
| W2–W4 | `…-backfill-custom-object-search-fields`, `…-set-recording-field-display-as-audio`, `…-consolidate-standard-delete-command-menu-items` | Search fields, call recording display, unified delete commands |
| W5 | `upgrade:2-58:omnia-migrate-one-to-many-view-filters` | Migrates one-to-many view filters; logs the rest as `fix them by hand` |
| W6–W8 | `…-sync-dashboard-audience`, `…-reconciliation-object-lockdown`, `…-purge-legacy-export-files` | Dashboard audience rules, reconciliation lockdown, deletes `export/exports/` files |
| W8b | `upgrade:2-58:omnia-restore-standard-object-permission-lockdown` (`1794500008000`) | Gives the six standard objects synced after 2.53 (`recordShare`, `shortLink`, `agentMessageReaction`, `campaignDelivery`, `messageSuppression`, `agentChatThreadParticipant`) the record-action lockdown a fresh v2.58 workspace has. Without it every role can write record shares, including on other users' private AI threads. Adds actions only. |
| W9 | `upgrade:2-58:omnia-verify-permissions` (`1794500009000`) | Fails the upgrade on any RLS or PHI-gate violation. Also `workspace:omnia-verify-permissions`. |
| W10 | `upgrade:2-58:omnia-prioritize-initial-object-views` (`1795231988000`) | Moves each object's "All <records>" view (seeded by upstream 2.41) ahead of its other views. v2.58 opens the first non-INDEX view, so without it users land on views such as DNT or Today. |

## Before P0: the branch

- The upstream merge is committed, then `origin/main` is merged in, including #113 (`fdd1f7ae542`).
- Gates are green: `bash scripts/check-customizations.sh` (treat SKIP as a failure); `npx tsgo -p tsconfig.json --noEmit` in twenty-shared, twenty-server and twenty-front; server and front jest; `npx nx lint:diff-with-main` for server and front; the `chore(i18n)` extract and compile commit.
- Front gate: `grep -c RefreshOmniaSiblingSessionDocument packages/twenty-front/src/generated-metadata/graphql.ts` prints more than 0. Under Vite a missing named export stops the whole app from loading.

## P0. Preparation (days before)

1. **Deploy pipeline.** Fix GitHub Actions (no run since 2026-10-08). Find which image prod runs and how #112 reached it: `kubectl -n twentycrm get deploy my-twenty-twenty-server -o jsonpath='{..image}'`. CI has never built a v2.58 image, and its front build needs an 8 GB heap that may run out on `ubuntu-latest`, so step 10 builds the image by hand.
2. **Pre-flight SQL** ([below](#pre-flight-sql)). Resolve every finding before the window, and record the decisions on the cutover's Linear issue.
   - **Workflow runs** (pre-flight 24). v2.58's stale-run cron re-queues every run left ENQUEUED and resumes every RUNNING one. On the snapshot that replays 6,252 runs from March to May (Lead Contacted would move about 2,200 leads from Assigned back to Contacted) and resumes 409 runs of the deactivated "Post Policy Sale SMS Campaigns". P1 step 4 stops them. Decide with Matthew whether the 409 SMS runs may continue (recommended: no). Stopping them is safe before the window too, away from 00:00 UTC when delayed steps resume.
3. **Retired apps.**
   - call-recording (`4daa5147-…`): if it is installed, export its data, then uninstall it under Settings > Applications. Otherwise the 2-10 upgrade renames its `callRecording` object to `callRecordingOld`.
   - payment-reconciliation v1 (`d11726da-…`): if it is installed, export its `payRecon*` data and run `scripts/drop-payrecon-v1-app.sh <workspaceId>` on a local copy. Then, with Matthew and after a manual RDS snapshot, run it on prod, followed by `yarn command:prod cache:flush` in a server pod.
   - Its orphaned registration (`core."applicationRegistration"` `d48027d2-2348-4937-a4ce-3db7535677af`, no installs) must go too. Its `TWENTY_API_KEY` variable predates the `enc:v2` format, and the 2.5 backfill that converts such values sorts before prod's cursor, so the 2.31 CHECK fails the upgrade on it (rehearsal, 2026-11-20). With Matthew, once pre-flight 23 shows no `core.application` row uses it, delete its `core."applicationRegistrationVariable"` rows, then the registration. The API key it held (`apps`, 2026-03-17) is already revoked.
   - self-hosting, twenty-for-twenty and twenty-partners (deleted upstream) must not be installed. Uninstall any that is.
4. **Compliance-qa** (`packages/twenty-apps/internal/compliance-qa/README.md` (a), (b), (f)):
   - The `DEEPGRAM_API_KEY` registration server variable exists and holds the BAA-covered Deepgram key. Set it under Settings > Applications on v2.6 (on v2.58: Settings > Developers > Apps > Compliance > Config). If it cannot be set in time, deactivate the "Compliance Call Pipeline" for the window and catch up later with `backfill-compliance-qa`.
   - Put compliance-qa's `core.application."applicationRegistrationId"` in `LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS` in `omnia-values.yaml`. It ships empty, so compliance-qa's S3, Bedrock and Translate calls fail until it is set. If the registration has no owner workspace, claim ownership first.
   - Never reinstall or re-sync compliance-qa 1.1.x on v2.58.
5. **Webhook rate limit.** Measure the peak webhook calls per minute to omniaagent.com over 30 days, including a bulk-import day, from the receiver's access logs. Set `WEBHOOK_CALL_RATE_LIMITING_LIMIT` in `omnia-values.yaml` to peak × 2, or 600 if unmeasured. Calls above the limit are dropped and recorded as failed webhook responses, not queued. A dropped person event is lost to Nia's consent mirror (`doNotText`, `doNotCall`) for good, because nothing re-syncs it: size the limit so no bulk operation reaches it, and run Nia's `scripts/twenty-native-parity.ts` after any bulk operation.
6. **Push senders.** After the cutover, the ingestion push endpoint reads the secret only from the `x-webhook-secret` header, and a pipeline without a secret accepts no push. Move each push sender (pre-flight 18) from `?secret=` to the header now: v2.6 accepts both.
7. **Pod IMDS block** (required before go-live). On every node group launch template, set `HttpTokens: required` and `HttpPutResponseHopLimit: 1`, then roll the node group. The hop limit alone does not stop IMDSv1. The alternative is a NetworkPolicy that denies `169.254.169.254` and keeps the Pod Identity agent (`169.254.170.23`) reachable. First check that no non-hostNetwork add-on relies on the node role. Then verify from a pod that has curl:
   ```bash
   curl -s -m 3 -o /dev/null -w '%{http_code}\n' http://169.254.169.254/latest/meta-data/   # 401 (000 with the NetworkPolicy)
   curl -s -m 3 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' -o /dev/null -w '%{http_code}\n' \
     http://169.254.169.254/latest/api/token                                                # 000 (timeout)
   ```
8. **Signing-key decision** (Matthew). v2.6 access tokens are stateless bearer tokens valid for up to 7 days (the chart's `ACCESS_TOKEN_EXPIRES_IN`; `omnia-values.yaml` now sets 30m). They sit in the legacy JS `tokenPair` cookie or in `sessionStorage` (`impersonation_original_session`), and revoking refresh tokens does not end them. Revoking the signing keys ends them at the cutover. It does not end legacy HS256 API keys (pre-flight 20): v2.58 still verifies those from `APP_SECRET`, and regenerating a key leaves the old token valid too. Retire a key only with `revokeApiKey` plus a new key, then update and restart its consumer. Choose one: revoke in P1 step 6 and retire the listed keys, or accept the tail of up to 7 days.
9. **Dashboard (`~/command`) change**, ready to ship in P1 step 8 (it deploys on push to master):
   - Read the session server-side from the httpOnly `tokenPair` cookie on `.omniaagent.com`. Its JSON is `{"accessOrWorkspaceAgnosticToken":{"token","expiresAt"}}`: an access token only, no `refreshToken`, valid for at most 30 minutes (a copy taken before a sign-out stays valid until then). On a missing or expired token, send the browser to `${CRM_FRONTEND_URL}/welcome?postSignInRedirect=<dashboard url>`.
   - Sign out: after `$signOut()`, `SignOutDialog` sends the top-level window to `${CRM_FRONTEND_URL}/welcome?omniaSignOut=1&postSignInRedirect=<dashboard url>` instead of `/sign-in`. Only the CRM can end its host-only `__Host-twenty-session`. Without this change, dashboard Sign out signs the user straight back in, a HIPAA access-control regression on shared call-centre workstations.
   - Do not ship it before the CRM cutover: on v2.6 the new Sign out link bounces back signed in.
   - Every host under `.omniaagent.com` receives this cookie. Review DNS and keep every host Omnia-controlled.
10. **Pause the workflow and build the image** (day before). A push to `main` otherwise builds and runs `helm upgrade`, whose pre-upgrade job runs the 2.7 → 2.58 upgrade while v2.6 pods still serve traffic. `main` stays frozen until P2; a hotfix goes on top and gets a new `$TAG`.
    ```bash
    gh workflow disable deploy-eks.yaml -R Omnia-Insurance/crm
    # merge the PR with "Create a merge commit", never squash
    git checkout main && git pull --ff-only
    export AWS_PROFILE=twenty-admin REPO=189365142140.dkr.ecr.us-east-1.amazonaws.com/twenty-crm
    export TAG=$(git rev-parse HEAD | cut -c1-7)
    APP_VERSION=$(sed -n "s/^export const TWENTY_CURRENT_VERSION = '\([0-9.]*\)'.*/\1/p" \
      packages/twenty-server/src/engine/core-modules/upgrade/constants/twenty-current-version.constant.ts)
    aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "${REPO%/*}"
    docker buildx build --platform linux/amd64 -f packages/twenty-docker/twenty/Dockerfile --target twenty \
      --build-arg "APP_VERSION=$APP_VERSION" -t "$REPO:$TAG" --push .
    ```
11. **Rehearse on a fresh prod snapshot**, after steps 3 to 6, with the server built from `main`. Never rehearse on a dev database with gaps in its upgrade history ([Dev databases](#dev-databases)).
    - Restore with `scripts/replicate-db-to-local.sh --via-k8s --yes 2>&1 | tee rehearsal.log` (env vars in its header). It deletes the prod signing keys and refresh tokens, and runs `cache:flush` and `upgrade` against the copy. The copy holds PHI: keep it on the encrypted laptop and drop it after P2.
    - The script disconnects the copy from prod services (webhooks, pull pipelines, mail and calendar sync, SMTP, Sentry, telemetry). Before a worker runs on it, also deactivate its Compliance Call Pipeline and delete the local `bull:webhook-queue:*` keys, or it calls Deepgram and replays queued webhooks.
    - If the script warns that the local encryption key is the prod key, the copy's OAuth tokens and app secrets are live: never run a worker on it.
    - Never let PHI into a model context during the rehearsal. Check UI pages with a script that prints routes, counts and record ids, not with screenshots of record pages.
    - `upgrade` must finish with exit 0. W9 runs after every permission step and fails it on any violation. `upgrade --dry-run` stops at the first instance step, so only a real run proves W1 and W9.
    - Read the upgrade time from the log timestamps, and size the window and the cutover job's `activeDeadlineSeconds` from it. Rehearsal 2026-11-20 on a laptop (238k persons, 421k calls, 1.7M timeline activities): about 3 minutes of runtime over 626 steps. The longest single step was the 2.35 `timelineActivity` search-vector column, at 27 s.
    - Run the [post-upgrade checks](#post-upgrade-checks).
    - W5 manual-fix list: `grep 'fix them by hand' rehearsal.log`. `yarn command:prod upgrade:2-58:omnia-migrate-one-to-many-view-filters --dry-run` lists them again, because W5 leaves those rows unchanged. The snapshot's ids match prod. Before P1, repair or delete those view filters on prod, review the chart-widget and workflow filters it reports, and record the ids on a Linear issue. In v2.58 such a row compiles to no filter (the view silently drops a condition), or throws for a UUID-valued unsupported operand.
    - W8 keeps the export file rows whose storage object is missing. That is expected on a local copy without S3 files.
    - Rehearse P1 step 6, including the signing-key revoke if step 8 chose it: afterwards sign-in works, and a legacy API key still works until it is revoked (step 8).
    - Before any worker runs on the copy, run P1 step 4's workflow-run statements in their post-upgrade form (expect 6,252, 19 and 409 rows on the November snapshot), or it replays them against the copy.
    - Run the [smoke checks](#smoke-checks) as an agent and as an admin. Time the Policies index and kanban as an agent (the hop renders as SQL `EXISTS`); if they are slow, capture the query with a local `log_min_duration_statement` and `EXPLAIN ANALYZE` it.
    - Smoke-test the pushed image itself on the copy: run `$REPO:$TAG` as the server and as the worker (`yarn worker:prod`) with the local env, `DISABLE_DB_MIGRATIONS=true` and `host.docker.internal` for Postgres and Redis. Sign in (bcrypt), run an XLSX import (worker), and check `yarn command:prod upgrade:status`.
    - Run `cron:register:all` on the copy and record `ZCARD bull:cron-queue:repeat` as the P2 baseline.
12. **S3 versioning.** W8 deletes the legacy export files, which hold PHI. Confirm that the bucket is unversioned or has a lifecycle rule that expires noncurrent versions:
    ```bash
    aws s3api get-bucket-versioning --bucket twenty-crm-storage-189365142140
    aws s3api get-bucket-lifecycle-configuration --bucket twenty-crm-storage-189365142140
    ```
13. **Rotate the ui.sh MCP token.**
14. **Announce** the window and the user-visible changes:
    - Everyone signs in again once, because old sessions are revoked. Dashboard Sign out now also signs out of the CRM.
    - Search no longer matches the middle of words (digit fragments such as phone endings still match). Agents still see every lead, as today.
    - One running export per workspace. It is cancelled when the tab closes, and there is no export from a record page. Imports run with the importer's permissions.
    - Roles with a dashboard audience see and edit only the dashboards tagged for them.
    - Create opens the new record. The 10,000-record cap on bulk delete is gone.
    - Workflow "is not relative" date filters no longer match empty dates.
    - Bulk operations above the webhook limit per minute drop deliveries to omniaagent.com.
    - API clients get 429 above 500 requests per second or 5,000 per minute; Omnia scripts do not back off yet.

## P1. Maintenance window

1. **Start.** Announce downtime. Keep users out until step 9 with a Cloudflare rule for `crm.omniaagent.com` that admits only the operators' IPs. Take a manual RDS snapshot and wait for it:
   ```bash
   SNAPSHOT=twenty-pre-v258-$(date +%Y%m%d%H%M)
   aws rds create-db-cluster-snapshot --db-cluster-identifier twenty-crm-db --db-cluster-snapshot-identifier "$SNAPSHOT"
   aws rds wait db-cluster-snapshot-available --db-cluster-snapshot-identifier "$SNAPSHOT"
   ```
2. **Scale to 0.** Stop the server first and let the worker drain the webhook queue, then stop the worker:
   ```bash
   kubectl -n twentycrm scale deploy/my-twenty-twenty-server --replicas=0
   kubectl -n twentycrm exec deploy/my-twenty-twenty-redis -- \
     sh -c 'redis-cli LLEN bull:webhook-queue:wait; redis-cli ZCARD bull:webhook-queue:prioritized'   # near 0
   kubectl -n twentycrm scale deploy/my-twenty-twenty-worker --replicas=0
   kubectl -n twentycrm get pods   # no server or worker pod left
   ```
   Pull pipelines catch up within their lookback (120 minutes for Convoso calls in `scripts/switch-convoso-to-pull-mode.sql`). Backfill a longer gap with `scripts/backfill-calls.sh`.
3. **Cutover pod.** Render the migration job with the new image (`REPO` and `TAG` as in P0 step 10), so the pod has the server env, the storage env, `extraEnv` and `serviceAccountName: twenty-bedrock`:
   ```bash
   helm template my-twenty packages/twenty-docker/helm/twenty -n twentycrm \
     -f packages/twenty-docker/helm/twenty/omnia-values.yaml \
     --set server.image.repository=$REPO --set-string server.image.tag=$TAG \
     --show-only templates/job-migration.yaml > cutover-job.yaml
   ```
   Edit `cutover-job.yaml`:
   - `metadata.name` becomes `my-twenty-twenty-cutover`
   - delete `metadata.annotations` (the Helm hook)
   - set `spec.backoffLimit: 0` and `spec.activeDeadlineSeconds` to at least 3× the rehearsal time
   - set the container `command` to `["sh", "-c", "tail -f /dev/null"]`

   Then start it and open a shell. The SQL in steps 4 and 6 runs here with `psql "$PG_DATABASE_URL"`:
   ```bash
   kubectl apply -f cutover-job.yaml
   kubectl -n twentycrm wait --for=condition=Ready pod -l job-name=my-twenty-twenty-cutover --timeout=10m
   kubectl -n twentycrm exec -it job/my-twenty-twenty-cutover -- sh
   ```
4. **Stop in-flight jobs.** Run this SQL, then delete only the old export and import queue keys:
   ```sql
   UPDATE core."exportJob" SET status = 'cancelled' WHERE status IN ('pending', 'processing');
   UPDATE core."importJob" SET status = 'failed' WHERE status IN ('uploading', 'pending', 'processing');

   -- Old workflow runs (P0 step 2). STOPPED, not FAILED: users can retry FAILED runs. Run c only if P0 decided it.
   BEGIN;
   UPDATE "<databaseSchema>"."workflowRun" SET status = 'STOPPED', "endedAt" = now(), "updatedAt" = now()
   WHERE "deletedAt" IS NULL AND status IN ('ENQUEUED', 'NOT_STARTED') AND "createdAt" < now() - interval '1 day'
     AND "workflowId" IN ('a63eb315-0393-421f-9434-7372b9583c88', '8c9711ba-8a61-406e-8ff3-f16a5a55f2a9', '3ca3e3fc-f360-413c-86ee-8ac83c1a6937', '32ef78c2-f7f2-4e07-96b0-8b35e57b2d13', '96307355-057d-44c3-9018-8ce82202e840');  -- a: queued runs
   UPDATE "<databaseSchema>"."workflowRun" SET status = 'STOPPED', "endedAt" = now(), "updatedAt" = now()
   WHERE "deletedAt" IS NULL AND status = 'RUNNING' AND "updatedAt" < now() - interval '1 day'
     AND "workflowId" IN ('a63eb315-0393-421f-9434-7372b9583c88', '8c9711ba-8a61-406e-8ff3-f16a5a55f2a9', '3ca3e3fc-f360-413c-86ee-8ac83c1a6937', '32ef78c2-f7f2-4e07-96b0-8b35e57b2d13');  -- b: stuck runs
   UPDATE "<databaseSchema>"."workflowRun" SET status = 'STOPPED', "endedAt" = now(), "updatedAt" = now()
   WHERE "deletedAt" IS NULL AND status = 'RUNNING' AND "workflowId" = '96307355-057d-44c3-9018-8ce82202e840';  -- c: SMS campaign
   COMMIT;  -- only if the counts match pre-flight 24
   ```
   - On the upgraded copy the column is `"coreWorkflowId"`: use `"coreWorkflowId" IN (SELECT id FROM core.workflow WHERE "workspaceWorkflowId" IN (...))`.
   - Leave the `workflow-queue` and `delayed-jobs-queue` keys alone: each job re-reads its run and does nothing unless it is RUNNING. Never `FLUSHALL`.
   ```bash
   kubectl -n twentycrm exec deploy/my-twenty-twenty-redis -- sh -c \
     'for q in export-queue import-queue; do redis-cli --scan --pattern "bull:$q:*" | xargs -r redis-cli DEL; done'
   ```
5. **Upgrade.** In the cutover pod:
   ```sh
   yarn command:prod omnia:run-legacy-typeorm-migrations   # expect "No pending legacy migrations"
   yarn command:prod cache:flush
   PG_DATABASE_PRIMARY_TIMEOUT_MS=3600000 yarn command:prod:background upgrade   # detached; Ctrl+C only stops the stream
   yarn command:prod:background:logs                       # until EXIT=0
   yarn command:prod upgrade:status                        # clean
   grep 'fix them by hand' /tmp/twenty-command.log        # W5 ids not handled in P0
   ```
   - The timeout override covers the table rewrites. In the rehearsal, the 2.35 `timelineActivity` search vector outlasted a 10 s timeout, and prod's 120 s is not a safe margin on Aurora.
   - If a step still fails with `Query read timeout`, run `upgrade` again: it resumes at the failed step.
   - Any W5 id that P0 did not handle goes on the same Linear issue and is fixed the same day.
   - Copy the log out before the pod goes: `kubectl -n twentycrm cp <pod>:/tmp/twenty-command.log upgrade-v258.log`, with `<pod>` from `kubectl -n twentycrm get pod -l job-name=my-twenty-twenty-cutover -o name`.
   - If I1, W1 or W9 stops the run, see [Contingencies](#contingencies). If W9 fails, stop: pods stay at 0 and RLS stays fail-closed.
   - Run the [post-upgrade checks](#post-upgrade-checks).
6. **Post-upgrade SQL**, while pods are still at 0:
   ```sql
   -- a. Revoke legacy refresh tokens. Nothing mints new ones while pods are at 0, so no timestamp filter.
   UPDATE core."appToken"
   SET "revokedAt" = COALESCE("revokedAt", now()),
       "context" = COALESCE("context", '{}'::jsonb) || jsonb_build_object('revokedReason', 'USER_REVOKED')
   WHERE "type" = 'REFRESH_TOKEN' AND "expiresAt" > now();

   -- b. Realign AI to Bedrock. 2.9 turned AI_MODEL_PREFERENCES into AI_MODELS_DEFAULT_* rows that beat
   --    the Bedrock pins in omnia-values.yaml (on the prod copy, SMART held no Bedrock model at all).
   DELETE FROM core."keyValuePair"
   WHERE type = 'CONFIG_VARIABLE' AND (key = 'AI_MODEL_PREFERENCES' OR key LIKE 'AI\_MODELS\_DEFAULT\_%');

   -- c. Rows that pre-flight 14 found shadowing omnia-values.yaml pins (TELEMETRY_ENABLED, *_RATE_LIMITING_*,
   --    ACCESS_TOKEN_EXPIRES_IN), any non-Bedrock provider key, and SENTRY_DSN, SENTRY_FRONT_DSN and
   --    SENTRY_ENVIRONMENT unless their project is confirmed deleted, as P0 decided.
   DELETE FROM core."keyValuePair"
   WHERE type = 'CONFIG_VARIABLE' AND "workspaceId" IS NULL AND "userId" IS NULL AND key IN ('<key from P0>');

   -- d. Only if P0 step 8 chose it: revoke the signing keys. This ends every pre-cutover access token and API key;
   --    the server creates a new key on first use.
   UPDATE core."signingKey" SET "revokedAt" = now(), "isCurrent" = false, "privateKey" = NULL WHERE "revokedAt" IS NULL;
   ```
   - The revoke reason in (a) is required: a revoke without one stays renewable through the public `renewToken` bridge for `REFRESH_TOKEN_REUSE_GRACE_PERIOD`.
   - (d) does not end legacy API keys. To retire one from pre-flight 20, run `revokeApiKey`, create a new key, then update and restart its consumer.
   - Then run `yarn command:prod cache:flush` in the cutover pod and `kubectl -n twentycrm delete job my-twenty-twenty-cutover`.
7. **Deploy.** From `main` at `$TAG`:
   ```bash
   git checkout main && test "$(git rev-parse HEAD | cut -c1-7)" = "$TAG"
   AWS_PROFILE=twenty-admin ./scripts/deploy-local.sh --deploy-only
   kubectl -n twentycrm get deploy my-twenty-twenty-server my-twenty-twenty-worker -o jsonpath=\
   '{range .items[*]}{.metadata.name} {.spec.template.spec.serviceAccountName} {.spec.template.spec.containers[0].image}{"\n"}{end}'
   ```
   - Both deployments must show `twenty-bedrock` and `:$TAG`.
   - The pre-upgrade job's `upgrade` is a no-op.
   - Server pods skip upgrades (`DISABLE_DB_MIGRATIONS=true`) and run `cron:register:all` at start.
8. **Ship the dashboard change** from P0 step 9.
9. **Smoke checks** ([below](#smoke-checks)), then remove the Cloudflare rule.

## P2. After the window (same day)

- **Workflow.** Re-enable it: `gh workflow enable deploy-eks.yaml -R Omnia-Insurance/crm`. The next push to `main` is the first v2.58 CI build: watch it.
- **Schedulers.** About 5 minutes after pods are up, compare these counts with the rehearsal baseline. `ingestion-queue` must equal `SELECT count(*) FROM core."ingestionPipeline" WHERE mode = 'pull' AND "isEnabled" AND "deletedAt" IS NULL AND schedule IS NOT NULL;`. If a count is short, run `kubectl -n twentycrm exec deploy/my-twenty-twenty-server -- yarn command:prod cron:register:all`.
  ```bash
  kubectl -n twentycrm exec deploy/my-twenty-twenty-redis -- \
    sh -c 'redis-cli ZCARD bull:cron-queue:repeat; redis-cli ZCARD bull:ingestion-queue:repeat'
  ```
- **AI.** The model list shows Bedrock models only, and an AI chat answers. Turn on the data policy flag (`yarn command:prod feature-flag:update -f IS_AI_DATA_POLICY_ENABLED --value true -w <workspaceId>`). Then set AI data processing: product-improvement sharing off, zero data retention not required, no residency region.
- **Webhooks.** Every webhook has a role ([post-upgrade checks](#post-upgrade-checks)), and deliveries reach omniaagent.com. During the first bulk operation, watch the failed webhook responses for rate-limit drops.
- **Compliance-qa** end to end (README (c)). The legacy pipeline is the core workflow whose `workspaceWorkflowId` is `32ef78c2-f7f2-4e07-96b0-8b35e57b2d13`; find it by that id, never by name. An eligible Call update starts a run, the scorecard reaches a final status, and the run shows no Deepgram, S3 or Bedrock credential errors.
- **Exports** as an admin and as the Investor; agents have no export flag, as on v2.6.
- **Workflow runs.** About 2 hours after pods are up: no ENQUEUED or NOT_STARTED run is older than a day, and no run created before the window started or resumed after it (except the SMS runs if P0 kept them). An eligible call insert now also starts a compliance run; after a day no call has two live scorecards: `SELECT count(*) FROM (SELECT "callId" FROM "<databaseSchema>"."_qaScorecard" WHERE "deletedAt" IS NULL AND "callId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d;` returns 0.
- **Dashboard** SSO round trip and Sign out ([smoke checks](#smoke-checks) 11 and 12).
- **Internal apps.** Nothing to re-sync now: payment-reconciliation is gone, and Brokerage is not installed and stays deploy-gated. Before any app's first v2.58 sync:
  - rebuild it with the v2.58 `twenty` CLI and SDK (a v2.19-SDK manifest fails with `NON_UPDATABLE_PROPERTY_DIVERGENCE`)
  - `twenty app plan --remote <non-prod>` must show zero system-field operations
  - never re-sync compliance-qa 1.1.x
  - run `yarn command:prod workspace:omnia-verify-permissions` after every install or sync
- **Google domain-wide delegation** is retired. Delete the `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` config row, revoke the grant in Google Admin, delete the GCP key, and remove the connected accounts the provisioner created (they fail sync).
- **Cleanup.** Fix the remaining W5 ids. Drop the local rehearsal copy and any dumps (PHI). Post the Linear status update.

## P3. Follow-ups (Linear, team OMN, existing projects)

- compliance-qa 1.2.0: the v2.58 SDK and CLI, `defineWorkflow`, the kill switch `COMPLIANCE_QA_AUTOMATIC_PROCESSING_ENABLED`, and the Deepgram server variable docs. The cut-over deactivates the legacy core workflow found by `workspaceWorkflowId`, not by name.
- S3 through Pod Identity, as a separate deploy:
  - delete the `STORAGE_S3_*` config rows first
  - grant the role scoped S3 access: Get, Put, List and AbortMultipartUpload, plus Delete everywhere except `compliance-qa/*`, and KMS if the bucket uses SSE-KMS
  - smoke-test from a pod, then remove the static key
- Next release: drop `scope` from `core."rowLevelPermissionPredicate"` and `core."rowLevelPermissionPredicateGroup"` with their enum types, and `core."exportJob"` with its enum. They are kept now for the snapshot rollback.
- Brokerage project (deploy gate: no install or sync on v2.58 until it lands):
  - SDK 2.58
  - manifest and post-install send the hop predicate with rule grants and turn object-level writes off; no object-level all-records grant on RLS objects, read included
  - the adoption command is rewritten to copy rules
  - `isSearchable`, `isUnique` and `displayAs: 'audio'` declarations
  - Agent Person read (and update, if the rule restricts it) is false once the own-leads rule is adopted, plus the role-wide read-all decision
  - Member's edit window is declared in `agent.role.ts`
- Dashboard SSO through upstream OAuth, replacing the sibling cookie.
- Validation rules for the hard invariants that ingestion always fills.
- Curated sidebar tree with per-role hiding.
- Product decision: block "All records" edit, delete and destroy grants on PHI objects (person, call, reconciliation) when a rule exists? W9 does not flag them today.
- Infra hardening:
  - RDS TLS with verify-full (`db.external.ssl: false` today)
  - Redis persistence and TLS
  - a per-app STS role for compliance-qa, replacing the shared container credentials
  - ingress-nginx retirement
  - delete the unused `deepgram-credentials` secret
- Upstream PR candidates: the depth-2 nested-relation assign order (now many-to-one only), and per-subscriber record copies in `ObjectRecordEventPublisher` (an SSE subscriber can receive relations loaded for another subscriber in the same batch).
- Omnia scripts handle 429 and `Retry-After`.

## Pre-flight SQL

Run on prod (2.7 schema) in the read-only session. Each comment says what passes.

```sql
-- 1. Upgrade cursor. Expect the newest rows to be 2.7 workspace commands, all completed.
SELECT name, status, "workspaceId" IS NULL AS is_instance, "createdAt"
FROM core."upgradeMigration" ORDER BY "createdAt" DESC LIMIT 10;

-- 2. Legacy TypeORM migrations: see the diff below the block.

-- 3. rolePermissionFlag rows I1 must relink. Expect orphans = 0; relink or delete orphans before the window.
SELECT rpf.flag, count(*) AS unlinked, count(*) FILTER (WHERE pf.id IS NULL) AS orphans
FROM core."rolePermissionFlag" rpf
LEFT JOIN core."permissionFlag" pf ON pf.key = rpf.flag AND pf."workspaceId" = rpf."workspaceId"
WHERE rpf."permissionFlagId" IS NULL
GROUP BY rpf.flag ORDER BY rpf.flag;

-- 4. RLS scopes per role and object. Expect Member and Agent x policy = {WRITE}, and one {READ} dashboard
--    row per gated role. A pair with two scopes blocks the deploy: flatten it by hand with Matthew first.
WITH rls AS (
  SELECT "roleId", "objectMetadataId", scope::text AS scope, 'predicate' AS kind,
         "rowLevelPermissionPredicateGroupId" IS NULL AS ungrouped, NULL::boolean AS is_root
  FROM core."rowLevelPermissionPredicate" WHERE "deletedAt" IS NULL
  UNION ALL
  SELECT "roleId", "objectMetadataId", scope::text, 'group', NULL,
         "parentRowLevelPermissionPredicateGroupId" IS NULL
  FROM core."rowLevelPermissionPredicateGroup" WHERE "deletedAt" IS NULL)
SELECT r.label AS role, om."nameSingular" AS object, array_agg(DISTINCT rls.scope) AS scopes,
       count(*) FILTER (WHERE kind = 'predicate') AS predicates,
       count(*) FILTER (WHERE kind = 'group' AND is_root) AS root_groups,
       count(*) FILTER (WHERE kind = 'predicate' AND ungrouped) AS ungrouped_predicates
FROM rls JOIN core.role r ON r.id = rls."roleId"
JOIN core."objectMetadata" om ON om.id = rls."objectMetadataId"
GROUP BY 1, 2 ORDER BY 1, 2;

-- 5. Predicate shapes (operand per field type, "Me" through a relation). W1 aborts on an operand the field
--    type does not allow, so the rehearsal proves this list.
SELECT r.label AS role, om."nameSingular" AS object, p.scope, f.name AS field, f.type AS field_type,
       tgt."nameSingular" AS field_target, wmf.name AS member_field, p.operand, count(*)
FROM core."rowLevelPermissionPredicate" p
JOIN core.role r ON r.id = p."roleId"
JOIN core."objectMetadata" om ON om.id = p."objectMetadataId"
JOIN core."fieldMetadata" f ON f.id = p."fieldMetadataId"
LEFT JOIN core."objectMetadata" tgt ON tgt.id = f."relationTargetObjectMetadataId"
LEFT JOIN core."fieldMetadata" wmf ON wmf.id = p."workspaceMemberFieldMetadataId"
WHERE p."deletedAt" IS NULL
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8 ORDER BY 1, 2, 3;

-- 6. Cross-role, cross-object or dangling links. W1 aborts on these. Expect 0 rows.
SELECT 'predicate' AS kind, p.id FROM core."rowLevelPermissionPredicate" p
JOIN core."rowLevelPermissionPredicateGroup" g ON g.id = p."rowLevelPermissionPredicateGroupId"
WHERE p."deletedAt" IS NULL
  AND (g."roleId" <> p."roleId" OR g."objectMetadataId" <> p."objectMetadataId" OR g."deletedAt" IS NOT NULL)
UNION ALL
SELECT 'group', g.id FROM core."rowLevelPermissionPredicateGroup" g
JOIN core."rowLevelPermissionPredicateGroup" parent ON parent.id = g."parentRowLevelPermissionPredicateGroupId"
WHERE g."deletedAt" IS NULL
  AND (parent."roleId" <> g."roleId" OR parent."objectMetadataId" <> g."objectMetadataId"
       OR parent."deletedAt" IS NOT NULL);

-- 7. Object grants of the roles that have predicates (W1 turns the restricted operations off).
SELECT r.label AS role, om."nameSingular" AS object, op."canReadObjectRecords", op."canUpdateObjectRecords",
       op."canSoftDeleteObjectRecords", op."canDestroyObjectRecords", op."showInSidebar", op."editWindowMinutes",
       r."canReadAllObjectRecords", r."canUpdateAllObjectRecords"
FROM core."objectPermission" op
JOIN core.role r ON r.id = op."roleId"
JOIN core."objectMetadata" om ON om.id = op."objectMetadataId"
WHERE (op."roleId", op."objectMetadataId") IN
      (SELECT "roleId", "objectMetadataId" FROM core."rowLevelPermissionPredicate" WHERE "deletedAt" IS NULL)
ORDER BY 1, 2;

-- 8. API keys and agents on roles with predicates. On v2.58 their reads are filtered or denied.
SELECT r.label AS role, count(*) FILTER (WHERE rt."apiKeyId" IS NOT NULL) AS api_keys,
       count(*) FILTER (WHERE rt."agentId" IS NOT NULL) AS agents
FROM core."roleTarget" rt JOIN core.role r ON r.id = rt."roleId"
WHERE rt."roleId" IN (SELECT "roleId" FROM core."rowLevelPermissionPredicate" WHERE "deletedAt" IS NULL)
  AND (rt."apiKeyId" IS NOT NULL OR rt."agentId" IS NOT NULL)
GROUP BY 1;

-- 9. Roles that can read the reconciliation objects today. After W7, only Admin can.
SELECT r.label AS role, om."nameSingular" AS object
FROM core.role r
JOIN core."objectMetadata" om ON om."workspaceId" = r."workspaceId"
 AND om."nameSingular" IN ('reconciliation', 'carrierConfig', 'reviewItem', 'reconciliationDecisionRule')
LEFT JOIN core."objectPermission" op ON op."roleId" = r.id AND op."objectMetadataId" = om.id
WHERE COALESCE(op."canReadObjectRecords", r."canReadAllObjectRecords")
ORDER BY 1, 2;

-- 10. Roles that can export or import (PHI egress). Expect Admin plus named ops roles only.
SELECT r.label AS role, r."canAccessAllTools",
       array_agg(DISTINCT COALESCE(pf.key, rpf.flag))
         FILTER (WHERE COALESCE(pf.key, rpf.flag) IN ('EXPORT_CSV', 'IMPORT_CSV')) AS egress_flags
FROM core.role r
LEFT JOIN core."rolePermissionFlag" rpf ON rpf."roleId" = r.id
LEFT JOIN core."permissionFlag" pf ON pf.id = rpf."permissionFlagId"
GROUP BY r.id, r.label, r."canAccessAllTools"
HAVING r."canAccessAllTools" OR bool_or(COALESCE(pf.key, rpf.flag) IN ('EXPORT_CSV', 'IMPORT_CSV'))
ORDER BY 1;

-- 11. Apps. Expect compliance-qa 1.1.3 only: uninstall call-recording and payment-reconciliation v1 (P0 step 3);
--     Brokerage and the upstream-deleted apps must be absent.
SELECT a."universalIdentifier", a.name, a.version, a."applicationRegistrationId",
       reg."workspaceId" AS registration_owner_workspace_id
FROM core.application a
LEFT JOIN core."applicationRegistration" reg ON reg.id = a."applicationRegistrationId" AND reg."deletedAt" IS NULL
WHERE a."deletedAt" IS NULL AND a."universalIdentifier" IN (
  'e8b3a1c5-6d47-4f29-9e8a-3c5b7d1f4e06',  -- compliance-qa
  'ddc5e4cf-d4d7-4fa6-ae1d-d86e878661c9',  -- brokerage
  '4daa5147-7e70-4e43-b091-c27e1e8a32e3',  -- call-recording
  'd11726da-5de9-4482-a2b0-68dc18d25181',  -- payment-reconciliation v1
  '94f7db30-59e5-4b09-a5fe-64cd3d4a65b0',  -- self-hosting
  '9426c4a3-7da4-4f61-bdb7-01e1276478b8',  -- twenty-for-twenty
  'e662fc1f-02c1-41ff-b8ba-c95a447b3965'); -- twenty-partners

-- 12. Object names that must not exist. Expect 0 rows once call-recording is gone.
SELECT "workspaceId", "nameSingular", "isActive" FROM core."objectMetadata"
WHERE "nameSingular" IN ('lead', 'callRecording', 'callRecordings');

-- 13. Compliance-qa: run the DEEPGRAM_API_KEY and applicationRegistrationId lookups in
--     packages/twenty-apps/internal/compliance-qa/README.md (a) and (b).

-- 14. Config rows (keys only). DB rows beat the env pins in omnia-values.yaml.
--     Expect no AI_PROVIDERS, no provider API keys (Bedrock only), no IS_BILLING_ENABLED, no ENTERPRISE_KEY.
--     AI_MODEL_PREFERENCES / AI_MODELS_DEFAULT_* are removed in P1 step 6b; list the other shadowing
--     rows for P1 step 6c. STORAGE_S3_* stays until the S3 Pod Identity follow-up.
SELECT key, "workspaceId" IS NOT NULL AS workspace_level, "userId" IS NOT NULL AS user_level
FROM core."keyValuePair"
WHERE type = 'CONFIG_VARIABLE'
  AND (key IN ('AI_PROVIDERS', 'AI_MODEL_PREFERENCES', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY',
               'XAI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'TYPESAFE_AI_API_KEY', 'TELEMETRY_ENABLED',
               'ACCESS_TOKEN_EXPIRES_IN', 'GOOGLE_SERVICE_ACCOUNT_KEY_JSON', 'IS_BILLING_ENABLED', 'ENTERPRISE_KEY',
               'ADDRESS_AUTOCOMPLETE_DRIVER', 'IS_MULTIWORKSPACE_ENABLED')
       OR key LIKE 'STORAGE\_%' OR key LIKE 'AI\_MODELS\_DEFAULT\_%' OR key LIKE '%RATE\_LIMITING%')
ORDER BY key;

-- 15. One-to-many view filters (W5 migrates them; IS/IS_NOT rows without a sub-field are deleted).
SELECT count(*) AS one_to_many_view_filters,
       count(*) FILTER (WHERE vf."subFieldName" IS NULL AND vf.operand::text IN ('IS', 'IS_NOT')) AS deleted_by_w5
FROM core."viewFilter" vf
JOIN core."fieldMetadata" f ON f.id = vf."fieldMetadataId"
WHERE vf."deletedAt" IS NULL AND f.type = 'RELATION' AND f.settings->>'relationType' = 'ONE_TO_MANY';

-- 16. Soft "Required" rules. If Task or Note carries one, file a follow-up: their quick create from record tabs
--     skips the creation form.
SELECT o."nameSingular", f.name, f."requiredCondition"->>'type' AS condition
FROM core."fieldMetadata" f JOIN core."objectMetadata" o ON o.id = f."objectMetadataId"
WHERE f."requiredCondition" IS NOT NULL ORDER BY 1, 2;

-- 17. Person avatars. 2-22 copies avatarUrl into avatarFile and fetches external URLs (server egress).
SELECT o."workspaceId", f.name FROM core."fieldMetadata" f
JOIN core."objectMetadata" o ON o.id = f."objectMetadataId"
WHERE o."nameSingular" = 'person' AND f.name IN ('avatarFile', 'avatarUrl');
SELECT count(*) FILTER (WHERE "avatarUrl" <> '') AS with_avatar_url,
       count(*) FILTER (WHERE "avatarUrl" LIKE '%/file/core-picture/%') AS internal_links
FROM "<databaseSchema>".person;

-- 18. Ingestion pipelines. Expect every push pipeline to have a secret, sent as the x-webhook-secret header
--     (P0 step 6), and every pull pipeline to use no env var or CONVOSO_API_TOKEN against api.convoso.com;
--     any other pair stops working after the cutover.
SELECT id, name, mode, "isEnabled", COALESCE("webhookSecret", '') <> '' AS has_webhook_secret,
       "sourceAuthConfig"->>'envVar' AS auth_env_var, substring("sourceUrl" FROM '^https?://([^/:]+)') AS source_host
FROM core."ingestionPipeline" WHERE "deletedAt" IS NULL ORDER BY name;

-- 19. Webhooks. Expect no operation on reviewItem, reconciliation, carrierConfig or reconciliationDecisionRule:
--     their bookkeeping writes no longer emit events. Check that no active workflow triggers on them either.
SELECT id, "targetUrl", operations FROM core.webhook WHERE "deletedAt" IS NULL;

-- 20. API keys, for the signing-key decision (P0 step 8).
SELECT id, name, "expiresAt", "createdAt" FROM core."apiKey" WHERE "revokedAt" IS NULL ORDER BY "createdAt";

-- 21. Signing keys (no key material).
SELECT id, "isCurrent", "revokedAt" IS NOT NULL AS revoked, "createdAt" FROM core."signingKey" ORDER BY "createdAt";

-- 22. Feature flags that are on. W9 fails the upgrade if IS_ACCESS_GROUPS_ENABLED, IS_RECORD_LEVEL_SHARING_ENABLED,
--     IS_PRIVATE_RECORDS_ENABLED or IS_RELATED_RECORD_PATHS_ENABLED is on.
SELECT "workspaceId", key FROM core."featureFlag" WHERE value ORDER BY key;

-- 23. Registration variables the 2.31 CHECK rejects. Expect none once the orphaned
--     payment-reconciliation v1 registration is gone (P0 step 3).
SELECT v.id, r.name, v.key, (SELECT count(*) FROM core.application a WHERE a."applicationRegistrationId" = r.id) AS installs
FROM core."applicationRegistrationVariable" v JOIN core."applicationRegistration" r ON r.id = v."applicationRegistrationId"
WHERE v."encryptedValue" <> '' AND v."encryptedValue" NOT LIKE 'enc:v2:%';

-- 24. Unfinished workflow runs, for P0 step 2 and P1 step 4. Snapshot 2026-11-20: Lead Contacted ENQUEUED 6068 and
--     RUNNING 8, Lead Sold ENQUEUED 183 and RUNNING 6, Policy Deleted ENQUEUED 1, Compliance Call Pipeline RUNNING 5,
--     Post Policy Sale SMS Campaigns (deactivated) RUNNING 409.
SELECT w.id, w.name, v.status AS version_status, r.status, count(*), min(r."createdAt"), max(r."updatedAt")
FROM "<databaseSchema>"."workflowRun" r
JOIN "<databaseSchema>".workflow w ON w.id = r."workflowId"
LEFT JOIN "<databaseSchema>"."workflowVersion" v ON v.id = r."workflowVersionId"
WHERE r."deletedAt" IS NULL AND r.status NOT IN ('COMPLETED', 'FAILED', 'STOPPED')
GROUP BY 1, 2, 3, 4 ORDER BY 2, 4;
```

**Check 2.** Every one of the 206 legacy TypeORM migrations in the repo must be applied on prod (`omnia:run-legacy-typeorm-migrations` in P1 is then a no-op). The last command must print nothing:

```bash
kubectl -n twentycrm exec deploy/my-twenty-twenty-server -- sh -c \
  'PGOPTIONS="-c default_transaction_read_only=on" psql "$PG_DATABASE_URL" -XAt -c "SELECT name FROM core._typeorm_migrations"' \
  | sort -u > ~/legacy-applied.txt
cd packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common
for f in *.ts; do
  n=$(sed -n "s/^  name = '\(.*\)';$/\1/p" "$f" | head -1)
  [ -n "$n" ] || n=$(sed -n 's/^export class \([A-Za-z0-9_]*\).*/\1/p' "$f" | head -1)
  echo "$n"
done | sort -u > ~/legacy-expected.txt
comm -23 ~/legacy-expected.txt ~/legacy-applied.txt
```

## Post-upgrade checks

Run them on the rehearsal copy and in P1 step 5. They are read-only. W9 already enforces most of these; the queries are for eyes-on review.

```sql
-- Rule grants. Expect one row per role and object. Member and Agent x policy: object read on and update off;
-- rule create and update on, read off. Upstream's backfill 1794337540466 must not have added a second rule.
SELECT r.label AS role, om."nameSingular" AS object,
       op."canReadObjectRecords" AS object_read, op."canUpdateObjectRecords" AS object_update,
       rule."canReadRecords", rule."canCreateRecords", rule."canUpdateRecords",
       rule."canSoftDeleteRecords", rule."canDestroyRecords"
FROM core."rowLevelPermissionRule" rule
JOIN core.role r ON r.id = rule."roleId"
JOIN core."objectMetadata" om ON om.id = rule."objectMetadataId"
LEFT JOIN core."objectPermission" op ON op."roleId" = rule."roleId" AND op."objectMetadataId" = rule."objectMetadataId"
ORDER BY 1, 2;

-- Webhook roles. Expect a role on every webhook: 2.55 gives existing webhooks Admin, and a webhook
-- without a role gets no events.
SELECT w.id, w."targetUrl", r.label AS role
FROM core.webhook w
LEFT JOIN core."roleTarget" rt ON rt."webhookId" = w.id
LEFT JOIN core.role r ON r.id = rt."roleId"
WHERE w."deletedAt" IS NULL;

-- Command menu. Expect every active export, import and AI item to be gated, and no legacy split
-- delete/restore/destroy row (W4 removed them).
SELECT "engineComponentKey", "isActive", "conditionalAvailabilityExpression" LIKE '%permissionFlags.%' AS is_gated
FROM core."commandMenuItem"
WHERE "engineComponentKey" IN ('EXPORT_RECORDS', 'EXPORT_VIEW', 'EXPORT_FROM_RECORD_INDEX', 'EXPORT_FROM_RECORD_SHOW',
  'EXPORT_MULTIPLE_RECORDS', 'IMPORT_RECORDS', 'ASK_AI', 'VIEW_PREVIOUS_AI_CHATS', 'NEW_AI_CHAT',
  'DELETE_SINGLE_RECORD', 'DELETE_MULTIPLE_RECORDS', 'RESTORE_SINGLE_RECORD', 'RESTORE_MULTIPLE_RECORDS',
  'DESTROY_SINGLE_RECORD', 'DESTROY_MULTIPLE_RECORDS')
ORDER BY 1;
```

## Smoke checks

As an agent (Member, no LAYOUTS):

1. Sees every policy and edits their own. Editing another agent's policy is denied with the RLS message. No edit window is configured, so an old policy of their own still saves.
2. A new policy gets the Agent filled in, the name "Carrier - Product", and LTV and submittedDate stamped. Reassigning the agent is denied.
3. Sees every lead, as on v2.6, but only their own calls. Search shows no other agent's calls and no out-of-audience dashboards, and a pasted policy number or the last 7 digits of a phone finds the record.
4. The sidebar lists exactly the role's objects, the landing page is Leads, and Opened repeats no listed object.
5. Dashboards are limited to the audience, and a new dashboard is tagged with the role.
6. The Policy page and the timeline hide restricted fields. The reconciliation objects and their attachments are out of reach.
7. Export and import are hidden (no EXPORT_CSV or IMPORT_CSV flag, as on v2.6). As the Investor, export is RLS-filtered and includes the relation sub-field columns.

As an admin:

8. Sees everything. Do not save a role on prod to test it: opening the Policy or Dashboard object page marks the role dirty, and Save rewrites its grants and rules (the rehearsal covers role saves). A role created in Settings stays locked out of the reconciliation objects.
9. The Create button is visible, also in the side-panel index, and Delete is pinned. Cmd+K hides Import, Export and AI from roles without those flags. The timeline shows struck-through before values. Enterprise-gated settings (role RLS rules, Security) open without an Enterprise lock.

Auth:

10. The forced re-login works. CRM sign-out clears the session, the sibling cookie and the IndexedDB metadata.
11. Dashboard SSO round trip (`postSignInRedirect`). The `tokenPair` cookie is httpOnly, on `.omniaagent.com` and access-only, and its JWT `exp` is at most 30 minutes after issue.
12. Dashboard Sign out lands on the CRM sign-in form (`/welcome` with no query), does not bounce back signed in, and leaves no `tokenPair` cookie.

Infra:

13. AI chat answers through Bedrock on the `twenty-bedrock` service account.
14. Webhooks reach omniaagent.com.
15. `curl -s -o /dev/null -w '%{http_code}' -H 'Sec-Fetch-Dest: script' https://crm.omniaagent.com/assets/missing.js` prints 404. `index.html` is served `no-store`, and hashed assets are `immutable`.
16. The W5 manual-fix list is empty, or every listed view filter, page layout widget and workflow version id is resolved.

## Contingencies

- **I1 fails on orphan `rolePermissionFlag` rows.** Fix the rows, then rerun `upgrade` after:
  ```sql
  DELETE FROM core."upgradeMigration"
  WHERE name LIKE '%RolePermissionFlagCutover%' AND status = 'failed' AND "workspaceId" IS NOT NULL;
  ```
  The workspace barrier refuses a plain rerun of any failed instance step that directly follows a workspace step: clear that step's failed rows the same way, by its name. Never `run-instance-commands --force`.
- **W1 aborts.** It aborts before any write and names the ids: mixed scopes on a role and object, parent cycles, partial links, cross-app trees. The default for mixed scopes is to flatten them by hand with Matthew. Only with his sign-off, run `yarn command:prod upgrade:2-58:omnia-translate-scoped-row-level-permissions -w <workspaceId> --merge-mixed-scopes-fail-closed --dry-run`, then the same without `--dry-run`, then rerun `upgrade`.
- **W9 fails.** Stop: pods stay at 0 and RLS stays fail-closed. Each violation names its check and ids. Fix them, then rerun `upgrade`; `yarn command:prod workspace:omnia-verify-permissions` re-checks on its own. A role with predicates but no access gets an all-false rule, and fails W9 until those predicates are removed by hand.
- **The rollout fails after the cutover.** Fix forward: new commit, new image, `./scripts/deploy-local.sh`. Going back to a pre-2.58 revision is only possible together with the RDS snapshot restore, and loses every write since the window.
- **First install** (new cluster, DR, staging): run the P1 step 3 cutover pod and step 5 upgrade, then `helm install` by hand. CI never installs, and the migration job runs on pre-upgrade only.

## Dev databases

- Dev databases that ran the June merge branch carry two Omnia 2.18 cursor rows whose commands moved to 2.58 (W2 and W3). `upgrade` refuses them with "Step … not found in upgrade sequence". Dev-only fix, after which W2 and W3 re-run idempotently:
  ```sql
  DELETE FROM core."upgradeMigration"
  WHERE name IN ('2.18.0_BackfillCustomObjectSearchFieldsCommand_1799200002000',
                 '2.18.0_SetRecordingFieldDisplayAsAudioCommand_1810000006000');
  ```
- The same databases skipped upstream's two 2.9 slow commands and 38 upstream steps between 1.22 and 2.18, so `upgrade` still stops later. 2.31's `CHK_applicationVariable_value_encrypted` fails, and the local run stopped at 2.46. Do not repair them step by step: replicate a fresh prod copy. They are never a rehearsal target.
- Prod's 2.7 cursor has none of these gaps.
