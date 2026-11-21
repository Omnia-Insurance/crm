import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { useEffect } from 'react';
import { type RecordGqlFields } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { Button, type SelectOption } from 'twenty-ui/primitives/input';
import { Dialog } from 'twenty-ui/primitives/surfaces';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useLazyFindManyRecords } from '@/object-record/hooks/useLazyFindManyRecords';
import { RECONCILIATION_CARRIER_PICKER_MODAL_ID } from '@/reconciliation/constants/ReconciliationCarrierPickerModalId';
import { useOpenReconciliationImportDialog } from '@/reconciliation/hooks/useOpenReconciliationImportDialog';
import { reconciliationCarrierPickerState } from '@/reconciliation/states/reconciliationCarrierPickerState';
import { resolveCarrierConfigSelection } from '@/reconciliation/utils/resolveCarrierConfigSelection';
import { Select } from '@/ui/input/components/Select';
import { DialogInstance } from '@/ui/layout/dialog/components/DialogInstance';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const RECONCILIATION_CARRIER_PICKER_SELECT_ID =
  'reconciliation-carrier-picker-select';

const CARRIER_CONFIG_RECORD_GQL_FIELDS: RecordGqlFields = {
  id: true,
  name: true,
  parserVersion: true,
  fieldConfig: true,
  columnMapping: true,
  statusConfig: true,
  carrier: { id: true, name: true },
};

const StyledActionSlot = styled.div`
  flex: 1;
`;

type ReconciliationCarrierPickerRequestEffectProps = {
  onRequest: () => void;
};

const ReconciliationCarrierPickerRequestEffect = ({
  onRequest,
}: ReconciliationCarrierPickerRequestEffectProps) => {
  useEffect(() => {
    onRequest();
  }, [onRequest]);

  return null;
};

// One carrier config opens the import dialog directly; none or several open
// this dialog, so a run never silently takes the first config.
const ReconciliationCarrierPickerDialog = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const store = useStore();
  const [reconciliationCarrierPicker, setReconciliationCarrierPicker] =
    useAtomState(reconciliationCarrierPickerState);
  const { openDialog, closeDialog } = useDialog();

  const { openReconciliationImportDialog } =
    useOpenReconciliationImportDialog();

  const { findManyRecordsLazy } = useLazyFindManyRecords({
    objectNameSingular: 'carrierConfig',
    recordGqlFields: CARRIER_CONFIG_RECORD_GQL_FIELDS,
    // A cached columnMapping/statusConfig would prefill the import with an outdated config.
    fetchPolicy: 'network-only',
  });

  const loadCarrierConfigs = async () => {
    if (
      store.get(reconciliationCarrierPickerState.atom)?.status !== 'requested'
    ) {
      return;
    }

    store.set(reconciliationCarrierPickerState.atom, { status: 'loading' });

    // Any exit must clear 'loading', or the wizard ignores every later request.
    try {
      const { records, error } = await findManyRecordsLazy();

      // The find-many error handler already toasted; this is not "no carrier configs".
      if (isDefined(error)) {
        store.set(reconciliationCarrierPickerState.atom, null);
        return;
      }

      const selection = resolveCarrierConfigSelection(records ?? []);

      // Keeping the configs keeps this component, which owns the import submit, mounted.
      if (selection.kind === 'single') {
        store.set(reconciliationCarrierPickerState.atom, {
          status: 'loaded',
          carrierConfigs: [selection.item],
          selectedCarrierConfigId: selection.item.carrierConfig.id,
        });
        openReconciliationImportDialog(selection.item.carrierConfig);
        return;
      }

      store.set(reconciliationCarrierPickerState.atom, {
        status: 'loaded',
        carrierConfigs: selection.kind === 'multiple' ? selection.items : [],
        selectedCarrierConfigId:
          selection.kind === 'multiple'
            ? selection.defaultCarrierConfigId
            : null,
      });
      openDialog(RECONCILIATION_CARRIER_PICKER_MODAL_ID);
    } catch (error) {
      store.set(reconciliationCarrierPickerState.atom, null);
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  const carrierConfigs =
    reconciliationCarrierPicker?.status === 'loaded'
      ? reconciliationCarrierPicker.carrierConfigs
      : [];

  const selectedCarrierConfigId =
    reconciliationCarrierPicker?.status === 'loaded'
      ? reconciliationCarrierPicker.selectedCarrierConfigId
      : null;

  const hasCarrierConfigs = carrierConfigs.length > 0;

  const selectedCarrierConfigItem =
    carrierConfigs.find(
      (item) => item.carrierConfig.id === selectedCarrierConfigId,
    ) ?? carrierConfigs[0];

  const carrierConfigOptions: SelectOption<string>[] = carrierConfigs.map(
    (item) => ({
      value: item.carrierConfig.id,
      label: item.carrierConfig.name,
      contextualText: item.carrierName ?? undefined,
    }),
  );

  const handleCarrierConfigChange = (carrierConfigId: string) => {
    setReconciliationCarrierPicker({
      status: 'loaded',
      carrierConfigs,
      selectedCarrierConfigId: carrierConfigId,
    });
  };

  // The loaded configs stay in state after closing so the exit animation keeps its content.
  const handleClose = () => {
    closeDialog(RECONCILIATION_CARRIER_PICKER_MODAL_ID);
  };

  const handleConfirm = () => {
    if (!isDefined(selectedCarrierConfigItem)) {
      return;
    }

    handleClose();
    openReconciliationImportDialog(selectedCarrierConfigItem.carrierConfig);
  };

  return (
    <>
      {reconciliationCarrierPicker?.status === 'requested' && (
        <ReconciliationCarrierPickerRequestEffect
          onRequest={loadCarrierConfigs}
        />
      )}
      <DialogInstance
        dialogId={RECONCILIATION_CARRIER_PICKER_MODAL_ID}
        dismissible
        onEnter={hasCarrierConfigs ? handleConfirm : handleClose}
        renderInDocumentBody
      >
        {({ onKeyDown }) => (
          <Dialog.Popup
            onKeyDown={onKeyDown}
            size="compact"
            data-globally-prevent-click-outside
          >
            <Dialog.Header>
              <Dialog.Title>
                {hasCarrierConfigs
                  ? t`Select carrier`
                  : t`No carrier configuration`}
              </Dialog.Title>
              <Dialog.Description>
                {hasCarrierConfigs
                  ? t`This run will parse, match, and prefill column mapping using the selected carrier configuration.`
                  : t`Reconciliation runs need a carrier configuration record. Create a carrierConfig record linked to its carrier (or run the carrier-config seed command), then start the run again.`}
              </Dialog.Description>
            </Dialog.Header>
            {hasCarrierConfigs && (
              <Dialog.Body>
                <Select
                  dropdownId={RECONCILIATION_CARRIER_PICKER_SELECT_ID}
                  label={t`Carrier configuration`}
                  fullWidth
                  dropdownWidthAuto
                  options={carrierConfigOptions}
                  value={selectedCarrierConfigItem?.carrierConfig.id}
                  onChange={handleCarrierConfigChange}
                />
              </Dialog.Body>
            )}
            <Dialog.Footer>
              <StyledActionSlot>
                <Button
                  onClick={handleClose}
                  fullWidth
                  variant="outline"
                  data-testid="reconciliation-carrier-picker-cancel-button"
                >
                  {hasCarrierConfigs ? t`Cancel` : t`Close`}
                </Button>
              </StyledActionSlot>
              {hasCarrierConfigs && (
                <StyledActionSlot>
                  <Button
                    onClick={handleConfirm}
                    fullWidth
                    variant="solid"
                    color="accent"
                    data-testid="reconciliation-carrier-picker-confirm-button"
                  >{t`Continue`}</Button>
                </StyledActionSlot>
              )}
            </Dialog.Footer>
          </Dialog.Popup>
        )}
      </DialogInstance>
    </>
  );
};

// Mounted on the reconciliation index; the data hooks above only load once a
// run has been requested.
export const ReconciliationCarrierPickerModal = () => {
  const reconciliationCarrierPicker = useAtomStateValue(
    reconciliationCarrierPickerState,
  );

  if (!isDefined(reconciliationCarrierPicker)) {
    return null;
  }

  return <ReconciliationCarrierPickerDialog />;
};
