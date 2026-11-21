import { resolveObjectRecordsAccessForFilteredObject } from '@/settings/roles/role/utils/resolveObjectRecordsAccessForFilteredObject';
import {
  type ObjectPermission,
  type RowLevelPermissionRule,
} from '~/generated-metadata/graphql';

const POLICY_OBJECT_METADATA_ID = 'policy-object-id';

const MEMBER_ROLE_GRANTS = {
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
};

const buildRule = (
  grants: Partial<RowLevelPermissionRule>,
): RowLevelPermissionRule => ({
  id: 'draft-rule-id',
  objectMetadataId: POLICY_OBJECT_METADATA_ID,
  canReadRecords: false,
  canCreateRecords: false,
  canUpdateRecords: false,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
  ...grants,
});

const resolve = ({
  objectPermission,
  rule,
}: {
  objectPermission?: Partial<ObjectPermission>;
  rule?: RowLevelPermissionRule;
}) =>
  resolveObjectRecordsAccessForFilteredObject({
    role: {
      ...MEMBER_ROLE_GRANTS,
      objectPermissions: [
        { objectMetadataId: POLICY_OBJECT_METADATA_ID, ...objectPermission },
      ],
      rowLevelPermissionRules: rule ? [rule] : [],
    },
    objectMetadataId: POLICY_OBJECT_METADATA_ID,
  });

describe('resolveObjectRecordsAccessForFilteredObject', () => {
  it('keeps reading all policies and edits only matching ones for the agent policy rule', () => {
    expect(
      resolve({
        objectPermission: {
          canReadObjectRecords: null,
          canUpdateObjectRecords: null,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: null,
        },
        rule: buildRule({
          canReadRecords: false,
          canUpdateRecords: true,
          canSoftDeleteRecords: true,
          canDestroyRecords: true,
        }),
      }),
    ).toEqual({
      objectRecordsGrant: {
        canReadObjectRecords: null,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      },
      rowLevelPermissionRuleGrant: {
        canReadRecords: false,
        canCreateRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: false,
        canDestroyRecords: false,
      },
    });
  });

  it('restricts every granted operation to matching records when the filter has no draft rule yet', () => {
    expect(
      resolve({ objectPermission: { canDestroyObjectRecords: true } }),
    ).toEqual({
      objectRecordsGrant: {
        canReadObjectRecords: false,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      },
      rowLevelPermissionRuleGrant: {
        canReadRecords: true,
        canCreateRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: true,
        canDestroyRecords: true,
      },
    });
  });

  it('keeps an explicit object-level grant for operations on all records', () => {
    const { objectRecordsGrant } = resolve({
      objectPermission: { canReadObjectRecords: true },
      rule: buildRule({ canUpdateRecords: true }),
    });

    expect(objectRecordsGrant.canReadObjectRecords).toBe(true);
    expect(objectRecordsGrant.canUpdateObjectRecords).toBe(false);
  });

  it('keeps writes on matching records while reads are on matching records', () => {
    expect(
      resolve({
        rule: buildRule({ canReadRecords: true, canUpdateRecords: false }),
      }),
    ).toEqual({
      objectRecordsGrant: {
        canReadObjectRecords: false,
        canUpdateObjectRecords: false,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
      },
      rowLevelPermissionRuleGrant: {
        canReadRecords: true,
        canCreateRecords: true,
        canUpdateRecords: true,
        canSoftDeleteRecords: true,
        canDestroyRecords: false,
      },
    });
  });

  it('grants nothing through the rule for an operation that is off', () => {
    const { objectRecordsGrant, rowLevelPermissionRuleGrant } = resolve({
      objectPermission: { canUpdateObjectRecords: false },
      rule: buildRule({ canUpdateRecords: true }),
    });

    expect(objectRecordsGrant.canUpdateObjectRecords).toBe(false);
    expect(rowLevelPermissionRuleGrant.canUpdateRecords).toBe(false);
    expect(rowLevelPermissionRuleGrant.canCreateRecords).toBe(false);
  });

  it('never sends null or true at object level for an operation the rule grants', () => {
    const booleans = [true, false];
    const nullableBooleans = [true, false, null];

    for (const canReadRecords of booleans) {
      for (const canUpdateRecords of booleans) {
        for (const canSoftDeleteRecords of booleans) {
          for (const canDestroyRecords of booleans) {
            for (const canReadObjectRecords of nullableBooleans) {
              for (const canUpdateObjectRecords of nullableBooleans) {
                const { objectRecordsGrant, rowLevelPermissionRuleGrant } =
                  resolve({
                    objectPermission: {
                      canReadObjectRecords,
                      canUpdateObjectRecords,
                      canSoftDeleteObjectRecords: null,
                      canDestroyObjectRecords: true,
                    },
                    rule: buildRule({
                      canReadRecords,
                      canUpdateRecords,
                      canSoftDeleteRecords,
                      canDestroyRecords,
                    }),
                  });

                if (
                  canReadRecords ||
                  rowLevelPermissionRuleGrant.canReadRecords
                ) {
                  expect(objectRecordsGrant.canReadObjectRecords).toBe(false);
                }
                if (
                  canUpdateRecords ||
                  rowLevelPermissionRuleGrant.canUpdateRecords
                ) {
                  expect(objectRecordsGrant.canUpdateObjectRecords).toBe(false);
                }
                if (
                  canSoftDeleteRecords ||
                  rowLevelPermissionRuleGrant.canSoftDeleteRecords
                ) {
                  expect(objectRecordsGrant.canSoftDeleteObjectRecords).toBe(
                    false,
                  );
                }
                if (
                  canDestroyRecords ||
                  rowLevelPermissionRuleGrant.canDestroyRecords
                ) {
                  expect(objectRecordsGrant.canDestroyObjectRecords).toBe(
                    false,
                  );
                }
                if (objectRecordsGrant.canReadObjectRecords === false) {
                  expect(objectRecordsGrant.canUpdateObjectRecords).toBe(false);
                  expect(objectRecordsGrant.canSoftDeleteObjectRecords).toBe(
                    false,
                  );
                  expect(objectRecordsGrant.canDestroyObjectRecords).toBe(
                    false,
                  );
                }
                expect(rowLevelPermissionRuleGrant.canCreateRecords).toBe(
                  rowLevelPermissionRuleGrant.canUpdateRecords,
                );
              }
            }
          }
        }
      }
    }
  });
});
