import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getRelationConnectSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadSheetGetRelationConnectSubFieldKey';

// The import dialog prefixes connect keys the same way, so the server import job reads both alike
export const getRelationUpdateSubFieldKey = (
  fieldMetadataItem: FieldMetadataItem,
  targetFieldMetadataItem: FieldMetadataItem,
  compositeSubFieldKey?: string,
) =>
  `update:${getRelationConnectSubFieldKey(
    fieldMetadataItem,
    targetFieldMetadataItem,
    compositeSubFieldKey,
  )}`;
