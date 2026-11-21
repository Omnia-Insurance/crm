import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { ErrorBoundary } from 'react-error-boundary';
import { themeCssVariables } from 'twenty-ui/theme';

import { MatchedDiffView } from '@/reconciliation/components/MatchedDiffView';
import { type ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';
import { UnmatchedView } from '@/reconciliation/components/UnmatchedView';

type ReviewItemDetailProps = {
  item: ReviewItemRecord | null;
  reconciliationId: string;
  onDecisionMade?: (itemId: string) => void;
};

const StyledDetail = styled.main`
  background: ${themeCssVariables.background.primary};
  flex: 1;
  overflow-y: auto;
`;

const StyledEmpty = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  height: 100%;
  justify-content: center;
`;

const StyledError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[6]};
`;

export const ReviewItemDetail = ({
  item,
  reconciliationId,
  onDecisionMade,
}: ReviewItemDetailProps) => {
  const { t } = useLingui();

  if (!item) {
    return (
      <StyledDetail>
        <StyledEmpty>{t`Select a review item`}</StyledEmpty>
      </StyledDetail>
    );
  }

  return (
    <StyledDetail>
      {/* One broken item must not take the review list down with it */}
      <ErrorBoundary
        resetKeys={[item.id]}
        fallbackRender={() => (
          <StyledError>{t`Could not load this review item.`}</StyledError>
        )}
      >
        {item.category === 'UNMATCHED' ? (
          <UnmatchedView
            item={item}
            reconciliationId={reconciliationId}
            onDecisionMade={onDecisionMade}
          />
        ) : (
          <MatchedDiffView
            item={item}
            reconciliationId={reconciliationId}
            onDecisionMade={onDecisionMade}
          />
        )}
      </ErrorBoundary>
    </StyledDetail>
  );
};
