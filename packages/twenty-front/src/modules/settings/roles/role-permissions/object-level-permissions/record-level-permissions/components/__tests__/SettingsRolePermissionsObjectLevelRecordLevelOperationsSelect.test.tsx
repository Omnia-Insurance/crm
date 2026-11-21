import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { DEFAULT_SETTINGS_DRAFT_ROLE } from '@/settings/roles/constants/DefaultSettingsDraftRole';
import { SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/components/SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect';
import { resolveObjectRecordsAccessForFilteredObject } from '@/settings/roles/role/utils/resolveObjectRecordsAccessForFilteredObject';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import {
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateOperand,
  type RowLevelPermissionRule,
} from '~/generated-metadata/graphql';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const ROLE_ID = 'role-id';

const personObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');

const PERSON_PREDICATE: RowLevelPermissionPredicate = {
  id: 'person-predicate-id',
  roleId: ROLE_ID,
  objectMetadataId: personObjectMetadataItem.id,
  fieldMetadataId: 'person-owner-field-id',
  workspaceMemberFieldMetadataId: 'workspace-member-id-field-id',
  operand: RowLevelPermissionPredicateOperand.IS,
};

const PERSON_RULE: RowLevelPermissionRule = {
  id: 'person-rule-id',
  objectMetadataId: personObjectMetadataItem.id,
  canReadRecords: false,
  canCreateRecords: true,
  canUpdateRecords: true,
  canSoftDeleteRecords: true,
  canDestroyRecords: true,
};

const buildDraftRole = ({
  isEditable = true,
  isFiltered = true,
  rowLevelPermissionRules = [],
}: {
  isEditable?: boolean;
  isFiltered?: boolean;
  rowLevelPermissionRules?: RowLevelPermissionRule[];
}): RoleWithPartialMembers => ({
  ...DEFAULT_SETTINGS_DRAFT_ROLE,
  id: ROLE_ID,
  label: 'Member',
  isEditable,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  rowLevelPermissionPredicates: isFiltered ? [PERSON_PREDICATE] : [],
  rowLevelPermissionRules,
});

const renderOperationsSelect = (draftRole: RoleWithPartialMembers) => {
  const store = createStore();
  const draftRoleAtom = settingsDraftRoleFamilyState.getAtom(ROLE_ID, null);

  store.set(draftRoleAtom, draftRole);

  render(
    <JotaiProvider store={store}>
      <SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect
        roleId={ROLE_ID}
        objectMetadataItem={personObjectMetadataItem}
      />
    </JotaiProvider>,
  );

  return { getDraftRole: () => store.get(draftRoleAtom) };
};

const getOperationRow = (label: string) => {
  const row = screen.getByText(label).closest('[data-table-row]');

  if (!(row instanceof HTMLElement)) {
    throw new Error(`No operation row for ${label}`);
  }

  return within(row);
};

describe('SettingsRolePermissionsObjectLevelRecordLevelOperationsSelect', () => {
  it('renders nothing for an object without a record-level filter', () => {
    renderOperationsSelect(buildDraftRole({ isFiltered: false }));

    expect(screen.queryByText('See People')).not.toBeInTheDocument();
    expect(screen.queryByText('Matching records')).not.toBeInTheDocument();
  });

  it('shows every granted operation on matching records for a new filter', () => {
    renderOperationsSelect(buildDraftRole({}));

    expect(
      getOperationRow('See People').getByText('Matching records'),
    ).toBeInTheDocument();
    expect(
      getOperationRow('Edit People').getByText('Matching records'),
    ).toBeInTheDocument();
    expect(
      getOperationRow('Edit People').getByText(/Follows See/),
    ).toBeInTheDocument();
    expect(
      getOperationRow('Delete People').getByText('Matching records'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Destroy People')).not.toBeInTheDocument();
  });

  it('keeps See on all records and Edit on matching records for the agent rule', async () => {
    const user = userEvent.setup();
    const { getDraftRole } = renderOperationsSelect(buildDraftRole({}));

    await user.click(
      getOperationRow('See People').getByText('Matching records'),
    );
    await user.click(
      await screen.findByRole('option', { name: 'All records' }),
    );

    expect(getDraftRole().rowLevelPermissionRules).toEqual([
      {
        id: expect.any(String),
        objectMetadataId: personObjectMetadataItem.id,
        canReadRecords: false,
        canCreateRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: true,
        canDestroyRecords: true,
      },
    ]);
    expect(
      resolveObjectRecordsAccessForFilteredObject({
        role: getDraftRole(),
        objectMetadataId: personObjectMetadataItem.id,
      }).objectRecordsGrant,
    ).toEqual({
      canReadObjectRecords: null,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
    expect(screen.queryByText(/Follows See/)).not.toBeInTheDocument();
  });

  it('moves Edit to all records and keeps create following update', async () => {
    const user = userEvent.setup();
    const { getDraftRole } = renderOperationsSelect(
      buildDraftRole({ rowLevelPermissionRules: [PERSON_RULE] }),
    );

    await user.click(
      getOperationRow('Edit People').getByText('Matching records'),
    );
    await user.click(
      await screen.findByRole('option', { name: 'All records' }),
    );

    expect(getDraftRole().rowLevelPermissionRules).toEqual([
      { ...PERSON_RULE, canUpdateRecords: false, canCreateRecords: false },
    ]);
  });

  it('moves every write back to matching records when See goes to matching records', async () => {
    const user = userEvent.setup();
    const { getDraftRole } = renderOperationsSelect(
      buildDraftRole({
        rowLevelPermissionRules: [
          {
            ...PERSON_RULE,
            canUpdateRecords: false,
            canCreateRecords: false,
            canSoftDeleteRecords: false,
          },
        ],
      }),
    );

    await user.click(getOperationRow('See People').getByText('All records'));
    await user.click(
      await screen.findByRole('option', { name: 'Matching records' }),
    );

    expect(getDraftRole().rowLevelPermissionRules).toEqual([
      {
        ...PERSON_RULE,
        canReadRecords: true,
        canCreateRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: true,
      },
    ]);
  });

  it('does not offer all records for writes while See is on matching records', async () => {
    const user = userEvent.setup();

    renderOperationsSelect(buildDraftRole({}));

    await user.click(
      getOperationRow('Edit People').getByText('Matching records'),
    );

    expect(
      screen.queryByRole('option', { name: 'All records' }),
    ).not.toBeInTheDocument();
  });

  it('does not change anything when the role is not editable', async () => {
    const user = userEvent.setup();
    const draftRole = buildDraftRole({
      isEditable: false,
      rowLevelPermissionRules: [PERSON_RULE],
    });
    const { getDraftRole } = renderOperationsSelect(draftRole);

    await user.click(getOperationRow('See People').getByText('All records'));

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(getDraftRole()).toEqual(draftRole);
  });
});
