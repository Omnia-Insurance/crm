import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type SpreadsheetImportFieldType } from '@/spreadsheet-import/types/SpreadsheetImportFieldType';
import { type SpreadsheetImportFieldValidationDefinition } from '@/spreadsheet-import/types/SpreadsheetImportFieldValidationDefinition';
import { type FieldMetadataType } from 'twenty-shared/types';
import { type IconComponent } from 'twenty-ui/icon';

export type SpreadsheetImportField = {
  Icon: IconComponent | null | undefined;
  label: string;
  alternateMatches?: string[];
  key: string;
  // Field's metadata item id - same for all associated nested fields
  fieldMetadataItemId: string;
  // UI-facing additional information displayed via tooltip and ? icon
  description?: string;
  fieldValidationDefinitions?: SpreadsheetImportFieldValidationDefinition[];
  fieldType: SpreadsheetImportFieldType;
  fieldMetadataType: FieldMetadataType;
  // if true, it can be a composite sub-field or a relation connect field (or both)
  isNestedField: boolean;
  // can be true only if isNestedField is true
  isCompositeSubField?: boolean;
  // defined only if isCompositeSubField is true
  compositeSubFieldKey?: string;
  // can be true only if isNestedField is true
  isRelationConnectField?: boolean;
  // defined only if isRelationConnectField is true
  uniqueFieldMetadataItem?: FieldMetadataItem;
  // OMNIA-CUSTOM: relation update columns write targetFieldMetadataItem on the
  // related record; read-only columns only match exported headers and are
  // dropped before import.
  isRelationUpdateField?: boolean;
  targetFieldMetadataItem?: FieldMetadataItem;
  isReadOnly?: boolean;
};
