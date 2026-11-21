import { Controller, useFormContext } from 'react-hook-form';

import { useFieldMetadataItemById } from '@/object-metadata/hooks/useFieldMetadataItemById';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { SettingsOptionCardContentSelect } from '@/settings/components/SettingsOptions/SettingsOptionCardContentSelect';
import { type SettingsDataModelFieldRequiredFormValues } from '@/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldRequiredFormSchema';
import { Select } from '@/ui/input/components/Select';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type RequiredCondition } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { IconShield } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme';

type SettingsDataModelFieldRequiredFormProps = {
  objectNameSingular: string;
  existingFieldMetadataId: string;
  disabled?: boolean;
};

type RequiredMode = 'never' | 'always' | 'when';

type RequiredConditionType = Exclude<RequiredCondition['type'], 'always'>;

const DEFAULT_REQUIRED_CONDITION_TYPE: RequiredConditionType = 'fieldEmpty';

const StyledConditionalRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledWhenLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  white-space: nowrap;
`;

const getRequiredMode = (
  requiredCondition: RequiredCondition | null,
): RequiredMode => {
  if (!isDefined(requiredCondition)) {
    return 'never';
  }

  return requiredCondition.type === 'always' ? 'always' : 'when';
};

export const SettingsDataModelFieldRequiredForm = ({
  existingFieldMetadataId,
  objectNameSingular,
  disabled = false,
}: SettingsDataModelFieldRequiredFormProps) => {
  const { t } = useLingui();
  const { control } =
    useFormContext<SettingsDataModelFieldRequiredFormValues>();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const { fieldMetadataItem } = useFieldMetadataItemById(
    existingFieldMetadataId,
  );

  const conditionFieldOptions = objectMetadataItem.fields
    .filter(
      (field) =>
        field.id !== existingFieldMetadataId &&
        field.isActive === true &&
        field.isSystem !== true,
    )
    .map((field) => ({
      label: field.label,
      value: field.id,
    }));

  const requiredModeOptions: { label: string; value: RequiredMode }[] = [
    { label: t`Never`, value: 'never' },
    { label: t`Always`, value: 'always' },
    { label: t`When...`, value: 'when' },
  ];

  const conditionTypeOptions: {
    label: string;
    value: RequiredConditionType;
  }[] = [
    { label: t`is empty`, value: 'fieldEmpty' },
    { label: t`is not empty`, value: 'fieldNotEmpty' },
  ];

  return (
    <Controller
      name="requiredCondition"
      defaultValue={fieldMetadataItem?.requiredCondition ?? null}
      control={control}
      render={({ field: { onChange, value } }) => {
        const requiredCondition: RequiredCondition | null = value ?? null;

        const conditionalRequiredCondition =
          isDefined(requiredCondition) && requiredCondition.type !== 'always'
            ? requiredCondition
            : undefined;

        const conditionType =
          conditionalRequiredCondition?.type ?? DEFAULT_REQUIRED_CONDITION_TYPE;

        const changeRequiredCondition = (
          nextRequiredCondition: RequiredCondition | null,
        ) => onChange(nextRequiredCondition);

        const handleModeChange = (requiredMode: RequiredMode) => {
          if (requiredMode === 'never') {
            changeRequiredCondition(null);
            return;
          }

          if (requiredMode === 'always') {
            changeRequiredCondition({ type: 'always' });
            return;
          }

          const conditionFieldId =
            conditionalRequiredCondition?.fieldId ??
            conditionFieldOptions[0]?.value;

          if (!isDefined(conditionFieldId)) {
            return;
          }

          changeRequiredCondition({
            type: conditionType,
            fieldId: conditionFieldId,
          });
        };

        const handleConditionFieldChange = (fieldId: string) => {
          changeRequiredCondition({ type: conditionType, fieldId });
        };

        const handleConditionTypeChange = (type: RequiredConditionType) => {
          if (!isDefined(conditionalRequiredCondition)) {
            return;
          }

          changeRequiredCondition({
            type,
            fieldId: conditionalRequiredCondition.fieldId,
          });
        };

        return (
          <>
            <SettingsOptionCardContentSelect
              Icon={IconShield}
              title={t`Required`}
              description={t`Enforce that this field must have a value`}
            >
              <Select<RequiredMode>
                dropdownId="required-mode-select"
                value={getRequiredMode(requiredCondition)}
                onChange={handleModeChange}
                disabled={disabled}
                options={requiredModeOptions}
                selectSizeVariant="small"
              />
            </SettingsOptionCardContentSelect>
            {isDefined(conditionalRequiredCondition) && (
              <StyledConditionalRow>
                <StyledWhenLabel>{t`When`}</StyledWhenLabel>
                <Select<string>
                  dropdownId="required-condition-field-select"
                  value={conditionalRequiredCondition.fieldId}
                  options={conditionFieldOptions}
                  onChange={handleConditionFieldChange}
                  disabled={disabled}
                  selectSizeVariant="small"
                />
                <Select<RequiredConditionType>
                  dropdownId="required-condition-type-select"
                  value={conditionType}
                  options={conditionTypeOptions}
                  onChange={handleConditionTypeChange}
                  disabled={disabled}
                  selectSizeVariant="small"
                />
              </StyledConditionalRow>
            )}
          </>
        );
      }}
    />
  );
};
