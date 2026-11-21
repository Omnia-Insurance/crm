import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { resolveShowInSidebar } from 'src/modules/role-object-settings/utils/resolve-show-in-sidebar.util';
import { LEGACY_WORKSPACE_WORKFLOW_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/workflow/common/constants/legacy-workspace-workflow-object-universal-identifiers.constant';

const buildFlatRole = (showAllObjectsInSidebar: boolean): FlatRole =>
  ({
    id: 'role-id',
    universalIdentifier: 'role-universal-identifier',
    showAllObjectsInSidebar,
  }) as FlatRole;

const buildFlatObjectPermission = (
  showInSidebar: boolean | null,
): FlatObjectPermission =>
  ({
    id: 'object-permission-id',
    universalIdentifier: 'object-permission-universal-identifier',
    roleId: 'role-id',
    objectMetadataId: 'object-id',
    showInSidebar,
  }) as FlatObjectPermission;

const customFlatObjectMetadata = getFlatObjectMetadataMock({
  universalIdentifier: 'carrier-universal-identifier',
  isSystem: false,
});

describe('resolveShowInSidebar', () => {
  it('always shows system objects, whatever the override and role default', () => {
    expect(
      resolveShowInSidebar({
        flatObjectMetadata: getFlatObjectMetadataMock({
          universalIdentifier: 'system-object-universal-identifier',
          isSystem: true,
        }),
        flatRole: buildFlatRole(false),
        flatObjectPermission: buildFlatObjectPermission(false),
        isWorkflowsPermissionGranted: false,
      }),
    ).toBe(true);
  });

  it.each([
    LEGACY_WORKSPACE_WORKFLOW_OBJECT_UNIVERSAL_IDENTIFIER,
    STANDARD_OBJECTS.workflowRun.universalIdentifier,
    STANDARD_OBJECTS.workflowVersion.universalIdentifier,
  ])(
    'shows workflow object %s only when the WORKFLOWS flag is granted, even though it is a system object',
    (universalIdentifier) => {
      const flatObjectMetadata = getFlatObjectMetadataMock({
        universalIdentifier,
        isSystem: true,
      });

      expect(
        resolveShowInSidebar({
          flatObjectMetadata,
          flatRole: buildFlatRole(true),
          flatObjectPermission: buildFlatObjectPermission(true),
          isWorkflowsPermissionGranted: false,
        }),
      ).toBe(false);
      expect(
        resolveShowInSidebar({
          flatObjectMetadata,
          flatRole: buildFlatRole(false),
          flatObjectPermission: buildFlatObjectPermission(false),
          isWorkflowsPermissionGranted: true,
        }),
      ).toBe(true);
    },
  );

  it.each([
    { showInSidebar: true, showAllObjectsInSidebar: false, expected: true },
    { showInSidebar: false, showAllObjectsInSidebar: true, expected: false },
    { showInSidebar: null, showAllObjectsInSidebar: true, expected: true },
    { showInSidebar: null, showAllObjectsInSidebar: false, expected: false },
  ])(
    'resolves override $showInSidebar against role default $showAllObjectsInSidebar to $expected',
    ({ showInSidebar, showAllObjectsInSidebar, expected }) => {
      expect(
        resolveShowInSidebar({
          flatObjectMetadata: customFlatObjectMetadata,
          flatRole: buildFlatRole(showAllObjectsInSidebar),
          flatObjectPermission: buildFlatObjectPermission(showInSidebar),
          isWorkflowsPermissionGranted: true,
        }),
      ).toBe(expected);
    },
  );

  it.each([true, false])(
    'uses the role default %s when the role has no row for the object',
    (showAllObjectsInSidebar) => {
      expect(
        resolveShowInSidebar({
          flatObjectMetadata: customFlatObjectMetadata,
          flatRole: buildFlatRole(showAllObjectsInSidebar),
          isWorkflowsPermissionGranted: true,
        }),
      ).toBe(showAllObjectsInSidebar);
    },
  );
});
