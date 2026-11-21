#!/usr/bin/env bash
# check-customizations.sh: fails when an upstream merge drops or reverts an Omnia customization.
# Run it from any directory, before and after every upstream merge and before every deploy.
# CUSTOMIZATIONS.md explains each area; every pattern below is a literal (grep -F) match.
set -euo pipefail

cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

check_file_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if [ ! -f "$file" ]; then
    echo -e "${RED}MISSING${NC} $file — $description"
    ERRORS=$((ERRORS + 1))
    return
  fi

  # -F: literal match (BSD grep rejects some regex operators such as `**`); --: patterns may start with "-".
  if ! grep -qF -- "$pattern" "$file" 2>/dev/null; then
    echo -e "${RED}OVERWRITTEN${NC} $file — $description"
    echo "  Expected pattern: $pattern"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}OK${NC} $file"
  fi
}

check_file_exists() {
  local file="$1"
  local description="$2"

  if [ ! -f "$file" ]; then
    echo -e "${RED}MISSING${NC} $file — $description"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}OK${NC} $file"
  fi
}

# A missing file is an error: a deleted or renamed file must never pass a "must not contain" guard.
check_file_not_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if [ ! -f "$file" ]; then
    echo -e "${RED}MISSING${NC} $file — $description"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if grep -qF -- "$pattern" "$file" 2>/dev/null; then
    echo -e "${RED}REVERTED${NC} $file — $description"
    echo "  Forbidden pattern: $pattern"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}OK${NC} $file"
  fi
}

check_file_not_exists() {
  local path="$1"
  local description="$2"

  if [ -e "$path" ] || [ -L "$path" ]; then
    echo -e "${RED}PRESENT${NC} $path — $description"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}OK${NC} $path absent"
  fi
}

check_symlink() {
  local path="$1"
  local target="$2"
  local description="$3"

  if [ -L "$path" ] && [ "$(readlink "$path")" = "$target" ]; then
    echo -e "${GREEN}OK${NC} $path -> $target"
  else
    echo -e "${RED}NOT A SYMLINK${NC} $path — $description"
    ERRORS=$((ERRORS + 1))
  fi
}

check_type_block_contains() {
  local file="$1"
  local block_start="$2"
  local pattern="$3"
  local description="$4"

  if [ ! -f "$file" ]; then
    echo -e "${RED}MISSING${NC} $file — $description"
    ERRORS=$((ERRORS + 1))
    return
  fi

  # The block opens at a line starting with block_start and ends at the first line starting with "}"
  # (a per-line grep cannot tell which type a field belongs to).
  if awk -v start="$block_start" -v pattern="$pattern" '
    index($0, start) == 1 { inside = 1; next }
    inside && index($0, pattern) { found = 1; exit }
    inside && /^}/ { inside = 0 }
    END { exit found ? 0 : 1 }
  ' "$file"; then
    echo -e "${GREEN}OK${NC} $file"
  else
    echo -e "${RED}OVERWRITTEN${NC} $file — $description"
    echo "  Expected pattern in block '$block_start': $pattern"
    ERRORS=$((ERRORS + 1))
  fi
}

# GitHub runs every .yml/.yaml file in a workflows directory, so each one must be on the allowlist.
check_workflows_allowlist() {
  local dir="$1"
  local description="$2"
  shift 2

  if [ ! -d "$dir" ]; then
    echo -e "${RED}MISSING${NC} $dir — $description"
    ERRORS=$((ERRORS + 1))
    return
  fi

  local entry name allowed is_allowed unexpected=0
  for entry in "$dir"/*.yml "$dir"/*.yaml; do
    [ -f "$entry" ] || continue
    name=$(basename "$entry")
    is_allowed=0
    for allowed in "$@"; do
      if [ "$name" = "$allowed" ]; then
        is_allowed=1
      fi
    done
    if [ "$is_allowed" -eq 0 ]; then
      echo -e "${RED}UNEXPECTED${NC} $entry — $description"
      ERRORS=$((ERRORS + 1))
      unexpected=1
    fi
  done

  if [ "$unexpected" -eq 0 ]; then
    echo -e "${GREEN}OK${NC} $dir (allowlist)"
  fi
}

echo "============================================"
echo "  Omnia Customization Check"
echo "============================================"


# ======================================================================
# Server infrastructure: registration (C7), queues (C9), upgrade commands, CLI, deploy, hardening
# ======================================================================
echo ""
echo "=== Server infrastructure: registration (C7), queues (C9), upgrade commands, CLI, deploy, hardening ==="

echo ""
echo "--- Registration points (C7): server modules ---"
check_file_contains \
  "packages/twenty-server/src/modules/modules.module.ts" \
  "OmniaModulesModule" \
  "ModulesModule must import OmniaModulesModule, the one registration point for Omnia server modules"
check_file_exists \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "OmniaModulesModule registers every Omnia server module (hooks, resolvers, controllers, processors, listeners)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "PolicyQueryHookModule" \
  "Policy query hooks must register through OmniaModulesModule"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "CallQueryHookModule" \
  "Call query hooks must register through OmniaModulesModule"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "AgentProfileModule" \
  "AgentProfileModule must register through OmniaModulesModule"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "ReconciliationModule" \
  "ReconciliationModule must register through OmniaModulesModule"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "DashboardAudienceModule" \
  "DashboardAudienceModule must register through OmniaModulesModule so the role listener loads"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "AgentRollupModule" \
  "AgentRollupModule must register through OmniaModulesModule so the worker processes the rollup cron"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "IngestionPipelineModule" \
  "Ingestion pipeline resolvers, webhook controller and job processors must register through OmniaModulesModule"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "ImportJobModule" \
  "Server-side CSV import module must register through OmniaModulesModule"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "ImportJobProcessorModule" \
  "Server-side CSV import processor must register through OmniaModulesModule"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/core-engine.module.ts" \
  "AgentRollupModule" \
  "Omnia modules must not be registered in CoreEngineModule (C7)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/core-engine.module.ts" \
  "ImportJobModule" \
  "Omnia modules must not be registered in CoreEngineModule (C7)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/jobs.module.ts" \
  "ReconciliationModule" \
  "Omnia modules must not be registered in JobsModule (C7)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/jobs.module.ts" \
  "ImportJobProcessorModule" \
  "Omnia modules must not be registered in JobsModule (C7)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/jobs.module.ts" \
  "IngestionJobModule" \
  "Omnia modules must not be registered in JobsModule (C7)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/metadata-engine.module.ts" \
  "IngestionPipelineModule" \
  "Ingestion pipeline registers through OmniaModulesModule only (contract C7)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/metadata-engine.module.ts" \
  "ReconciliationModule" \
  "Reconciliation reaches the /metadata schema through ModulesModule; never import it in MetadataEngineModule (contract C7)"
check_file_not_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "IngestionJobModule" \
  "Ingestion processors live in IngestionPipelineModule; IngestionJobModule must not come back"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module.ts" \
  "IngestionPullJob," \
  "IngestionPipelineModule must provide the pull processor, or the worker never consumes ingestion-queue pull jobs"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module.ts" \
  "IngestionPushProcessJob," \
  "IngestionPipelineModule must provide the push processor, or webhook payloads are never processed"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "RoleObjectSettingsModule," \
  "RoleObjectSettingsModule must register through OmniaModulesModule, or UserWorkspace.objectSidebarVisibility (C4) is in no GraphQL schema"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "PersonQueryHookModule" \
  "Person (lead) query hooks must register through OmniaModulesModule"
check_file_not_contains \
  "packages/twenty-server/src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.module.ts" \
  "PolicyQueryHookModule" \
  "Omnia hook modules register only through OmniaModulesModule (C7); importing them here double-registers the hooks"
check_file_not_contains \
  "packages/twenty-server/src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.module.ts" \
  "CallQueryHookModule" \
  "Omnia hook modules register only through OmniaModulesModule (C7); importing them here double-registers the hooks"
check_file_not_contains \
  "packages/twenty-server/src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.module.ts" \
  "PersonQueryHookModule" \
  "Omnia hook modules register only through OmniaModulesModule (C7); importing them here double-registers the hooks"
check_file_not_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "LeadQueryHookModule" \
  "LeadQueryHookModule was renamed to PersonQueryHookModule; the lead.* hooks were dropped"
check_file_not_contains \
  "packages/twenty-server/src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.module.ts" \
  "LeadQueryHookModule" \
  "The pre-merge LeadQueryHookModule import here must stay gone (file deleted, C7)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module.ts" \
  "IngestionPullSchedulesCronCommand," \
  "IngestionPipelineModule provides and exports the pull-schedules cron command"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "ImportJobValidatedRowsRetentionModule" \
  "OmniaModulesModule must load the retention cron module so the worker runs the cron job (needs HR4)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/omnia-modules.module.ts" \
  "OmniaSiblingSessionModule" \
  "OmniaModulesModule must register OmniaSiblingSessionModule (C13): the upstream session services inject its global service and fail DI without it"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module.ts" \
  "Ingestion pipeline server module"

echo ""
echo "--- Message queues (C9) ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts" \
  "importQueue = 'import-queue'" \
  "MessageQueue must keep importQueue with prod's Redis key prefix"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts" \
  "ingestionQueue = 'ingestion-queue'" \
  "MessageQueue must keep ingestionQueue with prod's Redis key prefix"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts" \
  "reconciliationQueue = 'reconciliation-queue'" \
  "MessageQueue must keep reconciliationQueue with prod's Redis key prefix"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts" \
  "exportQueue = " \
  "No Omnia exportQueue: exports use upstream recordExportQueue"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts" \
  "[MessageQueue.importQueue]" \
  "importQueue must have its worker config (5-minute lock, maxStalledCount 1) or the import worker never starts"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts" \
  "[MessageQueue.ingestionQueue]" \
  "Ingestion queue worker config (concurrency 1, 2 min lock)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts" \
  "[MessageQueue.reconciliationQueue]" \
  "Reconciliation queue worker config (concurrency 1, 5 min lock, never re-queued on stall)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts" \
  "lockDuration: 300_000" \
  "Import and reconciliation queues need a 5 min BullMQ lock"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-config.constant.ts" \
  "lockDuration: 120_000" \
  "Ingestion queue needs a 2 min BullMQ lock"
check_file_not_exists \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-priority.constant.ts" \
  "Per-queue priorities were removed upstream (no cross-queue effect); must stay deleted"
check_file_not_exists \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-worker-options.constant.ts" \
  "Replaced by upstream MESSAGE_QUEUE_WORKER_CONFIG; must stay deleted"
check_file_not_exists \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-concurrency.constant.ts" \
  "Never-read Omnia concurrency map; must stay deleted"

echo ""
echo "--- Small server hunks kept (email trim, IS_NOT_RELATIVE, dev watch) and upstream-native guards ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-transformer/utils/transform-emails-value.util.ts" \
  "value.primaryEmail.trim().toLowerCase()" \
  "Primary email must be trimmed before lowercasing (upstream only lowercases)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-transformer/utils/transform-emails-value.util.ts" \
  "emailArray.map((email) => email.trim().toLowerCase())" \
  "Additional emails must be trimmed before lowercasing (upstream only lowercases)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-transformer/utils/__tests__/transform-emails-value.util.spec.ts" \
  "should trim whitespace from additionalEmails" \
  "Email trim regression coverage must stay"
check_file_contains \
  "packages/twenty-server/src/modules/workflow/workflow-executor/workflow-actions/filter/utils/evaluate-filter-conditions.util.ts" \
  "case ViewFilterOperand.IS_NOT_RELATIVE:" \
  "Workflow date filters must evaluate the Omnia IS_NOT_RELATIVE operand (negated IS_RELATIVE)"
check_file_exists \
  "packages/twenty-server/src/modules/workflow/workflow-executor/workflow-actions/filter/utils/__tests__/evaluate-filter-conditions-is-not-relative.util.spec.ts" \
  "IS_NOT_RELATIVE workflow filter regression coverage"
check_file_contains \
  "packages/twenty-server/project.json" \
  "rimraf dist && CHOKIDAR_USEPOLLING=1 NODE_ENV=development nest start --watch" \
  "Server dev watch must poll (CHOKIDAR_USEPOLLING) to avoid EMFILE"
check_file_contains \
  "packages/twenty-server/project.json" \
  "CHOKIDAR_USEPOLLING=1 NODE_ENV=development nest start --watch --entryFile queue-worker/queue-worker" \
  "Worker dev watch must poll (CHOKIDAR_USEPOLLING) to avoid EMFILE"
check_file_contains \
  "packages/twenty-server/nest-cli.json" \
  "constants/standard-application-dependencies/**" \
  "Nest watcher must ignore the standard application dependency assets (renamed from seed-dependencies in v2.58)"
check_file_contains \
  "packages/twenty-server/nest-cli.json" \
  "constants/workspace-custom-application-dependencies/**" \
  "Nest watcher must ignore the workspace custom application dependency assets"
check_file_not_contains \
  "packages/twenty-server/nest-cli.json" \
  "constants/seed-dependencies/**" \
  "Stale pre-v2.58 seed-dependencies watch path must not come back"
check_file_contains \
  "packages/twenty-server/nest-cli.json" \
  '"**/.yarn/**"' \
  "Nest watcher must ignore Yarn cache directories to reduce open file watchers"
check_file_contains \
  "packages/twenty-server/nest-cli.json" \
  "seed-project/**" \
  "Nest watcher must ignore large static seed project assets to avoid EMFILE in watch mode"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/event-emitter/utils/object-record-changed-values.ts" \
  "fieldIdByJoinColumnName" \
  "Upstream-native: timeline diffs map FK join columns to relation fields (EventFieldDiffRelationValue relies on it)"

echo ""
echo "--- Config variables (Omnia) ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts" \
  "GOOGLE_SERVICE_ACCOUNT_KEY_JSON" \
  "Google DWD service-account key config was dropped (U11); the grant is revoked"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts" \
  "API_RATE_LIMITING_LONG_LIMIT = 5000" \
  "API rate-limit values live in omnia-values.yaml extraEnv, not in code defaults (U10)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts" \
  "API_RATE_LIMITING_SHORT_LIMIT = 500;" \
  "API rate-limit values live in omnia-values.yaml extraEnv, not in code defaults (U10)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts" \
  "OMNIA-CUSTOM: Pod Identity allowlist for LOCAL logic functions (HIPAA)." \
  "The allowlist hunk must keep its marker; it must stay isEnvOnly so the admin panel cannot widen the pod role grant"

echo ""
echo "--- Dropped in the v2.58 merge (must stay gone) ---"
check_file_not_exists \
  "packages/twenty-server/src/modules/connected-account/oauth2-client-manager/drivers/google/google-service-account-manager.service.ts" \
  "Google DWD impersonation client was dropped (U11)"
check_file_not_exists \
  "packages/twenty-server/src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client-manager.service.ts" \
  "Google DWD OAuth2 client manager was dropped (U11); upstream GoogleOAuth2ClientProvider is the only Google client"
check_file_not_exists \
  "packages/twenty-server/src/modules/messaging/message-import-manager/services/messaging-account-authentication.service.ts" \
  "Orphan messaging auth service (deleted upstream before v2.19) must stay deleted (U11)"
check_file_not_contains \
  "packages/twenty-server/src/modules/connected-account/refresh-tokens-manager/services/connected-account-refresh-tokens.service.ts" \
  "SERVICE_ACCOUNT" \
  "The DWD refresh-token sentinel branch was dropped (U11)"
check_file_not_contains \
  "packages/twenty-server/src/modules/connected-account/oauth2-client-manager/oauth2-client-manager.module.ts" \
  "GoogleServiceAccountManagerService" \
  "OAuth2ClientManagerModule must not register the dropped DWD services (U11)"
check_file_not_contains \
  "packages/twenty-server/src/engine/workspace-event-emitter/workspace-event-emitter.ts" \
  "EventOrigin" \
  "Event-origin plumbing was dropped (U38); imports emit events normally"
check_file_not_contains \
  "packages/twenty-server/src/engine/workspace-event-emitter/types/workspace-event-batch.type.ts" \
  "EventOrigin" \
  "WorkspaceEventBatch carries no origin tag (U38)"
check_file_not_contains \
  "packages/twenty-server/src/modules/workflow/workflow-trigger/automated-trigger/listeners/workflow-database-event-trigger.listener.ts" \
  "payload.origin" \
  "Workflow triggers must not skip import-origin events (U38); upstream shouldIgnoreEvent only"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/file/interfaces/file-folder.interface.ts" \
  "FileFolder.Export" \
  "FileFolder.Export was dropped with the export swap to upstream record-export (U37)"

echo ""
echo "--- Registration points (C7): OmniaCommandModule ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/database-command.module.ts" \
  "OmniaCommandModule" \
  "DatabaseCommandModule must import OmniaCommandModule, the single registration point for Omnia CLI commands (C7)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/database-command.module.ts" \
  "SeedReconciliationObjectsCommand" \
  "Omnia CLI commands register only through OmniaCommandModule, never directly in DatabaseCommandModule (C7)"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "OmniaCommandModule provides every Omnia CLI command"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "RunLegacyTypeOrmMigrationsCommand" \
  "OmniaCommandModule must register omnia:run-legacy-typeorm-migrations (the Helm migration job runs it)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "SeedConvosoCallPipelineCommand" \
  "OmniaCommandModule must register the Convoso call pipeline seed (Q18)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "SeedHealthSherpaPipelineCommand" \
  "OmniaCommandModule must register the Health Sherpa pipeline seed (Q18)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "SeedConvosoTimeCardPipelineCommand" \
  "OmniaCommandModule must register the Time Card pipeline seed"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "BackfillTimeCardsCommand" \
  "OmniaCommandModule must register the Time Card backfill"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "SeedCarrierConfigCommand" \
  "OmniaCommandModule must register the generic carrier-config seed"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "SeedAmbetterCarrierConfigCommand" \
  "OmniaCommandModule must register the Ambetter carrier-config seed"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "OmniaVerifyPermissionsCommand," \
  "workspace:omnia-verify-permissions must be registered (C7); it re-verifies RLS and PHI grants after app installs and syncs"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "OmniaPermissionsVerificationService," \
  "The verify CLI needs its own provider of the verification service"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "OmniaVerifyPermissionsUpgradeCommand" \
  "A second provider of W9 makes the upgrade registry throw a duplicate timestamp at every boot"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "provideWorkspaceScopedRepository(FieldMetadataEntity)" \
  "OmniaCommandModule must provide the scoped FieldMetadataEntity repository that AdoptBrokerageAppCommand injects (else every CLI command fails DI)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "provideWorkspaceScopedRepository(NavigationMenuItemEntity)" \
  "OmniaCommandModule must provide the scoped NavigationMenuItemEntity repository that AdoptBrokerageAppCommand injects (else every CLI command fails DI)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "ReviewItemService" \
  "OmniaCommandModule must not re-provide the reconciliation services (every CLI command, the Helm migration job included, fails DI)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "ReconciliationCoreModule," \
  "OmniaCommandModule must import ReconciliationCoreModule; local copies of the reconciliation services cannot resolve the lockdown's dependencies and every CLI command fails at boot"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "ReconciliationObjectLockdownService" \
  "The lockdown service comes from ReconciliationObjectLockdownModule (through ReconciliationCoreModule); a local copy cannot resolve its migration-runner, grant-role and cache-lock dependencies"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "AgentRollupModule," \
  "OmniaCommandModule must import and export AgentRollupModule (ComputeAgentRollupsCommand, and ComputeAgentRollupsCronCommand for cron:register:all)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "IngestionPipelineModule," \
  "OmniaCommandModule must import and export IngestionPipelineModule so CronRegisterAllCommand can inject IngestionPullSchedulesCronCommand"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "ImportJobValidatedRowsRetentionModule," \
  "OmniaCommandModule must import and export ImportJobValidatedRowsRetentionModule so CronRegisterAllCommand can inject the Q22 retention cron command"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "AdoptBrokerageAppCommand" \
  "Brokerage adoption command must be registered in OmniaCommandModule"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "SeedReconciliationObjectsCommand" \
  "OmniaCommandModule must register SeedReconciliationObjectsCommand"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "BackfillReconciliationDecisionRulesCommand" \
  "OmniaCommandModule must register learned reconciliation rule backfill command"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "SyncDashboardAudienceCommand" \
  "Dashboard audience sync command must be registered in OmniaCommandModule"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/omnia-command.module.ts" \
  "ComputeAgentRollupsCommand" \
  "Agent rollup command must be registered in OmniaCommandModule"

echo ""
echo "--- Legacy TypeORM migrations (frozen folder) and their runner ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/run-legacy-typeorm-migrations.command.ts" \
  "Standalone legacy TypeORM migration command used by the Helm migration job"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/run-legacy-typeorm-migrations.command.ts" \
  "omnia:run-legacy-typeorm-migrations" \
  "Command name must match the Helm job (node dist/command/command.js omnia:run-legacy-typeorm-migrations)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/run-legacy-typeorm-migrations.command.ts" \
  "transaction: 'each'" \
  "Legacy migrations must run one transaction each (the concurrent-index migration sets transaction = false)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/run-legacy-typeorm-migrations.command.ts" \
  "InstanceCommandRunnerService" \
  "omnia:run-legacy-typeorm-migrations must run legacy migrations only, never instance commands"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1774400000000-add-export-job-entity.ts" \
  "Frozen legacy migration that created core.exportJob; prod's _typeorm_migrations lists it (the table is dropped next release)"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1773079000000-add-scope-to-row-level-permission-predicates.ts" \
  "Frozen legacy migration; v2.58 leaves the scope columns unmapped until the next-release drop"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771600000000-add-policy-number-and-rename.ts" \
  'ADD COLUMN IF NOT EXISTS "policyNumber" text' \
  "Policy number must remain a text field so global search can match pasted policy IDs"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1772591146793-add-edit-window-minutes.ts" \
  "Edit window migration"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1772600000000-change-submitted-date-to-datetime.ts" \
  "SubmittedDate datetime migration"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1773069763255-add-field-metadata-required.ts" \
  "Required fields migration"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1775300000000-dedup-calls-and-add-unique-index.ts" \
  "Call dedup migration + unique index on convosoCallId"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1776000000000-add-ingestion-pipeline-dedup-field-names.ts" \
  "Composite dedup migration (dedupFieldNames array column)"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1776100000000-add-time-card-unique-index.ts" \
  "Time Card composite unique index migration"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1778000000000-reconcile-time-card-agent-relation.ts" \
  "Time Card agent relation metadata reconciliation migration"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1778000000000-reconcile-time-card-agent-relation.ts" \
  "ReconcileTimeCardAgentRelation1778000000000" \
  "Time Card relation migration must normalize agent/agentId metadata"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1779200635935-add-call-analytics-indexes.ts" \
  "Call analytics covering indexes migration"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1779200635935-add-call-analytics-indexes.ts" \
  "idx_call_live_billable_date_agent_cover" \
  "Call analytics migration must keep the billable aggregate covering index"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1779200635935-add-call-analytics-indexes.ts" \
  "transaction = false" \
  "Call analytics indexes must be created concurrently outside TypeORM migration transactions"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1769300000000-add-external-policy-fields.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1770854400000-use-template-for-standard-view-names.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771284860000-add-ingestion-pipeline-entities.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771400000000-add-ingestion-log-incoming-payload.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771500000000-add-show-in-sidebar-permission.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771700000000-add-call-recording-url.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771700000000-add-convoso-list-id-to-lead-source.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1771800000000-set-recording-field-display-as-audio.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1772000000000-add-ltv-to-policy.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1774200000000-configure-role-sidebar-permissions.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1774300000000-add-import-job-entity.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1774500000000-add-view-field-sub-field-name.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/legacy-typeorm-migrations-do-not-add/common/1775250175000-addUploadingToImportJobStatusEnum.ts" \
  "Frozen Omnia legacy migration (U18 KEEP): omnia:run-legacy-typeorm-migrations replays the folder on fresh databases"

echo ""
echo "--- cron:register:all entries ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/cron-register-all.command.ts" \
  "command: this.computeAgentRollupsCronCommand" \
  "cron:register:all must register the agent rollup cron entry, not only inject it"
check_file_contains \
  "packages/twenty-server/src/database/commands/cron-register-all.command.ts" \
  "command: this.ingestionPullSchedulesCronCommand" \
  "cron:register:all must re-register the pull ingestion schedules on every server start (the scheduler has no boot re-sync)"
check_file_contains \
  "packages/twenty-server/src/database/commands/cron-register-all.command.ts" \
  "command: this.importJobValidatedRowsRetentionCronCommand" \
  "cron:register:all must schedule the Q22 retention that clears staged import rows (PHI) 30 days after the job ends"
check_file_contains \
  "packages/twenty-server/src/database/commands/cron-register-all.command.ts" \
  "command: this.ingestionLogRetentionCronCommand" \
  "cron:register:all must schedule the ingestion log retention that clears pushed records (PHI)"
check_file_contains \
  "packages/twenty-server/src/database/commands/cron-register-all.command.ts" \
  "ComputeAgentRollupsCronCommand" \
  "Agent rollup cron must be registered in cron:register:all"

echo ""
echo "--- Omnia CLI commands ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/seed-convoso-call-pipeline.command.ts" \
  "Convoso call pipeline seed command (registered, Q18)"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/seed-healthsherpa-pipeline.command.ts" \
  "Health Sherpa pipeline seed command (registered, Q18)"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/backfill-time-cards.command.ts" \
  "Time Card backfill command"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/compute-agent-rollups.command.ts" \
  "Agent rollup CLI command"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/backfill-time-cards.command.ts" \
  "isWorkspaceJob: true" \
  "Time Card backfill must enqueue ingestion pulls as workspace jobs (G6)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/seed-convoso-call-pipeline.command.ts" \
  'Webhook Secret: ${' \
  "Pipeline seeds must never log the webhook secret (Q19)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/seed-healthsherpa-pipeline.command.ts" \
  'Webhook Secret: ${' \
  "Pipeline seeds must never log the webhook secret (Q19)"
check_file_not_exists \
  "packages/twenty-server/src/database/commands/custom/provision-google-workspace-accounts.command.ts" \
  "Google domain-wide delegation provisioning was dropped (U11); the DWD grant must stay revoked"
check_file_not_exists \
  "packages/twenty-server/src/database/commands/custom/seed-insurance-navigation.command.ts" \
  "Dead, never-registered command removed in the v2.58 merge (Q18)"
check_file_not_exists \
  "packages/twenty-server/src/database/commands/custom/sync-policy-status-from-csv.command.ts" \
  "Dead, never-registered command removed in the v2.58 merge (Q18)"
check_file_not_exists \
  "packages/twenty-server/src/database/commands/sync-agent-workspace-members.command.ts" \
  "Dead, never-registered command removed in the v2.58 merge (Q18)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/sync-dashboard-audience.command.ts" \
  "dryRun: options.dryRun === true" \
  "workspace:sync-dashboard-audience --dry-run must reach the sync service, which plans and logs without writing"
# Every Omnia CLI command is ported to the v2.58 runner and ORM manager (G4).
for omnia_command_file in packages/twenty-server/src/database/commands/custom/*.command.ts; do
  [ -f "$omnia_command_file" ] || continue
  check_file_not_contains \
    "$omnia_command_file" \
    "ActiveOrSuspendedWorkspaceCommandRunner" \
    "Omnia CLI commands extend ProvisionedWorkspaceCommandRunner (v2.58 deleted ActiveOrSuspendedWorkspaceCommandRunner)"
  check_file_not_contains \
    "$omnia_command_file" \
    "GlobalWorkspaceOrmManager" \
    "Omnia CLI commands use WorkspaceOrmManager (v2.58 deleted GlobalWorkspaceOrmManager)"
done

echo ""
echo "--- Server hardening: enterprise unlock, auth, errors, Sentry, assets, branding ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts" \
  "OMNIA-CUSTOM: self-hosted force-unlock" \
  "Enterprise validity check must force-unlock every v2.58 enterprise gate (isValid, isValidWithFreshToken, hasValidEnterpriseValidityToken)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts" \
  "private isCachedValidityPayloadValid(): boolean {" \
  "The force-unlock lives in isCachedValidityPayloadValid(); if upstream renames it, re-port the unlock to the new single switch"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/enterprise/services/__tests__/enterprise-plan-self-hosted-unlock.spec.ts" \
  "Enterprise force-unlock regression coverage (isValid, isValidWithFreshToken, no outbound enterprise API calls)"
check_file_contains \
  "packages/twenty-server/src/instrument.ts" \
  "recordInputs: false" \
  "Sentry vercelAIIntegration must not record AI inputs: a re-enabled Sentry must never receive PHI (integration option wins over per-call telemetry)"
check_file_contains \
  "packages/twenty-server/src/instrument.ts" \
  "recordOutputs: false" \
  "Sentry vercelAIIntegration must not record AI outputs: a re-enabled Sentry must never receive PHI"
check_file_contains \
  "packages/twenty-server/src/instrument.ts" \
  "dataCollection: { genAI: { inputs: false, outputs: false } }" \
  "Sentry 11 genAI data collection must stay off for every AI integration"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/frontend/frontend.module.ts" \
  "max-age=31536000, immutable" \
  "FrontendModule must cache content-hashed /assets/ files as immutable for a year"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/frontend/frontend.module.ts" \
  "['/assets/', '/images/'].some((directory) =>" \
  "FrontendModule must 404 a missing /assets/ or /images/ file instead of serving index.html"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/frontend/__tests__/frontend.module.spec.ts" \
  "Asset cache header and missing-asset 404 regression coverage"
check_file_contains \
  "packages/twenty-server/src/filters/unhandled-exception.filter.ts" \
  "message: 'Internal server error'" \
  "Unhandled non-HTTP exceptions must answer a generic 500 body (database errors can quote PHI)"
check_file_not_contains \
  "packages/twenty-server/src/filters/unhandled-exception.filter.ts" \
  "exception.response ?? exception.message" \
  "Unhandled exception filter must not echo raw exception.response or exception.message to clients"
check_file_exists \
  "packages/twenty-server/src/filters/__tests__/unhandled-exception.filter.spec.ts" \
  "Redacted 500 body regression coverage"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts" \
  '!user.isEmailVerified && !isNonEmptyString(user.passwordHash)' \
  "Social SSO marks only password-less users verified (same guard as upstream enterprise SSO; blocks pre-account takeover)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts" \
  "isNonEmptyString(returnToPath) && returnToPath.startsWith('/')" \
  "Upstream's startsWith('/') returnToPath check accepts //evil.com; every call site must go through getSafeReturnToPath"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/auth/services/auth.service.spec.ts" \
  "returnToPath trust policy and social SSO email verification regression coverage (upstream deleted its spec)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/workspace-invitation/services/workspace-invitation.service.ts" \
  'OMNIA-CUSTOM: sender name without the upstream "via Twenty" suffix' \
  "Invitation sender hunk must stay (a not-contains check alone passes if upstream moves the sender line)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/approved-access-domain/services/approved-access-domain.service.ts" \
  "(via Twenty)" \
  "approved-access-domain.service.ts must not contain '(via Twenty)' in sender name"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/approved-access-domain/services/approved-access-domain.service.ts" \
  'OMNIA-CUSTOM: sender name without the upstream "via Twenty" suffix' \
  "Approved-access-domain sender hunk must stay (a not-contains check alone passes if upstream moves the sender line)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/billing/utils/is-entitlement-active.util.ts" \
  "hasValidEnterprisePlan ||" \
  "With billing off, entitlements (RLS UI gate included) follow the enterprise force-unlock; keep IS_BILLING_ENABLED false"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts" \
  "force-unlock ALL Enterprise-gated" \
  "Enterprise validity switch isCachedValidityPayloadValid() must force-unlock all EE features for self-hosted (RLS management, validation rules, custom AI providers, SSO guard, event logs)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/session-storage/session-storage.module-factory.ts" \
  "redisClient.on('error'" \
  "Session-storage redis client keeps upstream's native 'error' listener (Omnia's duplicate listener was dropped in the v2.58 merge)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts" \
  "isExternalRedirectTrusted" \
  "auth.service must accept an absolute returnToPath only if isExternalRedirectTrusted (https, front host or its parent domain) holds"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts" \
  "getSafeReturnToPath" \
  "auth.service must run every forwarded returnToPath (computeRedirectURI, workspace-agnostic social SSO) through getSafeReturnToPath"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts" \
  "markEmailAsVerified" \
  "auth.service must mark password-less social SSO users as email-verified before issuing /verify login tokens"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/workspace-invitation/services/workspace-invitation.service.ts" \
  "(via Twenty)" \
  "workspace-invitation.service.ts must not contain '(via Twenty)' in sender name"

echo ""
echo "--- Helm migration job (upgrade only, never run-instance-commands) ---"
check_file_exists \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  "Pre-upgrade migration job must exist: server pods set DISABLE_DB_MIGRATIONS, so nothing else upgrades the schema"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  "node dist/command/command.js omnia:run-legacy-typeorm-migrations &&" \
  "Migration job must apply pending frozen legacy TypeORM migrations before upgrade"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  "node dist/command/command.js upgrade &&" \
  "Migration job must run the cursor-ordered upgrade command"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  "run-instance-commands" \
  "Migration job must never run run-instance-commands: it records fast commands per workspace and upgrade then skips every slow and workspace command"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  "typeorm migration:run" \
  "Migration job must not call the typeorm CLI (legacy migrations go through omnia:run-legacy-typeorm-migrations)"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  "npx" \
  "Migration job must not run npx (the v2.58 image deletes it)"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  "activeDeadlineSeconds: 3600" \
  "Migration job deadline must fit routine multi-command upgrades"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  'include "twenty.storageEnv"' \
  "Migration job needs the S3 storage env: upgrade commands read and write file storage"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  "with .Values.server.extraEnv" \
  "Migration job must get the server extraEnv"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/job-migration.yaml" \
  'serviceAccountName: {{ include "twenty.serviceAccountName" . }}' \
  "Migration job must run as the Pod Identity service account like the server"

echo ""
echo "--- Helm rollout, probes and scheduling ---"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-server.yaml" \
  "npx" \
  "Server pods must not run npx (the v2.58 image deletes it, so pods would never start)"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-server.yaml" \
  "run-migrations" \
  "Server pods must not run a migration init container; the pre-upgrade job owns upgrades"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-server.yaml" \
  "toYaml .Values.server.strategy" \
  "Server deployment must honour the server.strategy knob (omnia-values pins maxUnavailable 0)"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-server.yaml" \
  "with .Values.server.minReadySeconds" \
  "Server deployment must honour the server.minReadySeconds knob"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-server.yaml" \
  "with .Values.server.topologySpreadConstraints" \
  "Server deployment must honour the server.topologySpreadConstraints knob"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-worker.yaml" \
  "toYaml .Values.worker.strategy" \
  "Worker deployment must honour the worker.strategy knob (omnia-values sets Recreate)"
check_file_exists \
  "packages/twenty-docker/helm/twenty/templates/pdb-server.yaml" \
  "Server PodDisruptionBudget keeps one pod up through node drains"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/pdb-server.yaml" \
  "minAvailable: 1" \
  "Server PDB must keep at least one pod available"
check_file_exists \
  "packages/twenty-docker/helm/twenty/tests/omnia_rollout_test.yaml" \
  "helm unittest coverage for the Omnia rollout knobs, migration job and PDB"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-redis-internal.yaml" \
  "with .Values.redisInternal.tolerations" \
  "In-cluster Redis must take its tolerations from redisInternal.tolerations"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-redis-internal.yaml" \
  "redis-cli" \
  "In-cluster Redis must keep its redis-cli ping readiness and liveness probes"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-redis-internal.yaml" \
  "maxUnavailable: 0" \
  "In-cluster Redis rollouts must keep the old pod until the new one is ready"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/pvc-redis-internal.yaml" \
  "helm.sh/resource-policy: keep" \
  "Redis PVC must survive helm uninstall and rollback"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-db-internal.yaml" \
  "with .Values.tolerations" \
  "In-cluster Postgres keeps the root tolerations key"
check_file_contains \
  "packages/twenty-docker/helm/twenty/values.yaml" \
  "OMNIA-CUSTOM: rollout knobs. Empty strategy keeps upstream's (Recreate wit" \
  "Omnia hunk (G2): rollout knobs. Empty strategy keeps upstream's (Recreate with"

echo ""
echo "--- omnia-values.yaml (Pod Identity, env, rollout) ---"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "name: twenty-bedrock" \
  "omnia-values serviceAccount.name must be the twenty-bedrock Pod Identity service account"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "create: false" \
  "The twenty-bedrock service account and its Pod Identity Association are managed outside the chart"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "serviceAccountName: twenty-bedrock" \
  "Use the upstream serviceAccount values; server/worker serviceAccountName keys are no longer rendered"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "failureThreshold: 60" \
  "Server startup probe keeps the 10-minute startup window"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "maxUnavailable: 0" \
  "Server rollouts must never take a serving pod down before its replacement is ready"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "minReadySeconds: 15" \
  "Server pods must stay ready 15s before the rollout continues"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "topologyKey: kubernetes.io/hostname" \
  "Server replicas must spread across nodes"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "type: Recreate" \
  "Worker must roll with Recreate so two versions never consume the queues"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "environment: production" \
  "Workloads must schedule onto the tainted production node pool"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "extraEnv: *omniaExtraEnv" \
  "Worker must share the server env list (rate limits, AI tiers, credentials allowlist)"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "DISABLE_DB_MIGRATIONS" \
  "Server pods must skip entrypoint upgrades; the pre-upgrade job owns them (no concurrent replica upgrades)"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "DISABLE_CRON_JOBS_REGISTRATION" \
  "Cron registration must stay on the server entrypoint"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "API_RATE_LIMITING_SHORT_LIMIT" \
  "Omnia API scripts need the raised short-window API limit"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "API_RATE_LIMITING_LONG_LIMIT" \
  "Omnia API scripts need the raised long-window API limit"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "APPLICATION_API_RATE_LIMITING_LIMIT" \
  "Internal apps need the raised per-application API limit"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "APPLICATION_JOB_ENQUEUE_RATE_LIMITING_LIMIT" \
  "Internal apps need the raised job-enqueue limit"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "WEBHOOK_CALL_RATE_LIMITING_LIMIT" \
  "Webhook calls above the upstream default (60/min) are dropped, not queued; omniaagent.com needs the raised limit"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "AI_MODELS_DEFAULT_SMART" \
  "AI tiers must be pinned explicitly (upstream defaults list no Bedrock ids)"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "bedrock/us.anthropic." \
  "AI tiers must resolve to the BAA-covered Bedrock catalog entry"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "TELEMETRY_ENABLED" \
  "Upstream telemetry (sign-up names and emails to twenty-telemetry.com) must stay off"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "SERVER_INTERNAL_URL" \
  "Logic functions must call the server in-cluster"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS" \
  "Pod Identity credentials reach only allowlisted app registrations (empty is fail-closed)"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "DEEPGRAM_API_KEY" \
  "Deepgram key lives in the compliance-qa registration variable; v2.58 does not pass pod env to logic functions"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "configuration-snippet" \
  "Ingress must not set cache headers; FrontendModule owns /assets caching"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "WORKER_EXCLUDED_QUEUES" \
  "Workers must consume import, ingestion and reconciliation queues"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "IS_BILLING_ENABLED" \
  "Billing must stay off (billing:sync-entitlements deletes every RLS predicate group)"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "ENTERPRISE_KEY" \
  "No enterprise key (the code-level unlock avoids outbound enterprise calls)"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "AI_PROVIDERS" \
  "Bedrock stays a built-in catalog provider; an AI_PROVIDERS value could shadow it"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "EXCEPTION_HANDLER_DRIVER" \
  "Exception handler stays on the console driver (no PHI to third-party error trackers)"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  'ACCESS_TOKEN_EXPIRES_IN: "30m"' \
  "User access JWTs are bearer tokens no sign-out revokes: keep them short (the chart default is 7d)"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "S3 QA artifacts" \
  "twenty-bedrock service account comment must document Compliance QA S3 artifact runtime access"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "Amazon Translate" \
  "twenty-bedrock service account comment must document Compliance QA translation runtime access"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "max-old-space-size" \
  "Server and worker must get NODE_OPTIONS heap headroom (shared extraEnv)"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "REFRESH_TOKEN_EXPIRES_IN" \
  "HIPAA: sign-in still returns a refresh token to page JavaScript that sign-out never revokes; keep it short-lived (5m) in the shared extraEnv"
check_file_contains \
  "CUSTOMIZATIONS.md" \
  "translate:TranslateText" \
  "AWS runtime customization docs must include Compliance QA Translate permissions"

echo ""
echo "--- Deploy workflow and local deploy script ---"
check_file_contains \
  ".github/workflows/deploy-eks.yaml" \
  "target: twenty" \
  "Without a target Docker builds the all-in-one twenty-app-dev stage"
check_file_contains \
  ".github/workflows/deploy-eks.yaml" \
  "twenty-current-version.constant.ts" \
  "APP_VERSION build arg must be derived from TWENTY_CURRENT_VERSION"
check_file_not_contains \
  ".github/workflows/deploy-eks.yaml" \
  "APP_VERSION=2." \
  "APP_VERSION must not be hardcoded"
check_file_contains \
  ".github/workflows/deploy-eks.yaml" \
  "set-string server.image.tag" \
  "Server image tag must be passed as a string (all-digit short SHAs)"
check_file_contains \
  ".github/workflows/deploy-eks.yaml" \
  "set-string worker.image.tag" \
  "Worker image tag must be passed as a string (all-digit short SHAs)"
check_file_contains \
  ".github/workflows/deploy-eks.yaml" \
  "cancel-in-progress: false" \
  "A new push must not cancel a deploy mid-upgrade"
check_file_contains \
  ".github/workflows/deploy-eks.yaml" \
  "timeout 65m" \
  "Helm timeout must cover the migration job deadline (3600s) plus the rollout"
check_file_not_contains \
  ".github/workflows/deploy-eks.yaml" \
  "SENTRY_AUTH_TOKEN" \
  "Sentry build args were removed (no Sentry for HIPAA)"
check_file_contains \
  "scripts/deploy-local.sh" \
  "target twenty" \
  "Local deploys must build the twenty stage, not twenty-app-dev"
check_file_contains \
  "scripts/deploy-local.sh" \
  "twenty-current-version.constant.ts" \
  "Local deploys must pass the derived APP_VERSION"
check_file_contains \
  "scripts/deploy-local.sh" \
  'set-string "server.image.tag' \
  "Local deploys must pass image tags as strings"
check_file_contains \
  "scripts/deploy-local.sh" \
  "git rev-parse HEAD | cut -c1-7" \
  "Local tags must equal the 7-character CI sha tag (--short=7 grows on ambiguous prefixes)"
check_file_not_contains \
  "scripts/deploy-local.sh" \
  ":latest" \
  "Local deploys must never push or deploy the latest tag"
check_file_not_contains \
  "scripts/deploy-local.sh" \
  "REACT_APP_SERVER_BASE_URL" \
  "The v2.58 Dockerfile has no REACT_APP_SERVER_BASE_URL build arg"
check_file_not_exists \
  "packages/twenty-docker/twenty/Dockerfile.ci" \
  "Unused Node 24 CI Dockerfile stays deleted"
check_file_not_contains \
  ".github/workflows/deploy-eks.yaml" \
  "  --atomic" \
  "No --atomic: once the pre-upgrade job has upgraded the database, a rollback runs the previous image on the new schema"
check_file_not_contains \
  ".github/workflows/deploy-eks.yaml" \
  "upgrade --install" \
  "CI must not install a release: an install skips the pre-upgrade migration job"
check_file_not_contains \
  ".github/workflows/deploy-eks.yaml" \
  "helm rollback" \
  "CI must never roll back on its own (previous image on an upgraded schema, or a race with a running migration job)"
check_file_not_contains \
  ".github/workflows/deploy-eks.yaml" \
  "tag=latest" \
  "deploy_only deploys the commit's SHA build; latest with pullPolicy IfNotPresent mixes builds across nodes"
check_file_contains \
  ".github/workflows/deploy-eks.yaml" \
  "aws ecr batch-get-image" \
  "deploy_only must confirm the commit's image exists (the deploy role has ecr:BatchGetImage, not DescribeImages)"
check_file_not_contains \
  "scripts/deploy-local.sh" \
  "  --atomic" \
  "Local deploys fix forward too (no --atomic)"
check_file_not_contains \
  "scripts/deploy-local.sh" \
  "upgrade --install" \
  "Local deploys must not install a release (an install skips the migration job)"

echo ""
echo "--- Local prod restore (scripts/replicate-db-to-local.sh) ---"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  "run_local_server_command upgrade" \
  "Prod-to-local restore must run the cursor-ordered upgrade"
check_file_not_contains \
  "scripts/replicate-db-to-local.sh" \
  "twenty-server:database:migrate" \
  "Prod-to-local restore must not run database:migrate (run-instance-commands --force skips slow and workspace commands)"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  "run_local_server_command secret-encryption:rotate" \
  "Prod-to-local restore re-encrypts only DB-backed sensitive config (sensitive-config-storage) to the local key"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  'export FALLBACK_ENCRYPTION_KEY="$PROD_ENCRYPTION_KEY"' \
  "Rotation and upgrade must decrypt prod-key envelopes through FALLBACK_ENCRYPTION_KEY"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  "encryptedValue.startsWith('enc:')" \
  "Legacy AES-CTR re-encryption must skip enc:v2 envelopes"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  "run_local_server_command cache:flush" \
  "Prod-to-local restore must flush cached Workspace rows and config after rewrites"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  'UPDATE core."ingestionPipeline" SET "isEnabled" = FALSE WHERE "isEnabled";' \
  "Prod-to-local restore must disable the copy's pull pipelines (they call Convoso with prod credentials)"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  'UPDATE core.webhook SET "deletedAt" = NOW() WHERE "deletedAt" IS NULL;' \
  "Prod-to-local restore must soft-delete the copy's webhooks (they post to omniaagent.com)"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  "AND key IN ('EMAIL_SMTP_PASSWORD', 'SENTRY_DSN', 'SENTRY_FRONT_DSN');" \
  "Prod-to-local restore must drop the copy's SMTP password and Sentry DSNs"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  'export PG_DATABASE_URL="$LOCAL_DATABASE_URL"' \
  "Local server commands must target the restored database"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  'assert_server_env_file_agrees "${pinned_keys[@]}" || exit 1' \
  "Server commands must stop when packages/twenty-server/.env would override the restored DB, Redis or keys (core.datasource.ts reloads it with override: true)"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  'fileValues[key] !== process.env[key]' \
  "The .env guard must compare dotenv-parsed values with the exported ones"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  "cut -d'=' -f2- || true" \
  "A key missing from .env must not abort the restore under errexit"
check_file_not_contains \
  "scripts/replicate-db-to-local.sh" \
  '"revokedAt" = NULL' \
  "Restores must not un-revoke app tokens (breaks the v2.58 unique index on pending 2FA recovery codes)"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  'DELETE FROM core."signingKey";' \
  "Restores must delete prod's JWT signing keys, or tokens signed on the local copy verify on prod"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  "secret-encryption:rotate --site=sensitive-config-storage" \
  "Restores rotate instance config only; every site would make prod OAuth tokens, TOTP seeds and app secrets usable locally"
check_file_contains \
  "scripts/replicate-db-to-local.sh" \
  '"$LOCAL_ENCRYPTION_KEY" == "replace_me_with_a_random_string"' \
  "Restores must not re-encrypt prod secrets under the public .env.example key"

echo ""
echo "--- Omnia upgrade commands: registration and sequence (C7, C11) ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/workspace-command-provider.module.ts" \
  "OmniaUpgradeVersionCommandModule," \
  "OmniaUpgradeVersionCommandModule must stay in the WorkspaceCommandProviderModule imports array, not just its import line"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaUpgradeVersionCommandModule provides every Omnia upgrade command (§4.0.3)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaFinalizeRolePermissionFlagCutoverCatchUpFastInstanceCommand," \
  "I1 must stay registered: prod's upgrade cursor skips upstream 2.7 Finalize, so only I1 drops rolePermissionFlag.flag (B3)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaSetRecordingFieldDisplayAsAudioCommand," \
  "W3 must stay registered so the call recording field renders as the inline audio player"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaConsolidateStandardDeleteCommandMenuItemsCommand," \
  "W4 (server-metadata-core) must stay registered in the Omnia upgrade module"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaTranslateScopedRowLevelPermissionsCommand," \
  "W1 must stay registered: without it upstream's scope-blind RLS backfill (1794337540466) runs alone on prod's scoped predicates"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaVerifyPermissionsUpgradeCommand," \
  "W9 must be provided, or upgrade never runs the fail-closed RLS and PHI-grant gate (runbook P1 step 4)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaPermissionsVerificationService," \
  "W9 injects OmniaPermissionsVerificationService; without a provider every API, worker and CLI boot fails"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaBackfillCustomObjectSearchFieldsCommand," \
  "W2 must stay registered: a database upgraded without it skips it for good and custom objects stay searchable by name only"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaMigrateOneToManyViewFiltersCommand," \
  "W5 must stay registered so saved one-to-many view filters are migrated on upgrade"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand," \
  "I2 must stay registered: ImportJobEntity.userWorkspaceId is @WasIntroducedInUpgrade on it, so the server refuses to boot (unknown-step-name) without it"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaPurgeLegacyExportFilesCommand," \
  "W8 must stay registered so the legacy export CSVs (PHI) are purged on upgrade"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaSyncDashboardAudienceCommand," \
  "W6 must stay registered so every gated role's dashboard audience rule is normalized before W9"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaReconciliationObjectLockdownCommand," \
  "W7 must stay registered so every non-admin role is locked out of the reconciliation objects (PHI) before W9"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "DashboardAudienceModule," \
  "OmniaUpgradeVersionCommandModule must import DashboardAudienceModule so W6 resolves DashboardAudienceRoleSyncService"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "ReconciliationObjectLockdownModule," \
  "OmniaUpgradeVersionCommandModule must import ReconciliationObjectLockdownModule so W7 resolves its service"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command.spec.ts" \
  "Omnia test from the v2.58 merge (G2): 2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command.spec.ts"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-workspace-command-1794500005000-omnia-sync-dashboard-audience.command.spec.ts" \
  "Omnia test from the v2.58 merge (G2): 2-58-workspace-command-1794500005000-omnia-sync-dashboard-audience.command.spec.ts"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-workspace-command-1794500006000-omnia-reconciliation-object-lockdown.command.spec.ts" \
  "Omnia test from the v2.58 merge (G2): 2-58-workspace-command-1794500006000-omnia-reconciliation-object-lockdown.command.spec.ts"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-8-instance-command-fast-1798100000000-omnia-finalize-role-permission-flag-cutover-catch-up.spec.ts" \
  "Omnia test from the v2.58 merge (G2): 2-8-instance-command-fast-1798100000000-omnia-finalize-role-permission-flag-cutover-catch-up.spec.ts"
# Every Omnia upgrade command file must be provided by the module, or `upgrade` silently never runs it (W9 is the RLS gate).
for omnia_upgrade_command_file in packages/twenty-server/src/database/commands/upgrade-version-command/omnia/[0-9]*-*.ts; do
  [ -f "$omnia_upgrade_command_file" ] || continue
  omnia_upgrade_command_class=$(sed -n '/^export class /{s/^export class \([A-Za-z0-9_]*\).*/\1/p;q;}' "$omnia_upgrade_command_file")
  if [ -z "$omnia_upgrade_command_class" ]; then
    echo -e "${RED}MISSING${NC} $omnia_upgrade_command_file — no exported upgrade command class"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  check_file_contains \
    "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
    "${omnia_upgrade_command_class}," \
    "Omnia upgrade command ${omnia_upgrade_command_class} must be provided by OmniaUpgradeVersionCommandModule, or upgrade never runs it"
done

echo ""
echo "--- Omnia I1: rolePermissionFlag cutover catch-up ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-8-instance-command-fast-1798100000000-omnia-finalize-role-permission-flag-cutover-catch-up.ts" \
  "I1: prod's cursor is past upstream 2.7 Finalize; this 2.8.0 fast command finishes the rolePermissionFlag cutover"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-8-instance-command-fast-1798100000000-omnia-finalize-role-permission-flag-cutover-catch-up.ts" \
  "@RegisteredInstanceCommand('2.8.0', 1798100000000)" \
  "I1 must keep 2.8.0/1798100000000 so it sorts before the first upstream 2.8 fast command (1798200000000)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-8-instance-command-fast-1798100000000-omnia-finalize-role-permission-flag-cutover-catch-up.ts" \
  "finalizeRolePermissionFlagCutoverIfNeeded(queryRunner)" \
  "I1 must run the guarded cutover helper shared with 2.7 Finalize"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util.ts" \
  "Guarded rolePermissionFlag cutover shared by upstream 2.7 Finalize and Omnia I1"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util.ts" \
  "information_schema.columns" \
  "Cutover helper must be a no-op once rolePermissionFlag.flag is gone (fresh installs, second of Finalize/I1)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util.ts" \
  'permissionFlag."key" = rolePermissionFlag."flag"' \
  "Cutover helper must relink NULL permissionFlagId rows from flag before SET NOT NULL (prod has unlinked rows)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util.ts" \
  'DROP COLUMN IF EXISTS "flag"' \
  "Cutover helper must drop rolePermissionFlag.flag idempotently"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-7/2-7-instance-command-fast-1779600000000-finalize-role-permission-flag-cutover.ts" \
  "OMNIA-CUSTOM: self-heal rows" \
  "Upstream 2.7 Finalize keeps the Omnia self-heal (G7 exception)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-7/2-7-instance-command-fast-1779600000000-finalize-role-permission-flag-cutover.ts" \
  "finalizeRolePermissionFlagCutoverIfNeeded(queryRunner)" \
  "2.7 Finalize must delegate to the guarded helper so Finalize and I1 are safe in either order"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-7/utils/finalize-role-permission-flag-cutover-if-needed.util.ts" \
  'DELETE FROM core."upgradeMigration" WHERE name LIKE' \
  "The orphan-flag failure must say how to clear its failed per-workspace rows; the workspace barrier refuses a plain rerun"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-7/utils/__tests__/finalize-role-permission-flag-cutover-if-needed.util.spec.ts" \
  "Omnia test from the v2.58 merge (G2): finalize-role-permission-flag-cutover-if-needed.util.spec.ts"

echo ""
echo "--- Omnia W3: call recording displayAs audio ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command.ts" \
  "W3 sets settings.displayAs='audio' on the call recording LINKS field (AudioLink renders only then)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1794500002000)" \
  "W3 must keep its 2.58.0 registration and timestamp (§4.0.3)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command.ts" \
  "upgrade:2-58:omnia-set-recording-field-display-as-audio" \
  "W3 must keep its command name"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command.ts" \
  "'{\"displayAs\": \"audio\"}'::jsonb" \
  "W3 must keep the idempotent jsonb merge that sets displayAs=audio"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-18/2-18-upgrade-version-command.module.ts" \
  "SetRecordingFieldDisplayAsAudioCommand" \
  "2-18 module stays upstream; W3 registers only through OmniaUpgradeVersionCommandModule"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-18/2-18-upgrade-version-command.module.ts" \
  "BackfillCustomObjectSearchFieldsCommand" \
  "2-18 module stays upstream; the search backfill is W2 in OmniaUpgradeVersionCommandModule"
check_file_not_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-18/2-18-workspace-command-1810000006000-set-recording-field-display-as-audio.command.ts" \
  "The 2-18 set-recording command moved to omnia/ as W3; a second copy would set the field twice under two names"

echo ""
echo "--- Upgrade-command literal compat (G7 literal exception, C5) ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-10/2-10-workspace-command-1799000055000-sync-call-recording-standard-objects.command.ts" \
  "requiredCondition: null" \
  "2-10 legacy FlatFieldMetadata literal must carry Omnia's requiredCondition column"
check_file_contains \
  "packages/twenty-server/src/utils/__test__/get-field-metadata-entity.mock.ts" \
  "requiredCondition: null" \
  "Field metadata entity mock must carry Omnia's requiredCondition column (C5)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-23/utils/build-legacy-workflow-core-workflow-id-flat-field-metadata.util.ts" \
  "OMNIA-CUSTOM: FlatFieldMetadata carries the requiredCondition column (cont" \
  "Omnia hunk (G2): FlatFieldMetadata carries the requiredCondition column (contract C5)"

echo ""
echo "--- Search surface default: integration coverage (Q14, U46) ---"
check_file_exists \
  "packages/twenty-server/test/integration/metadata/suites/field-metadata/create-one-field-metadata-search-vector-side-effect.integration-spec.ts" \
  "Integration coverage for the Omnia create-time isSearchable default on custom objects (Q14)"

echo ""
echo "--- Endpoint permission snapshot (Omnia resolvers) ---"
check_file_contains \
  "packages/twenty-server/test/integration/endpoint-permissions/__snapshots__/endpoint-permission-declarations.integration-spec.ts.snap" \
  'IngestionPipelineResolver.triggerIngestionPull {"acceptedAuthPrincipals":{"apiKey":true,"application":{"withAgent":false,"withUser":true,"withoutUser":true},"oauthClient":{"withUser":true,"withoutUser":true},"userSession":{"impersonated":true,"playground":true,"standard":true,"workspaceAgnostic":false}},"applicationTarget":null,"requiredFeatureFlags":[],"requiredPermissionFlags":["API_KEYS_AND_WEBHOOKS"]}' \
  "The 13 ingestion resolver endpoints must stay in the endpoint-permission snapshot, gated by API_KEYS_AND_WEBHOOKS; after an upstream merge re-add them or regenerate with -u"
check_file_contains \
  "packages/twenty-server/test/integration/endpoint-permissions/__snapshots__/endpoint-permission-declarations.integration-spec.ts.snap" \
  'IngestionPipelineWebhookController.handlePush {"acceptedAuthPrincipals":null,"applicationTarget":null,"requiredFeatureFlags":[],"requiredPermissionFlags":[]}' \
  "The ingestion push webhook is public by design (the handler checks the pipeline's shared secret); keep its snapshot line"
check_file_contains \
  "packages/twenty-server/test/integration/endpoint-permissions/__snapshots__/endpoint-permission-declarations.integration-spec.ts.snap" \
  'ReconciliationResolver.batchApplyReviewItems {"acceptedAuthPrincipals":{"apiKey":false,"application":{"withAgent":false,"withUser":false,"withoutUser":false},"oauthClient":{"withUser":false,"withoutUser":false},"userSession":{"impersonated":true,"playground":false,"standard":true,"workspaceAgnostic":false}},"applicationTarget":null,"requiredFeatureFlags":[],"requiredPermissionFlags":["RECONCILIATION"]}' \
  "Endpoint permission snapshot must keep the 5 ReconciliationResolver operations at user sessions only plus the RECONCILIATION flag"
check_file_contains \
  "packages/twenty-server/test/integration/endpoint-permissions/__snapshots__/endpoint-permission-declarations.integration-spec.ts.snap" \
  'ReconciliationResolver.validateCarrierConfig {"acceptedAuthPrincipals":{"apiKey":false,' \
  "Endpoint permission snapshot must list every ReconciliationResolver operation (validateCarrierConfig included)"
check_file_contains \
  "packages/twenty-server/test/integration/endpoint-permissions/__snapshots__/endpoint-permission-declarations.integration-spec.ts.snap" \
  'OmniaSiblingSessionResolver.refreshOmniaSiblingSession {"acceptedAuthPrincipals":{"apiKey":false,"application":{"withAgent":false,"withUser":false,"withoutUser":false},"oauthClient":{"withUser":false,"withoutUser":false},"userSession":{"impersonated":true,"playground":false,"standard":true,"workspaceAgnostic":false}},"applicationTarget":null,"requiredFeatureFlags":[],"requiredPermissionFlags":[]}' \
  "refreshOmniaSiblingSession mints a bearer token: user sessions only (standard and impersonated), never API keys, OAuth clients, applications or playground; after an upstream merge re-add the line or regenerate with -u and review"

echo ""
echo "--- Ops scripts ---"
check_file_exists \
  "scripts/backfill-calls.sh" \
  "Parallel Convoso call backfill through the ingestion pipeline"
check_file_contains \
  "scripts/backfill-calls.sh" \
  'select($ids | index($logId))' \
  "The call backfill polls the log each triggerIngestionPull returned (the pull job completes it via data.logId); matching any new pull log counts live-cadence runs as finished chunks"
check_file_not_contains \
  "scripts/backfill-calls.sh" \
  "known_log_ids" \
  "No pre-trigger log snapshot: the trigger's own log is the one to poll"
check_file_exists \
  "scripts/backfill-calls.py" \
  "Sequential Convoso call backfill (day by day) through the ingestion pipeline"
check_file_exists \
  "scripts/export-convoso-recordings.mjs" \
  "Convoso recording exporter must exist until the telephony cutover completes (recordings are CMS 10-yr retention artifacts; Convoso purges audio on a ~155-day rolling window)"

echo ""
echo "--- Upstream upgrade commands: 2-6 drift tolerance (KEEP) ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-6/2-6-instance-command-fast-1778235340020-rename-permission-flag-to-role-permission-flag.ts" \
  "OMNIA-CUSTOM: production snapshots may already be missing some legacy" \
  "Permission-flag rename upgrade must tolerate missing legacy FK/index names from production schema drift"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-6/2-6-instance-command-fast-1778235340020-rename-permission-flag-to-role-permission-flag.ts" \
  'DROP CONSTRAINT IF EXISTS "FK_b26a9d39a88d0e72373c677c6c5"' \
  "Permission-flag rename upgrade must not fail when the old application FK is already absent"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-6/2-6-instance-command-fast-1778235340020-rename-permission-flag-to-role-permission-flag.ts" \
  'DROP INDEX IF EXISTS "core"."IDX_da8ffd3c24b4a819430a861067"' \
  "Permission-flag rename upgrade must not fail when the old workspace/universalIdentifier index is already absent"

# ======================================================================
# Permissions: row-level rules, hop predicates, role and object settings, W1/W9, timeline RLS
# ======================================================================
echo ""
echo "=== Permissions: row-level rules, hop predicates, role and object settings, W1/W9, timeline RLS ==="

echo ""
echo "--- RLS Engine: v2.58 swap guards (v1 ORM and Omnia RLS plumbing removed) ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/permissions/utils/is-record-matching-filter.util.ts" \
  "OMNIA-CUSTOM" \
  "In-memory RLS matcher must stay upstream: the old Omnia ONE_TO_MANY array branch returned true for every relation filter except NULL/NOT_NULL (fail-open)"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/rls/utils/build-row-level-permission-record-filter.util.ts" \
  "UNSATISFIABLE_RECORD_FILTER" \
  "Deny-by-default is upstream: an unresolvable member value, a disabled hop or no granting rule must match nothing"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/repository/workspace-repository.ts" \
  "assertCreatedRecordsMatchRowLevelPermissionsOrThrow" \
  "Creates through permission-checked repositories must be checked against RLS (replaces the Omnia v1 check, which was never awaited); this stops an agent creating a policy for another agent"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/repository/workspace-repository.ts" \
  "assertUpdatesKeepRecordAccessOrThrow" \
  "Updates must keep the record inside the caller's update grant, so reassigning policy.agent away is denied"
check_file_not_contains \
  "packages/twenty-server/src/engine/twenty-orm/exceptions/twenty-orm.exception.ts" \
  "IMPORT_PARTIAL_SUCCESS" \
  "IMPORT_PARTIAL_SUCCESS is dropped (R-CONNECT): nothing threw it, and its connect path wrote raw SQL that bypassed permissions"
check_file_not_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/twenty-orm-graphql-api-exception-handler.util.ts" \
  "IMPORT_PARTIAL_SUCCESS" \
  "ORM GraphQL exception handler must stay upstream, with no IMPORT_PARTIAL_SUCCESS branch (R-CONNECT)"
check_file_not_contains \
  "packages/twenty-server/src/engine/twenty-orm/field-operations/relation-nested-queries/relation-nested-queries.ts" \
  "createMissingConnectRecords" \
  "Relation connect must not auto-create related records with raw SQL that bypasses permissions, RLS and events (R-CONNECT)"
check_file_not_contains \
  "packages/twenty-server/src/engine/twenty-orm/entity-manager/types/relation-connect-query-config.type.ts" \
  "fullRecordToConnectConditionByEntityIndex" \
  "Connect config must stay upstream: the Omnia fallback-match condition belonged to the dropped upsert connect tolerance (R-CONNECT)"
check_file_not_contains \
  "packages/twenty-server/src/engine/twenty-orm/types/execute-in-workspace-context-options.type.ts" \
  "eventEmissionPolicy" \
  "Omnia event emission policy is dropped; skip events with upstream shouldSkipEventEmission instead (this file merged cleanly while still carrying the option)"
check_file_not_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/format-twenty-orm-event-to-database-batch-event.util.ts" \
  "EventOrigin" \
  "Omnia event origin plumbing is dropped (R-ORIGIN); this file merged cleanly while still carrying it"

echo ""
echo "--- RECONCILIATION permission flag (C8) ---"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/setting-permissions.service.ts" \
  "Object.values(PermissionFlagType)" \
  "Default permission flags derive from the enum, so RECONCILIATION is denied by default (C8; replaces the deleted permissions.service.ts entry)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation.resolver.ts" \
  "NoPermissionGuard" \
  "Reconciliation resolver must never regress to NoPermissionGuard (any member could trigger CRM writes)"
check_file_contains \
  "packages/twenty-shared/src/constants/PermissionFlagType.ts" \
  "RECONCILIATION = 'RECONCILIATION'" \
  "PermissionFlagType must include the OMNIA RECONCILIATION settings flag"
check_file_contains \
  "packages/twenty-shared/src/constants/SystemPermissionFlag.ts" \
  "RECONCILIATION:" \
  "SystemPermissionFlag must map the RECONCILIATION flag to its universal identifier"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/permission-flag/constants/standard-permission-flag-definitions.constant.ts" \
  "PermissionFlagType.RECONCILIATION" \
  "Standard permission flag definitions must include RECONCILIATION metadata (exhaustive Record over the enum)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/permission-flag/constants/__tests__/standard-permission-flag-definitions.constant.spec.ts" \
  "OMNIA-CUSTOM: the 2-6 and 2-53 backfills seed this flag from the definitio" \
  "Omnia hunk (G2): the 2-6 and 2-53 backfills seed this flag from the definitions"

echo ""
echo "--- RLS Metadata: v2.58 rules (no scope) + parent-group ownership guard ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/utils/validate-row-level-permission-rule-ownership.util.ts" \
  "OMNIA-CUSTOM" \
  "RLS rule ownership util must keep the Omnia parent-group guard (R-RLS-PARENT)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/utils/validate-row-level-permission-rule-ownership.util.ts" \
  "Parent predicate group is not a group of this role and object" \
  "A group whose parent is another role's or object's group, deleted or unknown becomes its own rule that compiles to {} and matches every record (fail-open)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/utils/validate-row-level-permission-rule-ownership.util.ts" \
  "cannot form a parent cycle" \
  "Predicate groups whose parents form a cycle have no root group, so their rule compiles to {} and matches every record (fail-open)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/utils/__tests__/validate-row-level-permission-rule-ownership.util.spec.ts" \
  "describe('parent predicate group'" \
  "Parent-group guard spec must survive upstream merges of this spec file"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/row-level-permission-predicate.dto.ts" \
  "scope" \
  "RLS predicate DTO must not expose scope: v2.58 grants live on rowLevelPermissionRule (C1, G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/row-level-permission-predicate-group.dto.ts" \
  "scope" \
  "RLS predicate-group DTO must not expose scope (C1, G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/inputs/upsert-row-level-permission-predicates.input.ts" \
  "scope" \
  "Upsert input must not accept scope: it would be stored but never enforced (G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-row-level-permission-predicate/utils/from-create-row-level-permission-predicate-input-to-flat-row-level-permission-predicate.util.ts" \
  "RowLevelPermissionPredicateScope" \
  "Flat predicate create converter carries no scope (G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-row-level-permission-predicate/utils/from-create-row-level-permission-predicate-group-input-to-flat-row-level-permission-predicate-group.util.ts" \
  "RowLevelPermissionPredicateScope" \
  "Flat predicate-group create converter carries no scope (G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-row-level-permission-predicate/utils/from-update-row-level-permission-predicate-input-to-flat-row-level-permission-predicate.util.ts" \
  "RowLevelPermissionPredicateScope" \
  "Flat predicate update converter carries no scope (G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-row-level-permission-predicate/utils/from-update-row-level-permission-predicate-group-input-to-flat-row-level-permission-predicate-group.util.ts" \
  "RowLevelPermissionPredicateScope" \
  "Flat predicate-group update converter carries no scope (G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/services/row-level-permission-predicate.service.ts" \
  "validateScopedPredicateTree" \
  "Mixed-scope validation is obsolete in v2.58; tree integrity is the ownership util's parent guard"
check_file_not_contains \
  "packages/twenty-front/src/generated-metadata/graphql.ts" \
  "RowLevelPermissionPredicateScope" \
  "Generated metadata must come from a server without RLS scope (wave 3 gate; G8)"

echo ""
echo "--- App manifests: Omnia role and object-permission fields (import and export) ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-row-level-permission-predicate-manifest-to-universal-flat-row-level-permission-predicate.util.ts" \
  "RowLevelPermissionPredicateScope" \
  "Manifest predicate converter must not hardcode scope (G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-row-level-permission-predicate-group-manifest-to-universal-flat-row-level-permission-predicate-group.util.ts" \
  "RowLevelPermissionPredicateScope" \
  "Manifest predicate-group converter must not hardcode scope (G8)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-role-manifest-to-universal-flat-role.util.ts" \
  "showAllObjectsInSidebar: roleManifest.showAllObjectsInSidebar ?? true" \
  "Role manifest import must read the role-wide sidebar default"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-role-manifest-to-universal-flat-role.util.ts" \
  "editWindowMinutes: roleManifest.editWindowMinutes ?? null" \
  "Role manifest import must read the role edit window"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-flat-role-to-role-manifest.util.ts" \
  "showAllObjectsInSidebar: flatRole.showAllObjectsInSidebar" \
  "Role manifest export must emit the role-wide sidebar default"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-flat-role-to-role-manifest.util.ts" \
  "editWindowMinutes: flatRole.editWindowMinutes" \
  "Role manifest export must emit the role edit window when set"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-flat-object-permission-to-object-permission-manifest.util.ts" \
  "showInSidebar: flatObjectPermission.showInSidebar" \
  "Object-permission manifest export must emit the sidebar override when set"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-flat-object-permission-to-object-permission-manifest.util.ts" \
  "editWindowMinutes: flatObjectPermission.editWindowMinutes" \
  "Object-permission manifest export must emit the edit window override when set"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-object-permission-manifest-to-universal-flat-object-permission.util.ts" \
  "showInSidebar: objectPermissionManifest.showInSidebar ?? null" \
  "App manifest object-permission conversion must keep sidebar visibility"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-object-permission-manifest-to-universal-flat-object-permission.util.ts" \
  "editWindowMinutes: objectPermissionManifest.editWindowMinutes ?? null" \
  "App manifest object-permission conversion must keep edit window overrides"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.service.ts" \
  "effectiveShowInSidebar" \
  "Object-permission upsert must preserve sidebar visibility"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.service.ts" \
  "effectiveEditWindowMinutes" \
  "Object-permission upsert must preserve edit window overrides"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/utils/from-flat-object-permission-to-object-permission-dto.util.ts" \
  "showInSidebar: flatObjectPermission.showInSidebar" \
  "ObjectPermission DTO conversion must return sidebar visibility"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/utils/from-flat-object-permission-to-object-permission-dto.util.ts" \
  "editWindowMinutes: flatObjectPermission.editWindowMinutes" \
  "ObjectPermission DTO conversion must return edit window overrides"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/__tests__/from-flat-object-permission-to-object-permission-manifest.util.spec.ts" \
  "OMNIA-CUSTOM: sidebar visibility and edit window round-trip too (C3, C4)" \
  "Omnia hunk (G2): sidebar visibility and edit window round-trip too (C3, C4)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/__tests__/from-flat-role-to-role-manifest.util.spec.ts" \
  "OMNIA-CUSTOM: the sidebar default and edit window round-trip too (C3, C4)" \
  "Omnia hunk (G2): the sidebar default and edit window round-trip too (C3, C4)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/utils/__tests__/export-covers-compared-properties.spec.ts" \
  "OMNIA-CUSTOM: exported only when set, so the fixture sets them (C3, C4)" \
  "Omnia hunk (G2): exported only when set, so the fixture sets them (C3, C4)"

echo ""
echo "--- Role / ObjectPermission metadata: Omnia sidebar + edit window columns (C3, C4) ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/role.entity.ts" \
  "showAllObjectsInSidebar: boolean;" \
  "Role entity must keep the showAllObjectsInSidebar column (legacy migration 1771500000000, no upgrade decorator)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/role.entity.ts" \
  "editWindowMinutes: number | null;" \
  "Role entity must keep the nullable editWindowMinutes column (legacy migration 1772591146793, no upgrade decorator)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.entity.ts" \
  "showInSidebar?: boolean | null;" \
  "ObjectPermission entity must keep the nullable per-object showInSidebar override column"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/dtos/role.dto.ts" \
  "showAllObjectsInSidebar: boolean;" \
  'Role DTO must expose showAllObjectsInSidebar (Boolean!)'
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/dtos/create-role.input.ts" \
  "editWindowMinutes?: number | null;" \
  "CreateRoleInput must accept the role edit window"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/dtos/create-role.input.ts" \
  "showAllObjectsInSidebar?: boolean;" \
  "CreateRoleInput must accept the role-wide sidebar default"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/dtos/update-role.input.ts" \
  "editWindowMinutes?: number | null;" \
  "UpdateRolePayload must accept the role edit window"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/dtos/update-role.input.ts" \
  "showAllObjectsInSidebar?: boolean;" \
  "UpdateRolePayload must accept the role-wide sidebar default"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/utils/fromFlatRoleToRoleDto.util.ts" \
  "editWindowMinutes," \
  "fromFlatRoleToRoleDto must map the role edit window: v2.58 getRoles/getRole build every Role DTO here and a missing value is saved back as null"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/utils/fromFlatRoleToRoleDto.util.ts" \
  "showAllObjectsInSidebar," \
  "fromFlatRoleToRoleDto must map the role-wide sidebar default"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/utils/fromRoleEntityToRoleDto.util.ts" \
  "editWindowMinutes: role.editWindowMinutes" \
  "fromRoleEntityToRoleDto must map the role edit window"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/upsert-object-permissions.input.ts" \
  "showInSidebar?: boolean | null;" \
  "ObjectPermissionInput must accept the per-object sidebar override (null clears it)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/upsert-object-permissions.input.ts" \
  "editWindowMinutes?: number | null;" \
  "ObjectPermissionInput must accept the per-object edit window override"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/create-object-permission.input.ts" \
  "showInSidebar?: boolean | null;" \
  "CreateObjectPermissionInput must carry the per-object sidebar override"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/create-object-permission.input.ts" \
  "editWindowMinutes?: number | null;" \
  "CreateObjectPermissionInput must carry the per-object edit window override"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-object-permission/utils/from-create-object-permission-input-to-universal-flat-object-permission.util.ts" \
  "showInSidebar: createObjectPermissionInput.showInSidebar" \
  "New object-permission rows must keep the requested sidebar override"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-object-permission/utils/from-create-object-permission-input-to-universal-flat-object-permission.util.ts" \
  "createObjectPermissionInput.editWindowMinutes" \
  "New object-permission rows must keep the requested edit window override"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/role.entity.ts" \
  "editWindowMinutes" \
  "Role entity must have editWindowMinutes column"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.entity.ts" \
  "editWindowMinutes" \
  "ObjectPermission entity must have editWindowMinutes column"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/dtos/role.dto.ts" \
  "editWindowMinutes" \
  "Role DTO must have editWindowMinutes field"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/object-permission.dto.ts" \
  "editWindowMinutes" \
  "ObjectPermission DTO must have editWindowMinutes field"

echo ""
echo "--- FlatRole builders carry the Omnia role columns ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-role/utils/from-create-role-input-to-flat-role-to-create.util.ts" \
  "showAllObjectsInSidebar: createRoleInput.showAllObjectsInSidebar ?? true" \
  "Role creation must default showAllObjectsInSidebar to true"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-role/utils/from-create-role-input-to-flat-role-to-create.util.ts" \
  "editWindowMinutes: createRoleInput.editWindowMinutes ?? null" \
  "Role creation must default editWindowMinutes to null"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-role-flat-metadata.util.ts" \
  "showAllObjectsInSidebar: boolean;" \
  "Standard role context must carry showAllObjectsInSidebar"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-role-flat-metadata.util.ts" \
  "editWindowMinutes: null," \
  "Standard roles must default editWindowMinutes to null"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-flat-role-metadata.util.ts" \
  "showAllObjectsInSidebar: true" \
  "Admin standard role must show every object in the sidebar"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-role/utils/build-workspace-custom-application-flat-role.util.ts" \
  "showAllObjectsInSidebar: true" \
  "Workspace custom application role must carry the Omnia role columns"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-grant-role/utils/build-application-grant-role-from-to-flat-entity-maps.util.ts" \
  "showAllObjectsInSidebar: true" \
  "Application grant roles must carry the Omnia role columns"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/role/utils/__tests__/resolve-user-workspace-ids-with-permission-flag.util.spec.ts" \
  "OMNIA-CUSTOM: FlatRole carries the Omnia sidebar and edit window columns" \
  "Omnia hunk (G2): FlatRole carries the Omnia sidebar and edit window columns"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/__tests__/flat-role-permission-flag-validator.service.spec.ts" \
  "OMNIA-CUSTOM: FlatRole carries the Omnia sidebar and edit window columns" \
  "Omnia hunk (G2): FlatRole carries the Omnia sidebar and edit window columns"

echo ""
echo "--- RoleService / RoleModule / rolesPermissions cache stay upstream ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/role.service.ts" \
  "ReconciliationObjectLockdownService" \
  "RoleService must stay upstream; the reconciliation lockdown runs from the metadata.role/objectPermission listener (som U17)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/role.module.ts" \
  "ReconciliationObjectLockdownService" \
  "RoleModule must stay upstream; v2.58 RoleModule has no TypeORM features, so the lockdown provider breaks DI at boot"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/services/workspace-roles-permissions-cache.service.ts" \
  "editWindowMinutes" \
  "The rolesPermissions cache is upstream verbatim; the edit window resolves from flat maps (contract C3)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/utils/fromUserWorkspacePermissionsToUserWorkspacePermissionsDto.ts" \
  "showInSidebar" \
  "The current-user permission DTO is upstream verbatim; sidebar visibility is UserWorkspace.objectSidebarVisibility (contract C4)"

echo ""
echo "--- Omnia upgrade command W1: scoped RLS -> v2.58 rules + relation hops (contracts C1/C2) ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794337540400-omnia-translate-scoped-row-level-permissions.command.ts" \
  "W1 must translate Omnia ALL/READ/WRITE predicates before upstream's scope-blind 2.58 backfill, which would otherwise restrict Policy reads, widen dashboard writes and OR trees that v2.19 ANDed"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794337540400-omnia-translate-scoped-row-level-permissions.command.ts" \
  "1794337540400" \
  "W1 must keep timestamp 1794337540400: after the 2.58 rule-table/link instance commands and 1794335924429, before upstream backfill 1794337540466"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794337540400-omnia-translate-scoped-row-level-permissions.command.ts" \
  "--merge-mixed-scopes-fail-closed" \
  "Mixed-scope pairs abort by default (Q1); fail-closed merging is an explicit standalone option only"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util.ts" \
  "getRowLevelPermissionRuleUniversalIdentifier" \
  "W1 rule identifiers must be the ones upstream's backfill derives, or it re-creates the rule and zeroes the object grants W1 kept"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util.ts" \
  "buildRowLevelPermissionRules" \
  "W1 must check each planned tree against upstream's own rule derivation (exactly one rule per role and object, R-RLS-SINGLE)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util.ts" \
  "canCreateRecords: canUpdate" \
  "W1 rule grants must set create explicitly equal to update (contract C1)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util.ts" \
  "canReadObjectRecords: isWriteOnly ? canRead : false" \
  "W1 must keep object-level read for WRITE-only pairs (agents read every policy) and turn every other restricted object grant off"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/apply-scoped-row-level-permission-translation-plan.util.ts" \
  "IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED" \
  "W1 must enable the relation-hop flag when a hop exists; without it every hop predicate compiles to UNSATISFIABLE_RECORD_FILTER and agents can edit no policy"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/apply-scoped-row-level-permission-translation-plan.util.ts" \
  'ON CONFLICT ("objectMetadataId", "roleId") DO UPDATE SET' \
  "W1 object permission upsert must update the grant columns only"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/apply-scoped-row-level-permission-translation-plan.util.ts" \
  "showInSidebar" \
  "W1 must not overwrite objectPermission.showInSidebar (contract C4) or editWindowMinutes (contract C3)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/load-scoped-row-level-permission-translation-source.util.ts" \
  "information_schema" \
  "W1 must be a no-op on databases that never had the Omnia scope column"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/convert-workspace-member-predicate-to-relation-hop.util.ts" \
  "W1 converts policy.agent -> agentProfile.workspaceMember 'Me' predicates (both v2.19 shapes) into the C2 relation hop"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/__tests__/plan-scoped-row-level-permission-translation.util.spec.ts" \
  "W1 planner spec (WRITE Policy, READ dashboard, ALL lead, mixed abort and merge, cross-role group/parent aborts, mode 1/2, IS_NOT abort, ambiguous relation abort, risky-flag abort, multi-root re-parenting, idempotent re-run)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/__tests__/plan-scoped-row-level-permission-translation.util.spec.ts" \
  "plans nothing on a re-run" \
  "W1 must stay idempotent: linked pairs are skipped"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/__tests__/2-58-workspace-command-1794337540400-omnia-translate-scoped-row-level-permissions.command.spec.ts" \
  "W1 command spec (no-op without scope column, one transaction, dry run, abort before write, merge option)"

echo ""
echo "--- Role object settings: edit window and sidebar visibility resolution (C3, C4) ---"
check_file_exists \
  "packages/twenty-server/src/modules/role-object-settings/role-object-settings.module.ts" \
  "RoleObjectSettingsModule must exist; it registers the UserWorkspace.objectSidebarVisibility resolver"
check_file_exists \
  "packages/twenty-server/src/modules/role-object-settings/utils/resolve-edit-window-minutes.util.ts" \
  "Edit window resolution util (contract C3) must exist; PolicyWriteAuthorizationService imports it"
check_file_exists \
  "packages/twenty-server/src/modules/role-object-settings/utils/resolve-show-in-sidebar.util.ts" \
  "Sidebar visibility resolution util (contract C4) must exist"
check_file_exists \
  "packages/twenty-server/src/modules/role-object-settings/dtos/object-sidebar-visibility.dto.ts" \
  "ObjectSidebarVisibility GraphQL type (contract C4) must exist"
check_file_exists \
  "packages/twenty-server/src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver.ts" \
  "UserWorkspace.objectSidebarVisibility field resolver (contract C4) must exist"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver.ts" \
  "objectSidebarVisibility" \
  "The resolver must expose UserWorkspace.objectSidebarVisibility; the member sidebar reads it from currentUserWorkspace"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver.ts" \
  "@MetadataResolver(() => UserWorkspaceEntity)" \
  "The sidebar visibility resolver must be a /metadata field resolver on UserWorkspace (where currentUser lives)"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver.ts" \
  'userWorkspace.id !== userWorkspaceId' \
  "The sidebar visibility resolver must answer only for the caller's own userWorkspace (User.workspaces lists every membership)"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/dtos/object-sidebar-visibility.dto.ts" \
  "@ObjectType('ObjectSidebarVisibility')" \
  "The DTO must keep the GraphQL type name the front selects (contract C4)"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/utils/resolve-edit-window-minutes.util.ts" \
  "flatObjectPermission?.editWindowMinutes ?? flatRole.editWindowMinutes ?? null" \
  "Edit window must resolve object override, then role default, then no limit (contract C3)"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/utils/resolve-show-in-sidebar.util.ts" \
  "STANDARD_OBJECTS.workflowVersion.universalIdentifier" \
  "Workflow objects must follow the WORKFLOWS flag like compute-role-records-permissions (they are system objects in v2.58)"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/utils/resolve-show-in-sidebar.util.ts" \
  "flatObjectPermission?.showInSidebar ?? flatRole.showAllObjectsInSidebar" \
  "Sidebar visibility must resolve the per-object override, then the role default (contract C4)"

echo ""
echo "--- RLS Engine: relation-hop gate and narrowed create exemption (v2.58, contracts C1/C2, R-INSERT) ---"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util.ts" \
  "OMNIA-CUSTOM" \
  "Hop gate must read the hop flag alone: upstream also requires IS_ACCESS_GROUPS_ENABLED, so every 'Agent is Me' hop compiles to match-nothing and agents can create or edit no policy"
check_file_not_contains \
  "packages/twenty-server/src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util.ts" \
  "IS_ACCESS_GROUPS_ENABLED" \
  "Hop gate must not depend on access groups; they stay off in prod and reads stay on the live SQL EXISTS"
check_file_not_contains \
  "packages/twenty-server/src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util.ts" \
  "areRecordAccessGroupsEnabled" \
  "Hop gate must not depend on access groups through the helper either"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/role/utils/validate-operation-is-permitted-or-throw.util.ts" \
  "findOmniaFieldMetadataIdsSettableOnCreate" \
  "Create must exempt the hop relation, agentProfile relations and submittedDate from the uneditable-field check, or agent policy creation fails (R-INSERT)"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/role/utils/validate-operation-is-permitted-or-throw.util.ts" \
  "relationFieldMetadataId" \
  "Create exemption must include each RLS hop's relation column (policy.agentId)"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/role/utils/validate-operation-is-permitted-or-throw.util.ts" \
  "'agentProfile'" \
  "Create exemption must cover MANY_TO_ONE relations to agentProfile"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/role/utils/validate-operation-is-permitted-or-throw.util.ts" \
  "'submittedDate'" \
  "Create exemption must cover submittedDate (the policy create pre-hooks stamp it before the insert)"
check_file_exists \
  "packages/twenty-server/src/engine/permissions/internal/role/utils/__tests__/omnia-validate-operation-create-exemption.spec.ts" \
  "Create exemption regression tests: exempt fields pass, LTV/status/other relations are rejected, read check stays (Q16)"
check_file_exists \
  "packages/twenty-server/src/engine/permissions/internal/rls/utils/__tests__/omnia-read-all-write-own.spec.ts" \
  "Read-all/write-own Policy rule regression tests (C1/C2), including the hop gate with access groups off"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/rls/utils/__tests__/omnia-read-all-write-own.spec.ts" \
  "relationFieldMetadataId" \
  "Read-all/write-own spec must exercise the relation-hop predicate shape (C2)"
check_file_exists \
  "packages/twenty-server/src/engine/permissions/__tests__/omnia-policy-agent-hop.spec.ts" \
  "Policy agent hop through RecordPermissionsReadService and RecordEventPermissionsReadService (what PolicyWriteAuthorizationService relies on)"
check_file_exists \
  "packages/twenty-server/src/engine/permissions/internal/rls/utils/__tests__/policy-agent-ownership-rls.spec.ts" \
  "Policy Agent ownership RLS regression tests (hop through Agent Profile; legacy shape never matches)"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/rls/utils/__tests__/policy-agent-ownership-rls.spec.ts" \
  "agentProfile" \
  "Policy Agent ownership RLS must resolve through Agent Profile"

echo ""
echo "--- Omnia upgrade command W8b: standard objects keep upstream's record-action lockdown ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500008000-omnia-restore-standard-object-permission-lockdown.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1794500008000)" \
  "W8b must restore the standard lockdown (recordShare and five others) before W9 verifies it"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaRestoreStandardObjectPermissionLockdownCommand," \
  "W8b must be provided by OmniaUpgradeVersionCommandModule"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/get-standard-object-disabled-permission-actions-by-universal-identifier.util.ts" \
  "buildStandardFlatObjectMetadataMaps" \
  "W8b and W9 must read the expected lockdown from upstream's standard object builders, not a hand-kept list"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "findStandardObjectPermissionLockdownViolations" \
  "W9 must fail on any standard object missing its record-action lockdown"

echo "--- Omnia upgrade command W10: users keep landing on all records ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1795231988000-omnia-prioritize-initial-object-views.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1795231988000)" \
  "W10 must move each seeded All <records> view ahead of custom views (v2.58 opens the first non-INDEX view)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-upgrade-version-command.module.ts" \
  "OmniaPrioritizeInitialObjectViewsCommand," \
  "W10 must be provided by OmniaUpgradeVersionCommandModule"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/compute-omnia-initial-object-view-position-updates.util.ts" \
  "view.id.localeCompare(otherView.id) < 0" \
  "W10 must break position ties by id, like the front's computeObjectViewTargetIds"

echo "--- Omnia upgrade command W9: verify permissions, fails the upgrade (contracts C1/C2, som U17, fcmd U11/U12) ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500009000-omnia-verify-permissions.command.ts" \
  "W9 must fail the upgrade when RLS rules, PHI object grants, the reconciliation lockdown or PHI-egress command gates break the Omnia access contract"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500009000-omnia-verify-permissions.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1794500009000)" \
  "W9 must run after every permission-affecting 2.58 step: W1, upstream backfill 1794337540466 and W6/W7"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500009000-omnia-verify-permissions.command.ts" \
  "reportOmniaPermissionsViolationsOrThrow" \
  "W9 must throw on a violation so the upgrade records the workspace as failed and stops"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/report-omnia-permissions-violations-or-throw.util.ts" \
  "throw new Error" \
  "Verification must throw (non-zero exit) on any violation outside a dry run"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/omnia-verify-permissions.command.ts" \
  "CLI to rerun the W9 checks after every app install or sync"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/omnia-verify-permissions.command.ts" \
  "workspace:omnia-verify-permissions" \
  "The verification CLI keeps its documented name"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "Shared W9/CLI verification service"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "invalidateAndRecompute" \
  "Verification must read DB truth, not a cache computed before the upgrade rewrote permissions"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-phi-all-records-grant-violations.util.ts" \
  "canReachAllRecords" \
  "PHI invariant (C1): an object-level all-records grant must never cover an operation a rule restricts on person/policy/call/reconciliation objects"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/phi-object-name-singulars.constant.ts" \
  "'policy'" \
  "PHI invariant must cover policy (and person, call, the reconciliation objects)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-matching-every-record-violations.util.ts" \
  "buildRecordFilterForRule" \
  "Deny-by-default check must compile each rule with upstream's RLS builder and reject an empty filter"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-policy-agent-ownership-violations.util.ts" \
  "isPolicyAgentRelationHopPredicate" \
  "Member/Brokerage Agent on policy must read all and write only through the C2 hop"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-record-access-feature-flag-violations.util.ts" \
  "isRowLevelPermissionRelationHopEnabled" \
  "Hop predicates must be live in the engine (hop flag on, hop gate patch present) and record-access flags off"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/reconciliation-object-name-singulars.constant.ts" \
  "reconciliationDecisionRule" \
  "Reconciliation lockdown check must cover all four reconciliation objects"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-ungated-command-menu-item-violations.util.ts" \
  "permissionFlags." \
  "Active export/import/AI command menu items must carry a role permission flag gate (fcmd U12)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/phi-egress-engine-component-keys.constant.ts" \
  "EngineComponentKey.EXPORT_RECORDS" \
  "PHI-egress engine keys checked by W9"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-navigation-command-menu-item-activation-violations.util.ts" \
  "EngineComponentKey.NAVIGATION" \
  "Go To items must follow their object's activation (fcmd U11)"

echo ""
echo "--- Omnia upgrade commands W1/W9: shared record-access flag list, registration, lockdown roles ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/record-access-feature-flag-keys.constant.ts" \
  "FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED" \
  "W1 aborts and W9 fails while access groups are on (materialized reads with a stale window replace the live rule check)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/record-access-feature-flag-keys.constant.ts" \
  "FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED" \
  "W1 aborts and W9 fails while record-level sharing is on (shares grant records beside the rules)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/record-access-feature-flag-keys.constant.ts" \
  "FeatureFlagKey.IS_PRIVATE_RECORDS_ENABLED" \
  "W1 aborts and W9 fails while private records are on (creator grants records beside the rules)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/record-access-feature-flag-keys.constant.ts" \
  "FeatureFlagKey.IS_RELATED_RECORD_PATHS_ENABLED" \
  "W1 aborts and W9 fails while related record paths are on (paths grant records beside the rules)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util.ts" \
  "RECORD_ACCESS_FEATURE_FLAG_KEYS" \
  "W1 must abort on the same record-access flags W9 verifies (one shared list)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-missing-reconciliation-lockdown-violations.util.ts" \
  'universalIdentifier !== STANDARD_ROLE.admin.universalIdentifier' \
  "Only the standard admin (by universal identifier) skips the reconciliation lockdown check (plan 4.6 step 8)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-missing-reconciliation-lockdown-violations.util.ts" \
  'label !==' \
  "A role must not escape the reconciliation lockdown check by being labelled Admin"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-missing-reconciliation-lockdown-violations.util.spec.ts" \
  "is not the standard admin" \
  "Spec pins that a relabelled non-standard role still needs the reconciliation deny rows"

echo ""
echo "--- Omnia upgrade commands W1/W9 and C4: review fixes ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/constants/omnia-row-level-permission-translation-namespace.constant.ts" \
  "W1 namespace for deterministic rule, root group and id UUIDs; changing it breaks re-run idempotency"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-plan.type.ts" \
  "W1 plan shape (rules, root groups, links, soft deletes, object grants)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type.ts" \
  "W1 raw-SQL source rows, including the legacy scope column"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/format-scoped-row-level-permission-translation-report.util.ts" \
  "W1 per-pair report: ids, labels and counts only, never predicate values (PHI)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/__tests__/translate-then-verify-policy-row-level-permissions.spec.ts" \
  "W1 output on prod-shaped Policy rows must pass every W9 rule check"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/brokerage-agent-role-universal-identifier.constant.ts" \
  "W9 checks Brokerage Agent on Policy by universal identifier, never by label"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/layout-engine-component-keys.constant.ts" \
  "W9 warns (does not fail) on ungated layout commands"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/object-records-operation-types.constant.ts" \
  "W9 operation list for the PHI and reconciliation reach checks"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant.ts" \
  "W9 check names printed with each violation"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/synthetic-workspace-member-id.constant.ts" \
  "Stand-in member W9 uses to compile rules outside a request"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type.ts" \
  "W9 violation shape: metadata ids and messages only"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/build-synthetic-member-field-values.util.ts" \
  "W9 member values that let 'Me' predicates compile, so an empty filter is not misreported"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-without-grant-violations.util.ts" \
  "W9 check 2: no rule grants nothing (a zeroed scope-blind translation)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-tree-integrity-violations.util.ts" \
  "W9 check 4: no group or predicate hangs off a deleted group or one of another role, object or rule"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-unlinked-row-level-permission-violations.util.ts" \
  "W9 check 1: every live predicate and group is linked to a rule of its own role and object"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/get-enforced-operation-types.util.ts" \
  "W9 maps create onto update while create permissions are off, as the engine does"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/is-policy-agent-relation-hop-predicate.util.ts" \
  "W9 matcher for the C2 hop policy.agent -> agentProfile.workspaceMember IS Me"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock.ts" \
  "W9 prod-shaped workspace mock (agentProfile has workspaceMember and manager relations)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/2-58-workspace-command-1794500009000-omnia-verify-permissions.command.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-navigation-command-menu-item-activation-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-phi-all-records-grant-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-policy-agent-ownership-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-record-access-feature-flag-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-row-level-permission-rule-matching-every-record-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-row-level-permission-rule-without-grant-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-row-level-permission-tree-integrity-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-ungated-command-menu-item-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-unlinked-row-level-permission-violations.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/is-policy-agent-relation-hop-predicate.util.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/omnia-permissions-verification.service.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/omnia-verify-permissions.command.spec.ts" \
  "W9 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/modules/role-object-settings/resolvers/__tests__/user-workspace-sidebar-visibility.resolver.spec.ts" \
  "C3/C4 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/modules/role-object-settings/utils/__tests__/resolve-edit-window-minutes.util.spec.ts" \
  "C3/C4 spec (Omnia-only file, plan G2)"
check_file_exists \
  "packages/twenty-server/src/modules/role-object-settings/utils/__tests__/resolve-show-in-sidebar.util.spec.ts" \
  "C3/C4 spec (Omnia-only file, plan G2)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/convert-workspace-member-predicate-to-relation-hop.util.ts" \
  "name === 'workspaceMember'" \
  "W1 must hop through the relation named workspaceMember (v2.19 order); agentProfile.manager also targets workspaceMember, and counting relations aborts prod"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/is-policy-agent-relation-hop-predicate.util.ts" \
  "hopTargetFieldMetadata.name === 'workspaceMember'" \
  "W9 must accept the hop through agentProfile.workspaceMember beside agentProfile.manager, and never a hop through manager"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-policy-agent-ownership-violations.util.ts" \
  "predicateGroup.parentRowLevelPermissionPredicateGroupId;" \
  "W9 check 6 must accept the hop under the AND root group the settings editor writes (W1 keeps it), or the upgrade fails on prod data"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-policy-agent-ownership-violations.util.ts" \
  "'softDelete'," \
  "W9 check 6 must fail when soft delete reaches every policy through the object grant (C1: SD/D false at object level)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-policy-agent-ownership-violations.util.ts" \
  "'destroy'," \
  "W9 check 6 must fail when destroy reaches every policy through the object grant (C1: SD/D false at object level)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-missing-reconciliation-lockdown-violations.util.ts" \
  "canReachSomeRecords" \
  "W9 check 7 must fail on any grant or row level permission rule that reaches reconciliation records; v2.58 rules grant without object grants"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/plan-scoped-row-level-permission-translation.util.ts" \
  "outcome: 'removed'" \
  "W1 must remove the predicates of a pair whose rule would grant nothing instead of inserting a rule W9 rejects"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/apply-scoped-row-level-permission-translation-plan.util.ts" \
  'SET "deletedAt" = now(), "updatedAt" = now()' \
  "W1 soft-deletes (never hard-deletes) the predicates and groups of a pair that grants nothing"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/__tests__/2-58-workspace-command-1794337540400-omnia-translate-scoped-row-level-permissions.command.spec.ts" \
  "still refreshes the caches on a re-run that finds every pair linked" \
  "W1 must refresh the RLS caches on every non-dry run, or a retry leaves upstream's backfill a stale rule map and it re-inserts rules"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/__tests__/plan-scoped-row-level-permission-translation.util.spec.ts" \
  "hops through the relation named workspaceMember when the linked object also has a manager relation" \
  "Spec pins the hop target choice on the prod agentProfile shape"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/__tests__/translate-then-verify-policy-row-level-permissions.spec.ts" \
  "passes every W9 rule and policy ownership check" \
  "Spec pins that W1 output on the settings-written and Brokerage-written Policy shapes passes W9"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock.ts" \
  "agentProfileManagerField" \
  "W9 specs must run on the prod agentProfile shape (workspaceMember and manager relations)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-missing-reconciliation-lockdown-violations.util.spec.ts" \
  "reaches reconciliation records despite its deny rows" \
  "Spec pins that deny rows alone do not pass the lockdown check when a rule grants"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-missing-reconciliation-lockdown-violations.util.spec.ts" \
  "should report an application grant role copied from the admin role" \
  "Spec pins that application grant roles are not exempt from the reconciliation lockdown"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-policy-agent-ownership-violations.util.spec.ts" \
  "should pass the hop inside the AND root group the settings editor writes" \
  "Spec pins the settings-written Policy shape"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findUnlinkedRowLevelPermissionViolations({" \
  "W9 check 1 (rule links) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findRowLevelPermissionRuleWithoutGrantViolations({" \
  "W9 check 2 (rules granting nothing) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findRowLevelPermissionRuleMatchingEveryRecordViolations({" \
  "W9 check 3 (rules compiling to an empty filter) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findRowLevelPermissionTreeIntegrityViolations({" \
  "W9 check 4 (tree integrity) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findPhiAllRecordsGrantViolations({" \
  "W9 check 5 (PHI all-records grants) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findPolicyAgentOwnershipViolations({" \
  "W9 check 6 (Member/Brokerage Agent read all, write own) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findMissingReconciliationLockdownViolations({" \
  "W9 check 7 (reconciliation lockdown) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findUngatedCommandMenuItemViolations({" \
  "W9 check 8 (PHI-egress command gates) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findRecordAccessFeatureFlagViolations({" \
  "W9 check 9 (record-access flags off, hop flag on) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "...findNavigationCommandMenuItemActivationViolations({" \
  "W9 check 10 (Go To items follow object activation) must stay wired into the verification"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver.ts" \
  "resolveEffectiveFlatEntityProperty" \
  "C4 must list objects by their effective isActive; a standard object turned back on keeps isActive false under a workspace override"
check_file_not_contains \
  "packages/twenty-server/src/modules/role-object-settings/resolvers/user-workspace-sidebar-visibility.resolver.ts" \
  "flatObjectMetadata.isActive)" \
  "C4 must not filter on the stored isActive (hides reactivated standard objects from non-LAYOUTS members)"
check_file_contains \
  "packages/twenty-server/src/modules/role-object-settings/resolvers/__tests__/user-workspace-sidebar-visibility.resolver.spec.ts" \
  "follows the workspace override of isActive rather than the stored value" \
  "Spec pins the effective isActive in the sidebar visibility resolver"

echo ""
echo "--- Omnia upgrade command W9: read-restricted searchable fields (HIPAA: search leaks hidden values) ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-read-restricted-searchable-field-violations.util.ts" \
  "HIPAA: W9 must fail on a searchable field some role cannot read; search matches searchVector in WHERE, so that role finds records by the hidden value"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-read-restricted-searchable-field-violations.util.ts" \
  "canReadFieldValue === false" \
  "Any read restriction, object level or rule level, makes a searchable field a W9 violation"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-read-restricted-searchable-field-violations.util.ts" \
  "flatSearchFieldMetadataMaps.byUniversalIdentifier" \
  "The check must read the searchFieldMetadata rows, which are what the searchVector indexes"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-read-restricted-searchable-field-violations.util.ts" \
  "isSearchable" \
  "The check must not skip objects left out of default search: search still queries an object the caller names"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "findReadRestrictedSearchableFieldViolations({" \
  "W9 and workspace:omnia-verify-permissions must run the read-restricted searchable field check"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "'flatSearchFieldMetadataMaps'," \
  "W9 must recompute and read the search field maps, not a cache from before the upgrade"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "'flatFieldPermissionMaps'," \
  "W9 must recompute and read the field permission maps, not a cache from before the upgrade"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant.ts" \
  "readRestrictedSearchableField: 'read-restricted-searchable-field'" \
  "W9 check name operators grep for in upgrade logs"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-read-restricted-searchable-field-violations.util.spec.ts" \
  "isSearchable: false" \
  "The spec must keep the case where an object left out of default search is still checked"


echo ""
echo "--- Omnia upgrade command W9: relation-hop target writes (contract C2) ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-relation-hop-target-write-violations.util.ts" \
  "W9 must fail when a role with relation-hop rules can edit agentProfile.workspaceMember or delete agent profiles (the hop reads that row live)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service.ts" \
  "findRelationHopTargetWriteViolations({" \
  "W9 and workspace:omnia-verify-permissions must run the relation-hop target write check"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant.ts" \
  "relationHopTargetWrite: 'relation-hop-target-write'" \
  "W9 check name operators grep for in upgrade logs"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-relation-hop-target-write-violations.util.ts" \
  "'softDelete'," \
  "Soft delete and destroy reach on the hop target are violations too"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/verify-permissions/__tests__/find-relation-hop-target-write-violations.util.spec.ts" \
  "Omnia test: relation-hop target write check (member field editable, rule-level edit, removal)"

echo ""
echo "--- Timeline activity row-level security (HIPAA) ---"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/apply-timeline-activities-visibility-restrictions.service.ts" \
  "findTimelineActivitiesDescribingUnreadableRecords" \
  "Timeline diffs and cached names must follow the row-level security of the activity's target and linked records; upstream only checks object-level readability of linked objects, and Omnia runs without related record paths"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/apply-timeline-activities-visibility-restrictions.service.ts" \
  "omitDescribedRecordValuesFromTimelineActivity(timelineActivity)" \
  "Activities describing unreadable records must lose their diff and cached name"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/apply-timeline-activities-visibility-restrictions.service.ts" \
  "return new Set(restrictableTimelineActivities);" \
  "A reader whose permissions cannot be resolved must read no diff or cached name (fail closed)"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-query-hook.module.ts" \
  "PermissionsModule" \
  "The timeline visibility handler injects the record permission services"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/utils/add-timeline-activity-object-columns-to-select.util.ts" \
  "flatFieldMetadata.name === 'linkedRecordId'" \
  "linkedRecordId must be selected so the row-level check reaches the linked record (otherwise linked activities fail closed for restricted readers)"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/utils/omit-restricted-fields-from-timeline-activity.util.ts" \
  "export const getObjectByTargetColumnName" \
  "The Omnia timeline row-level check reuses upstream's target-column map"
check_file_contains \
  "packages/twenty-server/src/engine/api/common/common-query-runners/common-group-by-query-runner.service.ts" \
  "assertTimelineActivityPropertiesAreQueryableOrThrow" \
  "Restricted readers must not group timeline activities by linkedRecordCachedName (group keys would return cached names)"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/record-event-permissions-read.service.ts" \
  "filterTimelineActivityEventsDescribingReadableRecords" \
  "Timeline activity events (SSE, webhooks, workflow/agent/logic-function triggers) must reach only readers of the records they describe"
check_file_exists \
  "packages/twenty-server/src/modules/timeline/utils/find-timeline-activities-describing-unreadable-records.util.ts" \
  "Omnia timeline row-level check: one read check per described object, batched filterGrantedRecordIds with the requester's principals, fail closed"
check_file_exists \
  "packages/twenty-server/src/modules/timeline/utils/omit-described-record-values-from-timeline-activity.util.ts" \
  "Omnia timeline redaction: empty diff and null cached name"
check_file_exists \
  "packages/twenty-server/src/modules/timeline/utils/filter-timeline-activity-events-describing-readable-records.util.ts" \
  "Omnia timeline event filter used by filterReadableEvents"
check_file_exists \
  "packages/twenty-server/src/modules/timeline/__tests__/omnia-timeline-activity-row-level-security.spec.ts" \
  "Timeline row-level security spec: other agent's lead, review item, linked records, admin, fail closed, events, group by"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/__tests__/omnia-timeline-activity-row-level-security.spec.ts" \
  "should omit the diff of another agent's lead" \
  "Spec pins that an agent cannot read another agent's lead diffs through the timeline"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/__tests__/omnia-timeline-activity-row-level-security.spec.ts" \
  "should omit the diff of a review item the role cannot read at all" \
  "Spec pins that non-admin roles cannot read reconciliation reviewItem timeline diffs"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "nameSingular === 'timelineActivity'" \
  "Search must not return timeline activities: their label is another record's cached name, unchecked against that record's row-level security"
check_file_exists \
  "packages/twenty-server/src/modules/timeline/constants/timeline-activity-described-record-value-field-names.constant.ts" \
  "Omnia list of timeline fields that carry described records' values (diff, cached name, search vector)"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/constants/timeline-activity-described-record-value-field-names.constant.ts" \
  "'searchVector'," \
  "searchVector is tokenised from linkedRecordCachedName, so it is redacted, checked and refused like the cached name"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/apply-timeline-activities-visibility-restrictions.service.ts" \
  "TIMELINE_ACTIVITY_DESCRIBED_RECORD_VALUE_FIELD_NAMES.some(" \
  "A timeline activity selected only for its search vector must still go through the row-level check"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/utils/omit-described-record-values-from-timeline-activity.util.ts" \
  "if ('searchVector' in timelineActivity) {" \
  "Activities describing unreadable records must lose their search vector (the cached name in tokens)"
check_file_not_contains \
  "packages/twenty-server/src/modules/timeline/utils/omit-described-record-values-from-timeline-activity.util.ts" \
  "...properties," \
  "Keys apps write into properties can hold the record's values; the redaction must not spread them back"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/utils/add-timeline-activity-object-columns-to-select.util.ts" \
  "isDefined(select[fieldName])" \
  "Selecting only the cached name or search vector must also select the columns the row-level check needs"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/utils/assert-timeline-activity-properties-are-queryable-or-throw.util.ts" \
  "TIMELINE_ACTIVITY_DESCRIBED_RECORD_VALUE_FIELD_NAMES.some(" \
  "Restricted readers must not filter or order by properties, the cached name or the search vector (cursors carry raw values)"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/utils/assert-timeline-activity-properties-are-queryable-or-throw.util.ts" \
  "recordReadRestrictions.rowLevelRestrictedObjectMetadataIds.size > 0" \
  "Readers held only by row-level rules must be refused too; upstream's gate looks at object and field restrictions only"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/types/record-read-restrictions.type.ts" \
  "rowLevelRestrictedObjectMetadataIds?: ReadonlySet<string>;" \
  "Read restrictions carry the objects a reader reaches only through row-level rules (timeline value gate)"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/constants/no-record-read-restrictions.constant.ts" \
  "rowLevelRestrictedObjectMetadataIds: new Set()," \
  "Unrestricted readers carry an explicit empty set; absence is treated as restricted"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/role/utils/build-record-read-restrictions.util.ts" \
  "const rowLevelRestrictedObjectMetadataIds = new Set(" \
  "The read-restrictions builder lists objects readable only in part"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/internal/role/utils/__tests__/build-record-read-restrictions.util.spec.ts" \
  "should list objects the role reads only through row-level rules" \
  "Spec pins the row-level restricted object list"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/utils/filter-timeline-activity-events-describing-readable-records.util.ts" \
  "'before' in properties ? properties.before : undefined," \
  "Timeline activity events must be judged on both snapshots: the before snapshot and diff describe the old records"
check_file_exists \
  "packages/twenty-server/src/modules/timeline/query-hooks/utils/assert-timeline-activity-description-is-not-updated.util.ts" \
  "Omnia: non-system writers cannot change a timeline activity's targets, linked record, cached name or diff"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-update-one.pre-query-hook.ts" \
  "assertTimelineActivityDescriptionIsNotUpdated({" \
  "Re-targeting or unlinking an activity would hand another record's diff to the writer (updateOne)"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-update-many.pre-query-hook.ts" \
  "assertTimelineActivityDescriptionIsNotUpdated({" \
  "Re-targeting or unlinking an activity would hand another record's diff to the writer (updateMany)"
check_file_exists \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-merge-many.pre-query-hook.ts" \
  "Omnia: only system work merges timeline activities (a merge fills an empty diff from another activity, dry runs included)"
check_file_exists \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-write-authorization.service.ts" \
  "Omnia: non-system writers add timeline activities only about records they may update"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-create-one.pre-query-hook.ts" \
  "assertMayDescribeRecordsOrThrow(" \
  "Timeline entries about a record are created only by writers who may update it (createOne)"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-activity-create-many.pre-query-hook.ts" \
  "assertMayDescribeRecordsOrThrow(" \
  "Timeline entries about a record are created only by writers who may update it (createMany)"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-query-hook.module.ts" \
  "TimelineActivityMergeManyPreQueryHook," \
  "The timeline merge refusal must be registered"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-query-hook.module.ts" \
  "TimelineActivityWriteAuthorizationService," \
  "The timeline create check must be registered"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/query-hooks/timeline-query-hook.module.ts" \
  "WorkspaceCacheModule," \
  "The timeline create check reads object metadata from the workspace cache"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/__tests__/omnia-timeline-activity-row-level-security.spec.ts" \
  "should check a timeline activity selected only for its search vector" \
  "Spec pins the search vector redaction"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/__tests__/omnia-timeline-activity-row-level-security.spec.ts" \
  "to a role held only by row-level rules, since cursors carry the raw value" \
  "Spec pins the row-level gate on filter/order/group-by"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/__tests__/omnia-timeline-activity-row-level-security.spec.ts" \
  "should refuse an agent's update of another agent's lead activity that %s" \
  "Spec pins the re-targeting and unlinking refusal"
check_file_contains \
  "packages/twenty-server/src/modules/timeline/__tests__/omnia-timeline-activity-row-level-security.spec.ts" \
  "should strip nested timeline activities through the registered handler" \
  "Spec pins the handler registration and nested collection"

# ======================================================================
# twenty-shared: Omnia types and helpers
# ======================================================================
echo ""
echo "=== twenty-shared: Omnia types and helpers ==="

echo ""
echo "--- Omnia shared types and helpers ---"
check_file_contains \
  "packages/twenty-shared/src/application/roleManifestType.ts" \
  "showInSidebar?: boolean | null" \
  "App object-permission manifests must carry per-object sidebar visibility (by intersection)"
check_file_contains \
  "packages/twenty-shared/src/application/roleManifestType.ts" \
  "showAllObjectsInSidebar?: boolean" \
  "App role manifests must carry the role-wide sidebar default"
check_file_contains \
  "packages/twenty-shared/src/application/roleManifestType.ts" \
  "editWindowMinutes?: number | null" \
  "App role and object-permission manifests must carry the edit window"
check_file_not_contains \
  "packages/twenty-shared/src/application/rolePermissionGrantsSchema.ts" \
  "showInSidebar" \
  "Omnia manifest fields must never enter the strict grant schema (AI run scopes reuse it)"
check_file_not_contains \
  "packages/twenty-shared/src/application/rolePermissionGrantsSchema.ts" \
  "editWindowMinutes" \
  "Omnia manifest fields must never enter the strict grant schema (AI run scopes reuse it)"
check_file_not_contains \
  "packages/twenty-shared/src/types/RowLevelPermissionPredicate.ts" \
  "scope" \
  "RLS predicates carry no scope in v2.58; grants live on rowLevelPermissionRule (G8)"
check_file_not_contains \
  "packages/twenty-shared/src/types/RowLevelPermissionPredicateGroup.ts" \
  "scope" \
  "RLS predicate groups carry no scope in v2.58 (G8)"
check_file_not_contains \
  "packages/twenty-shared/src/types/index.ts" \
  "RowLevelPermissionPredicateScope" \
  "The RLS scope enum must stay deleted (G8)"
check_file_not_contains \
  "packages/twenty-shared/src/types/ObjectPermissions.ts" \
  "editWindowMinutes" \
  "ObjectPermissions is upstream's command-menu shape; the edit window resolves from flat maps (C3)"
check_file_not_contains \
  "packages/twenty-shared/src/types/ObjectPermissions.ts" \
  "showInSidebar" \
  "Sidebar visibility is UserWorkspace.objectSidebarVisibility (C4), never ObjectPermissions"
check_file_not_contains \
  "packages/twenty-shared/src/types/FileFolder.ts" \
  "Export = 'export'" \
  "FileFolder.Export stays removed: exports use upstream record-export; legacy CSVs are purged by W8"
check_file_exists \
  "packages/twenty-shared/src/types/RequiredCondition.ts" \
  "Shared soft requiredCondition type (contract C5)"
check_file_contains \
  "packages/twenty-shared/src/types/RequiredCondition.ts" \
  "'fieldEmpty' | 'fieldNotEmpty'" \
  "RequiredCondition must keep its conditional variants (contract C5)"
check_file_contains \
  "packages/twenty-shared/src/types/SettingsPath.ts" \
  "IngestionPipelines = 'ingestion-pipelines'" \
  "SettingsPath must keep the bookmark-stable ingestion pipeline paths"
check_file_contains \
  "packages/twenty-shared/src/types/ViewFilterOperand.ts" \
  "IS_NOT_RELATIVE = 'IS_NOT_RELATIVE'" \
  "ViewFilterOperand must keep the workflow-only IS_NOT_RELATIVE operand"
check_file_contains \
  "packages/twenty-shared/src/utils/filter/utils/convert-view-filter-operand-to-core-operand.util.ts" \
  "[ViewFilterOperand.IS_NOT_RELATIVE]: ViewFilterOperand.IS_NOT_RELATIVE" \
  "The operand map is exhaustive over the enum and must map IS_NOT_RELATIVE"
check_file_contains \
  "packages/twenty-shared/src/utils/filter/__tests__/isRecordFilterOperandExpectingValue.test.ts" \
  "ViewFilterOperand.IS_NOT_RELATIVE" \
  "The operand exhaustiveness spec must list IS_NOT_RELATIVE"
check_file_contains \
  "packages/twenty-shared/src/types/FieldMetadataMultiItemSettings.ts" \
  "displayAs?: 'link' | 'audio'" \
  "LINKS settings must keep displayAs for the call-recording audio player"
check_file_contains \
  "packages/twenty-shared/src/utils/filter/utils/isMatchingCurrencyFilter.ts" \
  'if (!isDefined(value))' \
  "The currency matcher must not throw on unloaded (null/undefined) values"
check_file_contains \
  "packages/twenty-shared/src/utils/filter/utils/__tests__/isMatchingCurrencyFilter.test.ts" \
  "describe('undefined value'" \
  "Currency matcher null-safety spec must exist"
check_file_contains \
  "packages/twenty-shared/src/utils/filter/turnRecordFilterIntoGqlOperationFilter.ts" \
  "is: 'NOT_NULL'" \
  "One-to-many emptiness must serialize to the canonical related-id shape"
check_file_contains \
  "packages/twenty-shared/src/utils/filter/turnRecordFilterIntoGqlOperationFilter.ts" \
  "RelationType.ONE_TO_MANY" \
  "The one-to-many emptiness branch must key on settings.relationType (works server-side too)"
check_file_contains \
  "packages/twenty-shared/src/utils/filter/__tests__/computeRecordGqlOperationFilter.test.ts" \
  "one-to-many relation filters" \
  "One-to-many traversal and emptiness specs must exist"
check_file_exists \
  "packages/twenty-shared/src/utils/address/normalizeUsState.ts" \
  "Single shared US state normalizer (export column layer, front import, server import job)"
check_file_contains \
  "packages/twenty-shared/src/utils/auth/derive-trusted-redirect-domain.ts" \
  "candidate.protocol !== 'https:'" \
  "Trusted external redirects must require https (a javascript: URL can carry a trusted host)"
check_file_exists \
  "packages/twenty-shared/src/utils/auth/__tests__/derive-trusted-redirect-domain.test.ts" \
  "Redirect trust spec (https requirement, javascript: rejection)"
check_file_exists \
  "packages/twenty-shared/src/constants/ReconciliationDefaultAutoMatchThreshold.ts" \
  "Shared reconciliation auto-match threshold (client/server parity)"
check_file_contains \
  "packages/twenty-shared/src/constants/SystemPermissionFlag.ts" \
  "RECONCILIATION: '091125f0-bdb5-4c67-944f-8c4c66de4a76'" \
  "RECONCILIATION must keep the universal identifier already stored in prod rows (contract C8)"
check_file_not_contains \
  "packages/twenty-shared/src/constants/ToolPermissionFlags.ts" \
  "RECONCILIATION" \
  "RECONCILIATION is a settings flag and must never be in TOOL_PERMISSION_FLAGS (C8)"
check_file_contains \
  "packages/twenty-shared/src/constants/index.ts" \
  "RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD" \
  "Generated constants barrel must export the Omnia constants (rerun nx run twenty-shared:generateBarrels)"
check_file_contains \
  "packages/twenty-shared/src/utils/index.ts" \
  "normalizeUsState" \
  "Generated utils barrel must export the Omnia helpers (rerun nx run twenty-shared:generateBarrels)"
check_file_contains \
  "packages/twenty-shared/src/types/index.ts" \
  "RequiredCondition" \
  "Generated types barrel must export RequiredCondition (rerun nx run twenty-shared:generateBarrels)"
check_file_exists \
  "packages/twenty-shared/src/utils/address/__tests__/normalizeUsState.test.ts" \
  "Omnia test from the v2.58 merge (G2): normalizeUsState.test.ts"

echo ""
echo "--- Reconciliation shared helpers and constants ---"
check_file_exists \
  "packages/twenty-shared/src/utils/composite/promotePrimaryToAdditional.ts" \
  "Shared helper used by frontend + backend reconciliation Accept paths"
check_file_exists \
  "packages/twenty-shared/src/utils/reconciliation/coerceFieldDiffValueForRecordUpdate.ts" \
  "Shared helper must coerce reconciliation diff strings before numeric record updates"
check_file_contains \
  "packages/twenty-shared/src/constants/ReconciliationAutoApplyBlockingFlags.ts" \
  "NAME_MISMATCH" \
  "Shared blocking-flag list must exclude name-mismatch items from default batch apply (moved from ReconciliationReviewBody 2026-06-11, audit item 2.7)"
check_file_exists \
  "packages/twenty-shared/src/constants/ReconciliationAutoApplyBlockingFlags.ts" \
  "Shared blocking-flag list (client/server parity for batch apply scope)"

# ======================================================================
# Server metadata: requiredCondition, view-field sub-fields, nav targets, ingestion pipelines
# ======================================================================
echo ""
echo "=== Server metadata: requiredCondition, view-field sub-fields, nav targets, ingestion pipelines ==="

echo ""
echo "--- View-field sub-field columns (C6) ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view-field/entities/view-field.entity.ts" \
  "['fieldMetadataId', 'viewId', 'subFieldName']" \
  "ViewFieldEntity unique index decorator must document the COALESCE(subFieldName) index from legacy migration 1774500000000"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view-field/dtos/view-field.dto.ts" \
  "subFieldName?: string | null;" \
  "ViewField GraphQL type must expose subFieldName"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view-field/dtos/inputs/create-view-field.input.ts" \
  "subFieldName?: string;" \
  "CreateViewFieldInput must accept subFieldName"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-view-field/utils/from-create-view-field-input-to-flat-view-field-to-create.util.ts" \
  "subFieldName: createViewFieldInput.subFieldName ?? null" \
  "User-created view fields must carry subFieldName into the flat entity"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-view-field-validator.service.ts" \
  "(flatViewField.subFieldName ?? null)" \
  "View-field uniqueness must treat relation sub-field columns as distinct columns"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/utils/compute-system-view-fields-to-create.util.ts" \
  "subFieldName: null" \
  "v2.58 system view-field builder must set subFieldName (representative builder marker)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view/utils/build-initial-view-field-flat-entity.util.ts" \
  "subFieldName: null" \
  "v2.58 initial-view view-field builder must set subFieldName (representative builder marker)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view/utils/compute-missing-initial-object-view-operations.util.ts" \
  "getRelationSubFieldViewFieldUniversalIdentifier" \
  "Initial-view seed (2-41 + standard-app sync) must copy sub-field columns under a distinct id, or the seed fails on duplicate ids"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/view/utils/get-relation-sub-field-view-field-universal-identifier.util.ts" \
  "Deterministic id helper for copied relation sub-field columns"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view/utils/__tests__/compute-missing-initial-object-view-operations.util.spec.ts" \
  "copies relation sub-field columns with their sub-field and a distinct identifier" \
  "Regression spec for the initial-view seed with sub-field columns"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-26/2-26-workspace-command-1785255690000-demote-and-backfill-application-index-view.command.ts" \
  "OMNIA-CUSTOM: type-only; Omnia's FlatViewField has subFieldName" \
  "2-26 backfill literal needs subFieldName for the Omnia FlatViewField type (type-only, G7 literal exception)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/__tests__/from-flat-view-field-to-view-field-manifest.util.spec.ts" \
  "OMNIA-CUSTOM: FlatViewField carries the relation sub-field column" \
  "View-field manifest round-trip spec must include subFieldName (the forward converter emits null)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view-field/entities/view-field.entity.ts" \
  "subFieldName" \
  "ViewFieldEntity must have subFieldName column for relation sub-field columns"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-object-metadata/utils/recompute-view-field-identifier-after-flat-object-identifier-update.util.ts" \
  "OMNIA-CUSTOM: only user-added relation sub-field columns set this" \
  "Omnia hunk (G2): only user-added relation sub-field columns set this"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/field-metadata/services/field-index-view-field-on-create-side-effect-handler.service.ts" \
  "OMNIA-CUSTOM: only user-added relation sub-field columns set this" \
  "Omnia hunk (G2): only user-added relation sub-field columns set this"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/field-metadata/services/field-record-page-view-field-on-create-side-effect-handler.service.ts" \
  "OMNIA-CUSTOM: only user-added relation sub-field columns set this" \
  "Omnia hunk (G2): only user-added relation sub-field columns set this"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/metadata-side-effect/handlers/utils/compute-record-page-view-field-for-existing-object.util.ts" \
  "OMNIA-CUSTOM: only user-added relation sub-field columns set this" \
  "Omnia hunk (G2): only user-added relation sub-field columns set this"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view-field-group/services/fields-widget-upsert.service.ts" \
  "OMNIA-CUSTOM: only user-added relation sub-field columns set this" \
  "Omnia hunk (G2): only user-added relation sub-field columns set this"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view/services/view-widget-upsert.service.ts" \
  "OMNIA-CUSTOM: only user-added relation sub-field columns set this" \
  "Omnia hunk (G2): only user-added relation sub-field columns set this"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util.ts" \
  "OMNIA-CUSTOM: only user-added relation sub-field columns set this" \
  "Omnia hunk (G2): only user-added relation sub-field columns set this"

echo ""
echo "--- Field searchability default (create and update transpilers) ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-create-field-input-to-flat-field-metadatas-to-create.util.ts" \
  "// OMNIA-CUSTOM: searchable-type fields added to an application's own searchable object" \
  "Field create must default searchable-type fields on an application's own searchable object to isSearchable"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-create-field-input-to-flat-field-metadatas-to-create.util.ts" \
  "createFieldInput: { ...createFieldInput, isSearchable }" \
  "The Omnia isSearchable default must flow into getDefaultFlatFieldMetadata"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-update-field-input-to-flat-field-metadata.util.ts" \
  "// OMNIA-CUSTOM: deactivating a field also takes it out of search" \
  "Field deactivation must also clear isSearchable so retired PHI fields stop matching (HIPAA)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-update-field-input-to-flat-field-metadata.util.ts" \
  "{ ...rawUpdateFieldInput, isSearchable: false }" \
  "Deactivation must send isSearchable: false through the upstream update path"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/__tests__/from-create-field-input-to-flat-field-metadatas-to-create.util.spec.ts" \
  "Spec for the Omnia isSearchable create default"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/__tests__/from-update-field-input-to-flat-field-metadata.util.spec.ts" \
  "Spec for the Omnia deactivation search removal"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-create-field-input-to-flat-field-metadatas-to-create.util.ts" \
  "isCustom" \
  "The create default must use application ownership, never the removed isCustom flag"

echo ""
echo "--- Field metadata: requiredCondition (C5) and navigation target FKs ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-entity/constant/workspace-owned-properties-by-metadata-name.constant.ts" \
  "fieldMetadata: ['requiredCondition']" \
  "requiredCondition must be workspace-owned so app and standard syncs keep each workspace's required rules (C5)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-relation-properties-to-compare.constant.ts" \
  "'requiredCondition'" \
  "Relation fields must accept requiredCondition updates (Policy carrier/lead/agent/product rules)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/from-flat-field-metadata-to-field-metadata-dto.util.ts" \
  "requiredCondition: flatFieldMetadata.requiredCondition ?? undefined" \
  "fieldsList DTO mapper must return requiredCondition"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/field-metadata/utils/from-field-metadata-entity-to-field-metadata-dto.util.ts" \
  "requiredCondition: entity.requiredCondition ?? undefined" \
  "field/fields queries and REST metadata DTO mapper must return requiredCondition"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/get-default-flat-field-metadata-from-create-field-input.util.ts" \
  "requiredCondition: createFieldInput.requiredCondition ?? null" \
  "Field create must persist the requiredCondition sent in CreateFieldInput"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-entity/constant/all-entity-properties-configuration-by-metadata-name.constant.ts" \
  "requiredCondition: {" \
  "requiredCondition must be a compared and stringified fieldMetadata property"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-entity/constant/all-entity-properties-configuration-by-metadata-name.constant.ts" \
  "OMNIA-CUSTOM: relation sub-field table columns (contract C6)" \
  "viewField.subFieldName must stay a compared property (relation sub-field columns)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-entity/constant/all-entity-properties-configuration-by-metadata-name.constant.ts" \
  "OMNIA-CUSTOM: sidebar visibility and edit window columns (contracts C3, C4)" \
  "role showAllObjectsInSidebar/editWindowMinutes and objectPermission showInSidebar/editWindowMinutes must stay compared properties"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity.ts" \
  "scope" \
  "RLS predicates carry no scope in v2.58; grants live on rowLevelPermissionRule (G8)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity.ts" \
  "scope" \
  "RLS predicate groups carry no scope in v2.58 (G8)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-entity/constant/all-entity-properties-configuration-by-metadata-name.constant.ts" \
  "OMNIA-CUSTOM: app manifests must diff navigation target FKs" \
  "Navigation menu item target FKs must be included in app manifest diffs"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts" \
  "requiredCondition: JsonbProperty<RequiredCondition> | null" \
  "FieldMetadata entity must have requiredCondition JSONB column"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/field-metadata/dtos/field-metadata.dto.ts" \
  "requiredCondition?: RequiredCondition | null" \
  "FieldMetadata DTO must expose requiredCondition GraphQL field"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-editable-properties.constant.ts" \
  "requiredCondition" \
  "requiredCondition must be in editable properties"
check_file_contains \
  "packages/twenty-server/src/database/commands/agent-history/utils/get-legacy-agent-history-flat-field-metadatas.util.ts" \
  "OMNIA-CUSTOM: FlatFieldMetadata carries the requiredCondition column (cont" \
  "Omnia hunk (G2): FlatFieldMetadata carries the requiredCondition column (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-entity/types/__tests__/flat-entity-update.type-test.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-metadata/constants/partial-system-flat-field-metadatas.constant.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-metadata/utils/build-name-flat-field-metadata-for-custom-object.util.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/create-standard-field-flat-metadata.util.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/create-standard-relation-field-flat-metadata.util.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/__tests__/universal-flat-entity-update.test-type.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/workspace-migration/universal-flat-entity/types/metadata-universal-flat-entity-properties-to-compare.type.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/workspace-migration/universal-flat-entity/utils/__tests__/add-universal-flat-entity-to-universal-flat-entity-and-related-entity-maps-through-mutation-or-throw.util.spec.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/workspace-migration/universal-flat-entity/utils/__tests__/delete-universal-flat-entity-from-universal-flat-entity-and-related-entity-maps-through-mutation-or-throw.util.spec.ts" \
  "OMNIA-CUSTOM: soft required rule (contract C5)" \
  "Omnia hunk (G2): soft required rule (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/__tests__/flat-entity-to-scalar-flat-entity.util.spec.ts" \
  "OMNIA-CUSTOM: fieldMetadata carries requiredCondition (contract C5)" \
  "Omnia hunk (G2): fieldMetadata carries requiredCondition (contract C5)"

echo ""
echo "--- Pinned Delete: consolidated standard record commands (W4) ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500003000-omnia-consolidate-standard-delete-command-menu-items.command.ts" \
  "W4 upgrade command replacing the legacy split delete/restore/destroy command menu items"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500003000-omnia-consolidate-standard-delete-command-menu-items.command.ts" \
  "isPinned: true" \
  "W4 must pin the consolidated Delete command through a workspace override"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500003000-omnia-consolidate-standard-delete-command-menu-items.command.ts" \
  "shortLabel: 'Create {objectLabelSingular}'" \
  "W4 must label the index create button 'Create <object>' through a workspace override (Q9)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/legacy-split-record-command-menu-item-universal-identifiers.constant.ts" \
  "Universal identifiers of the six legacy split command menu items W4 deletes"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-workspace-command-1794500003000-omnia-consolidate-standard-delete-command-menu-items.command.spec.ts" \
  "W4 spec: consolidation, idempotency, kept overrides, other-application rows, dry run"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-cache/services/workspace-cache.service.ts" \
  "SLOW_WORKSPACE_CACHE_RESOLUTION_MS" \
  "Workspace cache service must keep the slow resolution warning (prod sets no METER_DRIVER)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-cache/services/workspace-cache.service.ts" \
  "SLOW_WORKSPACE_CACHE_RECOMPUTE_MS" \
  "Workspace cache service must keep slow recompute thresholds"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-cache/services/workspace-cache.service.ts" \
  "createSlowPathObserver" \
  "Workspace cache service must use the shared slow-path observer for full resolution timing"

echo ""
echo "--- Ingestion pipeline (v2.58 port) ---"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/jobs/ingestion-log-retention.cron.job.ts" \
  "HIPAA minimum necessary: ingestion logs keep pushed records (PHI) only until the daily sweep (completed runs) or 30 days (every run)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/jobs/ingestion-log-retention.cron.job.ts" \
  'SET "incomingPayload" = NULL' \
  "The retention sweep must clear the pushed records"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/commands/ingestion-log-retention.cron.command.ts" \
  "cron:ingestion-log:retention command must exist"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/constants/ingestion-log-retention-cron-pattern.constant.ts" \
  "Ingestion log retention cron pattern must exist"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module.ts" \
  "IngestionLogRetentionCronJob," \
  "IngestionPipelineModule must provide the retention job so the worker runs it"
check_file_contains \
  "packages/twenty-server/src/database/commands/cron-register-all.command.ts" \
  "name: 'IngestionLogRetention'," \
  "cron:register:all must register the ingestion log retention sweep"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/jobs/__tests__/ingestion-log-retention.cron.job.spec.ts" \
  "Omnia test: ingestion log retention sweep"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-log.resolver.ts" \
  "AccessPolicyGuard(INGESTION_LOG_READ_ACCESS_POLICY)" \
  "HIPAA: ingestion logs (raw pushed records, no record permissions) are readable by user sessions only"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-log.resolver.ts" \
  "MAX_INGESTION_LOGS_LIMIT" \
  "ingestionLogs must cap the caller's limit"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/__tests__/ingestion-log.resolver.spec.ts" \
  "Omnia test: ingestionLogs limit cap"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-log-read-access-policy.constant.ts" \
  "apiKey: false," \
  "API keys must never read ingestion logs"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-log-read-access-policy.constant.ts" \
  "application: false," \
  "Applications must never read ingestion logs"
check_file_contains \
  "packages/twenty-server/test/integration/endpoint-permissions/__snapshots__/endpoint-permission-declarations.integration-spec.ts.snap" \
  'IngestionLogResolver.ingestionLogs {"acceptedAuthPrincipals":{"apiKey":false,' \
  "Endpoint permission snapshot must keep ingestionLogs at user sessions only"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-webhook-secret-header.constant.ts" \
  "Push webhook secret header name (x-webhook-secret, header only per Q19)"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/filters/ingestion-pipeline-rest-api-exception.filter.ts" \
  "REST exception filter for the push webhook (403 bad secret or disabled, 404 unknown pipeline)"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-pipeline-exception-status-code.util.ts" \
  "Maps ingestion exception codes to the webhook's HTTP status codes"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/filters/__tests__/ingestion-pipeline-rest-api-exception.filter.spec.ts" \
  "Spec for the push webhook's HTTP status codes"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/__tests__/is-valid-ingestion-webhook-secret.util.spec.ts" \
  "Spec for the required, constant-time webhook secret check"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/__tests__/get-ingestion-error-log-label.util.spec.ts" \
  "Spec that keeps ORM error messages (which can echo PHI) out of server logs"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/__tests__/ingestion-pipeline.resolver.trigger-pull.spec.ts" \
  "Spec for the manual pull trigger (workspace-scoped job, one log per trigger)"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/__tests__/convoso-lead.preprocessor.spec.ts" \
  "Spec for the Convoso lead preprocessor (ORM v2 save() rows)"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/__tests__/old-crm-policy.preprocessor.spec.ts" \
  "Spec for the old CRM preprocessor (ORM v2 save() rows, SSRF-safe client, no member details in logs)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller.ts" \
  "@UseFilters(IngestionPipelineRestApiExceptionFilter)" \
  "Push webhook must map ingestion exceptions to 403/404/400 instead of a generic 500"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor.ts" \
  '${payload.application_id}' \
  "HealthSherpa logs must not carry the application id (it becomes Policy.policyNumber)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-pipeline.resolver.ts" \
  "logId: log.id," \
  "Manual pull trigger must hand its log to the job, or the returned log stays pending forever"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job.ts" \
  "data.logId ??" \
  "Pull job must complete the manual trigger's log instead of creating a second one"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-cache/services/workspace-cache.service.ts" \
  "Slow workspace cache rows load" \
  "Workspace cache must log slow batched rows loads (outside the per-provider timer; covers invalidateAndRecompute)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service.ts" \
  "isDuplicateEntryError(error)" \
  "Record processor must turn duplicate-entry insert races into updates (v2.58 wraps unique violations in TwentyOrmException)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service.ts" \
  "23505" \
  "Record processor must not match raw Postgres codes: v2.58 never surfaces them, so race duplicates would count as failures"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor.ts" \
  "isDuplicateEntryError(error)" \
  "HealthSherpa Person create must retry without email on a duplicate entry"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service.ts" \
  "GlobalWorkspaceOrmManager" \
  "Ingestion must use the v2.58 WorkspaceOrmManager"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service.ts" \
  "GlobalWorkspaceOrmManager" \
  "Ingestion must use the v2.58 WorkspaceOrmManager"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job.ts" \
  "GlobalWorkspaceOrmManager" \
  "Ingestion must use the v2.58 WorkspaceOrmManager"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-push-process.job.ts" \
  "GlobalWorkspaceOrmManager" \
  "Ingestion must use the v2.58 WorkspaceOrmManager"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor.ts" \
  "GlobalWorkspaceOrmManager" \
  "Ingestion must use the v2.58 WorkspaceOrmManager"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-lead.preprocessor.ts" \
  "GlobalWorkspaceOrmManager" \
  "Ingestion must use the v2.58 WorkspaceOrmManager"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor.ts" \
  "GlobalWorkspaceOrmManager" \
  "Ingestion must use the v2.58 WorkspaceOrmManager"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/old-crm-policy.preprocessor.ts" \
  "GlobalWorkspaceOrmManager" \
  "Ingestion must use the v2.58 WorkspaceOrmManager"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service.ts" \
  "const [created] = await repository.save({" \
  "Auto-created relations must read the id from the saved rows (save() returns an array in v2.58)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor.ts" \
  "const [created] = await personRepo.save(personData);" \
  "Convoso call Person create must read the id from the saved rows, or call.leadId is lost (compliance-qa)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor.ts" \
  "const [created] = await leadSourceRepo.save(data);" \
  "Convoso call Lead Source create must read the id from the saved rows"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-lead.preprocessor.ts" \
  "const [created] = await leadSourceRepo.save({" \
  "Convoso lead Lead Source create must read the id from the saved rows"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor.ts" \
  "const [createdPerson] = await personRepo.save(personData);" \
  "HealthSherpa Person create must read the id from the saved rows"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/old-crm-policy.preprocessor.ts" \
  "const [created] = await carrierRepo.save({ name: trimmedName });" \
  "Old CRM Carrier create must read the id from the saved rows (Person/Product/Lead Source use the same shape)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/old-crm-policy.preprocessor.ts" \
  "as Record<string, unknown>).id" \
  "No cast-around of the save() result: it would link undefined relation ids"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/healthsherpa-policy.preprocessor.ts" \
  "as Record<string, unknown>).id" \
  "No cast-around of the save() result: it would link undefined relation ids"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor.ts" \
  "as Record<string, unknown>).id" \
  "No cast-around of the save() result: it would link undefined relation ids"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-pipeline.resolver.ts" \
  "@UseGuards(AccessPolicyGuard(INGESTION_PIPELINE_WRITE_ACCESS_POLICY))" \
  "Ingestion pipeline mutations need the ingestion write access policy"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-pipeline.resolver.ts" \
  "@UseGuards(AccessPolicyGuard(INGESTION_PIPELINE_READ_ACCESS_POLICY))" \
  "Ingestion pipeline queries need the ingestion read access policy"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-field-mapping.resolver.ts" \
  "@UseGuards(AccessPolicyGuard(INGESTION_PIPELINE_WRITE_ACCESS_POLICY))" \
  "Field mapping mutations need the ingestion write access policy"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-log.resolver.ts" \
  "@UseGuards(AccessPolicyGuard(INGESTION_LOG_READ_ACCESS_POLICY))" \
  "Ingestion logs (incoming payloads hold PHI) need the user-session-only ingestion log read policy"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-read-access-policy.constant.ts" \
  "requiredPermissionFlags: [PermissionFlagType.API_KEYS_AND_WEBHOOKS]" \
  "Ingestion read access requires API_KEYS_AND_WEBHOOKS"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-write-access-policy.constant.ts" \
  "requiredPermissionFlags: [PermissionFlagType.API_KEYS_AND_WEBHOOKS]" \
  "Ingestion write access requires API_KEYS_AND_WEBHOOKS"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/__tests__/ingestion-resolvers.access-policy.spec.ts" \
  "Spec that pins the access policy of every ingestion Query/Mutation and fails on an unlisted one"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-field-mapping.service.ts" \
  "pipeline: { workspaceId, deletedAt: IsNull() }" \
  "Field mappings are read and written only through a pipeline of the caller's workspace"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service.ts" \
  "pipeline: { workspaceId, deletedAt: IsNull() }" \
  "Ingestion logs (incoming payloads hold PHI) are read only through a pipeline of the caller's workspace"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller.ts" \
  "isWorkspaceJob: true" \
  "Push webhook must enqueue a workspace-scoped job"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-pipeline.resolver.ts" \
  "isWorkspaceJob: true" \
  "Manual pull trigger must enqueue a workspace-scoped job"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller.ts" \
  "providedSecret: request.headers[INGESTION_WEBHOOK_SECRET_HEADER]" \
  "Push webhook reads the secret from the x-webhook-secret header only"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller.ts" \
  "request.query" \
  "Push webhook must not accept ?secret= (secrets in URLs land in access logs)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/is-valid-ingestion-webhook-secret.util.ts" \
  "timingSafeEqual(providedSecretBuffer, expectedSecretBuffer)" \
  "Push webhook secret must be compared in constant time"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/is-valid-ingestion-webhook-secret.util.ts" \
  '!isNonEmptyString(expectedSecret)' \
  "A pipeline without a webhook secret must reject every push (the endpoint is public)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller.ts" \
  "@UseGuards(PublicEndpointGuard, NoPermissionGuard)" \
  "Push webhook stays a public endpoint authenticated by its secret (upstream messaging-webhooks pattern)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job.ts" \
  "this.secureHttpClientService.getHttpClient({" \
  "Pull job must call the admin-configured source URL through the SSRF-safe client"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/old-crm-policy.preprocessor.ts" \
  "this.secureHttpClientService.getHttpClient().get<{" \
  "Old CRM lead details (URL derived from the admin-configured source URL) must use the SSRF-safe client"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-error-log-label.util.ts" \
  "Logs only the ORM error code (messages can echo a rejected value such as a DOB)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service.ts" \
  "getIngestionErrorLogLabel(error)" \
  "Per-record ingestion failures must not log ORM messages (they can echo PHI); the ingestion log keeps the message"
check_file_not_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-job.module.ts" \
  "IngestionJobModule was folded into IngestionPipelineModule (one provider graph)"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-auth-env-vars.constant.ts" \
  "Allowlist of server env vars a pull pipeline may send as query_param auth, with the hosts each may reach"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-auth-env-vars.constant.ts" \
  "{ envVarName: 'CONVOSO_API_TOKEN', hostnames: ['api.convoso.com'] }" \
  "The Convoso token (PHI-bearing API) may only be sent to the Convoso API"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/is-allowed-ingestion-pipeline-auth-env-var.util.ts" \
  "Decides whether a pipeline may send an env var to its source URL"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/is-allowed-ingestion-pipeline-auth-env-var.util.ts" \
  "url.protocol === 'https:' &&" \
  "Env-sourced credentials only travel over https"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/utils/__tests__/is-allowed-ingestion-pipeline-auth-env-var.util.spec.ts" \
  "Spec for the env var allowlist (other names, other hosts, http, userinfo tricks)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job.ts" \
  "isAllowedIngestionPipelineAuthEnvVar({" \
  "Pull job reads a server env var only for an allowed name and host (envVar and sourceUrl are API input)"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/jobs/ingestion-pull.job.ts" \
  "process.env[auth.envVar]" \
  "applyAuth must never read an env var named by pipeline config: it let API callers exfiltrate APP_SECRET, PG_DATABASE_URL and the like"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pipeline.service.ts" \
  "this.assertSourceAuthEnvVarIsAllowed({" \
  "Pipeline create and source updates reject a disallowed env var and source URL pair"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/__tests__/ingestion-pull-scheduler.service.spec.ts" \
  "Spec for the pull-schedule re-sync (no module-init re-sync)"
check_file_contains \
  "packages/twenty-server/test/integration/metadata/suites/field-metadata/create-and-delete-field-metadata-search-vector-side-effect.integration-spec.ts" \
  "OMNIA-CUSTOM: custom fields join search by default (Q14), so this field opts out" \
  "Upstream search-surface spec must opt its extra field out of Omnia's searchable-by-default (Q14)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-content/utils/__tests__/build-application-content-from-flat-entity-maps.util.spec.ts" \
  "OMNIA-CUSTOM: FlatViewField carries the relation sub-field column" \
  "Application content spec FlatViewField literal must include subFieldName"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service.ts" \
  "buildDedupWhereClause" \
  "Record processor must support composite (multi-field) dedup via dedupFieldNames"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/time-card.preprocessor.ts" \
  "TimeCardPreprocessor (N→M batch aggregation of Convoso productivity events)"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/seed-convoso-time-card-pipeline.command.ts" \
  "Time Card ingestion seed command"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/ingestion-preprocessor.registry.ts" \
  "preProcessBatch" \
  "Preprocessor registry must support optional batch hook for N→M aggregation"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/ingestion-preprocessor.registry.ts" \
  "timeCardPreprocessor" \
  "Preprocessor registry must route Time Card / agent productivity pipelines to TimeCardPreprocessor"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor.ts" \
  "OMNIA-CUSTOM: inbound calls assigned to the System agent never reached" \
  "Convoso call billing must keep System-handled inbound calls non-billable"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor.ts" \
  "isSystemHandledInbound" \
  "Convoso call preprocessor must reuse the System-handled inbound signal for agent assignment and billing"

echo ""
echo "--- Metadata store: minimal metadata (upstream-native guard) ---"
check_file_contains \
  "packages/twenty-front/src/modules/metadata-store/hooks/useLoadMinimalMetadata.ts" \
  ".status === 'empty'" \
  "useLoadMinimalMetadata must treat missing hashes as stale when local store is empty (Redis flush fix)"

# ======================================================================
# Server query API: nested relations, metadata cache, events, one-to-many filters
# ======================================================================
echo ""
echo "=== Server query API: nested relations, metadata cache, events, one-to-many filters ==="

echo ""
echo "--- Query API: SSE event read scoping (upstream-native, HIPAA tripwires) ---"
check_file_contains \
  "packages/twenty-server/src/engine/subscriptions/object-record-event/object-record-event-publisher.ts" \
  "filterReadableEvents" \
  "HIPAA: SSE events filtered by read permissions"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/record-event-permissions-read.service.ts" \
  "operationType: 'read'" \
  "HIPAA: SSE event visibility must be checked with read-operation record permissions (object grants, RLS rules, shares, private records)"
check_file_contains \
  "packages/twenty-server/src/engine/subscriptions/object-record-event/object-record-event-publisher.ts" \
  "...copyEventRecords(event)," \
  "HIPAA: each SSE subscriber enriches its own record copies, so relations loaded with one subscriber's permissions never reach another's payload (or the shared batch)"
check_file_exists \
  "packages/twenty-server/src/engine/subscriptions/object-record-event/utils/copy-event-records.util.ts" \
  "Per-subscriber shallow copies of an event's before/after records for SSE relation enrichment"
check_file_exists \
  "packages/twenty-server/src/engine/subscriptions/object-record-event/__tests__/object-record-event-publisher-omnia.spec.ts" \
  "HIPAA regression spec: two SSE subscribers on one batch; the later one never receives relations loaded for the earlier one"

echo ""
echo "--- Merge Many: hidden-field guards (upstream; replaces the retired Omnia strip) ---"
check_file_contains \
  "packages/twenty-server/src/engine/api/common/common-query-runners/common-merge-many-query-runner.service.ts" \
  "assertMergeKeepsUnreadableFieldValuesOrThrow" \
  "HIPAA: merge must refuse to destroy values in fields the requester cannot read"
check_file_contains \
  "packages/twenty-server/src/engine/api/common/common-query-runners/common-merge-many-query-runner.service.ts" \
  'deletedRecords.length !== idsToDelete.length' \
  "RLS: merge must refuse when the role cannot delete every duplicate it read"

echo ""
echo "--- Nested relations: depth-2 fix ---"
check_file_contains \
  "packages/twenty-server/src/engine/api/common/common-nested-relations-processor/process-nested-relations.helper.ts" \
  "policy.lead.leadSource" \
  "Nested relation loading must assign many-to-one rows after the nested recursion (depth-2 sub-field columns like Policy / Lead / Lead Source) and one-to-many rows before it"
check_file_exists \
  "packages/twenty-server/src/engine/api/common/common-nested-relations-processor/__tests__/process-nested-relations.helper.spec.ts" \
  "Regression spec: depth-2 many-to-one relations (policy.lead.leadSource) survive nested loading, and one-to-many children of a soft-deleted parent are kept"
check_file_contains \
  "packages/twenty-server/src/engine/api/common/common-nested-relations-processor/process-nested-relations.helper.ts" \
  "const assignRelationResults = () =>" \
  "processRelation() assigns through one closure: one-to-many before the nested recursion, many-to-one after it"

echo ""
echo "--- Metadata response cache ---"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/constants/metadata-graphql-operations-to-cache.constant.ts" \
  "FindFieldsWidgetViews: {" \
  "Metadata response cache must include FindFieldsWidgetViews (the fields-widget boot query)"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/constants/metadata-graphql-operations-to-cache.constant.ts" \
  "FindAllRecordPageLayouts: {" \
  "Metadata response cache must include FindAllRecordPageLayouts (the record page-layout boot query)"
check_file_not_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/constants/metadata-graphql-operations-to-cache.constant.ts" \
  "FindManyLogicFunctions" \
  "FindManyLogicFunctions must never be cached: the response is filtered per calling application"
check_file_exists \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/__tests__/use-cached-metadata-omnia.spec.ts" \
  "Omnia metadata cache spec (principal bypass, slow-miss log, cached op scopes)"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/__tests__/use-cached-metadata-omnia.spec.ts" \
  "expect(FindFieldsWidgetViews.scope).toBe('userWorkspace');" \
  "FindFieldsWidgetViews must stay user-scoped (view visibility is per user); the spec pins the scope"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts" \
  "if (isDefined(request.apiKey) || isDefined(request.application)) {" \
  "API keys and applications must never read or write the metadata response cache"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts" \
  "SLOW_METADATA_CACHE_MISS_MS" \
  "Metadata cache hook must keep slow cache-miss timing warnings"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/observability/utils/slow-path-observer.util.ts" \
  "createSlowPathObserver" \
  "Shared slow-path observer utility must remain available for cheap thresholded timing logs"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/observability/utils/slow-path-observer.util.ts" \
  "warnIfSlowDuration" \
  "Shared slow-path observer utility must keep the single-duration warning helper"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts" \
  "warnIfSlowDuration" \
  "Metadata cache hook must use the shared slow-path helper for slow cache misses"
check_file_not_contains \
  "packages/twenty-server/src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/input-types/relation-field-metadata-gql-type.generator.ts" \
  "OneToManyFilter" \
  "One-to-many relation filter SDL types must not come back into create/update inputs (dropped in the v2.58 merge)"
check_file_contains \
  "packages/twenty-front/src/modules/views/graphql/queries/findFieldsWidgetViews.ts" \
  "query FindFieldsWidgetViews(" \
  "Server metadata cache keys on this op name (metadata-graphql-operations-to-cache.constant.ts)"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/graphql/queries/findAllRecordPageLayouts.ts" \
  "query FindAllRecordPageLayouts {" \
  "Server metadata cache keys on this op name (metadata-graphql-operations-to-cache.constant.ts)"
check_file_exists \
  "packages/twenty-server/test/integration/metadata/suites/graphql-operation-cache/omnia-metadata-graphql-operations-cache-dependencies.integration-spec.ts" \
  "Integration spec: FindAllRecordPageLayouts declares every flat map its resolvers read (a missing one serves stale layouts until CACHE_STORAGE_TTL)"

echo ""
echo "--- One-to-many relation filters: upstream server parser + W5 view filter migration (sqa U4, ftv U17) ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query-filter/graphql-query-filter-field.parser.ts" \
  "parseOneToManyRelationFilter" \
  "to-many filters are upstream EXISTS with target RLS; do not reintroduce raw SQL"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500004000-omnia-migrate-one-to-many-view-filters.command.ts" \
  "W5: moves Omnia one-to-many view filters (target field name in subFieldName) onto relationTargetFieldMetadataId"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500004000-omnia-migrate-one-to-many-view-filters.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1794500004000)" \
  "W5 must keep 2.58.0/1794500004000: after W4 (1794500003000), before W9 (1794500009000)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500004000-omnia-migrate-one-to-many-view-filters.command.ts" \
  "'flatViewFilterMaps'" \
  "W5 must recompute the flat view filter maps after it rewrites view filters"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-workspace-command-1794500004000-omnia-migrate-one-to-many-view-filters.command.spec.ts" \
  "W5 spec: rewrite, stray sub-field clear, delete, dry run, no-op, report-only JSON filters, no filter values in logs"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/get-one-to-many-record-filter-fix.util.ts" \
  "W5 classifier shared by view filters and the chart/workflow report"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/build-one-to-many-relation-filter-lookup.util.ts" \
  "W5 lookup of one-to-many relation fields and active target fields (effective isActive)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/__tests__/get-one-to-many-record-filter-fix.util.spec.ts" \
  "W5 classifier spec"

# ======================================================================
# Search and AI (HIPAA)
# ======================================================================
echo ""
echo "=== Search and AI (HIPAA) ==="

echo ""
echo "--- Global search: upstream permissions + Omnia search layer (HIPAA) ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "shouldBypassPermissionChecks" \
  "HIPAA: global search must honour RLS and field permissions (no permission bypass)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "getRepositoryWithoutPermissionChecks" \
  "HIPAA: global search must honour RLS and field permissions (permission-checked repositories only)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "} catch {" \
  "Search must not swallow every per-object error; only PermissionsException is skipped"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "normalizeSearchInput(" \
  "Formatted phone numbers must collapse to digits before tokenizing (call site was dropped silently on 2026-03-04)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "shouldRunIlikeFallback(" \
  "Digit fragments (phone endings, policy number middles) must reach upstream's substring fallback"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "if (error instanceof PermissionsException) {" \
  "Search must skip an object the caller cannot read instead of failing the whole search"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "...recordsWithObjectMetadataItems.filter(isDefined)" \
  "Skipped (unreadable) objects must be dropped before results are built"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/search/utils/normalize-search-input.ts" \
  "Phone-number search input normalization (phone-shaped input only)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/utils/normalize-search-input.ts" \
  "GROUPED_PHONE_DIGITS_PATTERN.test(trimmedSearchInput)" \
  "Normalization must stay limited to phone-shaped input so policy numbers like 123456-01 stay as typed"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/search/utils/__tests__/normalize-search-input.spec.ts" \
  "Spec for phone-number search input normalization"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/search/utils/should-run-ilike-fallback.ts" \
  "Omnia substring-fallback trigger (CJK or digit fragment)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/utils/should-run-ilike-fallback.ts" \
  "hasCjkCharacters(searchInput) ||" \
  "Fallback trigger must keep upstream's CJK condition"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/search/utils/__tests__/should-run-ilike-fallback.spec.ts" \
  "Spec for the substring-fallback trigger"
check_file_exists \
  "packages/twenty-server/test/integration/graphql/suites/object-records-permissions/omnia-search-row-level-permissions.integration-spec.ts" \
  "HIPAA: global search must honour row-level rules and skip unreadable objects"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "canAccessSomeRecords" \
  "No readable-object pre-filter in search: canAccessSomeRecords ignores creator and share grants (plan 4.4 U1); the repository decides"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "unaccent_immutable(strip(" \
  "Substring fallback must match indexed words only; without strip() a 3-5 digit fragment also matches tsvector positions of long records"
check_file_contains \
  "packages/twenty-server/test/integration/graphql/suites/object-records-permissions/omnia-search-row-level-permissions.integration-spec.ts" \
  "searchInput: PHONE_FRAGMENT" \
  "HIPAA: the search RLS spec must also exercise the substring-fallback path (runInWorkspaceTransaction), not only full-text search"
check_file_contains \
  "packages/twenty-server/test/integration/graphql/suites/object-records-permissions/omnia-search-row-level-permissions.integration-spec.ts" \
  "not tsvector positions" \
  "The search spec must keep the strip() regression case"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts" \
  "or a digit fragment of 3 or more digits" \
  "Ops sizes SEARCH_ILIKE_FALLBACK_TIMEOUT_MS from this description; digit fragments also reach the fallback"

echo ""
echo "--- AI: telemetry ceiling and Bedrock catalog (HIPAA, BAA) ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/tool-provider/providers/action-tool.provider.ts" \
  "OMNIA-CUSTOM: no search_help_center" \
  "HIPAA (no BAA): the help center search posts model-written queries (which can quote PHI) to docs.twenty.com; it gets no descriptor"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/tool-provider/providers/action-tool.provider.ts" \
  "        'search_help_center'," \
  "The search_help_center descriptor must stay out of generateDescriptors (it is what lets the tool load and run)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/tool-provider/constants/common-preload-tools.const.ts" \
  "'search_help_center'" \
  "search_help_center must not be preloaded into AI chats or MCP"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/tool-provider/providers/__tests__/action-tool.provider.spec.ts" \
  "Omnia test: the action tool catalog never offers search_help_center"
check_file_contains \
  "packages/twenty-server/test/integration/ai/suites/mcp-tool-catalog.integration-spec.ts" \
  "expect(toolNames).not.toContain('search_help_center');" \
  "MCP catalog integration spec must assert the docs search is not offered"
check_file_exists \
  "packages/twenty-front/src/modules/ai/utils/isMarkdownImageSourceAllowed.ts" \
  "HIPAA: AI markdown images load only from the app or server origin (an image needs no click to send a URL)"
check_file_contains \
  "packages/twenty-front/src/modules/ai/components/MarkdownRenderer.tsx" \
  "isMarkdownImageSourceAllowed(src) ?" \
  "AI markdown must render only first-party images"
check_file_exists \
  "packages/twenty-front/src/modules/ai/utils/__tests__/isMarkdownImageSourceAllowed.test.ts" \
  "Omnia test: first-party markdown image sources"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/utils/build-ai-telemetry.util.ts" \
  "recordInputs: false" \
  "buildAiTelemetry must hard-code recordInputs: false; the workspace AI data policy defaults to recording PHI prompts"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/utils/build-ai-telemetry.util.ts" \
  "recordOutputs: false" \
  "buildAiTelemetry must hard-code recordOutputs: false; the workspace AI data policy defaults to recording PHI responses"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/utils/build-ai-telemetry.util.ts" \
  "recordInputs: isContentRecordingAllowed" \
  "Upstream's policy-driven recordInputs must not come back; it records PHI by default"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/utils/build-ai-telemetry.util.ts" \
  "recordOutputs: isContentRecordingAllowed" \
  "Upstream's policy-driven recordOutputs must not come back; it records PHI by default"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/utils/__tests__/build-ai-telemetry.util.spec.ts" \
  "Omnia HIPAA ceiling" \
  "Upstream spec must assert the HIPAA ceiling, not upstream's record-by-default"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-evaluation/services/native-evaluation.runner.ts" \
  "buildAiTelemetry({ functionId: 'ai-evaluation'" \
  "Evaluation runner must pass HIPAA-capped telemetry; AI SDK defaults record content when no telemetry is passed"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-evaluation/services/ai-evaluation.service.ts" \
  "isAiContentRecordingAllowed(aiDataPolicy)" \
  "Evaluation service must hand the runner its telemetry context (HIPAA telemetry ceiling)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/__tests__/ai-sdk-call-sites.spec.ts" \
  "routes every model call site through buildAiTelemetry (Omnia HIPAA ceiling)" \
  "Call-site spec must fail when a model-calling file skips buildAiTelemetry"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/ai-providers.json" \
  '"authType": "role"' \
  "Built-in Bedrock catalog entry must use role auth (EKS Pod Identity, no AWS keys in the cluster)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/ai-providers.json" \
  '"name": "us.anthropic.claude-opus-4-7"' \
  "Bedrock catalog must keep the model pinned by AI_MODELS_DEFAULT_EXTRA_SMART"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/ai-providers.json" \
  '"name": "us.anthropic.claude-sonnet-4-6"' \
  "Bedrock catalog must keep the model pinned by AI_MODELS_DEFAULT_BALANCED/SMART"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/ai-providers.json" \
  '"name": "us.anthropic.claude-haiku-4-5-20251001-v1:0"' \
  "Bedrock catalog must keep the model pinned by AI_MODELS_DEFAULT_EXTRA_FAST/FAST"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/ai-providers.json" \
  '"@ai-sdk/amazon-bedrock"' \
  "AI provider catalog must include native Bedrock entry (HIPAA-clean path via AWS BAA)"
check_file_exists \
  "packages/twenty-server/scripts/ai-catalog-sync/__tests__/split-omnia-hand-maintained-providers.util.spec.ts" \
  "Omnia test from the v2.58 merge (G2): split-omnia-hand-maintained-providers.util.spec.ts"
check_file_exists \
  "packages/twenty-server/scripts/ai-catalog-sync/constants/omnia-hand-maintained-provider-names.constant.ts" \
  "Provider names the AI catalog sync carries over by hand (the Bedrock route)"
check_file_exists \
  "packages/twenty-server/scripts/ai-catalog-sync/utils/split-omnia-hand-maintained-providers.util.ts" \
  "Splits the hand-maintained Bedrock provider out of the generated catalog so a sync keeps it"
check_file_contains \
  "packages/twenty-server/scripts/ai-catalog-sync/__tests__/self-host-projection.spec.ts" \
  "OMNIA-CUSTOM: the hand-maintained Bedrock route is outside the projection" \
  "Omnia hunk (G2): the hand-maintained Bedrock route is outside the projection"
check_file_contains \
  "packages/twenty-server/scripts/ai-catalog-sync/index.ts" \
  "OMNIA-CUSTOM: carry the hand-maintained Bedrock route over, since the proj" \
  "Omnia hunk (G2): carry the hand-maintained Bedrock route over, since the projection never produces it"

echo ""
echo "--- Search surface: upstream isSearchable + Omnia one-time backfill (W2) ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.ts" \
  "W2: one-time backfill restoring the all-searchable-fields search surface of workspace custom objects (policy numbers, application ids)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1794500001000)" \
  "W2 must keep its 2.58.0 registration and timestamp (plan 4.0.3)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.ts" \
  "upgrade:2-58:omnia-backfill-custom-object-search-fields" \
  "W2 must keep its command name"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.ts" \
  "invalidateAndRecompute" \
  "W2 must recompute stale flat maps before deduping, or it trips IDX_SEARCH_FIELD_METADATA_FIELD_OBJECT_UNIQUE"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.ts" \
  "validateBuildAndRunLegacyWorkspaceMigration" \
  "W2 must write rows through the legacy migration path (no side-effect engine), like upstream 2-16"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/build-omnia-custom-object-search-field-metadata-backfill-operations.util.ts" \
  "isCustomObjectSearchVectorField" \
  "Backfill must enumerate all active searchable custom fields, not just the label identifier"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/build-omnia-custom-object-search-field-metadata-backfill-operations.util.ts" \
  "resolveEffectiveFlatEntityProperty" \
  "Backfill must read the effective isActive so fields deactivated through an override stay out of search (HIPAA)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/__tests__/build-omnia-custom-object-search-field-metadata-backfill-operations.util.spec.ts" \
  "Spec for the W2 backfill rows (predicate, scope, dedupe, positions)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.spec.ts" \
  "Spec for the W2 command (stale-map recompute, dry run writes nothing)"
check_file_not_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/2-18/2-18-workspace-command-1799200002000-backfill-custom-object-search-fields.command.ts" \
  "The 2-18 search backfill moved to omnia/ as W2; a second copy would run the backfill twice under two names"
check_file_not_exists \
  "packages/twenty-server/src/engine/metadata-modules/search-field-metadata/utils/build-custom-object-search-field-metadatas.util.ts" \
  "Deleted Omnia helper: search coverage is upstream isSearchable rows plus W2"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/constants/ai-telemetry.constant.ts" \
  "recordInputs: false" \
  "AI telemetry constant must not record prompt inputs — CRM prompts contain PHI (upstream default is true)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/constants/ai-telemetry.constant.ts" \
  "recordOutputs: false" \
  "AI telemetry constant must not record model outputs — responses contain PHI (upstream default is true)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/build-omnia-custom-object-search-field-metadata-backfill-operations.util.ts" \
  "readRestrictedFieldMetadataIds.has(flatFieldMetadata.id)" \
  "HIPAA: W2 must not index a field some role cannot read; search matches searchVector in WHERE, where field permissions never apply"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/utils/build-omnia-custom-object-search-field-metadata-backfill-operations.util.ts" \
  "canReadFieldValue === false" \
  "W2 must treat any read restriction, object level or rule level, as a reason to leave the field out of search"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.ts" \
  "flatFieldPermissionMaps," \
  "W2 must hand the workspace field permissions to the backfill util"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command.ts" \
  "only run it by hand to recover a skipped upgrade" \
  "W2 is one-time: a later standalone run re-adds fields that admins removed from search"
check_file_contains \
  "packages/twenty-server/test/integration/metadata/suites/field-metadata/searchable-field/update-one-searchable-field-metadata.integration-spec.ts" \
  "OMNIA-CUSTOM: custom fields join search by default (Q14), so start opted o" \
  "Omnia hunk (G2): custom fields join search by default (Q14), so start opted out"

echo ""
echo "--- Policy search: derived name + policy number ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts" \
  "buildPolicyDisplayName" \
  "Policy create hook must keep deriving display name from carrier/product"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-one.pre-query.hook.ts" \
  "buildPolicyDisplayName" \
  "Policy update hook must keep deriving display name from carrier/product"

# ======================================================================
# Omnia server modules: policy, call and person hooks, agent profile, dashboards, rollups, reconciliation
# ======================================================================
echo ""
echo "=== Omnia server modules: policy, call and person hooks, agent profile, dashboards, rollups, reconciliation ==="

echo ""
echo "--- Agent profile resolver and assignment ---"
check_file_contains \
  "packages/twenty-server/src/modules/agent-profile/agent-profile.module.ts" \
  "AgentProfileAssignmentService" \
  "AgentProfileModule must provide and export the upsert-aware assignment service used by the policy, call and person create hooks"
check_file_not_contains \
  "packages/twenty-server/src/modules/agent-profile/agent-profile.module.ts" \
  "TypeOrmModule" \
  "AgentProfileModule reads flat metadata maps through WorkspaceCacheModule, not TypeORM metadata entities"
check_file_contains \
  "packages/twenty-server/src/modules/agent-profile/services/agent-profile-resolver.service.ts" \
  "getJoinColumnNameForRelationField" \
  "Agent profile resolver must take the workspaceMember join column from the relation settings"
check_file_not_contains \
  "packages/twenty-server/src/modules/agent-profile/services/agent-profile-resolver.service.ts" \
  "InjectRepository" \
  "Agent profile resolver must read flat metadata maps from the workspace cache, not TypeORM metadata repositories"
check_file_exists \
  "packages/twenty-server/src/modules/agent-profile/services/agent-profile-assignment.service.ts" \
  "Agent profile assignment service (stamps the caller's agent profile on rows that will be inserted)"
check_file_contains \
  "packages/twenty-server/src/modules/agent-profile/services/agent-profile-assignment.service.ts" \
  "isUserAuthContext(authContext)" \
  "Agent auto-assign must only stamp for user contexts (API keys, apps and system writes keep their payload)"
check_file_exists \
  "packages/twenty-server/src/modules/agent-profile/services/__tests__/agent-profile-assignment.service.spec.ts" \
  "Regression tests: upserted rows that match an existing record keep their owner"
check_file_contains \
  "packages/twenty-server/src/modules/agent-profile/services/__tests__/agent-profile-assignment.service.spec.ts" \
  "keeps the owner of an upserted row" \
  "Assignment spec must cover upsert matches by id and by unique field"
check_file_exists \
  "packages/twenty-server/src/modules/agent-profile/services/__tests__/agent-profile-resolver.service.spec.ts" \
  "Agent profile resolver regression tests"
check_file_contains \
  "packages/twenty-server/src/modules/agent-profile/services/agent-profile-resolver.service.ts" \
  "({ name }) => name === 'workspaceMember'" \
  "Agent profile resolver must pick the relation named workspaceMember (agentProfile.manager also targets workspaceMember), the same one the C2 RLS hop reads, or auto-assign stamps the wrong agent"
check_file_contains \
  "packages/twenty-server/src/modules/agent-profile/services/__tests__/agent-profile-resolver.service.spec.ts" \
  "reads the workspaceMember relation, not manager" \
  "Resolver spec must cover the manager relation that also targets workspaceMember"
check_file_contains \
  "packages/twenty-server/src/modules/agent-profile/services/agent-profile-assignment.service.ts" \
  "findUpsertMatchingRecordIds" \
  "Agent auto-assign must skip upserted rows that match a stored record"
check_file_exists \
  "packages/twenty-server/src/modules/agent-profile/agent-profile.module.ts" \
  "AgentProfile module registration"
check_file_exists \
  "packages/twenty-server/src/modules/agent-profile/services/agent-profile-resolver.service.ts" \
  "AgentProfile resolver service"

echo ""
echo "--- Policy write authorization (engine RLS + edit window) ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "Editing this record violates row-level security." \
  "PolicyWriteAuthorizationService must throw the generic RLS denial before the edit-window denial"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "assertUserMayUpdatePolicies" \
  "Policy update authorization entry point used by the policy update hooks and reconciliation batch apply"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "findPolicyUpdateDenials" \
  "Per-policy denial reasons for batch callers (reconciliation skips and counts)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "resolvePermissionsPrincipals" \
  "Policy ownership must use principals resolved from the user-shaped auth context (contract C10)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "filterGrantedRecordIds" \
  "Policy ownership must be decided by the permission engine, not a hand-rolled predicate check (contract C10)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "resolveEditWindowMinutes" \
  "Edit window must resolve object override, then role default, through contract C3"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "STANDARD_ROLE.admin.universalIdentifier" \
  "Edit-window admin bypass must key on the standard admin role universal identifier, never a label"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "resolveUserWorkspacePermissionsPrincipalsOrThrow" \
  "Its principal carries no workspace member, so every 'Me' predicate becomes unsatisfiable (contract C10)"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "RowLevelPermissionPredicateScope" \
  "Scoped RLS predicates are gone in v2.58 (rule grants, contract C1)"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "rolesPermissions" \
  "The v2.58 rolesPermissions cache carries no predicates or edit window; reading it fails open"
check_file_exists \
  "packages/twenty-server/src/modules/policy/types/policy-update-target.type.ts" \
  "PolicyUpdateTarget type (id, createdAt) for policy update authorization"
check_file_exists \
  "packages/twenty-server/src/modules/policy/types/policy-update-denial.type.ts" \
  "PolicyUpdateDenial type (row-level-security or edit-window per policy)"
check_file_exists \
  "packages/twenty-server/src/modules/policy/services/__tests__/policy-write-authorization.service.spec.ts" \
  "Policy update authorization regression tests (RLS before window, admin bypass, unassigned policies)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/__tests__/policy-write-authorization.service.spec.ts" \
  "editWindowMinutes: 15" \
  "Policy update authorization tests must cover a role-configured per-object edit window"
check_file_exists \
  "packages/twenty-server/src/modules/policy/utils/__tests__/format-duration.util.spec.ts" \
  "Omnia test from the v2.58 merge (G2): format-duration.util.spec.ts"

echo ""
echo "--- Policy post-save enrichment (LTV) ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/utils/lookup-carrier-product-commission.util.ts" \
  "getRepositoryWithoutPermissionChecks" \
  "LTV lookup is a system read on ORM v2 inside the caller's workspace context"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/utils/lookup-carrier-product-commission.util.ts" \
  "global-workspace-datasource" \
  "ORM v1 (GlobalWorkspaceOrmManager) is removed in v2.58"
check_file_exists \
  "packages/twenty-server/src/modules/policy/utils/__tests__/lookup-carrier-product-commission.util.spec.ts" \
  "LTV lookup regression tests"
check_file_contains \
  "packages/twenty-server/src/modules/policy/utils/enrich-policy-after-save.util.ts" \
  "getRepositoryWithoutPermissionChecks" \
  "Post-save enrichment is a system write: agents may lack write access to LTV and submittedDate"
check_file_contains \
  "packages/twenty-server/src/modules/policy/utils/enrich-policy-after-save.util.ts" \
  "lookupCarrierProductCommission(" \
  "LTV must come from the CarrierProduct commission lookup"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/utils/enrich-policy-after-save.util.ts" \
  "shouldSkipEventEmission" \
  "LTV and submittedDate writes must keep DB events (timeline and webhook audit)"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/utils/enrich-policy-after-save.util.ts" \
  "agentId" \
  "The post-save agentId fallback is gone: it could stamp an agent on upserted existing rows; the create pre-hooks own assignment"
check_file_exists \
  "packages/twenty-server/src/modules/policy/utils/__tests__/enrich-policy-after-save.util.spec.ts" \
  "Post-save enrichment regression tests"
check_file_exists \
  "packages/twenty-server/src/modules/policy/utils/__tests__/build-policy-display-name.util.spec.ts" \
  "Policy display-name regression tests"
check_file_exists \
  "packages/twenty-server/src/modules/policy/utils/__tests__/get-today-for-member.util.spec.ts" \
  "getNowUtc regression test"

echo ""
echo "--- Call and person (lead) hooks: agent auto-assign ---"
check_file_contains \
  "packages/twenty-server/src/modules/call/query-hooks/call-create-one.pre-query.hook.ts" \
  "agentFieldName: 'agentId'" \
  "Call createOne hook must stamp the caller's agent profile on call.agentId"
check_file_contains \
  "packages/twenty-server/src/modules/call/query-hooks/call-create-one.pre-query.hook.ts" \
  "isUpsert: payload.upsert === true" \
  "Call createOne hook must pass the upsert flag so an upserted existing call keeps its agent"
check_file_contains \
  "packages/twenty-server/src/modules/call/query-hooks/call-create-many.pre-query.hook.ts" \
  "agentFieldName: 'agentId'" \
  "Call createMany hook must stamp the caller's agent profile on call.agentId"
check_file_contains \
  "packages/twenty-server/src/modules/call/query-hooks/call-create-many.pre-query.hook.ts" \
  "isUpsert: payload.upsert === true" \
  "Call createMany hook must pass the upsert flag so re-imports keep existing calls' agents"
check_file_exists \
  "packages/twenty-server/src/modules/call/query-hooks/call-query-hook.module.ts" \
  "Call query hook module registration"
check_file_exists \
  "packages/twenty-server/src/modules/call/query-hooks/__tests__/call-create.pre-query.hook.spec.ts" \
  "Call create hook regression tests"
check_file_contains \
  "packages/twenty-server/src/modules/call/query-hooks/__tests__/call-create.pre-query.hook.spec.ts" \
  "keeps the agent of an existing call matched by id during an upsert" \
  "Call create hook tests must cover upserts that match an existing call"
check_file_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/person-create-one.pre-query.hook.ts" \
  "agentFieldName: 'assignedAgentId'" \
  "Person createOne hook must stamp the caller's agent profile on the lead's assignedAgentId (Lead is person)"
check_file_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/person-create-one.pre-query.hook.ts" \
  "isUpsert: payload.upsert === true" \
  "Person createOne hook must pass the upsert flag so an upserted existing lead keeps its assigned agent"
check_file_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/person-create-many.pre-query.hook.ts" \
  "agentFieldName: 'assignedAgentId'" \
  "Person createMany hook must stamp the caller's agent profile on the lead's assignedAgentId (Lead is person)"
check_file_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/person-create-many.pre-query.hook.ts" \
  "isUpsert: payload.upsert === true" \
  "Person createMany hook must pass the upsert flag so CSV re-imports never reassign existing leads"
check_file_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/person-query-hook.module.ts" \
  "export class PersonQueryHookModule" \
  "Person (lead) query hook module, renamed from LeadQueryHookModule"
check_file_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/person-query-hook.module.ts" \
  "PersonCreateOnePreQueryHook" \
  "PersonQueryHookModule must provide the person createOne hook"
check_file_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/person-query-hook.module.ts" \
  "PersonCreateManyPreQueryHook" \
  "PersonQueryHookModule must provide the person createMany hook"
check_file_not_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/person-query-hook.module.ts" \
  "LeadCreate" \
  "lead.* hooks were dropped: no lead object exists (Lead is the person object)"
check_file_exists \
  "packages/twenty-server/src/modules/lead/query-hooks/__tests__/person-create.pre-query.hook.spec.ts" \
  "Person (lead) create hook regression tests"
check_file_contains \
  "packages/twenty-server/src/modules/lead/query-hooks/__tests__/person-create.pre-query.hook.spec.ts" \
  "keeps the assigned agent of an existing lead matched by primary email during an upsert" \
  "Person create hook tests must cover CSV re-imports that match an existing lead by email"
check_file_not_exists \
  "packages/twenty-server/src/modules/lead/query-hooks/lead-create-one.pre-query.hook.ts" \
  "lead.createOne hook dropped: no lead object exists (Lead is person)"
check_file_not_exists \
  "packages/twenty-server/src/modules/lead/query-hooks/lead-create-many.pre-query.hook.ts" \
  "lead.createMany hook dropped: no lead object exists (Lead is person)"
check_file_not_exists \
  "packages/twenty-server/src/modules/lead/query-hooks/lead-query-hook.module.ts" \
  "Renamed to person-query-hook.module.ts (PersonQueryHookModule)"

echo ""
echo "--- Agent performance rollups ---"
check_file_not_contains \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  "GlobalWorkspaceOrmManager" \
  "Agent rollups must use the v2.58 WorkspaceOrmManager"
check_file_contains \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  "{ shouldSkipEventEmission: true }" \
  "Hourly rollup writes must skip DB events, or they flood the webhook queue and re-fire workflows and timeline entries"
check_file_contains \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  "await agentProfileRepository.updateMany(agentUpdatesChunk);" \
  "Rollup writes are batched with updateMany (chunks of QUERY_MAX_RECORDS)"
check_file_contains \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  "haveAgentMetricsChanged({ storedMetrics, metrics })" \
  "Rollups write only agents whose metrics changed"
check_file_contains \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  "getJoinColumnNameForRelationField(agentFlatFieldMetadata)" \
  "The timeCard agent column comes from the timeCard.agent relation in the flat field maps (no repo.metadata probe)"
check_file_not_contains \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  "agentsId" \
  "No agentsId fallback: legacy migration 1778000000000 normalized timeCard.agent to agentId"
check_file_contains \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  ".distinctOn(['qa.agentId'])" \
  "Latest QA score per agent uses the query builder's DISTINCT ON"
check_file_not_contains \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  "InjectRepository" \
  "Agent rollups read object and field metadata from the workspace cache, not TypeORM metadata repositories"
check_file_not_contains \
  "packages/twenty-server/src/modules/agent-rollup/agent-rollup.module.ts" \
  "GlobalWorkspaceDataSourceModule" \
  "TwentyOrmModule is global in v2.58; the v2.19 datasource module is gone"
check_file_contains \
  "packages/twenty-server/src/modules/agent-rollup/agent-rollup.module.ts" \
  "exports: [AgentRollupService, ComputeAgentRollupsCronCommand]" \
  "AgentRollupModule exports the service (workspace:compute-agent-rollups) and the cron command (cron:register:all)"
check_file_exists \
  "packages/twenty-server/src/modules/agent-rollup/jobs/compute-agent-rollups.job.ts" \
  "Per-workspace agent rollup job (workspaceQueue)"
check_file_contains \
  "packages/twenty-server/src/modules/agent-rollup/crons/compute-agent-rollups.cron.job.ts" \
  "{ isWorkspaceJob: true, workspaceId: workspace.id }" \
  "The rollup cron fans out one workspace-scoped job per active workspace (G6)"
check_file_exists \
  "packages/twenty-server/src/modules/agent-rollup/services/__tests__/agent-rollup.service.spec.ts" \
  "Agent rollup spec (change detection, skipped events, updateMany batching, timeCard join column)"
check_file_exists \
  "packages/twenty-server/src/modules/agent-rollup/crons/__tests__/compute-agent-rollups.cron.job.spec.ts" \
  "Agent rollup cron fan-out spec"
check_file_not_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service.ts" \
  "onModuleInit" \
  "Pull-schedule re-sync must not run on module init: it ran in every API, worker and CLI process and raced on the BullMQ schedulers"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-pull-scheduler.service.ts" \
  "async resyncEnabledPullSchedules(): Promise<number> {" \
  "Pull-schedule re-sync entry point used by cron:ingestion-pull-schedules"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/commands/ingestion-pull-schedules.cron.command.ts" \
  "cron:ingestion-pull-schedules command (run by cron:register:all)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/commands/ingestion-pull-schedules.cron.command.ts" \
  "await this.ingestionPullSchedulerService.resyncEnabledPullSchedules();" \
  "The pull-schedules cron command must re-sync every enabled pull pipeline"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/crons/commands/__tests__/ingestion-pull-schedules.cron.command.spec.ts" \
  "Spec for cron:ingestion-pull-schedules"
check_file_exists \
  "packages/twenty-server/src/modules/agent-rollup/services/agent-rollup.service.ts" \
  "Agent rollup compute service must exist"
check_file_exists \
  "packages/twenty-server/src/modules/agent-rollup/crons/compute-agent-rollups.cron.job.ts" \
  "Agent rollup cron job must exist"

echo ""
echo "--- Reconciliation pipeline on ORM v2 (2.58 merge) ---"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/data.service.ts" \
  "global-workspace-datasource" \
  "Reconciliation data service must use WorkspaceOrmManager (ORM v1 global datasource is gone in v2.58)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/mutation.service.ts" \
  "global-workspace-datasource" \
  "Reconciliation mutation service must use WorkspaceOrmManager (ORM v1 global datasource is gone in v2.58)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts" \
  "global-workspace-datasource" \
  "Decision-rule service must use WorkspaceOrmManager (ORM v1 global datasource is gone in v2.58)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/carrier-config-validation.service.ts" \
  "global-workspace-datasource" \
  "Carrier-config validation service must use WorkspaceOrmManager (ORM v1 global datasource is gone in v2.58)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/query-hooks/carrier-config-update-one.pre-query.hook.ts" \
  "global-workspace-datasource" \
  "carrierConfig rename guard must use WorkspaceOrmManager (ORM v1 global datasource is gone in v2.58)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/query-hooks/carrier-config-query-hook.module.ts" \
  "GlobalWorkspaceDataSourceModule" \
  "CarrierConfigQueryHookModule must not import the deleted GlobalWorkspaceDataSourceModule (TwentyOrmModule is global)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts" \
  "const [rule] = await ruleRepo.save(" \
  "WorkspaceRepository.save returns an array: a new learned rule must be destructured, or its id is undefined and items link to nothing"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/data.service.ts" \
  "policy?.leadId" \
  "getLeadIdForPolicy must read the lead foreign key (the lead relation is not loaded, so lead.id was always null)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/data.service.ts" \
  "relations: ['lead']" \
  "Phase-2 enrichment must load the lead through find relations (ORM v2 path), not a TypeORM query-builder join"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/data.service.ts" \
  "leftJoinAndSelect" \
  "Phase-2 enrichment must not use the ORM v1 leftJoinAndSelect query builder"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/data.service.ts" \
  "getLiveRelation" \
  "Matching must ignore soft-deleted leads and agents (ORM v2 attaches trashed to-one targets; v2.19 joins excluded them)"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/utils/build-reconciliation-job-options.util.ts" \
  "Single source of the reconciliation enqueue scope and per-phase deduplication id"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/utils/build-reconciliation-job-options.util.ts" \
  "isWorkspaceJob: true" \
  "Reconciliation jobs must be enqueued as workspace jobs (v2.58 add() requires a scope)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/utils/build-reconciliation-job-options.util.ts" \
  "keepLastIfActive: true" \
  "A stuck-run restart while the superseded job is still active must still run its job (deduplication keepLastIfActive)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/orchestrator.service.ts" \
  "buildReconciliationJobOptions" \
  "Orchestrator enqueues must carry the workspace scope and per-run deduplication"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/parse.job.ts" \
  "buildReconciliationJobOptions" \
  "The parse job's auto-chained match enqueue must carry the workspace scope and per-run deduplication"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/attachment.service.ts" \
  "file-storage/services/file-storage.service" \
  "Attachment service must use the v2.58 FileStorageService path"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/attachment.service.ts" \
  "FILE_STATUS.PENDING" \
  "A source file whose upload has not finished (PENDING) must fail the run with an actionable message"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/attachment.service.ts" \
  "streamToBuffer" \
  "Parsed-data reads must buffer the storage stream (readFileContent was removed upstream)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/attachment.service.ts" \
  "attachment.name" \
  "Attachment names can carry PHI and must not be logged"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/parse.job.ts" \
  "transform errors quote the raw cell value (PHI)" \
  "Parse-error log samples must carry row and header only, never the raw cell value"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/query-hooks/carrier-config-update-one.pre-query.hook.ts" \
  "getRepository('carrierConfig')" \
  "Rename guard must read the carrierConfig with the caller's permissions (no name or counts leak to callers who cannot read it)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/query-hooks/carrier-config-update-one.pre-query.hook.ts" \
  "buildSystemAuthContext(workspace.id)" \
  "Rename guard counts learned rules and review items as the system"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/services/__tests__/data.service.spec.ts" \
  "Data service regression tests (getLeadIdForPolicy foreign key, relation enrichment, soft-deleted relations)"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/services/__tests__/mutation.service.spec.ts" \
  "Compare-and-swap mutation tests on ORM v2 UpdateResult.affected"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/services/__tests__/attachment.service.spec.ts" \
  "Attachment service tests (PENDING upload, parsed-data storage, no PHI in logs)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/__tests__/decision-rule.service.spec.ts" \
  "creates a rule for a new signature and links the item to the saved id" \
  "Decision-rule spec must cover the save() array shape"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/utils/__tests__/build-reconciliation-job-options.util.spec.ts" \
  "Reconciliation enqueue options tests"

echo ""
echo "--- Policy create hooks: agent stamping and derived name ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts" \
  "assignAgentProfileToNewRecords" \
  "Policy createOne hook must stamp agentId through the upsert-aware AgentProfileAssignmentService"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts" \
  "isUpsert: payload.upsert === true" \
  "Policy createOne hook must pass the upsert flag so an upserted existing policy keeps its agent"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-many.pre-query.hook.ts" \
  "assignAgentProfileToNewRecords" \
  "Policy createMany hook must stamp agentId through the upsert-aware AgentProfileAssignmentService"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-many.pre-query.hook.ts" \
  "isUpsert: payload.upsert === true" \
  "Policy createMany hook must pass the upsert flag so CSV re-imports keep existing policies' agents"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-many.pre-query.hook.ts" \
  "buildPolicyDisplayNames" \
  "Policy createMany hook must derive names with one carrier and one product lookup per batch"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-create.pre-query.hook.spec.ts" \
  "Policy create hook regression tests (agent stamping, upsert ownership, derived name)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-create.pre-query.hook.spec.ts" \
  "keeps the owner of an existing policy matched during an upsert" \
  "Policy create hook tests must cover upserts that match an existing policy"

echo ""
echo "--- Policy update hooks: delegate to PolicyWriteAuthorizationService ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-one.pre-query.hook.ts" \
  "assertUserMayUpdatePolicies" \
  "Policy updateOne hook must delegate to PolicyWriteAuthorizationService (RLS denial before edit window)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-many.pre-query.hook.ts" \
  "PolicyWriteAuthorizationService" \
  "Policy updateMany hook must inject the shared write-authorization service"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-many.pre-query.hook.ts" \
  "assertUserMayUpdatePolicies" \
  "Policy updateMany hook must delegate to PolicyWriteAuthorizationService (RLS denial before edit window)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-many.pre-query.hook.ts" \
  "applyFilterToBuilder" \
  "Policy updateMany hook must resolve non-id filters the way the runner applies them, or the edit window is bypassed"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-many.pre-query.hook.ts" \
  ".getRepository('policy')" \
  "updateMany filter resolution must use the permission-checked repository so a filter cannot probe unreadable policies"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-many.pre-query.hook.ts" \
  "RowLevelPermissionPredicateScope" \
  "Scoped RLS predicates are gone in v2.58 (rule grants, contract C1); the hook must not inspect predicates itself"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-many.pre-query.hook.ts" \
  "rolesPermissions" \
  "The v2.58 rolesPermissions cache carries no predicates or edit window; reading it fails open"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/utils/find-policy-update-targets.util.ts" \
  "Resolves the stored policies (id, createdAt, carrier, product) a policy update will write"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/utils/find-policy-update-targets.util.ts" \
  "withDeleted: true" \
  "Policy update targets must include soft-deleted rows: the update runner writes them too"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/types/policy-update-target-record.type.ts" \
  "PolicyUpdateTargetRecord type (update target plus stored carrier and product)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-edit-window.pre-query.hook.spec.ts" \
  "reports row-level security before the edit window" \
  "Edit window tests must show the RLS denial before the edit-window denial for a foreign policy"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-edit-window.pre-query.hook.spec.ts" \
  "checks the policies a filter other than an id list matches" \
  "Edit window tests must cover updateMany with a non-id filter (former bypass)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-edit-window.pre-query.hook.spec.ts" \
  "PolicyWriteAuthorizationService" \
  "Edit window tests must run the real PolicyWriteAuthorizationService against mocked permission services"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-update.pre-query.hook.spec.ts" \
  "Policy update hook display-name regression tests"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts" \
  "Policy create pre-query hook (agentId auto-assign)"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-many.pre-query.hook.ts" \
  "Policy create-many pre-query hook"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-one.pre-query.hook.ts" \
  "Policy update pre-query hook (edit window enforcement)"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-edit-window.pre-query.hook.spec.ts" \
  "Policy edit window hook regression tests"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-edit-window.pre-query.hook.spec.ts" \
  "editWindowMinutes: 15" \
  "Policy edit window tests must cover role-configured edit windows"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-query-hook.module.ts" \
  "Policy query hook module registration"

echo ""
echo "--- Policy query hook module (ORM v2) ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-query-hook.module.ts" \
  "PermissionsModule" \
  "PolicyQueryHookModule must import PermissionsModule for PolicyWriteAuthorizationService (principals and record grants)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-query-hook.module.ts" \
  "exports: [PolicyWriteAuthorizationService]" \
  "PolicyQueryHookModule must export PolicyWriteAuthorizationService for reconciliation batch apply and OmniaCommandModule"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-query-hook.module.ts" \
  "GlobalWorkspaceDataSourceModule" \
  "ORM v1 is removed in v2.58; TwentyOrmModule is global"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/utils/build-policy-display-name.util.ts" \
  "global-workspace-datasource" \
  "ORM v1 (GlobalWorkspaceOrmManager) is removed in v2.58"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/utils/enrich-policy-after-save.util.ts" \
  "global-workspace-datasource" \
  "ORM v1 (GlobalWorkspaceOrmManager) is removed in v2.58"

echo ""
echo "--- Reconciliation resolver gate (U14, contract C8) ---"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/constants/reconciliation-access-policy.constant.ts" \
  "Reconciliation access policy (user sessions only, RECONCILIATION permission flag)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/constants/reconciliation-access-policy.constant.ts" \
  "PermissionFlagType.RECONCILIATION" \
  "Reconciliation access policy must require the RECONCILIATION permission flag (default deny)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/constants/reconciliation-access-policy.constant.ts" \
  "apiKey: false" \
  "Reconciliation access policy must refuse API keys: batch apply authorizes every write against the acting member"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation.resolver.ts" \
  "AccessPolicyGuard(RECONCILIATION_ACCESS_POLICY)" \
  "Reconciliation resolver must be guarded by AccessPolicyGuard(RECONCILIATION_ACCESS_POLICY)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation.resolver.ts" \
  "getUserAuthContextOrThrow" \
  "Reconciliation batch mutations must hand the acting user's auth context to ReviewItemService"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/__tests__/reconciliation.resolver.spec.ts" \
  "ACCESS_POLICY_GUARD_CONFIG_KEY" \
  "Resolver guard regression test must assert the access policy (RECONCILIATION flag, user sessions only)"

echo ""
echo "--- Review item data access and batch apply (U13, U15 option A, Q17) ---"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "runInWorkspaceTransaction" \
  "Match re-run reconcile and per-item apply must run in ORM v2 workspace transactions"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "findPolicyUpdateDenials" \
  "User-initiated batch apply must pre-check policy RLS and the edit window once per batch and skip denied items"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "transactionScope.getRepository<WorkspaceRecord>('policy')" \
  "Batch apply must write policies through the permission-checked repository (RLS and field permissions, Q17)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "transactionScope.getRepository<WorkspaceRecord>('person')" \
  "Batch apply must write leads through the permission-checked repository"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "assertWriteReachedRecord" \
  "A permission-checked write that reaches no row (RLS) must skip the item and roll it back, never approve it"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "actingUserMayWritePolicies" \
  "The hand-rolled ownership check is replaced by the permission engine (findPolicyUpdateDenials and permission-checked writes)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "global-workspace-datasource" \
  "ORM v1 (GlobalWorkspaceOrmManager, getGlobalWorkspaceDataSource) is removed in v2.58"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/__tests__/review-item.service.spec.ts" \
  "runs the learned-rule cascade as the acting user" \
  "Batch apply spec must prove the learned-rule cascade inside a user batch is authorized as that user"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/__tests__/review-item.service.spec.ts" \
  "skips every item without aborting when the pre-check cannot resolve principals" \
  "Batch apply spec must prove a principals failure skips items instead of aborting or writing unchecked"

echo ""
echo "--- Reconciliation module wiring (U2, contract C7) ---"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/reconciliation-core.module.ts" \
  "Reconciliation services shared by ReconciliationModule (API, worker) and OmniaCommandModule (CLI)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation-core.module.ts" \
  "ReconciliationObjectLockdownModule" \
  "Reconciliation core module must import and re-export the object lockdown module (listener and the CLI lockdown service)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation.module.ts" \
  "ReconciliationCoreModule" \
  "ReconciliationModule must import the shared reconciliation core module"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation.module.ts" \
  "PermissionsModule" \
  "AccessPolicyGuard resolves through the global AccessPolicyModule; the deleted PermissionsModule import must stay out"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation-core.module.ts" \
  "PolicyQueryHookModule" \
  "ReconciliationCoreModule must import PolicyQueryHookModule so ReviewItemService resolves PolicyWriteAuthorizationService in the API, the worker and every CLI command (Helm migration job included)"

echo ""
echo "--- Reconciliation object lockdown (listener + W7) ---"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener.ts" \
  "Reconciliation lockdown listener re-locks roles after metadata changes (settings role flow, app syncs, RLS rules)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener.ts" \
  "metadata.objectPermission" \
  "Lockdown listener must re-lock a role after its object permissions change (the settings full replace drops the deny rows)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener.ts" \
  "metadata.role.created" \
  "Lockdown listener must lock every newly created role"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener.ts" \
  "metadata.rowLevelPermissionRule.created" \
  "Lockdown listener must remove row level permission rules created on reconciliation objects (a v2.58 rule grants on its own)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener.ts" \
  "metadata.rowLevelPermissionPredicate.created" \
  "Lockdown listener must react to predicates added on reconciliation objects"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/reconciliation-object-lockdown.module.ts" \
  "Reconciliation lockdown module (service + listener), imported by ReconciliationCoreModule and OmniaUpgradeVersionCommandModule"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation-object-lockdown.module.ts" \
  "ReconciliationObjectLockdownListener" \
  "Lockdown module must provide the metadata-event listener"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "STANDARD_ROLE.admin.universalIdentifier" \
  "Lockdown must exempt only the standard admin, matched by universal identifier"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "ADMIN_ROLE_LABEL" \
  "Lockdown must never exempt a role by its label"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "canCreateObjectRecords: false" \
  "Lockdown deny rows must deny create as well (W9 check 7 requires all five grants false)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "isSystemBuild: true" \
  "Lockdown must write app-owned and grant roles through a system build owned by the role's application"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "upsertGrantRole" \
  "Lockdown must re-sync application grant roles so the grant copy carries the deny rows"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "rowLevelPermissionRule: {" \
  "Lockdown must delete row level permission rules on reconciliation objects (zeroing them fails W9 check 2)"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "upsertObjectPermissions" \
  "Lockdown must not use the full-replace object permission API (it rejects app and grant roles and wipes other listeners' rows)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500006000-omnia-reconciliation-object-lockdown.command.ts" \
  "W7: re-locks every non-admin role, app role and grant role out of the reconciliation objects in the 2.58 upgrade"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500006000-omnia-reconciliation-object-lockdown.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1794500006000)" \
  "W7 must stay registered at 2.58.0 / 1794500006000, before the W9 verify step"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500006000-omnia-reconciliation-object-lockdown.command.ts" \
  "applyToAllNonAdminRoles" \
  "W7 must delegate to the shared lockdown service"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/listeners/reconciliation-object-lockdown.listener.ts" \
  "isRowLevelPermissionRuleSchemaAvailable()" \
  "The lockdown listener must leave roles to the 2.58 lockdown command while the upgrade has not created the rule table"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/constants/reconciliation-bookkeeping-repository-options.constant.ts" \
  "Reconciliation bookkeeping writes must skip event emission"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/constants/reconciliation-bookkeeping-repository-options.constant.ts" \
  "shouldSkipEventEmission: true" \
  "Bookkeeping writes on the admin-only reconciliation objects must not create timeline activities every role can read (PHI)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS" \
  "Review item writes (match refresh, apply, undo) must skip event emission"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts" \
  "RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS" \
  "Learned-rule and review item writes of the decision-rule service must skip event emission"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/mutation.service.ts" \
  "getReconciliationRepository" \
  "Reconciliation status writes skip events while the system policy and person writes keep theirs"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "flatEntityToDelete: []" \
  "Object lockdown must write only the reconciliation rows and never delete a role's other object permissions (sidebar visibility and edit window included)"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/services/object-lockdown.service.ts" \
  "Shared reconciliation object lockdown service (seed command, W7 upgrade command, metadata-event listener)"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/listeners/__mocks__/reconciliation-object-lockdown-workspace.mock.ts" \
  "Omnia test mock from the v2.58 merge (G2): reconciliation-object-lockdown-workspace.mock.ts"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/listeners/__tests__/reconciliation-object-lockdown.listener.spec.ts" \
  "Omnia test from the v2.58 merge (G2): reconciliation-object-lockdown.listener.spec.ts"

echo ""
echo "--- Dashboard role-gating (audience field and rules, C1) ---"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "upsertRowLevelPermissionPredicates" \
  "Dashboard audience rules must be written through the row level permission rule writer (contract C1 step 1)"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "writeDashboardObjectPermission" \
  "A gated role's dashboard object permission must be denied, or its audience rule fails open (contract C1 step 2)"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "flatEntityToDelete: []" \
  "The dashboard object permission write must never delete a role's other object permissions (reconciliation lockdown, sidebar visibility, edit window)"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "flatRole.applicationUniversalIdentifier" \
  "Dashboard object permissions of application-owned roles must be written as the role's application"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "isSystemBuild: false" \
  "The dashboard object permission write must keep the role editability checks (no system build)"
check_file_not_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "RowLevelPermissionPredicateScope" \
  "Dashboard audience must not use the removed scoped predicates (v2.58 rules carry the grants)"
check_file_not_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "upsertObjectPermissions" \
  "Dashboard audience must not use the full-replace object permission API (it rejects app-owned roles and wipes other listeners' rows)"
check_file_not_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "@InjectRepository" \
  "Dashboard audience reads roles and metadata from the flat caches, never from TypeORM metadata repositories"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/plan-dashboard-audience-role-sync.util.ts" \
  "canReadRecords" \
  "The audience rule must carry the role's dashboard grants, read included"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/plan-dashboard-audience-role-sync.util.ts" \
  "DASHBOARD_AUDIENCE_DENIED_OBJECT_PERMISSION_GRANTS" \
  "Every gated role with an audience rule must get its dashboard object grants denied"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/plan-dashboard-audience-role-sync.util.ts" \
  "isGrantingNoOperation" \
  "A role that grants nothing on dashboards must keep no audience rule (W9 check rule-grants)"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/is-dashboard-audience-gated-role.util.ts" \
  "roleIdsWithAllRecordsAccess" \
  "Admin-like roles (canUpdateAllSettings) stay ungated and see every dashboard"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/listeners/dashboard-audience-role-sync.listener.ts" \
  "metadata.objectPermission" \
  "Listener must re-deny dashboards that a role settings save reopened at object level"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-one.pre-query.hook.ts" \
  "Dashboard audience auto-tag hook (createOne) must exist: gated roles cannot create dashboards without their own token"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-one.pre-query.hook.ts" \
  "dashboard.createOne" \
  "Auto-tag hook must run on dashboard.createOne"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-many.pre-query.hook.ts" \
  "Dashboard audience auto-tag hook (createMany) must exist"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-many.pre-query.hook.ts" \
  "dashboard.createMany" \
  "Auto-tag hook must run on dashboard.createMany"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/dashboard-audience.module.ts" \
  "DashboardAudienceQueryHookModule" \
  "DashboardAudienceModule must load the creator auto-tag hooks"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500005000-omnia-sync-dashboard-audience.command.ts" \
  "W6: normalizes the dashboard audience rules (contract C1) during the 2.58 upgrade, before the W9 verify step"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500005000-omnia-sync-dashboard-audience.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1794500005000)" \
  "W6 must stay registered at 2.58.0 / 1794500005000, after W1 and before W9"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500005000-omnia-sync-dashboard-audience.command.ts" \
  "syncWorkspace" \
  "W6 must delegate to the shared dashboard audience sync service"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-query-hook.module.ts" \
  "exports: [DashboardAudienceCreatorService]" \
  "The global query-hook module must export the creator service"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/listeners/dashboard-audience-role-sync.listener.ts" \
  "isRowLevelPermissionRuleSchemaAvailable()" \
  "The dashboard audience listener must do nothing before the upgrade creates the rule table (2-57 role events wiped the prod gate otherwise)"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/plan-dashboard-audience-role-sync.util.ts" \
  "hasUntranslatedRowLevelPermissions" \
  "The dashboard audience planner must leave a pre-2.58 predicate without a rule to the scoped-permission translation"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "The rule goes before the denial" \
  "The audience rule must be written before the dashboard denial, so a failed denial is retried with the role's real grants"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-creator.service.ts" \
  "findUpsertMatchingRecordIds" \
  "An upserted dashboard that matches a stored one must keep its audience (other roles would lose access)"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-many.pre-query.hook.ts" \
  "isUpsert: payload.upsert === true" \
  "The createMany auto-tag hook must pass the upsert flag"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-create-one.pre-query.hook.ts" \
  "isUpsert: payload.upsert === true" \
  "The createOne auto-tag hook must pass the upsert flag"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/dashboard-audience-query-hook.module.ts" \
  "@Global()" \
  "Upstream dashboard inserts that skip the create hooks inject the creator service without importing an Omnia module"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/services/dashboard-duplication.service.ts" \
  "buildNewDashboardAudienceFields" \
  "A gated creator's dashboard copy must carry its audience token (create follows update), or gated roles cannot duplicate dashboards"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/tools/create-complete-dashboard.tool.ts" \
  "buildNewDashboardAudienceFields" \
  "A gated creator's AI-created dashboard must carry its audience token (create follows update)"
check_file_not_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard.module.ts" \
  "DashboardAudienceQueryHookModule" \
  "DashboardModule stays upstream: the creator service comes from the @Global() DashboardAudienceQueryHookModule (C7)"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/services/__tests__/dashboard-duplication-audience.spec.ts" \
  "Duplication spec: a gated creator's copy carries its audience token, an admin's copy carries none"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/tools/types/dashboard-tool-dependencies.type.ts" \
  "dashboardAudienceCreatorService: DashboardAudienceCreatorService;" \
  "DashboardToolDependencies must carry the creator service the AI create tool calls"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/tools/services/dashboard-tool.workspace-service.ts" \
  "dashboardAudienceCreatorService: DashboardAudienceCreatorService," \
  "The dashboard tool service must inject the creator service into the tools' deps"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/tools/__tests__/create-complete-dashboard.tool.spec.ts" \
  "tags a gated creator's dashboard with the creator's audience token" \
  "AI create tool spec must keep the gated creator's audience token case"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/dashboard-audience-role-sync.service.ts" \
  "Dashboard audience role-sync service must exist"
check_file_contains \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/listeners/dashboard-audience-role-sync.listener.ts" \
  "metadata.role.created" \
  "Listener must subscribe to role lifecycle events so audience auto-tracks roles"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/sync-dashboard-audience.command.ts" \
  "Dashboard audience bootstrap/re-sync command must exist"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/__mocks__/dashboard-audience-workspace.mock.ts" \
  "Omnia test mock from the v2.58 merge (G2): dashboard-audience-workspace.mock.ts"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-denied-object-permission-grants.constant.ts" \
  "Dashboard object grants of a gated role: all false, the audience rule decides (C1)"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-field-name.constant.ts" \
  "Name of the custom audience MULTI_SELECT field on dashboard"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-inherited-object-permission-grants.constant.ts" \
  "Rule grants a gated role carries over from its former dashboard object grants"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-option-colors.constant.ts" \
  "Colors for audience options"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/constants/dashboard-audience-predicate-id-namespace.constant.ts" \
  "uuidv5 namespace for deterministic audience predicate ids"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/listeners/__tests__/dashboard-audience-role-sync.listener.spec.ts" \
  "Omnia test from the v2.58 merge (G2): dashboard-audience-role-sync.listener.spec.ts"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/__tests__/dashboard-audience-create-many.pre-query.hook.spec.ts" \
  "Omnia test from the v2.58 merge (G2): dashboard-audience-create-many.pre-query.hook.spec.ts"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/query-hooks/__tests__/dashboard-audience-create-one.pre-query.hook.spec.ts" \
  "Omnia test from the v2.58 merge (G2): dashboard-audience-create-one.pre-query.hook.spec.ts"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/__tests__/dashboard-audience-creator.service.spec.ts" \
  "Omnia test from the v2.58 merge (G2): dashboard-audience-creator.service.spec.ts"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/services/__tests__/dashboard-audience-role-sync.service.spec.ts" \
  "Omnia test from the v2.58 merge (G2): dashboard-audience-role-sync.service.spec.ts"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/types/dashboard-audience-grants.type.ts" \
  "Dashboard audience role sync types (grants)"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/types/dashboard-audience-object-permission-grants.type.ts" \
  "Dashboard audience role sync types (object-permission grants)"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-rows.type.ts" \
  "Dashboard audience role sync types (a role's stored rows)"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/types/dashboard-audience-role-sync-plan.type.ts" \
  "Dashboard audience role sync types (sync plan)"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/__tests__/compute-dashboard-audience-options.util.spec.ts" \
  "Omnia test from the v2.58 merge (G2): compute-dashboard-audience-options.util.spec.ts"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/__tests__/plan-dashboard-audience-role-sync.util.spec.ts" \
  "Omnia test from the v2.58 merge (G2): plan-dashboard-audience-role-sync.util.spec.ts"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/append-dashboard-audience-token.util.ts" \
  "Appends a gated creator's role token to a dashboard's audience, without duplicates"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/are-dashboard-audience-options-equal.util.ts" \
  "Skips the field update when the audience options are unchanged"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/compute-dashboard-audience-options.util.ts" \
  "Audience options from the gated roles; surviving options keep their id, color and order"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/encode-dashboard-audience-role-token.util.ts" \
  "Encodes a role id as the ROLE_<hex> option value"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/find-dashboard-audience-field.util.ts" \
  "Finds the audience field in the flat metadata maps"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/find-dashboard-audience-role-rows.util.ts" \
  "Loads a role's dashboard object permission and audience rule rows"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/find-dashboard-flat-object-metadata.util.ts" \
  "Finds the dashboard object in the flat metadata maps"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/find-object-permission-event-role-and-object-ids.util.ts" \
  "Reads role and object ids from objectPermission metadata events for the listener re-sync"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-option-color.util.ts" \
  "Picks the color of a new audience option"
check_file_exists \
  "packages/twenty-server/src/modules/dashboard/dashboard-audience/utils/get-dashboard-audience-predicate-ids.util.ts" \
  "Deterministic audience predicate ids per role and dashboard"

echo ""
echo "--- Omnia shared helpers (upgrade guard, upsert matching) ---"
check_file_exists \
  "packages/twenty-server/src/modules/omnia/utils/is-row-level-permission-rule-schema-available.util.ts" \
  "Omnia permission listeners must know when an upgrade has not created the 2.58 rule table yet"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/utils/is-row-level-permission-rule-schema-available.util.ts" \
  "isEntityAvailable(" \
  "The upgrade guard must read the upgrade-aware entity state (rule table)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/utils/is-row-level-permission-rule-schema-available.util.ts" \
  ".has('rowLevelPermissionRuleId')" \
  "The upgrade guard must also wait for the predicates' rule link column"
check_file_exists \
  "packages/twenty-server/src/modules/omnia/utils/find-upsert-matching-record-ids.util.ts" \
  "Shared upsert matching: which upserted rows update a stored record (agent stamping, dashboard audience, policy edit window)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/utils/find-upsert-matching-record-ids.util.ts" \
  "getConflictingFields" \
  "Upsert matching must use the create-many runner's conflict groups, or CSV re-imports reassign ownership"
check_file_contains \
  "packages/twenty-server/src/modules/omnia/utils/find-upsert-matching-record-ids.util.ts" \
  "withDeleted: true" \
  "Upsert matching must count soft-deleted matches (the runner restores them instead of inserting)"

echo ""
echo "--- Reconciliation attachments (PHI) ---"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/utils/restrict-reconciliation-attachments.util.ts" \
  "Carrier book-of-business attachments (PHI) must be hidden from readers who cannot read the reconciliation objects"
check_file_exists \
  "packages/twenty-server/src/modules/messaging/common/query-hooks/attachment/__tests__/apply-attachments-visibility-restrictions-reconciliation.spec.ts" \
  "Handler spec: reconciliation source files are blanked for non-readers (also before the upgrade adds targetMessage) and left to readers"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/utils/filter-reconciliation-attachment-events.util.ts" \
  "Reconciliation source-file attachment events (SSE, webhooks, triggers) must be dropped for readers who cannot read the reconciliation objects"
check_file_contains \
  "packages/twenty-server/src/engine/permissions/record-event-permissions-read.service.ts" \
  "filterReconciliationAttachmentEvents({" \
  "Event read filtering must drop reconciliation source-file attachment events for non-readers (events skip the query runners' restriction)"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/utils/__tests__/filter-reconciliation-attachment-events.util.spec.ts" \
  "Omnia test: reconciliation attachment event filter"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/utils/__tests__/restrict-reconciliation-attachments.util.spec.ts" \
  "Omnia test from the v2.58 merge (G2): restrict-reconciliation-attachments.util.spec.ts"

echo ""
echo "--- Policy edit window on upsert and merge ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "assertUserMayUpsertPolicies" \
  "Upserted policy rows that match a stored policy must pass the row-level security and edit-window checks"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-many.pre-query.hook.ts" \
  "assertUserMayUpsertPolicies" \
  "policy.createMany with upsert must not bypass the edit window"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts" \
  "assertUserMayUpsertPolicies" \
  "policy.createOne with upsert must not bypass the edit window"
check_file_exists \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-merge-many.pre-query.hook.ts" \
  "policy.mergeMany must not bypass the edit window"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-merge-many.pre-query.hook.ts" \
  "policy.mergeMany" \
  "The merge hook must run on policy.mergeMany"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-query-hook.module.ts" \
  "PolicyMergeManyPreQueryHook" \
  "PolicyQueryHookModule must register the merge hook"
check_file_contains \
  "packages/twenty-server/src/modules/messaging/common/query-hooks/attachment/apply-attachments-visibility-restrictions.service.ts" \
  "restrictReconciliationAttachments" \
  "Attachments on the admin-only reconciliation objects (carrier book-of-business files, PHI) must be blanked for readers who cannot read those objects"

echo ""
echo "--- Policy submittedDate: dated before the insert, only on rows the runner inserts ---"
check_file_exists \
  "packages/twenty-server/src/modules/policy/utils/stamp-submitted-date-on-new-policies.util.ts" \
  "Policy submittedDate is stamped before the insert, only on rows a create or upsert inserts"
check_file_contains \
  "packages/twenty-server/src/modules/policy/utils/stamp-submitted-date-on-new-policies.util.ts" \
  "isUserAuthContext(authContext)" \
  "submittedDate is stamped only for user-context creates, never for ingestion, API keys or apps"
check_file_contains \
  "packages/twenty-server/src/modules/policy/utils/stamp-submitted-date-on-new-policies.util.ts" \
  "findUpsertMatchingRecordIds" \
  "An upserted row that matches a stored policy must keep its submittedDate, or a CSV re-import counts stored policies as today's sales"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts" \
  "stampSubmittedDateOnNewPolicies" \
  "Policy createOne hook must date new policies before the insert"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-many.pre-query.hook.ts" \
  "stampSubmittedDateOnNewPolicies" \
  "Policy createMany hook must date new policies before the insert"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/utils/enrich-policy-after-save.util.ts" \
  "submittedDate" \
  "Post-save enrichment must not stamp submittedDate: post-hooks cannot tell an upsert's updates from its inserts"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.post-query.hook.ts" \
  "submittedDate" \
  "The createOne post-hook must not stamp submittedDate (the pre-hook dates inserted rows only)"
check_file_not_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-many.post-query.hook.ts" \
  "submittedDate" \
  "The createMany post-hook must not stamp submittedDate (upserted existing rows would be dated today)"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/__tests__/policy-create.pre-query.hook.spec.ts" \
  "dates only the undated policies an upsert inserts" \
  "Policy create hook tests must cover upserts that match a stored policy keeping its submittedDate"

echo ""
echo "--- Reconciliation v2 engine ---"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/seed-reconciliation-objects.command.ts" \
  "Seed command that creates the Reconciliation + CarrierConfig custom workspace objects"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/seed-reconciliation-objects.command.ts" \
  "reconciliationDecisionRule" \
  "Seed command must create the learned reconciliation decision rule object"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/match.job.ts" \
  "decision.crmPolicyId" \
  "Reconciliation status engine must receive matched policy id to avoid self-cancel previous-version writes"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/status.ts" \
  "deriveCanceledStatus" \
  "Reconciliation status engine must preserve payment-error cancellation descriptors"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/status.ts" \
  "isPaidThroughCurrentMonth" \
  "Ambetter active payment error must require paid-through coverage through current month end"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/status.ts" \
  "No payment data for active effective date" \
  "Ambetter active policies with missing paid-through data must stay in payment error"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/status.ts" \
  "normalizePaidThroughDateForEffectiveDate" \
  "Ambetter status input must ignore paid-through dates before the policy effective date"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/diff.ts" \
  "isInvalidPaidThroughDateMove" \
  "Ambetter reconciliation diffs must not propose stale pre-effective paid-through dates"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/diff.ts" \
  "isJanuaryFirstRolloverEffectiveDateMove" \
  "Ambetter reconciliation diffs must suppress ACA January 1 rollover effective-date writes"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/status.ts" \
  "derivedStatus === 'PAYMENT_ERROR_CANCELED'" \
  "Broker-effective audit must treat Payment Error-Canceled as canceled (logic unified into deriveBrokerEffAudit 2026-06-11, audit item 4.5)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/reconciliation.resolver.ts" \
  "batchApplyReviewItems" \
  "Reconciliation toolbar batch action must call a mutation that applies/undoes CRM writes"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "buildUpdatesForTarget" \
  "Reconciliation batch apply/undo must mirror individual Apply all / Undo all field patch semantics"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "buildFieldTypeByCrmField" \
  "Reconciliation batch apply/undo must use column mapping field types for numeric diff coercion"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "cancelPreviousPolicyIfRequested" \
  "Reconciliation batch apply must preserve previous-policy cancellation behavior"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts" \
  "Learned reconciliation decision rule service"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts" \
  "buildStatusRuleSignature" \
  "Learned reconciliation rule service must build strict status signatures"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts" \
  "RECONCILIATION_AUTO_RULE_BLOCKING_FLAGS" \
  "Learned reconciliation rules must centralize risky flag blocking"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/match.job.ts" \
  "applyLearnedRulesForReconciliation" \
  "Reconciliation match job must auto-apply active learned status rules"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/backfill-reconciliation-decision-rules.command.ts" \
  "Backfill command for learned reconciliation decision rules"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "coerceFieldDiffValueForRecordUpdate" \
  "Server batch apply must coerce numeric diff strings (client write mirror deleted 2026-06-11, audit item 2.1 — server is the only CRM write path)"

echo ""
echo "--- Reconciliation audit remediation (2026-06-10/11) ---"
check_file_exists \
  "packages/twenty-server/src/modules/policy/services/policy-write-authorization.service.ts" \
  "Shared policy update authorization (engine RLS via filterGrantedRecordIds, then the edit window), used by the policy update hooks and reconciliation batch apply"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-one.pre-query.hook.ts" \
  "PolicyWriteAuthorizationService" \
  "Policy updateOne pre-query hook must delegate to the shared write-authorization service"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "resolveCancelTargetPolicy" \
  "Batch apply must validate the snapshot-supplied cancel target against the matched policy (lead/carrier) before canceling"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/parsers/xlsx.ts" \
  "MAX_PARSED_ROWS" \
  "XLSX parse must enforce a row cap (blast-radius bound for unpatched xlsx CVEs)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/attachment.service.ts" \
  "MAX_SOURCE_FILE_BYTES" \
  "Reconciliation source file reads must enforce a byte cap before parsing"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/services/review-item-reconcile.util.ts" \
  "Non-destructive re-run reconcile planner (decided review items must survive match re-runs)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/match.job.ts" \
  "reconcileMatchResults" \
  "Match job must reconcile review items by identity, never delete-all-recreate"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "deleteByReconciliation" \
  "The delete-all-review-items path must stay deleted (re-runs destroyed reviewer decisions)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "carrierPolicyNumber" \
  "fetchOverrides must read policy numbers from the first-class column, not snapshot key guessing"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/review-item.service.ts" \
  "cancelPriorStatus" \
  "Cancel-previous-policy must capture prior state so UNDO can restore it"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts" \
  "hasCancelAction" \
  "Learned rules must never be built from or applied to cancel-bearing review items"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/decision-rule.service.ts" \
  "deactivateRuleForUndoneAutoApply" \
  "Undoing an auto-applied item must deactivate the rule that applied it"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/backfill-reconciliation-decision-rules.command.ts" \
  "isHumanApprovedReviewItem" \
  "Backfill must learn rules only from human approvals, never machine ones"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/state-machine.service.ts" \
  "TransitionConflictError" \
  "State machine transitions must be compare-and-swap (concurrent jobs must conflict, not clobber)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/mutation.service.ts" \
  "updateReconciliationIfStatus" \
  "Mutation service must expose the conditional status update backing CAS transitions"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/matching.ts" \
  "POLICY_NUMBER_NARROWED_RECENT" \
  "Recency-narrowed match winners must carry a distinct method with capped confidence"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/services/data.service.ts" \
  "MAX_POLICIES_FOR_MATCHING" \
  "Policy corpus fetch must be capped and carrier-scoped (null carrierId is a hard error)"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/types/carrier-config.ts" \
  "Validated carrier pipeline config boundary (parseCarrierPipelineConfig)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/match.job.ts" \
  "parseCarrierPipelineConfig" \
  "Match job must load carrier config through the validated boundary, not raw casts"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/parse.job.ts" \
  "parseCarrierPipelineConfig" \
  "Parse job must load carrier config through the validated boundary, not raw casts"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/parsers/transforms.ts" \
  "buildTransforms" \
  "Transform vocabulary must be a per-carrier factory (DD/MM carriers are pure config)"
check_file_not_exists \
  "packages/twenty-server/src/modules/reconciliation/parsers/generic.ts" \
  "Dead config-driven parser stack must stay deleted (audit 4.1)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/seed-ambetter-carrier-config.command.ts" \
  "buildCarrierConfigUpdate" \
  "Carrier seed must merge (never overwrite) user-captured column/status mappings"

echo ""
echo "--- Multi-carrier readiness (2026-06-12) ---"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/status.ts" \
  "requiredRoles" \
  "Status engines must be self-describing descriptors (requiredRoles/knownRoles/paramsSchema)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/parsers/transforms.ts" \
  "missingRequired" \
  "Status-role validation must check required-role PRESENCE per engine, not just resolvability"
check_file_exists \
  "docs/reconciliation/status-engine-authoring.md" \
  "Status-engine author playbook (the documented engine contract)"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/seed-carrier-config.command.ts" \
  "Generic carrier-config seed command with pre-flight validation"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/types/carrier-config.ts" \
  "unknown match tier" \
  "enabledTiers must hard-fail unknown tier ids (typos silently disabled tiers)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/types/carrier-config.ts" \
  "matchingConfig.startDate not set" \
  "Boundary must warn when a carrier config inherits the Ambetter startDate default"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/matching.ts" \
  "DEFAULT_TIER_TUNING" \
  "Tier confidences/weights/bands must be tierTuning knobs defaulting to the historical constants"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/services/carrier-config-validation.service.ts" \
  "validateCarrierConfig pre-run validation service (dry-run the fail-fast chain)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/parse.job.ts" \
  "configFingerprint" \
  "Runs must persist boundary warnings + a config fingerprint into stats"
check_file_exists \
  "packages/twenty-server/src/modules/reconciliation/query-hooks/carrier-config-update-one.pre-query.hook.ts" \
  "carrierConfig rename guard (learned rules/overrides join on carrierName)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/parsers/transforms.ts" \
  "compileArithmeticExpr" \
  "Computed-field arithmetic must use the safe evaluator (never eval)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/parsers/xlsx.ts" \
  "headerRow" \
  "XLSX parsing must honor parseSettings.headerRow (header below row 1)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/diff.ts" \
  "DEFAULT_DIFF_POLICY" \
  "Diff suppression policy must be per-carrier diffConfig with bit-for-bit defaults"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/types/policy-statuses.ts" \
  "DEFAULT_STATUS_VOCABULARY" \
  "Status vocabulary must be per-carrier configurable with the Omnia sets as defaults"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/matching.ts" \
  "IDENTIFIER_EXACT" \
  "Identifier-role matching tier must exist (BCBS-class identity unlock)"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/engines/matching.ts" \
  "buildIdentifierCanonicalizer" \
  "Per-carrier identifier canonicalization (capture group + normalization) must exist"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/match.job.ts" \
  "buildMissingFromBobItems" \
  "Missing-from-BOB must be implemented behind the enableMissingFromBob knob"
check_file_contains \
  "packages/twenty-server/src/modules/reconciliation/jobs/match.job.ts" \
  "runPolicyNumberDiscovery" \
  "Policy-number discovery must be implemented behind the enableDiscovery knob"
check_file_not_contains \
  "packages/twenty-server/src/modules/reconciliation/types/carrier-config.ts" \
  "not yet implemented server-side" \
  "The dead-knob warnings must stay dead — enableMissingFromBob/discovery are live now"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/seed-reconciliation-objects.command.ts" \
  "parseSettings" \
  "Seed must materialize the parseSettings/diffConfig/statusVocabulary carrierConfig fields"

# ======================================================================
# Apps platform and internal apps (Compliance QA, Brokerage)
# ======================================================================
echo ""
echo "=== Apps platform and internal apps (Compliance QA, Brokerage) ==="

echo ""
echo "--- App manifests on v2.58 (requiredCondition, subFieldName, no install user context) ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-field-manifest-to-universal-flat-field-metadata.util.ts" \
  "requiredCondition: fieldManifest.requiredCondition ?? null" \
  "App field manifests must carry the soft required rule into field metadata (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/__tests__/from-flat-field-metadata-to-field-manifest.util.spec.ts" \
  "should take the required rule from the manifest and leave it out of the export" \
  "Field manifest spec must cover the required rule: read from manifests, left out of exports (contract C5)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/converters/from-view-field-manifest-to-universal-flat-view-field.util.ts" \
  "subFieldName: null" \
  "App view-field manifests must emit subFieldName: null; only user-added sub-field columns set it (contract C6)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-install/application-install.service.ts" \
  "userWorkspaceId" \
  "App lifecycle hooks run with the application token (R-INSTALL); never forward the installing user"

echo ""
echo "--- Brokerage adoption command (dry run only, deploy-gated) ---"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  "ActiveOrSuspendedWorkspaceCommandRunner" \
  "Omnia CLI commands extend ProvisionedWorkspaceCommandRunner (v2.58 deleted ActiveOrSuspendedWorkspaceCommandRunner)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  "GlobalWorkspaceOrmManager" \
  "Omnia CLI commands use WorkspaceOrmManager (v2.58 deleted GlobalWorkspaceOrmManager)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  "workspace:adopt-brokerage-app is disabled on Twenty v2.58 until the Brokerage rewrite lands" \
  "Brokerage deploy gate: adoption refuses to apply until the v2.58 rewrite copies row-level permission rules (--dry-run still prints the plan)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  'INSERT INTO core."rowLevelPermissionPredicate' \
  "Brokerage adoption must never insert RLS predicates or groups with raw SQL; the rewrite copies rules through upsertRowLevelPermissionPredicates (contract C1)"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/__tests__/adopt-brokerage-app.command.spec.ts" \
  "refuses to adopt" \
  "Brokerage adoption spec must keep the fail-closed refusal coverage"

echo ""
echo "--- Logic-function AWS credentials for Omnia apps (HIPAA) ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-local-child-process-node-flags.util.ts" \
  "'--allow-addons'" \
  "HIPAA: native addons escape Node's permission model and could read the server env and the Pod Identity token; LOCAL logic functions run without them"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/__tests__/build-local-child-process-node-flags.util.spec.ts" \
  "never allows native addons" \
  "Node flag spec must assert native addons stay blocked"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-aws-container-credentials-env.util.ts" \
  "LOCAL logic functions get Pod Identity credentials only through this registration-bound hook (compliance-qa S3, Bedrock, Translate)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/__tests__/build-aws-container-credentials-env.util.spec.ts" \
  "Pod Identity hook allowlist, token handling and secret isolation must stay covered"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-aws-container-credentials-env.util.ts" \
  "allowedApplicationRegistrationIds.includes(applicationRegistrationId)" \
  "Pod Identity credentials must be bound to applicationRegistration ids, never the author-chosen universalIdentifier"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-aws-container-credentials-env.util.ts" \
  "AWS_EC2_METADATA_DISABLED: 'true'" \
  "Every LOCAL child must have the AWS SDK IMDS fallback disabled, so app code never silently gets the node role"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-aws-container-credentials-env.util.ts" \
  "...hostEnv" \
  "Pod Identity hook must never spread the pod env (PG_DATABASE_URL, APP_SECRET, CONVOSO_API_TOKEN) into app code"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-aws-container-credentials-env.util.ts" \
  "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE:" \
  "Pod Identity hook must hand app code the token value, never the token file path"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-child-process-runner.service.ts" \
  "buildAwsContainerCredentialsEnv" \
  "LOCAL child runner must call the Pod Identity hook, or compliance-qa loses AWS access"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-child-process-runner.service.ts" \
  "applicationRegistrationId: flatApplication.applicationRegistrationId" \
  "Pod Identity hook must key on the running function's application registration"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-child-process-runner.service.ts" \
  "env: { ...childEnv, ...awsContainerCredentialsEnv }" \
  "Pod Identity env must be spread last so host credentials win over same-named function variables"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-child-process-runner.service.ts" \
  "...process.env" \
  "LOCAL child runner must never pass the pod env wholesale to app code"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/constants/local-driver.constant.ts" \
  "'AWS_" \
  "Never widen the LOCAL inherited env allowlist with AWS variables; Pod Identity goes through the registration-bound hook"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local.driver.ts" \
  "options.awsContainerCredentialsApplicationRegistrationIds" \
  "LocalDriver must hand the Pod Identity allowlist to its child runner"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/types/local-driver.type.ts" \
  "awsContainerCredentialsApplicationRegistrationIds?: string[];" \
  "LocalDriverOptions must carry the Pod Identity allowlist"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/logic-function-driver.factory.ts" \
  "LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS" \
  "LOCAL driver factory must read the env-only Pod Identity allowlist"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts" \
  "LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS: string[] = [];" \
  "Pod Identity allowlist config var must exist (env-only) and default to no registration"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/logic-function/logic-function-drivers/drivers/local.driver.spec.ts" \
  "LocalDriver.execute AWS container credentials" \
  "End-to-end Pod Identity test (real sandboxed child) must survive upstream merges"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/.env.example" \
  "AWS_PROFILE" \
  "Compliance QA env template must not suggest AWS_PROFILE: v2.58 LOCAL functions only get Pod Identity container credentials or explicit short-lived keys"

echo ""
echo "--- Compliance QA on v2.58 and retired apps ---"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "Stored encrypted as a registration server variable" \
  "Compliance QA Deepgram key description must point admins to the encrypted registration server variable"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "deepgram-credentials" \
  "Compliance QA must not describe pod-env Deepgram delivery; the v2.58 LOCAL driver passes no pod env to app functions"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "## Running on Twenty v2.58" \
  "Compliance QA README must keep the v2.58 runtime and deploy notes"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "LOGIC_FUNCTION_AWS_CONTAINER_CREDENTIALS_APP_REGISTRATION_IDS" \
  "Compliance QA README must document the registration-id allowlist for Pod Identity container credentials"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "169.254.169.254" \
  "Compliance QA README must require blocking pod IMDS access (no silent node-role fallback)"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "install 1.2.0 with the switch off" \
  "Compliance QA README must keep the 1.2.0 cut-over order (kill switch off, deactivate legacy workflow, switch on)"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "NON_UPDATABLE_PROPERTY_DIVERGENCE" \
  "Compliance QA README must require a v2.58 CLI/SDK rebuild before any sync (system-field divergence)"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "npm install -g twenty@2.58.0" \
  "Compliance QA deploys must use the global twenty CLI pinned to the server version"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "against prod: both prune" \
  "Compliance QA README must forbid app apply/app dev against prod (both prune by default)"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "or pod env in production" \
  "Compliance QA README must not describe pod-env Deepgram delivery"
check_file_not_exists \
  "packages/twenty-apps/internal/call-recording/package.json" \
  "Old upstream call-recording app is retired: superseded by the standard callRecording object and public/call-recorder (U18)"
check_file_not_exists \
  "packages/twenty-apps/internal/payment-reconciliation/package.json" \
  "Payment reconciliation v1 app is retired: superseded by the native reconciliation module (U19)"

echo ""
echo "--- Brokerage app (deploy-gated) ---"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/README.md" \
  "Do not install, sync or adopt Brokerage on Twenty v2.58" \
  "Brokerage README must keep the v2.58 deploy gate until the Brokerage SDK migration (U15-U17) lands"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/README.md" \
  "workspace:omnia-verify-permissions" \
  "Brokerage deploy gate must require the permission verification after every install or sync"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "scope" \
  "Brokerage post-install must not send RLS scope: v2.58 inputs have none and grants live on rules (contract C1)"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "RowLevelPermissionPredicateScope" \
  "Brokerage post-install must not reintroduce the RLS scope type"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "canUpdateObjectRecords: true" \
  "Brokerage post-install must never grant Agent update on every policy: an object grant bypasses the agent rule (C1)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "canUpdateObjectRecords: false" \
  "Brokerage post-install must turn off Agent object-level Policy writes (C1)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "canCreateRecords: true" \
  "Brokerage Agent Policy rule must grant create explicitly (C1 read all, write own)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "canReadRecords: false" \
  "Brokerage Agent Policy rule must not grant read; reads stay an object-level grant (C1)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "canUpdateRecords: true" \
  "Brokerage Agent Policy rule must grant update explicitly (C1)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "canSoftDeleteRecords: false" \
  "Brokerage Agent Policy rule must not grant soft delete; agents never held it on Policy (C1)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "canDestroyRecords: false" \
  "Brokerage Agent Policy rule must not grant destroy; agents never held it on Policy (C1)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "...ruleGrants," \
  "Brokerage RLS upsert must send every rule grant explicitly; omitted grants default to false on new rules"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "predicateGroups: []," \
  "Brokerage RLS upsert must keep the (Agent, Policy) pair at a single rule (C1 single-rule invariant)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "relationFieldMetadataId: agentPolicyFieldIds.policyAgentFieldMetadataId" \
  "Brokerage Agent Policy predicate must be the policy.agent -> agentProfile.workspaceMember hop (contract C2)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "canUpdateObjectRecords: false" \
  "Brokerage Agent manifest must not grant update on every policy; the agent rule decides Policy writes (C1)"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/application-config.ts" \
  "write-scoped" \
  "Brokerage About text must not describe the removed RLS scope"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/README.md" \
  "read included, for any operation an Agent rule restricts" \
  "Brokerage deploy gate must forbid object-level all-records reads too: on v2.58 such a grant wins over the Agent's own-leads rule (C1, PHI)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/README.md" \
  "Edit window in the manifest" \
  "Brokerage deploy gate must require the Agent edit window in the manifest: every app sync resets an omitted editWindowMinutes to null (C3)"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/README.md" \
  "workspace adoption copies the current Member" \
  "Brokerage README must not claim adoption copies Member permissions: on v2.58 workspace:adopt-brokerage-app is dry-run only"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "...(editWindowMinutes === undefined ? {} : { editWindowMinutes })," \
  "Brokerage memberObjectPermission must pass a declared edit window through to the manifest (C3 deploy-gate item)"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "WHERE \"workspaceWorkflowId\" = '32ef78c2-f7f2-4e07-96b0-8b35e57b2d13';" \
  "Compliance QA README must find the legacy pipeline by core.workflow.workspaceWorkflowId: the 2.23 upgrade gives the core workflow a new id"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/README.md" \
  "the legacy core workflow from the lookup" \
  "Compliance QA 1.2.0 cut-over must deactivate the legacy core workflow found by workspaceWorkflowId, or every Call is processed twice (PHI to Deepgram and Bedrock)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/custom/constants/brokerage-app-adoption.constants.ts" \
  "ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE" \
  "Brokerage adoption must not derive permission identifiers with the pre-v2.58 role namespace; the rewrite uses getObjectPermissionUniversalIdentifier / getFieldPermissionUniversalIdentifier"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.dashboard.universalIdentifier" \
  "Brokerage Agent must declare its dashboard deny row: undeclared, every manifest sync deletes the audience sync's deny row and reopens every dashboard (C1)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "canReadObjectRecords: false," \
  "Brokerage Agent dashboard row must deny reads at object level; only the audience rule grants dashboards (C1)"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/agent-profile.ts" \
  "isSearchable: true" \
  "Brokerage must not make agentProfile.email or npn searchable: the Agent role cannot read them, and search matches hidden values"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/README.md" \
  "makes unreadable, such as" \
  "Brokerage deploy gate must forbid isSearchable on fields a role cannot read (agentProfile.email, npn)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/README.md" \
  "seeds the Agent dashboard audience rule" \
  "Brokerage deploy gate must seed the Agent dashboard audience rule: with the manifest deny row the audience sync never creates it"
check_file_exists \
  "docs/brokerage-app-spec.md" \
  "Brokerage app implementation spec must exist"
check_file_contains \
  "docs/brokerage-app-spec.md" \
  "Do not use uninstall/reinstall to refresh or upgrade an existing Omnia" \
  "Brokerage app spec must document destructive uninstall behavior for adopted workspaces"
check_file_exists \
  "docs/brokerage-app-test-plan.md" \
  "Brokerage production-readiness test plan must exist"
check_file_contains \
  "docs/brokerage-app-test-plan.md" \
  "existing Omnia adoption path is the highest-risk area" \
  "Brokerage test plan must prioritize existing Omnia adoption risk"
check_file_contains \
  "docs/brokerage-app-test-plan.md" \
  "App Upgrade After Adoption" \
  "Brokerage test plan must cover post-adoption upgrade"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/package.json" \
  "Brokerage app package must exist"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/README.md" \
  "Existing Omnia-shaped workspaces with live data must not be refreshed by" \
  "Brokerage README must warn against uninstall/reinstall on live Omnia data"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/package.json" \
  '"lint": "oxlint -c .oxlintrc.json ."' \
  "Brokerage app lint script must stay executable"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/application-config.ts" \
  "displayName: 'Brokerage'" \
  "Brokerage app must keep the user-facing app name"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/application-config.ts" \
  "aboutDescription: BROKERAGE_ABOUT_DESCRIPTION" \
  "Brokerage app must keep rich About-page markdown"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/application-config.ts" \
  "defaultRoleUniversalIdentifier" \
  "Brokerage app must keep the default function role binding"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/constants/universal-identifiers.ts" \
  "Brokerage universal identifiers must stay stable"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/constants/field-options.ts" \
  "Brokerage shared field options must exist"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/objects/agent-profile.ts" \
  "Brokerage Agent object must exist"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/objects/call.ts" \
  "Brokerage Call object must exist"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/objects/policy.ts" \
  "Brokerage Policy object must exist"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/objects/lead-source.ts" \
  "Brokerage Lead Source object must exist"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/carrier.ts" \
  "junctionTargetFieldUniversalIdentifier:" \
  "Brokerage Carrier Products relation must declare Product as its junction target for picker filtering"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/product.ts" \
  "junctionTargetFieldUniversalIdentifier:" \
  "Brokerage Product Carriers relation must declare Carrier as its junction target for picker filtering"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/fields/assigned-agent-on-lead.field.ts" \
  "Brokerage Lead must expose Assigned Agent"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/fields/policies-on-lead.field.ts" \
  "Brokerage Lead must expose related Policies"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/fields/family-members-on-lead.field.ts" \
  "Brokerage Lead must expose related Family Members"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/fields/calls-on-lead.field.ts" \
  "Brokerage Lead must expose related Calls"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/fields/agent-profile-on-workspace-member.field.ts" \
  "Brokerage Workspace Member must expose related Agent profile"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/call.ts" \
  "convosoCallId" \
  "Brokerage Call object must not include provider-specific Convoso IDs"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/call.ts" \
  "convosoLeadId" \
  "Brokerage Call object must not include provider-specific lead IDs"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/policy.ts" \
  "oldCrmPolicyId" \
  "Brokerage Policy object must not include legacy import IDs"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/policy.ts" \
  "reviewItems" \
  "Brokerage Policy object must not include reconciliation review relations"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/lead-source.ts" \
  "convosoListId" \
  "Brokerage Lead Source object must not include provider-specific list IDs"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/lead-source.ts" \
  "queueKey" \
  "Brokerage Lead Source object must not include provider-specific queue keys"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/default-function.role.ts" \
  "PermissionFlag.VIEWS" \
  "Brokerage default function role must be able to normalize app-managed view sorts"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/default-function.role.ts" \
  "PermissionFlag.DATA_MODEL" \
  "Brokerage default function role must be able to normalize Lead/Policy required-field metadata"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/default-function.role.ts" \
  "PermissionFlag.ROLES" \
  "Brokerage default function role keeps ROLES until U15; on v2.58 app tokens cannot write roles (see the README deploy gate)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/default-function.role.ts" \
  "STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier" \
  "Brokerage default function role must be able to update Lead status records"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "ensureAgentPolicyOwnershipRls" \
  "Brokerage post-install must keep the C1 Agent Policy ownership writer until U15 moves it server-side"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "UPSERT_ROW_LEVEL_PERMISSION_PREDICATES_MUTATION" \
  "Brokerage post-install must upsert the Agent Policy rule with every grant explicit (C1)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "RowLevelPermissionPredicateInput" \
  "Brokerage post-install must send only RLS predicate input fields (no DTO-only objectMetadataId)"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "label: 'Agent'" \
  "Brokerage Agent role template must exist"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/manager.role.ts" \
  "label: 'Manager'" \
  "Brokerage Manager role template must exist"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "canReadAllObjectRecords: true" \
  "Brokerage Agent keeps role-wide read-all until the deploy gate's C1 item lands (README); flip this pin with that change"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "showAllObjectsInSidebar: false" \
  "Brokerage Agent role must use Omnia Member sidebar gating"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "showInSidebar: true" \
  "Brokerage Agent role must explicitly expose the Omnia Member sidebar objects"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note" \
  "Brokerage Agent role must expose Notes like Omnia Member"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/agent.role.ts" \
  "STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task" \
  "Brokerage Agent role must expose Tasks like Omnia Member"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/constants/brokerage-app-adoption.constants.ts" \
  "junctionTargetFieldUniversalIdentifier:" \
  "Brokerage adoption must preserve Carrier to Product junction picker metadata"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  "mergeFieldSettingsPatch" \
  "Brokerage adoption plan must patch relation field settings without recreating fields"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/roles/manager.role.ts" \
  "canUpdateAllSettings: true" \
  "Brokerage Manager role must not have workspace admin settings access"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/navigation-menu-items/carriers-folder.navigation-menu-item.ts" \
  "Brokerage Carrier/Product setup must stay grouped in the sidebar"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/navigation-menu-items/leads.navigation-menu-item.ts" \
  "targetObjectUniversalIdentifier:" \
  "Brokerage Leads sidebar entry must open the locked default Leads object view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/navigation-menu-items/policies.navigation-menu-item.ts" \
  "targetObjectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER" \
  "Brokerage Policies sidebar entry must open the locked default Policies object view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/navigation-menu-items/calls.navigation-menu-item.ts" \
  "targetObjectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER" \
  "Brokerage Calls sidebar entry must open the locked default Calls object view"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/navigation-menu-items/leads.navigation-menu-item.ts" \
  "NavigationMenuItemType.VIEW" \
  "Brokerage Leads sidebar entry must not create a duplicate default view"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/navigation-menu-items/policies.navigation-menu-item.ts" \
  "NavigationMenuItemType.VIEW" \
  "Brokerage Policies sidebar entry must not create a duplicate default view"
check_file_not_contains \
  "packages/twenty-apps/internal/brokerage/src/navigation-menu-items/calls.navigation-menu-item.ts" \
  "NavigationMenuItemType.VIEW" \
  "Brokerage Calls sidebar entry must not create a duplicate default view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/leads-today.view.ts" \
  "Brokerage Leads must include a Today view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/leads-mtd.view.ts" \
  "Brokerage Leads must include an MTD view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/policies-today.view.ts" \
  "Brokerage Policies must include a Today view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/policies-mtd.view.ts" \
  "Brokerage Policies must include an MTD view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/calls-today.view.ts" \
  "Brokerage Calls must include a Today view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/calls-mtd.view.ts" \
  "Brokerage Calls must include an MTD view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/lead-record-page-fields.view.ts" \
  "Brokerage Lead record page must use a curated fields-widget view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/views/lead-record-page-fields.view.ts" \
  "ViewType.FIELDS_WIDGET" \
  "Brokerage Lead record page fields view must be a fields widget view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/policy-record-page-fields.view.ts" \
  "Brokerage Policy record page must use a curated fields-widget view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/views/policy-record-page-fields.view.ts" \
  "ViewType.FIELDS_WIDGET" \
  "Brokerage Policy record page fields view must be a fields widget view"
check_file_exists \
  "packages/twenty-apps/internal/brokerage/src/views/call-record-page-fields.view.ts" \
  "Brokerage Call record page must use a curated fields-widget view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/views/call-record-page-fields.view.ts" \
  "ViewType.FIELDS_WIDGET" \
  "Brokerage Call record page fields view must be a fields widget view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "createViewSort" \
  "Brokerage post-install must add missing descending view sorts"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "updateViewSort" \
  "Brokerage post-install must repair existing non-descending view sorts"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "shouldRunOnVersionUpgrade: true" \
  "Brokerage post-install view sort normalization must run on app upgrades"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "VIEW_MODIFICATION_PERMISSION_ERROR_MESSAGE" \
  "Brokerage post-install view sort normalization must not fail installs when locked views cannot be modified"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "REQUIRED_LEAD_FIELD_NAMES" \
  "Brokerage post-install must keep required Lead field setup"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "requiredCondition: ALWAYS_REQUIRED_CONDITION" \
  "Brokerage post-install must mark required Lead fields through metadata required conditions"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "REQUIRED_POLICY_FIELD_NAMES" \
  "Brokerage post-install must keep required Policy field setup"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "POLICY_APPLICATION_ID_DEPENDENCY_FIELD_NAME" \
  "Brokerage post-install must require Application ID when Policy Number is empty"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "POLICY_POLICY_NUMBER_DEPENDENCY_FIELD_NAME" \
  "Brokerage post-install must require Policy Number when Application ID is empty"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/fields/lead-status.field.ts" \
  "defaultValue: \"'ASSIGNED'\"" \
  "Brokerage Lead Status field must default new Leads to Assigned"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "LEAD_STATUS_DEFAULT_VALUE" \
  "Brokerage post-install must repair existing Lead Status defaults"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/objects/policy.ts" \
  "defaultValue: \"'SUBMITTED'\"" \
  "Brokerage Policy Status field must default new Policies to Submitted"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/post-install.ts" \
  "POLICY_STATUS_DEFAULT_VALUE" \
  "Brokerage post-install must repair existing Policy Status defaults"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/set-lead-assigned-status-on-create.ts" \
  "eventName: 'person.created'" \
  "Brokerage Lead status creation automation must listen to Lead creation"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/set-lead-assigned-status-on-update.ts" \
  "eventName: 'person.updated'" \
  "Brokerage Lead status update automation must listen to Lead updates"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/logic-functions/set-lead-assigned-status-on-update.ts" \
  "updatedFields: ['assignedAgentId']" \
  "Brokerage Lead status update automation must only run when Assigned Agent changes"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/utils/lead-status.ts" \
  "leadStatus: 'ASSIGNED'" \
  "Brokerage Lead status automation must set Status to Assigned"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "LEAD_RECORD_PAGE_FIELDS_VIEW_ID" \
  "Brokerage Lead record page layout must use the curated production-style fields view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "LEAD_POLICIES_FIELD_ID" \
  "Brokerage Lead record page layout must expose Policies as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "LEAD_SOURCE_FIELD_ID" \
  "Brokerage Lead record page layout must expose Lead Source as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "LEAD_ASSIGNED_AGENT_FIELD_ID" \
  "Brokerage Lead record page layout must expose Assigned Agent as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "LEAD_CALLS_FIELD_ID" \
  "Brokerage Lead record page layout must expose Calls as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "LEAD_FAMILY_MEMBERS_FIELD_ID" \
  "Brokerage Lead record page layout must expose Family Members as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "fieldDisplayMode: 'CARD'" \
  "Brokerage Lead relation fields must render as record-page cards"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/policy-record-page-layout.ts" \
  "viewUniversalIdentifier: POLICY_RECORD_PAGE_FIELDS_VIEW_ID" \
  "Brokerage Policy record page layout must use the curated fields view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/policy-record-page-layout.ts" \
  "fieldMetadataId: POLICY_LEAD_FIELD_ID" \
  "Brokerage Policy record page layout must expose Lead as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/policy-record-page-layout.ts" \
  "fieldMetadataId: POLICY_AGENT_FIELD_ID" \
  "Brokerage Policy record page layout must expose Agent as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/policy-record-page-layout.ts" \
  "fieldMetadataId: POLICY_CARRIER_FIELD_ID" \
  "Brokerage Policy record page layout must expose Carrier as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/policy-record-page-layout.ts" \
  "fieldMetadataId: POLICY_PRODUCT_FIELD_ID" \
  "Brokerage Policy record page layout must expose Product as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/call-record-page-layout.ts" \
  "viewUniversalIdentifier: CALL_RECORD_PAGE_FIELDS_VIEW_ID" \
  "Brokerage Call record page layout must use the curated fields view"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/call-record-page-layout.ts" \
  "fieldMetadataId: CALL_LEAD_FIELD_ID" \
  "Brokerage Call record page layout must expose Lead as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/call-record-page-layout.ts" \
  "fieldMetadataId: CALL_AGENT_FIELD_ID" \
  "Brokerage Call record page layout must expose Agent as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/call-record-page-layout.ts" \
  "fieldMetadataId: CALL_LEAD_SOURCE_FIELD_ID" \
  "Brokerage Call record page layout must expose Lead Source as a relation card"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "configurationType: 'EMAILS'" \
  "Brokerage Lead record page layout must expose the Emails tab"
check_file_contains \
  "packages/twenty-apps/internal/brokerage/src/page-layouts/lead-record-page-layout.ts" \
  "configurationType: 'CALENDAR'" \
  "Brokerage Lead record page layout must expose the Calendar tab"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  "Brokerage metadata adoption planner (dry run only on v2.58) must exist for existing Omnia workspaces"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  "workspace:adopt-brokerage-app" \
  "Brokerage adoption command must stay registered under the expected name"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  "options.dryRun === true" \
  "Brokerage adoption must treat only an explicit --dry-run as safe; every other invocation refuses"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/adopt-brokerage-app.command.ts" \
  "DRY_RUN_BROKERAGE_APPLICATION_ID" \
  "Brokerage adoption dry-run must work before the app shell exists"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/__tests__/adopt-brokerage-app.command.spec.ts" \
  "Brokerage adoption command must keep focused regression coverage"
check_file_exists \
  "packages/twenty-server/src/database/commands/custom/constants/brokerage-app-adoption.constants.ts" \
  "Brokerage adoption constants must exist"
check_file_contains \
  "packages/twenty-server/src/database/commands/custom/constants/brokerage-app-adoption.constants.ts" \
  "BROKERAGE_APP_UNIVERSAL_IDENTIFIER" \
  "Brokerage adoption constants must keep the app universal identifier"

echo ""
echo "--- Compliance QA app ---"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "Compliance QA scorecard app object must exist"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-manager.ts" \
  "Compliance QA app-owned manager assignment object must exist"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/constants/universal-identifiers.ts" \
  "Compliance QA relation object and field identifiers must stay stable"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/fields/qa-managers-on-workspace-member.field.ts" \
  "Compliance QA manager records must be selectable workspace members"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/fields/qa-scorecards-on-call.field.ts" \
  "Compliance QA scorecards must relate back to source Call records"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/fields/qa-scorecards-on-lead.field.ts" \
  "Compliance QA scorecards must relate back to source Lead records"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/fields/qa-scorecards-on-agent-profile.field.ts" \
  "Compliance QA scorecards must relate back to Agent Profile records"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/fields/qa-scorecards-on-task.field.ts" \
  "Compliance QA scorecards must relate back to follow-up Task records"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/navigation-menu-items/quality-assurance-folder-navigation-menu-item.ts" \
  "Compliance QA sidebar views must stay nested under the Quality Assurance folder"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/.nvmrc" \
  "Compliance app deploy action must have a local Node version file"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/.oxlintrc.json" \
  "Compliance app linting must use the standard Twenty app oxlint config"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/package.json" \
  '"lint": "oxlint -c .oxlintrc.json ."' \
  "Compliance app lint script must stay executable"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/package.json" \
  '"version": "1.' \
  "Compliance app production package version must stay on a 1.x production line"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/package.json" \
  '"version": "1.1.3"' \
  "Compliance app production package version must include Deepgram transcription, false-positive fixes, the compliance-vs-sales result split, and the result reason field"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/package.json" \
  '"version": "0.' \
  "Compliance app production package version must not regress to a 0.x prerelease"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'call'" \
  "QA Scorecard source Call must be a relation field, not a text UUID"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'agent'" \
  "QA Scorecard agent must be a relation field, not denormalized text"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'lead'" \
  "QA Scorecard lead must be a relation field, not denormalized text"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'qaManager'" \
  "QA Scorecard QA Manager must be a relation field"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'score'" \
  "QA Scorecard should expose the concise score field"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'result'" \
  "QA Scorecard should expose the concise result field"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'qaType'" \
  "QA Scorecard should expose the concise call/rubric type field without using reserved field names"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "label: 'Type'" \
  "QA Scorecard rubric type should still appear as Type in the UI"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'redFlag'" \
  "QA Scorecard should expose the concise red flag field"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'reason'" \
  "QA Scorecard should expose a board-visible result reason field"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "sourceCallId" \
  "QA Scorecard should not regress to storing source Call as text UUID"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'sourceCallKey'" \
  "QA Scorecard must keep a unique technical source-call key for idempotency"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "isUnique: true" \
  "QA Scorecard source-call key must stay unique to prevent duplicate scorecards"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'transcribeJobName'" \
  "QA Scorecard should not store deterministic transient Transcribe job names"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'overallScore'" \
  "QA Scorecard should not regress to verbose overallScore field naming"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'overallResult'" \
  "QA Scorecard should not regress to verbose overallResult field naming"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'callType'" \
  "QA Scorecard should not regress to verbose callType field naming"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'hasRedFlag'" \
  "QA Scorecard should not regress to verbose hasRedFlag field naming"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'errorMessage'" \
  "QA processing errors should be written to Notes instead of scorecard fields"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'scoreDetails'" \
  "QA score details should be written to Notes instead of scorecard fields"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'redFlagDetails'" \
  "QA red flag details should be written to Notes instead of scorecard fields"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'transcript'" \
  "QA transcripts should be written to Notes instead of scorecard fields"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'recommendations'" \
  "QA recommendations should be written to Notes instead of scorecard fields"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'scoringEvidence'" \
  "QA scoring evidence should be written to Notes instead of scorecard fields"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'transcribeInputS3Key'" \
  "Transcribe input artifacts should be written to Notes instead of scorecard fields"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/objects/qa-scorecard.ts" \
  "name: 'transcribeOutputS3Key'" \
  "Transcribe output artifacts should be written to Notes instead of scorecard fields"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/navigation-menu-items/qa-scorecard-navigation-menu-item.ts" \
  "folderUniversalIdentifier" \
  "Compliance QA Scorecards view must stay nested under Quality Assurance"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/navigation-menu-items/qa-manager-navigation-menu-item.ts" \
  "folderUniversalIdentifier" \
  "Compliance QA Managers view must stay nested under Quality Assurance"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "displayName: 'Compliance'" \
  "Compliance app must keep the user-facing app name concise"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "aboutDescription: COMPLIANCE_APP_ABOUT_DESCRIPTION" \
  "Compliance app must keep rich About-page markdown"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "COMPLIANCE_QA_TRANSCRIBE_BUCKET" \
  "Compliance QA must keep S3 bucket configuration for recording and transcript artifacts"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "DEEPGRAM_API_KEY" \
  "Compliance QA must declare the Deepgram API key as an encrypted registration server variable (the only path on v2.58; no pod env)"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "COMPLIANCE_QA_BEDROCK_MODEL_ID" \
  "Compliance QA must keep Amazon Bedrock model configuration for scoring"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "COMPLIANCE_QA_MIN_DURATION_SECONDS" \
  "Compliance QA must keep a duration gate to control transcription spend"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "COMPLIANCE_QA_ENABLED_AFTER" \
  "Compliance QA must support rollout-date filtering"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "Sale - ACA Only,Sale - ACA + Private,Sale - Private Only" \
  "Compliance QA must default to sale-disposition status-name eligibility"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "Amazon Translate" \
  "Compliance QA app setup copy must mention translation runtime usage"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/scoring.ts" \
  "RED_FLAG_AUTO_FAIL_MIN_CONFIDENCE" \
  "Compliance QA must gate red-flag auto-fail on AI confidence"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/constants/compliance-rules.ts" \
  "COMPLIANCE_CRITERION_IDS" \
  "Compliance QA result must be driven by compliance criteria, not sales effectiveness"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/constants/compliance-rules.ts" \
  "automated system or IVR recording notice satisfies" \
  "Compliance QA must accept an automated recorded-line notice instead of auto-failing"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/constants/compliance-rules.ts" \
  "Never infer that a disclosure, platform, or action occurred" \
  "Compliance QA scoring prompt must forbid inferring compliance from the rubric text"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/roles/default-role.ts" \
  "objectPermissions" \
  "Compliance QA app role must use granular object permissions"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/roles/default-role.ts" \
  "canReadAllObjectRecords: true" \
  "Compliance QA app role must not have blanket read access"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/roles/default-role.ts" \
  "canUpdateAllObjectRecords: true" \
  "Compliance QA app role must not have blanket update access"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/package.json" \
  "@aws-sdk/client-bedrock-runtime" \
  "Compliance QA must use AWS Bedrock Runtime directly for scoring"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/package.json" \
  "@aws-sdk/client-translate" \
  "Compliance QA must keep Amazon Translate available as transcript translation fallback"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-config.ts" \
  "Compliance QA AWS clients must share one typed config helper"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-translate.ts" \
  "Compliance QA Spanish-to-English transcript translation helper must exist"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-translate.ts" \
  "callAi" \
  "Compliance QA transcript translation must use Bedrock context before literal segment fallback"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-translate.ts" \
  "TranslateTextCommand" \
  "Compliance QA transcript translation must retain Amazon Translate fallback"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/call-ai.ts" \
  "BedrockRuntimeClient" \
  "Compliance QA scoring must use Amazon Bedrock directly"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/call-ai.ts" \
  "escapeControlCharactersInJsonStrings" \
  "Compliance QA scoring must tolerate raw control characters in AI JSON strings"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/call-ai.ts" \
  "/rest/ai/generate-text" \
  "Compliance QA scoring must not depend on Twenty AI REST endpoint permissions"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/start-compliance-qa.ts" \
  "Start Compliance QA" \
  "Compliance QA workflow action must remain available for custom/manual workflows"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "Compliance QA must create its visible workflow during app install"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "definePostInstallLogicFunction" \
  "Compliance QA workflow setup must run as a post-install hook"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "Compliance Call Pipeline" \
  "Compliance QA must install a visible CRM Workflow object"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "call.upserted" \
  "Compliance QA workflow must react to created and updated Calls"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "'leadId'" \
  "Compliance QA workflow must react to source Lead changes"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "CALL_FIELDS_THAT_CAN_AFFECT_QA_ELIGIBILITY" \
  "Compliance QA workflow must ignore unrelated Call edits"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "activateWorkflowVersion" \
  "Compliance QA install must activate the visible workflow"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "DELAY" \
  "Compliance QA workflow must own delayed completion polling with delay steps"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "shouldPollAgain" \
  "Compliance QA workflow must branch completion polling based on action output"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "createDraftFromWorkflowVersion" \
  "Compliance QA app upgrades must update the app-managed workflow version"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/start-compliance-qa.ts" \
  "readCachedTranscriptForCall" \
  "Compliance QA retries must reuse cached transcript output before paying to transcribe again"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/start-compliance-qa.ts" \
  "isRecordingNotReadyError" \
  "Compliance QA start worker must keep provider-not-ready recordings retryable"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/start-compliance-qa.ts" \
  "isCallEligibleForComplianceQa" \
  "Compliance QA start worker must filter calls before creating scorecards or paid transcription work"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/start-compliance-qa.ts" \
  "upsertTranscriptionArtifactAttachments" \
  "Compliance QA start worker must attach transcription artifacts to scorecard Files"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/backfill-compliance-qa.ts" \
  "resolveDryRun" \
  "Compliance QA backfill must be dry-run safe by default"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/backfill-compliance-qa.ts" \
  "confirm" \
  "Compliance QA backfill must require explicit confirmation before queueing live work"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "transcribeRecording" \
  "Compliance QA completion worker must transcribe synchronously with Deepgram (BAA-covered), not Amazon Transcribe jobs"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "cronTriggerSettings" \
  "Compliance QA completion polling must be owned by Workflow delay steps, not cron"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "isFinalAttempt" \
  "Compliance QA workflow polling must fail visibly when transcription never succeeds"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "findProcessableQaScorecards" \
  "Compliance QA completion worker must process cached SCORING scorecards"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "writeTranscriptForCall" \
  "Compliance QA must cache the raw transcript to S3 before scoring so scoring failures never re-bill transcription"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "isTranscriptionRetryableError" \
  "Compliance QA must keep retryable Deepgram errors in TRANSCRIBING for the next polling attempt"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "translateTranscriptToEnglish" \
  "Compliance QA must translate Spanish transcripts before scoring"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "title: 'Transcript'" \
  "Compliance QA transcript output must be written to Notes without a redundant QA prefix"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "Deepgram Transcript JSON" \
  "Compliance QA completion worker must attach transcription artifacts to scorecard Files"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "linkTaskToComplianceContextIfSupported" \
  "Compliance QA follow-up tasks must be linked to scorecard, call, and agent context"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "analysis.overallResult !== 'FAIL' || analysis.hasRedFlag !== true" \
  "Compliance QA follow-up tasks must only be created for failed red-flag scorecards"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "No active QA Manager" \
  "Compliance QA must fail loudly instead of creating unassigned follow-up tasks"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/records.ts" \
  "targetAgentProfileId" \
  "Compliance QA follow-up task targets must include Agent Profile links"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/records.ts" \
  "targetQaScorecardId" \
  "Compliance QA follow-up task targets must include QA Scorecard links"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/records.ts" \
  "upsertQaScorecardAttachment" \
  "Compliance QA must upsert scorecard attachments for the Files tab"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/records.ts" \
  "uploadFilesFieldFileByUniversalIdentifier" \
  "Compliance QA Files tab artifacts must use native Twenty file records"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/graphql-client.ts" \
  "graphqlMultipartRequest" \
  "Compliance QA must keep multipart GraphQL uploads for FilesField-backed attachments"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/deepgram.ts" \
  "DEEPGRAM_API_KEY" \
  "Compliance QA transcription must run on Deepgram under the Enterprise BAA"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/deepgram.ts" \
  "mip_opt_out: 'true'" \
  "Compliance QA must opt PHI call audio out of Deepgram model-improvement retention (BAA requirement)"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/deepgram.ts" \
  "language: 'multi'" \
  "Compliance QA Deepgram requests must use word-level English/Spanish code-switching"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/deepgram.ts" \
  "diarize: 'true'" \
  "Compliance QA Deepgram requests must keep speaker diarization for transcript speaker labels"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/recording-storage.ts" \
  "getTranscriptOutputLocation" \
  "Compliance QA must keep deterministic transcript output locations for retry cost control"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/recording-storage.ts" \
  "dg-v1" \
  "Compliance QA transcript cache keys must be versioned so Amazon Transcribe artifacts are never parsed as Deepgram output"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/recording-storage.ts" \
  "RecordingNotReadyError" \
  "Compliance QA must classify provider recording-not-ready responses before paid transcription"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/qa-call-eligibility.ts" \
  "Compliance QA call eligibility filters must stay centralized"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/qa-call-eligibility.test.ts" \
  "Compliance QA status-name eligibility filters must stay covered"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/scoring.test.ts" \
  "Compliance QA scoring thresholds and red-flag override tests must exist"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/deepgram.test.ts" \
  "Compliance QA Deepgram normalization and translation gating must stay covered"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/transcript.ts" \
  "Compliance QA provider-neutral transcript domain (types/formatting/language helpers) must exist"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/recording-storage.ts" \
  "claimTranscriptionForCall" \
  "Compliance QA must claim a call before transcribing so overlapping polls never double-bill Deepgram"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-translate.test.ts" \
  "Compliance QA transcript translation must stay covered"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/call-ai.test.ts" \
  "Compliance QA AI JSON extraction must stay covered"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/error-message.ts" \
  "Compliance QA must use explicit unknown error narrowing helpers"

echo ""
echo "--- App development sync (upstream v2.58) ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-development/application-development.resolver.ts" \
  "DevelopmentGuard" \
  "Upstream v2.58 has no DevelopmentGuard; if one returns, review it. Prod deploys use twenty app publish --private + install, never app dev"

# ======================================================================
# Export and import
# ======================================================================
echo ""
echo "=== Export and import ==="

echo ""
echo "--- Server-side import job: requester auth, IMPORT_CSV, userWorkspaceId scoping ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.resolver.ts" \
  "PermissionFlagType.IMPORT_CSV" \
  "Every import job operation, including the importJob query, must require IMPORT_CSV"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.resolver.ts" \
  "apiKey: false" \
  "The import job API accepts user sessions only (no API keys, OAuth clients or applications)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.resolver.ts" \
  "onImportJobProgress" \
  "Import progress is polled; the workspace-wide progress subscription must not come back (C14)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/dtos/import-job.dto.ts" \
  "validatedRows" \
  "The import job GraphQL output must never expose the staged rows (PHI)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.service.ts" \
  "userWorkspaceId: requester.userWorkspaceId" \
  "Every import job read and write by id must be scoped to the requester's userWorkspace"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.service.ts" \
  "InjectWorkspaceScopedRepository(ImportJobEntity)" \
  "Import job service must use the workspace-scoped repository so workspaceId is always enforced"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.service.ts" \
  "retryLimit: 0" \
  "Import jobs must not auto-retry (a retry would re-run the import from row 0)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.service.ts" \
  "assignMissingImportRowIds" \
  "Rows get an id at upload so a re-run updates them instead of inserting duplicates"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/assign-missing-import-row-ids.util.ts" \
  "Assigns a uuid to every uploaded import row that has none"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/__tests__/import-job.service.spec.ts" \
  "Import job service spec: requester scoping, not-found for foreign jobs, enqueue options, row ids"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "userWorkspaceAuthContextService.resolve" \
  "The import job must run as its requester, rebuilt from the job's userWorkspaceId"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "PermissionFlagType.IMPORT_CSV" \
  "The import job must re-check IMPORT_CSV before writing anything"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "The import worker restarted while processing this import" \
  "A job redelivered while PROCESSING (importQueue maxStalledCount 1) must fail, never re-run from row 0"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "injectActorFieldsOnCreate" \
  "Imported records must carry the requester as createdBy/updatedBy (source IMPORT)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "getRepositoryWithoutPermissionChecks" \
  "The import job is a user path: it must never use a repository that skips permission checks (G9)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "shouldBypassPermissionChecks" \
  "The import job must never bypass RLS or field permissions (G9)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "eventEmissionPolicy" \
  "eventEmissionPolicy was removed (R-ORIGIN); imports keep emitting CREATED/UPDATED"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "shouldSkipEventEmission" \
  "Imports must keep emitting CREATED/UPDATED, or they lose their timeline entries (R-ORIGIN)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "IMPORT_PARTIAL_SUCCESS" \
  "The upsert connect tolerance is dropped (R-CONNECT); the processor has no partial-success branch"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/__tests__/import-job.processor.spec.ts" \
  "fails a job redelivered while processing without writing any record" \
  "Regression test for the import redelivery guard"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/__tests__/import-job.processor.spec.ts" \
  "runs every read and write in the requester context with permission-checked repositories" \
  "Regression test: requester context, getRepository only, no bypass member touched"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/resolve-import-relations.util.ts" \
  "rethrowPermissionErrorOrLog" \
  "Relation lookups run as the requester: a permission error must fail the job instead of creating duplicates"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/resolve-import-relations.util.spec.ts" \
  "fails instead of creating a duplicate when the requester cannot read the lookup fields" \
  "Regression test for permission-blinded relation lookups"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/resolve-import-relations.util.ts" \
  "core-modules/export-job" \
  "normalizeUsState comes from twenty-shared/utils; the export-job tree is deleted"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.module.ts" \
  "Import job API module, registered only through OmniaModulesModule"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job-processor.module.ts" \
  "Import job worker module, registered only through OmniaModulesModule"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/enums/import-job-status.enum.ts" \
  "Import job status enum (uploading, pending, processing, completed, failed, cancelled)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/constants/import-job-processor-name.constant.ts" \
  "Queue job name the import service enqueues and the processor handles"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/constants/import-job-summary-select.constant.ts" \
  "Columns the import job API returns (never validatedRows)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/types/import-job-data.type.ts" \
  "Import job queue payload { importJobId, workspaceId }"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/types/import-job-requester.type.ts" \
  "Requester scope { workspaceId, userWorkspaceId } of every import job read and write"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/from-import-job-entity-to-dto.util.ts" \
  "Maps an import job row to its GraphQL DTO (no staged rows)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/relation-resolution.types.ts" \
  "Relation behaviours and resolution plan types of the import job"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/score-record-match.util.ts" \
  "Person match scoring used by SMART_UPDATE relation resolution"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/score-record-match.util.spec.ts" \
  "Spec for the import person match scoring"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.service.ts" \
  "select: IMPORT_JOB_SUMMARY_SELECT" \
  "HIPAA: the 3-second importJob poll must read summary columns only, never the staged PHI rows"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/constants/import-job-summary-select.constant.ts" \
  "validatedRows: true" \
  "HIPAA: the import job API select must never include the staged PHI rows"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/resolve-import-relations.util.ts" \
  "joinColumnsByRelation" \
  "Import rows must not copy existing foreign keys into updates: v2.58 checks edit permission on every column sent"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/resolve-import-relations.util.ts" \
  "delete parsed.directFields[joinColumnName];" \
  "An import must not send a resolved foreign key that equals the current one (locked relations such as policy.agent)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/resolve-import-relations.util.spec.ts" \
  "keeps the foreign keys the CSV does not change out of an existing record row" \
  "Regression test: import updates carry only the foreign keys the CSV changes"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.service.ts" \
  "{ id: importJobId, status: ImportJobStatus.PENDING }," \
  "The worker must claim an import with a conditional pending-to-processing update, so a cancel that lands first wins"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "claimPendingImportJob" \
  "The import worker must start a job only through the atomic claim"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "const batchAuthContext = await this.resolveRequesterOrThrow(importJob);" \
  "Each import batch must re-check the requester and run in a fresh context (removed member, new role, revoked IMPORT_CSV)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "cancelled during relation resolution" \
  "A cancel during relation resolution must stop the import before the relation plan writes anything"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/__tests__/import-job.processor.spec.ts" \
  "checks the requester again before every batch and stops once IMPORT_CSV is revoked" \
  "Regression test: a revoked importer stops the next batch"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/__tests__/import-job.processor.spec.ts" \
  "starts nothing when a cancel lands before the worker claims the job" \
  "Regression test: the atomic claim loses to an earlier cancel"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/__tests__/import-job.processor.spec.ts" \
  "writes nothing when the import is cancelled while its relations are resolved" \
  "Regression test: no relation plan write after a cancel during resolution"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/import-job.service.ts" \
  "SubscriptionChannel" \
  "Import progress is polled; the service must not publish it on a workspace-wide subscription channel (C14)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/score-record-match.util.spec.ts" \
  "Synthetic lead data only" \
  "HIPAA: import match fixtures hold synthetic data only"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/score-record-match.util.spec.ts" \
  "real data from the policies.csv" \
  "HIPAA: real export data must not come back into the import match fixtures"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/score-record-match.util.spec.ts" \
  "@gmail.com" \
  "HIPAA: import fixtures use example.com addresses"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/resolve-import-relations.util.spec.ts" \
  "@gmail.com" \
  "HIPAA: import fixtures use example.com addresses"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/resolve-import-relations.util.ts" \
  "Assigning a missing relation should still enrich the matched record" \
  "Import relation resolution must enrich matched leads when assigning a missing parent relation"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/resolve-import-relations.util.ts" \
  "getExplicitRelationId" \
  "Import relation resolution must turn relation UUID values into FK assignments"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/resolve-import-relations.util.spec.ts" \
  "Regression test for import relation enrichment on missing parent relation"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/utils/__tests__/resolve-import-relations.util.spec.ts" \
  "assigns lookup and smart-update relations by id sub-field" \
  "Regression test must cover relation ID assignment for imported rows"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "repository.updateMany" \
  "Bulk import updates must use updateMany() (batched UPDATED event with diff) so existing records get timeline activities"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "rowsToUpdate" \
  "Bulk import must split inserts vs updates instead of a blind upsert"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/import-job.processor.ts" \
  "repository.upsert(batchRows" \
  "Bulk import must NOT revert to a blind upsert (it emits no UPDATED events, so import-driven updates leave no timeline history)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/__tests__/import-job.processor.spec.ts" \
  "Regression test for import insert/updateMany split (timeline activities on update)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/jobs/__tests__/import-job.processor.spec.ts" \
  "never a blind upsert" \
  "Regression test must assert import updates use updateMany and never upsert"

echo ""
echo "--- Omnia I2: importJob.userWorkspaceId (C14) ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/entities/import-job.entity.ts" \
  "userWorkspaceId: string | null;" \
  "The import job row must record the requesting userWorkspace (column added by I2)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/entities/import-job.entity.ts" \
  "workspace-related-entity.type" \
  "Import job entity must use the v2.58 WorkspaceRelatedEntity path (the old path breaks every core-entity spec)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-instance-command-fast-1794500000000-omnia-add-user-workspace-id-to-import-job.ts" \
  "I2: adds core.importJob.userWorkspaceId, which scopes every import job query to its requester (C14)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-instance-command-fast-1794500000000-omnia-add-user-workspace-id-to-import-job.ts" \
  'ADD COLUMN IF NOT EXISTS "userWorkspaceId"' \
  "I2 must add the requester column idempotently"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-instance-command-fast-1794500000000-omnia-add-user-workspace-id-to-import-job.ts" \
  "@RegisteredInstanceCommand('2.58.0', 1794500000000)" \
  "I2 must keep 2.58.0/1794500000000 so it sorts after every upstream 2.58 fast instance command (max 1794337540366)"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-instance-command-fast-1794500000000-omnia-add-user-workspace-id-to-import-job.spec.ts" \
  "I2 spec: registration metadata, idempotent up and down"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-add-user-workspace-id-to-import-job-upgrade-command-name.constant.ts" \
  "I2 step name, which the upgrade-aware ImportJobEntity.userWorkspaceId column points at"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/omnia-add-user-workspace-id-to-import-job-upgrade-command-name.constant.ts" \
  "'2.58.0_OmniaAddUserWorkspaceIdToImportJobFastInstanceCommand_1794500000000'" \
  "I2 step name must match <version>_<class>_<timestamp> of the registered command, or boot fails with unknown-step-name"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/entities/import-job.entity.ts" \
  "OMNIA_ADD_USER_WORKSPACE_ID_TO_IMPORT_JOB_UPGRADE_COMMAND_NAME" \
  "userWorkspaceId must be @WasIntroducedInUpgrade(I2), so TypeORM hides it until I2 has added the column"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/entities/__tests__/import-job-upgrade-shape.spec.ts" \
  "Shape spec: userWorkspaceId is hidden until I2 has run"

echo ""
echo "--- Import job validatedRows retention cron (Q22, HIPAA minimum necessary) ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job.ts" \
  'SET "validatedRows" = NULL, "result" = NULL' \
  "HIPAA: finished imports lose the result errors that quote their rows together with the staged rows"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job.ts" \
  '"result" = NULL, "updatedAt" = now()' \
  "HIPAA: abandoned imports lose their result errors together with their staged rows"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job.ts" \
  "Daily cron that clears staged import rows (PHI) 30 days after an import ends or stalls"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job.ts" \
  'SET "validatedRows" = NULL' \
  "Retention cron must clear the staged PHI rows of finished imports"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job.ts" \
  "VALIDATED_ROWS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000" \
  "Q22 default: staged import rows are kept 30 days"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/jobs/import-job-validated-rows-retention.cron.job.ts" \
  "satisfies Record<ImportJobStatus, boolean>" \
  "Every import job status must be classified finished/unfinished, so a new status cannot keep its staged rows forever"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/commands/import-job-validated-rows-retention.cron.command.ts" \
  "cron:import-job:validated-rows-retention registers the retention cron"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/constants/import-job-validated-rows-retention-cron-pattern.constant.ts" \
  "Daily schedule of the import retention cron"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/import-job-validated-rows-retention.module.ts" \
  "Provides the retention cron job and exports its registration command"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/import-job/crons/jobs/__tests__/import-job-validated-rows-retention.cron.job.spec.ts" \
  "Retention cron spec: both predicates, the 30-day threshold and the batching"

echo ""
echo "--- Omnia W8: legacy export CSV PHI purge ---"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.ts" \
  "checkFileExists" \
  "W8 must HEAD each legacy export object before deleting it"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.ts" \
  "return 'missing';" \
  "W8 must keep the row of an object storage cannot find (a wrong storage config reports every object missing)"
check_file_not_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.ts" \
  "alreadyMissing" \
  "W8 must never drop a row whose object was not found: it would orphan the PHI CSV"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.spec.ts" \
  "keeps every row whose storage object is not found and warns" \
  "Regression test: a misconfigured storage driver deletes no W8 row"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.ts" \
  "W8: deletes the PHI CSVs and core.file rows the removed Omnia export job left under export/exports/"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.ts" \
  "'export/exports/%'" \
  "W8 must match only the legacy export folder (FileFolder.Export is gone, so the prefix is literal)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.ts" \
  "@RegisteredWorkspaceCommand('2.58.0', 1794500007000)" \
  "W8 must keep 2.58.0/1794500007000: after W1-W7, before W9 (1794500009000)"
check_file_contains \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.ts" \
  'WHERE "workspaceId" = $1' \
  "W8 must scope every core.file read and delete to the workspace being upgraded"
check_file_exists \
  "packages/twenty-server/src/database/commands/upgrade-version-command/omnia/__tests__/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command.spec.ts" \
  "W8 spec: dry run, storage-before-row order, other folders untouched, missing object, failed delete keeps the row, paging"

echo ""
echo "--- Record export: Omnia relation sub-field layer (C6) ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/build-relation-sub-field-export-context.util.ts" \
  '!isObjectReadable(targetObject.id, metadata)' \
  "A sub-field of an object the requester cannot read must fail the export up front with the Forbidden error"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/__tests__/build-relation-sub-field-export-context.util.spec.ts" \
  "rejects a sub-field when the requester cannot read %s" \
  "Regression test: unreadable related, nested and one-to-many objects are refused up front"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/dtos/record-export-relation-sub-field.input.ts" \
  "RecordExportRelationSubFieldInput { fieldMetadataId, subFieldName } (contract C6)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/dtos/create-record-export.input.ts" \
  "relationSubFields" \
  "CreateRecordExportInput must accept relationSubFields (contract C6; codegen and the export command depend on it)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/dtos/create-record-export.input.ts" \
  "@ArrayMaxSize(200)" \
  "relationSubFields must stay bounded"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/types/record-export-parameters.type.ts" \
  "relationSubFields?:" \
  "RecordExportParameters must carry relationSubFields into the queued export, which rebuilds its context from it"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/types/record-export-query-context.type.ts" \
  "relationSubFieldExportPlan?:" \
  "The export query context must carry the relation sub-field plan to readPage"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/types/record-export-relation-sub-field-plan.type.ts" \
  "Plan of the synthetic relation sub-field cells"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/services/record-export-query.service.ts" \
  "buildRelationSubFieldExportContext" \
  "buildContext must lay the Omnia relation sub-field columns over upstream's"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/services/record-export-query.service.ts" \
  "flattenRelationSubFieldExportValues" \
  "readPage must fill the relation sub-field cells of each page"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/services/record-export-query.service.ts" \
  "isSystemAuthContext(authContext)" \
  "The layer must skip the system-context admin workspace data export, which must stay lossless"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/services/record-export-query.service.ts" \
  "'objectMetadataId' | 'fieldMetadataIds' | 'relationSubFields'" \
  "buildContext must accept relationSubFields"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/build-relation-sub-field-export-context.util.ts" \
  "Relation sub-field groups (<Rel> / Id, <Rel> / <Label>, <Rel> / <Sub>), to-one label columns and the Q11 composite subset"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/build-relation-sub-field-export-context.util.ts" \
  "Skipping ONE_TO_MANY back-reference" \
  "Export must skip ONE_TO_MANY back-references to the exported object (2026-08-22 worker OOM)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/build-relation-sub-field-export-context.util.ts" \
  "{ kind: 'joinColumn', key: idKey, joinColumnName }" \
  "OMN-465: each relation group's id must come from the root join column so re-import reconnects by id"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/build-relation-sub-field-export-context.util.ts" \
  "ADDRESS_SUB_FIELDS_LEFT_OUT" \
  "Q11: exports keep the narrow composite set (primary email, primary phone, address without country/lat/lng)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/build-relation-sub-field-export-context.util.ts" \
  "unreadableFieldMetadataIds" \
  "Requested sub-fields must honour field permissions (the query runner cannot see one-to-many sub-fields)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/__tests__/build-relation-sub-field-export-context.util.spec.ts" \
  "Spec for the relation sub-field export layer"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/__tests__/build-relation-sub-field-export-context.util.spec.ts" \
  "always includes the related record id" \
  "Regression test guarding relation id columns in export (OMN-465)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/flatten-relation-sub-field-export-values.util.ts" \
  "Fills the relation sub-field cells of each export page"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/flatten-relation-sub-field-export-values.util.ts" \
  "normalizeUsState" \
  "Export must normalize address states to 2-letter codes (unit 9)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/flatten-relation-sub-field-export-values.util.ts" \
  "COUNT(*)" \
  "The +N more total of a capped one-to-many list comes from a grouped count"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/flatten-relation-sub-field-export-values.util.ts" \
  "workspaceOrmManager.getRepository(" \
  "The +N more count must run through the permission-checked repository"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/flatten-relation-sub-field-export-values.util.ts" \
  "getRepositoryWithoutPermissionChecks" \
  "The +N more count must never bypass RLS (G9)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/__tests__/flatten-relation-sub-field-export-values.util.spec.ts" \
  "Spec for the relation sub-field cell flattening"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/format-one-to-many-export-list.util.ts" \
  "One-to-many list format: Name • Type • MM/DD/YY items, +N more"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/format-one-to-many-export-list.util.ts" \
  '+${hiddenCount} more' \
  "One-to-many export lists must say how many children were left out"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/__tests__/format-one-to-many-export-list.util.spec.ts" \
  "Spec for the one-to-many export list format"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/utils/get-record-export-label.util.ts" \
  "Related record label for export (FULL_NAME as First Last)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/record-export/services/__tests__/record-export-query.service.spec.ts" \
  "Spec for the two record-export-query.service.ts seams"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/jobs/generate-record-export.job.ts" \
  "OMNIA" \
  "The upstream export job stays untouched so upstream security fixes merge cleanly"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/record-export/services/record-export.workspace-service.ts" \
  "OMNIA" \
  "The upstream export workspace service (permissions hash, lease, download token) stays untouched"
check_file_not_contains \
  "packages/twenty-server/package.json" \
  '"json-2-csv"' \
  "json-2-csv left with the Omnia export-job engine (R-JSON2CSV)"
check_file_not_exists \
  "packages/twenty-server/src/engine/core-modules/export-job" \
  "The Omnia export-job engine is replaced by upstream record-export (it read with permission checks bypassed)"

echo ""
echo "--- Record export (front): always the server job, relation sub-field columns ---"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/engine-command/record/components/ExportRecordsCommand.tsx" \
  "execute={downloadAsync}" \
  "Index exports must always run as the server job, which re-checks the requester's permissions on PHI"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/engine-command/record/components/ExportRecordsCommand.tsx" \
  "cancel={cancelAsync}" \
  "Closing the tab or unmounting the command must cancel the server export"
check_file_not_contains \
  "packages/twenty-front/src/modules/command-menu-item/engine-command/record/components/ExportRecordsCommand.tsx" \
  "useRecordIndexExportRecords" \
  "Index exports must not build the first page in the browser (CSV shape would depend on row count, no sub-field columns)"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/engine-command/record/components/__tests__/ExportRecordsCommand.test.tsx" \
  "exports through the server job whatever the row count" \
  "Regression test: index exports always use the server job"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/export/hooks/useRecordIndexExportParameters.ts" \
  "relationSubFields" \
  "Export parameters must send the view's relation sub-field columns (contract C6)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/export/hooks/useRecordIndexExportParameters.ts" \
  "subFieldName" \
  "Export parameters must split sub-field columns from direct columns, sending each relation id once (fieldMetadataIds is @ArrayUnique)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/export/hooks/useRecordIndexExportParameters.ts" \
  "isOneToManyBackReferenceSubField" \
  "Export parameters must not send ONE_TO_MANY back-reference sub-fields (2026-08-22 worker OOM)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/export/hooks/useRecordIndexExportParameters.ts" \
  "RelationType.MANY_TO_ONE" \
  "Export parameters must send sub-fields of to-one relations only (the server refuses others)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/export/hooks/__tests__/useRecordIndexExportParameters.test.ts" \
  "never sends a one-to-many back-reference to the exported object" \
  "Regression test: back-reference sub-fields are never exported"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/export/hooks/__tests__/useRecordIndexExportParameters.test.ts" \
  "sends a relation id once, at its first column" \
  "Regression test: two sub-field columns of one relation send its id once"

echo ""
echo "--- Spreadsheet import: submit to the server import job ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "START_IMPORT_JOB" \
  "Import dialog must send an import of up to one chunk to the server import job in one call (startImportJob)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "CREATE_IMPORT_JOB" \
  "Import dialog must upload larger imports in chunks (createImportJob)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "APPEND_IMPORT_JOB_ROWS" \
  "Import dialog must upload larger imports in chunks (appendImportJobRows)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "FINALIZE_IMPORT_JOB" \
  "Import dialog must queue a chunked import with finalizeImportJob"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "startTracking({" \
  "Import dialog must hand the accepted job to the import progress poller"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "transformRowsForServerImport" \
  "Import dialog must send relation columns as the dot-notation keys the import job resolves"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "enqueueToast(getToastOptionsFromError({ error }));" \
  "Import dialog must show a toast when the import cannot be submitted"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "throw error;" \
  "Import dialog must re-throw a failed submit so the dialog keeps its rows (upstream #28709)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "spreadsheetImportFilterImportableFieldMetadataItems" \
  "Import dialog must keep upstream's importable-field filter"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "useBatchCreateManyRecords" \
  "Import dialog must not create records in the browser; the server import job writes them as the requester"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "useApolloCoreClient" \
  "The import job is a metadata resolver; the dialog must use the default (metadata) Apollo client"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/__tests__/useOpenObjectRecordsSpreadsheetImportDialog.test.ts" \
  "should upload a large import in chunks, then finalize it" \
  "Regression test: imports over one chunk go create -> append -> finalize"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/__tests__/useOpenObjectRecordsSpreadsheetImportDialog.test.ts" \
  "should show a toast and re-throw when the import job cannot be started" \
  "Regression test: a failed submit shows a toast and keeps the dialog state"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "inFlightSubmitAbortController?.abort();" \
  "Cancel on the importing step must abort the submit in flight (onAbortSubmit)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  'chunkIndex < chunks.length && !abortSignal.aborted;' \
  "A cancelled chunked upload must stop between rounds and never be finalized"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "const isCancelled = await cancelImportJob(importJob.id);" \
  "A cancelled submit must cancel its server import job"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "finalize().catch(() => finalize())" \
  "A lost finalize response must be retried on the same job id; a new job would import the rows twice"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts" \
  "type SubmittedImportJob = Pick<ImportJobSummary, 'id' | 'totalRecords'>;" \
  "The dialog reuses the shared ImportJobSummary type instead of declaring its own"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/__tests__/useOpenObjectRecordsSpreadsheetImportDialog.test.ts" \
  "should cancel the import job and never finalize it when the dialog is cancelled during the upload" \
  "Regression test: Cancel during the upload cancels the job and never finalizes it"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/__tests__/useOpenObjectRecordsSpreadsheetImportDialog.test.ts" \
  "should retry finalize on the same job when its first response is lost" \
  "Regression test: a lost finalize response is retried on the same job, not a new one"

echo ""
echo "--- Spreadsheet import: relation import fields ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields.ts" \
  "__relationLabel:" \
  "Relation label field must match the export's <Relation> column (LOOKUP_ASSIGN by name)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields.ts" \
  "isRelationUpdateField: true" \
  "Relation update fields let a re-import update the related record"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields.ts" \
  "isReadOnly: true" \
  "Read-only fields let export-only columns match without warnings"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields.ts" \
  "doNotTranslate('Id')" \
  "Each relation's id connect field must match upstream's <Relation> Id export header, so re-imports reconnect by id (OMN-465)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/hooks/__tests__/useBuildSpreadSheetImportFields.test.tsx" \
  "export header to the id connect field" \
  "Regression test: the <Relation> Id export header maps to the id connect field (OMN-465)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow.ts" \
  "field.isRelationConnectField === true &&" \
  "Only connect fields may build relation connect objects (label, update and read-only fields share the relation id)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow.ts" \
  "addressState: normalizeUsState," \
  "Imported US state names must be normalized to 2-letter codes (twenty-shared normalizeUsState)"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow.ts" \
  "createData" \
  "The upsert connect auto-create payload was dropped with the connect tolerance (R-CONNECT)"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldLabel.ts" \
  "CompositeFieldSubFieldLabel" \
  "Relation update labels take the translated sub-field label; the deleted CompositeFieldSubFieldLabel constant must not return"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/transformRowsForServerImport.ts" \
  "READ_ONLY_KEY_PREFIX = '__readOnly:'" \
  "Read-only export columns must be dropped before rows reach the import job"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/transformRowsForServerImport.ts" \
  "Dialog keys to the import job's dot-notation relation keys"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/__tests__/transformRowsForServerImport.test.ts" \
  "Regression test for relation key transformation and behavior detection"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/relationImportTypes.ts" \
  "RelationBehavior type, mirrors the server's relation-resolution.types.ts"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldKey.ts" \
  "Key format for relation update fields"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldLabel.ts" \
  "Label format for relation update fields"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportField.ts" \
  "isReadOnly?: boolean;" \
  "Read-only import columns match exported headers and are dropped before import"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldLabel.ts" \
  "getRelationConnectSubFieldLabel(" \
  "Relation update labels reuse upstream's connect label format (same export headers)"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportField.ts" \
  "isRelationUpdateField" \
  "Relation update field support for CSV import"

echo ""
echo "--- Spreadsheet import: reconciliation dialog options ---"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportDialogOptions.ts" \
  "allowDuplicateFieldMatching?: boolean;" \
  "Reconciliation must be able to map one field to several sheet columns"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportDialogOptions.ts" \
  "onSheetSelected?: (sheetName: string) => void;" \
  "Reconciliation must learn which sheet the run read"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportDialogOptions.ts" \
  "precomputedMatches?: Record<string, string>;" \
  "Reconciliation must pass the carrier's saved column map into the dialog"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/steps/components/MatchColumnsStep/MatchColumnsStep.tsx" \
  "const existingFieldIndex = allowDuplicateFieldMatching" \
  "Choosing a field must not unmatch its other column when duplicate matching is allowed"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/steps/components/UploadStep/UploadStep.tsx" \
  "onSheetSelected?.(workbook.SheetNames[0]);" \
  "Single-sheet uploads must report the sheet name to reconciliation"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/steps/components/SelectSheetStep/SelectSheetStep.tsx" \
  "onSheetSelected?.(sheetName);" \
  "Multi-sheet uploads must report the chosen sheet to reconciliation"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useComputeColumnSuggestionsAndAutoMatch.ts" \
  "precomputedMatches," \
  "Auto-match must pass the saved column map to getMatchedColumnsWithFuse"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/getMatchedColumnsWithFuse.ts" \
  "const precomputedFieldKey = precomputedMatches?.[column.header];" \
  "A saved column match must win over Fuse matching"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/getMatchedColumnsWithFuse.ts" \
  "threshold: 0.2," \
  "Fuse threshold stays stricter than upstream's 0.3 for carrier headers"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/getMatchedColumnsWithFuse.ts" \
  "secondMatch.score > firstMatch.score + 0.05" \
  "Auto-match accepts a near-exact match or a clearly best one (long relation labels tie)"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/getMatchedColumnsWithFuse.ts" \
  "field.alternateMatches" \
  "Keep upstream's alternateMatches search key next to the Omnia matching rules"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/__tests__/getMatchedColumnsWithFusePrecomputedMatches.test.ts" \
  "Regression test: saved column matches win over Fuse and fall back when the field is gone"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/getMatchedColumnsWithFuse.ts" \
  "precomputedMatches" \
  "getMatchedColumnsWithFuse must accept precomputedMatches param"

echo ""
echo "--- Spreadsheet import: whitespace trim and unlimited rows ---"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/normalizeTableData.ts" \
  "typeof curr === 'string' ? curr.trim() : curr" \
  "Matched column values must be trimmed before import"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/constants/SpreadsheetMaxRecordImportCapacity.ts" \
  "SPREADSHEET_MAX_RECORD_IMPORT_CAPACITY = 0;" \
  "No front row cap: the server import job handles large files (0 = no limit)"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/steps/components/UploadStep/UploadStep.tsx" \
  "maxRecords > 0 &&" \
  "Upload step must treat a capacity of 0 as no limit"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/steps/components/SelectSheetStep/SelectSheetStep.tsx" \
  "maxRecords > 0 &&" \
  "Sheet step must treat a capacity of 0 as no limit"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/steps/components/UploadStep/components/DropZone.tsx" \
  "hasMaxRecordImportCapacity" \
  "Drop zone must not claim a 0-record import capacity"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/dataMutations.ts" \
  "trim()" \
  "Validation should trim whitespace"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/setColumn.ts" \
  "ReadonlyDeep<SpreadsheetImportField>" \
  "setColumn must accept ReadonlyDeep<SpreadsheetImportField> for carrier-config pre-fill"

echo ""
echo "--- Spreadsheet import: progress poller fallback (R-IMPORT-UI, C14) ---"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/constants/ActiveImportJobStorageKey.ts" \
  "'activeImportJobId'" \
  "The tracked import is stored under activeImportJobId (cleared on sign-out)"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/constants/ImportJobPollIntervalMs.ts" \
  "IMPORT_JOB_POLL_INTERVAL_MS = 3000;" \
  "Import progress is polled every 3 s (no subscription, C14)"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobPoller.ts" \
  "query: GET_IMPORT_JOB," \
  "The poller reads the requester-scoped importJob query"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobPoller.ts" \
  'if (!isDefined(data.importJob)) {' \
  "A null importJob (unknown, foreign or pre-upgrade id) must end tracking, not poll forever"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobPoller.ts" \
  "isGraphqlErrorOfType(error, 'NOT_FOUND')" \
  "A not-found error must end tracking, not poll forever"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobPoller.ts" \
  "cache.evict({ fieldName: namePlural });" \
  "A finished import must evict the object's list cache so imported records show"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useCancelImportJob.ts" \
  "mutation: CANCEL_IMPORT_JOB," \
  "Cancel on the import card must go through cancelImportJob"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/components/ImportJobRecoveryEffect.tsx" \
  "readStoredActiveImportJob()" \
  "The import tracked before a reload must be picked up again"
check_file_not_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/graphql/queries/importJob.ts" \
  "validatedRows" \
  "The progress query must never select the staged rows (PHI)"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobProgress.ts" \
  "startTracking for a server import job (used by the import dialog)"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobPoller.ts" \
  "3-second import progress poller"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useCancelImportJob.ts" \
  "Cancel action for the import progress card"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/components/ImportJobRecoveryEffect.tsx" \
  "Recovers and polls the tracked import; mounted in WorkspaceAppProviders"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/states/activeImportJobState.ts" \
  "Tracked import job atom"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/types/ImportJobSummary.ts" \
  "Shape of the importJob query result"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/readStoredActiveImportJob.ts" \
  "Reads and validates the stored import job"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/writeStoredActiveImportJob.ts" \
  "Stores or clears the tracked import job"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/getImportJobLabel.ts" \
  "Translated label for the import progress card"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/getImportJobErrorMessages.ts" \
  "Error messages shown on a finished import card"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/toBackgroundJobStatus.ts" \
  "Maps server import statuses to the card status"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/createImportJob.ts" \
  "createImportJob mutation (chunked upload)"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/appendImportJobRows.ts" \
  "appendImportJobRows mutation (chunked upload)"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/finalizeImportJob.ts" \
  "finalizeImportJob mutation (chunked upload)"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/startImportJob.ts" \
  "startImportJob mutation (single request)"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/graphql/mutations/cancelImportJob.ts" \
  "cancelImportJob mutation"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/graphql/queries/importJob.ts" \
  "importJob progress query"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/components/__tests__/ImportJobRecoveryEffect.test.tsx" \
  "Regression test: null or not-found import ends tracking; completion, phase and cancel"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/__tests__/readStoredActiveImportJob.test.ts" \
  "Stored import job round trip and validation"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/__tests__/getImportJobErrorMessages.test.ts" \
  "Import card error message fallbacks"
check_file_contains \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/components/BackgroundJobIndicator.tsx" \
  "AUTO_DISMISS_MS" \
  "BackgroundJobIndicator must auto-dismiss completed jobs"
check_file_contains \
  "packages/twenty-front/src/modules/auth/utils/clearSessionLocalStorageKeys.ts" \
  "'activeImportJobId'" \
  "Sign-out must clear import job tracking so the next user on a shared machine never sees it"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useImportJobPoller.ts" \
  'if (!isDefined(activeImportJob) || !isLogged) {' \
  "The import poller must not poll while signed out (an expired session keeps the page; every poll would be refused)"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/components/ImportJobRecoveryEffect.tsx" \
  "setBackgroundJobs([]);" \
  "A session that ends without a reload must clear the import cards (row errors can quote CSV values; shared machines)"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/components/__tests__/ImportJobRecoveryEffect.test.tsx" \
  "should stop polling and clear the import cards when the session ends" \
  "Regression test: session end stops the import poller and clears its cards"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/components/__tests__/ImportJobRecoveryEffect.test.tsx" \
  "should wait for sign-in before picking up the stored import" \
  "Regression test: the stored import is only recovered once signed in"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/hooks/useCancelImportJob.ts" \
  "async (importJobId: string): Promise<boolean> =>" \
  "Cancel reports success, so a queued job whose cancel failed stays tracked"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/components/ImportJobRecoveryEffect.tsx" \
  "setActiveImportJob(storedActiveImportJob);" \
  "Recovery must wait for the requester-scoped importJob query before a card shows (shared machines)"
check_file_not_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/components/ImportJobRecoveryEffect.tsx" \
  "startTracking(" \
  "Recovery must not post a card from the stored job before the server confirms it belongs to the user"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/components/__tests__/ImportJobRecoveryEffect.test.tsx" \
  "should stop tracking without ever showing a card when the import is not found" \
  "Regression test: a stored job the server does not return never shows a card"

# ======================================================================
# Front: roles and permissions settings
# ======================================================================
echo ""
echo "=== Front: roles and permissions settings ==="

echo ""
echo "--- Create-time RLS prefill and select-option filtering (hop-aware) ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts" \
  "findSingleCreateRowLevelPermissionRule" \
  "Create-time RLS prefill must read only the single create rule, so read-only rules never prefill"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts" \
  "relationFieldMetadataId" \
  "Create-time RLS prefill must resolve the Agent is Me hop (contract C2) through relationFieldMetadataId"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts" \
  "hopTargetRecordId" \
  "Create-time RLS prefill must fill the hop relation with the member's own AgentProfile id, never the raw workspace member id"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts" \
  "RowLevelPermissionPredicateScope" \
  "Create-time RLS prefill must not reintroduce predicate scopes (rules carry the grants, plan G8)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/hooks/__tests__/useBuildRecordInputFromRLSPredicates.test.tsx" \
  "Hop prefill tests must exist (AgentProfile id, unresolved omitted, read-only rule, call-time object)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/hooks/useFilteredSelectOptionsFromRLSPredicates.ts" \
  "findSingleCreateRowLevelPermissionRule" \
  "Editable select option filtering must use only the single create rule, so read-only rules never narrow editable selects"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/hooks/useFilteredSelectOptionsFromRLSPredicates.ts" \
  "RowLevelPermissionPredicateScope" \
  "Select option filtering must not reintroduce predicate scopes (plan G8)"

echo ""
echo "--- Object-level form: sidebar visibility and edit window rows ---"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelShowInSidebarRow.tsx" \
  "Per-object Show in Sidebar row (writes only showInSidebar, contract C4)"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/objects-permissions/constants/SettingsRoleObjectPermissionIconConfig.ts" \
  "showInSidebar" \
  "Sidebar flag stays out of the record-permission key union, or toggling Show in Sidebar grants read"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelObjectFormObjectLevel.tsx" \
  "SettingsRolePermissionsObjectLevelShowInSidebarRow" \
  "Object-level form must render the Show in Sidebar row"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelShowInSidebarRow.tsx" \
  "applyObjectPermissionChange" \
  "Show in Sidebar must not go through applyObjectPermissionChange, which grants read for any non-read key"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelObjectFormObjectLevel.tsx" \
  "SettingsRolePermissionsObjectLevelEditWindowRow" \
  "Object-level form must render the Edit window row"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/objects-permissions/types/SettingsRolePermissionsObjectPermission.ts" \
  "showInSidebar" \
  "Object-level permission config keys stay record permissions only (the sidebar has its own row)"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/objects-permissions/constants/SettingsRoleObjectLevelPermissionToRoleObjectPermissionMapping.ts" \
  "showInSidebar" \
  "Record-permission to role-flag mapping stays upstream (no sidebar key)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelEditWindowRow.tsx" \
  "from 'twenty-ui/theme'" \
  "Edit window row uses the v2.58 theme entry point (twenty-ui/theme-constants no longer exists)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/__tests__/SettingsRolePermissionsObjectLevelShowInSidebarRow.test.tsx" \
  "Show in Sidebar row tests: toggling never changes any can*ObjectRecords"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/__tests__/SettingsRolePermissionsObjectLevelObjectFormObjectLevel.test.tsx" \
  "Object-level form test: an object with read refused stays refused while Show in Sidebar changes"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/__tests__/SettingsRolePermissionsObjectLevelEditWindowRow.test.tsx" \
  "Edit window row tests: writes only editWindowMinutes"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/field-permissions/utils/__tests__/getRoleWithRemovedFieldPermission.test.ts" \
  "showAllObjectsInSidebar" \
  "Role fixture must set the non-null showAllObjectsInSidebar"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/field-permissions/utils/__tests__/getRoleWithUpsertedFieldPermission.test.ts" \
  "showAllObjectsInSidebar" \
  "Role fixture must set the non-null showAllObjectsInSidebar"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelEditWindowRow.tsx" \
  "Edit window duration selector row"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/graphql/fragments/roleFragment.ts" \
  "editWindowMinutes" \
  "Role fragment must query editWindowMinutes"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/graphql/fragments/objectPermissionFragment.ts" \
  "editWindowMinutes" \
  "ObjectPermission fragment must query editWindowMinutes"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/graphql/fragments/objectPermissionFragment.ts" \
  "showInSidebar" \
  "ObjectPermission fragment must query showInSidebar for per-role sidebar filtering"

echo ""
echo "--- RLS UI: Agent is Me hop authoring (contract C2) ---"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect.tsx" \
  "Per-operation All records / Matching records select for filtered objects (contract C1)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelSection.tsx" \
  "SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect" \
  "Record-level section must render the per-operation select under the upstream filter builder"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/__tests__/SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect.test.tsx" \
  "Per-operation select behaviour test"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelSection.tsx" \
  "Read + write" \
  "Record-level section stays upstream plus one line; the Read + write / Read only / Write only sections are gone"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelSection.tsx" \
  "RowLevelPermissionPredicateScope" \
  "Record-level section must not use the deleted scope enum (G8)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/hasRelationToWorkspaceMember.ts" \
  "Record-level builder must keep the hop target finder (policy.agent ▸ agentProfile.workspaceMember)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/hasRelationToWorkspaceMember.ts" \
  "name === 'workspaceMember'" \
  "Hop target must prefer agentProfile.workspaceMember over agentProfile.manager, as W1 and the verify command do"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/hasRelationToWorkspaceMember.ts" \
  "StandardObjectNameSingular.WorkspaceMember" \
  "Hop target finder must use StandardObjectNameSingular (CoreObjectNameSingular was renamed upstream)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/findWorkspaceMemberHop.ts" \
  "Record-level builder must resolve 'Me' on a member-owned relation to the C2 hop"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/isWorkspaceMemberHopPredicate.ts" \
  "Record-level builder must recognise the C2 hops it owns"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useWorkspaceMemberHopMetadata.ts" \
  "Record-level initialization and draft sync must share one hop metadata source"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionFieldSelectFieldMenu.tsx" \
  "hasRelationToWorkspaceMember" \
  "Record-level field picker must offer relations to member-owned records (Policy ▸ Agent)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionMeValueSelect.tsx" \
  "hasRelationToWorkspaceMember" \
  "Record-level Me select must offer Me for relations to member-owned records (Policy ▸ Agent)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion.ts" \
  "relationFieldMetadataId: workspaceMemberHop.relationFieldMetadataId" \
  "Agent is Me must be saved as the C2 hop, never as policy.agent IS workspaceMember.id"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion.ts" \
  "predicate.relationFieldMetadataId ?? predicate.fieldMetadataId" \
  "A C2 hop row must load on its relation field"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionFilterInitialization.ts" \
  "isWorkspaceMemberHopPredicate" \
  "Record-level builder must show the C2 hop as an editable row (other hops stay hidden)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionSyncToDraftRole.ts" \
  "isWorkspaceMemberHopPredicate" \
  "Record-level draft sync must replace C2 hops with their rows (no duplicate, no stale copy)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionSyncToDraftRole.ts" \
  "findWorkspaceMemberHop" \
  "Record-level draft sync must save Agent is Me rows as the C2 hop"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/wrapUngroupedRecordFiltersInRootGroup.ts" \
  "Record-level builder must show predicates stored without a group (the C2 hop) as rows"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/wrapUngroupedRecordFiltersInRootGroup.ts" \
  "hasRootRecordFilterGroup" \
  "Ungrouped rows next to a root group are a second, OR'ed rule and must not be merged into it"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/unwrapUngroupedRecordFiltersFromRootGroup.ts" \
  "Record-level draft sync must store unchanged ungrouped rows back without a group"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/unwrapUngroupedRecordFiltersFromRootGroup.ts" \
  "holdsOnlyLoadedRecordFilters" \
  "A new row must store the group so every row is one rule (another application's ungrouped predicates form their own rule)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionFilterInitialization.ts" \
  "wrapUngroupedRecordFiltersInRootGroup" \
  "Record-level initialization must load ungrouped predicates under a root group, or Add filter saves a second, OR'ed rule"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionSyncToDraftRole.ts" \
  "unwrapUngroupedRecordFiltersFromRootGroup" \
  "Record-level draft sync must keep a rule stored without a group as stored when it is only opened"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilderContent.tsx" \
  "ungroupedRecordFiltersRootGroup," \
  "Record-level builder must pass initialization's ungrouped root group to the draft sync"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/__tests__/SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilder.test.tsx" \
  "adds a new row to the hop rule instead of a second rule" \
  "Regression test: an ungrouped C2 hop renders as a row and Add rule joins its rule"
check_file_contains \
  "packages/twenty-front/src/modules/users/hooks/__tests__/useLoadCurrentUser.test.tsx" \
  "stores the sidebar visibility of the current user (contract C4)" \
  "Regression test: loading the current user must fill objectShowInSidebarByObjectMetadataIdSelector"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/__tests__/useRecordLevelPermissionFilterInitialization.test.tsx" \
  "Omnia test from the v2.58 merge (G2): useRecordLevelPermissionFilterInitialization.test.tsx"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/__tests__/useRecordLevelPermissionSyncToDraftRole.test.tsx" \
  "Omnia test from the v2.58 merge (G2): useRecordLevelPermissionSyncToDraftRole.test.tsx"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/findWorkspaceMemberHop.test.ts" \
  "Omnia test from the v2.58 merge (G2): findWorkspaceMemberHop.test.ts"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/hasRelationToWorkspaceMember.test.ts" \
  "Omnia test from the v2.58 merge (G2): hasRelationToWorkspaceMember.test.ts"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/isWorkspaceMemberHopPredicate.test.ts" \
  "Omnia test from the v2.58 merge (G2): isWorkspaceMemberHopPredicate.test.ts"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/recordLevelPermissionPredicateConversion.test.ts" \
  "Omnia test from the v2.58 merge (G2): recordLevelPermissionPredicateConversion.test.ts"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/unwrapUngroupedRecordFiltersFromRootGroup.test.ts" \
  "Omnia test from the v2.58 merge (G2): unwrapUngroupedRecordFiltersFromRootGroup.test.ts"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/workspaceMemberHopTestMetadata.ts" \
  "Omnia test from the v2.58 merge (G2): workspaceMemberHopTestMetadata.ts"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/wrapUngroupedRecordFiltersInRootGroup.test.ts" \
  "Omnia test from the v2.58 merge (G2): wrapUngroupedRecordFiltersInRootGroup.test.ts"

echo ""
echo "--- Record-level rules: All records / Matching records per operation ---"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role/utils/resolveObjectRecordsAccessForFilteredObject.ts" \
  "Save-time resolver: a Matching operation is an explicit object-level false, rule grants are explicit"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role/utils/getRoleWithMatchingRecordsOperation.ts" \
  "Draft update behind the per-operation select (new rule starts on Matching records)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role/utils/getMatchingRecordsOperations.ts" \
  "Per-operation choice used by the role dirty check"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "resolveObjectRecordsAccessForFilteredObject" \
  "Role save must split filtered-object grants into object-level (All records) and rule (Matching records) grants"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "isDefined(dirtyFields.rowLevelPermissionRules)" \
  "Role save must re-sync grants when only the All records / Matching records choice changes"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "persistedRule?.canCreateRecords" \
  "Rule create grant must follow the update decision, not the previously saved rule"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "scope" \
  "Role save must not send RLS scope (G8)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "showAllObjectsInSidebar: settingsDraftRole.showAllObjectsInSidebar" \
  "Role create and update must send the role-wide sidebar default (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "editWindowMinutes: settingsDraftRole.editWindowMinutes" \
  "Role create and update must send the role-wide edit window (contract C3)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "showInSidebar: objectPermission?.showInSidebar" \
  "Filtered and unfiltered-again object rows must keep showInSidebar when re-sent (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "editWindowMinutes: objectPermission?.editWindowMinutes" \
  "Filtered and unfiltered-again object rows must keep editWindowMinutes when re-sent (contract C3)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/utils/withRowLevelPermissionRuleGrants.ts" \
  "OMNIA-CUSTOM" \
  "Rule fold must keep object-level All records grants visible (opening and saving Member keeps Policy read-all)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/utils/withRowLevelPermissionRuleGrants.ts" \
  "isGrantedByEveryRule" \
  "Rule fold must never widen access when several rules share one object"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/utils/getRoleDirtyFields.ts" \
  "getMatchingRecordsOperations" \
  "Role dirty check must compare the per-operation choice, not server-assigned rule ids"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role/utils/__tests__/resolveObjectRecordsAccessForFilteredObject.test.ts" \
  "Invariant test: a Matching operation is never null or true at object level"
check_file_exists \
  "packages/twenty-front/src/modules/settings/roles/role/utils/__tests__/withRowLevelPermissionRuleGrants.test.ts" \
  "Fold round-trip test for the Member -> Policy rule"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/__tests__/useSaveDraftRoleToDB.test.tsx" \
  "keeps Policy read-all and own-policy edits when the Member role is opened and saved" \
  "Regression test: saving the Member role must not remove Policy read for agents"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/utils/__tests__/getRoleDirtyFields.test.ts" \
  "treats a rule saved under a server id as clean" \
  "Regression test: a saved rule must not leave the role dirty"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "...rowLevelPermissionRuleGrant," \
  "Rule upsert must send the resolver's explicit grants: Matching operations only, create follows update (contract C1)"

echo ""
echo "--- Current-user sidebar visibility selectors (C4) ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useObjectPermissions.ts" \
  "objectPermissionsByObjectMetadataIdSelector" \
  "useObjectPermissions must read the memoized upstream selector (called 300+ times per table render)"
check_file_exists \
  "packages/twenty-front/src/modules/object-metadata/states/objectShowInSidebarByObjectMetadataIdSelector.ts" \
  "Current-user sidebar visibility selector must exist (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/states/objectShowInSidebarByObjectMetadataIdSelector.ts" \
  "objectSidebarVisibility" \
  "Sidebar visibility selector must read currentUserWorkspace.objectSidebarVisibility (contract C4)"
check_file_exists \
  "packages/twenty-front/src/modules/object-metadata/states/__tests__/objectShowInSidebarByObjectMetadataIdSelector.test.ts" \
  "Sidebar visibility selector tests must exist (not loaded, stale persisted state, entries)"
check_file_exists \
  "packages/twenty-front/src/modules/object-metadata/hooks/useIsObjectShownInSidebar.ts" \
  "useIsObjectShownInSidebar hook must exist (contract C4 names it; no production code consumes it yet)"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/hooks/useIsObjectShownInSidebar.ts" \
  "=== true" \
  "useIsObjectShownInSidebar must fail closed: a missing entry or an unloaded map hides the object (contract C4)"
check_file_exists \
  "packages/twenty-front/src/modules/object-metadata/hooks/__tests__/useIsObjectShownInSidebar.test.tsx" \
  "useIsObjectShownInSidebar tests must exist (fail-closed cases)"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-metadata/states/objectPermissionsByObjectMetadataIdSelector.ts" \
  "showInSidebar" \
  "Sidebar visibility must stay out of the object-permissions whitelist (contract C4)"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-metadata/utils/getObjectPermissionsForObject.ts" \
  "showInSidebar" \
  "getObjectPermissionsForObject must stay upstream; sidebar visibility comes from objectShowInSidebarByObjectMetadataIdSelector (contract C4)"

echo ""
echo "--- Role fragments, drafts and save path (no scope) ---"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/graphql/fragments/roleFragment.ts" \
  "showAllObjectsInSidebar" \
  "Role fragment must query showAllObjectsInSidebar (role-wide sidebar default, contract C4)"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/graphql/fragments/rowLevelPermissionPredicateFragment.ts" \
  "scope" \
  "RLS predicate fragment must not select scope: GetCurrentUser embeds it, so a stray scope breaks app boot"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/graphql/fragments/rowLevelPermissionPredicateGroupFragment.ts" \
  "scope" \
  "RLS predicate-group fragment must not select scope: GetCurrentUser embeds it, so a stray scope breaks app boot"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/graphql/hooks/useUpsertRowLevelPermissionPredicatesMutation.ts" \
  "scope" \
  "RLS upsert input type must not carry scope (rules hold the per-operation grants)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/constants/DefaultSettingsDraftRole.ts" \
  "showAllObjectsInSidebar: true" \
  "Draft role default must show every object in the sidebar (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/components/SettingsRoleCreateEffect.tsx" \
  "showAllObjectsInSidebar: true" \
  "Roles created in Settings must show every object in the sidebar (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/object-core/agents/utils/buildCoreAgentNewRole.ts" \
  "showAllObjectsInSidebar" \
  "Agent role literal must set the non-null showAllObjectsInSidebar (agent roles have no sidebar)"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/types/RoleWithPartialMembers.ts" \
  "OmniaRole" \
  "RoleWithPartialMembers must use the generated Role type (Omnia role wrapper types are deleted)"
check_file_not_exists \
  "packages/twenty-front/src/modules/settings/roles/types/OmniaRoleExtensions.ts" \
  "Omnia role type wrappers stay deleted; codegen emits the Omnia role fields"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/graphql/hooks/useUpsertRowLevelPermissionPredicatesMutation.ts" \
  "relationFieldMetadataId?: string | null" \
  "RLS upsert input type must declare relationFieldMetadataId, so the compiler checks the C2 hop field the role save sends"
check_file_contains \
  "packages/twenty-front/src/modules/settings/members/components/__tests__/MemberPermissionsTab.test.tsx" \
  "OMNIA-CUSTOM: generated Role.showAllObjectsInSidebar is non-null (contract" \
  "Omnia hunk (G2): generated Role.showAllObjectsInSidebar is non-null (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/components/__tests__/SettingsRole.test.tsx" \
  "OMNIA-CUSTOM: generated Role.showAllObjectsInSidebar is non-null (contract" \
  "Omnia hunk (G2): generated Role.showAllObjectsInSidebar is non-null (contract C4)"

# ======================================================================
# Front: record creation form and command menu
# ======================================================================
echo ""
echo "=== Front: record creation form and command menu ==="

echo ""
echo "--- Upstream behaviour Omnia relies on: command menu (front-command-menu-drafts) ---"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/display/components/PinnedCommandMenuItemButtons.tsx" \
  "EngineComponentKey.CREATE_NEW_RECORD" \
  "Pinned Create must stay the primary (solid blue) header CTA via upstream isPrimaryAction"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts" \
  "permissionFlags.EXPORT_CSV" \
  "Export commands must stay gated by the EXPORT_CSV role flag (PHI egress)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts" \
  "permissionFlags.IMPORT_CSV" \
  "Import command must stay gated by the IMPORT_CSV role flag (PHI ingress)"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts" \
  "permissionFlags.AI" \
  "AI chat commands must stay gated by the AI role flag (PHI egress)"
check_file_contains \
  "packages/twenty-front/src/modules/ui/layout/page/components/PageCardHeader.tsx" \
  "minmax(min-content, 1fr)" \
  "Page header action track must keep real width, or the pinned Create button collapses to the bare menu width"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts" \
  "not isLayoutCustomizationModeEnabled and permissionFlags.LAYOUTS" \
  "Edit record page layout must stay gated by the LAYOUTS role flag"

echo ""
echo "--- Record creation form extensions (v2.58): reconciliation create intercept ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useCreateNewRecord.ts" \
  "openReconciliationWizard" \
  "Create on reconciliation must open the run wizard instead of the record creation form"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useCreateNewRecord.ts" \
  "requestRecordCreation" \
  "Record creation must go through the upstream creation form (nothing is persisted before Create)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useCreateNewRecord.ts" \
  "sidePanelNavigationStackState" \
  "Create on a reconciliation index open in the side panel must not navigate the main page to a second carrier picker"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useCreateNewRecord.ts" \
  "OMNIA-CUSTOM: reconciliation intercept dependencies" \
  "createNewRecord must re-create when the location changes, or the reconciliation intercept reads a stale pathname"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/hooks/__tests__/useCreateNewRecord.test.tsx" \
  "Spec for the reconciliation create intercept in useCreateNewRecord"

echo ""
echo "--- Record creation form extensions (v2.58) ---"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/hooks/useOmniaRecordCreationDefaults.ts" \
  "Creation form Agent prefill hook must exist"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/components/OmniaCurrentAgentProfileIdEffect.tsx" \
  "Effect loading the member's AgentProfile id for the Agent prefill must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/components/OmniaCurrentAgentProfileIdEffect.tsx" \
  "filter: { workspaceMemberId: { eq: workspaceMemberId } }" \
  "Agent prefill must look up only the AgentProfile linked to the current member"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/states/omniaCurrentAgentProfileState.ts" \
  "AgentProfile id state (keyed by workspace member) must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/hooks/useOmniaRecordCreationDefaults.ts" \
  "omniaCurrentAgentProfile?.workspaceMemberId ===" \
  "Agent prefill must ignore an AgentProfile loaded for another member"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/constants/AgentProfileObjectNameSingular.ts" \
  "agentProfile object name constant must exist"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/getAgentProfileJoinColumnNames.ts" \
  "Agent relation join column lookup must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/utils/getAgentProfileJoinColumnNames.ts" \
  "OWNER_AGENT_PROFILE_RELATION_FIELD_NAME = 'agent'" \
  "Agent prefill must fill only the record's own agent, never another AgentProfile relation such as call.managing (QA manager)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/applyAgentProfileJoinColumnDefaults.ts" \
  "Agent prefill fill rule must exist"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/SidePanelRecordCreationFormPage.tsx" \
  "useOmniaRecordCreationDefaults" \
  "Creation form must apply the Omnia Agent prefill"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/SidePanelRecordCreationFormPage.tsx" \
  "OmniaCurrentAgentProfileIdEffect" \
  "Creation form must mount the AgentProfile lookup"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/SidePanelRecordCreationFormPage.tsx" \
  "{ shouldKeepNullValues: true }" \
  "A draft edited before the AgentProfile loaded must still get the Agent"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/hooks/useRequiredConditionViolations.ts" \
  "requiredCondition bridge for the creation form must exist"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/computeDraftRequiredConditionViolations.ts" \
  "Draft requiredCondition evaluation must exist"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/getRelatedRecordRequiredConditionChecks.ts" \
  "Related-record requiredCondition lookup must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/utils/getRelatedRecordRequiredConditionChecks.ts" \
  "canReadField" \
  "Related-record check must never request fields the user cannot read"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/computeRelatedRecordRequiredConditionCheckViolations.ts" \
  "Related-record requiredCondition evaluation must exist"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/normalizeRequiredConditionRecord.ts" \
  "Join column normalization for the requiredCondition evaluator must exist"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/getRequiredConditionViolationMessage.ts" \
  "requiredCondition message wording must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/utils/getRequiredConditionViolationMessage.ts" \
  "No agent profile is linked to your account" \
  "Unlinked AgentProfile message must be kept"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/types/RelatedRecordRequiredConditionCheck.ts" \
  "Related-record check type must exist"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/constants/RequiredConditionRuleIdPrefix.ts" \
  "requiredCondition violation id prefix must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/constants/RequiredConditionServerFilledFieldNamesByObjectNameSingular.ts" \
  "submittedDate" \
  "Creation form must never ask for the policy submittedDate the server stamps"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/hooks/useRequiredConditionViolations.ts" \
  "generateFindManyRecordsQuery" \
  "Related records must load through the user's permission-checked record query"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/SidePanelRecordCreationFormPage.tsx" \
  "useRequiredConditionViolations" \
  "Creation form must evaluate requiredCondition rules"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/SidePanelRecordCreationFormPage.tsx" \
  "validationRules.length > 0 || hasRequiredConditions" \
  "requiredCondition rules must run the creation form pre-check even without validation rules"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/SidePanelRecordCreationFormPage.tsx" \
  "await computeRelatedRecordRequiredConditionViolations(draftRecord)" \
  "Create must stay blocked while a linked record misses required fields (Q4)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/components/RecordCreationFormProvider.tsx" \
  "beforeunload" \
  "Leaving the tab with an unsaved creation form must prompt"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/components/RecordCreationFormProvider.tsx" \
  "SidePanelFormCancellationEffect" \
  "Upstream guard: closing the creation form must discard the draft"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/hooks/__tests__/useOmniaRecordCreationDefaults.test.tsx" \
  "Agent prefill spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/hooks/__tests__/useRequiredConditionViolations.test.tsx" \
  "requiredCondition bridge spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/components/__tests__/OmniaCurrentAgentProfileIdEffect.test.tsx" \
  "AgentProfile lookup spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/__tests__/computeDraftRequiredConditionViolations.test.ts" \
  "Draft requiredCondition spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/__tests__/getRequiredConditionViolationMessage.test.ts" \
  "requiredCondition wording spec (ported from getMissingRequiredFieldsMessage.test.ts)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/__tests__/getRelatedRecordRequiredConditionChecks.test.ts" \
  "Related-record lookup spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/__tests__/computeRelatedRecordRequiredConditionCheckViolations.test.ts" \
  "Related-record evaluation spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/__tests__/normalizeRequiredConditionRecord.test.ts" \
  "Join column normalization spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/__tests__/applyAgentProfileJoinColumnDefaults.test.ts" \
  "Agent prefill fill rule spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/utils/__tests__/getAgentProfileJoinColumnNames.test.ts" \
  "Agent relation selection spec (only the record's own agent)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/components/__tests__/RecordCreationFormProvider.test.tsx" \
  "asks before the tab unloads while a creation form holds unsaved input" \
  "beforeunload case in the upstream provider spec"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/pages/record-creation-form/components/__tests__/SidePanelRecordCreationFormPage.test.tsx" \
  "with the Omnia creation form seams" \
  "Omnia cases in the upstream creation form page spec"

echo ""
echo "--- Record creation form: Carrier to Product filter on relation inputs ---"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/components/RecordFormRelationToOneFieldInput.tsx" \
  "Creation form to-one input with the Carrier -> Product junction allowlist must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/components/RecordFormRelationToOneFieldInput.tsx" \
  "useJunctionBridgeFilterForRecord" \
  "Creation form Product picker must offer only the selected Carrier's products (allowlist read from the form draft)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/components/RecordFormRelationToOneFieldInput.tsx" \
  "additionalFilter={junctionBridgeFilter}" \
  "Creation form to-one input must hand the junction allowlist to FormFieldInput"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/components/RecordFormFieldInput.tsx" \
  "<RecordFormRelationToOneFieldInput" \
  "RecordFormFieldInput must route editable to-one relations to the junction-filtered input"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-form/components/RecordFormFieldInputs.tsx" \
  "junctionBridgeFilterParams={{" \
  "RecordFormFieldInputs must pass the form draft to the to-one junction filter (creation and update forms)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-form/components/__tests__/RecordFormRelationToOneFieldInput.test.tsx" \
  "Creation form Carrier -> Product allowlist spec (draft carrier, no carrier, non-relation fields)"

echo ""
echo "--- Review item comments side-panel page ---"
check_file_contains \
  "packages/twenty-shared/src/types/SidePanelPages.ts" \
  "ReviewItemComments" \
  "SidePanelPages enum must include ReviewItemComments for the audit-comments side panel"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/constants/SidePanelPagesConfig.tsx" \
  "SidePanelReviewItemCommentsPage" \
  "SIDE_PANEL_PAGES_CONFIG must register SidePanelReviewItemCommentsPage for SidePanelPages.ReviewItemComments"

# ======================================================================
# Front: navigation shell and sidebar
# ======================================================================
echo ""
echo "=== Front: navigation shell and sidebar ==="

echo ""
echo "--- Sidebar shell: Search row, workspace dropdown, no Documentation ---"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerContent.tsx" \
  'label={t`Search`}' \
  "Labeled Search row must stay at the top of the Home sidebar (Q6)"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation/components/NavigationDrawerHeader.tsx" \
  "openRecordsSearchPage" \
  "Search icon beside the workspace name must stay removed (Search lives in the sidebar row)"
check_file_exists \
  "packages/twenty-front/src/modules/navigation/components/__tests__/MainNavigationDrawerContent.test.tsx" \
  "Search row test (Home shows it and opens records search; AI chat hides it) must exist"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx" \
  "OMNIA-CUSTOM: inline Log out" \
  "Workspace dropdown must show Log out inline in single-workspace mode"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx" \
  '{!isMultiWorkspaceEnabled && (' \
  "Inline Log out must be gated on single-workspace mode"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx" \
  "{isMultiWorkspaceEnabled && (" \
  "More options menu (Create Workspace) must stay multi-workspace only"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx" \
  "IconUserPlus" \
  "Invite user item must stay removed from the workspace dropdown (Q7)"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/constants/NavigationDrawerModeOrder.ts" \
  "NAVIGATION_DRAWER_TABS.SETTINGS" \
  "Settings must stay a mode of the sidebar mode switcher"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useNavigationDrawerModes.ts" \
  "NAVIGATION_DRAWER_TABS.SETTINGS" \
  "Sidebar mode switcher must keep its Settings entry"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useNavigationDrawerModes.ts" \
  'mode !== NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY || hasAiPermission' \
  "AI mode must stay hidden without the AI permission flag"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerContent.tsx" \
  "shouldMountAiChatContent={hasAiPermission}" \
  "AI chat content must only mount with the AI permission flag"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx" \
  "Documentation" \
  "Main sidebar must not regain a Documentation link"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx" \
  "NavigationDrawerOtherSection" \
  "Main sidebar must not regain the Other section"
check_file_contains \
  "packages/twenty-front/src/modules/ui/navigation/navigation-drawer/constants/DefaultWorkspaceLogo.ts" \
  "/images/icons/omnia/logo.png" \
  "Fallback workspace avatar and favicon must be the Omnia logo"
check_file_exists \
  "packages/twenty-front/public/images/icons/omnia/logo.png" \
  "Omnia logo used as DEFAULT_WORKSPACE_LOGO"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/components/MultiWorkspaceDropdown/__stories__/MultiWorkspaceDropdownButton.stories.tsx" \
  "export const SingleWorkspaceInlineLogOut" \
  "Dropdown story must keep the single-workspace inline Log out / no Invite user assertions"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation/components/MultiWorkspaceDropdown/__stories__/MultiWorkspaceDropdownButton.stories.tsx" \
  "toHaveAttribute('href', '/settings/members#invite')" \
  "Dropdown story must not restore upstream's Invite user link assertion (Q7 removed the item)"

echo ""
echo "--- App root: dev toolbar, import job mounts, page-change redirects ---"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/App.tsx" \
  "import('agentation')" \
  "App.tsx must load the Agentation toolbar through a lazy dynamic import so production bundles never include it"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/App.tsx" \
  "process.env.NODE_ENV === 'development'" \
  "The Agentation toolbar must stay behind the development-only check"
check_file_not_contains \
  "packages/twenty-front/src/modules/app/components/App.tsx" \
  "from 'agentation'" \
  "A static agentation import would ship the dev toolbar in production bundles"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/WorkspaceAppProviders.tsx" \
  "<ImportJobRecoveryEffect />" \
  "The import progress poller must stay mounted next to CommandRunner"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/WorkspaceAppProviders.tsx" \
  "<BackgroundJobIndicator />" \
  "The import progress card must stay mounted next to CommandRunner"
check_file_contains \
  "packages/twenty-front/src/modules/app/hooks/usePageChangeEffectNavigateLocation.ts" \
  "isRecordIndexPathOfUnavailableObject(" \
  "returnToPath must not land on a deactivated or deleted object's index (e.g. a stale /objects/companies)"
check_file_contains \
  "packages/twenty-front/src/modules/app/hooks/usePageChangeEffectNavigateLocation.ts" \
  '!objectMetadataItem.isActive' \
  "A deactivated object's index must redirect to the default home page"
check_file_contains \
  "packages/twenty-front/src/modules/app/hooks/__tests__/usePageChangeEffectNavigateLocation.test.ts" \
  "sends a deactivated object index to the home page" \
  "Regression tests for the deactivated/deleted object redirects must stay"
check_file_contains \
  "packages/twenty-front/src/modules/app/routing/utils/__tests__/createWorkspaceRouteObjects.test.tsx" \
  "serves the reconciliation review URL from the generic record show route" \
  "Regression test: /object/reconciliation/:id must stay on the generic show route (CORE_OBJECT_SHOW_PAGES + route context store)"
check_file_contains \
  "packages/twenty-front/src/modules/app/hooks/__tests__/usePageChangeEffectNavigateLocation.test.ts" \
  "stays on SignInUp while a trusted sibling URL is in the query" \
  "Regression tests for the trusted sibling redirect guard on /welcome and /verify must stay"
check_file_contains \
  "packages/twenty-front/src/modules/app/hooks/__tests__/usePageChangeEffectNavigateLocation.test.ts" \
  "jest.mock('@/auth/sign-in-up/utils/getTrustedExternalReturnUrl');" \
  "The page-change spec must control the trusted sibling URL (the hook reads window.location)"
check_file_contains \
  "packages/twenty-front/src/modules/app/hooks/usePageChangeEffectNavigateLocation.ts" \
  "isDefined(getTrustedExternalReturnUrl())" \
  "PageChangeEffect must keep a signed-in user on /welcome or /verify while the trusted sibling redirect runs"

echo ""
echo "--- Default landing page (member block) ---"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts" \
  "MEMBER_LANDING_OBJECT_ORDER" \
  "Users without LAYOUTS must land on the first MEMBER_LANDING_OBJECT_ORDER object of their sidebar list (person/Leads first)"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts" \
  "useMemberSidebarObjectMetadataItems" \
  "Member landing must come from the fail-closed member sidebar list, never the nav tree or alphabetical fallback"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts" \
  "OMNIA-CUSTOM: members never get the nav-tree or alphabetical fallback" \
  "Member landing branch must sit after upstream's loading guard and return AppPath.Index until the list loads"
check_file_exists \
  "packages/twenty-front/src/modules/navigation/constants/MemberLandingObjectOrder.ts" \
  "Member landing order constant must exist"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/constants/MemberLandingObjectOrder.ts" \
  "['person', 'policy', 'note', 'task']" \
  "Member landing order must stay person, policy, note, task"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/__tests__/useDefaultHomePagePath.test.ts" \
  "should pin a non-admin member to the first sidebar object" \
  "Landing-page tests must keep Omnia member sidebar-pinning (person/Leads) coverage"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/__tests__/useDefaultHomePagePath.test.ts" \
  "should land a member on policy when person is hidden, never on a hidden object" \
  "Landing-page tests must prove members never land on an object hidden from their sidebar"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/__tests__/useDefaultHomePagePath.test.ts" \
  "PermissionFlagType.LAYOUTS" \
  "Upstream landing scenarios must run as a LAYOUTS holder"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts" \
  "Desktop /home redirects back to this path" \
  "An empty member list must land on Settings > Profile; AppPath.Home self-redirects on desktop"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/__tests__/useDefaultHomePagePath.test.ts" \
  "should land a member on profile settings when their sidebar shows nothing" \
  "Landing-page tests must prove an empty member list never lands on the desktop /home dead end"

echo ""
echo "--- Member workspace sidebar (R-NAV) ---"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher.tsx" \
  "OmniaMemberWorkspaceNavigationMenuItems" \
  "Users without LAYOUTS must get the Omnia member object list instead of the curated workspace tree"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher.tsx" \
  "PermissionFlagType.LAYOUTS" \
  "Workspace section dispatch must key on the LAYOUTS permission flag"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher.tsx" \
  "WorkspaceNavigationMenuItemsDispatcher" \
  "The pre-v2.58 dispatcher was deleted; the split now lives in WorkspaceSectionDispatcher"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx" \
  "WorkspaceSectionDispatcher" \
  "The drawer (desktop and mobile home) must render the workspace section through the Omnia dispatcher"
check_file_contains \
  "packages/twenty-front/src/pages/mobile-home/MobileHomePage.tsx" \
  "MainNavigationDrawerNavigationContent" \
  "Mobile home must render the drawer content so members get the same member list"
check_file_exists \
  "packages/twenty-front/src/modules/navigation-menu-item/display/dnd/components/OmniaMemberWorkspaceNavigationMenuItems.tsx" \
  "Omnia member workspace section must exist"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/dnd/components/OmniaMemberWorkspaceNavigationMenuItems.tsx" \
  "useMemberSidebarObjectMetadataItems" \
  "Member workspace section must render the fail-closed member object list"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/dnd/components/OmniaMemberWorkspaceNavigationMenuItems.tsx" \
  'if (!isLoaded || !isNonEmptyArray(objectMetadataItems)) {' \
  "Member workspace section must render nothing until sidebar visibility and permissions load"
check_file_exists \
  "packages/twenty-front/src/modules/navigation-menu-item/display/hooks/useMemberSidebarObjectMetadataItems.ts" \
  "Member sidebar object list hook must exist"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/hooks/useMemberSidebarObjectMetadataItems.ts" \
  "canReachSomeRecords" \
  "Member sidebar must only list objects the user can read (all records or a row-level rule)"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/hooks/useMemberSidebarObjectMetadataItems.ts" \
  "objectShowInSidebarByObjectMetadataIdSelector" \
  "Member sidebar must filter objects by the role's showInSidebar visibility (C4)"
check_file_exists \
  "packages/twenty-front/src/modules/navigation-menu-item/display/utils/sortMemberSidebarObjectMetadataItems.ts" \
  "Member sidebar sort util must exist"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/utils/sortMemberSidebarObjectMetadataItems.ts" \
  "MEMBER_SIDEBAR_FIRST_OBJECT_NAMES" \
  "Member sidebar must list Dashboards, Leads, Calls, Policies, Notes, Tasks first"
check_file_exists \
  "packages/twenty-front/src/modules/navigation-menu-item/display/constants/MemberSidebarFirstObjectNames.ts" \
  "Member sidebar first-object order constant must exist"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/constants/MemberSidebarFirstObjectNames.ts" \
  "StandardObjectNameSingular.Dashboard," \
  "Member sidebar order must keep Dashboards in the first-object list"
check_file_exists \
  "packages/twenty-front/src/modules/navigation-menu-item/display/utils/__tests__/sortMemberSidebarObjectMetadataItems.test.ts" \
  "Member sidebar order test must exist"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/utils/__tests__/sortMemberSidebarObjectMetadataItems.test.ts" \
  "should list Dashboards, Leads, Calls, Policies, Notes and Tasks first, in that order" \
  "Member sidebar order test must keep the Dashboards-first assertion"
check_file_exists \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/workspace/components/__tests__/WorkspaceSectionDispatcher.test.tsx" \
  "Member sidebar component test must exist"
check_file_exists \
  "packages/twenty-front/src/modules/navigation-menu-item/display/testing/memberSidebarTestFixtures.ts" \
  "Member sidebar test fixtures must exist"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection.tsx" \
  "OMNIA-CUSTOM: hide Opened when the sidebar already lists the object" \
  "Opened must not repeat an object the workspace sidebar already lists (VIEW items and the member list included)"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection.tsx" \
  "useMemberSidebarObjectMetadataItems" \
  "Opened de-dup for members must use the member sidebar list"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection.tsx" \
  "getObjectMetadataForNavigationMenuItem" \
  "Opened de-dup for LAYOUTS users must resolve OBJECT, VIEW and RECORD items to their object"
check_file_exists \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/components/__tests__/NavigationDrawerOpenedSection.test.tsx" \
  "Opened de-dup test must exist"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems.tsx" \
  "showInSidebar" \
  "NavigationDrawerSectionForObjectMetadataItems stays upstream; sidebar visibility lives in the member list"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/components/DashboardPageLayoutEditModeProvider.tsx" \
  "hasLayoutsPermission" \
  "Dashboard edit mode must be gated on the LAYOUTS permission flag (read-only for view-only roles)"

echo ""
echo "--- Ingestion pipeline settings pages ---"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx" \
  "element={<SettingsIngestionPipelineDetail />}" \
  "Settings routes must mount the ingestion pipeline pages, not only lazy-import them"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx" \
  "OMNIA-CUSTOM: Ingestion pipeline settings pages, gated like the server resolvers" \
  "Ingestion pipeline routes stay inside the API_KEYS_AND_WEBHOOKS route group"
check_file_contains \
  "packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx" \
  "SettingsPath.IngestionPipelines" \
  "Settings nav must list Ingestion pipelines"
check_file_contains \
  "packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx" \
  "OMNIA-CUSTOM: Ingestion pipeline settings, same permission as the server resolvers" \
  "Ingestion pipelines nav item must stay gated on API_KEYS_AND_WEBHOOKS"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx" \
  "permissionMap[" \
  "v2.58 renamed permissionMap to permissionFlagMap; a clean merge of the nav item breaks typecheck"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionFieldMappingEditor.component.tsx" \
  "Ingestion pipeline field mapping editor"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionLogTable.component.tsx" \
  "Ingestion pipeline run history table"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionPipelineForm.component.tsx" \
  "Ingestion pipeline form"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionTestSection.component.tsx" \
  "Ingestion pipeline test section"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-field-mapping.mutations.ts" \
  "Ingestion field mapping mutations (codegen source)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-field-mapping.queries.ts" \
  "Ingestion field mapping queries (codegen source)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-log.queries.ts" \
  "Ingestion log queries (codegen source)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-pipeline.mutations.ts" \
  "Ingestion pipeline mutations (codegen source)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/graphql/ingestion-pipeline.queries.ts" \
  "Ingestion pipeline queries (codegen source)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionFieldMappings.ts" \
  "Ingestion field mappings hook"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionPipeline.ts" \
  "Ingestion pipeline hook"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionPipelineLogs.ts" \
  "Ingestion pipeline logs hook"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionPipelineTest.ts" \
  "Ingestion pipeline test hook"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/hooks/useIngestionPipelines.ts" \
  "Ingestion pipelines list hook"
check_file_exists \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/types/IngestionPipelineFormValues.ts" \
  "Ingestion pipeline form values type"
check_file_exists \
  "packages/twenty-front/src/pages/settings/ingestion-pipelines/SettingsIngestionPipelines.tsx" \
  "Ingestion pipelines list page"
check_file_exists \
  "packages/twenty-front/src/pages/settings/ingestion-pipelines/SettingsIngestionPipelineNew.tsx" \
  "Ingestion pipeline create page"
check_file_exists \
  "packages/twenty-front/src/pages/settings/ingestion-pipelines/SettingsIngestionPipelineDetail.tsx" \
  "Ingestion pipeline detail page"
check_file_contains \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionPipelineForm.component.tsx" \
  "x-webhook-secret" \
  "Webhook URL copy must tell senders to put the secret in the x-webhook-secret header"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/ingestion-pipeline/components/IngestionPipelineForm.component.tsx" \
  "?secret=" \
  "The ingestion UI must never build or copy a URL that embeds the webhook secret"
check_file_not_contains \
  "packages/twenty-front/src/pages/settings/ingestion-pipelines/SettingsIngestionPipelineDetail.tsx" \
  "?secret=" \
  "The push webhook URL must not embed the webhook secret"
check_file_contains \
  "packages/twenty-front/src/pages/settings/ingestion-pipelines/SettingsIngestionPipelineDetail.tsx" \
  '${REACT_APP_SERVER_BASE_URL}/ingestion/${pipeline.id}' \
  "Push webhook URL points at the server base URL and carries only the pipeline id"
check_file_contains \
  "packages/twenty-front/src/pages/settings/data-model/SettingsObjectFieldEdit.tsx" \
  "requiredCondition: fieldMetadataItem?.requiredCondition ?? null" \
  "Field edit form must seed requiredCondition so the soft Required rule can be edited (contract C5)"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx" \
  "SettingsIngestionPipelines" \
  "Settings routes must include Ingestion Pipeline pages"

# ======================================================================
# Front: auth, sessions and branding
# ======================================================================
echo ""
echo "=== Front: auth, sessions and branding ==="

echo ""
echo "--- Sidebar Visibility: Current User (contract C4) ---"
check_file_contains \
  "packages/twenty-front/src/modules/users/graphql/fragments/userQueryFragment.ts" \
  "objectSidebarVisibility" \
  "Current-user query must select currentUserWorkspace.objectSidebarVisibility (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/states/currentUserWorkspaceState.ts" \
  "objectSidebarVisibility?:" \
  "CurrentUserWorkspace.objectSidebarVisibility must stay optional: undefined means not loaded, including values persisted before the field (contract C4)"
check_file_contains \
  "packages/twenty-front/src/testing/mock-data/users.ts" \
  "objectSidebarVisibility" \
  "mockedUserData must carry sidebar visibility, or member-sidebar stories and tests render no objects (contract C4)"
check_file_contains \
  "packages/twenty-front/src/testing/mock-data/roles/roles-mock.ts" \
  "showAllObjectsInSidebar" \
  "Role mocks must set the non-null generated Role.showAllObjectsInSidebar (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/users/hooks/useLoadCurrentUser.ts" \
  "objectSidebarVisibility:" \
  "loadCurrentUser must copy sidebar visibility into currentUserWorkspaceState (contract C4)"
check_file_not_contains \
  "packages/twenty-front/src/modules/users/hooks/useLoadCurrentUser.ts" \
  "objectSidebarVisibility ?? []" \
  "loadCurrentUser must not default sidebar visibility to []: undefined means not loaded (contract C4)"
check_file_contains \
  "packages/twenty-front/src/modules/metadata-store/effect-components/UserMetadataProviderInitialEffect.tsx" \
  "objectSidebarVisibility:" \
  "The boot-time current-user load must copy sidebar visibility into currentUserWorkspaceState (contract C4)"
check_file_not_contains \
  "packages/twenty-front/src/modules/metadata-store/effect-components/UserMetadataProviderInitialEffect.tsx" \
  "objectSidebarVisibility ?? []" \
  "The boot-time current-user load must not default sidebar visibility to []: undefined means not loaded (contract C4)"

echo ""
echo "--- Cache bust on app version change and session keys ---"
check_file_exists \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "App-version cache-bust util must exist (resets stale persisted client state once per deploy)"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "omnia.cachedAppVersion" \
  "Cache-bust must compare clientConfig.appVersion with localStorage omnia.cachedAppVersion"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "isPendingServerSignOutState" \
  "Cache-bust must preserve a pending server sign-out (HIPAA: a dropped retry leaves the session alive on a shared workstation)"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "isCookieAuthActiveState" \
  "Cache-bust must preserve the cookie-session flag so a deploy does not log every user out"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "'authSessionGeneration'" \
  "Cache-bust must preserve the session generation key (a literal: sessionGenerationStore.ts does not export it)"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "clearMetadataStoreStorage" \
  "Cache-bust must clear the IndexedDB metadata store (localStorage.clear() never reached it)"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "METADATA_STORE_KEY_PREFIX" \
  "Cache-bust must delete orphan metadataStoreState__* localStorage keys left by v2.6 browsers (C27)"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/hooks/useClientConfig.ts" \
  "resetStaleClientStateOnAppVersionChange" \
  "loadClientConfig must run the app-version cache-bust (covers the HTML bootstrap and the fetch path)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/utils/sessionGenerationStore.ts" \
  "'authSessionGeneration'" \
  "Session generation key must stay 'authSessionGeneration': the cache-bust preserves that literal"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/WorkspaceAppProviders.tsx" \
  "<LegacyTokenPairCookieCleanupEffect />" \
  "WorkspaceAppProviders must mount the legacy tokenPair cleanup (it wraps every route, including signed-out /welcome)"
check_file_not_contains \
  "packages/twenty-front/src/modules/auth/utils/clearSessionLocalStorageKeys.ts" \
  "activeExportJobId" \
  "Sign-out must not track the removed export job (activeImportJobId replaces it)"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "isNewerSemver(cachedAppVersion, appVersion)" \
  "Cache-bust must not reset toward an older version, or a rolling deploy bounces browsers between pods"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/utils/resetStaleClientStateOnAppVersionChange.ts" \
  "currentWorkspaceState.key" \
  "Cache-bust must preserve the persisted session snapshot: without currentWorkspaceState, PageChangeEffect sends every signed-in user to /welcome after a deploy"
check_file_exists \
  "packages/twenty-front/src/modules/auth/utils/__tests__/clearSessionLocalStorageKeys.test.ts" \
  "Omnia test from the v2.58 merge (G2): clearSessionLocalStorageKeys.test.ts"
check_file_exists \
  "packages/twenty-front/src/modules/client-config/utils/__tests__/resetStaleClientStateOnAppVersionChange.test.ts" \
  "Omnia test from the v2.58 merge (G2): resetStaleClientStateOnAppVersionChange.test.ts"

echo ""
echo "--- Dashboard SSO: server-issued httpOnly sibling cookie (C13) ---"
check_file_exists \
  "packages/twenty-front/src/modules/auth/components/LegacyTokenPairCookieCleanupEffect.tsx" \
  "Cutover cleanup of the v2.6 JS-readable tokenPair cookie (60-day refresh token) must exist"
check_file_contains \
  "packages/twenty-front/src/modules/auth/components/LegacyTokenPairCookieCleanupEffect.tsx" \
  "tokenPair" \
  "Legacy cleanup must remove the tokenPair cookie (parent-domain and host-only) and the tokenPair/tokenPairState localStorage keys"
check_file_exists \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.module.ts" \
  "OmniaSiblingSessionModule must exist (global provider of the omniaagent.com dashboard cookie)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.module.ts" \
  "@Global()" \
  "OmniaSiblingSessionModule must stay global: upstream session services inject its service without importing it"
check_file_exists \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.service.ts" \
  "OmniaSiblingSessionService must exist (issues and clears the httpOnly tokenPair sibling cookie)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.service.ts" \
  "httpOnly: true" \
  "Sibling cookie must stay httpOnly: no script on any *.omniaagent.com page may read a CRM bearer token (PHI)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.service.ts" \
  "secure: true" \
  "Sibling cookie must stay Secure"
check_file_not_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.service.ts" \
  "refreshToken" \
  "Sibling cookie must carry only the short-lived access token, never a refresh token"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.service.ts" \
  "JwtTokenTypeEnum.ACCESS" \
  "Sibling cookie must skip workspace-agnostic tokens (the dashboard requires a workspace ACCESS token)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.service.ts" \
  "deriveTrustedParentDomain" \
  "Sibling cookie domain must be the parent domain the external-redirect allowlist trusts (none on localhost/IP/apex)"
check_file_exists \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.resolver.ts" \
  "refreshOmniaSiblingSession resolver must exist (re-mints the dashboard cookie from the live session)"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.resolver.ts" \
  "refreshOmniaSiblingSession" \
  "Resolver must expose the refreshOmniaSiblingSession mutation the front effect and external redirect call"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.resolver.ts" \
  "isDefined(authenticatedAt)" \
  "refreshOmniaSiblingSession must refuse Bearer tokens: only a live cookie session may mint, or a leaked cookie token renews itself forever"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/user-session/services/user-session.service.ts" \
  "omniaSiblingSessionService.issue" \
  "issueSessionForTokenPair must mirror the access token into the dashboard sibling cookie"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/user-session/services/user-session-cookie.service.ts" \
  "omniaSiblingSessionService.clear" \
  "clearSessionCookie must also clear the sibling cookie (sign-out, revoke, dead session, impersonation fallback)"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/impersonation/services/impersonation.service.ts" \
  "omniaSiblingSessionService.clear" \
  "Stop-impersonation must drop the impersonated user's dashboard cookie"
check_file_contains \
  "packages/twenty-server/src/engine/middlewares/cookie-session-csrf.middleware.spec.ts" \
  "provide: OmniaSiblingSessionService" \
  "CSRF middleware spec builds the real UserSessionCookieService, so it must provide the sibling session mock"
check_file_exists \
  "packages/twenty-front/src/modules/auth/hooks/useRefreshOmniaSiblingSession.ts" \
  "useRefreshOmniaSiblingSession must exist (shared by the refresh effect and the trusted external redirect)"
check_file_exists \
  "packages/twenty-front/src/modules/auth/effect-components/OmniaSiblingSessionRefreshEffect.tsx" \
  "OmniaSiblingSessionRefreshEffect must exist (keeps the 30-minute dashboard cookie fresh while a CRM tab is open)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/graphql/mutations/refreshOmniaSiblingSession.ts" \
  "refreshOmniaSiblingSession" \
  "The RefreshOmniaSiblingSession document must exist so codegen emits RefreshOmniaSiblingSessionDocument"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/WorkspaceAppProviders.tsx" \
  "<OmniaSiblingSessionRefreshEffect />" \
  "WorkspaceAppProviders must mount the dashboard cookie refresh"
check_file_contains \
  "packages/twenty-front/src/modules/auth/effect-components/OmniaSiblingSessionRefreshEffect.tsx" \
  "isPendingServerSignOutState" \
  "The sibling cookie refresh must pause during a sign-out, or a late refresh re-creates the cookie the sign-out cleared"
check_file_contains \
  "packages/twenty-front/src/modules/auth/effect-components/OmniaSiblingSessionRefreshEffect.tsx" \
  "isTrustedSiblingSignOutRequest" \
  "The sibling cookie refresh must skip the page that handles the dashboard's Sign out"
check_file_exists \
  "packages/twenty-server/src/modules/omnia-sibling-session/constants/omnia-sibling-session-cookie-name.constant.ts" \
  "The sibling cookie name constant must exist"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/constants/omnia-sibling-session-cookie-name.constant.ts" \
  "'tokenPair'" \
  "The sibling cookie must keep the name the omniaagent.com dashboard reads, which also replaces the legacy JS cookie in place"
check_file_exists \
  "packages/twenty-server/src/modules/omnia-sibling-session/constants/omnia-sibling-session-token-lifetime.constant.ts" \
  "The sibling token lifetime constant must exist"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/constants/omnia-sibling-session-token-lifetime.constant.ts" \
  "'30m'" \
  "The sibling cookie carries a bearer token no sign-out revokes: 30 minutes, whatever ACCESS_TOKEN_EXPIRES_IN (7d in the chart) says"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.service.ts" \
  "OMNIA_SIBLING_SESSION_TOKEN_LIFETIME" \
  "issue() must refuse a token that outlives the sibling lifetime, and reissue() must re-sign with it"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.module.ts" \
  "JwtModule" \
  "OmniaSiblingSessionModule must import JwtModule: reissue() signs with JwtWrapperService"
check_file_contains \
  "packages/twenty-server/src/modules/omnia-sibling-session/omnia-sibling-session.resolver.ts" \
  "omniaSiblingSessionService.reissue" \
  "refreshOmniaSiblingSession must re-sign with the sibling lifetime and report whether a cookie was written"
check_file_contains \
  "packages/twenty-front/src/modules/auth/components/LegacyTokenPairCookieCleanupEffect.tsx" \
  "impersonation_original_session" \
  "Legacy cleanup must drop the admin token pair a v2.6 impersonating tab parked in sessionStorage"
check_file_exists \
  "packages/twenty-front/src/modules/auth/components/__tests__/LegacyTokenPairCookieCleanupEffect.test.tsx" \
  "Omnia test from the v2.58 merge (G2): LegacyTokenPairCookieCleanupEffect.test.tsx"
check_file_exists \
  "packages/twenty-front/src/modules/auth/effect-components/__tests__/OmniaSiblingSessionRefreshEffect.test.tsx" \
  "Omnia test from the v2.58 merge (G2): OmniaSiblingSessionRefreshEffect.test.tsx"
check_file_exists \
  "packages/twenty-server/src/modules/omnia-sibling-session/__tests__/omnia-sibling-session.resolver.spec.ts" \
  "Omnia test from the v2.58 merge (G2): omnia-sibling-session.resolver.spec.ts"
check_file_exists \
  "packages/twenty-server/src/modules/omnia-sibling-session/__tests__/omnia-sibling-session.service.spec.ts" \
  "Omnia test from the v2.58 merge (G2): omnia-sibling-session.service.spec.ts"

echo ""
echo "--- Static branding (index.html, manifest, icons, logo, title) ---"
check_file_contains \
  "packages/twenty-front/src/pages/auth/SignInUp.tsx" \
  "SignInUpExternalRedirectEffect" \
  "SignInUp must mount SignInUpExternalRedirectEffect so a signed-in user sent by the omniaagent.com dashboard goes back"
check_file_not_contains \
  "packages/twenty-front/src/pages/auth/SignInUp.tsx" \
  'Welcome, ${workspaceName}.' \
  "SignInUp title must be the workspace name only (upstream 'Welcome, X.' string came back)"
check_file_contains \
  "packages/twenty-front/index.html" \
  "OMNIA-CUSTOM" \
  "index.html must keep its OMNIA-CUSTOM marker for the Omnia favicon, icon and titles"
check_file_contains \
  "packages/twenty-front/index.html" \
  'href="/images/icons/omnia/favicon.png"' \
  "index.html must use the Omnia favicon"
check_file_contains \
  "packages/twenty-front/index.html" \
  '<link rel="apple-touch-icon" href="/images/icons/omnia/192.png" />' \
  "index.html apple-touch icon must be the Omnia icon"
check_file_contains \
  "packages/twenty-front/index.html" \
  '<meta property="og:title" content="Omnia" />' \
  "index.html og:title must be Omnia"
check_file_contains \
  "packages/twenty-front/index.html" \
  '<meta name="twitter:title" content="Omnia" />' \
  "index.html twitter:title must be Omnia"
check_file_contains \
  "packages/twenty-front/index.html" \
  "<title>Omnia</title>" \
  "index.html document title must be Omnia"
check_file_not_contains \
  "packages/twenty-front/index.html" \
  "fonts.googleapis.com" \
  "index.html must not load Google Fonts: v2.58 self-hosts Inter and DM Mono through @fontsource"
check_file_not_contains \
  "packages/twenty-front/index.html" \
  "fonts.gstatic.com" \
  "index.html must not preconnect to Google Fonts"
check_file_contains \
  "packages/twenty-front/public/manifest.json" \
  '"name": "Omnia"' \
  "PWA manifest name must be Omnia"
check_file_contains \
  "packages/twenty-front/public/manifest.json" \
  '"short_name": "Omnia"' \
  "PWA manifest short_name must be Omnia"
check_file_exists \
  "packages/twenty-front/public/images/icons/omnia/favicon.png" \
  "Omnia favicon referenced by index.html"
check_file_exists \
  "packages/twenty-front/public/images/icons/omnia/192.png" \
  "Omnia apple-touch icon referenced by index.html"
check_file_contains \
  "packages/twenty-front/src/utils/title-utils.ts" \
  "doNotTranslate('Omnia')" \
  "Default page title must be Omnia (doNotTranslate: brand name, passes the unlocalized-strings lint)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/components/Logo.tsx" \
  "shouldPromoteWorkspaceLogo" \
  "Logo.tsx must render the workspace logo as the main logo when no primary logo is passed"
check_file_exists \
  "packages/twenty-front/src/modules/auth/components/__tests__/Logo.test.tsx" \
  "Regression test for the Omnia workspace-logo promotion on the sign-in Logo"
check_file_contains \
  "packages/twenty-front/src/utils/__tests__/title-utils.test.ts" \
  "toBe('Omnia')" \
  "title-utils spec must expect the Omnia default page title"
check_file_contains \
  "packages/twenty-front/src/modules/auth/components/Logo.tsx" \
  "OMNIA-CUSTOM" \
  "Logo.tsx must show workspace logo as primary when no custom primary logo set"
check_file_contains \
  "packages/twenty-front/src/pages/auth/SignInUp.tsx" \
  "OMNIA-CUSTOM" \
  "SignInUp.tsx must show the workspace name as the title and mount SignInUpExternalRedirectEffect"

echo ""
echo "--- Sign-in: trusted external return URL and sign-out ---"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/isTrustedSiblingSignOutRequest.ts" \
  "referrer: string = document.referrer" \
  "omniaSignOut must be honoured only when a sibling app opened the page (no cross-site sign-out links)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/isTrustedSiblingSignOutRequest.ts" \
  "new URL(referrer).origin !== location.origin" \
  "A sign-out link inside the CRM itself must not sign the user out"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/__tests__/isTrustedSiblingSignOutRequest.test.ts" \
  "ignores a sign-out link that a sibling app did not open" \
  "Sign-out spec must keep the cross-site case"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/components/internal/SignInUpExternalRedirectEffect.tsx" \
  "SignInUpExternalRedirectEffect must exist to send a signed-in user back to a trusted sibling URL"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/components/internal/SignInUpExternalRedirectEffect.tsx" \
  "useRedirectToTrustedExternalReturnUrl" \
  "SignInUpExternalRedirectEffect must go through the shared redirect hook (refresh first, one attempt at a time)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl.ts" \
  "refreshOmniaSiblingSession" \
  "Trusted external redirect must refresh the httpOnly sibling cookie first, or the dashboard bounces the user straight back"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl.ts" \
  "isCookieAuthActiveState" \
  "Trusted external redirect must run only once a session exists"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl.ts" \
  "hasRedirectedWithinLoopWindow" \
  "Trusted external redirect must stop a CRM <-> dashboard redirect loop when the dashboard rejects the fresh cookie"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/isTrustedExternalReturnUrl.ts" \
  "'https:'" \
  "Front must only leave for https sibling URLs (defence in depth over isExternalRedirectTrusted, which allows http on localhost)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/isTrustedExternalReturnUrl.ts" \
  "isExternalRedirectTrusted" \
  "Front must trust-check external return URLs against the CRM's parent domain"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/getTrustedExternalReturnUrl.ts" \
  "postSignInRedirect" \
  "The legacy postSignInRedirect alias sent by the omniaagent.com dashboard must keep working"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useVerifyLogin.ts" \
  "redirectToTrustedExternalReturnUrl" \
  "/verify must send the user on to a trusted sibling URL once the login token is swapped for a session"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useRedeemSsoExchangeToken.ts" \
  "redirectToTrustedExternalReturnUrl" \
  "SSO exchange redeem must send the user on to a trusted sibling URL once the session exists"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useAuth.ts" \
  "returnToPath" \
  "useAuth buildRedirectUrl must forward returnToPath into the Google/Microsoft OAuth kickoff URLs"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useAuth.ts" \
  "isTrustedExternalReturnUrl" \
  "useAuth buildRedirectUrl must forward a trusted https sibling returnToPath (upstream only forwards app paths)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useAuth.ts" \
  "clearMetadataStoreStorage" \
  "Sign-out must await the IndexedDB metadata-store wipe (RLS predicates, roles, view filters) before the reload"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInWithGoogle.ts" \
  "returnToPath" \
  "useSignInWithGoogle must forward the trusted sibling URL to Google OAuth"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInWithMicrosoft.ts" \
  "returnToPath" \
  "useSignInWithMicrosoft must forward the trusted sibling URL to Microsoft OAuth"
check_file_contains \
  "packages/twenty-front/src/modules/app/hooks/usePageChangeEffectNavigateLocation.ts" \
  "getTrustedExternalReturnUrl" \
  "PageChangeEffect must keep a signed-in user on /welcome or /verify while the trusted sibling redirect runs"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/assignWindowLocation.ts" \
  "assignWindowLocation must exist: the trusted sibling redirect leaves the CRM through it"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/states/isTrustedExternalRedirectInProgressState.ts" \
  "isTrustedExternalRedirectInProgressState must exist: it keeps the three redirect call sites to one attempt at a time"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/constants/OmniaSignOutSearchParam.ts" \
  "OMNIA_SIGN_OUT_SEARCH_PARAM must exist (the omniaagent.com dashboard's Sign out flag)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/constants/OmniaSignOutSearchParam.ts" \
  "'omniaSignOut'" \
  "The dashboard's Sign out sends omniaSignOut=1: renaming the parameter breaks single logout"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/isTrustedSiblingSignOutRequest.ts" \
  "isTrustedSiblingSignOutRequest must exist (dashboard sign-out flag plus a trusted return URL)"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/consumeTrustedSiblingSignOutRequest.ts" \
  "consumeTrustedSiblingSignOutRequest must exist (one-shot dashboard sign-out request)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/consumeTrustedSiblingSignOutRequest.ts" \
  "window.history.replaceState" \
  "The dashboard sign-out flag must be stripped synchronously, or a re-run or remounted effect signs out again"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/components/internal/SignInUpExternalRedirectEffect.tsx" \
  "consumeTrustedSiblingSignOutRequest" \
  "Dashboard Sign out must end the CRM session: the dashboard cannot reach the host-only session cookie (HIPAA single logout)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/components/internal/SignInUpExternalRedirectEffect.tsx" \
  "isPendingServerSignOutState" \
  "SignInUpExternalRedirectEffect must not send the user back to the dashboard while a sign-out is under way"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/__tests__/consumeTrustedSiblingSignOutRequest.test.ts" \
  "Regression test for the one-shot dashboard sign-out flag"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/__tests__/isTrustedSiblingSignOutRequest.test.ts" \
  "Regression test for the dashboard sign-out request guard"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useAuth.ts" \
  "clearAllSessionLocalStorageKeys();" \
  "Sign-out must also drop the legacy metadataStoreState__* keys through upstream's clearAllSessionLocalStorageKeys"
check_file_exists \
  "packages/twenty-shared/src/utils/auth/derive-trusted-redirect-domain.ts" \
  "Trusted external redirect helpers must exist (shared by server + frontend)"
check_file_contains \
  "packages/twenty-shared/src/utils/auth/derive-trusted-redirect-domain.ts" \
  "isExternalRedirectTrusted" \
  "Trust-check helper must be exported for post-sign-in redirects"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/components/internal/__tests__/SignInUpExternalRedirectEffect.test.tsx" \
  "Omnia test from the v2.58 merge (G2): SignInUpExternalRedirectEffect.test.tsx"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/__tests__/useRedirectToTrustedExternalReturnUrl.test.tsx" \
  "Omnia test from the v2.58 merge (G2): useRedirectToTrustedExternalReturnUrl.test.tsx"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/__tests__/getTrustedExternalReturnUrl.test.ts" \
  "Omnia test from the v2.58 merge (G2): getTrustedExternalReturnUrl.test.ts"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/utils/__tests__/isTrustedExternalReturnUrl.test.ts" \
  "Omnia test from the v2.58 merge (G2): isTrustedExternalReturnUrl.test.ts"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/__tests__/useAuth.test.tsx" \
  "OMNIA-CUSTOM: sign-out must finish wiping the IndexedDB metadata store" \
  "Omnia hunk (G2): sign-out must finish wiping the IndexedDB metadata store"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/__tests__/useRedeemSsoExchangeToken.test.ts" \
  "OMNIA-CUSTOM: trusted sibling redirect after the exchange (omniaagent.com" \
  "Omnia hunk (G2): trusted sibling redirect after the exchange (omniaagent.com dashboard)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/__tests__/useVerifyLogin.test.ts" \
  "OMNIA-CUSTOM: trusted sibling redirect after /verify (omniaagent.com dashb" \
  "Omnia hunk (G2): trusted sibling redirect after /verify (omniaagent.com dashboard)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/__tests__/useSignInWithGoogle.test.ts" \
  "OMNIA-CUSTOM: trusted sibling URL (omniaagent.com dashboard)" \
  "Omnia hunk (G2): trusted sibling URL (omniaagent.com dashboard)"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/__tests__/useSignInWithMicrosoft.test.ts" \
  "OMNIA-CUSTOM: trusted sibling URL (omniaagent.com dashboard)" \
  "Omnia hunk (G2): trusted sibling URL (omniaagent.com dashboard)"

echo ""
echo "--- Front bootstrap (i18n activation) ---"
check_file_contains \
  "packages/twenty-front/src/index.tsx" \
  "import '~/utils/i18n/initialI18nActivate';" \
  "index.tsx must import initialI18nActivate first so module-scope i18n._() calls (PasswordReset zod schema) never throw before activation"
check_file_contains \
  "packages/twenty-front/src/index.tsx" \
  "disableFragmentWarnings();" \
  "index.tsx must keep disableFragmentWarnings() from @apollo/client"
check_file_contains \
  "packages/twenty-front/src/utils/i18n/initialI18nActivate.ts" \
  "i18n.activate(SOURCE_LOCALE);" \
  "initialI18nActivate.ts must activate English synchronously at module evaluation"

echo ""
echo "--- AudioLink (call recordings) ---"
check_file_exists \
  "packages/twenty-front/src/modules/ui/navigation/link/components/AudioLink/AudioLink.tsx" \
  "AudioLink component for call recording playback (moved from twenty-ui into twenty-front in the v2.58 merge)"
check_file_contains \
  "packages/twenty-front/src/modules/ui/navigation/link/components/AudioLink/AudioLink.tsx" \
  "getSafeUrl(src)" \
  "AudioLink must pass the recording URL through getSafeUrl and render nothing when it is unsafe"
check_file_contains \
  "packages/twenty-front/src/modules/ui/navigation/link/components/AudioLink/AudioLink.tsx" \
  'preload="none"' \
  "AudioLink must not fetch call recordings (PHI) until the user presses play"
check_file_contains \
  "packages/twenty-front/src/modules/ui/navigation/link/components/AudioLink/AudioLink.tsx" \
  "event.stopPropagation();" \
  "AudioLink clicks must not open the parent table cell"
check_file_not_contains \
  "packages/twenty-front/src/modules/ui/navigation/link/components/AudioLink/AudioLink.tsx" \
  "@ui/" \
  "AudioLink must use public twenty-ui subpaths, never twenty-ui internals"
check_file_not_exists \
  "packages/twenty-ui/src/navigation" \
  "twenty-ui has no navigation/ folder in v2.58; AudioLink lives in twenty-front"
check_file_exists \
  "packages/twenty-front/src/modules/ui/navigation/link/components/AudioLink/__tests__/AudioLink.test.tsx" \
  "Omnia test from the v2.58 merge (G2): AudioLink.test.tsx"

echo ""
echo "--- Apollo provider (upstream-native guards) ---"
check_file_not_contains \
  "packages/twenty-front/src/modules/apollo/components/ApolloProvider.tsx" \
  "useApolloClientCachePersist" \
  "ApolloProvider must NOT use cache persist (render-blocking, no timeout)"
check_file_not_contains \
  "packages/twenty-front/src/modules/apollo/components/ApolloProvider.tsx" \
  "connectToDevTools: true" \
  "connectToDevTools must not be hardcoded true (wastes memory in production)"
check_file_not_contains \
  "packages/twenty-front/package.json" \
  "apollo3-cache-persist" \
  "apollo3-cache-persist dependency must be removed (dead code after ApolloProvider fix)"

# ======================================================================
# Front: table views, relation sub-field columns and filters
# ======================================================================
echo ""
echo "=== Front: table views, relation sub-field columns and filters ==="

echo ""
echo "--- Relation sub-field columns: foundations (C6) ---"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/types/RelationSubFieldMetadata.ts" \
  "Field metadata type of a relation sub-field column definition"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/utils/getRecordFieldColumnKey.ts" \
  "Column key for React keys, dnd-kit ids and dropdown ids; sub-field columns share fieldMetadataItemId with their relation"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/utils/__tests__/getRecordFieldColumnKey.test.ts" \
  "Test for the relation sub-field column key"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/utils/isRelationSubFieldDefinition.ts" \
  "Type guard for sub-field column definitions (replaces metadata casts)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/utils/__tests__/isRelationSubFieldDefinition.test.ts" \
  "Test for the sub-field definition guard"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/utils/getRelationSubFieldMetadataItem.ts" \
  "Resolves a sub-field on the relation target from readableFields (active only)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/utils/__tests__/getRelationSubFieldMetadataItem.test.ts" \
  "Test for the sub-field resolver (unknown target, missing, inactive, unreadable)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/utils/getRelationSubFieldMetadataItem.ts" \
  "readableFields" \
  "Sub-field columns must resolve the target field from readableFields only, so an unreadable field (PHI) gets no label or cell"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/utils/buildRelationSubFieldDefinition.ts" \
  "Builds the read-only field definition of a sub-field column (replaces buildRelationSubFieldColumnDefinition)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/utils/__tests__/buildRelationSubFieldDefinition.test.ts" \
  "Test for the sub-field definition builder"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/utils/buildRelationSubFieldDefinition.ts" \
  "getRelationSubFieldMetadataItem" \
  "Sub-field definitions must go through the readable-field resolver"
check_file_exists \
  "packages/twenty-front/src/modules/views/utils/getRelationSubFieldColumnLabel.ts" \
  "One 'Relation / Sub-field' label for the header, field lists and picker (matches export headers)"
check_file_exists \
  "packages/twenty-front/src/modules/views/utils/__tests__/getRelationSubFieldColumnLabel.test.ts" \
  "Test for the sub-field column label"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/useUpdateRecordField.ts" \
  "subFieldName" \
  "updateRecordField must match the record field id first and fall back to the plain column only"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/useUpdateRecordField.ts" \
  '!isDefined(existingRecordField.subFieldName)' \
  "A field-id caller (board, widget settings) must never update a sub-field column"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/__tests__/useUpdateRecordField.test.tsx" \
  "Test for id-first record field updates and the plain-column fallback"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/useMoveRecordField.ts" \
  "recordFieldIdToMove" \
  "Column moves must go by record field id, or moving 'Lead / DOB' moves 'Lead'"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/useMoveRecordField.ts" \
  "updateRecordField(currentRecordField.id" \
  "Column moves must update local state by record field id"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/useReorderVisibleRecordFields.ts" \
  "updateRecordField(recordFieldToMove.id" \
  "Header drag reorder must update the dragged record field by id"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/useChangeRecordFieldVisibility.ts" \
  "subFieldName" \
  "Show/hide must target the (field, sub-field) pair"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/useChangeRecordFieldVisibility.ts" \
  "updateRecordField(correspondingRecordField.id" \
  "Hiding 'Lead / DOB' must not hide 'Lead' locally"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/hooks/useMoveTableColumn.ts" \
  "recordFieldIdToMove" \
  "Header move left/right must pass the record field id"
check_file_contains \
  "packages/twenty-front/src/modules/views/utils/__tests__/viewMapFunctions.test.ts" \
  "OMNIA-CUSTOM: relation sub-field columns (contract C6)" \
  "Omnia hunk (G2): relation sub-field columns (contract C6)"

echo ""
echo "--- Relation sub-field columns: view-field plumbing and codegen ---"
check_file_contains \
  "packages/twenty-front/src/modules/views/types/ViewField.ts" \
  "subFieldName?: string | null;" \
  "Front ViewField type must carry subFieldName for relation sub-field columns"
check_file_not_contains \
  "packages/twenty-front/src/modules/views/graphql/fragments/viewFieldFragment.ts" \
  "isOverridden" \
  "ViewField fragment must not request the deprecated isOverridden"
check_file_contains \
  "packages/twenty-front/src/modules/views/utils/mapViewFieldToRecordField.ts" \
  "subFieldName: viewField.subFieldName" \
  "View field to record field mapping must keep subFieldName"
check_file_contains \
  "packages/twenty-front/src/modules/views/utils/mapRecordFieldToViewField.ts" \
  "subFieldName: recordField.subFieldName" \
  "Record field to view field mapping must keep subFieldName (saves match on the pair)"
check_file_contains \
  "packages/twenty-front/src/modules/views/hooks/useSaveCurrentViewFields.ts" \
  "subFieldName: viewFieldToCreateOrUpdate.subFieldName" \
  "Saving view fields must create sub-field columns with their subFieldName"
check_file_contains \
  "packages/twenty-front/src/modules/views/hooks/useSaveCurrentViewFields.ts" \
  "(currentViewField.subFieldName ?? undefined) ===" \
  "Saving view fields must match existing view fields on (fieldMetadataId, subFieldName)"
check_file_contains \
  "packages/twenty-front/src/modules/views/hooks/useCreateViewFromCurrentView.ts" \
  "subFieldName: viewField.subFieldName ?? undefined" \
  "Duplicating a view must copy subFieldName (otherwise the server rejects duplicate view fields)"
check_file_exists \
  "packages/twenty-front/src/modules/views/hooks/__tests__/useCreateViewFromCurrentView.test.tsx" \
  "Regression test: view duplication keeps relation sub-field columns"
check_file_contains \
  "packages/twenty-front/src/generated-metadata/schema.ts" \
  "subFieldName?: InputMaybe<Scalars['String']['input']>;" \
  "Generated metadata inputs must accept subFieldName"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/graphql/mutations.ts" \
  "requiredCondition" \
  "createOneField and updateOneField must select requiredCondition, or a saved Required rule stays stale in the metadata store until reload"
check_file_contains \
  "packages/twenty-front/src/generated-metadata/graphql.ts" \
  '{"kind":"Field","name":{"kind":"Name","value":"isSearchable"}},{"kind":"Field","name":{"kind":"Name","value":"requiredCondition"}},{"kind":"Field","name":{"kind":"Name","value":"isNullable"}}' \
  "Generated create/update field mutation documents must select requiredCondition (rerun codegen after editing object-metadata/graphql/mutations.ts)"
check_file_contains \
  "packages/twenty-front/src/pages/settings/data-model/__stories__/SettingsObjectNewField/SettingsObjectNewFieldConfigure.stories.tsx" \
  "variables.input.field.requiredCondition ?? null" \
  "New-field story mock must return requiredCondition (createOneField selects it)"
check_file_contains \
  "packages/twenty-front/src/generated-metadata/graphql.ts" \
  "export type ViewFieldFragmentFragment = { __typename: 'ViewField', id: string, fieldMetadataId: string, viewId: string, isVisible: boolean, position: number, size: number, aggregateOperation: Types.AggregateOperations | null, viewFieldGroupId: string | null, subFieldName: string | null, isActive: boolean" \
  "Generated metadata ViewField fragment type must include subFieldName"
check_file_contains \
  "packages/twenty-front/src/generated-metadata/graphql.ts" \
  '{"kind":"Field","name":{"kind":"Name","value":"viewFieldGroupId"}},{"kind":"Field","name":{"kind":"Name","value":"subFieldName"}},{"kind":"Field","name":{"kind":"Name","value":"isActive"}}' \
  "Generated metadata ViewField GraphQL documents must request subFieldName"
check_type_block_contains \
  "packages/twenty-front/src/generated-metadata/schema.ts" \
  "export type CreateViewFieldInput = {" \
  "  subFieldName?: InputMaybe<Scalars['String']['input']>;" \
  "Generated CreateViewFieldInput must accept subFieldName (relation sub-field columns)"

echo ""
echo "--- Relation sub-field columns: record index data ---"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/graphql/record-gql-fields/utils/mergeRelationSubFieldsIntoRecordGqlFields.ts" \
  "Merges relation sub-field columns (\"Lead / Date of Birth\") into the relation's GraphQL selection"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/graphql/record-gql-fields/utils/__tests__/mergeRelationSubFieldsIntoRecordGqlFields.test.ts" \
  "Test for the sub-field GraphQL expansion (identifiers + join column, unreadable fields dropped)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/graphql/record-gql-fields/utils/mergeRelationSubFieldsIntoRecordGqlFields.ts" \
  "getRelationSubFieldMetadataItem" \
  "Sub-field GraphQL expansion must resolve sub-fields from readableFields only (PHI)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/hooks/useRelevantRecordsGqlFields.ts" \
  "mergeRelationSubFieldsIntoRecordGqlFields" \
  "Record index query must fetch relation sub-field columns inside their relation selection"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexContainer.tsx" \
  "ReconciliationCarrierPickerModal" \
  "Reconciliation index must mount the carrier picker step of the run wizard"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/types/FieldMetadataItem.ts" \
  "requiredCondition?: RequiredCondition | null" \
  "FieldMetadataItem must type requiredCondition with the shared RequiredCondition, not the any JSON scalar"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition.ts" \
  "requiredCondition: field.requiredCondition ?? null" \
  "Field definitions must carry requiredCondition for the required indicators and creation form"

echo ""
echo "--- Relation sub-field columns: table header ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHead.tsx" \
  "subFieldName" \
  "Sub-field column headers must read 'Relation / Sub-field' with the sub-field's icon and description"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHead.tsx" \
  "getRelationSubFieldMetadataItem" \
  "Header must resolve the sub-field from readableFields only, so an unreadable field (PHI) shows no label or description"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/__tests__/RecordTableColumnHead.test.tsx" \
  "Test for the sub-field header label, description and the unreadable-field fallback"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHeadDropdownMenu.tsx" \
  "moveTableColumn('left', recordField.id)" \
  "Header Move left/right must go by record field id, or moving 'Lead / DOB' moves 'Lead'"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHeadDropdownMenu.tsx" \
  'recordField.id !== secondVisibleRecordField?.id' \
  "Header move guards must compare record field ids; a sub-field column shares fieldMetadataItemId with its relation"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHeadDropdownMenu.tsx" \
  "subFieldName: recordField.subFieldName" \
  "Header Hide must hide the (field, sub-field) pair, not the relation column"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHeadDropdownMenu.tsx" \
  "isRelationSubFieldColumn" \
  "Filter and Sort must stay off for sub-field columns (they would act on the relation)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableColumnHeadWithDropdown.tsx" \
  "getRecordFieldColumnKey" \
  "Header dropdown id must be per column, or a relation and its sub-field columns open together"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderDnd.tsx" \
  "id={getRecordFieldColumnKey(recordField)}" \
  "Header dnd-kit sortable ids must be unique per column; a duplicate id breaks dragging a relation or its sub-field column"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderDnd.tsx" \
  "<React.Fragment key={getRecordFieldColumnKey(recordField)}>" \
  "Header column fragments must be keyed by column key"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderCell.tsx" \
  "getRecordFieldColumnKey" \
  "Header cell key must be the column key"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-footer/components/RecordTableAggregateFooter.tsx" \
  "getRecordFieldColumnKey" \
  "Footer cells are siblings keyed per column; a relation and its sub-field columns must not share a key"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderResizeHandler.tsx" \
  "getRecordFieldColumnKey" \
  "Resize state must hold the column key, or resizing 'Lead / DOB' resizes 'Lead'"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/hooks/useResizeTableHeader.ts" \
  "getRecordFieldColumnKey(visibleRecordField) === resizedFieldMetadataId" \
  "Resize hook must find the resized column by column key"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/hooks/useResizeTableHeader.ts" \
  "updateRecordField(recordField.id" \
  "Resize must update the resized record field by id (a sub-field column key is not a record field id)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-header/components/RecordTableHeaderPlusButtonContent.tsx" \
  '!isDefined(recordField.subFieldName)' \
  "Header '+' must still offer a relation column while only its sub-field columns are visible"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/virtualization/components/RecordTableColumnVirtualizationEffect.tsx" \
  "getRecordFieldColumnKey(recordField) === resizedFieldMetadataId" \
  "Column virtualization must apply the live resize offset to the resized column only (resize state holds the column key)"

echo ""
echo "--- Table performance (memoized contexts, scroll effect, no-cache fetches) ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/components/RecordTableScrollAndZIndexEffect.tsx" \
  "passive: true" \
  "Scroll listener stays passive and attached once (mobile Safari momentum-scroll crash loop)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextGeneric.tsx" \
  "buildRelationSubFieldDefinition" \
  "Sub-field columns must render the relation target's field through buildRelationSubFieldDefinition"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextGeneric.tsx" \
  "relationSubFieldDefinition ?? fieldDefinition" \
  "Permission and junction checks must run on the base relation; the sub-field definition only replaces the displayed one"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextGeneric.tsx" \
  "relationSubFieldDefinition === null" \
  "A sub-field the role cannot read must show Not shared"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/__tests__/RecordTableCellFieldContextGeneric.test.tsx" \
  "Test: sub-field cell is read-only, Not shared on unreadable target/sub-field/restricted relation, memoized value"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextLabelIdentifier.tsx" \
  "useCallback" \
  "Label identifier chip click must be memoized (it is part of the memoized FieldContext value)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/hooks/useRecordIndexTableLazyQuery.ts" \
  "fetchPolicy: 'no-cache'" \
  "Initial table fetch must use no-cache (the table reads from Jotai; Apollo 4's InMemoryCache never evicts on its own)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextGeneric.tsx" \
  "useMemo" \
  "FieldContext value must be memoized (rendered per cell, O(rows × fields))"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextLabelIdentifier.tsx" \
  "useMemo" \
  "Label identifier FieldContext value must be memoized"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/components/RecordTableScrollAndZIndexEffect.tsx" \
  "store.get" \
  "Scroll handler must use store.get/store.set (not reactive hooks) to avoid listener teardown loop on mobile"

echo ""
echo "--- Relation sub-field columns: table cells ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellEditButton.tsx" \
  "RecordTableRelationSubFieldCellButtons" \
  "Sub-field cells must show the related record's buttons instead of the edit button"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableRelationSubFieldCellButtons.tsx" \
  "Hover buttons of a sub-field cell (open related record, copy/call/mail on the related record)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableRelationSubFieldCellButtons.tsx" \
  "useResolveOpenRecordIn" \
  "Open related record must follow 'Choose where records open' like RecordChip"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableRelationSubFieldCellButtons.tsx" \
  "isForbidden === true" \
  "A Not shared sub-field cell must get no buttons"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/__tests__/RecordTableRelationSubFieldCellButtons.test.tsx" \
  "Test: open in side panel / record page, copy reads the related record, no buttons when empty or Not shared"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellHoveredPortalContent.tsx" \
  "subFieldName" \
  "Read-only sub-field cells must keep their hover buttons"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellWrapper.tsx" \
  "getRecordFieldColumnKey" \
  "Cell context key must tell sub-field columns apart from their relation"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-row/components/RecordTableFieldsCells.tsx" \
  "getRecordFieldColumnKey" \
  "Row cells must be keyed by column key (sub-field columns share fieldMetadataItemId)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-row/components/RecordTableFieldsCellsLoading.tsx" \
  "getRecordFieldColumnKey" \
  "Loading cells must be keyed by column key (sub-field columns share fieldMetadataItemId)"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-row/components/RecordTableFieldsCells.tsx" \
  "key={recordField.id}" \
  "Never key cells by record field id: view-field ids differ per view, so cells would remount on every view switch"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-row/hooks/useGetRecordTableRowIndex.ts" \
  "useCallback" \
  "getRecordTableRowIndex must be stable, or the label identifier FieldContext changes on every render"

echo ""
echo "--- Relation sub-field columns: column picker and view bar ---"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/components/ObjectOptionsDropdownRelationSubFieldsContent.tsx" \
  "Options dropdown page that adds a relation's target fields as sub-field columns"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/states/objectOptionsDropdownExpandedRelationFieldIdComponentState.ts" \
  "Relation whose target fields the relationSubFields page lists"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/components/ObjectOptionsDropdownRelationSubFieldsContent.tsx" \
  "isOneToManyBackReferenceSubField" \
  "Column picker must not offer ONE_TO_MANY back-references to the view's own object"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/components/ObjectOptionsDropdownRelationSubFieldsContent.tsx" \
  "targetObjectMetadataItem?.readableFields" \
  "Column picker must offer only target fields the role can read (field-level permissions, PHI)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/types/ObjectOptionsContentId.ts" \
  "'relationSubFields'" \
  "Options dropdown content ids must include the relation sub-field page"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/components/ObjectOptionsDropdownContent.tsx" \
  "ObjectOptionsDropdownRelationSubFieldsContent" \
  "Options dropdown must render the relation sub-field page"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsHiddenDropdownSection.tsx" \
  "relationSubFields" \
  "Hidden fields page must open the relation sub-field page"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsHiddenDropdownSection.tsx" \
  "viewType === ViewType.TABLE" \
  "Sub-field columns are offered on table views only: board, calendar and list cards cannot render them"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsHiddenDropdownSection.tsx" \
  '!isDefined(recordFieldToFilter.subFieldName)' \
  "Only a plain column takes a field off the hidden list (a sub-field column shares its relation's field id)"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsVisibleDropdownSection.tsx" \
  "getRecordFieldColumnKey" \
  "Visible fields list must key rows and dnd ids by column key (sub-field columns share fieldMetadataItemId)"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsVisibleDropdownSection.tsx" \
  "getRelationSubFieldColumnLabel" \
  "Visible fields list must label sub-field columns 'Relation / Sub-field' like the header"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsVisibleDropdownSection.tsx" \
  "subFieldName: recordField.subFieldName" \
  "Hiding a sub-field column must target its (field, sub-field) pair, also on board views"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsVisibleDropdownSection.tsx" \
  "? processOptionDropdownDragEnd" \
  "Reordering a sub-field column must go through the record-field hook, never the board handler (field-id lookup)"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewBarFilterDropdown.tsx" \
  "useAvailableComponentInstanceIdOrThrow(" \
  "Upstream dependency: each filter bar's dropdown id comes from ObjectFilterDropdownComponentInstanceContext (the reconciliation page runs two filter bars)"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsSearchDropdownSection.tsx" \
  '.filter((recordField) => !isDefined(recordField.subFieldName))' \
  "Field search must count only plain columns as visible, or a relation shown only as 'Lead / DOB' cannot be shown or hidden from search"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard.ts" \
  '!isDefined(recordFieldToFind.subFieldName)' \
  "Board options must toggle the plain relation column, never a sub-field column kept from a table view"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/components/__tests__/RelationSubFieldPicker.test.tsx" \
  "Tests for the relation sub-field picker (readable fields only, table views only, pair-based show/hide, field search)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/hooks/__tests__/useObjectOptionsForBoard.test.tsx" \
  "Test that board options toggle the plain relation column when a sub-field column shares its field id"
check_file_contains \
  "packages/twenty-front/src/modules/views/utils/mapViewFieldsToColumnDefinitions.ts" \
  "isNonEmptyString(viewField.subFieldName)" \
  "mapViewFieldsToColumnDefinitions must skip sub-field ViewFields (table-only; keeps them out of Kanban options)"
check_file_contains \
  "packages/twenty-front/src/modules/views/graphql/fragments/viewFieldFragment.ts" \
  "subFieldName" \
  "ViewField GraphQL fragment must request subFieldName"
check_file_exists \
  "packages/twenty-front/src/modules/views/utils/isOneToManyBackReferenceSubField.ts" \
  "Shared back-reference predicate for picker + export"
check_file_exists \
  "packages/twenty-front/src/modules/views/utils/__tests__/isOneToManyBackReferenceSubField.test.ts" \
  "Test for the back-reference predicate"

echo ""
echo "--- Filters outside a record index (reconciliation review page) ---"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewBarFilterDropdownAdvancedFilterButton.tsx" \
  "ViewBarFilterDropdownAdvancedFilterButtonInner" \
  "Advanced filter button must render nothing without a current view (reconciliation review page); upstream throws"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-filter-dropdown/hooks/useOptionsForSelect.ts" \
  "useRecordIndexContextOrThrow" \
  "useOptionsForSelect must read object metadata from RecordIndexContext, not the URL (reconciliation review page)"

echo ""
echo "--- One-to-many relation filters on upstream relation traversal (ftv U17-U19, U23) ---"
check_file_exists \
  "packages/twenty-front/src/modules/object-metadata/utils/getOneToManyRelationFilterFieldMetadataItems.ts" \
  "Advanced-filter-only list of one-to-many relations whose target object the role can read"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/utils/getOneToManyRelationFilterFieldMetadataItems.ts" \
  "operationType: 'read'" \
  "One-to-many filter relations must require read access to the target object"
check_file_exists \
  "packages/twenty-front/src/modules/object-metadata/utils/__tests__/getOneToManyRelationFilterFieldMetadataItems.test.ts" \
  "Spec: one-to-many only, target read access (all records or a row-level rule), inactive/unreadable fields dropped"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterOneToManyEmptinessItems.tsx" \
  "Has any / Has no items of the one-to-many relation page"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterOneToManyEmptinessItems.tsx" \
  "RecordFilterOperand.IS_NOT_EMPTY" \
  "Has any must save IS_NOT_EMPTY on the relation itself (no subFieldName, no relation target)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterFieldSelectMenu.tsx" \
  "getOneToManyRelationFilterFieldMetadataItems" \
  "Advanced filter field menu must offer one-to-many relations (advanced filter only)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/utils/getAdvancedFilterFieldSubPage.ts" \
  "isOneToManyRelationField(fieldMetadataItem)" \
  "One-to-many relations must open the relation-target page"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterRelationTargetFieldSelectMenu.tsx" \
  "isOneToManyRelationField(sourceFieldMetadataItem)" \
  "Relation-target page must accept one-to-many sources"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterRelationTargetFieldSelectMenu.tsx" \
  "AdvancedFilterOneToManyEmptinessItems" \
  "Relation-target page must offer has any / has no for one-to-many sources"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/hooks/useApplyAdvancedFilterSourceField.ts" \
  "operand?: RecordFilterOperand;" \
  "Has any / has no pass their operand to the source-field hook"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/hooks/useApplyAdvancedFilterSourceField.ts" \
  "relationType: sourceFieldMetadataItem.relation?.type" \
  "Source-field default operand must stay getDefaultAdvancedFilterOperand (IS_RELATIVE dates) and know the relation type"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-filter/utils/getRecordFilterOperands.ts" \
  "relationType === RelationType.ONE_TO_MANY" \
  "One-to-many relations without a target field only offer IS_EMPTY / IS_NOT_EMPTY"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/utils/getDefaultAdvancedFilterOperand.ts" \
  "relationType?: RelationType | null;" \
  "Default advanced filter operand must pass the relation type through"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/components/AdvancedFilterRecordFilterOperandSelect.tsx" \
  "relationType: effectiveFieldMetadataItem?.relation?.type" \
  "Advanced filter operand select must restrict a one-to-many relation without a target to emptiness"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/side-panel/components/AdvancedFilterSidePanelRecordFilterOperandSelect.tsx" \
  "relationType: effectiveFieldMetadataItem?.relation?.type" \
  "Side-panel operand select (workflows, charts, table widgets) must restrict a one-to-many relation without a target to emptiness"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-filter-dropdown/components/ObjectFilterDropdownInnerSelectOperandDropdown.tsx" \
  "relationType: effectiveFieldMetadataItem.relation?.type" \
  "Inner operand dropdown must use the effective (target) field's relation type, not the source's"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/hooks/useSetAdvancedFilterDropdownAllRowsStates.ts" \
  "relationTargetFieldMetadataIdUsedInDropdownComponentState" \
  "Advanced filter rows must restore their relation target when the dropdown opens (value pickers target the right object)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-filter-dropdown/utils/configurableViewFilterOperands.ts" \
  "ViewFilterOperand.IS_NOT_RELATIVE" \
  "IS_NOT_RELATIVE takes a value input like IS_RELATIVE (workflow-only operand)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-filter-dropdown/utils/getOperandLabel.ts" \
  "case ViewFilterOperand.IS_NOT_RELATIVE:" \
  "IS_NOT_RELATIVE needs its long and short operand labels"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-metadata/utils/isFieldMetadataItemFilterable.ts" \
  "ONE_TO_MANY" \
  "Shared filterable list stays many-to-one: it feeds the RLS predicate builder, whose field picker ignores relation direction"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-metadata/states/availableFieldMetadataItemsForFilterFamilySelector.ts" \
  "getOneToManyRelationFilterFieldMetadataItems" \
  "One-to-many filter relations stay out of the shared filterable selector (RLS predicate builder reads it)"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionFieldSelectFieldMenu.tsx" \
  "getOneToManyRelationFilterFieldMetadataItems" \
  "RLS predicate field picker must never offer one-to-many relations"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/record-filter/hooks/useFilterableFieldMetadataItemsInRecordIndexContext.ts" \
  "getOneToManyRelationFilterFieldMetadataItems" \
  "Simple view-bar one-to-many chips are Phase 2 (not ported); remove this guard when Phase 2 lands"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-filter/utils/__tests__/isRecordMatchingFilterOneToManyRelation.test.ts" \
  "Spec: client matcher reads the canonical has any / has no shapes; legacy subFieldName filters are dropped"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/advanced-filter/components/__tests__/AdvancedFilterFieldSelectDropdownButton.test.tsx" \
  "Spec: has any / has no / target field flow; never writes a target field name into subFieldName"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/advanced-filter/components/__tests__/AdvancedFilterRecordFilterOperandSelect.test.tsx" \
  "Spec: emptiness-only operands, legacy rows render, traversal keeps target operands"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/advanced-filter/side-panel/components/__tests__/AdvancedFilterSidePanelRecordFilterOperandSelect.test.tsx" \
  "Spec: the same for workflow / chart / table-widget filters, including legacy workflow rows"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/advanced-filter/hooks/__tests__/useSetAdvancedFilterDropdownAllRowsStates.test.tsx" \
  "Spec: relation target restored per row; legacy rows open without one"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/advanced-filter/utils/__tests__/getAdvancedFilterFieldSubPage.test.ts" \
  "Spec: one-to-many relations open the relation-target page"
check_file_exists \
  "packages/twenty-front/src/modules/views/hooks/__tests__/useSetEditableFilterChipDropdownStates.test.tsx" \
  "Spec: legacy one-to-many chips open without their field; traversal chips keep their target"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-filter/utils/__tests__/getRecordFilterOperands.test.ts" \
  "relationType: RelationType.ONE_TO_MANY" \
  "Operand spec must cover one-to-many relations and legacy subFieldName rows"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/advanced-filter/utils/__tests__/getDefaultAdvancedFilterOperand.test.ts" \
  "relationType: RelationType.ONE_TO_MANY" \
  "Default operand spec must cover one-to-many relations"

echo ""
echo "--- Table aggregate footer ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-footer/components/RecordTableColumnAggregateFooterWithDropdown.tsx" \
  "viewFieldId}-footer" \
  "Footer aggregate dropdown id must be per column (view field id), or a relation and its sub-field column open together"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-footer/types/RecordTableColumnAggregateFooterDropdownContextValue.ts" \
  "viewFieldId: string" \
  "Footer aggregate dropdown context must carry the column's own view field id"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-footer/hooks/useViewFieldAggregateOperation.tsx" \
  "findById(viewFieldId)" \
  "Footer aggregate must be saved on the column's own view field; by fieldMetadataId a sub-field column writes to its relation column"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-footer/components/RecordTableAggregateFooterCell.tsx" \
  "visibleRecordFields.find(findById(viewFieldId))" \
  "Footer cell must resolve its own record field, not the first column on the same relation"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-footer/components/RecordTableAggregateFooterCell.tsx" \
  "viewFieldId}-footer-readonly" \
  "Read-only footer id must be per column"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-footer/components/__tests__/RecordTableColumnAggregateFooterWithDropdown.test.tsx" \
  "Test that footer menus open per column and save the aggregate on the column's own view field"

echo ""
echo "--- Relation sub-field columns: cards and lists stay table-only ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-board/record-board-card/components/RecordBoardCardBody.tsx" \
  "isDefined(recordField.subFieldName)" \
  "Board cards must skip table-only sub-field columns, or each one renders its relation again"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-board/record-board-card/components/__tests__/RecordBoardCardBody.test.tsx" \
  "Test that board cards skip sub-field columns and keep hover positions aligned with useRecordBoardCardMetadataFromPosition"

echo ""
echo "--- Field metadata requiredCondition plumbing (C5) ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/utils/formatFieldMetadataItemInput.ts" \
  "requiredCondition" \
  "Field metadata input must include requiredCondition in payload"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/graphql/fragment.ts" \
  "requiredCondition" \
  "GraphQL fragment must include requiredCondition"

# ======================================================================
# Front: record pages, fields, pickers, timeline and reconciliation review
# ======================================================================
echo ""
echo "=== Front: record pages, fields, pickers, timeline and reconciliation review ==="

echo ""
echo "--- Reconciliation inline diff overlay ---"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx" \
  "promotePrimaryPhoneToAdditional" \
  "Inline diff Accept must promote old primary phone/email to additional* (reconciliation review page)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx" \
  "fieldDiff.note" \
  "Inline diff must render note as a tooltip over the diff display (reconciliation review page)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx" \
  'fieldDiff.oldValue !== fieldDiff.newValue' \
  "Inline diff must render and allow Accept/Undo when either side of the diff is null"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx" \
  "normalizeDiffComparableValue" \
  "Inline diff accepted-state comparison must treat null/undefined/empty strings consistently"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx" \
  "coerceFieldDiffValueForRecordUpdate" \
  "Inline diff Accept/Undo must coerce numeric diff strings before record updates"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx" \
  "color: #fff" \
  "Inline diff accept button must use theme colors, not hardcoded white"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellContainer.tsx" \
  "ReconciliationInlineCellDiffValue" \
  "Inline cell value slot must branch to the reconciliation diff overlay (reconciliation review page)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellContainer.tsx" \
  "useReconciliationFieldDiff" \
  "Inline cell must read its reconciliation diff through the context-only hook (no per-cell store subscriptions)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useReconciliationFieldDiff.ts" \
  "isForbidden === true" \
  "Reconciliation diff overlay must never render over a field the reader cannot see (PHI)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx" \
  "disabled={isRecordFieldReadOnly}" \
  "Inline diff Accept/Undo must be disabled when the reader cannot edit the field"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/types/FieldDiffOverlay.ts" \
  "note?: string | null" \
  "FieldDiffOverlay must carry note for per-field diff explanations (reconciliation status-change reason)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/utils/getFieldDiffOverlay.ts" \
  "fieldDiff.bobValue === fieldDiff.crmValue" \
  "Diff overlay mapping must only drop no-op diffs, never diffs whose proposed value is null"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/utils/getFieldDiffOverlay.ts" \
  "bobValue === null" \
  "Diff overlay mapping must keep diffs that clear a field (null proposal)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/utils/getFieldDiffOverlay.ts" \
  "fieldDiff.action === 'INFO_ONLY'" \
  "Inline review must never offer Accept on INFO_ONLY diffs (server never writes them)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/utils/getRelationScopedFieldDiffs.ts" \
  "startsWith(relationPathPrefix)" \
  "Relation diff scope must keep only <relation>.* diffs and strip the prefix"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRelationDiffsScope.tsx" \
  "getRelationScopedFieldDiffs" \
  "Expanded related record must see its own diffs re-rooted (lead.phones.* -> phones.*)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRelationNameDiffChip.tsx" \
  "restrictedFieldNames.includes('name')" \
  "Relation name-diff chip must fall back to the plain chip when the reader cannot see the name (PHI)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem.tsx" \
  "ReconciliationRelationNameDiffChip" \
  "Relation chip must render the reconciliation name-diff chip (old -> new, Accept/Undo) on the review page"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem.tsx" \
  "ReconciliationRelationDiffsScope" \
  "Expanded related record must be wrapped in the reconciliation relation diff scope"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem.tsx" \
  "IconTrash" \
  "Relation chip menu Delete item must stay removed — deletion happens from the object's own page"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem.tsx" \
  "useDeleteOneRecord" \
  "Relation chip must not wire a delete of the related record (Detach only)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/types/FieldDiffOverlay.ts" \
  "Reconciliation inline diff overlay type (moved out of FieldContext)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/hooks/useReconciliationFieldDiff.ts" \
  "Context-only hook giving each inline cell its reconciliation diff"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationInlineCellDiffValue.tsx" \
  "Inline diff value (old -> new, Accept/Undo, highlight, note tooltip)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRelationNameDiffChip.tsx" \
  "Relation chip with name diff and Accept/Undo (reconciliation review)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRelationDiffsScope.tsx" \
  "Re-provides ReconciliationDiffsContext with one relation's diffs, prefix stripped"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/getFieldDiffOverlay.ts" \
  "FieldDiff -> FieldDiffOverlay mapping (moved out of RecordFieldList)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/getRelationScopedFieldDiffs.ts" \
  "Relation-scoped diff helper"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/normalizeDiffComparableValue.ts" \
  "Null-safe diff comparison helper (moved out of RecordInlineCellContainer)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/contexts/ReconciliationDiffsContext.ts" \
  "Reconciliation diffs context (contract with the review page)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/__tests__/getFieldDiffOverlay.test.ts" \
  "Spec for composite matching, no-op skip and null proposals"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/__tests__/getRelationScopedFieldDiffs.test.ts" \
  "Spec for relation diff scoping"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/__tests__/normalizeDiffComparableValue.test.ts" \
  "Spec for null-safe diff comparison"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/getRelationFieldNamesWithPendingDiffs.ts" \
  "Relations auto-expand while their BOB diffs are pending and collapse once resolved"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/components/__tests__/ReconciliationInlineCellDiffValue.test.tsx" \
  "Inline diff Accept/Undo payload spec: NUMBER coercion, phone/email promotion, clearing, read-only guard"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/__tests__/getRelationFieldNamesWithPendingDiffs.test.ts" \
  "Omnia test from the v2.58 merge (G2): getRelationFieldNamesWithPendingDiffs.test.ts"

echo ""
echo "--- Workflow filter: IS_NOT_RELATIVE operand ---"
check_file_contains \
  "packages/twenty-front/src/modules/workflow/workflow-steps/filters/components/WorkflowStepFilterOperandSelect.tsx" \
  "operand === ViewFilterOperand.IS_NOT_RELATIVE" \
  "Workflow filter operand select must seed a relative-date value for IS_NOT_RELATIVE like IS_RELATIVE"
check_file_contains \
  "packages/twenty-front/src/modules/workflow/workflow-steps/filters/components/WorkflowStepFilterValueInput.tsx" \
  "stepFilter.operand === ViewFilterOperand.IS_NOT_RELATIVE" \
  "Workflow filter value input must render the relative-date picker for IS_NOT_RELATIVE"

echo ""
echo "--- Import progress indicator and reconciliation wizard tests ---"
check_file_exists \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/hooks/useBackgroundJob.ts" \
  "Import progress card API (upsertJob/removeJob) used by the import poller"
check_file_exists \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/states/backgroundJobState.ts" \
  "Import progress card state (backgroundJobsState, BackgroundJobData)"
check_file_not_contains \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/components/BackgroundJobIndicator.tsx" \
  "CircularProgressBar" \
  "BackgroundJobIndicator must use twenty-ui ProgressRing (CircularProgressBar no longer exists in v2.58)"
check_file_not_contains \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/components/BackgroundJobIndicator.tsx" \
  "downloadUrl" \
  "BackgroundJobIndicator is import-only: exports use upstream RecordExport (R-EXPORT)"
check_file_not_contains \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/states/backgroundJobState.ts" \
  "downloadUrl" \
  "BackgroundJobData is import-only: no export download URL (R-EXPORT)"
check_file_contains \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/components/BackgroundJobIndicator.tsx" \
  "isRunning && isDefined(job.onCancel)" \
  "Running import cards must offer Cancel (job.onCancel calls cancelImportJob), or a running import cannot be stopped once the dialog closes"
check_file_contains \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/components/__tests__/BackgroundJobIndicator.test.tsx" \
  "should let a running job be cancelled" \
  "Indicator spec must cover the Cancel action on running cards"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/hooks/__tests__/useOpenReconciliationWizard.test.tsx" \
  "Run wizard spec: renders without reconciliation metadata (every create entry point renders it), ignores a run while configs load, stable callback"

echo ""
echo "--- Dashboard chart bucket filters ---"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/graph/utils/buildFilterFromChartBucket.ts" \
  "relationType: fieldMetadataItem.relation?.type" \
  "Chart bucket filters must pass relationType so one-to-many relations only get emptiness operands"

echo ""
echo "--- Relation picker filtering (additionalFilter, lead policy allowlist, junction bridge) ---"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerAdditionalFilterComponentState.ts" \
  "Multiple record picker shared additionalFilter state"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker.tsx" \
  "store.set(multipleRecordPickerAdditionalFilterState, additionalFilter)" \
  "MultipleRecordPicker must mirror its additionalFilter prop into the shared state (typing/load-more/create read it)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts" \
  "excludingPickedRecordsFilter = combineFilters([" \
  "Multiple record picker must narrow the unpicked-records search with the additional filter (twenty-shared combineFilters)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts" \
  "combineFilters([includeFilter, additionalFilter])" \
  "Multiple record picker must narrow the picked-records search with the additional filter"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/types/SingleRecordPickerMenuItemsWithSearchProps.ts" \
  "additionalFilter?: RecordGqlOperationFilter" \
  "Single record picker props must accept additionalFilter"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerPerformSearch.ts" \
  "additionalFilter ?? {}" \
  "Single record picker must combine additionalFilter into the records-to-select search"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-picker/hooks/__tests__/useLeadPolicyRecordPickerAdditionalFilter.test.ts" \
  "Lead policy picker allowlist tests (moved from the relation dropdown __tests__)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/__tests__/useMultipleRecordPickerPerformSearch.test.tsx" \
  "Multiple record picker additionalFilter plumbing tests"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/hooks/__tests__/useSingleRecordPickerPerformSearch.test.tsx" \
  "Single record picker additionalFilter plumbing tests"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToMany.tsx" \
  "forceAdditionalFilter: leadPolicyRecordPickerAdditionalFilter" \
  "Lead relation card policy picker must open with the allowlist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToMany.tsx" \
  "additionalFilter={leadPolicyRecordPickerAdditionalFilter}" \
  "Lead relation card policy picker must keep the allowlist across typing/load-more"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationOneToManyFieldInput.tsx" \
  "forceAdditionalFilter: leadPolicyRecordPickerAdditionalFilter" \
  "Inline/table-cell to-many picker must run its own initial search (with the lead-policy allowlist)"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/hooks/useOpenRelationFromManyFieldInput.tsx" \
  "performSearch({" \
  "useOpenRelationFromManyFieldInput must not search: paired with RelationOneToManyFieldInput's initial search (no unfiltered Lead -> Policies results)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToOne.tsx" \
  "useJunctionBridgeFilter" \
  "Policy Product picker (relation card) must use the Carrier -> Product junction bridge"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToOne.tsx" \
  "additionalFilter={junctionBridgeFilter}" \
  "Relation card to-one picker must pass the junction bridge filter to SingleRecordPicker"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useJunctionBridgeFilter.ts" \
  "Carrier -> Product junction bridge filter hook"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/utils/junction/detectJunctionBridge.ts" \
  "resolveJunctionConfig" \
  "Junction bridge detection must use the v2.58 junction resolver"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/utils/junction/__tests__/detectJunctionBridge.test.ts" \
  "Junction bridge detection tests"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/components/SingleRecordPickerMenuItemsWithSearch.tsx" \
  "// OMNIA-CUSTOM: forwarded to the search (Carrier -> Product bridge)" \
  "SingleRecordPickerMenuItemsWithSearch must forward additionalFilter to useSingleRecordPickerRecords"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerRecords.ts" \
  "additionalFilter?: RecordGqlOperationFilter" \
  "useSingleRecordPickerRecords must accept and forward additionalFilter to the search"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-picker/hooks/useFindAllRecordPages.ts" \
  "Picker id allowlists page through every find-many result (the server caps a page at QUERY_MAX_RECORDS)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-picker/hooks/__tests__/useFindAllRecordPages.test.tsx" \
  "Paging hook tests: next page, last page, cap, in-flight guard, failed page"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter.ts" \
  "useFindAllRecordPages" \
  "Lead -> Policies allowlist must page through every eligible policy, not stop at one 200-row page"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useJunctionBridgeFilter.ts" \
  "useFindAllRecordPages" \
  "Carrier -> Product allowlist must page through every junction row"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useJunctionBridgeFilter.ts" \
  "export const useJunctionBridgeFilterForRecord" \
  "Junction bridge filter must also accept a creation-form draft (Carrier -> Product in the record creation form)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/__tests__/useJunctionBridgeFilter.test.tsx" \
  "Junction bridge filter tests (stored record, index row without the parent, creation-form draft)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/form-types/components/FormSingleRecordPicker.tsx" \
  "additionalFilter={additionalFilter}" \
  "FormSingleRecordPicker must forward the Carrier -> Product allowlist to SingleRecordPicker"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/form-types/components/FormRelationToOneFieldInput.tsx" \
  "additionalFilter={additionalFilter}" \
  "FormRelationToOneFieldInput must forward additionalFilter to FormSingleRecordPicker"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/components/FormFieldInput.tsx" \
  "additionalFilter={additionalFilter}" \
  "FormFieldInput must forward additionalFilter to FormRelationToOneFieldInput"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationManyToOneFieldInput.tsx" \
  "useJunctionBridgeFilter(" \
  "Inline to-one picker (table, board, calendar, Fields widget) must use the Carrier -> Product junction bridge"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationManyToOneFieldInput.tsx" \
  "additionalFilter={junctionBridgeFilter}" \
  "Inline to-one picker must pass the junction allowlist to SingleRecordPicker"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationManyToOneFieldInput.tsx" \
  '!isDefined(junctionBridgeFilter)' \
  "Inline to-one picker must hide Add New under the junction allowlist (a new Product is not one the Carrier sells)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToOne.tsx" \
  '!isDefined(junctionBridgeFilter)' \
  "Relation card to-one picker must hide Add New under the junction allowlist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useJunctionBridgeFilter.ts" \
  'skip: !isParentMissingFromStore' \
  "Junction allowlist must fetch the parent when an index row did not load it (a view that hides Carrier)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/__tests__/RelationManyToOneFieldInput.test.tsx" \
  "Inline to-one picker tests: Carrier -> Product allowlist, no Add New under it, parent fetched for index rows"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/__tests__/RecordDetailRelationSectionDropdownToOne.test.tsx" \
  "Relation card to-one picker tests: Carrier -> Product allowlist, no Add New under it"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/components/SingleRecordPicker.tsx" \
  "additionalFilter" \
  "SingleRecordPicker must pass additionalFilter through"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker.tsx" \
  "multipleRecordPickerAdditionalFilterComponentState" \
  "MultipleRecordPicker must sync the shared additionalFilter state"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts" \
  "forceAdditionalFilter" \
  "Multiple record picker search must support forceAdditionalFilter"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter.ts" \
  "Lead policy picker allowlist helper"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter.ts" \
  "inverseFieldName === 'lead'" \
  "Lead policy picker helper must stay scoped to lead -> policy relations"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter.ts" \
  "buildIdAllowlistFilter" \
  "Lead policy picker helper must build an id allowlist filter for search"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSectionDropdownToMany.tsx" \
  "useLeadPolicyRecordPickerAdditionalFilter" \
  "Lead detail sidebar policy picker must reuse the allowlist helper"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationOneToManyFieldInput.tsx" \
  "useLeadPolicyRecordPickerAdditionalFilter" \
  "Inline/table-cell policy picker must reuse the allowlist helper"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RelationOneToManyFieldInput.tsx" \
  "additionalFilter={leadPolicyRecordPickerAdditionalFilter}" \
  "Inline/table-cell policy picker must pass the allowlist into MultipleRecordPicker"

echo ""
echo "--- Required fields (soft requiredCondition, C5) ---"
check_file_exists \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm.tsx" \
  "Required field form component"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm.tsx" \
  "type RequiredCondition } from 'twenty-shared/types'" \
  "Required form must use the shared RequiredCondition type (contract C5)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldRequiredFormSchema.ts" \
  "Required form zod schema"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldRequiredFormSchema.ts" \
  "requiredCondition" \
  "Required form schema must declare requiredCondition"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/settingsFieldFormSchema.ts" \
  "settingsDataModelFieldRequiredFormSchema" \
  "Field settings schema must include requiredCondition (zod strips unlisted keys, so Save would drop it)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/components/SettingsDataModelFieldSettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Generic field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/morph-relation/components/SettingsDataModelFieldRelationFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Relation field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/address/components/SettingsDataModelFieldAddressSettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Address field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/boolean/components/SettingsDataModelFieldBooleanSettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Boolean field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/components/text/SettingsDataModelFieldTextSettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Text field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/currency/components/SettingsDataModelFieldCurrencySettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Currency field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/date/components/SettingsDataModelFieldDateSettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Date field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/number/components/SettingsDataModelFieldNumberSettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Number field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/phones/components/SettingsDataModelFieldPhonesSettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Phones field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/select/components/SettingsDataModelFieldSelectSettingsFormCard.tsx" \
  "<SettingsDataModelFieldRequiredForm" \
  "Select field settings card must render the Required form"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/types/FieldDefinition.ts" \
  "requiredCondition?: RequiredCondition | null" \
  "FieldDefinition must carry requiredCondition typed with the shared RequiredCondition"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/types/FieldDefinition.ts" \
  "export type RequiredCondition" \
  "No local RequiredCondition copy: the type lives in twenty-shared/types (contract C5)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/utils/getRecordRequiredFieldViolations.ts" \
  "requiredCondition evaluator (creation-form bridge and record-page indicators)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/utils/__tests__/getRecordRequiredFieldViolations.test.ts" \
  "requiredCondition evaluator spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useIsFieldRequired.ts" \
  "useIsFieldRequired hook"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useIsFieldRequired.ts" \
  "getRecordRequiredFieldViolations" \
  "useIsFieldRequired must delegate the rule to the shared evaluator"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCell.tsx" \
  "showRequiredIndicator" \
  "RecordInlineCell must accept the opt-in required indicator flag"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellContext.tsx" \
  "showRequiredIndicator" \
  "RecordInlineCellContext must carry the opt-in required indicator flag"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/fields/components/FieldsWidgetFieldItem.tsx" \
  "showRequiredIndicator" \
  "Fields widget cells must opt in to the red required placeholder"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/widget-card/components/WidgetCardHeader.tsx" \
  "isRequiredEmpty" \
  "Widget card header must support the red required title"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/widget-card/components/PageLayoutWidgetCardHeader.tsx" \
  "isRequiredEmpty" \
  "Page layout widget header must compute the red required title"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/components/WidgetCardShell.tsx" \
  "isFieldWidget(widget)" \
  "WidgetCardShell must pass the FIELD widget's field to the header (red required title)"
check_file_exists \
  "packages/twenty-front/src/modules/page-layout/widgets/widget-card/hooks/useWidgetCardIsRequiredEmpty.ts" \
  "Required-empty title hook for FIELD widgets"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/widget-card/hooks/useWidgetCardIsRequiredEmpty.ts" \
  "getRecordRequiredFieldViolations" \
  "Widget title must use the shared requiredCondition evaluator"
check_file_exists \
  "packages/twenty-front/src/modules/page-layout/widgets/widget-card/hooks/__tests__/useWidgetCardIsRequiredEmpty.test.tsx" \
  "Required-empty title hook spec"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/__tests__/useIsFieldRequired.test.tsx" \
  "useIsFieldRequired spec"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/fields/hooks/useFieldsWidgetFields.ts" \
  "objectMetadataItem.readableFields" \
  "HIPAA: Fields widget must start from readableFields"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/fields/hooks/useFieldsWidgetGroups.ts" \
  "useFieldsWidgetFields(objectMetadataItem)" \
  "HIPAA: Fields widget groups must come from useFieldsWidgetFields (readableFields)"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/fields/hooks/useFieldsWidgetHiddenFields.ts" \
  "useFieldsWidgetFields(objectMetadataItem)" \
  "HIPAA: Fields widget hidden list must come from useFieldsWidgetFields (readableFields)"
check_file_exists \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/utils/settingsDataModelFieldLinksDisplayAsSchema.ts" \
  "LINKS settings schema entry for the call-recording displayAs"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldSettingsFormSchema.ts" \
  "settingsDataModelFieldLinksDisplayAsSchema," \
  "LINKS form schema must list displayAs, or zod strips it and a Settings save erases the call-recording audio player"
check_file_exists \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/__tests__/settingsDataModelFieldSettingsFormSchema.test.ts" \
  "Settings form parse keeps LINKS displayAs and the Required rule (zod strips unlisted keys)"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/validation-schemas/__tests__/settingsDataModelFieldSettingsFormSchema.test.ts" \
  "submits the Required rule" \
  "Settings form parse keeps LINKS displayAs and the Required rule (zod strips unlisted keys)"

echo ""
echo "--- Timeline relation-field diffs (upstream renderer + Omnia before label, legacy uuid rows) ---"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx" \
  "normalizeLegacyRelationDiffValue" \
  "Timeline must turn legacy bare-uuid relation diffs (prod v2.6 history rows) into { id } before the relation branch"
check_file_exists \
  "packages/twenty-front/src/modules/activities/timeline-activities/utils/normalizeLegacyRelationDiffValue.ts" \
  "Legacy bare-uuid relation diff normalizer must exist"
check_file_exists \
  "packages/twenty-front/src/modules/activities/timeline-activities/utils/__tests__/normalizeLegacyRelationDiffValue.test.ts" \
  "Legacy relation diff normalizer must keep its tests (relation-name and join-column keys)"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx" \
  "showBeforeValue" \
  "Timeline relation diffs must ask EventRelationFieldDiffValues for the struck-through previous record"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventRelationFieldDiffValues.tsx" \
  "StyledRelationBeforeValue" \
  "Relation diff values must render the previous record struck through, then the arrow"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventRelationFieldDiffValues.tsx" \
  "showBeforeValue?: boolean;" \
  "The previous-record label must stay opt-in so the Log Console detail panel keeps upstream rendering"
check_file_not_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx" \
  "EventFieldDiffRelationValue" \
  "Relation diffs use upstream's batched EventRelationFieldDiffValues; the per-chip Omnia renderer was removed in the v2.58 merge"
check_file_exists \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/__tests__/EventFieldDiffContainer.test.tsx" \
  "Timeline diff regression tests (legacy uuid rows, empty/redacted diffs, before values) must exist"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/display/components/__tests__/RelationSubFieldDisplay.test.tsx" \
  "Relation sub-field display permission tests must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/types/RecordField.ts" \
  "subFieldName?: string | null;" \
  "RecordField must carry subFieldName for relation sub-field columns"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx" \
  "diffBeforeRecord" \
  "Timeline update events must render before → after for field diffs (not just after)"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx" \
  "StyledBeforeValue" \
  "Before-value preview must use muted + strike-through styling"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiffContainer.tsx" \
  "diffBeforeArtificialRecordStoreId" \
  "EventFieldDiffContainer must build a separate before-value record store id"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/__tests__/EventRelationFieldDiffValues.test.tsx" \
  "OMNIA-CUSTOM: timeline rows show the previous record struck through, then" \
  "Omnia hunk (G2): timeline rows show the previous record struck through, then the arrow"

echo ""
echo "--- Relation sub-field display routing (C6) ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/components/FieldDisplay.tsx" \
  "isRelationSubFieldDefinition(fieldDefinition)" \
  "FieldDisplay must route relation sub-field columns before any other display"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/display/components/RelationSubFieldDisplay.tsx" \
  "ForbiddenFieldDisplay" \
  "HIPAA: sub-field cells must show the lock when the role cannot read the sub-field or its object"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/display/components/RelationSubFieldDisplay.tsx" \
  "getRelationSubFieldMetadataItem" \
  "HIPAA: sub-field cells must resolve the sub-field from the target object's readableFields"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/display/components/RelationSubFieldDisplay.tsx" \
  "canReachSomeRecords" \
  "HIPAA: sub-field cells must check read access to the related object"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/display/components/RelationSubFieldDisplay.tsx" \
  "isFieldValueRestricted" \
  "Sub-field cells must lock values the server restricted"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/display/components/LinksFieldDisplay.tsx" \
  "displayAs={displayAs}" \
  "LinksFieldDisplay must pass settings.displayAs to LinksDisplay"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-calendar/record-calendar-card/components/RecordCalendarCardBody.tsx" \
  "isDefined(recordField.subFieldName)" \
  "Calendar cards must skip table-only sub-field columns, or each one renders its relation again"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-calendar/record-calendar-card/components/__tests__/RecordCalendarCardBody.test.tsx" \
  "Test that calendar cards skip sub-field columns and keep hover positions aligned with useRecordCalendarCardMetadataFromPosition"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-list/components/RecordListRow.tsx" \
  "isDefined(recordField.subFieldName)" \
  "List rows must skip table-only sub-field columns, or each one repeats its relation and inflates the +N count"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/components/FieldDisplay.tsx" \
  "RelationSubFieldDisplay" \
  "FieldDisplay must route sub-field columns to RelationSubFieldDisplay"

echo ""
echo "--- Call recording audio display (LinksDisplay) ---"
check_file_contains \
  "packages/twenty-front/src/modules/ui/field/display/components/LinksDisplay.tsx" \
  "displayAs === 'audio'" \
  "LINKS fields with settings.displayAs 'audio' (call recordings) must render the inline AudioLink player"
check_file_contains \
  "packages/twenty-front/src/modules/ui/field/display/components/LinksDisplay.tsx" \
  "@/ui/navigation/link/components/AudioLink/AudioLink" \
  "LinksDisplay must import AudioLink from its twenty-front location (twenty-ui has no navigation/ folder in v2.58)"
check_file_exists \
  "packages/twenty-front/src/modules/ui/field/display/components/__tests__/LinksDisplay.test.tsx" \
  "Audio display test for LINKS fields must exist"
check_file_contains \
  "packages/twenty-front/src/modules/ui/field/display/components/DateTimeDisplay.tsx" \
  "toTemporalInstantOrNull" \
  "DATE_TIME display must not crash on date-only or malformed values (TimeZoneAbbreviation parses an instant)"
check_file_exists \
  "packages/twenty-front/src/modules/ui/field/display/utils/toTemporalInstantOrNull.ts" \
  "Safe instant parser for DATE_TIME display must exist"
check_file_exists \
  "packages/twenty-front/src/modules/ui/field/display/utils/__tests__/toTemporalInstantOrNull.test.ts" \
  "Safe instant parser tests must exist"
check_file_exists \
  "packages/twenty-front/src/modules/ui/field/display/components/__tests__/DateTimeDisplay.test.tsx" \
  "DATE_TIME display crash regression tests must exist"

echo ""
echo "--- Address and date-time display guards ---"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/AddressFieldInput.tsx" \
  "castAsNumberOrNull(" \
  "Address input must not use castAsNumberOrNull, which throws on legacy non-numeric coordinates"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/AddressFieldInput.tsx" \
  "normalizeAddressCoordinate" \
  "Address input must not throw when persisted coordinates contain invalid strings"
check_file_contains \
  "packages/twenty-front/src/utils/normalize-address-coordinate.ts" \
  "DECIMAL_NUMBER_PATTERN" \
  "Address coordinate sanitizer must stay explicit and non-throwing"

echo ""
echo "--- Reconciliation review page (CORE_OBJECT_SHOW_PAGES) ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-core/constants/CoreObjectShowPages.ts" \
  "'reconciliation'" \
  "Reconciliation review page must be a CORE_OBJECT_SHOW_PAGES entry (standard /object/reconciliation/:id route + route context store)"
check_file_contains \
  "packages/twenty-front/src/modules/object-core/constants/CoreObjectShowPages.ts" \
  "new Map<string, CoreObjectShowPageComponent>" \
  "CORE_OBJECT_SHOW_PAGES must accept workspace object names (string keys), not only StandardObjectNameSingular"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationReviewPage.tsx" \
  "RecordShowPageContent" \
  "A reconciliation opened in the side panel must fall back to the default record page"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationReviewPageContent.tsx" \
  "contextStoreCurrentPageTypeComponentState" \
  "Review page must not write the context store by hand; the /object/reconciliation/:id route sets it"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/MatchedDiffView.tsx" \
  "ReconciliationDiffsContext.Provider" \
  "Matched view must hand BOB diffs to the inline cells through ReconciliationDiffsContext"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/MatchedDiffView.tsx" \
  "ReconciliationRecordRelationsList" \
  "Matched view must render the policy relations through the Omnia relations list (upstream RecordFieldList is non-relation only)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRecordRelationsList.tsx" \
  "Review page relations list (readable relation fields, reassign dropdown, auto-expanding pending diffs)"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRecordRelationSection.tsx" \
  "Review page relation section (title, All (N) link, reassign dropdown, list items)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRecordRelationsList.tsx" \
  "useFieldListFieldMetadataItems" \
  "Review relations list must start from readableFields and readable relation targets (HIPAA)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRecordRelationSection.tsx" \
  "useIsFieldRequired" \
  "An empty required relation must show a red section title on the review page"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationFilterBar.tsx" \
  "getViewBarFilterDropdownId(viewBarId)" \
  "Review filter bar must scope its filter dropdown to its own viewBarId"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useReconciliationActiveFilter.ts" \
  "reviewItemMetadata.readableFields" \
  "Review filters must only build predicates over readable reviewItem fields"

echo ""
echo "--- Reconciliation flows: wizard, carrier picker, comments, audit tasks ---"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenCreateAuditTaskDraft.ts" \
  "requestRecordCreation" \
  "Audit tasks must be created through the record creation form (nothing is saved until Create)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenCreateAuditTaskDraft.ts" \
  "createRecordWithAttachmentHandler" \
  "Audit task retries must reuse the saved task, so a failed review-item link never creates a second task"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenCreateAuditTaskDraft.ts" \
  "draftRecordIdsState" \
  "Audit tasks must not use the removed side-panel draft state"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenReconciliationWizard.ts" \
  "reconciliationCarrierPickerState" \
  "Run wizard must hand every run to the carrier picker on the reconciliation index"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenReconciliationWizard.ts" \
  "useShowAuthModal" \
  "Run wizard must not use the auth modal guard (removed upstream, #22398)"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenReconciliationWizard.ts" \
  "useSnackBar" \
  "Run wizard must use v2.58 toasts, not the removed snackbar"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenReconciliationImportDialog.ts" \
  "useShowAuthModal" \
  "Reconciliation import dialog must not use the auth modal guard (removed upstream, #22398)"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenReconciliationImportDialog.ts" \
  "useSnackBar" \
  "Reconciliation import dialog must report failures with useToast"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useOpenReconciliationImportDialog.ts" \
  "START_RECONCILIATION_PARSING" \
  "Reconciliation import must trigger the parse + match pipeline after upload"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationCarrierPickerModal.tsx" \
  "DialogInstance" \
  "Carrier picker must use the v2.58 Dialog (ModalStatefulWrapper and ConfirmationModal are gone)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/SidePanelReviewItemCommentsPage.tsx" \
  "getRichTextFieldTextLines" \
  "Comment previews must read TipTap, markdown and legacy BlockNote task bodies"
check_file_not_contains \
  "packages/twenty-front/src/modules/reconciliation/components/SidePanelReviewItemCommentsPage.tsx" \
  "blocknote-editor" \
  "Comments panel must not import the removed BlockNote editor utils"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/SidePanelReviewItemCommentsPage.tsx" \
  "getViewBarFilterDropdownId" \
  "Comments filter dropdown must be scoped to its own view bar, not the page-level filter"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/hooks/useFilteredTasksForReviewItem.ts" \
  "useTasks" \
  "Review item comments must load tasks through the permission-checked upstream task hook"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/hooks/__tests__/useOpenCreateAuditTaskDraft.test.tsx" \
  "Audit task retry-without-duplicate spec"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/components/__tests__/ReconciliationCarrierPickerModal.test.tsx" \
  "Carrier picker spec (one config opens the import, several show the picker, none explains)"

echo ""
echo "--- RECONCILIATION flag label (C8) ---"
check_file_contains \
  "packages/twenty-front/src/modules/marketplace/constants/PermissionFlagSummaryConfigs.ts" \
  "PermissionFlagType.RECONCILIATION" \
  "Marketplace permission summary must label the Omnia RECONCILIATION flag (Record<PermissionFlagType, ...> needs every flag)"

echo ""
echo "--- Record fetch and SSE (upstream-native guards, no-cache offset fetch) ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellDisplayMode.tsx" \
  "RequiredEmptyField" \
  "RecordInlineCellDisplayMode must isolate useIsFieldRequired in RequiredEmptyField sub-component (900+ jotai subs in tables)"
check_file_contains \
  "packages/twenty-front/src/modules/sse-db-event/hooks/useDispatchObjectRecordEventsFromSseToBrowserEvents.ts" \
  "store.get" \
  "SSE dispatch must keep upstream's store.get() snapshot (no reactive metadata hook)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useLazyFindManyRecordsWithOffset.ts" \
  "fetchPolicy: 'no-cache'" \
  "Offset fetch must use no-cache (record table reads from jotai, Apollo 3 has no cache GC)"

echo ""
echo "--- Reconciliation review UI (legacy pins) ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem.tsx" \
  "Delete intentionally omitted" \
  "Relation chip menu must NOT offer Delete — only Detach (admins were cross-deleting related records)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/MatchedDiffView.tsx" \
  'cancelId && cancelId !== policyId' \
  "Reconciliation Apply all must not cancel the same policy it is updating"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/MatchedDiffView.tsx" \
  "normalizeDiffComparableValue(value) === d.bobValue" \
  "Reconciliation Apply all / Undo all accepted-state detection must handle null target values"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/MatchedDiffView.tsx" \
  "useRecordStoreValue" \
  "Reconciliation review must read recordStoreFamilyState through the lint-compatible helper"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/utils/buildSyntheticPolicyRecord.ts" \
  "current-month payment coverage" \
  "Frontend synthetic reconciliation status derivation must mirror Ambetter current-month payment coverage"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/utils/buildSyntheticPolicyRecord.ts" \
  "Missing paid-through data is not current" \
  "Frontend synthetic reconciliation status derivation must keep missing paid-through active policies in payment error"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/utils/buildSyntheticPolicyRecord.ts" \
  "normalizePaidThroughDateForEffectiveDate" \
  "Frontend synthetic reconciliation must blank paid-through dates before the policy effective date"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/UnmatchedView.tsx" \
  "normalizePaidThroughDateForEffectiveDate" \
  "Unmatched reconciliation create flow must blank stale pre-effective paid-through dates"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationReviewPageContent.tsx" \
  "SidePanelToggleButton" \
  "Reconciliation review page must mount the SidePanelToggleButton (cmd+K hotkey entry point) in the header"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationReviewBody.tsx" \
  "BATCH_APPLY_REVIEW_ITEMS" \
  "Reconciliation review body must use the CRM-mutating batch apply/undo mutation"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationReviewBody.tsx" \
  "RECONCILIATION_AUTO_APPLY_BLOCKING_FLAGS" \
  "Reconciliation review body must use the shared blocking-flag list (client/server parity)"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationToolbar.tsx" \
  "batchUndoCount" \
  "Reconciliation toolbar must expose batch undo alongside batch apply"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/MatchedDiffView.tsx" \
  "syncReviewItemDecisionWithServer" \
  "Individual reconciliation Apply all must sync through the server mutation for learned rules"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/utils/invertColumnMapping.ts" \
  "Frontend must resolve BOB values via inverted columnMapping, not hardcoded Ambetter headers"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationCarrierPickerModal.tsx" \
  "resolveCarrierConfigSelection" \
  "Run wizard must route through carrier selection, never the first carrierConfig record"
check_file_exists \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationRunSummaryBanner.tsx" \
  "Review page must surface run stats/errors/warnings to operators"

# ======================================================================
# Repository tooling, AI instructions and CI
# ======================================================================
echo ""
echo "=== Repository tooling, AI instructions and CI ==="

echo ""
echo "--- AI instructions and toolchain ---"
check_file_not_contains \
  ".claude/skills/upstream-merge.md" \
  "bypassed field permissions" \
  "HIPAA: search runs with upstream permissions; the playbook must not describe the removed bypass"
check_file_contains \
  ".claude/skills/upstream-merge.md" \
  "Never reintroduce the search permission bypass" \
  "The merge playbook must forbid the search permission bypass"
check_symlink \
  "AGENTS.md" \
  "CLAUDE.md" \
  "AGENTS.md must stay a symlink to CLAUDE.md (one instruction file; Codex reads the Omnia skills through explicit paths)"
check_file_contains \
  "CLAUDE.md" \
  "## Omnia fork" \
  "CLAUDE.md must keep the Omnia fork section (registry, HIPAA and RLS rules, registration points, upgrade-command rule)"
check_file_contains \
  "CLAUDE.md" \
  ".claude/skills/upstream-merge.md" \
  "CLAUDE.md must point at the upstream-merge playbook"
check_file_contains \
  ".claude/skills/upstream-merge.md" \
  'Never `database:migrate` or `run-instance-commands --force`' \
  "The merge playbook must keep deploys and restores on upgrade only (run-instance-commands --force makes upgrade skip every slow and workspace command)"
check_file_contains \
  ".claude/skills/upstream-merge.md" \
  "Merge a release, never \`upstream/main\`" \
  "The merge playbook must merge release tags, never upstream main"
check_file_not_exists \
  "docs/ai" \
  "The generated AI-instruction mirror was dropped: CLAUDE.md and .claude/skills are the only instruction source"
check_file_not_exists \
  "scripts/sync-ai-instructions.mjs" \
  "The AI-instruction mirror generator was dropped with docs/ai"
check_file_not_exists \
  ".codex/config.toml" \
  "The committed Codex config held a ui.sh bearer token; it must not come back"
check_file_contains \
  ".gitignore" \
  ".codex/" \
  "Local Codex config must stay untracked"
check_file_contains \
  ".yarnrc.yml" \
  "enableScripts: false" \
  "Dependency install scripts stay disabled (upstream supply-chain hardening)"

echo ""
echo "--- CI workflows (allowlist) ---"
check_workflows_allowlist \
  ".github/workflows" \
  "Only Omnia's deploy workflow (and an optional lean omnia-ci.yaml) may exist; upstream CI, Crowdin, AI-catalog sync and the auto-merging upstream-sync cron stay deleted" \
  "deploy-eks.yaml" \
  "omnia-ci.yaml"
check_file_not_exists \
  ".github/workflows/upstream-sync.yml" \
  "The upstream-sync cron auto-merged upstream into the production branch"
check_file_not_exists \
  ".github/workflows/claude.yml" \
  "The Claude Code workflow called Anthropic directly, outside the Bedrock BAA path"

echo ""
echo "--- Translation catalogs (warning only) ---"
# Catalogs come from upstream during a merge; Omnia strings return after lingui extract + compile (Wave 5 chore(i18n) commit).
if grep -qF "No agent profile is linked to your account" "packages/twenty-front/src/locales/en.po" 2>/dev/null; then
  echo -e "${GREEN}OK${NC} Lingui catalogs contain Omnia strings"
else
  echo -e "${YELLOW}WARNING${NC} Omnia Lingui strings missing — run: npx nx run twenty-front:lingui:extract && npx nx run twenty-front:lingui:compile (and the same for twenty-server)"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}  $ERRORS ERRORS found — customizations were overwritten!${NC}"
  echo "  Review CUSTOMIZATIONS.md and restore the missing changes."
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}  $WARNINGS WARNINGS — minor issues to fix${NC}"
  exit 0
else
  echo -e "${GREEN}  All customizations intact!${NC}"
  exit 0
fi
