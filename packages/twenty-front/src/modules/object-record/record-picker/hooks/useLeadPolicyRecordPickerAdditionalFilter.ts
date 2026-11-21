import { useMemo } from 'react';

import { useFindAllRecordPages } from '@/object-record/record-picker/hooks/useFindAllRecordPages';
import {
  type RecordGqlFields,
  type RecordGqlOperationFilter,
} from 'twenty-shared/types';
import { computeRelationGqlFieldJoinColumnName } from 'twenty-shared/utils';

// The search API rejects an empty `in`, so "no eligible record" matches a nil id
const EMPTY_RECORD_PICKER_RESULT_SENTINEL_ID =
  '00000000-0000-0000-0000-000000000000';

const ELIGIBLE_RECORD_GQL_FIELDS: RecordGqlFields = { id: true };

export const buildIdAllowlistFilter = (
  eligibleRecordIds: string[],
): RecordGqlOperationFilter => {
  if (eligibleRecordIds.length === 0) {
    return { id: { eq: EMPTY_RECORD_PICKER_RESULT_SENTINEL_ID } };
  }

  return { id: { in: eligibleRecordIds } };
};

export const buildRelationPickerEligibleRecordsFilter = ({
  inverseFieldName,
  recordId,
}: {
  inverseFieldName: string;
  recordId: string;
}): RecordGqlOperationFilter => {
  const joinColumnName = computeRelationGqlFieldJoinColumnName({
    name: inverseFieldName,
  });

  return {
    or: [
      { [joinColumnName]: { is: 'NULL' } },
      { [joinColumnName]: { eq: recordId } },
    ],
  };
};

// A policy is never re-pointed from another lead: the picker only offers
// policies without a lead or already on this one. The search API cannot filter
// on leadId, so the eligible ids are fetched up front and sent as an allowlist.
export const useLeadPolicyRecordPickerAdditionalFilter = ({
  recordId,
  inverseFieldName,
  relationObjectMetadataNameSingular,
}: {
  recordId: string;
  inverseFieldName: string;
  relationObjectMetadataNameSingular: string;
}) => {
  const isLeadPolicyRelation =
    relationObjectMetadataNameSingular === 'policy' &&
    inverseFieldName === 'lead';

  const eligibleRecordsFilter = useMemo(
    () =>
      buildRelationPickerEligibleRecordsFilter({ inverseFieldName, recordId }),
    [inverseFieldName, recordId],
  );

  // Every page, so this lead's own policies never drop out of the picked
  // search; past the page cap the list is cut, never widened
  const { records: eligiblePolicyRecords, loading } = useFindAllRecordPages({
    objectNameSingular: relationObjectMetadataNameSingular,
    filter: eligibleRecordsFilter,
    recordGqlFields: ELIGIBLE_RECORD_GQL_FIELDS,
    skip: !isLeadPolicyRelation,
  });

  const additionalFilter = useMemo(() => {
    if (!isLeadPolicyRelation) {
      return undefined;
    }

    return buildIdAllowlistFilter(
      eligiblePolicyRecords.map((record) => record.id),
    );
  }, [eligiblePolicyRecords, isLeadPolicyRelation]);

  return {
    additionalFilter,
    isLeadPolicyRelation,
    loading: isLeadPolicyRelation ? loading : false,
  };
};
