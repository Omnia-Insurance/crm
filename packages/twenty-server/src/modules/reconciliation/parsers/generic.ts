/**
 * Config-driven parser.
 *
 * Reads FieldConfigEntry[] to determine how to map XLSX columns to canonical
 * fields, which transform to apply, and which computed fields to derive.
 * Replaces carrier-specific parsers (ambetter.ts) with one generic
 * implementation driven entirely by CarrierConfig.fieldConfig.
 */

import type { FieldConfigEntry } from 'src/modules/reconciliation/types/field-config';
import type { GenericRow } from 'src/modules/reconciliation/types/reconciliation';
import type { ParsedRow } from 'src/modules/reconciliation/parsers/xlsx';
import {
  resolveColumn,
  TRANSFORMS,
  COMPUTATIONS,
} from 'src/modules/reconciliation/parsers/transforms';

type ParseError = { row: number; error: string };

type GenericParseResult = {
  normalized: GenericRow[];
  errors: ParseError[];
};

export const parseGenericBob = (
  rows: ParsedRow[],
  fieldConfig: FieldConfigEntry[],
): GenericParseResult => {
  const columnFields = fieldConfig.filter((f) => f.columnAliases);
  const computedFields = fieldConfig.filter((f) => f.computation);

  const normalized: GenericRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNumber = i + 1;

    try {
      const row: Record<string, string | number | boolean | null> = {};

      // 1. Map columns → canonical fields, applying type transforms
      for (const field of columnFields) {
        const rawValue = resolveColumn(raw, field.columnAliases!);
        const transform = TRANSFORMS[field.dataType];

        row[field.name] = transform ? transform(rawValue) : (rawValue as string | null) ?? null;
      }

      // 2. Compute derived fields
      for (const field of computedFields) {
        const inputValues = field.inputs!.map((name) => row[name]);
        const computation = COMPUTATIONS[field.computation!];

        row[field.name] = computation ? computation(inputValues) : null;
      }

      // 3. Build display name from policy number or row number
      const policyNumber = row.carrierPolicyNumber ?? row.policyNumber;
      const policyLabel = policyNumber != null ? String(policyNumber) : 'unknown';

      const genericRow: GenericRow = {
        ...row,
        rowNumber,
        name: `${policyLabel} - row ${rowNumber}`,
        rawPayload: raw as Record<string, unknown>,
      };

      normalized.push(genericRow);
    } catch (error) {
      errors.push({
        row: rowNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { normalized, errors };
};
