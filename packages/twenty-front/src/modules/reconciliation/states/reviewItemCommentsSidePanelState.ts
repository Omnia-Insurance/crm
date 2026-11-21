import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const reviewItemCommentsSidePanelState = createAtomState<{
  reviewItemId: string | null;
}>({
  key: 'reviewItemCommentsSidePanelState',
  defaultValue: {
    reviewItemId: null,
  },
});
