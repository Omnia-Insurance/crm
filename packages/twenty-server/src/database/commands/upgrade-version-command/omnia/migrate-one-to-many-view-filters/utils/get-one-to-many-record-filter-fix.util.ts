import { isNonEmptyString } from '@sniptt/guards';
import {
  FieldMetadataType,
  RelationType,
  ViewFilterOperand,
} from 'twenty-shared/types';
import {
  getFilterOperandsForFilterableFieldType,
  getFilterTypeFromFieldType,
  isDefined,
} from 'twenty-shared/utils';

import { type OneToManyRelationFilterLookup } from 'src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/build-one-to-many-relation-filter-lookup.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';

export type StoredRecordFilterShape = {
  fieldMetadataId: string | null;
  relationTargetFieldMetadataId: string | null;
  subFieldName: string | null;
  operand: string | null;
};

export type OneToManyRecordFilterManualFixReason =
  | 'targetFieldNotFound'
  | 'targetFieldNotTraversable'
  | 'operandNotSupported';

export type OneToManyRecordFilterFix =
  | { kind: 'setRelationTarget'; relationTargetFieldMetadataId: string }
  | { kind: 'clearSubFieldName' }
  | { kind: 'delete' }
  | { kind: 'manualFix'; reason: OneToManyRecordFilterManualFixReason };

const EMPTINESS_OPERANDS = [
  ViewFilterOperand.IS_EMPTY,
  ViewFilterOperand.IS_NOT_EMPTY,
] as const;

const RELATION_RECORD_OPERANDS = [
  ViewFilterOperand.IS,
  ViewFilterOperand.IS_NOT,
] as const;

const isOneOfOperands = (
  operand: string | null,
  operands: readonly ViewFilterOperand[],
) => operands.some((candidate) => candidate === operand);

// The server filters one hop only, and the v2.58 filter UI never traverses to a morph relation
const isTraversableTargetField = (flatFieldMetadata: FlatFieldMetadata) =>
  !isFlatFieldMetadataOfType(
    flatFieldMetadata,
    FieldMetadataType.MORPH_RELATION,
  ) &&
  !(
    isFlatFieldMetadataOfType(flatFieldMetadata, FieldMetadataType.RELATION) &&
    flatFieldMetadata.settings?.relationType === RelationType.ONE_TO_MANY
  );

export const getOneToManyRecordFilterFix = ({
  recordFilter: {
    fieldMetadataId,
    relationTargetFieldMetadataId,
    subFieldName,
    operand,
  },
  lookup,
}: {
  recordFilter: StoredRecordFilterShape;
  lookup: OneToManyRelationFilterLookup;
}): OneToManyRecordFilterFix | undefined => {
  if (
    !isNonEmptyString(fieldMetadataId) ||
    isNonEmptyString(relationTargetFieldMetadataId)
  ) {
    return undefined;
  }

  const targetObjectMetadataId =
    lookup.targetObjectMetadataIdByRelationFieldMetadataId.get(fieldMetadataId);

  if (!isDefined(targetObjectMetadataId)) {
    return undefined;
  }

  // Prod evaluated these as "has any / has no" whatever the sub-field, so the sub-field goes
  if (isOneOfOperands(operand, EMPTINESS_OPERANDS)) {
    return isDefined(subFieldName) ? { kind: 'clearSubFieldName' } : undefined;
  }

  if (!isNonEmptyString(subFieldName)) {
    return isOneOfOperands(operand, RELATION_RECORD_OPERANDS)
      ? { kind: 'delete' }
      : { kind: 'manualFix', reason: 'operandNotSupported' };
  }

  const targetFlatFieldMetadata =
    lookup.activeFlatFieldMetadataByNameByObjectMetadataId
      .get(targetObjectMetadataId)
      ?.get(subFieldName);

  if (!isDefined(targetFlatFieldMetadata)) {
    return { kind: 'manualFix', reason: 'targetFieldNotFound' };
  }

  if (!isTraversableTargetField(targetFlatFieldMetadata)) {
    return { kind: 'manualFix', reason: 'targetFieldNotTraversable' };
  }

  const targetFieldOperands = getFilterOperandsForFilterableFieldType({
    filterType: getFilterTypeFromFieldType(targetFlatFieldMetadata.type),
  });

  if (!isOneOfOperands(operand, targetFieldOperands)) {
    return { kind: 'manualFix', reason: 'operandNotSupported' };
  }

  return {
    kind: 'setRelationTarget',
    relationTargetFieldMetadataId: targetFlatFieldMetadata.id,
  };
};
