import { useApolloClient } from '@apollo/client/react';

import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { buildRecordFromImportedStructuredRow } from '@/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow';
import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { spreadsheetImportGetUnicityTableHook } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetUnicityTableHook';
import { transformRowsForServerImport } from '@/object-record/spreadsheet-import/utils/transformRowsForServerImport';
import { type RelationBehavior } from '@/object-record/spreadsheet-import/utils/relationImportTypes';
import { APPEND_IMPORT_JOB_ROWS } from '@/spreadsheet-import/graphql/mutations/appendImportJobRows';
import { CREATE_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/createImportJob';
import { FINALIZE_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/finalizeImportJob';
import { START_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/startImportJob';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import { useImportJobProgress } from '@/spreadsheet-import/hooks/useImportJobProgress';
import { type SpreadsheetImportDialogOptions } from '@/spreadsheet-import/types';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

const CHUNK_SIZE = 200;

export const useOpenObjectRecordsSpreadsheetImportDialog = (
  objectNameSingular: string,
) => {
  const apolloMetadataClient = useApolloClient();
  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { startTracking } = useImportJobProgress();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const openObjectRecordsSpreadsheetImportDialog = (
    options?: Omit<
      SpreadsheetImportDialogOptions,
      'fields' | 'isOpen' | 'onClose'
    >,
  ) => {
    const availableFieldMetadataItemsToImport =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        objectMetadataItem.updatableFields,
      );

    const spreadsheetImportFields = buildSpreadsheetImportFields(
      availableFieldMetadataItemsToImport,
    );

    const columnMappings = spreadsheetImportFields.map((field) => ({
      key: field.key,
      label: field.label,
      fieldMetadataItemId: field.fieldMetadataItemId,
      isRelationConnectField: field.isRelationConnectField ?? false,
      isRelationUpdateField: field.isRelationUpdateField ?? false,
    }));

    // OMNIA-CUSTOM: Build a set of connect field keys so we can normalize
    // them to update: format. This prevents composite keys like
    // "Amount (premium)" from being confused with relation connect keys.
    const connectFieldKeys = new Set(
      spreadsheetImportFields
        .filter((f) => f.isRelationConnectField)
        .map((f) => f.key),
    );

    // OMNIA-CUSTOM: Build explicit relation behaviors from field metadata.
    // Person-like targets (have phones/emails) → SMART_UPDATE.
    // Reference targets (name only) → LOOKUP_ASSIGN.
    const configuredBehaviors: RelationBehavior[] = [];

    for (const field of availableFieldMetadataItemsToImport) {
      if (field.type !== FieldMetadataType.RELATION) continue;
      if (field.relation?.type !== RelationType.MANY_TO_ONE) continue;

      const targetObject = objectMetadataItems?.find(
        (obj) => obj.id === field.relation?.targetObjectMetadata.id,
      );

      if (!targetObject) continue;

      const targetFieldNames = new Set(
        targetObject.fields
          .filter((f) => f.isActive)
          .map((f) => f.name),
      );

      if (targetFieldNames.has('phones') || targetFieldNames.has('emails')) {
        configuredBehaviors.push({
          relationFieldName: field.name,
          behavior: 'SMART_UPDATE',
          onNotFound: 'CREATE',
          uniqueConstraintFields: targetFieldNames.has('phones')
            ? ['phones']
            : ['emails'],
        });
      } else {
        configuredBehaviors.push({
          relationFieldName: field.name,
          behavior: 'LOOKUP_ASSIGN',
          onNotFound: 'ERROR',
        });
      }
    }

    openSpreadsheetImportDialog({
      ...options,
      onSubmit: async (data) => {
        // Build main record objects from the structured rows
        const createInputs = data.validStructuredRows.map((record) =>
          buildRecordFromImportedStructuredRow({
            importedStructuredRow: record,
            fieldMetadataItems: availableFieldMetadataItemsToImport,
            spreadsheetImportFields,
          }),
        );

        // OMNIA-CUSTOM: Extract relation update/label data from the RAW
        // structured rows (buildRecordFromImportedStructuredRow strips
        // these keys) and merge with the built records as dot-notation keys.
        // Normalize connect field keys to update: format so they're handled
        // uniformly by the transform function.
        const rawRows = data.validStructuredRows.map((row) => {
          const normalized: Record<string, unknown> = {};

          for (const [key, value] of Object.entries(
            row as Record<string, unknown>,
          )) {
            if (connectFieldKeys.has(key)) {
              normalized[`update:${key}`] = value;
            } else {
              normalized[key] = value;
            }
          }

          return normalized;
        });

        const { transformedRows: relationData, relationBehaviors } =
          transformRowsForServerImport(rawRows, configuredBehaviors);

        // Merge: built record (direct fields + composites) + relation
        // sub-field data (dot notation keys from the raw structured row)
        const relationFieldNames = new Set(
          relationBehaviors.map((rb) => rb.relationFieldName),
        );

        const mergedRows = createInputs.map((builtRecord, index) => {
          const extraRelationKeys = relationData[index];
          const merged = { ...builtRecord };

          // When server-side relation resolution is active, remove connect
          // objects (e.g., { lead: { connect: {...} } }) from built records.
          // The server uses dot-notation keys and relation labels instead.
          for (const name of relationFieldNames) {
            if (name in merged) {
              delete merged[name];
            }
          }

          for (const [key, value] of Object.entries(extraRelationKeys)) {
            // Only add relation data keys (dot-notation or relation labels).
            // Skip composite sub-field keys like "Amount (premium)" — these
            // are already handled by buildRecordFromImportedStructuredRow.
            if (!(key in merged) && value !== undefined && value !== '') {
              // Dot-notation keys (lead.name.firstName) or relation labels
              // (carrier) are relation data. Keys with parentheses but no
              // dot are composite sub-field keys — skip them.
              const isRelationDotKey = key.includes('.');
              const isRelationLabel = relationFieldNames.has(key);

              if (isRelationDotKey || isRelationLabel) {
                merged[key] = value;
              }
            }
          }

          return merged;
        });

        const enrichedMappings = {
          columns: columnMappings,
          ...(relationBehaviors.length > 0
            ? { relationBehaviors }
            : {}),
        };

        try {
          if (mergedRows.length <= CHUNK_SIZE) {
            await submitSingleBatch(mergedRows, enrichedMappings);
          } else {
            await submitChunked(mergedRows, enrichedMappings);
          }
        } catch (error) {
          if (error instanceof Error) {
            enqueueErrorSnackBar({ apolloError: error });
          }
        }
      },
      spreadsheetImportFields,
      availableFieldMetadataItems: availableFieldMetadataItemsToImport,
      tableHook: spreadsheetImportGetUnicityTableHook(objectMetadataItem),
    });
  };

  const submitSingleBatch = async (
    rows: Record<string, unknown>[],
    mappings: Record<string, unknown>,
  ) => {
    const { data: result } = await apolloMetadataClient.mutate({
      mutation: START_IMPORT_JOB,
      variables: {
        objectNameSingular,
        columnMappings: mappings,
        validatedRows: rows,
        fileName: undefined,
      },
    });

    const importJob = (result as { startImportJob?: { id: string; totalRecords: number } })
      ?.startImportJob;

    if (importJob?.id) {
      startTracking({
        importJobId: importJob.id,
        objectNameSingular,
        totalRecords: importJob.totalRecords,
      });
    }
  };

  const submitChunked = async (
    rows: Record<string, unknown>[],
    mappings: Record<string, unknown>,
  ) => {
    // 1. Create the job shell (no rows)
    const { data: createResult } = await apolloMetadataClient.mutate({
      mutation: CREATE_IMPORT_JOB,
      variables: {
        objectNameSingular,
        columnMappings: mappings,
        fileName: undefined,
      },
    });

    const jobId = (createResult as { createImportJob?: { id: string } })
      ?.createImportJob?.id;

    if (!jobId) throw new Error('Failed to create import job');

    // 2. Send rows in parallel chunks (up to 3 concurrent)
    const CONCURRENT_UPLOADS = 3;
    const chunks: Record<string, unknown>[][] = [];

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      chunks.push(rows.slice(i, i + CHUNK_SIZE));
    }

    for (let i = 0; i < chunks.length; i += CONCURRENT_UPLOADS) {
      const batch = chunks.slice(i, i + CONCURRENT_UPLOADS);

      await Promise.all(
        batch.map((chunk) =>
          apolloMetadataClient.mutate({
            mutation: APPEND_IMPORT_JOB_ROWS,
            variables: { importJobId: jobId, rows: chunk },
          }),
        ),
      );
    }

    // 3. Finalize — queues the job for processing
    const { data: finalizeResult } = await apolloMetadataClient.mutate({
      mutation: FINALIZE_IMPORT_JOB,
      variables: { importJobId: jobId },
    });

    const totalRecords = (
      finalizeResult as { finalizeImportJob?: { totalRecords: number } }
    )?.finalizeImportJob?.totalRecords ?? rows.length;

    startTracking({
      importJobId: jobId,
      objectNameSingular,
      totalRecords,
    });
  };

  return {
    openObjectRecordsSpreadsheetImportDialog,
  };
};
