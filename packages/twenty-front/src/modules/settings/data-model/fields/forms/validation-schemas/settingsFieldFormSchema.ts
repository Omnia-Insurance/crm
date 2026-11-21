import { settingsDataModelFieldDescriptionFormSchema } from '@/settings/data-model/fields/forms/components/SettingsDataModelFieldDescriptionForm';
import { settingsDataModelFieldIconLabelFormSchema } from '@/settings/data-model/fields/forms/components/SettingsDataModelFieldIconLabelForm';
// OMNIA-CUSTOM: soft Required rule (contract C5)
import { settingsDataModelFieldRequiredFormSchema } from '@/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldRequiredFormSchema';
import { settingsDataModelFieldSettingsFormSchema } from '@/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldSettingsFormSchema';
import { isDefined } from 'twenty-shared/utils';
import { z } from 'zod';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { settingsDataModelFieldTypeFormSchema } from '@/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldTypeFormSchema';

type SettingsFieldFormSchemaOptions = {
  existingOtherLabels?: string[];
  sourceObjectMetadataId?: string;
};

export const settingsFieldFormSchema = (
  options: SettingsFieldFormSchemaOptions = {},
) => {
  const { existingOtherLabels, sourceObjectMetadataId } = options;

  const baseSchema = z
    .object({})
    .extend(
      settingsDataModelFieldIconLabelFormSchema(existingOtherLabels).shape,
    )
    .extend(settingsDataModelFieldDescriptionFormSchema().shape)
    .extend(settingsDataModelFieldTypeFormSchema.shape)
    // OMNIA-CUSTOM: soft Required rule (contract C5); zod strips keys the schema does not list
    .extend(settingsDataModelFieldRequiredFormSchema.shape)
    .and(settingsDataModelFieldSettingsFormSchema)
    .refine((data) => {
      const formData = data as {
        type?: FieldMetadataType;
        morphRelationObjectMetadataIds?: string[];
      };
      if (formData.type !== FieldMetadataType.MORPH_RELATION) {
        return true;
      }
      if (!isDefined(sourceObjectMetadataId)) {
        return true;
      }
      if (
        !isDefined(formData.morphRelationObjectMetadataIds) ||
        formData.morphRelationObjectMetadataIds.length <= 1
      ) {
        return true;
      }
      if (
        formData.morphRelationObjectMetadataIds.includes(sourceObjectMetadataId)
      ) {
        return false;
      }
      return true;
    });

  return baseSchema;
};
