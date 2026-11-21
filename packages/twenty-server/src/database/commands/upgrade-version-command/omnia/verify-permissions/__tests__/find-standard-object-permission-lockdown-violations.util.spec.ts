import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { findStandardObjectPermissionLockdownViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-standard-object-permission-lockdown-violations.util';
import { PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-disabled-object-permission-actions.constant';

const RECORD_SHARE_UNIVERSAL_IDENTIFIER = 'record-share-universal-identifier';

const find = (disabledObjectPermissionActions: string[] | null) =>
  findStandardObjectPermissionLockdownViolations({
    objectMetadatas: [
      {
        id: 'record-share-object-id',
        universalIdentifier: RECORD_SHARE_UNIVERSAL_IDENTIFIER,
        nameSingular: 'recordShare',
        disabledObjectPermissionActions,
      },
    ] as Parameters<
      typeof findStandardObjectPermissionLockdownViolations
    >[0]['objectMetadatas'],
    expectedDisabledActionsByUniversalIdentifier: {
      [RECORD_SHARE_UNIVERSAL_IDENTIFIER]:
        PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS,
    },
  });

describe('findStandardObjectPermissionLockdownViolations', () => {
  it('flags a standard object that roles can use because its lockdown is missing', () => {
    expect(find(null)).toEqual([
      {
        check: OMNIA_PERMISSIONS_CHECK.standardObjectLockdown,
        message: expect.stringContaining('recordShare'),
        ids: ['record-share-object-id'],
      },
    ]);
  });

  it('passes once the object carries its standard lockdown', () => {
    expect(find(PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS)).toEqual(
      [],
    );
  });
});
