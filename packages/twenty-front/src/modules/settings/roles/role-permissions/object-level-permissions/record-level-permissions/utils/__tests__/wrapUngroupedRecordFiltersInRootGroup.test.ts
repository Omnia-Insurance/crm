import {
  RecordFilterGroupLogicalOperator,
  ViewFilterOperand,
} from 'twenty-shared/types';

import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { wrapUngroupedRecordFiltersInRootGroup } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/wrapUngroupedRecordFiltersInRootGroup';

const ROOT_RECORD_FILTER_GROUP_ID = '20202020-a9e0-4b9e-8c1d-5f0e0a6b0700';
const STORED_RECORD_FILTER_GROUP_ID = '20202020-a9e0-4b9e-8c1d-5f0e0a6b0701';

const buildRecordFilter = (
  overrides: Partial<RecordFilter> = {},
): RecordFilter => ({
  id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0710',
  fieldMetadataId: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0711',
  value: '',
  displayValue: '',
  type: 'RELATION',
  operand: ViewFilterOperand.IS,
  label: 'Agent',
  positionInRecordFilterGroup: null,
  ...overrides,
});

const STORED_ROOT_RECORD_FILTER_GROUP: RecordFilterGroup = {
  id: STORED_RECORD_FILTER_GROUP_ID,
  parentRecordFilterGroupId: null,
  logicalOperator: RecordFilterGroupLogicalOperator.AND,
  positionInRecordFilterGroup: null,
};

describe('wrapUngroupedRecordFiltersInRootGroup', () => {
  it('puts rows stored without a group under one AND root group', () => {
    const hopRecordFilter = buildRecordFilter();
    const nameRecordFilter = buildRecordFilter({
      id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0712',
      label: 'Name',
    });

    expect(
      wrapUngroupedRecordFiltersInRootGroup({
        recordFilters: [hopRecordFilter, nameRecordFilter],
        recordFilterGroups: [],
        rootRecordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
      }),
    ).toEqual({
      recordFilters: [
        {
          ...hopRecordFilter,
          recordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
        },
        {
          ...nameRecordFilter,
          recordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
        },
      ],
      recordFilterGroups: [
        {
          id: ROOT_RECORD_FILTER_GROUP_ID,
          parentRecordFilterGroupId: null,
          logicalOperator: RecordFilterGroupLogicalOperator.AND,
          positionInRecordFilterGroup: null,
        },
      ],
      ungroupedRecordFiltersRootGroup: {
        recordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
        recordFilterIds: [hopRecordFilter.id, nameRecordFilter.id],
      },
    });
  });

  it('leaves rows that already sit in a root group as they are', () => {
    const recordFilters = [
      buildRecordFilter({ recordFilterGroupId: STORED_RECORD_FILTER_GROUP_ID }),
    ];

    expect(
      wrapUngroupedRecordFiltersInRootGroup({
        recordFilters,
        recordFilterGroups: [STORED_ROOT_RECORD_FILTER_GROUP],
        rootRecordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
      }),
    ).toEqual({
      recordFilters,
      recordFilterGroups: [STORED_ROOT_RECORD_FILTER_GROUP],
    });
  });

  it('never merges rows stored without a group into another rule', () => {
    const recordFilters = [
      buildRecordFilter(),
      buildRecordFilter({
        id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0712',
        recordFilterGroupId: STORED_RECORD_FILTER_GROUP_ID,
      }),
    ];

    expect(
      wrapUngroupedRecordFiltersInRootGroup({
        recordFilters,
        recordFilterGroups: [STORED_ROOT_RECORD_FILTER_GROUP],
        rootRecordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
      }),
    ).toEqual({
      recordFilters,
      recordFilterGroups: [STORED_ROOT_RECORD_FILTER_GROUP],
    });
  });

  it('adds no group to an object without rows', () => {
    expect(
      wrapUngroupedRecordFiltersInRootGroup({
        recordFilters: [],
        recordFilterGroups: [],
        rootRecordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
      }),
    ).toEqual({ recordFilters: [], recordFilterGroups: [] });
  });
});
