import { styled } from '@linaria/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { MatchedDiffView } from '@/reconciliation/components/MatchedDiffView';
import { UnmatchedView } from '@/reconciliation/components/UnmatchedView';
import type { ReviewItemRecord } from '@/reconciliation/components/ReconciliationReviewPageContent';

type Props = {
  item: ReviewItemRecord | null;
  reconciliationId: string;
  onDecisionMade?: (itemId: string) => void;
};

const StyledDetail = styled.main`
  flex: 1;
  overflow-y: auto;
  background: ${themeCssVariables.background.primary};
`;

const StyledEmpty = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledError = styled.div`
  padding: ${themeCssVariables.spacing[6]};
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
`;

class DetailErrorBoundary extends Component<
  { children: ReactNode; itemId: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ReviewItemDetail error:', error, info);
  }

  componentDidUpdate(prevProps: { itemId: string }) {
    if (prevProps.itemId !== this.props.itemId && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <StyledError>
          Error loading review item: {this.state.error.message}
        </StyledError>
      );
    }
    return this.props.children;
  }
}

export const ReviewItemDetail = ({
  item,
  reconciliationId,
  onDecisionMade,
}: Props) => {
  if (!item) {
    return (
      <StyledDetail>
        <StyledEmpty>Select a review item</StyledEmpty>
      </StyledDetail>
    );
  }

  return (
    <StyledDetail>
      <DetailErrorBoundary itemId={item.id}>
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
      </DetailErrorBoundary>
    </StyledDetail>
  );
};
