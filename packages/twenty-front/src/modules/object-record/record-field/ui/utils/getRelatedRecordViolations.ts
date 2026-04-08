import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import {
  type FieldViolation,
  getRecordRequiredFieldViolations,
} from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { FieldMetadataType } from 'twenty-shared/types';
import { RelationType } from '~/generated-metadata/graphql';

export type RelatedRecordViolation = {
  relationFieldName: string;
  relationLabel: string;
  relatedObjectNameSingular: string;
  relatedRecordId: string;
  violations: FieldViolation[];
};

/**
 * Checks required field violations on all MANY_TO_ONE related records.
 *
 * Accepts accessor functions so it can be used both imperatively (store.get)
 * and inside a Jotai derived atom (jotaiGet).
 */
export const getRelatedRecordViolations = (
  record: ObjectRecord | null | undefined,
  objectMetadataItem: EnrichedObjectMetadataItem,
  getObjectMetadata: (
    nameSingular: string,
  ) => EnrichedObjectMetadataItem | null | undefined,
  getRecord: (recordId: string) => ObjectRecord | null | undefined,
): RelatedRecordViolation[] => {
  if (!record) return [];

  const results: RelatedRecordViolation[] = [];

  for (const field of objectMetadataItem.fields) {
    // Only check MANY_TO_ONE RELATION fields (not MORPH_RELATION)
    if (field.type !== FieldMetadataType.RELATION) continue;
    if (field.relation?.type !== RelationType.MANY_TO_ONE) continue;

    const targetObjectName =
      field.relation?.targetObjectMetadata?.nameSingular;
    if (!targetObjectName) continue;

    // Read FK value from the record (e.g., leadId)
    const fkName = `${field.name}Id`;
    const fkValue = record[fkName] as string | null | undefined;
    if (!fkValue) continue;

    const relatedRecord = getRecord(fkValue);
    if (!relatedRecord) continue;

    const relatedObjectMeta = getObjectMetadata(targetObjectName);
    if (!relatedObjectMeta) continue;

    const violations = getRecordRequiredFieldViolations(
      relatedRecord,
      relatedObjectMeta,
    );

    if (violations.length > 0) {
      results.push({
        relationFieldName: field.name,
        relationLabel: field.label,
        relatedObjectNameSingular: targetObjectName,
        relatedRecordId: fkValue,
        violations,
      });
    }
  }

  return results;
};
