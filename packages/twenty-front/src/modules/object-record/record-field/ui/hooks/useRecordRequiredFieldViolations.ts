import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { getRecordRequiredFieldViolations } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useStore } from 'jotai';
import { useCallback } from 'react';

export type { FieldViolation } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';

export const useRecordRequiredFieldViolations = ({
  objectNameSingular,
}: {
  objectNameSingular: string;
}) => {
  const store = useStore();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const getViolations = useCallback(
    (recordId: string) => {
      const record = store.get(recordStoreFamilyState.atomFamily(recordId));
      return getRecordRequiredFieldViolations(record, objectMetadataItem);
    },
    [objectMetadataItem, store],
  );

  return { getViolations };
};
