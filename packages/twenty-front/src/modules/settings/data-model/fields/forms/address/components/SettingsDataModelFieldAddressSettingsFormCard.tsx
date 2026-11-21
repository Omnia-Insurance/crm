import { SettingsCardSeparator } from '@/settings/components/SettingsCardSeparator';
import { SettingsDataModelPreviewFormCard } from '@/settings/data-model/components/SettingsDataModelPreviewFormCard';
// OMNIA-CUSTOM: soft Required rule (contract C5)
import { SettingsDataModelFieldRequiredForm } from '@/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm';
import {
  SettingsDataModelFieldAddressForm,
  type SettingsDataModelFieldTextFormValues,
} from '@/settings/data-model/fields/forms/address/components/SettingsDataModelFieldAddressForm';
import { SettingsDataModelFieldPreviewWidget } from '@/settings/data-model/fields/preview/components/SettingsDataModelFieldPreviewWidget';
import { useFormContext } from 'react-hook-form';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { type SettingsDataModelFieldEditFormValues } from '@/settings/data-model/types/SettingsDataModelFieldEditFormValues';

type SettingsDataModelFieldAddressSettingsFormCardProps = {
  disabled?: boolean;
  existingFieldMetadataId: string;
  objectNameSingular: string;
};

export const SettingsDataModelFieldAddressSettingsFormCard = ({
  disabled,
  existingFieldMetadataId,
  objectNameSingular,
}: SettingsDataModelFieldAddressSettingsFormCardProps) => {
  const { watch } = useFormContext<
    SettingsDataModelFieldTextFormValues & SettingsDataModelFieldEditFormValues
  >();
  return (
    <SettingsDataModelPreviewFormCard
      preview={
        <SettingsDataModelFieldPreviewWidget
          fieldMetadataItem={{
            icon: watch('icon'),
            label: watch('label'),
            type: FieldMetadataType.ADDRESS,
            settings: {
              subFields: watch('settings.subFields'),
            },
          }}
          objectNameSingular={objectNameSingular}
        />
      }
      form={
        <>
          <SettingsDataModelFieldAddressForm
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
