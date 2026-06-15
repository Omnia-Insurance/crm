import { type CarrierConfigPickerItem } from '@/reconciliation/utils/resolveCarrierConfigSelection';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

/**
 * Payload for the reconciliation carrier picker modal. Set by
 * useOpenReconciliationWizard before opening the modal:
 *
 * - `carrierConfigs` empty  → the modal renders the "no carrier config —
 *   seed one first" guidance (empty state).
 * - `carrierConfigs` length > 1 → the modal renders the carrier select with
 *   `selectedCarrierConfigId` preselected.
 *
 * `null` (default) → the modal renders nothing. Exactly-one-config runs
 * never touch this state: the wizard opens the import dialog directly.
 */
export type ReconciliationCarrierPickerStateValue = {
  carrierConfigs: CarrierConfigPickerItem[];
  selectedCarrierConfigId: string | null;
} | null;

export const reconciliationCarrierPickerState =
  createAtomState<ReconciliationCarrierPickerStateValue>({
    key: 'reconciliationCarrierPickerState',
    defaultValue: null,
  });
