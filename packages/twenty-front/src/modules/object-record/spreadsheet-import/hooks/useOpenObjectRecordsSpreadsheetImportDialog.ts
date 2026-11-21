import { useApolloClient } from '@apollo/client/react';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { buildRecordFromImportedStructuredRow } from '@/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow';
import { type RelationBehavior } from '@/object-record/spreadsheet-import/utils/relationImportTypes';
import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { spreadsheetImportFilterImportableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterImportableFieldMetadataItems';
import { spreadsheetImportGetUnicityTableHook } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetUnicityTableHook';
import { transformRowsForServerImport } from '@/object-record/spreadsheet-import/utils/transformRowsForServerImport';
import { SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE } from '@/spreadsheet-import/constants/SpreadsheetImportCreateRecordsBatchSize';
import { APPEND_IMPORT_JOB_ROWS } from '@/spreadsheet-import/graphql/mutations/appendImportJobRows';
import { CREATE_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/createImportJob';
import { FINALIZE_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/finalizeImportJob';
import { START_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/startImportJob';
import { useCancelImportJob } from '@/spreadsheet-import/hooks/useCancelImportJob';
import { useImportJobProgress } from '@/spreadsheet-import/hooks/useImportJobProgress';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import {
  type ImportedStructuredRow,
  type SpreadsheetImportDialogOptions,
} from '@/spreadsheet-import/types';
import { type ImportJobSummary } from '@/spreadsheet-import/types/ImportJobSummary';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

// OMNIA-CUSTOM: rows go to the server import job, which writes them as the requester.
// Larger imports are uploaded in chunks of SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE, a few at a time.
const IMPORT_JOB_CONCURRENT_CHUNK_UPLOADS = 3;

type ImportJobColumnMappings = {
  columns: {
    key: string;
    label: string;
    fieldMetadataItemId: string;
    isRelationConnectField: boolean;
    isRelationUpdateField: boolean;
  }[];
  relationBehaviors?: RelationBehavior[];
};

type SubmittedImportJob = Pick<ImportJobSummary, 'id' | 'totalRecords'>;

export const useOpenObjectRecordsSpreadsheetImportDialog = (
  objectNameSingular: string,
) => {
  // OMNIA-CUSTOM: the import job is served by the metadata API, the default client
  const apolloMetadataClient = useApolloClient();
  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();
  // OMNIA-CUSTOM: tracks the job after the dialog closes, or cancels it when the submit is cancelled
  const { startTracking } = useImportJobProgress();
  const { cancelImportJob } = useCancelImportJob();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const { t } = useLingui();

  const { enqueueToast } = useToast();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  // OMNIA-CUSTOM: person-like targets (phones or emails) are matched and updated, others looked up by name
  const buildRelationBehaviors = (
    fieldMetadataItems: FieldMetadataItem[],
  ): RelationBehavior[] =>
    fieldMetadataItems.flatMap((fieldMetadataItem): RelationBehavior[] => {
      if (
        fieldMetadataItem.type !== FieldMetadataType.RELATION ||
        fieldMetadataItem.relation?.type !== RelationType.MANY_TO_ONE
      ) {
        return [];
      }

      const targetObjectMetadataItem = objectMetadataItems.find(
        (objectMetadataItemToCheck) =>
          objectMetadataItemToCheck.id ===
          fieldMetadataItem.relation?.targetObjectMetadata.id,
      );

      if (!isDefined(targetObjectMetadataItem)) {
        return [];
      }

      const targetFieldNames = new Set(
        targetObjectMetadataItem.fields
          .filter((targetFieldMetadataItem) => targetFieldMetadataItem.isActive)
          .map((targetFieldMetadataItem) => targetFieldMetadataItem.name),
      );

      if (targetFieldNames.has('phones') || targetFieldNames.has('emails')) {
        return [
          {
            relationFieldName: fieldMetadataItem.name,
            behavior: 'SMART_UPDATE',
            onNotFound: 'CREATE',
            uniqueConstraintFields: targetFieldNames.has('phones')
              ? ['phones']
              : ['emails'],
          },
        ];
      }

      return [
        {
          relationFieldName: fieldMetadataItem.name,
          behavior: 'LOOKUP_ASSIGN',
          onNotFound: 'ERROR',
        },
      ];
    });

  // OMNIA-CUSTOM: finalize is idempotent per job, so one retry learns whether a lost response had queued it;
  // a job still in doubt is cancelled, so it can never run alongside the user's retry
  const finalizeUploadedImportJob = async (importJobId: string) => {
    const finalize = async () => {
      const { data } = await apolloMetadataClient.mutate<{
        finalizeImportJob: SubmittedImportJob;
      }>({
        mutation: FINALIZE_IMPORT_JOB,
        variables: { importJobId },
      });

      return data?.finalizeImportJob;
    };

    try {
      return await finalize().catch(() => finalize());
    } catch (error) {
      await cancelImportJob(importJobId);
      throw error;
    }
  };

  // OMNIA-CUSTOM: up to one chunk is queued in a single call; more are uploaded, then queued by finalize.
  // A cancel during the upload stops it before finalize, so that job is never queued.
  const submitImportJob = async ({
    rows,
    columnMappings,
    abortSignal,
  }: {
    rows: Record<string, unknown>[];
    columnMappings: ImportJobColumnMappings;
    abortSignal: AbortSignal;
  }): Promise<{ importJob: SubmittedImportJob; isQueued: boolean }> => {
    if (rows.length <= SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE) {
      const { data } = await apolloMetadataClient.mutate<{
        startImportJob: SubmittedImportJob;
      }>({
        mutation: START_IMPORT_JOB,
        variables: {
          objectNameSingular,
          columnMappings,
          validatedRows: rows,
        },
      });

      if (!isDefined(data?.startImportJob)) {
        throw new Error(t`The import could not be started. Try again.`);
      }

      return { importJob: data.startImportJob, isQueued: true };
    }

    const { data: createImportJobData } = await apolloMetadataClient.mutate<{
      createImportJob: SubmittedImportJob;
    }>({
      mutation: CREATE_IMPORT_JOB,
      variables: { objectNameSingular, columnMappings },
    });

    const importJobId = createImportJobData?.createImportJob.id;

    if (!isDefined(importJobId)) {
      throw new Error(t`The import could not be started. Try again.`);
    }

    const chunks: Record<string, unknown>[][] = [];

    for (
      let rowIndex = 0;
      rowIndex < rows.length;
      rowIndex += SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE
    ) {
      chunks.push(
        rows.slice(
          rowIndex,
          rowIndex + SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE,
        ),
      );
    }

    for (
      let chunkIndex = 0;
      chunkIndex < chunks.length && !abortSignal.aborted;
      chunkIndex += IMPORT_JOB_CONCURRENT_CHUNK_UPLOADS
    ) {
      await Promise.all(
        chunks
          .slice(chunkIndex, chunkIndex + IMPORT_JOB_CONCURRENT_CHUNK_UPLOADS)
          .map((chunk) =>
            apolloMetadataClient.mutate({
              mutation: APPEND_IMPORT_JOB_ROWS,
              variables: { importJobId, rows: chunk },
            }),
          ),
      );
    }

    if (abortSignal.aborted) {
      return {
        importJob: { id: importJobId, totalRecords: rows.length },
        isQueued: false,
      };
    }

    const finalizedImportJob = await finalizeUploadedImportJob(importJobId);

    return {
      importJob: {
        id: importJobId,
        totalRecords: finalizedImportJob?.totalRecords ?? rows.length,
      },
      isQueued: true,
    };
  };

  const openObjectRecordsSpreadsheetImportDialog = (
    options?: Pick<SpreadsheetImportDialogOptions, 'uploadStepHook'>,
  ) => {
    const availableFieldMetadataItemsToImport =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        objectMetadataItem.updatableFields,
      );

    const spreadsheetImportFields = buildSpreadsheetImportFields(
      availableFieldMetadataItemsToImport,
    );

    // OMNIA-CUSTOM: connect keys are renamed to "update:" keys so the server reads every relation column alike,
    // and composite keys such as "Amount (premium)" are never mistaken for relation keys.
    const connectFieldKeys = new Set(
      spreadsheetImportFields
        .filter((field) => field.isRelationConnectField === true)
        .map((field) => field.key),
    );

    const configuredBehaviors = buildRelationBehaviors(
      availableFieldMetadataItemsToImport,
    );

    const columns = spreadsheetImportFields.map((field) => ({
      key: field.key,
      label: field.label,
      fieldMetadataItemId: field.fieldMetadataItemId,
      isRelationConnectField: field.isRelationConnectField ?? false,
      isRelationUpdateField: field.isRelationUpdateField ?? false,
    }));

    const renameConnectFieldKeys = (row: ImportedStructuredRow) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          connectFieldKeys.has(key) ? `update:${key}` : key,
          value,
        ]),
      );

    // OMNIA-CUSTOM: set only while a submit runs, because the dialog also calls onAbortSubmit
    // when it closes after a successful submit
    let inFlightSubmitAbortController: AbortController | undefined;

    openSpreadsheetImportDialog({
      ...options,
      onSubmit: async (data) => {
        const createInputs = data.validStructuredRows.map((record) =>
          buildRecordFromImportedStructuredRow({
            importedStructuredRow: record,
            fieldMetadataItems: availableFieldMetadataItemsToImport,
            spreadsheetImportFields,
          }),
        );

        // OMNIA-CUSTOM: the server resolves relations from dot-notation keys and relation labels, so
        // the built connect objects are dropped and those keys are taken from the raw structured rows.
        const { transformedRows: relationRows, relationBehaviors } =
          transformRowsForServerImport(
            data.validStructuredRows.map(renameConnectFieldKeys),
            configuredBehaviors,
          );

        const relationFieldNames = new Set(
          relationBehaviors.map(
            (relationBehavior) => relationBehavior.relationFieldName,
          ),
        );

        const rows = createInputs.map((createInput, rowIndex) => {
          const row: Record<string, unknown> = Object.fromEntries(
            Object.entries(createInput).filter(
              ([fieldName]) => !relationFieldNames.has(fieldName),
            ),
          );

          for (const [key, value] of Object.entries(relationRows[rowIndex])) {
            const isRelationKey =
              key.includes('.') || relationFieldNames.has(key);

            if (
              isRelationKey &&
              !(key in row) &&
              isDefined(value) &&
              value !== ''
            ) {
              row[key] = value;
            }
          }

          return row;
        });

        const submitAbortController = new AbortController();

        inFlightSubmitAbortController = submitAbortController;

        // OMNIA-CUSTOM: the server import job writes the rows and the import poller refreshes the list when
        // it ends, so there is no batch create and no finally eviction. Cancel discards or cancels the job.
        try {
          const { importJob, isQueued } = await submitImportJob({
            rows,
            columnMappings: {
              columns,
              ...(relationBehaviors.length > 0 ? { relationBehaviors } : {}),
            },
            abortSignal: submitAbortController.signal,
          });

          if (submitAbortController.signal.aborted) {
            const isCancelled = await cancelImportJob(importJob.id);

            // A queued job whose cancel failed still runs, so it keeps its progress card
            if (isCancelled || !isQueued) {
              return;
            }
          }

          startTracking({
            importJobId: importJob.id,
            objectNameSingular,
            totalRecords: importJob.totalRecords,
          });
        } catch (error) {
          enqueueToast(getToastOptionsFromError({ error }));
          throw error;
        } finally {
          inFlightSubmitAbortController = undefined;
        }
      },
      spreadsheetImportFields,
      availableFieldMetadataItems:
        spreadsheetImportFilterImportableFieldMetadataItems({
          fieldMetadataItems: availableFieldMetadataItemsToImport,
          spreadsheetImportFields,
        }),
      onAbortSubmit: () => {
        // OMNIA-CUSTOM: the submit checks this signal between upload rounds
        inFlightSubmitAbortController?.abort();
      },
      tableHook: spreadsheetImportGetUnicityTableHook(objectMetadataItem),
    });
  };

  return {
    openObjectRecordsSpreadsheetImportDialog,
  };
};
