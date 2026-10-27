import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isDefined } from 'twenty-shared/utils';

const SERVER_MANAGED_FIELDS = new Set([
  '__typename',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdBy',
  'updatedBy',
  'position',
]);

// Relation objects (non-null objects carrying `id` and `__typename`) are
// skipped; their FK (e.g. carrierId) is already a separate key on the record.
const isRelationObject = (value: unknown) =>
  isDefined(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  'id' in value &&
  '__typename' in value;

export const buildDraftRecordInput = (
  record: ObjectRecord,
  extraRecordInput: Partial<ObjectRecord> = {},
): Record<string, unknown> => {
  const recordInput: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (SERVER_MANAGED_FIELDS.has(key) || isRelationObject(value)) continue;

    recordInput[key] = value;
  }

  return { ...recordInput, ...extraRecordInput };
};
