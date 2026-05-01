import { type Task } from '@/activities/types/Task';
import { getFirstNonEmptyLineOfRichText } from '@/blocknote-editor/utils/getFirstNonEmptyLineOfRichText';
import { parseInitialBlocknote } from '@/blocknote-editor/utils/parseInitialBlocknote';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { ReviewItemCommentsFilterProviders } from '@/reconciliation/components/ReviewItemCommentsFilterProviders';
import { useFilteredTasksForReviewItem } from '@/reconciliation/hooks/useFilteredTasksForReviewItem';
import { useOpenCreateAuditTaskDraft } from '@/reconciliation/hooks/useOpenCreateAuditTaskDraft';
import { reviewItemCommentsSidePanelState } from '@/reconciliation/states/reviewItemCommentsSidePanelState';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { ViewBarDetails } from '@/views/components/ViewBarDetails';
import { ViewBarFilterDropdown } from '@/views/components/ViewBarFilterDropdown';
import { ViewBarFilterDropdownIds } from '@/views/constants/ViewBarFilterDropdownIds';
import { styled } from '@linaria/react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { IconPlus } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const REVIEW_ITEM_COMMENTS_VIEW_BAR_ID = 'review-item-comments-side-panel';
const REVIEW_ITEM_COMMENTS_FILTER_DROPDOWN_ID =
  'review-item-comments-filter-dropdown';

const STATUS_DOT_COLOR: Record<NonNullable<Task['status']>, string> = {
  TODO: themeCssVariables.color.blue,
  IN_PROGRESS: themeCssVariables.color.orange,
  DONE: themeCssVariables.color.green,
};

const STATUS_LABEL: Record<NonNullable<Task['status']>, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
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
  color: ${themeCssVariables.font.color.secondary};
  display: -webkit-box;
  font-size: ${themeCssVariables.font.size.sm};
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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

const StyledStatusBadge = styled.span<{ status: NonNullable<Task['status']> }>`
  align-items: center;
  display: inline-flex;
  gap: ${themeCssVariables.spacing[1]};

  &::before {
    background: ${({ status }) => STATUS_DOT_COLOR[status]};
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

const StyledFooter = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const getCommentExcerpt = (task: Task): string => {
  const blocks = task.bodyV2?.blocknote
    ? (parseInitialBlocknote(task.bodyV2.blocknote) ?? null)
    : null;
  return getFirstNonEmptyLineOfRichText(blocks);
};

const getAuthorLabel = (task: Task): string => {
  const first = task.assignee?.name?.firstName?.trim() ?? '';
  const last = task.assignee?.name?.lastName?.trim() ?? '';
  return [first, last].filter(Boolean).join(' ');
};

const PageContent = ({ reviewItemId }: { reviewItemId: string }) => {
  const { tasks, hasActiveFilters } = useFilteredTasksForReviewItem({
    reviewItemId,
    viewBarId: REVIEW_ITEM_COMMENTS_VIEW_BAR_ID,
  });

  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { updateOneRecord } = useUpdateOneRecord();

  const { openCreateAuditTaskDraft } = useOpenCreateAuditTaskDraft({
    onTaskCreated: async () => {
      await updateOneRecord({
        objectNameSingular: 'reviewItem',
        idToUpdate: reviewItemId,
        updateOneRecordInput: {
          decision: 'FLAG_AUDIT',
          decidedAt: new Date().toISOString(),
        },
      });
    },
  });

  const handleAddComment = () => {
    openCreateAuditTaskDraft({ reviewItemId });
  };

  return (
    <StyledContainer>
      <StyledFilterRow>
        <StyledFilterButtonSlot>
          <ObjectFilterDropdownComponentInstanceContext.Provider
            value={{ instanceId: ViewBarFilterDropdownIds.MAIN }}
          >
            <ViewBarFilterDropdown
              dropdownId={REVIEW_ITEM_COMMENTS_FILTER_DROPDOWN_ID}
            />
          </ObjectFilterDropdownComponentInstanceContext.Provider>
        </StyledFilterButtonSlot>
        <StyledChips>
          <ViewBarDetails
            viewBarId={REVIEW_ITEM_COMMENTS_VIEW_BAR_ID}
            objectNamePlural="tasks"
            hasFilterButton
            addFilterDropdownId={REVIEW_ITEM_COMMENTS_FILTER_DROPDOWN_ID}
          />
        </StyledChips>
      </StyledFilterRow>

      <StyledList>
        {tasks.length === 0 ? (
          <StyledEmpty>
            {hasActiveFilters
              ? 'No comments match the current filter.'
              : 'No comments yet.'}
          </StyledEmpty>
        ) : (
          tasks.map((task) => {
            const excerpt = getCommentExcerpt(task);
            const author = getAuthorLabel(task);
            const title = task.title?.trim() || excerpt || 'Untitled';
            return (
              <StyledCard
                key={task.id}
                onClick={() =>
                  openRecordInSidePanel({
                    recordId: task.id,
                    objectNameSingular: CoreObjectNameSingular.Task,
                  })
                }
              >
                <StyledCardTitle>{title}</StyledCardTitle>
                {task.title?.trim() && excerpt && (
                  <StyledCardBody>{excerpt}</StyledCardBody>
                )}
                <StyledCardMeta>
                  {task.status && (
                    <StyledStatusBadge status={task.status}>
                      {STATUS_LABEL[task.status]}
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
      <StyledFooter>
        <Button
          title="Add comment"
          variant="primary"
          accent="blue"
          size="small"
          Icon={IconPlus}
          onClick={handleAddComment}
        />
      </StyledFooter>
    </StyledContainer>
  );
};

export const SidePanelReviewItemCommentsPage = () => {
  const { reviewItemId } = useAtomStateValue(reviewItemCommentsSidePanelState);

  if (!reviewItemId) {
    return null;
  }

  return (
    <ReviewItemCommentsFilterProviders
      viewBarId={REVIEW_ITEM_COMMENTS_VIEW_BAR_ID}
    >
      <PageContent reviewItemId={reviewItemId} />
    </ReviewItemCommentsFilterProviders>
  );
};
