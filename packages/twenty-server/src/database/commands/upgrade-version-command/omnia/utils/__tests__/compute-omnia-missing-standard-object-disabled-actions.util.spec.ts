import { computeOmniaMissingStandardObjectDisabledActions } from 'src/database/commands/upgrade-version-command/omnia/utils/compute-omnia-missing-standard-object-disabled-actions.util';
import { PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-disabled-object-permission-actions.constant';

const RECORD_SHARE_UNIVERSAL_IDENTIFIER = 'record-share-universal-identifier';

const buildObject = (
  disabledObjectPermissionActions: string[] | null,
  universalIdentifier = RECORD_SHARE_UNIVERSAL_IDENTIFIER,
) => ({
  id: 'record-share-object-id',
  universalIdentifier,
  nameSingular: 'recordShare',
  disabledObjectPermissionActions,
});

const compute = (objectMetadatas: ReturnType<typeof buildObject>[]) =>
  computeOmniaMissingStandardObjectDisabledActions({
    objectMetadatas: objectMetadatas as Parameters<
      typeof computeOmniaMissingStandardObjectDisabledActions
    >[0]['objectMetadatas'],
    expectedDisabledActionsByUniversalIdentifier: {
      [RECORD_SHARE_UNIVERSAL_IDENTIFIER]:
        PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS,
    },
  });

describe('computeOmniaMissingStandardObjectDisabledActions', () => {
  it('reports every expected action on an object upgraded without its lockdown', () => {
    expect(compute([buildObject(null)])).toEqual([
      {
        objectMetadataId: 'record-share-object-id',
        nameSingular: 'recordShare',
        missingActions: PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS,
      },
    ]);
  });

  it('reports only the actions that are still enabled', () => {
    expect(
      compute([
        buildObject([
          'canCreateObjectRecords',
          'canDestroyObjectRecords',
          'canSoftDeleteObjectRecords',
          'canUpdateObjectRecords',
        ]),
      ]),
    ).toEqual([
      {
        objectMetadataId: 'record-share-object-id',
        nameSingular: 'recordShare',
        missingActions: ['canReadObjectRecords'],
      },
    ]);
  });

  it('accepts an object that already has its lockdown', () => {
    expect(
      compute([buildObject(PLATFORM_MANAGED_DISABLED_OBJECT_PERMISSION_ACTIONS)]),
    ).toEqual([]);
  });

  it('ignores objects without a standard lockdown', () => {
    expect(compute([buildObject(null, 'person-universal-identifier')])).toEqual(
      [],
    );
  });
});
