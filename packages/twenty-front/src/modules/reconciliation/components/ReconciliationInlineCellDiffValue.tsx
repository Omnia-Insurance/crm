import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type MouseEvent, useContext } from 'react';
import { type EmailsMetadata, type PhonesMetadata } from 'twenty-shared/types';
import {
  coerceFieldDiffValueForRecordUpdate,
  isDefined,
  isNonEmptyString,
  isPlainObject,
  promotePrimaryEmailToAdditional,
  promotePrimaryPhoneToAdditional,
} from 'twenty-shared/utils';
import { Button } from 'twenty-ui/primitives/input';
import { Tooltip } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';

import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { type FieldDiffOverlay } from '@/reconciliation/types/FieldDiffOverlay';
import { normalizeDiffComparableValue } from '@/reconciliation/utils/normalizeDiffComparableValue';
import { TooltipDelay } from '@/ui/layout/tooltip/constants/TooltipDelay';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';

const StyledDiffValueContainer = styled.div<{ isAccepted: boolean }>`
  align-items: center;
  background: ${({ isAccepted }) =>
    isAccepted
      ? themeCssVariables.color.transparent.red2
      : themeCssVariables.color.transparent.green2};
  border-left: 2px solid
    ${({ isAccepted }) =>
      isAccepted ? themeCssVariables.color.red : themeCssVariables.color.green};
  border-radius: 0 ${themeCssVariables.border.radius.sm}
    ${themeCssVariables.border.radius.sm} 0;
  box-sizing: border-box;
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding-left: ${themeCssVariables.spacing[1]};
  user-select: text;
  width: 100%;
`;

const StyledFromValue = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  overflow: hidden;
  text-decoration: line-through;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledArrow = styled.span`
  color: ${themeCssVariables.font.color.light};
  flex-shrink: 0;
`;

const StyledToValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type ReconciliationInlineCellDiffValueProps = {
  fieldDiff: FieldDiffOverlay;
};

export const ReconciliationInlineCellDiffValue = ({
  fieldDiff,
}: ReconciliationInlineCellDiffValueProps) => {
  const { t } = useLingui();

  const {
    recordId,
    fieldDefinition,
    isRecordFieldReadOnly,
    useUpdateRecord = () => [],
  } = useContext(FieldContext);

  const fieldName = fieldDefinition.metadata.fieldName;

  const currentFieldValue = useAtomFamilySelectorValue(
    recordStoreFamilySelector,
    { recordId, fieldName },
  );

  const [updateRecord] = useUpdateRecord();

  const crmFieldPathSegments = fieldDiff.crmFieldPath?.split('.') ?? [];
  const subFieldName =
    crmFieldPathSegments.length > 1 ? crmFieldPathSegments.at(-1) : undefined;

  const currentCompositeValue: Record<string, unknown> = isPlainObject(
    currentFieldValue,
  )
    ? currentFieldValue
    : {};

  const isAccepted =
    fieldDiff.oldValue !== fieldDiff.newValue &&
    normalizeDiffComparableValue(
      isDefined(subFieldName)
        ? currentCompositeValue[subFieldName]
        : currentFieldValue,
    ) === fieldDiff.newValue;

  const buildValueToPersist = (diffValue: string | null) => {
    if (!isDefined(subFieldName)) {
      return coerceFieldDiffValueForRecordUpdate(diffValue, {
        fieldType: fieldDefinition.type,
        currentValue: currentFieldValue,
      });
    }

    const { __typename, ...compositeValue } = currentCompositeValue;

    // The previous primary stays reachable in the additional phones or emails.
    if (diffValue !== null && subFieldName === 'primaryPhoneNumber') {
      return promotePrimaryPhoneToAdditional(
        compositeValue as PhonesMetadata,
        diffValue,
      );
    }

    if (diffValue !== null && subFieldName === 'primaryEmail') {
      return promotePrimaryEmailToAdditional(
        compositeValue as EmailsMetadata,
        diffValue,
      );
    }

    return {
      ...compositeValue,
      [subFieldName]: coerceFieldDiffValueForRecordUpdate(diffValue, {
        fieldType: fieldDefinition.type,
        currentValue: compositeValue[subFieldName],
      }),
    };
  };

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();

    updateRecord?.({
      variables: {
        where: { id: recordId },
        updateOneRecordInput: {
          [fieldName]: buildValueToPersist(
            isAccepted ? fieldDiff.oldValue : fieldDiff.newValue,
          ),
        },
      },
    });
  };

  const formatDiffValue = (diffValue: string | null) =>
    isNonEmptyString(diffValue) ? diffValue : t`Empty`;

  return (
    <StyledDiffValueContainer isAccepted={isAccepted}>
      <StyledFromValue>
        {formatDiffValue(isAccepted ? fieldDiff.newValue : fieldDiff.oldValue)}
      </StyledFromValue>
      <StyledArrow>→</StyledArrow>
      <Tooltip
        content={fieldDiff.note}
        side="top"
        positionMethod="fixed"
        delay={TooltipDelay.shortDelay}
      >
        <StyledToValue>
          {formatDiffValue(
            isAccepted ? fieldDiff.oldValue : fieldDiff.newValue,
          )}
        </StyledToValue>
      </Tooltip>
      <Button
        size="sm"
        variant={isAccepted ? 'outline' : 'solid'}
        color={isAccepted ? 'danger' : 'success'}
        disabled={isRecordFieldReadOnly}
        onClick={handleClick}
      >
        {isAccepted ? t`Undo` : t`Accept`}
      </Button>
    </StyledDiffValueContainer>
  );
};
