import { styled } from '@linaria/react';

import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useGetSecondaryFieldButton } from '@/object-record/record-field/ui/hooks/useGetSecondaryFieldButton';
import { useIsFieldEmpty } from '@/object-record/record-field/ui/hooks/useIsFieldEmpty';
import { useIsFieldInputOnly } from '@/object-record/record-field/ui/hooks/useIsFieldInputOnly';
// OMNIA-CUSTOM: soft required-field indicator (contract C5)
import { useIsFieldRequired } from '@/object-record/record-field/ui/hooks/useIsFieldRequired';
import {
  useRecordInlineCellContext,
  type RecordInlineCellContextProps,
} from '@/object-record/record-inline-cell/components/RecordInlineCellContext';
import { RecordInlineCellButton } from '@/object-record/record-inline-cell/components/RecordInlineCellEditButton';
import { useLingui } from '@lingui/react/macro';
import { useContext } from 'react';
import { themeCssVariables } from 'twenty-ui/theme';

// OMNIA-CUSTOM: width 100% so the hover and click target spans the whole value column
const StyledRecordInlineCellNormalModeOuterContainer = styled.div<
  Pick<
    RecordInlineCellContextProps,
    'isDisplayModeFixHeight' | 'disableHoverEffect' | 'readonly'
  > & { isHovered?: boolean }
>`
  align-items: center;
  background-color: ${({ isHovered, readonly, disableHoverEffect }) =>
    isHovered && !readonly && !disableHoverEffect
      ? themeCssVariables.background.transparent.light
      : 'transparent'};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: ${({ isHovered, readonly }) =>
    isHovered && !readonly ? 'pointer' : 'default'};
  display: flex;
  height: ${({ isDisplayModeFixHeight }) =>
    isDisplayModeFixHeight ? '16px' : 'auto'};
  min-height: 16px;
  outline: 1px solid
    ${({ isHovered, readonly }) =>
      isHovered && readonly
        ? themeCssVariables.border.color.medium
        : 'transparent'};
  overflow: hidden;
  padding-left: ${themeCssVariables.spacing[1]};
  padding-right: ${themeCssVariables.spacing[1]};
  width: 100%;
`;

const StyledRecordInlineCellNormalModeInnerContainer = styled.div`
  align-content: center;
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  height: fit-content;

  overflow: hidden;
  padding-bottom: 2px;
  padding-top: 2px;

  text-overflow: ellipsis;
  white-space: nowrap;
`;

// OMNIA-CUSTOM: red placeholder for an empty required field. Only cells that opt in through
// showRequiredIndicator mount RequiredEmptyField: 900+ store subscriptions in tables crashed
// mobile Safari.
const StyledEmptyField = styled.div<{ isRequired?: boolean }>`
  align-items: center;
  color: ${({ isRequired }) =>
    isRequired === true
      ? themeCssVariables.color.red
      : themeCssVariables.font.color.light};
  display: flex;
  height: 20px;
`;

type RequiredEmptyFieldProps = {
  emptyPlaceHolder: string;
};

const RequiredEmptyField = ({ emptyPlaceHolder }: RequiredEmptyFieldProps) => {
  const isRequired = useIsFieldRequired();

  return (
    <StyledEmptyField isRequired={isRequired}>
      {emptyPlaceHolder}
    </StyledEmptyField>
  );
};

export const RecordInlineCellDisplayMode = ({
  children,
  onClick,
  isHovered,
}: React.PropsWithChildren<{
  isHovered: boolean;
  onClick?: () => void;
}>) => {
  const { t } = useLingui();

  const { editModeContentOnly, label, buttonIcon, readonly } =
    useRecordInlineCellContext();

  // OMNIA-CUSTOM: soft required-field indicator (contract C5)
  const { showRequiredIndicator } = useRecordInlineCellContext();

  const { isForbidden } = useContext(FieldContext);

  const isFieldEmpty = useIsFieldEmpty();
  const showEditButton =
    buttonIcon &&
    isHovered &&
    !readonly &&
    !isFieldEmpty &&
    !editModeContentOnly;

  const secondaryButtons = useGetSecondaryFieldButton();

  const showSecondaryButtons =
    isHovered && !isFieldEmpty && !editModeContentOnly && !isForbidden;

  const isFieldInputOnly = useIsFieldInputOnly();

  const emptyPlaceHolder = label ?? t`Empty`;

  const shouldShowValue = !isFieldEmpty || isFieldInputOnly || isForbidden;

  const shouldShowEmptyPlaceholder = isFieldEmpty && !isForbidden;

  return (
    <>
      <StyledRecordInlineCellNormalModeOuterContainer
        isHovered={isHovered}
        readonly={readonly}
        onClick={onClick}
      >
        <StyledRecordInlineCellNormalModeInnerContainer>
          {shouldShowValue ? (
            children
          ) : shouldShowEmptyPlaceholder ? (
            showRequiredIndicator === true ? (
              <RequiredEmptyField emptyPlaceHolder={emptyPlaceHolder} />
            ) : (
              <StyledEmptyField>{emptyPlaceHolder}</StyledEmptyField>
            )
          ) : null}
        </StyledRecordInlineCellNormalModeInnerContainer>
      </StyledRecordInlineCellNormalModeOuterContainer>
      {showSecondaryButtons &&
        secondaryButtons.map((button) => (
          <RecordInlineCellButton
            key={button.ariaLabel}
            Icon={button.Icon}
            onClick={button.onClick}
            ariaLabel={button.ariaLabel}
          />
        ))}
      {showEditButton && (
        <RecordInlineCellButton Icon={buttonIcon} onClick={onClick} />
      )}
    </>
  );
};
