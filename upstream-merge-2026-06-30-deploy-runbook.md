# v2.6 → v2.19 Upstream Merge — Prod Deploy Runbook

Branch: `merge/upstream-2026-06-30`. Target: PR → `main`, which **auto-deploys to EKS** and runs the full version upgrade on server pod boot. There is **no staging environment** (staging nodes were deleted), so the first real run of the 13-version upgrade happens on prod data.

---

## How the prod upgrade actually runs (mechanism)

Two systems — the classic one is frozen:

- **TypeORM migrations = frozen.** `core.datasource.ts` runs `migrationsRun: false` and only loads `legacy-typeorm-migrations-do-not-add/`. No net-new schema work lives here.
- **Upgrade-command pipeline = where all v2.6→v2.19 work is.** Decorator-registered `fast-instance` (transactional DDL), `slow-instance` (non-transactional data pass + DDL), and `workspace` (per-workspace) commands under `upgrade-version-command/<version>/`.

**Deploy flow:** push to `main` → `.github/workflows/deploy-eks.yaml` builds the image (with `APP_VERSION` baked as a Docker build-arg) → `helm upgrade --install --wait --atomic --timeout 10m --values omnia-values.yaml`.

Migrations/upgrades run in **three** places per deploy:
1. **Pre-upgrade Helm hook Job** (`templates/job-migration.yaml`, `activeDeadlineSeconds: 300` = 5 min): `typeorm migration:run` + `run-instance-commands --force` → legacy migrations + **fast-instance only** (no slow, no workspace).
2. **Server init-container**: `typeorm migration:run` again (idempotent).
3. **Server entrypoint, on every pod boot** (`entrypoint.sh`): `cache:flush` → **`upgrade`** (full sequence: fast + slow instance + **per-workspace**) → `cache:flush` → `cron:register:all` → `node dist/main`. **The heavy work runs here, before the pod serves traffic**, bounded by the startup probe (`failureThreshold 60 × 10s` ≈ 600s) and the helm 10-min timeout.

**Command selection (the key fact):** NOT gated by `APP_VERSION` and NOT by the old `workspace.version` column (which a 1.23.0 command actually *drops*). The `upgrade` command builds one linear sequence of all 143 steps (1.21.0 → 2.19.0) and **resumes forward-only from a high-water mark in `core.upgradeMigration`** (last-attempted command by timestamp). On the first v2.19 deploy, **every not-yet-recorded 2.7→2.19 command runs automatically.**

`APP_VERSION` is **audit-only** — stamps `executedByVersion`, feeds version reporting, and drives the client "please refresh" guard (fires only when frontend semver < backend semver). It does **not** cap which commands run.

---

## Pre-merge checklist (clear before merging to `main`)

- [ ] `bash scripts/check-customizations.sh` → "All customizations intact!"
- [x] Bump `APP_VERSION` 2.6.1 → **2.19.0** in `deploy-eks.yaml:82` + `check-customizations.sh` (done this session). Leaving it stale means wrong version reporting and stale browser tabs won't get the refresh prompt (feeds the known post-merge stale-localStorage icon breakage).
- [ ] **twenty-front typecheck green.** ~98 pre-existing `never`-type errors in RLS / record-level-permission files (`recordLevelPermissionPredicateConversion.ts`, `useSaveDraftRoleToDB.ts`, `useRecordLevelPermissionFilterInitialization.ts`, etc.). NOTE: the generated metadata types are already complete/correct (scope enum + predicate fields present) — this is **not** a codegen regen; it's a hand-written type-alignment fix. Runtime is unaffected (the scoped-RLS settings UI renders and works). Needs a focused fix session that can iterate `nx typecheck twenty-front`.
- [ ] twenty-server typecheck green (was green this session).
- [ ] `nx lint:diff-with-main twenty-front` clean.
- [ ] Review the **high-risk cross-app SSO cookie** change (`useAuth.ts` / `tokenPairState.ts`) and run a real `*.omniaagent.com` cross-subdomain test. Core auth must still read the token only from localStorage.
- [ ] Search command ordering: `recompute-search-vectors` (ts 1799200001000) sorts *before* the Omnia `backfill-custom-object-search-fields` (ts 1799200002000). Confirm workspace-custom objects fully index on a fresh deploy, or plan the post-deploy reindex (below).

---

## Deploy day

1. **Snapshot RDS** immediately before (no staging safety net; rollback does not revert schema).
2. **Low-traffic window.** Expect a long first upgrade (13-version jump).
3. **(Recommended) Dry run for timing:** restore the snapshot to a scratch DB, point a server at it, run `command:prod upgrade --dry-run`, and confirm the real run fits inside the 5-min Job deadline and 10-min pod/helm budgets. If not, the deploy will `--atomic` roll back.
4. Merge to `main` → watch the GitHub Action + `kubectl rollout status deploy/my-twenty-server -n <ns>`.
5. **Watch the actual upgrade logs — a green rollout does NOT mean a clean upgrade.** `entrypoint.sh` swallows `upgrade` failures ("continuing startup") and the pod still passes `/healthz`:
   `kubectl logs deploy/my-twenty-server -c server | grep -iE "upgrade|migration|error"`

---

## Post-deploy verification

- [ ] Server + worker pods Ready, no crash loops; upgrade logs show completion with no swallowed errors.
- [ ] **Search works** — spot-check a global search (e.g. a lead name). If empty, run in a server pod: `command:prod upgrade:2-16:backfill-search-field-metadata` then `command:prod upgrade:2-18:recompute-search-vectors` (exactly what fixed it locally). (Brokerage app-owned objects are a local-only artifact; prod objects are workspace-custom.)
- [ ] **BullMQ schedulers registered** — `cron:register:all` runs only via the server entrypoint and failure is a non-fatal warning (this matches the prior scheduler-wipe incident). Verify cron jobs exist; fallback: `scripts/restore-bullmq-schedulers.sh`.
- [ ] **Enterprise features** unlocked (Settings → AI → Usage no longer shows the "Enterprise feature" lock; Security/SSO, Admin AI).
- [ ] **Auth** — Google/Microsoft OAuth sign-in works; if the SSO cookie change shipped, confirm the `.omniaagent.com` token cookie is set on login and cleared on logout, and core auth still works.
- [ ] Clients get the "new version, please refresh" prompt (APP_VERSION now 2.19.0); still watch for stale-localStorage icon breakage — affected users clear localStorage.

---

## Rollback

- `helm rollback my-twenty` reverts the **image only**, NOT the schema (migrations are forward-only). A rolled-back old server running against an already-upgraded 2.19 schema is a real hazard.
- Prefer **fix-forward**, or restore the pre-deploy RDS snapshot if the upgrade corrupts data.

## Known gotchas (from the code audit)

- **2 server replicas** both run `upgrade` on boot concurrently; no distributed/advisory lock found — safety relies on the `upgradeMigration` tracking-table idempotency.
- Pre-upgrade Job uses `--force` (bypasses the version-safety check). **Slow-instance** steps only apply via the entrypoint `upgrade`, never via the Job/init-container.
- The **1.23.0 command drops `core.workspace.version`** — any dashboard/report/tooling reading that column breaks after this step.
- Workspace command segments are hard sync barriers: one workspace failing aborts the whole run before later instance DDL; inconsistent per-workspace cursors make `upgrade` throw. Verify `core.upgradeMigration` cursor consistency before the first 2.19 deploy.
