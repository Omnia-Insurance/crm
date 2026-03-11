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

  if ! grep -q "$pattern" "$file" 2>/dev/null; then
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

  if grep -q "$pattern" "$file" 2>/dev/null; then
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

echo "--- Critical: RLS Indirect Relation Resolution ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts" \
  "intermediateObjectInfo" \
  "Indirect RLS resolution (Agent→WM) — members can't create policies without this"

echo ""
echo "--- Critical: Organization Plan Gate Removed ---"
check_file_not_contains \
  "packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelObjectForm.tsx" \
  "isRLSBillingEntitlementEnabled" \
  "Organization plan gate should be removed — RLS always enabled"

echo ""
echo "--- Critical: Sidebar Customization ---"
check_file_not_contains \
  "packages/twenty-front/src/modules/navigation/components/MainNavigationDrawer.tsx" \
  "Documentation" \
  "Documentation link should be removed from sidebar"

echo ""
echo "--- Critical: Member Home Page Redirect ---"
check_file_contains \
  "packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts" \
  "person" \
  "Members should land on People (Leads) page, not alphabetical first object"

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
  "isDirectRelation" \
  "Backend RLS must support indirect relations"
check_file_contains \
  "packages/twenty-server/src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts" \
  "00000000-0000-0000-0000-000000000000" \
  "Deny-by-default when predicates can't resolve"

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

# ==========================================================
# Modified Upstream Frontend Files
# ==========================================================

echo ""
echo "--- Spreadsheet Import: Relation Update Fields ---"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/types/SpreadsheetImportField.ts" \
  "isRelationUpdateField" \
  "Relation update field support for CSV import"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/extractRelationUpdatesFromImportedRows.ts" \
  "Extract relation updates utility"
check_file_exists \
  "packages/twenty-front/src/modules/object-record/spreadsheet-import/utils/executeRelationUpdatesViaMutation.ts" \
  "Execute relation updates utility"

echo ""
echo "--- CSV Export: Composite Field Splitting ---"
check_file_not_contains \
  "packages/twenty-front/src/modules/object-record/object-options-dropdown/hooks/useExportProcessRecordsForCSV.ts" \
  "formatPhoneNumber" \
  "Composite fields should be kept as objects, not flattened"

echo ""
echo "--- Whitespace Trimming ---"
check_file_contains \
  "packages/twenty-front/src/modules/spreadsheet-import/utils/dataMutations.ts" \
  "trim()" \
  "Validation should trim whitespace"

echo ""
echo "--- Relation Picker Filtering ---"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/single-record-picker/components/SingleRecordPicker.tsx" \
  "additionalFilter" \
  "SingleRecordPicker must pass additionalFilter through"
check_file_contains \
  "packages/twenty-front/src/modules/object-record/record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts" \
  "forceExcludedRecordIds" \
  "Multiple record picker must support forceExcludedRecordIds"

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
check_file_exists \
  "packages/twenty-front/src/modules/command-menu/hooks/useCommandMenuCloseWithValidation.ts" \
  "Close with validation hook"
check_file_exists \
  "packages/twenty-front/src/modules/command-menu/components/RequiredFieldsValidationModal.tsx" \
  "Required fields validation modal"

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
# Summary
# ==========================================================

echo ""
echo "============================================"
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
