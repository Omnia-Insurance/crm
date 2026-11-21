import {
  FieldMetadataType,
  type RowLevelPermissionPredicate,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { isMorphOrRelationFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-morph-or-relation-flat-field-metadata.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

const isManyToOneRelationTo = ({
  fieldMetadata,
  targetObjectMetadataId,
}: {
  fieldMetadata: OrmFlatFieldMetadata;
  targetObjectMetadataId: string;
}): boolean =>
  fieldMetadata.type === FieldMetadataType.RELATION &&
  isMorphOrRelationFlatFieldMetadata(fieldMetadata) &&
  fieldMetadata.settings?.relationType === RelationType.MANY_TO_ONE &&
  fieldMetadata.relationTargetObjectMetadataId === targetObjectMetadataId;

// Contract C2: policy.agent -> agentProfile.workspaceMember IS workspaceMember.id. The hop target is matched by name
// because agentProfile.manager also points at workspaceMember; the member supplies the value, so the stored one is ignored
export const isPolicyAgentRelationHopPredicate = ({
  predicate,
  policyObjectMetadataId,
  flatFieldMetadataMaps,
  flatObjectMetadataMaps,
}: {
  predicate: Pick<
    RowLevelPermissionPredicate,
    | 'fieldMetadataId'
    | 'relationFieldMetadataId'
    | 'workspaceMemberFieldMetadataId'
    | 'operand'
    | 'subFieldName'
    | 'workspaceMemberSubFieldName'
  >;
  policyObjectMetadataId: string;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
}): boolean => {
  if (
    predicate.operand !== RowLevelPermissionPredicateOperand.IS ||
    isDefined(predicate.subFieldName) ||
    isDefined(predicate.workspaceMemberSubFieldName) ||
    !isDefined(predicate.relationFieldMetadataId) ||
    !isDefined(predicate.workspaceMemberFieldMetadataId)
  ) {
    return false;
  }

  const findFieldMetadata = (fieldMetadataId: string) =>
    findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: fieldMetadataId,
      flatEntityMaps: flatFieldMetadataMaps,
    });
  const findObjectMetadata = (objectMetadataId: string | null) =>
    isDefined(objectMetadataId)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: objectMetadataId,
          flatEntityMaps: flatObjectMetadataMaps,
        })
      : undefined;

  const agentFieldMetadata = findFieldMetadata(
    predicate.relationFieldMetadataId,
  );
  const agentProfileObjectMetadata = findObjectMetadata(
    agentFieldMetadata?.relationTargetObjectMetadataId ?? null,
  );
  const workspaceMemberFieldMetadata = findFieldMetadata(
    predicate.workspaceMemberFieldMetadataId,
  );
  const workspaceMemberObjectMetadata = findObjectMetadata(
    workspaceMemberFieldMetadata?.objectMetadataId ?? null,
  );

  if (
    !isDefined(agentFieldMetadata) ||
    !isDefined(agentProfileObjectMetadata) ||
    !isDefined(workspaceMemberFieldMetadata) ||
    !isDefined(workspaceMemberObjectMetadata) ||
    agentFieldMetadata.objectMetadataId !== policyObjectMetadataId ||
    agentFieldMetadata.name !== 'agent' ||
    agentProfileObjectMetadata.nameSingular !== 'agentProfile' ||
    !isManyToOneRelationTo({
      fieldMetadata: agentFieldMetadata,
      targetObjectMetadataId: agentProfileObjectMetadata.id,
    }) ||
    workspaceMemberObjectMetadata.nameSingular !== 'workspaceMember' ||
    workspaceMemberFieldMetadata.name !== 'id'
  ) {
    return false;
  }

  const hopTargetFieldMetadata = findFieldMetadata(predicate.fieldMetadataId);

  return (
    isDefined(hopTargetFieldMetadata) &&
    hopTargetFieldMetadata.objectMetadataId === agentProfileObjectMetadata.id &&
    hopTargetFieldMetadata.name === 'workspaceMember' &&
    isManyToOneRelationTo({
      fieldMetadata: hopTargetFieldMetadata,
      targetObjectMetadataId: workspaceMemberObjectMetadata.id,
    })
  );
};
