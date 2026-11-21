import { currentUserState } from '@/auth/states/currentUserState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { metadataStoreStatusFamilySelector } from '@/metadata-store/states/metadataStoreStatusFamilySelector';
import { useMemberSidebarObjectMetadataItems } from '@/navigation-menu-item/display/hooks/useMemberSidebarObjectMetadataItems';
import { useNavigationMenuItemSectionItems } from '@/navigation-menu-item/display/hooks/useNavigationMenuItemSectionItems';
import { MEMBER_LANDING_OBJECT_ORDER } from '@/navigation/constants/MemberLandingObjectOrder';
import { type ObjectPathInfo } from '@/navigation/types/ObjectPathInfo';
import { getFirstNavigationMenuItemLink } from '@/navigation/utils/getFirstNavigationMenuItemLink';
import { computeObjectViewTargetIds } from '@/views/utils/computeObjectViewTargetIds';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { filterReadableActiveObjectMetadataItems } from '@/object-metadata/utils/filterReadableActiveObjectMetadataItems';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useIsMobile } from 'twenty-ui/utilities';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import isEmpty from 'lodash.isempty';
import { useCallback, useMemo } from 'react';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { getAppPath, getSettingsPath, isDefined } from 'twenty-shared/utils';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const useDefaultHomePagePath = () => {
  const currentUser = useAtomStateValue(currentUserState);
  const isMobile = useIsMobile();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const metadataStore = useAtomFamilyStateValue(
    metadataStoreState,
    'objectMetadataItems',
  );
  const areObjectMetadataItemsLoaded = metadataStore.status === 'up-to-date';
  const navigationMenuItemsStatus = useAtomFamilySelectorValue(
    metadataStoreStatusFamilySelector,
    'navigationMenuItems',
  );
  const areNavigationMenuItemsLoaded =
    navigationMenuItemsStatus === 'up-to-date';

  const { activeObjectMetadataItems } = useFilteredObjectMetadataItems();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const views = useAtomStateValue(viewsSelector);
  const navigationMenuItemsInDisplayOrder = useNavigationMenuItemSectionItems();
  // OMNIA-CUSTOM: users without LAYOUTS land on their role's sidebar list, never on a hidden object.
  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);
  const {
    isLoaded: isMemberSidebarLoaded,
    objectMetadataItems: memberSidebarObjectMetadataItems,
  } = useMemberSidebarObjectMetadataItems();

  const readableNonSystemObjectMetadataItems = useMemo(
    () =>
      filterReadableActiveObjectMetadataItems(
        activeObjectMetadataItems,
        objectPermissionsByObjectMetadataId,
      )
        .filter((item) => !item.isSystem)
        .sort((a, b) => a.nameSingular.localeCompare(b.nameSingular)),
    [activeObjectMetadataItems, objectPermissionsByObjectMetadataId],
  );

  const getTargetViewId = useCallback(
    (objectMetadataItemId: string | undefined | null) => {
      const { firstSelectableViewId, indexViewId } = computeObjectViewTargetIds(
        {
          views,
          objectMetadataId: objectMetadataItemId ?? undefined,
        },
      );

      return firstSelectableViewId ?? indexViewId;
    },
    [views],
  );

  const firstNavigationMenuItemLink = useMemo(
    () =>
      getFirstNavigationMenuItemLink({
        navigationMenuItemsInDisplayOrder,
        objectMetadataItems,
        views,
        objectPermissionsByObjectMetadataId,
      }),
    [
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
      views,
      navigationMenuItemsInDisplayOrder,
    ],
  );

  const firstObjectPathInfo = useMemo<ObjectPathInfo | null>(() => {
    const [firstObjectMetadataItem] = readableNonSystemObjectMetadataItems;

    if (!isDefined(firstObjectMetadataItem)) {
      return null;
    }

    const viewId = getTargetViewId(firstObjectMetadataItem.id);

    return { objectMetadataItem: firstObjectMetadataItem, viewId };
  }, [getTargetViewId, readableNonSystemObjectMetadataItems]);

  // OMNIA-CUSTOM: members land on Leads (then the next MEMBER_LANDING_OBJECT_ORDER object)
  // even though their sidebar lists Dashboards first.
  const memberLandingPath = useMemo(() => {
    const memberLandingObjectMetadataItem =
      MEMBER_LANDING_OBJECT_ORDER.map((nameSingular) =>
        memberSidebarObjectMetadataItems.find(
          (objectMetadataItem) =>
            objectMetadataItem.nameSingular === nameSingular,
        ),
      ).find(isDefined) ?? memberSidebarObjectMetadataItems.at(0);

    // Desktop /home redirects back to this path, so use upstream's landing for nothing readable
    if (!isDefined(memberLandingObjectMetadataItem)) {
      return getSettingsPath(SettingsPath.ProfilePage);
    }

    const viewId = getTargetViewId(memberLandingObjectMetadataItem.id);

    return getAppPath(
      AppPath.RecordIndexPage,
      { objectNamePlural: memberLandingObjectMetadataItem.namePlural },
      isDefined(viewId) ? { viewId } : undefined,
    );
  }, [getTargetViewId, memberSidebarObjectMetadataItems]);

  const defaultHomePagePath = useMemo(() => {
    if (!isDefined(currentUser)) {
      return AppPath.SignInUp;
    }

    if (isMobile) {
      return AppPath.Home;
    }

    // Both stores are empty right after login; deciding now would pick a wrong fallback.
    if (!areObjectMetadataItemsLoaded || !areNavigationMenuItemsLoaded) {
      return AppPath.Index;
    }

    // OMNIA-CUSTOM: members never get the nav-tree or alphabetical fallback; wait for their list.
    if (!hasLayoutsPermission) {
      return isMemberSidebarLoaded ? memberLandingPath : AppPath.Index;
    }

    if (isEmpty(readableNonSystemObjectMetadataItems)) {
      return getSettingsPath(SettingsPath.ProfilePage);
    }

    if (isDefined(firstNavigationMenuItemLink)) {
      return firstNavigationMenuItemLink;
    }

    if (!isDefined(firstObjectPathInfo)) {
      return AppPath.NotFound;
    }

    return getAppPath(
      AppPath.RecordIndexPage,
      { objectNamePlural: firstObjectPathInfo.objectMetadataItem?.namePlural },
      isDefined(firstObjectPathInfo.viewId)
        ? { viewId: firstObjectPathInfo.viewId }
        : undefined,
    );
  }, [
    currentUser,
    isMobile,
    readableNonSystemObjectMetadataItems,
    areObjectMetadataItemsLoaded,
    areNavigationMenuItemsLoaded,
    hasLayoutsPermission,
    isMemberSidebarLoaded,
    memberLandingPath,
    firstNavigationMenuItemLink,
    firstObjectPathInfo,
  ]);

  return { defaultHomePagePath };
};
