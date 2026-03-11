import { useMemo } from 'react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type ObjectRecordFilterInput } from '~/generated/graphql';

const EMPTY_RECORD_PICKER_RESULT_SENTINEL_ID =
  '00000000-0000-0000-0000-000000000000';

const POLICY_RECORD_PICKER_ELIGIBLE_RECORDS_LIMIT = 20000;

export const buildIdAllowlistFilter = (
  eligibleRecordIds: string[],
): ObjectRecordFilterInput => {
  if (eligibleRecordIds.length === 0) {
    return {
      id: { eq: EMPTY_RECORD_PICKER_RESULT_SENTINEL_ID },
    } as ObjectRecordFilterInput;
  }

  return { id: { in: eligibleRecordIds } } as ObjectRecordFilterInput;
};

export const buildRelationPickerEligibleRecordsFilter = ({
  inverseFieldName,
  recordId,
}: {
  inverseFieldName: string;
  recordId: string;
}) => {
  return {
    or: [
      { [`${inverseFieldName}Id`]: { is: 'NULL' } },
      { [`${inverseFieldName}Id`]: { eq: recordId } },
    ],
  };
};

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

  const { records: eligiblePolicyRecords, loading } = useFindManyRecords({
    objectNameSingular: relationObjectMetadataNameSingular,
    filter: buildRelationPickerEligibleRecordsFilter({
      inverseFieldName,
      recordId,
    }),
    recordGqlFields: { id: true },
    skip: !isLeadPolicyRelation,
    // OMNIA-CUSTOM: only IDs are fetched here so the higher limit is safe.
    limit: POLICY_RECORD_PICKER_ELIGIBLE_RECORDS_LIMIT,
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
