import { styled } from '@linaria/react';
import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import {
  type RecordGqlFields,
  StandardObjectNameSingular,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { type Task } from '@/activities/types/Task';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { StandardObjectNamePlural } from '@/object-metadata/types/StandardObjectNamePlural';
import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { useFindOneRecordQuery } from '@/object-record/hooks/useFindOneRecordQuery';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { getRichTextFieldTextLines } from '@/object-record/record-field/ui/utils/getRichTextFieldTextLines';
import { ReviewItemCommentsFilterProviders } from '@/reconciliation/components/ReviewItemCommentsFilterProviders';
import { useFilteredTasksForReviewItem } from '@/reconciliation/hooks/useFilteredTasksForReviewItem';
import { useOpenCreateAuditTaskDraft } from '@/reconciliation/hooks/useOpenCreateAuditTaskDraft';
import { reviewItemCommentsSidePanelState } from '@/reconciliation/states/reviewItemCommentsSidePanelState';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { SidePanelFooter } from '@/ui/layout/side-panel/components/SidePanelFooter';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { ViewBarDetails } from '@/views/components/ViewBarDetails';
import { ViewBarFilterDropdown } from '@/views/components/ViewBarFilterDropdown';
import { getViewBarFilterDropdownId } from '@/views/utils/getViewBarFilterDropdownId';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const REVIEW_ITEM_COMMENTS_VIEW_BAR_ID = 'review-item-comments-side-panel';

const REVIEW_ITEM_DECISION_RECORD_GQL_FIELDS: RecordGqlFields = {
  id: true,
  decision: true,
};

type TaskStatus = NonNullable<Task['status']>;

const TASK_STATUS_DOT_COLORS: Record<TaskStatus, string> = {
  TODO: themeCssVariables.color.blue,
  IN_PROGRESS: themeCssVariables.color.orange,
  DONE: themeCssVariables.color.green,
};

const TASK_STATUS_LABELS: Record<TaskStatus, MessageDescriptor> = {
  TODO: msg`To do`,
  IN_PROGRESS: msg`In progress`,
  DONE: msg`Done`,
};

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const StyledFilterRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledFilterButtonSlot = styled.div`
  flex-shrink: 0;
`;

const StyledChips = styled.div`
  flex: 1;
  min-width: 0;
`;

const StyledList = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledEmpty = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[6]} ${themeCssVariables.spacing[2]};
  text-align: center;
`;

const StyledCard = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-family: inherit;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]};
  text-align: left;

  &:hover {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.border.color.medium};
  }
`;

const StyledCardTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledCardBody = styled.div`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: ${themeCssVariables.font.color.secondary};
  display: -webkit-box;
  font-size: ${themeCssVariables.font.size.sm};
  line-clamp: 2;
  overflow: hidden;
`;

const StyledCardMeta = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledStatusBadge = styled.span<{ status: TaskStatus }>`
  align-items: center;
  display: inline-flex;
  gap: ${themeCssVariables.spacing[1]};

  &::before {
    background: ${({ status }) => TASK_STATUS_DOT_COLORS[status]};
    border-radius: 50%;
    content: '';
    display: inline-block;
    height: 6px;
    width: 6px;
  }
`;

const StyledMetaSpacer = styled.span`
  flex: 1;
`;

const getAuthorLabel = (task: Task): string => {
  const firstName = task.assignee?.name?.firstName?.trim() ?? '';
  const lastName = task.assignee?.name?.lastName?.trim() ?? '';

  return [firstName, lastName].filter(Boolean).join(' ');
};

type SidePanelReviewItemCommentsPageContentProps = {
  reviewItemId: string;
};

const SidePanelReviewItemCommentsPageContent = ({
  reviewItemId,
}: SidePanelReviewItemCommentsPageContentProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();

  const { tasks, hasActiveFilters } = useFilteredTasksForReviewItem({
    reviewItemId,
    viewBarId: REVIEW_ITEM_COMMENTS_VIEW_BAR_ID,
  });

  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { updateOneRecord } = useUpdateOneRecord();
  const apolloCoreClient = useApolloCoreClient();

  const { findOneRecordQuery: findOneReviewItemDecisionQuery } =
    useFindOneRecordQuery({
      objectNameSingular: 'reviewItem',
      recordGqlFields: REVIEW_ITEM_DECISION_RECORD_GQL_FIELDS,
    });

  const { openCreateAuditTaskDraft } = useOpenCreateAuditTaskDraft({
    // Only PENDING items are flagged: flagging an APPROVED item would drop its
    // applied CRM writes from batch undo, which selects decision === 'APPROVED'.
    onTaskCreated: async () => {
      try {
        // This page only holds the id, and a cached decision may predate an apply.
        const { data } = await apolloCoreClient.query<{
          reviewItem?: { decision?: string | null } | null;
        }>({
          query: findOneReviewItemDecisionQuery,
          variables: { objectRecordId: reviewItemId },
          fetchPolicy: 'network-only',
        });

        if (data?.reviewItem?.decision !== 'PENDING') {
          return;
        }

        await updateOneRecord({
          objectNameSingular: 'reviewItem',
          idToUpdate: reviewItemId,
          updateOneRecordInput: {
            decision: 'FLAG_AUDIT',
            decidedAt: new Date().toISOString(),
          },
        });
      } catch {
        enqueueToast({
          status: 'error',
          children: t`Failed to flag the review item for audit.`,
        });
      }
    },
  });

  return (
    <StyledContainer>
      <StyledFilterRow>
        <StyledFilterButtonSlot>
          <ObjectFilterDropdownComponentInstanceContext.Provider
            value={{
              instanceId: getViewBarFilterDropdownId(
                REVIEW_ITEM_COMMENTS_VIEW_BAR_ID,
              ),
            }}
          >
            <ViewBarFilterDropdown />
          </ObjectFilterDropdownComponentInstanceContext.Provider>
        </StyledFilterButtonSlot>
        <StyledChips>
          <ViewBarDetails
            viewBarId={REVIEW_ITEM_COMMENTS_VIEW_BAR_ID}
            objectNamePlural={StandardObjectNamePlural.Task}
            hasFilterButton
          />
        </StyledChips>
      </StyledFilterRow>
      <StyledList>
        {tasks.length === 0 ? (
          <StyledEmpty>
            {hasActiveFilters
              ? t`No comments match the current filter.`
              : t`No comments yet.`}
          </StyledEmpty>
        ) : (
          tasks.map((task) => {
            const excerpt = getRichTextFieldTextLines(task.bodyV2)[0] ?? '';
            const author = getAuthorLabel(task);
            const trimmedTitle = task.title?.trim() ?? '';

            return (
              <StyledCard
                key={task.id}
                onClick={() =>
                  openRecordInSidePanel({
                    recordId: task.id,
                    objectNameSingular: StandardObjectNameSingular.Task,
                  })
                }
              >
                <StyledCardTitle>
                  {trimmedTitle || excerpt || t`Untitled`}
                </StyledCardTitle>
                {trimmedTitle && excerpt && (
                  <StyledCardBody>{excerpt}</StyledCardBody>
                )}
                <StyledCardMeta>
                  {isDefined(task.status) && (
                    <StyledStatusBadge status={task.status}>
                      {t(TASK_STATUS_LABELS[task.status])}
                    </StyledStatusBadge>
                  )}
                  <StyledMetaSpacer />
                  {author && <span>{author}</span>}
                  {task.createdAt && (
                    <span>{beautifyPastDateRelativeToNow(task.createdAt)}</span>
                  )}
                </StyledCardMeta>
              </StyledCard>
            );
          })
        )}
      </StyledList>
      <SidePanelFooter
        actions={[
          <Button
            key="add-comment"
            size="sm"
            variant="solid"
            color="accent"
            startIcon={<IconPlus />}
            onClick={() => openCreateAuditTaskDraft({ reviewItemId })}
          >{t`Add comment`}</Button>,
        ]}
      />
    </StyledContainer>
  );
};

export const SidePanelReviewItemCommentsPage = () => {
  const { reviewItemId } = useAtomStateValue(reviewItemCommentsSidePanelState);

  if (!isNonEmptyString(reviewItemId)) {
    return null;
  }

  return (
    <ReviewItemCommentsFilterProviders
      viewBarId={REVIEW_ITEM_COMMENTS_VIEW_BAR_ID}
    >
      <SidePanelReviewItemCommentsPageContent reviewItemId={reviewItemId} />
    </ReviewItemCommentsFilterProviders>
  );
};
