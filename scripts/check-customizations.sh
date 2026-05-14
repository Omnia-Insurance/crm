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
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInWithGoogle.ts" \
  "postSignInRedirect" \
  "useSignInWithGoogle must read postSignInRedirect from URL and forward to Google OAuth"
check_file_contains \
  "packages/twenty-front/src/modules/auth/sign-in-up/hooks/useSignInWithMicrosoft.ts" \
  "postSignInRedirect" \
  "useSignInWithMicrosoft must read postSignInRedirect from URL and forward to Microsoft OAuth"

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
