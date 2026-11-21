import { act, renderHook } from '@testing-library/react';

import { useOpenReconciliationWizard } from '@/reconciliation/hooks/useOpenReconciliationWizard';
import {
  reconciliationCarrierPickerState,
  type ReconciliationCarrierPickerStateValue,
} from '@/reconciliation/states/reconciliationCarrierPickerState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

// The default metadata mocks carry no reconciliation objects, like a workspace that never
// seeded them, where every record creation entry point still renders this hook.
const renderUseOpenReconciliationWizard = (
  initialCarrierPicker: ReconciliationCarrierPickerStateValue = null,
) =>
  renderHook(() => useOpenReconciliationWizard(), {
    wrapper: getJestMetadataAndApolloMocksWrapper({
      apolloMocks: [],
      onInitializeJotaiStore: (store) => {
        store.set(reconciliationCarrierPickerState.atom, initialCarrierPicker);
      },
    }),
  });

describe('useOpenReconciliationWizard', () => {
  it('requests the carrier picker in a workspace without reconciliation objects', async () => {
    const { result } = renderUseOpenReconciliationWizard();

    await act(async () => {
      await result.current.openReconciliationWizard();
    });

    expect(jotaiStore.get(reconciliationCarrierPickerState.atom)).toEqual({
      status: 'requested',
    });
  });

  it('ignores a new run while the carrier configs are loading', async () => {
    const { result } = renderUseOpenReconciliationWizard({ status: 'loading' });

    await act(async () => {
      await result.current.openReconciliationWizard();
    });

    expect(jotaiStore.get(reconciliationCarrierPickerState.atom)).toEqual({
      status: 'loading',
    });
  });

  it('keeps the same callback across renders', () => {
    const { result, rerender } = renderUseOpenReconciliationWizard();
    const { openReconciliationWizard } = result.current;

    rerender();

    expect(result.current.openReconciliationWizard).toBe(
      openReconciliationWizard,
    );
  });
});
