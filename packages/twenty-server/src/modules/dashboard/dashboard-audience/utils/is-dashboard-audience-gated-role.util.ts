import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';

// Roles that can update all settings see every dashboard. Non-editable roles (Admin, application grant
// roles) are rebuilt from their source and carry no row level permission rules by design
export const isDashboardAudienceGatedRole = ({
  flatRole,
  roleIdsWithAllRecordsAccess,
}: {
  flatRole: Pick<FlatRole, 'id' | 'isEditable'>;
  roleIdsWithAllRecordsAccess: string[];
}): boolean =>
  flatRole.isEditable && !roleIdsWithAllRecordsAccess.includes(flatRole.id);
