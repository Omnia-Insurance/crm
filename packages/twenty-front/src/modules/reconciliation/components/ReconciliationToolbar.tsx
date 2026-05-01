import { styled } from '@linaria/react';
import type { ReactNode } from 'react';
import { IconListCheck } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type ReconciliationToolbarProps = {
  /** Number of PENDING items eligible for batch approve in current filter */
  batchApproveCount?: number;
  /** Fire the batch-approve mutation */
  onBatchApproveClick?: () => void;
  batchApproveLoading?: boolean;
  /** Native Twenty filter chip bar */
  filterBar: ReactNode;
};

const StyledToolbarContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: ${themeCssVariables.background.primary};
`;

const StyledFilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
`;

const StyledLeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
  flex-shrink: 0;
`;

const StyledFilterBarSlot = styled.div`
  display: flex;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
`;

export const ReconciliationToolbar = ({
  batchApproveCount,
  onBatchApproveClick,
  batchApproveLoading,
  filterBar,
}: ReconciliationToolbarProps) => {
  return (
    <StyledToolbarContainer>
      <StyledFilterRow>
        <StyledLeftSection>
          {onBatchApproveClick &&
            batchApproveCount !== undefined &&
            batchApproveCount > 0 && (
              <Button
                title={`Apply ${batchApproveCount} changes`}
                variant="secondary"
                accent="blue"
                size="small"
                Icon={IconListCheck}
                onClick={onBatchApproveClick}
                disabled={batchApproveLoading}
              />
            )}
        </StyledLeftSection>
        <StyledFilterBarSlot>{filterBar}</StyledFilterBarSlot>
      </StyledFilterRow>
    </StyledToolbarContainer>
  );
};
