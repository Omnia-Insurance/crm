import { type CurrentUserWorkspace } from '@/auth/states/currentUserWorkspaceState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isDefined } from 'twenty-shared/utils';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { mockedUserData } from '~/testing/mock-data/users';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

// Omnia objects borrow mock objects' ids, so the mocked user's permissions on those ids apply.
const OMNIA_OVERRIDES_BY_MOCK_NAME_SINGULAR: Record<
  string,
  Partial<EnrichedObjectMetadataItem>
> = {
  dashboard: { isActive: true },
  person: { labelSingular: 'Lead', labelPlural: 'Leads' },
  pet: {
    nameSingular: 'policy',
    namePlural: 'policies',
    labelSingular: 'Policy',
    labelPlural: 'Policies',
  },
  rocket: {
    nameSingular: 'carrier',
    namePlural: 'carriers',
    labelSingular: 'Carrier',
    labelPlural: 'Carriers',
  },
  surveyResult: {
    nameSingular: 'call',
    namePlural: 'calls',
    labelSingular: 'Call',
    labelPlural: 'Calls',
  },
};

export const MEMBER_SIDEBAR_TEST_OBJECT_METADATA_ITEMS: EnrichedObjectMetadataItem[] =
  getTestEnrichedObjectMetadataItemsMock().map((objectMetadataItem) => ({
    ...objectMetadataItem,
    ...OMNIA_OVERRIDES_BY_MOCK_NAME_SINGULAR[objectMetadataItem.nameSingular],
  }));

export const getMemberSidebarTestObjectMetadataItemOrThrow = (
  nameSingular: string,
): EnrichedObjectMetadataItem => {
  const objectMetadataItem = MEMBER_SIDEBAR_TEST_OBJECT_METADATA_ITEMS.find(
    (item) => item.nameSingular === nameSingular,
  );

  if (!isDefined(objectMetadataItem)) {
    throw new Error(`No member sidebar test object named ${nameSingular}`);
  }

  return objectMetadataItem;
};

// Without showInSidebarByObjectNameSingular the visibility field is absent, as in a stale persisted session.
export const buildMemberSidebarTestUserWorkspace = ({
  showInSidebarByObjectNameSingular,
  unreadableObjectNameSingulars = [],
  rowLevelReadableObjectNameSingulars = [],
  hasLayoutsPermission = false,
}: {
  showInSidebarByObjectNameSingular?: Record<string, boolean>;
  unreadableObjectNameSingulars?: string[];
  rowLevelReadableObjectNameSingulars?: string[];
  hasLayoutsPermission?: boolean;
}): CurrentUserWorkspace => {
  const getObjectMetadataIds = (nameSingulars: string[]) =>
    nameSingulars.map(
      (nameSingular) =>
        getMemberSidebarTestObjectMetadataItemOrThrow(nameSingular).id,
    );

  const unreadableObjectMetadataIds = getObjectMetadataIds(
    unreadableObjectNameSingulars,
  );
  const rowLevelReadableObjectMetadataIds = getObjectMetadataIds(
    rowLevelReadableObjectNameSingulars,
  );

  return {
    ...mockedUserData.currentUserWorkspace,
    permissionFlags: [
      ...(mockedUserData.currentUserWorkspace.permissionFlags ?? []),
      ...(hasLayoutsPermission ? [PermissionFlagType.LAYOUTS] : []),
    ],
    objectRecordsPermissions:
      mockedUserData.currentUserWorkspace.objectRecordsPermissions.map(
        (objectRecordsPermissions) => {
          const { objectMetadataId } = objectRecordsPermissions;

          if (unreadableObjectMetadataIds.includes(objectMetadataId)) {
            return {
              ...objectRecordsPermissions,
              canReadAllRecords: false,
              rowLevelRecordsPermissions: [],
            };
          }

          if (rowLevelReadableObjectMetadataIds.includes(objectMetadataId)) {
            return {
              ...objectRecordsPermissions,
              canReadAllRecords: false,
              rowLevelRecordsPermissions: [
                {
                  ruleId: `${objectMetadataId}-read-rule`,
                  canCreateRecords: false,
                  canReadRecords: true,
                  canUpdateRecords: false,
                  canSoftDeleteRecords: false,
                  canDestroyRecords: false,
                  predicates: [],
                  predicateGroups: [],
                  unreadableFields: [],
                  uneditableFields: [],
                },
              ],
            };
          }

          return objectRecordsPermissions;
        },
      ),
    objectSidebarVisibility: isDefined(showInSidebarByObjectNameSingular)
      ? Object.entries(showInSidebarByObjectNameSingular).map(
          ([nameSingular, showInSidebar]) => ({
            objectMetadataId:
              getMemberSidebarTestObjectMetadataItemOrThrow(nameSingular).id,
            showInSidebar,
          }),
        )
      : undefined,
  };
};
