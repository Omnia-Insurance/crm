import { getRoleDirtyFields } from '@/settings/roles/role/utils/getRoleDirtyFields';
// OMNIA-CUSTOM: predicates for the per-operation dirty check (contract C1)
import { RowLevelPermissionPredicateOperand } from '~/generated-metadata/graphql';
import { mockedRoles } from '~/testing/mock-data/generated/metadata/roles/mock-roles-data';

const role = { ...mockedRoles[1], permissionFlags: [] };
const draftFlag = {
  id: 'temporary-id',
  roleId: role.id,
  flag: 'APP_SEND_NOTIFICATION',
};
const draftRole = { ...role, permissionFlags: [draftFlag] };
const savedRole = {
  ...role,
  permissionFlags: [
    {
      ...draftFlag,
      id: 'server-id',
      __typename: 'RolePermissionFlag' as const,
    },
  ],
};

describe('getRoleDirtyFields', () => {
  it('treats saved flags as clean despite generated IDs and GraphQL metadata', () => {
    expect(getRoleDirtyFields(draftRole, savedRole)).toEqual({});
  });

  it('ignores flag ordering without modifying either role', () => {
    const otherFlag = { ...draftFlag, id: 'other-id', flag: 'APP_CONFIGURE' };
    const draft = { ...role, permissionFlags: [draftFlag, otherFlag] };
    const persisted = { ...role, permissionFlags: [otherFlag, draftFlag] };

    expect(getRoleDirtyFields(draft, persisted)).toEqual({});
    expect(draft.permissionFlags).toEqual([draftFlag, otherFlag]);
    expect(persisted.permissionFlags).toEqual([otherFlag, draftFlag]);
  });

  it('keeps additions made during a save dirty until they are undone', () => {
    const otherFlag = { ...draftFlag, id: 'other-id', flag: 'APP_CONFIGURE' };
    const draft = { ...draftRole, permissionFlags: [draftFlag, otherFlag] };

    expect(getRoleDirtyFields(draft, savedRole)).toEqual({
      permissionFlags: draft.permissionFlags,
    });
    expect(getRoleDirtyFields(draftRole, savedRole)).toEqual({});
  });

  it('detects flag removals and replacements', () => {
    expect(getRoleDirtyFields(role, savedRole)).toEqual({
      permissionFlags: [],
    });
    const replacement = { ...draftFlag, flag: 'APP_CONFIGURE' };
    expect(
      getRoleDirtyFields(
        { ...role, permissionFlags: [replacement] },
        savedRole,
      ),
    ).toEqual({ permissionFlags: [replacement] });
  });

  it('keeps failed flag changes and unrelated edits dirty', () => {
    expect(getRoleDirtyFields(draftRole, role)).toEqual({
      permissionFlags: [draftFlag],
    });
    expect(
      getRoleDirtyFields({ ...draftRole, label: 'Unsaved label' }, savedRole),
    ).toEqual({ label: 'Unsaved label' });
  });

  it('retains new-role fields when there is no persisted role', () => {
    expect(getRoleDirtyFields(draftRole, undefined)).toEqual(draftRole);
  });
});

// OMNIA-CUSTOM: rules only hold the All records / Matching records choice of filtered objects (contract C1)
describe('getRoleDirtyFields with record-level rules', () => {
  const objectMetadataId = 'policy-object-id';
  const predicate = {
    id: 'predicate-id',
    roleId: role.id,
    objectMetadataId,
    fieldMetadataId: 'agent-field-id',
    operand: RowLevelPermissionPredicateOperand.IS,
  };
  const matchingRecordsRule = {
    id: 'draft-rule-id',
    objectMetadataId,
    canReadRecords: true,
    canCreateRecords: true,
    canUpdateRecords: true,
    canSoftDeleteRecords: true,
    canDestroyRecords: true,
  };
  const filteredRole = {
    ...role,
    canReadAllObjectRecords: true,
    canUpdateAllObjectRecords: false,
    objectPermissions: [],
    rowLevelPermissionPredicates: [predicate],
  };

  it('treats a rule saved under a server id as clean', () => {
    expect(
      getRoleDirtyFields(
        { ...filteredRole, rowLevelPermissionRules: [matchingRecordsRule] },
        {
          ...filteredRole,
          rowLevelPermissionRules: [
            {
              ...matchingRecordsRule,
              id: 'server-rule-id',
              __typename: 'RowLevelPermissionRule' as const,
            },
          ],
        },
      ),
    ).toEqual({});
  });

  it('treats a new filter without a draft rule as restricting every operation', () => {
    expect(
      getRoleDirtyFields(
        { ...filteredRole, rowLevelPermissionRules: [] },
        { ...filteredRole, rowLevelPermissionRules: [matchingRecordsRule] },
      ),
    ).toEqual({});
  });

  it('ignores a rule left on an object whose filter is gone', () => {
    expect(
      getRoleDirtyFields(
        { ...role, rowLevelPermissionRules: [matchingRecordsRule] },
        { ...role, rowLevelPermissionRules: [] },
      ),
    ).toEqual({});
  });

  it('ignores the choice of an operation the role cannot perform', () => {
    expect(
      getRoleDirtyFields(
        {
          ...filteredRole,
          rowLevelPermissionRules: [
            { ...matchingRecordsRule, canUpdateRecords: false },
          ],
        },
        { ...filteredRole, rowLevelPermissionRules: [matchingRecordsRule] },
      ),
    ).toEqual({});
  });

  it('keeps a changed All records / Matching records choice dirty', () => {
    const allRecordsReadRule = {
      ...matchingRecordsRule,
      canReadRecords: false,
    };

    expect(
      getRoleDirtyFields(
        { ...filteredRole, rowLevelPermissionRules: [allRecordsReadRule] },
        { ...filteredRole, rowLevelPermissionRules: [matchingRecordsRule] },
      ),
    ).toEqual({ rowLevelPermissionRules: [allRecordsReadRule] });
  });
});
