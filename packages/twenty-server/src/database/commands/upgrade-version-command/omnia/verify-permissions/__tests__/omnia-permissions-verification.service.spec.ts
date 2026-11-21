import { Test } from '@nestjs/testing';

import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import { FeatureFlagKey } from 'twenty-shared/types';

import {
  buildObjectRecordsPermissionsMock,
  MEMBER_POLICY_HOP_PREDICATE_MOCK,
  MEMBER_POLICY_RULE_MOCK,
  VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
  VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  VERIFY_PERMISSIONS_IDS,
} from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/__mocks__/verify-permissions-workspace.mock';
import { OmniaPermissionsVerificationService } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/services/omnia-permissions-verification.service';
import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';
import { isRowLevelPermissionRelationHopEnabled } from 'src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

// The hop gate patch ships in another package; the verification only needs the gate's answer
jest.mock(
  'src/engine/permissions/internal/rls/utils/is-row-level-permission-relation-hop-enabled.util',
  () => ({ isRowLevelPermissionRelationHopEnabled: jest.fn() }),
);

const toFlatEntityMaps = <
  TEntity extends { id: string; universalIdentifier: string },
>(
  entities: TEntity[],
) => ({
  byUniversalIdentifier: Object.fromEntries(
    entities.map((entity) => [entity.universalIdentifier, entity]),
  ),
  universalIdentifierById: Object.fromEntries(
    entities.map((entity) => [entity.id, entity.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {},
});

const ROLES = [
  {
    id: VERIFY_PERMISSIONS_IDS.adminRole,
    universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
    label: 'Admin',
  },
  {
    id: VERIFY_PERMISSIONS_IDS.memberRole,
    universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
    label: 'Member',
  },
];

const buildObjectPermission = (
  objectMetadataId: string,
  canReadObjectRecords: boolean,
) => ({
  id: `member-${objectMetadataId}-permission-id`,
  universalIdentifier: `member-${objectMetadataId}-permission-id`,
  roleId: VERIFY_PERMISSIONS_IDS.memberRole,
  objectMetadataId,
  canCreateObjectRecords: false,
  canReadObjectRecords,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
});

const buildCommandMenuItem = ({
  id,
  engineComponentKey,
  conditionalAvailabilityExpression = null,
  navigationTargetObjectMetadataId = null,
}: {
  id: string;
  engineComponentKey: EngineComponentKey;
  conditionalAvailabilityExpression?: string | null;
  navigationTargetObjectMetadataId?: string | null;
}) => ({
  id,
  universalIdentifier: id,
  applicationUniversalIdentifier: 'standard-application',
  isActive: true,
  overrides: null,
  engineComponentKey,
  conditionalAvailabilityExpression,
  navigationTargetObjectMetadataId,
});

const buildRolesPermissions = (
  policyObjectRecordsPermissions: Parameters<
    typeof buildObjectRecordsPermissionsMock
  >[0],
  agentProfileObjectRecordsPermissions: Parameters<
    typeof buildObjectRecordsPermissionsMock
  >[0] = { canReadAllRecords: true },
): Record<string, RoleRecordsPermissions> => ({
  [VERIFY_PERMISSIONS_IDS.memberRole]: {
    canReadAllRecords: true,
    canUpdateAllRecords: true,
    canSoftDeleteAllRecords: true,
    canDestroyAllRecords: true,
    objects: {
      [VERIFY_PERMISSIONS_IDS.policyObject]: buildObjectRecordsPermissionsMock(
        policyObjectRecordsPermissions,
      ),
      // Agents read the profiles their hop resolves through, and change none of them
      [VERIFY_PERMISSIONS_IDS.agentProfileObject]:
        buildObjectRecordsPermissionsMock(agentProfileObjectRecordsPermissions),
    },
  },
});

// Translated workspace: Member reads every policy and writes its own through the C2 hop
const buildCleanWorkspaceCache = () => ({
  flatRoleMaps: toFlatEntityMaps(ROLES),
  flatObjectPermissionMaps: toFlatEntityMaps([
    buildObjectPermission(VERIFY_PERMISSIONS_IDS.policyObject, true),
    buildObjectPermission(VERIFY_PERMISSIONS_IDS.reconciliationObject, false),
    buildObjectPermission(VERIFY_PERMISSIONS_IDS.reviewItemObject, false),
  ]),
  flatRowLevelPermissionRuleMaps: toFlatEntityMaps([
    {
      ...MEMBER_POLICY_RULE_MOCK,
      universalIdentifier: MEMBER_POLICY_RULE_MOCK.id,
    },
  ]),
  flatRowLevelPermissionPredicateMaps: toFlatEntityMaps([
    {
      ...MEMBER_POLICY_HOP_PREDICATE_MOCK,
      universalIdentifier: MEMBER_POLICY_HOP_PREDICATE_MOCK.id,
      deletedAt: null,
    },
  ]),
  flatRowLevelPermissionPredicateGroupMaps: toFlatEntityMaps([]),
  flatObjectMetadataMaps: VERIFY_PERMISSIONS_FLAT_OBJECT_METADATA_MAPS,
  flatFieldMetadataMapsOrm: VERIFY_PERMISSIONS_FLAT_FIELD_METADATA_MAPS,
  flatSearchFieldMetadataMaps: toFlatEntityMaps([]),
  flatFieldPermissionMaps: toFlatEntityMaps([]),
  flatCommandMenuItemMaps: toFlatEntityMaps([
    buildCommandMenuItem({
      id: 'export-view-id',
      engineComponentKey: EngineComponentKey.EXPORT_VIEW,
      conditionalAvailabilityExpression:
        'pageType == "INDEX_PAGE" and permissionFlags.EXPORT_CSV',
    }),
    buildCommandMenuItem({
      id: 'go-to-policies-id',
      engineComponentKey: EngineComponentKey.NAVIGATION,
      navigationTargetObjectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
    }),
  ]),
  rolesPermissions: buildRolesPermissions({ canReadAllRecords: true }),
  featureFlagsMap: {
    [FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED]: true,
  },
});

describe('OmniaPermissionsVerificationService', () => {
  let service: OmniaPermissionsVerificationService;

  const workspaceCacheService = {
    invalidateAndRecompute: jest.fn(),
    getOrRecompute: jest.fn(),
  };

  beforeEach(async () => {
    jest.mocked(isRowLevelPermissionRelationHopEnabled).mockReturnValue(true);

    const module = await Test.createTestingModule({
      providers: [
        OmniaPermissionsVerificationService,
        { provide: WorkspaceCacheService, useValue: workspaceCacheService },
      ],
    }).compile();

    service = module.get(OmniaPermissionsVerificationService);
  });

  it('should recompute every map it reads, then pass a translated workspace', async () => {
    workspaceCacheService.getOrRecompute.mockResolvedValue(
      buildCleanWorkspaceCache(),
    );

    await expect(
      service.verifyWorkspace({
        workspaceId: VERIFY_PERMISSIONS_IDS.workspace,
      }),
    ).resolves.toEqual([]);

    expect(workspaceCacheService.invalidateAndRecompute).toHaveBeenCalledWith(
      VERIFY_PERMISSIONS_IDS.workspace,
      expect.arrayContaining([
        'rolesPermissions',
        'flatRowLevelPermissionRuleMaps',
        'flatFieldMetadataMapsOrm',
        'flatSearchFieldMetadataMaps',
        'flatFieldPermissionMaps',
        'flatCommandMenuItemMaps',
        'featureFlagsMap',
      ]),
    );
  });

  it('should aggregate the violations of every check', async () => {
    const cleanWorkspaceCache = buildCleanWorkspaceCache();

    workspaceCacheService.getOrRecompute.mockResolvedValue({
      ...cleanWorkspaceCache,
      flatRoleMaps: toFlatEntityMaps([
        ...ROLES,
        {
          id: 'new-role-id',
          universalIdentifier: 'new-role-id',
          label: 'Reconciler',
        },
      ]),
      flatRowLevelPermissionPredicateMaps: toFlatEntityMaps([
        {
          ...MEMBER_POLICY_HOP_PREDICATE_MOCK,
          universalIdentifier: MEMBER_POLICY_HOP_PREDICATE_MOCK.id,
          deletedAt: null,
        },
        {
          ...MEMBER_POLICY_HOP_PREDICATE_MOCK,
          id: 'unlinked-predicate-id',
          universalIdentifier: 'unlinked-predicate-id',
          rowLevelPermissionRuleId: null,
          deletedAt: null,
        },
      ]),
      flatSearchFieldMetadataMaps: toFlatEntityMaps([
        {
          id: 'policy-number-search-field-id',
          universalIdentifier: 'policy-number-search-field-id',
          objectMetadataId: VERIFY_PERMISSIONS_IDS.policyObject,
          fieldMetadataId: 'policy-number-field-id',
        },
      ]),
      flatFieldPermissionMaps: toFlatEntityMaps([
        {
          id: 'member-policy-number-field-permission-id',
          universalIdentifier: 'member-policy-number-field-permission-id',
          roleId: VERIFY_PERMISSIONS_IDS.memberRole,
          fieldMetadataId: 'policy-number-field-id',
          canReadFieldValue: false,
        },
      ]),
      flatCommandMenuItemMaps: toFlatEntityMaps([
        buildCommandMenuItem({
          id: 'ungated-export-id',
          engineComponentKey: EngineComponentKey.EXPORT_RECORDS,
        }),
      ]),
      rolesPermissions: buildRolesPermissions(
        { canReadAllRecords: true, canUpdateAllRecords: true },
        { canReadAllRecords: true, canSoftDeleteAllRecords: true },
      ),
      featureFlagsMap: {
        ...cleanWorkspaceCache.featureFlagsMap,
        [FeatureFlagKey.IS_ACCESS_GROUPS_ENABLED]: true,
      },
    });

    const violations = await service.verifyWorkspace({
      workspaceId: VERIFY_PERMISSIONS_IDS.workspace,
    });

    expect([...new Set(violations.map(({ check }) => check))]).toEqual([
      'rule-link',
      'phi-all-records-grant',
      'policy-agent-ownership',
      'relation-hop-target-write',
      'reconciliation-lockdown',
      'phi-egress-command-gate',
      'record-access-feature-flags',
      'read-restricted-searchable-field',
    ]);
  });

  it('should only warn about an ungated layout command', async () => {
    const cleanWorkspaceCache = buildCleanWorkspaceCache();

    workspaceCacheService.getOrRecompute.mockResolvedValue({
      ...cleanWorkspaceCache,
      flatCommandMenuItemMaps: toFlatEntityMaps([
        buildCommandMenuItem({
          id: 'edit-layout-id',
          engineComponentKey: EngineComponentKey.EDIT_RECORD_PAGE_LAYOUT,
        }),
      ]),
    });

    await expect(
      service.verifyWorkspace({
        workspaceId: VERIFY_PERMISSIONS_IDS.workspace,
      }),
    ).resolves.toEqual([]);
  });
});
