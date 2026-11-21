import {
  FieldMetadataType,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import {
  type ScopedRowLevelPermissionPredicateRow,
  type TranslationFieldMetadataRow,
} from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type';
import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';

export type RelationHopConversion =
  | { status: 'unchanged' }
  | {
      status: 'converted';
      relationFieldMetadataId: string;
      fieldMetadataId: string;
      workspaceMemberFieldMetadataId: string;
    }
  | { status: 'invalid'; reason: string };

const isManyToOneRelationTo = ({
  fieldMetadata,
  targetObjectMetadataId,
}: {
  fieldMetadata: TranslationFieldMetadataRow;
  targetObjectMetadataId: string;
}) =>
  fieldMetadata.type === FieldMetadataType.RELATION &&
  fieldMetadata.relationType === RelationType.MANY_TO_ONE &&
  fieldMetadata.relationTargetObjectMetadataId === targetObjectMetadataId;

// v2.19 resolved "Me" through a linked record (policy.agent -> agentProfile.workspaceMember) in two
// stored shapes; v2.58 matches neither, so both become the relation hop of contract C2
export const convertWorkspaceMemberPredicateToRelationHop = ({
  predicate,
  fieldMetadataById,
  fieldMetadatasByObjectMetadataId,
  workspaceMemberObjectMetadataId,
  workspaceMemberIdFieldMetadataId,
}: {
  predicate: Pick<
    ScopedRowLevelPermissionPredicateRow,
    | 'fieldMetadataId'
    | 'relationFieldMetadataId'
    | 'workspaceMemberFieldMetadataId'
    | 'operand'
  >;
  fieldMetadataById: Map<string, TranslationFieldMetadataRow>;
  fieldMetadatasByObjectMetadataId: Map<string, TranslationFieldMetadataRow[]>;
  workspaceMemberObjectMetadataId: string | undefined;
  workspaceMemberIdFieldMetadataId: string | undefined;
}): RelationHopConversion => {
  if (
    !isDefined(predicate.workspaceMemberFieldMetadataId) ||
    isDefined(predicate.relationFieldMetadataId)
  ) {
    return { status: 'unchanged' };
  }

  const fieldMetadata = fieldMetadataById.get(predicate.fieldMetadataId);
  const workspaceMemberFieldMetadata = fieldMetadataById.get(
    predicate.workspaceMemberFieldMetadataId,
  );

  if (
    !isDefined(fieldMetadata) ||
    !isDefined(workspaceMemberFieldMetadata) ||
    !isDefined(workspaceMemberObjectMetadataId)
  ) {
    return {
      status: 'invalid',
      reason:
        'its field, its workspace member field or the workspaceMember object is missing',
    };
  }

  const isWorkspaceMemberFieldOnWorkspaceMember =
    workspaceMemberFieldMetadata.objectMetadataId ===
    workspaceMemberObjectMetadataId;

  const isComparedThroughLinkedRecord = isWorkspaceMemberFieldOnWorkspaceMember
    ? fieldMetadata.type === FieldMetadataType.RELATION &&
      isDefined(fieldMetadata.relationTargetObjectMetadataId) &&
      fieldMetadata.relationTargetObjectMetadataId !==
        workspaceMemberObjectMetadataId &&
      workspaceMemberFieldMetadata.name === 'id'
    : true;

  if (!isComparedThroughLinkedRecord) {
    return { status: 'unchanged' };
  }

  if (predicate.operand !== RowLevelPermissionPredicateOperand.IS) {
    return {
      status: 'invalid',
      reason: `it compares with the current workspace member through a linked record with operand ${predicate.operand}, only IS converts to a relation hop`,
    };
  }

  const linkedObjectMetadataId = isWorkspaceMemberFieldOnWorkspaceMember
    ? fieldMetadata.relationTargetObjectMetadataId
    : workspaceMemberFieldMetadata.objectMetadataId;

  if (
    !isDefined(linkedObjectMetadataId) ||
    !fieldMetadata.isActive ||
    !isManyToOneRelationTo({
      fieldMetadata,
      targetObjectMetadataId: linkedObjectMetadataId,
    })
  ) {
    return {
      status: 'invalid',
      reason: `field ${fieldMetadata.id} is not an active many-to-one relation to object ${linkedObjectMetadataId ?? 'unknown'}`,
    };
  }

  if (!isWorkspaceMemberFieldOnWorkspaceMember) {
    if (
      !isManyToOneRelationTo({
        fieldMetadata: workspaceMemberFieldMetadata,
        targetObjectMetadataId: workspaceMemberObjectMetadataId,
      }) ||
      !isDefined(workspaceMemberIdFieldMetadataId)
    ) {
      return {
        status: 'invalid',
        reason: `workspace member field ${workspaceMemberFieldMetadata.id} is not a many-to-one relation to workspaceMember, or workspaceMember has no id field`,
      };
    }

    return {
      status: 'converted',
      relationFieldMetadataId: fieldMetadata.id,
      fieldMetadataId: workspaceMemberFieldMetadata.id,
      workspaceMemberFieldMetadataId: workspaceMemberIdFieldMetadataId,
    };
  }

  const relationsToWorkspaceMember = (
    fieldMetadatasByObjectMetadataId.get(linkedObjectMetadataId) ?? []
  ).filter((linkedObjectFieldMetadata) =>
    isManyToOneRelationTo({
      fieldMetadata: linkedObjectFieldMetadata,
      targetObjectMetadataId: workspaceMemberObjectMetadataId,
    }),
  );

  // v2.19's choice: agentProfile also relates to workspaceMember through manager, so the name wins over a count
  const relationToWorkspaceMember =
    relationsToWorkspaceMember.find(({ name }) => name === 'workspaceMember') ??
    (relationsToWorkspaceMember.length === 1
      ? relationsToWorkspaceMember[0]
      : undefined);

  if (!isDefined(relationToWorkspaceMember)) {
    return {
      status: 'invalid',
      reason: `object ${linkedObjectMetadataId} has ${relationsToWorkspaceMember.length} many-to-one relations to workspaceMember (${relationsToWorkspaceMember.map(({ id }) => id).join(', ') || 'none'}) and none is named workspaceMember, so the hop target is ambiguous`,
    };
  }

  if (!relationToWorkspaceMember.isActive) {
    return {
      status: 'invalid',
      reason: `relation ${relationToWorkspaceMember.id} from object ${linkedObjectMetadataId} to workspaceMember is not active`,
    };
  }

  return {
    status: 'converted',
    relationFieldMetadataId: fieldMetadata.id,
    fieldMetadataId: relationToWorkspaceMember.id,
    workspaceMemberFieldMetadataId: workspaceMemberFieldMetadata.id,
  };
};
