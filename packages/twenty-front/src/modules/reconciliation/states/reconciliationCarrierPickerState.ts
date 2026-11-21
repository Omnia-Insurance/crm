import { type CarrierConfigPickerItem } from '@/reconciliation/utils/resolveCarrierConfigSelection';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// 'requested' is set by the run wizard and picked up by the carrier picker
// mounted on the reconciliation index, which may only mount after navigation.
export type ReconciliationCarrierPickerStateValue =
  | { status: 'requested' }
  | { status: 'loading' }
  | {
      status: 'loaded';
      carrierConfigs: CarrierConfigPickerItem[];
      selectedCarrierConfigId: string | null;
    }
  | null;

export const reconciliationCarrierPickerState =
  createAtomState<ReconciliationCarrierPickerStateValue>({
    key: 'reconciliationCarrierPickerState',
    defaultValue: null,
  });
