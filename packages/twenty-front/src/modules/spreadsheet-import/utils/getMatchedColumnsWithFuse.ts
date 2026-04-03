import { type MatchColumnsStepProps } from '@/spreadsheet-import/steps/components/MatchColumnsStep/MatchColumnsStep';

import {
  type SpreadsheetImportField,
  type SpreadsheetImportFields,
} from '@/spreadsheet-import/types';
import { type SpreadsheetColumn } from '@/spreadsheet-import/types/SpreadsheetColumn';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { setColumn } from '@/spreadsheet-import/utils/setColumn';
import Fuse from 'fuse.js';
import { isDefined } from 'twenty-shared/utils';

export const getMatchedColumnsWithFuse = ({
  columns,
  fields,
  data,
}: {
  columns: SpreadsheetColumns;
  fields: SpreadsheetImportFields;
  data: MatchColumnsStepProps['data'];
}) => {
  const matchedColumns: SpreadsheetColumn[] = [];

  const fieldsToSearch = new Fuse(fields, {
    keys: ['label'],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.3,
  });

  const suggestedFieldsByColumnHeader: Record<
    SpreadsheetColumn['header'],
    SpreadsheetImportField[]
  > = {};

  for (const column of columns) {
    const fieldsThatMatch = fieldsToSearch.search(column.header);

    const firstMatch = fieldsThatMatch[0] ?? null;
    const secondMatch = fieldsThatMatch[1] ?? null;

    // OMNIA-CUSTOM: Accept exact matches (score ≈ 0) even if a second match
    // has a similar score. The original logic rejected matches when two fields
    // scored identically, which happened with long relation sub-field labels
    // that share prefixes (e.g., "Lead / Phones / Primary Phone Number" vs
    // "Lead / Phones / Primary Phone Country Code"). Now we accept a match if
    // it's a near-perfect score (< 0.01) OR if it's clearly better than the
    // second match.
    const isExactMatch =
      isDefined(firstMatch?.item) &&
      isDefined(firstMatch?.score) &&
      firstMatch.score < 0.01;

    const isClearBestMatch =
      isDefined(firstMatch?.item) &&
      isDefined(firstMatch?.score) &&
      firstMatch.score < 0.4 &&
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
