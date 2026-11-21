import { Test } from '@nestjs/testing';
import {
  getSearchFieldUniversalIdentifier,
  TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'twenty-shared/application';
import { FieldMetadataType } from 'twenty-shared/types';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaBackfillCustomObjectSearchFieldsCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500001000-omnia-backfill-custom-object-search-fields.command';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
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
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const CUSTOM_APPLICATION_ID = 'workspace-custom-application-id';
const CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-0000-4000-8000-0000000000c1';
const OBJECT_ID = 'policy-object-id';
const OBJECT_UNIVERSAL_IDENTIFIER = 'policy-object-uid';

const STALE_MAP_KEYS = [
  'flatObjectMetadataMaps',
  'flatFieldMetadataMaps',
  'flatSearchFieldMetadataMaps',
  'flatFieldPermissionMaps',
];

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

const buildField = (
  name: string,
  type: FieldMetadataType,
  isSystem = false,
): FlatFieldMetadata =>
  getFlatFieldMetadataMock({
    id: `${name}-field-id`,
    universalIdentifier: `${name}-field-uid`,
    objectMetadataId: OBJECT_ID,
    objectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
    applicationId: CUSTOM_APPLICATION_ID,
    applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    name,
    type,
    isSystem,
  });

const POLICY_NUMBER_FIELD = buildField('policyNumber', FieldMetadataType.TEXT);
const SEARCH_VECTOR_FIELD_METADATA = buildField(
  SEARCH_VECTOR_FIELD.name,
  FieldMetadataType.TS_VECTOR,
  true,
);

const POLICY_NUMBER_ROW: FlatSearchFieldMetadata = {
  id: 'policy-number-search-field-id',
  universalIdentifier: getSearchFieldUniversalIdentifier({
    applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    fieldMetadataUniversalIdentifier: POLICY_NUMBER_FIELD.universalIdentifier,
  }),
  objectMetadataId: OBJECT_ID,
  objectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
  fieldMetadataId: POLICY_NUMBER_FIELD.id,
  fieldMetadataUniversalIdentifier: POLICY_NUMBER_FIELD.universalIdentifier,
  tsVectorFieldMetadataId: SEARCH_VECTOR_FIELD_METADATA.id,
  tsVectorFieldMetadataUniversalIdentifier:
    SEARCH_VECTOR_FIELD_METADATA.universalIdentifier,
  position: 0,
  isSystemSideEffect: true,
  applicationId: CUSTOM_APPLICATION_ID,
  applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
  workspaceId: WORKSPACE_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const POLICY_NUMBER_READ_RESTRICTION: FlatFieldPermission = {
  id: 'policy-number-field-permission-id',
  universalIdentifier: 'policy-number-field-permission-uid',
  roleId: 'agent-role-id',
  roleUniversalIdentifier: 'agent-role-uid',
  objectMetadataId: OBJECT_ID,
  objectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
  fieldMetadataId: POLICY_NUMBER_FIELD.id,
  fieldMetadataUniversalIdentifier: POLICY_NUMBER_FIELD.universalIdentifier,
  rowLevelPermissionPredicateGroupId: null,
  rowLevelPermissionPredicateGroupUniversalIdentifier: null,
  rowLevelPermissionRuleId: null,
  rowLevelPermissionRuleUniversalIdentifier: null,
  canReadFieldValue: false,
  canUpdateFieldValue: false,
  applicationId: CUSTOM_APPLICATION_ID,
  applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
  workspaceId: WORKSPACE_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const setup = async ({
  existingRows = [],
  fieldPermissions = [],
  migrationStatus = 'success',
}: {
  existingRows?: FlatSearchFieldMetadata[];
  fieldPermissions?: FlatFieldPermission[];
  migrationStatus?: 'success' | 'fail';
} = {}) => {
  const fields = [POLICY_NUMBER_FIELD, SEARCH_VECTOR_FIELD_METADATA];

  const flatObjectMetadata = getFlatObjectMetadataMock({
    id: OBJECT_ID,
    universalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
    applicationId: CUSTOM_APPLICATION_ID,
    applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    isSearchable: true,
    fieldIds: fields.map(({ id }) => id),
    fieldUniversalIdentifiers: fields.map(
      ({ universalIdentifier }) => universalIdentifier,
    ),
  });

  const invalidateAndRecompute = jest.fn().mockResolvedValue(undefined);
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: buildFlatEntityMaps([flatObjectMetadata]),
    flatFieldMetadataMaps: buildFlatEntityMaps(fields),
    flatSearchFieldMetadataMaps: buildFlatEntityMaps(existingRows),
    flatFieldPermissionMaps: buildFlatEntityMaps(fieldPermissions),
  });
  const validateBuildAndRunLegacyWorkspaceMigration = jest
    .fn()
    .mockResolvedValue(
      migrationStatus === 'success'
        ? { status: 'success' }
        : { status: 'fail', report: {} },
    );

  const module = await Test.createTestingModule({
    providers: [
      OmniaBackfillCustomObjectSearchFieldsCommand,
      { provide: WorkspaceIteratorService, useValue: {} },
      {
        provide: ApplicationService,
        useValue: {
          findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
            .fn()
            .mockResolvedValue({
              twentyStandardFlatApplication: {
                id: 'standard-application-id',
                universalIdentifier:
                  TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
              },
              workspaceCustomFlatApplication: {
                id: CUSTOM_APPLICATION_ID,
                universalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
              },
            }),
        },
      },
      {
        provide: WorkspaceCacheService,
        useValue: { invalidateAndRecompute, getOrRecompute },
      },
      {
        provide: WorkspaceMigrationValidateBuildAndRunService,
        useValue: { validateBuildAndRunLegacyWorkspaceMigration },
      },
    ],
  }).compile();

  const command = module.get(OmniaBackfillCustomObjectSearchFieldsCommand);

  const runOnWorkspace = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  return {
    runOnWorkspace,
    invalidateAndRecompute,
    getOrRecompute,
    validateBuildAndRunLegacyWorkspaceMigration,
  };
};

describe('OmniaBackfillCustomObjectSearchFieldsCommand', () => {
  it('recomputes the stale maps, then creates the missing rows under the workspace custom application', async () => {
    const {
      runOnWorkspace,
      invalidateAndRecompute,
      getOrRecompute,
      validateBuildAndRunLegacyWorkspaceMigration,
    } = await setup();

    await runOnWorkspace();

    expect(invalidateAndRecompute).toHaveBeenCalledWith(
      WORKSPACE_ID,
      STALE_MAP_KEYS,
    );
    expect(invalidateAndRecompute.mock.invocationCallOrder[0]).toBeLessThan(
      getOrRecompute.mock.invocationCallOrder[0],
    );
    expect(validateBuildAndRunLegacyWorkspaceMigration).toHaveBeenCalledTimes(
      1,
    );
    expect(validateBuildAndRunLegacyWorkspaceMigration).toHaveBeenCalledWith({
      shouldDeferActions: false,
      isSystemBuild: true,
      workspaceId: WORKSPACE_ID,
      applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
      allFlatEntityOperationByMetadataName: {
        searchFieldMetadata: {
          flatEntityToCreate: [
            expect.objectContaining({
              fieldMetadataUniversalIdentifier:
                POLICY_NUMBER_FIELD.universalIdentifier,
              tsVectorFieldMetadataUniversalIdentifier:
                SEARCH_VECTOR_FIELD_METADATA.universalIdentifier,
            }),
          ],
          flatEntityToDelete: [],
          flatEntityToUpdate: [],
        },
      },
    });
  });

  it('writes nothing on a dry run', async () => {
    const { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration } =
      await setup();

    await runOnWorkspace(true);

    expect(validateBuildAndRunLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('is a no-op once every searchable field has a row', async () => {
    const { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration } =
      await setup({ existingRows: [POLICY_NUMBER_ROW] });

    await runOnWorkspace();

    expect(validateBuildAndRunLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('writes nothing for a field that some role cannot read', async () => {
    const { runOnWorkspace, validateBuildAndRunLegacyWorkspaceMigration } =
      await setup({ fieldPermissions: [POLICY_NUMBER_READ_RESTRICTION] });

    await runOnWorkspace();

    expect(validateBuildAndRunLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('fails the upgrade when the migration is rejected', async () => {
    const { runOnWorkspace } = await setup({ migrationStatus: 'fail' });

    await expect(runOnWorkspace()).rejects.toBeInstanceOf(
      WorkspaceMigrationBuilderException,
    );
  });
});
