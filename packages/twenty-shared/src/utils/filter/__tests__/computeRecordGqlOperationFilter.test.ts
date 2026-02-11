import { computeRecordGqlOperationFilter } from '../computeRecordGqlOperationFilter';
import type { RecordFilter } from '../turnRecordFilterGroupIntoGqlOperationFilter';

import { FieldMetadataType } from '@/types/FieldMetadataType';
import type { PartialFieldMetadataItem } from '@/types/PartialFieldMetadataItem';
import { ViewFilterOperand } from '@/types/ViewFilterOperand';

describe('computeRecordGqlOperationFilter', () => {
  it('should match Is UUID', () => {
    const companyIdField: PartialFieldMetadataItem = {
      id: 'company-id-field',
      name: 'id',
      label: 'ID',
      type: FieldMetadataType.UUID,
    };

    const uuidValue = '4f83d5c0-7c7a-4f67-9f29-0a6aad1f4eb1';

    const recordFilters: RecordFilter[] = [
      {
        id: 'uuid-filter',
        fieldMetadataId: companyIdField.id,
        value: uuidValue,
        type: 'UUID',
        operand: ViewFilterOperand.IS,
      },
    ];

    const filter = computeRecordGqlOperationFilter({
      fields: [companyIdField],
      recordFilters,
      recordFilterGroups: [],
      filterValueDependencies: {
        timeZone: 'UTC',
      },
    });

    expect(filter).toEqual({
      id: {
        in: [uuidValue],
      },
    });
  });

  describe('ONE_TO_MANY relation sub-field filter', () => {
    const policiesField: PartialFieldMetadataItem = {
      id: 'policies-field',
      name: 'policies',
      label: 'Policies',
      type: FieldMetadataType.RELATION,
      relation: { type: 'ONE_TO_MANY' },
    };

    it('should generate nested GQL filter for SELECT sub-field with IS operand', () => {
      const recordFilters: RecordFilter[] = [
        {
          id: 'status-filter',
          fieldMetadataId: policiesField.id,
          value: '["submitted"]',
          type: 'SELECT',
          operand: ViewFilterOperand.IS,
          subFieldName: 'status',
        },
      ];

      const filter = computeRecordGqlOperationFilter({
        fields: [policiesField],
        recordFilters,
        recordFilterGroups: [],
        filterValueDependencies: {
          timeZone: 'UTC',
        },
      });

      expect(filter).toEqual({
        policies: {
          status: {
            in: ['submitted'],
          },
        },
      });
    });

    it('should generate nested GQL filter for TEXT sub-field with CONTAINS operand', () => {
      const recordFilters: RecordFilter[] = [
        {
          id: 'name-filter',
          fieldMetadataId: policiesField.id,
          value: 'test',
          type: 'TEXT',
          operand: ViewFilterOperand.CONTAINS,
          subFieldName: 'name',
        },
      ];

      const filter = computeRecordGqlOperationFilter({
        fields: [policiesField],
        recordFilters,
        recordFilterGroups: [],
        filterValueDependencies: {
          timeZone: 'UTC',
        },
      });

      expect(filter).toEqual({
        policies: {
          name: {
            ilike: '%test%',
          },
        },
      });
    });

    it('should generate nested GQL filter for NUMBER sub-field with GREATER_THAN_OR_EQUAL operand', () => {
      const recordFilters: RecordFilter[] = [
        {
          id: 'amount-filter',
          fieldMetadataId: policiesField.id,
          value: '1000',
          type: 'NUMBER',
          operand: ViewFilterOperand.GREATER_THAN_OR_EQUAL,
          subFieldName: 'amount',
        },
      ];

      const filter = computeRecordGqlOperationFilter({
        fields: [policiesField],
        recordFilters,
        recordFilterGroups: [],
        filterValueDependencies: {
          timeZone: 'UTC',
        },
      });

      expect(filter).toEqual({
        policies: {
          amount: {
            gte: 1000,
          },
        },
      });
    });

    it('should fall through to emptiness filter for IS_EMPTY operand even with subFieldName', () => {
      const recordFilters: RecordFilter[] = [
        {
          id: 'empty-filter',
          fieldMetadataId: policiesField.id,
          value: '',
          type: 'SELECT',
          operand: ViewFilterOperand.IS_EMPTY,
          subFieldName: 'status',
        },
      ];

      const filter = computeRecordGqlOperationFilter({
        fields: [policiesField],
        recordFilters,
        recordFilterGroups: [],
        filterValueDependencies: {
          timeZone: 'UTC',
        },
      });

      // IS_EMPTY on ONE_TO_MANY goes through emptiness filter path (existence check)
      expect(filter).toEqual({
        policies: {
          is: 'NULL',
        },
      });
    });

    it('should fall through to emptiness filter for IS_NOT_EMPTY operand even with subFieldName', () => {
      const recordFilters: RecordFilter[] = [
        {
          id: 'not-empty-filter',
          fieldMetadataId: policiesField.id,
          value: '',
          type: 'SELECT',
          operand: ViewFilterOperand.IS_NOT_EMPTY,
          subFieldName: 'status',
        },
      ];

      const filter = computeRecordGqlOperationFilter({
        fields: [policiesField],
        recordFilters,
        recordFilterGroups: [],
        filterValueDependencies: {
          timeZone: 'UTC',
        },
      });

      // IS_NOT_EMPTY on ONE_TO_MANY goes through emptiness filter path (negated NULL check)
      expect(filter).toEqual({
        not: {
          policies: {
            is: 'NULL',
          },
        },
      });
    });
  });
});
