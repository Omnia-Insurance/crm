import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { styled } from '@linaria/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { ReconciliationReviewPageContent } from '@/reconciliation/components/ReconciliationReviewPageContent';

class ReconciliationErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ReconciliationReviewPage error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#888', textAlign: 'center' }}>
          Something went wrong loading the reconciliation view.
          <br />
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            style={{ marginTop: 12 }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const StyledMissing = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: ${themeCssVariables.spacing[3]};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};

  code {
    background: ${themeCssVariables.background.tertiary};
    padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
    border-radius: ${themeCssVariables.border.radius.sm};
    font-size: ${themeCssVariables.font.size.xs};
  }
`;

export const ReconciliationReviewPage = () => {
  const { objectRecordId } = useParams<{ objectRecordId: string }>();

  // Check metadata exists BEFORE mounting the inner component
  // (useFindManyRecords throws if metadata is missing — can't be skipped)
  const reconciliationMeta = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    { objectName: 'reconciliation', objectNameType: 'singular' },
  );
  const reviewItemMeta = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    { objectName: 'reviewItem', objectNameType: 'singular' },
  );

  if (!reconciliationMeta || !reviewItemMeta) {
    return (
      <PageContainer>
        <PageHeader title="Reconciliation" />
        <StyledMissing>
          Reconciliation objects not found in this workspace.
          <code>
            npx nx run twenty-server:command
            workspace:seed-reconciliation-objects
          </code>
        </StyledMissing>
      </PageContainer>
    );
  }

  return (
    <ReconciliationErrorBoundary>
      <ReconciliationReviewPageContent
        objectRecordId={objectRecordId ?? ''}
      />
    </ReconciliationErrorBoundary>
  );
};
