import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { type FieldDiff } from '@/reconciliation/types/FieldDiff';
import { type FieldDiffOverlay } from '@/reconciliation/types/FieldDiffOverlay';
import { type FieldType } from '@/settings/data-model/types/FieldType';
import { isDefined, isNonEmptyString } from 'twenty-shared/utils';

type GetFieldDiffOverlayArgs = {
  fieldDiffs: FieldDiff[];
  fieldName: string;
  fieldType: FieldType;
};

export const getFieldDiffOverlay = ({
  fieldDiffs,
  fieldName,
  fieldType,
}: GetFieldDiffOverlayArgs): FieldDiffOverlay | undefined => {
  // Several sub-field diffs can target one composite field; the last one shows.
  const matchingFieldDiff = fieldDiffs.findLast((fieldDiff) => {
    // The server never writes INFO_ONLY diffs, so the review must not either.
    if (
      fieldDiff.action === 'INFO_ONLY' ||
      !isNonEmptyString(fieldDiff.crmField)
    ) {
      return false;
    }

    // A null proposal clears the field and stays actionable.
    if (fieldDiff.bobValue === fieldDiff.crmValue) {
      return false;
    }

    return (
      fieldDiff.crmField === fieldName ||
      (isCompositeFieldType(fieldType) &&
        fieldDiff.crmField.startsWith(`${fieldName}.`))
    );
  });

  if (!isDefined(matchingFieldDiff)) {
    return undefined;
  }

  return {
    oldValue: matchingFieldDiff.crmValue,
    newValue: matchingFieldDiff.bobValue,
    label: matchingFieldDiff.label,
    crmFieldPath: matchingFieldDiff.crmField ?? undefined,
    note: matchingFieldDiff.note ?? null,
  };
};
