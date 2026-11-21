import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { getStandardObjectDisabledPermissionActionsByUniversalIdentifier } from 'src/database/commands/upgrade-version-command/omnia/utils/get-standard-object-disabled-permission-actions-by-universal-identifier.util';
import { LAYOUT_ENGINE_COMPONENT_KEYS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/layout-engine-component-keys.constant';
import { PHI_EGRESS_ENGINE_COMPONENT_KEYS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/phi-egress-engine-component-keys.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { findMissingReconciliationLockdownViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-missing-reconciliation-lockdown-violations.util';
import { findNavigationCommandMenuItemActivationViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-navigation-command-menu-item-activation-violations.util';
import { findPhiAllRecordsGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-phi-all-records-grant-violations.util';
import { findPolicyAgentOwnershipViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-policy-agent-ownership-violations.util';
import { findReadRestrictedSearchableFieldViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-read-restricted-searchable-field-violations.util';
import { findRecordAccessFeatureFlagViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-record-access-feature-flag-violations.util';
import { findRelationHopTargetWriteViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-relation-hop-target-write-violations.util';
import { findRowLevelPermissionRuleMatchingEveryRecordViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-matching-every-record-violations.util';
import { findRowLevelPermissionRuleWithoutGrantViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-rule-without-grant-violations.util';
import { findRowLevelPermissionTreeIntegrityViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-row-level-permission-tree-integrity-violations.util';
import { findStandardObjectPermissionLockdownViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-standard-object-permission-lockdown-violations.util';
import { findUngatedCommandMenuItemViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-ungated-command-menu-item-violations.util';
import { findUnlinkedRowLevelPermissionViolations } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/utils/find-unlinked-row-level-permission-violations.util';
import { withDerivedFieldMetadataMaps } from 'src/engine/metadata-modules/flat-entity/utils/with-derived-field-metadata-maps.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceCacheKeyName } from 'src/engine/workspace-cache/types/workspace-cache-key.type';

const VERIFIED_WORKSPACE_CACHE_KEY_NAMES: WorkspaceCacheKeyName[] = [
  'flatRoleMaps',
  'flatObjectPermissionMaps',
  'flatRowLevelPermissionRuleMaps',
  'flatRowLevelPermissionPredicateMaps',
  'flatRowLevelPermissionPredicateGroupMaps',
  'flatObjectMetadataMaps',
  'flatFieldMetadataMaps',
  'flatSearchFieldMetadataMaps',
  'flatFieldPermissionMaps',
  'flatCommandMenuItemMaps',
  'rolesPermissions',
  'featureFlagsMap',
];

// Read-only: verifies the permission state contract C1 and C2 require, and writes nothing
@Injectable()
export class OmniaPermissionsVerificationService {
  private readonly logger = new Logger(
    OmniaPermissionsVerificationService.name,
  );

  constructor(private readonly workspaceCacheService: WorkspaceCacheService) {}

  async verifyWorkspace({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<OmniaPermissionsViolation[]> {
    // Verify what the database holds, not a cache computed before the upgrade rewrote permissions
    await this.workspaceCacheService.invalidateAndRecompute(
      workspaceId,
      withDerivedFieldMetadataMaps(VERIFIED_WORKSPACE_CACHE_KEY_NAMES),
    );

    const {
      flatRoleMaps,
      flatObjectPermissionMaps,
      flatRowLevelPermissionRuleMaps,
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
      flatObjectMetadataMaps,
      flatFieldMetadataMapsOrm,
      flatSearchFieldMetadataMaps,
      flatFieldPermissionMaps,
      flatCommandMenuItemMaps,
      rolesPermissions,
      featureFlagsMap,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatRoleMaps',
      'flatObjectPermissionMaps',
      'flatRowLevelPermissionRuleMaps',
      'flatRowLevelPermissionPredicateMaps',
      'flatRowLevelPermissionPredicateGroupMaps',
      'flatObjectMetadataMaps',
      'flatFieldMetadataMapsOrm',
      'flatSearchFieldMetadataMaps',
      'flatFieldPermissionMaps',
      'flatCommandMenuItemMaps',
      'rolesPermissions',
      'featureFlagsMap',
    ]);

    const roles = Object.values(flatRoleMaps.byUniversalIdentifier).filter(
      isDefined,
    );
    const objectPermissions = Object.values(
      flatObjectPermissionMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const rules = Object.values(
      flatRowLevelPermissionRuleMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const predicates = Object.values(
      flatRowLevelPermissionPredicateMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(({ deletedAt }) => !isDefined(deletedAt));
    const allPredicateGroups = Object.values(
      flatRowLevelPermissionPredicateGroupMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const predicateGroups = allPredicateGroups.filter(
      ({ deletedAt }) => !isDefined(deletedAt),
    );
    const objectMetadatas = Object.values(
      flatObjectMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined);
    const flatCommandMenuItems = Object.values(
      flatCommandMenuItemMaps.byUniversalIdentifier,
    ).filter(isDefined);

    for (const { message } of findUngatedCommandMenuItemViolations({
      flatCommandMenuItems,
      engineComponentKeys: LAYOUT_ENGINE_COMPONENT_KEYS,
    })) {
      this.logger.warn(`Workspace ${workspaceId}: ${message}`);
    }

    return [
      ...findUnlinkedRowLevelPermissionViolations({
        predicates,
        predicateGroups,
        rules,
      }),
      ...findRowLevelPermissionRuleWithoutGrantViolations({ rules }),
      ...findRowLevelPermissionRuleMatchingEveryRecordViolations({
        rules,
        predicates,
        predicateGroups,
        flatFieldMetadataMaps: flatFieldMetadataMapsOrm,
        flatObjectMetadataMaps,
      }),
      ...findRowLevelPermissionTreeIntegrityViolations({
        predicates,
        predicateGroups: allPredicateGroups,
      }),
      ...findPhiAllRecordsGrantViolations({
        objectMetadatas,
        rules,
        rolesPermissions,
        featureFlagsMap,
      }),
      ...findPolicyAgentOwnershipViolations({
        roles,
        objectMetadatas,
        rules,
        predicates,
        predicateGroups,
        flatFieldMetadataMaps: flatFieldMetadataMapsOrm,
        flatObjectMetadataMaps,
        rolesPermissions,
        featureFlagsMap,
      }),
      ...findRelationHopTargetWriteViolations({
        predicates,
        flatFieldMetadataMaps: flatFieldMetadataMapsOrm,
        flatObjectMetadataMaps,
        rolesPermissions,
      }),
      ...findMissingReconciliationLockdownViolations({
        roles,
        objectMetadatas,
        objectPermissions,
        rolesPermissions,
      }),
      ...findUngatedCommandMenuItemViolations({
        flatCommandMenuItems,
        engineComponentKeys: PHI_EGRESS_ENGINE_COMPONENT_KEYS,
      }),
      ...findRecordAccessFeatureFlagViolations({ featureFlagsMap, predicates }),
      ...findNavigationCommandMenuItemActivationViolations({
        flatCommandMenuItems,
        flatObjectMetadataMaps,
      }),
      ...findReadRestrictedSearchableFieldViolations({
        flatSearchFieldMetadataMaps,
        flatFieldPermissionMaps,
        flatObjectMetadataMaps,
      }),
      ...findStandardObjectPermissionLockdownViolations({
        objectMetadatas,
        expectedDisabledActionsByUniversalIdentifier:
          getStandardObjectDisabledPermissionActionsByUniversalIdentifier(),
      }),
    ];
  }
}
