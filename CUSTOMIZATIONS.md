# Omnia CRM Customizations

This document tracks all modifications made on top of upstream [twentyhq/twenty](https://github.com/twentyhq/twenty). **Check this file after every upstream merge** to verify nothing was overwritten.

Use `OMNIA-CUSTOM` markers in code to tag custom sections. After merging upstream, run:
```bash
./scripts/check-customizations.sh
```

---

## Critical Files (Repeatedly Wiped by Upstream Merges)

These files have been overwritten by upstream merges multiple times. **Always verify after merge.**

| File | What We Changed | Why |
|------|----------------|-----|
| `packages/twenty-front/src/modules/object-record/hooks/useBuildRecordInputFromRLSPredicates.ts` | Indirect RLS relation resolution (Agent → WorkspaceMember) | Members can't create policies without it — frontend throws before mutation |
| `packages/twenty-front/src/modules/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelObjectForm.tsx` | Removed Organization plan gate on RLS | Self-hosted, no billing — RLS must always be available |
| `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawer.tsx` | Sidebar: Settings at top, Documentation removed, Search restored | UX preferences |
| `packages/twenty-front/src/modules/navigation/hooks/useDefaultHomePagePath.ts` | Members always land on People (Leads) page; skip last-visited storage for non-admins | Members shouldn't land on non-sidebar pages like Agents |
| `packages/twenty-front/src/locales/*.po` and `src/locales/generated/*.ts` | Custom Lingui translations | Must re-run `lingui extract && lingui compile` after upstream merge |
| `packages/twenty-server/src/engine/metadata-modules/role/role.entity.ts` | Added `editWindowMinutes` column | Configurable edit window per role |
| `packages/twenty-server/src/engine/metadata-modules/object-permission/object-permission.entity.ts` | Added `editWindowMinutes` column | Per-object edit window override |
| `packages/twenty-server/src/engine/metadata-modules/role/services/workspace-roles-permissions-cache.service.ts` | Resolves `editWindowMinutes` in cache | Edit window enforcement depends on this |
| `packages/twenty-shared/src/types/ObjectPermissions.ts` | Added `editWindowMinutes` to shared type | Both server + frontend depend on this |

## Custom Server Modules (Entirely New)

These directories are 100% Omnia code. Upstream won't touch them, but verify they're still registered in their parent modules.

### `packages/twenty-server/src/modules/agent-profile/`
- `agent-profile.module.ts` — Module registration
- `services/agent-profile-resolver.service.ts` — Resolves AgentProfile ID from WorkspaceMember ID for RLS and pre-query hooks

### `packages/twenty-server/src/modules/policy/`
- `query-hooks/policy-create-one.pre-query.hook.ts` — Auto-assigns agentId + derives name before insert (required for RLS)
- `query-hooks/policy-create-many.pre-query.hook.ts` — Same for bulk create
- `query-hooks/policy-create-one.post-query.hook.ts` — Sets submittedDate, LTV after insert
- `query-hooks/policy-create-many.post-query.hook.ts` — Same for bulk
- `query-hooks/policy-update-one.pre-query.hook.ts` — Re-derives name on carrier/product change + **configurable edit window enforcement** (reads `editWindowMinutes` from `rolesPermissions` cache per role/object, null = no restriction; admins always bypass)
- `query-hooks/policy-update-many.pre-query.hook.ts` — Same for bulk update + same edit window enforcement
- `utils/format-duration.util.ts` — Human-readable duration formatting for edit window error messages
- `query-hooks/policy-update-one.post-query.hook.ts` — Recalculates LTV on update
- `query-hooks/policy-update-many.post-query.hook.ts` — Same for bulk
- `query-hooks/policy-query-hook.module.ts` — Module registration (imports `WorkspaceCacheModule` for role checks)
- `utils/build-policy-display-name.util.ts` — "Carrier - Product" name derivation
- `utils/enrich-policy-after-save.util.ts` — Post-save enrichment (LTV, dates)
- `utils/get-today-for-member.util.ts` — `getNowUtc()` helper (returns UTC ISO string for submittedDate)
- `utils/lookup-carrier-product-commission.util.ts` — LTV lookup from CarrierProduct

### `packages/twenty-server/src/modules/call/`
- `query-hooks/call-create-one.pre-query.hook.ts` — Auto-assigns agentId on call create
- `query-hooks/call-create-many.pre-query.hook.ts` — Same for bulk
- `query-hooks/call-create-one.post-query.hook.ts` — Post-create enrichment
- `query-hooks/call-create-many.post-query.hook.ts` — Same for bulk
- `query-hooks/call-query-hook.module.ts` — Module registration

### `packages/twenty-apps/internal/compliance-qa/`
- `src/application-config.ts` — App registration (Compliance QA)
- `src/objects/qa-scorecard.ts` — QA Scorecard object definition with 25+ fields (scores, red flags, rich text details)
- `src/constants/compliance-rules.ts` — All compliance rules, scripts, scoring criteria, red flag definitions, AI prompts
- `src/logic-functions/analyze-call-compliance.ts` — Two-pass AI analysis (red flags + full scorecard) via HTTP endpoint
- `src/logic-functions/backfill-compliance-qa.ts` — Batch backfill for existing call recordings
- `src/utils/transcribe-recording.ts` — Deepgram Nova-3 batch transcription with speaker diarization
- `src/utils/call-ai.ts` — Wrapper for Twenty's AI text generation endpoint
- `src/roles/default-role.ts` — App role with read/write/AI permissions
- `src/views/qa-scorecard-view.ts` — Default list view for QA Scorecards
- `src/navigation-menu-items/qa-scorecard-navigation-menu-item.ts` — Sidebar navigation entry

### `packages/twenty-server/src/engine/metadata-modules/ingestion-pipeline/`
Full ingestion pipeline engine — configurable pull/push data pipelines with field mappings, preprocessors, scheduling, and logging.
- `ingestion-pipeline.module.ts` — Module registration
- `entities/ingestion-pipeline.entity.ts` — Pipeline entity (mode, schedule, source config, auth, pagination, dedup)
- `entities/ingestion-field-mapping.entity.ts` — Per-field mapping entity (source path → target field, transforms)
- `entities/ingestion-log.entity.ts` — Ingestion run log (status, counts, errors, incoming payload)
- `services/ingestion-pipeline.service.ts` — CRUD + test execution for pipelines
- `services/ingestion-pull-scheduler.service.ts` — Cron-based pull scheduling on server startup
- `services/ingestion-record-processor.service.ts` — Processes ingested rows: maps fields, resolves relations, upserts records
- `services/ingestion-relation-resolver.service.ts` — Resolves relation fields by lookup during ingestion
- `services/ingestion-field-mapping.service.ts` — CRUD for field mappings
- `services/ingestion-log.service.ts` — Log queries and creation
- `controllers/ingestion-pipeline-webhook.controller.ts` — Push-mode webhook endpoint (receives external payloads)
- `jobs/ingestion-pull.job.ts` — BullMQ job: fetches data from source URL, processes records
- `jobs/ingestion-push-process.job.ts` — BullMQ job: processes pushed webhook payloads
- `jobs/ingestion-job.module.ts` — Job module registration
- `resolvers/ingestion-pipeline.resolver.ts` — GraphQL CRUD + test mutation
- `resolvers/ingestion-field-mapping.resolver.ts` — GraphQL CRUD for field mappings
- `resolvers/ingestion-log.resolver.ts` — GraphQL log queries
- `preprocessors/ingestion-preprocessor.registry.ts` — Registry for pipeline-specific preprocessors
- `preprocessors/old-crm-policy.preprocessor.ts` — Old CRM policy ingestion: person resolution, carrier/product creation, `parseDateTimeAsEastern()` for `submittedDate` (Eastern → UTC)
- `preprocessors/healthsherpa-policy.preprocessor.ts` — HealthSherpa policy ingestion preprocessor
- `preprocessors/convoso-call.preprocessor.ts` — Convoso call ingestion preprocessor
- `preprocessors/convoso-lead.preprocessor.ts` — Convoso lead ingestion preprocessor
- `utils/build-record-from-mappings.util.ts` — Builds record from field mappings + source data
- `utils/apply-field-transform.util.ts` — Field value transforms (date, number, etc.)
- `utils/extract-value-by-path.util.ts` — Dot-path value extraction from nested objects
- `database/typeorm/core/migrations/common/1771284860000-add-ingestion-pipeline-entities.ts` — **Migration** creating `ingestionPipeline`, `ingestionFieldMapping`, `ingestionLog` tables
- `database/typeorm/core/migrations/common/1771400000000-add-ingestion-log-incoming-payload.ts` — **Migration** adding `incomingPayload` column to `ingestionLog`

### `packages/twenty-server/src/modules/lead/`
- `query-hooks/lead-create-one.pre-query.hook.ts` — Lead pre-processing
- `query-hooks/lead-create-many.pre-query.hook.ts` — Same for bulk
- `query-hooks/person-create-one.pre-query.hook.ts` — Person/Lead creation hooks
- `query-hooks/person-create-many.pre-query.hook.ts` — Same for bulk
- `query-hooks/lead-query-hook.module.ts` — Module registration

## Modified Upstream Frontend Files

### Spreadsheet Import (CSV Import/Export)
| File | Modification |
|------|-------------|
| `spreadsheet-import/types/SpreadsheetImportField.ts` | Added `isRelationUpdateField` and `targetFieldMetadataItem` properties |
| `object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields.ts` | Added relation update fields to import dropdown |
| `object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog.ts` | Execute relation updates after parent upsert |
| `object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow.ts` | Explicit `isRelationConnectField` filter |
| `object-record/object-options-dropdown/hooks/useExportProcessRecordsForCSV.ts` | Keep composite fields as objects for proper sub-field export |
| `object-record/record-index/export/hooks/useRecordIndexExportRecords.ts` | Split composite relation sub-fields into separate CSV columns |
| `spreadsheet-import/utils/dataMutations.ts` | Trim whitespace before validation |
| `spreadsheet-import/utils/normalizeTableData.ts` | Trim whitespace on matched column values |

### New Spreadsheet Import Utilities
| File | Purpose |
|------|---------|
| `object-record/spreadsheet-import/utils/executeRelationUpdatesViaMutation.ts` | Execute batched createMany upserts for relation updates |
| `object-record/spreadsheet-import/utils/extractRelationUpdatesFromImportedRows.ts` | Extract relation update data from imported rows |
| `object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldKey.ts` | Key format for update fields |
| `object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldLabel.ts` | Label format for update fields |

### RLS and Permissions
| File | Modification |
|------|-------------|
| `object-record/hooks/useBuildRecordInputFromRLSPredicates.ts` | **CRITICAL** — Indirect relation resolution for Agent → WorkspaceMember |
| `settings/roles/.../SettingsRolePermissionsObjectLevelObjectForm.tsx` | Removed Organization plan billing gate |

### Relation Picker Filtering (Policy Assignment)
| File | Modification |
|------|-------------|
| `record-field-list/.../RecordDetailRelationSectionDropdownToOne.tsx` | Junction bridge filter fix + resolves dependency filter to id-based via `useFindManyRecords` (search API can't filter by object-specific fields like `carrierId`) |
| `record-field-list/.../RecordDetailRelationSectionDropdownToMany.tsx` | Excludes policies already assigned to other leads from the policy picker on lead detail sidebar |
| `record-picker/single-record-picker/components/SingleRecordPicker.tsx` | Passes `additionalFilter` through to `SingleRecordPickerMenuItemsWithSearch` (was silently dropped) |
| `record-picker/multiple-record-picker/hooks/useMultipleRecordPickerPerformSearch.ts` | Added `forceExcludedRecordIds` param + persists excluded IDs in atom for subsequent searches |
| `record-picker/multiple-record-picker/states/multipleRecordPickerExcludedRecordIdsComponentState.ts` | **NEW** — Atom for persisting excluded record IDs across picker searches |
| `record-field/ui/meta-types/input/components/RelationOneToManyFieldInput.tsx` | Fetches policies assigned to other leads and triggers initial search with exclusions (table cell inline edit) |
| `record-field/ui/meta-types/input/hooks/useOpenRelationFromManyFieldInput.tsx` | Removed `performSearch` — initial search moved to `RelationOneToManyFieldInput` so excluded IDs are applied before results show |
| `record-field/ui/hooks/useOpenFieldInputEditMode.ts` | Removed unused `excludedRecordIds` param |

### Required Fields (Per-Field Validation with Conditional Rules)
| File | Modification |
|------|-------------|
| `settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm.tsx` | **NEW** — Required toggle + conditional rule builder (Always / When [field] is [empty/not empty]) |
| `settings/data-model/fields/forms/components/SettingsDataModelFieldSettingsFormCard.tsx` | Added `requiredCondition` to all field type form schemas + renders Required form |
| `settings/data-model/fields/forms/number/components/SettingsDataModelFieldNumberSettingsFormCard.tsx` | Added Required form |
| `settings/data-model/fields/forms/components/text/SettingsDataModelFieldTextSettingsFormCard.tsx` | Added Required form |
| `settings/data-model/fields/forms/date/components/SettingsDataModelFieldDateSettingsFormCard.tsx` | Added Required form |
| `settings/data-model/fields/forms/phones/components/SettingsDataModelFieldPhonesSettingsFormCard.tsx` | Added Required form |
| `settings/data-model/fields/forms/address/components/SettingsDataModelFieldAddressSettingsFormCard.tsx` | Added Required form |
| `settings/data-model/fields/forms/boolean/components/SettingsDataModelFieldBooleanSettingsFormCard.tsx` | Added Required form |
| `settings/data-model/fields/forms/currency/components/SettingsDataModelFieldCurrencySettingsFormCard.tsx` | Added Required form |
| `settings/data-model/fields/forms/select/components/SettingsDataModelFieldSelectSettingsFormCard.tsx` | Added Required form |
| `settings/data-model/fields/forms/morph-relation/components/SettingsDataModelFieldRelationFormCard.tsx` | Added Required form |
| `object-metadata/utils/formatFieldMetadataItemInput.ts` | Added `requiredCondition` to field update payload |
| `object-metadata/hooks/useUpdateOneFieldMetadataItem.ts` | Added `requiredCondition` to mutation payload type |
| `object-metadata/graphql/fragment.ts` | Added `requiredCondition` to `fieldsList` GraphQL fragment |
| `object-metadata/utils/formatFieldMetadataItemAsFieldDefinition.ts` | Passes `requiredCondition` into `FieldDefinition` |
| `object-record/record-field/ui/types/FieldDefinition.ts` | Added `RequiredCondition` type and `requiredCondition` field |
| `object-record/record-inline-cell/components/RecordInlineCellDisplayMode.tsx` | Red placeholder text for required empty inline fields |
| `object-record/record-field/ui/hooks/useIsFieldRequired.ts` | **NEW** — Hook evaluating `requiredCondition` against current field/record state |
| `object-record/record-field-list/record-detail-section/components/RecordDetailSectionContainer.tsx` | Red title label when `isRequired` prop is true (non-widget layout path) |
| `object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationSection.tsx` | Passes `isRequired` from `useIsFieldRequired` to section container |
| `page-layout/widgets/field/components/FieldWidget.tsx` | Computes `isRequiredEmpty` for relation widgets, sets widget-level state for red title |
| `page-layout/widgets/widget-card/components/WidgetCardHeader.tsx` | Added `isRequiredEmpty` prop — turns title red when relation is required and empty |
| `page-layout/widgets/components/WidgetRenderer.tsx` | Reads `widgetCardRequiredEmptyComponentFamilyState` and passes to `WidgetCardHeader` |
| `page-layout/widgets/states/widgetCardRequiredEmptyComponentFamilyState.ts` | **NEW** — Jotai family state for per-widget required-empty status |
| `generated-metadata/graphql.ts` | Added `requiredCondition` to Field type, CreateFieldInput, UpdateFieldInput, and all query fragments |
| `object-record/record-field/ui/hooks/useRecordRequiredFieldViolations.ts` | **NEW** — Batch validation: returns all required-field violations for a record (used by close validation) |
| `object-record/record-side-panel/states/newlyCreatedRecordIdsState.ts` | **NEW** — Jotai atom tracking record IDs created via the side panel (was `record-right-drawer/`) |
| `side-panel/hooks/useOpenRecordInSidePanel.ts` | Adds record ID to `newlyCreatedRecordIdsState` when `isNewRecord: true` (was `command-menu/hooks/useOpenRecordInCommandMenu.ts`) |
| `command-menu/hooks/useCommandMenuCloseWithValidation.ts` | **NEW** — Wraps close/back with required-field validation; shows modal if new record has violations |
| `command-menu/states/requiredFieldsValidationState.ts` | **NEW** — Jotai atom for pending validation modal data |
| `command-menu/components/RequiredFieldsValidationModal.tsx` | **NEW** — Confirmation modal: "Delete Record" or "Go Back" when required fields are empty |
| `side-panel/components/SidePanelTopBar.tsx` | X button uses `closeWithValidation` instead of `closeSidePanelMenu` (was `CommandMenuTopBar.tsx`) |
| `command-menu/components/CommandMenuOpenContainer.tsx` | Click-outside uses `closeWithValidation` instead of `closeSidePanelMenu` |
| `side-panel/components/SidePanelBackButton.tsx` | Back button uses `goBackWithValidation` instead of `goBackFromSidePanel` (was `CommandMenuBackButton.tsx`) |
| `command-menu/hooks/useCommandMenuHotKeys.ts` | Escape/Backspace/Delete use `goBackWithValidation` instead of `goBackFromSidePanel` |
| `side-panel/components/SidePanelForDesktop.tsx` | Collapse uses `closeWithValidation`; renders `RequiredFieldsValidationModal`; cleanup + beforeunload hooks (was `CommandMenuSidePanelForDesktop.tsx`) |
| `command-menu/hooks/useBeforeUnloadRequiredFieldsCheck.ts` | **NEW** — Blocks browser refresh/close when newly created records have required field violations |
| `command-menu/hooks/useCleanupNewlyCreatedRecordIds.ts` | **NEW** — Prunes stale record IDs from sessionStorage on app startup |
| `object-record/record-field/ui/meta-types/input/hooks/useAddNewRecordAndOpenRightDrawer.ts` | Added `isNewRecord: true` so "Add new" from relation fields is tracked for validation |

### Other Frontend
| File | Modification |
|------|-------------|
| `packages/twenty-ui/src/navigation/link/components/AudioLink.tsx` | **NEW** — Audio player component for call recordings (inline pill with `<audio>` controls) |

## Modified Upstream Server Files

### Application Deployment
| File | Modification |
|------|-------------|
| `engine/core-modules/application/resolvers/application-development.resolver.ts` | Removed `DevelopmentGuard` — allows `app:dev` deployment on self-hosted production server |

### RLS / Permissions Engine
| File | Modification |
|------|-------------|
| `engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts` | Indirect relation support, deny-by-default when predicates can't resolve |
| `engine/twenty-orm/utils/validate-rls-predicates-for-records.util.ts` | RLS validation on record create/update |
| `engine/api/common/common-select-fields/utils/filter-restricted-fields-from-select.util.ts` | **NEW** — Strip restricted fields instead of rejecting queries |

### Configurable Edit Window (Per-Role, Per-Object)
| File | Modification |
|------|-------------|
| `engine/metadata-modules/role/role.entity.ts` | Added `editWindowMinutes` column (nullable integer) — global default per role |
| `engine/metadata-modules/object-permission/object-permission.entity.ts` | Added `editWindowMinutes` column (nullable integer) — per-object override |
| `engine/metadata-modules/role/dtos/role.dto.ts` | Added `editWindowMinutes` GraphQL field |
| `engine/metadata-modules/role/dtos/update-role.input.ts` | Added `editWindowMinutes` input field |
| `engine/metadata-modules/role/dtos/create-role.input.ts` | Added `editWindowMinutes` input field |
| `engine/metadata-modules/object-permission/dtos/object-permission.dto.ts` | Added `editWindowMinutes` GraphQL field |
| `engine/metadata-modules/object-permission/dtos/upsert-object-permissions.input.ts` | Added `editWindowMinutes` input field |
| `engine/metadata-modules/role/services/workspace-roles-permissions-cache.service.ts` | Resolves `editWindowMinutes`: object override → role default → null (no restriction) |
| `engine/metadata-modules/role/utils/fromRoleEntityToRoleDto.util.ts` | Maps `editWindowMinutes` to DTO |
| `engine/metadata-modules/flat-role/utils/from-create-role-input-to-flat-role-to-create.util.ts` | Includes `editWindowMinutes` in role creation |
| `engine/metadata-modules/flat-role/utils/from-role-entity-to-flat-role.util.ts` | Includes `editWindowMinutes` in flat role |
| `engine/core-modules/application/utils/from-role-manifest-to-universal-flat-role.util.ts` | Defaults `editWindowMinutes: null` |
| `engine/workspace-manager/.../create-standard-role-flat-metadata.util.ts` | Defaults `editWindowMinutes: null` for standard roles |
| `engine/twenty-orm/utils/compute-permission-intersection.util.ts` | Includes `editWindowMinutes: null` in permission intersection |
| `database/typeorm/core/migrations/common/1772591146793-add-edit-window-minutes.ts` | **NEW** migration adding column to `role` and `objectPermission` tables |
| `database/typeorm/core/migrations/common/1772600000000-change-submitted-date-to-datetime.ts` | **NEW** migration changing policy `submittedDate` from DATE to DATE_TIME (timestamptz), converts existing dates as Eastern midnight |

**Frontend — Edit Window UI:**
| File | Modification |
|------|-------------|
| `settings/roles/.../SettingsRolePermissionsObjectLevelEditWindowRow.tsx` | **NEW** — Duration selector row (No limit, 5min–7 days) in object permissions form |
| `settings/roles/.../SettingsRolePermissionsObjectLevelObjectFormObjectLevel.tsx` | Added `EditWindowRow` below existing permission checkboxes |
| `settings/roles/graphql/fragments/roleFragment.ts` | Added `editWindowMinutes` to query |
| `settings/roles/graphql/fragments/objectPermissionFragment.ts` | Added `editWindowMinutes` to query |
| `settings/roles/role/hooks/useSaveDraftRoleToDB.ts` | Includes `editWindowMinutes` in create/update role + object permission upsert payloads |

**Shared types:**
| File | Modification |
|------|-------------|
| `packages/twenty-shared/src/types/ObjectPermissions.ts` | Added `editWindowMinutes: number \| null` |

### Required Fields (Field Metadata Extension)
| File | Modification |
|------|-------------|
| `engine/metadata-modules/field-metadata/field-metadata.entity.ts` | Added `requiredCondition` JSONB column (`{type: 'always'|'fieldEmpty'|'fieldNotEmpty', fieldId?: string}`) |
| `engine/metadata-modules/field-metadata/dtos/field-metadata.dto.ts` | Added `requiredCondition` GraphQL field |
| `engine/metadata-modules/flat-field-metadata/utils/from-flat-field-metadata-to-field-metadata-dto.util.ts` | Added `requiredCondition` to DTO mapping (read path) |
| `engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-editable-properties.constant.ts` | Added `requiredCondition` to custom + standard editable properties |
| `engine/metadata-modules/flat-field-metadata/constants/flat-field-metadata-relation-properties-to-compare.constant.ts` | Added `requiredCondition` to relation field editable properties |
| `engine/metadata-modules/flat-entity/constant/all-entity-properties-configuration-by-metadata-name.constant.ts` | Added `requiredCondition` property config |
| `database/typeorm/core/migrations/common/1773069763255-add-field-metadata-required.ts` | **NEW** migration adding `requiredCondition` to `fieldMetadata` table |

### Standard Object Index (Unique Constraints)
| File | Modification |
|------|-------------|
| `engine/workspace-manager/.../compute-person-standard-flat-field-metadata.util.ts` | Emails `isUnique: false`, Phones `isUnique: true` (upstream default is reversed) |
| `engine/workspace-manager/.../compute-person-standard-flat-index-metadata.util.ts` | Phone is unique (not email) |

## Fragile Import Dependencies (Check After Upstream Renames)

Our custom files import from upstream modules that may be renamed/moved. After merging, grep for broken imports:

```bash
npx nx typecheck twenty-front  # Catches TS2307 "Cannot find module" errors
npx nx typecheck twenty-ui     # AudioLink etc.
```

| Our Custom File | Imports From (upstream) | Previously Was |
|----------------|------------------------|----------------|
| `command-menu/hooks/useCommandMenuCloseWithValidation.ts` | `@/side-panel/hooks/useSidePanelMenu`, `@/side-panel/hooks/useSidePanelHistory`, `@/side-panel/states/*` | `@/command-menu/hooks/useCommandMenu`, `@/command-menu/hooks/useCommandMenuHistory` |
| `command-menu/hooks/useCommandMenuHotKeys.ts` | `@/side-panel/hooks/useSidePanelMenu`, `@/side-panel/constants/*` | `@/command-menu/hooks/useCommandMenu` |
| `command-menu/components/CommandMenuOpenContainer.tsx` | `@/side-panel/types/*`, `@/side-panel/constants/*` | `@/command-menu/types/*` |
| `navigation/components/MainNavigationDrawer.tsx` | `@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel` | `@/command-menu/hooks/useOpenRecordsSearchPageInCommandMenu` |
| `side-panel/hooks/useOpenRecordInSidePanel.ts` | `@/object-record/record-side-panel/states/newlyCreatedRecordIdsState` | `@/object-record/record-right-drawer/states/...` |
| `packages/twenty-ui/.../AudioLink.tsx` | `@ui/theme-constants` (for `ThemeContext`) | Was `@ui/theme` |
| `settings/.../EditWindowRow.tsx` | `twenty-ui/theme-constants` (for `ThemeContext`) | Was `twenty-ui/theme` |

## Post-Merge Checklist

After every upstream merge:

1. **Run the check script**: `./scripts/check-customizations.sh`
2. **Run typecheck**: `npx nx typecheck twenty-front && npx nx typecheck twenty-ui` — catches broken imports from upstream renames
3. **Re-extract Lingui**: `npx nx run twenty-front:lingui:extract && npx nx run twenty-front:lingui:compile`
4. **Verify RLS works**: Log in as member role, create a policy from Policies page
5. **Verify sidebar**: Settings at top, no Documentation link, Search in sidebar
6. **Verify member login redirect**: Log in as member — should land on People (Leads), not alphabetical first object
7. **Verify RLS settings UI**: No "Upgrade to access" gate on Record-level permissions
8. **Verify edit window**: Settings → Roles → Member → Permissions → Policy → "Edit window" dropdown present, saves correctly
9. **Verify required fields**: Settings → Data Model → Policy → any field → "Required" toggle present with condition options
10. **Verify uniqueness flags**: Emails `isUnique: false`, Phones `isUnique: true` in `compute-person-standard-flat-field-metadata.util.ts`
11. **Run lint**: `npx nx lint:diff-with-main twenty-front`
12. **Run migrations**: `npx nx run twenty-server:database:migrate:prod`
13. **Flush Redis after deploy**: `cache:flat-cache-invalidate --all-metadata`
