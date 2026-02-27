#!/usr/bin/env bash
set -euo pipefail

# Replicate production DB to staging with anonymization.
# Works with external RDS by spinning up a temporary postgres pod.
#
# Required env vars:
#   PROD_NAMESPACE    - k8s namespace for production (e.g. twentycrm)
#   STAGING_NAMESPACE - k8s namespace for staging (e.g. twentycrm-staging)
#
# Optional env vars (with defaults):
#   RDS_HOST          - RDS hostname (default: from Helm values)
#   RDS_PORT          - RDS port (default: 5432)
#   RDS_MASTER_USER   - RDS master username (default: postgres)
#   RDS_MASTER_SECRET - k8s secret with master password (default: twenty-rds-master-credentials)
#   RDS_MASTER_PASS_KEY - key in the master secret (default: password)

PROD_NS="${PROD_NAMESPACE:?PROD_NAMESPACE must be set}"
STAGING_NS="${STAGING_NAMESPACE:?STAGING_NAMESPACE must be set}"
PROD_DB="twenty"
STAGING_DB="twenty_staging"

RDS_HOST="${RDS_HOST:-twenty-crm-db.cluster-cgx4wwy00vhj.us-east-1.rds.amazonaws.com}"
RDS_PORT="${RDS_PORT:-5432}"
MASTER_USER="${RDS_MASTER_USER:-postgres}"
MASTER_SECRET="${RDS_MASTER_SECRET:-twenty-rds-master-credentials}"
MASTER_PASS_KEY="${RDS_MASTER_PASS_KEY:-password}"

POD_NAME="db-replicator-$(date +%s)"
DUMP_PATH="/tmp/prod-dump.sql"

cleanup() {
  echo "==> Cleaning up temporary pod..."
  kubectl delete pod "$POD_NAME" -n "$PROD_NS" --ignore-not-found --wait=false
}
trap cleanup EXIT

echo "==> Reading RDS master password from secret '$MASTER_SECRET' in namespace '$PROD_NS'..."
MASTER_PASS=$(kubectl get secret "$MASTER_SECRET" -n "$PROD_NS" -o jsonpath="{.data.${MASTER_PASS_KEY}}" | base64 -d)

if [ -z "$MASTER_PASS" ]; then
  echo "ERROR: Could not read master password from secret '$MASTER_SECRET'."
  echo "Create it with: kubectl create secret generic $MASTER_SECRET -n $PROD_NS --from-literal=password=YOUR_RDS_MASTER_PASSWORD"
  exit 1
fi

echo "  RDS host: $RDS_HOST"
echo "  Master user: $MASTER_USER"
echo "  Prod DB: $PROD_DB"
echo "  Staging DB: $STAGING_DB"

echo "==> Starting temporary postgres pod '$POD_NAME'..."
kubectl run "$POD_NAME" -n "$PROD_NS" \
  --image=postgres:16-alpine \
  --restart=Never \
  --env="PGHOST=$RDS_HOST" \
  --env="PGPORT=$RDS_PORT" \
  --env="PGUSER=$MASTER_USER" \
  --env="PGPASSWORD=$MASTER_PASS" \
  --command -- sleep 3600

echo "  Waiting for pod to be ready..."
kubectl wait --for=condition=Ready pod/"$POD_NAME" -n "$PROD_NS" --timeout=60s

echo "==> Verifying RDS connectivity..."
kubectl exec -n "$PROD_NS" "$POD_NAME" -- \
  psql -d "$PROD_DB" -c "SELECT 1;" > /dev/null
echo "  Connected successfully."

echo "==> Dumping production database (excluding file/attachment data)..."
kubectl exec -n "$PROD_NS" "$POD_NAME" -- \
  pg_dump -d "$PROD_DB" \
    --no-owner --no-acl \
    --exclude-table-data='*.file' \
    --exclude-table-data='*.attachment' \
    -f "$DUMP_PATH"

DUMP_SIZE=$(kubectl exec -n "$PROD_NS" "$POD_NAME" -- du -h "$DUMP_PATH" | cut -f1)
echo "  Dump size: $DUMP_SIZE"

echo "==> Terminating active connections to staging database..."
kubectl exec -n "$PROD_NS" "$POD_NAME" -- \
  psql -d postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '$STAGING_DB' AND pid <> pg_backend_pid();
  " || true

echo "==> Dropping and recreating staging database..."
kubectl exec -n "$PROD_NS" "$POD_NAME" -- \
  psql -d postgres -c "DROP DATABASE IF EXISTS $STAGING_DB;"

kubectl exec -n "$PROD_NS" "$POD_NAME" -- \
  psql -d postgres -c "CREATE DATABASE $STAGING_DB;"

echo "==> Restoring dump into staging (triggers disabled to avoid FK ordering issues)..."
kubectl exec -n "$PROD_NS" "$POD_NAME" -- \
  sh -c "{ echo \"SET session_replication_role = 'replica';\"; cat $DUMP_PATH; echo \"SET session_replication_role = 'origin';\"; } | psql -d $STAGING_DB"

echo "==> Anonymizing staging data..."
kubectl exec -n "$PROD_NS" "$POD_NAME" -- \
  psql -d "$STAGING_DB" -c "
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Null out password hashes (force Google SSO on staging)
    UPDATE core.\"user\" SET \"passwordHash\" = NULL;

    -- Keep real emails so Google OAuth works on staging
    -- (same team, private environment)

    -- Delete refresh tokens (stored in appToken table with type)
    DELETE FROM core.\"appToken\" WHERE type = 'REFRESH_TOKEN';

    -- Regenerate remaining app tokens
    UPDATE core.\"appToken\"
    SET value = encode(gen_random_bytes(32), 'hex'),
        \"expiresAt\" = NOW() + INTERVAL '30 days';

    -- Rewrite config URLs from prod domain to staging domain
    UPDATE core.\"keyValuePair\"
    SET value = REPLACE(value::text, 'crm.omniaagent.com', 'staging-crm.omniaagent.com')::jsonb
    WHERE type = 'CONFIG_VARIABLE'
      AND value::text LIKE '%crm.omniaagent.com%';
  "

echo "==> Granting permissions to twenty_app_user..."
kubectl exec -n "$PROD_NS" "$POD_NAME" -- \
  psql -d "$STAGING_DB" -c "
    DO \$\$
    DECLARE
      schema_name TEXT;
    BEGIN
      FOR schema_name IN
        SELECT nspname FROM pg_namespace
        WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      LOOP
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO twenty_app_user', schema_name);
        EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO twenty_app_user', schema_name);
        EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I TO twenty_app_user', schema_name);
      END LOOP;
    END
    \$\$;
  "

echo "==> DB replication complete. Staging database '$STAGING_DB' is ready."
