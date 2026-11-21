import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isString } from '@sniptt/guards';
import { FieldMetadataType } from 'twenty-shared/types';

type RelationDiffValue = { before: unknown; after: unknown };

const toRelationFieldChangeValue = (value: unknown): unknown =>
  isString(value) ? { id: value } : value;

// Rows written before relation diffs carried { id } hold the bare foreign key,
// keyed by the relation name or by its join column
export const normalizeLegacyRelationDiffValue = ({
  fieldDiff,
  fieldMetadataItem,
}: {
  fieldDiff: RelationDiffValue;
  fieldMetadataItem: Pick<FieldMetadataItem, 'type'>;
}): RelationDiffValue => {
  if (
    fieldMetadataItem.type !== FieldMetadataType.RELATION ||
    (!isString(fieldDiff.before) && !isString(fieldDiff.after))
  ) {
    return fieldDiff;
  }

  return {
    before: toRelationFieldChangeValue(fieldDiff.before),
    after: toRelationFieldChangeValue(fieldDiff.after),
  };
};
