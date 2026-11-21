import { isNonEmptyString } from '@sniptt/guards';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { getRecordExportLabel } from 'src/engine/core-modules/record-export/utils/get-record-export-label.util';

const ONE_TO_MANY_ITEM_SEPARATOR = ' | ';
const FAMILY_MEMBER_PART_SEPARATOR = ' • ';

const formatMemberType = (memberType: unknown): string =>
  isNonEmptyString(memberType)
    ? memberType.charAt(0).toUpperCase() + memberType.slice(1).toLowerCase()
    : '';

const formatShortDate = (value: unknown): string => {
  const date =
    value instanceof Date
      ? value
      : isNonEmptyString(value)
        ? new Date(value)
        : undefined;

  if (!isDefined(date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = String(date.getUTCFullYear()).slice(-2);

  return `${month}/${day}/${year}`;
};

// Children with a member type or birth date export as "Name • Type • MM/DD/YY"
export const formatOneToManyItem = ({
  item,
  labelFieldName,
}: {
  item: Record<string, unknown>;
  labelFieldName?: string;
}): string => {
  const label = isDefined(labelFieldName)
    ? getRecordExportLabel(item[labelFieldName])
    : '';
  const displayedLabel = isValidUuid(label) ? '' : label;

  if (!('memberType' in item) && !('dateOfBirth' in item)) {
    return displayedLabel;
  }

  return [
    displayedLabel,
    formatMemberType(item.memberType),
    formatShortDate(item.dateOfBirth),
  ]
    .filter(isNonEmptyString)
    .join(FAMILY_MEMBER_PART_SEPARATOR);
};

// Empty labels still count as shown, so "+N more" counts only the children left out
export const formatOneToManyList = (
  labels: string[],
  total: number | undefined,
): string => {
  const shownLabels = labels.filter(isNonEmptyString);
  const hiddenCount = (total ?? shownLabels.length) - labels.length;

  return (
    hiddenCount > 0 ? [...shownLabels, `+${hiddenCount} more`] : shownLabels
  ).join(ONE_TO_MANY_ITEM_SEPARATOR);
};
