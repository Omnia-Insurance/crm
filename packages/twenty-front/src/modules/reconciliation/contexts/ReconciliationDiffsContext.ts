import { createContext } from 'react';

import { type FieldDiff } from '@/reconciliation/types/FieldDiff';

export type ReconciliationDiffsContextValue = {
  fieldDiffs: FieldDiff[];
  // BOB file header -> CRM field path, from the reconciliation record
  columnMapping: Record<string, { crmField: string }> | null;
};

export const ReconciliationDiffsContext =
  createContext<ReconciliationDiffsContextValue | null>(null);
