import { reviewItemCommentsSidePanelState } from '@/reconciliation/states/reviewItemCommentsSidePanelState';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { t } from '@lingui/core/macro';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { SidePanelPages } from 'twenty-shared/types';
import { IconMessage } from 'twenty-ui/display';

export const useOpenReviewItemCommentsInSidePanel = () => {
  const { navigateSidePanelMenu, openSidePanelMenu } = useSidePanelMenu();
  const store = useStore();

  const openReviewItemCommentsInSidePanel = useCallback(
    (reviewItemId: string) => {
      store.set(reviewItemCommentsSidePanelState.atom, { reviewItemId });

      openSidePanelMenu();
      navigateSidePanelMenu({
        page: SidePanelPages.ReviewItemComments,
        pageTitle: t`Comments`,
        pageIcon: IconMessage,
      });
    },
    [navigateSidePanelMenu, openSidePanelMenu, store],
  );

  return { openReviewItemCommentsInSidePanel };
};
