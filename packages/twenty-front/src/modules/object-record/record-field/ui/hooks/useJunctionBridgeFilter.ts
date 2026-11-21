import { isNonEmptyString, isUndefined } from '@sniptt/guards';
import { useMemo } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { detectJunctionBridge } from '@/object-record/record-field/ui/utils/junction/detectJunctionBridge';
import { useFindAllRecordPages } from '@/object-record/record-picker/hooks/useFindAllRecordPages';
import { buildIdAllowlistFilter } from '@/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import {
  type RecordGqlFields,
  type RecordGqlOperationFilter,
} from 'twenty-shared/types';
import {
  computeRelationGqlFieldJoinColumnName,
  isDefined,
} from 'twenty-shared/utils';

type UseJunctionBridgeFilterForRecordParams = {
  objectMetadataItem: EnrichedObjectMetadataItem;
  fieldMetadataItem: FieldMetadataItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
  record: Partial<ObjectRecord> | null | undefined;
};

// The search API cannot filter on a junction, so the targets linked to the
// parent record (the products of the policy's carrier) become an id allowlist.
// `record` is a stored record or a creation-form draft.
export const useJunctionBridgeFilterForRecord = ({
  objectMetadataItem,
  fieldMetadataItem,
  objectMetadataItems,
  record,
}: UseJunctionBridgeFilterForRecordParams):
  | RecordGqlOperationFilter
  | undefined => {
  const junctionBridge = useMemo(
    () =>
      detectJunctionBridge({
        objectMetadataItem,
        fieldMetadataItem,
        objectMetadataItems,
      }),
    [objectMetadataItem, fieldMetadataItem, objectMetadataItems],
  );

  const parentRecordId = useMemo(() => {
    if (!isDefined(junctionBridge) || !isDefined(record)) {
      return undefined;
    }

    const parentRecordIdFromRelation = record[junctionBridge.parentFieldName]
      ?.id as unknown;

    if (isNonEmptyString(parentRecordIdFromRelation)) {
      return parentRecordIdFromRelation;
    }

    const parentRecordIdFromJoinColumn = record[
      computeRelationGqlFieldJoinColumnName({
        name: junctionBridge.parentFieldName,
      })
    ] as unknown;

    return isNonEmptyString(parentRecordIdFromJoinColumn)
      ? parentRecordIdFromJoinColumn
      : undefined;
  }, [junctionBridge, record]);

  const junctionRecordsFilter = useMemo(
    () =>
      isDefined(junctionBridge)
        ? { [junctionBridge.sourceJoinColumnName]: { eq: parentRecordId } }
        : undefined,
    [junctionBridge, parentRecordId],
  );

  const junctionRecordGqlFields = useMemo<RecordGqlFields>(
    () =>
      isDefined(junctionBridge)
        ? { id: true, [junctionBridge.targetJoinColumnName]: true }
        : { id: true },
    [junctionBridge],
  );

  // useFindAllRecordPages needs a known object even when skipped
  const { records: junctionRecords, loading } = useFindAllRecordPages({
    objectNameSingular:
      junctionBridge?.junctionObjectNameSingular ??
      objectMetadataItem.nameSingular,
    filter: junctionRecordsFilter,
    recordGqlFields: junctionRecordGqlFields,
    skip: !isDefined(junctionBridge) || !isDefined(parentRecordId),
  });

  return useMemo(() => {
    if (!isDefined(junctionBridge) || !isDefined(parentRecordId)) {
      return undefined;
    }

    if (loading) {
      return buildIdAllowlistFilter([]);
    }

    return buildIdAllowlistFilter(
      junctionRecords
        .map(
          (junctionRecord) =>
            junctionRecord[junctionBridge.targetJoinColumnName],
        )
        .filter(isNonEmptyString),
    );
  }, [junctionBridge, junctionRecords, loading, parentRecordId]);
};

// Index views (table, board, calendar) store only their visible columns, so a
// row may lack the parent: it is then fetched, and nothing is offered until it
// arrives or if the fetch fails
export const useJunctionBridgeFilter = ({
  recordId,
  ...junctionBridgeFilterParams
}: Omit<UseJunctionBridgeFilterForRecordParams, 'record'> & {
  recordId: string;
}): RecordGqlOperationFilter | undefined => {
  const { objectMetadataItem, fieldMetadataItem, objectMetadataItems } =
    junctionBridgeFilterParams;

  const recordStore = useAtomFamilyStateValue(recordStoreFamilyState, recordId);

  const parentFieldName = useMemo(
    () =>
      detectJunctionBridge({
        objectMetadataItem,
        fieldMetadataItem,
        objectMetadataItems,
      })?.parentFieldName,
    [objectMetadataItem, fieldMetadataItem, objectMetadataItems],
  );

  const parentJoinColumnName = isDefined(parentFieldName)
    ? computeRelationGqlFieldJoinColumnName({ name: parentFieldName })
    : undefined;

  // A loaded empty relation is null; undefined means the column was not loaded
  const isParentMissingFromStore =
    isDefined(recordStore) &&
    isDefined(parentFieldName) &&
    isDefined(parentJoinColumnName) &&
    isUndefined(recordStore[parentFieldName]) &&
    isUndefined(recordStore[parentJoinColumnName]);

  const parentRecordGqlFields = useMemo<RecordGqlFields>(
    () =>
      isDefined(parentJoinColumnName)
        ? { id: true, [parentJoinColumnName]: true }
        : { id: true },
    [parentJoinColumnName],
  );

  const {
    record: recordWithParent,
    loading: recordWithParentLoading,
    error: recordWithParentError,
  } = useFindOneRecord({
    objectNameSingular: objectMetadataItem.nameSingular,
    objectRecordId: recordId,
    recordGqlFields: parentRecordGqlFields,
    skip: !isParentMissingFromStore,
  });

  const junctionBridgeFilter = useJunctionBridgeFilterForRecord({
    ...junctionBridgeFilterParams,
    record: isParentMissingFromStore ? recordWithParent : recordStore,
  });

  const isParentUnresolved =
    isParentMissingFromStore &&
    (recordWithParentLoading || isDefined(recordWithParentError));

  return useMemo(
    () =>
      isParentUnresolved ? buildIdAllowlistFilter([]) : junctionBridgeFilter,
    [isParentUnresolved, junctionBridgeFilter],
  );
};
