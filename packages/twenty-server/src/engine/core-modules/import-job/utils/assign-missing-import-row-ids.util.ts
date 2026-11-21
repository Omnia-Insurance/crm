import { isNonEmptyString } from '@sniptt/guards';
import { v4 } from 'uuid';

// With an id fixed at upload, a re-run of the same row updates it instead of inserting a duplicate
export const assignMissingImportRowIds = (
  rows: Record<string, unknown>[],
): Record<string, unknown>[] =>
  rows.map((row) => (isNonEmptyString(row.id) ? row : { ...row, id: v4() }));
