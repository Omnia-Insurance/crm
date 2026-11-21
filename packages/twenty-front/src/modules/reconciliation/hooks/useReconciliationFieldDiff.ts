import { useContext, useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { ReconciliationDiffsContext } from '@/reconciliation/contexts/ReconciliationDiffsContext';
import { type FieldDiffOverlay } from '@/reconciliation/types/FieldDiffOverlay';
import { getFieldDiffOverlay } from '@/reconciliation/utils/getFieldDiffOverlay';

// Runs in every inline cell of the app: context reads only, no store subscriptions.
export const useReconciliationFieldDiff = (): FieldDiffOverlay | undefined => {
  const reconciliationDiffs = useContext(ReconciliationDiffsContext);
  const { fieldDefinition, isForbidden } = useContext(FieldContext);

  const fieldName = fieldDefinition?.metadata?.fieldName;
  const fieldType = fieldDefinition?.type;

  return useMemo(() => {
    // A field the reader cannot see must not leak its CRM value through a diff.
    if (
      !isDefined(reconciliationDiffs) ||
      !isDefined(fieldName) ||
      !isDefined(fieldType) ||
      isForbidden === true
    ) {
      return undefined;
    }

    return getFieldDiffOverlay({
      fieldDiffs: reconciliationDiffs.fieldDiffs,
      fieldName,
      fieldType,
    });
  }, [reconciliationDiffs, fieldName, fieldType, isForbidden]);
};
