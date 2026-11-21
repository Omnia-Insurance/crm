import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';

export const resolveEditWindowMinutes = ({
  flatRole,
  flatObjectPermission,
}: {
  flatRole: FlatRole;
  flatObjectPermission?: FlatObjectPermission;
}): number | null =>
  flatObjectPermission?.editWindowMinutes ?? flatRole.editWindowMinutes ?? null;
