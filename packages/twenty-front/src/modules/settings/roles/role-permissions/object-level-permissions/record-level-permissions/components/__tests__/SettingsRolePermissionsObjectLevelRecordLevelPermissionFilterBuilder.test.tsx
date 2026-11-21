import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilder } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilder';
import {
  AGENT_PROFILE_OBJECT_METADATA_ITEM,
  buildPolicyAgentHopPredicate,
  buildTestDraftRole,
  POLICY_OBJECT_METADATA_ITEM,
  TEST_ROLE_ID,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/__tests__/workspaceMemberHopTestMetadata';
import { getRoleDirtyFields } from '@/settings/roles/role/utils/getRoleDirtyFields';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { RowLevelPermissionPredicateGroupLogicalOperator } from '~/generated-metadata/graphql';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';

// As W1 and the Brokerage app write it (contract C2): one predicate, no group
const ungroupedHopPredicate = buildPolicyAgentHopPredicate();

const persistedRole = buildTestDraftRole({
  rowLevelPermissionPredicates: [ungroupedHopPredicate],
});

const renderFilterBuilder = (role: RoleWithPartialMembers) => {
  const store = createStore();
  const draftRoleAtom = settingsDraftRoleFamilyState.getAtom(
    TEST_ROLE_ID,
    null,
  );

  setTestObjectMetadataItemsInMetadataStore(store, [
    ...getTestEnrichedObjectMetadataItemsMock(),
    AGENT_PROFILE_OBJECT_METADATA_ITEM,
    POLICY_OBJECT_METADATA_ITEM,
  ]);
  store.set(draftRoleAtom, role);

  render(
    <JotaiProvider store={store}>
      <MockedProvider>
        <SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilder
          roleId={TEST_ROLE_ID}
          objectMetadataItem={POLICY_OBJECT_METADATA_ITEM}
        />
      </MockedProvider>
    </JotaiProvider>,
  );

  return { getDraftRole: () => store.get(draftRoleAtom) };
};

describe('SettingsRolePermissionsObjectLevelRecordLevelPermissionFilterBuilder', () => {
  it('shows a C2 hop stored without a group as one editable "Agent is Me" row', () => {
    renderFilterBuilder(persistedRole);

    expect(screen.getAllByRole('button', { name: 'Agent' })).toHaveLength(1);
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add rule' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add filter' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the hop stored without a group when the rule is only opened', () => {
    const { getDraftRole } = renderFilterBuilder(persistedRole);

    expect(getDraftRole().rowLevelPermissionPredicates).toEqual([
      ungroupedHopPredicate,
    ]);
    expect(getDraftRole().rowLevelPermissionPredicateGroups).toEqual([]);
    expect(getRoleDirtyFields(getDraftRole(), persistedRole)).toEqual({});
  });

  it('adds a new row to the hop rule instead of a second rule', async () => {
    const user = userEvent.setup();
    const { getDraftRole } = renderFilterBuilder(persistedRole);

    await user.click(screen.getByRole('button', { name: 'Add rule' }));

    const { rowLevelPermissionPredicates, rowLevelPermissionPredicateGroups } =
      getDraftRole();

    expect(rowLevelPermissionPredicateGroups).toEqual([
      expect.objectContaining({
        objectMetadataId: POLICY_OBJECT_METADATA_ITEM.id,
        parentRowLevelPermissionPredicateGroupId: null,
        logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
      }),
    ]);

    const rootPredicateGroupId = rowLevelPermissionPredicateGroups?.[0]?.id;

    expect(rowLevelPermissionPredicates).toHaveLength(2);
    expect(rowLevelPermissionPredicates).toEqual([
      {
        ...ungroupedHopPredicate,
        rowLevelPermissionPredicateGroupId: rootPredicateGroupId,
      },
      expect.objectContaining({
        rowLevelPermissionPredicateGroupId: rootPredicateGroupId,
      }),
    ]);
  });
});
