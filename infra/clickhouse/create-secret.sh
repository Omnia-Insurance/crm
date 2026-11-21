#!/usr/bin/env bash
# Creates twentycrm/twenty-clickhouse-credentials with three fresh random passwords.
# Prints key names and value lengths only. Refuses to overwrite an existing Secret (rotation is in README.md).
# Passwords are 64 hex characters, so they need no percent-encoding inside CLICKHOUSE_URL.
set -euo pipefail

EXPECTED_CONTEXT="arn:aws:eks:us-east-1:189365142140:cluster/twenty-crm"
NAMESPACE="twentycrm"
SECRET="twenty-clickhouse-credentials"
CLICKHOUSE_HOST="clickhouse.twentycrm.svc.cluster.local"
CLICKHOUSE_PORT="8123"
CLICKHOUSE_DATABASE="twenty"

current_context="$(kubectl config current-context)"
if [[ "${current_context}" != "${EXPECTED_CONTEXT}" ]]; then
  echo "kubectl context is ${current_context}, expected ${EXPECTED_CONTEXT}" >&2
  exit 1
fi

if kubectl -n "${NAMESPACE}" get secret "${SECRET}" >/dev/null 2>&1; then
  echo "Secret ${NAMESPACE}/${SECRET} already exists; not overwriting it." >&2
  exit 1
fi

umask 077
work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

for user in app migrator ops; do
  openssl rand -hex 32 | tr -d '\n' >"${work_dir}/${user}-password"
  shasum -a 256 <"${work_dir}/${user}-password" | cut -d' ' -f1 | tr -d '\n' >"${work_dir}/${user}-password-sha256"
done

# printf is a shell builtin, so the passwords never appear in a process argument list.
# request_timeout bounds every server and worker call, so a hung ClickHouse fails fast instead of
# holding sockets. The migrator URL stays bare: run-migrations.ts splits the database off the last "/".
printf 'http://twenty_app:%s@%s:%s/%s?request_timeout=10000' "$(cat "${work_dir}/app-password")" \
  "${CLICKHOUSE_HOST}" "${CLICKHOUSE_PORT}" "${CLICKHOUSE_DATABASE}" >"${work_dir}/app-url"
printf 'http://twenty_migrator:%s@%s:%s/%s' "$(cat "${work_dir}/migrator-password")" \
  "${CLICKHOUSE_HOST}" "${CLICKHOUSE_PORT}" "${CLICKHOUSE_DATABASE}" >"${work_dir}/migrator-url"

kubectl -n "${NAMESPACE}" create secret generic "${SECRET}" \
  --from-file=app-url="${work_dir}/app-url" \
  --from-file=app-password-sha256="${work_dir}/app-password-sha256" \
  --from-file=migrator-url="${work_dir}/migrator-url" \
  --from-file=migrator-password-sha256="${work_dir}/migrator-password-sha256" \
  --from-file=ops-password="${work_dir}/ops-password" \
  --from-file=ops-password-sha256="${work_dir}/ops-password-sha256" \
  >/dev/null
kubectl -n "${NAMESPACE}" label secret "${SECRET}" \
  app.kubernetes.io/name=clickhouse app.kubernetes.io/part-of=twenty >/dev/null

echo "Created ${NAMESPACE}/${SECRET}. Keys and decoded lengths:"
kubectl -n "${NAMESPACE}" get secret "${SECRET}" -o json |
  jq -r '.data | to_entries[] | "  \(.key): \(.value | @base64d | length)"'
