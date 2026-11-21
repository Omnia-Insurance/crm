import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type ReactNode } from 'react';
import { IconArrowBackUp, IconListCheck } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

type ReconciliationToolbarProps = {
  // PENDING items in the current filter that batch apply would write
  batchApplyCount?: number;
  onBatchApplyClick?: () => void;
  // APPROVED items in the current filter that batch undo would revert
  batchUndoCount?: number;
  onBatchUndoClick?: () => void;
  batchActionLoading?: boolean;
  filterBar: ReactNode;
};

const StyledToolbarContainer = styled.div`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
`;

const StyledFilterRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledLeftSection = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledFilterBarSlot = styled.div`
  display: flex;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
`;

export const ReconciliationToolbar = ({
  batchApplyCount,
  onBatchApplyClick,
  batchUndoCount,
  onBatchUndoClick,
  batchActionLoading,
  filterBar,
}: ReconciliationToolbarProps) => {
  const { t } = useLingui();

  return (
    <StyledToolbarContainer>
      <StyledFilterRow>
        <StyledLeftSection>
          {onBatchApplyClick &&
            batchApplyCount !== undefined &&
            batchApplyCount > 0 && (
              <Button
                variant="outline"
                color="accent"
                size="sm"
                startIcon={<IconListCheck />}
                onClick={onBatchApplyClick}
                disabled={batchActionLoading}
              >
                {t`Apply ${batchApplyCount} changes`}
              </Button>
            )}
          {onBatchUndoClick &&
            batchUndoCount !== undefined &&
            batchUndoCount > 0 && (
              <Button
                variant="outline"
                color="danger"
                size="sm"
                startIcon={<IconArrowBackUp />}
                onClick={onBatchUndoClick}
                disabled={batchActionLoading}
              >
                {t`Undo ${batchUndoCount} changes`}
              </Button>
            )}
        </StyledLeftSection>
        <StyledFilterBarSlot>{filterBar}</StyledFilterBarSlot>
      </StyledFilterRow>
    </StyledToolbarContainer>
  );
};
