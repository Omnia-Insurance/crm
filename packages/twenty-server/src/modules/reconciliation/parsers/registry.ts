import type { ParsedRow } from 'src/modules/reconciliation/parsers/xlsx';
import {
  parseAmbetterBob,
  type NormalizedRow,
} from 'src/modules/reconciliation/parsers/ambetter';
import { parseGenericBob } from 'src/modules/reconciliation/parsers/generic';
import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';
import type { GenericRow } from 'src/modules/reconciliation/types/reconciliation';

// ---------------------------------------------------------------------------
// Legacy parser interface (carrier-specific parsers)
// ---------------------------------------------------------------------------

type LegacyParseResult = {
  normalized: NormalizedRow[];
  errors: { row: number; error: string }[];
};

type ColumnMapping = Record<string, string[]>;

type LegacyParserFn = (rows: ParsedRow[], columnMapping: ColumnMapping) => LegacyParseResult;

const LEGACY_PARSER_REGISTRY: Record<string, LegacyParserFn> = {
  'ambetter-bob-v1': parseAmbetterBob,
};

/** @deprecated Use getGenericParser + FieldConfigEntry[] instead */
export const getParser = (parserVersion: string): LegacyParserFn => {
  const parser = LEGACY_PARSER_REGISTRY[parserVersion];

  if (!parser) {
    throw new Error(
      `Unknown parser version: "${parserVersion}". Available: ${Object.keys(LEGACY_PARSER_REGISTRY).join(', ')}`,
    );
  }

  return parser;
};

// ---------------------------------------------------------------------------
// Config-driven parser interface
// ---------------------------------------------------------------------------

type GenericParseResult = {
  normalized: GenericRow[];
  errors: { row: number; error: string }[];
};

type GenericParserFn = (rows: ParsedRow[], fieldConfig: FieldConfigEntry[]) => GenericParseResult;

export const getGenericParser = (): GenericParserFn => parseGenericBob;
