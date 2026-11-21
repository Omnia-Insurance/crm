import { useFormContext } from 'react-hook-form';

import { SettingsCardSeparator } from '@/settings/components/SettingsCardSeparator';
import { SettingsDataModelPreviewFormCard } from '@/settings/data-model/components/SettingsDataModelPreviewFormCard';
import { SettingsDataModelFieldIsUniqueForm } from '@/settings/data-model/fields/forms/components/SettingsDataModelFieldIsUniqueForm';
// OMNIA-CUSTOM: soft Required rule (contract C5)
import { SettingsDataModelFieldRequiredForm } from '@/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm';
import {
  SettingsDataModelFieldDateForm,
  type SettingsDataModelFieldDateFormValues,
} from '@/settings/data-model/fields/forms/date/components/SettingsDataModelFieldDateForm';
import { SettingsDataModelFieldPreviewWidget } from '@/settings/data-model/fields/preview/components/SettingsDataModelFieldPreviewWidget';
import { type FieldMetadataType } from 'twenty-shared/types';
import { type SettingsDataModelFieldEditFormValues } from '@/settings/data-model/types/SettingsDataModelFieldEditFormValues';

type SettingsDataModelFieldDateSettingsFormCardProps = {
  disabled?: boolean;
  fieldType: FieldMetadataType.DATE_TIME | FieldMetadataType.DATE;
  existingFieldMetadataId: string;
  objectNameSingular: string;
};

export const SettingsDataModelFieldDateSettingsFormCard = ({
  disabled,
  fieldType,
  existingFieldMetadataId,
  objectNameSingular,
}: SettingsDataModelFieldDateSettingsFormCardProps) => {
  const { watch } = useFormContext<
    SettingsDataModelFieldDateFormValues & SettingsDataModelFieldEditFormValues
  >();

  return (
    <SettingsDataModelPreviewFormCard
      preview={
        <SettingsDataModelFieldPreviewWidget
          fieldMetadataItem={{
            type: fieldType,
            label: watch('label'),
            icon: watch('icon'),
            settings: {
              displayFormat: watch('settings.displayFormat'),
              customUnicodeDateFormat: watch(
                'settings.customUnicodeDateFormat',
              ),
            },
          }}
          objectNameSingular={objectNameSingular}
        />
      }
      form={
        <>
          <SettingsDataModelFieldDateForm
            disabled={disabled}
            existingFieldMetadataId={existingFieldMetadataId}
          />
          <SettingsCardSeparator />
          <SettingsDataModelFieldIsUniqueForm
            fieldType={fieldType}
            existingFieldMetadataId={existingFieldMetadataId}
            objectNameSingular={objectNameSingular}
            disabled={disabled}
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
