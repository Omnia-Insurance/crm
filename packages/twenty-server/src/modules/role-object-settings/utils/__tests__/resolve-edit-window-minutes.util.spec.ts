import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { resolveEditWindowMinutes } from 'src/modules/role-object-settings/utils/resolve-edit-window-minutes.util';

const buildFlatRole = (editWindowMinutes: number | null): FlatRole =>
  ({
    id: 'role-id',
    universalIdentifier: 'role-universal-identifier',
    editWindowMinutes,
  }) as FlatRole;

const buildFlatObjectPermission = (
  editWindowMinutes: number | null,
): FlatObjectPermission =>
  ({
    id: 'object-permission-id',
    universalIdentifier: 'object-permission-universal-identifier',
    roleId: 'role-id',
    objectMetadataId: 'policy-object-id',
    editWindowMinutes,
  }) as FlatObjectPermission;

describe('resolveEditWindowMinutes', () => {
  it('prefers the per-object override over the role default', () => {
    expect(
      resolveEditWindowMinutes({
        flatRole: buildFlatRole(60),
        flatObjectPermission: buildFlatObjectPermission(15),
      }),
    ).toBe(15);
  });

  it('keeps a zero-minute override instead of falling back to the role default', () => {
    expect(
      resolveEditWindowMinutes({
        flatRole: buildFlatRole(60),
        flatObjectPermission: buildFlatObjectPermission(0),
      }),
    ).toBe(0);
  });

  it('falls back to the role default when the object sets no window', () => {
    expect(
      resolveEditWindowMinutes({
        flatRole: buildFlatRole(60),
        flatObjectPermission: buildFlatObjectPermission(null),
      }),
    ).toBe(60);
  });

  it('falls back to the role default when the role has no row for the object', () => {
    expect(resolveEditWindowMinutes({ flatRole: buildFlatRole(60) })).toBe(60);
  });

  it('returns null when neither the object nor the role sets a window', () => {
    expect(
      resolveEditWindowMinutes({
        flatRole: buildFlatRole(null),
        flatObjectPermission: buildFlatObjectPermission(null),
      }),
    ).toBeNull();
    expect(
      resolveEditWindowMinutes({ flatRole: buildFlatRole(null) }),
    ).toBeNull();
  });
});
