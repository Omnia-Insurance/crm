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
| `packages/twenty-front/src/locales/*.po` and `src/locales/generated/*.ts` | Custom Lingui translations | Must re-run `lingui extract && lingui compile` after upstream merge |

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
- `query-hooks/policy-update-one.pre-query.hook.ts` — Re-derives name on carrier/product change
- `query-hooks/policy-update-many.pre-query.hook.ts` — Same for bulk
- `query-hooks/policy-update-one.post-query.hook.ts` — Recalculates LTV on update
- `query-hooks/policy-update-many.post-query.hook.ts` — Same for bulk
- `query-hooks/policy-query-hook.module.ts` — Module registration
- `utils/build-policy-display-name.util.ts` — "Carrier - Product" name derivation
- `utils/enrich-policy-after-save.util.ts` — Post-save enrichment (LTV, dates)
- `utils/get-today-for-member.util.ts` — Timezone-aware date helper
- `utils/lookup-carrier-product-commission.util.ts` — LTV lookup from CarrierProduct

### `packages/twenty-server/src/modules/call/`
- `query-hooks/call-create-one.pre-query.hook.ts` — Auto-assigns agentId on call create
- `query-hooks/call-create-many.pre-query.hook.ts` — Same for bulk
- `query-hooks/call-create-one.post-query.hook.ts` — Post-create enrichment
- `query-hooks/call-create-many.post-query.hook.ts` — Same for bulk
- `query-hooks/call-query-hook.module.ts` — Module registration

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

### Other Frontend
| File | Modification |
|------|-------------|
| `record-field-list/.../RecordDetailRelationSectionDropdownToOne.tsx` | Junction bridge filter fix |

## Modified Upstream Server Files

### RLS / Permissions Engine
| File | Modification |
|------|-------------|
| `engine/twenty-orm/utils/build-row-level-permission-record-filter.util.ts` | Indirect relation support, deny-by-default when predicates can't resolve |
| `engine/twenty-orm/utils/validate-rls-predicates-for-records.util.ts` | RLS validation on record create/update |
| `engine/api/common/common-select-fields/utils/filter-restricted-fields-from-select.util.ts` | **NEW** — Strip restricted fields instead of rejecting queries |

### Standard Object Index (Unique Constraints)
| File | Modification |
|------|-------------|
| `engine/workspace-manager/.../compute-person-standard-flat-index-metadata.util.ts` | Phone is unique (not email) |

## Post-Merge Checklist

After every upstream merge:

1. **Run the check script**: `./scripts/check-customizations.sh`
2. **Re-extract Lingui**: `npx nx run twenty-front:lingui:extract && npx nx run twenty-front:lingui:compile`
3. **Verify RLS works**: Log in as member role, create a policy from Policies page
4. **Verify sidebar**: Settings at top, no Documentation link, Search in sidebar
5. **Verify RLS settings UI**: No "Upgrade to access" gate on Record-level permissions
6. **Run lint + typecheck**: `npx nx lint:diff-with-main twenty-front && npx nx typecheck twenty-front`
7. **Flush Redis after deploy**: `cache:flat-cache-invalidate --all-metadata`
