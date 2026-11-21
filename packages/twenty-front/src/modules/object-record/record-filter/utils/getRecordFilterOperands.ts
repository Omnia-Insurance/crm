import {
  type FilterableAndTSVectorFieldType,
  RecordFilterOperand,
  RelationType,
} from 'twenty-shared/types';
import { getFilterOperandsForFilterableFieldType } from 'twenty-shared/utils';

export const getRecordFilterOperands = ({
  filterType,
  subFieldName,
  relationType,
}: {
  filterType: FilterableAndTSVectorFieldType;
  subFieldName?: string | null | undefined;
  relationType?: RelationType | null;
}): readonly RecordFilterOperand[] => {
  // OMNIA-CUSTOM: a one-to-many relation has no single related record to pick,
  // so without a target field it only filters on has any / has no
  if (filterType === 'RELATION' && relationType === RelationType.ONE_TO_MANY) {
    return [RecordFilterOperand.IS_EMPTY, RecordFilterOperand.IS_NOT_EMPTY];
  }

  return getFilterOperandsForFilterableFieldType({
    filterType,
    subFieldName,
  });
};
