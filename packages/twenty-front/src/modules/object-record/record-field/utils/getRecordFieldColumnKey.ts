import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { isNonEmptyString } from '@sniptt/guards';

// Sub-field columns share fieldMetadataItemId with their relation. Plain columns keep that key, not the per-view
// record field id, so cells stay mounted across view switches. Keys and ids only: mutate by recordField.id
export const getRecordFieldColumnKey = (
  recordField: Pick<RecordField, 'fieldMetadataItemId' | 'subFieldName'>,
): string =>
  isNonEmptyString(recordField.subFieldName)
    ? `${recordField.fieldMetadataItemId}.${recordField.subFieldName}`
    : recordField.fieldMetadataItemId;
