import {
  type FilterableAndTSVectorFieldType,
  ViewFilterOperand as RecordFilterOperand,
} from 'twenty-shared/types';
import { getFilterOperandsForFilterableFieldType } from 'twenty-shared/utils';

export const getRecordFilterOperands = ({
  filterType,
  subFieldName,
  relationType,
}: {
  filterType: FilterableAndTSVectorFieldType;
  subFieldName?: string | null | undefined;
  relationType?: string | null | undefined;
}): readonly RecordFilterOperand[] => {
  // OMNIA-CUSTOM: ONE_TO_MANY relations only support is-empty / is-not-empty,
  // since you cannot pick a specific related record on the "many" side.
  if (filterType === 'RELATION' && relationType === 'ONE_TO_MANY') {
    return [RecordFilterOperand.IS_EMPTY, RecordFilterOperand.IS_NOT_EMPTY];
  }

  return getFilterOperandsForFilterableFieldType({
    filterType,
    subFieldName,
  });
};
