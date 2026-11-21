import { getRecordFilterOperands } from '@/object-record/record-filter/utils/getRecordFilterOperands';
import {
  type FilterableAndTSVectorFieldType,
  RecordFilterOperand,
  RelationType,
} from 'twenty-shared/types';

const filterTypesWithoutSubField: FilterableAndTSVectorFieldType[] = [
  'TEXT',
  'EMAILS',
  'FULL_NAME',
  'ADDRESS',
  'LINKS',
  'PHONES',
  'NUMBER',
  'RAW_JSON',
  'FILES',
  'DATE_TIME',
  'DATE',
  'RATING',
  'RELATION',
  'MULTI_SELECT',
  'SELECT',
  'ARRAY',
  'BOOLEAN',
  'UUID',
  'TS_VECTOR',
];

describe('getRecordFilterOperands', () => {
  it.each(filterTypesWithoutSubField)(
    'returns the expected operands for filterType=%s',
    (filterType) => {
      const operands = getRecordFilterOperands({
        filterType,
        subFieldName: undefined,
      });

      expect(operands).toMatchSnapshot();
    },
  );

  describe('CURRENCY', () => {
    it('returns currencyCode operands when subFieldName is currencyCode', () => {
      const operands = getRecordFilterOperands({
        filterType: 'CURRENCY',
        subFieldName: 'currencyCode',
      });

      expect(operands).toMatchSnapshot();
    });

    it('returns amountMicros operands when subFieldName is amountMicros', () => {
      const operands = getRecordFilterOperands({
        filterType: 'CURRENCY',
        subFieldName: 'amountMicros',
      });

      expect(operands).toMatchSnapshot();
    });

    it('returns amountMicros operands when subFieldName is undefined', () => {
      const operands = getRecordFilterOperands({
        filterType: 'CURRENCY',
        subFieldName: undefined,
      });

      expect(operands).toMatchSnapshot();
    });
  });

  describe('ACTOR', () => {
    it('returns IS/IS_NOT operands when subFieldName is source (actor source subField)', () => {
      const operands = getRecordFilterOperands({
        filterType: 'ACTOR',
        subFieldName: 'source',
      });

      expect(operands).toMatchSnapshot();
    });

    it('returns IS/IS_NOT operands when subFieldName is workspaceMemberId (actor wsMember subField)', () => {
      const operands = getRecordFilterOperands({
        filterType: 'ACTOR',
        subFieldName: 'workspaceMemberId',
      });

      expect(operands).toMatchSnapshot();
    });

    it('returns ACTOR (text-like) operands when subFieldName is undefined', () => {
      const operands = getRecordFilterOperands({
        filterType: 'ACTOR',
        subFieldName: undefined,
      });

      expect(operands).toMatchSnapshot();
    });
  });

  // OMNIA-CUSTOM: one-to-many relation filters without a target field
  describe('RELATION with a relation type', () => {
    it('returns only emptiness operands for a one-to-many relation', () => {
      expect(
        getRecordFilterOperands({
          filterType: 'RELATION',
          relationType: RelationType.ONE_TO_MANY,
        }),
      ).toEqual([
        RecordFilterOperand.IS_EMPTY,
        RecordFilterOperand.IS_NOT_EMPTY,
      ]);
    });

    it('ignores a target field name left in subFieldName by legacy filters', () => {
      expect(
        getRecordFilterOperands({
          filterType: 'RELATION',
          subFieldName: 'status',
          relationType: RelationType.ONE_TO_MANY,
        }),
      ).toEqual([
        RecordFilterOperand.IS_EMPTY,
        RecordFilterOperand.IS_NOT_EMPTY,
      ]);
    });

    it('keeps the relation operands for a many-to-one relation', () => {
      expect(
        getRecordFilterOperands({
          filterType: 'RELATION',
          relationType: RelationType.MANY_TO_ONE,
        }),
      ).toEqual(getRecordFilterOperands({ filterType: 'RELATION' }));
    });

    it('does not restrict a field reached through a one-to-many relation', () => {
      expect(
        getRecordFilterOperands({
          filterType: 'SELECT',
          relationType: RelationType.ONE_TO_MANY,
        }),
      ).toEqual(getRecordFilterOperands({ filterType: 'SELECT' }));
    });
  });
});
