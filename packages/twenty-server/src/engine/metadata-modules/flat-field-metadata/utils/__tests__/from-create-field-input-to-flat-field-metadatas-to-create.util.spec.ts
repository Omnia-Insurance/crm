import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { type EachTestingContext } from 'twenty-shared/testing';
import { FieldMetadataType } from 'twenty-shared/types';

import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { ApplicationState } from 'src/engine/core-modules/application/enums/application-state.enum';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { type CreateFieldInput } from 'src/engine/metadata-modules/field-metadata/dtos/create-field.input';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import {
  fromCreateFieldInputToFlatFieldMetadatasToCreate,
  type FromCreateFieldInputToFlatObjectMetadataArgs,
} from 'src/engine/metadata-modules/flat-field-metadata/utils/from-create-field-input-to-flat-field-metadatas-to-create.util';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { SEARCH_VECTOR_FIELD } from 'src/engine/metadata-modules/search-field-metadata/constants/search-vector-field.constants';

const CUSTOM = '20202020-aaaa-4aaa-8aaa-000000000001';
const OTHER_APPLICATION = '20202020-bbbb-4bbb-8bbb-000000000002';
const STANDARD = TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER;

const OBJECT_ID = 'object-id';
const SEARCH_VECTOR_FIELD_UNIVERSAL_IDENTIFIER = 'search-vector-uid';

const buildFlatApplication = (
  universalIdentifier: string,
): FlatApplication => ({
  id: universalIdentifier,
  universalIdentifier,
  name: 'Application',
  description: null,
  logo: null,
  logoFileId: null,
  workspaceId: 'workspace-id',
  version: null,
  sourceType: ApplicationRegistrationSourceType.LOCAL,
  state: ApplicationState.INSTALLED,
  sourcePath: '',
  packageJsonChecksum: null,
  packageJsonFileId: null,
  yarnLockChecksum: null,
  yarnLockFileId: null,
  availablePackages: {},
  billing: {},
  grantedCapabilities: [],
  grantedIframeMediaPermissions: [],
  logicFunctionLayerId: null,
  defaultRoleId: null,
  defaultRole: null,
  settingsCustomTabFrontComponentId: null,
  healthCheckLogicFunctionId: null,
  isUserHealthCheckEnabled: false,
  uninstallLogicFunctionId: null,
  uninstallHookCompletedForRequestedAt: null,
  canBeUninstalled: false,
  autoUpgrade: false,
  applicationRegistrationId: null,
  primaryPublicDomainId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  isSdkLayerStale: true,
  sdkClientCoreChecksum: null,
  frontComponentSharedDependenciesChecksum: null,
  frontComponentSharedDependenciesBuiltPath: null,
});

const buildArgs = ({
  createFieldInput = {},
  flatApplication = buildFlatApplication(CUSTOM),
  flatObjectMetadata = {},
  hasSearchVectorField = true,
}: {
  createFieldInput?: Partial<Omit<CreateFieldInput, 'workspaceId'>>;
  flatApplication?: FlatApplication;
  flatObjectMetadata?: Partial<FlatObjectMetadata>;
  hasSearchVectorField?: boolean;
}): FromCreateFieldInputToFlatObjectMetadataArgs => {
  const parentFlatObjectMetadata = getFlatObjectMetadataMock({
    universalIdentifier: 'object-uid',
    id: OBJECT_ID,
    applicationUniversalIdentifier: CUSTOM,
    isSearchable: true,
    fieldUniversalIdentifiers: hasSearchVectorField
      ? [SEARCH_VECTOR_FIELD_UNIVERSAL_IDENTIFIER]
      : [],
    ...flatObjectMetadata,
  });
  const searchVectorFlatFieldMetadata = getFlatFieldMetadataMock({
    universalIdentifier: SEARCH_VECTOR_FIELD_UNIVERSAL_IDENTIFIER,
    objectMetadataId: OBJECT_ID,
    type: FieldMetadataType.TS_VECTOR,
    name: SEARCH_VECTOR_FIELD.name,
    isSystem: true,
  });

  return {
    createFieldInput: {
      name: 'policyNumber',
      label: 'Policy number',
      type: FieldMetadataType.TEXT,
      objectMetadataId: OBJECT_ID,
      ...createFieldInput,
    },
    flatApplication,
    flatObjectMetadataMaps: addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: parentFlatObjectMetadata,
      flatEntityMaps: createEmptyFlatEntityMaps(),
    }),
    flatFieldMetadataMaps: addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: searchVectorFlatFieldMetadata,
      flatEntityMaps: createEmptyFlatEntityMaps(),
    }),
  };
};

const getCreatedFieldIsSearchable = async (
  args: FromCreateFieldInputToFlatObjectMetadataArgs,
) => {
  const result = await fromCreateFieldInputToFlatFieldMetadatasToCreate(args);

  if (result.status !== 'success') {
    throw new Error('Field creation transpilation should succeed');
  }

  return result.result.flatFieldMetadatas[0].isSearchable;
};

type TestCase = EachTestingContext<{
  args: FromCreateFieldInputToFlatObjectMetadataArgs;
}>;

describe('fromCreateFieldInputToFlatFieldMetadatasToCreate isSearchable default', () => {
  it('makes a searchable-type field searchable on a workspace custom object with a search vector', async () => {
    expect(await getCreatedFieldIsSearchable(buildArgs({}))).toBe(true);
  });

  const notSearchableByDefaultTestCases: TestCase[] = [
    {
      title: 'a non-searchable field type',
      context: {
        args: buildArgs({
          createFieldInput: { type: FieldMetadataType.NUMBER },
        }),
      },
    },
    {
      title: 'a system field',
      context: { args: buildArgs({ createFieldInput: { isSystem: true } }) },
    },
    {
      title: 'a Twenty standard object',
      context: {
        args: buildArgs({
          flatObjectMetadata: { applicationUniversalIdentifier: STANDARD },
        }),
      },
    },
    {
      title: 'a Twenty standard object extended by the standard application',
      context: {
        args: buildArgs({
          flatApplication: buildFlatApplication(STANDARD),
          flatObjectMetadata: { applicationUniversalIdentifier: STANDARD },
        }),
      },
    },
    {
      title: 'an object owned by another application',
      context: {
        args: buildArgs({
          flatObjectMetadata: {
            applicationUniversalIdentifier: OTHER_APPLICATION,
          },
        }),
      },
    },
    {
      title: 'an object with search disabled',
      context: {
        args: buildArgs({ flatObjectMetadata: { isSearchable: false } }),
      },
    },
    {
      title: 'an object without a search vector',
      context: { args: buildArgs({ hasSearchVectorField: false }) },
    },
  ];

  test.each(notSearchableByDefaultTestCases)(
    'skips the default for $title',
    async ({ context: { args } }) => {
      expect(await getCreatedFieldIsSearchable(args)).toBe(false);
    },
  );

  it('keeps an explicit isSearchable false on a field the default would cover', async () => {
    expect(
      await getCreatedFieldIsSearchable(
        buildArgs({ createFieldInput: { isSearchable: false } }),
      ),
    ).toBe(false);
  });

  it('keeps an explicit isSearchable true on a field the default skips', async () => {
    expect(
      await getCreatedFieldIsSearchable(
        buildArgs({
          createFieldInput: { isSearchable: true },
          flatObjectMetadata: {
            applicationUniversalIdentifier: OTHER_APPLICATION,
          },
        }),
      ),
    ).toBe(true);
  });
});
