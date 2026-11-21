import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { DEFAULT_SETTINGS_DRAFT_ROLE } from '@/settings/roles/constants/DefaultSettingsDraftRole';
import { SettingsRolePermissionsObjectLevelEditWindowRow } from '@/settings/roles/role-permissions/object-level-permissions/object-form/components/SettingsRolePermissionsObjectLevelEditWindowRow';
import { settingsDraftRoleFamilyState } from '@/settings/roles/states/settingsDraftRoleFamilyState';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { type ObjectPermission } from '~/generated-metadata/graphql';

const ROLE_ID = 'role-id';
const OBJECT_METADATA_ID = 'object-metadata-id';

const LOCKED_OBJECT_PERMISSION: ObjectPermission = {
  objectMetadataId: OBJECT_METADATA_ID,
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
  showInSidebar: false,
};

const buildDraftRole = ({
  editWindowMinutes = null,
  objectPermissions = [],
}: {
  editWindowMinutes?: number | null;
  objectPermissions?: ObjectPermission[];
}): RoleWithPartialMembers => ({
  ...DEFAULT_SETTINGS_DRAFT_ROLE,
  id: ROLE_ID,
  label: 'Member',
  isEditable: true,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  editWindowMinutes,
  objectPermissions,
});

const EditWindowRowFromDraftRole = () => {
  const settingsDraftRole = useAtomFamilyStateValue(
    settingsDraftRoleFamilyState,
    ROLE_ID,
  );

  return (
    <SettingsRolePermissionsObjectLevelEditWindowRow
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

const renderEditWindowRow = (draftRole: RoleWithPartialMembers) => {
  const store = createStore();
  const draftRoleAtom = settingsDraftRoleFamilyState.getAtom(ROLE_ID, null);

  store.set(draftRoleAtom, draftRole);

  render(
    <JotaiProvider store={store}>
      <EditWindowRowFromDraftRole />
    </JotaiProvider>,
  );

  return {
    getDraftObjectPermissions: () => store.get(draftRoleAtom).objectPermissions,
  };
};

describe('SettingsRolePermissionsObjectLevelEditWindowRow', () => {
  it('writes only editWindowMinutes to the object permission', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderEditWindowRow(
      buildDraftRole({ objectPermissions: [LOCKED_OBJECT_PERMISSION] }),
    );

    await user.click(screen.getByText('No limit'));
    await user.click(await screen.findByText('1 hour'));

    expect(getDraftObjectPermissions()).toEqual([
      { ...LOCKED_OBJECT_PERMISSION, editWindowMinutes: 60 },
    ]);
  });

  it('adds no record permission when the object has none yet', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderEditWindowRow(
      buildDraftRole({}),
    );

    await user.click(screen.getByText('No limit'));
    await user.click(await screen.findByText('15 minutes'));

    expect(getDraftObjectPermissions()).toEqual([
      { objectMetadataId: OBJECT_METADATA_ID, editWindowMinutes: 15 },
    ]);
  });

  it('shows the role default while the object inherits it', () => {
    renderEditWindowRow(buildDraftRole({ editWindowMinutes: 240 }));

    expect(screen.getByText('4 hours')).toBeInTheDocument();
    expect(
      screen.getByText(/Inherited from role \(4 hours\)/),
    ).toBeInTheDocument();
  });

  it('shows the object value instead of the role default', () => {
    renderEditWindowRow(
      buildDraftRole({
        editWindowMinutes: 240,
        objectPermissions: [
          { objectMetadataId: OBJECT_METADATA_ID, editWindowMinutes: 10 },
        ],
      }),
    );

    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.queryByText(/Inherited from role/)).not.toBeInTheDocument();
  });

  it('clears the object value when No limit is picked', async () => {
    const user = userEvent.setup();
    const { getDraftObjectPermissions } = renderEditWindowRow(
      buildDraftRole({
        objectPermissions: [
          { ...LOCKED_OBJECT_PERMISSION, editWindowMinutes: 10 },
        ],
      }),
    );

    await user.click(screen.getByText('10 minutes'));
    await user.click(await screen.findByText('No limit'));

    expect(getDraftObjectPermissions()).toEqual([
      { ...LOCKED_OBJECT_PERMISSION, editWindowMinutes: null },
    ]);
  });
});
