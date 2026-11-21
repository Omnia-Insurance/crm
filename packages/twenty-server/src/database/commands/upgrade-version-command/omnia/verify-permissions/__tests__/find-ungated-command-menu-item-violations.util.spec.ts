import { PHI_EGRESS_ENGINE_COMPONENT_KEYS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/phi-egress-engine-component-keys.constant';
import { findUngatedCommandMenuItemViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-ungated-command-menu-item-violations.util';
import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';

const STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER = 'standard-application';
const WORKSPACE_APPLICATION_UNIVERSAL_IDENTIFIER = 'workspace-application';

const buildCommandMenuItem = (
  overrides: Partial<
    Parameters<
      typeof findUngatedCommandMenuItemViolations
    >[0]['flatCommandMenuItems'][number]
  > & { id: string },
) => ({
  isActive: true,
  engineComponentKey: EngineComponentKey.EXPORT_VIEW,
  conditionalAvailabilityExpression:
    'pageType == "INDEX_PAGE" and permissionFlags.EXPORT_CSV',
  overrides: null,
  applicationUniversalIdentifier: STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
  ...overrides,
});

describe('findUngatedCommandMenuItemViolations', () => {
  it('should pass gated PHI egress commands and ignore inactive or unrelated ones', () => {
    expect(
      findUngatedCommandMenuItemViolations({
        flatCommandMenuItems: [
          buildCommandMenuItem({ id: 'export-view-id' }),
          buildCommandMenuItem({
            id: 'inactive-import-id',
            engineComponentKey: EngineComponentKey.IMPORT_RECORDS,
            conditionalAvailabilityExpression: null,
            isActive: false,
          }),
          buildCommandMenuItem({
            id: 'create-record-id',
            engineComponentKey: EngineComponentKey.CREATE_NEW_RECORD,
            conditionalAvailabilityExpression: null,
          }),
        ],
        engineComponentKeys: PHI_EGRESS_ENGINE_COMPONENT_KEYS,
      }),
    ).toEqual([]);
  });

  it('should report an active PHI egress command without a permission flag gate', () => {
    expect(
      findUngatedCommandMenuItemViolations({
        flatCommandMenuItems: [
          buildCommandMenuItem({
            id: 'ask-ai-id',
            engineComponentKey: EngineComponentKey.ASK_AI,
            conditionalAvailabilityExpression: 'not isInSidePanel',
          }),
        ],
        engineComponentKeys: PHI_EGRESS_ENGINE_COMPONENT_KEYS,
      }),
    ).toEqual([
      {
        check: 'phi-egress-command-gate',
        message:
          'active ASK_AI command menu item ask-ai-id has no permissionFlags clause in its availability expression',
        ids: ['ask-ai-id'],
      },
    ]);
  });

  it('should read the item as overridden by the workspace', () => {
    const violations = findUngatedCommandMenuItemViolations({
      flatCommandMenuItems: [
        buildCommandMenuItem({
          id: 'reactivated-import-id',
          engineComponentKey: EngineComponentKey.IMPORT_RECORDS,
          conditionalAvailabilityExpression: null,
          isActive: false,
          overrides: {
            [WORKSPACE_APPLICATION_UNIVERSAL_IDENTIFIER]: { isActive: true },
          },
        }),
      ],
      engineComponentKeys: PHI_EGRESS_ENGINE_COMPONENT_KEYS,
    });

    expect(violations.map(({ ids }) => ids)).toEqual([
      ['reactivated-import-id'],
    ]);
  });
});
