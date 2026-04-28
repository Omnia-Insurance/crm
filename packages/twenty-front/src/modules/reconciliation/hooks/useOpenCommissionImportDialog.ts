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
import { START_COMMISSION_PARSING } from '@/reconciliation/graphql/mutations/startCommissionParsing';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import { type SpreadsheetColumn } from '@/spreadsheet-import/types/SpreadsheetColumn';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { type SpreadsheetImportField } from '@/spreadsheet-import/types/SpreadsheetImportField';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useNavigateApp } from '~/hooks/useNavigateApp';
import { AppPath } from 'twenty-shared/types';

import type { CarrierConfig, ColumnMapping } from './useOpenReconciliationImportDialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isMatchedColumn = (
  col: SpreadsheetColumn,
): col is SpreadsheetColumn & { value: string } =>
  col.type === SpreadsheetColumnType.matched ||
  col.type === SpreadsheetColumnType.matchedCheckbox ||
  col.type === SpreadsheetColumnType.matchedSelect ||
  col.type === SpreadsheetColumnType.matchedSelectOptions;

const buildCrmFieldPath = (
  field: SpreadsheetImportField,
  allFieldMetadataItems: { id: string; name: string }[],
): string => {
  const parentField = allFieldMetadataItems.find(
    (f) => f.id === field.fieldMetadataItemId,
  );

  if (!field.isNestedField) return parentField?.name ?? field.key;

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

  if (field.isCompositeSubField && field.compositeSubFieldKey) {
    return `${parentField?.name}.${field.compositeSubFieldKey}`;
  }

  return field.key;
};

const resolveLeafFieldType = (
  field: SpreadsheetImportField,
  allObjectFields: { id: string; name: string; type: string }[],
): string => {
  if (!field.isNestedField) return String(field.fieldMetadataType);

  if (field.isRelationUpdateField && field.targetFieldMetadataItem) {
    return String(field.targetFieldMetadataItem.type);
  }

  if (field.isRelationConnectField && field.uniqueFieldMetadataItem) {
    return String(field.uniqueFieldMetadataItem.type);
  }

  if (field.isCompositeSubField) {
    const parentField = allObjectFields.find(
      (f) => f.id === field.fieldMetadataItemId,
    );

    if (parentField) return String(parentField.type);
  }

  return String(field.fieldMetadataType);
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useOpenCommissionImportDialog = () => {
  const showAuthModal = useShowAuthModal();

  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { uploadAttachmentFile } = useUploadAttachmentFile();
  const { enqueueErrorSnackBar } = useSnackBar();
  const navigateApp = useNavigateApp();
  const apolloClient = useApolloClient();

  const { createOneRecord: createStatement } =
    useCreateOneRecord<ObjectRecord>({
      objectNameSingular: showAuthModal ? 'person' : 'commissionStatement',
    });

  const { updateOneRecord } = useUpdateOneRecord();

  const { objectMetadataItem: policyMetadata } = useObjectMetadataItem({
    objectNameSingular: showAuthModal ? 'person' : 'policy',
  });

  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();

  const selectedSheetNameRef = useRef<string | null>(null);
  const columnMappingRef = useRef<ColumnMapping | null>(null);

  const openCommissionImportDialog = (carrierConfig: CarrierConfig) => {
    const policyFieldItems =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        policyMetadata.updatableFields,
      );

    const policyImportFields = buildSpreadsheetImportFields(policyFieldItems);
    const allFields = policyImportFields as SpreadsheetImportField[];
    const allObjectFields = [...policyMetadata.fields];

    // Pre-compute matches from saved commission column mapping
    const savedMapping = (carrierConfig as Record<string, unknown>)
      .commissionColumnMapping as ColumnMapping | null;
    const precomputedMatches = savedMapping
      ? Object.fromEntries(
          Object.entries(savedMapping).map(([header, entry]) => [
            header,
            entry.fieldKey,
          ]),
        )
      : undefined;

    openSpreadsheetImportDialog({
      spreadsheetImportFields: allFields,
      availableFieldMetadataItems: policyFieldItems,
      selectHeader: true,
      allowDuplicateFieldMatching: true,
      precomputedMatches,
      onSheetSelected: (sheetName) => {
        selectedSheetNameRef.current = sheetName;
      },
      matchColumnsStepHook: async (structuredRows, _rawRows, columns) => {
        const mapping: ColumnMapping = {};

        for (const col of columns) {
          if (!isMatchedColumn(col)) continue;

          const field = allFields.find((f) => f.key === col.value);

          if (!field || field.isReadOnly) continue;

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
          // 1. Create the CommissionStatement record
          const today = new Date();
          const periodStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

          const record = await createStatement({
            name: `${carrierConfig.name} — ${today.toLocaleDateString()}`,
            carrierConfigId: carrierConfig.id,
            sheetName: selectedSheetNameRef.current,
            columnMapping: columnMappingRef.current,
            statementPeriod: periodStr,
            status: 'UPLOADED',
            stats: {
              totalLines: 0,
              matched: 0,
              unmatched: 0,
              totalExpected: 0,
              totalReceived: 0,
              delta: 0,
            },
          });

          if (!record?.id) {
            throw new Error('Failed to create commission statement record');
          }

          // 2. Save column mapping to carrier config for pre-fill
          if (columnMappingRef.current) {
            await updateOneRecord({
              objectNameSingular: 'carrierConfig',
              idToUpdate: carrierConfig.id,
              updateOneRecordInput: {
                commissionColumnMapping: columnMappingRef.current,
              },
            });
          }

          // 3. Upload the file as an attachment
          await uploadAttachmentFile(file, {
            id: record.id,
            targetObjectNameSingular: 'commissionStatement',
          });

          // 4. Trigger the parse + match pipeline
          await apolloClient.mutate({
            mutation: START_COMMISSION_PARSING,
            variables: { statementId: record.id },
          });

          // 5. Navigate to the statement record
          navigateApp(AppPath.RecordShowPage, {
            objectNameSingular: 'commissionStatement',
            objectRecordId: record.id,
          });
        } catch (error) {
          enqueueErrorSnackBar({
            message: 'Failed to create commission statement',
            options: {
              detailedMessage:
                error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      },
    });
  };

  return { openCommissionImportDialog };
};
