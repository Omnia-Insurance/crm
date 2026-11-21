import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { FieldMetadataType } from 'twenty-shared/types';

import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { ApplicationState } from 'src/engine/core-modules/application/enums/application-state.enum';
import { type FlatApplication } from 'src/engine/core-modules/application/types/flat-application.type';
import { type UpdateFieldInput } from 'src/engine/metadata-modules/field-metadata/dtos/update-field.input';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { fromUpdateFieldInputToFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/from-update-field-input-to-flat-field-metadata.util';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

const CUSTOM = '20202020-aaaa-4aaa-8aaa-000000000001';
const STANDARD = TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER;

const OBJECT_ID = 'object-id';
const FIELD_ID = 'field-id';
const FIELD_UNIVERSAL_IDENTIFIER = 'field-uid';

const MOCK_FLAT_APPLICATION: FlatApplication = {
  id: CUSTOM,
  universalIdentifier: CUSTOM,
  name: 'Workspace Custom Application',
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
};

const getUpdatedFlatFieldMetadata = ({
  updateFieldInput,
  flatFieldMetadata = {},
  flatObjectMetadata = {},
}: {
  updateFieldInput: Omit<UpdateFieldInput, 'id' | 'workspaceId'>;
  flatFieldMetadata?: Partial<FlatFieldMetadata>;
  flatObjectMetadata?: Partial<FlatObjectMetadata>;
}) => {
  const parentFlatObjectMetadata = getFlatObjectMetadataMock({
    universalIdentifier: 'object-uid',
    id: OBJECT_ID,
    applicationUniversalIdentifier: CUSTOM,
    fieldUniversalIdentifiers: [FIELD_UNIVERSAL_IDENTIFIER],
    ...flatObjectMetadata,
  });
  const existingFlatFieldMetadata = getFlatFieldMetadataMock({
    universalIdentifier: FIELD_UNIVERSAL_IDENTIFIER,
    id: FIELD_ID,
    objectMetadataId: OBJECT_ID,
    objectMetadataUniversalIdentifier:
      parentFlatObjectMetadata.universalIdentifier,
    type: FieldMetadataType.TEXT,
    name: 'policyNumber',
    applicationUniversalIdentifier: CUSTOM,
    isActive: true,
    isSearchable: true,
    ...flatFieldMetadata,
  });

  const result = fromUpdateFieldInputToFlatFieldMetadata({
    updateFieldInput: {
      id: FIELD_ID,
      workspaceId: 'workspace-id',
      ...updateFieldInput,
    },
    flatApplication: MOCK_FLAT_APPLICATION,
    isSystemBuild: false,
    workspaceCustomApplicationUniversalIdentifier: CUSTOM,
    flatObjectMetadataMaps: addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: parentFlatObjectMetadata,
      flatEntityMaps: createEmptyFlatEntityMaps(),
    }),
    flatFieldMetadataMaps: addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: existingFlatFieldMetadata,
      flatEntityMaps: createEmptyFlatEntityMaps(),
    }),
    flatIndexMaps: createEmptyFlatEntityMaps(),
    flatViewFilterMaps: createEmptyFlatEntityMaps(),
    flatViewGroupMaps: createEmptyFlatEntityMaps(),
    flatViewMaps: createEmptyFlatEntityMaps(),
    flatViewFieldMaps: createEmptyFlatEntityMaps(),
  });

  if (result.status !== 'success') {
    throw new Error('Field update transpilation should succeed');
  }

  return result.result.flatFieldMetadatasToUpdate[0];
};

describe('fromUpdateFieldInputToFlatFieldMetadata search removal on deactivation', () => {
  it('removes a searchable field from search when it is deactivated', () => {
    expect(
      getUpdatedFlatFieldMetadata({ updateFieldInput: { isActive: false } }),
    ).toMatchObject({ isActive: false, isSearchable: false });
  });

  it('keeps an explicit isSearchable sent with the deactivation', () => {
    expect(
      getUpdatedFlatFieldMetadata({
        updateFieldInput: { isActive: false, isSearchable: true },
      }),
    ).toMatchObject({ isActive: false, isSearchable: true });
  });

  it('leaves a reactivated field out of search', () => {
    expect(
      getUpdatedFlatFieldMetadata({
        updateFieldInput: { isActive: true },
        flatFieldMetadata: { isActive: false, isSearchable: false },
      }),
    ).toMatchObject({ isActive: true, isSearchable: false });
  });

  it('removes a standard field from search while its deactivation goes to the workspace override', () => {
    expect(
      getUpdatedFlatFieldMetadata({
        updateFieldInput: { isActive: false },
        flatFieldMetadata: { applicationUniversalIdentifier: STANDARD },
        flatObjectMetadata: { applicationUniversalIdentifier: STANDARD },
      }),
    ).toMatchObject({
      isActive: true,
      isSearchable: false,
      overrides: { [CUSTOM]: { isActive: false } },
    });
  });

  it('leaves the label identifier to the upstream deactivation rule', () => {
    expect(
      getUpdatedFlatFieldMetadata({
        updateFieldInput: { isActive: false },
        flatObjectMetadata: {
          labelIdentifierFieldMetadataId: FIELD_ID,
          labelIdentifierFieldMetadataUniversalIdentifier:
            FIELD_UNIVERSAL_IDENTIFIER,
        },
      }),
    ).toMatchObject({ isActive: false, isSearchable: true });
  });

  it('leaves system fields to the upstream system-field rule', () => {
    expect(
      getUpdatedFlatFieldMetadata({
        updateFieldInput: { isActive: false },
        flatFieldMetadata: { isSystem: true },
      }),
    ).toMatchObject({ isActive: false, isSearchable: true });
  });

  it('leaves system-managed fields deactivatable, since they only accept isActive', () => {
    expect(
      getUpdatedFlatFieldMetadata({
        updateFieldInput: { isActive: false },
        flatFieldMetadata: { isSystemSideEffect: true },
      }),
    ).toMatchObject({ isActive: false, isSearchable: true });
  });
});
