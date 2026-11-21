export type RecordReadRestrictions = {
  unreadableObjectMetadataIds: ReadonlySet<string>;
  unreadableFieldMetadataIds: ReadonlySet<string>;
  // OMNIA-CUSTOM: objects the reader reaches only through row-level rules
  rowLevelRestrictedObjectMetadataIds?: ReadonlySet<string>;
};
