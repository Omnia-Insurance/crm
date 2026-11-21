import { type ObjectRecordsPermissions } from 'twenty-shared/types';

import { buildRecordReadRestrictions } from 'src/engine/permissions/internal/role/utils/build-record-read-restrictions.util';

const buildObjectRecordsPermissions = (
  overrides: Partial<ObjectRecordsPermissions>,
): ObjectRecordsPermissions => ({
  canCreateAllRecords: true,
  canReadAllRecords: true,
  canUpdateAllRecords: true,
  canSoftDeleteAllRecords: true,
  canDestroyAllRecords: true,
  unreadableFields: [],
  uneditableFields: [],
  ...overrides,
});

describe('buildRecordReadRestrictions', () => {
  it('should restrict nothing when no object has permissions', () => {
    expect(
      buildRecordReadRestrictions({ recordsPermissions: { objects: {} } }),
    ).toEqual({
      unreadableObjectMetadataIds: new Set(),
      unreadableFieldMetadataIds: new Set(),
      // OMNIA-CUSTOM: row-level restricted objects gate timeline value queries
      rowLevelRestrictedObjectMetadataIds: new Set(),
    });
  });

  // OMNIA-CUSTOM: row-level restricted objects gate timeline value queries
  it('should list objects the role reads only through row-level rules', () => {
    const { unreadableObjectMetadataIds, rowLevelRestrictedObjectMetadataIds } =
      buildRecordReadRestrictions({
        recordsPermissions: {
          objects: {
            readable: buildObjectRecordsPermissions({}),
            unreadable: buildObjectRecordsPermissions({
              canReadAllRecords: false,
            }),
            ruleReadable: buildObjectRecordsPermissions({
              canReadAllRecords: false,
              rowLevelRecordsPermissions: [
                {
                  ruleId: 'rule-id',
                  canCreateRecords: false,
                  canReadRecords: true,
                  canUpdateRecords: false,
                  canSoftDeleteRecords: false,
                  canDestroyRecords: false,
                  predicates: [],
                  predicateGroups: [],
                  unreadableFields: [],
                  uneditableFields: [],
                },
              ],
            }),
          },
        },
      });

    expect(unreadableObjectMetadataIds).toEqual(new Set(['unreadable']));
    expect(rowLevelRestrictedObjectMetadataIds).toEqual(
      new Set(['ruleReadable']),
    );
  });

  it('should list objects the role cannot read', () => {
    const { unreadableObjectMetadataIds } = buildRecordReadRestrictions({
      recordsPermissions: {
        objects: {
          readable: buildObjectRecordsPermissions({}),
          unreadable: buildObjectRecordsPermissions({
            canReadAllRecords: false,
          }),
        },
      },
    });

    expect(unreadableObjectMetadataIds).toEqual(new Set(['unreadable']));
  });

  it('should list only the fields denied for reading, across objects', () => {
    const { unreadableFieldMetadataIds } = buildRecordReadRestrictions({
      recordsPermissions: {
        objects: {
          person: buildObjectRecordsPermissions({
            unreadableFields: ['jobTitle'],
            uneditableFields: ['jobTitle', 'city'],
          }),
          company: buildObjectRecordsPermissions({
            unreadableFields: ['name'],
            uneditableFields: ['name'],
          }),
        },
      },
    });

    expect(unreadableFieldMetadataIds).toEqual(new Set(['jobTitle', 'name']));
  });

  it('should not throw on a cache entry written before the upgrade', () => {
    const cachedEntry = JSON.parse(
      JSON.stringify({
        canCreateAllRecords: true,
        canReadAllRecords: true,
        canUpdateAllRecords: true,
        canSoftDeleteAllRecords: true,
        canDestroyAllRecords: true,
        restrictedFields: {},
      }),
    );

    expect(
      buildRecordReadRestrictions({
        recordsPermissions: { objects: { 'object-id': cachedEntry } },
      }).unreadableFieldMetadataIds.size,
    ).toBe(0);
  });
});
