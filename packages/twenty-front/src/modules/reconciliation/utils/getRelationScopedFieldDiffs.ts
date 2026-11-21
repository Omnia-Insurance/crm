import { type FieldDiff } from '@/reconciliation/types/FieldDiff';
import { isNonEmptyString } from 'twenty-shared/utils';

type GetRelationScopedFieldDiffsArgs = {
  fieldDiffs: FieldDiff[];
  relationFieldName: string;
};

// Re-roots `lead.phones.primaryPhoneNumber` as `phones.primaryPhoneNumber` so
// the related record's own field list can match it.
export const getRelationScopedFieldDiffs = ({
  fieldDiffs,
  relationFieldName,
}: GetRelationScopedFieldDiffsArgs): FieldDiff[] => {
  const relationPathPrefix = `${relationFieldName}.`;

  return fieldDiffs.flatMap((fieldDiff) => {
    if (
      !isNonEmptyString(fieldDiff.crmField) ||
      !fieldDiff.crmField.startsWith(relationPathPrefix) ||
      // Related records are shared across policies: the review never clears
      // one of their fields.
      fieldDiff.bobValue === null ||
      fieldDiff.bobValue === fieldDiff.crmValue
    ) {
      return [];
    }

    return [
      {
        ...fieldDiff,
        crmField: fieldDiff.crmField.slice(relationPathPrefix.length),
      },
    ];
  });
};
