import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { DEFAULT_SETTINGS_DRAFT_ROLE } from '@/settings/roles/constants/DefaultSettingsDraftRole';
import { SettingsRolePermissionsObjectLevelShowInSidebarRow } from '@/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelShowInSidebarRow';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { type ObjectPermission } from '~/generated-metadata/graphql';

const ROLE_ID = 'role-id';
const OBJECT_METADATA_ID = 'object-metadata-id';

// Same shape as the reconciliation objects: every record permission explicitly refused.
const LOCKED_OBJECT_PERMISSION: ObjectPermission = {
  objectMetadataId: OBJECT_METADATA_ID,
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};

const buildDraftRole = ({
  showAllObjectsInSidebar,
  objectPermissions = [],
  isEditable = true,
}: {
  showAllObjectsInSidebar: boolean;
  objectPermissions?: ObjectPermission[];
  isEditable?: boolean;
}): RoleWithPartialMembers => ({
  ...DEFAULT_SETTINGS_DRAFT_ROLE,
  id: ROLE_ID,
  label: 'Member',
  isEditable,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: true,
  showAllObjectsInSidebar,
  objectPermissions,
});

const ShowInSidebarRowFromDraftRole = () => {
  const settingsDraftRole = useAtomFamilyStateValue(
    settingsDraftRoleFamilyState,
    ROLE_ID,
  );

  return (
    <SettingsRolePermissionsObjectLevelShowInSidebarRow
      roleId={ROLE_ID}
      objectMetadataItemId={OBJECT_METADATA_ID}
      isEditable={settingsDraftRole.isEditable}
      settingsDraftRoleObjectPermissions={settingsDraftRole.objectPermissions?.find(
        (objectPermission) =>
          objectPermission.objectMetadataId === OBJECT_METADATA_ID,
      )}
    />
  );
};

const renderShowInSidebarRow = (draftRole: RoleWithPartialMembers) => {
  const store = createStore();
  const draftRoleAtom = settingsDraftRoleFamilyState.getAtom(ROLE_ID, null);

  store.set(draftRoleAtom, draftRole);

  render(
    <JotaiProvider store={store}>
      <ShowInSidebarRowFromDraftRole />
    </JotaiProvider>,
  );

  return {
    getDraftObjectPermissions: () => store.get(draftRoleAtom).objectPermissions,
  };
};

describe('SettingsRolePermissionsObjectLevelShowInSidebarRow', () => {
  it('inherits the role default when the role shows every object', () => {
    renderShowInSidebarRow(buildDraftRole({ showAllObjectsInSidebar: true }));

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText(/Inherited from role/)).toBeInTheDocument();
  });

  it('hides the object for this role and writes only showInSidebar', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderShowInSidebarRow(
      buildDraftRole({ showAllObjectsInSidebar: true }),
    );

    await user.click(screen.getByText('Show in Sidebar'));

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText(/Hidden for this object/)).toBeInTheDocument();
    expect(getDraftObjectPermissions()).toEqual([
      { objectMetadataId: OBJECT_METADATA_ID, showInSidebar: false },
    ]);
  });

  it('shows the object without granting read when the role hides every object', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderShowInSidebarRow(
      buildDraftRole({ showAllObjectsInSidebar: false }),
    );

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByText(/Inherited from role/)).not.toBeInTheDocument();

    await user.click(screen.getByText('Show in Sidebar'));

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText(/Shown for this object/)).toBeInTheDocument();
    expect(getDraftObjectPermissions()).toEqual([
      { objectMetadataId: OBJECT_METADATA_ID, showInSidebar: true },
    ]);
  });

  it('resets the override by clearing only showInSidebar', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderShowInSidebarRow(
      buildDraftRole({
        showAllObjectsInSidebar: true,
        objectPermissions: [
          {
            ...LOCKED_OBJECT_PERMISSION,
            showInSidebar: false,
            editWindowMinutes: 60,
          },
        ],
      }),
    );

    expect(screen.getByText(/Hidden for this object/)).toBeInTheDocument();

    await user.click(screen.getByText('Show in Sidebar'));

    expect(screen.getByText(/Inherited from role/)).toBeInTheDocument();
    expect(getDraftObjectPermissions()).toEqual([
      {
        ...LOCKED_OBJECT_PERMISSION,
        showInSidebar: null,
        editWindowMinutes: 60,
      },
    ]);
  });

  it.each([
    {
      state: 'inherited',
      showAllObjectsInSidebar: true,
      showInSidebar: undefined,
      expectedShowInSidebar: false,
    },
    {
      state: 'hidden override',
      showAllObjectsInSidebar: true,
      showInSidebar: false,
      expectedShowInSidebar: null,
    },
    {
      state: 'not shown',
      showAllObjectsInSidebar: false,
      showInSidebar: undefined,
      expectedShowInSidebar: true,
    },
    {
      state: 'shown override',
      showAllObjectsInSidebar: false,
      showInSidebar: true,
      expectedShowInSidebar: false,
    },
  ])(
    'never changes record permissions on an object locked with read refused ($state)',
    async ({
      showAllObjectsInSidebar,
      showInSidebar,
      expectedShowInSidebar,
    }) => {
      const user = userEvent.setup();
      const { getDraftObjectPermissions } = renderShowInSidebarRow(
        buildDraftRole({
          showAllObjectsInSidebar,
          objectPermissions: [{ ...LOCKED_OBJECT_PERMISSION, showInSidebar }],
        }),
      );

      await user.click(screen.getByText('Show in Sidebar'));

      expect(getDraftObjectPermissions()).toEqual([
        { ...LOCKED_OBJECT_PERMISSION, showInSidebar: expectedShowInSidebar },
      ]);
    },
  );

  it('does not change the draft when the role is not editable', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderShowInSidebarRow(
      buildDraftRole({ showAllObjectsInSidebar: true, isEditable: false }),
    );

    await user.click(screen.getByText('Show in Sidebar'));

    expect(screen.getByText(/Inherited from role/)).toBeInTheDocument();
    expect(getDraftObjectPermissions()).toEqual([]);
  });
});
