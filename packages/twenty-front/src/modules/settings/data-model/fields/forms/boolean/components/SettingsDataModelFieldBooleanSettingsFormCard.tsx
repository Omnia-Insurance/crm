import { useFormContext } from 'react-hook-form';

import { SettingsCardSeparator } from '@/settings/components/SettingsCardSeparator';
import { SettingsDataModelPreviewFormCard } from '@/settings/data-model/components/SettingsDataModelPreviewFormCard';
// OMNIA-CUSTOM: soft Required rule (contract C5)
import { SettingsDataModelFieldRequiredForm } from '@/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm';
import {
  SettingsDataModelFieldBooleanForm,
  type SettingsDataModelFieldBooleanFormValues,
} from '@/settings/data-model/fields/forms/boolean/components/SettingsDataModelFieldBooleanForm';
import { SettingsDataModelFieldPreviewWidget } from '@/settings/data-model/fields/preview/components/SettingsDataModelFieldPreviewWidget';
import { FieldMetadataType } from 'twenty-shared/types';
import { type SettingsDataModelFieldEditFormValues } from '@/settings/data-model/types/SettingsDataModelFieldEditFormValues';

type SettingsDataModelFieldBooleanSettingsFormCardProps = {
  existingFieldMetadataId: string;
  objectNameSingular: string;
  disabled?: boolean;
};

export const SettingsDataModelFieldBooleanSettingsFormCard = ({
  existingFieldMetadataId,
  objectNameSingular,
  disabled = false,
}: SettingsDataModelFieldBooleanSettingsFormCardProps) => {
  const { watch } = useFormContext<
    SettingsDataModelFieldBooleanFormValues &
      SettingsDataModelFieldEditFormValues
  >();

  return (
    <SettingsDataModelPreviewFormCard
      preview={
        <SettingsDataModelFieldPreviewWidget
          fieldMetadataItem={{
            type: FieldMetadataType.BOOLEAN,
            label: watch('label'),
            icon: watch('icon'),
            defaultValue: watch('defaultValue'),
          }}
          objectNameSingular={objectNameSingular}
        />
      }
      form={
        <>
          <SettingsDataModelFieldBooleanForm
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
