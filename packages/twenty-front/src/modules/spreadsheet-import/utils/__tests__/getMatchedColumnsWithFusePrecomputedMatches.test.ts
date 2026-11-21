import { type SpreadsheetImportField } from '@/spreadsheet-import/types';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { getMatchedColumnsWithFuse } from '@/spreadsheet-import/utils/getMatchedColumnsWithFuse';
import { FieldMetadataType } from 'twenty-shared/types';

const buildField = (
  overrides: Partial<SpreadsheetImportField>,
): SpreadsheetImportField => ({
  Icon: null,
  label: 'label',
  key: 'key',
  fieldMetadataItemId: 'field-metadata-item-id',
  fieldType: { type: 'input' },
  fieldMetadataType: FieldMetadataType.TEXT,
  isNestedField: false,
  ...overrides,
});

const FIELDS = [
  buildField({ label: 'Effective Date', key: 'effectiveDate' }),
  buildField({ label: 'Broker Effective Date', key: 'brokerEffectiveDate' }),
];

const COLUMNS: SpreadsheetColumns = [
  { type: SpreadsheetColumnType.empty, index: 0, header: 'Effective Date' },
];

describe('getMatchedColumnsWithFuse with precomputed matches', () => {
  it('should apply a saved match before Fuse and suggest nothing for it', () => {
    const { matchedColumns, suggestedFieldsByColumnHeader } =
      getMatchedColumnsWithFuse({
        columns: COLUMNS,
        fields: FIELDS,
        data: [],
        precomputedMatches: { 'Effective Date': 'brokerEffectiveDate' },
      });

    expect(matchedColumns[0]).toMatchObject({
      type: SpreadsheetColumnType.matched,
      value: 'brokerEffectiveDate',
    });
    expect(suggestedFieldsByColumnHeader['Effective Date']).toEqual([]);
  });

  it('should fall back to Fuse when the saved field no longer exists', () => {
    const { matchedColumns } = getMatchedColumnsWithFuse({
      columns: COLUMNS,
      fields: FIELDS,
      data: [],
      precomputedMatches: { 'Effective Date': 'deletedField' },
    });

    expect(matchedColumns[0]).toMatchObject({
      type: SpreadsheetColumnType.matched,
      value: 'effectiveDate',
    });
  });
});
