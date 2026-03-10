import { Controller, useFormContext } from 'react-hook-form';

import { useFieldMetadataItemById } from '@/object-metadata/hooks/useFieldMetadataItemById';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { SettingsOptionCardContentSelect } from '@/settings/components/SettingsOptions/SettingsOptionCardContentSelect';
import { Select } from '@/ui/input/components/Select';
import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { IconShield } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type RequiredCondition = {
  type: 'always' | 'fieldEmpty' | 'fieldNotEmpty';
  fieldId?: string;
} | null;

type SettingsDataModelFieldRequiredFormValues = {
  requiredCondition: RequiredCondition;
};

type SettingsDataModelFieldRequiredFormProps = {
  objectNameSingular: string;
  existingFieldMetadataId: string;
  disabled?: boolean;
};

const StyledConditionalRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledWhenLabel = styled.span`
  font-size: ${themeCssVariables.font.size.md};
  color: ${themeCssVariables.font.color.primary};
  white-space: nowrap;
`;

type RequiredMode = 'never' | 'always' | 'when';

const getRequiredMode = (value: RequiredCondition): RequiredMode => {
  if (value === null || value === undefined) return 'never';
  if (value.type === 'always') return 'always';
  return 'when';
};

export const SettingsDataModelFieldRequiredForm = ({
  existingFieldMetadataId,
  objectNameSingular,
  disabled = false,
}: SettingsDataModelFieldRequiredFormProps) => {
  const { control } =
    useFormContext<SettingsDataModelFieldRequiredFormValues>();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const { fieldMetadataItem } = useFieldMetadataItemById(
    existingFieldMetadataId,
  );

  const otherFields = objectMetadataItem.fields.filter(
    (field) =>
      field.id !== existingFieldMetadataId &&
      field.isActive &&
      !field.isSystem,
  );

  const fieldOptions = otherFields.map((field) => ({
    label: field.label,
    value: field.id,
  }));

  return (
    <Controller
      name="requiredCondition"
      defaultValue={fieldMetadataItem?.requiredCondition ?? null}
      control={control}
      render={({ field: { onChange, value } }) => {
        const mode = getRequiredMode(value);
        const conditionFieldId = value?.fieldId;
        const conditionType =
          value?.type === 'always' ? 'fieldEmpty' : (value?.type ?? 'fieldEmpty');

        const handleModeChange = (newMode: RequiredMode) => {
          if (newMode === 'never') {
            onChange(null);
          } else if (newMode === 'always') {
            onChange({ type: 'always' });
          } else {
            onChange({
              type: 'fieldEmpty',
              fieldId: conditionFieldId ?? fieldOptions[0]?.value,
            });
          }
        };

        const handleFieldChange = (fieldId: string) => {
          onChange({ type: conditionType, fieldId });
        };

        const handleConditionTypeChange = (
          type: 'fieldEmpty' | 'fieldNotEmpty',
        ) => {
          onChange({ type, fieldId: conditionFieldId });
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
                value={mode}
                onChange={handleModeChange}
                disabled={disabled}
                options={[
                  { label: t`Never`, value: 'never' },
                  { label: t`Always`, value: 'always' },
                  { label: t`When...`, value: 'when' },
                ]}
                selectSizeVariant="small"
              />
            </SettingsOptionCardContentSelect>
            {mode === 'when' && (
              <StyledConditionalRow>
                <StyledWhenLabel>{t`When`}</StyledWhenLabel>
                <Select
                  dropdownId="required-condition-field-select"
                  value={conditionFieldId}
                  options={fieldOptions}
                  onChange={handleFieldChange}
                  disabled={disabled}
                  selectSizeVariant="small"
                />
                <Select
                  dropdownId="required-condition-type-select"
                  value={conditionType}
                  options={[
                    { label: t`is empty`, value: 'fieldEmpty' as const },
                    {
                      label: t`is not empty`,
                      value: 'fieldNotEmpty' as const,
                    },
                  ]}
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
