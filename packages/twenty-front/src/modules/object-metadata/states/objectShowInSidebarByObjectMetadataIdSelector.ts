import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { createAtomSelector } from '@/ui/utilities/state/jotai/utils/createAtomSelector';
import { isArray } from '@sniptt/guards';
import { isDeeplyEqual } from '~/utils/isDeeplyEqual';

// Undefined means not loaded yet, which includes a current user workspace persisted before the field existed
export const objectShowInSidebarByObjectMetadataIdSelector = createAtomSelector<
  Record<string, boolean> | undefined
>({
  key: 'objectShowInSidebarByObjectMetadataIdSelector',
  areEqual: isDeeplyEqual,
  get: ({ get }) => {
    const objectSidebarVisibility = get(
      currentUserWorkspaceState,
    )?.objectSidebarVisibility;

    if (!isArray(objectSidebarVisibility)) {
      return undefined;
    }

    return Object.fromEntries(
      objectSidebarVisibility.map(({ objectMetadataId, showInSidebar }) => [
        objectMetadataId,
        showInSidebar,
      ]),
    );
  },
});
