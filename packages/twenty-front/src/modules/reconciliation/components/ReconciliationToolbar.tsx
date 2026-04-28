import { styled } from '@linaria/react';
import { useCallback } from 'react';
import { IconCheck, IconListCheck } from 'twenty-ui/display';
import { Button, SearchInput } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import type { FilterKey } from '@/reconciliation/types/FilterKey';

export type ReconciliationCounts = {
  all: number;
  matched: number;
  flagged: number;
  unmatched: number;
};

type ReconciliationToolbarProps = {
  counts: ReconciliationCounts;
  reviewedCount: number;
  totalCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  activeFilter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
  loading: boolean;
  /** Number of items with decision=APPROVED, ready to apply */
  approvedCount?: number;
  /** Fire the apply-all-approved mutation */
  onApplyClick?: () => void;
  applyLoading?: boolean;
  /** Number of high-confidence PENDING items eligible for batch approve */
  batchApproveCount?: number;
  /** Fire the batch-approve mutation */
  onBatchApproveClick?: () => void;
  batchApproveLoading?: boolean;
};

// ── Color config per tab ──

type TabColorConfig = {
  activeBg: string;
  activeColor: string;
  hoverBg: string;
};

const TAB_COLORS: Record<FilterKey, TabColorConfig> = {
  all: {
    activeBg: themeCssVariables.background.tertiary,
    activeColor: themeCssVariables.font.color.primary,
    hoverBg: themeCssVariables.background.tertiary,
  },
  matched: {
    activeBg: themeCssVariables.background.transparent.success,
    activeColor: themeCssVariables.color.green,
    hoverBg: themeCssVariables.background.transparent.success,
  },
  flagged: {
    activeBg: themeCssVariables.background.transparent.danger,
    activeColor: themeCssVariables.color.red,
    hoverBg: themeCssVariables.background.transparent.danger,
  },
  unmatched: {
    activeBg: themeCssVariables.background.transparent.orange,
    activeColor: themeCssVariables.color.orange,
    hoverBg: themeCssVariables.background.transparent.orange,
  },
};

// ── Styled components ──

const StyledToolbarContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: ${themeCssVariables.background.primary};
`;

const StyledFilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
`;

const StyledSearchWrapper = styled.div`
  width: 200px;
  flex-shrink: 0;
`;

const StyledTabGroup = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTab = styled.button<{
  active: boolean;
  activeBg: string;
  activeColor: string;
  hoverBg: string;
}>`
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
  border-radius: ${themeCssVariables.border.radius.pill};
  font-size: ${themeCssVariables.font.size.sm};
  font-family: ${themeCssVariables.font.family};
  font-weight: ${({ active }) =>
    active
      ? themeCssVariables.font.weight.medium
      : themeCssVariables.font.weight.regular};
  background: ${({ active, activeBg }) =>
    active ? activeBg : 'transparent'};
  color: ${({ active, activeColor }) =>
    active ? activeColor : themeCssVariables.font.color.tertiary};
  border: none;
  cursor: pointer;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  transition: background 0.1s ease, color 0.1s ease;

  &:hover {
    background: ${({ active, activeBg, hoverBg }) =>
      active ? activeBg : hoverBg};
    color: ${({ active, activeColor }) =>
      active ? activeColor : themeCssVariables.font.color.secondary};
  }
`;

const StyledProgressSection = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
  margin-left: auto;
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

// ── Component ──

export const ReconciliationToolbar = ({
  counts,
  reviewedCount,
  totalCount,
  search,
  onSearchChange,
  activeFilter,
  onFilterChange,
  approvedCount,
  onApplyClick,
  applyLoading,
  batchApproveCount,
  onBatchApproveClick,
  batchApproveLoading,
}: ReconciliationToolbarProps) => {
  const progressPercent =
    totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  const handleFilterClick = useCallback(
    (key: FilterKey) => () => onFilterChange(key),
    [onFilterChange],
  );

  const tabs: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'matched', label: 'Matched', count: counts.matched },
    { key: 'flagged', label: 'Flagged', count: counts.flagged },
    { key: 'unmatched', label: 'Unmatched', count: counts.unmatched },
  ];

  return (
    <StyledToolbarContainer>
      <StyledFilterBar>
        <StyledSearchWrapper>
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Search policies..."
          />
        </StyledSearchWrapper>
        <StyledTabGroup>
          {tabs.map((tab) => {
            const colors = TAB_COLORS[tab.key];
            return (
              <StyledTab
                key={tab.key}
                active={activeFilter === tab.key}
                activeBg={colors.activeBg}
                activeColor={colors.activeColor}
                hoverBg={colors.hoverBg}
                onClick={handleFilterClick(tab.key)}
              >
                {tab.label} {tab.count}
              </StyledTab>
            );
          })}
        </StyledTabGroup>
        <StyledProgressSection>
          {onBatchApproveClick &&
            batchApproveCount !== undefined &&
            batchApproveCount > 0 && (
              <Button
                title={`Accept ${batchApproveCount} high-confidence`}
                variant="secondary"
                accent="blue"
                size="small"
                Icon={IconListCheck}
                onClick={onBatchApproveClick}
                disabled={batchApproveLoading}
              />
            )}
          {onApplyClick &&
            approvedCount !== undefined &&
            approvedCount > 0 && (
              <Button
                title={`Apply ${approvedCount} approved`}
                variant="primary"
                accent="blue"
                size="small"
                Icon={IconCheck}
                onClick={onApplyClick}
                disabled={applyLoading}
              />
            )}
          <span>
            Reviewed {reviewedCount}/{totalCount}
          </span>
          <StyledProgressBar>
            <StyledProgressFill percent={progressPercent} />
          </StyledProgressBar>
        </StyledProgressSection>
      </StyledFilterBar>
    </StyledToolbarContainer>
  );
};
