import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { IconButton } from 'twenty-ui/components/input';
import { IconArrowRight, IconPlus, IconTrash } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';
import { v4 } from 'uuid';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import {
  type CreateIngestionFieldMappingInput,
  type IngestionFieldMappingFragmentFragment,
  type UpdateIngestionFieldMappingInputUpdates,
} from '~/generated-metadata/graphql';

type EditableMappingField =
  | 'sourceFieldPath'
  | 'targetFieldName'
  | 'targetCompositeSubField';

type NewMapping = Record<EditableMappingField, string> & {
  temporaryId: string;
};

type IngestionFieldMappingEditorProps = {
  pipelineId: string;
  mappings: IngestionFieldMappingFragmentFragment[];
  onSaveMappings: (
    inputs: CreateIngestionFieldMappingInput[],
  ) => Promise<unknown>;
  onUpdateMapping: (
    id: string,
    update: UpdateIngestionFieldMappingInputUpdates,
  ) => Promise<unknown>;
  onDeleteMapping: (id: string) => Promise<void>;
};

const MAPPING_FIELD_PLACEHOLDERS: Record<EditableMappingField, string> = {
  sourceFieldPath: doNotTranslate('data.firstName'),
  targetFieldName: doNotTranslate('name'),
  targetCompositeSubField: doNotTranslate('firstName'),
};

const StyledEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledRow = styled.div`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 1fr ${themeCssVariables.spacing[4]} 1fr 1fr ${themeCssVariables.spacing[8]};
`;

const StyledHeaderRow = styled(StyledRow)`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledArrow = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  justify-content: center;
`;

const StyledButtonRow = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[1]};
`;

const getMappingDraftKey = (mappingId: string, field: EditableMappingField) =>
  `${mappingId}:${field}`;

const getMappingFieldUpdate = (
  mapping: IngestionFieldMappingFragmentFragment,
  field: EditableMappingField,
  draftValue: string,
): UpdateIngestionFieldMappingInputUpdates | null => {
  const trimmedValue = draftValue.trim();

  if (field === 'targetCompositeSubField') {
    const targetCompositeSubField = isNonEmptyString(trimmedValue)
      ? trimmedValue
      : null;

    return targetCompositeSubField === mapping.targetCompositeSubField
      ? null
      : { targetCompositeSubField };
  }

  // Source and target paths are required, so emptying one reverts it
  if (!isNonEmptyString(trimmedValue) || trimmedValue === mapping[field]) {
    return null;
  }

  return field === 'sourceFieldPath'
    ? { sourceFieldPath: trimmedValue }
    : { targetFieldName: trimmedValue };
};

const createEmptyNewMapping = (): NewMapping => ({
  temporaryId: v4(),
  sourceFieldPath: '',
  targetFieldName: '',
  targetCompositeSubField: '',
});

export const IngestionFieldMappingEditor = ({
  pipelineId,
  mappings,
  onSaveMappings,
  onUpdateMapping,
  onDeleteMapping,
}: IngestionFieldMappingEditorProps) => {
  const { t } = useLingui();
  const theme = useTheme();
  const { enqueueToast } = useToast();
  const [newMappings, setNewMappings] = useState<NewMapping[]>([]);
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, string>>(
    {},
  );
  const [isSaving, setIsSaving] = useState(false);

  const columnLabels: Record<EditableMappingField, string> = {
    sourceFieldPath: t`Source field path`,
    targetFieldName: t`Target CRM field`,
    targetCompositeSubField: t`Sub-field`,
  };

  const getDisplayedMappingValue = (
    mapping: IngestionFieldMappingFragmentFragment,
    field: EditableMappingField,
  ) =>
    mappingDrafts[getMappingDraftKey(mapping.id, field)] ??
    mapping[field] ??
    '';

  const setMappingDraft = (draftKey: string, value: string) => {
    setMappingDrafts((currentDrafts) => ({
      ...currentDrafts,
      [draftKey]: value,
    }));
  };

  const removeMappingDraft = (draftKey: string, committedValue: string) => {
    setMappingDrafts((currentDrafts) => {
      if (currentDrafts[draftKey] !== committedValue) {
        return currentDrafts;
      }

      const { [draftKey]: _committedDraft, ...remainingDrafts } = currentDrafts;

      return remainingDrafts;
    });
  };

  // Saved on blur rather than per keystroke, so typing never races the save
  const commitMappingDraft = async (
    mapping: IngestionFieldMappingFragmentFragment,
    field: EditableMappingField,
  ) => {
    const draftKey = getMappingDraftKey(mapping.id, field);
    const draftValue = mappingDrafts[draftKey];

    if (!isDefined(draftValue)) {
      return;
    }

    const update = getMappingFieldUpdate(mapping, field, draftValue);

    try {
      if (isDefined(update)) {
        await onUpdateMapping(mapping.id, update);
      }
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    } finally {
      removeMappingDraft(draftKey, draftValue);
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    try {
      await onDeleteMapping(mappingId);
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  const addNewMapping = () => {
    setNewMappings([...newMappings, createEmptyNewMapping()]);
  };

  const updateNewMapping = (
    temporaryId: string,
    field: EditableMappingField,
    value: string,
  ) => {
    setNewMappings(
      newMappings.map((newMapping) =>
        newMapping.temporaryId === temporaryId
          ? { ...newMapping, [field]: value }
          : newMapping,
      ),
    );
  };

  const removeNewMapping = (temporaryId: string) => {
    setNewMappings(
      newMappings.filter(
        (newMapping) => newMapping.temporaryId !== temporaryId,
      ),
    );
  };

  const saveNewMappings = async () => {
    const completeNewMappings = newMappings.filter(
      (newMapping) =>
        isNonEmptyString(newMapping.sourceFieldPath.trim()) &&
        isNonEmptyString(newMapping.targetFieldName.trim()),
    );

    if (completeNewMappings.length === 0) {
      return;
    }

    setIsSaving(true);

    try {
      await onSaveMappings(
        completeNewMappings.map((newMapping, index) => ({
          pipelineId,
          sourceFieldPath: newMapping.sourceFieldPath.trim(),
          targetFieldName: newMapping.targetFieldName.trim(),
          targetCompositeSubField:
            newMapping.targetCompositeSubField.trim() || null,
          transform: null,
          relationTargetObjectName: null,
          relationMatchFieldName: null,
          relationAutoCreate: false,
          position: mappings.length + index,
        })),
      );
      setNewMappings([]);
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    } finally {
      setIsSaving(false);
    }
  };

  const arrow = (
    <StyledArrow>
      <IconArrowRight size={theme.icon.size.md} stroke={theme.icon.stroke.sm} />
    </StyledArrow>
  );

  return (
    <StyledEditor>
      <StyledHeaderRow>
        <span>{columnLabels.sourceFieldPath}</span>
        <span />
        <span>{columnLabels.targetFieldName}</span>
        <span>{columnLabels.targetCompositeSubField}</span>
        <span />
      </StyledHeaderRow>

      {mappings.map((mapping) => {
        const renderMappingInput = (field: EditableMappingField) => (
          <SettingsTextInput
            instanceId={`ingestion-field-mapping-${getMappingDraftKey(mapping.id, field)}`}
            aria-label={columnLabels[field]}
            placeholder={MAPPING_FIELD_PLACEHOLDERS[field]}
            value={getDisplayedMappingValue(mapping, field)}
            onChange={(value) =>
              setMappingDraft(getMappingDraftKey(mapping.id, field), value)
            }
            onBlur={() => commitMappingDraft(mapping, field)}
            fullWidth
          />
        );

        return (
          <StyledRow key={mapping.id}>
            {renderMappingInput('sourceFieldPath')}
            {arrow}
            {renderMappingInput('targetFieldName')}
            {renderMappingInput('targetCompositeSubField')}
            <IconButton
              variant="ghost"
              size="md"
              aria-label={t`Remove mapping`}
              onClick={() => handleDeleteMapping(mapping.id)}
            >
              <IconTrash />
            </IconButton>
          </StyledRow>
        );
      })}

      {newMappings.map((newMapping) => {
        const renderNewMappingInput = (field: EditableMappingField) => (
          <SettingsTextInput
            instanceId={`ingestion-new-field-mapping-${newMapping.temporaryId}:${field}`}
            aria-label={columnLabels[field]}
            placeholder={MAPPING_FIELD_PLACEHOLDERS[field]}
            value={newMapping[field]}
            onChange={(value) =>
              updateNewMapping(newMapping.temporaryId, field, value)
            }
            fullWidth
          />
        );

        return (
          <StyledRow key={newMapping.temporaryId}>
            {renderNewMappingInput('sourceFieldPath')}
            {arrow}
            {renderNewMappingInput('targetFieldName')}
            {renderNewMappingInput('targetCompositeSubField')}
            <IconButton
              variant="ghost"
              size="md"
              aria-label={t`Remove mapping`}
              onClick={() => removeNewMapping(newMapping.temporaryId)}
            >
              <IconTrash />
            </IconButton>
          </StyledRow>
        );
      })}

      <StyledButtonRow>
        <Button
          startIcon={<IconPlus />}
          size="sm"
          variant="outline"
          onClick={addNewMapping}
        >{t`Add mapping`}</Button>
        {newMappings.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            loading={isSaving}
            onClick={saveNewMappings}
          >{t`Save new mappings`}</Button>
        )}
      </StyledButtonRow>
    </StyledEditor>
  );
};
