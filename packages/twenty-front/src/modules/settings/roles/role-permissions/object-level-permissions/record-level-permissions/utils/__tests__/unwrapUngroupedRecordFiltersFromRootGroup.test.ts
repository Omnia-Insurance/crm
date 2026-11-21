import {
  RecordFilterGroupLogicalOperator,
  ViewFilterOperand,
} from 'twenty-shared/types';

import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { unwrapUngroupedRecordFiltersFromRootGroup } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/unwrapUngroupedRecordFiltersFromRootGroup';

const ROOT_RECORD_FILTER_GROUP_ID = '20202020-a9e0-4b9e-8c1d-5f0e0a6b0700';

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
  recordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
  positionInRecordFilterGroup: null,
  ...overrides,
});

const buildRootRecordFilterGroup = (
  logicalOperator = RecordFilterGroupLogicalOperator.AND,
): RecordFilterGroup => ({
  id: ROOT_RECORD_FILTER_GROUP_ID,
  parentRecordFilterGroupId: null,
  logicalOperator,
  positionInRecordFilterGroup: null,
});

const hopRecordFilter = buildRecordFilter();

const newRecordFilter = buildRecordFilter({
  id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0712',
  label: 'Name',
  positionInRecordFilterGroup: 1,
});

const UNGROUPED_RECORD_FILTERS_ROOT_GROUP = {
  recordFilterGroupId: ROOT_RECORD_FILTER_GROUP_ID,
  recordFilterIds: [hopRecordFilter.id],
};

describe('unwrapUngroupedRecordFiltersFromRootGroup', () => {
  it('stores the loaded rows without a group while they are unchanged', () => {
    expect(
      unwrapUngroupedRecordFiltersFromRootGroup({
        recordFilters: [hopRecordFilter],
        recordFilterGroups: [buildRootRecordFilterGroup()],
        ungroupedRecordFiltersRootGroup: UNGROUPED_RECORD_FILTERS_ROOT_GROUP,
      }),
    ).toEqual({
      recordFilters: [{ ...hopRecordFilter, recordFilterGroupId: undefined }],
      recordFilterGroups: [],
    });
  });

  it('stores the group once a new row joins it, so both rows stay one rule', () => {
    const recordFilters = [hopRecordFilter, newRecordFilter];
    const recordFilterGroups = [buildRootRecordFilterGroup()];

    expect(
      unwrapUngroupedRecordFiltersFromRootGroup({
        recordFilters,
        recordFilterGroups,
        ungroupedRecordFiltersRootGroup: UNGROUPED_RECORD_FILTERS_ROOT_GROUP,
      }),
    ).toEqual({ recordFilters, recordFilterGroups });
  });

  it('stores the group once its rows are OR-ed', () => {
    const recordFilterGroups = [
      buildRootRecordFilterGroup(RecordFilterGroupLogicalOperator.OR),
    ];

    expect(
      unwrapUngroupedRecordFiltersFromRootGroup({
        recordFilters: [hopRecordFilter],
        recordFilterGroups,
        ungroupedRecordFiltersRootGroup: UNGROUPED_RECORD_FILTERS_ROOT_GROUP,
      }),
    ).toEqual({ recordFilters: [hopRecordFilter], recordFilterGroups });
  });

  it('stores the rows without a group again once the new row is removed', () => {
    const otherObjectRecordFilterGroup: RecordFilterGroup = {
      id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0702',
      parentRecordFilterGroupId: null,
      logicalOperator: RecordFilterGroupLogicalOperator.OR,
    };

    expect(
      unwrapUngroupedRecordFiltersFromRootGroup({
        recordFilters: [hopRecordFilter],
        recordFilterGroups: [
          otherObjectRecordFilterGroup,
          buildRootRecordFilterGroup(),
        ],
        ungroupedRecordFiltersRootGroup: UNGROUPED_RECORD_FILTERS_ROOT_GROUP,
      }),
    ).toEqual({
      recordFilters: [{ ...hopRecordFilter, recordFilterGroupId: undefined }],
      recordFilterGroups: [otherObjectRecordFilterGroup],
    });
  });

  it('keeps groups built in the builder as they are', () => {
    const recordFilters = [newRecordFilter];
    const recordFilterGroups = [buildRootRecordFilterGroup()];

    expect(
      unwrapUngroupedRecordFiltersFromRootGroup({
        recordFilters,
        recordFilterGroups,
      }),
    ).toEqual({ recordFilters, recordFilterGroups });
  });
});
