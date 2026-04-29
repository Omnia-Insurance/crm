import { styled } from '@linaria/react';
import type { ReactNode } from 'react';
import { IconListCheck } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type ReconciliationToolbarProps = {
  reviewedCount: number;
  totalCount: number;
  loading: boolean;
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

const StyledFilterBarSlot = styled.div`
  flex: 1;
  min-width: 0;
`;

const StyledProgressSection = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xs};
  color: ${themeCssVariables.font.color.tertiary};
  font-variant-numeric: tabular-nums;
`;

const StyledProgressBar = styled.div`
  width: 100px;
  height: 3px;
  background: ${themeCssVariables.background.tertiary};
  border-radius: 2px;
  overflow: hidden;
`;

const StyledProgressFill = styled.div<{ percent: number }>`
  height: 100%;
  width: ${({ percent }) => percent}%;
  background: ${themeCssVariables.accent.primary};
  transition: width 0.2s ease;
`;

export const ReconciliationToolbar = ({
  reviewedCount,
  totalCount,
  batchApproveCount,
  onBatchApproveClick,
  batchApproveLoading,
  filterBar,
}: ReconciliationToolbarProps) => {
  const progressPercent =
    totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  return (
    <StyledToolbarContainer>
      <StyledFilterRow>
        <StyledFilterBarSlot>{filterBar}</StyledFilterBarSlot>
        <StyledProgressSection>
          {onBatchApproveClick &&
            batchApproveCount !== undefined &&
            batchApproveCount > 0 && (
              <Button
                title={`Accept ${batchApproveCount}`}
                variant="secondary"
                accent="blue"
                size="small"
                Icon={IconListCheck}
                onClick={onBatchApproveClick}
                disabled={batchApproveLoading}
              />
            )}
          <span>
            Reviewed {reviewedCount}/{totalCount}
          </span>
          <StyledProgressBar>
            <StyledProgressFill percent={progressPercent} />
          </StyledProgressBar>
        </StyledProgressSection>
      </StyledFilterRow>
    </StyledToolbarContainer>
  );
};
