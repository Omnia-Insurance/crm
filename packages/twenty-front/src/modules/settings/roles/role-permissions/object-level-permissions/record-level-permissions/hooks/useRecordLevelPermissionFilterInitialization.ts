/* @license Enterprise */

import { useEffect, useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
// OMNIA-CUSTOM: id of the root group for rows stored without a group (contract C2)
import { v4 } from 'uuid';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
// OMNIA-CUSTOM: "<Relation> is Me" hop rows (contract C2)
import { useWorkspaceMemberHopMetadata } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useWorkspaceMemberHopMetadata';
import { isWorkspaceMemberHopPredicate } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/isWorkspaceMemberHopPredicate';
import {
  convertPredicateGroupToRecordFilterGroup,
  convertPredicateToRecordFilter,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion';
// OMNIA-CUSTOM: rows stored without a group load under a root group (contract C2)
import {
  type UngroupedRecordFiltersRootGroup,
  wrapUngroupedRecordFiltersInRootGroup,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/wrapUngroupedRecordFiltersInRootGroup';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';

type UseRecordLevelPermissionFilterInitializationProps = {
  roleId: string;
  objectMetadataItem: EnrichedObjectMetadataItem;
  settingsDraftRole: RoleWithPartialMembers;
  filterableFieldMetadataItems: FieldMetadataItem[];
  setCurrentRecordFilters: (filters: RecordFilter[]) => void;
  setCurrentRecordFilterGroups: (groups: RecordFilterGroup[]) => void;
  setRecordFilterUsedInAdvancedFilterDropdownRow: (
    filter: RecordFilter,
  ) => void;
};

export const useRecordLevelPermissionFilterInitialization = ({
  roleId,
  objectMetadataItem,
  settingsDraftRole,
  filterableFieldMetadataItems,
  setCurrentRecordFilters,
  setCurrentRecordFilterGroups,
  setRecordFilterUsedInAdvancedFilterDropdownRow,
}: UseRecordLevelPermissionFilterInitializationProps) => {
  const [hasInitialized, setHasInitialized] = useState(false);
  const [lastInitializedRoleId, setLastInitializedRoleId] =
    useState<string>('');
  const [lastInitializedObjectId, setLastInitializedObjectId] =
    useState<string>('');
  // OMNIA-CUSTOM: the draft sync stores these rows back without a group while they are unchanged
  const [ungroupedRecordFiltersRootGroup, setUngroupedRecordFiltersRootGroup] =
    useState<UngroupedRecordFiltersRootGroup>();

  // OMNIA-CUSTOM: same metadata as the draft sync, which owns the hops loaded here
  const workspaceMemberHopMetadata = useWorkspaceMemberHopMetadata(
    objectMetadataItem.id,
  );

  const initialFilters = useMemo(() => {
    const predicates = settingsDraftRole.rowLevelPermissionPredicates ?? [];
    const objectPredicates = predicates.filter(
      (predicate) =>
        predicate.objectMetadataId === objectMetadataItem.id &&
        // OMNIA-CUSTOM: the builder edits the C2 hops it writes;
        // other hops stay hidden and untouched
        (!isDefined(predicate.relationFieldMetadataId) ||
          isWorkspaceMemberHopPredicate({
            predicate,
            ...workspaceMemberHopMetadata,
          })),
    );

    return objectPredicates
      .map((predicate) => {
        const fieldMetadataItem = filterableFieldMetadataItems.find(
          (fieldMetadataItemToFind) =>
            fieldMetadataItemToFind.id ===
            // OMNIA-CUSTOM: a hop row sits on its relation field
            (predicate.relationFieldMetadataId ?? predicate.fieldMetadataId),
        );
        return convertPredicateToRecordFilter(predicate, fieldMetadataItem);
      })
      .filter(isDefined);
  }, [
    settingsDraftRole.rowLevelPermissionPredicates,
    objectMetadataItem.id,
    filterableFieldMetadataItems,
    // OMNIA-CUSTOM: hop rows depend on the hop metadata (contract C2)
    workspaceMemberHopMetadata,
  ]);

  const initialFilterGroups = useMemo(() => {
    const predicateGroups =
      settingsDraftRole.rowLevelPermissionPredicateGroups ?? [];

    const objectPredicateGroupIds = new Set(
      (settingsDraftRole.rowLevelPermissionPredicates ?? [])
        .filter(
          (predicate) => predicate.objectMetadataId === objectMetadataItem.id,
        )
        .map((predicate) => predicate.rowLevelPermissionPredicateGroupId)
        .filter(isDefined),
    );

    const relevantGroups = predicateGroups.filter(
      (group) =>
        objectPredicateGroupIds.has(group.id) ||
        (isDefined(group.parentRowLevelPermissionPredicateGroupId) &&
          objectPredicateGroupIds.has(
            group.parentRowLevelPermissionPredicateGroupId,
          )),
    );

    const rootGroups = predicateGroups.filter(
      (group) =>
        !group.parentRowLevelPermissionPredicateGroupId &&
        relevantGroups.some(
          (relevantGroup) =>
            relevantGroup.id === group.id ||
            relevantGroup.parentRowLevelPermissionPredicateGroupId === group.id,
        ),
    );

    const allRelevantGroups = [...new Set([...rootGroups, ...relevantGroups])];

    return allRelevantGroups.map(convertPredicateGroupToRecordFilterGroup);
  }, [
    settingsDraftRole.rowLevelPermissionPredicateGroups,
    settingsDraftRole.rowLevelPermissionPredicates,
    objectMetadataItem.id,
  ]);

  useEffect(() => {
    const isRoleOrObjectChanged =
      lastInitializedRoleId !== roleId ||
      lastInitializedObjectId !== objectMetadataItem.id;

    const isDraftRolePopulated = settingsDraftRole.id === roleId;

    const shouldInitialize =
      isDraftRolePopulated && (isRoleOrObjectChanged || !hasInitialized);

    if (shouldInitialize) {
      // OMNIA-CUSTOM: without a root group, rows stored without a group (the C2 hop) would not render,
      // and "Add filter" would save a second rule that the engine ORs with them
      const {
        recordFilters: initialRecordFilters,
        recordFilterGroups: initialRecordFilterGroups,
        ungroupedRecordFiltersRootGroup: initialUngroupedRecordFiltersRootGroup,
      } = wrapUngroupedRecordFiltersInRootGroup({
        recordFilters: initialFilters,
        recordFilterGroups: initialFilterGroups,
        rootRecordFilterGroupId: v4(),
      });

      setCurrentRecordFilters(initialRecordFilters);
      setCurrentRecordFilterGroups(initialRecordFilterGroups);
      setUngroupedRecordFiltersRootGroup(
        initialUngroupedRecordFiltersRootGroup,
      );

      for (const filter of initialRecordFilters) {
        setRecordFilterUsedInAdvancedFilterDropdownRow(filter);
      }

      setHasInitialized(true);
      setLastInitializedRoleId(roleId);
      setLastInitializedObjectId(objectMetadataItem.id);
    }
  }, [
    roleId,
    objectMetadataItem.id,
    settingsDraftRole.id,
    initialFilters,
    initialFilterGroups,
    hasInitialized,
    lastInitializedRoleId,
    lastInitializedObjectId,
    setCurrentRecordFilters,
    setCurrentRecordFilterGroups,
    setRecordFilterUsedInAdvancedFilterDropdownRow,
  ]);

  return {
    hasInitialized,
    // OMNIA-CUSTOM: read by the draft sync (contract C2)
    ungroupedRecordFiltersRootGroup,
  };
};
