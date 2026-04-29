import { useCallback, useRef } from 'react';

import { useShowAuthModal } from '@/ui/layout/hooks/useShowAuthModal';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import {
  useOpenReconciliationImportDialog,
  type CarrierConfig,
  type ColumnMapping,
} from '@/reconciliation/hooks/useOpenReconciliationImportDialog';

/**
 * Hook that loads CarrierConfig records and opens the standard spreadsheet
 * import dialog with reconciliation-specific fields.
 */
export const useOpenReconciliationWizard = () => {
  const showAuthModal = useShowAuthModal();

  const { openReconciliationImportDialog } =
    useOpenReconciliationImportDialog();

  const openFnRef = useRef(openReconciliationImportDialog);

  openFnRef.current = openReconciliationImportDialog;

  const { records: carrierConfigRecords, loading } = useFindManyRecords({
    // Use 'person' as safe fallback when unauthenticated — useFindManyRecords
    // calls useObjectMetadataItem which throws if the object isn't in metadata.
    // On the sign-in page, only mock metadata (standard objects) is available.
    objectNameSingular: showAuthModal ? 'person' : 'carrierConfig',
    recordGqlFields: showAuthModal
      ? { id: true }
      : {
          id: true,
          name: true,
          parserVersion: true,
          fieldConfig: true,
          columnMapping: true,
          statusConfig: true,
        },
    skip: showAuthModal,
  });

  const recordsRef = useRef(carrierConfigRecords);

  recordsRef.current = carrierConfigRecords;

  const loadingRef = useRef(loading);

  loadingRef.current = loading;

  const openReconciliationWizard = useCallback(
    (): Promise<void> =>
      new Promise<void>((resolve) => {
        const records = recordsRef.current;

        if (loadingRef.current || records.length === 0) {
          // Data not ready — retry after a short delay
          const interval = setInterval(() => {
            const latestRecords = recordsRef.current;

            if (!loadingRef.current && latestRecords.length > 0) {
              clearInterval(interval);
              openWithConfig(latestRecords[0], openFnRef.current);
              resolve();
            }
          }, 100);

          // Safety timeout — resolve anyway so callers don't hang
          setTimeout(() => {
            clearInterval(interval);
            resolve();
          }, 5000);

          return;
        }

        openWithConfig(records[0], openFnRef.current);
        resolve();
      }),
    [],
  );

  return { openReconciliationWizard };
};

const openWithConfig = (
  record: Record<string, unknown>,
  openFn: (config: CarrierConfig) => void,
) => {
  const carrierConfig: CarrierConfig = {
    id: record.id as string,
    name: record.name as string,
    parserVersion: (record.parserVersion as string) ?? null,
    fieldConfig: (record.fieldConfig as unknown[]) ?? null,
    columnMapping: (record.columnMapping as ColumnMapping) ?? null,
    statusConfig: (record.statusConfig as Record<string, unknown>) ?? null,
  };

  openFn(carrierConfig);
};
