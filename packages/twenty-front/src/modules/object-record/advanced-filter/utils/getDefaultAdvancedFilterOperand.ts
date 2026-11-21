import { getRecordFilterOperands } from '@/object-record/record-filter/utils/getRecordFilterOperands';
import {
  type FilterableAndTSVectorFieldType,
  RecordFilterOperand,
  type RelationType,
} from 'twenty-shared/types';

export const getDefaultAdvancedFilterOperand = ({
  filterType,
  subFieldName,
  relationType,
}: {
  filterType: FilterableAndTSVectorFieldType;
  subFieldName?: string | null;
  // OMNIA-CUSTOM: one-to-many relation filters only offer emptiness operands
  relationType?: RelationType | null;
}): RecordFilterOperand => {
  const availableOperands = getRecordFilterOperands({
    filterType,
    subFieldName,
    relationType,
  });

  const isDateFilterType = filterType === 'DATE' || filterType === 'DATE_TIME';

  if (
    isDateFilterType &&
    availableOperands.includes(RecordFilterOperand.IS_RELATIVE)
  ) {
    return RecordFilterOperand.IS_RELATIVE;
  }

  return availableOperands[0];
};
