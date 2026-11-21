import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type FieldDiff } from '@/reconciliation/types/FieldDiff';
import { normalizeDiffComparableValue } from '@/reconciliation/utils/normalizeDiffComparableValue';
import {
  isDefined,
  isNonEmptyString,
  isPlainObject,
} from 'twenty-shared/utils';

type GetRelationFieldNamesWithPendingDiffsArgs = {
  fieldDiffs: FieldDiff[];
  relatedRecordByRelationFieldName: ReadonlyMap<string, ObjectRecord>;
};

const getValueAtPath = (record: ObjectRecord, path: string[]): unknown =>
  path.reduce<unknown>(
    (value, pathSegment) =>
      isPlainObject(value) ? value[pathSegment] : undefined,
    record,
  );

// A related record not loaded yet is not known to differ, so it stays collapsed.
export const getRelationFieldNamesWithPendingDiffs = ({
  fieldDiffs,
  relatedRecordByRelationFieldName,
}: GetRelationFieldNamesWithPendingDiffsArgs): string[] => {
  const pendingRelationFieldNames = new Set<string>();

  for (const fieldDiff of fieldDiffs) {
    // Only diffs the review can accept on a related record (getRelationScopedFieldDiffs).
    if (
      fieldDiff.action === 'INFO_ONLY' ||
      !isNonEmptyString(fieldDiff.crmField) ||
      fieldDiff.bobValue === null ||
      fieldDiff.bobValue === fieldDiff.crmValue
    ) {
      continue;
    }

    const [relationFieldName, ...relatedFieldPath] =
      fieldDiff.crmField.split('.');

    const relatedRecord =
      relatedRecordByRelationFieldName.get(relationFieldName);

    if (relatedFieldPath.length === 0 || !isDefined(relatedRecord)) {
      continue;
    }

    const currentValue = getValueAtPath(relatedRecord, relatedFieldPath);

    if (normalizeDiffComparableValue(currentValue) !== fieldDiff.bobValue) {
      pendingRelationFieldNames.add(relationFieldName);
    }
  }

  return [...pendingRelationFieldNames];
};
