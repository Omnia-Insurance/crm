import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { RecordFilterGroupLogicalOperator } from 'twenty-shared/types';

import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { useRecordLevelPermissionFilterInitialization } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionFilterInitialization';
import {
  AGENT_PROFILE_MANAGER_FIELD_METADATA_ID,
  AGENT_PROFILE_OBJECT_METADATA_ITEM,
  buildPolicyAgentHopPredicate,
  buildPolicyNamePredicate,
  buildTestDraftRole,
  POLICY_AGENT_FIELD_METADATA_ID,
  POLICY_OBJECT_METADATA_ITEM,
  TEST_ROLE_ID,
  TEST_ROOT_PREDICATE_GROUP,
  TEST_ROOT_PREDICATE_GROUP_ID,
  WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/workspaceMemberHopTestMetadata';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { RowLevelPermissionPredicateOperand } from '~/generated-metadata/graphql';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';

const namePredicate = buildPolicyNamePredicate({
  rowLevelPermissionPredicateGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
  positionInRowLevelPermissionPredicateGroup: 0,
});

const hopPredicate = buildPolicyAgentHopPredicate({
  rowLevelPermissionPredicateGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
  positionInRowLevelPermissionPredicateGroup: 1,
});

const managerHopPredicate = buildPolicyAgentHopPredicate({
  id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0202',
  fieldMetadataId: AGENT_PROFILE_MANAGER_FIELD_METADATA_ID,
  rowLevelPermissionPredicateGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
  positionInRowLevelPermissionPredicateGroup: 2,
});

const renderInitialization = ({
  rowLevelPermissionPredicates = [
    namePredicate,
    hopPredicate,
    managerHopPredicate,
  ],
  rowLevelPermissionPredicateGroups = [TEST_ROOT_PREDICATE_GROUP],
}: Pick<
  Partial<RoleWithPartialMembers>,
  'rowLevelPermissionPredicates' | 'rowLevelPermissionPredicateGroups'
> = {}) => {
  const store = createStore();

  setTestObjectMetadataItemsInMetadataStore(store, [
    ...getTestEnrichedObjectMetadataItemsMock(),
    AGENT_PROFILE_OBJECT_METADATA_ITEM,
    POLICY_OBJECT_METADATA_ITEM,
  ]);

  const setCurrentRecordFilters = jest.fn();
  const setCurrentRecordFilterGroups = jest.fn();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  const { result } = renderHook(
    () =>
      useRecordLevelPermissionFilterInitialization({
        roleId: TEST_ROLE_ID,
        objectMetadataItem: POLICY_OBJECT_METADATA_ITEM,
        settingsDraftRole: buildTestDraftRole({
          rowLevelPermissionPredicates,
          rowLevelPermissionPredicateGroups,
        }),
        filterableFieldMetadataItems: POLICY_OBJECT_METADATA_ITEM.fields,
        setCurrentRecordFilters,
        setCurrentRecordFilterGroups,
        setRecordFilterUsedInAdvancedFilterDropdownRow: jest.fn(),
      }),
    { wrapper: Wrapper },
  );

  const loadedRecordFilters: RecordFilter[] =
    setCurrentRecordFilters.mock.calls[0][0];
  const loadedRecordFilterGroups: RecordFilterGroup[] =
    setCurrentRecordFilterGroups.mock.calls[0][0];

  return {
    loadedRecordFilters,
    loadedRecordFilterGroups,
    setCurrentRecordFilterGroups,
    result,
  };
};

describe('useRecordLevelPermissionFilterInitialization', () => {
  it('shows the C2 hop as an editable "Agent is Me" row', () => {
    const { loadedRecordFilters } = renderInitialization();

    expect(
      loadedRecordFilters.find((filter) => filter.id === hopPredicate.id),
    ).toMatchObject({
      fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
      label: 'Agent',
      operand: RowLevelPermissionPredicateOperand.IS,
      recordFilterGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
      rlsDynamicValue: {
        workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
      },
    });
  });

  it('keeps every other hop out of the builder', () => {
    const { loadedRecordFilters } = renderInitialization();

    expect(loadedRecordFilters.map((filter) => filter.id)).toEqual([
      namePredicate.id,
      hopPredicate.id,
    ]);
  });

  it('loads the root group that holds the rows', () => {
    const { setCurrentRecordFilterGroups } = renderInitialization();

    expect(setCurrentRecordFilterGroups).toHaveBeenCalledWith([
      expect.objectContaining({
        id: TEST_ROOT_PREDICATE_GROUP_ID,
        logicalOperator: RecordFilterGroupLogicalOperator.AND,
      }),
    ]);
  });

  it('shows a C2 hop stored without a group as the only row of a root group', () => {
    const ungroupedHopPredicate = buildPolicyAgentHopPredicate();

    const { loadedRecordFilters, loadedRecordFilterGroups, result } =
      renderInitialization({
        rowLevelPermissionPredicates: [ungroupedHopPredicate],
        rowLevelPermissionPredicateGroups: [],
      });

    const [rootRecordFilterGroup] = loadedRecordFilterGroups;

    expect(loadedRecordFilterGroups).toEqual([
      {
        id: expect.any(String),
        parentRecordFilterGroupId: null,
        logicalOperator: RecordFilterGroupLogicalOperator.AND,
        positionInRecordFilterGroup: null,
      },
    ]);
    expect(loadedRecordFilters).toEqual([
      expect.objectContaining({
        id: ungroupedHopPredicate.id,
        fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
        recordFilterGroupId: rootRecordFilterGroup.id,
      }),
    ]);
    expect(result.current.ungroupedRecordFiltersRootGroup).toEqual({
      recordFilterGroupId: rootRecordFilterGroup.id,
      recordFilterIds: [ungroupedHopPredicate.id],
    });
  });

  it('adds no root group to rows that already have one', () => {
    const { result } = renderInitialization();

    expect(result.current.ungroupedRecordFiltersRootGroup).toBeUndefined();
  });
});
