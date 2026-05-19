#!/usr/bin/env bash
# check-customizations.sh — Run after merging upstream to detect overwritten customizations
set -euo pipefail

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

  # -F: treat the pattern as a literal string. Without it, BSD grep on
  # macOS rejects patterns containing repetition operators like `**` with
  # "repetition-operator operand invalid", producing false-positive overwrite
  # reports for entirely intact customizations.
  if ! grep -qF "$pattern" "$file" 2>/dev/null; then
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

check_file_not_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"

  if [ ! -f "$file" ]; then
    echo -e "${YELLOW}SKIP${NC} $file (not found)"
    return
  fi

  if grep -qF "$pattern" "$file" 2>/dev/null; then
    echo -e "${RED}REVERTED${NC} $file — $description"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}OK${NC} $file"
  fi
}

echo "============================================"
echo "  Omnia Customization Check"
echo "============================================"
echo ""

# ==========================================================
# Critical Files (repeatedly wiped by upstream merges)
# ==========================================================

echo "--- Critical: RLS Relation Write Resolution ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts" \
  "writeScopedRlsPredicates" \
  "Create-time RLS prefill must stay scoped to ALL + WRITE predicates"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts" \
  "intermediateRecordId" \
  "Create-time RLS prefill must resolve relation-based Me rules through the intermediate record id"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/hooks/useFilteredSelectOptionsFromRLSPredicates.ts" \
  "RowLevelPermissionPredicateScope.WRITE" \
  "Editable select/picker option filtering must only use ALL + WRITE scoped predicates"

echo ""
echo "--- Critical: Organization Plan Gate Removed ---"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelObjectForm.tsx" \
  "isRLSBillingEntitlementEnabled" \
  "Organization plan gate should be removed — RLS always enabled"

echo ""
echo "--- Critical: Scoped RLS UI ---"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelSection.tsx" \
  'Read + write' \
  "Record-level permissions must stay split into Read + write / Read only / Write only sections"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelSection.tsx" \
  "RowLevelPermissionPredicateScope.WRITE" \
  "Record-level permissions UI must expose the write-only scope"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "scope: predicate.scope" \
  "Saving roles must persist predicate scope to GraphQL"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role/hooks/useSaveDraftRoleToDB.ts" \
  "scope: group.scope" \
  "Saving roles must persist predicate-group scope to GraphQL"

echo ""
echo "--- Critical: Sidebar Customization ---"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/components/MainNavigationDrawer.tsx" \
  'label={t`Search`}' \
  "Search item should remain in the sidebar"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation/components/MainNavigationDrawer.tsx" \
  "Documentation" \
  "Documentation link should be removed from sidebar"
check_file_not_contains \
  "packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/NavigationDrawerHeader.tsx" \
  "IconSearch" \
  "Inline search icon beside the workspace name should remain removed"
check_file_contains \
  "packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx" \
  "OMNIA-CUSTOM: inline Log out" \
  "Workspace dropdown should have inline Log out and no nested three-dots menu"
check_file_not_contains \
  "packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx" \
  "IconDotsVertical" \
  "Nested three-dots dropdown should be removed from workspace menu"
check_file_not_contains \
  "packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx" \
  "SignUpInNewWorkspaceDocument" \
  "Create Workspace mutation should be removed from workspace menu"
check_file_not_contains \
  "packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownDefaultComponents.tsx" \
  "IconUserPlus" \
  "Invite user option should be removed from workspace menu"

echo ""
echo "--- Critical: Sidebar-Based Default Landing Page ---"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts" \
  "navigationMenuItemsSelector" \
  "Default landing page should use workspace sidebar nav items as source of truth"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts" \
  "sidebarObjectMetadataIds" \
  "Admin last-visited should be validated against sidebar membership"

echo ""
echo "--- Critical: Create Record CTA ---"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu/components/CommandMenuButton.tsx" \
  "command.buttonVariant ?? 'secondary'" \
  "Pinned command buttons must honor explicit buttonVariant overrides"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/utils/resolveCreateRecordActionLabels.ts" \
  'Create ${objectMetadataItem.labelSingular}' \
  "Create-record button label must stay object-specific (Create Policy, Create Lead, etc.)"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/contexts/CommandMenuContextProviderContent.tsx" \
  "resolveCreateRecordActionLabels" \
  "Command menu context provider must apply object-aware create CTA labels"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/contexts/CommandMenuContextProviderContent.tsx" \
  "resolveGoToActionLabels" \
  "Command menu context provider must apply object-aware Go To labels and filter deactivated objects"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/utils/resolveGoToActionLabels.ts" \
  "isActive" \
  "Go To label resolver must filter deactivated objects"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/display/components/CommandMenuItemRenderer.tsx" \
  "CREATE_NEW_RECORD" \
  "Create Record button must apply blue primary CTA styling"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts" \
  "deleteSingleRecord" \
  "Delete single record action must be pinned as a header button"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-manifest/application-manifest-migration.service.ts" \
  "workspaceCustomFlatApplication.id" \
  "App manifest sync must validate relations against workspace-custom CRM objects"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/workspace-graphql-schema-sdl/workspace-graphql-schema-sdl.service.ts" \
  "workspaceCustomApplicationId" \
  "App-scoped GraphQL SDL generation must include workspace-custom CRM objects"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/contexts/CommandMenuContextProviderContent.tsx" \
  "PermissionFlagType.LAYOUTS" \
  "Edit Record Page Layout must be gated behind LAYOUTS permission"

echo ""
echo "--- Critical: Member Workspace Sidebar ---"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/components/WorkspaceNavigationMenuItemsDispatcher.tsx" \
  "OmniaMemberWorkspaceNavigationMenuItems" \
  "Members must use the fixed Omnia workspace section instead of the editable workspace tree"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/workspace/components/WorkspaceSection.tsx" \
  "canEditSidebar" \
  "Workspace sidebar editing must stay gated behind LAYOUTS permission"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/dnd/components/OmniaMemberWorkspaceNavigationMenuItems.tsx" \
  "ignoreShowInSidebar" \
  "Non-layout sidebar must respect showInSidebar permission"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/dnd/components/OmniaMemberWorkspaceNavigationMenuItems.tsx" \
  "getOmniaMemberWorkspaceObjectMetadataItems" \
  "Non-layout sidebar must use all objects filtered by permission, not a hardcoded list"
check_file_contains \
  "packages/twenty-front/src/modules/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection.tsx" \
  "showInSidebar" \
  "Opened section must use showInSidebar permission to avoid duplicating workspace items"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems.tsx" \
  "ignoreShowInSidebar" \
  "NavigationDrawerSection must support bypassing showInSidebar for curated sections"

echo ""
echo "--- Critical: Signed-Out Lead Mock ---"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockContainer.tsx" \
  "RecordTableWithWrappers" \
  "Signed-out background should keep using the real record table"
check_file_not_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockContainer.tsx" \
  "SignInBackgroundMockLeadTable" \
  "Signed-out background should not use a decorative lead table"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInAppNavigationDrawerMock.tsx" \
  't`Policies`' \
  "Signed-out sidebar should pin the curated workspace labels"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockPage.tsx" \
  "objectMetadataItem?.labelPlural ?? t\`Leads\`" \
  "Signed-out background page should read the Leads header label from auth metadata"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockPage.tsx" \
  "objectMetadataItemFamilySelector" \
  "Signed-out background page must use the safe selector (not useObjectMetadataItem, which throws on empty metadata for unauthed visitors)"
check_file_not_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockPage.tsx" \
  "useObjectMetadataItem" \
  "Signed-out background page must not use useObjectMetadataItem (it throws when no workspace metadata is loaded)"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockConfig.ts" \
  "objectNameSingular: 'person'" \
  "Signed-out background should target people/leads mock data"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockConfig.ts" \
  "objectNamePlural: 'people'" \
  "Signed-out background should target the people collection"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockConfig.ts" \
  "viewBarId: 'sign-up-mock-record-table-id'" \
  "Signed-out background should align the view bar instance with the auth record index"
check_file_exists \
  "packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockRecords.ts" \
  "Typed sign-in mock people/leads records should exist"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockContainer.tsx" \
  "isViewBarReady" \
  "Signed-out background should wait for auth view state before mounting the toolbar"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockColumnDefinitions.ts" \
  "getColumnDefinitionFromFieldMetadataItem('status'" \
  "Signed-out mock table should use the lead status column set"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/constants/SignInBackgroundMockRecords.ts" \
  "createMockPolicy" \
  "Signed-out mock records should include lightweight lead policies"
check_file_exists \
  "packages/twenty-front/src/modules/sign-in-background-mock/utils/signInBackgroundMockMetadata.ts" \
  "Auth-only lead metadata helpers should exist for the signed-out shell"
check_file_contains \
  "packages/twenty-front/src/testing/utils/preloadMockedMetadata.ts" \
  "extendSignInBackgroundMockedMetadata" \
  "Signed-out mocked metadata should be extended for the lead auth shell"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useAuth.ts" \
  "OMNIA-CUSTOM: leave protected routes before swapping to mocked metadata." \
  "Logout should navigate away from protected routes before swapping to signed-out metadata"
check_file_contains \
  "packages/twenty-front/src/modules/context-store/components/MainContextStoreProvider.tsx" \
  "SIGN_IN_BACKGROUND_MOCK_CONFIG.objectNamePlural" \
  "Main context store should follow the shared auth-background object"
check_file_not_contains \
  "packages/twenty-front/src/modules/context-store/components/MainContextStoreProvider.tsx" \
  "const SIGN_IN_BACKGROUND_OBJECT_NAME_PLURAL = 'companies';" \
  "Main context store should not hardcode companies for the auth background"
check_file_contains \
  "packages/twenty-front/src/modules/context-store/components/MainContextStoreProvider.tsx" \
  "forceTableViewType={showAuthModal}" \
  "Signed-out main context store should force the auth background into table mode"
check_file_contains \
  "packages/twenty-front/src/modules/context-store/components/MainContextStoreProviderEffect.tsx" \
  "if (forceTableViewType)" \
  "Main context store effect should own the auth-background table view type"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/hooks/useRecordIndexTableQuery.ts" \
  "recordTableId === SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId" \
  "Mock people records should be scoped to the sign-in record table"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/virtualization/hooks/useTriggerInitialRecordTableDataLoad.ts" \
  "recordTableId === SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId" \
  "Initial data load should only inject sign-in mock records for the auth background table"
check_file_contains \
  "packages/twenty-front/src/modules/views/hooks/internal/useGetRecordIndexTotalCount.ts" \
  "SIGN_IN_BACKGROUND_MOCK_RECORDS.length" \
  "Signed-out view picker should use local mock counts instead of aggregate GraphQL requests"
check_file_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockContainerEffect.tsx" \
  "availableFieldDefinitionsComponentState" \
  "Signed-out background should seed only auth view-bar atoms before rendering the toolbar"
check_file_not_contains \
  "packages/twenty-front/src/modules/sign-in-background-mock/components/SignInBackgroundMockContainerEffect.tsx" \
  "contextStoreCurrentViewIdComponentState" \
  "Signed-out background should not fight the main context store for the current view id"
check_file_contains \
  "packages/twenty-front/src/modules/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownClickableComponent.tsx" \
  "workspacePublicDataState" \
  "Signed-out drawer header should fall back to public workspace data"

echo ""
echo "--- Session-storage Redis error handler ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/session-storage/session-storage.module-factory.ts" \
  "redisClient.on('error'" \
  "Session-storage redis client must register an 'error' listener (without it a redis blip crashes the entire Node process)"

echo ""
echo "--- Critical: Cloudflare Stale Asset Fix ---"
check_file_contains \
  "packages/twenty-server/src/app.module.ts" \
  "stale asset URLs after deploys" \
  "ServeStatic fallback must keep the Cloudflare stale-asset protection comment/customization"
check_file_contains \
  "packages/twenty-server/src/app.module.ts" \
  "if (filePath.match" \
  "Static server must set long-lived immutable cache headers only on hashed asset files"
check_file_contains \
  "packages/twenty-server/src/app.module.ts" \
  "no-cache, no-store, must-revalidate" \
  "HTML responses must stay uncacheable so deploys do not pin old index.html"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  'public, max-age=31536000, immutable' \
  "Ingress must keep immutable caching for JS/CSS/font/image assets"
check_file_not_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  'immutable" always;' \
  "Ingress must not mark missing asset 404s as immutable cache hits"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  'no-cache, no-store, must-revalidate' \
  "Ingress must keep HTML/app routes uncacheable"

echo ""
echo "--- Critical: AWS Runtime Pod Identity (HIPAA) ---"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-server.yaml" \
  "serviceAccountName" \
  "Server deployment must render serviceAccountName so EKS Pod Identity works"
check_file_contains \
  "packages/twenty-docker/helm/twenty/templates/deployment-worker.yaml" \
  "serviceAccountName" \
  "Worker deployment must render serviceAccountName so EKS Pod Identity works"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "serviceAccountName: twenty-bedrock" \
  "omnia-values must point server+worker at the twenty-bedrock service account"
check_file_contains \
  "packages/twenty-docker/helm/twenty/omnia-values.yaml" \
  "Amazon Transcribe" \
  "twenty-bedrock service account comment must document Compliance QA Transcribe/S3 runtime access"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ai/ai-models/ai-providers.json" \
  '"@ai-sdk/amazon-bedrock"' \
  "AI provider catalog must include native Bedrock entry (HIPAA-clean path via AWS BAA)"

echo ""
echo "--- Critical: Metadata Response Cache ---"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/metadata.module-factory.ts" \
  "'FindAllRecordPageLayouts'" \
  "Metadata response cache must include FindAllRecordPageLayouts"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/metadata.module-factory.ts" \
  "'FindFieldsWidgetCoreViews'" \
  "Metadata response cache must include FindFieldsWidgetCoreViews"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/metadata.module-factory.ts" \
  "'FindManyLogicFunctions'" \
  "Metadata response cache must include FindManyLogicFunctions"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts" \
  "USER_SCOPED_METADATA_OPERATIONS" \
  "Metadata cache hook must keep user-scoped core-view operations grouped together"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/graphql-config/hooks/use-cached-metadata.ts" \
  "'FindFieldsWidgetCoreViews'" \
  "Fields-widget core views must stay user-scoped in metadata response cache keys"
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
check_file_contains \
  "packages/twenty-server/src/engine/workspace-cache/services/workspace-cache.service.ts" \
  "SLOW_WORKSPACE_CACHE_RECOMPUTE_MS" \
  "Workspace cache service must keep slow recompute thresholds"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-cache/services/workspace-cache.service.ts" \
  "createSlowPathObserver" \
  "Workspace cache service must use the shared slow-path observer for full resolution timing"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/workspace-schema.factory.ts" \
  "createSlowPathObserver" \
  "Workspace schema factory must use the shared slow-path observer for schema build timing"
check_file_contains \
  "packages/twenty-server/src/engine/api/graphql/workspace-schema.factory.ts" \
  "'schemaGenerationMs'" \
  "Workspace schema factory slow observer must include schema generation timing"

echo ""
echo "--- Critical: Server Watcher Ignore Patterns ---"
check_file_contains \
  "packages/twenty-server/nest-cli.json" \
  "\"**/.yarn/**\"" \
  "Nest watcher must ignore Yarn cache directories to reduce open file watchers"
check_file_contains \
  "packages/twenty-server/nest-cli.json" \
  "seed-project/**" \
  "Nest watcher must ignore large static seed project assets to avoid EMFILE in watch mode"

echo ""
echo "--- Critical: Edit Window Column (Role Entity) ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/role.entity.ts" \
  "editWindowMinutes" \
  "Role entity must have editWindowMinutes column"

echo ""
echo "--- Critical: Edit Window Column (Object Permission Entity) ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.entity.ts" \
  "editWindowMinutes" \
  "ObjectPermission entity must have editWindowMinutes column"

echo ""
echo "--- Critical: Edit Window Cache Resolution ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/services/workspace-roles-permissions-cache.service.ts" \
  "editWindowMinutes" \
  "Cache service must resolve editWindowMinutes"

echo ""
echo "--- Critical: Edit Window Shared Type ---"
check_file_contains \
  "packages/twenty-shared/src/types/ObjectPermissions.ts" \
  "editWindowMinutes" \
  "Shared ObjectPermissions type must include editWindowMinutes"

# ==========================================================
# Custom Server Modules (entirely new — check existence)
# ==========================================================

echo ""
echo "--- Custom Server Modules ---"
check_file_exists \
  "packages/twenty-server/src/modules/agent-profile/agent-profile.module.ts" \
  "AgentProfile module registration"
check_file_exists \
  "packages/twenty-server/src/modules/agent-profile/services/agent-profile-resolver.service.ts" \
  "AgentProfile resolver service"
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
  "packages/twenty-server/src/modules/policy/query-hooks/policy-query-hook.module.ts" \
  "Policy query hook module registration"
check_file_exists \
  "packages/twenty-server/src/modules/call/query-hooks/call-create-one.pre-query.hook.ts" \
  "Call create pre-query hook"
check_file_exists \
  "packages/twenty-server/src/modules/call/query-hooks/call-query-hook.module.ts" \
  "Call query hook module registration"
check_file_exists \
  "packages/twenty-server/src/modules/lead/query-hooks/lead-create-one.pre-query.hook.ts" \
  "Lead create pre-query hook"
check_file_exists \
  "packages/twenty-server/src/modules/lead/query-hooks/lead-query-hook.module.ts" \
  "Lead query hook module registration"

echo ""
echo "--- Compliance QA App ---"
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
  "\"lint\": \"oxlint -c .oxlintrc.json .\"" \
  "Compliance app lint script must stay executable"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/package.json" \
  "\"version\": \"1." \
  "Compliance app production package version must stay on a 1.x production line"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/package.json" \
  "\"version\": \"0." \
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
  "Compliance QA must keep S3 bucket configuration for Amazon Transcribe"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "COMPLIANCE_QA_BEDROCK_MODEL_ID" \
  "Compliance QA must keep Amazon Bedrock model configuration for scoring"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "COMPLIANCE_QA_MIN_DURATION_SECONDS" \
  "Compliance QA must keep a duration gate to control Transcribe spend"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/application-config.ts" \
  "COMPLIANCE_QA_ENABLED_AFTER" \
  "Compliance QA must support rollout-date filtering"
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
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-config.ts" \
  "Compliance QA AWS clients must share one typed config helper"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/call-ai.ts" \
  "BedrockRuntimeClient" \
  "Compliance QA scoring must use Amazon Bedrock directly"
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
  "Compliance QA workflow must own async Transcribe polling with delay steps"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "shouldPollAgain" \
  "Compliance QA workflow must branch Transcribe polling based on action output"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/post-install.ts" \
  "createDraftFromWorkflowVersion" \
  "Compliance QA app upgrades must update the app-managed workflow version"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-install/application-install.service.ts" \
  "userWorkspaceId?: string" \
  "App post-install hooks must receive installing user context for Workflow API permissions"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-install/application-install.resolver.ts" \
  "@AuthUser({ allowUndefined: true })" \
  "Direct app installs must forward user context to post-install hooks"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-marketplace/marketplace.resolver.ts" \
  "@AuthUser({ allowUndefined: true })" \
  "Marketplace app installs must forward user context to post-install hooks"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/application/application-upgrade/application-upgrade.resolver.ts" \
  "@AuthUser()" \
  "App upgrades must forward user context to post-install hooks"
echo ""
echo "--- Telephony App ---"
check_file_exists \
  "packages/twenty-apps/internal/telephony/package.json" \
  "Telephony app package must exist"
check_file_exists \
  "packages/twenty-apps/internal/telephony/CODEX_HANDOFF.md" \
  "Telephony handoff plan must exist for future implementation agents"
check_file_contains \
  "packages/twenty-apps/internal/telephony/package.json" \
  "\"lint\": \"oxlint -c .oxlintrc.json .\"" \
  "Telephony app lint script must stay executable"
check_file_contains \
  "packages/twenty-apps/internal/telephony/tsconfig.json" \
  "\"jsx\": \"react-jsx\"" \
  "Telephony app front component TypeScript must compile JSX"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/application-config.ts" \
  "displayName: 'Telephony'" \
  "Telephony app must keep its user-facing app name"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/application-config.ts" \
  "TELEPHONY_PROVIDER_WEBHOOK_SECRET" \
  "Telephony app must keep provider webhook secret configuration"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/application-config.ts" \
  "Install Brokerage first" \
  "Telephony app must document its Brokerage dependency"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/constants/universal-identifiers.ts" \
  "Telephony object and field identifiers must stay stable"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/constants/universal-identifiers.ts" \
  "BROKERAGE_AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER" \
  "Telephony must link to Brokerage Agent Profile rather than redefining agents"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/constants/universal-identifiers.ts" \
  "BROKERAGE_CALL_OBJECT_UNIVERSAL_IDENTIFIER" \
  "Telephony must link new sessions to final Brokerage Calls"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/objects/campaign.ts" \
  "Telephony Campaign object must exist"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/objects/campaign.ts" \
  "nameSingular: 'telephonyCampaign'" \
  "Telephony Campaign internal object name must stay stable"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/objects/campaign-lead.ts" \
  "Telephony Campaign Lead queue object must exist"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/objects/campaign-lead.ts" \
  "name: 'lockExpiresAt'" \
  "Telephony Campaign Lead must keep routing lease expiry"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/objects/disposition.ts" \
  "Telephony Disposition object must exist"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/objects/call-session.ts" \
  "Telephony Call Session object must exist"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/objects/call-session.ts" \
  "name: 'providerCallId'" \
  "Telephony Call Session must store provider call identifiers outside Brokerage core fields"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/objects/call-event.ts" \
  "Telephony Call Event audit object must exist"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/objects/call-event.ts" \
  "name: 'payload'" \
  "Telephony Call Event must preserve normalized provider/audit payloads"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/objects/agent-presence.ts" \
  "Telephony Agent Presence object must exist"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/objects/inbound-queue.ts" \
  "Telephony Inbound Queue object must exist"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/front-components/agent-softphone-workspace.tsx" \
  "Telephony agent softphone front component must exist"
check_file_not_contains \
  "packages/twenty-apps/internal/telephony/src/front-components/agent-softphone-workspace.tsx" \
  " as " \
  "Telephony front component must avoid TypeScript assertion casts"
check_file_contains \
  "packages/twenty-apps/internal/telephony/src/front-components/agent-softphone-workspace.tsx" \
  "parseGraphQlResponse" \
  "Telephony front component must validate metadata GraphQL responses"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/page-layouts/agent-softphone-page-layout.ts" \
  "Telephony softphone page layout must exist"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/navigation-menu-items/telephony-folder.navigation-menu-item.ts" \
  "Telephony sidebar folder must exist"
check_file_exists \
  "packages/twenty-apps/internal/telephony/src/views/blocked-attempts.view.ts" \
  "Telephony blocked-attempt audit view must exist"
check_file_exists \
  "packages/twenty-server/src/modules/telephony/telephony.module.ts" \
  "Telephony runtime module must exist"
check_file_contains \
  "packages/twenty-server/src/modules/modules.module.ts" \
  "TelephonyModule" \
  "Telephony runtime module must be registered in the application modules tree"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/metadata-engine.module.ts" \
  "TelephonyModule" \
  "Telephony resolver must be registered in the metadata GraphQL module tree"
check_file_exists \
  "packages/twenty-server/src/modules/telephony/telephony.resolver.ts" \
  "Telephony metadata resolver must exist"
check_file_contains \
  "packages/twenty-server/src/modules/telephony/telephony.resolver.ts" \
  "requestNextCampaignLead" \
  "Telephony resolver must expose campaign lead routing"
check_file_contains \
  "packages/twenty-server/src/modules/telephony/telephony.resolver.ts" \
  "submitCallDisposition" \
  "Telephony resolver must expose disposition submission"
check_file_exists \
  "packages/twenty-server/src/modules/telephony/controllers/telephony-provider-webhook.controller.ts" \
  "Telephony provider webhook controller must exist"
check_file_contains \
  "packages/twenty-server/src/modules/telephony/controllers/telephony-provider-webhook.controller.ts" \
  "@Controller('webhooks/telephony')" \
  "Telephony provider webhook route must stay public and stable"
check_file_exists \
  "packages/twenty-server/src/modules/telephony/services/telephony.service.ts" \
  "Telephony runtime service must exist"
check_file_contains \
  "packages/twenty-server/src/modules/telephony/services/telephony.service.ts" \
  "WorkspaceRepository<T>" \
  "Telephony service must use typed workspace repositories instead of coercion"
check_file_contains \
  "packages/twenty-server/src/modules/telephony/services/telephony.service.ts" \
  "isWithinAllowedCallingWindow" \
  "Telephony service must enforce lead-local calling windows"
check_file_not_contains \
  "packages/twenty-server/src/modules/telephony/services/telephony.service.ts" \
  " as " \
  "Telephony service must avoid TypeScript assertion casts"
check_file_exists \
  "packages/twenty-server/src/modules/telephony/providers/twilio-compatible-telephony-provider.adapter.ts" \
  "Telephony Twilio/Plivo-compatible provider adapter must exist"
check_file_contains \
  "packages/twenty-server/src/modules/telephony/providers/twilio-compatible-telephony-provider.adapter.ts" \
  "normalizeWebhookEvent" \
  "Telephony provider adapter must normalize webhook events"
check_file_exists \
  "packages/twenty-server/src/modules/telephony/utils/local-calling-window.util.ts" \
  "Telephony local calling window utility must exist"
check_file_exists \
  "packages/twenty-server/src/modules/telephony/providers/__tests__/twilio-compatible-telephony-provider.adapter.spec.ts" \
  "Telephony provider normalization tests must exist"
check_file_exists \
  "packages/twenty-server/src/modules/telephony/utils/__tests__/local-calling-window.util.spec.ts" \
  "Telephony local calling window tests must exist"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/start-compliance-qa.ts" \
  "readCachedTranscribeOutputForCall" \
  "Compliance QA retries must reuse cached Transcribe output before starting a new job"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/start-compliance-qa.ts" \
  "isCallEligibleForComplianceQa" \
  "Compliance QA start worker must filter calls before creating scorecards or Transcribe jobs"
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
  "Amazon Transcribe" \
  "Compliance QA completion worker must poll Amazon Transcribe, not Deepgram"
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "cronTriggerSettings" \
  "Compliance QA async Transcribe polling must be owned by Workflow delay steps, not cron"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "isFinalAttempt" \
  "Compliance QA workflow polling must fail visibly when Transcribe never finishes"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "findProcessableQaScorecards" \
  "Compliance QA completion worker must process cached SCORING scorecards"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "buildTranscriptionJobName" \
  "Compliance QA completion worker must derive deterministic Transcribe job names from source Calls"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "title: 'Transcript'" \
  "Compliance QA transcript output must be written to Notes without a redundant QA prefix"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "Amazon Transcribe Output JSON" \
  "Compliance QA completion worker must attach transcription artifacts to scorecard Files"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/logic-functions/complete-compliance-qa.ts" \
  "linkTaskToComplianceContextIfSupported" \
  "Compliance QA follow-up tasks must be linked to scorecard, call, and agent context"
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
check_file_not_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-transcribe.ts" \
  "DEEPGRAM_API_KEY" \
  "Compliance QA must not regress to Deepgram transcription"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-transcribe.ts" \
  "getTranscribeOutputLocation" \
  "Compliance QA must keep deterministic Transcribe output locations for retry cost control"
check_file_contains \
  "packages/twenty-apps/internal/compliance-qa/src/utils/aws-transcribe.ts" \
  "ConflictException" \
  "Compliance QA must converge duplicate Transcribe starts on the same deterministic job"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/qa-call-eligibility.ts" \
  "Compliance QA call eligibility filters must stay centralized"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/scoring.test.ts" \
  "Compliance QA scoring thresholds and red-flag override tests must exist"
check_file_exists \
  "packages/twenty-apps/internal/compliance-qa/src/utils/error-message.ts" \
  "Compliance QA must use explicit unknown error narrowing helpers"

echo ""
echo "--- Policy Pre-Query Hook: agentId Assignment ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts" \
  "agentProfileResolverService" \
  "Pre-query hook must use AgentProfileResolverService for agentId"

# ==========================================================
# Modified Upstream Server Files
# ==========================================================

echo ""
echo "--- DevelopmentGuard Removed ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/application/resolvers/application-development.resolver.ts" \
  "DevelopmentGuard" \
  "DevelopmentGuard should be removed — app:dev must work on self-hosted prod"

echo ""
echo "--- TypeORM Migration Transaction Mode ---"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/core.datasource.ts" \
  "migrationsTransactionMode: 'each'" \
  "TypeORM CLI migrations must allow per-migration transaction opt-out for concurrent index builds"

echo ""
echo "--- RLS Engine: Indirect Relation + Deny-by-Default ---"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts" \
  "resolveWorkspaceMemberLinkedRelationRecordIds" \
  "Backend RLS must resolve relation-based Me predicates through linked records"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts" \
  "relationToWorkspaceMemberField" \
  "Backend RLS must find the relation target's link back to workspaceMember"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts" \
  "00000000-0000-0000-0000-000000000000" \
  "Deny-by-default when predicates can't resolve"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/__tests__/build-row-level-permission-record-filter.util.spec.ts" \
  "resolves relation predicates to related workspace-member records for write filters" \
  "Regression test for policy.agent = Me relation resolution"

echo ""
echo "--- RLS Engine: Scoped Read/Write Predicates ---"
check_file_exists \
  "packages/twenty-shared/src/types/RowLevelPermissionPredicateScope.ts" \
  "Shared RLS predicate scope enum"
check_file_contains \
  "packages/twenty-shared/src/types/RowLevelPermissionPredicateScope.ts" \
  "WRITE = 'WRITE'" \
  "RLS scope enum must include WRITE"
check_file_contains \
  "packages/twenty-shared/src/types/RowLevelPermissionPredicate.ts" \
  "scope" \
  "Shared predicate type must include scope field"
check_file_contains \
  "packages/twenty-shared/src/types/RowLevelPermissionPredicateGroup.ts" \
  "scope" \
  "Shared predicate-group type must include scope field"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/row-level-permission-predicate.dto.ts" \
  "scope" \
  "Predicate DTO must expose scope over GraphQL"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/row-level-permission-predicate-group.dto.ts" \
  "scope" \
  "Predicate-group DTO must expose scope over GraphQL"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/dtos/inputs/upsert-row-level-permission-predicates.input.ts" \
  "scope" \
  "Upsert predicate input must allow scope-aware upserts"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity.ts" \
  "scope: RowLevelPermissionPredicateScope" \
  "Predicate entity must persist scope"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity.ts" \
  "scope: RowLevelPermissionPredicateScope" \
  "Predicate-group entity must persist scope"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1773079000000-add-scope-to-row-level-permission-predicates.ts" \
  "Migration adding scope to row-level predicates"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts" \
  "targetScope" \
  "RLS filter builder must accept a target scope"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/apply-row-level-permission-predicates.util.ts" \
  "RowLevelPermissionPredicateScope.WRITE" \
  "Query-time RLS must route writes through WRITE scope"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/apply-row-level-permission-predicates.util.ts" \
  "RowLevelPermissionPredicateScope.READ" \
  "Query-time RLS must route reads through READ scope"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/validate-rls-predicates-for-records.util.ts" \
  "targetScope: RowLevelPermissionPredicateScope.WRITE" \
  "Record validation must always enforce WRITE-scoped predicates"
check_file_contains \
  "packages/twenty-server/src/engine/subscriptions/object-record-event/object-record-event-publisher.ts" \
  "targetScope: RowLevelPermissionPredicateScope.READ" \
  "Object record event subscriptions must stay READ-scoped"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/row-level-permission-predicate/services/row-level-permission-predicate.service.ts" \
  "validateScopedPredicateTree" \
  "Role permission service must reject mixed-scope predicate trees"

echo ""
echo "--- RLS Engine: Request-Scoped Memoization ---"
check_file_exists \
  "packages/twenty-server/src/engine/twenty-orm/types/workspace-rls-computation-cache.type.ts" \
  "Request-scoped RLS computation cache type"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/types/workspace-rls-computation-cache.type.ts" \
  "recordFiltersByKey" \
  "RLS cache type must track memoized record filters"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/storage/orm-workspace-context.storage.ts" \
  "rlsComputationCache" \
  "AsyncLocal ORM workspace context must carry the request-scoped RLS cache"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/interfaces/workspace-internal-context.interface.ts" \
  "rlsComputationCache" \
  "Internal ORM context must expose the request-scoped RLS cache"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/entity-manager/workspace-entity-manager.ts" \
  "createWorkspaceRlsComputationCache" \
  "Workspace entity manager must initialize one RLS cache per request"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts" \
  "getOrSetCachedPromise" \
  "RLS filter builder must memoize repeated linked-record and filter computations"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/apply-row-level-permission-predicates.util.ts" \
  "internalContext.rlsComputationCache" \
  "Query-time RLS must pass the request-scoped cache into filter building"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/validate-rls-predicates-for-records.util.ts" \
  "internalContext.rlsComputationCache" \
  "Write-time RLS validation must reuse the request-scoped cache"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/__tests__/build-row-level-permission-record-filter.util.spec.ts" \
  "reuses cached relation and record-filter computation within a request context" \
  "Regression test must guard request-scoped RLS memoization"

echo ""
echo "--- RLS Validation on Create/Update ---"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/validate-rls-predicates-for-records.util.ts" \
  "validate" \
  "RLS validation on record create/update"

echo ""
echo "--- Restricted Fields Filter ---"
check_file_exists \
  "packages/twenty-server/src/engine/api/common/common-select-fields/utils/filter-restricted-fields-from-select.util.ts" \
  "Strip restricted fields instead of rejecting queries"

echo ""
echo "--- Global Search: Custom Object Coverage ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "buildAllFieldIlikeFallbackQuery" \
  "Custom-object global search fallback must search all searchable fields"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "flatObjectMetadata.isCustom" \
  "Search service must keep the custom-object fallback branch"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/search/services/search.service.ts" \
  "getSearchableFieldExpressions" \
  "Search service must derive fallback search expressions from object field metadata"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/search-field-metadata/utils/build-custom-object-search-vector-field-settings.util.ts" \
  "Shared helper for building custom-object searchVector settings"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/search-field-metadata/utils/build-custom-object-search-vector-field-settings.util.ts" \
  "getCustomObjectSearchVectorFields" \
  "Custom-object searchVector helper must filter to active searchable fields"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-metadata/utils/build-default-flat-field-metadatas-for-custom-object.util.ts" \
  "buildCustomObjectSearchVectorFieldSettings" \
  "Default custom objects must build searchVector from the shared helper"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/field-metadata/services/field-metadata.service.ts" \
  "buildCustomObjectSearchVectorUpdate" \
  "Field metadata service must recompute custom-object searchVector on create/delete"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/field-metadata/services/field-metadata.service.ts" \
  "fieldUniversalIdentifiersToRemove" \
  "Field delete path must update custom-object searchVector after removing a field"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/handle-flat-field-metadata-update-side-effect.util.ts" \
  "handleSearchVectorChangesDuringFieldUpdate" \
  "Field update side effects must recompute custom-object searchVector"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/handle-search-vector-changes-during-field-update.util.ts" \
  "Field update helper for custom-object searchVector recomputation"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-object-metadata/utils/recompute-search-vector-field-after-label-identifier-update.util.ts" \
  "buildCustomObjectSearchVectorFieldSettings" \
  "Label-identifier updates must preserve all searchable custom fields in searchVector"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/utils/get-ts-vector-column-expression.util.ts" \
  "getSearchableColumnExpressionsFromField" \
  "Search column expression helper must stay exported for searchVector + fallback reuse"

echo ""
echo "--- Policy Search: Derived Name + Policy Number ---"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-create-one.pre-query.hook.ts" \
  "buildPolicyDisplayName" \
  "Policy create hook must keep deriving display name from carrier/product"
check_file_contains \
  "packages/twenty-server/src/modules/policy/query-hooks/policy-update-one.pre-query.hook.ts" \
  "buildPolicyDisplayName" \
  "Policy update hook must keep deriving display name from carrier/product"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1771600000000-add-policy-number-and-rename.ts" \
  'ADD COLUMN IF NOT EXISTS "policyNumber" text' \
  "Policy number must remain a text field so global search can match pasted policy IDs"

echo ""
echo "--- Required Fields: Backend Entity + Properties ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts" \
  "requiredCondition" \
  "FieldMetadata entity must have requiredCondition JSONB column"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/field-metadata/dtos/field-metadata.dto.ts" \
  "requiredCondition" \
  "FieldMetadata DTO must expose requiredCondition GraphQL field"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-editable-properties.constant.ts" \
  "requiredCondition" \
  "requiredCondition must be in editable properties"

echo ""
echo "--- Edit Window: DTOs and Utils ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/role/dtos/role.dto.ts" \
  "editWindowMinutes" \
  "Role DTO must have editWindowMinutes field"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/object-permission/dtos/object-permission.dto.ts" \
  "editWindowMinutes" \
  "ObjectPermission DTO must have editWindowMinutes field"

echo ""
echo "--- Custom Migrations Exist ---"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1772591146793-add-edit-window-minutes.ts" \
  "Edit window migration"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1772600000000-change-submitted-date-to-datetime.ts" \
  "SubmittedDate datetime migration"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1773069763255-add-field-metadata-required.ts" \
  "Required fields migration"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1775300000000-dedup-calls-and-add-unique-index.ts" \
  "Call dedup migration + unique index on convosoCallId"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1776000000000-add-ingestion-pipeline-dedup-field-names.ts" \
  "Composite dedup migration (dedupFieldNames array column)"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1776100000000-add-time-card-unique-index.ts" \
  "Time Card composite unique index migration"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1778000000000-reconcile-time-card-agent-relation.ts" \
  "Time Card agent relation metadata reconciliation migration"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1778000000000-reconcile-time-card-agent-relation.ts" \
  "ReconcileTimeCardAgentRelation1778000000000" \
  "Time Card relation migration must normalize agent/agentId metadata"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1779200635935-add-call-analytics-indexes.ts" \
  "Call analytics covering indexes migration"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1779200635935-add-call-analytics-indexes.ts" \
  "idx_call_live_billable_date_agent_cover" \
  "Call analytics migration must keep the billable aggregate covering index"
check_file_contains \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1779200635935-add-call-analytics-indexes.ts" \
  "transaction = false" \
  "Call analytics indexes must be created concurrently outside TypeORM migration transactions"

echo ""
echo "--- Ingestion Record Processor: Atomic Dedup ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service.ts" \
  "PG_UNIQUE_VIOLATION" \
  "Record processor must catch unique_violation for atomic dedup (prevents race-condition duplicates)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/services/ingestion-record-processor.service.ts" \
  "buildDedupWhereClause" \
  "Record processor must support composite (multi-field) dedup via dedupFieldNames"

echo ""
echo "--- Time Card Ingestion ---"
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

echo ""
echo "--- Convoso Call Billing ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor.ts" \
  "OMNIA-CUSTOM: inbound calls assigned to the System agent never reached" \
  "Convoso call billing must keep System-handled inbound calls non-billable"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-call.preprocessor.ts" \
  "isSystemHandledInbound" \
  "Convoso call preprocessor must reuse the System-handled inbound signal for agent assignment and billing"

# ==========================================================
# Modified Upstream Frontend Files
# ==========================================================

echo ""
echo "--- Spreadsheet Import: Relation Update Fields ---"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportField.ts" \
  "isRelationUpdateField" \
  "Relation update field support for CSV import"
# extractRelationUpdatesFromImportedRows and executeRelationUpdatesViaMutation
# removed — server-side relation resolution replaces frontend post-processing

echo ""
echo "--- Server: Upsert Relation Connect Tolerance ---"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/field-operations/relation-nested-queries/relation-nested-queries.ts" \
  "isUpsert" \
  "Relation connect must skip gracefully for upsert rows"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/field-operations/relation-nested-queries/relation-nested-queries.ts" \
  "createMissingConnectRecords" \
  "Auto-create missing related records during upsert imports"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/repository/workspace-insert-query-builder.ts" \
  "isUpsert" \
  "Insert query builder must pass isUpsert flag to relation nested queries"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/repository/workspace-update-query-builder.ts" \
  "isUpsert" \
  "Update query builder must pass isUpsert flag to relation nested queries"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/compute-relation-connect-query-configs.util.ts" \
  "keysToUse" \
  "Connect matching must prefer id over other unique constraint fields"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/exceptions/twenty-orm.exception.ts" \
  "IMPORT_PARTIAL_SUCCESS" \
  "IMPORT_PARTIAL_SUCCESS exception code must exist"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/twenty-orm-graphql-api-exception-handler.util.ts" \
  "IMPORT_PARTIAL_SUCCESS" \
  "GraphQL handler must route IMPORT_PARTIAL_SUCCESS with importWarnings"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useBatchCreateManyRecords.ts" \
  "isPartialSuccessError" \
  "Batch hook must detect and handle IMPORT_PARTIAL_SUCCESS"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/components/ImportResultsSummary.tsx" \
  "Import results summary component"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/generateProblemRowsCsv.ts" \
  "Problem rows CSV download utility"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/scoreLeadMatch.ts" \
  "Fuzzy Lead scoring utility"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/findLeadCandidates.ts" \
  "Lead candidate search utility"
check_file_exists \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/applyLeadResolutions.ts" \
  "Lead resolution executor utility"

echo ""
echo "--- CSV Export: View-Driven Relation Configs ---"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/engine-command/record/components/ExportRecordsCommand.tsx" \
  "subFieldName" \
  "Export command must derive relation configs from sub-field columns in the view"

echo ""
echo "--- Server-Side Export Worker ---"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/export-job/export-job.service.ts" \
  "Export job service (creates jobs, queues to BullMQ, publishes progress)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/export-job/jobs/export-job.processor.ts" \
  "Export job BullMQ processor (batched fetch, CSV gen, file storage)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/export-job/export-job.resolver.ts" \
  "Export job GraphQL resolver (start/cancel mutations, query, subscription)"
check_file_exists \
  "packages/twenty-server/src/engine/core-modules/export-job/entities/export-job.entity.ts" \
  "Export job TypeORM entity (core.exportJob table)"
check_file_exists \
  "packages/twenty-server/src/database/typeorm/core/migrations/common/1774400000000-add-export-job-entity.ts" \
  "Migration creating core.exportJob table"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-index/export/hooks/useExportJobProgress.ts" \
  "Frontend export job polling, recovery, and auto-download hooks"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-index/export/components/ExportJobRecoveryEffect.tsx" \
  "Export job recovery effect mounted in app root"
check_file_contains \
  "packages/twenty-shared/src/types/FileFolder.ts" \
  "Export = 'export'" \
  "FileFolder must include Export for server-side CSV storage"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts" \
  "exportQueue" \
  "MessageQueue must include exportQueue for BullMQ export processing"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/file/guards/file-by-id.guard.ts" \
  "FileFolder.Export" \
  "Export folder must be in SUPPORTED_FILE_FOLDERS to allow file downloads"
check_file_contains \
  "packages/twenty-server/src/engine/subscriptions/enums/subscription-channel.enum.ts" \
  "EXPORT_JOB_PROGRESS" \
  "Subscription channel must include EXPORT_JOB_PROGRESS for real-time updates"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/AppRouterProviders.tsx" \
  "ExportJobRecoveryEffect" \
  "App root must mount ExportJobRecoveryEffect for in-progress job recovery"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu-item/engine-command/record/components/ExportRecordsCommand.tsx" \
  "START_EXPORT_JOB" \
  "Export command must call server-side startExportJob mutation"
check_file_contains \
  "packages/twenty-front/src/modules/ui/feedback/background-job-indicator/components/BackgroundJobIndicator.tsx" \
  "AUTO_DISMISS_MS" \
  "BackgroundJobIndicator must auto-dismiss completed jobs"

echo ""
echo "--- Whitespace Trimming ---"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/dataMutations.ts" \
  "trim()" \
  "Validation should trim whitespace"

echo ""
echo "--- Spreadsheet Import Carrier-Config Pre-fill ---"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/setColumn.ts" \
  "ReadonlyDeep<SpreadsheetImportField>" \
  "setColumn must accept ReadonlyDeep<SpreadsheetImportField> for carrier-config pre-fill"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/getMatchedColumnsWithFuse.ts" \
  "precomputedMatches" \
  "getMatchedColumnsWithFuse must accept precomputedMatches param"

echo ""
echo "--- Relation Picker Filtering ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/components/SingleRecordPicker.tsx" \
  "additionalFilter" \
  "SingleRecordPicker must pass additionalFilter through"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/components/MultipleRecordPicker.tsx" \
  "multipleRecordPickerAdditionalFilterComponentState" \
  "MultipleRecordPicker must sync/reset shared additionalFilter state"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts" \
  "forceExcludedRecordIds" \
  "Multiple record picker must support forceExcludedRecordIds"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts" \
  "forceAdditionalFilter" \
  "Multiple record picker search must support forceAdditionalFilter"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts" \
  "combineFilters([excludeFilter, additionalFilter])" \
  "Lead policy allowlist must persist while excluding already-picked records"
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
echo "--- RLS UI: Scoped Draft Sync ---"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionFilterInitialization.ts" \
  "predicate.scope === scope" \
  "Record-level filter initialization must load only predicates for the current scope"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionSyncToDraftRole.ts" \
  "predicate.scope !== scope" \
  "Record-level draft sync must preserve other scopes for the same object"
check_file_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion.ts" \
  "scope," \
  "Record-level predicate conversion must stamp scope onto draft predicates/groups"

echo ""
echo "--- Required Fields: Frontend Core ---"
check_file_contains \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/components/SettingsDataModelFieldSettingsFormCard.tsx" \
  "requiredCondition" \
  "Field settings form must include requiredCondition"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/utils/formatFieldMetadataItemInput.ts" \
  "requiredCondition" \
  "Field metadata input must include requiredCondition in payload"
check_file_contains \
  "packages/twenty-front/src/modules/object-metadata/graphql/fragment.ts" \
  "requiredCondition" \
  "GraphQL fragment must include requiredCondition"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/types/FieldDefinition.ts" \
  "requiredCondition" \
  "FieldDefinition type must include requiredCondition"
check_file_exists \
  "packages/twenty-front/src/modules/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm.tsx" \
  "Required field form component"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useIsFieldRequired.ts" \
  "useIsFieldRequired hook"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useRecordRequiredFieldViolations.ts" \
  "Required field violations hook"

echo ""
echo "--- Required Fields: Side Panel Validation ---"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/components/SidePanelTopBar.tsx" \
  "closeWithValidation" \
  "X button must use closeWithValidation"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/components/SidePanelBackButton.tsx" \
  "goBackWithValidation" \
  "Back button must use goBackWithValidation"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu/hooks/useCommandMenuCloseWithValidation.ts" \
  "record.deletedAt" \
  "Close/back validation must bypass deleted records"
check_file_exists \
  "packages/twenty-front/src/modules/command-menu/components/RequiredFieldsValidationModal.tsx" \
  "Required fields validation modal"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu/hooks/useBeforeUnloadRequiredFieldsCheck.ts" \
  "record.deletedAt" \
  "Deleted records must not block browser unload"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu/hooks/useCleanupNewlyCreatedRecordIds.ts" \
  "record.deletedAt" \
  "Deleted tracked records must be pruned from session storage"
check_file_exists \
  "packages/twenty-front/src/modules/command-menu/hooks/__tests__/useCommandMenuCloseWithValidation.test.tsx" \
  "Deleted-record required-fields regression test"

echo ""
echo "--- Edit Window: Frontend ---"
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

# ==========================================================
# Unique Constraints & Field Uniqueness
# ==========================================================

echo ""
echo "--- Unique Constraint: Phone (not Email) ---"
check_file_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/index/compute-person-standard-flat-index-metadata.util.ts" \
  "phonesUniqueIndex" \
  "Person unique index should be on phones"
check_file_not_contains \
  "packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/index/compute-person-standard-flat-index-metadata.util.ts" \
  "emailsUniqueIndex" \
  "Email unique index should NOT exist"

echo ""
echo "--- Field Uniqueness: Phones unique, Emails not unique ---"
PERSON_FIELD_FILE="packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-person-standard-flat-field-metadata.util.ts"
if [ -f "$PERSON_FIELD_FILE" ]; then
  if awk '/fieldName.*phones/,/\}/' "$PERSON_FIELD_FILE" | grep -q "isUnique: true"; then
    echo -e "${GREEN}OK${NC} Phones field has isUnique: true"
  else
    echo -e "${RED}OVERWRITTEN${NC} $PERSON_FIELD_FILE — Phones field must have isUnique: true"
    ERRORS=$((ERRORS + 1))
  fi
  if awk '/fieldName.*emails/,/\}/' "$PERSON_FIELD_FILE" | grep -q "isUnique: true"; then
    echo -e "${RED}REVERTED${NC} $PERSON_FIELD_FILE — Emails field must NOT have isUnique: true (should be false)"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "${GREEN}OK${NC} Emails field has isUnique: false"
  fi
else
  echo -e "${RED}MISSING${NC} $PERSON_FIELD_FILE"
  ERRORS=$((ERRORS + 1))
fi

# ==========================================================
# Lingui Translations
# ==========================================================

echo ""
echo "--- Lingui Translations ---"
if grep -q "Missing Required Fields" "packages/twenty-front/src/locales/en.po" 2>/dev/null && \
   grep -q "Please fill in: {0}" "packages/twenty-front/src/locales/en.po" 2>/dev/null; then
  echo -e "${GREEN}OK${NC} Lingui translations contain custom strings"
else
  echo -e "${YELLOW}WARNING${NC} Custom Lingui strings missing — run: npx nx run twenty-front:lingui:extract && npx nx run twenty-front:lingui:compile"
  WARNINGS=$((WARNINGS + 1))
fi

# ==========================================================
# Frontend Performance Fixes
# ==========================================================

echo ""
echo "--- Frontend Performance ---"
check_file_not_contains \
  "packages/twenty-front/src/modules/apollo/components/ApolloProvider.tsx" \
  "useApolloClientCachePersist" \
  "ApolloProvider must NOT use cache persist (render-blocking, no timeout)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellDisplayMode.tsx" \
  "RequiredEmptyField" \
  "RecordInlineCellDisplayMode must isolate useIsFieldRequired in RequiredEmptyField sub-component (900+ jotai subs in tables)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useObjectPermissions.ts" \
  "useMemo" \
  "useObjectPermissions must memoize the reduce result (called 300+ times per table render)"
check_file_contains \
  "packages/twenty-front/src/modules/sse-db-event/hooks/useDispatchObjectRecordEventsFromSseToBrowserEvents.ts" \
  "store.get" \
  "SSE dispatch must use store.get() snapshot, not useObjectMetadataItems() hook"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useLazyFindManyRecordsWithOffset.ts" \
  "fetchPolicy: 'no-cache'" \
  "Offset fetch must use no-cache (record table reads from jotai, Apollo 3 has no cache GC)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-index/hooks/useRecordIndexTableLazyQuery.ts" \
  "fetchPolicy: 'no-cache'" \
  "Initial table fetch must use no-cache (record table reads from jotai, Apollo 3 has no cache GC)"
check_file_not_contains \
  "packages/twenty-front/src/modules/apollo/components/ApolloProvider.tsx" \
  "connectToDevTools: true" \
  "connectToDevTools must not be hardcoded true (wastes memory in production)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextGeneric.tsx" \
  "useMemo" \
  "FieldContext value must be memoized (rendered per cell, O(rows × fields))"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextLabelIdentifier.tsx" \
  "useMemo" \
  "Label identifier FieldContext value must be memoized"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellBaseContainer.tsx" \
  "useCallback" \
  "Cell click handler must use useCallback (created per cell)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/components/RecordTableScrollAndZIndexEffect.tsx" \
  "store.get" \
  "Scroll handler must use store.get/store.set (not reactive hooks) to avoid listener teardown loop on mobile"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-cell/components/RecordTableCellWrapper.tsx" \
  "useMemo" \
  "RecordTableCellContext.Provider value must be memoized"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/record-table-row/components/RecordTableTr.tsx" \
  "useMemo" \
  "RecordTableRowContextProvider value must be memoized"
check_file_not_contains \
  "packages/twenty-front/package.json" \
  "apollo3-cache-persist" \
  "apollo3-cache-persist dependency must be removed (dead code after ApolloProvider fix)"

echo ""
echo "--- Custom UI Components ---"
check_file_exists \
  "packages/twenty-ui/src/navigation/link/components/AudioLink.tsx" \
  "AudioLink component for call recording playback"

echo ""
echo "--- Auth / Branding ---"
check_file_contains \
  "packages/twenty-front/src/modules/auth/components/Logo.tsx" \
  "OMNIA-CUSTOM" \
  "Logo.tsx must show workspace logo as primary when no custom primary logo set"
check_file_contains \
  "packages/twenty-front/src/pages/auth/SignInUp.tsx" \
  "OMNIA-CUSTOM" \
  "SignInUp.tsx must show workspace name instead of 'Welcome, X.'"
check_file_contains \
  "packages/twenty-front/src/modules/auth/states/tokenPairState.ts" \
  "OMNIA-CUSTOM" \
  "auth cookie domain widening (shared across sibling subdomains)"
check_file_exists \
  "packages/twenty-shared/src/utils/auth/derive-trusted-redirect-domain.ts" \
  "Trusted external redirect helpers must exist (shared by server + frontend)"
check_file_contains \
  "packages/twenty-shared/src/utils/auth/derive-trusted-redirect-domain.ts" \
  "isExternalRedirectTrusted" \
  "Trust-check helper must be exported for post-sign-in redirects"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/types/social-sso-state.type.ts" \
  "postSignInRedirect" \
  "SocialSSOState must carry postSignInRedirect through OAuth round-trip"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/strategies/google.auth.strategy.ts" \
  "postSignInRedirect" \
  "Google strategy must propagate postSignInRedirect into and out of OAuth state"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/strategies/microsoft.auth.strategy.ts" \
  "postSignInRedirect" \
  "Microsoft strategy must propagate postSignInRedirect into and out of OAuth state"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts" \
  "isExternalRedirectTrusted" \
  "auth.service must trust-check postSignInRedirect against FRONTEND_URL before forwarding"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts" \
  "markEmailAsVerified" \
  "auth.service must mark existing social SSO users as email-verified before issuing /verify login tokens"
check_file_contains \
  "packages/twenty-front/src/modules/auth/states/tokenPairState.ts" \
  "legacyAttributesToRemove" \
  "tokenPairState must clear the legacy host-only auth cookie after moving tokenPair to the shared parent domain"
check_file_contains \
  "packages/twenty-front/src/modules/ui/utilities/state/jotai/utils/createAtomState.ts" \
  "legacyAttributesToRemove" \
  "createAtomState must pass legacy cookie attributes through to cookie storage"
check_file_contains \
  "packages/twenty-front/src/modules/ui/utilities/state/jotai/utils/createJotaiCookieStorage.ts" \
  "legacyAttributesToRemove" \
  "cookie storage must support clearing legacy cookie variants after domain/path migrations"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/components/internal/SignInUpGlobalScopeFormEffect.tsx" \
  "postSignInRedirect" \
  "SignInUpGlobalScopeFormEffect must redirect to trusted postSignInRedirect after sign-in"
check_file_contains \
  "packages/twenty-front/src/modules/auth/components/VerifyLoginTokenEffect.tsx" \
  "postSignInRedirect" \
  "VerifyLoginTokenEffect must redirect to trusted postSignInRedirect after /verify"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useAuth.ts" \
  "postSignInRedirect" \
  "useAuth buildRedirectUrl must forward postSignInRedirect into OAuth kickoff URLs"
check_file_contains \
  "packages/twenty-front/src/modules/auth/hooks/useAuth.ts" \
  "throw error" \
  "useAuth must rethrow non-2FA /verify token-exchange errors so VerifyLoginTokenEffect can leave /verify"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInWithGoogle.ts" \
  "postSignInRedirect" \
  "useSignInWithGoogle must read postSignInRedirect from URL and forward to Google OAuth"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInWithMicrosoft.ts" \
  "postSignInRedirect" \
  "useSignInWithMicrosoft must read postSignInRedirect from URL and forward to Microsoft OAuth"
check_file_exists \
  "packages/twenty-front/src/modules/auth/sign-in-up/components/internal/SignInUpExternalRedirectEffect.tsx" \
  "SignInUpExternalRedirectEffect must exist to honor postSignInRedirect on the already-authed path"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/components/internal/SignInUpExternalRedirectEffect.tsx" \
  "isExternalRedirectTrusted" \
  "SignInUpExternalRedirectEffect must trust-check postSignInRedirect before redirecting"
check_file_contains \
  "packages/twenty-front/src/pages/auth/SignInUp.tsx" \
  "SignInUpExternalRedirectEffect" \
  "SignInUp page must mount SignInUpExternalRedirectEffect so already-authed users honor postSignInRedirect"

echo ""
echo "--- Agentation (Dev Annotation Toolbar) ---"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/App.tsx" \
  "Agentation" \
  "App.tsx must mount <Agentation /> in development for annotation syncing"

echo ""
echo "--- Compressed localStorage ---"
check_file_contains \
  "packages/twenty-front/src/modules/metadata-store/states/metadataStoreState.ts" \
  "createCompressedLocalStorage" \
  "metadataStoreState must use compressed localStorage adapter (Safari 5MB quota)"
check_file_contains \
  "packages/twenty-front/src/modules/ui/utilities/state/jotai/utils/createAtomFamilyState.ts" \
  "customStringStorage" \
  "createAtomFamilyState must support custom string storage adapter"
check_file_exists \
  "packages/twenty-front/src/modules/ui/utilities/state/jotai/utils/createCompressedLocalStorage.ts" \
  "Compressed localStorage adapter using lz-string"
check_file_contains \
  "packages/twenty-front/src/modules/metadata-store/hooks/useLoadMinimalMetadata.ts" \
  ".status === 'empty'" \
  "useLoadMinimalMetadata must treat missing hashes as stale when local store is empty (Redis flush fix)"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/minimal-metadata/minimal-metadata.service.ts" \
  "missingCacheKeys" \
  "MinimalMetadataService must fire-and-forget cache priming for missing entity hashes"

echo ""
echo "--- Invitation Email Branding ---"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/workspace-invitation/services/workspace-invitation.service.ts" \
  "(via Twenty)" \
  "workspace-invitation.service.ts must not contain '(via Twenty)' in sender name"

echo ""
echo "--- Deployment ---"
check_file_contains \
  ".github/workflows/deploy-eks.yaml" \
  "APP_VERSION" \
  "deploy-eks.yaml must pass APP_VERSION build arg for upgrade migrations"

echo ""
echo "--- Mock Data (Deactivated Objects) ---"
check_file_not_contains \
  "packages/twenty-front/src/testing/mock-data/generated/metadata/views/mock-views-data.ts" \
  '"name": "All Companies"' \
  "mock-views-data.ts must not contain Company views"
check_file_not_contains \
  "packages/twenty-front/src/testing/mock-data/generated/metadata/views/mock-views-data.ts" \
  '"name": "All Opportunities"' \
  "mock-views-data.ts must not contain Opportunity TABLE view"

echo ""
echo "--- Timeline Relation Field Diffs ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/event-emitter/utils/object-record-changed-values.ts" \
  "fieldIdByJoinColumnName" \
  "Timeline diff must map relation FK join columns to field names"
check_file_contains \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx" \
  "EventFieldDiffRelationValue" \
  "Timeline field diff must branch RELATION fields to dedicated relation renderer"
check_file_exists \
  "packages/twenty-front/src/modules/activities/timeline-activities/rows/main-object/components/EventFieldDiffRelationValue.tsx" \
  "Relation diff value component must exist"

# ==========================================================
# Draft Record Creation (side panel draft instead of instant empty record)
# ==========================================================

check_file_exists \
  "packages/twenty-front/src/modules/object-record/record-side-panel/states/draftRecordIdsState.ts" \
  "Draft record IDs state must exist"
check_file_exists \
  "packages/twenty-front/src/modules/command-menu-item/components/RecordShowSidePanelCreateRecordButton.tsx" \
  "Side panel Create button must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/hooks/useCreateNewIndexRecord.ts" \
  "openDraftInSidePanel" \
  "Index record creation must use draft approach"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-table/hooks/useCreateNewIndexRecord.ts" \
  "useDraftRecordDefaults" \
  "Index record creation must use the shared draft defaults hook (includes Agent prefill)"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/hooks/useDraftRecordDefaults.ts" \
  "Shared draft defaults hook must exist"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useDraftRecordDefaults.ts" \
  "agentProfile" \
  "Shared draft defaults hook must include direct Agent prefill fallback"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useDraftRecordDefaults.ts" \
  "buildRecordInputFromRLSPredicates" \
  "Shared draft defaults hook must resolve RLS predicate values"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/hooks/usePersistField.ts" \
  "draftRecordIdsState" \
  "usePersistField must have draft guard"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-show/components/RecordShowEffect.tsx" \
  "draftRecordIdsState" \
  "RecordShowEffect must skip fetch for drafts"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-show/components/PageLayoutRecordPageRenderer.tsx" \
  "RecordShowSidePanelCreateRecordButton" \
  "Side panel footer must conditionally show Create button for drafts"
check_file_contains \
  "packages/twenty-front/src/modules/command-menu/hooks/useCommandMenuCloseWithValidation.ts" \
  "draftRecordIdsState" \
  "Close validation must handle draft discard"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/hooks/useAddNewRecordAndOpenSidePanel.ts" \
  "draftRecordIdsState" \
  "Relation create must use draft approach"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/hooks/useAddNewRecordAndOpenSidePanel.ts" \
  "useDraftRecordDefaults" \
  "Relation create must use the shared draft defaults hook (includes Agent prefill + RLS)"
# TODO: CreateRelatedRecordCommand was deleted by upstream's engine-command refactor.
# Draft creation for related records needs to be re-implemented in the new system.
# check_file_contains \
#   "packages/twenty-front/src/modules/command-menu-item/record/single-record/components/CreateRelatedRecordCommand.tsx" \
#   "draftRecordIdsState" \
#   "Command palette create related must use draft approach"

echo ""
echo "--- Relation Sub-Field Table Columns ---"
check_file_contains \
  "packages/twenty-server/src/engine/metadata-modules/view-field/entities/view-field.entity.ts" \
  "subFieldName" \
  "ViewFieldEntity must have subFieldName column for relation sub-field columns"
check_file_contains \
  "packages/twenty-front/src/modules/views/utils/mapViewFieldsToColumnDefinitions.ts" \
  "buildRelationSubFieldColumnDefinition" \
  "mapViewFieldsToColumnDefinitions must handle sub-field ViewFields"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/components/FieldDisplay.tsx" \
  "RelationSubFieldDisplay" \
  "FieldDisplay must route sub-field columns to RelationSubFieldDisplay"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewFieldsHiddenDropdownSection.tsx" \
  "expandedRelationFieldId" \
  "Column picker must support relation sub-field expansion"

# ==========================================================
# Payment Reconciliation v2 (feature/reconciliation-v2)
# ==========================================================
# v1 review UI (ReconciliationReviewPage, PolicyConflictCard, etc.) was
# superseded by v2 and deliberately not ported. See
# memory/project-reconciliation-v2.md for architecture.

echo ""
echo "--- Payment Reconciliation v2 ---"

check_file_exists \
  "packages/twenty-server/src/database/commands/custom/seed-reconciliation-objects.command.ts" \
  "Seed command that creates the Reconciliation + CarrierConfig custom workspace objects"
check_file_contains \
  "packages/twenty-server/src/database/commands/database-command.module.ts" \
  "SeedReconciliationObjectsCommand" \
  "DatabaseCommandModule must register SeedReconciliationObjectsCommand"
check_file_contains \
  "packages/twenty-front/package.json" \
  "@pierre/diffs" \
  "@pierre/diffs dependency required for review UI unified-diff rendering"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts" \
  "reconciliationQueue" \
  "MessageQueue must include reconciliationQueue for the reconciliation pipeline"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/message-queue/message-queue-priority.constant.ts" \
  "MessageQueue.reconciliationQueue" \
  "MESSAGE_QUEUE_PRIORITY must include reconciliationQueue priority"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewBarFilterDropdownAdvancedFilterButton.tsx" \
  "Gracefully hide the advanced filter affordance when no" \
  "Advanced filter button must early-return when no current view (reconciliation review page)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/object-filter-dropdown/hooks/useOptionsForSelect.ts" \
  "useRecordIndexContextOrThrow" \
  "useOptionsForSelect must read object metadata from RecordIndexContext, not the URL (reconciliation review page)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem.tsx" \
  "ReconciliationDiffsContext" \
  "Relation chip must read ReconciliationDiffsContext to render inline diff annotations + change-count badge"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellContainer.tsx" \
  "promotePrimaryPhoneToAdditional" \
  "Inline diff Accept must promote old primary phone/email to additional* (reconciliation review page)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-inline-cell/components/RecordInlineCellContainer.tsx" \
  "fieldDiff.note" \
  "Inline diff must render note as a tooltip over the diff display (reconciliation review page)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/contexts/FieldContext.ts" \
  "note?: string | null" \
  "FieldDiffOverlay must carry note for per-field diff explanations (reconciliation status-change reason)"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor.tsx" \
  "draftRecordIdsState" \
  "RichTextFieldEditor must skip updateOneRecord for draft records (body lives in store until Create)"
check_file_contains \
  "packages/twenty-front/src/modules/activities/components/ActivityRichTextEditor.tsx" \
  "draftRecordIdsState" \
  "ActivityRichTextEditor must skip upsertActivity for side-panel draft tasks/notes (body lives in store until Create)"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/field/components/FieldWidgetRichTextEditor.tsx" \
  "draftRecordIdsState" \
  "FieldWidgetRichTextEditor must skip the loading skeleton for draft records (no server fetch — body is just empty)"
check_file_contains \
  "packages/twenty-shared/src/types/SidePanelPages.ts" \
  "ReviewItemComments" \
  "SidePanelPages enum must include ReviewItemComments for the audit-comments side panel"
check_file_contains \
  "packages/twenty-front/src/modules/side-panel/constants/SidePanelPagesConfig.tsx" \
  "SidePanelReviewItemCommentsPage" \
  "SIDE_PANEL_PAGES_CONFIG must register SidePanelReviewItemCommentsPage for SidePanelPages.ReviewItemComments"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewBarFilterDropdown.tsx" \
  "dropdownId = ViewBarFilterDropdownIds.MAIN" \
  "ViewBarFilterDropdown must accept an optional dropdownId prop (scoped filter UIs need their own Dropdown atom)"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewBarDetailsAddFilterButton.tsx" \
  "dropdownId = ViewBarFilterDropdownIds.MAIN" \
  "ViewBarDetailsAddFilterButton must accept an optional dropdownId prop"
check_file_contains \
  "packages/twenty-front/src/modules/views/components/ViewBarDetails.tsx" \
  "addFilterDropdownId" \
  "ViewBarDetails must forward addFilterDropdownId to ViewBarDetailsAddFilterButton"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationReviewPageContent.tsx" \
  "ContextStorePageType.Record" \
  "Reconciliation review page must set pageType=Record so standard pinned command-menu items appear in the header"
check_file_contains \
  "packages/twenty-front/src/modules/reconciliation/components/ReconciliationReviewPageContent.tsx" \
  "SidePanelToggleButton" \
  "Reconciliation review page must mount the SidePanelToggleButton (cmd+K hotkey entry point) in the header"
check_file_exists \
  "packages/twenty-shared/src/utils/composite/promotePrimaryToAdditional.ts" \
  "Shared helper used by frontend + backend reconciliation Accept paths"

echo ""

# ==========================================================
# Geo-Map Service: per-request config read
# ==========================================================
# Upstream caches GOOGLE_MAP_API_KEY in the constructor, but DatabaseConfigDriver
# loads its cache in async onModuleInit (which runs AFTER provider constructors),
# so DB-only deploys (us) cache `undefined` and every Places call fails silently
# with `?key=undefined` → REQUEST_DENIED → empty array. Read per-request instead.
echo "--- Geo-Map Service: per-request config read ---"
check_file_contains \
  "packages/twenty-server/src/engine/core-modules/geo-map/services/geo-map.service.ts" \
  "private getApiMapKey()" \
  "Geo-map service must read GOOGLE_MAP_API_KEY per-request, not in the constructor (DB config driver loads after provider init)"
check_file_not_contains \
  "packages/twenty-server/src/engine/core-modules/geo-map/services/geo-map.service.ts" \
  "private apiMapKey:" \
  "Geo-map service must not cache apiMapKey in a field (DB-only deploys cache undefined at boot)"

echo ""

# ==========================================================
# Summary
# ==========================================================

echo ""
echo "============================================"
echo ""
echo "--- Ingestion Pipeline Settings ---"
check_file_contains \
  "packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx" \
  "SettingsIngestionPipelines" \
  "Settings routes must include Ingestion Pipeline pages"
check_file_exists \
  "packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/ingestion-pipeline.module.ts" \
  "Ingestion pipeline server module"

echo ""
echo "--- FieldsWidget Honors Field-Level Read Permissions ---"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/fields/hooks/useFieldsWidgetGroups.ts" \
  "objectMetadataItem.readableFields" \
  "FieldsWidget groups must filter by readableFields so restricted fields (LTV, paidThroughDate for members) drop out"
check_file_contains \
  "packages/twenty-front/src/modules/page-layout/widgets/fields/hooks/useFieldsWidgetHiddenFields.ts" \
  "objectMetadataItem.readableFields" \
  "FieldsWidget hidden-fields list must filter by readableFields"

echo ""
echo "--- Insert Field Permission Skip ---"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/repository/permissions.utils.ts" \
  "Field-level restrictions" \
  "INSERT case must skip field-level permission checks (pre-query hooks set restricted fields)"

echo ""
echo "--- localStorage Cache Bust on App Version Change ---"
check_file_contains \
  "packages/twenty-front/src/modules/client-config/hooks/useClientConfig.ts" \
  "omnia.cachedAppVersion" \
  "useClientConfig must clear localStorage when clientConfig.appVersion differs from the cached version (post-upstream-merge stale-cache fix)"

echo ""
echo "--- Timeline Field Diff: Before → After ---"
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
