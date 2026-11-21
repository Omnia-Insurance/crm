import { useFormContext } from 'react-hook-form';
import { type z } from 'zod';

import { SettingsCardSeparator } from '@/settings/components/SettingsCardSeparator';
import { SettingsDataModelPreviewFormCard } from '@/settings/data-model/components/SettingsDataModelPreviewFormCard';
// OMNIA-CUSTOM: soft Required rule (contract C5)
import { SettingsDataModelFieldRequiredForm } from '@/settings/data-model/fields/forms/components/SettingsDataModelFieldRequiredForm';
import {
  type settingsDataModelFieldMultiSelectFormSchema,
  SettingsDataModelFieldSelectForm,
  type settingsDataModelFieldSelectFormSchema,
} from '@/settings/data-model/fields/forms/select/components/SettingsDataModelFieldSelectForm';
import { SettingsDataModelFieldPreviewWidget } from '@/settings/data-model/fields/preview/components/SettingsDataModelFieldPreviewWidget';
import { type FieldMetadataType } from 'twenty-shared/types';
import { type SettingsDataModelFieldEditFormValues } from '@/settings/data-model/types/SettingsDataModelFieldEditFormValues';

type SettingsDataModelFieldSelectOrMultiSelectFormValues = z.infer<
  | typeof settingsDataModelFieldSelectFormSchema
  | typeof settingsDataModelFieldMultiSelectFormSchema
>;

type SettingsDataModelFieldSelectSettingsFormCardProps = {
  objectNameSingular: string;
  fieldType: FieldMetadataType.SELECT | FieldMetadataType.MULTI_SELECT;
  existingFieldMetadataId: string;
  disabled?: boolean;
};

export const SettingsDataModelFieldSelectSettingsFormCard = ({
  objectNameSingular,
  fieldType,
  existingFieldMetadataId,
  disabled = false,
}: SettingsDataModelFieldSelectSettingsFormCardProps) => {
  const { watch: watchFormValue } = useFormContext<
    SettingsDataModelFieldSelectOrMultiSelectFormValues &
      SettingsDataModelFieldEditFormValues
  >();

  return (
    <SettingsDataModelPreviewFormCard
      preview={
        <SettingsDataModelFieldPreviewWidget
          fieldMetadataItem={{
            type: fieldType,
            label: watchFormValue('label'),
            icon: watchFormValue('icon'),
            defaultValue: watchFormValue('defaultValue'),
            options: watchFormValue('options'),
          }}
          objectNameSingular={objectNameSingular}
        />
      }
      form={
        <>
          <SettingsDataModelFieldSelectForm
            fieldType={fieldType}
            existingFieldMetadataId={existingFieldMetadataId}
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
