import { type RecordReadRestrictions } from 'src/engine/permissions/types/record-read-restrictions.type';

export const NO_RECORD_READ_RESTRICTIONS: RecordReadRestrictions = {
  unreadableObjectMetadataIds: new Set(),
  unreadableFieldMetadataIds: new Set(),
  // OMNIA-CUSTOM: no row-level rule restricts this reader
  rowLevelRestrictedObjectMetadataIds: new Set(),
};
