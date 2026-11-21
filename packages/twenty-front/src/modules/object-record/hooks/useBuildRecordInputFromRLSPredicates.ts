/* @license Enterprise */

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { convertPredicateToRecordFilter } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
// OMNIA-CUSTOM: the C2 hop prefill resolves its relation target and fetches the member's own record
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import {
  StandardObjectNameSingular,
  RelationType,
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { findSingleCreateRowLevelPermissionRule } from '@/object-metadata/utils/findSingleCreateRowLevelPermissionRule';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { buildRecordInputFromFilter } from '@/object-record/record-table/utils/buildRecordInputFromFilter';
import { buildCompositeValueFromSubField } from '@/object-record/record-table/utils/buildValueFromFilter';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isUndefined } from '@sniptt/guards';
import { useUserTimezone } from '@/ui/input/components/internal/date/hooks/useUserTimezone';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined, isPlainObject } from 'twenty-shared/utils';
import { doNotTranslate } from 'twenty-shared/i18n';

const mergeCompositeValues = (
  existingValue: unknown,
  incomingValue: unknown,
) =>
  isPlainObject(existingValue) && isPlainObject(incomingValue)
    ? { ...existingValue, ...incomingValue }
    : incomingValue;

// OMNIA-CUSTOM: contract C2 hop (policy.agent ▸ agentProfile.workspaceMember IS Me). Its create
// default is the member's own target record, their AgentProfile, never the raw member id
type RowLevelPermissionHopPrefill = {
  recordInputFieldName: string;
  targetObjectNameSingular: string;
  targetWorkspaceMemberJoinColumnName: string;
};

const findRowLevelPermissionHopPrefill = ({
  predicates,
  objectMetadataItem,
  objectMetadataItems,
  workspaceMemberObjectMetadataItem,
}: {
  predicates: RowLevelPermissionPredicate[];
  objectMetadataItem: EnrichedObjectMetadataItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
  workspaceMemberObjectMetadataItem: EnrichedObjectMetadataItem;
}): RowLevelPermissionHopPrefill | undefined => {
  for (const predicate of predicates) {
    if (
      predicate.objectMetadataId !== objectMetadataItem.id ||
      !isDefined(predicate.relationFieldMetadataId) ||
      predicate.operand !== RowLevelPermissionPredicateOperand.IS
    ) {
      continue;
    }

    const relationFieldMetadataItem = objectMetadataItem.fields.find(
      (field) => field.id === predicate.relationFieldMetadataId,
    );

    if (
      !isDefined(relationFieldMetadataItem) ||
      !relationFieldMetadataItem.isActive ||
      !isManyToOneRelationField(relationFieldMetadataItem)
    ) {
      continue;
    }

    const targetObjectMetadataItem = objectMetadataItems.find(
      (item) =>
        item.id === relationFieldMetadataItem.relation.targetObjectMetadata.id,
    );
    const targetWorkspaceMemberFieldMetadataItem =
      targetObjectMetadataItem?.fields.find(
        (field) => field.id === predicate.fieldMetadataId,
      );
    const workspaceMemberFieldMetadataItem =
      workspaceMemberObjectMetadataItem.fields.find(
        (field) => field.id === predicate.workspaceMemberFieldMetadataId,
      );

    if (
      !isDefined(targetObjectMetadataItem) ||
      !targetObjectMetadataItem.isActive ||
      !isDefined(targetWorkspaceMemberFieldMetadataItem) ||
      !targetWorkspaceMemberFieldMetadataItem.isActive ||
      !isManyToOneRelationField(targetWorkspaceMemberFieldMetadataItem) ||
      targetWorkspaceMemberFieldMetadataItem.relation.targetObjectMetadata
        .id !== workspaceMemberObjectMetadataItem.id ||
      workspaceMemberFieldMetadataItem?.name !== 'id'
    ) {
      continue;
    }

    return {
      recordInputFieldName: doNotTranslate(
        `${relationFieldMetadataItem.name}Id`,
      ),
      targetObjectNameSingular: targetObjectMetadataItem.nameSingular,
      targetWorkspaceMemberJoinColumnName: doNotTranslate(
        `${targetWorkspaceMemberFieldMetadataItem.name}Id`,
      ),
    };
  }

  return undefined;
};

export const useBuildRecordInputFromRLSPredicates = ({
  objectMetadataItem: defaultObjectMetadataItem,
}: {
  objectMetadataItem?: EnrichedObjectMetadataItem;
} = {}) => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  const { userTimezone } = useUserTimezone();

  const { record: currentWorkspaceMemberRecord } = useFindOneRecord({
    objectNameSingular: StandardObjectNameSingular.WorkspaceMember,
    objectRecordId: currentWorkspaceMember?.id,
  });

  const { objectMetadataItem: workspaceMemberObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: StandardObjectNameSingular.WorkspaceMember,
    });

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  // OMNIA-CUSTOM: hooks cannot run inside the builder, so the hop target of the hook-level
  // object is fetched here; the fallback object keeps the unconditional fetch valid when skipped
  const { objectMetadataItems } = useObjectMetadataItems();

  const hopPrefill = isDefined(defaultObjectMetadataItem)
    ? findRowLevelPermissionHopPrefill({
        predicates:
          findSingleCreateRowLevelPermissionRule(
            getObjectPermissionsForObject(
              objectPermissionsByObjectMetadataId,
              defaultObjectMetadataItem.id,
            ),
          )?.predicates ?? [],
        objectMetadataItem: defaultObjectMetadataItem,
        objectMetadataItems,
        workspaceMemberObjectMetadataItem,
      })
    : undefined;

  const { records: hopTargetRecords } = useFindManyRecords({
    objectNameSingular:
      hopPrefill?.targetObjectNameSingular ??
      StandardObjectNameSingular.WorkspaceMember,
    filter:
      isDefined(hopPrefill) && isDefined(currentWorkspaceMember)
        ? {
            [hopPrefill.targetWorkspaceMemberJoinColumnName]: {
              eq: currentWorkspaceMember.id,
            },
          }
        : undefined,
    recordGqlFields: { id: true },
    limit: 1,
    skip: !isDefined(hopPrefill) || !isDefined(currentWorkspaceMember),
  });

  const hopTargetRecordId = hopTargetRecords.at(0)?.id;

  const getRecordInputFieldName = (fieldMetadataItem: {
    name: string;
    type: string;
    settings?: { relationType?: RelationType };
  }) =>
    fieldMetadataItem.type === 'RELATION' &&
    fieldMetadataItem.settings?.relationType === RelationType.MANY_TO_ONE
      ? // Metadata and protocol identifiers must stay stable across locales.
        doNotTranslate(`${fieldMetadataItem.name}Id`)
      : fieldMetadataItem.name;

  const getWorkspaceMemberFieldValue = ({
    workspaceMemberFieldMetadataId,
    workspaceMemberSubFieldName,
  }: {
    workspaceMemberFieldMetadataId?: string | null;
    workspaceMemberSubFieldName?: string | null;
  }) => {
    const workspaceMemberFieldMetadataItem =
      workspaceMemberObjectMetadataItem?.fields.find(
        (field) => field.id === workspaceMemberFieldMetadataId,
      );

    if (!isDefined(workspaceMemberFieldMetadataItem)) {
      throw new Error(
        doNotTranslate(
          `Workspace member field metadata item not found for id: ${workspaceMemberFieldMetadataId}`,
        ),
      );
    }

    let workspaceMemberFieldValue =
      currentWorkspaceMemberRecord?.[
        getRecordInputFieldName(workspaceMemberFieldMetadataItem)
      ];

    if (isCompositeFieldType(workspaceMemberFieldMetadataItem.type)) {
      if (!workspaceMemberSubFieldName) {
        throw new Error(
          doNotTranslate(
            `Workspace member subfield name not found for field: ${workspaceMemberFieldMetadataItem.name}`,
          ),
        );
      }

      const compositeValue = workspaceMemberFieldValue as
        | Record<string, unknown>
        | undefined;
      workspaceMemberFieldValue = compositeValue?.[workspaceMemberSubFieldName];
    }

    if (isUndefined(workspaceMemberFieldValue)) {
      throw new Error(
        doNotTranslate(
          `Current workspace member field value not found for field: ${workspaceMemberFieldMetadataItem.name}`,
        ),
      );
    }

    return workspaceMemberFieldValue;
  };

  const buildRecordInputFromRLSPredicates = ({
    objectMetadataItem = defaultObjectMetadataItem,
  }: {
    objectMetadataItem?: EnrichedObjectMetadataItem;
  } = {}): Partial<ObjectRecord> => {
    if (!isDefined(objectMetadataItem)) {
      throw new Error(
        doNotTranslate(
          'Object metadata item is required to build RLS defaults',
        ),
      );
    }

    const objectPermissions = getObjectPermissionsForObject(
      objectPermissionsByObjectMetadataId,
      objectMetadataItem.id,
    );
    const rlsPredicates = (
      findSingleCreateRowLevelPermissionRule(objectPermissions)?.predicates ??
      []
    ).filter(
      (predicate) =>
        predicate.objectMetadataId === objectMetadataItem.id &&
        // OMNIA-CUSTOM: a hop predicate's field lives on the target object; it prefills below
        !isDefined(predicate.relationFieldMetadataId),
    );

    const fieldMetadataItemMap = new Map(
      objectMetadataItem.fields.map((field) => [field.id, field]),
    );

    const rlsPredicatesAsRecordFilters = rlsPredicates
      .map((predicate) =>
        convertPredicateToRecordFilter(
          predicate,
          fieldMetadataItemMap.get(predicate.fieldMetadataId),
        ),
      )
      .filter(isDefined);

    const recordInputFromDynamicFilters: Partial<ObjectRecord> = {};

    rlsPredicatesAsRecordFilters.forEach((filter) => {
      const fieldMetadataItem = fieldMetadataItemMap.get(
        filter.fieldMetadataId,
      );

      if (!isDefined(fieldMetadataItem)) {
        return;
      }

      if (isDefined(filter.rlsDynamicValue)) {
        const recordInputField = getRecordInputFieldName(fieldMetadataItem);
        const currentWorkspaceMemberFieldValue = getWorkspaceMemberFieldValue({
          workspaceMemberFieldMetadataId:
            filter.rlsDynamicValue?.workspaceMemberFieldMetadataId,
          workspaceMemberSubFieldName:
            filter.rlsDynamicValue?.workspaceMemberSubFieldName,
        });

        if (isCompositeFieldType(fieldMetadataItem.type)) {
          if (!filter.subFieldName) {
            throw new Error(
              doNotTranslate(
                `Subfield name not found for composite field: ${fieldMetadataItem.name}`,
              ),
            );
          }

          const compositeValue = buildCompositeValueFromSubField({
            compositeFieldType: fieldMetadataItem.type,
            subFieldName: filter.subFieldName,
            value: currentWorkspaceMemberFieldValue,
          });

          if (!compositeValue) {
            throw new Error(
              doNotTranslate(
                `Composite subfield not found for field: ${fieldMetadataItem.name}`,
              ),
            );
          }

          recordInputFromDynamicFilters[recordInputField] =
            mergeCompositeValues(
              recordInputFromDynamicFilters[recordInputField],
              compositeValue,
            );
        } else {
          recordInputFromDynamicFilters[recordInputField] =
            currentWorkspaceMemberFieldValue;
        }
      }
    });

    const staticFilters = rlsPredicatesAsRecordFilters.filter(
      (filter) => !isDefined(filter.rlsDynamicValue),
    );

    const recordInputFromStaticFilters = buildRecordInputFromFilter({
      currentRecordFilters: staticFilters,
      objectMetadataItem,
      currentWorkspaceMember: currentWorkspaceMember ?? undefined,
      timeZone: userTimezone,
    });

    // OMNIA-CUSTOM: C2 hop prefill, below direct predicates. Omitted while unresolved and for a
    // call-time object (junction path, no prefetch); the policy create hook then stamps agentId
    const recordInputFromHopPredicate: Partial<ObjectRecord> =
      isDefined(hopPrefill) &&
      isDefined(hopTargetRecordId) &&
      objectMetadataItem.id === defaultObjectMetadataItem?.id
        ? { [hopPrefill.recordInputFieldName]: hopTargetRecordId }
        : {};

    const mergedRecordInput: Partial<ObjectRecord> = {
      ...recordInputFromHopPredicate,
      ...recordInputFromDynamicFilters,
    };

    Object.entries(recordInputFromStaticFilters).forEach(([key, value]) => {
      mergedRecordInput[key] = mergeCompositeValues(
        mergedRecordInput[key],
        value,
      );
    });

    return mergedRecordInput;
  };

  return { buildRecordInputFromRLSPredicates };
};
