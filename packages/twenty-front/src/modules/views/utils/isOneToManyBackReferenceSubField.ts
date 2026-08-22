import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { FieldMetadataType } from 'twenty-shared/types';

// OMNIA-CUSTOM: A relation sub-field column is a ONE_TO_MANY "back-reference"
// when it points from the related object back at the view's own object
// (e.g. Product → Policies on the Policies table). Rendering it puts every
// sibling row into every cell — on a 13.9k-row policy export that was ~43M
// labels and OOM-killed the worker (2026-08-22). Such sub-fields are neither
// offered in the column picker nor sent to the export job.
export const isOneToManyBackReferenceSubField = ({
  subFieldMetadataItem,
  baseObjectNameSingular,
}: {
  subFieldMetadataItem: Pick<FieldMetadataItem, 'type' | 'relation'>;
  baseObjectNameSingular: string;
}): boolean =>
  subFieldMetadataItem.type === FieldMetadataType.RELATION &&
  subFieldMetadataItem.relation?.type === 'ONE_TO_MANY' &&
  subFieldMetadataItem.relation?.targetObjectMetadata?.nameSingular ===
    baseObjectNameSingular;
