import { styled } from '@linaria/react';
import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { Tag } from 'twenty-ui/primitives/data-display';
import { themeCssVariables } from 'twenty-ui/theme';

import { type ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';

type ReviewItemSidebarProps = {
  items: ReviewItemRecord[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  loading: boolean;
};

const FLAG_LABELS: Record<string, MessageDescriptor> = {
  STATUS_CHANGE: msg`Status change`,
  PAYMENT_ERROR: msg`Payment issue`,
  BROKER_EFF_AUDIT: msg`Broker date`,
  NAME_MISMATCH: msg`Name mismatch`,
  REINSTATEMENT: msg`Reinstated`,
  MULTI_MATCH: msg`Multi-match`,
};

const StyledSidebar = styled.nav`
  background: ${themeCssVariables.background.primary};
  border-right: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-direction: column;
  min-width: 280px;
  overflow-y: auto;
  width: 280px;
`;

const StyledItem = styled.div<{ active: boolean; reviewed: boolean }>`
  background: ${({ active }) =>
    active ? themeCssVariables.background.tertiary : 'transparent'};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  cursor: pointer;
  opacity: ${({ reviewed }) => (reviewed ? 0.45 : 1)};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};

  &:hover {
    background: ${themeCssVariables.background.tertiary};
  }
`;

const StyledItemRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledItemName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledItemId = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
`;

const StyledTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledEmpty = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[6]};
  text-align: center;
`;

// Review item names read "<policy number> → <CRM policy name>"
const extractDisplayName = (item: ReviewItemRecord): string => {
  if (item.policy?.name) {
    return item.policy.name;
  }
  const parts = item.name.split(' → ');
  if (parts.length > 1 && parts[1] !== 'none') {
    return parts[1];
  }
  return item.name;
};

const extractPolicyId = (item: ReviewItemRecord): string => {
  return item.name.split(' ')[0] ?? '';
};

export const ReviewItemSidebar = ({
  items,
  selectedItemId,
  onSelectItem,
  loading,
}: ReviewItemSidebarProps) => {
  const { t } = useLingui();

  if (loading) {
    return (
      <StyledSidebar aria-label={t`Review items`}>
        <StyledEmpty>{t`Loading...`}</StyledEmpty>
      </StyledSidebar>
    );
  }

  if (items.length === 0) {
    return (
      <StyledSidebar aria-label={t`Review items`}>
        <StyledEmpty>{t`No items match your filters`}</StyledEmpty>
      </StyledSidebar>
    );
  }

  return (
    <StyledSidebar aria-label={t`Review items`}>
      {items.map((item) => {
        const isReviewed = item.decision !== 'PENDING';
        const isActive = item.id === selectedItemId;
        const isUnmatched = item.category === 'UNMATCHED';

        return (
          <StyledItem
            key={item.id}
            role="listitem"
            active={isActive}
            reviewed={isReviewed}
            onClick={() => onSelectItem(item.id)}
          >
            <StyledItemRow>
              <StyledItemName>{extractDisplayName(item)}</StyledItemName>
              <StyledItemId>{extractPolicyId(item)}</StyledItemId>
            </StyledItemRow>
            {(isUnmatched || (item.flags && item.flags.length > 0)) && (
              <StyledTags>
                {isUnmatched && <Tag color="orange">{t`Unmatched`}</Tag>}
                {(item.flags ?? []).map((flag) => {
                  const flagLabelDescriptor = FLAG_LABELS[flag];

                  if (!isDefined(flagLabelDescriptor)) {
                    return null;
                  }

                  const label = t(flagLabelDescriptor);
                  const reason = item.flagReasons?.[flag];

                  return (
                    <span
                      key={flag}
                      title={reason ? `${label}: ${reason}` : label}
                    >
                      <Tag color="gray">{label}</Tag>
                    </span>
                  );
                })}
              </StyledTags>
            )}
          </StyledItem>
        );
      })}
    </StyledSidebar>
  );
};
