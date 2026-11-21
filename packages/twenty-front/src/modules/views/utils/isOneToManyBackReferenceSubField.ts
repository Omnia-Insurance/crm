import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isRelationFieldOfType } from '@/object-metadata/utils/isRelationFieldOfType';
import { RelationType } from '~/generated-metadata/graphql';

// A ONE_TO_MANY sub-field pointing back at the view's own object (Product → Policies on Policies) lists every sibling
// row in every cell: on a 13.9k-row export that OOM-killed the worker (2026-08-22). Never offered nor exported
export const isOneToManyBackReferenceSubField = ({
  subFieldMetadataItem,
  baseObjectNameSingular,
}: {
  subFieldMetadataItem: Pick<FieldMetadataItem, 'type' | 'relation'>;
  baseObjectNameSingular: string;
}): boolean =>
  isRelationFieldOfType(subFieldMetadataItem, RelationType.ONE_TO_MANY) &&
  subFieldMetadataItem.relation.targetObjectMetadata.nameSingular ===
    baseObjectNameSingular;
