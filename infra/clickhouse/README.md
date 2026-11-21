# ClickHouse for event logs

Twenty's event logs (Settings > Logs, the Logs console, Record changes) live in one ClickHouse
server inside `twentycrm`. It is managed with `kubectl`, outside the `my-twenty` Helm release, so
CRM deploys never restart it. The chart only passes `CLICKHOUSE_URL` (optional Secret key) to the
server, worker and pre-upgrade job, and that job applies ClickHouse migrations, time-boxed and
warn-only, after the Postgres upgrade.

Record changes store each record's full before and after values, so this store holds PHI:
encrypted volume, no `default` user, ingress only from the Twenty server, worker and migration
pods, and reads only for people whose role has the Security permission (API keys, OAuth clients
and apps are refused).

| File | Purpose |
| --- | --- |
| `storageclass.yaml` | `gp3-encrypted`: encrypted, `Retain`, expandable, tags volumes for the daily AWS Backup plan |
| `create-secret.sh` | Creates `twenty-clickhouse-credentials` with fresh passwords; prints key lengths only; never overwrites |
| `clickhouse.yaml` | ServiceAccount, server and users ConfigMaps, NetworkPolicy, Services, StatefulSet (26.8 LTS, pinned digest) |
| `clickhouse-migrate-job.yaml` | One-off migration Job plus a check of the exact app URL |
| `backup-selection.json` | AWS Backup selection for volumes tagged `backup=twenty-crm-daily` |

## Where people see it

People whose role has the Security permission (Admin today), on desktop: the Logs switch at the
bottom of the Settings drawer, or "Show logs" in the command menu, opens the Logs console. Pick
Record changes, Security or App logs. At phone width: Settings > General > Logs.

## Users

| User | Used by | Grants | Network |
| --- | --- | --- | --- |
| `twenty_app` | server, worker (`app-url`) | `SELECT, INSERT ON twenty.*`; `ALTER DELETE` on the four tables the retention job trims | VPC |
| `twenty_migrator` | migrations (`migrator-url`) | `ALL ON twenty.*`, nothing global | VPC |
| `ops` | `kubectl exec` | system tables, table metadata, and only `event`, `timestamp`, `isCustom` of `objectEvent` | loopback |

`app-url` carries `?request_timeout=10000`, so every Twenty call fails within 10 s instead of
hanging. Query-log settings are locked for all users.

## First install (done 2026-11-21)

```bash
export AWS_PROFILE=twenty-admin
kubectl apply -f infra/clickhouse/storageclass.yaml
bash infra/clickhouse/create-secret.sh
kubectl -n twentycrm apply -f infra/clickhouse/clickhouse.yaml
kubectl -n twentycrm rollout status statefulset/clickhouse --timeout=10m
IMAGE=$(kubectl -n twentycrm get deploy my-twenty-twenty-server -o jsonpath='{.spec.template.spec.containers[0].image}')
sed "s|TWENTY_IMAGE|${IMAGE}|g" infra/clickhouse/clickhouse-migrate-job.yaml | kubectl -n twentycrm apply -f -
aws backup create-backup-selection --backup-plan-id 9651b007-7132-41e1-85d9-f19b7449a81a \
  --backup-selection file://infra/clickhouse/backup-selection.json
```

Then deploy the chart (the `CLICKHOUSE_URL` entry in `omnia-values.yaml`).

## Checks

Query as `ops`; the password travels over stdin:

```bash
chq() {
  kubectl -n twentycrm get secret twenty-clickhouse-credentials -o json | jq -r '.data["ops-password"] | @base64d' |
    kubectl -n twentycrm exec -i clickhouse-0 -c clickhouse -- \
      sh -c 'IFS= read -r PW; exec clickhouse-client --host 127.0.0.1 --user ops --password "$PW" --query "$1"' sh "$1"
}
chq "SELECT event, count() FROM twenty.objectEvent WHERE timestamp > now() - INTERVAL 1 DAY GROUP BY event"
chq "SELECT table, sum(rows), formatReadableSize(sum(bytes_on_disk)) FROM system.parts WHERE database = 'twenty' AND active GROUP BY table"
chq "SELECT formatReadableSize(free_space), formatReadableSize(total_space) FROM system.disks"
chq "SELECT user, count() FROM system.session_log WHERE event_date = today() AND type = 'LoginSuccess' GROUP BY user"
kubectl -n twentycrm exec deploy/my-twenty-twenty-redis -- redis-cli LLEN bull:event-log-queue:wait
```

An empty Settings > Logs page proves nothing: failed reads render as an empty list. Look for
`Error executing select query in ClickHouse` in the server logs.

## Retention

The workspace setting (Settings > General > Security > Audit Logs > Log retention, 90 days) is enforced by
the hourly `EventLogCleanupCronJob` in the worker (`ALTER TABLE ... DELETE`). The tables' own TTL
(3 years) is only a backstop. After an upstream merge, check that ClickHouse migrations did not
change those TTLs: `SELECT name, engine_full FROM system.tables WHERE database = 'twenty'`.

## Operating it

- **Turn event logs off without touching the CRM:** `kubectl -n twentycrm scale statefulset clickhouse --replicas=0`.
  Twenty's calls then fail fast and events are dropped. Scale back to 1 to resume.
- **Remove it from the CRM:** delete the `app-url` key (or the Secret) and restart the server and worker.
- **Grow the disk** past 70% use: raise `storage` on PVC `data-clickhouse-0` (online expansion).
  Inserts stop on their own when less than 15% is free.
- **Change config:** edit `clickhouse.yaml` and apply it. Users and most settings reload without a
  restart. A bad StatefulSet change needs `kubectl -n twentycrm delete pod clickhouse-0` after the fix.
- **Upgrade ClickHouse:** move to the newest patch of the same LTS line, pinned by digest, and run
  the migrations Job against a local copy first.
- **Rotate passwords:** delete the Secret, rerun `create-secret.sh`, then restart ClickHouse,
  the server and the worker.
- **Restore:** AWS Backup keeps daily snapshots for 35 days, copied to us-west-2. Restore a
  snapshot to a volume in us-east-1d, bind it to a new PV, and point PVC `data-clickhouse-0` at it.

## Never

- Set `EVENT_SINKS`: its console sink prints every record snapshot to pod stdout.
- Run `OPTIMIZE ... FINAL` on `objectEvent`: it merges every part at once and can exceed the memory cap.
- Run `dist/database/scripts/truncate-clickhouse.js` with a production URL.
- Give any user a global grant (`url()`, `s3()`, `remote()`, `file()`).
