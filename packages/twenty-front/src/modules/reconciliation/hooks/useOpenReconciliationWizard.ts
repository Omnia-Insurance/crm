import { reconciliationCarrierPickerState } from '@/reconciliation/states/reconciliationCarrierPickerState';
import { useStore } from 'jotai';
import { useCallback } from 'react';

// Every record creation entry point calls this hook, so it only records the
// request: the carrier picker on the reconciliation index loads the carrier
// configs and routes the run.
export const useOpenReconciliationWizard = () => {
  const store = useStore();

  const openReconciliationWizard = useCallback(async (): Promise<void> => {
    const reconciliationCarrierPicker = store.get(
      reconciliationCarrierPickerState.atom,
    );

    if (
      reconciliationCarrierPicker?.status === 'requested' ||
      reconciliationCarrierPicker?.status === 'loading'
    ) {
      return;
    }

    store.set(reconciliationCarrierPickerState.atom, { status: 'requested' });
  }, [store]);

  return { openReconciliationWizard };
};
