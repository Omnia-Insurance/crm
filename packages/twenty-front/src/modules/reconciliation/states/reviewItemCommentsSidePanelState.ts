import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

/**
 * Holds the reviewItem id whose audit-task list is currently visible in the
 * SidePanelReviewItemCommentsPage. Set by useOpenReviewItemCommentsInSidePanel.
 */
export const reviewItemCommentsSidePanelState = createAtomState<{
  reviewItemId: string | null;
}>({
  key: 'reviewItemCommentsSidePanelState',
  defaultValue: {
    reviewItemId: null,
  },
});
