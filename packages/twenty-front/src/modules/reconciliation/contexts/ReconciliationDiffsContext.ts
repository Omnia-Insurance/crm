import { createContext } from 'react';

import type { FieldDiff } from '@/reconciliation/types/FieldDiff';

export type ReconciliationDiffsContextValue = {
  /** All enriched fieldDiffs for the current review item */
  fieldDiffs: FieldDiff[];
  /** Column mapping from reconciliation record (BOB header → CRM field path) */
  columnMapping: Record<string, { crmField: string }> | null;
};

export const ReconciliationDiffsContext =
  createContext<ReconciliationDiffsContextValue | null>(null);
