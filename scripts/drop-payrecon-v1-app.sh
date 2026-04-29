#!/usr/bin/env bash
#
# Drop the v1 "Payment Reconciliation" Twenty app and all its workspace
# residue from a single workspace.
#
# What this removes:
#   - core.application row + cascade: objectMetadata, fieldMetadata,
#     applicationVariable, etc.
#   - workspace_<schema>._payRecon* tables (CASCADE)
#   - workspace_<schema>._payRecon* enum types
#   - target<PayRecon*>Id relation columns on system tables
#     (attachment, favorite, noteTarget, taskTarget, timelineActivity)
#   - object permissions for the dropped objects
#
# What this preserves:
#   - The carrier / carrierProduct objects (used by the v2 app)
#   - The v2 reconciliation / carrierConfig / reviewItem objects
#   - All other workspace data
#
# Usage:
#   PG_DATABASE_URL=postgres://... \
#     bash scripts/drop-payrecon-v1-app.sh <workspaceId>
#
# Run only against LOCAL/dev databases. Production drops require explicit
# coordination — review CUSTOMIZATIONS.md for any references to v1 objects
# before running anywhere shared.

set -euo pipefail

WORKSPACE_ID="${1:-}"

if [ -z "$WORKSPACE_ID" ]; then
  echo "Usage: $0 <workspaceId>" >&2
  exit 1
fi

PG_DATABASE_URL="${PG_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/default}"

psql_run() {
  PGPASSWORD="${PG_DATABASE_URL#*:*:}"
  psql "$PG_DATABASE_URL" -v ON_ERROR_STOP=1 -c "$1"
}

psql_query() {
  psql "$PG_DATABASE_URL" -At -c "$1"
}

echo "→ Workspace: $WORKSPACE_ID"

# 1. Resolve the workspace schema name
SCHEMA=$(psql_query "SELECT \"databaseSchema\" FROM core.workspace WHERE id = '$WORKSPACE_ID';")

if [ -z "$SCHEMA" ]; then
  echo "✗ Workspace $WORKSPACE_ID not found" >&2
  exit 1
fi

echo "→ Schema: $SCHEMA"

# 2. Find the Payment Reconciliation v1 application (by name)
APP_ID=$(psql_query "SELECT id FROM core.application WHERE \"workspaceId\" = '$WORKSPACE_ID' AND name = 'Payment Reconciliation' AND \"deletedAt\" IS NULL;")

if [ -z "$APP_ID" ]; then
  echo "→ No 'Payment Reconciliation' app installed — nothing to drop"
  exit 0
fi

echo "→ Application: $APP_ID"

# 3. Find all object names owned by this application
OBJECT_NAMES=$(psql_query "SELECT \"nameSingular\" FROM core.\"objectMetadata\" WHERE \"workspaceId\" = '$WORKSPACE_ID' AND \"applicationId\" = '$APP_ID';")

if [ -z "$OBJECT_NAMES" ]; then
  echo "→ App owns no objects — deleting app row only"
else
  echo "→ Objects to drop:"
  echo "$OBJECT_NAMES" | sed 's/^/    /'
fi

# 4. Drop workspace tables for each object (CASCADE handles FKs)
echo "→ Dropping workspace tables…"
for obj in $OBJECT_NAMES; do
  table="_${obj}"
  psql_run "DROP TABLE IF EXISTS \"$SCHEMA\".\"$table\" CASCADE;"
done

# 5. Drop residual relation columns on system tables
echo "→ Dropping residual relation columns on system tables…"
RESIDUAL_COLUMNS=$(psql_query "
  SELECT table_name || '|' || column_name
  FROM information_schema.columns
  WHERE table_schema = '$SCHEMA'
    AND column_name ILIKE '%payRecon%'
    AND table_name IN ('attachment', 'favorite', 'noteTarget', 'taskTarget', 'timelineActivity');
")

for entry in $RESIDUAL_COLUMNS; do
  table="${entry%|*}"
  column="${entry#*|}"
  psql_run "ALTER TABLE \"$SCHEMA\".\"$table\" DROP COLUMN IF EXISTS \"$column\";"
done

# 6. Drop residual enum types in the workspace schema
echo "→ Dropping residual enum types…"
ENUM_TYPES=$(psql_query "
  SELECT typname FROM pg_type
  WHERE typtype = 'e'
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '$SCHEMA')
    AND typname ILIKE '_payRecon%';
")

for typ in $ENUM_TYPES; do
  psql_run "DROP TYPE IF EXISTS \"$SCHEMA\".\"$typ\" CASCADE;"
done

# 7. Delete files referencing the application (yarn locks, packaged source).
# core.file.applicationId is a non-cascading FK — must clear before delete.
FILE_COUNT=$(psql_query "SELECT count(*) FROM core.file WHERE \"applicationId\" = '$APP_ID';")

if [ "$FILE_COUNT" != "0" ]; then
  echo "→ Deleting $FILE_COUNT app file(s)…"
  psql_run "DELETE FROM core.file WHERE \"applicationId\" = '$APP_ID';"
fi

# 8. Delete the application row
# objectMetadata cascades on application delete (FK has ON DELETE CASCADE),
# which in turn cascades fieldMetadata + indexMetadata + relationMetadata +
# objectPermission rows.
echo "→ Deleting application row…"
psql_run "DELETE FROM core.application WHERE id = '$APP_ID';"

echo "✓ v1 Payment Reconciliation app dropped from workspace $WORKSPACE_ID"
echo ""
echo "Next steps:"
echo "  - Flush the workspace metadata cache (Redis):"
echo "      redis-cli --scan --pattern 'engine:workspace:*$WORKSPACE_ID*' | xargs redis-cli DEL"
echo "  - Restart the dev server (or hit /metadata cache invalidate) to pick up the schema changes"
