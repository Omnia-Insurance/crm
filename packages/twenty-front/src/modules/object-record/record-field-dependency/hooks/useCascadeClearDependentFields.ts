import { useCallback } from 'react';

import { type FieldDependencyGraph } from '@/object-record/record-field-dependency/types/FieldDependency';
import { getForeignKeyNameFromRelationFieldName } from '@/object-record/utils/getForeignKeyNameFromRelationFieldName';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';

export const useCascadeClearDependentFields = ({
  objectNameSingular,
  recordId,
  dependencyGraph,
}: {
  objectNameSingular: string;
  recordId: string;
  dependencyGraph: FieldDependencyGraph;
}) => {
  const { updateOneRecord } = useUpdateOneRecord();

  const clearDependentFields = useCallback(
    (parentFieldName: string) => {
      const fieldsToClear = new Set<string>();

      const queue = [parentFieldName];

      while (queue.length > 0) {
        const current = queue.shift()!;
        const dependents = dependencyGraph.dependentsByField[current];

        if (!dependents) {
          continue;
        }

        for (const dep of dependents) {
          if (!fieldsToClear.has(dep.dependentFieldName)) {
            fieldsToClear.add(dep.dependentFieldName);
            queue.push(dep.dependentFieldName);
          }
        }
      }

      if (fieldsToClear.size === 0) {
        return;
      }

      const clearInput: Record<string, null> = {};

      for (const fieldName of fieldsToClear) {
        const foreignKeyName =
          getForeignKeyNameFromRelationFieldName(fieldName);
        clearInput[foreignKeyName] = null;
      }

      updateOneRecord({
        objectNameSingular,
        idToUpdate: recordId,
        updateOneRecordInput: clearInput,
      });
    },
    [dependencyGraph, objectNameSingular, recordId, updateOneRecord],
  );

  return { clearDependentFields };
};
