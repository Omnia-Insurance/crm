import { computeRecordGqlOperationFilter } from '../computeRecordGqlOperationFilter';
import type { RecordFilter } from '../turnRecordFilterGroupIntoGqlOperationFilter';
import type { FieldShared } from '../turnRecordFilterIntoGqlOperationFilter';

import { FieldMetadataType } from '@/types/FieldMetadataType';
import type { PartialFieldMetadataItem } from '@/types/PartialFieldMetadataItem';
import { RelationType } from '@/types/RelationType';
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
        operand: ViewFilterOperand.IS,
      },
    ];

    const filter = computeRecordGqlOperationFilter({
      fieldMetadataItems: [companyIdField],
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

  // OMNIA-CUSTOM: one-to-many relation filters (traversal plus the canonical
  // "has any / has no" emptiness shapes).
  describe('one-to-many relation filters', () => {
    const policiesField: FieldShared = {
      id: 'policies-field',
      name: 'policies',
      label: 'Policies',
      type: FieldMetadataType.RELATION,
      settings: { relationType: RelationType.ONE_TO_MANY },
    };

    const policyStatusField: FieldShared = {
      id: 'policy-status-field',
      name: 'status',
      label: 'Status',
      type: FieldMetadataType.SELECT,
    };

    const companyField: FieldShared = {
      id: 'company-field',
      name: 'company',
      label: 'Company',
      type: FieldMetadataType.RELATION,
      settings: { relationType: RelationType.MANY_TO_ONE },
    };

    const computeFilter = (recordFilter: RecordFilter) =>
      computeRecordGqlOperationFilter({
        fieldMetadataItems: [policiesField, policyStatusField, companyField],
        recordFilters: [recordFilter],
        recordFilterGroups: [],
        filterValueDependencies: {
          timeZone: 'UTC',
        },
      });

    it('should traverse into the related records for a target field filter', () => {
      const filter = computeFilter({
        id: 'policy-status-filter',
        fieldMetadataId: policiesField.id,
        relationTargetFieldMetadataId: policyStatusField.id,
        value: '["submitted"]',
        operand: ViewFilterOperand.IS,
      });

      expect(filter).toEqual({
        policies: {
          status: {
            in: ['submitted'],
          },
        },
      });
    });

    it('should match records with at least one related record for IS_NOT_EMPTY', () => {
      const filter = computeFilter({
        id: 'has-policies-filter',
        fieldMetadataId: policiesField.id,
        value: '',
        operand: ViewFilterOperand.IS_NOT_EMPTY,
      });

      expect(filter).toEqual({
        policies: {
          id: {
            is: 'NOT_NULL',
          },
        },
      });
    });

    it('should match records without related records for IS_EMPTY', () => {
      const filter = computeFilter({
        id: 'has-no-policies-filter',
        fieldMetadataId: policiesField.id,
        value: '',
        operand: ViewFilterOperand.IS_EMPTY,
      });

      expect(filter).toEqual({
        not: {
          policies: {
            id: {
              is: 'NOT_NULL',
            },
          },
        },
      });
    });

    it('should keep the join column emptiness filter for many-to-one relations', () => {
      const filter = computeFilter({
        id: 'no-company-filter',
        fieldMetadataId: companyField.id,
        value: '',
        operand: ViewFilterOperand.IS_EMPTY,
      });

      expect(filter).toEqual({
        companyId: {
          is: 'NULL',
        },
      });
    });
  });
});
