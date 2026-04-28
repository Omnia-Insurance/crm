import { useCallback, useRef } from 'react';

import { useShowAuthModal } from '@/ui/layout/hooks/useShowAuthModal';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import {
  useOpenCommissionImportDialog,
} from '@/reconciliation/hooks/useOpenCommissionImportDialog';
import type { CarrierConfig, ColumnMapping } from '@/reconciliation/hooks/useOpenReconciliationImportDialog';

export const useOpenCommissionWizard = () => {
  const showAuthModal = useShowAuthModal();

  const { openCommissionImportDialog } = useOpenCommissionImportDialog();

  const openFnRef = useRef(openCommissionImportDialog);

  openFnRef.current = openCommissionImportDialog;

  const { records: carrierConfigRecords, loading } = useFindManyRecords({
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
          commissionConfig: true,
          commissionColumnMapping: true,
        },
    skip: showAuthModal,
  });

  const recordsRef = useRef(carrierConfigRecords);

  recordsRef.current = carrierConfigRecords;

  const loadingRef = useRef(loading);

  loadingRef.current = loading;

  const openCommissionWizard = useCallback(
    (): Promise<void> =>
      new Promise<void>((resolve) => {
        const records = recordsRef.current;

        if (loadingRef.current || records.length === 0) {
          const interval = setInterval(() => {
            const latestRecords = recordsRef.current;

            if (!loadingRef.current && latestRecords.length > 0) {
              clearInterval(interval);
              openWithConfig(latestRecords[0], openFnRef.current);
              resolve();
            }
          }, 100);

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

  return { openCommissionWizard };
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
