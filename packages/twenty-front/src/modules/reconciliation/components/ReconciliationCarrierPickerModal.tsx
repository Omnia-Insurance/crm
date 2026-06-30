import { styled } from '@linaria/react';

import { RECONCILIATION_CARRIER_PICKER_MODAL_ID } from '@/reconciliation/constants/ReconciliationCarrierPickerModalId';
import { useOpenReconciliationImportDialog } from '@/reconciliation/hooks/useOpenReconciliationImportDialog';
import {
  reconciliationCarrierPickerState,
  type ReconciliationCarrierPickerStateValue,
} from '@/reconciliation/states/reconciliationCarrierPickerState';
import { Select } from '@/ui/input/components/Select';
import { StyledCenteredButton } from '@/ui/layout/modal/components/ConfirmationModal';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { isDefined } from 'twenty-shared/utils';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';
import { type SelectOption } from 'twenty-ui/input';
import { Section, SectionAlignment, SectionFontColor } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const RECONCILIATION_CARRIER_PICKER_SELECT_ID =
  'reconciliation-carrier-picker-select';

const StyledCenteredTitle = styled.div`
  text-align: center;
`;

const StyledSectionContainer = styled.div`
  margin-bottom: ${themeCssVariables.spacing[4]};
`;

const StyledSelectContainer = styled.div`
  margin-bottom: ${themeCssVariables.spacing[6]};
`;

/**
 * Carrier selection step for the reconciliation run wizard.
 *
 * Rendered (empty) on the reconciliation index page; becomes visible when
 * useOpenReconciliationWizard finds zero or more-than-one carrierConfig
 * records. Exactly-one-config workspaces never see this modal — the wizard
 * opens the import dialog directly, so the single-carrier flow keeps its
 * zero-click behavior.
 */
export const ReconciliationCarrierPickerModal = () => {
  const reconciliationCarrierPicker = useAtomStateValue(
    reconciliationCarrierPickerState,
  );

  if (!isDefined(reconciliationCarrierPicker)) {
    return null;
  }

  return (
    <ReconciliationCarrierPickerModalContent
      pickerState={reconciliationCarrierPicker}
    />
  );
};

type ReconciliationCarrierPickerModalContentProps = {
  pickerState: NonNullable<ReconciliationCarrierPickerStateValue>;
};

const ReconciliationCarrierPickerModalContent = ({
  pickerState,
}: ReconciliationCarrierPickerModalContentProps) => {
  const setReconciliationCarrierPicker = useSetAtomState(
    reconciliationCarrierPickerState,
  );
  const { closeModal } = useModal();

  const { openReconciliationImportDialog } =
    useOpenReconciliationImportDialog();

  const { carrierConfigs, selectedCarrierConfigId } = pickerState;

  const hasCarrierConfigs = carrierConfigs.length > 0;

  const selectedItem =
    carrierConfigs.find(
      (item) => item.carrierConfig.id === selectedCarrierConfigId,
    ) ?? carrierConfigs[0];

  const options: SelectOption<string>[] = carrierConfigs.map((item) => ({
    value: item.carrierConfig.id,
    label: item.carrierConfig.name,
    contextualText: item.carrierName ?? undefined,
  }));

  const handleSelectChange = (carrierConfigId: string) => {
    setReconciliationCarrierPicker({
      carrierConfigs,
      selectedCarrierConfigId: carrierConfigId,
    });
  };

  const handleDismiss = () => {
    setReconciliationCarrierPicker(null);
  };

  const handleCancelClick = () => {
    closeModal(RECONCILIATION_CARRIER_PICKER_MODAL_ID);
    handleDismiss();
  };

  const handleConfirmClick = () => {
    if (!isDefined(selectedItem)) {
      return;
    }

    closeModal(RECONCILIATION_CARRIER_PICKER_MODAL_ID);
    setReconciliationCarrierPicker(null);
    openReconciliationImportDialog(selectedItem.carrierConfig);
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={RECONCILIATION_CARRIER_PICKER_MODAL_ID}
      onClose={handleDismiss}
      onEnter={hasCarrierConfigs ? handleConfirmClick : handleCancelClick}
      isClosable={true}
      padding="large"
      overlay="dark"
      dataGloballyPreventClickOutside
      renderInDocumentBody
      smallBorderRadius
      narrowWidth
      autoHeight
    >
      <StyledCenteredTitle>
        <H1Title
          title={
            hasCarrierConfigs ? 'Select carrier' : 'No carrier configuration'
          }
          fontColor={H1TitleFontColor.Primary}
        />
      </StyledCenteredTitle>
      <StyledSectionContainer>
        <Section
          alignment={SectionAlignment.Center}
          fontColor={SectionFontColor.Primary}
        >
          {hasCarrierConfigs
            ? 'This run will parse, match, and prefill column mapping using the selected carrier configuration.'
            : 'Reconciliation runs need a carrier configuration record. Create a carrierConfig record linked to its carrier (or run the carrier-config seed command), then start the run again.'}
        </Section>
      </StyledSectionContainer>
      {hasCarrierConfigs && (
        <StyledSelectContainer>
          <Select
            dropdownId={RECONCILIATION_CARRIER_PICKER_SELECT_ID}
            label="Carrier configuration"
            fullWidth
            dropdownWidthAuto
            options={options}
            value={selectedItem?.carrierConfig.id}
            onChange={handleSelectChange}
          />
        </StyledSelectContainer>
      )}
      <StyledCenteredButton
        onClick={handleCancelClick}
        variant="secondary"
        title={hasCarrierConfigs ? 'Cancel' : 'Close'}
        fullWidth
        justify="center"
        dataTestId="reconciliation-carrier-picker-cancel-button"
      />
      {hasCarrierConfigs && (
        <StyledCenteredButton
          onClick={handleConfirmClick}
          variant="primary"
          accent="blue"
          title="Continue"
          fullWidth
          justify="center"
          dataTestId="reconciliation-carrier-picker-confirm-button"
        />
      )}
    </ModalStatefulWrapper>
  );
};
