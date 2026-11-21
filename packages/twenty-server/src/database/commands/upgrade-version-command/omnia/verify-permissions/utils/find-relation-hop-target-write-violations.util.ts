import {
  type ObjectRecordsOperationType,
  type ObjectRecordsPermissions,
  type RowLevelPermissionPredicate,
} from 'twenty-shared/types';
import {
  canReachAllRecords,
  canReachSomeRecords,
  isDefined,
  isRowLevelRecordsPermissionsRuleGrantingOperation,
} from 'twenty-shared/utils';

import { OMNIA_PERMISSIONS_CHECK } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/omnia-permissions-check.constant';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

const HOP_TARGET_REMOVAL_OPERATION_TYPES: ObjectRecordsOperationType[] = [
  'softDelete',
  'destroy',
];

type RelationHopTarget = {
  roleId: string;
  hopTargetObjectMetadataId: string;
  memberFieldMetadataIds: Set<string>;
  predicateIds: string[];
};

// An object-level field permission covers every record; a rule's own covers only the records it matches
const isFieldEditableOnSomeRecords = ({
  objectRecordsPermissions,
  fieldMetadataId,
}: {
  objectRecordsPermissions: ObjectRecordsPermissions;
  fieldMetadataId: string;
}): boolean => {
  if (objectRecordsPermissions.uneditableFields.includes(fieldMetadataId)) {
    return false;
  }

  return (
    canReachAllRecords({
      objectRecordsPermissions,
      operationType: 'update',
    }) ||
    (objectRecordsPermissions.rowLevelRecordsPermissions ?? []).some(
      (rule) =>
        isRowLevelRecordsPermissionsRuleGrantingOperation({
          rule,
          operationType: 'update',
        }) && !rule.uneditableFields.includes(fieldMetadataId),
    )
  );
};

// Contract C2: a hop reads its target record live, so editing that record's member field
// (agentProfile.workspaceMember) or removing the record changes whose records the role's rules reach
export const findRelationHopTargetWriteViolations = ({
  predicates,
  flatFieldMetadataMaps,
  flatObjectMetadataMaps,
  rolesPermissions,
}: {
  predicates: Pick<
    RowLevelPermissionPredicate,
    'id' | 'roleId' | 'fieldMetadataId' | 'relationFieldMetadataId'
  >[];
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  rolesPermissions: Record<string, RoleRecordsPermissions>;
}): OmniaPermissionsViolation[] => {
  const relationHopTargets = new Map<string, RelationHopTarget>();

  for (const predicate of predicates) {
    if (!isDefined(predicate.relationFieldMetadataId)) {
      continue;
    }

    const hopTargetObjectMetadataId = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: predicate.relationFieldMetadataId,
      flatEntityMaps: flatFieldMetadataMaps,
    })?.relationTargetObjectMetadataId;

    if (!isDefined(hopTargetObjectMetadataId)) {
      continue;
    }

    const relationHopTargetKey = `${predicate.roleId}:${hopTargetObjectMetadataId}`;
    const relationHopTarget = relationHopTargets.get(relationHopTargetKey) ?? {
      roleId: predicate.roleId,
      hopTargetObjectMetadataId,
      memberFieldMetadataIds: new Set<string>(),
      predicateIds: [],
    };

    relationHopTarget.memberFieldMetadataIds.add(predicate.fieldMetadataId);
    relationHopTarget.predicateIds.push(predicate.id);
    relationHopTargets.set(relationHopTargetKey, relationHopTarget);
  }

  return [...relationHopTargets.values()].flatMap(
    ({
      roleId,
      hopTargetObjectMetadataId,
      memberFieldMetadataIds,
      predicateIds,
    }) => {
      const objectRecordsPermissions =
        rolesPermissions[roleId]?.objects[hopTargetObjectMetadataId];

      if (!isDefined(objectRecordsPermissions)) {
        return [];
      }

      const hopTargetName =
        findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: hopTargetObjectMetadataId,
          flatEntityMaps: flatObjectMetadataMaps,
        })?.nameSingular ?? hopTargetObjectMetadataId;

      const removalOperationTypes = HOP_TARGET_REMOVAL_OPERATION_TYPES.filter(
        (operationType) =>
          canReachSomeRecords({ objectRecordsPermissions, operationType }),
      );
      const editableMemberFieldNames = [...memberFieldMetadataIds]
        .filter((fieldMetadataId) =>
          isFieldEditableOnSomeRecords({
            objectRecordsPermissions,
            fieldMetadataId,
          }),
        )
        .map(
          (fieldMetadataId) =>
            findFlatEntityByIdInFlatEntityMaps({
              flatEntityId: fieldMetadataId,
              flatEntityMaps: flatFieldMetadataMaps,
            })?.name ?? fieldMetadataId,
        );

      const toViolation = (problem: string): OmniaPermissionsViolation => ({
        check: OMNIA_PERMISSIONS_CHECK.relationHopTargetWrite,
        message: `role ${roleId} ${problem}`,
        ids: [roleId, hopTargetObjectMetadataId, ...predicateIds],
      });

      return [
        ...(editableMemberFieldNames.length > 0
          ? [
              toViolation(
                `can edit ${editableMemberFieldNames.map((fieldName) => `${hopTargetName}.${fieldName}`).join(', ')}, which decides whose records its relation hop rules reach; make the field read-only for the role or deny it update on ${hopTargetName}`,
              ),
            ]
          : []),
        ...(removalOperationTypes.length > 0
          ? [
              toViolation(
                `can ${removalOperationTypes.join(', ')} ${hopTargetName} records, which its relation hop rules resolve through`,
              ),
            ]
          : []),
      ];
    },
  );
};
