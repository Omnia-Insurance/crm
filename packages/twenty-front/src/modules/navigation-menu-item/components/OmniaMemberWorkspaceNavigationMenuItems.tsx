import { useLingui } from '@lingui/react/macro';

import { NavigationDrawerSectionForObjectMetadataItems } from '@/object-metadata/components/NavigationDrawerSectionForObjectMetadataItems';
import { NavigationDrawerSectionForObjectMetadataItemsSkeletonLoader } from '@/object-metadata/components/NavigationDrawerSectionForObjectMetadataItemsSkeletonLoader';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { useIsPrefetchLoading } from '@/prefetch/hooks/useIsPrefetchLoading';
import { getOmniaMemberWorkspaceObjectMetadataItems } from '@/navigation-menu-item/utils/getOmniaMemberWorkspaceObjectMetadataItems';

export const OmniaMemberWorkspaceNavigationMenuItems = () => {
  const { t } = useLingui();
  const loading = useIsPrefetchLoading();
  const { activeNonSystemObjectMetadataItems } =
    useFilteredObjectMetadataItems();

  const omniaMemberWorkspaceObjectMetadataItems =
    getOmniaMemberWorkspaceObjectMetadataItems(
      activeNonSystemObjectMetadataItems,
    );

  if (loading) {
    return <NavigationDrawerSectionForObjectMetadataItemsSkeletonLoader />;
  }

  return (
    <NavigationDrawerSectionForObjectMetadataItems
      sectionTitle={t`Workspace`}
      objectMetadataItems={omniaMemberWorkspaceObjectMetadataItems}
      isRemote={false}
      respectProvidedOrder
      ignoreShowInSidebar
    />
  );
};
