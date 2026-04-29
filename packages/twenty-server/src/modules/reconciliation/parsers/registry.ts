import type { ParsedRow } from 'src/modules/reconciliation/parsers/xlsx';
import { parseGenericBob } from 'src/modules/reconciliation/parsers/generic';
import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';
import type { GenericRow } from 'src/modules/reconciliation/types/reconciliation';

// ---------------------------------------------------------------------------
// Config-driven parser interface
// ---------------------------------------------------------------------------

type GenericParseResult = {
  normalized: GenericRow[];
  errors: { row: number; error: string }[];
};

type GenericParserFn = (
  rows: ParsedRow[],
  fieldConfig: FieldConfigEntry[],
) => GenericParseResult;

export const getGenericParser = (): GenericParserFn => parseGenericBob;
