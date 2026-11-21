import { type ReactNode, useContext, useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

import {
  ReconciliationDiffsContext,
  type ReconciliationDiffsContextValue,
} from '@/reconciliation/contexts/ReconciliationDiffsContext';
import { getRelationScopedFieldDiffs } from '@/reconciliation/utils/getRelationScopedFieldDiffs';

type ReconciliationRelationDiffsScopeProps = {
  relationFieldName: string;
  children: ReactNode;
};

export const ReconciliationRelationDiffsScope = ({
  relationFieldName,
  children,
}: ReconciliationRelationDiffsScopeProps) => {
  const reconciliationDiffs = useContext(ReconciliationDiffsContext);

  const relationReconciliationDiffs =
    useMemo<ReconciliationDiffsContextValue | null>(
      () =>
        isDefined(reconciliationDiffs)
          ? {
              fieldDiffs: getRelationScopedFieldDiffs({
                fieldDiffs: reconciliationDiffs.fieldDiffs,
                relationFieldName,
              }),
              // Only the diffs are re-rooted; mapped CRM paths stay absolute.
              columnMapping: reconciliationDiffs.columnMapping,
            }
          : null,
      [reconciliationDiffs, relationFieldName],
    );

  if (!isDefined(relationReconciliationDiffs)) {
    return <>{children}</>;
  }

  return (
    <ReconciliationDiffsContext.Provider value={relationReconciliationDiffs}>
      {children}
    </ReconciliationDiffsContext.Provider>
  );
};
