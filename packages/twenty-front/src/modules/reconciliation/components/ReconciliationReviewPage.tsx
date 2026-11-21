import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { type CoreObjectShowPageProps } from '@/object-core/types/CoreObjectShowPageProps';
import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { ReconciliationReviewPageContent } from '@/reconciliation/components/ReconciliationReviewPageContent';
import { useWorkspaceSurface } from '@/ui/layout/hooks/useWorkspaceSurface';
import { WorkspaceRouteUnavailable } from '@/ui/layout/page/components/WorkspaceRouteUnavailable';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { RecordShowPageContent } from '~/pages/object-record/RecordShowPageContent';

const StyledMissingObjects = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};

  code {
    background: ${themeCssVariables.background.tertiary};
    border-radius: ${themeCssVariables.border.radius.sm};
    font-size: ${themeCssVariables.font.size.xs};
    padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  }
`;

type ReconciliationReviewPageProps = CoreObjectShowPageProps;

export const ReconciliationReviewPage = ({
  objectRecordId,
}: ReconciliationReviewPageProps) => {
  const { t } = useLingui();
  const workspaceSurface = useWorkspaceSurface();

  const reconciliationMetadataItem = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    { objectName: 'reconciliation', objectNameType: 'singular' },
  );
  const reviewItemMetadataItem = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    { objectName: 'reviewItem', objectNameType: 'singular' },
  );

  // The review needs the full page; a side panel keeps the default record page.
  if (workspaceSurface.type === 'side-panel') {
    return (
      <RecordShowPageContent
        parameters={{ objectNameSingular: 'reconciliation', objectRecordId }}
      />
    );
  }

  // The review queries reviewItem, which throws without its metadata.
  if (
    !isDefined(reconciliationMetadataItem) ||
    !isDefined(reviewItemMetadataItem)
  ) {
    return (
      <WorkspaceRouteUnavailable>
        <StyledMissingObjects>
          {t`Reconciliation objects not found in this workspace.`}
          <code>
            {doNotTranslate(
              'npx nx run twenty-server:command workspace:seed-reconciliation-objects',
            )}
          </code>
        </StyledMissingObjects>
      </WorkspaceRouteUnavailable>
    );
  }

  return (
    <ReconciliationReviewPageContent
      objectRecordId={objectRecordId}
      reviewItemMetadataItem={reviewItemMetadataItem}
    />
  );
};
