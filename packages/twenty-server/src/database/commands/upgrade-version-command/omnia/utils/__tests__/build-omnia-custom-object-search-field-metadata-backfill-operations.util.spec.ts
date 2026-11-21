import {
  getSearchFieldUniversalIdentifier,
  TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'twenty-shared/application';
import { FieldMetadataType } from 'twenty-shared/types';

import { buildOmniaCustomObjectSearchFieldMetadataBackfillOperations } from 'src/database/commands/upgrade-version-command/omnia/utils/build-omnia-custom-object-search-field-metadata-backfill-operations.util';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatFieldPermission } from 'src/engine/metadata-modules/flat-field-permission/types/flat-field-permission.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatSearchFieldMetadata } from 'src/engine/metadata-modules/flat-search-field-metadata/types/flat-search-field-metadata.type';
import { SEARCH_VECTOR_FIELD } from 'src/engine/metadata-modules/search-field-metadata/constants/search-vector-field.constants';

const CUSTOM_APPLICATION_ID = 'custom-application-id';
const CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-0000-4000-8000-0000000000c1';
const STANDARD_APPLICATION_ID = 'standard-application-id';

const OBJECT_ID = 'policy-object-id';
const OBJECT_UNIVERSAL_IDENTIFIER = 'policy-object-uid';

type FieldFixture = {
  name: string;
  type: FieldMetadataType;
  isActive?: boolean;
  isSystem?: boolean;
  overrides?: FlatFieldMetadata['overrides'];
};

const buildFlatEntityMaps = <
  TFlatEntity extends
    | FlatObjectMetadata
    | FlatFieldMetadata
    | FlatSearchFieldMetadata
    | FlatFieldPermission,
>(
  flatEntities: TFlatEntity[],
): FlatEntityMaps<TFlatEntity> =>
  flatEntities.reduce<FlatEntityMaps<TFlatEntity>>(
    (flatEntityMaps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
    createEmptyFlatEntityMaps(),
  );

const buildField = ({
  name,
  type,
  isActive = true,
  isSystem = false,
  overrides = null,
}: FieldFixture): FlatFieldMetadata =>
  getFlatFieldMetadataMock({
    id: `${name}-field-id`,
    universalIdentifier: `${name}-field-uid`,
    objectMetadataId: OBJECT_ID,
    objectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
    applicationId: CUSTOM_APPLICATION_ID,
    applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    name,
    type,
    isActive,
    isSystem,
    overrides,
  });

const NAME_FIELD = buildField({ name: 'name', type: FieldMetadataType.TEXT });
const POLICY_NUMBER_FIELD = buildField({
  name: 'policyNumber',
  type: FieldMetadataType.TEXT,
});
const APPLICATION_ID_FIELD = buildField({
  name: 'applicationId',
  type: FieldMetadataType.TEXT,
});
const SEARCH_VECTOR_FIELD_METADATA = buildField({
  name: SEARCH_VECTOR_FIELD.name,
  type: FieldMetadataType.TS_VECTOR,
  isSystem: true,
});

const buildExistingRow = ({
  fieldMetadata,
  position,
  objectMetadataId = OBJECT_ID,
  fieldMetadataId = fieldMetadata.id,
}: {
  fieldMetadata: FlatFieldMetadata;
  position: number;
  objectMetadataId?: string;
  fieldMetadataId?: string;
}): FlatSearchFieldMetadata => ({
  id: `${fieldMetadata.name}-search-field-id`,
  universalIdentifier: getSearchFieldUniversalIdentifier({
    applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    fieldMetadataUniversalIdentifier: fieldMetadata.universalIdentifier,
  }),
  objectMetadataId,
  objectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
  fieldMetadataId,
  fieldMetadataUniversalIdentifier: fieldMetadata.universalIdentifier,
  tsVectorFieldMetadataId: SEARCH_VECTOR_FIELD_METADATA.id,
  tsVectorFieldMetadataUniversalIdentifier:
    SEARCH_VECTOR_FIELD_METADATA.universalIdentifier,
  position,
  isSystemSideEffect: true,
  applicationId: CUSTOM_APPLICATION_ID,
  applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
  workspaceId: 'workspace-id',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const NAME_ROW = buildExistingRow({ fieldMetadata: NAME_FIELD, position: 0 });

const buildFieldPermission = ({
  fieldMetadata,
  canReadFieldValue,
  rowLevelPermissionPredicateGroupId = null,
}: {
  fieldMetadata: FlatFieldMetadata;
  canReadFieldValue: boolean | null;
  rowLevelPermissionPredicateGroupId?: string | null;
}): FlatFieldPermission => ({
  id: `${fieldMetadata.name}-${rowLevelPermissionPredicateGroupId ?? 'object'}-field-permission-id`,
  universalIdentifier: `${fieldMetadata.name}-${rowLevelPermissionPredicateGroupId ?? 'object'}-field-permission-uid`,
  roleId: 'agent-role-id',
  roleUniversalIdentifier: 'agent-role-uid',
  objectMetadataId: OBJECT_ID,
  objectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
  fieldMetadataId: fieldMetadata.id,
  fieldMetadataUniversalIdentifier: fieldMetadata.universalIdentifier,
  rowLevelPermissionPredicateGroupId,
  rowLevelPermissionPredicateGroupUniversalIdentifier:
    rowLevelPermissionPredicateGroupId,
  rowLevelPermissionRuleId: null,
  rowLevelPermissionRuleUniversalIdentifier: null,
  canReadFieldValue,
  canUpdateFieldValue: false,
  applicationId: CUSTOM_APPLICATION_ID,
  applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
  workspaceId: 'workspace-id',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

type BuildOperationsArgs = {
  fields: FlatFieldMetadata[];
  existingRows?: FlatSearchFieldMetadata[];
  fieldPermissions?: FlatFieldPermission[];
  objectOverrides?: Partial<FlatObjectMetadata>;
};

const buildBackfill = ({
  fields,
  existingRows = [NAME_ROW],
  fieldPermissions = [],
  objectOverrides = {},
}: BuildOperationsArgs) => {
  const flatObjectMetadata = getFlatObjectMetadataMock({
    id: OBJECT_ID,
    universalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
    applicationId: CUSTOM_APPLICATION_ID,
    applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    isSearchable: true,
    labelIdentifierFieldMetadataId: NAME_FIELD.id,
    labelIdentifierFieldMetadataUniversalIdentifier:
      NAME_FIELD.universalIdentifier,
    fieldIds: fields.map(({ id }) => id),
    fieldUniversalIdentifiers: fields.map(
      ({ universalIdentifier }) => universalIdentifier,
    ),
    ...objectOverrides,
  });

  return buildOmniaCustomObjectSearchFieldMetadataBackfillOperations({
    flatObjectMetadataMaps: buildFlatEntityMaps([flatObjectMetadata]),
    flatFieldMetadataMaps: buildFlatEntityMaps(fields),
    flatSearchFieldMetadataMaps: buildFlatEntityMaps(existingRows),
    flatFieldPermissionMaps: buildFlatEntityMaps(fieldPermissions),
    customApplicationId: CUSTOM_APPLICATION_ID,
  });
};

const buildOperations = (args: BuildOperationsArgs) =>
  buildBackfill(args)
    .flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier;

describe('buildOmniaCustomObjectSearchFieldMetadataBackfillOperations', () => {
  it('creates a row for each active searchable custom field, after the rows the object already has', () => {
    const rowsByApplicationUniversalIdentifier = buildOperations({
      fields: [
        NAME_FIELD,
        POLICY_NUMBER_FIELD,
        APPLICATION_ID_FIELD,
        SEARCH_VECTOR_FIELD_METADATA,
      ],
    });

    expect(Object.keys(rowsByApplicationUniversalIdentifier)).toEqual([
      CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    ]);

    const rows =
      rowsByApplicationUniversalIdentifier[
        CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER
      ];

    expect(rows).toEqual([
      expect.objectContaining({
        universalIdentifier: getSearchFieldUniversalIdentifier({
          applicationUniversalIdentifier:
            CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
          fieldMetadataUniversalIdentifier:
            POLICY_NUMBER_FIELD.universalIdentifier,
        }),
        applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
        fieldMetadataUniversalIdentifier:
          POLICY_NUMBER_FIELD.universalIdentifier,
        tsVectorFieldMetadataUniversalIdentifier:
          SEARCH_VECTOR_FIELD_METADATA.universalIdentifier,
        isSystemSideEffect: true,
        position: 1,
      }),
      expect.objectContaining({
        fieldMetadataUniversalIdentifier:
          APPLICATION_ID_FIELD.universalIdentifier,
        position: 2,
      }),
    ]);
  });

  it('skips a field deactivated through an override, an inactive field, a system field, a non-searchable type and the searchVector field', () => {
    const rowsByApplicationUniversalIdentifier = buildOperations({
      fields: [
        NAME_FIELD,
        buildField({
          name: 'deactivatedThroughOverride',
          type: FieldMetadataType.TEXT,
          overrides: {
            [CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: { isActive: false },
          },
        }),
        buildField({
          name: 'deactivated',
          type: FieldMetadataType.TEXT,
          isActive: false,
        }),
        buildField({
          name: 'systemText',
          type: FieldMetadataType.TEXT,
          isSystem: true,
        }),
        buildField({ name: 'premiumAmount', type: FieldMetadataType.NUMBER }),
        SEARCH_VECTOR_FIELD_METADATA,
      ],
    });

    expect(rowsByApplicationUniversalIdentifier).toEqual({});
  });

  it('does not re-emit a field that already has a row (idempotent)', () => {
    const rowsByApplicationUniversalIdentifier = buildOperations({
      fields: [NAME_FIELD, POLICY_NUMBER_FIELD, SEARCH_VECTOR_FIELD_METADATA],
      existingRows: [
        NAME_ROW,
        buildExistingRow({ fieldMetadata: POLICY_NUMBER_FIELD, position: 1 }),
      ],
    });

    expect(rowsByApplicationUniversalIdentifier).toEqual({});
  });

  it('skips a field whose deterministic universal identifier already exists under stale metadata ids', () => {
    const rowsByApplicationUniversalIdentifier = buildOperations({
      fields: [NAME_FIELD, POLICY_NUMBER_FIELD, SEARCH_VECTOR_FIELD_METADATA],
      existingRows: [
        NAME_ROW,
        buildExistingRow({
          fieldMetadata: POLICY_NUMBER_FIELD,
          position: 1,
          objectMetadataId: 'stale-object-metadata-id',
          fieldMetadataId: 'stale-field-metadata-id',
        }),
      ],
    });

    expect(rowsByApplicationUniversalIdentifier).toEqual({});
  });

  it('skips an object owned by the standard application', () => {
    const rowsByApplicationUniversalIdentifier = buildOperations({
      fields: [NAME_FIELD, POLICY_NUMBER_FIELD, SEARCH_VECTOR_FIELD_METADATA],
      objectOverrides: {
        applicationId: STANDARD_APPLICATION_ID,
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      },
    });

    expect(rowsByApplicationUniversalIdentifier).toEqual({});
  });

  it('skips an object that has no searchVector field', () => {
    const rowsByApplicationUniversalIdentifier = buildOperations({
      fields: [NAME_FIELD, POLICY_NUMBER_FIELD],
    });

    expect(rowsByApplicationUniversalIdentifier).toEqual({});
  });

  it('skips an object that is not searchable', () => {
    const rowsByApplicationUniversalIdentifier = buildOperations({
      fields: [NAME_FIELD, POLICY_NUMBER_FIELD, SEARCH_VECTOR_FIELD_METADATA],
      objectOverrides: { isSearchable: false },
    });

    expect(rowsByApplicationUniversalIdentifier).toEqual({});
  });

  it('leaves out and counts a field that some role cannot read, through an object-level or a rule-level field permission', () => {
    const agentEmailField = buildField({
      name: 'agentEmail',
      type: FieldMetadataType.EMAILS,
    });
    const convosoCallIdField = buildField({
      name: 'convosoCallId',
      type: FieldMetadataType.TEXT,
    });

    const {
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
      readRestrictedFieldCount,
    } = buildBackfill({
      fields: [
        NAME_FIELD,
        POLICY_NUMBER_FIELD,
        agentEmailField,
        convosoCallIdField,
        SEARCH_VECTOR_FIELD_METADATA,
      ],
      fieldPermissions: [
        buildFieldPermission({
          fieldMetadata: agentEmailField,
          canReadFieldValue: false,
        }),
        buildFieldPermission({
          fieldMetadata: convosoCallIdField,
          canReadFieldValue: false,
          rowLevelPermissionPredicateGroupId: 'agent-rule-predicate-group-id',
        }),
        buildFieldPermission({
          fieldMetadata: POLICY_NUMBER_FIELD,
          canReadFieldValue: null,
        }),
      ],
    });

    expect(
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
    ).toEqual({
      [CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER]: [
        expect.objectContaining({
          fieldMetadataUniversalIdentifier:
            POLICY_NUMBER_FIELD.universalIdentifier,
          position: 1,
        }),
      ],
    });
    expect(readRestrictedFieldCount).toBe(2);
  });

  it('only counts a read-restricted field it would otherwise have added', () => {
    const {
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
      readRestrictedFieldCount,
    } = buildBackfill({
      fields: [NAME_FIELD, POLICY_NUMBER_FIELD, SEARCH_VECTOR_FIELD_METADATA],
      existingRows: [
        NAME_ROW,
        buildExistingRow({ fieldMetadata: POLICY_NUMBER_FIELD, position: 1 }),
      ],
      fieldPermissions: [
        buildFieldPermission({
          fieldMetadata: POLICY_NUMBER_FIELD,
          canReadFieldValue: false,
        }),
      ],
    });

    expect(
      flatSearchFieldMetadatasToCreateByApplicationUniversalIdentifier,
    ).toEqual({});
    expect(readRestrictedFieldCount).toBe(0);
  });
});
