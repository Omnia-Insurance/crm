#!/usr/bin/env bash
set -euo pipefail

# Replicate production DB to staging with anonymization.
# Expects PROD_NAMESPACE and STAGING_NAMESPACE env vars.

PROD_NS="${PROD_NAMESPACE:?PROD_NAMESPACE must be set}"
STAGING_NS="${STAGING_NAMESPACE:?STAGING_NAMESPACE must be set}"
DB_NAME="twenty"
DUMP_FILE="/tmp/prod-dump.sql"
LABEL_SELECTOR="app.kubernetes.io/name=twenty,app.kubernetes.io/component=db"

echo "==> Finding database pods..."
PROD_POD=$(kubectl get pods -n "$PROD_NS" -l "$LABEL_SELECTOR" -o jsonpath='{.items[0].metadata.name}')
STAGING_POD=$(kubectl get pods -n "$STAGING_NS" -l "$LABEL_SELECTOR" -o jsonpath='{.items[0].metadata.name}')

if [ -z "$PROD_POD" ] || [ -z "$STAGING_POD" ]; then
  echo "ERROR: Could not find database pods."
  echo "  Prod pod: ${PROD_POD:-not found}"
  echo "  Staging pod: ${STAGING_POD:-not found}"
  exit 1
fi

echo "  Prod DB pod:    $PROD_POD (ns: $PROD_NS)"
echo "  Staging DB pod: $STAGING_POD (ns: $STAGING_NS)"

echo "==> Dumping production database (excluding file/attachment data)..."
kubectl exec -n "$PROD_NS" "$PROD_POD" -- \
  pg_dump -U postgres -d "$DB_NAME" \
    --no-owner --no-acl \
    --exclude-table-data='*.file' \
    --exclude-table-data='*.attachment' \
  > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "  Dump size: $DUMP_SIZE"

echo "==> Dropping and recreating staging database..."
kubectl exec -n "$STAGING_NS" "$STAGING_POD" -- \
  psql -U postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
  " || true

kubectl exec -n "$STAGING_NS" "$STAGING_POD" -- \
  psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"

kubectl exec -n "$STAGING_NS" "$STAGING_POD" -- \
  psql -U postgres -c "CREATE DATABASE $DB_NAME;"

echo "==> Restoring dump into staging (triggers disabled to avoid FK ordering issues)..."
{ echo "SET session_replication_role = 'replica';"; cat "$DUMP_FILE"; echo "SET session_replication_role = 'origin';"; } | \
  kubectl exec -i -n "$STAGING_NS" "$STAGING_POD" -- \
  psql -U postgres -d "$DB_NAME"

echo "==> Anonymizing staging data..."
kubectl exec -n "$STAGING_NS" "$STAGING_POD" -- \
  psql -U postgres -d "$DB_NAME" -c "
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Null out password hashes
    UPDATE core.\"user\" SET \"passwordHash\" = NULL;

    -- Scramble email addresses
    UPDATE core.\"user\"
    SET email = 'staging-user-' || id || '@example.com';

    -- Delete refresh tokens (stored in appToken table with type)
    DELETE FROM core.\"appToken\" WHERE type = 'REFRESH_TOKEN';

    -- Regenerate remaining app tokens
    UPDATE core.\"appToken\"
    SET value = encode(gen_random_bytes(32), 'hex'),
        \"expiresAt\" = NOW() + INTERVAL '30 days';

    -- Rewrite config URLs from prod domain to staging domain
    -- Config is stored in keyValuePair table as jsonb
    UPDATE core.\"keyValuePair\"
    SET value = REPLACE(value::text, 'crm.omniaagent.com', 'staging-crm.omniaagent.com')::jsonb
    WHERE type = 'CONFIG_VARIABLE'
      AND value::text LIKE '%crm.omniaagent.com%';
  "

echo "==> Granting permissions to twenty_app_user..."
kubectl exec -n "$STAGING_NS" "$STAGING_POD" -- \
  psql -U postgres -d "$DB_NAME" -c "
    DO \$\$
    DECLARE
      schema_name TEXT;
    BEGIN
      -- Grant usage on all schemas
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

echo "==> Cleaning up dump file..."
rm -f "$DUMP_FILE"

echo "==> DB replication complete."
