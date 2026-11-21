/* @license Enterprise */

import { useCallback, useEffect } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
// OMNIA-CUSTOM: "<Relation> is Me" hop rows (contract C2)
import { useWorkspaceMemberHopMetadata } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useWorkspaceMemberHopMetadata';
import { findWorkspaceMemberHop } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/findWorkspaceMemberHop';
import { isWorkspaceMemberHopPredicate } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/isWorkspaceMemberHopPredicate';
import {
  convertRecordFilterGroupToPredicateGroup,
  convertRecordFilterToPredicate,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion';
// OMNIA-CUSTOM: rows loaded without a group are stored back without one while unchanged (contract C2)
import { unwrapUngroupedRecordFiltersFromRootGroup } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/unwrapUngroupedRecordFiltersFromRootGroup';
import { type UngroupedRecordFiltersRootGroup } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/wrapUngroupedRecordFiltersInRootGroup';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { useSetAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useSetAtomFamilyState';

type UseRecordLevelPermissionSyncToDraftRoleProps = {
  roleId: string;
  objectMetadataItem: EnrichedObjectMetadataItem;
  currentRecordFilters: RecordFilter[];
  currentRecordFilterGroups: RecordFilterGroup[];
  hasInitialized: boolean;
  // OMNIA-CUSTOM: root group that initialization added for rows stored without a group (contract C2)
  ungroupedRecordFiltersRootGroup?: UngroupedRecordFiltersRootGroup;
};

export const useRecordLevelPermissionSyncToDraftRole = ({
  roleId,
  objectMetadataItem,
  currentRecordFilters,
  currentRecordFilterGroups,
  hasInitialized,
  ungroupedRecordFiltersRootGroup,
}: UseRecordLevelPermissionSyncToDraftRoleProps) => {
  const setSettingsDraftRole = useSetAtomFamilyState(
    settingsDraftRoleFamilyState,
    roleId,
  );

  // OMNIA-CUSTOM: same metadata as initialization, so only hops it loaded are replaced
  const workspaceMemberHopMetadata = useWorkspaceMemberHopMetadata(
    objectMetadataItem.id,
  );

  const syncToDraftRole = useCallback(() => {
    // OMNIA-CUSTOM: opening a rule stored without a group (the C2 hop) keeps it as stored
    const {
      recordFilters: recordFiltersToStore,
      recordFilterGroups: recordFilterGroupsToStore,
    } = unwrapUngroupedRecordFiltersFromRootGroup({
      recordFilters: currentRecordFilters,
      recordFilterGroups: currentRecordFilterGroups,
      ungroupedRecordFiltersRootGroup,
    });

    setSettingsDraftRole((previousRole) => {
      const predicatesNotManagedByFilters = (
        previousRole.rowLevelPermissionPredicates ?? []
      ).filter(
        (predicate) =>
          predicate.objectMetadataId !== objectMetadataItem.id ||
          // OMNIA-CUSTOM: C2 hops are builder rows and are replaced with the filters,
          // so none is duplicated or left stale
          (isDefined(predicate.relationFieldMetadataId) &&
            !isWorkspaceMemberHopPredicate({
              predicate,
              ...workspaceMemberHopMetadata,
            })),
      );

      const currentObjectGroupIds = new Set(
        currentRecordFilters
          .map((filter) => filter.recordFilterGroupId)
          .filter(isDefined),
      );

      const currentObjectRootGroupIds = new Set(
        currentRecordFilterGroups
          .filter((group) => !group.parentRecordFilterGroupId)
          .map((group) => group.id),
      );

      const otherObjectGroups = (
        previousRole.rowLevelPermissionPredicateGroups ?? []
      ).filter(
        (group) =>
          !currentObjectGroupIds.has(group.id) &&
          !currentObjectRootGroupIds.has(group.id),
      );

      // OMNIA-CUSTOM: stored shape of the rows (contract C2)
      const newPredicates = recordFiltersToStore.map((filter) =>
        convertRecordFilterToPredicate(
          filter,
          roleId,
          objectMetadataItem.id,
          // OMNIA-CUSTOM: "Me" on a relation to a member-owned record is saved as the C2 hop
          findWorkspaceMemberHop({
            relationFieldMetadataId: filter.fieldMetadataId,
            workspaceMemberFieldMetadataId:
              filter.rlsDynamicValue?.workspaceMemberFieldMetadataId,
            ...workspaceMemberHopMetadata,
          }),
        ),
      );

      const previousPredicateGroupById = new Map(
        (previousRole.rowLevelPermissionPredicateGroups ?? []).map(
          (predicateGroup) => [predicateGroup.id, predicateGroup],
        ),
      );

      // OMNIA-CUSTOM: stored shape of the groups (contract C2)
      const newPredicateGroups = recordFilterGroupsToStore.map((group) =>
        convertRecordFilterGroupToPredicateGroup({
          filterGroup: group,
          roleId,
          objectMetadataId: objectMetadataItem.id,
          existingPredicateGroup: previousPredicateGroupById.get(group.id),
        }),
      );

      return {
        ...previousRole,
        rowLevelPermissionPredicates: [
          ...predicatesNotManagedByFilters,
          ...newPredicates,
        ],
        rowLevelPermissionPredicateGroups: [
          ...otherObjectGroups,
          ...newPredicateGroups,
        ],
      };
    });
  }, [
    currentRecordFilters,
    currentRecordFilterGroups,
    objectMetadataItem.id,
    roleId,
    setSettingsDraftRole,
    // OMNIA-CUSTOM: hop rows and rows stored without a group (contract C2)
    workspaceMemberHopMetadata,
    ungroupedRecordFiltersRootGroup,
  ]);

  useEffect(() => {
    if (hasInitialized) {
      syncToDraftRole();
    }
  }, [syncToDraftRole, hasInitialized]);

  return { syncToDraftRole };
};
