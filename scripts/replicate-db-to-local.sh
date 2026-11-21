#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Replicate production data into the local dev database and rewrite the
# DB-backed URL settings that still need localhost values.
#
# Required env vars:
#   PROD_DATABASE_URL
#     or, with --via-k8s:
#   K8S_PROD_DB_HOST
#   K8S_PROD_DB_NAME
#   K8S_PROD_DB_USER
#   K8S_PROD_DB_PASSWORD
#
# Optional env vars:
#   LOCAL_DATABASE_URL=postgres://postgres:postgres@localhost:5432/default
#   LOCAL_MAINTENANCE_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
#   LOCAL_DATABASE_NAME=default
#   LOCAL_SERVER_URL=http://localhost:3000
#   LOCAL_FRONTEND_URL=http://localhost:3001
#   LOCAL_PUBLIC_DOMAIN_URL=$LOCAL_FRONTEND_URL
#   SOURCE_DOMAIN=crm.omniaagent.com
#   INCLUDE_FILE_DATA=true
#   KEEP_CUSTOM_DOMAINS=false
#   RUN_LOCAL_MIGRATIONS=true             (cache:flush, upgrade, secret-encryption:rotate)
#   PURGE_LOCAL_REDIS_WORKSPACE_CACHE=true (final cache:flush)
#   LOCAL_REDIS_URL=(defaults to REDIS_URL in packages/twenty-server/.env, else redis://localhost:6379)
#   K8S_NAMESPACE=twentycrm
#   K8S_HELPER_POD=db-replication-helper
#   K8S_HELPER_IMAGE=postgres:16-alpine
#   PROD_APP_SECRET=
#   LOCAL_APP_SECRET=(defaults to APP_SECRET or packages/twenty-server/.env)
#   PROD_ENCRYPTION_KEY=(defaults to PROD_APP_SECRET; prod sets no ENCRYPTION_KEY)
#   LOCAL_ENCRYPTION_KEY=(defaults to ENCRYPTION_KEY, packages/twenty-server/.env, then LOCAL_APP_SECRET)
#   K8S_APP_SECRET_SECRET_NAME=tokens
#   K8S_APP_SECRET_SECRET_KEY=accessToken
#
# Server commands (upgrade, secret-encryption:rotate, cache:flush) need a built
# twenty-server dist and run against LOCAL_DATABASE_URL and LOCAL_REDIS_URL.
# The server reloads packages/twenty-server/.env with override, so they stop if
# it sets those (or APP_SECRET and the encryption keys) to other values.
#
# Usage:
#   PROD_DATABASE_URL=... ./scripts/replicate-db-to-local.sh
#   PROD_DATABASE_URL=... ./scripts/replicate-db-to-local.sh --yes
#   K8S_PROD_DB_HOST=... K8S_PROD_DB_NAME=... K8S_PROD_DB_USER=... K8S_PROD_DB_PASSWORD=... \
#     ./scripts/replicate-db-to-local.sh --via-k8s --yes

usage() {
  cat <<'EOF'
Replicate production data into the local dev database.

Required env vars:
  PROD_DATABASE_URL
  or, with --via-k8s:
  K8S_PROD_DB_HOST
  K8S_PROD_DB_NAME
  K8S_PROD_DB_USER
  K8S_PROD_DB_PASSWORD

Optional env vars:
  LOCAL_DATABASE_URL
  LOCAL_MAINTENANCE_DATABASE_URL
  LOCAL_DATABASE_NAME
  LOCAL_SERVER_URL
  LOCAL_FRONTEND_URL
  LOCAL_PUBLIC_DOMAIN_URL
  SOURCE_DOMAIN
  INCLUDE_FILE_DATA=true|false
  KEEP_CUSTOM_DOMAINS=true|false
  RUN_LOCAL_MIGRATIONS=true|false
  PURGE_LOCAL_REDIS_WORKSPACE_CACHE=true|false
  LOCAL_REDIS_URL
  K8S_NAMESPACE
  K8S_HELPER_POD
  K8S_HELPER_IMAGE
  PROD_APP_SECRET
  LOCAL_APP_SECRET
  PROD_ENCRYPTION_KEY
  LOCAL_ENCRYPTION_KEY
  K8S_APP_SECRET_SECRET_NAME
  K8S_APP_SECRET_SECRET_KEY

Flags:
  --yes                  Skip the confirmation prompt.
  --include-files        Include file / attachment table data in the dump.
  --keep-custom-domains  Keep workspace custom/public domain records.
  --via-k8s              Run pg_dump from a temporary helper pod in Kubernetes.
  -h, --help             Show this help text.
EOF
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "ERROR: Required command not found: $command_name" >&2
    exit 1
  fi
}

read_env_value_from_file() {
  local file_path="$1"
  local key="$2"
  local value

  if [[ ! -f "$file_path" ]]; then
    return 0
  fi

  # `|| true`: callers expand this inside defaults, where a missing key would trip errexit.
  value="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$file_path" | tail -n 1 | cut -d'=' -f2- || true)"
  value="${value%$'\r'}"

  # Same unquoting and inline-comment rules as dotenv.
  if [[ "$value" =~ ^[[:space:]]*\"([^\"]*)\" ]] || [[ "$value" =~ ^[[:space:]]*\'([^\']*)\' ]]; then
    value="${BASH_REMATCH[1]}"
  else
    value="${value%%#*}"
    value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  fi

  printf '%s\n' "$value"
}

# core.datasource.ts and raw.datasource.ts reload packages/twenty-server/.env with
# override: true, so a key set there beats the value exported for a server command.
assert_server_env_file_agrees() {
  (
    cd "$REPO_ROOT/packages/twenty-server"
    PINNED_KEYS="$*" node -e '
      const fs = require("fs");
      const { parse } = require("dotenv");

      const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";

      if (!fs.existsSync(envFile)) {
        process.exit(0);
      }

      const fileValues = parse(fs.readFileSync(envFile));
      const conflictingKeys = process.env.PINNED_KEYS.split(" ").filter(
        (key) => key in fileValues && fileValues[key] !== process.env[key],
      );

      if (conflictingKeys.length > 0) {
        console.error(
          `ERROR: packages/twenty-server/${envFile} sets ${conflictingKeys.join(", ")} to other values than this restore uses, and the server would apply them. Align them (or the matching LOCAL_* variables) and re-run.`,
        );
        process.exit(1);
      }
    '
  )
}

run_local_server_command() {
  (
    cd "$REPO_ROOT"
    export PG_DATABASE_URL="$LOCAL_DATABASE_URL"
    export REDIS_URL="$LOCAL_REDIS_URL"
    pinned_keys=(PG_DATABASE_URL REDIS_URL)

    if [[ -n "$LOCAL_APP_SECRET" ]]; then
      export APP_SECRET="$LOCAL_APP_SECRET"
      pinned_keys+=(APP_SECRET)
    fi

    if [[ "$SHOULD_ROTATE_SECRETS" == "true" ]]; then
      # The fallback key decrypts enc:v2 values still encrypted under the prod key.
      export ENCRYPTION_KEY="$LOCAL_ENCRYPTION_KEY"
      export FALLBACK_ENCRYPTION_KEY="$PROD_ENCRYPTION_KEY"
      pinned_keys+=(ENCRYPTION_KEY FALLBACK_ENCRYPTION_KEY)
    fi

    # Explicit exit: errexit is off when a caller tests this function in an `if`.
    assert_server_env_file_agrees "${pinned_keys[@]}" || exit 1

    npx nx run twenty-server:command-no-deps -- "$@"
  )
}

confirm() {
  if [[ ! -t 0 ]]; then
    echo "ERROR: Refusing to run without --yes in a non-interactive shell." >&2
    exit 1
  fi

  echo "About to replace local database '$LOCAL_DATABASE_NAME'."
  echo "  Local DB: $LOCAL_DATABASE_URL"
  echo "  Source DB: $PROD_DATABASE_URL"
  read -r -p "Continue? [y/N] " response

  case "$response" in
    y|Y|yes|YES)
      ;;
    *)
      echo "Aborted."
      exit 1
      ;;
  esac
}

ASSUME_YES=false
FLAG_INCLUDE_FILES=false
FLAG_KEEP_CUSTOM_DOMAINS=false
FLAG_VIA_K8S=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      ASSUME_YES=true
      ;;
    --include-files)
      FLAG_INCLUDE_FILES=true
      ;;
    --keep-custom-domains)
      FLAG_KEEP_CUSTOM_DOMAINS=true
      ;;
    --via-k8s)
      FLAG_VIA_K8S=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_command pg_dump
require_command psql

PROD_DATABASE_URL="${PROD_DATABASE_URL:-}"
LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/default}"
LOCAL_MAINTENANCE_DATABASE_URL="${LOCAL_MAINTENANCE_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
LOCAL_DATABASE_NAME="${LOCAL_DATABASE_NAME:-default}"
LOCAL_SERVER_URL="${LOCAL_SERVER_URL:-http://localhost:3000}"
LOCAL_FRONTEND_URL="${LOCAL_FRONTEND_URL:-http://localhost:3001}"
LOCAL_PUBLIC_DOMAIN_URL="${LOCAL_PUBLIC_DOMAIN_URL:-$LOCAL_FRONTEND_URL}"
SOURCE_DOMAIN="${SOURCE_DOMAIN:-crm.omniaagent.com}"
INCLUDE_FILE_DATA="${INCLUDE_FILE_DATA:-true}"
KEEP_CUSTOM_DOMAINS="${KEEP_CUSTOM_DOMAINS:-false}"
RUN_LOCAL_MIGRATIONS="${RUN_LOCAL_MIGRATIONS:-true}"
PURGE_LOCAL_REDIS_WORKSPACE_CACHE="${PURGE_LOCAL_REDIS_WORKSPACE_CACHE:-true}"
LOCAL_REDIS_URL="${LOCAL_REDIS_URL:-$(read_env_value_from_file "$REPO_ROOT/packages/twenty-server/.env" "REDIS_URL")}"
LOCAL_REDIS_URL="${LOCAL_REDIS_URL:-redis://localhost:6379}"
K8S_NAMESPACE="${K8S_NAMESPACE:-twentycrm}"
K8S_HELPER_POD="${K8S_HELPER_POD:-db-replication-helper}"
K8S_HELPER_IMAGE="${K8S_HELPER_IMAGE:-postgres:16-alpine}"
K8S_PROD_DB_HOST="${K8S_PROD_DB_HOST:-}"
K8S_PROD_DB_NAME="${K8S_PROD_DB_NAME:-}"
K8S_PROD_DB_USER="${K8S_PROD_DB_USER:-}"
K8S_PROD_DB_PASSWORD="${K8S_PROD_DB_PASSWORD:-}"
K8S_APP_SECRET_SECRET_NAME="${K8S_APP_SECRET_SECRET_NAME:-tokens}"
K8S_APP_SECRET_SECRET_KEY="${K8S_APP_SECRET_SECRET_KEY:-accessToken}"
PROD_APP_SECRET="${PROD_APP_SECRET:-}"
LOCAL_APP_SECRET="${LOCAL_APP_SECRET:-${APP_SECRET:-$(read_env_value_from_file "$REPO_ROOT/packages/twenty-server/.env" "APP_SECRET")}}"
LOCAL_ENCRYPTION_KEY="${LOCAL_ENCRYPTION_KEY:-${ENCRYPTION_KEY:-$(read_env_value_from_file "$REPO_ROOT/packages/twenty-server/.env" "ENCRYPTION_KEY")}}"
LOCAL_ENCRYPTION_KEY="${LOCAL_ENCRYPTION_KEY:-$LOCAL_APP_SECRET}"

if [[ "$FLAG_INCLUDE_FILES" == "true" ]]; then
  INCLUDE_FILE_DATA=true
fi

if [[ "$FLAG_KEEP_CUSTOM_DOMAINS" == "true" ]]; then
  KEEP_CUSTOM_DOMAINS=true
fi

if [[ "$FLAG_VIA_K8S" == "true" ]]; then
  require_command kubectl
else
  if [[ -z "$PROD_DATABASE_URL" ]]; then
    echo "ERROR: PROD_DATABASE_URL must be set unless --via-k8s is used." >&2
    exit 1
  fi
fi

if [[ "$FLAG_VIA_K8S" == "true" ]]; then
  if [[ -z "$K8S_PROD_DB_HOST" ]] || [[ -z "$K8S_PROD_DB_NAME" ]] || [[ -z "$K8S_PROD_DB_USER" ]] || [[ -z "$K8S_PROD_DB_PASSWORD" ]]; then
    echo "ERROR: K8S_PROD_DB_HOST, K8S_PROD_DB_NAME, K8S_PROD_DB_USER, and K8S_PROD_DB_PASSWORD must be set with --via-k8s." >&2
    exit 1
  fi

  if [[ -z "$PROD_APP_SECRET" ]]; then
    PROD_APP_SECRET="$(kubectl get secret "$K8S_APP_SECRET_SECRET_NAME" -n "$K8S_NAMESPACE" -o "jsonpath={.data.$K8S_APP_SECRET_SECRET_KEY}" 2>/dev/null | base64 -d 2>/dev/null || true)"
  fi
elif [[ "$PROD_DATABASE_URL" == "$LOCAL_DATABASE_URL" ]] || [[ "$PROD_DATABASE_URL" == "$LOCAL_MAINTENANCE_DATABASE_URL" ]]; then
  echo "ERROR: Production and local database URLs must not match." >&2
  exit 1
fi

PROD_ENCRYPTION_KEY="${PROD_ENCRYPTION_KEY:-$PROD_APP_SECRET}"
SHOULD_ROTATE_SECRETS=false

if [[ -n "$PROD_ENCRYPTION_KEY" ]] && [[ -n "$LOCAL_ENCRYPTION_KEY" ]] && [[ "$PROD_ENCRYPTION_KEY" != "$LOCAL_ENCRYPTION_KEY" ]]; then
  SHOULD_ROTATE_SECRETS=true
elif [[ -z "$PROD_ENCRYPTION_KEY" ]]; then
  echo "WARNING: PROD_APP_SECRET/PROD_ENCRYPTION_KEY not set, so secrets encrypted in prod stay unreadable locally." >&2
elif [[ "$PROD_ENCRYPTION_KEY" == "$LOCAL_ENCRYPTION_KEY" ]]; then
  echo "WARNING: the local encryption key is the prod key, so prod OAuth tokens, TOTP seeds and app secrets in this copy are usable locally." >&2
fi

if [[ "$ASSUME_YES" != "true" ]]; then
  confirm
fi

cleanup() {
  if [[ "$FLAG_VIA_K8S" == "true" ]]; then
    kubectl delete pod "$K8S_HELPER_POD" -n "$K8S_NAMESPACE" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

GOOGLE_CALLBACK_URL="${LOCAL_SERVER_URL%/}/auth/google/redirect"
GOOGLE_APIS_CALLBACK_URL="${LOCAL_SERVER_URL%/}/auth/google-apis/get-access-token"
MICROSOFT_CALLBACK_URL="${LOCAL_SERVER_URL%/}/auth/microsoft/redirect"
MICROSOFT_APIS_CALLBACK_URL="${LOCAL_SERVER_URL%/}/auth/microsoft-apis/get-access-token"

DUMP_ARGS=(--no-owner --no-acl)

if [[ "$INCLUDE_FILE_DATA" != "true" ]]; then
  DUMP_ARGS+=("--exclude-table-data=*.file" "--exclude-table-data=*.attachment")
fi

echo "==> Dropping and recreating local database '$LOCAL_DATABASE_NAME'..."
psql "$LOCAL_MAINTENANCE_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v local_db_name="$LOCAL_DATABASE_NAME" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'local_db_name'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS :"local_db_name";
CREATE DATABASE :"local_db_name";
SQL

echo "==> Streaming production -> local (this may take a while)..."
if [[ "$FLAG_VIA_K8S" == "true" ]]; then
  echo "==> Launching temporary helper pod '$K8S_HELPER_POD' in namespace '$K8S_NAMESPACE'..."
  kubectl delete pod "$K8S_HELPER_POD" -n "$K8S_NAMESPACE" --ignore-not-found --wait=false >/dev/null 2>&1 || true

  kubectl run "$K8S_HELPER_POD" -n "$K8S_NAMESPACE" \
    --image="$K8S_HELPER_IMAGE" \
    --restart=Never \
    --env="PGPASSWORD=$K8S_PROD_DB_PASSWORD" \
    --env="PGHOST=$K8S_PROD_DB_HOST" \
    --env="PGUSER=$K8S_PROD_DB_USER" \
    --overrides='{
      "spec": {
        "tolerations": [
          {"key": "environment", "operator": "Equal", "value": "production", "effect": "NoSchedule"},
          {"key": "environment", "operator": "Equal", "value": "staging", "effect": "NoSchedule"}
        ]
      }
    }' \
    --command -- sleep 3600 >/dev/null

  kubectl wait --for=condition=Ready pod/"$K8S_HELPER_POD" -n "$K8S_NAMESPACE" --timeout=60s >/dev/null

  {
    echo 'SET session_replication_role = replica;'
    kubectl exec -n "$K8S_NAMESPACE" "$K8S_HELPER_POD" -- \
      pg_dump "${DUMP_ARGS[@]}" -d "$K8S_PROD_DB_NAME"
    echo 'SET session_replication_role = origin;'
  } | psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1
else
  {
    echo 'SET session_replication_role = replica;'
    pg_dump "${DUMP_ARGS[@]}" "$PROD_DATABASE_URL"
    echo 'SET session_replication_role = origin;'
  } | psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1
fi

# Tokens signed with a prod signing key verify on prod, whoever minted them.
# The local server creates its own key on first use.
echo "==> Deleting production JWT signing keys..."
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF to_regclass('core."signingKey"') IS NOT NULL THEN
    DELETE FROM core."signingKey";
  END IF;
END $$;
SQL

if [[ -n "$PROD_APP_SECRET" ]] && [[ -n "$LOCAL_APP_SECRET" ]] && [[ "$PROD_APP_SECRET" != "$LOCAL_APP_SECRET" ]]; then
  require_command node

  echo "==> Re-encrypting legacy (pre-enc:v2) DB-backed sensitive config for the local APP_SECRET..."
  PROD_APP_SECRET="$PROD_APP_SECRET" \
  LOCAL_APP_SECRET="$LOCAL_APP_SECRET" \
  LOCAL_DATABASE_URL="$LOCAL_DATABASE_URL" \
  REPO_ROOT="$REPO_ROOT" \
  node <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { Client } = require('pg');

const prodAppSecret = process.env.PROD_APP_SECRET;
const localAppSecret = process.env.LOCAL_APP_SECRET;
const databaseUrl = process.env.LOCAL_DATABASE_URL;
const repoRoot = process.env.REPO_ROOT;

const configVariablesPath = path.join(
  repoRoot,
  'packages',
  'twenty-server',
  'src',
  'engine',
  'core-modules',
  'twenty-config',
  'config-variables.ts',
);

const source = fs.readFileSync(configVariablesPath, 'utf8');
const sourceFile = ts.createSourceFile(
  configVariablesPath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const getDecorators = (node) =>
  ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];

const sensitiveKeys = [];

for (const statement of sourceFile.statements) {
  if (!ts.isClassDeclaration(statement) || statement.name?.text !== 'ConfigVariables') {
    continue;
  }

  for (const member of statement.members) {
    if (!member.name || !ts.isIdentifier(member.name)) {
      continue;
    }

    let metadataNode = null;

    for (const decorator of getDecorators(member)) {
      const expression = decorator.expression;

      if (!ts.isCallExpression(expression)) {
        continue;
      }

      if (expression.expression.getText(sourceFile) !== 'ConfigVariablesMetadata') {
        continue;
      }

      metadataNode = expression.arguments[0];
      break;
    }

    if (!metadataNode || !ts.isObjectLiteralExpression(metadataNode)) {
      continue;
    }

    let isSensitive = false;
    let isEnvOnly = false;
    let isString = false;

    for (const property of metadataNode.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
        continue;
      }

      const name = property.name.text;
      const initializerText = property.initializer.getText(sourceFile);

      if (name === 'isSensitive' && initializerText === 'true') {
        isSensitive = true;
      }

      if (name === 'isEnvOnly' && initializerText === 'true') {
        isEnvOnly = true;
      }

      if (name === 'type' && initializerText.endsWith('ConfigVariableType.STRING')) {
        isString = true;
      }
    }

    if (isSensitive && !isEnvOnly && isString) {
      sensitiveKeys.push(member.name.text);
    }
  }
}

const hashKey = (key) =>
  crypto.createHash('sha512').update(key).digest('hex').substring(0, 32);

const encryptText = (text, key) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-ctr', hashKey(key), iv);

  return Buffer.concat([iv, cipher.update(text), cipher.final()]).toString(
    'base64',
  );
};

const decryptText = (text, key) => {
  const buffer = Buffer.from(text, 'base64');
  const iv = buffer.subarray(0, 16);
  const encryptedText = buffer.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-ctr', hashKey(key), iv);

  return Buffer.concat([
    decipher.update(encryptedText),
    decipher.final(),
  ]).toString();
};

const main = async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query(
      `
        SELECT id, key, value::text AS value_text
        FROM core."keyValuePair"
        WHERE type = 'CONFIG_VARIABLE'
          AND "userId" IS NULL
          AND "workspaceId" IS NULL
          AND key = ANY($1)
          AND value IS NOT NULL
      `,
      [sensitiveKeys],
    );

    for (const row of result.rows) {
      const encryptedValue = JSON.parse(row.value_text);

      if (typeof encryptedValue !== 'string' || encryptedValue.length === 0) {
        continue;
      }

      // enc:v2 envelopes go through secret-encryption:rotate after the upgrade;
      // the legacy AES-CTR decrypt would silently turn them into garbage.
      if (encryptedValue.startsWith('enc:')) {
        continue;
      }

      const decryptedValue = decryptText(encryptedValue, prodAppSecret);
      const reEncryptedValue = JSON.stringify(
        encryptText(decryptedValue, localAppSecret),
      );

      await client.query(
        `
          UPDATE core."keyValuePair"
          SET value = $2::jsonb,
              "updatedAt" = NOW()
          WHERE id = $1
        `,
        [row.id, reEncryptedValue],
      );
    }
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
elif [[ -n "$PROD_APP_SECRET" ]] && [[ -z "$LOCAL_APP_SECRET" ]]; then
  echo "WARNING: PROD_APP_SECRET is set but no local APP_SECRET was found, skipping sensitive config re-encryption." >&2
fi

if [[ "$RUN_LOCAL_MIGRATIONS" == "true" ]]; then
  # Only `upgrade`, never database:migrate (run-instance-commands --force): that
  # records fast commands per workspace, so a later upgrade would skip every slow
  # and workspace command between the snapshot and the code.
  echo "==> Running local upgrade (instance and workspace commands)..."
  run_local_server_command cache:flush
  run_local_server_command upgrade

  # Instance config only: user OAuth tokens, TOTP seeds and app secrets stay under
  # the prod key, so the copy holds no usable prod user or third-party credential.
  if [[ "$SHOULD_ROTATE_SECRETS" == "true" ]] && [[ "$LOCAL_ENCRYPTION_KEY" == "replace_me_with_a_random_string" ]]; then
    echo "WARNING: the local encryption key is the .env.example default, so DB-backed config secrets stay encrypted with the prod key." >&2
  elif [[ "$SHOULD_ROTATE_SECRETS" == "true" ]]; then
    echo "==> Re-encrypting DB-backed sensitive config from the prod key to the local key..."
    run_local_server_command secret-encryption:rotate --site=sensitive-config-storage
  fi
elif [[ "$SHOULD_ROTATE_SECRETS" == "true" ]]; then
  echo "WARNING: RUN_LOCAL_MIGRATIONS=false, so enc:v2 secrets stay encrypted with the prod key." >&2
fi

echo "==> Rotating tokens and rewriting DB-backed localhost URLs..."
psql "$LOCAL_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v local_public_domain_url="$LOCAL_PUBLIC_DOMAIN_URL" \
  -v google_callback_url="$GOOGLE_CALLBACK_URL" \
  -v google_apis_callback_url="$GOOGLE_APIS_CALLBACK_URL" \
  -v microsoft_callback_url="$MICROSOFT_CALLBACK_URL" \
  -v microsoft_apis_callback_url="$MICROSOFT_APIS_CALLBACK_URL" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DELETE FROM core."appToken" WHERE type = 'REFRESH_TOKEN';

-- Revoked rows stay revoked: un-revoking them breaks the v2.58 unique index on
-- pending two-factor recovery codes.
UPDATE core."appToken"
SET value = encode(gen_random_bytes(32), 'hex'),
    "expiresAt" = NOW() + INTERVAL '30 days',
    "updatedAt" = NOW();

WITH desired(key, value) AS (
  VALUES
    ('PUBLIC_DOMAIN_URL', :'local_public_domain_url'),
    ('AUTH_GOOGLE_CALLBACK_URL', :'google_callback_url'),
    ('AUTH_GOOGLE_APIS_CALLBACK_URL', :'google_apis_callback_url'),
    ('AUTH_MICROSOFT_CALLBACK_URL', :'microsoft_callback_url'),
    ('AUTH_MICROSOFT_APIS_CALLBACK_URL', :'microsoft_apis_callback_url')
),
updated AS (
  UPDATE core."keyValuePair" AS kv
  SET value = to_jsonb(desired.value::text),
      "updatedAt" = NOW()
  FROM desired
  WHERE kv.key = desired.key
    AND kv.type = 'CONFIG_VARIABLE'
    AND kv."userId" IS NULL
    AND kv."workspaceId" IS NULL
  RETURNING kv.key
)
INSERT INTO core."keyValuePair" (
  "key",
  "value",
  "type",
  "userId",
  "workspaceId",
  "createdAt",
  "updatedAt"
)
SELECT desired.key,
       to_jsonb(desired.value::text),
       'CONFIG_VARIABLE',
       NULL,
       NULL,
       NOW(),
       NOW()
FROM desired
LEFT JOIN updated ON updated.key = desired.key
WHERE updated.key IS NULL;
SQL

if [[ "$KEEP_CUSTOM_DOMAINS" != "true" ]]; then
  echo "==> Clearing workspace custom/public domains for local routing..."
  psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE core."workspace"
SET "customDomain" = NULL,
    "isCustomDomainEnabled" = FALSE,
    "updatedAt" = NOW()
WHERE "customDomain" IS NOT NULL
   OR "isCustomDomainEnabled" = TRUE;

DELETE FROM core."publicDomain";
SQL
fi

# The copy keeps prod's webhooks, pull pipelines, SMTP account and Sentry DSNs, so
# a local server or worker would reach them; v2.6 schemas keep webhooks per workspace.
echo "==> Disconnecting the copy from production services..."
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  workspace_schema text;
BEGIN
  IF to_regclass('core.webhook') IS NOT NULL THEN
    UPDATE core.webhook SET "deletedAt" = NOW() WHERE "deletedAt" IS NULL;
  END IF;

  FOR workspace_schema IN SELECT "databaseSchema" FROM core.workspace WHERE "databaseSchema" IS NOT NULL LOOP
    IF to_regclass(format('%I.webhook', workspace_schema)) IS NOT NULL THEN
      EXECUTE format('UPDATE %I.webhook SET "deletedAt" = NOW() WHERE "deletedAt" IS NULL', workspace_schema);
    END IF;
  END LOOP;

  IF to_regclass('core."ingestionPipeline"') IS NOT NULL THEN
    UPDATE core."ingestionPipeline" SET "isEnabled" = FALSE WHERE "isEnabled";
  END IF;
END $$;

UPDATE core."keyValuePair"
SET value = to_jsonb('LOGGER'::text),
    "updatedAt" = NOW()
WHERE type = 'CONFIG_VARIABLE'
  AND "workspaceId" IS NULL
  AND "userId" IS NULL
  AND key = 'EMAIL_DRIVER';

DELETE FROM core."keyValuePair"
WHERE type = 'CONFIG_VARIABLE'
  AND "workspaceId" IS NULL
  AND "userId" IS NULL
  AND key IN ('EMAIL_SMTP_PASSWORD', 'SENTRY_DSN', 'SENTRY_FRONT_DSN');

WITH updated AS (
  UPDATE core."keyValuePair"
  SET value = 'false'::jsonb,
      "updatedAt" = NOW()
  WHERE type = 'CONFIG_VARIABLE'
    AND "workspaceId" IS NULL
    AND "userId" IS NULL
    AND key = 'TELEMETRY_ENABLED'
  RETURNING key
)
INSERT INTO core."keyValuePair" ("key", "value", "type", "userId", "workspaceId", "createdAt", "updatedAt")
SELECT 'TELEMETRY_ENABLED', 'false'::jsonb, 'CONFIG_VARIABLE', NULL, NULL, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM updated);
SQL

if [[ "$PURGE_LOCAL_REDIS_WORKSPACE_CACHE" == "true" ]]; then
  # The URL and domain rewrites above change cached config and Workspace rows.
  echo "==> Flushing local Redis cache..."
  if ! run_local_server_command cache:flush; then
    echo "WARNING: cache:flush failed (is twenty-server built?), so local Redis may serve stale prod rows." >&2
  fi
fi

echo "==> Remaining references to '$SOURCE_DOMAIN' in DB-backed config/domain rows:"
psql "$LOCAL_DATABASE_URL" \
  -P pager=off \
  -v ON_ERROR_STOP=1 \
  -v source_domain="$SOURCE_DOMAIN" <<'SQL'
WITH remaining AS (
  SELECT
    'config' AS source,
    key AS identifier,
    value::text AS value
  FROM core."keyValuePair"
  WHERE type = 'CONFIG_VARIABLE'
    AND value::text ILIKE '%' || :'source_domain' || '%'

  UNION ALL

  SELECT
    'workspace_custom_domain' AS source,
    id::text AS identifier,
    "customDomain" AS value
  FROM core."workspace"
  WHERE COALESCE("customDomain", '') ILIKE '%' || :'source_domain' || '%'

  UNION ALL

  SELECT
    'public_domain' AS source,
    id::text AS identifier,
    domain AS value
  FROM core."publicDomain"
  WHERE domain ILIKE '%' || :'source_domain' || '%'
)
SELECT source, identifier, value
FROM remaining
ORDER BY source, identifier;
SQL

echo ""
echo "Restore complete."
echo "Local env reminders:"
echo "  twenty-server: PG_DATABASE_URL=$LOCAL_DATABASE_URL"
echo "  twenty-server: SERVER_URL=$LOCAL_SERVER_URL"
echo "  twenty-server: FRONTEND_URL=$LOCAL_FRONTEND_URL"
echo "  twenty-front:  REACT_APP_SERVER_BASE_URL=$LOCAL_SERVER_URL"
echo ""
echo "If the query above still shows production hostnames, patch those rows before testing."
