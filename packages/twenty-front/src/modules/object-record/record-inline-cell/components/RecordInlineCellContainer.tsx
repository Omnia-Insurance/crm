import { styled } from '@linaria/react';
import { useCallback, useContext } from 'react';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';

import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useFieldFocus } from '@/object-record/record-field/ui/hooks/useFieldFocus';
import { RecordInlineCellValue } from '@/object-record/record-inline-cell/components/RecordInlineCellValue';
import { getRecordFieldInputInstanceId } from '@/object-record/utils/getRecordFieldInputId';

import { assertFieldMetadata } from '@/object-record/record-field/ui/types/guards/assertFieldMetadata';
import { isFieldText } from '@/object-record/record-field/ui/types/guards/isFieldText';
import {
  AppTooltip,
  OverflowingTextWithTooltip,
  TooltipDelay,
} from 'twenty-ui/display';
import { type EmailsMetadata, type PhonesMetadata } from 'twenty-shared/types';
import {
  promotePrimaryEmailToAdditional,
  promotePrimaryPhoneToAdditional,
} from 'twenty-shared/utils';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { useRecordInlineCellContext } from './RecordInlineCellContext';

const StyledIconContainer = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  width: 16px;

  svg {
    align-items: center;
    display: flex;
    height: 16px;
    justify-content: center;
    width: 16px;
  }
`;

const StyledLabelAndIconContainer = styled.div`
  align-items: center;
  align-self: flex-start;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  height: 24px;
`;

const StyledValueContainer = styled.div<{ readonly: boolean }>`
  display: flex;
  min-width: 0;
  position: relative;
  width: 100%;
`;

const StyledLabelContainer = styled.div<{ width?: number }>`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  width: ${({ width }) => (width !== undefined ? `${width}px` : 'auto')};
`;

const StyledInlineCellBaseContainer = styled.div<{
  readonly: boolean;
  diffState?: 'none' | 'pending' | 'accepted';
}>`
  align-items: center;
  box-sizing: border-box;
  cursor: ${({ readonly }) => (readonly ? 'default' : 'pointer')};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  height: fit-content;
  user-select: none;
  width: 100%;
  background: ${({ diffState }) => {
    if (diffState === 'accepted')
      return themeCssVariables.color.transparent.red2;
    if (diffState === 'pending')
      return themeCssVariables.color.transparent.green2;
    return 'transparent';
  }};
  border-left: ${({ diffState }) => {
    if (diffState === 'accepted')
      return `2px solid ${themeCssVariables.color.red}`;
    if (diffState === 'pending')
      return `2px solid ${themeCssVariables.color.green}`;
    return '2px solid transparent';
  }};
  border-radius: ${({ diffState }) =>
    diffState && diffState !== 'none'
      ? `0 ${themeCssVariables.border.radius.sm} ${themeCssVariables.border.radius.sm} 0`
      : '0'};
  padding-left: ${({ diffState }) =>
    diffState && diffState !== 'none' ? themeCssVariables.spacing[1] : '0'};
`;

export const StyledSkeletonDiv = styled.div`
  height: 24px;
`;

// OMNIA-CUSTOM: Inline diff value display (replaces standard value when diff exists)
const StyledDiffValueDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  width: 100%;
  font-size: ${themeCssVariables.font.size.md};
`;

const StyledDiffOld = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  text-decoration: line-through;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledDiffArrow = styled.span`
  color: ${themeCssVariables.font.color.light};
  flex-shrink: 0;
`;

const StyledDiffNew = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledDiffAcceptBtn = styled.button<{ accepted: boolean }>`
  flex-shrink: 0;
  padding: 0 ${themeCssVariables.spacing[2]};
  border-radius: ${themeCssVariables.border.radius.sm};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  font-family: inherit;
  cursor: pointer;
  height: 20px;
  border: 1px solid
    ${({ accepted }) =>
      accepted ? themeCssVariables.color.red : themeCssVariables.color.green};
  background: ${({ accepted }) =>
    accepted ? themeCssVariables.color.red : themeCssVariables.color.green};
  color: #fff;
  opacity: 0.75;

  &:hover {
    opacity: 1;
  }
`;

export const RecordInlineCellContainer = () => {
  const { readonly, IconLabel, label, labelWidth, showLabel } =
    useRecordInlineCellContext();
  const { theme } = useContext(ThemeContext);

  const {
    recordId,
    fieldDefinition,
    onMouseEnter,
    onMouseLeave,
    anchorId,
    fieldDiff,
  } = useContext(FieldContext);

  if (isFieldText(fieldDefinition)) {
    assertFieldMetadata(FieldMetadataType.TEXT, isFieldText, fieldDefinition);
  }

  const { setIsFocused } = useFieldFocus();

  const handleContainerMouseEnter = () => {
    if (!readonly) {
      setIsFocused(true);
    }
    onMouseEnter?.();
  };

  const handleContainerMouseLeave = () => {
    if (!readonly) {
      setIsFocused(false);
    }
    onMouseLeave?.();
  };

  const labelId = `label-${getRecordFieldInputInstanceId({
    recordId,
    fieldName: fieldDefinition?.metadata?.fieldName,
  })}`;

  const hasDiff = fieldDiff && fieldDiff.newValue !== null;

  // OMNIA-CUSTOM: Read current field value to derive accepted state from store
  const fieldName = fieldDefinition?.metadata?.fieldName;
  const currentFieldValue = useAtomFamilySelectorValue(
    recordStoreFamilySelector,
    { recordId, fieldName: fieldName ?? '' },
  );

  // Derive accepted state from store — no local state needed
  const accepted = hasDiff
    ? (() => {
        // For composite sub-fields, check the sub-field value
        const crmFieldPath = fieldDiff?.crmFieldPath ?? '';
        const parts = crmFieldPath.split('.');
        if (parts.length >= 2) {
          const subField = parts[parts.length - 1];
          const compositeValue =
            typeof currentFieldValue === 'object' && currentFieldValue !== null
              ? (currentFieldValue as Record<string, unknown>)[subField]
              : null;
          return String(compositeValue ?? '') === fieldDiff.newValue;
        }
        return String(currentFieldValue ?? '') === fieldDiff.newValue;
      })()
    : false;

  // OMNIA-CUSTOM: Get update hook from context
  const useUpdateRecord = useContext(FieldContext).useUpdateRecord;
  const [updateRecord] = useUpdateRecord?.() ?? [null];

  const buildUpdateValue = useCallback(
    (rawValue: string | null) => {
      if (rawValue === null) return null;

      const crmFieldPath = fieldDiff?.crmFieldPath ?? '';
      const parts = crmFieldPath.split('.');

      // Composite sub-field: merge with existing value to preserve other sub-fields
      if (parts.length >= 2) {
        const subField = parts[parts.length - 1];
        // Start with existing composite value from the store
        const existing =
          typeof currentFieldValue === 'object' && currentFieldValue !== null
            ? JSON.parse(JSON.stringify(currentFieldValue))
            : {};
        // Remove __typename if present (GraphQL artifact)
        delete existing.__typename;

        // OMNIA-CUSTOM: When the changed sub-field is the primary of a
        // phones/emails composite, push the previous primary into the
        // additional bucket instead of overwriting it. Keeps both contacts
        // reachable. See twenty-shared/utils/composite/promotePrimaryToAdditional.
        if (subField === 'primaryPhoneNumber') {
          return promotePrimaryPhoneToAdditional(
            existing as PhonesMetadata,
            rawValue,
          );
        }
        if (subField === 'primaryEmail') {
          return promotePrimaryEmailToAdditional(
            existing as EmailsMetadata,
            rawValue,
          );
        }

        // Set the changed sub-field
        existing[subField] = rawValue;
        return existing;
      }

      return rawValue;
    },
    [fieldDiff?.crmFieldPath, currentFieldValue],
  );

  const handleAccept = useCallback(() => {
    if (!updateRecord || !fieldName || !fieldDiff) return;
    const value = buildUpdateValue(fieldDiff.newValue);
    if (value === null) return;
    updateRecord({
      variables: {
        where: { id: recordId },
        updateOneRecordInput: { [fieldName]: value },
      },
    });
  }, [updateRecord, fieldName, fieldDiff, buildUpdateValue, recordId]);

  const handleUndo = useCallback(() => {
    if (!updateRecord || !fieldName || !fieldDiff) return;
    const value = buildUpdateValue(fieldDiff.oldValue);
    if (value === null) return;
    updateRecord({
      variables: {
        where: { id: recordId },
        updateOneRecordInput: { [fieldName]: value },
      },
    });
  }, [updateRecord, fieldName, fieldDiff, buildUpdateValue, recordId]);

  const diffState = hasDiff ? (accepted ? 'accepted' : 'pending') : 'none';

  return (
    <StyledInlineCellBaseContainer
      readonly={readonly ?? false}
      diffState={diffState as 'none' | 'pending' | 'accepted'}
      onMouseEnter={handleContainerMouseEnter}
      onMouseLeave={handleContainerMouseLeave}
    >
      {(IconLabel || label) && (
        <StyledLabelAndIconContainer id={labelId}>
          {IconLabel && (
            <StyledIconContainer>
              <IconLabel stroke={theme.icon.stroke.sm} />
            </StyledIconContainer>
          )}
          {showLabel && label && (
            <StyledLabelContainer width={labelWidth}>
              <OverflowingTextWithTooltip text={label} displayedMaxRows={1} />
            </StyledLabelContainer>
          )}
          {!showLabel && (
            <AppTooltip
              anchorSelect={`#${labelId}`}
              content={label}
              clickable
              noArrow
              place="bottom"
              positionStrategy="fixed"
              delay={TooltipDelay.shortDelay}
            />
          )}
        </StyledLabelAndIconContainer>
      )}
      {hasDiff ? (
        <StyledDiffValueDisplay>
          <StyledDiffOld>
            {accepted
              ? fieldDiff.newValue || '(empty)'
              : fieldDiff.oldValue || '(empty)'}
          </StyledDiffOld>
          <StyledDiffArrow>→</StyledDiffArrow>
          <StyledDiffNew>
            {accepted ? fieldDiff.oldValue || '(empty)' : fieldDiff.newValue}
          </StyledDiffNew>
          <StyledDiffAcceptBtn
            accepted={accepted}
            onClick={(e) => {
              e.stopPropagation();
              if (accepted) {
                handleUndo();
              } else {
                handleAccept();
              }
            }}
          >
            {accepted ? 'Undo' : 'Accept'}
          </StyledDiffAcceptBtn>
        </StyledDiffValueDisplay>
      ) : (
        <StyledValueContainer readonly={readonly ?? false} id={anchorId}>
          <RecordInlineCellValue />
        </StyledValueContainer>
      )}
    </StyledInlineCellBaseContainer>
  );
};
