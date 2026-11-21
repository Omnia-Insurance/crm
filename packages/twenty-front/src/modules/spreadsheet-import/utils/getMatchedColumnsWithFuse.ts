import { type MatchColumnsStepProps } from '@/spreadsheet-import/steps/components/MatchColumnsStep/MatchColumnsStep';

import {
  type SpreadsheetImportField,
  type SpreadsheetImportFields,
} from '@/spreadsheet-import/types';
import { type SpreadsheetColumn } from '@/spreadsheet-import/types/SpreadsheetColumn';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { setColumn } from '@/spreadsheet-import/utils/setColumn';
import { isNonEmptyString } from '@sniptt/guards';
import Fuse from 'fuse.js';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

export const getMatchedColumnsWithFuse = ({
  columns,
  fields,
  data,
  precomputedMatches,
}: {
  columns: SpreadsheetColumns;
  fields: SpreadsheetImportFields;
  data: MatchColumnsStepProps['data'];
  // OMNIA-CUSTOM: reconciliation's saved header -> field key map
  precomputedMatches?: Record<string, string>;
}) => {
  const matchedColumns: SpreadsheetColumn[] = [];

  const fieldsToSearch = new Fuse(fields, {
    keys: [
      {
        name: 'label',
        getFn: (field) =>
          isNonEmptyArray(field.alternateMatches)
            ? [field.label, ...field.alternateMatches]
            : field.label,
      },
    ],
    includeScore: true,
    ignoreLocation: true,
    // OMNIA-CUSTOM: stricter than upstream's 0.3 so carrier headers do not
    // auto-match loosely related fields
    threshold: 0.2,
  });

  const suggestedFieldsByColumnHeader: Record<
    SpreadsheetColumn['header'],
    SpreadsheetImportField[]
  > = {};

  for (const column of columns) {
    // OMNIA-CUSTOM: a saved match wins and gets no suggestions; the dropdown
    // still lists every field
    const precomputedFieldKey = precomputedMatches?.[column.header];
    const precomputedField = isNonEmptyString(precomputedFieldKey)
      ? fields.find((field) => field.key === precomputedFieldKey)
      : undefined;

    if (isDefined(precomputedField)) {
      matchedColumns.push(setColumn(column, precomputedField, data));
      suggestedFieldsByColumnHeader[column.header] = [];
      continue;
    }

    const fieldsThatMatch = fieldsToSearch.search(column.header);

    const firstMatch = fieldsThatMatch[0] ?? null;
    const secondMatch = fieldsThatMatch[1] ?? null;

    // OMNIA-CUSTOM: long relation labels share prefixes ("Lead / Phones / …")
    // and tie, so a near-exact match wins outright; otherwise the best match
    // must lead the next one by 0.05
    const isExactMatch =
      isDefined(firstMatch?.item) &&
      isDefined(firstMatch?.score) &&
      firstMatch.score < 0.01;

    const isClearBestMatch =
      isDefined(firstMatch?.item) &&
      isDefined(firstMatch?.score) &&
      firstMatch.score < 0.3 &&
      ((isDefined(secondMatch?.score) &&
        secondMatch.score > firstMatch.score + 0.05) ||
        !isDefined(secondMatch));

    const isFirstMatchValid = isExactMatch || isClearBestMatch;

    const isFieldStillUnmatched = !matchedColumns.some(
      (matchedColumn) =>
        (matchedColumn.type === SpreadsheetColumnType.matched ||
          matchedColumn.type === SpreadsheetColumnType.matchedCheckbox ||
          matchedColumn.type === SpreadsheetColumnType.matchedSelect ||
          matchedColumn.type === SpreadsheetColumnType.matchedSelectOptions) &&
        matchedColumn?.value === firstMatch?.item?.key,
    );

    suggestedFieldsByColumnHeader[column.header] = fieldsThatMatch.map(
      (match) => match.item as SpreadsheetImportField,
    );

    if (isFirstMatchValid && isFieldStillUnmatched) {
      const newColumn = setColumn(column, firstMatch.item as any, data);

      matchedColumns.push(newColumn);
    } else {
      matchedColumns.push(column);
    }
  }

  return { matchedColumns, suggestedFieldsByColumnHeader };
};
