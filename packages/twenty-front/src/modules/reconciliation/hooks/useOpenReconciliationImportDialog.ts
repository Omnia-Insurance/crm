import { useApolloClient } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { AppPath, StandardObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';

import { useUploadAttachmentFile } from '@/activities/files/hooks/useUploadAttachmentFile';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { START_RECONCILIATION_PARSING } from '@/reconciliation/graphql/mutations/startReconciliationParsing';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import { type SpreadsheetColumn } from '@/spreadsheet-import/types/SpreadsheetColumn';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { type SpreadsheetImportFields } from '@/spreadsheet-import/types/SpreadsheetImportFields';
import { useNavigateApp } from '~/hooks/useNavigateApp';

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

type SpreadsheetImportFieldItem = SpreadsheetImportFields[number];

type FieldMetadataItemReference = { id: string; name: string; type: string };

// CRM path the pipeline writes to: "policyNumber", "name.firstName" or
// "lead.name.firstName" for relation sub-fields.
const buildCrmFieldPath = (
  spreadsheetImportField: SpreadsheetImportFieldItem,
  fieldMetadataItems: FieldMetadataItemReference[],
): string => {
  const parentFieldMetadataItem = fieldMetadataItems.find(
    (fieldMetadataItem) =>
      fieldMetadataItem.id === spreadsheetImportField.fieldMetadataItemId,
  );

  if (!spreadsheetImportField.isNestedField) {
    return parentFieldMetadataItem?.name ?? spreadsheetImportField.key;
  }

  if (
    spreadsheetImportField.isRelationUpdateField ||
    spreadsheetImportField.isRelationConnectField
  ) {
    const relationName = parentFieldMetadataItem?.name;
    const targetFieldName = spreadsheetImportField.isRelationUpdateField
      ? spreadsheetImportField.targetFieldMetadataItem?.name
      : spreadsheetImportField.uniqueFieldMetadataItem?.name;

    if (
      spreadsheetImportField.isCompositeSubField &&
      isNonEmptyString(spreadsheetImportField.compositeSubFieldKey)
    ) {
      return `${relationName}.${targetFieldName}.${spreadsheetImportField.compositeSubFieldKey}`;
    }

    return `${relationName}.${targetFieldName}`;
  }

  if (
    spreadsheetImportField.isCompositeSubField &&
    isNonEmptyString(spreadsheetImportField.compositeSubFieldKey)
  ) {
    return `${parentFieldMetadataItem?.name}.${spreadsheetImportField.compositeSubFieldKey}`;
  }

  return spreadsheetImportField.key;
};

// A relation sub-field reports the RELATION type; type transforms and compare
// methods need the leaf field's type instead.
const resolveLeafFieldType = (
  spreadsheetImportField: SpreadsheetImportFieldItem,
  fieldMetadataItems: FieldMetadataItemReference[],
): string => {
  if (!spreadsheetImportField.isNestedField) {
    return String(spreadsheetImportField.fieldMetadataType);
  }

  if (
    spreadsheetImportField.isRelationUpdateField &&
    isDefined(spreadsheetImportField.targetFieldMetadataItem)
  ) {
    return String(spreadsheetImportField.targetFieldMetadataItem.type);
  }

  if (
    spreadsheetImportField.isRelationConnectField &&
    isDefined(spreadsheetImportField.uniqueFieldMetadataItem)
  ) {
    return String(spreadsheetImportField.uniqueFieldMetadataItem.type);
  }

  if (spreadsheetImportField.isCompositeSubField) {
    const parentFieldMetadataItem = fieldMetadataItems.find(
      (fieldMetadataItem) =>
        fieldMetadataItem.id === spreadsheetImportField.fieldMetadataItemId,
    );

    if (isDefined(parentFieldMetadataItem)) {
      return String(parentFieldMetadataItem.type);
    }
  }

  return String(spreadsheetImportField.fieldMetadataType);
};

// statusConfig.fieldMapping stores header strings, which go stale when the
// file format changes (XLSX title case vs CSV underscores).
const resolveStatusFieldMapping = (
  carrierConfig: CarrierConfig,
  columnMapping: ColumnMapping,
): Record<string, unknown> | null => {
  const statusConfig = carrierConfig.statusConfig;

  if (!isDefined(statusConfig?.fieldMapping)) {
    return null;
  }

  const fieldMapping = statusConfig.fieldMapping as Record<string, string>;
  const actualHeaders = Object.keys(columnMapping);

  const normalizeHeader = (header: string) =>
    header.toLowerCase().replace(/[\s_-]+/g, '');

  const actualHeaderByNormalizedHeader = new Map(
    actualHeaders.map((header) => [normalizeHeader(header), header]),
  );

  const resolvedFieldMapping: Record<string, string> = {};
  let hasResolvedHeader = false;

  for (const [role, configuredHeader] of Object.entries(fieldMapping)) {
    if (actualHeaders.includes(configuredHeader)) {
      resolvedFieldMapping[role] = configuredHeader;
      continue;
    }

    const matchingHeader = actualHeaderByNormalizedHeader.get(
      normalizeHeader(configuredHeader),
    );

    if (isNonEmptyString(matchingHeader)) {
      resolvedFieldMapping[role] = matchingHeader;
      hasResolvedHeader = true;
      continue;
    }

    // Computed field outputs such as "True Effective Date" are not file headers.
    resolvedFieldMapping[role] = configuredHeader;
  }

  if (!hasResolvedHeader) {
    return null;
  }

  return { ...statusConfig, fieldMapping: resolvedFieldMapping };
};

const isMatchedColumn = (
  column: SpreadsheetColumn,
): column is SpreadsheetColumn & { value: string } =>
  column.type === SpreadsheetColumnType.matched ||
  column.type === SpreadsheetColumnType.matchedCheckbox ||
  column.type === SpreadsheetColumnType.matchedSelect ||
  column.type === SpreadsheetColumnType.matchedSelectOptions;

export const useOpenReconciliationImportDialog = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { uploadAttachmentFile } = useUploadAttachmentFile();
  const navigateApp = useNavigateApp();
  // startReconciliationParsing is served by the metadata API, the default client.
  const apolloClient = useApolloClient();

  const { createOneRecord: createReconciliation } =
    useCreateOneRecord<ObjectRecord>({
      objectNameSingular: 'reconciliation',
    });

  const { updateOneRecord } = useUpdateOneRecord();

  const { objectMetadataItem: policyObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: 'policy',
    });
  const { objectMetadataItem: personObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: StandardObjectNameSingular.Person,
    });

  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();

  const openReconciliationImportDialog = (carrierConfig: CarrierConfig) => {
    let selectedSheetName: string | null = null;
    let columnMapping: ColumnMapping | null = null;

    const policyFieldMetadataItems =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        policyObjectMetadataItem.updatableFields,
      );
    const personFieldMetadataItems =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        personObjectMetadataItem.updatableFields,
      );

    const spreadsheetImportFields = [
      ...buildSpreadsheetImportFields(policyFieldMetadataItems),
      ...buildSpreadsheetImportFields(personFieldMetadataItems),
    ];

    // Relation fields are not import columns but are needed to resolve CRM paths.
    const allFieldMetadataItems = [
      ...policyObjectMetadataItem.fields,
      ...personObjectMetadataItem.fields,
    ];

    const precomputedMatches = isDefined(carrierConfig.columnMapping)
      ? Object.fromEntries(
          Object.entries(carrierConfig.columnMapping).map(
            ([header, columnMappingEntry]) => [
              header,
              columnMappingEntry.fieldKey,
            ],
          ),
        )
      : undefined;

    openSpreadsheetImportDialog({
      spreadsheetImportFields,
      availableFieldMetadataItems: [
        ...policyFieldMetadataItems,
        ...personFieldMetadataItems,
      ],
      selectHeader: true,
      allowDuplicateFieldMatching: true,
      precomputedMatches,
      onSheetSelected: (sheetName) => {
        selectedSheetName = sheetName;
      },
      matchColumnsStepHook: async (
        importedStructuredRows,
        _importedRows,
        columns,
      ) => {
        const matchedColumnMapping: ColumnMapping = {};

        for (const column of columns) {
          if (!isMatchedColumn(column)) {
            continue;
          }

          const spreadsheetImportField = spreadsheetImportFields.find(
            (field) => field.key === column.value,
          );

          // Read-only columns only match exported headers; the pipeline never writes them.
          if (
            !isDefined(spreadsheetImportField) ||
            spreadsheetImportField.isReadOnly === true
          ) {
            continue;
          }

          matchedColumnMapping[column.header] = {
            crmField: buildCrmFieldPath(
              spreadsheetImportField,
              allFieldMetadataItems,
            ),
            fieldType: resolveLeafFieldType(
              spreadsheetImportField,
              allFieldMetadataItems,
            ),
            fieldKey: spreadsheetImportField.key,
          };
        }

        columnMapping = matchedColumnMapping;

        return importedStructuredRows;
      },
      onSubmit: async (_validationResult, file) => {
        try {
          const reconciliation = await createReconciliation({
            name: `${carrierConfig.name} — ${new Date().toLocaleDateString()}`,
            carrierConfigId: carrierConfig.id,
            sheetName: selectedSheetName,
            columnMapping,
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

          if (!isDefined(reconciliation?.id)) {
            throw new Error(t`The reconciliation record was not created.`);
          }

          // The next run prefills from this mapping.
          if (isDefined(columnMapping)) {
            const updatedStatusConfig = resolveStatusFieldMapping(
              carrierConfig,
              columnMapping,
            );

            await updateOneRecord({
              objectNameSingular: 'carrierConfig',
              idToUpdate: carrierConfig.id,
              updateOneRecordInput: {
                columnMapping,
                ...(isDefined(updatedStatusConfig)
                  ? { statusConfig: updatedStatusConfig }
                  : {}),
              },
            });
          }

          await uploadAttachmentFile(file, {
            id: reconciliation.id,
            targetObjectNameSingular: 'reconciliation',
          });

          await apolloClient.mutate({
            mutation: START_RECONCILIATION_PARSING,
            variables: { reconciliationId: reconciliation.id },
          });

          navigateApp(AppPath.RecordShowPage, {
            objectNameSingular: 'reconciliation',
            objectRecordId: reconciliation.id,
          });
        } catch (error) {
          enqueueToast({
            status: 'error',
            children: t`Failed to create reconciliation`,
            description: error instanceof Error ? error.message : undefined,
          });
        }
      },
    });
  };

  return { openReconciliationImportDialog };
};
