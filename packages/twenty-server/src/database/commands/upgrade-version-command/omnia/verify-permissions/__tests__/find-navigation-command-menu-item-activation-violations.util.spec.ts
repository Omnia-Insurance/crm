import { buildFlatEntityMapsMock } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { findNavigationCommandMenuItemActivationViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-navigation-command-menu-item-activation-violations.util';
import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';

const STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER = 'standard-application';
const WORKSPACE_APPLICATION_UNIVERSAL_IDENTIFIER = 'workspace-application';

const flatObjectMetadataMaps = buildFlatEntityMapsMock([
  getFlatObjectMetadataMock({
    id: 'policy-object-id',
    universalIdentifier: 'policy-object-id',
    nameSingular: 'policy',
    isActive: true,
  }),
  getFlatObjectMetadataMock({
    id: 'company-object-id',
    universalIdentifier: 'company-object-id',
    nameSingular: 'company',
    isActive: false,
  }),
]);

const buildNavigationItem = ({
  id,
  navigationTargetObjectMetadataId,
  isActive = true,
  overrides = null,
}: {
  id: string;
  navigationTargetObjectMetadataId: string | null;
  isActive?: boolean;
  overrides?: Record<string, { isActive: boolean }> | null;
}) => ({
  id,
  isActive,
  engineComponentKey: EngineComponentKey.NAVIGATION,
  navigationTargetObjectMetadataId,
  overrides,
  applicationUniversalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
});

describe('findNavigationCommandMenuItemActivationViolations', () => {
  it('should pass when each Go To item follows its object and ignore path navigation', () => {
    expect(
      findNavigationCommandMenuItemActivationViolations({
        flatCommandMenuItems: [
          buildNavigationItem({
            id: 'go-to-policies-id',
            navigationTargetObjectMetadataId: 'policy-object-id',
          }),
          buildNavigationItem({
            id: 'go-to-companies-id',
            navigationTargetObjectMetadataId: 'company-object-id',
            isActive: false,
          }),
          buildNavigationItem({
            id: 'go-to-settings-id',
            navigationTargetObjectMetadataId: null,
          }),
        ],
        flatObjectMetadataMaps,
      }),
    ).toEqual([]);
  });

  it('should accept a Go To item an admin hid for an active object', () => {
    expect(
      findNavigationCommandMenuItemActivationViolations({
        flatCommandMenuItems: [
          buildNavigationItem({
            id: 'hidden-go-to-policies-id',
            navigationTargetObjectMetadataId: 'policy-object-id',
            overrides: {
              [WORKSPACE_APPLICATION_UNIVERSAL_IDENTIFIER]: { isActive: false },
            },
          }),
        ],
        flatObjectMetadataMaps,
      }),
    ).toEqual([]);
  });

  it('should report an active Go To item for a deactivated object and a drifted inactive one', () => {
    expect(
      findNavigationCommandMenuItemActivationViolations({
        flatCommandMenuItems: [
          buildNavigationItem({
            id: 'go-to-companies-id',
            navigationTargetObjectMetadataId: 'company-object-id',
          }),
          buildNavigationItem({
            id: 'go-to-policies-id',
            navigationTargetObjectMetadataId: 'policy-object-id',
            isActive: false,
          }),
        ],
        flatObjectMetadataMaps,
      }),
    ).toEqual([
      {
        check: 'navigation-command-activation',
        message:
          'navigation command menu item go-to-companies-id is active but its object company is not',
        ids: ['go-to-companies-id', 'company-object-id'],
      },
      {
        check: 'navigation-command-activation',
        message:
          'navigation command menu item go-to-policies-id is inactive but its object policy is active',
        ids: ['go-to-policies-id', 'policy-object-id'],
      },
    ]);
  });
});
