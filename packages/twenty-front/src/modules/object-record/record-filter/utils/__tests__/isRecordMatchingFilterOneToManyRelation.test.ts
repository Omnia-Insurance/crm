import {
  RecordFilterOperand,
  type RecordGqlOperationFilter,
} from 'twenty-shared/types';
import { computeRecordGqlOperationFilter } from 'twenty-shared/utils';

import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { isRecordMatchingFilter } from '@/object-record/record-filter/utils/isRecordMatchingFilter';
import { mapViewFiltersToFilters } from '@/views/utils/mapViewFiltersToFilters';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();

const companyObjectMetadataItem = objectMetadataItems.find(
  (objectMetadataItem) => objectMetadataItem.nameSingular === 'company',
)!;

const personObjectMetadataItem = objectMetadataItems.find(
  (objectMetadataItem) => objectMetadataItem.nameSingular === 'person',
)!;

const peopleFieldMetadataItem = companyObjectMetadataItem.fields.find(
  (fieldMetadataItem) => fieldMetadataItem.name === 'people',
)!;

const personJobTitleFieldMetadataItem = personObjectMetadataItem.fields.find(
  (fieldMetadataItem) => fieldMetadataItem.name === 'jobTitle',
)!;

const COMPANY_ID = '20202020-171e-4bcc-9cf7-43448d6fb278';
const PERSON_ID = '20202020-2d40-4e49-8df4-9c6a049190ef';

const HAS_PEOPLE_FILTER = {
  people: { id: { is: 'NOT_NULL' } },
} as RecordGqlOperationFilter;

const HAS_NO_PEOPLE_FILTER = {
  not: HAS_PEOPLE_FILTER,
} as RecordGqlOperationFilter;

const buildCompanyWithPeopleConnection = (personIds: string[]) => ({
  id: COMPANY_ID,
  people: {
    __typename: 'PersonConnection',
    edges: personIds.map((id) => ({
      __typename: 'PersonEdge',
      node: { id },
    })),
  },
});

const isCompanyMatching = (
  record: Record<string, unknown>,
  filter: RecordGqlOperationFilter,
) =>
  isRecordMatchingFilter({
    record,
    filter,
    objectMetadataItem: companyObjectMetadataItem,
    objectMetadataItems,
  });

const computeCompanyFilter = (recordFilter: RecordFilter) =>
  computeRecordGqlOperationFilter({
    fieldMetadataItems: [
      ...companyObjectMetadataItem.fields,
      ...personObjectMetadataItem.fields,
    ],
    recordFilters: [recordFilter],
    recordFilterGroups: [],
    filterValueDependencies: { timeZone: 'UTC' },
  });

const buildPeopleFilter = (
  recordFilter: Pick<
    RecordFilter,
    'operand' | 'value' | 'relationTargetFieldMetadataId' | 'type'
  >,
): RecordFilter => ({
  id: 'people-filter',
  fieldMetadataId: peopleFieldMetadataItem.id,
  displayValue: '',
  label: peopleFieldMetadataItem.label,
  subFieldName: null,
  ...recordFilter,
});

describe('isRecordMatchingFilter on a one-to-many relation', () => {
  describe('has any', () => {
    it('matches a record holding related records', () => {
      expect(
        isCompanyMatching(
          { id: COMPANY_ID, people: [{ id: PERSON_ID }] },
          HAS_PEOPLE_FILTER,
        ),
      ).toBe(true);
      expect(
        isCompanyMatching(
          buildCompanyWithPeopleConnection([PERSON_ID]),
          HAS_PEOPLE_FILTER,
        ),
      ).toBe(true);
    });

    it('does not match a record without related records', () => {
      expect(
        isCompanyMatching({ id: COMPANY_ID, people: [] }, HAS_PEOPLE_FILTER),
      ).toBe(false);
      expect(
        isCompanyMatching(
          buildCompanyWithPeopleConnection([]),
          HAS_PEOPLE_FILTER,
        ),
      ).toBe(false);
      expect(
        isCompanyMatching({ id: COMPANY_ID, people: null }, HAS_PEOPLE_FILTER),
      ).toBe(false);
    });

    it('keeps a record whose related records are not loaded out', () => {
      expect(isCompanyMatching({ id: COMPANY_ID }, HAS_PEOPLE_FILTER)).toBe(
        false,
      );
    });
  });

  describe('has no', () => {
    it('matches a record without related records', () => {
      expect(
        isCompanyMatching({ id: COMPANY_ID, people: [] }, HAS_NO_PEOPLE_FILTER),
      ).toBe(true);
      expect(
        isCompanyMatching(
          buildCompanyWithPeopleConnection([]),
          HAS_NO_PEOPLE_FILTER,
        ),
      ).toBe(true);
      expect(
        isCompanyMatching(
          { id: COMPANY_ID, people: null },
          HAS_NO_PEOPLE_FILTER,
        ),
      ).toBe(true);
    });

    it('does not match a record holding related records', () => {
      expect(
        isCompanyMatching(
          { id: COMPANY_ID, people: [{ id: PERSON_ID }] },
          HAS_NO_PEOPLE_FILTER,
        ),
      ).toBe(false);
      expect(
        isCompanyMatching(
          buildCompanyWithPeopleConnection([PERSON_ID]),
          HAS_NO_PEOPLE_FILTER,
        ),
      ).toBe(false);
    });

    it('keeps a record whose related records are not loaded out', () => {
      expect(isCompanyMatching({ id: COMPANY_ID }, HAS_NO_PEOPLE_FILTER)).toBe(
        false,
      );
    });
  });

  describe('from a saved record filter', () => {
    it('serializes has any and has no to the shapes the matcher reads', () => {
      expect(
        computeCompanyFilter(
          buildPeopleFilter({
            type: 'RELATION',
            operand: RecordFilterOperand.IS_NOT_EMPTY,
            value: '',
            relationTargetFieldMetadataId: null,
          }),
        ),
      ).toEqual(HAS_PEOPLE_FILTER);
      expect(
        computeCompanyFilter(
          buildPeopleFilter({
            type: 'RELATION',
            operand: RecordFilterOperand.IS_EMPTY,
            value: '',
            relationTargetFieldMetadataId: null,
          }),
        ),
      ).toEqual(HAS_NO_PEOPLE_FILTER);
    });

    it('matches a target field filter when any related record does', () => {
      const filter = computeCompanyFilter(
        buildPeopleFilter({
          type: 'TEXT',
          operand: RecordFilterOperand.CONTAINS,
          value: 'Founder',
          relationTargetFieldMetadataId: personJobTitleFieldMetadataItem.id,
        }),
      );

      expect(
        isCompanyMatching(
          {
            id: COMPANY_ID,
            people: [
              { id: PERSON_ID, jobTitle: 'Engineer' },
              {
                id: '20202020-0000-4000-8000-000000000001',
                jobTitle: 'Founder',
              },
            ],
          },
          filter,
        ),
      ).toBe(true);
      expect(
        isCompanyMatching(
          { id: COMPANY_ID, people: [{ id: PERSON_ID, jobTitle: 'Engineer' }] },
          filter,
        ),
      ).toBe(false);
    });

    it('drops a legacy filter that kept the target field name in subFieldName', () => {
      const [legacyRecordFilter] = mapViewFiltersToFilters(
        [
          {
            id: 'legacy-people-filter',
            fieldMetadataId: peopleFieldMetadataItem.id,
            operand: RecordFilterOperand.IS,
            value: '["Founder"]',
            subFieldName: personJobTitleFieldMetadataItem.name,
            relationTargetFieldMetadataId: null,
          },
        ],
        companyObjectMetadataItem.fields,
      );

      expect(legacyRecordFilter.type).toBe('RELATION');
      expect(computeCompanyFilter(legacyRecordFilter)).toEqual({});
    });
  });
});
