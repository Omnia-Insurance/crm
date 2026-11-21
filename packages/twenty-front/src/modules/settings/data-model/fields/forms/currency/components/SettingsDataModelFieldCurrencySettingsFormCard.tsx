import { useFormContext } from 'react-hook-form';

import { SettingsCardSeparator } from '@/settings/components/SettingsCardSeparator';
import { SettingsDataModelPreviewFormCard } from '@/settings/data-model/components/SettingsDataModelPreviewFormCard';
// OMNIA-CUSTOM: soft Required rule (contract C5)
import { SettingsDataModelFieldRequiredForm } from '@/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm';
import {
  SettingsDataModelFieldCurrencyForm,
  type SettingsDataModelFieldCurrencyFormValues,
} from '@/settings/data-model/fields/forms/currency/components/SettingsDataModelFieldCurrencyForm';
import { SettingsDataModelFieldPreviewWidget } from '@/settings/data-model/fields/preview/components/SettingsDataModelFieldPreviewWidget';
import { FieldMetadataType } from 'twenty-shared/types';
import { type SettingsDataModelFieldEditFormValues } from '@/settings/data-model/types/SettingsDataModelFieldEditFormValues';

type SettingsDataModelFieldCurrencySettingsFormCardProps = {
  disabled?: boolean;
  existingFieldMetadataId: string;
  objectNameSingular: string;
};

export const SettingsDataModelFieldCurrencySettingsFormCard = ({
  disabled,
  existingFieldMetadataId,
  objectNameSingular,
}: SettingsDataModelFieldCurrencySettingsFormCardProps) => {
  const { watch } = useFormContext<
    SettingsDataModelFieldCurrencyFormValues &
      SettingsDataModelFieldEditFormValues
  >();

  return (
    <SettingsDataModelPreviewFormCard
      preview={
        <SettingsDataModelFieldPreviewWidget
          fieldMetadataItem={{
            type: FieldMetadataType.CURRENCY,
            label: watch('label'),
            icon: watch('icon'),
            defaultValue: watch('defaultValue'),
            settings: watch('settings'),
          }}
          objectNameSingular={objectNameSingular}
        />
      }
      form={
        <>
          <SettingsDataModelFieldCurrencyForm
            disabled={disabled}
            existingFieldMetadataId={existingFieldMetadataId}
          />
          {/* OMNIA-CUSTOM: soft Required rule (contract C5) */}
          <SettingsCardSeparator />
          <SettingsDataModelFieldRequiredForm
            existingFieldMetadataId={existingFieldMetadataId}
            objectNameSingular={objectNameSingular}
            disabled={disabled}
          />
        </>
      }
    />
  );
};
