import { styled } from '@linaria/react';
import type { ReactNode } from 'react';
import { IconArrowBackUp, IconListCheck } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type ReconciliationToolbarProps = {
  /** Number of PENDING items eligible for batch apply in current filter */
  batchApplyCount?: number;
  /** Fire the batch-apply mutation */
  onBatchApplyClick?: () => void;
  /** Number of APPROVED items eligible for batch undo in current filter */
  batchUndoCount?: number;
  /** Fire the batch-undo mutation */
  onBatchUndoClick?: () => void;
  batchActionLoading?: boolean;
  /** Native Twenty filter chip bar */
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
  return (
    <StyledToolbarContainer>
      <StyledFilterRow>
        <StyledLeftSection>
          {onBatchApplyClick &&
            batchApplyCount !== undefined &&
            batchApplyCount > 0 && (
              <Button
                title={`Apply ${batchApplyCount} changes`}
                variant="secondary"
                accent="blue"
                size="small"
                Icon={IconListCheck}
                onClick={onBatchApplyClick}
                disabled={batchActionLoading}
              />
            )}
          {onBatchUndoClick &&
            batchUndoCount !== undefined &&
            batchUndoCount > 0 && (
              <Button
                title={`Undo ${batchUndoCount} changes`}
                variant="secondary"
                accent="danger"
                size="small"
                Icon={IconArrowBackUp}
                onClick={onBatchUndoClick}
                disabled={batchActionLoading}
              />
            )}
        </StyledLeftSection>
        <StyledFilterBarSlot>{filterBar}</StyledFilterBarSlot>
      </StyledFilterRow>
    </StyledToolbarContainer>
  );
};
