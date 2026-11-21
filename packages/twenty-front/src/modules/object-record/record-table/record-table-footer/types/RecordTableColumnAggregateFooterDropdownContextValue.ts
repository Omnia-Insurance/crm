import { type FieldMetadataType } from '~/generated-metadata/graphql';
export type RecordTableColumnAggregateFooterDropdownContextValue = {
  dropdownId: string;
  fieldMetadataId: string;
  fieldMetadataType?: FieldMetadataType;
  // OMNIA-CUSTOM: a relation sub-field column shares fieldMetadataId with its relation; the view field id does not
  viewFieldId: string;
};
