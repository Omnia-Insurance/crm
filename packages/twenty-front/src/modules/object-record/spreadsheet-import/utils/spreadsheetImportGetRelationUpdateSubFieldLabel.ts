import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getRelationConnectSubFieldLabel } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationConnectSubFieldLabel';

// Same format as connect labels, so both match the export's "<Relation> / <Field>[ / <Sub-field>]" headers
export const getRelationUpdateSubFieldLabel = (
  fieldMetadataItem: FieldMetadataItem,
  targetFieldMetadataItem: FieldMetadataItem,
  compositeSubFieldLabel?: string,
) =>
  getRelationConnectSubFieldLabel(
    fieldMetadataItem,
    targetFieldMetadataItem,
    compositeSubFieldLabel,
  );
