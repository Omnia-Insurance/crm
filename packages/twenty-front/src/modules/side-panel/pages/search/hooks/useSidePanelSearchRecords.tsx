import { Command } from '@/command-menu-item/display/components/Command';
import { CommandLink } from '@/command-menu-item/display/components/CommandLink';
import { CommandMenuItemScope } from '@/command-menu-item/types/CommandMenuItemScope';
import { CommandMenuItemType } from '@/command-menu-item/types/CommandMenuItemType';
import { MAX_SEARCH_RESULTS } from '@/command-menu/constants/MaxSearchResults';
import { useReadableObjectMetadataItems } from '@/object-metadata/hooks/useReadableObjectMetadataItems';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { sidePanelSearchObjectFilterState } from '@/side-panel/states/sidePanelSearchObjectFilterState';
import { sidePanelSearchState } from '@/side-panel/states/sidePanelSearchState';
import { sidePanelShowHiddenObjectsState } from '@/side-panel/states/sidePanelShowHiddenObjectsState';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { CoreObjectNameSingular, AppPath } from 'twenty-shared/types';
import { getObjectPermissionsFromMapByObjectMetadataId } from '@/settings/roles/role-permissions/objects-permissions/utils/getObjectPermissionsFromMapByObjectMetadataId';
import { t } from '@lingui/core/macro';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Avatar } from 'twenty-ui/display';
import { useDebounce } from 'use-debounce';
import { useQuery } from '@apollo/client/react';
import { SearchDocument } from '~/generated/graphql';
import { PermissionFlagType } from '~/generated-metadata/graphql';

export const useSidePanelSearchRecords = () => {
  const sidePanelSearch = useAtomStateValue(sidePanelSearchState);
  const sidePanelSearchObjectFilter = useAtomStateValue(
    sidePanelSearchObjectFilterState,
  );
  const sidePanelShowHiddenObjects = useAtomStateValue(
    sidePanelShowHiddenObjectsState,
  );
  const coreClient = useApolloCoreClient();

  const [deferredSidePanelSearch] = useDebounce(sidePanelSearch, 300);
  const { readableObjectMetadataItems } = useReadableObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const isAdmin = useHasPermissionFlag(PermissionFlagType.LAYOUTS);

  const includedObjectNameSingulars = useMemo(() => {
    if (isDefined(sidePanelSearchObjectFilter)) {
      return [sidePanelSearchObjectFilter];
    }

    return readableObjectMetadataItems
      .filter((item) => {
        if (!(sidePanelShowHiddenObjects || item.isSearchable)) return false;
        // OMNIA-CUSTOM: non-admin users only search objects in their sidebar
        // (excludes system objects like workspaceMember that get default perms)
        if (!isAdmin) {
          if (item.isSystem) return false;
          const perms = getObjectPermissionsFromMapByObjectMetadataId({
            objectPermissionsByObjectMetadataId,
            objectMetadataId: item.id,
          });
          if (!perms?.showInSidebar) return false;
        }
        return true;
      })
      .map((item) => item.nameSingular);
  }, [
    readableObjectMetadataItems,
    sidePanelSearchObjectFilter,
    sidePanelShowHiddenObjects,
    isAdmin,
    objectPermissionsByObjectMetadataId,
  ]);

  const { data: searchData, loading } = useQuery(SearchDocument, {
    client: coreClient,
    variables: {
      searchInput: deferredSidePanelSearch ?? '',
      limit: MAX_SEARCH_RESULTS,
      includedObjectNameSingulars,
    },
  });

  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const actionItems = useMemo(() => {
    return (searchData?.search.edges.map((edge) => edge.node) ?? []).map(
      (searchRecord, index) => {
        const baseAction = {
          type: CommandMenuItemType.Navigation,
          scope: CommandMenuItemScope.Global,
          key: searchRecord.recordId,
          label: searchRecord.label,
          position: index,
          Icon: () => (
            <Avatar
              type={
                searchRecord.objectNameSingular ===
                CoreObjectNameSingular.Company
                  ? 'squared'
                  : 'rounded'
              }
              avatarUrl={searchRecord.imageUrl}
              placeholderColorSeed={searchRecord.recordId}
              placeholder={searchRecord.label}
            />
          ),
          shouldBeRegistered: () => true,
          description:
            readableObjectMetadataItems.find(
              (item) => item.nameSingular === searchRecord.objectNameSingular,
            )?.labelSingular ?? searchRecord.objectNameSingular,
        };

        if (
          [CoreObjectNameSingular.Task, CoreObjectNameSingular.Note].includes(
            searchRecord.objectNameSingular as CoreObjectNameSingular,
          )
        ) {
          return {
            ...baseAction,
            component: (
              <Command
                onClick={() => {
                  searchRecord.objectNameSingular ===
                  CoreObjectNameSingular.Task
                    ? openRecordInSidePanel({
                        recordId: searchRecord.recordId,
                        objectNameSingular: CoreObjectNameSingular.Task,
                      })
                    : openRecordInSidePanel({
                        recordId: searchRecord.recordId,
                        objectNameSingular: CoreObjectNameSingular.Note,
                      });
                }}
                closeSidePanelOnCommandMenuListExecution={false}
              />
            ),
          };
        }

        return {
          ...baseAction,
          component: (
            <CommandLink
              to={AppPath.RecordShowPage}
              params={{
                objectNameSingular: searchRecord.objectNameSingular,
                objectRecordId: searchRecord.recordId,
              }}
            />
          ),
        };
      },
    );
  }, [searchData, openRecordInSidePanel, readableObjectMetadataItems]);

  return {
    loading,
    noResults: !actionItems?.length,
    commandGroups: [
      {
        heading: t`Results`,
        items: actionItems,
      },
    ],
    hasMore: false,
    pageSize: 0,
    onLoadMore: () => {},
  };
};
