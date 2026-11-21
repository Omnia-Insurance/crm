import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { DEFAULT_SETTINGS_DRAFT_ROLE } from '@/settings/roles/constants/DefaultSettingsDraftRole';
import { SettingsRolePermissionsObjectLevelObjectFormObjectLevel } from '@/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelObjectFormObjectLevel';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { type ObjectPermission } from '~/generated-metadata/graphql';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const ROLE_ID = 'role-id';

const personObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');

const LOCKED_PERSON_OBJECT_PERMISSION: ObjectPermission = {
  objectMetadataId: personObjectMetadataItem.id,
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};

const renderObjectLevelForm = ({
  showAllObjectsInSidebar,
  objectPermission,
}: {
  showAllObjectsInSidebar: boolean;
  objectPermission: ObjectPermission;
}) => {
  const store = createStore();
  const draftRoleAtom = settingsDraftRoleFamilyState.getAtom(ROLE_ID, null);

  const draftRole: RoleWithPartialMembers = {
    ...DEFAULT_SETTINGS_DRAFT_ROLE,
    id: ROLE_ID,
    label: 'Member',
    isEditable: true,
    canReadAllObjectRecords: true,
    canUpdateAllObjectRecords: true,
    canSoftDeleteAllObjectRecords: true,
    canDestroyAllObjectRecords: true,
    showAllObjectsInSidebar,
    objectPermissions: [objectPermission],
  };

  store.set(draftRoleAtom, draftRole);

  render(
    <JotaiProvider store={store}>
      <SettingsRolePermissionsObjectLevelObjectFormObjectLevel
        roleId={ROLE_ID}
        objectMetadataItem={personObjectMetadataItem}
      />
    </JotaiProvider>,
  );

  return {
    getDraftObjectPermissions: () => store.get(draftRoleAtom).objectPermissions,
  };
};

describe('SettingsRolePermissionsObjectLevelObjectFormObjectLevel', () => {
  it('renders the sidebar and edit window rows once, after the record permissions', () => {
    renderObjectLevelForm({
      showAllObjectsInSidebar: true,
      objectPermission: LOCKED_PERSON_OBJECT_PERMISSION,
    });

    const rowLabels = screen
      .getAllByText(
        /^(See|Edit|Delete|Destroy) People$|^Show in Sidebar$|^Edit window$/,
      )
      .map((rowLabel) => rowLabel.textContent);

    expect(rowLabels).toEqual([
      'See People',
      'Edit People',
      'Delete People',
      'Destroy People',
      'Show in Sidebar',
      'Edit window',
    ]);
  });

  it('keeps read refused while Show in Sidebar is switched on and off', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderObjectLevelForm({
      showAllObjectsInSidebar: false,
      objectPermission: LOCKED_PERSON_OBJECT_PERMISSION,
    });

    expect(screen.getAllByText(/Revoked for this object/)).toHaveLength(4);

    await user.click(screen.getByText('Show in Sidebar'));

    expect(screen.getByText(/Shown for this object/)).toBeInTheDocument();
    expect(screen.getAllByText(/Revoked for this object/)).toHaveLength(4);
    expect(getDraftObjectPermissions()).toEqual([
      { ...LOCKED_PERSON_OBJECT_PERMISSION, showInSidebar: true },
    ]);

    await user.click(screen.getByText('Show in Sidebar'));

    expect(screen.queryByText(/Shown for this object/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Revoked for this object/)).toHaveLength(4);
    expect(getDraftObjectPermissions()).toEqual([
      { ...LOCKED_PERSON_OBJECT_PERMISSION, showInSidebar: false },
    ]);
  });

  it('keeps read refused when the sidebar override is reset', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderObjectLevelForm({
      showAllObjectsInSidebar: true,
      objectPermission: {
        ...LOCKED_PERSON_OBJECT_PERMISSION,
        showInSidebar: false,
      },
    });

    await user.click(screen.getByText('Show in Sidebar'));

    expect(screen.getAllByText(/Revoked for this object/)).toHaveLength(4);
    expect(getDraftObjectPermissions()).toEqual([
      { ...LOCKED_PERSON_OBJECT_PERMISSION, showInSidebar: null },
    ]);
  });
});
