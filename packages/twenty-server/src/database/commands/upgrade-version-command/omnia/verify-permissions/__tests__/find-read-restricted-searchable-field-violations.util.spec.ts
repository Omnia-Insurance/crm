import { buildFlatEntityMapsMock } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { findReadRestrictedSearchableFieldViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-read-restricted-searchable-field-violations.util';
import { type FlatFieldPermission } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatSearchFieldMetadata } from 'src/engine/metadata-modules/flat-search-field-metadata/types/flat-search-field-metadata.type';

const APPLICATION_ID = 'custom-application-id';
const AGENT_PROFILE_OBJECT_ID = 'agent-profile-object-id';
const NAME_FIELD_ID = 'agent-profile-name-field-id';
const EMAIL_FIELD_ID = 'agent-profile-email-field-id';
const NPN_FIELD_ID = 'agent-profile-npn-field-id';
const PHONE_FIELD_ID = 'agent-profile-phone-field-id';
const CREATED_AT = '2026-01-01T00:00:00.000Z';

const buildFlatObjectMetadataMaps = ({
  isSearchable = true,
}: { isSearchable?: boolean } = {}) =>
  buildFlatEntityMapsMock([
    getFlatObjectMetadataMock({
      id: AGENT_PROFILE_OBJECT_ID,
      universalIdentifier: AGENT_PROFILE_OBJECT_ID,
      nameSingular: 'agentProfile',
      labelIdentifierFieldMetadataId: NAME_FIELD_ID,
      isSearchable,
    }),
  ]);

const buildFlatSearchFieldMetadata = (
  fieldMetadataId: string,
): FlatSearchFieldMetadata => ({
  id: `${fieldMetadataId}-search-field-id`,
  universalIdentifier: `${fieldMetadataId}-search-field-id`,
  objectMetadataId: AGENT_PROFILE_OBJECT_ID,
  objectMetadataUniversalIdentifier: AGENT_PROFILE_OBJECT_ID,
  fieldMetadataId,
  fieldMetadataUniversalIdentifier: fieldMetadataId,
  tsVectorFieldMetadataId: 'agent-profile-search-vector-field-id',
  tsVectorFieldMetadataUniversalIdentifier:
    'agent-profile-search-vector-field-id',
  position: 0,
  isSystemSideEffect: true,
  applicationId: APPLICATION_ID,
  applicationUniversalIdentifier: APPLICATION_ID,
  workspaceId: 'workspace-id',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
});

const buildFlatFieldPermission = ({
  fieldMetadataId,
  roleId = 'agent-role-id',
  canReadFieldValue = false,
  canUpdateFieldValue = false,
  rowLevelPermissionRuleId = null,
}: {
  fieldMetadataId: string;
  roleId?: string;
  canReadFieldValue?: boolean | null;
  canUpdateFieldValue?: boolean | null;
  rowLevelPermissionRuleId?: string | null;
}): FlatFieldPermission => {
  const id = `${roleId}-${fieldMetadataId}-${rowLevelPermissionRuleId ?? 'object'}-field-permission-id`;

  return {
    id,
    universalIdentifier: id,
    roleId,
    roleUniversalIdentifier: roleId,
    objectMetadataId: AGENT_PROFILE_OBJECT_ID,
    objectMetadataUniversalIdentifier: AGENT_PROFILE_OBJECT_ID,
    fieldMetadataId,
    fieldMetadataUniversalIdentifier: fieldMetadataId,
    rowLevelPermissionPredicateGroupId: null,
    rowLevelPermissionPredicateGroupUniversalIdentifier: null,
    rowLevelPermissionRuleId,
    rowLevelPermissionRuleUniversalIdentifier: rowLevelPermissionRuleId,
    canReadFieldValue,
    canUpdateFieldValue,
    applicationId: APPLICATION_ID,
    applicationUniversalIdentifier: APPLICATION_ID,
    workspaceId: 'workspace-id',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
};

describe('findReadRestrictedSearchableFieldViolations', () => {
  it('should pass when every searchable field is readable, edit-only restricted or the label identifier', () => {
    expect(
      findReadRestrictedSearchableFieldViolations({
        flatSearchFieldMetadataMaps: buildFlatEntityMapsMock([
          buildFlatSearchFieldMetadata(NAME_FIELD_ID),
          buildFlatSearchFieldMetadata(PHONE_FIELD_ID),
        ]),
        flatFieldPermissionMaps: buildFlatEntityMapsMock([
          buildFlatFieldPermission({ fieldMetadataId: NAME_FIELD_ID }),
          buildFlatFieldPermission({
            fieldMetadataId: PHONE_FIELD_ID,
            canReadFieldValue: null,
          }),
          buildFlatFieldPermission({ fieldMetadataId: EMAIL_FIELD_ID }),
        ]),
        flatObjectMetadataMaps: buildFlatObjectMetadataMaps(),
      }),
    ).toEqual([]);
  });

  it('should report each searchable field some role cannot read once, whether the restriction is object or rule level', () => {
    expect(
      findReadRestrictedSearchableFieldViolations({
        flatSearchFieldMetadataMaps: buildFlatEntityMapsMock([
          buildFlatSearchFieldMetadata(NAME_FIELD_ID),
          buildFlatSearchFieldMetadata(EMAIL_FIELD_ID),
          buildFlatSearchFieldMetadata(NPN_FIELD_ID),
        ]),
        flatFieldPermissionMaps: buildFlatEntityMapsMock([
          buildFlatFieldPermission({ fieldMetadataId: EMAIL_FIELD_ID }),
          buildFlatFieldPermission({
            fieldMetadataId: EMAIL_FIELD_ID,
            roleId: 'member-role-id',
          }),
          buildFlatFieldPermission({
            fieldMetadataId: NPN_FIELD_ID,
            rowLevelPermissionRuleId: 'agent-rule-id',
          }),
        ]),
        flatObjectMetadataMaps: buildFlatObjectMetadataMaps(),
      }),
    ).toEqual([
      {
        check: 'read-restricted-searchable-field',
        message:
          '2 searchable field(s) that some role cannot read: search matches searchVector in WHERE, so that role can find records by the hidden value; remove the field from search or lift the restriction',
        ids: [EMAIL_FIELD_ID, NPN_FIELD_ID],
      },
    ]);
  });

  it('should report a field of an object left out of default search, since naming the object still searches it', () => {
    expect(
      findReadRestrictedSearchableFieldViolations({
        flatSearchFieldMetadataMaps: buildFlatEntityMapsMock([
          buildFlatSearchFieldMetadata(EMAIL_FIELD_ID),
        ]),
        flatFieldPermissionMaps: buildFlatEntityMapsMock([
          buildFlatFieldPermission({ fieldMetadataId: EMAIL_FIELD_ID }),
        ]),
        flatObjectMetadataMaps: buildFlatObjectMetadataMaps({
          isSearchable: false,
        }),
      }).map(({ ids }) => ids),
    ).toEqual([[EMAIL_FIELD_ID]]);
  });
});
