import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { RecordFilterGroupLogicalOperator } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type RecordFilterGroup } from '@/object-record/record-filter-group/types/RecordFilterGroup';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { useRecordLevelPermissionSyncToDraftRole } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/hooks/useRecordLevelPermissionSyncToDraftRole';
import { convertPredicateToRecordFilter } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/recordLevelPermissionPredicateConversion';
import { type UngroupedRecordFiltersRootGroup } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/wrapUngroupedRecordFiltersInRootGroup';
import {
  AGENT_PROFILE_MANAGER_FIELD_METADATA_ID,
  AGENT_PROFILE_OBJECT_METADATA_ITEM,
  buildPolicyAgentHopPredicate,
  buildPolicyNamePredicate,
  buildTestDraftRole,
  POLICY_AGENT_FIELD_METADATA_ID,
  POLICY_NAME_FIELD_METADATA_ID,
  POLICY_OBJECT_METADATA_ITEM,
  TEST_ROLE_ID,
  TEST_ROOT_PREDICATE_GROUP,
  TEST_ROOT_PREDICATE_GROUP_ID,
  WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/workspaceMemberHopTestMetadata';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import {
  type RowLevelPermissionPredicate,
  type RowLevelPermissionPredicateGroup,
} from '~/generated-metadata/graphql';
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

const otherObjectPredicate = buildPolicyNamePredicate({
  id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0204',
  objectMetadataId: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0999',
});

const ROW_LEVEL_PERMISSION_RULES: RoleWithPartialMembers['rowLevelPermissionRules'] =
  [
    {
      __typename: 'RowLevelPermissionRule',
      id: '20202020-a9e0-4b9e-8c1d-5f0e0a6b0500',
      objectMetadataId: POLICY_OBJECT_METADATA_ITEM.id,
      canCreateRecords: true,
      canReadRecords: false,
      canUpdateRecords: true,
      canSoftDeleteRecords: false,
      canDestroyRecords: false,
    },
  ];

const ROOT_RECORD_FILTER_GROUPS: RecordFilterGroup[] = [
  {
    id: TEST_ROOT_PREDICATE_GROUP_ID,
    parentRecordFilterGroupId: null,
    logicalOperator: RecordFilterGroupLogicalOperator.AND,
    positionInRecordFilterGroup: null,
  },
];

const getPolicyFieldOrThrow = (fieldMetadataId: string) => {
  const fieldMetadataItem = POLICY_OBJECT_METADATA_ITEM.fields.find(
    (field) => field.id === fieldMetadataId,
  );

  if (!isDefined(fieldMetadataItem)) {
    throw new Error(`Missing policy field ${fieldMetadataId}`);
  }

  return fieldMetadataItem;
};

const toRecordFilterOrThrow = (
  predicate: RowLevelPermissionPredicate,
  fieldMetadataId: string,
): RecordFilter => {
  const recordFilter = convertPredicateToRecordFilter(
    predicate,
    getPolicyFieldOrThrow(fieldMetadataId),
  );

  if (!isDefined(recordFilter)) {
    throw new Error(`Predicate ${predicate.id} did not load`);
  }

  return recordFilter;
};

const renderSync = ({
  predicates,
  currentRecordFilters,
  currentRecordFilterGroups = ROOT_RECORD_FILTER_GROUPS,
  rowLevelPermissionPredicateGroups = [TEST_ROOT_PREDICATE_GROUP],
  ungroupedRecordFiltersRootGroup,
}: {
  predicates: RowLevelPermissionPredicate[];
  currentRecordFilters: RecordFilter[];
  currentRecordFilterGroups?: RecordFilterGroup[];
  rowLevelPermissionPredicateGroups?: RowLevelPermissionPredicateGroup[];
  ungroupedRecordFiltersRootGroup?: UngroupedRecordFiltersRootGroup;
}) => {
  const store = createStore();

  setTestObjectMetadataItemsInMetadataStore(store, [
    ...getTestEnrichedObjectMetadataItemsMock(),
    AGENT_PROFILE_OBJECT_METADATA_ITEM,
    POLICY_OBJECT_METADATA_ITEM,
  ]);

  store.set(
    settingsDraftRoleFamilyState.atomFamily(TEST_ROLE_ID),
    buildTestDraftRole({
      rowLevelPermissionPredicates: predicates,
      rowLevelPermissionPredicateGroups,
      rowLevelPermissionRules: ROW_LEVEL_PERMISSION_RULES,
    }),
  );

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  const { result } = renderHook(
    () =>
      useRecordLevelPermissionSyncToDraftRole({
        roleId: TEST_ROLE_ID,
        objectMetadataItem: POLICY_OBJECT_METADATA_ITEM,
        currentRecordFilters,
        currentRecordFilterGroups,
        hasInitialized: true,
        ungroupedRecordFiltersRootGroup,
      }),
    { wrapper: Wrapper },
  );

  const getDraftRole = () =>
    store.get(settingsDraftRoleFamilyState.atomFamily(TEST_ROLE_ID));

  return { result, getDraftRole };
};

const findPredicate = (draftRole: RoleWithPartialMembers, id: string) =>
  (draftRole.rowLevelPermissionPredicates ?? []).filter(
    (predicate) => predicate.id === id,
  );

describe('useRecordLevelPermissionSyncToDraftRole', () => {
  const predicates = [
    otherObjectPredicate,
    namePredicate,
    hopPredicate,
    managerHopPredicate,
  ];

  const loadedRecordFilters = [
    toRecordFilterOrThrow(namePredicate, POLICY_NAME_FIELD_METADATA_ID),
    toRecordFilterOrThrow(hopPredicate, POLICY_AGENT_FIELD_METADATA_ID),
  ];

  it('replaces the C2 hop with its row instead of keeping a second copy', () => {
    const { result, getDraftRole } = renderSync({
      predicates,
      currentRecordFilters: loadedRecordFilters,
    });

    act(() => {
      result.current.syncToDraftRole();
    });

    expect(findPredicate(getDraftRole(), hopPredicate.id)).toEqual([
      hopPredicate,
    ]);
  });

  it('preserves other objects and other hops exactly', () => {
    const { getDraftRole } = renderSync({
      predicates,
      currentRecordFilters: loadedRecordFilters,
    });

    const draftPredicates = getDraftRole().rowLevelPermissionPredicates ?? [];

    expect(draftPredicates).toContain(otherObjectPredicate);
    expect(draftPredicates).toContain(managerHopPredicate);
    expect(draftPredicates).toHaveLength(predicates.length);
  });

  it('drops the hop when its row is removed and keeps the other hop', () => {
    const { getDraftRole } = renderSync({
      predicates,
      currentRecordFilters: [loadedRecordFilters[0]],
    });

    expect(findPredicate(getDraftRole(), hopPredicate.id)).toEqual([]);
    expect(getDraftRole().rowLevelPermissionPredicates).toContain(
      managerHopPredicate,
    );
  });

  it('rewrites a legacy policy.agent = workspaceMember.id row as the C2 hop', () => {
    const legacyPredicate = buildPolicyAgentHopPredicate({
      relationFieldMetadataId: null,
      fieldMetadataId: POLICY_AGENT_FIELD_METADATA_ID,
      workspaceMemberFieldMetadataId: WORKSPACE_MEMBER_ID_FIELD_METADATA_ID,
      rowLevelPermissionPredicateGroupId: TEST_ROOT_PREDICATE_GROUP_ID,
      positionInRowLevelPermissionPredicateGroup: 1,
    });

    const { getDraftRole } = renderSync({
      predicates: [legacyPredicate],
      currentRecordFilters: [
        toRecordFilterOrThrow(legacyPredicate, POLICY_AGENT_FIELD_METADATA_ID),
      ],
    });

    expect(findPredicate(getDraftRole(), legacyPredicate.id)).toEqual([
      hopPredicate,
    ]);
  });

  it('settles when the component also reads the draft', () => {
    const store = createStore();

    setTestObjectMetadataItemsInMetadataStore(store, [
      ...getTestEnrichedObjectMetadataItemsMock(),
      AGENT_PROFILE_OBJECT_METADATA_ITEM,
      POLICY_OBJECT_METADATA_ITEM,
    ]);
    store.set(
      settingsDraftRoleFamilyState.atomFamily(TEST_ROLE_ID),
      buildTestDraftRole({ rowLevelPermissionPredicates: predicates }),
    );

    let renderCount = 0;

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );

    renderHook(
      () => {
        renderCount += 1;

        useAtomFamilyStateValue(settingsDraftRoleFamilyState, TEST_ROLE_ID);

        useRecordLevelPermissionSyncToDraftRole({
          roleId: TEST_ROLE_ID,
          objectMetadataItem: POLICY_OBJECT_METADATA_ITEM,
          currentRecordFilters: loadedRecordFilters,
          currentRecordFilterGroups: ROOT_RECORD_FILTER_GROUPS,
          hasInitialized: true,
        });
      },
      { wrapper: Wrapper },
    );

    expect(renderCount).toBeLessThan(5);
    expect(
      findPredicate(
        store.get(settingsDraftRoleFamilyState.atomFamily(TEST_ROLE_ID)),
        hopPredicate.id,
      ),
    ).toEqual([hopPredicate]);
  });

  it('never changes the record-level rules', () => {
    const { getDraftRole } = renderSync({
      predicates,
      currentRecordFilters: loadedRecordFilters,
    });

    expect(getDraftRole().rowLevelPermissionRules).toBe(
      ROW_LEVEL_PERMISSION_RULES,
    );
  });

  it('stores the rows of the root group added for a hop stored without a group without one', () => {
    const ungroupedHopPredicate = buildPolicyAgentHopPredicate();
    const ungroupedRootRecordFilterGroupId =
      '20202020-a9e0-4b9e-8c1d-5f0e0a6b0301';

    const { getDraftRole } = renderSync({
      predicates: [otherObjectPredicate, ungroupedHopPredicate],
      rowLevelPermissionPredicateGroups: [],
      currentRecordFilters: [
        {
          ...toRecordFilterOrThrow(
            ungroupedHopPredicate,
            POLICY_AGENT_FIELD_METADATA_ID,
          ),
          recordFilterGroupId: ungroupedRootRecordFilterGroupId,
        },
      ],
      currentRecordFilterGroups: [
        {
          id: ungroupedRootRecordFilterGroupId,
          parentRecordFilterGroupId: null,
          logicalOperator: RecordFilterGroupLogicalOperator.AND,
          positionInRecordFilterGroup: null,
        },
      ],
      ungroupedRecordFiltersRootGroup: {
        recordFilterGroupId: ungroupedRootRecordFilterGroupId,
        recordFilterIds: [ungroupedHopPredicate.id],
      },
    });

    expect(getDraftRole().rowLevelPermissionPredicates).toEqual([
      otherObjectPredicate,
      ungroupedHopPredicate,
    ]);
    expect(getDraftRole().rowLevelPermissionPredicateGroups).toEqual([]);
  });
});
