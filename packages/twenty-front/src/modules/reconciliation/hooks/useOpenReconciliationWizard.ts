import { useLazyFindManyRecords } from '@/object-record/hooks/useLazyFindManyRecords';
import { RECONCILIATION_CARRIER_PICKER_MODAL_ID } from '@/reconciliation/constants/ReconciliationCarrierPickerModalId';
import { useOpenReconciliationImportDialog } from '@/reconciliation/hooks/useOpenReconciliationImportDialog';
import { reconciliationCarrierPickerState } from '@/reconciliation/states/reconciliationCarrierPickerState';
import { resolveCarrierConfigSelection } from '@/reconciliation/utils/resolveCarrierConfigSelection';
import { useShowAuthModal } from '@/ui/layout/hooks/useShowAuthModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { isDefined } from 'twenty-shared/utils';

/**
 * Hook that loads CarrierConfig records and routes the reconciliation run
 * wizard:
 *
 * - exactly one carrierConfig → open the spreadsheet import dialog directly
 *   with that config (single-carrier workspaces keep the zero-click flow);
 * - more than one → open the carrier picker modal so the operator chooses
 *   which carrier the run (and its columnMapping prefill/write-back) targets;
 * - none → open the picker modal in its empty state with seeding guidance
 *   instead of starting a run that would break at PARSE.
 */
export const useOpenReconciliationWizard = () => {
  const showAuthModal = useShowAuthModal();

  const { openReconciliationImportDialog } =
    useOpenReconciliationImportDialog();
  const { openModal } = useModal();
  const setReconciliationCarrierPicker = useSetAtomState(
    reconciliationCarrierPickerState,
  );

  const { findManyRecordsLazy } = useLazyFindManyRecords({
    // Use 'person' as safe fallback when unauthenticated — useLazyFindManyRecords
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
          carrier: { id: true, name: true },
        },
    // Always fetch fresh: stale cached columnMapping/statusConfig would
    // silently drive the import dialog prefill with outdated config.
    fetchPolicy: 'network-only',
  });

  const openReconciliationWizard = async (): Promise<void> => {
    if (showAuthModal) {
      return;
    }

    const { records, error } = await findManyRecordsLazy();

    if (isDefined(error)) {
      // The find-many error handler already surfaced a snackbar — don't
      // misreport a fetch failure as "no carrier configs exist".
      return;
    }

    const selection = resolveCarrierConfigSelection(records ?? []);

    if (selection.kind === 'single') {
      // Single-carrier workspace: no picker step, open the dialog directly.
      openReconciliationImportDialog(selection.item.carrierConfig);
      return;
    }

    // 'none' → empty-state guidance; 'multiple' → carrier picker with the
    // deterministic default preselected.
    setReconciliationCarrierPicker({
      carrierConfigs: selection.kind === 'multiple' ? selection.items : [],
      selectedCarrierConfigId:
        selection.kind === 'multiple' ? selection.defaultCarrierConfigId : null,
    });
    openModal(RECONCILIATION_CARRIER_PICKER_MODAL_ID);
  };

  return { openReconciliationWizard };
};
