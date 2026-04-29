import { useApolloClient } from '@apollo/client/react';
import { useRef } from 'react';

import { useUploadAttachmentFile } from '@/activities/files/hooks/useUploadAttachmentFile';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useShowAuthModal } from '@/ui/layout/hooks/useShowAuthModal';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { START_RECONCILIATION_PARSING } from '@/reconciliation/graphql/mutations/startReconciliationParsing';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import { type SpreadsheetColumn } from '@/spreadsheet-import/types/SpreadsheetColumn';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { type SpreadsheetImportField } from '@/spreadsheet-import/types/SpreadsheetImportField';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useNavigateApp } from '~/hooks/useNavigateApp';
import { AppPath } from 'twenty-shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColumnMappingEntry = {
  crmField: string;
  fieldType: string;
  fieldKey: string;
};

export type ColumnMapping = Record<string, ColumnMappingEntry>;

export type CarrierConfig = {
  id: string;
  name: string;
  parserVersion: string | null;
  fieldConfig: unknown[] | null;
  columnMapping: ColumnMapping | null;
  statusConfig?: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a CRM field path from a SpreadsheetImportField's metadata.
 *
 * Examples:
 *   Simple field (policyNumber) → "policyNumber"
 *   Composite sub-field (name / firstName) → "name.firstName"
 *   Relation update sub-field (lead / name / firstName) → "lead.name.firstName"
 *   Relation connect sub-field (lead / name / firstName) → "lead.name.firstName"
 */
const buildCrmFieldPath = (
  field: SpreadsheetImportField,
  allFieldMetadataItems: { id: string; name: string }[],
): string => {
  const parentField = allFieldMetadataItems.find(
    (f) => f.id === field.fieldMetadataItemId,
  );

  // Simple (non-nested) field: just the field name
  if (!field.isNestedField) {
    return parentField?.name ?? field.key;
  }

  // Relation sub-field: prefix with relation name
  if (field.isRelationUpdateField || field.isRelationConnectField) {
    const relationName = parentField?.name;
    const targetName = field.isRelationUpdateField
      ? field.targetFieldMetadataItem?.name
      : field.uniqueFieldMetadataItem?.name;

    if (field.isCompositeSubField && field.compositeSubFieldKey) {
      return `${relationName}.${targetName}.${field.compositeSubFieldKey}`;
    }

    return `${relationName}.${targetName}`;
  }

  // Composite sub-field directly on the object
  if (field.isCompositeSubField && field.compositeSubFieldKey) {
    return `${parentField?.name}.${field.compositeSubFieldKey}`;
  }

  return field.key;
};

/**
 * Resolve the actual leaf field type for a SpreadsheetImportField.
 *
 * For simple fields this is just field.fieldMetadataType. For relation
 * sub-fields the metadata type is "RELATION" — which is the type of the
 * relation itself, not the target leaf field. This helper walks through the
 * various sub-field kinds to return the correct leaf type so that downstream
 * consumers (type transforms, compare-method inference) behave correctly.
 */
const resolveLeafFieldType = (
  field: SpreadsheetImportField,
  allObjectFields: { id: string; name: string; type: string }[],
): string => {
  // Non-nested field: use its own type directly
  if (!field.isNestedField) {
    return String(field.fieldMetadataType);
  }

  // Relation update field: use target field's type
  if (field.isRelationUpdateField && field.targetFieldMetadataItem) {
    return String(field.targetFieldMetadataItem.type);
  }

  // Relation connect field: use unique constraint field's type
  if (field.isRelationConnectField && field.uniqueFieldMetadataItem) {
    return String(field.uniqueFieldMetadataItem.type);
  }

  // Composite sub-field (non-relation): look up parent field type
  if (field.isCompositeSubField) {
    const parentField = allObjectFields.find(
      (f) => f.id === field.fieldMetadataItemId,
    );
    if (parentField) {
      return String(parentField.type);
    }
  }

  return String(field.fieldMetadataType);
};

/**
 * Resolve statusConfig.fieldMapping values to actual file headers.
 * The fieldMapping maps role names → header strings. When the file format
 * changes (XLSX title-case vs CSV underscore), the header strings become
 * stale. This resolves them against the actual headers from the column mapping.
 */
const resolveStatusFieldMapping = (
  carrierConfig: CarrierConfig,
  columnMapping: ColumnMapping,
): Record<string, unknown> | null => {
  const statusConfig = (carrierConfig as Record<string, unknown>)
    .statusConfig as Record<string, unknown> | null;

  if (!statusConfig?.fieldMapping) return null;

  const fieldMapping = statusConfig.fieldMapping as Record<string, string>;
  const actualHeaders = Object.keys(columnMapping);

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[\s_-]+/g, '');

  const headerByNormalized = new Map(
    actualHeaders.map((h) => [normalize(h), h]),
  );

  const resolved: Record<string, string> = {};
  let changed = false;

  for (const [role, configuredHeader] of Object.entries(fieldMapping)) {
    if (actualHeaders.includes(configuredHeader)) {
      resolved[role] = configuredHeader;
      continue;
    }

    const match = headerByNormalized.get(normalize(configuredHeader));

    if (match) {
      resolved[role] = match;
      changed = true;
      continue;
    }

    // Keep as-is (computed field output keys like "True Effective Date")
    resolved[role] = configuredHeader;
  }

  if (!changed) return null;

  return { ...statusConfig, fieldMapping: resolved };
};

/** Check if a SpreadsheetColumn is matched (has a value/field key). */
const isMatchedColumn = (
  col: SpreadsheetColumn,
): col is SpreadsheetColumn & { value: string } =>
  col.type === SpreadsheetColumnType.matched ||
  col.type === SpreadsheetColumnType.matchedCheckbox ||
  col.type === SpreadsheetColumnType.matchedSelect ||
  col.type === SpreadsheetColumnType.matchedSelectOptions;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useOpenReconciliationImportDialog = () => {
  const showAuthModal = useShowAuthModal();

  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { uploadAttachmentFile } = useUploadAttachmentFile();
  const { enqueueErrorSnackBar } = useSnackBar();
  const navigateApp = useNavigateApp();
  const apolloClient = useApolloClient();

  // Use safe fallback object names when unauthenticated (sign-in page mock
  // metadata doesn't include Omnia custom objects like policy/reconciliation).
  const { createOneRecord: createReconciliation } =
    useCreateOneRecord<ObjectRecord>({
      objectNameSingular: showAuthModal ? 'person' : 'reconciliation',
    });

  const { updateOneRecord } = useUpdateOneRecord();

  const { objectMetadataItem: policyMetadata } = useObjectMetadataItem({
    objectNameSingular: showAuthModal ? 'person' : 'policy',
  });
  const { objectMetadataItem: personMetadata } = useObjectMetadataItem({
    objectNameSingular: 'person',
  });

  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();

  const selectedSheetNameRef = useRef<string | null>(null);
  const columnMappingRef = useRef<ColumnMapping | null>(null);

  const openReconciliationImportDialog = (carrierConfig: CarrierConfig) => {
    // Build import fields from actual CRM objects — policy + lead
    const policyFieldItems =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        policyMetadata.updatableFields,
      );
    const personFieldItems =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        personMetadata.updatableFields,
      );

    const policyImportFields = buildSpreadsheetImportFields(policyFieldItems);
    const personImportFields = buildSpreadsheetImportFields(personFieldItems);

    const allFields = [
      ...policyImportFields,
      ...personImportFields,
    ] as SpreadsheetImportField[];

    const allFieldMetadataItems = [...policyFieldItems, ...personFieldItems];

    // All field metadata for CRM path resolution (includes relation fields
    // that may not be in the filtered import list)
    const allObjectFields = [
      ...policyMetadata.fields,
      ...personMetadata.fields,
    ];

    // Build precomputedMatches from saved carrier config column mapping
    const precomputedMatches = carrierConfig.columnMapping
      ? Object.fromEntries(
          Object.entries(carrierConfig.columnMapping).map(
            ([header, entry]) => [header, entry.fieldKey],
          ),
        )
      : undefined;

    openSpreadsheetImportDialog({
      spreadsheetImportFields: allFields,
      availableFieldMetadataItems: allFieldMetadataItems,
      selectHeader: true,
      allowDuplicateFieldMatching: true,
      precomputedMatches,
      onSheetSelected: (sheetName) => {
        selectedSheetNameRef.current = sheetName;
      },
      matchColumnsStepHook: async (structuredRows, _rawRows, columns) => {
        // Capture column mapping from user's column matches
        const mapping: ColumnMapping = {};

        for (const col of columns) {
          if (!isMatchedColumn(col)) continue;

          const field = allFields.find((f) => f.key === col.value);

          if (!field) continue;

          // Skip read-only fields — they're export-only, not pipeline targets
          if (field.isReadOnly) continue;

          mapping[col.header] = {
            crmField: buildCrmFieldPath(field, allObjectFields),
            fieldType: resolveLeafFieldType(field, allObjectFields),
            fieldKey: field.key,
          };
        }

        columnMappingRef.current = mapping;

        return structuredRows;
      },
      onSubmit: async (_validationResult, file) => {
        try {
          // 1. Create the Reconciliation record with column mapping snapshot
          const record = await createReconciliation({
            name: `${carrierConfig.name} — ${new Date().toLocaleDateString()}`,
            carrierConfigId: carrierConfig.id,
            sheetName: selectedSheetNameRef.current,
            columnMapping: columnMappingRef.current,
            status: 'UPLOADED',
            stats: {
              totalBobRows: 0,
              autoMatched: 0,
              needsReview: 0,
              unmatched: 0,
              missingFromBob: 0,
              discrepanciesFound: 0,
              applied: 0,
              failed: 0,
              skipped: 0,
            },
          });

          if (!record?.id) {
            throw new Error('Failed to create reconciliation record');
          }

          // 2. Save column mapping to carrier config for pre-fill next time,
          //    and resolve statusConfig.fieldMapping to actual file headers
          if (columnMappingRef.current) {
            const updatedStatusConfig = resolveStatusFieldMapping(
              carrierConfig,
              columnMappingRef.current,
            );

            await updateOneRecord({
              objectNameSingular: 'carrierConfig',
              idToUpdate: carrierConfig.id,
              updateOneRecordInput: {
                columnMapping: columnMappingRef.current,
                ...(updatedStatusConfig
                  ? { statusConfig: updatedStatusConfig }
                  : {}),
              },
            });
          }

          // 3. Upload the original xlsx as an attachment
          await uploadAttachmentFile(file, {
            id: record.id,
            targetObjectNameSingular: 'reconciliation',
          });

          // 4. Trigger the parse + match pipeline
          await apolloClient.mutate({
            mutation: START_RECONCILIATION_PARSING,
            variables: { reconciliationId: record.id },
          });

          // 5. Navigate to the reconciliation record
          navigateApp(AppPath.RecordShowPage, {
            objectNameSingular: 'reconciliation',
            objectRecordId: record.id,
          });
        } catch (error) {
          enqueueErrorSnackBar({
            message: 'Failed to create reconciliation',
            options: {
              detailedMessage:
                error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      },
    });
  };

  return { openReconciliationImportDialog };
};
