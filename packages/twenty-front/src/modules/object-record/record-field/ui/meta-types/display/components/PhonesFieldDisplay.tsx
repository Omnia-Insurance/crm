import { useFieldFocus } from '@/object-record/record-field/ui/hooks/useFieldFocus';
import { usePhonesFieldDisplay } from '@/object-record/record-field/ui/meta-types/hooks/usePhonesFieldDisplay';
import { useDialFromPhoneField } from '@/object-record/record-table/record-table-cell/hooks/useDialFromPhoneField';
import { PhonesDisplay } from '@/ui/field/display/components/PhonesDisplay';
import { useLingui } from '@lingui/react/macro';
import React from 'react';
import { FieldMetadataSettingsOnClickAction } from 'twenty-shared/types';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

export const PhonesFieldDisplay = () => {
  const { fieldValue, fieldDefinition } = usePhonesFieldDisplay();
  const { copyToClipboard } = useCopyToClipboard();
  const { isFocused } = useFieldFocus();
  // OMNIA-CUSTOM: route phone clicks through the softphone when the
  // Telephony app is installed; fall through to upstream tel:/copy behavior
  // otherwise.
  const { dial, canDial } = useDialFromPhoneField();

  const { t } = useLingui();

  const onClickAction = fieldDefinition.metadata.settings?.clickAction;

  const handleClick = async (
    phoneNumber: string,
    event: React.MouseEvent<HTMLElement>,
  ) => {
    if (onClickAction === FieldMetadataSettingsOnClickAction.COPY) {
      event.preventDefault();
      copyToClipboard(phoneNumber, t`Phone number copied to clipboard`);
      return;
    }
    if (canDial) {
      event.preventDefault();
      dial(phoneNumber);
    }
  };

  return (
    <PhonesDisplay
      value={fieldValue}
      isFocused={isFocused}
      onPhoneNumberClick={handleClick}
    />
  );
};
